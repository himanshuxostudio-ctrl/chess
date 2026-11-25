import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'low' | 'medium' | 'high';
/** The two armies. Sun = royal gold/ivory/crimson; Shadow = blackened iron/dark bronze/deep red. */
export type ArmyId = 'sun' | 'shadow';
/** Palette of the lightweight procedural ("classic") units used as fallback. */
export type ClassicArmy = 'hellenic' | 'persian';
export const classicArmy = (a: ArmyId): ClassicArmy => (a === 'sun' ? 'hellenic' : 'persian');
export const ARMY_NAME: Record<ArmyId, string> = { sun: 'Sun Army', shadow: 'Shadow Army' };
export const armyOf = (color: 'w' | 'b', whiteArmy: ArmyId): ArmyId =>
  color === 'w' ? whiteArmy : whiteArmy === 'sun' ? 'shadow' : 'sun';
export type UnitModels = 'detailed' | 'classic';

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
  /** Which army commands the White pieces. */
  whiteArmy: ArmyId;
  /** Rigged GLB army characters, or the lightweight procedural units. */
  unitModels: UnitModels;
  set: (patch: Partial<Omit<Settings, 'set' | 'setVolume'>>) => void;
  setVolume: (k: keyof Settings['volumes'], v: number) => void;
}

const defaultQuality = (): Quality => {
  // Node (tests, tooling) defines `navigator` but not `window`: only probe in a real browser.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'high';
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
      whiteArmy: 'sun',
      unitModels: 'detailed',
      set: (patch) => set(patch),
      setVolume: (k, v) => set((s) => ({ volumes: { ...s.volumes, [k]: v } })),
    }),
    {
      name: 'awc-settings',
      version: 2,
      // v1 stored 'hellenic' | 'persian' as the White army
      migrate: (old, version) => {
        const s = (old ?? {}) as Record<string, unknown>;
        if (version < 2) {
          s.whiteArmy = s.whiteArmy === 'persian' ? 'shadow' : 'sun';
          s.unitModels = 'detailed';
        }
        return s as unknown as Settings;
      },
    },
  ),
);
