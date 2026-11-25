/**
 * Procedural PBR materials and canvas-generated textures (no external assets required).
 * Materials are shared per army for performance; dying units clone theirs to fade out.
 */
import * as THREE from 'three';
import type { ClassicArmy as ArmyId } from '../config/settings';

export interface ArmyMaterials {
  metal: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  cloak: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  shield: THREE.MeshStandardMaterial;
  horse: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  crests: THREE.MeshStandardMaterial[];
}

/** Value-noise canvas texture helper. */
function noiseCanvas(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

const speckle = (ctx: CanvasRenderingContext2D, s: number, n: number, alpha: number, light = false) => {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    const r = Math.random() * 2.2;
    ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
};

/** Subtle hammered-metal / woven-cloth grain shared by army materials. */
let grainTex: THREE.Texture | null = null;
const grain = () =>
  (grainTex ??= noiseCanvas(128, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 3000, 0.12);
    speckle(ctx, s, 1000, 0.15, true);
  }));

const cache = new Map<ArmyId, ArmyMaterials>();

export function armyMaterials(army: ArmyId): ArmyMaterials {
  const hit = cache.get(army);
  if (hit) return hit;
  const m = (color: string, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, map: grain(), ...extra });
  const mats: ArmyMaterials =
    army === 'hellenic'
      ? {
          metal: m('#c9a25a', 0.85, 0.32), // polished bronze
          trim: m('#e8c766', 1, 0.25),
          cloth: m('#efe7d2', 0, 0.85), // ivory linen
          cloak: m('#27498c', 0, 0.75, { side: THREE.DoubleSide }), // royal blue
          accent: m('#b52a1f', 0, 0.7), // red crest
          skin: m('#d6a982', 0, 0.65),
          leather: m('#7d5434', 0.05, 0.8),
          wood: m('#83603b', 0, 0.8),
          steel: m('#c9ced6', 0.9, 0.28),
          shield: m('#b8914e', 0.8, 0.38),
          horse: m('#e8e0d0', 0, 0.7), // white horses
          hair: m('#4a3423', 0, 0.9),
          glow: new THREE.MeshStandardMaterial({ color: '#9fd8ff', emissive: '#5cc8ff', emissiveIntensity: 2.2, roughness: 0.3 }),
          crests: [m('#b52a1f', 0, 0.7), m('#27498c', 0, 0.7), m('#efe7d2', 0, 0.8), m('#d8b04a', 0.4, 0.5)],
        }
      : {
          metal: m('#3d3a44', 0.85, 0.42), // blackened iron
          trim: m('#d4a93a', 1, 0.28), // gold
          cloth: m('#7a1424', 0, 0.8), // crimson
          cloak: m('#2b0f2d', 0, 0.75, { side: THREE.DoubleSide }), // deep purple-black
          accent: m('#d4a93a', 0.9, 0.3),
          skin: m('#a5735a', 0, 0.65),
          leather: m('#3b2a1f', 0.05, 0.8),
          wood: m('#4a3322', 0, 0.8),
          steel: m('#8a8e96', 0.9, 0.32),
          shield: m('#5a4325', 0.1, 0.85), // wicker & hide
          horse: m('#2c2420', 0, 0.65), // black horses
          hair: m('#141012', 0, 0.9),
          glow: new THREE.MeshStandardMaterial({ color: '#ffb36b', emissive: '#ff7b1c', emissiveIntensity: 2.4, roughness: 0.3 }),
          crests: [m('#1c1a22', 0, 0.8), m('#7a1424', 0, 0.8), m('#d4a93a', 0.8, 0.3), m('#3f2a52', 0, 0.8)],
        };
  cache.set(army, mats);
  return mats;
}

// ---------- environment textures ----------
export function marbleTexture(base: string, vein: string, seed = 1) {
  return noiseCanvas(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    let r = seed * 9301;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    // veins
    for (let v = 0; v < 6; v++) {
      ctx.strokeStyle = vein;
      ctx.globalAlpha = 0.15 + rnd() * 0.25;
      ctx.lineWidth = 0.5 + rnd() * 2;
      ctx.beginPath();
      let x = rnd() * s, y = 0;
      ctx.moveTo(x, y);
      while (y < s) {
        x += (rnd() - 0.5) * 30;
        y += 8 + rnd() * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    speckle(ctx, s, 2500, 0.18);
    speckle(ctx, s, 800, 0.12, true);
    // weathered edges
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    // cracks
    ctx.strokeStyle = 'rgba(20,15,10,0.45)';
    for (let i = 0; i < 2; i++) {
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let x = rnd() * s, y = rnd() * s;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 40;
        y += (rnd() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

export function groundTexture(base = '#5b4a33', patchA = 'rgba(70,80,40,0.35)', patchB = 'rgba(120,95,60,0.3)') {
  // patch colours are rgba() strings; each blot gets a random fraction of their alpha
  const withAlpha = (c: string, k: number) => c.replace(/,\s*([\d.]+)\)$/, (_, a) => `,${(Number(a) * k).toFixed(3)})`);
  const t = noiseCanvas(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const g = Math.random();
      ctx.fillStyle = withAlpha(g < 0.5 ? patchA : patchB, Math.random());
      const r = 4 + Math.random() * 22;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
    speckle(ctx, s, 9000, 0.25);
    speckle(ctx, s, 3000, 0.15, true);
  });
  t.repeat.set(14, 14);
  return t;
}

export function stoneTexture(base = '#7d715f') {
  const t = noiseCanvas(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    // block courses
    ctx.strokeStyle = 'rgba(30,25,18,0.6)';
    ctx.lineWidth = 2;
    for (let y = 0; y <= s; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
      for (let x = (y / 32) % 2 ? 0 : 32; x < s; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }
    speckle(ctx, s, 5000, 0.25);
    speckle(ctx, s, 1500, 0.15, true);
  });
  return t;
}

export function bannerTexture(army: ArmyId) {
  return noiseCanvas(128, (ctx, s) => {
    const hell = army === 'hellenic';
    ctx.fillStyle = hell ? '#8c1d18' : '#141114'; // Sun: royal crimson · Shadow: blackened
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = hell ? '#e8c766' : '#8a6a3a'; // gold · dark bronze
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, s - 12, s - 12);
    ctx.fillStyle = hell ? '#f0c95a' : '#9e1f1f'; // gold sun · deep-red disc
    ctx.translate(s / 2, s / 2);
    if (hell) {
      // stylised sun / star of the League
      for (let i = 0; i < 16; i++) {
        ctx.rotate(Math.PI / 8);
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(4, -40);
        ctx.lineTo(-4, -40);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // winged disc of the Immortals
      ctx.beginPath();
      ctx.arc(0, -6, 12, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(side > 0 ? 14 : -14 - (38 - i * 7), -10 + i * 6, 38 - i * 7, 4);
        }
      }
      ctx.fillRect(-4, 8, 8, 26);
    }
    speckle(ctx, s, 600, 0.25);
  });
}
