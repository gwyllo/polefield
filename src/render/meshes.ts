// Merged pole mesh, proximity attributes and instanced dowels.
import * as THREE from 'three';
import { proxAt } from '../engine/patterns';
import { S } from '../state';
import { dowelGeo, dowelMat, poleMaterial, supportGeo, supportMat } from './pole-material';
import { gDowels, gPoles, gSupports } from './scene';

const NR = 12;

export let poleMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
export let dowelInst: THREE.InstancedMesh | null = null;
export let supportInst: THREE.InstancedMesh | null = null;
/** first vertex and vertex count of each pole in the merged mesh */
export let poleV0 = new Int32Array(0), poleVn = new Int32Array(0);
/** grounded pole id for each base plate instance */
export let supportPoles: number[] = [];
/** whether the pole mesh currently holds deformed positions */
export const meshState = { deformed: false };

const _px = [0, 0];

/** Build one merged mesh for every pole (with proximity attributes for the grooves) and the instanced dowels and base plates. */
export function buildMeshes(): void {
  const poles = S.poles;
  const nL = poles.map(p => Math.max(3, Math.ceil(p.len * 32)));
  poleV0 = new Int32Array(poles.length); poleVn = new Int32Array(poles.length);
  let V = 0, I = 0;
  poles.forEach((_, k) => { poleV0[k] = V; poleVn[k] = (nL[k] + 1) * (NR + 1) + 2 * (NR + 2); V += poleVn[k]; I += nL[k] * NR * 6 + 2 * NR * 3; });
  const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), col = new Float32Array(V * 3), rest = new Float32Array(V * 3), prox = new Float32Array(V * 2), ord = new Float32Array(V), ind = new Uint32Array(I);
  const c = new THREE.Vector3(), off = new THREE.Vector3();
  let v = 0, ii = 0;
  for (const p of poles) {
    const put = (t: number, ox: number, oy: number, oz: number, nx: number, ny: number, nz: number) => {
      c.copy(p.a).lerp(p.b, t); const x = c.x + ox, y = c.y + oy, z = c.z + oz;
      pos[v * 3] = rest[v * 3] = x; pos[v * 3 + 1] = rest[v * 3 + 1] = y; pos[v * 3 + 2] = rest[v * 3 + 2] = z; nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      proxAt(S.poles, S.nbr, p.id, x, y, z, _px); prox[v * 2] = _px[0]; prox[v * 2 + 1] = _px[1]; return v++;
    };
    const base = v, n = nL[p.id];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= NR; j++) {
      const th = j / NR * Math.PI * 2; off.copy(p.ref).multiplyScalar(Math.cos(th)).addScaledVector(p.w, Math.sin(th));
      put(i / n, off.x * p.r, off.y * p.r, off.z * p.r, off.x, off.y, off.z);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < NR; j++) { const a = base + i * (NR + 1) + j, b = a + NR + 1; ind[ii++] = a; ind[ii++] = b; ind[ii++] = a + 1; ind[ii++] = b; ind[ii++] = b + 1; ind[ii++] = a + 1; }
    for (const [t, s] of [[0, -1], [1, 1]]) {
      const ctr = put(t, 0, 0, 0, p.dir.x * s, p.dir.y * s, p.dir.z * s);
      for (let j = 0; j <= NR; j++) { const th = j / NR * Math.PI * 2; off.copy(p.ref).multiplyScalar(Math.cos(th)).addScaledVector(p.w, Math.sin(th)); put(t, off.x * p.r, off.y * p.r, off.z * p.r, p.dir.x * s, p.dir.y * s, p.dir.z * s); }
      for (let j = 0; j < NR; j++) { if (s < 0) { ind[ii++] = ctr; ind[ii++] = ctr + 2 + j; ind[ii++] = ctr + 1 + j; } else { ind[ii++] = ctr; ind[ii++] = ctr + 1 + j; ind[ii++] = ctr + 2 + j; } }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  g.setAttribute('aProx', new THREE.BufferAttribute(prox, 2)); g.setAttribute('aOrder', new THREE.BufferAttribute(ord, 1));
  g.setIndex(new THREE.BufferAttribute(ind, 1)); g.computeBoundingSphere();
  const mat = poleMesh ? poleMesh.material : poleMaterial();
  if (poleMesh) { gPoles.remove(poleMesh); poleMesh.geometry.dispose(); }
  poleMesh = new THREE.Mesh(g, mat); poleMesh.castShadow = true; poleMesh.receiveShadow = true; poleMesh.frustumCulled = false; gPoles.add(poleMesh);
  meshState.deformed = false;
  // dowels and base plates as instanced meshes
  if (dowelInst) { gDowels.remove(dowelInst); dowelInst.dispose(); }
  dowelInst = new THREE.InstancedMesh(dowelGeo, dowelMat, Math.max(1, S.dowels.length)); dowelInst.count = S.dowels.length; dowelInst.castShadow = true; dowelInst.frustumCulled = false;
  dowelInst.setColorAt(0, new THREE.Color()); gDowels.add(dowelInst);
  if (supportInst) { gSupports.remove(supportInst); supportInst.dispose(); }
  const gp = poles.filter(p => p.grounded);
  supportInst = new THREE.InstancedMesh(supportGeo, supportMat, Math.max(1, gp.length)); supportInst.count = gp.length; supportInst.frustumCulled = false;
  supportPoles = gp.map(p => p.id);
  gSupports.add(supportInst);
}
