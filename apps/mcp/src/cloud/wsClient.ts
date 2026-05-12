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

  function safeSend(msg: McpClientMessage): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      log(`ws send failed: ${(err as Error).message}`);
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
        // Exhaustiveness — unknown message types are ignored.
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
    // to look "stable" — protects against tight flap loops where the
    // remote accepts then immediately closes.
    let stableTimer: NodeJS.Timeout | null = null;
    socket.on('open', () => {
      log('connected to cloud');
      sendHello();
      stableTimer = setTimeout(() => {
        reconnectDelay = 500;
      }, 3000);
    });
    socket.on('message', (data) => {
      handleServerMessage(data.toString('utf8'));
    });
    socket.on('error', (err) => {
      log(`cloud unreachable: ${err.message}`);
    });
    socket.on('close', () => {
      if (stableTimer) {
        clearTimeout(stableTimer);
        stableTimer = null;
      }
      log('cloud connection closed');
      ws = null;
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
