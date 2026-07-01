import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type {
  BoardId,
  Dispatch,
  Frame,
  McpClientMessage,
  McpServerMessage,
} from '@foldo/protocol';
import { resolveUserFromToken } from '../auth.ts';
import { getBoardById } from '../repo/boards.ts';
import { canEditBoard } from '../repo/members.ts';
import { jobLogger } from '../log.ts';
import { hub } from './hub.ts';
import { startHeartbeat } from './browser.ts';
import {
  addDispatchEvent,
  completeDispatch,
  failDispatch,
  getDispatchById,
  setDispatchStatus,
} from '../repo/dispatches.ts';
import { insertFrame, getFrameById, listFramesForBoard } from '../repo/frames.ts';
import { nowIso } from '../util.ts';

interface McpConn {
  socket: WebSocket;
  boardId: BoardId;
  agentName: string;
}

const mcpByBoard: Map<BoardId, McpConn> = new Map();

const mcpLog = jobLogger('ws-mcp');

export function isMcpConnected(boardId: BoardId): boolean {
  return mcpByBoard.has(boardId);
}

export function getMcpForBoard(boardId: BoardId): McpConn | undefined {
  return mcpByBoard.get(boardId);
}

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

export function routeDispatchToMcp(dispatch: Dispatch): boolean {
  return sendToMcp(dispatch.boardId, { type: 'dispatch.execute', dispatch });
}

async function repositionResultFrame(
  result: Frame,
  dispatchId: string,
): Promise<Frame> {
  const dispatch = await getDispatchById(dispatchId);
  if (!dispatch) return result;
  const parent = await getFrameById(dispatch.frameId);
  if (!parent) return result;
  const all = await listFramesForBoard(parent.boardId);
  const siblings = all.filter(
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
  app.get('/ws/mcp', { websocket: true }, async (socket, req) => {
    // Reap half-open connections — a stale mcpByBoard entry makes
    // isMcpConnected() lie and routes every dispatch into a dead socket.
    startHeartbeat(socket);

    // The client sends `mcp.hello` immediately on open; on a fast (localhost)
    // link that frame can arrive *before* the awaited token resolution below
    // attaches the real message listener, silently dropping the handshake so
    // the MCP never registers (no frame/DOM push, no dispatch loop). Buffer
    // everything synchronously from open and drain once we're ready.
    const earlyQueue: Buffer[] = [];
    let ready = false;
    let handleMessage: ((raw: Buffer) => Promise<void>) | null = null;
    // handleMessage is async; a rejection here must never escape as an
    // unhandled promise rejection (which takes down the whole process).
    const dispatchRaw = (raw: Buffer): void => {
      if (ready && handleMessage) {
        handleMessage(raw).catch((err) => {
          mcpLog.error(
            { err: err instanceof Error ? err.message : String(err) },
            'mcp message handler failed',
          );
        });
      } else {
        earlyQueue.push(raw);
      }
    };
    socket.on('message', dispatchRaw);

    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const boardId = url.searchParams.get('boardId');

    const user = await resolveUserFromToken(token);
    const board = boardId ? await getBoardById(boardId) : null;
    const authorized =
      user && board ? await canEditBoard(board.id, user.id) : false;
    if (!user || !boardId || !board || !authorized) {
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

    handleMessage = async (raw: Buffer) => {
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
        // The connection was authorized for the query-param board only; a
        // hello naming a different board would let any token holder attach
        // to (and inject frames into) an arbitrary board.
        if (msg.boardId !== boardId) {
          socket.close(1008, 'hello boardId does not match handshake');
          return;
        }
        helloReceived = true;
        registeredBoardId = msg.boardId;
        // Displace (and actually close) any previous agent for this board —
        // leaving it open means two agents both ack/complete dispatches while
        // only the newest receives dispatch.execute.
        const displaced = mcpByBoard.get(msg.boardId);
        if (displaced && displaced.socket !== socket) {
          try {
            displaced.socket.close(1008, 'replaced by newer agent');
          } catch {
            // already dead
          }
        }
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

      // Every post-hello message references a dispatch or frame; none of
      // them may touch a board other than the one this socket registered.
      const dispatchOnBoard = async (dispatchId: string) => {
        const d = await getDispatchById(dispatchId);
        return d && d.boardId === registeredBoardId ? d : null;
      };

      switch (msg.type) {
        case 'dispatch.ack': {
          if (!(await dispatchOnBoard(msg.dispatchId))) break;
          const d = await setDispatchStatus(msg.dispatchId, 'sending');
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
          if (!(await dispatchOnBoard(msg.dispatchId))) break;
          const before = await addDispatchEvent(msg.dispatchId, msg.event);
          if (!before) break;
          let d = before;
          if (d.status !== 'running' && d.status !== 'done' && d.status !== 'error') {
            const promoted = await setDispatchStatus(msg.dispatchId, 'running');
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
          if (!(await dispatchOnBoard(msg.dispatchId))) break;
          const repositioned = await repositionResultFrame(
            { ...msg.resultFrame, boardId: registeredBoardId },
            msg.dispatchId,
          );
          await insertFrame(repositioned);
          const d = await completeDispatch(
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
          if (!(await dispatchOnBoard(msg.dispatchId))) break;
          const d = await failDispatch(msg.dispatchId, msg.message);
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
          if (msg.frame.boardId !== registeredBoardId) break;
          await insertFrame(msg.frame);
          hub.broadcast(msg.frame.boardId, { type: 'frame.added', frame: msg.frame });
          break;
        }
        case 'branches.snapshot': {
          break;
        }
        case 'pong': {
          break;
        }
        default:
          break;
      }
    };

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

    // Auth resolved + listeners wired: process anything that arrived early.
    ready = true;
    for (const raw of earlyQueue) dispatchRaw(raw);
    earlyQueue.length = 0;
  });
}
