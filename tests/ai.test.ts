/**
 * Runs the same Stockfish 19 lite build the browser uses (via its Node entry point) with every
 * difficulty preset, checking the engine always returns legal moves and handles terminal positions.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { AI_LEVELS } from '../src/ai/stockfish';
import { ChessMatch, uciToInput } from '../shared/rules';

const require = createRequire(import.meta.url);
let lines: ((l: string) => void)[] = [];
const enginePath: string = require('stockfish').findEngine('lite-single');
const child = spawn(process.execPath, [enginePath], { stdio: 'pipe' });
let buf = '';
child.stdout.on('data', (d: Buffer) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    lines.forEach((f) => f(line));
  }
});
const sf = {
  processCommand: (c: string) => child.stdin.write(c + '\n'),
  terminate: () => child.kill(),
};
const until = (cmd: string, pred: (l: string) => boolean) =>
  new Promise<string>((res) => {
    const f = (l: string) => {
      if (pred(l)) {
        lines = lines.filter((x) => x !== f);
        res(l);
      }
    };
    lines.push(f);
    sf.processCommand(cmd);
  });

afterAll(() => sf.terminate());

async function best(fen: string, lvl: (typeof AI_LEVELS)[number], movetime = 200) {
  sf.processCommand(`setoption name Skill Level value ${lvl.skill}`);
  sf.processCommand(`setoption name UCI_LimitStrength value ${lvl.limitElo ? 'true' : 'false'}`);
  if (lvl.limitElo) sf.processCommand(`setoption name UCI_Elo value ${lvl.limitElo}`);
  await until('isready', (l) => l === 'readyok');
  sf.processCommand(`position fen ${fen}`);
  const l = await until(`go depth ${Math.min(lvl.depth, 12)} movetime ${movetime}`, (x) => x.startsWith('bestmove'));
  return l.split(' ')[1];
}

const POSITIONS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', // mate in 1 available
  'r3k2r/pPppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1', // complex, castling/ep
];

describe('Stockfish AI', () => {
  it('initialises over UCI', async () => {
    expect(await until('uci', (l) => l === 'uciok')).toBe('uciok');
  }, 30000);

  for (const lvl of AI_LEVELS) {
    it(`${lvl.name} returns only legal moves`, async () => {
      for (const fen of POSITIONS) {
        const mv = await best(fen, lvl);
        const m = new ChessMatch(fen);
        expect(m.tryMove(uciToInput(mv)), `${lvl.name} ${fen} ${mv}`).not.toBeNull();
      }
    }, 30000);
  }

  it('strong levels find mate in one', async () => {
    const mv = await best(POSITIONS[1], AI_LEVELS[5], 400);
    expect(mv).toBe('h5f7');
  }, 30000);

  it('a full AI-vs-AI game stays legal and reaches a result', async () => {
    const m = new ChessMatch();
    for (let i = 0; i < 400 && !m.outcome().over; i++) {
      const lvl = AI_LEVELS[i % 2 ? 0 : 3];
      const mv = await best(m.fen, lvl, 20);
      expect(m.tryMove(uciToInput(mv))).not.toBeNull();
    }
    expect(m.ply).toBeGreaterThan(10);
  }, 120000);

  it('reports no move in checkmated / stalemated positions', async () => {
    const mate = await best('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', AI_LEVELS[3]);
    expect(mate).toBe('(none)');
    const stale = await best('k7/8/1Q6/8/8/8/8/7K b - - 0 1', AI_LEVELS[3]);
    expect(stale).toBe('(none)');
  }, 30000);
});
