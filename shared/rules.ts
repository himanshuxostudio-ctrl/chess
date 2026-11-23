/**
 * Shared chess rules layer used by BOTH the browser client and the multiplayer server.
 *
 * chess.js is the single source of truth for legality. This wrapper adds the pieces of
 * FIDE rules chess.js leaves to the application:
 *   - 75-move rule and fivefold repetition (automatic draws)
 *   - 50-move rule and threefold repetition (draws a player may CLAIM)
 *   - resignation, agreement, timeout and abandonment results
 */
import { Chess, type Move, type Square, type PieceSymbol, type Color } from 'chess.js';

export type { Square, PieceSymbol, Color, Move };

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient'
  | 'fivefold'
  | 'seventyfive'
  | 'threefold'
  | 'fifty'
  | 'agreement'
  | 'resign'
  | 'timeout'
  | 'abandon';

export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface Outcome {
  over: boolean;
  result: Result;
  reason?: EndReason;
  /** Winner colour when decisive. */
  winner?: Color;
}

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Position key used for repetition (piece placement, side, castling, en-passant). */
const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export class ChessMatch {
  readonly chess: Chess;
  readonly initialFen: string;
  private counts = new Map<string, number>();
  private forced?: Outcome;

  constructor(fen: string = START_FEN, uciMoves: string[] = []) {
    this.initialFen = fen;
    this.chess = new Chess(fen);
    this.bump();
    for (const u of uciMoves) {
      const m = this.tryMove(uciToInput(u));
      if (!m) throw new Error(`Corrupt move list at ${u}`);
    }
  }

  private bump() {
    const k = positionKey(this.chess.fen());
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  get fen() {
    return this.chess.fen();
  }
  get turn(): Color {
    return this.chess.turn();
  }
  get ply() {
    return this.chess.history().length;
  }
  history(): Move[] {
    return this.chess.history({ verbose: true });
  }
  uciHistory(): string[] {
    return this.history().map(moveToUci);
  }
  legalMovesFrom(square: string): Move[] {
    return this.chess.moves({ square: square as Square, verbose: true });
  }
  allLegalMoves(): Move[] {
    return this.chess.moves({ verbose: true });
  }
  inCheck() {
    return this.chess.inCheck();
  }

  /** Validates and plays a move. Returns null for ANY illegal move (never throws). */
  tryMove(input: MoveInput): Move | null {
    if (this.outcome().over) return null;
    try {
      const m = this.chess.move({ from: input.from, to: input.to, promotion: input.promotion ?? 'q' });
      this.bump();
      return m;
    } catch {
      return null;
    }
  }

  /** Undo the last ply (local modes only). */
  undo(): Move | null {
    if (this.forced) return null;
    const key = positionKey(this.chess.fen());
    const m = this.chess.undo();
    if (m) {
      const c = (this.counts.get(key) ?? 1) - 1;
      if (c <= 0) this.counts.delete(key);
      else this.counts.set(key, c);
    }
    return m;
  }

  repetitionCount() {
    return this.counts.get(positionKey(this.chess.fen())) ?? 0;
  }
  halfmoveClock() {
    return Number(this.chess.fen().split(' ')[4] ?? 0);
  }

  /** Draws the side to move may claim (threefold / fifty-move). */
  claimableDraw(): EndReason | null {
    if (this.outcome().over) return null;
    if (this.repetitionCount() >= 3) return 'threefold';
    if (this.halfmoveClock() >= 100) return 'fifty';
    return null;
  }

  claimDraw(): boolean {
    const r = this.claimableDraw();
    if (!r) return false;
    this.forced = { over: true, result: '1/2-1/2', reason: r };
    return true;
  }

  resign(color: Color) {
    if (this.outcome().over) return;
    const winner: Color = color === 'w' ? 'b' : 'w';
    this.forced = { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'resign', winner };
  }
  agreeDraw() {
    if (this.outcome().over) return;
    this.forced = { over: true, result: '1/2-1/2', reason: 'agreement' };
  }
  /** Flag fall. FIDE 6.9: if the opponent cannot possibly mate, it is a draw. */
  timeout(color: Color) {
    if (this.outcome().over) return;
    const winner: Color = color === 'w' ? 'b' : 'w';
    if (!canEverMate(this.chess, winner)) {
      this.forced = { over: true, result: '1/2-1/2', reason: 'timeout' };
    } else {
      this.forced = { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'timeout', winner };
    }
  }
  abandon(color: Color) {
    if (this.outcome().over) return;
    const winner: Color = color === 'w' ? 'b' : 'w';
    this.forced = { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'abandon', winner };
  }
  setForced(o: Outcome | undefined) {
    this.forced = o;
  }
  get forcedOutcome() {
    return this.forced;
  }

  outcome(): Outcome {
    if (this.forced) return this.forced;
    const c = this.chess;
    if (c.isCheckmate()) {
      const winner: Color = c.turn() === 'w' ? 'b' : 'w';
      return { over: true, result: winner === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner };
    }
    if (c.isStalemate()) return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { over: true, result: '1/2-1/2', reason: 'insufficient' };
    if (this.repetitionCount() >= 5) return { over: true, result: '1/2-1/2', reason: 'fivefold' };
    if (this.halfmoveClock() >= 150) return { over: true, result: '1/2-1/2', reason: 'seventyfive' };
    return { over: false, result: '*' };
  }

  pgn(headers: Record<string, string> = {}): string {
    const c = new Chess(this.initialFen);
    if (this.initialFen !== START_FEN) {
      c.setHeader('SetUp', '1');
      c.setHeader('FEN', this.initialFen);
    }
    for (const [k, v] of Object.entries(headers)) c.setHeader(k, v);
    for (const m of this.history()) c.move(m.san);
    c.setHeader('Result', this.outcome().result);
    return c.pgn();
  }
}

/** Could `color` deliver mate with the material it has (ignoring the opponent)? */
function canEverMate(chess: Chess, color: Color): boolean {
  let minors = 0;
  for (const row of chess.board())
    for (const p of row) {
      if (!p || p.color !== color) continue;
      if (p.type === 'p' || p.type === 'q' || p.type === 'r') return true;
      if (p.type === 'n' || p.type === 'b') minors++;
    }
  // Lone minor piece can't force anything, but a helpmate is possible with opponent pieces;
  // FIDE only awards a draw when no sequence of legal moves can mate. K+N / K+B vs bare king is a draw.
  if (minors === 0) return false;
  if (minors === 1) {
    let oppPieces = 0;
    for (const row of chess.board()) for (const p of row) if (p && p.color !== color && p.type !== 'k') oppPieces++;
    return oppPieces > 0;
  }
  return true;
}

export const moveToUci = (m: { from: string; to: string; promotion?: string }) =>
  `${m.from}${m.to}${m.promotion ?? ''}`;

export const uciToInput = (u: string): MoveInput => ({
  from: u.slice(0, 2),
  to: u.slice(2, 4),
  promotion: u.length > 4 ? u[4] : undefined,
});

export const REASON_TEXT: Record<EndReason, string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  insufficient: 'Insufficient material',
  fivefold: 'Fivefold repetition',
  seventyfive: '75-move rule',
  threefold: 'Threefold repetition (claimed)',
  fifty: '50-move rule (claimed)',
  agreement: 'Draw by agreement',
  resign: 'Resignation',
  timeout: 'Time forfeit',
  abandon: 'Opponent abandoned the battle',
};
