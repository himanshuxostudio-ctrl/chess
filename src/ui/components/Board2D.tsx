/** Graceful fallback when WebGL is unavailable: a fully playable flat board using the same store. */
import type { Square } from 'chess.js';
import { useGame } from '../../game/store';
import { UnitGlyph } from './Icons';

export function Board2D() {
  const s = useGame();
  void s.version;
  const ranks = s.orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = s.orientation === 'w' ? 'abcdefgh' : 'hgfedcba';
  const targets = new Set(s.legal.map((m) => m.to));
  return (
    <div className="board2d" role="grid" aria-label="Chess board">
      {ranks.map((r) =>
        files.split('').map((f) => {
          const sq = `${f}${r}` as Square;
          const p = s.match.chess.get(sq);
          const light = (f.charCodeAt(0) - 97 + r) % 2 === 1;
          return (
            <button
              key={sq}
              className={`${light ? 'l' : 'd'} ${s.selected === sq ? 'sel' : ''} ${targets.has(sq) ? 'tgt' : ''}`}
              aria-label={`${sq}${p ? ` ${p.color === 'w' ? 'white' : 'black'} ${p.type}` : ''}`}
              onClick={() => s.clickSquare(sq)}
            >
              {p && (
                <span className={p.color}>
                  <UnitGlyph type={p.type} className="" />
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
