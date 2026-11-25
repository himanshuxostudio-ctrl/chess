/** Shadow Kingdom: obsidian obelisks with glowing crimson runes, jagged rock and a spired citadel under a moonlit sky. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArenaTheme } from '../themes';
import type { Quality } from '../../../config/settings';
import { Instances, Obelisks, ring, useStone, type Placement } from './shared';
import { Banner, Torch } from '../parts';

function Citadel({ position, stone, glow }: { position: [number, number, number]; stone: THREE.Material; glow: THREE.Material }) {
  const spires = useMemo(
    () =>
      [
        [0, 26, 2.2],
        [-5, 18, 1.6],
        [5, 19, 1.6],
        [-9, 12, 1.3],
        [9, 13, 1.3],
        [-2.5, 14, 1.1],
        [2.6, 15, 1.1],
      ] as const,
    [],
  );
  return (
    <group position={position}>
      <mesh material={stone} position={[0, 3, 0]}>
        <boxGeometry args={[24, 6, 6]} />
      </mesh>
      {spires.map(([x, h, r], i) => (
        <group key={i} position={[x, 0, (i % 2) * 2 - 1]}>
          <mesh material={stone} position={[0, h / 2, 0]}>
            <cylinderGeometry args={[r * 0.55, r, h, 6]} />
          </mesh>
          <mesh material={stone} position={[0, h + 2.2, 0]}>
            <coneGeometry args={[r * 0.75, 4.4, 6]} />
          </mesh>
          <mesh material={glow} position={[0, h * 0.7, r * 0.8]}>
            <boxGeometry args={[0.35, 1.2, 0.1]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function ShadowKingdom({ theme, quality }: { theme: ArenaTheme; quality: Quality }) {
  const obsidian = useStone(theme.stone, 0.35, 0.25);
  const rune = useMemo(() => new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false }), [theme.accent]);
  const rock = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1f1a1e', roughness: 0.95, flatShading: true }), []);
  const lo = quality === 'low';
  const obelisks = useMemo(() => ring(12.6, 22, 0.15, (i) => 4.2 + (i % 3) * 1.1), []);
  const runes = useMemo<Placement[]>(() => obelisks.map((p) => ({ ...p, h: 1 })), [obelisks]);
  const spikes = useMemo<Placement[]>(() => {
    const out: Placement[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + (i % 4) * 0.04;
      if (Math.abs(Math.cos(a)) > 0.85) continue;
      const r = 17 + ((i * 7) % 6);
      out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: 2 + ((i * 13) % 7), tilt: ((i % 3) - 1) * 0.18, rotY: i, s: 0.8 + (i % 3) * 0.3 });
    }
    return out;
  }, []);
  const spikeGeo = useMemo(() => new THREE.ConeGeometry(0.9, 1, 5).translate(0, 0.5, 0), []);
  const runeGeo = useMemo(() => new THREE.BoxGeometry(0.08, 1.6, 0.04), []);
  // pulsing runes
  const pulse = useRef(0);
  useFrame(({ clock }) => {
    pulse.current = 0.65 + Math.sin(clock.elapsedTime * 1.6) * 0.35;
    rune.color.set(theme.accent).multiplyScalar(0.6 + pulse.current * 0.8);
  });
  return (
    <group>
      <Obelisks items={obelisks} material={obsidian} tipMaterial={rune} />
      {/* rune strips on the obelisk faces that look towards the board */}
      <Instances
        items={runes.map((p) => ({ ...p, x: p.x * 0.973, z: p.z * 0.973, rotY: Math.atan2(p.x, p.z) }))}
        geometry={runeGeo}
        material={rune}
        yOffset={1.6}
        scaleY={false}
        cast={false}
      />
      {!lo && <Instances items={spikes} geometry={spikeGeo} material={rock} yOffset={-0.5} />}
      <Citadel position={[0, -1, -52]} stone={obsidian} glow={rune} />
      {!lo && <Citadel position={[38, -1, 30]} stone={obsidian} glow={rune} />}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Banner position={[side * 9.8, -0.35, -3.5]} army="shadow" rot={side > 0 ? -Math.PI / 2 : Math.PI / 2} scale={1.3} />
          <Banner position={[side * 9.8, -0.35, 3.5]} army="shadow" rot={side > 0 ? -Math.PI / 2 : Math.PI / 2} scale={1.3} />
          {!lo && <Torch theme={theme} position={[side * 10.8, -0.35, 0]} light={quality === 'high'} tall={1.6} />}
        </group>
      ))}
    </group>
  );
}
