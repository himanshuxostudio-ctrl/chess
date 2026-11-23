/** The 3D battlefield canvas. Lazy-loaded so the landing UI paints before three.js. */
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { useSettings } from '../config/settings';
import { Board } from './Board';
import { PieceActor } from './PieceActor';
import { Battlefield } from './env/Battlefield';
import { Effects } from './Effects';
import { CameraRig } from './CameraRig';

function Units() {
  const units = useGame((s) => s.units);
  return (
    <>
      {units.map((u) => (
        <PieceActor key={u.id} unit={u} />
      ))}
    </>
  );
}

export default function Scene() {
  const quality = useSettings((s) => s.quality);
  const showcase = useGame((s) => s.mode === 'showcase');
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'medium' ? [1, 1.5] : [0.75, 1];
  return (
    <Canvas
      shadows={quality !== 'low' ? { type: THREE.PCFSoftShadowMap } : false}
      dpr={dpr}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.1, far: 400, position: [0, 8.6, 9.4] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={() => useGame.getState().deselect()}
    >
      <Suspense fallback={null}>
        <Battlefield />
        <Board />
        <Units />
        <Effects />
      </Suspense>
      <CameraRig showcase={showcase} />
    </Canvas>
  );
}
