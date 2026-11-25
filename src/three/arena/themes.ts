/**
 * Battlefield themes — pure data (no three.js import) so they can be unit-tested and so adding an
 * arena means adding one entry here plus, optionally, a set-piece module in ./sets.
 *
 * Rules every theme must respect (checked by tests/arena.test.ts):
 *  - board square colours keep a strong light/dark contrast and stay distinct from move highlights;
 *  - nothing here changes board geometry or coordinates — squares are placed by sqToXZ only.
 */
import type { BattlefieldId } from '../../../shared/match';

export type Vec3 = [number, number, number];
export type ArchitectureKind = 'colonnade' | 'obelisks' | 'ruins' | 'walls';
export type ParticleKind = 'motes' | 'embers' | 'ash' | 'dust';

export interface ArenaTheme {
  id: BattlefieldId;
  name: string;
  sky: {
    top: string;
    mid: string;
    low: string;
    /** Direction towards the sun / moon. */
    sunDir: Vec3;
    sunColor: string;
    /** Angular size of the disc (radians). */
    sunSize: number;
    glow: number;
    eclipse?: boolean;
    stars?: number;
  };
  fog: { color: string; near: number; far: number };
  light: {
    hemiSky: string;
    hemiGround: string;
    hemi: number;
    ambient: number;
    key: { pos: Vec3; color: string; intensity: number };
    rim: { pos: Vec3; color: string; intensity: number };
    exposure: number;
    envIntensity: number;
  };
  ground: { base: string; patchA: string; patchB: string; tint: string; hills: number };
  board: {
    light: { base: string; vein: string };
    dark: { base: string; vein: string };
    frame: string;
    /** Optional metallic inlay strip around the playing area. */
    trim?: string;
  };
  architecture: ArchitectureKind;
  stone: string;
  accent: string;
  mountains: string;
  /** Which banners fly: the two sides (Sun near White, Shadow near Black) or one kingdom's colours everywhere. */
  banners: 'sides' | 'sun' | 'shadow';
  torch: { flame: string; core: string; light: string };
  particles: { kind: ParticleKind; color: string; density: number };
  ambience: AmbienceProfile;
}

export interface AmbienceProfile {
  /** Centre frequency of the wind band (Hz). */
  wind: number;
  windGain: number;
  /** Low drone (Hz), 0 = none. */
  drone: number;
  droneGain: number;
  drums: 'distant' | 'war' | 'none';
  crackle: number;
}

export const ARENA_THEMES: Record<BattlefieldId, ArenaTheme> = {
  sun: {
    id: 'sun',
    name: 'Sun Kingdom',
    sky: { top: '#3d6fa8', mid: '#e8b56a', low: '#ffd79a', sunDir: [-0.45, 0.32, -0.83], sunColor: '#fff1c2', sunSize: 0.05, glow: 1.1 },
    fog: { color: '#e2b98a', near: 26, far: 140 },
    light: {
      hemiSky: '#fff0d0', hemiGround: '#7a5a34', hemi: 1.25, ambient: 0.3,
      key: { pos: [-8, 13, -7], color: '#ffe2b0', intensity: 3.8 },
      rim: { pos: [8, 5, 9], color: '#ffd9a0', intensity: 0.5 },
      exposure: 1.15, envIntensity: 0.55,
    },
    ground: { base: '#b08f5c', patchA: 'rgba(196,160,96,0.35)', patchB: 'rgba(150,118,70,0.3)', tint: '#d9c08f', hills: 1 },
    board: {
      light: { base: '#eadcbc', vein: '#b8924f' },
      dark: { base: '#5c4330', vein: '#c09452' },
      frame: '#d8c6a0',
      trim: '#d4a845',
    },
    architecture: 'colonnade',
    stone: '#efe4cc',
    accent: '#d4a845',
    mountains: '#b58a62',
    banners: 'sun',
    torch: { flame: '#ffc04a', core: '#fff4c8', light: '#ffb347' },
    particles: { kind: 'motes', color: '#ffd77a', density: 1 },
    ambience: { wind: 650, windGain: 0.12, drone: 0, droneGain: 0, drums: 'distant', crackle: 0.2 },
  },
  shadow: {
    id: 'shadow',
    name: 'Shadow Kingdom',
    sky: { top: '#07060d', mid: '#241729', low: '#5a1f22', sunDir: [0.5, 0.42, -0.75], sunColor: '#e9e2ff', sunSize: 0.035, glow: 0.45, stars: 1 },
    fog: { color: '#2a1a22', near: 18, far: 95 },
    light: {
      hemiSky: '#8f86b8', hemiGround: '#2a1012', hemi: 0.75, ambient: 0.22,
      key: { pos: [7, 12, -8], color: '#c9c4ff', intensity: 2.2 },
      rim: { pos: [-7, 4, 8], color: '#ff6a50', intensity: 0.45 },
      exposure: 1.3, envIntensity: 0.6,
    },
    ground: { base: '#2c2629', patchA: 'rgba(80,20,24,0.3)', patchB: 'rgba(20,18,22,0.45)', tint: '#6e6268', hills: 1.4 },
    board: {
      light: { base: '#c8c2bd', vein: '#6f6670' },
      dark: { base: '#2b2328', vein: '#8a2a2a' },
      frame: '#3c3539',
      trim: '#8a1f1c',
    },
    architecture: 'obelisks',
    stone: '#2f2a30',
    accent: '#c3241c',
    mountains: '#1b1619',
    banners: 'shadow',
    torch: { flame: '#ff4a26', core: '#ffb08a', light: '#ff3a1c' },
    particles: { kind: 'embers', color: '#ff5a2a', density: 1 },
    ambience: { wind: 320, windGain: 0.16, drone: 55, droneGain: 0.05, drums: 'war', crackle: 0.5 },
  },
  eclipse: {
    id: 'eclipse',
    name: 'Eclipse Battlefield',
    sky: { top: '#1b1830', mid: '#7b4a46', low: '#d98a4a', sunDir: [-0.6, 0.3, -0.74], sunColor: '#ffe0a0', sunSize: 0.06, glow: 0.9, eclipse: true, stars: 0.35 },
    fog: { color: '#6e5050', near: 22, far: 120 },
    light: {
      hemiSky: '#ffd8c0', hemiGround: '#3a2c2c', hemi: 1.0, ambient: 0.25,
      key: { pos: [-9, 11, -6], color: '#ffc89a', intensity: 3.0 },
      rim: { pos: [8, 5, 9], color: '#9a8cff', intensity: 0.7 },
      exposure: 1.2, envIntensity: 0.45,
    },
    ground: { base: '#5b4a3a', patchA: 'rgba(70,80,40,0.3)', patchB: 'rgba(90,60,70,0.3)', tint: '#9a8a78', hills: 1 },
    board: {
      light: { base: '#d9ccb0', vein: '#8d7b5c' },
      dark: { base: '#4b3f33', vein: '#a08664' },
      frame: '#a89880',
    },
    architecture: 'ruins',
    stone: '#cbbd9f',
    accent: '#c9a25a',
    mountains: '#4a4048',
    banners: 'sides',
    torch: { flame: '#ffae42', core: '#fff0b0', light: '#ff9a3c' },
    particles: { kind: 'ash', color: '#d8c8c0', density: 1 },
    ambience: { wind: 500, windGain: 0.18, drone: 82, droneGain: 0.03, drums: 'distant', crackle: 0.3 },
  },
  fortress: {
    id: 'fortress',
    name: 'Ancient Fortress',
    sky: { top: '#4f6178', mid: '#9aa3a8', low: '#c9bfa8', sunDir: [-0.3, 0.55, -0.78], sunColor: '#fff6dc', sunSize: 0.04, glow: 0.5 },
    fog: { color: '#a59f94', near: 24, far: 115 },
    light: {
      hemiSky: '#e6ecf2', hemiGround: '#5a5044', hemi: 1.2, ambient: 0.3,
      key: { pos: [-6, 14, -8], color: '#fff2dc', intensity: 3.2 },
      rim: { pos: [8, 6, 9], color: '#b8c8e0', intensity: 0.6 },
      exposure: 1.1, envIntensity: 0.5,
    },
    ground: { base: '#6e6250', patchA: 'rgba(90,100,60,0.3)', patchB: 'rgba(120,105,85,0.3)', tint: '#a89a84', hills: 0.6 },
    board: {
      light: { base: '#d3c4a2', vein: '#8c7a58' },
      dark: { base: '#454b52', vein: '#7d8590' },
      frame: '#8f8578',
    },
    architecture: 'walls',
    stone: '#a39785',
    accent: '#7a5a3a',
    mountains: '#5d6470',
    banners: 'sides',
    torch: { flame: '#ffb24a', core: '#fff2c0', light: '#ffa040' },
    particles: { kind: 'dust', color: '#e6d6b8', density: 1 },
    ambience: { wind: 420, windGain: 0.2, drone: 0, droneGain: 0, drums: 'war', crackle: 0.25 },
  },
};

export const arenaTheme = (id: BattlefieldId | undefined) => ARENA_THEMES[id ?? 'eclipse'] ?? ARENA_THEMES.eclipse;

// ---------- colour helpers (used by tests and the board) ----------
const hex = (c: string) => {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
};
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const luminance = (c: string) => {
  const [r, g, b] = hex(c).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
