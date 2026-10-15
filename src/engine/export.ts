// Pole naming and fabrication exports.
import type { Vector3 } from 'three';
import { DOWELS, type Params } from './params';
import type { Model } from './types';

export function pname(id: number): string { return 'P' + String(id + 1).padStart(4, '0'); }

/** Stock lengths (mm) poles are cut from. */
export const STOCK_LEN = [1200, 1500, 1800, 2400, 3000];
export const stockFor = (lenM: number): number | undefined => STOCK_LEN.find(v => v >= lenM * 1000 + 20);

export function drillCSV(model: Model, P: Params): string {
  const rows = ['pole,stock_dia_mm,cut_length_mm,hole,from_end_A_mm,rotate_deg,tilt_deg,hole_dia_mm,connects_to'];
  for (const p of model.poles) p.holes.forEach((h, i) => rows.push([pname(p.id), p.dia, Math.round(p.len * 1000), 'H' + (i + 1), Math.round(h.pos * 1000), h.ang.toFixed(1), h.tilt.toFixed(1), DOWELS[P.dowel].hole, pname(h.other)].join(',')));
  return rows.join('\n');
}

export function modelJSON(model: Model, P: Params, order: readonly number[] | null): string {
  const r3 = (v: Vector3) => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
  return JSON.stringify({
    units: 'm', connector: DOWELS[P.dowel].label,
    poles: model.poles.map(p => ({ id: pname(p.id), a: r3(p.a), b: r3(p.b), diameter_mm: p.dia, grounded: p.grounded, holes: p.holes.map(h => ({ t: +h.t.toFixed(4), rotate_deg: +h.ang.toFixed(2), tilt_deg: +h.tilt.toFixed(2), to: pname(h.other) })) })),
    dowels: model.dowels.map(d => ({ a: pname(d.pi), b: pname(d.pj), gap_mm: Math.round(d.gap * 1000), length_mm: Math.round(d.len * 1000) })),
    assembly_order: order ? order.map(pname) : null,
  }, null, 1);
}
