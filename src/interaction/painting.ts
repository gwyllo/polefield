// Pointer input in the viewport: brushes, sketching, picking, brush-plane depth.
import * as THREE from 'three';
import { applyBrush, type BrushTool } from '../engine/brush';
import { segClosest } from '../engine/geometry';
import { clamp } from '../engine/math';
import type { Stroke } from '../engine/types';
import { afterFieldEdit, pushUndo, refreshField, select } from '../controller';
import { emit } from '../events';
import { ball, cursor, hitPlane, plane, pointerRay, ring, setBrushRadius, updatePlane } from '../render/brush';
import { rebuildSketchViz } from '../render/field-viz';
import { controls, renderer } from '../render/scene';
import { F, P, S } from '../state';

let painting = false, lastHit: THREE.Vector3 | null = null, stroke: Stroke | null = null, downXY: [number, number] | null = null;

function dab(hit: THREE.Vector3, e: PointerEvent): void {
  applyBrush(F, {
    tool: S.tool as BrushTool, hit, delta: lastHit ? hit.clone().sub(lastHit) : new THREE.Vector3(), normal: plane.normal,
    radius: P.radius, strength: P.strength, invert: e.shiftKey, channel: P.channel,
  });
  refreshField();
}

const cv = renderer.domElement;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  downXY = [e.clientX, e.clientY];
  const paintTool = S.tool !== 'nav';
  // with a brush active, left paints and right orbits; Alt+left still orbits
  controls.mouseButtons.LEFT = (!paintTool || e.altKey) ? THREE.MOUSE.ROTATE : null;
  controls.mouseButtons.RIGHT = paintTool ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
  controls.mouseButtons.MIDDLE = paintTool ? THREE.MOUSE.PAN : THREE.MOUSE.DOLLY;
  if (paintTool && e.button === 0 && !e.altKey) {
    const h = hitPlane(e); if (!h) return;
    painting = true; cv.setPointerCapture(e.pointerId); pushUndo(); lastHit = h;
    if (S.tool === 'sketch') { stroke = { pts: [h.clone()], extrude: null }; S.strokes.push(stroke); rebuildSketchViz(); }
    else dab(h, e);
  }
}, true);
cv.addEventListener('pointermove', e => {
  if (S.tool === 'nav') { cursor.visible = false; return; }
  const h = hitPlane(e); if (!h) { cursor.visible = false; return; }
  cursor.visible = true; cursor.position.copy(h); setBrushRadius(P.radius); ball.visible = S.tool !== 'sketch';
  if (S.tool === 'sketch') ring.scale.setScalar(0.04);
  if (!painting) return;
  if (S.tool === 'sketch' && stroke) { if (h.distanceTo(stroke.pts[stroke.pts.length - 1]) > 0.04) { stroke.pts.push(h.clone()); rebuildSketchViz(); } return; }
  dab(h, e); lastHit = h;
});
cv.addEventListener('pointerleave', () => { if (!painting) cursor.visible = false; });
cv.addEventListener('pointerup', e => {
  const moved = downXY ? Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) : 99;
  if (painting) {
    painting = false; lastHit = null;
    if (S.tool === 'sketch' && stroke) { if (stroke.pts.length < 3) { S.strokes.pop(); S.undo.pop(); } rebuildSketchViz(); stroke = null; }
    afterFieldEdit();
    return;
  }
  if (S.tool === 'nav' && e.button === 0 && moved < 5) pick(e);
});
cv.addEventListener('wheel', e => {
  if (!e.shiftKey || S.tool === 'nav') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const dv = (e.deltaY || e.deltaX) > 0 ? -0.08 : 0.08;
  if (P.planeMode === 'h') P.planeH = clamp(P.planeH + dv, F.min.y, F.max.y); else P.planeD = clamp(P.planeD + dv, -4, 4);
  emit('inputs'); updatePlane(); emit('hud');
}, { capture: true, passive: false });

/** Select the nearest pole under the pointer: analytic ray / pole-capsule test, cheaper than raycasting the merged mesh. */
function pick(e: PointerEvent): void {
  const ray = pointerRay(e), o = ray.origin, far = o.clone().addScaledVector(ray.direction, 300);
  const asm = S.mode === 'assemble' && S.asm && S.asm.steps.length ? S.asm : null, rank = new Int32Array(S.poles.length);
  if (asm) asm.order.forEach((id, i) => rank[id] = i);
  const lim = asm ? asm.stages[S.asmStep + 1] ?? asm.stages[S.asmStep] : 1e9;
  let best = -1, bs = 1e9;
  for (const p of S.poles) { if (asm && rank[p.id] >= lim) continue; const q = segClosest(o, far, p.a, p.b); if (q.d < p.r * 1.6 + 0.006 && q.s < bs) { bs = q.s; best = p.id; } }
  select(best);
}
