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
import { hub } from '../ws/hub.ts';
import { simulateDispatch } from '../sim/dispatch.ts';
import { isMcpConnected, routeDispatchToMcp } from '../ws/mcp.ts';
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

    const dispatch = insertDispatch({
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

    // Route to MCP if connected, otherwise simulate in-process.
    if (isMcpConnected(dispatch.boardId)) {
      routeDispatchToMcp(dispatch);
    } else {
      // Fire-and-forget — don't await; the request returns immediately.
      void simulateDispatch(dispatch);
    }

    return reply.send(dispatch);
  });

  app.get<{ Params: { id: string } }>('/api/dispatches/:id', async (req, reply) => {
    const d = getDispatchById(req.params.id);
    if (!d) return reply.code(404).send({ error: 'Dispatch not found', code: 'NOT_FOUND' });
    return reply.send(d);
  });

  app.get<{ Params: { id: string } }>('/api/boards/:id/dispatches', async (req, reply) => {
    return reply.send({
      dispatches: listDispatchesForBoard(req.params.id),
    } satisfies ListDispatchesResponse);
  });

  // Convenience alias used by the web client: GET /api/dispatches?boardId=…
  app.get<{ Querystring: { boardId?: string } }>(
    '/api/dispatches',
    async (req, reply) => {
      const boardId = req.query?.boardId;
      if (!boardId) {
        return reply.code(400).send({
          error: 'boardId query param required',
          code: 'BAD_REQUEST',
        });
      }
      return reply.send({
        dispatches: listDispatchesForBoard(boardId),
      } satisfies ListDispatchesResponse);
    },
  );
}
