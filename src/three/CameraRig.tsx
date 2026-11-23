/**
 * Camera: orbit / zoom / pan via OrbitControls, plus scripted transitions (view presets,
 * board rotation, cinematic focus on captures, checks and checkmate). Any user drag cancels
 * a scripted move so the camera never fights the player.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { create } from 'zustand';
import { useGame } from '../game/store';
import { useSettings } from '../config/settings';

export type ViewMode = 'default' | 'top' | 'cinematic';
export const useView = create<{ view: ViewMode; nonce: number; panelOffset: number; setView: (v: ViewMode) => void; reset: () => void }>((set) => ({
  view: 'default',
  nonce: 0,
  /** Fraction of the screen width covered by a desktop side panel. */
  panelOffset: 0,
  setView: (view) => set((s) => ({ view, nonce: s.nonce + 1 })),
  reset: () => set((s) => ({ view: 'default', nonce: s.nonce + 1 })),
}));

/**
 * Camera presets. `far` is computed so the full board width (≈10 units incl. frame) fits the
 * horizontal field of view at any aspect ratio — phones in portrait get a steeper, wider shot.
 */
const presets = (view: ViewMode, side: 1 | -1, aspect: number, vfovDeg: number, panelFrac: number) => {
  const portrait = aspect < 0.9;
  const tanV = Math.tan((vfovDeg * Math.PI) / 360);
  // Fit the board into the part of the screen not covered by the side panel.
  const availAspect = aspect * (1 - panelFrac);
  const needed = 5.7 / (tanV * availAspect); // margin: the near edge is closer than the target
  const far = Math.max(1, needed / 12.7);
  const dist = 12.7 * far;
  // Shift the look-at point so the board is centred in the free area.
  const halfWidthWorld = dist * tanV * aspect;
  const ox = halfWidthWorld * panelFrac * side; // screen-right in world space flips with orientation
  switch (view) {
    case 'top':
      return { pos: new THREE.Vector3(ox, 13.5 * far, 0.01 * side), target: new THREE.Vector3(ox, 0, 0) };
    case 'cinematic':
      return { pos: new THREE.Vector3(-6.5 * side, 3.2 * far, 8.5 * side * far), target: new THREE.Vector3(0, 0.3, 0) };
    default:
      return portrait
        ? { pos: new THREE.Vector3(0, 10.6 * far, 7.4 * side * far), target: new THREE.Vector3(0, 0, 0.9 * side) }
        : { pos: new THREE.Vector3(ox, 8.6 * far, 9.4 * side * far), target: new THREE.Vector3(ox, 0, 0.6 * side) };
  }
};

export function CameraRig({ showcase }: { showcase: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null!);
  const { camera, size } = useThree();
  const orientation = useGame((s) => s.orientation);
  const focus = useGame((s) => s.focusRequest);
  const fixed = useSettings((s) => s.fixedCamera);
  const sens = useSettings((s) => s.cameraSensitivity);
  const cinematic = useSettings((s) => s.cinematicCamera);
  const dragging = useGame((s) => !!s.dragging);
  const { view, nonce, panelOffset } = useView();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3; until: number; then?: () => void } | null>(null);
  const homeRef = useRef(presets('default', 1, 1.5, 42, 0));
  const aspect = size.width / Math.max(1, size.height);
  const vfov = aspect < 0.9 ? 55 : 42;

  // View preset / orientation changes
  useEffect(() => {
    const side = orientation === 'w' ? 1 : -1;
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.fov !== vfov) {
      cam.fov = vfov;
      cam.updateProjectionMatrix();
    }
    homeRef.current = presets(view, side, aspect, vfov, Math.min(0.45, panelOffset / Math.max(1, size.width)));
    goal.current = { ...homeRef.current, until: performance.now() + 1600 };
  }, [orientation, view, nonce, aspect, vfov, panelOffset, camera, size.width]);

  // Cinematic focus on game events
  useEffect(() => {
    if (!focus || showcase) return;
    if (!cinematic && focus.kind !== 'mate') return;
    if (focus.kind === 'select') return; // selection keeps the player's framing
    const side = orientation === 'w' ? 1 : -1;
    const t = new THREE.Vector3(focus.x, 0.4, focus.z);
    const dist = focus.kind === 'mate' ? 3.6 : 5.2;
    const pos = new THREE.Vector3(focus.x - 2.2 * side, focus.kind === 'mate' ? 2.2 : 3.4, focus.z + dist * side * 0.75);
    const hold = focus.kind === 'capture' ? 2400 : focus.kind === 'mate' ? 6000 : 1200;
    goal.current = {
      pos,
      target: t,
      until: performance.now() + hold,
      then: () => {
        if (useGame.getState().outcome.over && focus.kind === 'mate') return; // stay on the fallen king
        goal.current = { ...homeRef.current, until: performance.now() + 1500 };
      },
    };
  }, [focus, cinematic, orientation, showcase]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (showcase) {
      // slow cinematic orbit for the landing page
      const t = performance.now() / 1000;
      camera.position.set(Math.sin(t * 0.06) * 11, 5.2 + Math.sin(t * 0.13) * 0.8, Math.cos(t * 0.06) * 11);
      c.target.set(0, 0.4, 0);
      camera.lookAt(c.target);
      return;
    }
    const g = goal.current;
    if (g) {
      const k = 1 - Math.pow(0.02, dt);
      camera.position.lerp(g.pos, k * 1.4 > 1 ? 1 : k * 1.4);
      c.target.lerp(g.target, k);
      c.update();
      if (performance.now() > g.until || (camera.position.distanceTo(g.pos) < 0.02 && c.target.distanceTo(g.target) < 0.02)) {
        const then = g.then;
        goal.current = null;
        then?.();
      }
    }
  });

  return (
    <OrbitControls
      ref={controls as never}
      makeDefault
      enabled={!fixed && !dragging && !showcase}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55 * sens}
      zoomSpeed={0.8 * sens}
      panSpeed={0.6 * sens}
      minDistance={3.5}
      maxDistance={40}
      maxPolarAngle={Math.PI / 2.15}
      onStart={() => (goal.current = null)}
    />
  );
}
