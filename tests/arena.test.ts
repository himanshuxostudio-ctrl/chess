import { describe, expect, it } from 'vitest';
import { ARENA_THEMES, arenaTheme, contrast } from '../src/three/arena/themes';
import { BATTLEFIELD_IDS } from '../shared/match';

describe('arena themes', () => {
  it('defines a theme for every battlefield the server can choose', () => {
    for (const id of BATTLEFIELD_IDS) expect(ARENA_THEMES[id].id).toBe(id);
    expect(arenaTheme(undefined).id).toBe('eclipse');
  });

  it('keeps board squares readable on every battlefield', () => {
    for (const t of Object.values(ARENA_THEMES)) {
      // light vs dark squares
      expect(contrast(t.board.light.base, t.board.dark.base), `${t.id} squares`).toBeGreaterThanOrEqual(4.5);
      // move highlight (#ffd27a) must stand out on dark squares; capture ring (#ff4a32) on light squares
      expect(contrast('#ffd27a', t.board.dark.base), `${t.id} move marker`).toBeGreaterThanOrEqual(4);
      expect(contrast('#ff4a32', t.board.light.base), `${t.id} capture marker`).toBeGreaterThanOrEqual(1.8);
    }
  });
});
