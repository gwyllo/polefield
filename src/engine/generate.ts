// Pole seeding, flow alignment, relaxation, grounding and dowel joints.
import { Vector3 } from 'three';
import { clamp, DEG, lerp, mulberry32 } from './math';
import { fieldDir, sScalar, type Field } from './field';
import { polePairs, segClosest } from './geometry';
import { DOWELS, STOCK_DIA, type Params } from './params';
import type { Dowel, Pole } from './types';

export interface Generated {
  poles: Pole[];
  dowels: Dowel[];
  /** poles removed by the two-dowel rule */
  pruned: number;
}

function traceEnd(F: Field, c: Vector3, len: number, sgn: number): Vector3 {
  const q = c.clone(), d = new Vector3(), prev = fieldDir(F, c, new Vector3()).multiplyScalar(sgn); const n = Math.max(2, Math.ceil(len / 0.05));
  for (let i = 0; i < n; i++) { fieldDir(F, q, d); if (d.dot(prev) < 0) d.negate(); q.addScaledVector(d, len / n); prev.copy(d); }
  return q;
}
function refMark(d: Vector3): Vector3 {
  const up = new Vector3(0, 1, 0), r = up.clone().addScaledVector(d, -d.dot(up));
  if (r.length() < 0.15) { r.set(1, 0, 0).addScaledVector(d, -d.x); }
  return r.normalize();
}

/** Seed poles in the field, relax overlaps, ground them and dowel neighbours. Deterministic for a given seed. */
export function generate(F: Field, P: Params): Generated {
  const rng = mulberry32(P.seed * 9973 + 17), seeds: Vector3[] = [], m = 0.06, sz = new Vector3().subVectors(F.max, F.min);
  const gh = P.spacing * 0.7, grid = new Map<number, Vector3[]>(), key = (i: number, j: number, k: number) => (i + 512) + 1024 * ((j + 512) + 1024 * (k + 512));
  const maxA = P.count * 300;
  for (let a = 0; a < maxA && seeds.length < P.count; a++) {
    const p = new Vector3(F.min.x + m + rng() * (sz.x - 2 * m), F.min.y + 0.1 + rng() * (sz.y - 0.1 - m), F.min.z + m + rng() * (sz.z - 2 * m));
    const d = clamp(sScalar(F, F.densEff, p), 0, 1);
    if (rng() > Math.pow(d, 1.4)) continue;
    const sp = P.spacing * (1.35 - 0.5 * d), sp2 = sp * sp, ci = Math.floor(p.x / gh), cj = Math.floor(p.y / gh), ck = Math.floor(p.z / gh), R = Math.ceil(sp / gh);
    let ok = true;
    for (let dx = -R; dx <= R && ok; dx++) for (let dy = -R; dy <= R && ok; dy++) for (let dz = -R; dz <= R && ok; dz++) {
      const l = grid.get(key(ci + dx, cj + dy, ck + dz)); if (l) for (const q of l) if (q.distanceToSquared(p) < sp2) { ok = false; break; }
    }
    if (!ok) continue;
    seeds.push(p); const k = key(ci, cj, ck); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(p);
  }
  const poles: Pole[] = seeds.map((c, i) => {
    const L = Math.round(lerp(P.lenMin, P.lenMax, clamp(sScalar(F, F.ch.length, c), 0, 1)) * 40) / 40;
    const f = traceEnd(F, c, L / 2, 1), b = traceEnd(F, c, L / 2, -1);
    const dir = new Vector3().subVectors(f, b); if (dir.length() < 1e-3) fieldDir(F, c, dir); dir.normalize();
    const mid = f.clone().add(b).multiplyScalar(0.5);
    const up = new Vector3(0, 1, 0); const n1 = new Vector3().crossVectors(dir, up); if (n1.length() < 0.1) n1.set(1, 0, 0); n1.normalize();
    const n2 = new Vector3().crossVectors(n1, dir).normalize();
    const ang = (rng() < 0.5 ? -1 : 1) * P.weave * DEG * (0.75 + 0.5 * rng());
    dir.applyAxisAngle(P.weaveAxis === 'inplane' ? n1 : n2, ang).normalize();
    let dia = lerp(P.diaMin, P.diaMax, clamp(sScalar(F, F.ch.diameter, mid), 0, 1));
    if (P.stock) dia = STOCK_DIA.reduce((a, v) => Math.abs(v - dia) < Math.abs(a - dia) ? v : a, STOCK_DIA[0]);
    return {
      id: i, a: mid.clone().addScaledVector(dir, -L / 2), b: mid.clone().addScaledVector(dir, L / 2), dir, len: L, dia, r: dia / 2000,
      tint: clamp(sScalar(F, F.ch.tint, mid), 0, 1), grounded: false, holes: [], ref: new Vector3(), w: new Vector3(),
    };
  });
  relax(poles, P, 10);
  for (const p of poles) groundPole(p, P);
  return makeJoints(poles, P);
}

function relax(poles: Pole[], P: Params, iters: number): void {
  const clear = P.clear / 1000, mv = new Vector3(), rng = mulberry32(P.seed + 3);
  const pairs = polePairs(poles, 0.15);
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    for (let q = 0; q < pairs.length; q += 2) {
      const A = poles[pairs[q]], B = poles[pairs[q + 1]];
      const need = A.r + B.r + clear;
      const r = segClosest(A.a, A.b, B.a, B.b);
      if (r.d >= need) continue;
      if (r.d < 1e-5) { mv.crossVectors(A.dir, B.dir); if (mv.length() < 1e-3) mv.set(rng() - .5, rng() - .5, rng() - .5); mv.normalize(); }
      else mv.set(r.nx / r.d, r.ny / r.d, r.nz / r.d);
      const push = (need - r.d) / 2 + 0.002;
      A.a.addScaledVector(mv, push); A.b.addScaledVector(mv, push); B.a.addScaledVector(mv, -push); B.b.addScaledVector(mv, -push); moved++;
    }
    if (!moved) break;
  }
}

function groundPole(p: Pole, P: Params): void {
  if (p.a.y > p.b.y) { const t = p.a; p.a = p.b; p.b = t; } // end A = lower end
  p.dir.subVectors(p.b, p.a).normalize();
  if (p.a.y < P.snap && p.dir.y > 0.2) {
    const s = p.b.y / (p.b.y - p.a.y), na = p.b.clone().lerp(p.a, s);
    if (na.distanceTo(p.b) <= P.lenMax * 1.4) { p.a.copy(na); p.grounded = true; }
  }
  if (!p.grounded && p.a.y < 0) { const s = p.b.y / (p.b.y - p.a.y); p.a.copy(p.b.clone().lerp(p.a, s)); p.grounded = true; }
  p.len = p.a.distanceTo(p.b); p.dir.subVectors(p.b, p.a).normalize();
  p.ref = refMark(p.dir); p.w = new Vector3().crossVectors(p.dir, p.ref);
}

interface Candidate { i: number; j: number; ti: number; tj: number; d: number; tilt: number }

function makeJoints(poles: Pole[], P: Params): Generated {
  const n = poles.length, reach = P.reach / 1000, ed = P.endDist / 1000, hs = P.holeSpace / 1000;
  const sub = (p: Pole): [Vector3, Vector3, number] => { const e = Math.min(ed, p.len * 0.3); return [p.a.clone().addScaledVector(p.dir, e), p.b.clone().addScaledVector(p.dir, -e), e]; };
  const segs = poles.map(sub);
  const tryPair = (i: number, j: number, maxD: number): Candidate | null => {
    const A = poles[i], B = poles[j]; const [a0, a1, ea] = segs[i], [b0, b1, eb] = segs[j];
    const r = segClosest(a0, a1, b0, b1);
    if (r.d > maxD || r.d < A.r + B.r + 0.004) return null;
    const ti = (ea + r.s * (A.len - 2 * ea)) / A.len, tj = (eb + r.t * (B.len - 2 * eb)) / B.len;
    const pa = A.a.clone().lerp(A.b, ti), pb = B.a.clone().lerp(B.b, tj), dd = new Vector3().subVectors(pb, pa).normalize();
    const tilt = Math.min(Math.acos(Math.abs(dd.dot(A.dir))), Math.acos(Math.abs(dd.dot(B.dir)))) / DEG;
    if (tilt < 50) return null;
    return { i, j, ti, tj, d: r.d, tilt };
  };
  const pairs = polePairs(poles, reach * 1.75), nb: number[][] = Array.from({ length: n }, () => []), cands: Candidate[] = [];
  for (let q = 0; q < pairs.length; q += 2) { const i = pairs[q], j = pairs[q + 1]; nb[i].push(j); nb[j].push(i); const c = tryPair(i, j, reach); if (c) cands.push(c); }
  cands.sort((x, y) => x.d - y.d);
  const holes: number[][] = poles.map(() => []), dowels: Candidate[] = [], has = new Set<number>();
  const par = new Int32Array(n).map((_, i) => i), gf = Uint8Array.from(poles.map(p => p.grounded ? 1 : 0));
  const find = (x: number) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const ok = (c: Candidate, maxJ: number) => {
    if (holes[c.i].length >= maxJ || holes[c.j].length >= maxJ) return false;
    const si = c.ti * poles[c.i].len, sj = c.tj * poles[c.j].len;
    if (holes[c.i].some(h => Math.abs(h - si) < hs) || holes[c.j].some(h => Math.abs(h - sj) < hs)) return false;
    return true;
  };
  const add = (c: Candidate) => {
    holes[c.i].push(c.ti * poles[c.i].len); holes[c.j].push(c.tj * poles[c.j].len); dowels.push(c);
    has.add(Math.min(c.i, c.j) * n + Math.max(c.i, c.j)); const a = find(c.i), b = find(c.j); if (a !== b) { par[a] = b; gf[b] |= gf[a]; }
  };
  for (const c of cands) if (ok(c, P.maxJ)) add(c);
  // connectivity pass: link clusters that do not reach the ground, with a longer reach
  for (let pass = 0; pass < 2; pass++) {
    const extra: Candidate[] = [];
    for (let q = 0; q < pairs.length; q += 2) {
      const i = pairs[q], j = pairs[q + 1], a = find(i), b = find(j);
      if (a === b || (gf[a] && gf[b])) continue; const c = tryPair(i, j, reach * 1.7); if (c) extra.push(c);
    }
    extra.sort((x, y) => x.d - y.d);
    for (const c of extra) { const a = find(c.i), b = find(c.j); if (a === b || (gf[a] && gf[b])) continue; if (ok(c, P.maxJ + 1)) add(c); }
  }
  // every free-standing pole needs two dowels, otherwise it swings on the one it has
  for (let i = 0; i < n; i++) {
    if (poles[i].grounded || holes[i].length >= 2) continue;
    const extra: Candidate[] = []; for (const j of nb[i]) { if (has.has(Math.min(i, j) * n + Math.max(i, j))) continue; const c = tryPair(i, j, reach * 1.5); if (c) extra.push(c); }
    extra.sort((x, y) => x.d - y.d);
    for (const c of extra) { if (holes[i].length >= 2) break; if (ok(c, P.maxJ + 2)) add(c); }
  }
  if (P.prune) {
    // drop poles left with fewer than two dowels; repeat because removing one can strand a neighbour
    const keep = poles.map(() => true);
    for (let pass = 0; pass < 4; pass++) {
      const cnt = poles.map(() => 0); for (const d of dowels) if (keep[d.i] && keep[d.j]) { cnt[d.i]++; cnt[d.j]++; }
      let changed = false; poles.forEach((p, i) => { if (keep[i] && !p.grounded && cnt[i] < 2) { keep[i] = false; changed = true; } });
      if (!changed) break;
    }
    if (keep.some(k => !k)) {
      const o2n = new Int32Array(n).fill(-1), kept: Pole[] = [];
      poles.forEach((p, i) => { if (keep[i]) { o2n[i] = kept.length; kept.push(p); } });
      kept.forEach((p, k) => p.id = k);
      const nd = dowels.filter(d => keep[d.i] && keep[d.j]).map(d => ({ ...d, i: o2n[d.i], j: o2n[d.j] }));
      return { poles: kept, dowels: finishJoints(kept, nd, P), pruned: n - kept.length };
    }
  }
  return { poles, dowels: finishJoints(poles, dowels, P), pruned: 0 };
}

/** Turn joint candidates into dowels and drill holes (rotation and tilt from each pole's reference mark). */
function finishJoints(poles: Pole[], cands: Candidate[], P: Params): Dowel[] {
  const dw = DOWELS[P.dowel];
  const dowels: Dowel[] = cands.map((c, k) => {
    const A = poles[c.i], B = poles[c.j];
    return { id: k, pi: c.i, pj: c.j, ti: c.ti, tj: c.tj, gap: c.d, tilt: c.tilt, len: c.d + A.r + B.r + 0.04, r: dw.d / 2 };
  });
  for (const p of poles) p.holes = [];
  for (const d of dowels) {
    for (const [pid, t, oid, ot] of [[d.pi, d.ti, d.pj, d.tj], [d.pj, d.tj, d.pi, d.ti]]) {
      const p = poles[pid], o = poles[oid];
      const pa = p.a.clone().lerp(p.b, t), pb = o.a.clone().lerp(o.b, ot), v = pb.sub(pa).normalize();
      let ang = Math.atan2(v.dot(p.w), v.dot(p.ref)) / DEG; if (ang < 0) ang += 360;
      const tilt = Math.acos(clamp(v.dot(p.dir), -1, 1)) / DEG; // angle between dowel and pole axis
      p.holes.push({ dowel: d.id, t, pos: t * p.len, ang, tilt, other: oid });
    }
  }
  for (const p of poles) p.holes.sort((a, b) => a.t - b.t);
  return dowels;
}
