import type { FastifyInstance } from 'fastify';
import type {
  AppFrameContent,
  Branch,
  CreateCaptureRequest,
  CreateCaptureResponse,
  Frame,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import { insertFrame, listFramesForBoard } from '../repo/frames.ts';
import { getBranchById, upsertBranch } from '../repo/branches.ts';
import { canEditBoard } from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { newCommitSha, newId, nowIso } from '../util.ts';
import { getStorage } from '../storage/index.ts';

const CAPTURES_BRANCH_ID = 'captures';

/**
 * Extension of AppFrameContent carrying capture-specific metadata that lives
 * local to this route. We don't need a protocol bump because these fields are
 * stored in `content_json` as free extras and any reader that doesn't know
 * about them will simply ignore them.
 */
interface CaptureAppFrameContent extends AppFrameContent {
  /** Storage key of the persisted DOM snapshot (.html), if one was supplied. */
  domSnapshotKey?: string;
}

async function ensureCapturesBranch(boardId: string, userId: string): Promise<Branch> {
  const existing = await getBranchById(CAPTURES_BRANCH_ID);
  if (existing) return existing;
  const now = nowIso();
  const branch: Branch = {
    id: CAPTURES_BRANCH_ID,
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

    await ensureCapturesBranch(body.boardId, user.id);

    const existing = await listFramesForBoard(body.boardId);
    const captureSiblings = existing.filter(
      (f) => f.branchId === CAPTURES_BRANCH_ID,
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
    const newY = captureSiblings.length === 0 ? maxY + 120 : captureSiblings[0].position.y;

    // Persist the DOM snapshot to object storage when supplied. The key is
    // deterministic per frame so it can be re-requested without a DB look-up.
    // Storage already recognises .html → text/html in contentTypeForKey().
    const frameId = newId('f');
    let domSnapshotKey: string | undefined;
    if (body.domSnapshot) {
      try {
        const snapshotBuf = Buffer.from(body.domSnapshot, 'utf-8');
        const key = `captures/${frameId}/dom-snapshot.html`;
        await getStorage().put(key, snapshotBuf, 'text/html');
        domSnapshotKey = key;
      } catch (err) {
        // Storage failures must not block the capture — log and continue.
        req.log.warn({ err }, '[captures] failed to persist DOM snapshot');
      }
    }

    const content: CaptureAppFrameContent = {
      kind: 'app',
      variant: 'baseline',
      route: body.url,
      viewport: body.viewport,
      stateLabel: 'Captured',
      iframeUrl: body.url,
      ...(domSnapshotKey ? { domSnapshotKey } : {}),
    };

    const now = nowIso();
    const frame: Frame = {
      id: frameId,
      boardId: body.boardId,
      kind: 'app',
      branchId: CAPTURES_BRANCH_ID,
      commitSha: newCommitSha(),
      commitMessage: `captured: ${body.title}`,
      age: 'just now',
      position: { x: newX, y: newY },
      size: { width: 920, height: 700 },
      content,
      capturedFromUrl: body.url,
      createdAt: now,
      updatedAt: now,
    };
    await insertFrame(frame);
    hub.broadcast(frame.boardId, { type: 'frame.added', frame });
    return reply.send({ frame } satisfies CreateCaptureResponse);
  });
}
