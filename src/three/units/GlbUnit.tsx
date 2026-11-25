/**
 * Rigged Sun / Shadow army characters loaded from the GLB library (public/assets/chess-pieces).
 *
 * - Each GLB is fetched and parsed once (drei useGLTF cache); every piece on the board gets its own
 *   skeleton clone (SkeletonUtils.clone) sharing geometry and textures, plus its own AnimationMixer.
 * - Looping clips (Idle, Walk / Gallop, Defend) run on the mixer clock.
 * - One-shot clips (Attack, Hit, Death, Victory during promotion) are SCRUBBED from the choreography's
 *   progress `pose.p`, so the weapon strike lands exactly on the impact the capture logic schedules —
 *   animation can never drift from the authoritative game timing.
 */
import { Component, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { PieceSymbol } from 'chess.js';
import type { ArmyId } from '../../config/settings';
import type { Pose } from './pose';
import manifest from '../../../public/assets/chess-pieces/manifest.json';

const PIECE_NAME: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

interface ManifestEntry {
  file: string;
  scale: number;
  skeleton: string;
  clips: Record<string, { seconds: number; loop: boolean }>;
}
const pieces = (manifest as unknown as { pieces: Record<string, ManifestEntry> }).pieces;

export const glbEntry = (army: ArmyId, type: PieceSymbol) => pieces[`${army}_${PIECE_NAME[type]}`];
export const allGlbUrls = () => Object.values(pieces).map((p) => p.file);

/** Start downloading every army model as soon as the battlefield mounts. */
export function preloadArmies() {
  for (const url of allGlbUrls()) useGLTF.preload(url);
}

/** Which clip a pose mode plays, and whether it is scrubbed from pose.p. */
function clipFor(mode: Pose['mode'], skeleton: string, clips: Record<string, unknown>): { name: string; scrub: boolean; span?: number } {
  switch (mode) {
    case 'walk':
      return { name: skeleton === 'horse+rider' && 'Gallop' in clips ? 'Gallop' : 'Walk', scrub: false };
    case 'attack':
      return { name: 'Attack', scrub: true };
    case 'hit':
      return { name: 'Hit', scrub: true };
    case 'die':
      return { name: 'Death', scrub: true, span: 0.55 }; // fold in the first 55 % of the segment, then the actor topples & sinks
    case 'promote':
      return { name: 'Victory', scrub: true };
    case 'victory':
      return { name: 'Victory', scrub: false };
    case 'defend':
      return { name: 'Defend' in clips ? 'Defend' : 'Idle', scrub: false };
    default:
      return { name: 'Idle', scrub: false };
  }
}

export function GlbUnit({ type, army, pose }: { type: PieceSymbol; army: ArmyId; pose: RefObject<Pose> }) {
  const entry = glbEntry(army, type);
  const gltf = useGLTF(entry.file);

  const { root, mixer, actions } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as THREE.Object3D;
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = false;
        // Skinned bounds follow the bind pose; animated limbs can leave them, so never cull a unit.
        m.frustumCulled = false;
      }
    });
    const mixer = new THREE.AnimationMixer(root);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      if (!entry.clips[clip.name]?.loop) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions[clip.name] = a;
    }
    return { root, mixer, actions };
  }, [gltf, entry]);

  const current = useRef<{ name: string; scrub: boolean } | null>(null);

  useEffect(() => {
    // Desynchronise idles so a rank of soldiers doesn't breathe in unison.
    const idle = actions.Idle;
    if (idle) {
      idle.play();
      idle.time = (pose.current?.seed ?? Math.random()) * idle.getClip().duration;
      current.current = { name: 'Idle', scrub: false };
    }
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    };
  }, [actions, mixer, root, pose]);

  useFrame((_, dt) => {
    const ps = pose.current;
    if (!ps) return;
    const want = clipFor(ps.mode, entry.skeleton, actions);
    const next = actions[want.name] ?? actions.Idle;
    if (!next) return;
    const cur = current.current;
    if (!cur || cur.name !== want.name) {
      const prev = cur ? actions[cur.name] : undefined;
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.paused = want.scrub;
      next.play();
      if (prev && prev !== next) prev.crossFadeTo(next, want.scrub ? 0.08 : 0.2, false);
      current.current = { name: want.name, scrub: want.scrub };
    }
    if (want.scrub) {
      const span = want.span ?? 1;
      next.time = Math.min(1, ps.p / span) * next.getClip().duration * 0.999;
    }
    mixer.update(Math.min(dt, 0.1));
  });

  return <primitive object={root} scale={entry.scale} />;
}

/** If a model fails to load (network, corrupt file), fall back to the procedural unit. */
export class GlbErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[army models] falling back to classic unit:', err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
