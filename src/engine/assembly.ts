// Assembly ordering and staging.
import type { Vector3 } from 'three';
import { mulberry32 } from './math';
import type { Params, Strategy } from './params';
import type { AnalysisResult } from './fea';
import type { Model } from './types';

export interface Assembly {
  /** pole ids in placement order */
  order: number[];
  /** cumulative pole count placed after each stage */
  stages: number[];
  /** analysis of the standing structure after each stage */
  steps: AnalysisResult[];
  running: boolean;
  strategy: Strategy;
  stale?: boolean;
}

/** Placement order for a strategy. `bounds` is the field box; `previous` is kept for the custom strategy. */
export function makeOrder(model: Model, P: Params, strategy: Strategy, bounds: { min: Vector3; max: Vector3 }, previous?: readonly number[]): number[] {
  const poles = model.poles, n = poles.length, adj: number[][] = Array.from({ length: n }, () => []);
  for (const d of model.dowels) { adj[d.pi].push(d.pj); adj[d.pj].push(d.pi); }
  const midY = (p: typeof poles[number]) => (p.a.y + p.b.y) / 2, midX = (p: typeof poles[number]) => (p.a.x + p.b.x) / 2;
  if (strategy === 'bottom') return poles.slice().sort((a, b) => Math.min(a.a.y, a.b.y) - Math.min(b.a.y, b.b.y) || midY(a) - midY(b)).map(p => p.id);
  if (strategy === 'sweep') return poles.slice().sort((a, b) => midX(a) - midX(b)).map(p => p.id);
  if (strategy === 'random') { const r = mulberry32(P.seed + 99), o = poles.map(p => p.id); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; }
  if (strategy === 'custom' && previous && previous.length === n) return previous.slice();
  // greedy: start at one end on the ground, then always place the pole with the most dowels into what is already standing
  const placed = new Uint8Array(n), conn = new Int32Array(n), order: number[] = [], xmin = bounds.min.x, xr = Math.max(bounds.max.x - bounds.min.x, 1);
  const my = poles.map(midY), mx = poles.map(p => (midX(p) - xmin) / xr);
  while (order.length < n) {
    let best = -1, bs = -1e9;
    for (let i = 0; i < n; i++) {
      if (placed[i]) continue; const p = poles[i];
      const s = (p.grounded ? 6 : 0) + Math.min(conn[i], 2) * 10 + conn[i] - my[i] * 0.6 - mx[i] * 14;
      if (s > bs) { bs = s; best = i; }
    }
    placed[best] = 1; order.push(best); for (const o of adj[best]) conn[o]++;
  }
  return order;
}

/** Cumulative pole counts for `stages` roughly equal stages of `n` poles. */
export function stageBreaks(n: number, stages: number): number[] {
  const per = Math.max(1, Math.ceil(n / stages)), out: number[] = [];
  for (let k = per; k < n; k += per) out.push(k);
  out.push(n);
  return out;
}

/** 1-based first and last pole placed in stage k. */
export function stageRange(asm: Assembly, k: number): [number, number] {
  const a = k ? asm.stages[k - 1] : 0; return [a + 1, asm.stages[k]];
}
