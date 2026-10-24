// Funções pequenas compartilhadas pelos cenários (sem dependência circular).
import * as THREE from 'three';
const tmp = new THREE.Color();
export const lerpHex = (a, b, t) => tmp.set(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getHex();
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
