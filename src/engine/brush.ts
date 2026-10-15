// Field brushes: how one brush dab changes the painted forces or a property channel.
import { clamp } from './math';
import { idx, type Field } from './field';
import type { Channel } from './params';

export type BrushTool = 'comb' | 'attract' | 'repel' | 'twist' | 'smooth' | 'erase' | 'scalar';
type V = { x: number; y: number; z: number };

export interface BrushDab {
  tool: BrushTool;
  hit: V;
  /** movement since the last dab (comb) */
  delta: V;
  /** brush plane normal (twist axis) */
  normal: V;
  radius: number;
  strength: number;
  /** Shift held: attract <-> repel, reverse twist, subtract property */
  invert: boolean;
  channel: Channel;
}

/** Apply one dab to `F.paint` (or a property channel). Call `recomputeField` afterwards. */
export function applyBrush(F: Field, b: BrushDab): void {
  const R = b.radius, R2 = R * R, n = b.normal, inv = b.invert, st = b.strength, tool = b.tool, hit = b.hit, delta = b.delta;
  const T = F.total, N = F.N;
  let avg: Float32Array | null = null;
  if (tool === 'smooth') {
    avg = new Float32Array(N * 3); const st3 = [1, F.nx, F.nx * F.ny], dims = [F.nx, F.ny, F.nz];
    for (let k = 0; k < F.nz; k++) for (let j = 0; j < F.ny; j++) for (let i = 0; i < F.nx; i++) {
      const c = idx(F, i, j, k), ijk = [i, j, k]; let cnt = 0;
      for (let a = 0; a < 3; a++) {
        if (ijk[a] > 0) { const m = c - st3[a]; avg[c * 3] += T[m * 3]; avg[c * 3 + 1] += T[m * 3 + 1]; avg[c * 3 + 2] += T[m * 3 + 2]; cnt++; }
        if (ijk[a] < dims[a] - 1) { const m = c + st3[a]; avg[c * 3] += T[m * 3]; avg[c * 3 + 1] += T[m * 3 + 1]; avg[c * 3 + 2] += T[m * 3 + 2]; cnt++; }
      }
      avg[c * 3] /= cnt; avg[c * 3 + 1] /= cnt; avg[c * 3 + 2] /= cnt;
    }
  }
  for (let c = 0; c < N; c++) {
    const dx = F.pos[c * 3] - hit.x, dy = F.pos[c * 3 + 1] - hit.y, dz = F.pos[c * 3 + 2] - hit.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > R2) continue;
    const q = 1 - d2 / R2, f = q * q * st;
    const d = Math.sqrt(d2) || 1e-6;
    let vx = 0, vy = 0, vz = 0;
    switch (tool) {
      case 'comb': { const s = 10 / Math.max(R, 0.2); vx = delta.x * s; vy = delta.y * s; vz = delta.z * s; break; }
      case 'attract': case 'repel': { const sg = ((tool === 'attract') !== inv) ? -1 : 1; vx = sg * dx / d * 0.7; vy = sg * dy / d * 0.7; vz = sg * dz / d * 0.7; break; }
      case 'twist': { const sg = inv ? -1 : 1; const cx = n.y * dz - n.z * dy, cy = n.z * dx - n.x * dz, cz = n.x * dy - n.y * dx, l = Math.hypot(cx, cy, cz) || 1; vx = sg * cx / l * 0.7; vy = sg * cy / l * 0.7; vz = sg * cz / l * 0.7; break; }
      case 'smooth': { vx = (avg![c * 3] - T[c * 3]) * 0.3; vy = (avg![c * 3 + 1] - T[c * 3 + 1]) * 0.3; vz = (avg![c * 3 + 2] - T[c * 3 + 2]) * 0.3; break; }
      case 'erase': { F.paint[c * 3] *= 1 - f * 0.3; F.paint[c * 3 + 1] *= 1 - f * 0.3; F.paint[c * 3 + 2] *= 1 - f * 0.3; continue; }
      case 'scalar': { const a = F.ch[b.channel]; a[c] = clamp(a[c] + (inv ? -1 : 1) * f * 0.12, 0, 1); continue; }
    }
    F.paint[c * 3] += vx * f; F.paint[c * 3 + 1] += vy * f; F.paint[c * 3 + 2] += vz * f;
    const l = Math.hypot(F.paint[c * 3], F.paint[c * 3 + 1], F.paint[c * 3 + 2]); if (l > 4) { F.paint[c * 3] *= 4 / l; F.paint[c * 3 + 1] *= 4 / l; F.paint[c * 3 + 2] *= 4 / l; }
  }
}
