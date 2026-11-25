/**
 * Theme-driven building blocks shared by every arena: sky dome, lighting rig, terrain, torches,
 * banners, distant mountains and atmospheric particles. Each reads its look from an ArenaTheme.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { bannerTexture, groundTexture } from '../materials';
import type { ArenaTheme, ParticleKind } from './themes';
import type { Quality } from '../../config/settings';

export function Sky({ theme }: { theme: ArenaTheme }) {
  const s = theme.sky;
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(s.top) },
          mid: { value: new THREE.Color(s.mid) },
          low: { value: new THREE.Color(s.low) },
          sun: { value: new THREE.Vector3(...s.sunDir).normalize() },
          sunColor: { value: new THREE.Color(s.sunColor) },
          sunCos: { value: Math.cos(s.sunSize) },
          glow: { value: s.glow },
          eclipse: { value: s.eclipse ? 1 : 0 },
          stars: { value: s.stars ?? 0 },
          time: { value: 0 },
        },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun; uniform vec3 sunColor;
          uniform float sunCos; uniform float glow; uniform float eclipse; uniform float stars; uniform float time; varying vec3 vDir;
          float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
          void main(){
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 c = mix(low, mid, smoothstep(-0.05, 0.14, h));
            c = mix(c, top, smoothstep(0.14, 0.65, h));
            float s = max(dot(d, sun), 0.0);
            float disc = smoothstep(sunCos - 0.0008, sunCos + 0.0004, s);
            if (eclipse > 0.5) {
              // dark moon over the sun: black disc, bright corona ring and long streamers
              float ring = smoothstep(sunCos - 0.004, sunCos - 0.0004, s) * (1.0 - disc);
              float corona = pow(s, 90.0) * (1.0 - disc);
              c += sunColor * (ring * 2.6 + corona * 1.4 * glow) + vec3(0.9,0.45,0.3) * pow(s, 8.0) * 0.3 * glow;
              c = mix(c, vec3(0.02,0.015,0.02), disc);
            } else {
              c += sunColor * (disc * 1.8 + pow(s, 64.0) * 1.2 * glow) + sunColor * pow(s, 6.0) * 0.3 * glow;
            }
            if (stars > 0.0 && h > 0.05) {
              vec3 q = floor(d * 260.0);
              float st = step(0.9965, hash(q));
              float tw = 0.6 + 0.4 * sin(time * 2.0 + hash(q + 3.0) * 30.0);
              c += vec3(st * tw * stars * smoothstep(0.05, 0.35, h));
            }
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [s],
  );
  useFrame(({ clock }) => {
    mat.uniforms.time.value = clock.elapsedTime;
  });
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[180, 48, 24]} />
    </mesh>
  );
}

export function Lights({ theme, quality }: { theme: ArenaTheme; quality: Quality }) {
  const l = theme.light;
  const hi = quality === 'high';
  return (
    <>
      <fog attach="fog" args={[theme.fog.color, theme.fog.near, quality === 'low' ? Math.min(75, theme.fog.far) : theme.fog.far]} />
      <hemisphereLight args={[l.hemiSky, l.hemiGround, l.hemi]} />
      <ambientLight intensity={l.ambient} />
      <directionalLight
        position={l.key.pos}
        intensity={l.key.intensity}
        color={l.key.color}
        castShadow={quality !== 'low'}
        shadow-mapSize-width={hi ? 2048 : 1024}
        shadow-mapSize-height={hi ? 2048 : 1024}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={l.rim.pos} intensity={l.rim.intensity} color={l.rim.color} />
    </>
  );
}

export function Ground({ theme }: { theme: ArenaTheme }) {
  const g = theme.ground;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: groundTexture(g.base, g.patchA, g.patchB), roughness: 1, color: g.tint }), [g]);
  const geo = useMemo(() => {
    const geom = new THREE.PlaneGeometry(220, 220, 80, 80);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      // flat around the board, rolling hills further out
      const h = r < 12 ? 0 : (Math.sin(x * 0.11) * Math.cos(y * 0.09) * 1.6 + Math.sin(x * 0.03 + y * 0.05) * 3) * Math.min(1, (r - 12) / 25) * g.hills;
      pos.setZ(i, h);
    }
    geom.computeVertexNormals();
    return geom;
  }, [g.hills]);
  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow />;
}

/** Brazier with animated flame (+ point light on higher quality). */
export function Torch({ position, light, theme, tall = 1 }: { position: [number, number, number]; light: boolean; theme: ArenaTheme; tall?: number }) {
  const flame = useRef<THREE.Group>(null!);
  const pl = useRef<THREE.PointLight>(null!);
  const seed = position[0] * 3.1 + position[2];
  const { fireMat, coreMat, metal } = useMemo(
    () => ({
      fireMat: new THREE.MeshBasicMaterial({ color: theme.torch.flame, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      coreMat: new THREE.MeshBasicMaterial({ color: theme.torch.core, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      metal: new THREE.MeshStandardMaterial({ color: theme.id === 'sun' ? '#8a6a2a' : '#3a2f25', metalness: 0.85, roughness: 0.45 }),
    }),
    [theme],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.1;
    flame.current.scale.set(1, f, 1);
    flame.current.rotation.y = t * 1.5;
    if (pl.current) pl.current.intensity = 7 * f;
  });
  const h = 1.4 * tall;
  return (
    <group position={position}>
      <mesh material={metal} position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, h, 8]} />
      </mesh>
      <mesh material={metal} position={[0, h + 0.05, 0]}>
        <cylinderGeometry args={[0.22, 0.1, 0.18, 10]} />
      </mesh>
      <group ref={flame} position={[0, h + 0.15, 0]}>
        <mesh material={fireMat} position={[0, 0.2, 0]}>
          <coneGeometry args={[0.2, 0.6, 8, 1, true]} />
        </mesh>
        <mesh material={coreMat} position={[0, 0.12, 0]}>
          <coneGeometry args={[0.1, 0.35, 8, 1, true]} />
        </mesh>
      </group>
      {light && <pointLight ref={pl} position={[0, h + 0.5, 0]} color={theme.torch.light} intensity={7} distance={7} decay={1.6} />}
    </group>
  );
}

/** Cloth banner on a pole with a waving vertex animation. */
export function Banner({ position, army, rot = 0, scale = 1 }: { position: [number, number, number]; army: 'sun' | 'shadow'; rot?: number; scale?: number }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(1.1, 1.6, 10, 10).translate(0.55, -0.8, 0), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: bannerTexture(army === 'sun' ? 'hellenic' : 'persian'), side: THREE.DoubleSide, roughness: 0.85 }), [army]);
  const pole = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 0.8 }), []);
  useFrame(({ clock }) => {
    const p = geo.attributes.position;
    const t = clock.elapsedTime + position[0];
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      p.setZ(i, Math.sin(x * 3.2 - t * 3 + y * 0.6) * 0.12 * x);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <group position={position} rotation={[0, rot, 0]} scale={scale}>
      <mesh material={pole} position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 3.2, 8]} />
      </mesh>
      <mesh geometry={geo} material={mat} position={[0.04, 3.05, 0]} castShadow />
    </group>
  );
}

/** Four banners at the board corners: White's end (z > 0) and Black's end (z < 0). */
export function CornerBanners({ theme }: { theme: ArenaTheme }) {
  const near = theme.banners === 'shadow' ? 'shadow' : 'sun';
  const far = theme.banners === 'sun' ? 'sun' : 'shadow';
  return (
    <>
      <Banner position={[-6.3, -0.35, 6.3]} army={near} rot={0.4} />
      <Banner position={[6.3, -0.35, 6.3]} army={near} rot={-0.4} />
      <Banner position={[-6.3, -0.35, -6.3]} army={far} rot={Math.PI - 0.4} />
      <Banner position={[6.3, -0.35, -6.3]} army={far} rot={Math.PI + 0.4} />
    </>
  );
}

export function CornerTorches({ theme, quality }: { theme: ArenaTheme; quality: Quality }) {
  return (
    <>
      {[
        [-5.4, -0.35, 5.4],
        [5.4, -0.35, 5.4],
        [-5.4, -0.35, -5.4],
        [5.4, -0.35, -5.4],
      ].map((p, i) => (
        <Torch key={i} theme={theme} position={p as [number, number, number]} light={quality === 'high' || (quality === 'medium' && i < 2)} />
      ))}
    </>
  );
}

export function Mountains({ color, jagged = false }: { color: string; jagged?: boolean }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }), [color]);
  const peaks = useMemo(() => {
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.05;
      const r = 70 + ((i * 37) % 25);
      out.push([Math.cos(a) * r, Math.sin(a) * r, (jagged ? 18 : 12) + ((i * 53) % 18), (jagged ? 6 : 10) + ((i * 17) % 12)]);
    }
    return out;
  }, [jagged]);
  return (
    <group>
      {peaks.map(([x, z, h, w], i) => (
        <mesh key={i} position={[x, h / 2 - 2, z]} material={mat}>
          <coneGeometry args={[w, h, jagged ? 4 : 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Atmospheric particles: golden motes, rising embers, falling ash or drifting dust. */
export function Particles({ kind, color, count }: { kind: ParticleKind; color: string; count: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 24;
      p[i * 3 + 1] = Math.random() * 6;
      p[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  const glowing = kind === 'embers' || kind === 'motes';
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color,
        size: kind === 'embers' ? 0.07 : kind === 'motes' ? 0.06 : kind === 'ash' ? 0.06 : 0.05,
        transparent: true,
        opacity: glowing ? 0.85 : 0.55,
        depthWrite: false,
        sizeAttenuation: true,
        blending: glowing ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: !glowing,
      }),
    [color, kind, glowing],
  );
  // velocity per kind (x drift, y rise/fall)
  const [vx, vy] = kind === 'embers' ? [0.08, 0.55] : kind === 'motes' ? [0.05, 0.08] : kind === 'ash' ? [0.12, -0.18] : [0.25, 0];
  useFrame(({ clock }, dt) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dt * (vx + Math.sin(t * 0.7 + i) * 0.06);
      let y = p.getY(i) + dt * (vy + Math.sin(x + i) * 0.05);
      if (x > 12) x = -12;
      if (y > 6) y = 0;
      if (y < 0) y = 6;
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} />;
}
