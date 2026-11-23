import * as THREE from 'three';
import type { Square } from 'chess.js';

/** Mutable drag info shared by the board and actors without triggering React renders. */
export const dragState = {
  point: null as THREE.Vector3 | null,
  wasSelected: false,
  startedOn: null as Square | null,
};
