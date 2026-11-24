/**
 * Production asset checks for the 12 rigged army GLBs (public/assets/chess-pieces).
 * Parses the binary glTF directly (no renderer needed) and verifies structure, skinning,
 * animation completeness, texture budget and placement conventions against the manifest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'public/assets/chess-pieces';
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

type Gltf = {
  json: any;
  bin: Buffer;
};

function loadGlb(file: string): Gltf {
  const b = readFileSync(file);
  expect(b.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const binStart = 20 + jsonLen + 8;
  return { json, bin: b.subarray(binStart) };
}

function accessorData(g: Gltf, idx: number): { count: number; comps: number; read: (i: number, c: number) => number } {
  const a = g.json.accessors[idx];
  const bv = g.json.bufferViews[a.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as string]!;
  const size = { 5126: 4, 5123: 2, 5121: 1, 5125: 4 }[a.componentType as number]!;
  const stride = bv.byteStride ?? comps * size;
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const read = (i: number, c: number) => {
    const o = base + i * stride + c * size;
    switch (a.componentType) {
      case 5126: return g.bin.readFloatLE(o);
      case 5123: return g.bin.readUInt16LE(o) / (a.normalized ? 65535 : 1);
      case 5121: return g.bin.readUInt8(o) / (a.normalized ? 255 : 1);
      default: return g.bin.readUInt32LE(o);
    }
  };
  return { count: a.count, comps, read };
}

function webpSize(buf: Buffer): [number, number] {
  // RIFF....WEBP VP8 /VP8L/VP8X
  const fourcc = buf.subarray(12, 16).toString();
  if (fourcc === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (fourcc === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

const EXPECTED_CLIPS: Record<string, string[]> = {
  humanoid: ['Idle', 'Walk', 'Attack', 'Hit', 'Death', 'Victory', 'Defend'],
  'horse+rider': ['Idle', 'Walk', 'Gallop', 'Attack', 'Hit', 'Death', 'Victory'],
  'elephant+howdah': ['Idle', 'Walk', 'Attack', 'Hit', 'Death', 'Victory'],
};

describe('army assets', () => {
  const entries = Object.entries(manifest.pieces) as [string, any][];

  it('has all 12 pieces: 6 per army, no duplicates', () => {
    expect(entries).toHaveLength(12);
    for (const army of ['sun', 'shadow'])
      expect(entries.filter(([, p]) => p.army === army).map(([, p]) => p.piece).sort()).toEqual(
        ['bishop', 'king', 'knight', 'pawn', 'queen', 'rook'],
      );
    expect(new Set(entries.map(([, p]) => p.file)).size).toBe(12);
  });

  for (const [key, p] of entries) {
    describe(key, () => {
      const file = join('public', p.file);
      it('exists and stays within the 3.5 MB budget', () => {
        expect(existsSync(file)).toBe(true);
        expect(readFileSync(file).length).toBeLessThan(3.5 * 1048576);
      });

      const g = existsSync(file) ? loadGlb(file) : null;

      it('one skinned mesh with one skeleton (no stray source meshes)', () => {
        expect(g!.json.meshes).toHaveLength(1);
        expect(g!.json.skins).toHaveLength(1);
        expect(g!.json.skins[0].joints.length).toBe(p.joints);
        const prim = g!.json.meshes[0].primitives[0];
        expect(prim.attributes.JOINTS_0).toBeDefined();
        expect(prim.attributes.WEIGHTS_0).toBeDefined();
        expect(prim.attributes.JOINTS_1).toBeUndefined(); // ≤ 4 influences
      });

      it('skin weights are normalised', () => {
        const prim = g!.json.meshes[0].primitives[0];
        const w = accessorData(g!, prim.attributes.WEIGHTS_0);
        let worst = 0;
        for (let i = 0; i < w.count; i += 7) {
          let s = 0;
          for (let c = 0; c < 4; c++) s += w.read(i, c);
          worst = Math.max(worst, Math.abs(1 - s));
        }
        expect(worst).toBeLessThan(0.02);
      });

      it('has the full clip set, each animating every joint', () => {
        const names = g!.json.animations.map((a: any) => a.name);
        expect(names).toEqual(EXPECTED_CLIPS[p.skeleton]);
        const joints = new Set(g!.json.skins[0].joints);
        for (const a of g!.json.animations) {
          const rotated = new Set(a.channels.filter((c: any) => c.target.path === 'rotation').map((c: any) => c.target.node));
          for (const j of joints) expect(rotated.has(j), `${a.name} joint ${j}`).toBe(true);
          expect(p.clips[a.name].seconds).toBeGreaterThan(0.3);
        }
      });

      it('textures: base colour, metal-roughness, normal — WebP, ≤1024²', () => {
        const m = g!.json.materials[0];
        expect(m.pbrMetallicRoughness.baseColorTexture).toBeDefined();
        expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
        expect(m.normalTexture).toBeDefined();
        expect(g!.json.images).toHaveLength(3);
        for (const img of g!.json.images) {
          expect(img.mimeType).toBe('image/webp');
          const bv = g!.json.bufferViews[img.bufferView];
          const [w, h] = webpSize(g!.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
          expect(Math.max(w, h)).toBeLessThanOrEqual(1024);
        }
      });

      it('stands on the ground, centred, at the source height', () => {
        const pos = g!.json.accessors[g!.json.meshes[0].primitives[0].attributes.POSITION];
        expect(Math.abs(pos.min[1])).toBeLessThan(0.01); // feet / hooves on y = 0
        expect(pos.max[1] - pos.min[1]).toBeCloseTo(p.sourceHeight, 2);
        // board-scaled footprint must fit inside one square
        expect(Math.max(p.footprint.x, p.footprint.z) * p.scale).toBeLessThan(1.0);
      });
    });
  }
});
