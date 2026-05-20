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
import { newId } from '../util.ts';

export async function registerDispatchRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: CreateDispatchRequest }>('/api/dispatches', {
    // AI dispatches hit the model + the simulator and are the most expensive
    // write path. Per-user/per-token cap below the global default.
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
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

    if (isMcpConnected(dispatch.boardId)) {
      routeDispatchToMcp(dispatch);
    } else {
      void simulateDispatch(dispatch);
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
