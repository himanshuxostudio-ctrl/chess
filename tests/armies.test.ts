import { describe, it, expect } from 'vitest';
import { armyOf, classicArmy, ARMY_NAME } from '../src/config/settings';
import manifest from '../public/assets/chess-pieces/manifest.json';

describe('Sun / Shadow army assignment', () => {
  it('White is the Sun army by default and the swap setting mirrors both sides', () => {
    expect(armyOf('w', 'sun')).toBe('sun');
    expect(armyOf('b', 'sun')).toBe('shadow');
    expect(armyOf('w', 'shadow')).toBe('shadow');
    expect(armyOf('b', 'shadow')).toBe('sun');
  });

  it('every army × piece the game can request has a GLB in the manifest', () => {
    const pieces = (manifest as { pieces: Record<string, { file: string }> }).pieces;
    for (const army of ['sun', 'shadow'])
      for (const p of ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'])
        expect(pieces[`${army}_${p}`]?.file, `${army}_${p}`).toMatch(new RegExp(`^/assets/chess-pieces/${army}/${p}/`));
  });

  it('classic fallback palette and display names', () => {
    expect(classicArmy('sun')).toBe('hellenic');
    expect(classicArmy('shadow')).toBe('persian');
    expect(ARMY_NAME.sun).toBe('Sun Army');
    expect(ARMY_NAME.shadow).toBe('Shadow Army');
  });
});
