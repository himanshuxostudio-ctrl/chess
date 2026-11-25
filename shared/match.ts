/**
 * Match configuration shared by client and server.
 *
 * Clients send a MatchRequest; the SERVER normalises it into a MatchConfig (validating every
 * field and resolving "random" choices) and ships that config in every room snapshot. Both
 * players therefore always see identical settings — the client is never the source of truth.
 * Nothing here influences chess rules: the battlefield is purely presentational.
 */
import type { TimeControl } from './protocol';

export type BattlefieldId = 'sun' | 'shadow' | 'eclipse' | 'fortress';
export type BattlefieldChoice = BattlefieldId | 'random';
export type Variant = 'standard';

export interface MatchConfig {
  variant: Variant;
  timeControl: TimeControl;
  battlefield: BattlefieldId;
  rated: boolean;
  allowSpectators: boolean;
  allowRematch: boolean;
}

export interface MatchRequest {
  timeControl?: TimeControl;
  battlefield?: BattlefieldChoice;
  rated?: boolean;
  allowSpectators?: boolean;
  allowRematch?: boolean;
}

export const BATTLEFIELDS: { id: BattlefieldId; name: string; subtitle: string }[] = [
  { id: 'sun', name: 'Sun Kingdom', subtitle: 'The Golden Empire' },
  { id: 'shadow', name: 'Shadow Kingdom', subtitle: 'The Dark Empire' },
  { id: 'eclipse', name: 'Eclipse Battlefield', subtitle: 'The Combined Realm' },
  { id: 'fortress', name: 'Ancient Fortress', subtitle: 'The Great Siege' },
];
export const BATTLEFIELD_IDS = BATTLEFIELDS.map((b) => b.id);
export const battlefieldName = (id: BattlefieldId) => BATTLEFIELDS.find((b) => b.id === id)?.name ?? id;

export interface TimePreset {
  id: string;
  group: 'Bullet' | 'Blitz' | 'Rapid' | 'Classical' | 'Unlimited';
  label: string;
  tc: TimeControl;
}
const tp = (group: TimePreset['group'], m: number, inc: number): TimePreset => ({
  id: `${m}+${inc}`, group, label: `${m} + ${inc}`, tc: { initial: m * 60, increment: inc },
});
export const TIME_PRESETS: TimePreset[] = [
  tp('Bullet', 1, 0), tp('Bullet', 2, 1),
  tp('Blitz', 3, 0), tp('Blitz', 3, 2), tp('Blitz', 5, 0), tp('Blitz', 5, 3),
  tp('Rapid', 10, 0), tp('Rapid', 10, 5), tp('Rapid', 15, 10),
  tp('Classical', 30, 0),
  { id: 'unlimited', group: 'Unlimited', label: 'Unlimited', tc: { initial: 0, increment: 0 } },
];

/** Limits for custom time controls (also enforced by the server). */
export const TIME_LIMITS = { maxMinutes: 180, maxIncrement: 60 };

export function describeTime(tc: TimeControl): string {
  if (!tc.initial) return 'Unlimited';
  const m = tc.initial / 60;
  const preset = TIME_PRESETS.find((p) => p.tc.initial === tc.initial && p.tc.increment === tc.increment);
  return `${Number.isInteger(m) ? m : m.toFixed(1)} + ${tc.increment}${preset ? ` · ${preset.group}` : ' · Custom'}`;
}

export function sanitizeTime(tc: unknown): TimeControl {
  const t = (tc ?? {}) as Partial<TimeControl>;
  const initial = Number.isFinite(t.initial) ? Math.min(TIME_LIMITS.maxMinutes * 60, Math.max(0, Math.floor(t.initial!))) : 0;
  const increment = Number.isFinite(t.increment) ? Math.min(TIME_LIMITS.maxIncrement, Math.max(0, Math.floor(t.increment!))) : 0;
  return { initial, increment: initial === 0 ? 0 : increment };
}

/** Server-side normalisation of a client's request. `rand` is injectable for tests. */
export function normalizeMatch(req: unknown, rand: () => number = Math.random): MatchConfig {
  const r = (req ?? {}) as MatchRequest;
  const bf: BattlefieldId = BATTLEFIELD_IDS.includes(r.battlefield as BattlefieldId)
    ? (r.battlefield as BattlefieldId)
    : BATTLEFIELD_IDS[Math.floor(rand() * BATTLEFIELD_IDS.length)];
  return {
    variant: 'standard',
    timeControl: sanitizeTime(r.timeControl),
    battlefield: bf,
    rated: r.rated !== false,
    allowSpectators: r.allowSpectators !== false,
    allowRematch: r.allowRematch !== false,
  };
}

export const DEFAULT_MATCH: MatchConfig = {
  variant: 'standard', timeControl: { initial: 600, increment: 0 }, battlefield: 'eclipse',
  rated: true, allowSpectators: true, allowRematch: true,
};
