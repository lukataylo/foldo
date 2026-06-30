// Typed WebSocket client for the canvas /ws endpoint.
// One connection per page, auto-reconnect with exponential backoff,
// ping/pong heartbeat, and a typed subscribe() API.

import type { ClientMessage, ServerMessage } from '@foldo/protocol';
import { PROTOCOL_VERSION } from '@foldo/protocol';
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
  // Allow an explicit ws/wss override (useful when WS is behind a different
  // hostname/proxy than the REST API).
  const explicit = (import.meta.env.VITE_WS_URL as string | undefined) ?? '';
  if (explicit) return explicit.replace(/\/+$/, '');
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
  /**
   * Highest seq we've seen on any broadcast. Sent back to the server in the
   * next `hello.sinceSeq` so it can replay anything we missed. Survives
   * across reconnects (lives on the instance, not the socket).
   */
  private highSeenSeq = 0;
  /** Bound `online` listener so we can remove it on `close()`. */
  private onOnline: (() => void) | null = null;

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
    // Register an `online` listener on first connect. When the browser comes
    // back online we want to immediately kick a reconnect rather than wait
    // out the current backoff window. Without this hook, a long offline
    // period inflates `reconnectAttempt` and the next attempt could be up
    // to 5s away — the e2e replay-on-reconnect spec was racing this delay.
    // It also recovers the case where an in-flight `WebSocket` is stuck in
    // CONNECTING limbo because the offline-mode network stack never closed
    // it: we force-close it here, which fires `onclose` → `scheduleReconnect`
    // (now with `reconnectAttempt` reset to 0 → immediate retry).
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      !this.onOnline
    ) {
      this.onOnline = () => {
        if (this.closedByUser) return;
        // Browser says we're back online: kick a fresh reconnect cycle
        // immediately, regardless of where the current ws is in its state
        // machine. forceReconnect handles the wedged-CONNECTING case +
        // detaches event handlers from the old ws so we don't double-fire
        // a scheduleReconnect when its delayed `onclose` finally arrives.
        this.forceReconnect('online-event');
      };
      window.addEventListener('online', this.onOnline);
    }
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
      // (re)introduce ourselves, server replies with `welcome` snapshot.
      // The `version` field tells the server which wire protocol we speak; a
      // major-version mismatch closes the connection with a clean error.
      const hello: ClientMessage = {
        type: 'hello',
        boardId: this.cfg.boardId,
        userId: this.cfg.userId,
        token: this.cfg.token,
        version: PROTOCOL_VERSION,
        // Tell the server the last broadcast we saw, so it can replay any it
        // sent while we were briefly disconnected. 0 on first connect = no
        // replay needed; the welcome snapshot is the truth.
        sinceSeq: this.highSeenSeq > 0 ? this.highSeenSeq : undefined,
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
      // Advance the replay watermark. `welcome` carries `latestSeq`
      // (initial high-water for the board); every broadcast carries a `seq`.
      if (parsed.type === 'welcome' && typeof parsed.latestSeq === 'number') {
        if (parsed.latestSeq > this.highSeenSeq) {
          this.highSeenSeq = parsed.latestSeq;
        }
      } else if (typeof parsed.seq === 'number' && parsed.seq > this.highSeenSeq) {
        this.highSeenSeq = parsed.seq;
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
    if (
      this.onOnline &&
      typeof window !== 'undefined' &&
      typeof window.removeEventListener === 'function'
    ) {
      window.removeEventListener('online', this.onOnline);
      this.onOnline = null;
    }
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
          // Heartbeat says the conn is dead even though the underlying
          // WebSocket hasn't reported it (e.g. Playwright's `setOffline`
          // doesn't close the socket, just black-holes packets — the
          // existing `online`-event reconnect doesn't fire because the
          // browser was never offline at the navigator level). Force a
          // hard reconnect that doesn't wait for the old socket's
          // `onclose` to arrive: detach handlers, mark the slot null,
          // open a fresh socket. The replay-buffer e2e (task #59) was
          // failing because the old socket stayed in OPEN state under
          // Playwright and the missed-pong close was waiting on a TCP
          // FIN handshake that never arrived.
          this.forceReconnect('missed-pongs');
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  /**
   * Hard reset of the current WebSocket. Detaches every event handler from
   * the old socket BEFORE closing it so its delayed `onclose` (if any) can't
   * race against the fresh connect, marks the slot null, and re-enters
   * `connect()` immediately with `reconnectAttempt = 0`.
   *
   * Use when the heartbeat or the `online` event tells us the conn is dead
   * even though `readyState` still says OPEN — e.g. the OS socket is fine
   * but packets aren't flowing (Playwright's `setOffline`, a phone going
   * into a tunnel, a captive-portal hijack). Distinct from `close()` which
   * is the user-initiated teardown path.
   */
  private forceReconnect(reason: string): void {
    const old = this.ws;
    this.ws = null;
    this.reconnectAttempt = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (old) {
      // Null out the handlers so a delayed `onclose` from the dead socket
      // doesn't enqueue another scheduleReconnect on top of the fresh one
      // we're about to start.
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        old.close();
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line no-console
    console.info('[foldo-ws] forceReconnect:', reason);
    this.connect();
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
