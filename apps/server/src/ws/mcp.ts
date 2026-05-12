import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type {
  BoardId,
  Dispatch,
  McpClientMessage,
  McpServerMessage,
} from '@foldo/protocol';
import { resolveUserFromToken } from '../auth.ts';
import { hub } from './hub.ts';
import {
  addDispatchEvent,
  completeDispatch,
  failDispatch,
  setDispatchStatus,
} from '../repo/dispatches.ts';
import { insertFrame, getFrameById, listFramesForBoard } from '../repo/frames.ts';
import { nowIso } from '../util.ts';
import type { Frame } from '@foldo/protocol';

interface McpConn {
  socket: WebSocket;
  boardId: BoardId;
  agentName: string;
}

/** boardId → live MCP connection */
const mcpByBoard: Map<BoardId, McpConn> = new Map();

export function isMcpConnected(boardId: BoardId): boolean {
  return mcpByBoard.has(boardId);
}

export function getMcpForBoard(boardId: BoardId): McpConn | undefined {
  return mcpByBoard.get(boardId);
}

/** Send a message to the MCP for a board, if connected. Returns true on send. */
export function sendToMcp(boardId: BoardId, message: McpServerMessage): boolean {
  const conn = mcpByBoard.get(boardId);
  if (!conn) return false;
  try {
    conn.socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

/** Route a dispatch to the MCP. Returns true if it was delivered. */
export function routeDispatchToMcp(dispatch: Dispatch): boolean {
  return sendToMcp(dispatch.boardId, { type: 'dispatch.execute', dispatch });
}

/**
 * MCP-built result frames carry the variant/commit/overrides but typically
 * have (0,0) position because the MCP can't know the canvas layout. Look up
 * the dispatch's parent and re-anchor the child next to the rightmost sibling
 * in the same row on the same branch. Mirrors the in-process sim logic.
 */
import { getDispatchById } from '../repo/dispatches.ts';

function repositionResultFrame(result: Frame, dispatchId: string): Frame {
  const dispatch = getDispatchById(dispatchId);
  if (!dispatch) return result;
  const parent = getFrameById(dispatch.frameId);
  if (!parent) return result;
  const siblings = listFramesForBoard(parent.boardId).filter(
    (f) =>
      Math.abs(f.position.y - parent.position.y) < 1 &&
      f.branchId === parent.branchId,
  );
  const rightmost = siblings.reduce(
    (max, f) =>
      f.position.x + f.size.width > max ? f.position.x + f.size.width : max,
    parent.position.x + parent.size.width,
  );
  const gap = 40;
  return {
    ...result,
    boardId: parent.boardId,
    branchId: parent.branchId,
    parentFrameId: parent.id,
    generatedByDispatchId: dispatchId,
    position: { x: rightmost + gap, y: parent.position.y },
    size: parent.size,
  };
}

export async function registerMcpWs(app: FastifyInstance): Promise<void> {
  app.get('/ws/mcp', { websocket: true }, (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const boardId = url.searchParams.get('boardId');
    const agentName = url.searchParams.get('agentName') ?? 'unknown-agent';

    const user = resolveUserFromToken(token);
    if (!user || !boardId) {
      try {
        socket.send(
          JSON.stringify({
            type: 'mcp.welcome',
            boardId: boardId ?? '',
            tokenAccepted: false,
          } satisfies McpServerMessage),
        );
      } catch {
        // ignore
      }
      socket.close(1008, 'unauthorized or missing boardId');
      return;
    }

    let helloReceived = false;
    let registeredBoardId: BoardId | null = null;

    socket.on('message', (raw: Buffer) => {
      let msg: McpClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as McpClientMessage;
      } catch {
        return;
      }

      if (!helloReceived) {
        if (msg.type !== 'mcp.hello') {
          socket.close(1008, 'expected mcp.hello first');
          return;
        }
        helloReceived = true;
        registeredBoardId = msg.boardId;
        mcpByBoard.set(msg.boardId, { socket, boardId: msg.boardId, agentName: msg.agentName });
        socket.send(
          JSON.stringify({
            type: 'mcp.welcome',
            boardId: msg.boardId,
            tokenAccepted: true,
          } satisfies McpServerMessage),
        );
        hub.broadcast(msg.boardId, {
          type: 'mcp.online',
          boardId: msg.boardId,
          agentName: msg.agentName,
        });
        return;
      }

      // Subsequent messages
      switch (msg.type) {
        case 'dispatch.ack': {
          const d = setDispatchStatus(msg.dispatchId, 'sending');
          if (d) {
            hub.broadcast(d.boardId, {
              type: 'dispatch.status',
              dispatchId: d.id,
              status: 'sending',
            });
          }
          break;
        }
        case 'dispatch.progress': {
          // First progress event flips us into 'running'; subsequent ones just append.
          const before = addDispatchEvent(msg.dispatchId, msg.event);
          if (!before) break;
          let d = before;
          if (d.status !== 'running' && d.status !== 'done' && d.status !== 'error') {
            const promoted = setDispatchStatus(msg.dispatchId, 'running');
            if (promoted) d = promoted;
          }
          hub.broadcast(d.boardId, {
            type: 'dispatch.status',
            dispatchId: d.id,
            status: d.status,
            event: msg.event,
          });
          break;
        }
        case 'dispatch.completed': {
          // The MCP doesn't know the parent frame's canvas position, so the
          // result frame typically lands at (0,0). Re-position it next to the
          // parent's rightmost row sibling before persisting.
          const repositioned = repositionResultFrame(msg.resultFrame, msg.dispatchId);
          insertFrame(repositioned);
          const d = completeDispatch(
            msg.dispatchId,
            repositioned.id,
            msg.newCommitSha,
            { ts: nowIso(), level: 'info', message: 'Edit applied. Pushed new commit.' },
          );
          if (d) {
            hub.broadcast(d.boardId, { type: 'frame.added', frame: repositioned });
            hub.broadcast(d.boardId, {
              type: 'dispatch.status',
              dispatchId: d.id,
              status: 'done',
            });
            hub.broadcast(d.boardId, { type: 'dispatch.done', dispatch: d });
          }
          break;
        }
        case 'dispatch.failed': {
          const d = failDispatch(msg.dispatchId, msg.message);
          if (d) {
            hub.broadcast(d.boardId, {
              type: 'dispatch.status',
              dispatchId: d.id,
              status: 'error',
              event: { ts: nowIso(), level: 'error', message: msg.message },
            });
          }
          break;
        }
        case 'freeze.captured': {
          insertFrame(msg.frame);
          hub.broadcast(msg.frame.boardId, { type: 'frame.added', frame: msg.frame });
          break;
        }
        case 'branches.snapshot': {
          // Not strictly required for demo — could upsert branches here.
          break;
        }
        case 'pong': {
          break;
        }
        default:
          break;
      }
      // Silence: setDispatchStatus is imported for future use
      void setDispatchStatus;
    });

    socket.on('close', () => {
      if (registeredBoardId) {
        const conn = mcpByBoard.get(registeredBoardId);
        if (conn && conn.socket === socket) {
          mcpByBoard.delete(registeredBoardId);
          hub.broadcast(registeredBoardId, {
            type: 'mcp.offline',
            boardId: registeredBoardId,
          });
        }
      }
    });

    socket.on('error', () => {
      // best-effort cleanup happens on close
    });
  });
}
