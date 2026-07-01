import type { FastifyInstance } from 'fastify';
import type {
  Branch,
  CreateCaptureRequest,
  CreateCaptureResponse,
  Frame,
} from '@foldo/protocol';
import type { RecipeStep } from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import { insertFrame, listFramesForBoard } from '../repo/frames.ts';
import { getBranchById, getBranchByName, upsertBranch } from '../repo/branches.ts';
import { canEditBoard } from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { isMcpConnected, sendToMcp } from '../ws/mcp.ts';
import { getStorage } from '../storage/index.ts';
import { newCommitSha, newId, nowIso } from '../util.ts';

// Board-scoped, like the tests branch (`tests-${boardId}`). A single global
// 'captures' id meant the first board to capture owned the branch row and
// every later capture on any other board attached its frames to that
// foreign branch — they never rendered, and `branch.added` never fired.
function capturesBranchId(boardId: string): string {
  return `captures-${boardId}`;
}

async function ensureCapturesBranch(boardId: string, userId: string): Promise<Branch> {
  const existing = await getBranchById(capturesBranchId(boardId));
  if (existing) return existing;
  // Legacy databases may hold the pre-scoping global row (id='captures')
  // on this board. branches has a UNIQUE (board_id, name) constraint, so
  // inserting a second name='captures' branch here would 500 every capture
  // on that board forever — reuse the legacy row instead.
  const byName = await getBranchByName(boardId, 'captures');
  if (byName) return byName;
  const now = nowIso();
  const branch: Branch = {
    id: capturesBranchId(boardId),
    boardId,
    name: 'captures',
    authoredBy: 'human',
    authorUserId: userId,
    color: '#f5b86b',
    headSha: '0000000',
    createdAt: now,
    updatedAt: now,
  };
  await upsertBranch(branch);
  hub.broadcast(boardId, { type: 'branch.added', branch });
  return branch;
}

export async function registerCaptureRoutes(app: FastifyInstance): Promise<void> {
  // Ask the board's connected agent to freeze the running app's current
  // state into a frame. This is the cloud-side producer for the
  // `freeze.request` MCP message documented in docs/MCP.md — the MCP's
  // handler captures the DOM/screenshot and replies with `freeze.captured`,
  // which inserts + broadcasts the frame. Until now only the stdio tool
  // path existed; nothing server-side ever sent freeze.request.
  app.post<{
    Params: { id: string };
    Body: {
      branchId?: string;
      commitSha?: string;
      recipe?: RecipeStep[];
      stateLabel?: string;
    };
  }>('/api/boards/:id/freeze', async (req, reply) => {
    const user = requireUser(req);
    const boardId = req.params.id;
    if (!(await canEditBoard(boardId, user.id))) {
      return reply
        .code(403)
        .send({ error: 'Not a member of this board', code: 'FORBIDDEN' });
    }
    if (!isMcpConnected(boardId)) {
      return reply.code(409).send({
        error: 'No agent connected to this board',
        code: 'MCP_OFFLINE',
      });
    }
    const branchId = (req.body?.branchId ?? '').trim();
    if (!branchId) {
      return reply
        .code(400)
        .send({ error: 'branchId required', code: 'BAD_REQUEST' });
    }
    const branch = await getBranchById(branchId);
    if (!branch || branch.boardId !== boardId) {
      return reply
        .code(404)
        .send({ error: 'Branch not found', code: 'NOT_FOUND' });
    }
    const sent = sendToMcp(boardId, {
      type: 'freeze.request',
      boardId,
      branchId,
      commitSha: (req.body?.commitSha ?? '').trim() || branch.headSha,
      recipe: req.body?.recipe,
      stateLabel: req.body?.stateLabel,
    });
    if (!sent) {
      return reply.code(409).send({
        error: 'Agent connection dropped mid-request',
        code: 'MCP_OFFLINE',
      });
    }
    // Async flow: the frame arrives later via freeze.captured → frame.added.
    return reply.code(202).send({ ok: true, requested: true });
  });

  app.post<{ Body: CreateCaptureRequest }>('/api/captures', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body;
    if (!body?.boardId || !body?.url || !body?.viewport) {
      return reply.code(400).send({ error: 'Invalid capture body', code: 'BAD_REQUEST' });
    }
    if (!(await canEditBoard(body.boardId, user.id))) {
      return reply.code(403).send({ error: 'Not a member of this board', code: 'FORBIDDEN' });
    }

    try {
      new URL(body.url);
    } catch {
      return reply
        .code(400)
        .send({ error: 'url is not a valid absolute URL', code: 'BAD_REQUEST' });
    }

    // Use the RETURNED branch's id everywhere below — on legacy databases
    // this is the pre-scoping 'captures' row, not `captures-${boardId}`.
    const capturesBranch = await ensureCapturesBranch(body.boardId, user.id);

    const existing = await listFramesForBoard(body.boardId);
    const captureSiblings = existing.filter(
      (f) => f.branchId === capturesBranch.id,
    );
    const rightmost = captureSiblings.reduce(
      (m, f) => Math.max(m, f.position.x + f.size.width),
      80,
    );
    const newX = captureSiblings.length === 0 ? 80 : rightmost + 80;
    const maxY = existing.reduce(
      (m, f) => Math.max(m, f.position.y + f.size.height),
      0,
    );
    const firstSibling = captureSiblings[0];
    const newY = firstSibling ? firstSibling.position.y : maxY + 120;

    const now = nowIso();
    // Two shapes of capture body, distinguished by whether the caller (the
    // shotter or the extension) supplied an actual PNG.
    //   - With `screenshot` → render as an image frame so the user sees a
    //     pixel-accurate freeze of the page (the shotter's path).
    //   - Without → fall back to an iframe-mounted app frame pointing at the
    //     live URL (the extension's existing path, kept for back-compat).
    const hasScreenshot = typeof body.screenshot === 'string' && body.screenshot.length > 0;
    // Screenshots go to object storage, NOT inline into content_json. An
    // inline base64 PNG bloats every board hydration, fans multi-MB
    // frame.added payloads to every socket, and sits in the WS replay ring.
    let screenshotUrl: string | null = null;
    if (hasScreenshot) {
      screenshotUrl = await storeScreenshot(body.screenshot!);
      if (!screenshotUrl) {
        return reply.code(400).send({
          error: 'screenshot is not a valid base64 PNG (max 16 MB)',
          code: 'BAD_REQUEST',
        });
      }
    }
    const frame: Frame = screenshotUrl
      ? {
          id: newId('f'),
          boardId: body.boardId,
          kind: 'image',
          branchId: capturesBranch.id,
          commitSha: newCommitSha(),
          commitMessage: `captured: ${body.title}`,
          age: 'just now',
          position: { x: newX, y: newY },
          size: { width: body.viewport.width, height: body.viewport.height },
          content: {
            kind: 'image',
            url: screenshotUrl,
            alt: body.title,
            caption: body.title,
          },
          capturedFromUrl: body.url,
          createdAt: now,
          updatedAt: now,
        }
      : {
          id: newId('f'),
          boardId: body.boardId,
          kind: 'app',
          branchId: capturesBranch.id,
          commitSha: newCommitSha(),
          commitMessage: `captured: ${body.title}`,
          age: 'just now',
          position: { x: newX, y: newY },
          size: { width: 920, height: 700 },
          content: {
            kind: 'app',
            variant: 'baseline',
            route: body.url,
            viewport: body.viewport,
            stateLabel: 'Captured',
            iframeUrl: body.url,
          },
          capturedFromUrl: body.url,
          createdAt: now,
          updatedAt: now,
        };
    await insertFrame(frame);
    hub.broadcast(frame.boardId, { type: 'frame.added', frame });
    return reply.send({ frame } satisfies CreateCaptureResponse);
  });
}

const MAX_SCREENSHOT_BYTES = 16 * 1024 * 1024;

/**
 * Persist a capture screenshot (bare base64 PNG or a `data:image/png;base64,…`
 * URL) into the `uploads/` storage namespace and return the servable URL
 * (the existing GET /api/uploads/* route handles delivery + caching).
 * Returns null when the payload isn't decodable or is out of bounds.
 */
async function storeScreenshot(raw: string): Promise<string | null> {
  const base64 = raw.startsWith('data:')
    ? (raw.split(',', 2)[1] ?? '')
    : raw;
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  if (buf.length === 0 || buf.length > MAX_SCREENSHOT_BYTES) return null;
  const key = `uploads/${newId('cap')}.png`;
  await getStorage().put(key, buf, 'image/png');
  return `/api/uploads/${encodeURIComponent(key.slice('uploads/'.length))}`;
}
