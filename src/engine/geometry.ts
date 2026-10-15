// Segment distance queries and a spatial hash for pole pairs.
import type { Vector3 } from 'three';
import { clamp } from './math';
import type { Pole } from './types';

type P3 = Pick<Vector3, 'x' | 'y' | 'z'>;

export interface SegClosest {
  /** parameters of the closest points on each segment */
  s: number; t: number;
  d: number;
  /** vector from the second segment's closest point to the first's */
  nx: number; ny: number; nz: number;
  parallel: boolean;
}

/** Closest points between segments p1–q1 and p2–q2. */
export function segClosest(p1: P3, q1: P3, p2: P3, q2: P3): SegClosest {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z, d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z, rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz, c = d1x * rx + d1y * ry + d1z * rz, b = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = a * e - b * b; let s: number, t: number, parallel = false;
  if (den > 1e-4 * a * e) { s = clamp((b * f - c * e) / den, 0, 1); }
  else { parallel = true; const t0 = clamp((-c) / a, 0, 1), t1 = clamp((b - c) / a, 0, 1); s = (t0 + t1) / 2; }
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const cx = p1.x + d1x * s - (p2.x + d2x * t), cy = p1.y + d1y * s - (p2.y + d2y * t), cz = p1.z + d1z * s - (p2.z + d2z * t);
  return { s, t, d: Math.sqrt(cx * cx + cy * cy + cz * cz), nx: cx, ny: cy, nz: cz, parallel };
}

export function distPointSeg(x: number, y: number, z: number, a: P3, b: P3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, qx = x - a.x, qy = y - a.y, qz = z - a.z, ll = dx * dx + dy * dy + dz * dz;
  const t = ll > 0 ? clamp((qx * dx + qy * dy + qz * dz) / ll, 0, 1) : 0, ux = qx - dx * t, uy = qy - dy * t, uz = qz - dz * t;
  return Math.sqrt(ux * ux + uy * uy + uz * uz);
}

/** Spatial hash: flat list [i,j,i,j,...] of pole pairs whose segments may come within `extra` of each other. */
export function polePairs(poles: readonly Pick<Pole, 'a' | 'b' | 'len'>[], extra: number): number[] {
  const n = poles.length; if (!n) return [];
  let maxL = 0; for (const p of poles) maxL = Math.max(maxL, p.len);
  const h = maxL + extra, grid = new Map<number, number[]>(), key = (i: number, j: number, k: number) => (i + 512) + 1024 * ((j + 512) + 1024 * (k + 512));
  const mx = new Float64Array(n * 3), cell = new Int32Array(n * 3);
  poles.forEach((p, i) => {
    mx[i * 3] = (p.a.x + p.b.x) / 2; mx[i * 3 + 1] = (p.a.y + p.b.y) / 2; mx[i * 3 + 2] = (p.a.z + p.b.z) / 2;
    for (let a = 0; a < 3; a++) cell[i * 3 + a] = Math.floor(mx[i * 3 + a] / h);
    const k = key(cell[i * 3], cell[i * 3 + 1], cell[i * 3 + 2]); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
  });
  const pairs: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = grid.get(key(cell[i * 3] + dx, cell[i * 3 + 1] + dy, cell[i * 3 + 2] + dz)); if (!l) continue;
      for (const j of l) {
        if (j <= i) continue; const lim = (poles[i].len + poles[j].len) / 2 + extra;
        const ex = mx[i * 3] - mx[j * 3], ey = mx[i * 3 + 1] - mx[j * 3 + 1], ez = mx[i * 3 + 2] - mx[j * 3 + 2];
        if (ex * ex + ey * ey + ez * ez <= lim * lim) pairs.push(i, j);
      }
    }
  }
  return pairs;
}

/** Connected-component label for each of `n` nodes, optionally ignoring edges whose ends fail `filter`. */
export function components(n: number, edges: readonly { pi: number; pj: number }[], filter?: (id: number) => boolean): number[] {
  const par = [...Array(n).keys()], f = (x: number) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const d of edges) { const i = d.pi, j = d.pj; if (filter && (!filter(i) || !filter(j))) continue; par[f(i)] = f(j); }
  return par.map((_, i) => f(i));
}
