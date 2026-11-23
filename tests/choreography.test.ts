import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { choreograph, unitsFromBoard, sqToXZ, xzToSq, type Unit } from '../src/game/choreography';

/** Plays a game, choreographing each move, and checks visual units always mirror the engine. */
function check(ucis: string[], fen?: string, combat = true) {
  const chess = new Chess(fen);
  let units: Unit[] = unitsFromBoard(chess);
  expect(units).toHaveLength(chess.board().flat().filter(Boolean).length);
  for (const u of ucis) {
    const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    const c = choreograph(mv, units, { combat, speed: 1 });
    units = c.finalUnits;
    // every unit sits exactly where the engine says, with the right type/colour
    const expected = chess.board().flat().filter(Boolean).map((p) => `${p!.square}${p!.color}${p!.type}`).sort();
    expect(units.map((x) => `${x.square}${x.color}${x.type}`).sort()).toEqual(expected);
    expect(c.duration).toBeGreaterThan(0);
    // last walk segment of the mover ends on the destination square
    const moverId = units.find((x) => x.square === mv.to)!.id;
    const walks = c.scripts[moverId].filter((s) => s.kind === 'walk');
    const last = walks[walks.length - 1];
    expect(last.kind === 'walk' && last.to).toEqual(sqToXZ(mv.to));
  }
  return units;
}

describe('choreography', () => {
  it('starting armies: all 32 units on correct squares', () => {
    const units = unitsFromBoard(new Chess());
    expect(units).toHaveLength(32);
    expect(new Set(units.map((u) => u.id)).size).toBe(32);
    expect(units.filter((u) => u.type === 'p')).toHaveLength(16);
    expect(units.find((u) => u.square === 'e1')?.type).toBe('k');
    expect(units.find((u) => u.square === 'd8')?.type).toBe('q');
  });

  it('square <-> world mapping is exact for all 64 squares', () => {
    for (let f = 0; f < 8; f++)
      for (let r = 1; r <= 8; r++) {
        const sq = `${'abcdefgh'[f]}${r}`;
        const [x, z] = sqToXZ(sq);
        expect(xzToSq(x, z)).toBe(sq);
        expect(xzToSq(x + 0.4, z - 0.4)).toBe(sq);
      }
  });

  it('captures, castling, en passant and promotion keep units in sync', () => {
    check(['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5']); // pawn + queen captures
    check(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']); // O-O
    check(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']); // en passant
    check(['a7b8n'], '1n5k/P7/8/8/8/8/8/K7 w - - 0 1'); // capture-promotion
    check(['a7a8q'], '7k/P7/8/8/8/8/8/K7 w - - 0 1', false);
  });

  it('capture has combat phases: attack, hit, die; victim removed', () => {
    const chess = new Chess();
    let units = unitsFromBoard(chess);
    for (const u of ['e2e4', 'd7d5']) units = choreograph(chess.move(u), units, { combat: true, speed: 1 }).finalUnits;
    const victim = units.find((u) => u.square === 'd5')!;
    const mv = chess.move('exd5');
    const c = choreograph(mv, units, { combat: true, speed: 1 });
    const mover = units.find((u) => u.square === 'e4')!;
    expect(c.scripts[mover.id].map((s) => s.kind)).toEqual(['walk', 'attack', 'walk']);
    expect(c.scripts[victim.id].map((s) => s.kind)).toEqual(['face', 'hit', 'die']);
    expect(c.finalUnits.find((u) => u.id === victim.id)).toBeUndefined();
    expect(c.isCapture).toBe(true);
    // with combat disabled it is much faster
    const fast = choreograph(mv, units, { combat: false, speed: 1 });
    expect(fast.duration).toBeLessThan(c.duration);
  });
});
