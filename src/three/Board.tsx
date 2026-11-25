/**
 * The ancient stone chessboard: 64 individually selectable weathered-marble tiles aligned exactly
 * with the engine's coordinates (see sqToXZ), plus move/capture/last-move highlights.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Square } from 'chess.js';
import { useGame } from '../game/store';
import { sqToXZ, xzToSq } from '../game/choreography';
import { useSettings } from '../config/settings';
import { marbleTexture, stoneTexture } from './materials';
import { arenaTheme } from './arena/themes';
import { dragState } from './dragState';

const SQUARES: Square[] = [];
for (let r = 1; r <= 8; r++) for (let f = 0; f < 8; f++) SQUARES.push(`${'abcdefgh'[f]}${r}` as Square);

const tileGeo = new THREE.BoxGeometry(0.97, 0.12, 0.97);
const markerGeo = new THREE.CircleGeometry(0.13, 24).rotateX(-Math.PI / 2);
const captureGeo = new THREE.RingGeometry(0.36, 0.46, 4, 1).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
const specialGeo = new THREE.RingGeometry(0.2, 0.27, 6).rotateX(-Math.PI / 2);
const tintGeo = new THREE.PlaneGeometry(0.97, 0.97).rotateX(-Math.PI / 2);

function coordTexture(labels: string[], flip: boolean) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 1024, 64);
  ctx.font = '600 40px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((l, i) => {
    const x = 64 + i * 128;
    ctx.fillStyle = 'rgba(15,10,5,0.75)';
    ctx.fillText(l.toUpperCase(), x + 2, 34);
    ctx.fillStyle = 'rgba(230,200,130,0.9)';
    ctx.fillText(l.toUpperCase(), x, 32);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (flip) {
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI;
  }
  return t;
}

export function Board() {
  const lastMove = useGame((s) => s.lastMove);
  const selected = useGame((s) => s.selected);
  const legal = useGame((s) => s.legal);
  const hover = useGame((s) => s.hover);
  const dragging = useGame((s) => s.dragging);
  const animating = useGame((s) => !!s.anim);
  const showHints = useSettings((s) => s.showHints);
  // Only the look of the squares changes per battlefield; geometry and coordinates never do.
  const look = arenaTheme(useGame((s) => s.battlefield)).board;

  const mats = useMemo(() => {
    const light = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: marbleTexture(look.light.base, look.light.vein, i + 1), roughness: 0.55, metalness: 0.02 }));
    const dark = [0, 1, 2, 3].map((i) => new THREE.MeshStandardMaterial({ map: marbleTexture(look.dark.base, look.dark.vein, i + 7), roughness: 0.5, metalness: 0.05 }));
    return { light, dark };
  }, [look]);
  useEffect(() => () => [...mats.light, ...mats.dark].forEach((m) => (m.map?.dispose(), m.dispose())), [mats]);
  const frame = useMemo(() => {
    const t = stoneTexture();
    t.repeat.set(4, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, color: look.frame });
  }, [look]);
  const trim = useMemo(() => (look.trim ? new THREE.MeshStandardMaterial({ color: look.trim, metalness: 0.9, roughness: 0.3 }) : null), [look]);
  const coords = useMemo(() => {
    const files = 'abcdefgh'.split('');
    const ranks = '12345678'.split('');
    const mk = (labels: string[], flip: boolean) =>
      new THREE.MeshBasicMaterial({ map: coordTexture(labels, flip), transparent: true, depthWrite: false, toneMapped: false });
    return { filesNear: mk(files, false), filesFar: mk(files, true), ranksLeft: mk(ranks, false), ranksRight: mk(ranks, true) };
  }, []);

  const overlayMat = useMemo(
    () => ({
      move: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
      capture: new THREE.MeshBasicMaterial({ color: '#ff4a32', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
      special: new THREE.MeshBasicMaterial({ color: '#7fd4ff', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
      last: new THREE.MeshBasicMaterial({ color: '#e0a83a', transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }),
      selected: new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }),
      hover: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }),
    }),
    [],
  );

  // pulse markers
  const markers = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    const k = 0.75 + Math.sin(clock.elapsedTime * 4) * 0.2;
    overlayMat.move.opacity = 0.85 * k;
    overlayMat.capture.opacity = 0.95 * k;
    overlayMat.special.opacity = 0.95 * k;
    if (markers.current) markers.current.position.y = 0.122 + Math.sin(clock.elapsedTime * 4) * 0.004;
  });

  // Global pointer-up ends any drag even if released off the board.
  useEffect(() => {
    const up = () => useGame.getState().endDrag();
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const onTileClick = (sq: Square) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 10) return; // camera orbit, not a click
    if (dragState.startedOn) {
      dragState.startedOn = null;
      return;
    }
    useGame.getState().clickSquare(sq);
  };
  const onTileDown = (sq: Square) => (e: ThreeEvent<PointerEvent>) => {
    // pressing on the tile under one of your units starts a drag too
    const s = useGame.getState();
    const p = s.match.chess.get(sq);
    if (p && p.color === s.match.turn && !s.anim) {
      e.stopPropagation();
      dragState.wasSelected = s.selected === sq;
      dragState.startedOn = sq;
      s.startDrag(sq);
    }
  };

  const onDragMove = (e: ThreeEvent<PointerEvent>) => {
    dragState.point = (dragState.point ?? new THREE.Vector3()).copy(e.point);
    useGame.getState().setHover(xzToSq(e.point.x, e.point.z));
  };

  const legalTargets = animating ? [] : legal;

  return (
    <group>
      {/* tiles */}
      {SQUARES.map((sq) => {
        const [x, z] = sqToXZ(sq);
        const f = sq.charCodeAt(0) - 97, r = Number(sq[1]) - 1;
        const dark = (f + r) % 2 === 0;
        const variant = (f * 3 + r * 5) % 4;
        return (
          <mesh
            key={sq}
            geometry={tileGeo}
            material={dark ? mats.dark[variant] : mats.light[variant]}
            position={[x, 0, z]}
            receiveShadow
            onClick={onTileClick(sq)}
            onPointerDown={onTileDown(sq)}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (!useGame.getState().dragging) useGame.getState().setHover(sq);
            }}
          />
        );
      })}

      {/* raised stone frame with carved coordinates */}
      <group>
        {[
          [0, -4.35, 9.3, 0.7],
          [0, 4.35, 9.3, 0.7],
          [-4.35, 0, 0.7, 8],
          [4.35, 0, 0.7, 8],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} position={[x, 0.02, z]} material={frame} receiveShadow castShadow>
            <boxGeometry args={[w, 0.2, d]} />
          </mesh>
        ))}
        <mesh position={[0, -0.2, 0]} material={frame} receiveShadow>
          <boxGeometry args={[9.9, 0.3, 9.9]} />
        </mesh>
        {trim &&
          [
            [0, -4.06, 8.2, 0.07],
            [0, 4.06, 8.2, 0.07],
            [-4.06, 0, 0.07, 8.2],
            [4.06, 0, 0.07, 8.2],
          ].map(([x, z, w, d], i) => (
            <mesh key={`t${i}`} position={[x, 0.125, z]} material={trim}>
              <boxGeometry args={[w, 0.02, d]} />
            </mesh>
          ))}
        <mesh position={[0, 0.125, 4.35]} rotation={[-Math.PI / 2, 0, 0]} material={coords.filesNear}>
          <planeGeometry args={[8, 0.5]} />
        </mesh>
        <mesh position={[0, 0.125, -4.35]} rotation={[-Math.PI / 2, 0, 0]} material={coords.filesFar}>
          <planeGeometry args={[8, 0.5]} />
        </mesh>
        <mesh position={[-4.35, 0.125, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} material={coords.ranksLeft}>
          <planeGeometry args={[8, 0.5]} />
        </mesh>
        <mesh position={[4.35, 0.125, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} material={coords.ranksRight}>
          <planeGeometry args={[8, 0.5]} />
        </mesh>
      </group>

      {/* highlights */}
      {lastMove &&
        [lastMove.from, lastMove.to].map((sq) => {
          const [x, z] = sqToXZ(sq);
          return <mesh key={`l${sq}`} geometry={tintGeo} material={overlayMat.last} position={[x, 0.062, z]} renderOrder={1} />;
        })}
      {selected && !animating && (
        <mesh geometry={tintGeo} material={overlayMat.selected} position={[sqToXZ(selected)[0], 0.063, sqToXZ(selected)[1]]} renderOrder={1} />
      )}
      {hover && !animating && (
        <mesh geometry={tintGeo} material={overlayMat.hover} position={[sqToXZ(hover)[0], 0.064, sqToXZ(hover)[1]]} renderOrder={1} />
      )}
      {showHints && (
        <group ref={markers} position={[0, 0.122, 0]}>
          {legalTargets.map((m) => {
            const [x, z] = sqToXZ(m.to);
            const special = m.flags.includes('k') || m.flags.includes('q') || m.flags.includes('e') || !!m.promotion;
            const cap = !!m.captured;
            return (
              <group key={m.to + (m.promotion ?? '')} position={[x, 0, z]}>
                {cap ? <mesh geometry={captureGeo} material={overlayMat.capture} renderOrder={3} /> : <mesh geometry={markerGeo} material={overlayMat.move} renderOrder={3} />}
                {special && <mesh geometry={specialGeo} material={overlayMat.special} position={[0, 0.002, 0]} renderOrder={3} />}
              </group>
            );
          })}
        </group>
      )}

      {/* invisible drag plane, only while dragging */}
      {dragging && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerMove={onDragMove} visible={false}>
          <planeGeometry args={[30, 30]} />
        </mesh>
      )}
    </group>
  );
}
