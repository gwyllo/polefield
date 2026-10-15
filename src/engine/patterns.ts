// Proximity maths behind the generative grooves (mirrors the pole shader on the CPU).
import { clamp, lerp } from './math';
import { distPointSeg, polePairs, segClosest } from './geometry';
import type { Params, PatType } from './params';
import type { Pole } from './types';

/** Distances beyond this (m) count as "no neighbour". */
export const PROX_MAX = 0.45;
export const PAT_TYPES: Record<PatType, number> = { halo: 0, cells: 1, fringe: 2, mix: 3 };

/** For each pole, the poles whose surfaces come within PROX_MAX of it. */
export function poleNeighbours(poles: readonly Pole[]): number[][] {
  const pairs = polePairs(poles, PROX_MAX), nbr: number[][] = poles.map(() => []);
  for (let q = 0; q < pairs.length; q += 2) {
    const i = pairs[q], j = pairs[q + 1], A = poles[i], B = poles[j];
    if (segClosest(A.a, A.b, B.a, B.b).d - A.r - B.r < PROX_MAX) { nbr[i].push(j); nbr[j].push(i); }
  }
  return nbr;
}

/** Distance from a point on pole `pid` to the surfaces of its two nearest neighbouring poles. */
export function proxAt(poles: readonly Pole[], nbr: readonly number[][], pid: number, x: number, y: number, z: number, out: number[]): number[] {
  let d1 = PROX_MAX, d2 = PROX_MAX;
  for (const j of nbr[pid]) { const q = poles[j]; const d = distPointSeg(x, y, z, q.a, q.b) - q.r; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  out[0] = Math.max(0, d1); out[1] = Math.max(0, d2); return out;
}

/** Pattern settings in shader units (m). */
export interface PatternConfig { type: number; freq: number; halfW: number; range: number; phase: number; taper: boolean }
export function patternConfig(P: Params): PatternConfig {
  return { type: PAT_TYPES[P.patType], freq: 1000 / P.patSpacing, halfW: P.patWidth / 2000, range: P.patRange / 1000, phase: P.patPhase, taper: P.patTaper };
}

/** Distance to the nearest groove centreline for proximity distances d1 <= d2. */
export function patDist(d1: number, d2: number, c: PatternConfig): number {
  const f = c.freq, ph = c.phase, R = c.range;
  if (d1 > R) return 1;
  const bands = (v: number) => Math.abs((((v * f + ph + 0.5) % 1) + 1) % 1 - 0.5) / f;
  const halo = bands(d1); let cells = (d2 - d1) * 0.5, fringe = bands((d2 - d1) * 0.5);
  if (d2 > R * 1.6) { cells = 1; fringe = 1; }
  switch (c.type) { case 0: return halo; case 1: return cells; case 2: return fringe; default: return Math.min(halo, cells); }
}
export function patHalfW(d1: number, c: PatternConfig): number {
  const t = clamp(d1 / c.range, 0, 1); return c.halfW * (c.taper ? lerp(1.6, 0.3, t) : 1);
}
