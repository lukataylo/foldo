import type { FastifyInstance } from 'fastify';
import type {
  CreateDispatchRequest,
  ListDispatchesResponse,
} from '@foldo/protocol';
import { requireUser } from '../auth.ts';
import {
  getDispatchById,
  insertDispatch,
  listDispatchesForBoard,
} from '../repo/dispatches.ts';
import { canEditBoard, isMember } from '../repo/members.ts';
import { hub } from '../ws/hub.ts';
import { simulateDispatch } from '../sim/dispatch.ts';
import { isMcpConnected, routeDispatchToMcp } from '../ws/mcp.ts';
import { runDispatchWithRetry } from '../jobs/dispatchJob.ts';
import { newId } from '../util.ts';

export async function registerDispatchRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateDispatchRequest }>('/api/dispatches', async (req, reply) => {
    const user = requireUser(req);
    const body = req.body;
    if (
      !body?.boardId ||
      !body?.frameId ||
      !body?.branchId ||
      !body?.baseCommitSha ||
      !body?.intent
    ) {
      return reply.code(400).send({ error: 'Invalid dispatch body', code: 'BAD_REQUEST' });
    }
    if (!(await canEditBoard(body.boardId, user.id))) {
      return reply.code(403).send({ error: 'Not a member of this board', code: 'FORBIDDEN' });
    }

    const dispatch = await insertDispatch({
      id: newId('d'),
      boardId: body.boardId,
      frameId: body.frameId,
      branchId: body.branchId,
      initiatorUserId: user.id,
      target: body.target ?? {},
      baseCommitSha: body.baseCommitSha,
      intent: body.intent,
    });

    hub.broadcast(dispatch.boardId, { type: 'dispatch.created', dispatch });

    // Fire the dispatch executor under the retry/DLQ harness. The runner
    // returns a promise so retries are observable; on final failure
    // `runDispatchWithRetry` flips the dispatch row to `error` with a
    // message and broadcasts a `dispatch.status`. We still don't await it —
    // the HTTP response goes out immediately — but a thrown executor no
    // longer silently strands the row.
    if (isMcpConnected(dispatch.boardId)) {
      void runDispatchWithRetry(dispatch, async (d) => {
        // routeDispatchToMcp returns false if the MCP socket vanished
        // between isMcpConnected() and the actual send — that's the kind
        // of transient blip we want to retry.
        const sent = routeDispatchToMcp(d);
        if (!sent) {
          throw new Error('MCP socket unavailable when routing dispatch');
        }
      });
    } else {
      void runDispatchWithRetry(dispatch, (d) => simulateDispatch(d));
    }

    return reply.send(dispatch);
  });

  app.get<{ Params: { id: string } }>('/api/dispatches/:id', async (req, reply) => {
    const me = requireUser(req);
    const d = await getDispatchById(req.params.id);
    if (!d) return reply.code(404).send({ error: 'Dispatch not found', code: 'NOT_FOUND' });
    if (!(await isMember(d.boardId, me.id))) {
      return reply.code(404).send({ error: 'Dispatch not found', code: 'NOT_FOUND' });
    }
    return reply.send(d);
  });

  app.get<{ Params: { id: string } }>('/api/boards/:id/dispatches', async (req, reply) => {
    const me = requireUser(req);
    if (!(await isMember(req.params.id, me.id))) {
      return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
    }
    return reply.send({
      dispatches: await listDispatchesForBoard(req.params.id),
    } satisfies ListDispatchesResponse);
  });

  app.get<{ Querystring: { boardId?: string } }>(
    '/api/dispatches',
    async (req, reply) => {
      const me = requireUser(req);
      const boardId = req.query?.boardId;
      if (!boardId) {
        return reply.code(400).send({
          error: 'boardId query param required',
          code: 'BAD_REQUEST',
        });
      }
      if (!(await isMember(boardId, me.id))) {
        return reply.code(404).send({ error: 'Board not found', code: 'NOT_FOUND' });
      }
      return reply.send({
        dispatches: await listDispatchesForBoard(boardId),
      } satisfies ListDispatchesResponse);
    },
  );
}
