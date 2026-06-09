import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type {
  ClientMessage,
  PresenceUser,
  ServerMessage,
} from '@foldo/protocol';
import { PROTOCOL_VERSION, isCompatibleProtocolVersion } from '@foldo/protocol';
import { resolveUserFromToken } from '../auth.ts';
import { getBoardById } from '../repo/boards.ts';
import { isMember } from '../repo/members.ts';
import { hub, type BrowserConn } from './hub.ts';
import { wsReplayGaps } from '../metrics.ts';
import { jobLogger } from '../log.ts';
import { nowIso } from '../util.ts';
import { isMcpConnected } from './mcp.ts';

const CURSOR_MIN_INTERVAL_MS = 33; // ~30Hz

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

    const presence: PresenceUser = {
      userId: user.id,
      name: user.name,
      initial: user.initial,
      color: user.color,
      online: true,
      lastSeenAt: nowIso(),
    };

    const conn: BrowserConn = {
      socket,
      boardId: board.id,
      userId: user.id,
      presence,
      lastCursorBroadcastAt: 0,
    };

    let helloReceived = false;
    let disconnectTimer: NodeJS.Timeout | null = null;
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

        // Build presence users for welcome, start with everyone currently connected on this board
        const others = hub
          .connectionsOnBoard(board.id)
          .map((c) => c.presence);

        // The protocol guarantees replayed messages arrive immediately AFTER
        // the welcome, so the two hub reads must be sequenced — on RedisHub
        // they are independent round-trips and would otherwise race.
        const sinceSeq =
          typeof msg.sinceSeq === 'number' && msg.sinceSeq > 0
            ? msg.sinceSeq
            : null;
        void Promise.resolve(hub.latestSeq(board.id))
          .then((latestSeq) => {
            sendSafe(socket, {
              type: 'welcome',
              boardId: board.id,
              youUserId: user.id,
              board,
              users: others,
              latestSeq,
            });
            // Replay any broadcasts the client missed while it was
            // disconnected. If sinceSeq is older than our oldest buffered
            // message we return null and the client falls back to a fresh
            // REST refetch.
            if (sinceSeq === null) return;
            return Promise.resolve(hub.getMissedSince(board.id, sinceSeq)).then(
              (missed) => {
                if (missed === null) {
                  wsReplayGaps.inc({ boardId: board.id });
                  sendSafe(socket, {
                    type: 'error',
                    code: 'REPLAY_GAP',
                    message:
                      'replay buffer no longer contains requested seq; please refetch',
                  });
                } else {
                  for (const m of missed) sendSafe(socket, m);
                }
              },
            );
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

        // Tell others we joined
        hub.broadcast(board.id, { type: 'presence.join', user: presence }, user.id);

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
        case 'cursor.move': {
          const now = Date.now();
          if (now - conn.lastCursorBroadcastAt < CURSOR_MIN_INTERVAL_MS) break;
          conn.lastCursorBroadcastAt = now;
          conn.presence.cursor = msg.cursor;
          conn.presence.lastSeenAt = nowIso();
          hub.broadcast(
            board.id,
            { type: 'presence.cursor', userId: user.id, cursor: msg.cursor },
            user.id,
          );
          break;
        }
        case 'selection.update': {
          conn.presence.selection = msg.selection ?? undefined;
          hub.broadcast(
            board.id,
            { type: 'presence.selection', userId: user.id, selection: msg.selection },
            user.id,
          );
          break;
        }
        case 'viewport.update': {
          // Single broadcast, followers receive it through the standard
          // `presence.viewport` event like everyone else.
          hub.broadcast(
            board.id,
            {
              type: 'presence.viewport',
              userId: user.id,
              x: msg.x,
              y: msg.y,
              zoom: msg.zoom,
            },
            user.id,
          );
          break;
        }
        case 'follow.start': {
          conn.followingUserId = msg.targetUserId;
          conn.presence.followingUserId = msg.targetUserId;
          break;
        }
        case 'follow.stop': {
          conn.followingUserId = undefined;
          conn.presence.followingUserId = undefined;
          break;
        }
        case 'ping': {
          sendSafe(socket, { type: 'pong', ts: msg.ts });
          break;
        }
        default:
          break;
      }
    });

    const boardIdLocal = board.id;
    const userIdLocal = user.id;

    function handleDisconnect(): void {
      hub.unsubscribe(conn);
      // Delay presence.leave by 5s in case of flaky reconnect.
      disconnectTimer = setTimeout(() => {
        // Only fire leave if no other connection for this user has come up
        const stillThere = hub.findConn(boardIdLocal, userIdLocal);
        if (!stillThere) {
          hub.broadcast(boardIdLocal, {
            type: 'presence.leave',
            userId: userIdLocal,
          });
        }
      }, 5000);
    }

    socket.on('close', handleDisconnect);
    socket.on('error', () => {
      // Let close handle cleanup; ensure timer is cleared if explicit close follows
      if (disconnectTimer) clearTimeout(disconnectTimer);
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
