/**
 * Combat particle effects: metal sparks at weapon impact and a dust cloud when a unit falls.
 * Bursts are scheduled from the active choreography so they stay in sync with the animation.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { useSettings } from '../config/settings';

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
}

function usePool({ max, color, size, gravity, additive }: { max: number; color: string; size: number; gravity: number; additive: boolean }) {
  const particles = useRef<Particle[]>([]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setDrawRange(0, 0);
    return g;
  }, [max]);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity: additive ? 1 : 0.55,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: !additive,
      }),
    [color, size, additive],
  );
  useFrame((_, dt) => {
    const ps = particles.current;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    let n = 0;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life > p.max) {
        ps.splice(i, 1);
        continue;
      }
      p.vy -= gravity * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y = Math.max(0.07, p.y + p.vy * dt);
      p.z += p.vz * dt;
    }
    for (const p of ps) if (n < max) pos.setXYZ(n++, p.x, p.y, p.z);
    pos.needsUpdate = true;
    geo.setDrawRange(0, n);
  });
  return { geo, mat, particles };
}

export function Effects() {
  const quality = useSettings((s) => s.quality);
  const mult = quality === 'low' ? 0.35 : quality === 'medium' ? 0.7 : 1;
  const sparks = usePool({ max: 200, color: '#ffcf6a', size: 0.06, gravity: 6, additive: true });
  const dust = usePool({ max: 300, color: '#b89a74', size: 0.22, gravity: -0.2, additive: false });
  const anim = useGame((s) => s.anim);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (!anim) return;
    for (const [id, segs] of Object.entries(anim.scripts)) {
      void id;
      for (const s of segs) {
        if (s.kind === 'hit') {
          const at = anim.startedAt + s.t0 * 1000 - performance.now();
          timers.current.push(
            window.setTimeout(() => {
              const [x, z] = s.from;
              for (let i = 0; i < 40 * mult; i++)
                sparks.particles.current.push({ x, y: 0.45, z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0, max: 0.35 + Math.random() * 0.3 });
            }, Math.max(0, at)),
          );
        }
        if (s.kind === 'die') {
          const at = anim.startedAt + (s.t0 + (s.t1 - s.t0) * 0.3) * 1000 - performance.now();
          const victim = anim.focus;
          timers.current.push(
            window.setTimeout(() => {
              const [x, z] = victim;
              for (let i = 0; i < 60 * mult; i++) {
                const a = Math.random() * Math.PI * 2, r = Math.random() * 1.2;
                dust.particles.current.push({ x, y: 0.1, z, vx: Math.cos(a) * r, vy: Math.random() * 0.4, vz: Math.sin(a) * r, life: 0, max: 0.8 + Math.random() * 0.8 });
              }
            }, Math.max(0, at)),
          );
        }
      }
    }
    return () => timers.current.forEach(clearTimeout);
  }, [anim, mult, sparks.particles, dust.particles]);

  return (
    <>
      <points geometry={sparks.geo} material={sparks.mat} />
      <points geometry={dust.geo} material={dust.mat} />
    </>
  );
}
