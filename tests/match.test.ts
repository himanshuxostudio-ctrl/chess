import { describe, it, expect } from 'vitest';
import { normalizeMatch, sanitizeTime, describeTime, TIME_PRESETS, BATTLEFIELD_IDS } from '../shared/match';

describe('match config normalisation', () => {
  it('has every requested time-control preset', () => {
    expect(TIME_PRESETS.map((p) => p.id)).toEqual(['1+0', '2+1', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0', 'unlimited']);
  });
  it('clamps custom time controls and drops increments on unlimited games', () => {
    expect(sanitizeTime({ initial: 7 * 60, increment: 4 })).toEqual({ initial: 420, increment: 4 });
    expect(sanitizeTime({ initial: -5, increment: 9 })).toEqual({ initial: 0, increment: 0 });
    expect(sanitizeTime({ initial: 1e9, increment: 1e9 })).toEqual({ initial: 180 * 60, increment: 60 });
    expect(sanitizeTime('nonsense')).toEqual({ initial: 0, increment: 0 });
  });
  it('resolves random battlefields and defaults booleans to on', () => {
    const c = normalizeMatch({ battlefield: 'random' }, () => 0.99);
    expect(c.battlefield).toBe(BATTLEFIELD_IDS[BATTLEFIELD_IDS.length - 1]);
    expect(c).toMatchObject({ variant: 'standard', rated: true, allowSpectators: true, allowRematch: true });
    expect(normalizeMatch({ battlefield: 'atlantis' as never }, () => 0).battlefield).toBe('sun');
    expect(normalizeMatch({ rated: false, allowSpectators: false, allowRematch: false })).toMatchObject({ rated: false, allowSpectators: false, allowRematch: false });
  });
  it('describes time controls for the UI', () => {
    expect(describeTime({ initial: 180, increment: 2 })).toBe('3 + 2 · Blitz');
    expect(describeTime({ initial: 420, increment: 4 })).toBe('7 + 4 · Custom');
    expect(describeTime({ initial: 0, increment: 0 })).toBe('Unlimited');
  });
});
