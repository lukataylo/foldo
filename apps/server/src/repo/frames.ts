import type {
  Frame,
  FrameContent,
  FrameKind,
  MarkdownFrameContent,
} from '@foldo/protocol';
import { query, queryOne, exec, type SqlRunner } from '../db.ts';
import { nowIso } from '../util.ts';

interface FrameRow {
  id: string;
  board_id: string;
  kind: FrameKind;
  branch_id: string;
  commit_sha: string;
  commit_message: string;
  age: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  // JSONB column — pg returns it already parsed. May be null if the row
  // was migrated from an empty string; rowToFrame falls back to a stub.
  content_json: FrameContent | null;
  parent_frame_id: string | null;
  generated_by_dispatch_id: string | null;
  captured_from_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToFrame(r: FrameRow): Frame {
  return {
    id: r.id,
    boardId: r.board_id,
    kind: r.kind,
    branchId: r.branch_id,
    commitSha: r.commit_sha,
    commitMessage: r.commit_message,
    age: r.age,
    position: { x: Number(r.position_x), y: Number(r.position_y) },
    size: { width: Number(r.width), height: Number(r.height) },
    content: r.content_json ?? ({
      kind: 'markdown',
      docPath: '',
      title: '',
    } as FrameContent),
    parentFrameId: r.parent_frame_id ?? undefined,
    generatedByDispatchId: r.generated_by_dispatch_id ?? undefined,
    capturedFromUrl: r.captured_from_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listFramesForBoard(boardId: string): Promise<Frame[]> {
  const rows = await query<FrameRow>(
    `SELECT * FROM frames WHERE board_id = $1 ORDER BY created_at`,
    [boardId],
  );
  return overlayMarkdownBodies(rows.map(rowToFrame));
}

const FRAMES_PAGE_DEFAULT = 100;
const FRAMES_PAGE_MAX = 500;

/**
 * Keyset-paginated frames list. Cursor is the (created_at, id) tuple of the
 * last row in the previous page, base64-encoded. Keyset beats OFFSET on big
 * boards because the index on (board_id, created_at) gives us O(log n)
 * page-start lookup instead of O(n*offset) scans.
 */
export interface FramePage {
  items: Frame[];
  hasMore: boolean;
  cursor?: string;
}

export async function listFramesForBoardPage(
  boardId: string,
  opts: { limit?: number; cursor?: string },
): Promise<FramePage> {
  const limit = Math.min(
    Math.max(opts.limit ?? FRAMES_PAGE_DEFAULT, 1),
    FRAMES_PAGE_MAX,
  );
  // Decode cursor → (created_at, id). Anything malformed falls back to "no
  // cursor" rather than throwing — pagination is resumable from the start.
  let cursorTs: string | null = null;
  let cursorId: string | null = null;
  if (opts.cursor) {
    try {
      const raw = Buffer.from(opts.cursor, 'base64url').toString('utf8');
      const split = raw.indexOf('|');
      if (split > 0) {
        cursorTs = raw.slice(0, split);
        cursorId = raw.slice(split + 1);
      }
    } catch {
      /* ignore */
    }
  }

  // Fetch limit+1 so we can tell whether there's a next page without a
  // second COUNT query.
  const rows =
    cursorTs && cursorId
      ? await query<FrameRow>(
          `SELECT * FROM frames
            WHERE board_id = $1
              AND (created_at, id) > ($2::timestamptz, $3)
            ORDER BY created_at, id
            LIMIT $4`,
          [boardId, cursorTs, cursorId, limit + 1],
        )
      : await query<FrameRow>(
          `SELECT * FROM frames
            WHERE board_id = $1
            ORDER BY created_at, id
            LIMIT $2`,
          [boardId, limit + 1],
        );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items = await overlayMarkdownBodies(page.map(rowToFrame));
  let nextCursor: string | undefined;
  if (hasMore) {
    const last = page[page.length - 1];
    if (last) {
      nextCursor = Buffer.from(
        `${last.created_at}|${last.id}`,
        'utf8',
      ).toString('base64url');
    }
  }
  return { items, hasMore, cursor: nextCursor };
}

export async function getFrameById(
  id: string,
  runner?: SqlRunner,
): Promise<Frame | null> {
  const r = await queryOne<FrameRow>(
    `SELECT * FROM frames WHERE id = $1`,
    [id],
    runner,
  );
  if (!r) return null;
  const [overlaid] = await overlayMarkdownBodies([rowToFrame(r)], runner);
  // overlayMarkdownBodies returns an array of the same length it received.
  return overlaid ?? null;
}

/**
 * Single source of truth for any markdown frame's body is the `sources` table
 * keyed by (repoSlug, commitSha, docPath). `frames.content.body` is treated as
 * a write-side cache only: every read overlays the canonical sources row on
 * top, so an out-of-date cache can't surface to the client.
 *
 * Without this, a saved edit landed in `sources` (mirror is transactional) but
 * the GET path could still serve a stale `content.body` if anything else wrote
 * it directly. Now `sources` always wins on read.
 *
 * Implementation: one boards lookup per distinct boardId + one sources lookup
 * per markdown frame. Cheap for typical boards (≤10 md frames); when we move
 * `content_json` to JSONB in Phase 2 we can collapse this into a single JOIN
 * on the main query.
 */
async function overlayMarkdownBodies(
  frames: Frame[],
  runner?: SqlRunner,
): Promise<Frame[]> {
  if (frames.length === 0) return frames;
  const mdIndices: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f && f.content.kind === 'markdown') mdIndices.push(i);
  }
  if (mdIndices.length === 0) return frames;

  const repoSlugByBoard = new Map<string, string | undefined>();
  const out = frames.slice();

  for (const i of mdIndices) {
    const f = out[i];
    if (!f) continue; // unreachable, but `noUncheckedIndexedAccess` widens it.
    const md = f.content as MarkdownFrameContent;
    if (!md.docPath) continue;

    let repoSlug = repoSlugByBoard.get(f.boardId);
    if (repoSlug === undefined) {
      const board = await queryOne<{ repo_slug: string }>(
        `SELECT repo_slug FROM boards WHERE id = $1`,
        [f.boardId],
        runner,
      );
      repoSlug = board?.repo_slug;
      repoSlugByBoard.set(f.boardId, repoSlug);
    }
    if (!repoSlug) continue;

    const src = await queryOne<{ body: string }>(
      `SELECT body FROM sources
        WHERE repo_slug = $1 AND commit_sha = $2 AND path = $3`,
      [repoSlug, f.commitSha, md.docPath],
      runner,
    );
    if (src) {
      out[i] = { ...f, content: { ...md, body: src.body } };
    }
  }
  return out;
}

export async function insertFrame(f: Frame): Promise<Frame> {
  await exec(
    `INSERT INTO frames (id, board_id, kind, branch_id, commit_sha, commit_message, age,
       position_x, position_y, width, height, content_json, parent_frame_id,
       generated_by_dispatch_id, captured_from_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      f.id,
      f.boardId,
      f.kind,
      f.branchId,
      f.commitSha,
      f.commitMessage,
      f.age,
      f.position.x,
      f.position.y,
      f.size.width,
      f.size.height,
      JSON.stringify(f.content),
      f.parentFrameId ?? null,
      f.generatedByDispatchId ?? null,
      f.capturedFromUrl ?? null,
      f.createdAt,
      f.updatedAt,
    ],
  );
  return f;
}

export interface FrameUpdate {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  content?: FrameContent;
}

export async function updateFrame(
  id: string,
  patch: FrameUpdate,
  runner?: SqlRunner,
): Promise<Frame | null> {
  const existing = await getFrameById(id, runner);
  if (!existing) return null;
  const next: Frame = {
    ...existing,
    position: patch.position ?? existing.position,
    size: patch.size ?? existing.size,
    content: patch.content ?? existing.content,
    updatedAt: nowIso(),
  };
  await exec(
    `UPDATE frames SET
       position_x = $1,
       position_y = $2,
       width = $3,
       height = $4,
       content_json = $5,
       updated_at = $6
     WHERE id = $7`,
    [
      next.position.x,
      next.position.y,
      next.size.width,
      next.size.height,
      JSON.stringify(next.content),
      next.updatedAt,
      id,
    ],
    runner,
  );
  return next;
}

export async function moveFrame(
  id: string,
  pos: { x: number; y: number },
): Promise<Frame | null> {
  const existing = await getFrameById(id);
  if (!existing) return null;
  await exec(
    `UPDATE frames SET position_x = $1, position_y = $2, updated_at = $3 WHERE id = $4`,
    [pos.x, pos.y, nowIso(), id],
  );
  return getFrameById(id);
}

export async function deleteFrame(id: string): Promise<boolean> {
  const changes = await exec(`DELETE FROM frames WHERE id = $1`, [id]);
  return changes > 0;
}
