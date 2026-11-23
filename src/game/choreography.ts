/**
 * Choreography turns an ALREADY-VALIDATED chess move into timed animation scripts.
 * It never decides anything about chess: the engine applied the move before this runs,
 * and `finalUnits` is derived purely from the move, so animations cannot change the result.
 */
import type { Chess, Color, Move, PieceSymbol, Square } from 'chess.js';
import type { Sfx } from '../audio/sound';

export interface Unit {
  id: string;
  type: PieceSymbol;
  color: Color;
  square: Square;
  /** Small integer used to vary infantry appearance. */
  variant: number;
}

export type Vec2 = [number, number];

export type Segment =
  | { kind: 'walk'; t0: number; t1: number; from: Vec2; to: Vec2; gait: 'march' | 'gallop' | 'roll' }
  | { kind: 'face'; t0: number; t1: number; angle: number }
  | { kind: 'attack'; t0: number; t1: number; style: AttackStyle }
  | { kind: 'hit'; t0: number; t1: number; from: Vec2 }
  | { kind: 'die'; t0: number; t1: number; fast: boolean }
  | { kind: 'promote'; t0: number; t1: number };

export type AttackStyle = 'spear' | 'sword' | 'charge' | 'royal' | 'ram' | 'staff';

export interface Choreography {
  scripts: Record<string, Segment[]>;
  cues: { t: number; sfx: Sfx }[];
  duration: number;
  /** World-space point of the action (for the cinematic camera). */
  focus: Vec2;
  isCapture: boolean;
  finalUnits: Unit[];
}

export const sqToXZ = (sq: string): Vec2 => {
  const file = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]) - 1;
  return [file - 3.5, 3.5 - rank];
};
export const xzToSq = (x: number, z: number): Square | null => {
  const file = Math.round(x + 3.5);
  const rank = Math.round(3.5 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${String.fromCharCode(97 + file)}${rank + 1}` as Square;
};
/** Rest heading: models face +z; white must face toward black (-z). */
export const restAngle = (c: Color) => (c === 'w' ? Math.PI : 0);
export const headingTo = (a: Vec2, b: Vec2) => Math.atan2(b[0] - a[0], b[1] - a[1]);

const STYLE: Record<PieceSymbol, AttackStyle> = { p: 'spear', n: 'charge', b: 'staff', r: 'ram', q: 'sword', k: 'royal' };
const GAIT = (t: PieceSymbol): 'march' | 'gallop' | 'roll' => (t === 'n' ? 'gallop' : t === 'r' ? 'roll' : 'march');
const STEP_SFX = (t: PieceSymbol): Sfx => (t === 'n' ? 'gallop' : t === 'r' ? 'wheels' : 'step');
/** Seconds per board-square for each unit type. */
const PACE: Record<PieceSymbol, number> = { p: 0.42, n: 0.26, b: 0.36, r: 0.3, q: 0.3, k: 0.45 };

let idCounter = 0;
export function unitsFromBoard(chess: Chess): Unit[] {
  const out: Unit[] = [];
  const board = chess.board();
  for (const row of board)
    for (const p of row) {
      if (!p) continue;
      out.push({ id: `u${++idCounter}`, type: p.type, color: p.color, square: p.square, variant: (p.square.charCodeAt(0) * 7 + Number(p.square[1]) * 3) % 4 });
    }
  return out;
}

export function choreograph(move: Move, units: Unit[], opts: { combat: boolean; speed: number }): Choreography {
  const k = 1 / Math.max(0.25, opts.speed);
  const scripts: Record<string, Segment[]> = {};
  const cues: { t: number; sfx: Sfx }[] = [];
  const push = (id: string, s: Segment) => (scripts[id] ??= []).push(s);

  const mover = units.find((u) => u.square === move.from);
  if (!mover) throw new Error(`No unit on ${move.from}`);
  const isEp = move.flags.includes('e');
  const victimSq = isEp ? (`${move.to[0]}${move.from[1]}` as Square) : move.to;
  const victim = move.captured ? units.find((u) => u.square === victimSq && u.color !== mover.color) : undefined;

  const A = sqToXZ(move.from);
  const B = sqToXZ(move.to);
  const dist = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const pace = PACE[mover.type] * k;
  let t = 0;
  let end = 0;

  // Step cues along a walk
  const stepCues = (t0: number, t1: number, type: PieceSymbol) => {
    const interval = type === 'n' ? 0.3 * k : type === 'r' ? 0.6 * k : 0.28 * k;
    for (let s = t0; s < t1 - 0.05; s += interval) cues.push({ t: s, sfx: STEP_SFX(type) });
    if (type !== 'n' && type !== 'r') cues.push({ t: t0, sfx: 'armor' });
  };

  if (victim && opts.combat) {
    // 1. advance to striking distance
    const V = sqToXZ(victimSq);
    const d = Math.hypot(V[0] - A[0], V[1] - A[1]);
    const reach = mover.type === 'n' || mover.type === 'r' ? 0.55 : 0.7;
    const ux = (V[0] - A[0]) / d, uz = (V[1] - A[1]) / d;
    const strikePt: Vec2 = [V[0] - ux * reach, V[1] - uz * reach];
    const approach = Math.max(0.35 * k, (d - reach) * pace);
    push(mover.id, { kind: 'walk', t0: 0, t1: approach, from: A, to: strikePt, gait: GAIT(mover.type) });
    stepCues(0, approach, mover.type);
    // victim turns to face the threat
    push(victim.id, { kind: 'face', t0: approach * 0.4, t1: approach * 0.4 + 0.3 * k, angle: headingTo(V, A) });
    t = approach;
    // 2. combat exchange
    const atk = 0.8 * k;
    const impact = t + atk * 0.55;
    push(mover.id, { kind: 'attack', t0: t, t1: t + atk, style: STYLE[mover.type] });
    cues.push({ t: t + atk * 0.25, sfx: mover.type === 'b' ? 'chant' : 'swing' });
    cues.push({ t: impact, sfx: victim.type === 'p' ? 'shield' : 'clash' });
    if (mover.type === 'n' || mover.type === 'r') cues.push({ t: impact, sfx: 'thud' });
    push(victim.id, { kind: 'hit', t0: impact, t1: impact + 0.35 * k, from: strikePt });
    // 3. defeat — falls away from the attacker and sinks out of the battlefield
    const dieT0 = impact + 0.3 * k;
    const dieT1 = dieT0 + 1.5 * k;
    push(victim.id, { kind: 'die', t0: dieT0, t1: dieT1, fast: false });
    cues.push({ t: dieT0 + 0.35 * k, sfx: 'fall' });
    // 4. victor claims the square once the fallen has cleared it
    const claimT0 = dieT0 + 0.7 * k;
    const claimT1 = claimT0 + Math.max(0.3 * k, reach * pace * 1.2);
    // If en passant, the destination differs from the victim square
    push(mover.id, { kind: 'walk', t0: claimT0, t1: claimT1, from: strikePt, to: B, gait: GAIT(mover.type) });
    stepCues(claimT0, claimT1, mover.type);
    end = Math.max(claimT1, dieT1);
    t = claimT1;
  } else {
    const dur = Math.max(0.35 * k, dist * pace);
    push(mover.id, { kind: 'walk', t0: 0, t1: dur, from: A, to: B, gait: GAIT(mover.type) });
    stepCues(0, dur, mover.type);
    if (victim) {
      // combat animations disabled: quick removal as the attacker arrives
      push(victim.id, { kind: 'die', t0: dur * 0.75, t1: dur * 0.75 + 0.3 * k, fast: true });
      cues.push({ t: dur * 0.75, sfx: 'clash' });
    }
    t = dur;
    end = Math.max(dur, victim ? dur * 0.75 + 0.3 * k : 0);
  }

  // Castling: the rook moves alongside the king.
  let rookFrom: Square | null = null;
  let rookTo: Square | null = null;
  if (move.flags.includes('k') || move.flags.includes('q')) {
    const r = move.from[1];
    rookFrom = (move.flags.includes('k') ? `h${r}` : `a${r}`) as Square;
    rookTo = (move.flags.includes('k') ? `f${r}` : `d${r}`) as Square;
    const rook = units.find((u) => u.square === rookFrom);
    if (rook) {
      const RA = sqToXZ(rookFrom), RB = sqToXZ(rookTo);
      const rd = Math.hypot(RB[0] - RA[0], RB[1] - RA[1]) * PACE.r * k;
      const t0 = 0.15 * k;
      push(rook.id, { kind: 'walk', t0, t1: t0 + rd, from: RA, to: RB, gait: 'roll' });
      cues.push({ t: t0, sfx: 'wheels' });
      end = Math.max(end, t0 + rd);
    }
  }

  // Promotion: a flash of glory once the pawn reaches the last rank.
  if (move.promotion) {
    push(mover.id, { kind: 'promote', t0: t, t1: t + 0.8 * k });
    cues.push({ t: t + 0.1 * k, sfx: 'promote' });
    end = Math.max(end, t + 0.8 * k);
  }

  // Final unit positions follow strictly from the move.
  const finalUnits = units
    .filter((u) => u !== victim)
    .map((u) => {
      if (u === mover) return { ...u, square: move.to, type: (move.promotion as PieceSymbol) ?? u.type };
      if (rookFrom && u.square === rookFrom && u.color === mover.color) return { ...u, square: rookTo! };
      return u;
    });

  return {
    scripts,
    cues: cues.sort((a, b) => a.t - b.t),
    duration: end + 0.05,
    focus: victim ? sqToXZ(victimSq) : B,
    isCapture: !!victim,
    finalUnits,
  };
}
