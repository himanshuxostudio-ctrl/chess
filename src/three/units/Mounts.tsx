/** Procedural armoured horse and war chariot. Both face +Z with ground at y = 0. */
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArmyMaterials } from '../materials';
import { env, type Pose } from './pose';

const H = {
  barrel: new THREE.CapsuleGeometry(0.085, 0.26, 6, 12).rotateX(Math.PI / 2),
  neck: new THREE.CylinderGeometry(0.045, 0.07, 0.22, 10),
  head: new THREE.BoxGeometry(0.07, 0.07, 0.17),
  ear: new THREE.ConeGeometry(0.015, 0.05, 4),
  leg: new THREE.CylinderGeometry(0.022, 0.016, 1, 6).translate(0, -0.5, 0),
  hoof: new THREE.CylinderGeometry(0.022, 0.026, 0.03, 8),
  tail: new THREE.ConeGeometry(0.03, 0.2, 6).translate(0, -0.1, 0),
  mane: new THREE.BoxGeometry(0.018, 0.2, 0.05),
  barding: new THREE.CylinderGeometry(0.1, 0.11, 0.3, 12, 1, true, Math.PI * 0.15, Math.PI * 1.7).rotateX(Math.PI / 2),
  chanfron: new THREE.BoxGeometry(0.075, 0.03, 0.13),
  plume: new THREE.ConeGeometry(0.02, 0.1, 6),
  wheel: new THREE.TorusGeometry(0.15, 0.018, 6, 20),
  spoke: new THREE.BoxGeometry(0.012, 0.29, 0.012),
  hub: new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8).rotateZ(Math.PI / 2),
  axle: new THREE.CylinderGeometry(0.012, 0.012, 0.46, 6).rotateZ(Math.PI / 2),
  deck: new THREE.BoxGeometry(0.3, 0.03, 0.24),
  front: new THREE.CylinderGeometry(0.16, 0.16, 0.2, 14, 1, true, -Math.PI / 2, Math.PI),
  pole: new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateX(Math.PI / 2),
  scythe: new THREE.ConeGeometry(0.012, 0.16, 4).rotateZ(Math.PI / 2),
  bannerPole: new THREE.CylinderGeometry(0.008, 0.008, 0.6, 6),
  banner: new THREE.PlaneGeometry(0.16, 0.12),
};

interface MountProps {
  mats: ArmyMaterials;
  pose: RefObject<Pose>;
}

/** Armoured warhorse. Rider is attached by the caller at the saddle (y ≈ 0.36). */
export function Horse({ mats, pose, children }: MountProps & { children?: React.ReactNode }) {
  const root = useRef<THREE.Group>(null!);
  const neck = useRef<THREE.Group>(null!);
  const tail = useRef<THREE.Group>(null!);
  const legs = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!), useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)];
  const legPos: [number, number, number][] = [
    [0.055, 0.27, 0.13], // FR
    [-0.055, 0.27, 0.13], // FL
    [0.055, 0.27, -0.14], // BR
    [-0.055, 0.27, -0.14], // BL
  ];

  useFrame(() => {
    const ps = pose.current;
    if (!ps) return;
    const t = ps.time + ps.seed * 7;
    let rear = 0, bob = 0;
    const phase = [0, 0.6, 2.2, 2.8];
    let swing = 0;
    if (ps.mode === 'walk') {
      swing = 0.7;
      bob = Math.abs(Math.sin(ps.stride)) * 0.03;
    } else if (ps.mode === 'attack') {
      // rear up, then plunge forward with a charge
      const up = env(ps.p, 0, 0.35, 0.45, 0.6);
      rear = -0.55 * up;
      swing = 0.3 + up * 0.6;
    } else if (ps.mode === 'hit') {
      rear = -0.2 * Math.sin(ps.p * Math.PI);
    }
    root.current.rotation.x = rear;
    root.current.position.y = bob - rear * 0.12;
    legs.forEach((l, i) => {
      const front = i < 2;
      const a = ps.mode === 'walk' ? Math.sin(ps.stride + phase[i]) * swing : ps.mode === 'attack' && front ? -swing * (0.6 + 0.4 * Math.sin(t * 14)) : Math.sin(t * 0.7 + i) * 0.03;
      l.current.rotation.x = a;
    });
    neck.current.rotation.x = -0.55 + Math.sin(t * 0.9) * 0.05 + (ps.mode === 'walk' ? Math.sin(ps.stride * 2) * 0.06 : 0) + rear * -0.4;
    tail.current.rotation.x = 0.5 + Math.sin(t * 2.3) * 0.1 + (ps.mode === 'walk' ? 0.4 : 0);
    tail.current.rotation.z = Math.sin(t * 1.3) * 0.15;
  });

  return (
    <group ref={root}>
      <group position={[0, 0.3, 0]}>
        <mesh geometry={H.barrel} material={mats.horse} castShadow />
        <mesh geometry={H.barding} material={mats.cloth} position={[0, 0.005, -0.03]} castShadow />
      </group>
      <group ref={neck} position={[0, 0.34, 0.17]}>
        <mesh geometry={H.neck} material={mats.horse} position={[0, 0.09, 0]} castShadow />
        <mesh geometry={H.mane} material={mats.hair} position={[0, 0.1, -0.035]} />
        <group position={[0, 0.2, 0.03]} rotation={[0.9, 0, 0]}>
          <mesh geometry={H.head} material={mats.horse} position={[0, 0, 0.05]} castShadow />
          <mesh geometry={H.chanfron} material={mats.metal} position={[0, 0.035, 0.06]} />
          <mesh geometry={H.plume} material={mats.accent} position={[0, 0.08, 0]} />
          <mesh geometry={H.ear} material={mats.horse} position={[0.022, 0.05, -0.02]} />
          <mesh geometry={H.ear} material={mats.horse} position={[-0.022, 0.05, -0.02]} />
        </group>
      </group>
      <group ref={tail} position={[0, 0.34, -0.25]}>
        <mesh geometry={H.tail} material={mats.hair} />
      </group>
      {legs.map((l, i) => (
        <group key={i} ref={l} position={legPos[i]}>
          <mesh geometry={H.leg} material={mats.horse} scale={[1, 0.25, 1]} castShadow />
          <mesh geometry={H.hoof} material={mats.hair} position={[0, -0.255, 0]} />
        </group>
      ))}
      <group position={[0, 0.36, -0.02]}>{children}</group>
    </group>
  );
}

/** Two-wheeled scythed war chariot drawn by an armoured horse. The driver is passed as children. */
export function Chariot({ mats, pose, children }: MountProps & { children?: React.ReactNode }) {
  const wheelL = useRef<THREE.Group>(null!);
  const wheelR = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const flag = useRef<THREE.Mesh>(null!);
  const roll = useRef(0);
  const last = useRef(0);

  useFrame(() => {
    const ps = pose.current;
    if (!ps) return;
    const dt = Math.min(0.1, ps.time - last.current);
    last.current = ps.time;
    if (ps.mode === 'walk') roll.current += dt * 9;
    if (ps.mode === 'attack') {
      const lunge = env(ps.p, 0.3, 0.5, 0.6, 1);
      roll.current += dt * 6 * lunge;
      body.current.position.z = lunge * 0.12;
      body.current.rotation.x = -lunge * 0.06;
    } else {
      body.current.position.z = 0;
      body.current.rotation.x = ps.mode === 'walk' ? Math.sin(ps.time * 18) * 0.01 : 0;
    }
    wheelL.current.rotation.x = roll.current;
    wheelR.current.rotation.x = roll.current;
    flag.current.rotation.y = Math.sin(ps.time * 3 + ps.seed) * 0.3;
  });

  const spokes = (
    <>
      <mesh geometry={H.wheel} material={mats.wood} rotation={[0, Math.PI / 2, 0]} castShadow />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={H.spoke} material={mats.wood} rotation={[(i * Math.PI) / 4, 0, 0]} />
      ))}
      <mesh geometry={H.hub} material={mats.trim} />
      <mesh geometry={H.scythe} material={mats.steel} position={[0.08, 0, 0]} />
    </>
  );

  return (
    <group ref={body}>
      {/* horse leads the chariot */}
      <group position={[0, 0, 0.24]} scale={0.78}>
        <Horse mats={mats} pose={pose} />
      </group>
      <mesh geometry={H.pole} material={mats.wood} position={[0, 0.2, 0.05]} />
      <group position={[0, 0.15, -0.2]}>
        <mesh geometry={H.axle} material={mats.metal} />
        <group ref={wheelL} position={[-0.2, 0, 0]}>{spokes}</group>
        <group ref={wheelR} position={[0.2, 0, 0]} rotation={[0, Math.PI, 0]}>
          {spokes}
        </group>
        <mesh geometry={H.deck} material={mats.wood} position={[0, 0.03, 0]} castShadow />
        <mesh geometry={H.front} material={mats.metal} position={[0, 0.14, 0.0]} castShadow />
        <mesh geometry={H.front} material={mats.trim} position={[0, 0.245, 0.0]} scale={[1.02, 0.08, 1.02]} />
        <group position={[0.12, 0.3, -0.1]}>
          <mesh geometry={H.bannerPole} material={mats.wood} position={[0, 0.15, 0]} />
          <mesh ref={flag} geometry={H.banner} material={mats.cloak} position={[0, 0.38, -0.08]} />
        </group>
        <group position={[0, 0.045, -0.02]}>{children}</group>
      </group>
    </group>
  );
}
