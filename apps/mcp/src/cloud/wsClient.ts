// WebSocket client to the Foldo cloud. Connects to /ws/mcp, sends a hello,
// listens for dispatch.execute / freeze.request, replies with progress and
// completion messages. Reconnects with exponential backoff when the socket
// drops or the cloud isn't available yet.

import WebSocket from 'ws';
import type {
  Dispatch,
  McpClientMessage,
  McpServerMessage,
  RecipeStep,
} from '@foldo/protocol';
import { MCP_TOOLS } from '@foldo/protocol';
import type { FoldoMcpConfig } from '../config.ts';
import { toWsUrl } from '../config.ts';

export interface CloudClientHandlers {
  onDispatchExecute: (d: Dispatch) => Promise<void> | void;
  onFreezeRequest: (req: {
    boardId: string;
    branchId: string;
    commitSha: string;
    recipe?: RecipeStep[];
    stateLabel?: string;
  }) => Promise<void> | void;
}

export interface CloudClient {
  start(): void;
  stop(): void;
  send(msg: McpClientMessage): void;
  isConnected(): boolean;
}

export function createCloudClient(
  config: FoldoMcpConfig,
  handlers: CloudClientHandlers,
  log: (line: string) => void = () => {},
): CloudClient {
  let ws: WebSocket | null = null;
  let stopped = false;
  let reconnectDelay = 500; // ms
  const MAX_DELAY = 15_000;

  const url = (() => {
    const base = toWsUrl(config.cloudUrl, config.cloudWsPath);
    const u = new URL(base);
    u.searchParams.set('token', config.token);
    u.searchParams.set('boardId', config.boardId);
    u.searchParams.set('agentName', config.agentName);
    return u.toString();
  })();

  // Outbound queue for messages the cloud must not lose. A `claude` run can
  // take minutes; if the WS flaps while it works, dropping the terminal
  // dispatch.completed/failed on the floor wedges the server-side dispatch
  // in "running" forever even though the commit already pushed.
  const pendingSend: McpClientMessage[] = [];
  const MAX_PENDING = 500;

  function queueDurable(msg: McpClientMessage): void {
    // hello/pong are connection-scoped chatter; everything else records
    // work (dispatch lifecycle, captured frames) that must reach the cloud.
    if (msg.type === 'mcp.hello' || msg.type === 'pong') return;
    if (pendingSend.length >= MAX_PENDING) pendingSend.shift();
    pendingSend.push(msg);
    log(`queued ${msg.type} until reconnect (${pendingSend.length} pending)`);
  }

  function safeSend(msg: McpClientMessage): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      queueDurable(msg);
      return;
    }
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      log(`ws send failed: ${(err as Error).message}`);
      queueDurable(msg);
    }
  }

  function sendHello(): void {
    const hello: McpClientMessage = {
      type: 'mcp.hello',
      token: config.token,
      boardId: config.boardId,
      agentName: config.agentName,
      version: config.version,
      tools: Object.values(MCP_TOOLS),
    };
    safeSend(hello);
  }

  function handleServerMessage(raw: string): void {
    let msg: McpServerMessage;
    try {
      msg = JSON.parse(raw) as McpServerMessage;
    } catch {
      log(`ws bad json: ${raw.slice(0, 80)}`);
      return;
    }
    switch (msg.type) {
      case 'mcp.welcome':
        log(`cloud welcomed mcp (board=${msg.boardId}, accepted=${msg.tokenAccepted})`);
        // Flush anything that accumulated while disconnected — replayed in
        // order, AFTER the hello/welcome handshake so the server has
        // registered this socket.
        if (msg.tokenAccepted && pendingSend.length > 0) {
          const q = pendingSend.splice(0, pendingSend.length);
          log(`flushing ${q.length} queued message(s)`);
          for (const m of q) safeSend(m);
        }
        break;
      case 'ping':
        safeSend({ type: 'pong', ts: msg.ts });
        break;
      case 'dispatch.execute':
        log(`dispatch.execute id=${msg.dispatch.id}`);
        void Promise.resolve(handlers.onDispatchExecute(msg.dispatch)).catch(
          (err) => {
            log(`dispatch handler error: ${(err as Error).message}`);
            safeSend({
              type: 'dispatch.failed',
              dispatchId: msg.dispatch.id,
              message: (err as Error).message,
            });
          },
        );
        break;
      case 'freeze.request':
        log(`freeze.request branch=${msg.branchId}`);
        void Promise.resolve(handlers.onFreezeRequest(msg)).catch((err) => {
          log(`freeze handler error: ${(err as Error).message}`);
        });
        break;
      default: {
        // Exhaustiveness, unknown message types are ignored.
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  }

  function connect(): void {
    if (stopped) return;
    log(`connecting to ${url}`);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      log(`ws ctor failed: ${(err as Error).message}`);
      scheduleReconnect();
      return;
    }
    ws = socket;

    // Only reset the backoff if the connection stays open long enough
    // to look "stable", protects against tight flap loops where the
    // remote accepts then immediately closes.
    let stableTimer: NodeJS.Timeout | null = null;
    // Protocol-level heartbeat: without it a half-open socket (laptop
    // sleep, NAT idle-out) never surfaces as closed, dispatches route
    // into a black hole, and the durable queue never flushes.
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    socket.on('open', () => {
      log('connected to cloud');
      sendHello();
      stableTimer = setTimeout(() => {
        reconnectDelay = 500;
      }, 3000);
      alive = true;
      heartbeatTimer = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (!alive) {
          log('heartbeat missed — terminating stale connection');
          socket.terminate();
          return;
        }
        alive = false;
        try {
          socket.ping();
        } catch {
          socket.terminate();
        }
      }, 30_000);
      heartbeatTimer.unref?.();
    });
    socket.on('message', (data) => {
      handleServerMessage(data.toString('utf8'));
    });
    socket.on('error', (err) => {
      log(`cloud unreachable: ${err.message}`);
    });
    socket.on('close', (code: number, reason: Buffer) => {
      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      ws = null;
      // 1008 = policy violation: the server rejected us deliberately
      // (bad token, no board access, or displaced by a newer agent for
      // the same board). Reconnecting would be wrong — two agents on one
      // board would displace each other in an infinite war, spamming
      // mcp.online/offline to every browser. Stop and stay stopped.
      if (code === 1008) {
        stopped = true;
        log(
          `cloud rejected this connection (${reason.toString() || 'policy violation'}) — not reconnecting`,
        );
        return;
      }
      log('cloud connection closed');
      scheduleReconnect();
    });
  }

  function scheduleReconnect(): void {
    if (stopped) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    log(`retrying in ${delay}ms`);
    setTimeout(connect, delay);
  }

  return {
    start(): void {
      stopped = false;
      connect();
    },
    stop(): void {
      stopped = true;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
        ws = null;
      }
    },
    send: safeSend,
    isConnected(): boolean {
      return !!ws && ws.readyState === WebSocket.OPEN;
    },
  };
}
