/**
 * Procedural rigged warrior. One component covers infantry, priest, empress and commander via
 * an `outfit` description; joints (body, torso, head, arms, legs) are animated from a Pose.
 * Models face +Z with feet at y = 0.
 */
import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArmyMaterials } from '../materials';
import type { ClassicArmy as ArmyId } from '../../config/settings';
import { env, type Pose } from './pose';

export type Helmet = 'corinthian' | 'tiara' | 'crown' | 'mitre' | 'diadem' | 'hood' | 'kingcrown' | 'tallcap';
export type Weapon = 'spear' | 'sword' | 'greatsword' | 'staff' | 'longspear' | 'none';
export type ShieldKind = 'aspis' | 'wicker' | 'none';

export interface Outfit {
  helmet: Helmet;
  weapon: Weapon;
  shield: ShieldKind;
  cape?: boolean;
  robe?: boolean; // long robe to the ground
  skirt?: 'short' | 'long';
  pauldrons?: boolean;
  slim?: boolean;
  crest?: number; // crest material index
  beard?: boolean;
  seated?: boolean; // riders / charioteers
}

// Shared geometries (created once).
const G = {
  limb: new THREE.CylinderGeometry(0.028, 0.024, 1, 8).translate(0, -0.5, 0),
  thigh: new THREE.CylinderGeometry(0.036, 0.028, 1, 8).translate(0, -0.5, 0),
  greave: new THREE.CylinderGeometry(0.034, 0.03, 1, 8).translate(0, -0.5, 0),
  foot: new THREE.BoxGeometry(0.05, 0.03, 0.09),
  chest: new THREE.CylinderGeometry(0.085, 0.07, 0.24, 10),
  belly: new THREE.CylinderGeometry(0.07, 0.075, 0.08, 10),
  head: new THREE.SphereGeometry(0.062, 14, 12),
  neck: new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8),
  hand: new THREE.SphereGeometry(0.024, 8, 6),
  shoulder: new THREE.SphereGeometry(0.045, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  helmetDome: new THREE.SphereGeometry(0.072, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  crest: new THREE.CylinderGeometry(0.075, 0.075, 0.025, 16, 1, false, 0, Math.PI),
  cheek: new THREE.BoxGeometry(0.02, 0.07, 0.06),
  tiara: new THREE.CylinderGeometry(0.055, 0.068, 0.15, 12),
  tallcap: new THREE.CylinderGeometry(0.035, 0.07, 0.16, 12),
  crownBand: new THREE.CylinderGeometry(0.075, 0.072, 0.04, 16, 1, true),
  crownSpike: new THREE.ConeGeometry(0.014, 0.06, 5),
  mitre: new THREE.ConeGeometry(0.06, 0.22, 4),
  hood: new THREE.SphereGeometry(0.085, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.7),
  beard: new THREE.ConeGeometry(0.045, 0.09, 8),
  shaft: new THREE.CylinderGeometry(0.009, 0.009, 1, 6),
  spearTip: new THREE.ConeGeometry(0.02, 0.09, 4),
  blade: new THREE.BoxGeometry(0.03, 0.34, 0.008),
  greatblade: new THREE.BoxGeometry(0.045, 0.52, 0.01),
  guard: new THREE.BoxGeometry(0.1, 0.018, 0.025),
  pommel: new THREE.SphereGeometry(0.018, 8, 6),
  orb: new THREE.IcosahedronGeometry(0.045, 1),
  aspis: new THREE.CylinderGeometry(0.17, 0.17, 0.025, 24),
  aspisRim: new THREE.TorusGeometry(0.17, 0.012, 6, 28),
  boss: new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  wicker: new THREE.BoxGeometry(0.22, 0.38, 0.02),
  skirtShort: new THREE.CylinderGeometry(0.08, 0.12, 0.13, 12, 1, true),
  skirtLong: new THREE.CylinderGeometry(0.08, 0.16, 0.34, 14, 1, true),
  robe: new THREE.CylinderGeometry(0.085, 0.17, 0.42, 16, 1, false),
  cape: new THREE.PlaneGeometry(0.22, 0.45, 4, 6).translate(0, -0.225, 0),
  pauldron: new THREE.SphereGeometry(0.055, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  belt: new THREE.TorusGeometry(0.075, 0.012, 6, 16),
};

export interface HumanoidProps {
  mats: ArmyMaterials;
  army: ArmyId;
  outfit: Outfit;
  pose: RefObject<Pose>;
  scale?: number;
}

export function Humanoid({ mats, army, outfit, pose, scale = 1 }: HumanoidProps) {
  const body = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const armR = useRef<THREE.Group>(null!);
  const armL = useRef<THREE.Group>(null!);
  const foreR = useRef<THREE.Group>(null!);
  const legL = useRef<THREE.Group>(null!);
  const legR = useRef<THREE.Group>(null!);
  const cape = useRef<THREE.Mesh>(null!);
  const hipY = outfit.seated ? 0 : 0.32;

  const crestMat = mats.crests[(outfit.crest ?? 0) % mats.crests.length];

  // Weapon geometry in the right hand; hand at (0,-0.26,0) of the arm group
  const weapon = useMemo(() => {
    switch (outfit.weapon) {
      case 'spear':
      case 'longspear': {
        const len = outfit.weapon === 'longspear' ? 1.0 : 0.8;
        return (
          <group position={[0, -0.27, 0.0]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={G.shaft} material={mats.wood} scale={[1, len, 1]} position={[0, 0.1, 0]} castShadow />
            <mesh geometry={G.spearTip} material={mats.steel} position={[0, 0.1 + len / 2 + 0.04, 0]} castShadow />
          </group>
        );
      }
      case 'sword':
      case 'greatsword': {
        const big = outfit.weapon === 'greatsword';
        return (
          <group position={[0, -0.27, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh geometry={big ? G.greatblade : G.blade} material={mats.steel} position={[0, big ? 0.3 : 0.2, 0]} castShadow />
            <mesh geometry={G.guard} material={mats.trim} position={[0, 0.03, 0]} />
            <mesh geometry={G.pommel} material={mats.trim} position={[0, -0.05, 0]} />
          </group>
        );
      }
      case 'staff':
        return (
          <group position={[0, -0.27, 0]}>
            <mesh geometry={G.shaft} material={mats.wood} scale={[1.3, 0.95, 1.3]} position={[0, 0.1, 0]} castShadow />
            <mesh geometry={G.orb} material={mats.glow} position={[0, 0.6, 0]} />
            <mesh geometry={G.crownBand} material={mats.trim} scale={0.5} position={[0, 0.56, 0]} />
          </group>
        );
      default:
        return null;
    }
  }, [outfit.weapon, mats]);

  const shield = useMemo(() => {
    if (outfit.shield === 'aspis')
      return (
        <group position={[0.02, -0.18, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh geometry={G.aspis} material={mats.shield} castShadow />
          <mesh geometry={G.aspisRim} material={mats.trim} rotation={[Math.PI / 2, 0, 0]} />
          <mesh geometry={G.boss} material={crestMat} position={[0, 0.012, 0]} />
        </group>
      );
    if (outfit.shield === 'wicker')
      return (
        <group position={[0.02, -0.16, 0.09]}>
          <mesh geometry={G.wicker} material={mats.shield} castShadow />
          <mesh geometry={G.boss} material={mats.trim} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]} scale={0.6} />
        </group>
      );
    return null;
  }, [outfit.shield, mats, crestMat]);

  const helmet = (() => {
    switch (outfit.helmet) {
      case 'corinthian':
        return (
          <group>
            <mesh geometry={G.helmetDome} material={mats.metal} position={[0, 0.005, 0]} castShadow />
            <mesh geometry={G.cheek} material={mats.metal} position={[0.05, -0.03, 0.03]} />
            <mesh geometry={G.cheek} material={mats.metal} position={[-0.05, -0.03, 0.03]} />
            <mesh geometry={G.crest} material={crestMat} position={[0, 0.085, -0.01]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1.1, 1]} castShadow />
          </group>
        );
      case 'tiara':
        return (
          <group>
            <mesh geometry={G.tiara} material={army === 'persian' ? mats.cloak : mats.cloth} position={[0, 0.07, 0]} castShadow />
            <mesh geometry={G.crownBand} material={mats.trim} position={[0, 0.01, 0]} scale={[0.95, 1, 0.95]} />
          </group>
        );
      case 'tallcap':
        return (
          <group>
            <mesh geometry={G.tallcap} material={mats.metal} position={[0, 0.08, 0]} castShadow />
            <mesh geometry={G.crownBand} material={mats.trim} position={[0, 0.005, 0]} />
          </group>
        );
      case 'crown':
      case 'kingcrown': {
        const n = outfit.helmet === 'kingcrown' ? 9 : 7;
        return (
          <group>
            {outfit.helmet === 'kingcrown' && <mesh geometry={G.helmetDome} material={mats.metal} castShadow />}
            <mesh geometry={G.crownBand} material={mats.trim} position={[0, 0.05, 0]} />
            {Array.from({ length: n }, (_, i) => {
              const a = (i / n) * Math.PI * 2;
              return <mesh key={i} geometry={G.crownSpike} material={mats.trim} position={[Math.sin(a) * 0.072, 0.095, Math.cos(a) * 0.072]} />;
            })}
          </group>
        );
      }
      case 'diadem':
        return <mesh geometry={G.crownBand} material={mats.trim} position={[0, 0.03, 0]} scale={[0.92, 0.8, 0.92]} />;
      case 'mitre':
        return (
          <group>
            <mesh geometry={G.mitre} material={mats.cloth} position={[0, 0.13, 0]} rotation={[0, Math.PI / 4, 0]} castShadow />
            <mesh geometry={G.crownBand} material={mats.trim} position={[0, 0.03, 0]} scale={[0.9, 1, 0.9]} />
          </group>
        );
      case 'hood':
        return <mesh geometry={G.hood} material={mats.cloak} position={[0, -0.005, -0.008]} castShadow />;
    }
  })();

  useFrame(() => {
    const ps = pose.current;
    if (!ps) return;
    const t = ps.time + ps.seed * 10;
    let legSwing = 0, armSwing = 0, bob = 0, torsoX = 0, torsoY = 0, headY = Math.sin(t * 0.4) * 0.15;
    // Spears and staffs are carried upright at rest; swords point forward-down.
    const upright = outfit.weapon === 'spear' || outfit.weapon === 'longspear'; // staff geometry is already vertical
    let rArmX = ps.alert ? -0.5 : -0.15, rArmZ = 0, lArmX = -0.5;
    let foreX = upright ? -1.25 : ps.alert ? -0.6 : -0.25;
    const breathe = Math.sin(t * 1.6) * 0.012;

    if (ps.mode === 'walk') {
      legSwing = Math.sin(ps.stride) * 0.55;
      armSwing = Math.sin(ps.stride) * 0.25;
      bob = Math.abs(Math.cos(ps.stride)) * 0.018;
      torsoX = 0.08;
      headY = 0;
    } else if (ps.mode === 'attack') {
      const p = ps.p;
      const wind = env(p, 0, 0.4, 0.42, 0.5); // raise
      const strike = env(p, 0.42, 0.55, 0.7, 1); // deliver
      headY = 0;
      switch (ps.style) {
        case 'spear':
          // draw back, then thrust: forearm counter-rotates so the spear stays level
          rArmX = -0.9 + wind * 0.7 - strike * 0.8;
          foreX = -rArmX - 0.1;
          torsoX = 0.05 - wind * 0.1 + strike * 0.25;
          torsoY = wind * 0.35 - strike * 0.3;
          lArmX = -0.9;
          break;
        case 'staff':
          rArmX = -0.4 - wind * 2.5 + strike * 1.6;
          lArmX = -0.4 - wind * 2.3 + strike * 1.4;
          torsoX = -wind * 0.15 + strike * 0.3;
          break;
        case 'royal':
        case 'sword':
        default:
          rArmX = -0.3 - wind * 2.5 + strike * 2.2;
          rArmZ = -wind * 0.3;
          foreX = -0.2 - wind * 0.6;
          torsoX = -wind * 0.12 + strike * 0.3;
          torsoY = -wind * 0.4 + strike * 0.5;
          lArmX = -0.8 + wind * 0.3;
          break;
      }
    } else if (ps.mode === 'hit') {
      const k = Math.sin(ps.p * Math.PI);
      torsoX = -0.45 * k;
      lArmX = -1.3 * k - 0.5;
      headY = 0;
    } else if (ps.mode === 'die') {
      const k = Math.min(1, ps.p * 3);
      rArmX = -0.15 - 1.4 * k;
      lArmX = -0.5 - 1.2 * k;
      legSwing = 0.3 * k;
      torsoX = -0.3 * k;
    } else if (ps.mode === 'promote') {
      rArmX = -2.6 * Math.sin(ps.p * Math.PI);
      torsoX = -0.15 * Math.sin(ps.p * Math.PI);
    }

    body.current.position.y = hipY + bob;
    torso.current.rotation.set(torsoX + breathe, torsoY, 0);
    torso.current.scale.set(1 + breathe * 0.5, 1, 1 + breathe);
    head.current.rotation.y = headY;
    if (outfit.seated) {
      legL.current.rotation.set(-0.55, 0, -0.55);
      legR.current.rotation.set(-0.55, 0, 0.55);
    } else {
      legL.current.rotation.x = -legSwing;
      legR.current.rotation.x = legSwing;
    }
    armR.current.rotation.set(rArmX + armSwing, 0, rArmZ - 0.08);
    foreR.current.rotation.x = foreX;
    armL.current.rotation.set(lArmX - armSwing, 0, 0.12);
    if (cape.current) cape.current.rotation.x = 0.12 + (ps.mode === 'walk' ? 0.25 : 0) + Math.sin(t * 2) * 0.04;
  });

  const w = outfit.slim ? 0.88 : 1;
  return (
    <group scale={scale}>
      <group ref={body} position={[0, hipY, 0]}>
        {/* legs */}
        {[[-0.045, legL], [0.045, legR]].map(([x, ref], i) => (
          <group key={i} ref={ref as RefObject<THREE.Group>} position={[x as number, 0, 0]}>
            <mesh geometry={G.thigh} material={outfit.robe ? mats.cloth : mats.skin} scale={[1, 0.16, 1]} castShadow />
            <group position={[0, -0.16, 0]}>
              <mesh geometry={G.greave} material={outfit.robe ? mats.cloth : mats.metal} scale={[1, 0.15, 1]} castShadow />
              <mesh geometry={G.foot} material={mats.leather} position={[0, -0.15, 0.02]} />
            </group>
          </group>
        ))}
        {/* skirt / robe */}
        {outfit.robe ? (
          <mesh geometry={G.robe} material={mats.cloth} position={[0, -0.13, 0]} castShadow />
        ) : outfit.skirt === 'long' ? (
          <mesh geometry={G.skirtLong} material={mats.cloth} position={[0, -0.12, 0]} castShadow />
        ) : (
          <mesh geometry={G.skirtShort} material={mats.cloth} position={[0, -0.03, 0]} castShadow />
        )}
        <mesh geometry={G.belt} material={mats.leather} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} />
        {/* torso */}
        <group ref={torso}>
          <mesh geometry={G.belly} material={outfit.robe ? mats.cloth : mats.metal} position={[0, 0.06, 0]} scale={[w, 1, w * 0.85]} castShadow />
          <mesh geometry={G.chest} material={outfit.robe ? mats.cloth : mats.metal} position={[0, 0.2, 0]} scale={[w, 1, w * 0.8]} castShadow />
          {outfit.robe && <mesh geometry={G.chest} material={mats.trim} position={[0, 0.25, 0.005]} scale={[w * 0.55, 0.35, w * 0.86]} />}
          {outfit.pauldrons && (
            <>
              <mesh geometry={G.pauldron} material={mats.trim} position={[0.1, 0.29, 0]} rotation={[0, 0, -0.5]} castShadow />
              <mesh geometry={G.pauldron} material={mats.trim} position={[-0.1, 0.29, 0]} rotation={[0, 0, 0.5]} castShadow />
            </>
          )}
          {outfit.cape && <mesh ref={cape} geometry={G.cape} material={mats.cloak} position={[0, 0.31, -0.07]} scale={[w * 1.1, outfit.seated ? 0.7 : 1, 1]} castShadow />}
          <mesh geometry={G.neck} material={mats.skin} position={[0, 0.33, 0]} />
          <group ref={head} position={[0, 0.4, 0]}>
            <mesh geometry={G.head} material={mats.skin} castShadow />
            {outfit.beard && <mesh geometry={G.beard} material={mats.hair} position={[0, -0.06, 0.035]} rotation={[Math.PI + 0.3, 0, 0]} />}
            {helmet}
          </group>
          {/* right (weapon) arm */}
          <group ref={armR} position={[0.11, 0.29, 0]}>
            <mesh geometry={G.shoulder} material={mats.metal} rotation={[0, 0, -0.3]} />
            <mesh geometry={G.limb} material={mats.skin} scale={[1, 0.14, 1]} castShadow />
            <group ref={foreR} position={[0, -0.14, 0]}>
              <mesh geometry={G.limb} material={mats.leather} scale={[1, 0.13, 1]} castShadow />
              <mesh geometry={G.hand} material={mats.skin} position={[0, -0.135, 0]} />
              <group position={[0, 0.14, 0]}>{weapon}</group>
            </group>
          </group>
          {/* left (shield) arm */}
          <group ref={armL} position={[-0.11, 0.29, 0]}>
            <mesh geometry={G.shoulder} material={mats.metal} rotation={[0, 0, 0.3]} />
            <mesh geometry={G.limb} material={mats.skin} scale={[1, 0.27, 1]} castShadow />
            <mesh geometry={G.hand} material={mats.skin} position={[0, -0.27, 0]} />
            {shield}
          </group>
        </group>
      </group>
    </group>
  );
}
