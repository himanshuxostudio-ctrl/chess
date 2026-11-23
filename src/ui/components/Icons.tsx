/** Hand-drawn SVG glyphs for units and UI controls (stroke/fill use currentColor). */
import type { PieceSymbol } from 'chess.js';

type P = { className?: string; title?: string };

export const UnitGlyph = ({ type, className, title }: P & { type: PieceSymbol }) => {
  const paths: Record<PieceSymbol, React.ReactNode> = {
    // crested helmet — infantry
    p: <path d="M12 3c-4 0-7 3-7 7v6h3v-4h2v6h4v-6h2v4h3v-6c0-4-3-7-7-7zM11 1h2v3h-2z" />,
    // horse head — cavalry
    n: <path d="M7 21h11l-1-7c-.5-3-2-5-2-5l2-3-3 1c-1-2-3-3-5-3l1 2-4 4c-1 1-1 3 0 3l2-1 1 2-2 7z" />,
    // chariot wheel — war chariot
    r: (
      <>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="2.4" />
      </>
    ),
    // staff with orb — war priest
    b: (
      <>
        <circle cx="12" cy="5" r="3" />
        <path d="M11 8h2v14h-2zM8 10h8v2H8z" />
      </>
    ),
    // diadem — empress
    q: <path d="M3 18h18l-1 3H4zM3 8l4 4 2-6 3 5 3-5 2 6 4-4-2 9H5z" />,
    // tall crown with sword — commander
    k: <path d="M11 1h2v3h3v2h-3v2l3 2 2-3 2 2-2 9H6L4 9l2-2 2 3 3-2V6H8V4h3zM5 20h14v3H5z" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className={className} role="img" aria-label={title ?? UNIT_NAMES[type]}>
      {paths[type]}
    </svg>
  );
};

export const UNIT_NAMES: Record<PieceSymbol, string> = {
  p: 'Infantry',
  n: 'Cavalry',
  b: 'War Priest',
  r: 'War Chariot',
  q: 'Warrior Empress',
  k: 'Supreme Commander',
};

const I = (d: string) => ({ className }: P) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden style={{ flex: 'none', verticalAlign: 'middle' }}>
    <path d={d} />
  </svg>
);
export const Icon = {
  settings: I('M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'),
  camera: I('M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 8v4l3 2'),
  top: I('M4 4h16v16H4zM4 12h16M12 4v16'),
  film: I('M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4'),
  rotate: I('M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5'),
  list: I('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'),
  user: I('M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z'),
  back: I('M15 18l-6-6 6-6'),
  copy: I('M9 9h11v11H9zM5 15H4V4h11v1'),
  sound: I('M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14'),
  mute: I('M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6'),
  flag: I('M4 22V4M4 4h13l-2 4 2 4H4'),
  handshake: I('M8 12l3 3 6-6M3 12l4-4 4 2 4-2 6 4-6 6-4-1-4 1z'),
  undo: I('M3 7v6h6M3 13a9 9 0 103-7.7L3 7'),
  download: I('M12 3v12M7 10l5 5 5-5M5 21h14'),
  share: I('M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4'),
  eye: I('M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z'),
};

export const Crest = ({ className }: P) => (
  <svg viewBox="0 0 64 64" width="84" height="84" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M32 4l22 8v18c0 14-10 24-22 30C20 54 10 44 10 30V12z" />
    <path d="M32 14l4 8h8l-6 6 2 9-8-5-8 5 2-9-6-6h8z" fill="currentColor" stroke="none" />
  </svg>
);

export const Logo = ({ className }: P) => (
  <svg viewBox="0 0 64 64" width="30" height="30" className={className}>
    <path d="M32 6l6 10h-4v6h8v6h-8v14h8l4 10H18l4-10h8V28h-8v-6h8v-6h-4z" fill="#d4a93a" />
  </svg>
);

export const ModeGlyph = {
  ai: (p: P) => (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" className={p.className}>
      <path d="M32 6c-12 0-20 9-20 20v14h10v-10h20v10h10V26C52 15 44 6 32 6z" />
      <path d="M22 30h20M26 22h2M36 22h2M24 50h16M32 40v16" />
    </svg>
  ),
  friend: (p: P) => (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" className={p.className}>
      <path d="M8 50l18-18M56 50L38 32M20 20l-8-8M44 20l8-8M14 46l4 4M50 46l-4 4" />
      <circle cx="32" cy="16" r="6" />
      <path d="M22 58h20" />
    </svg>
  ),
  local: (p: P) => (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" className={p.className}>
      <rect x="16" y="6" width="32" height="52" rx="4" />
      <path d="M28 52h8M22 20h20v20H22zM32 20v20M22 30h20" />
    </svg>
  ),
  spectate: (p: P) => (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.2" className={p.className}>
      <path d="M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z" />
      <circle cx="32" cy="32" r="8" />
    </svg>
  ),
};
