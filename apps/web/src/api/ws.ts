// Typed WebSocket client for the canvas /ws endpoint.
// One connection per page, auto-reconnect with exponential backoff,
// ping/pong heartbeat, and a typed subscribe() API.

import type { ClientMessage, ServerMessage } from '@foldo/protocol';
import { API_BASE } from './client';

type Handler<T extends ServerMessage['type']> = (
  msg: Extract<ServerMessage, { type: T }>,
) => void;

type AnyHandler = (msg: ServerMessage) => void;

export interface FoldoWsConfig {
  boardId: string;
  userId: string;
  token: string;
  onStatusChange?: (status: WsStatus) => void;
}

export type WsStatus =
  | 'connecting'
  | 'open'
  | 'closed'
  | 'reconnecting'
  | 'offline';

const PING_INTERVAL_MS = 15_000;
const PONG_TIMEOUT_MS = 8_000;
const RECONNECT_BASE_MS = 200;
const RECONNECT_MAX_MS = 5_000;

function wsBaseFromApi(apiBase: string): string {
  // http://… → ws://… ; https://… → wss://…
  if (apiBase.startsWith('https://')) return 'wss://' + apiBase.slice(8);
  if (apiBase.startsWith('http://')) return 'ws://' + apiBase.slice(7);
  return apiBase;
}

export class FoldoWsClient {
  private ws: WebSocket | null = null;
  private cfg: FoldoWsConfig;
  private handlers = new Map<string, Set<AnyHandler>>();
  private anyHandlers = new Set<AnyHandler>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private missedPongs = 0;
  private pendingSend: ClientMessage[] = [];
  private closedByUser = false;
  private status: WsStatus = 'closed';

  constructor(cfg: FoldoWsConfig) {
    this.cfg = cfg;
  }

  /** Subscribe to a specific message type. Returns an unsubscribe fn. */
  subscribe<T extends ServerMessage['type']>(
    type: T,
    handler: Handler<T>,
  ): () => void {
    const set = this.handlers.get(type) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as AnyHandler);
  }

  /** Subscribe to all messages. */
  subscribeAll(handler: AnyHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // queue non-cursor messages; drop high-rate cursor moves to avoid flooding
      if (msg.type !== 'cursor.move') this.pendingSend.push(msg);
    }
  }

  connect() {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;
    this.closedByUser = false;
    this.setStatus('connecting');

    const base = wsBaseFromApi(API_BASE);
    const url = new URL(base + '/ws');
    url.searchParams.set('boardId', this.cfg.boardId);
    url.searchParams.set('userId', this.cfg.userId);
    url.searchParams.set('token', this.cfg.token);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString());
    } catch (err) {
      console.warn('[foldo-ws] failed to open', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.missedPongs = 0;
      this.setStatus('open');
      // (re)introduce ourselves — server replies with `welcome` snapshot
      const hello: ClientMessage = {
        type: 'hello',
        boardId: this.cfg.boardId,
        userId: this.cfg.userId,
        token: this.cfg.token,
      };
      ws.send(JSON.stringify(hello));
      // flush pending
      const q = this.pendingSend.slice();
      this.pendingSend.length = 0;
      for (const m of q) ws.send(JSON.stringify(m));
      this.startHeartbeat();
    };

    ws.onmessage = (ev) => {
      let parsed: ServerMessage;
      try {
        parsed = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      if (parsed.type === 'pong') {
        this.missedPongs = 0;
        if (this.pongTimer) {
          clearTimeout(this.pongTimer);
          this.pongTimer = null;
        }
        return;
      }
      // dispatch
      const set = this.handlers.get(parsed.type);
      if (set) for (const h of set) h(parsed);
      for (const h of this.anyHandlers) h(parsed);
    };

    ws.onclose = () => {
      this.stopHeartbeat();
      if (this.closedByUser) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // close handler will run after; nothing to do here
    };
  }

  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      try {
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.setStatus('closed');
  }

  getStatus() {
    return this.status;
  }

  private setStatus(s: WsStatus) {
    if (this.status === s) return;
    this.status = s;
    this.cfg.onStatusChange?.(s);
  }

  private scheduleReconnect() {
    this.setStatus('reconnecting');
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
    );
    this.reconnectAttempt++;
    if (this.reconnectAttempt > 12) {
      // give up loudly but keep retrying slowly
      this.setStatus('offline');
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.missedPongs += 1;
        if (this.missedPongs >= 2) {
          // dead conn — force a reconnect cycle
          try {
            this.ws?.close();
          } catch {
            /* ignore */
          }
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }
}
