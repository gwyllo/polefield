import { describe, expect, it } from 'vitest';
import { blockSolve, frameK, localEndForces, rbT } from '../src/engine/fea';
import { mulberry32 } from '../src/engine/math';
import { createField, setupField, recomputeField } from '../src/engine/field';
import { generate } from '../src/engine/generate';
import { defaultParams } from '../src/engine/params';

/** Random sparse SPD matrix of n 6x6 blocks in the format blockSolve takes. */
function randomSPD(n: number, seed: number) {
  const rnd = mulberry32(seed);
  const adj: number[][] = Array.from({ length: n }, () => []);
  const off = new Map<number, Float64Array>();
  const link = (a: number, b: number) => {
    if (a === b || adj[a].includes(b)) return;
    adj[a].push(b); adj[b].push(a);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    off.set(hi * n + lo, Float64Array.from({ length: 36 }, () => rnd() * 2 - 1));
  };
  for (let i = 1; i < n; i++) link(i, i - 1);                                       // a chain keeps it connected
  for (let k = 0; k < n * 2; k++) link(Math.floor(rnd() * n), Math.floor(rnd() * n)); // plus random fill
  // diagonal blocks: random symmetric, then made strictly diagonally dominant so the whole matrix is SPD
  const rowAbs = new Float64Array(n * 6);
  for (const [key, M] of off) {
    const a = Math.floor(key / n), c = key - a * n;
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) { rowAbs[a * 6 + r] += Math.abs(M[r * 6 + q]); rowAbs[c * 6 + q] += Math.abs(M[r * 6 + q]); }
  }
  const diag = Array.from({ length: n }, (_, i) => {
    const D = new Float64Array(36);
    for (let r = 0; r < 6; r++) for (let q = 0; q < r; q++) D[r * 6 + q] = D[q * 6 + r] = rnd() * 2 - 1;
    for (let r = 0; r < 6; r++) { let s = 0; for (let q = 0; q < 6; q++) if (q !== r) s += Math.abs(D[r * 6 + q]); D[r * 7] = s + rowAbs[i * 6 + r] + 1 + rnd(); }
    return D;
  });
  const pos = Float64Array.from({ length: n * 3 }, () => rnd() * 10);
  const b = Float64Array.from({ length: n * 6 }, () => rnd() * 2 - 1);
  return { diag, off, adj, pos, b };
}

/** y = K x for the block format. */
function mulK(n: number, diag: Float64Array[], off: Map<number, Float64Array>, x: Float64Array): Float64Array {
  const y = new Float64Array(n * 6);
  for (let i = 0; i < n; i++) for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) y[i * 6 + r] += diag[i][r * 6 + q] * x[i * 6 + q];
  for (const [key, M] of off) {
    const a = Math.floor(key / n), c = key - a * n; // block (a,c) and its transpose (c,a)
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) { y[a * 6 + r] += M[r * 6 + q] * x[c * 6 + q]; y[c * 6 + q] += M[r * 6 + q] * x[a * 6 + r]; }
  }
  return y;
}

describe('blockSolve', () => {
  it('solves a random sparse SPD system to a residual below 1e-10', () => {
    const n = 300;
    const { diag, off, adj, pos, b } = randomSPD(n, 42);
    const { x, bad } = blockSolve(n, diag, off, b, pos, adj);
    expect(bad).toEqual([]);
    const Kx = mulK(n, diag, off, x);
    let res = 0; for (let i = 0; i < n * 6; i++) res = Math.max(res, Math.abs(Kx[i] - b[i]));
    expect(res).toBeLessThan(1e-10);
  });
});

describe('dowel beam', () => {
  // linearised rigid motion of the whole structure: translation t and small rotation th about the origin
  const t = [0.003, -0.002, 0.001], th = [0.0004, -0.0007, 0.0005];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const bodyDofs = (c: number[]) => { const w = cross(th, c); return Float64Array.from([t[0] + w[0], t[1] + w[1], t[2] + w[2], ...th]); };
  const dw = { E: 200e9, G: 77e9, d: 0.0085 };
  const A = Math.PI * dw.d ** 2 / 4, I = Math.PI * dw.d ** 4 / 64, J = 2 * I;

  it('carries no force when both poles move as one rigid body', () => {
    const P = defaultParams(), F = createField();
    setupField(F, 'truss', P); recomputeField(F, P, [], null);
    const { poles, dowels } = generate(F, P);
    let worst = 0, scale = 0;
    for (const d of dowels.slice(0, 200)) {
      const pA = poles[d.pi], pB = poles[d.pj];
      const pa = pA.a.clone().lerp(pA.b, d.ti), pb = pB.a.clone().lerp(pB.b, d.tj);
      const ca = pA.a.clone().add(pA.b).multiplyScalar(0.5), cb = pB.a.clone().add(pB.b).multiplyScalar(0.5);
      const fk = frameK(pa.toArray(), pb.toArray(), dw.E, dw.G, A, I, J);
      const TA = rbT(pa.x - ca.x, pa.y - ca.y, pa.z - ca.z), TB = rbT(pb.x - cb.x, pb.y - cb.y, pb.z - cb.z);
      const uA = bodyDofs(ca.toArray()), uB = bodyDofs(cb.toArray());
      const ug = new Float64Array(12);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { ug[i] += TA[i * 6 + j] * uA[j]; ug[6 + i] += TB[i * 6 + j] * uB[j]; }
      const f = localEndForces(fk, ug);
      for (const v of f) worst = Math.max(worst, Math.abs(v));
      // force scale: the same beam pulled apart axially by 1 mm
      scale = Math.max(scale, dw.E * A / fk.L * 1e-3);
    }
    expect(dowels.length).toBeGreaterThan(200);
    expect(worst / scale).toBeLessThan(1e-9);
  });

  it('does carry force when the poles move apart (sanity check)', () => {
    const fk = frameK([0, 0, 0], [0.1, 0, 0], dw.E, dw.G, A, I, J);
    const ug = new Float64Array(12); ug[6] = 1e-3;
    expect(Math.abs(localEndForces(fk, ug)[0])).toBeCloseTo(dw.E * A / 0.1 * 1e-3, 3);
  });
});
