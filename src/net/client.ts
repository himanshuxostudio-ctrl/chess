/**
 * WebSocket client with automatic reconnection. Seat tokens are kept in localStorage per room so
 * a refresh or a dropped connection rejoins the same seat.
 */
import type { ClientMsg, ServerMsg } from '../../shared/protocol';

const TOKENS_KEY = 'awc-room-tokens';

export const tokenStore = {
  get(roomId: string): string | undefined {
    try {
      return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}')[roomId];
    } catch {
      return undefined;
    }
  },
  set(roomId: string, token: string) {
    try {
      const all = JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}');
      all[roomId] = token;
      // keep the 30 most recent
      const keys = Object.keys(all);
      for (const k of keys.slice(0, Math.max(0, keys.length - 30))) delete all[k];
      localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
    } catch {
      /* storage unavailable */
    }
  },
};

export const wsUrl = () => {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
};

export type NetStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export class NetClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private retry = 0;
  private outbox: ClientMsg[] = [];
  private pingTimer: number | null = null;
  /** Message replayed after every (re)connect to resume the session — e.g. a join with token. */
  resume: (() => ClientMsg | null) | null = null;
  onMessage: (m: ServerMsg) => void = () => {};
  onStatus: (s: NetStatus) => void = () => {};
  /** Estimated server clock offset (serverTime - localTime). */
  offset = 0;

  connect() {
    this.closedByUser = false;
    this.onStatus(this.retry ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('open');
      const r = this.resume?.();
      if (r) ws.send(JSON.stringify(r));
      for (const m of this.outbox.splice(0)) ws.send(JSON.stringify(m));
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', at: Date.now() }), 10_000);
      this.send({ t: 'ping', at: Date.now() });
    };
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.t === 'pong') {
        const rtt = Date.now() - m.at;
        this.offset = m.serverTime - (m.at + rtt / 2);
        return;
      }
      this.onMessage(m);
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.ws = null;
      if (this.closedByUser) return this.onStatus('closed');
      this.onStatus('reconnecting');
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closedByUser && this.connect(), delay);
    };
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else if (m.t !== 'ping' && m.t !== 'move') this.outbox.push(m); // moves are never queued blind (ply may go stale)
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close() {
    this.closedByUser = true;
    this.resume = null;
    this.ws?.close();
  }
}
