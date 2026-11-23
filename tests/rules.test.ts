import { describe, it, expect } from 'vitest';
import { ChessMatch, START_FEN } from '../shared/rules';

const play = (m: ChessMatch, ...ucis: string[]) => {
  for (const u of ucis) {
    const r = m.tryMove({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    if (!r) throw new Error(`illegal in test: ${u}`);
  }
};

describe('chess rules', () => {
  it('has 20 legal opening moves and correct pawn double-step', () => {
    const m = new ChessMatch();
    expect(m.allLegalMoves()).toHaveLength(20);
    expect(m.legalMovesFrom('e2').map((x) => x.to).sort()).toEqual(['e3', 'e4']);
    expect(m.legalMovesFrom('g1').map((x) => x.to).sort()).toEqual(['f3', 'h3']);
  });

  it('rejects illegal moves and moves out of turn without throwing', () => {
    const m = new ChessMatch();
    expect(m.tryMove({ from: 'e2', to: 'e5' })).toBeNull();
    expect(m.tryMove({ from: 'e7', to: 'e5' })).toBeNull(); // black, white to move
    expect(m.tryMove({ from: 'a1', to: 'a3' })).toBeNull(); // rook blocked
    expect(m.tryMove({ from: 'zz', to: 'e4' })).toBeNull();
    expect(m.fen).toBe(START_FEN);
  });

  it('pawn diagonal capture', () => {
    const m = new ChessMatch();
    play(m, 'e2e4', 'd7d5');
    const cap = m.tryMove({ from: 'e4', to: 'd5' });
    expect(cap?.captured).toBe('p');
  });

  it('en passant', () => {
    const m = new ChessMatch();
    play(m, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    const ep = m.tryMove({ from: 'e5', to: 'd6' });
    expect(ep?.flags).toContain('e');
    expect(m.chess.get('d5')).toBeFalsy();
  });

  it('castling both sides, and not through check', () => {
    const k = new ChessMatch('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(k.tryMove({ from: 'e1', to: 'g1' })?.flags).toContain('k');
    expect(k.tryMove({ from: 'e8', to: 'c8' })?.flags).toContain('q');
    expect(k.chess.get('d8')?.type).toBe('r');
    // f1 attacked by black rook on f8 → kingside castling illegal
    const blocked = new ChessMatch('5r1k/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(blocked.tryMove({ from: 'e1', to: 'g1' })).toBeNull();
    expect(blocked.tryMove({ from: 'e1', to: 'c1' })).not.toBeNull();
  });

  it('promotion to each piece type', () => {
    for (const p of ['q', 'r', 'b', 'n']) {
      const m = new ChessMatch('8/P6k/8/8/8/8/8/K7 w - - 0 1');
      const mv = m.tryMove({ from: 'a7', to: 'a8', promotion: p });
      expect(mv?.promotion).toBe(p);
      expect(m.chess.get('a8')?.type).toBe(p);
    }
  });

  it('never allows leaving the king in check (pinned piece)', () => {
    const m = new ChessMatch('4r2k/8/8/8/8/8/4B3/4K3 w - - 0 1');
    expect(m.legalMovesFrom('e2')).toHaveLength(0);
  });

  it('check and checkmate (fool’s mate)', () => {
    const m = new ChessMatch();
    play(m, 'f2f3', 'e7e5', 'g2g4');
    play(m, 'd8h4');
    expect(m.inCheck()).toBe(true);
    const o = m.outcome();
    expect(o).toMatchObject({ over: true, result: '0-1', reason: 'checkmate', winner: 'b' });
    expect(m.tryMove({ from: 'a2', to: 'a3' })).toBeNull(); // no moves after game over
  });

  it('stalemate', () => {
    const m = new ChessMatch('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
    play(m, 'f7f6'); // not stalemate yet? black king h8 has g8... check below
    const m2 = new ChessMatch('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
    expect(m2.outcome()).toMatchObject({ over: true, reason: 'stalemate', result: '1/2-1/2' });
    expect(m.outcome().over).toBe(false);
  });

  it('insufficient material', () => {
    expect(new ChessMatch('8/8/8/4k3/8/8/8/4K1N1 w - - 0 1').outcome().reason).toBe('insufficient');
  });

  it('threefold is claimable, fivefold is automatic', () => {
    const m = new ChessMatch();
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    play(m, ...cycle); // position count 2
    expect(m.claimableDraw()).toBeNull();
    play(m, ...cycle); // 3
    expect(m.claimableDraw()).toBe('threefold');
    expect(m.outcome().over).toBe(false);
    play(m, ...cycle, ...cycle); // 5
    expect(m.outcome()).toMatchObject({ over: true, reason: 'fivefold' });
  });

  it('claiming a threefold ends the game as a draw', () => {
    const m = new ChessMatch();
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    play(m, ...cycle, ...cycle);
    expect(m.claimDraw()).toBe(true);
    expect(m.outcome()).toMatchObject({ over: true, reason: 'threefold', result: '1/2-1/2' });
  });

  it('50-move claim and 75-move automatic draw', () => {
    const fifty = new ChessMatch('8/8/8/4k3/8/8/R7/4K3 w - - 99 80');
    play(fifty, 'a2a3');
    expect(fifty.claimableDraw()).toBe('fifty');
    expect(fifty.outcome().over).toBe(false);
    const sf = new ChessMatch('8/8/8/4k3/8/8/R7/4K3 w - - 149 100');
    play(sf, 'a2a3');
    expect(sf.outcome()).toMatchObject({ over: true, reason: 'seventyfive' });
  });

  it('checkmate on the 150th half-move beats the 75-move rule', () => {
    const m = new ChessMatch('6k1/5ppp/8/8/8/8/8/R5K1 w - - 149 100');
    play(m, 'a1a8');
    expect(m.outcome().reason).toBe('checkmate');
  });

  it('resignation, agreement and timeout', () => {
    const r = new ChessMatch();
    r.resign('w');
    expect(r.outcome()).toMatchObject({ result: '0-1', reason: 'resign' });
    const a = new ChessMatch();
    a.agreeDraw();
    expect(a.outcome().result).toBe('1/2-1/2');
    const t = new ChessMatch('8/8/8/4k3/8/8/8/4K1N1 w - - 0 1');
    // already insufficient, but test timeout with bare-king opponent
    const t2 = new ChessMatch('8/8/8/4k3/8/8/P7/4K3 w - - 0 1');
    t2.timeout('b');
    expect(t2.outcome()).toMatchObject({ result: '1-0', reason: 'timeout' });
    const t3 = new ChessMatch('8/8/8/4k3/8/8/P7/4K3 w - - 0 1');
    t3.timeout('w'); // black has only a king → cannot mate → draw
    expect(t3.outcome().result).toBe('1/2-1/2');
    expect(t.outcome().over).toBe(true);
  });

  it('undo restores position and repetition counts', () => {
    const m = new ChessMatch();
    play(m, 'e2e4', 'e7e5');
    m.undo();
    m.undo();
    expect(m.fen).toBe(START_FEN);
    expect(m.repetitionCount()).toBe(1);
  });

  it('SAN history, FEN and PGN export, replay from UCI', () => {
    const m = new ChessMatch();
    play(m, 'e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5');
    expect(m.history().map((x) => x.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(m.pgn({ White: 'A', Black: 'B' })).toContain('1. e4 e5 2. Nf3 Nc6 3. Bb5');
    const replay = new ChessMatch(START_FEN, m.uciHistory());
    expect(replay.fen).toBe(m.fen);
  });
});
