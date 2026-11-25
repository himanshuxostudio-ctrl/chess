/** The 3D battlefield canvas. Lazy-loaded so the landing UI paints before three.js. */
import { Suspense, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { useSettings } from '../config/settings';
import { Board } from './Board';
import { PieceActor } from './PieceActor';
import { Battlefield } from './env/Battlefield';
import { Effects } from './Effects';
import { CameraRig } from './CameraRig';
import { preloadArmies } from './units/GlbUnit';

/**
 * Image-based lighting generated locally (no HDR download): PBR metals — gold, bronze, blackened
 * iron — need something to reflect, or they render almost black under direct lights alone.
 */
function ArmourReflections() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.45;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Preload() {
  const detailed = useSettings((s) => s.unitModels === 'detailed');
  useEffect(() => {
    if (detailed) preloadArmies();
  }, [detailed]);
  return null;
}

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
      shadows={quality !== 'low' ? { type: THREE.PCFShadowMap } : false}
      dpr={dpr}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.1, far: 400, position: [0, 8.6, 9.4] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
      onPointerMissed={() => useGame.getState().deselect()}
    >
      <ArmourReflections />
      <Preload />
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
