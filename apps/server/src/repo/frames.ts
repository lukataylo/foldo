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
 * A+ W1 perf rewrite — batched lookups. The previous version issued one
 * `SELECT repo_slug` per distinct board AND one `SELECT body FROM sources`
 * per markdown frame. On a typical 30-frame board with 10 markdown frames
 * that was 11 round-trips just to overlay bodies. We now do:
 *   Step 1: one `SELECT id, repo_slug FROM boards WHERE id = ANY($1)` → Map
 *   Step 2: one `SELECT … FROM sources WHERE (repo_slug,commit_sha,path) IN (…)`
 *           → Map keyed by the triple
 *   Step 3: zip the markdown frames with the maps
 * Net query count: 2 (was N+1 for boards + N for sources). Round-trip latency
 * on the snapshot path drops from ~11 × RTT to 2 × RTT.
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

  // ---- Step 1: distinct boardIds → repo_slug, single query.
  const boardIds = new Set<string>();
  for (const i of mdIndices) {
    const f = frames[i];
    if (f) boardIds.add(f.boardId);
  }
  const boardRows = await query<{ id: string; repo_slug: string }>(
    `SELECT id, repo_slug FROM boards WHERE id = ANY($1)`,
    [Array.from(boardIds)],
    runner,
  );
  const repoSlugByBoard = new Map<string, string>();
  for (const r of boardRows) repoSlugByBoard.set(r.id, r.repo_slug);

  // ---- Step 2: distinct (repo_slug, commit_sha, doc_path) tuples,
  // single query using row-tuple IN-list. We build a parameter list of the
  // form ($1,$2,$3),($4,$5,$6),… and pass the flattened values.
  type Triple = [string, string, string];
  const tripleKey = (r: string, c: string, p: string) => `${r}${c}${p}`;
  const triples = new Map<string, Triple>();
  for (const i of mdIndices) {
    const f = frames[i];
    if (!f) continue;
    const md = f.content as MarkdownFrameContent;
    if (!md.docPath) continue;
    const repoSlug = repoSlugByBoard.get(f.boardId);
    if (!repoSlug) continue;
    triples.set(tripleKey(repoSlug, f.commitSha, md.docPath), [
      repoSlug,
      f.commitSha,
      md.docPath,
    ]);
  }

  const bodyByTriple = new Map<string, string>();
  if (triples.size > 0) {
    const params: string[] = [];
    const tuples: string[] = [];
    let n = 1;
    for (const t of triples.values()) {
      tuples.push(`($${n++}, $${n++}, $${n++})`);
      params.push(t[0], t[1], t[2]);
    }
    const rows = await query<{ repo_slug: string; commit_sha: string; path: string; body: string }>(
      `SELECT repo_slug, commit_sha, path, body
         FROM sources
        WHERE (repo_slug, commit_sha, path) IN (${tuples.join(',')})`,
      params,
      runner,
    );
    for (const r of rows) {
      bodyByTriple.set(tripleKey(r.repo_slug, r.commit_sha, r.path), r.body);
    }
  }

  // ---- Step 3: zip back onto the frames array. Keep shape identical to the
  // previous implementation — leave frames untouched when no source row matches.
  const out = frames.slice();
  for (const i of mdIndices) {
    const f = out[i];
    if (!f) continue;
    const md = f.content as MarkdownFrameContent;
    if (!md.docPath) continue;
    const repoSlug = repoSlugByBoard.get(f.boardId);
    if (!repoSlug) continue;
    const body = bodyByTriple.get(tripleKey(repoSlug, f.commitSha, md.docPath));
    if (body !== undefined) {
      out[i] = { ...f, content: { ...md, body } };
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
