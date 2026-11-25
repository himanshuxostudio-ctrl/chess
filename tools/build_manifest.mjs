// Builds public/assets/chess-pieces/manifest.json from the exported GLBs.
// Run after exporting from Blender:  node tools/build_manifest.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'public/assets/chess-pieces';
// Target height on the board (1 square = 1 unit). Rooks are kept lower so the elephant's
// length (≈ its height) fits inside one square.
const BOARD_HEIGHT = { King: 1.0, Queen: 0.92, Bishop: 0.86, Knight: 0.95, Rook: 0.86, Pawn: 0.72 };
const LOOPING = new Set(['Idle', 'Walk', 'Gallop', 'Defend']);

const out = {
  version: 1,
  conventions: {
    forward: '+Z (glTF)', up: '+Y', pivot: 'ground (y=0) under the body centre',
    units: 'source metres; multiply by `scale` for board units (1 square = 1)',
    clips: 'every clip keys every joint, so cross-fading never leaves a bone in a stale pose',
  },
  pieces: {},
};

for (const army of ['sun', 'shadow']) {
  for (const [piece, boardHeight] of Object.entries(BOARD_HEIGHT)) {
    const dir = join(ROOT, army, piece.toLowerCase());
    const file = readdirSync(dir).find((f) => f.endsWith('.glb'));
    const buf = readFileSync(join(dir, file));
    const jsonLen = buf.readUInt32LE(12);
    const j = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
    const pos = j.accessors[j.meshes[0].primitives[0].attributes.POSITION];
    const height = pos.max[1] - pos.min[1];
    const clips = {};
    for (const a of j.animations) {
      const seconds = Math.max(...a.samplers.map((s) => j.accessors[s.input].max[0]));
      clips[a.name] = { seconds: +seconds.toFixed(3), loop: LOOPING.has(a.name) };
    }
    out.pieces[`${army}_${piece.toLowerCase()}`] = {
      army, piece: piece.toLowerCase(),
      file: `/assets/chess-pieces/${army}/${piece.toLowerCase()}/${file}`,
      bytes: buf.length,
      skeleton: piece === 'Knight' ? 'horse+rider' : piece === 'Rook' ? 'elephant+howdah' : 'humanoid',
      joints: j.skins[0].joints.length,
      clips,
      sourceHeight: +height.toFixed(3),
      footprint: { x: +(pos.max[0] - pos.min[0]).toFixed(3), z: +(pos.max[2] - pos.min[2]).toFixed(3) },
      scale: +(boardHeight / height).toFixed(4),
      boardHeight,
      material: `${army.toUpperCase()}_${piece}_MAT`,
    };
  }
}
writeFileSync(join(ROOT, 'manifest.json'), JSON.stringify(out, null, 2) + '\n');
for (const [k, v] of Object.entries(out.pieces))
  console.log(`${k.padEnd(14)} ${(v.bytes / 1048576).toFixed(2)} MB  scale ${v.scale}  footprint ${(Math.max(v.footprint.x, v.footprint.z) * v.scale).toFixed(2)} sq`);
