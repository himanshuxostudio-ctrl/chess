import type { AttackStyle } from '../../game/choreography';

/** Per-frame animation state the actor computes and each model reads to pose its joints. */
export interface Pose {
  mode: 'idle' | 'walk' | 'attack' | 'hit' | 'die' | 'promote' | 'defend' | 'victory';
  /** 0..1 progress through the current segment. */
  p: number;
  /** Walk cycle phase in radians. */
  stride: number;
  /** Global time (seconds) for idle motion. */
  time: number;
  style: AttackStyle;
  /** Per-unit random offset so 16 soldiers don't breathe in unison. */
  seed: number;
  /** Selected/hovered: raise weapon a bit. */
  alert: boolean;
}

export const newPose = (seed: number): Pose => ({ mode: 'idle', p: 0, stride: 0, time: 0, style: 'sword', seed, alert: false });

export const smooth = (x: number) => x * x * (3 - 2 * x);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Piecewise envelope: ramps 0→1 over [a,b], holds, then 1→0 over [c,d]. */
export const env = (x: number, a: number, b: number, c: number, d: number) =>
  x < a ? 0 : x < b ? smooth((x - a) / (b - a)) : x < c ? 1 : x < d ? 1 - smooth((x - c) / (d - c)) : 0;
