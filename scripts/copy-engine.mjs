// Copies the Stockfish WASM engine into /public so Vite serves it as a static worker.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/engine', { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);
}
console.log('Stockfish engine copied to public/engine');
