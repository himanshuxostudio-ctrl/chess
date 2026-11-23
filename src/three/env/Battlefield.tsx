/**
 * The ancient battlefield around the board: dusk sky, fog, terrain, ruined colonnade (instanced),
 * torches with flickering fire, army banners, distant mountains & fortress, drifting dust.
 * Detail scales with the graphics quality preset.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSettings } from '../../config/settings';
import { bannerTexture, groundTexture, stoneTexture } from '../materials';

function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color('#1d2233') }, mid: { value: new THREE.Color('#8a5a3c') }, low: { value: new THREE.Color('#d9894a') }, sun: { value: new THREE.Vector3(-0.6, 0.18, -0.78).normalize() } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sun; varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 c = mix(low, mid, smoothstep(-0.05, 0.12, h));
            c = mix(c, top, smoothstep(0.12, 0.6, h));
            float s = max(dot(normalize(vDir), sun), 0.0);
            c += vec3(1.0,0.7,0.4) * pow(s, 64.0) * 1.6 + vec3(0.9,0.5,0.25) * pow(s, 6.0) * 0.35;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[180, 32, 16]} />
    </mesh>
  );
}

function Ground() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1, color: '#9a8a70' }), []);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(220, 220, 80, 80);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      // flat near the board, rolling hills further out
      const h = r < 12 ? 0 : (Math.sin(x * 0.11) * Math.cos(y * 0.09) * 1.6 + Math.sin(x * 0.03 + y * 0.05) * 3) * Math.min(1, (r - 12) / 25);
      pos.setZ(i, h);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow />;
}

/** Broken colonnade around the battlefield, rendered with instancing. */
function Ruins() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const capRef = useRef<THREE.InstancedMesh>(null!);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: stoneTexture(), color: '#cbbd9f', roughness: 0.85 }), []);
  const columns = useMemo(() => {
    const out: { x: number; z: number; h: number; tilt: number; broken: boolean }[] = [];
    const ring = (r: number, n: number, offset: number) => {
      for (let i = 0; i < n; i++) {
        const a = offset + (i / n) * Math.PI * 2;
        // keep both camera ends of the board clear
        if (Math.abs(Math.cos(a)) > 0.8) continue;
        const broken = (i * 7) % 3 === 0;
        out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: broken ? 1 + ((i * 13) % 5) * 0.4 : 4.2, tilt: broken ? ((i % 2) - 0.5) * 0.15 : 0, broken });
      }
    };
    ring(8.5, 22, 0.1);
    ring(15, 26, 0.3);
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    columns.forEach((c, i) => {
      m.compose(new THREE.Vector3(c.x, c.h / 2 - 0.35, c.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(c.tilt, 0, c.tilt * 0.5)), new THREE.Vector3(1, c.h, 1));
      ref.current.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(c.x, c.broken ? -10 : c.h - 0.25, c.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      capRef.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    capRef.current.instanceMatrix.needsUpdate = true;
  }, [columns]);
  return (
    <group>
      <instancedMesh ref={ref} args={[undefined, undefined, columns.length]} material={mat} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.38, 1, 14]} />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[undefined, undefined, columns.length]} material={mat} castShadow>
        <boxGeometry args={[0.95, 0.22, 0.95]} />
      </instancedMesh>
      {/* fallen drums */}
      {[[-6.2, 5.2, 0.4], [6.6, -5.4, 1.2], [-7.1, -4.1, 2.2], [7.4, 3.6, 0.9]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, -0.05, z]} rotation={[0, r, Math.PI / 2]} material={mat} castShadow receiveShadow>
          <cylinderGeometry args={[0.35, 0.35, 1.1, 14]} />
        </mesh>
      ))}
    </group>
  );
}

/** Torch brazier with animated flame sprites (+ optional point light on higher quality). */
function Torch({ position, light }: { position: [number, number, number]; light: boolean }) {
  const flame = useRef<THREE.Group>(null!);
  const pl = useRef<THREE.PointLight>(null!);
  const seed = position[0] * 3.1 + position[2];
  const fireMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffae42', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff0b0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a2f25', metalness: 0.8, roughness: 0.5 }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const f = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.1;
    flame.current.scale.set(1, f, 1);
    flame.current.rotation.y = t * 1.5;
    if (pl.current) pl.current.intensity = 7 * f;
  });
  return (
    <group position={position}>
      <mesh material={metal} position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 1.4, 8]} />
      </mesh>
      <mesh material={metal} position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.22, 0.1, 0.18, 10]} />
      </mesh>
      <group ref={flame} position={[0, 1.55, 0]}>
        <mesh material={fireMat} position={[0, 0.2, 0]}>
          <coneGeometry args={[0.2, 0.6, 8, 1, true]} />
        </mesh>
        <mesh material={coreMat} position={[0, 0.12, 0]}>
          <coneGeometry args={[0.1, 0.35, 8, 1, true]} />
        </mesh>
      </group>
      {light && <pointLight ref={pl} position={[0, 1.9, 0]} color="#ff9a3c" intensity={7} distance={7} decay={1.6} />}
    </group>
  );
}

/** Cloth banner on a pole with a waving vertex animation. */
function Banner({ position, army, rot = 0 }: { position: [number, number, number]; army: 'hellenic' | 'persian'; rot?: number }) {
  const mesh = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => new THREE.PlaneGeometry(1.1, 1.6, 10, 10).translate(0.55, -0.8, 0), []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array), [geo]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: bannerTexture(army), side: THREE.DoubleSide, roughness: 0.85 }), [army]);
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
    <group position={position} rotation={[0, rot, 0]}>
      <mesh material={pole} position={[0, 1.6, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.05, 3.2, 8]} />
      </mesh>
      <mesh ref={mesh} geometry={geo} material={mat} position={[0.04, 3.05, 0]} castShadow />
    </group>
  );
}

function Mountains() {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a4048', roughness: 1, flatShading: true }), []);
  const peaks = useMemo(() => {
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + (i % 3) * 0.05;
      const r = 70 + ((i * 37) % 25);
      out.push([Math.cos(a) * r, Math.sin(a) * r, 12 + ((i * 53) % 18), 10 + ((i * 17) % 12)]);
    }
    return out;
  }, []);
  return (
    <group>
      {peaks.map(([x, z, h, w], i) => (
        <mesh key={i} position={[x, h / 2 - 2, z]} material={mat}>
          <coneGeometry args={[w, h, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/** Silhouette of a hilltop fortress on each side of the field. */
function Fortress({ position, rot }: { position: [number, number, number]; rot: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#5d5149', roughness: 0.95 }), []);
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh material={mat} position={[0, 2, 0]}>
        <boxGeometry args={[16, 4, 3]} />
      </mesh>
      {[-8, -3, 3, 8].map((x) => (
        <mesh key={x} material={mat} position={[x, 3.5, 0]}>
          <cylinderGeometry args={[1.2, 1.4, 7, 8]} />
        </mesh>
      ))}
      <mesh material={mat} position={[0, 6, 0]}>
        <boxGeometry args={[4, 8, 4]} />
      </mesh>
    </group>
  );
}

function Dust({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null!);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 24;
      p[i * 3 + 1] = Math.random() * 5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  const mat = useMemo(() => new THREE.PointsMaterial({ color: '#e6c79a', size: 0.05, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }), []);
  useFrame((_, dt) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) + dt * 0.25;
      let y = p.getY(i) + Math.sin(x + i) * dt * 0.05;
      if (x > 12) x = -12;
      if (y > 5) y = 0;
      if (y < 0) y = 5;
      p.setXY(i, x, y);
    }
    p.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} />;
}

export function Battlefield() {
  const quality = useSettings((s) => s.quality);
  const whiteArmy = useSettings((s) => s.whiteArmy);
  const blackArmy = whiteArmy === 'hellenic' ? 'persian' : 'hellenic';
  const hi = quality === 'high';
  const lo = quality === 'low';
  return (
    <>
      <Sky />
      <fog attach="fog" args={['#8d6a52', 22, lo ? 75 : 120]} />
      <hemisphereLight args={['#ffe2c0', '#4a3a2c', 1.1]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[-9, 11, -6]}
        intensity={3.4}
        color="#ffd6a8"
        castShadow={!lo}
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
      <directionalLight position={[8, 5, 9]} intensity={0.55} color="#8fa6ff" />
      <Ground />
      <Ruins />
      {[
        [-5.4, -0.35, 5.4],
        [5.4, -0.35, 5.4],
        [-5.4, -0.35, -5.4],
        [5.4, -0.35, -5.4],
      ].map((p, i) => (
        <Torch key={i} position={p as [number, number, number]} light={hi || (quality === 'medium' && i < 2)} />
      ))}
      <Banner position={[-6.3, -0.35, 6.3]} army={whiteArmy} rot={0.4} />
      <Banner position={[6.3, -0.35, 6.3]} army={whiteArmy} rot={-0.4} />
      <Banner position={[-6.3, -0.35, -6.3]} army={blackArmy} rot={Math.PI - 0.4} />
      <Banner position={[6.3, -0.35, -6.3]} army={blackArmy} rot={Math.PI + 0.4} />
      <Mountains />
      <Fortress position={[0, -1, -48]} rot={0} />
      {!lo && <Fortress position={[-20, -1, 52]} rot={Math.PI + 0.3} />}
      <Dust count={lo ? 120 : hi ? 600 : 300} />
    </>
  );
}
