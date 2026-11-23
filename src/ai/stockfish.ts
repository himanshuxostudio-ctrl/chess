/**
 * Stockfish 19 (lite, single-threaded WASM) running in a Web Worker, spoken to over UCI.
 * Difficulty uses the engine's real strength controls: Skill Level, UCI_Elo limiting,
 * search depth and move time.
 */
export interface AiLevel {
  id: number;
  name: string;
  title: string;
  elo: number; // approximate, used for local rating updates
  skill: number; // Stockfish "Skill Level" 0..20
  depth: number;
  movetime: number; // ms base thinking time
  limitElo?: number;
}

export const AI_LEVELS: AiLevel[] = [
  { id: 1, name: 'Beginner', title: 'Village Levy Captain', elo: 600, skill: 0, depth: 1, movetime: 150, limitElo: 1320 },
  { id: 2, name: 'Easy', title: 'Border Garrison Lord', elo: 1000, skill: 3, depth: 3, movetime: 250 },
  { id: 3, name: 'Medium', title: 'Satrap of the Western Marches', elo: 1400, skill: 8, depth: 6, movetime: 500 },
  { id: 4, name: 'Hard', title: 'General of the Immortals', elo: 1800, skill: 13, depth: 10, movetime: 900 },
  { id: 5, name: 'Expert', title: 'Strategos of the League', elo: 2200, skill: 17, depth: 14, movetime: 1500 },
  { id: 6, name: 'Grandmaster', title: 'The Undying King of Kings', elo: 2600, skill: 20, depth: 22, movetime: 2500 },
];

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners = new Set<(line: string) => void>();
  private readyP: Promise<void> | null = null;
  private busy: Promise<unknown> = Promise.resolve();

  private ensure(): Promise<void> {
    if (this.readyP) return this.readyP;
    this.worker = new Worker('/engine/stockfish-19-lite-single.js');
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      this.listeners.forEach((l) => l(line));
    };
    this.readyP = (async () => {
      await this.cmdUntil('uci', (l) => l === 'uciok', 15000);
      await this.cmdUntil('isready', (l) => l === 'readyok', 15000);
    })();
    return this.readyP;
  }

  private cmdUntil(cmd: string, done: (l: string) => boolean, timeout = 30000): Promise<string> {
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.listeners.delete(fn);
        rej(new Error(`Stockfish timeout on: ${cmd}`));
      }, timeout);
      const fn = (l: string) => {
        if (done(l)) {
          clearTimeout(t);
          this.listeners.delete(fn);
          res(l);
        }
      };
      this.listeners.add(fn);
      this.worker!.postMessage(cmd);
    });
  }

  /** Returns best move in UCI format. Calls are serialised. */
  bestMove(fen: string, level: AiLevel, thinkMultiplier = 1): Promise<string> {
    const run = async () => {
      await this.ensure();
      const w = this.worker!;
      w.postMessage(`setoption name Skill Level value ${level.skill}`);
      if (level.limitElo) {
        w.postMessage('setoption name UCI_LimitStrength value true');
        w.postMessage(`setoption name UCI_Elo value ${level.limitElo}`);
      } else {
        w.postMessage('setoption name UCI_LimitStrength value false');
      }
      w.postMessage('ucinewgame');
      await this.cmdUntil('isready', (l) => l === 'readyok');
      w.postMessage(`position fen ${fen}`);
      const mt = Math.round(level.movetime * thinkMultiplier);
      const line = await this.cmdUntil(`go depth ${level.depth} movetime ${mt}`, (l) => l.startsWith('bestmove'), mt + 20000);
      const mv = line.split(' ')[1];
      if (!mv || mv === '(none)') throw new Error('Engine has no move');
      return mv;
    };
    const p = this.busy.then(run, run);
    this.busy = p.catch(() => undefined);
    return p;
  }

  stop() {
    this.worker?.postMessage('stop');
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.readyP = null;
    this.listeners.clear();
  }
}

export const engine = new StockfishEngine();
