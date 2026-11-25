/** WebSocket protocol shared by client and server. All messages are JSON objects with a `t` tag. */
import type { Color, Outcome } from './rules';
import type { MatchConfig, MatchRequest } from './match';

export interface TimeControl {
  /** Initial seconds per side; 0 = untimed. */
  initial: number;
  /** Increment seconds per move. */
  increment: number;
}

export interface PlayerInfo {
  name: string;
  avatar?: string; // small data URL (validated server side)
  rating?: number;
  connected: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  initialFen: string;
  moves: string[]; // UCI
  players: { w: PlayerInfo | null; b: PlayerInfo | null };
  spectators: number;
  timeControl: TimeControl;
  /** Remaining ms per side at `serverTime`. */
  clock: { w: number; b: number; running: Color | null };
  serverTime: number;
  /**
   * waiting   — invitation open, second seat empty
   * ready     — both seated, waiting for both players to confirm (invitations only)
   * active    — game in progress;  over — finished;  cancelled — host withdrew the invitation
   */
  status: 'waiting' | 'ready' | 'active' | 'over' | 'cancelled';
  /** Server-authoritative match settings (identical for every client in the room). */
  config: MatchConfig;
  ready: { w: boolean; b: boolean };
  hostColor: Color | null;
  outcome: Outcome;
  drawOfferBy: Color | null;
  rematchBy: Color | null;
  startedAt: number | null;
  endedAt: number | null;
  /** Ply count when the opponent disconnected, used by the UI only. */
  disconnectDeadline: { w: number | null; b: number | null };
}

export type ClientMsg =
  | { t: 'create'; name: string; avatar?: string; rating?: number; color: Color | 'random'; timeControl?: TimeControl; match?: MatchRequest }
  | { t: 'join'; roomId: string; name: string; avatar?: string; rating?: number; token?: string }
  | { t: 'watch'; roomId: string }
  /** Read an invitation's public details without taking a seat. */
  | { t: 'peek'; roomId: string }
  | { t: 'move'; uci: string; ply: number }
  | { t: 'ready' }
  | { t: 'cancel' }
  | { t: 'resign' }
  | { t: 'offerDraw' }
  | { t: 'respondDraw'; accept: boolean }
  | { t: 'claimDraw' }
  | { t: 'rematch' }
  | { t: 'queue'; name: string; avatar?: string; rating?: number; timeControl: TimeControl }
  | { t: 'leaveQueue' }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'joined'; roomId: string; token: string | null; color: Color | null; snapshot: RoomSnapshot }
  | { t: 'state'; snapshot: RoomSnapshot }
  | { t: 'peek'; snapshot: RoomSnapshot }
  | { t: 'moved'; uci: string; ply: number; snapshot: RoomSnapshot }
  | { t: 'matched'; roomId: string; token: string; color: Color }
  | { t: 'queued'; position: number }
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong'; at: number; serverTime: number };

export type ErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'room_full'
  | 'not_your_turn'
  | 'illegal_move'
  | 'stale_ply'
  | 'not_player'
  | 'game_over'
  | 'rate_limited'
  | 'not_ready'
  | 'forbidden'
  | 'cancelled';

export const TIME_CONTROLS: { label: string; tc: TimeControl }[] = [
  { label: 'Untimed', tc: { initial: 0, increment: 0 } },
  { label: '3 + 2 Blitz', tc: { initial: 180, increment: 2 } },
  { label: '5 + 0 Blitz', tc: { initial: 300, increment: 0 } },
  { label: '10 + 0 Rapid', tc: { initial: 600, increment: 0 } },
  { label: '15 + 10 Rapid', tc: { initial: 900, increment: 10 } },
  { label: '30 + 0 Classical', tc: { initial: 1800, increment: 0 } },
];

/** Room ids: 10 chars of an unambiguous alphabet (~50 bits of entropy). */
export const ROOM_ID_RE = /^[A-HJ-NP-Z2-9]{10}$/;
export const DISCONNECT_GRACE_MS = 90_000;
