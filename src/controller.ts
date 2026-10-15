// App actions: everything that changes the model or the view state goes through here.
// The controller calls the engine and the renderer directly and announces UI refreshes on the event bus.
import { analyse } from './engine/fea';
import { makeOrder, stageBreaks, type Assembly } from './engine/assembly';
import { recomputeField, setupField } from './engine/field';
import { generate } from './engine/generate';
import { clamp } from './engine/math';
import type { Channel, PresetKey } from './engine/params';
import { poleNeighbours } from './engine/patterns';
import { computeImage } from './engine/sketch';
import type { Pole } from './engine/types';
import { emit } from './events';
import { cursor } from './render/brush';
import { applyDisplay, currentResult, updateLegend, updatePatternUniforms } from './render/display';
import { paintPlane, rebuildBoundsViz, rebuildImageViz, rebuildSketchViz, updateArrows, updateChannelViz } from './render/field-viz';
import { buildMeshes } from './render/meshes';
import { camera, controls } from './render/scene';
import { F, P, S, type Mode, type ToolId } from './state';

/* ------------------------------------------------------------------ field */
/** Recombine the field layers and refresh the field overlays. */
export function refreshField(): void {
  recomputeField(F, P, S.strokes, S.image);
  updateArrows(); updateChannelViz();
}

/** Load a preset volume, clearing sketches, image and undo history. */
export function loadPreset(key: PresetKey, keepParams = false): void {
  S.strokes = []; S.image = null; S.undo = [];
  setupField(F, key, P, keepParams);
  rebuildBoundsViz(); rebuildSketchViz(); rebuildImageViz();
  computeImage(F, P, S.image);
  refreshField();
}

/** Re-project the imported image after its plane or mode changed. */
export function reprojectImage(): void {
  if (!S.image) return;
  S.image.plane = P.imgPlane; computeImage(F, P, S.image); rebuildImageViz();
}

export function pushUndo(): void {
  S.undo.push({ paint: F.paint.slice(), ch: Object.fromEntries(Object.entries(F.ch).map(([k, v]) => [k, v.slice()])) as Record<Channel, Float32Array>, strokes: S.strokes.slice() });
  if (S.undo.length > 40) S.undo.shift();
}
export function undo(): void {
  const u = S.undo.pop(); if (!u) { emit('toast', 'Nothing to undo'); return; }
  F.paint.set(u.paint); for (const k of Object.keys(u.ch) as Channel[]) F.ch[k].set(u.ch[k]); S.strokes = u.strokes;
  rebuildSketchViz(); afterFieldEdit(); emit('toast', 'Undone');
}

let regenTimer = 0;
/** Debounce: run `fn` after `ms`, replacing anything already scheduled (field edits, pole and analysis parameters share one timer). */
export function schedule(fn: () => void, ms: number): void { clearTimeout(regenTimer); regenTimer = window.setTimeout(fn, ms); }

/** After painting, sketching or a field parameter change: recompute the field and, if live, rebuild the poles. */
export function afterFieldEdit(): void {
  refreshField();
  if (P.live) schedule(regenerate, 10);
  updatePatternUniforms(); updateLegend(currentResult());
}

export function clearPaint(): void { pushUndo(); F.paint.fill(0); afterFieldEdit(); emit('toast', 'Painted forces cleared'); }
export function clearSketch(): void {
  pushUndo(); S.strokes = []; S.image = null; computeImage(F, P, null); rebuildSketchViz(); rebuildImageViz(); afterFieldEdit(); emit('panel');
}

/* ------------------------------------------------------------------ poles */
/** Generate poles and dowels from the field and rebuild the meshes. Clears analysis and assembly results. */
export function generateModel(): void {
  const g = generate(F, P);
  S.poles = g.poles; S.dowels = g.dowels; S.pruned = g.pruned;
  S.nbr = poleNeighbours(S.poles);
  buildMeshes();
  S.res = null; S.asm = null;
  if (S.selected >= S.poles.length) S.selected = -1;
  applyDisplay();
}

export function regenerate(): void {
  const t = performance.now();
  generateModel();
  S.genMs = performance.now() - t;
  if (P.autoFea || S.mode === 'analyse') runAnalysis(); else { emit('status'); applyDisplay(); emit('panel'); }
  emit('stats');
}

/* ------------------------------------------------------------------ analysis */
let feaTimer = 0;
export function runAnalysis(): void {
  emit('progress', { label: `Solving ${S.poles.length} poles, ${S.dowels.length} dowels`, frac: 0.5 });
  clearTimeout(feaTimer);
  feaTimer = window.setTimeout(() => { // let the progress note paint before the solve blocks
    const pl = P.pointLoad > 0 && S.selected >= 0 ? { pole: S.selected, N: P.pointLoad } : null, t = performance.now();
    S.res = analyse(S, P, null, { pointLoad: pl }); S.res.ms = performance.now() - t;
    emit('progress', null); applyDisplay(); emit('status'); emit('panel');
  }, 30);
}

/** Invalidate results after an analysis parameter changed; re-run if results are on show. */
export function analysisParamChanged(): void {
  if (S.mode === 'analyse' || P.autoFea) schedule(runAnalysis, 30); else { S.res = null; emit('status'); }
  if (S.asm) S.asm.stale = true;
}

/* ------------------------------------------------------------------ assembly */
let seqToken = 0;
/** Simulate the assembly: analyse the standing structure after each stage, yielding between stages. */
export async function runSequence(): Promise<void> {
  const tok = ++seqToken; const order = makeOrder(S, P, P.strategy, F, S.asm?.order), n = order.length;
  const stages = stageBreaks(n, P.stages);
  const asm: Assembly = S.asm = { order, stages, steps: [], running: true, strategy: P.strategy }; S.asmStep = 0;
  emit('progress', { label: 'Simulating assembly', frac: 0 });
  const set = new Set<number>(); let placed = 0;
  for (let k = 0; k < stages.length; k++) {
    if (tok !== seqToken) return;
    while (placed < stages[k]) set.add(order[placed++]);
    const r = analyse(S, P, set, { props: P.props }); asm.steps.push(r);
    emit('progress', { label: `Simulating assembly · stage ${k + 1}/${stages.length}`, frac: (k + 1) / stages.length });
    S.asmStep = k; emit('timeline'); await new Promise(res => setTimeout(res, 0));
  }
  asm.running = false; emit('progress', null);
  const bad = asm.steps.findIndex(s => s.status === 'crit');
  S.asmStep = bad >= 0 ? bad : stages.length - 1;
  emit('timeline'); applyDisplay(); emit('panel');
  emit('toast', bad >= 0 ? `Stage ${bad + 1} fails: ${asm.steps[bad].issues[0]}` : 'Every stage stays within limits');
}

export function gotoStep(i: number): void {
  if (!S.asm) return; S.asmStep = clamp(i, 0, S.asm.steps.length - 1); emit('timeline'); emit('panel');
}

/** Move the selected pole one stage earlier (-1) or later (+1) in the order and re-run the sequence. */
export function moveInOrder(dir: number): void {
  if (!S.asm) return; const o = S.asm.order, i = o.indexOf(S.selected); if (i < 0) return;
  const j = clamp(i + dir * S.asm.stages[0], 0, o.length - 1); o.splice(i, 1); o.splice(j, 0, S.selected); P.strategy = 'custom'; runSequence();
}

/* ------------------------------------------------------------------ modes, tools, selection */
export function setTool(id: ToolId): void {
  S.tool = id; emit('chrome');
  if (paintPlane) paintPlane.visible = id !== 'nav';
  cursor.visible = false;
  if (id !== 'nav' && S.mode !== 'field') setMode('field');
  if (id !== 'nav') emit('panel');
  updateChannelViz(); emit('hud'); updateLegend(currentResult());
}

export function setMode(m: Mode): void {
  S.mode = m; emit('chrome');
  if (m !== 'field' && S.tool !== 'nav') setTool('nav');
  if (m === 'analyse' && !S.res) runAnalysis();
  if (m === 'fab' && S.selected < 0 && S.poles.length) S.selected = 0;
  emit('timeline'); applyDisplay(); emit('panel'); emit('hud');
  if (m === 'assemble' && !S.asm) runSequence();
}

export function select(id: number): void { S.selected = id; applyDisplay(); emit('panel'); }

/** Frame a pole, or the whole field volume. */
export function frameCamera(p?: Pole): void {
  if (p) {
    const c = p.a.clone().add(p.b).multiplyScalar(.5); const d = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(c); camera.position.copy(c).addScaledVector(d, p.len * 1.6 + 0.6); controls.update(); return;
  }
  const c = F.min.clone().add(F.max).multiplyScalar(.5), s = F.max.distanceTo(F.min);
  controls.target.copy(c); camera.position.set(c.x + s * 0.85, c.y + s * 0.55, c.z + s * 1.05); controls.update();
}
