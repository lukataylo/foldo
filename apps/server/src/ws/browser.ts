import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@foldo/protocol';
import { PROTOCOL_VERSION, isCompatibleProtocolVersion } from '@foldo/protocol';
import { resolveUserFromToken } from '../auth.ts';
import { getBoardById } from '../repo/boards.ts';
import { isMember } from '../repo/members.ts';
import { listUsers } from '../repo/users.ts';
import { hub, type BrowserConn } from './hub.ts';
import { wsReplayGaps } from '../metrics.ts';
import { jobLogger } from '../log.ts';
import { isMcpConnected } from './mcp.ts';

const wsLog = jobLogger('ws-browser');

let nextConnId = 1;

export async function registerBrowserWs(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    // Note: `socket.on('message', …)` cannot itself be async without
    // unhandled-rejection footguns; calls into the hub that may return
    // a Promise (RedisHub does, in-memory Hub doesn't) are wrapped in
    // `Promise.resolve(...).then(...)` so both shapes work without us
    // having to know which backend won at boot.
    const url = new URL(req.url, `http://${req.headers.host}`);
    const boardId = url.searchParams.get('boardId');
    const userId = url.searchParams.get('userId');
    const token = url.searchParams.get('token');

    const user = await resolveUserFromToken(token);
    const board = boardId ? await getBoardById(boardId) : null;

    if (!user || !board || !userId) {
      sendSafe(socket, {
        type: 'error',
        code: 'UNAUTHORIZED',
        message: 'invalid token, board, or userId',
      });
      socket.close(1008, 'unauthorized');
      return;
    }

    if (!(await isMember(board.id, user.id))) {
      sendSafe(socket, {
        type: 'error',
        code: 'UNAUTHORIZED',
        message: 'not a member of this board',
      });
      socket.close(1008, 'not a member');
      return;
    }

    // We trust that userId matches the token's user.
    if (user.id !== userId) {
      sendSafe(socket, {
        type: 'error',
        code: 'UNAUTHORIZED',
        message: 'userId/token mismatch',
      });
      socket.close(1008, 'mismatch');
      return;
    }

    const conn: BrowserConn = {
      socket,
      boardId: board.id,
      userId: user.id,
    };

    let helloReceived = false;
    const connId = nextConnId++;

    socket.on('message', (raw: Buffer) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch (err) {
        // Don't tear down — a single garbage frame from a flaky client
        // shouldn't kill the connection. Log it (so we can spot a
        // client bug) and tell the client what happened.
        const preview = raw.toString().slice(0, 200);
        wsLog.warn(
          {
            connId,
            boardId: board.id,
            userId: user.id,
            err: err instanceof Error ? err.message : String(err),
            preview,
          },
          'ws parse error',
        );
        sendSafe(socket, {
          type: 'error',
          code: 'PROTOCOL',
          message: 'invalid_message_format',
        });
        return;
      }

      if (!helloReceived) {
        if (msg.type !== 'hello') {
          sendSafe(socket, {
            type: 'error',
            code: 'PROTOCOL',
            message: 'expected hello first',
          });
          socket.close(1008, 'expected hello');
          return;
        }
        // Reject across a major-version mismatch — at that point we're
        // guaranteed to disagree on at least one message shape, and silently
        // continuing produces baffling client bugs.
        if (!isCompatibleProtocolVersion(msg.version)) {
          sendSafe(socket, {
            type: 'error',
            code: 'PROTOCOL_VERSION',
            message: `incompatible protocol version (server=${PROTOCOL_VERSION}, client=${msg.version})`,
          });
          socket.close(1008, 'protocol version mismatch');
          return;
        }
        if (msg.boardId !== board.id || msg.userId !== user.id) {
          sendSafe(socket, {
            type: 'error',
            code: 'PROTOCOL',
            message: 'hello does not match handshake',
          });
          socket.close(1008, 'hello mismatch');
          return;
        }
        helloReceived = true;

        // Register with hub
        hub.subscribe(conn);

        // The protocol guarantees replayed messages arrive immediately AFTER
        // the welcome, so the SENDS must be ordered — on RedisHub the hub
        // reads are independent round-trips that would otherwise race. The
        // reads themselves are safe to issue in parallel; only the send
        // order matters.
        const sinceSeq =
          typeof msg.sinceSeq === 'number' && msg.sinceSeq > 0
            ? msg.sinceSeq
            : null;
        void Promise.all([
          listUsers(),
          Promise.resolve(hub.latestSeq(board.id)),
          sinceSeq === null
            ? Promise.resolve(undefined)
            : Promise.resolve(hub.getMissedSince(board.id, sinceSeq)),
        ])
          .then(([users, latestSeq, missed]) => {
            sendSafe(socket, {
              type: 'welcome',
              boardId: board.id,
              youUserId: user.id,
              board,
              users,
              latestSeq,
            });
            // Replay any broadcasts the client missed while it was
            // disconnected. If sinceSeq is older than our oldest buffered
            // message getMissedSince returns null and the client falls back
            // to a fresh REST refetch.
            if (sinceSeq === null) return;
            if (missed === null) {
              wsReplayGaps.inc({ boardId: board.id });
              sendSafe(socket, {
                type: 'error',
                code: 'REPLAY_GAP',
                message:
                  'replay buffer no longer contains requested seq; please refetch',
              });
            } else if (missed) {
              for (const m of missed) sendSafe(socket, m);
            }
          })
          .catch((err) => {
            wsLog.warn(
              {
                connId,
                boardId: board.id,
                err: err instanceof Error ? err.message : String(err),
              },
              'welcome/replay send failed',
            );
          });

        // Tell us about MCP status
        if (isMcpConnected(board.id)) {
          sendSafe(socket, {
            type: 'mcp.online',
            boardId: board.id,
            agentName: 'Claude Code',
          });
        }
        return;
      }

      switch (msg.type) {
        case 'ping': {
          sendSafe(socket, { type: 'pong', ts: msg.ts });
          break;
        }
        default:
          break;
      }
    });

    function handleDisconnect(): void {
      hub.unsubscribe(conn);
    }

    socket.on('close', handleDisconnect);
    socket.on('error', () => {
      // Let close handle cleanup.
    });
  });
}

function sendSafe(socket: WebSocket, msg: ServerMessage): void {
  try {
    // Tag every outbound message with the current protocol version so clients
    // can detect a major mismatch (and so an old client sees `version` on
    // every server message — useful for logs / tracing).
    socket.send(JSON.stringify({ ...msg, version: PROTOCOL_VERSION }));
  } catch {
    // ignore
  }
}
