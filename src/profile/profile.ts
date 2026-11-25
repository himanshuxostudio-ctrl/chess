/**
 * Guest profile stored on this device: name, avatar, rating, match history and statistics.
 * (Cloud accounts are an outstanding item — see README "Accounts".)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type GameMode = 'ai' | 'online' | 'local';

export interface MatchRecord {
  id: string;
  date: number;
  mode: GameMode;
  opponent: string;
  color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  reason: string;
  moves: number;
  durationSec: number;
  ratingAfter?: number;
  pgn: string;
}

interface ProfileState {
  name: string;
  avatar?: string;
  rating: number;
  history: MatchRecord[];
  stats: { wins: number; losses: number; draws: number };
  modeCounts: Record<GameMode, number>;
  setName: (n: string) => void;
  setAvatar: (a: string | undefined) => void;
  record: (r: Omit<MatchRecord, 'id' | 'date' | 'ratingAfter'>, opponentRating?: number) => void;
  reset: () => void;
}

const randomName = () => {
  const a = ['Iron', 'Bronze', 'Crimson', 'Silent', 'Golden', 'Storm', 'Ashen', 'Lion'];
  const b = ['Strategos', 'Satrap', 'Hoplite', 'Archon', 'Immortal', 'Tribune', 'Warden', 'Marshal'];
  return `${a[Math.floor(Math.random() * a.length)]} ${b[Math.floor(Math.random() * b.length)]}`;
};

/** Standard Elo update. */
export const elo = (mine: number, theirs: number, score: number, k = 32) =>
  Math.round(mine + k * (score - 1 / (1 + 10 ** ((theirs - mine) / 400))));

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      name: randomName(),
      avatar: undefined,
      rating: 1200,
      history: [],
      stats: { wins: 0, losses: 0, draws: 0 },
      modeCounts: { ai: 0, online: 0, local: 0 },
      setName: (n) => set({ name: n.slice(0, 24) }),
      setAvatar: (a) => set({ avatar: a }),
      record: (r, opponentRating) =>
        set((s) => {
          const score = r.result === 'win' ? 1 : r.result === 'draw' ? 0.5 : 0;
          const rated = r.mode !== 'local' && opponentRating != null;
          const rating = rated ? elo(s.rating, opponentRating!, score) : s.rating;
          const rec: MatchRecord = { ...r, id: crypto.randomUUID(), date: Date.now(), ratingAfter: rated ? rating : undefined };
          return {
            rating,
            history: [rec, ...s.history].slice(0, 50),
            stats: {
              wins: s.stats.wins + (r.result === 'win' ? 1 : 0),
              losses: s.stats.losses + (r.result === 'loss' ? 1 : 0),
              draws: s.stats.draws + (r.result === 'draw' ? 1 : 0),
            },
            modeCounts: { ...s.modeCounts, [r.mode]: s.modeCounts[r.mode] + 1 },
          };
        }),
      reset: () => set({ rating: 1200, history: [], stats: { wins: 0, losses: 0, draws: 0 }, modeCounts: { ai: 0, online: 0, local: 0 } }),
    }),
    {
      name: 'awc-profile',
      version: 1,
      // Persist the generated guest name immediately so it stays stable across reloads and rematches.
      onRehydrateStorage: () => (state) => {
        try {
          if (state && typeof localStorage !== 'undefined' && !localStorage.getItem('awc-profile')) state.setName(state.name);
        } catch {
          /* storage unavailable */
        }
      },
    },
  ),
);

export const favouriteMode = (m: Record<GameMode, number>): GameMode | null => {
  const best = (Object.entries(m) as [GameMode, number][]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
};

/** Downscale an uploaded image to a 96px square JPEG data URL (keeps it small for the server). */
export async function fileToAvatar(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 96, 96);
  return c.toDataURL('image/jpeg', 0.8);
}
