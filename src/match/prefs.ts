/** Last-used match preparation choices (per device), so starting a match takes seconds. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BattlefieldChoice } from '../../shared/match';
import type { TimeControl } from '../../shared/protocol';

export type OpponentKind = 'random' | 'friend' | 'code' | 'ai' | 'local';
export type SideChoice = 'sun' | 'shadow' | 'random';

export interface MatchPrefs {
  opponent: OpponentKind;
  side: SideChoice;
  timeControl: TimeControl;
  battlefield: BattlefieldChoice;
  rated: boolean;
  allowSpectators: boolean;
  allowRematch: boolean;
  aiLevel: number;
  set: (p: Partial<Omit<MatchPrefs, 'set'>>) => void;
}

export const useMatchPrefs = create<MatchPrefs>()(
  persist(
    (set) => ({
      opponent: 'ai',
      side: 'sun',
      timeControl: { initial: 600, increment: 0 },
      battlefield: 'random',
      rated: true,
      allowSpectators: true,
      allowRematch: true,
      aiLevel: 3,
      set: (p) => set(p),
    }),
    { name: 'awc-match-prefs', version: 1 },
  ),
);

/** Sun commands White (moves first), Shadow commands Black — the same for every player and spectator. */
export const sideToColor = (side: SideChoice): 'w' | 'b' | 'random' => (side === 'sun' ? 'w' : side === 'shadow' ? 'b' : 'random');

/**
 * Base URL for invitation links. Set VITE_PUBLIC_URL at build time when the game is served from
 * a different public address than the page (e.g. local testing against a deployed server).
 */
export function inviteBase(): string {
  const env = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/+$/, '');
  return env || location.origin;
}
export const isLocalOnlyLink = () => /^(https?:\/\/)?(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(inviteBase());
