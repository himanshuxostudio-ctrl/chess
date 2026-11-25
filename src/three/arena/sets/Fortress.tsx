/**
 * Ancient Fortress: the board sits in a walled courtyard — crenellated curtain walls, corner
 * towers, a gatehouse on Black's side, siege engines and supply crates — under an overcast sky.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { ArenaTheme } from '../themes';
import type { Quality } from '../../../config/settings';
import { Instances, useStone, type Placement } from './shared';
import { Torch } from '../parts';

const HALF = 13; // courtyard half-size
const WALL_H = 3.2;

function Catapult({ position, rot, wood, iron }: { position: [number, number, number]; rot: number; wood: THREE.Material; iron: THREE.Material }) {
  return (
    <group position={position} rotation={[0, rot, 0]}>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} material={wood} position={[x, 0.15, 0]} castShadow>
          <boxGeometry args={[0.18, 0.18, 2.4]} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((x) => (
        <mesh key={`u${x}`} material={wood} position={[x, 0.75, 0.2]} rotation={[0.35, 0, 0]} castShadow>
          <boxGeometry args={[0.14, 1.3, 0.14]} />
        </mesh>
      ))}
      <mesh material={wood} position={[0, 1.3, 0.45]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 1.4, 8]} />
      </mesh>
      <mesh material={wood} position={[0, 1.15, -0.4]} rotation={[-0.95, 0, 0]} castShadow>
        <boxGeometry args={[0.12, 0.12, 2.6]} />
      </mesh>
      <mesh material={iron} position={[0, 0.45, 0.85]}>
        <boxGeometry args={[0.55, 0.45, 0.45]} />
      </mesh>
      {[-1, 1].map((z) =>
        [-0.75, 0.75].map((x) => (
          <mesh key={`${x}${z}`} material={wood} position={[x, 0.22, z * 0.95]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.24, 0.24, 0.1, 12]} />
          </mesh>
        )),
      )}
    </group>
  );
}

export default function Fortress({ theme, quality }: { theme: ArenaTheme; quality: Quality }) {
  const stone = useStone(theme.stone, 0.92);
  const dark = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c1916', roughness: 1 }), []);
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.85 }), [theme.accent]);
  const iron = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3d3b38', metalness: 0.7, roughness: 0.5 }), []);
  const lo = quality === 'low';

  // walls: four sides, with a gap for the gatehouse on Black's side (z = -HALF)
  const wallGeo = useMemo(() => new THREE.BoxGeometry(1, WALL_H, 1.2).translate(0, WALL_H / 2, 0), []);
  const merlonGeo = useMemo(() => new THREE.BoxGeometry(0.6, 0.55, 1.2), []);
  const { walls, merlons } = useMemo(() => {
    const w: (Placement & { len: number })[] = [];
    const m: Placement[] = [];
    const seg = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rot = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      w.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, h: 1, rotY: rot, len });
      const n = Math.floor(len / 1.2);
      for (let i = 0; i <= n; i++) {
        const t = (i + 0.5) / (n + 1);
        m.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, h: 1, rotY: rot });
      }
    };
    seg(-HALF, HALF, HALF, HALF);
    seg(-HALF, -HALF, -HALF, HALF);
    seg(HALF, -HALF, HALF, HALF);
    seg(-HALF, -HALF, -2.6, -HALF);
    seg(2.6, -HALF, HALF, -HALF);
    return { walls: w, merlons: m };
  }, []);
  const towers = useMemo<[number, number][]>(() => [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]], []);
  const crates = useMemo<Placement[]>(
    () => [
      { x: -10.5, z: 9.6, h: 1, rotY: 0.2 },
      { x: -9.7, z: 10.4, h: 1, rotY: -0.3 },
      { x: -10.2, z: 10.1, h: 1, rotY: 0.6, s: 0.7 },
      { x: 10.4, z: -9.8, h: 1, rotY: 0.1 },
      { x: 9.6, z: -10.6, h: 1, rotY: 0.9 },
    ],
    [],
  );
  const crateGeo = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);

  return (
    <group position={[0, -0.35, 0]}>
      {walls.map((w, i) => (
        <mesh key={i} geometry={wallGeo} material={stone} position={[w.x, 0, w.z]} rotation={[0, w.rotY ?? 0, 0]} scale={[w.len, 1, 1]} castShadow receiveShadow />
      ))}
      <Instances items={merlons} geometry={merlonGeo} material={stone} yOffset={WALL_H + 0.27} scaleY={false} />
      {towers.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh material={stone} position={[0, 2.6, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.7, 1.9, 5.2, 14]} />
          </mesh>
          {Array.from({ length: 10 }, (_, k) => (
            <mesh key={k} material={stone} position={[Math.cos((k / 10) * Math.PI * 2) * 1.6, 5.45, Math.sin((k / 10) * Math.PI * 2) * 1.6]} rotation={[0, -(k / 10) * Math.PI * 2, 0]}>
              <boxGeometry args={[0.4, 0.5, 0.5]} />
            </mesh>
          ))}
          <mesh material={dark} position={[0, 3.2, 1.75]}>
            <boxGeometry args={[0.25, 0.8, 0.1]} />
          </mesh>
        </group>
      ))}
      {/* gatehouse on Black's side */}
      <group position={[0, 0, -HALF]}>
        {[-2.6, 2.6].map((x) => (
          <mesh key={x} material={stone} position={[x, 2.8, 0]} castShadow>
            <boxGeometry args={[1.6, 5.6, 2.4]} />
          </mesh>
        ))}
        <mesh material={stone} position={[0, 4.6, 0]} castShadow>
          <boxGeometry args={[3.6, 2, 2.4]} />
        </mesh>
        <mesh material={iron} position={[0, 1.8, 0]}>
          <boxGeometry args={[3.6, 3.6, 0.2]} />
        </mesh>
      </group>
      {!lo && <Catapult position={[-9.6, 0, -9.2]} rot={0.6} wood={wood} iron={iron} />}
      {!lo && <Catapult position={[9.6, 0, 9.2]} rot={Math.PI + 0.6} wood={wood} iron={iron} />}
      <Instances items={crates} geometry={crateGeo} material={wood} yOffset={0.4} scaleY={false} />
      {/* braziers along the inner walls */}
      {!lo &&
        [-6, 6].flatMap((x) => [
          <Torch key={`n${x}`} theme={theme} position={[x, 0, HALF - 1.3]} light={false} tall={1.2} />,
          <Torch key={`s${x}`} theme={theme} position={[x, 0, -HALF + 1.6]} light={false} tall={1.2} />,
        ])}
      {/* distant hills keep */}
      <group position={[24, 3, -55]}>
        <mesh material={stone}>
          <boxGeometry args={[14, 10, 8]} />
        </mesh>
        <mesh material={stone} position={[0, 8, 0]}>
          <boxGeometry args={[6, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}
