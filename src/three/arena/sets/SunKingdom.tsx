/** Sun Kingdom: gilded marble colonnade, golden sun monuments and a distant temple at golden hour. */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArenaTheme } from '../themes';
import type { Quality } from '../../../config/settings';
import { Columns, ring, useStone } from './shared';
import { Banner, Torch } from '../parts';

function SunDisc({ position, scale = 1, gold }: { position: [number, number, number]; scale?: number; gold: THREE.Material }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    ref.current.rotation.z = clock.elapsedTime * 0.15;
  });
  return (
    <group position={position} scale={scale}>
      <group ref={ref}>
        <mesh material={gold} castShadow>
          <cylinderGeometry args={[0.7, 0.7, 0.12, 32]} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} material={gold} rotation={[0, 0, (i / 12) * Math.PI * 2]} position={[Math.sin((i / 12) * Math.PI * 2) * -1.05, Math.cos((i / 12) * Math.PI * 2) * 1.05, 0]}>
            <coneGeometry args={[0.14, 0.6, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Temple({ position, marble, gold }: { position: [number, number, number]; marble: THREE.Material; gold: THREE.Material }) {
  const cols = useMemo(() => Array.from({ length: 8 }, (_, i) => -7 + i * 2), []);
  return (
    <group position={position}>
      {[0, 1, 2].map((s) => (
        <mesh key={s} material={marble} position={[0, s * 0.5, 0]} receiveShadow>
          <boxGeometry args={[18 - s * 1.2, 0.5, 9 - s * 1.2]} />
        </mesh>
      ))}
      {cols.map((x) => (
        <mesh key={x} material={marble} position={[x, 4.2, 3]}>
          <cylinderGeometry args={[0.45, 0.52, 6, 14]} />
        </mesh>
      ))}
      <mesh material={marble} position={[0, 4.2, -1]}>
        <boxGeometry args={[15, 6, 6]} />
      </mesh>
      <mesh material={marble} position={[0, 7.6, 0.5]}>
        <boxGeometry args={[16.5, 0.8, 8]} />
      </mesh>
      {/* pediment */}
      <mesh material={gold} position={[0, 9.1, 0.5]} rotation={[0, 0, 0]} scale={[8.6, 1.6, 4.1]}>
        <cylinderGeometry args={[0, 1, 1, 4, 1]} />
      </mesh>
    </group>
  );
}

export default function SunKingdom({ theme, quality }: { theme: ArenaTheme; quality: Quality }) {
  const marble = useStone(theme.stone, 0.45);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.accent, metalness: 0.95, roughness: 0.28 }), [theme.accent]);
  const inner = useMemo(() => ring(12.6, 30, 0.1, () => 5), []);
  const outer = useMemo(() => ring(18, 34, 0.3, (i) => (i % 5 === 0 ? 2.4 : 6)), []);
  const lo = quality === 'low';
  return (
    <group>
      <Columns items={inner} material={marble} capMaterial={gold} />
      {!lo && <Columns items={outer} material={marble} capMaterial={gold} radius={0.38} />}
      {/* golden sun monuments flanking each army's end */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 14, -0.35, 0]}>
          <mesh material={marble} position={[0, 1.2, 0]} castShadow>
            <boxGeometry args={[1.2, 2.4, 1.2]} />
          </mesh>
          <SunDisc position={[0, 3.6, 0]} gold={gold} />
        </group>
      ))}
      <Temple position={[0, -0.6, -46]} marble={marble} gold={gold} />
      {!lo && <Temple position={[-34, -1, 34]} marble={marble} gold={gold} />}
      {/* processional banners and braziers along the White approach */}
      {[-1, 1].map((side) => (
        <group key={`b${side}`}>
          <Banner position={[side * 9.6, -0.35, 4]} army="sun" rot={side > 0 ? -Math.PI / 2 : Math.PI / 2} scale={1.25} />
          <Banner position={[side * 9.6, -0.35, -4]} army="sun" rot={side > 0 ? -Math.PI / 2 : Math.PI / 2} scale={1.25} />
          {!lo && <Torch theme={theme} position={[side * 10.5, -0.35, 6.5]} light={false} tall={1.3} />}
          {!lo && <Torch theme={theme} position={[side * 10.5, -0.35, -6.5]} light={false} tall={1.3} />}
        </group>
      ))}
    </group>
  );
}
