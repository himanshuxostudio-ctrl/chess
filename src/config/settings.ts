import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'low' | 'medium' | 'high';
export type ArmyId = 'hellenic' | 'persian';

export interface Settings {
  quality: Quality;
  combatAnimations: boolean;
  cinematicCamera: boolean;
  fixedCamera: boolean;
  soundOn: boolean;
  volumes: { master: number; music: number; environment: number; combat: number; ui: number };
  cameraSensitivity: number; // 0.3 .. 2
  animationSpeed: number; // 0.5 .. 2
  showHints: boolean;
  autoRotateBoard: boolean; // pass & play: rotate view to side to move
  /** Which army skin commands the White pieces. */
  whiteArmy: ArmyId;
  set: (patch: Partial<Omit<Settings, 'set' | 'setVolume'>>) => void;
  setVolume: (k: keyof Settings['volumes'], v: number) => void;
}

const defaultQuality = (): Quality => {
  if (typeof navigator === 'undefined') return 'high';
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia?.('(pointer: coarse)').matches;
  return mobile ? 'low' : 'high';
};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      quality: defaultQuality(),
      combatAnimations: true,
      cinematicCamera: true,
      fixedCamera: false,
      soundOn: true,
      volumes: { master: 0.8, music: 0.5, environment: 0.5, combat: 0.8, ui: 0.6 },
      cameraSensitivity: 1,
      animationSpeed: 1,
      showHints: true,
      autoRotateBoard: true,
      whiteArmy: 'hellenic',
      set: (patch) => set(patch),
      setVolume: (k, v) => set((s) => ({ volumes: { ...s.volumes, [k]: v } })),
    }),
    { name: 'awc-settings', version: 1 },
  ),
);
