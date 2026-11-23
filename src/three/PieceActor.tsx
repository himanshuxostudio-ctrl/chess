/**
 * Places and animates one unit. Root motion comes from the choreography script (evaluated
 * deterministically from elapsed time), limb motion from the unit model reading `pose`.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { headingTo, restAngle, sqToXZ, type Segment, type Unit, type Vec2 } from '../game/choreography';
import { useSettings, type ArmyId } from '../config/settings';
import { UnitModel } from './units/UnitModel';
import { newPose, env, smooth, clamp01, type Pose } from './units/pose';
import { dragState } from './dragState';

interface Eval {
  x: number;
  z: number;
  y: number;
  yaw: number;
  tilt: number; // backward fall
  opacity: number;
  pose: Pose['mode'];
  p: number;
  stride: number;
  style: Pose['style'];
}

const lerpAngle = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** Evaluate a unit's script at time t (seconds since animation start). */
function evaluate(unit: Unit, segs: Segment[], t: number, isKnight: boolean): Eval {
  const [rx, rz] = sqToXZ(unit.square);
  const e: Eval = { x: rx, z: rz, y: 0, yaw: restAngle(unit.color), tilt: 0, opacity: 1, pose: 'idle', p: 0, stride: 0, style: 'sword' };
  let lastHeading = e.yaw;
  let pos: Vec2 = [rx, rz];
  for (const s of segs) {
    if (t < s.t0) break;
    const p = clamp01((t - s.t0) / Math.max(1e-4, s.t1 - s.t0));
    const active = t <= s.t1;
    switch (s.kind) {
      case 'walk': {
        const k = s.gait === 'gallop' ? p : smooth(p);
        pos = [s.from[0] + (s.to[0] - s.from[0]) * k, s.from[1] + (s.to[1] - s.from[1]) * k];
        const d = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
        if (d > 0.01) lastHeading = headingTo(s.from, s.to);
        // Cavalry leap over other units on long L-shaped jumps.
        if (active && isKnight && d > 1.2) e.y = Math.sin(p * Math.PI) * 0.45;
        if (active) {
          e.pose = 'walk';
          e.stride = k * d * (s.gait === 'gallop' ? 9 : 11);
        }
        e.yaw = lastHeading;
        break;
      }
      case 'face':
        e.yaw = lerpAngle(e.yaw, s.angle, smooth(p));
        lastHeading = e.yaw;
        break;
      case 'attack': {
        if (active) {
          e.pose = 'attack';
          e.p = p;
          e.style = s.style;
        }
        const lunge = env(p, 0.42, 0.55, 0.7, 1) * 0.12;
        pos = [pos[0] + Math.sin(e.yaw) * lunge, pos[1] + Math.cos(e.yaw) * lunge];
        break;
      }
      case 'hit': {
        if (active) {
          e.pose = 'hit';
          e.p = p;
        }
        const away = headingTo(s.from, pos);
        const push = Math.sin(p * Math.PI) * 0.08;
        pos = [pos[0] + Math.sin(away) * push, pos[1] + Math.cos(away) * push];
        break;
      }
      case 'die': {
        e.pose = 'die';
        e.p = p;
        const fall = s.fast ? smooth(p) : smooth(clamp01(p / 0.4));
        e.tilt = -fall * (Math.PI / 2) * 0.95;
        const sink = s.fast ? p : clamp01((p - 0.5) / 0.5);
        e.y = -smooth(sink) * 0.9;
        e.opacity = 1 - smooth(clamp01((p - (s.fast ? 0.2 : 0.55)) / (s.fast ? 0.8 : 0.45)));
        break;
      }
      case 'promote':
        if (active) {
          e.pose = 'promote';
          e.p = p;
          e.y = Math.sin(p * Math.PI) * 0.25;
        }
        break;
    }
  }
  e.x = pos[0];
  e.z = pos[1];
  return e;
}

const ringGeo = new THREE.RingGeometry(0.36, 0.44, 40).rotateX(-Math.PI / 2);
const glowGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.4, 24, 1, true);

export function PieceActor({ unit }: { unit: Unit }) {
  const root = useRef<THREE.Group>(null!);
  const tiltRef = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const glow = useRef<THREE.Mesh>(null!);
  const seed = useMemo(() => (parseInt(unit.id.slice(1), 10) * 0.6180339) % 1, [unit.id]);
  const pose = useRef<Pose>(newPose(seed));
  const faded = useRef(false);
  const restYaw = useRef(restAngle(unit.color));

  const whiteArmy = useSettings((s) => s.whiteArmy);
  const army: ArmyId = unit.color === 'w' ? whiteArmy : whiteArmy === 'hellenic' ? 'persian' : 'hellenic';
  const quality = useSettings((s) => s.quality);
  const selected = useGame((s) => s.selected === unit.square && !s.anim);
  const dragging = useGame((s) => s.dragging === unit.square);
  const inCheck = useGame((s) => unit.type === 'k' && !s.anim && s.match.turn === unit.color && s.match.inCheck() && s.version >= 0);

  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }), []);
  const glowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffe6a0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  );

  // Shadows toggled by quality preset.
  useEffect(() => {
    root.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== ring.current && o !== glow.current) (o as THREE.Mesh).castShadow = quality !== 'low';
    });
  }, [quality, unit.type]);

  // When the unit changes square/type (after an animation), reset any fade.
  useEffect(() => {
    faded.current = false;
  }, [unit.square, unit.type]);

  useFrame((state, dt) => {
    const s = useGame.getState();
    const anim = s.anim;
    const segs = anim?.scripts[unit.id];
    const ps = pose.current;
    ps.time = state.clock.elapsedTime;
    ps.alert = selected;
    let ev: Eval;
    if (anim && segs) {
      const t = (performance.now() - anim.startedAt) / 1000;
      ev = evaluate(unit, segs, t, unit.type === 'n');
      restYaw.current = ev.yaw;
    } else {
      const [x, z] = sqToXZ(unit.square);
      // ease back to facing the enemy after combat / movement
      restYaw.current = lerpAngle(restYaw.current, restAngle(unit.color), Math.min(1, dt * 3));
      ev = { x, z, y: 0, yaw: restYaw.current, tilt: 0, opacity: 1, pose: 'idle', p: 0, stride: 0, style: 'sword' };
      if (dragging && dragState.point) {
        ev.x = dragState.point.x;
        ev.z = dragState.point.z;
        ev.y = 0.3;
      }
    }
    ps.mode = ev.pose;
    ps.p = ev.p;
    ps.stride = ev.stride;
    ps.style = ev.style;
    root.current.position.set(ev.x, ev.y + 0.06, ev.z);
    root.current.rotation.y = ev.yaw;
    tiltRef.current.rotation.x = ev.tilt;

    // Fade out defeated units (materials cloned once so the rest of the army is unaffected).
    if (ev.opacity < 1) {
      if (!faded.current) {
        faded.current = true;
        tiltRef.current.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.material = (m.material as THREE.Material).clone();
            (m.material as THREE.Material).transparent = true;
          }
        });
      }
      tiltRef.current.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) (m.material as THREE.Material).opacity = ev.opacity;
      });
    }

    // selection / check ring
    const showRing = selected || inCheck;
    ring.current.visible = showRing;
    if (showRing) {
      ringMat.color.set(inCheck ? '#ff3b2f' : '#ffd27a');
      const pulse = 1 + Math.sin(state.clock.elapsedTime * (inCheck ? 8 : 4)) * 0.06;
      ring.current.scale.setScalar(pulse * (unit.type === 'k' ? 1.1 : 1));
      ring.current.position.set(ev.x, 0.075, ev.z);
    }
    // promotion pillar of light
    const promoting = ev.pose === 'promote';
    glowMat.opacity = promoting ? Math.sin(ev.p * Math.PI) * 0.55 : 0;
    glow.current.visible = promoting;
    glow.current.position.set(ev.x, 1.2, ev.z);
  });

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = useGame.getState();
    const piece = s.match.chess.get(unit.square);
    if (piece && piece.color === s.match.turn) {
      dragState.wasSelected = s.selected === unit.square;
      dragState.startedOn = unit.square;
      s.startDrag(unit.square);
    }
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 10) return; // it was a camera drag
    const s = useGame.getState();
    if (dragState.startedOn === unit.square) {
      // a press on one of our own units was handled by the drag logic
      dragState.startedOn = null;
      return;
    }
    s.clickSquare(unit.square);
  };

  return (
    <>
      <group ref={root} onPointerDown={onDown} onClick={onClick}>
        <group ref={tiltRef}>
          <UnitModel type={unit.type} army={army} variant={unit.variant} pose={pose} />
        </group>
        {/* generous invisible hit volume so units are easy to tap on phones */}
        <mesh position={[0, 0.4, 0]} visible={false}>
          <cylinderGeometry args={[0.34, 0.34, 0.8, 8]} />
        </mesh>
      </group>
      <mesh ref={ring} geometry={ringGeo} material={ringMat} visible={false} renderOrder={2} />
      <mesh ref={glow} geometry={glowGeo} material={glowMat} visible={false} />
    </>
  );
}
