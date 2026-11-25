/**
 * Server-authoritative game rooms. Every move is validated here with the shared chess rules
 * before it is broadcast; clients are never trusted with game state.
 */
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ChessMatch, START_FEN, uciToInput, type Color, type Outcome } from '../shared/rules';
import { DEFAULT_MATCH, type MatchConfig } from '../shared/match';
import {
  DISCONNECT_GRACE_MS,
  type ErrorCode,
  type PlayerInfo,
  type RoomSnapshot,
  type TimeControl,
} from '../shared/protocol';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomId = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const newToken = () => randomBytes(24).toString('hex');

export interface Seat {
  token: string;
  info: PlayerInfo;
  /** Number of live sockets for this seat (a player may have two tabs). */
  sockets: number;
  disconnectedAt: number | null;
}

export interface PersistedRoom {
  id: string;
  createdAt: number;
  initialFen: string;
  moves: string[];
  seats: { w: Seat | null; b: Seat | null };
  timeControl: TimeControl;
  clock: { w: number; b: number; running: Color | null; lastTick: number };
  status: 'waiting' | 'ready' | 'active' | 'over' | 'cancelled';
  /** Server-authoritative settings; normalised from the creator's request. */
  config: MatchConfig;
  /** Invitations need both players to confirm before the game starts. */
  requireReady: boolean;
  ready: { w: boolean; b: boolean };
  hostColor: Color | null;
  forced?: Outcome;
  drawOfferBy: Color | null;
  rematchBy: Color | null;
  startedAt: number | null;
  endedAt: number | null;
  lastActivity: number;
  rematchRoomId?: string;
}

export class RoomError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const safeEq = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export class Room {
  data: PersistedRoom;
  match: ChessMatch;
  spectators = 0;

  constructor(data: PersistedRoom) {
    // Rooms persisted before match configs existed get sensible defaults.
    data.config ??= { ...DEFAULT_MATCH, timeControl: data.timeControl };
    data.requireReady ??= false;
    data.ready ??= { w: false, b: false };
    data.hostColor ??= null;
    this.data = data;
    this.match = new ChessMatch(data.initialFen, data.moves);
    this.match.setForced(data.forced);
  }

  static create(config: MatchConfig, requireReady = false, now = Date.now()): Room {
    const timeControl: TimeControl = config.timeControl;
    const ms = timeControl.initial * 1000;
    return new Room({
      id: newRoomId(),
      createdAt: now,
      initialFen: START_FEN,
      moves: [],
      seats: { w: null, b: null },
      timeControl,
      clock: { w: ms, b: ms, running: null, lastTick: now },
      status: 'waiting',
      config,
      requireReady,
      ready: { w: false, b: false },
      hostColor: null,
      drawOfferBy: null,
      rematchBy: null,
      startedAt: null,
      endedAt: null,
      lastActivity: now,
    });
  }

  get id() {
    return this.data.id;
  }
  get timed() {
    return this.data.timeControl.initial > 0;
  }

  /** Seat a new player. Returns their secret token. */
  seat(color: Color, info: Omit<PlayerInfo, 'connected'>, now = Date.now()): string {
    if (this.data.seats[color]) throw new RoomError('room_full', 'Seat already taken');
    const token = newToken();
    this.data.seats[color] = { token, info: { ...info, connected: false }, sockets: 0, disconnectedAt: null };
    if (this.data.seats.w && this.data.seats.b && this.data.status === 'waiting') {
      if (this.data.requireReady) this.data.status = 'ready';
      else this.start(now);
    }
    this.touch(now);
    return token;
  }

  private start(now: number) {
    this.data.status = 'active';
    this.data.startedAt = now;
    this.data.clock.lastTick = now;
    // Clocks start only after White's first move (common online practice); see move().
    this.data.clock.running = null;
  }

  /** A seated player confirms they are ready; the game starts when both have. */
  setReady(color: Color, now = Date.now()) {
    if (this.data.status !== 'ready') throw new RoomError('not_ready', 'Nothing to get ready for');
    this.data.ready[color] = true;
    if (this.data.ready.w && this.data.ready.b) this.start(now);
    this.touch(now);
  }

  /** The host withdraws an invitation that has not started yet. */
  cancel(color: Color, now = Date.now()) {
    if (this.data.hostColor !== color) throw new RoomError('forbidden', 'Only the host can cancel the invitation');
    if (this.data.status !== 'waiting' && this.data.status !== 'ready') throw new RoomError('bad_request', 'The battle has already begun');
    this.data.status = 'cancelled';
    this.data.endedAt = now;
    this.touch(now);
  }

  colorForToken(token: string | undefined): Color | null {
    if (!token) return null;
    for (const c of ['w', 'b'] as Color[]) {
      const s = this.data.seats[c];
      if (s && safeEq(s.token, token)) return c;
    }
    return null;
  }

  freeColor(): Color | null {
    if (!this.data.seats.w) return 'w';
    if (!this.data.seats.b) return 'b';
    return null;
  }

  connect(color: Color, now = Date.now()) {
    const s = this.data.seats[color]!;
    s.sockets++;
    s.info.connected = true;
    s.disconnectedAt = null;
    this.touch(now);
  }
  disconnect(color: Color, now = Date.now()) {
    const s = this.data.seats[color];
    if (!s) return;
    s.sockets = Math.max(0, s.sockets - 1);
    if (s.sockets === 0) {
      s.info.connected = false;
      s.disconnectedAt = now;
    }
  }

  private touch(now: number) {
    this.data.lastActivity = now;
  }

  /** Bring the running clock up to date; flag if it hit zero. Returns true if state changed. */
  tick(now = Date.now()): boolean {
    let changed = false;
    const c = this.data.clock;
    if (this.data.status === 'active' && c.running) {
      c[c.running] -= now - c.lastTick;
      if (c[c.running] <= 0) {
        c[c.running] = 0;
        this.match.timeout(c.running);
        this.finish(now);
        changed = true;
      }
    }
    c.lastTick = now;
    // Abandonment: a player gone longer than the grace period loses (only once the game is underway).
    if (this.data.status === 'active') {
      for (const col of ['w', 'b'] as Color[]) {
        const s = this.data.seats[col];
        if (s && !s.info.connected && s.disconnectedAt && now - s.disconnectedAt > DISCONNECT_GRACE_MS) {
          const other = this.data.seats[col === 'w' ? 'b' : 'w'];
          if (other?.info.connected) {
            this.match.abandon(col);
            this.finish(now);
            changed = true;
          }
        }
      }
    }
    return changed;
  }

  move(color: Color, uci: string, ply: number, now = Date.now()) {
    if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new RoomError('bad_request', 'Malformed move');
    if (this.data.status === 'waiting' || this.data.status === 'ready') throw new RoomError('not_ready', 'Waiting for both commanders');
    if (this.data.status === 'cancelled') throw new RoomError('cancelled', 'This invitation was cancelled');
    this.tick(now);
    if (this.data.status === 'over') throw new RoomError('game_over', 'Game is over');
    // `ply` lets the server drop duplicates (re-sent after reconnect) and conflicting stale moves.
    if (ply !== this.match.ply) throw new RoomError('stale_ply', 'Position changed; move ignored');
    if (this.match.turn !== color) throw new RoomError('not_your_turn', 'Not your turn');
    const m = this.match.tryMove(uciToInput(uci));
    if (!m) throw new RoomError('illegal_move', 'Illegal move');
    this.data.moves.push(uci);
    // Moving instead of answering implicitly declines the opponent's draw offer.
    if (this.data.drawOfferBy && this.data.drawOfferBy !== color) this.data.drawOfferBy = null;
    if (this.timed) {
      if (this.data.clock.running) this.data.clock[color] += this.data.timeControl.increment * 1000;
      this.data.clock.running = this.match.turn;
      this.data.clock.lastTick = now;
    }
    if (this.match.outcome().over) this.finish(now);
    this.touch(now);
    return m;
  }

  resign(color: Color, now = Date.now()) {
    this.requireActive();
    this.match.resign(color);
    this.finish(now);
  }
  offerDraw(color: Color) {
    this.requireActive();
    this.data.drawOfferBy = color;
  }
  respondDraw(color: Color, accept: boolean, now = Date.now()) {
    this.requireActive();
    if (!this.data.drawOfferBy || this.data.drawOfferBy === color) throw new RoomError('bad_request', 'No draw offer to answer');
    if (accept) {
      this.match.agreeDraw();
      this.finish(now);
    }
    this.data.drawOfferBy = null;
  }
  claimDraw(color: Color, now = Date.now()) {
    this.requireActive();
    if (this.match.turn !== color) throw new RoomError('not_your_turn', 'Claim on your turn');
    if (!this.match.claimDraw()) throw new RoomError('bad_request', 'No draw to claim');
    this.finish(now);
  }

  private requireActive() {
    if (this.data.status !== 'active') throw new RoomError(this.data.status === 'over' ? 'game_over' : 'not_ready', 'Game not active');
  }

  private finish(now: number) {
    this.data.status = 'over';
    this.data.clock.running = null;
    this.data.endedAt = now;
    this.data.drawOfferBy = null;
    this.data.forced = this.match.forcedOutcome;
  }

  snapshot(now = Date.now()): RoomSnapshot {
    const c = this.data.clock;
    const live = { w: c.w, b: c.b };
    if (this.data.status === 'active' && c.running) live[c.running] = Math.max(0, live[c.running] - (now - c.lastTick));
    const pub = (s: Seat | null) => (s ? { ...s.info } : null);
    const dl = (col: Color) => {
      const s = this.data.seats[col];
      return s && !s.info.connected && s.disconnectedAt ? s.disconnectedAt + DISCONNECT_GRACE_MS : null;
    };
    return {
      roomId: this.id,
      initialFen: this.data.initialFen,
      moves: [...this.data.moves],
      players: { w: pub(this.data.seats.w), b: pub(this.data.seats.b) },
      spectators: this.spectators,
      timeControl: this.data.timeControl,
      clock: { ...live, running: c.running },
      serverTime: now,
      status: this.data.status,
      config: this.data.config,
      ready: { ...this.data.ready },
      hostColor: this.data.hostColor,
      outcome: this.match.outcome(),
      drawOfferBy: this.data.drawOfferBy,
      rematchBy: this.data.rematchBy,
      startedAt: this.data.startedAt,
      endedAt: this.data.endedAt,
      disconnectDeadline: { w: dl('w'), b: dl('b') },
    };
  }

  /** Should this room be garbage collected? */
  expired(now = Date.now()): boolean {
    const idle = now - this.data.lastActivity;
    const anyone = !!(this.data.seats.w?.info.connected || this.data.seats.b?.info.connected || this.spectators);
    if (this.data.status === 'cancelled') return now - (this.data.endedAt ?? now) > 10 * 60_000; // 10 min after cancel
    if (this.data.status === 'waiting' || this.data.status === 'ready') return idle > 60 * 60_000 && !anyone; // 1h unstarted
    if (this.data.status === 'over') return now - (this.data.endedAt ?? now) > 6 * 60 * 60_000 && !anyone; // 6h after end
    return idle > 24 * 60 * 60_000 && !anyone; // abandoned active game: 24h
  }
}

/** Basic sanitising for user supplied profile info. */
export function cleanInfo(raw: { name?: unknown; avatar?: unknown; rating?: unknown }): Omit<PlayerInfo, 'connected'> {
  const name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '';
  let avatar: string | undefined;
  if (typeof raw.avatar === 'string' && raw.avatar.length < 40_000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.avatar)) {
    avatar = raw.avatar;
  }
  const rating = typeof raw.rating === 'number' && Number.isFinite(raw.rating) ? Math.round(Math.min(3500, Math.max(100, raw.rating))) : undefined;
  return { name: name || 'Anonymous Commander', avatar, rating };
}
