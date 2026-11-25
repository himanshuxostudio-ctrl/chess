/** Instanced architectural pieces reused by several arenas. */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { stoneTexture } from '../../materials';

export interface Placement {
  x: number;
  z: number;
  h: number;
  rotY?: number;
  tilt?: number;
  s?: number;
}

/** Positions on a ring, leaving the two camera ends (±x) clear as the original arena did. */
export function ring(r: number, n: number, offset: number, h: (i: number) => number, keep = (_a: number) => true): Placement[] {
  const out: Placement[] = [];
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2;
    if (Math.abs(Math.cos(a)) > 0.8 || !keep(a)) continue;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: h(i), rotY: -a });
  }
  return out;
}

/** One InstancedMesh for a geometry repeated at the given placements (scaled on Y by h). */
export function Instances({ items, geometry, material, yOffset = 0, scaleY = true, cast = true }: {
  items: Placement[];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  yOffset?: number | ((p: Placement) => number);
  scaleY?: boolean;
  cast?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((p, i) => {
      q.setFromEuler(new THREE.Euler(p.tilt ?? 0, p.rotY ?? 0, (p.tilt ?? 0) * 0.5));
      const y = typeof yOffset === 'function' ? yOffset(p) : yOffset;
      const s = p.s ?? 1;
      m.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(s, scaleY ? p.h : s, s));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items, yOffset, scaleY]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow />;
}

export function useStone(color: string, roughness = 0.85, metalness = 0) {
  return useMemo(() => new THREE.MeshStandardMaterial({ map: stoneTexture(), color, roughness, metalness }), [color, roughness, metalness]);
}

/** Classical column: shaft + base + capital, as three instanced meshes. */
export function Columns({ items, material, capMaterial, radius = 0.32 }: { items: Placement[]; material: THREE.Material; capMaterial?: THREE.Material; radius?: number }) {
  const geos = useMemo(
    () => ({
      shaft: new THREE.CylinderGeometry(radius, radius * 1.15, 1, 16).translate(0, 0.5, 0),
      base: new THREE.BoxGeometry(radius * 3, 0.22, radius * 3),
      cap: new THREE.BoxGeometry(radius * 3, 0.24, radius * 3),
    }),
    [radius],
  );
  const whole = items.filter((p) => !p.tilt);
  return (
    <group>
      <Instances items={items} geometry={geos.shaft} material={material} yOffset={-0.35} />
      <Instances items={items} geometry={geos.base} material={material} yOffset={-0.25} scaleY={false} />
      <Instances items={whole} geometry={geos.cap} material={capMaterial ?? material} yOffset={(p) => p.h - 0.3} scaleY={false} />
    </group>
  );
}

/** Four-sided tapering obelisk with a pyramid tip. */
export function Obelisks({ items, material, tipMaterial }: { items: Placement[]; material: THREE.Material; tipMaterial?: THREE.Material }) {
  const geos = useMemo(
    () => ({
      shaft: new THREE.CylinderGeometry(0.28, 0.42, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
      tip: new THREE.ConeGeometry(0.3, 0.6, 4).rotateY(Math.PI / 4),
      plinth: new THREE.BoxGeometry(1.0, 0.35, 1.0),
    }),
    [],
  );
  return (
    <group>
      <Instances items={items} geometry={geos.plinth} material={material} yOffset={-0.2} scaleY={false} />
      <Instances items={items} geometry={geos.shaft} material={material} yOffset={-0.05} />
      <Instances items={items} geometry={geos.tip} material={tipMaterial ?? material} yOffset={(p) => p.h + 0.24} scaleY={false} />
    </group>
  );
}
