/**
 * Eclipse Battlefield — the original arena, kept as the combined realm: a broken Sun colonnade on
 * White's half, Shadow obelisks rising on Black's half, hilltop fortresses, under an eclipsed sun.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { ArenaTheme } from '../themes';
import type { Quality } from '../../../config/settings';
import { Columns, Obelisks, ring, useStone, type Placement } from './shared';

function Fortress({ position, rot, material }: { position: [number, number, number]; rot: number; material: THREE.Material }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh material={material} position={[0, 2, 0]}>
        <boxGeometry args={[16, 4, 3]} />
      </mesh>
      {[-8, -3, 3, 8].map((x) => (
        <mesh key={x} material={material} position={[x, 3.5, 0]}>
          <cylinderGeometry args={[1.2, 1.4, 7, 8]} />
        </mesh>
      ))}
      <mesh material={material} position={[0, 6, 0]}>
        <boxGeometry args={[4, 8, 4]} />
      </mesh>
    </group>
  );
}

export default function Eclipse({ theme, quality }: { theme: ArenaTheme; quality: Quality }) {
  const stone = useStone(theme.stone);
  const obsidian = useStone('#2f2a30', 0.4, 0.2);
  const ember = useMemo(() => new THREE.MeshBasicMaterial({ color: '#c3241c', toneMapped: false }), []);
  const far = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5d5149', roughness: 0.95 }), []);
  const lo = quality === 'low';
  // broken columns on White's half (z > 0) and on the flanks
  const columns = useMemo<Placement[]>(() => {
    const out: Placement[] = [];
    const add = (r: number, n: number, offset: number) =>
      ring(r, n, offset, (i) => ((i * 7) % 3 === 0 ? 1 + ((i * 13) % 5) * 0.4 : 4.2)).forEach((p, i) => {
        if (p.z < -3) return; // Black's half belongs to the obelisks
        const broken = p.h < 4;
        out.push({ ...p, rotY: 0, tilt: broken ? ((i % 2) - 0.5) * 0.15 : 0 });
      });
    add(8.5, 22, 0.1);
    if (!lo) add(15, 26, 0.3);
    return out;
  }, [lo]);
  const obelisks = useMemo(() => ring(12.6, 22, 0.2, (i) => 3.8 + (i % 3) * 0.9, (a) => Math.sin(a) < -0.3), []);
  const drum = useMemo(() => new THREE.CylinderGeometry(0.35, 0.35, 1.1, 14), []);
  return (
    <group>
      <Columns items={columns} material={stone} />
      <Obelisks items={obelisks} material={obsidian} tipMaterial={ember} />
      {/* fallen drums */}
      {[[-6.2, 5.2, 0.4], [6.6, -5.4, 1.2], [-7.1, -4.1, 2.2], [7.4, 3.6, 0.9]].map(([x, z, r], i) => (
        <mesh key={i} geometry={drum} position={[x, -0.05, z]} rotation={[0, r, Math.PI / 2]} material={stone} castShadow receiveShadow />
      ))}
      <Fortress position={[0, -1, -48]} rot={0} material={far} />
      {!lo && <Fortress position={[-20, -1, 52]} rot={Math.PI + 0.3} material={far} />}
    </group>
  );
}
