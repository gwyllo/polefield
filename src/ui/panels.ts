// Inspector panels, parameter binding and clipboard exports.
import { stageRange } from '../engine/assembly';
import { drillCSV, modelJSON, pname, stockFor } from '../engine/export';
import { components } from '../engine/geometry';
import { CHANNELS, DOWELS, GRADES, PRESETS, type Params } from '../engine/params';
import {
  afterFieldEdit, analysisParamChanged, clearPaint, clearSketch, frameCamera, gotoStep, loadPreset, moveInOrder,
  pushUndo, regenerate, reprojectImage, runAnalysis, runSequence, schedule, select,
} from '../controller';
import { emit, on } from '../events';
import { updatePlane } from '../render/brush';
import { applyDisplay, currentResult, updateLegend, updatePatternUniforms } from '../render/display';
import { updateArrows, updateChannelViz } from '../render/field-viz';
import { F, P, S } from '../state';
import { toolById } from './chrome';
import { $ } from './dom';
import { exampleSketch } from './import';
import { toast } from './status';
import { drawUnroll } from './unroll';

type K = keyof Params;
const pv = (k: K) => P[k] as string | number | boolean;

// panel helpers
function fmtV(v: number | string, step: number | string, unit: string, fmt?: (v: number) => string): string {
  if (fmt) return fmt(+v); const dp = String(step).includes('.') ? String(step).split('.')[1].length : 0; return (+v).toFixed(dp) + (unit ? ' ' + unit : '');
}
const R = (k: K, label: string, min: number, max: number, step: number, unit = '') => `<div class="row"><label for="i_${k}">${label}</label><input type="range" id="i_${k}" data-p="${k}" min="${min}" max="${max}" step="${step}" value="${pv(k)}"><output data-o="${k}">${fmtV(pv(k) as number, step, unit)}</output></div>`;
const SEL = (k: K, label: string, opts: Record<string, string>) => `<div class="row two"><label for="i_${k}">${label}</label><select id="i_${k}" data-p="${k}">${Object.entries(opts).map(([v, l]) => `<option value="${v}"${String(pv(k)) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`;
const CHK = (k: K, label: string) => `<label class="check"><input type="checkbox" id="i_${k}" data-p="${k}"${pv(k) ? ' checked' : ''}> ${label}</label>`;
const COL = (k: K, label: string) => `<div class="row two"><label for="i_${k}">${label}</label><input type="color" id="i_${k}" data-p="${k}" value="${pv(k)}"></div>`;
const labels = <T extends { label: string }>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.label]));

const KEYS: Record<string, K[]> = {
  fieldViz: ['showChannel', 'channel', 'radius', 'strength', 'planeMode', 'planeH', 'planeD'],
  poles: ['count', 'seed', 'lenMin', 'lenMax', 'diaMin', 'diaMax', 'stock', 'weave', 'weaveAxis', 'spacing', 'snap', 'reach', 'maxJ', 'holeSpace', 'endDist', 'dowel', 'clear', 'prune'],
  look: ['colorBy', 'woodA', 'woodB'],
  pattern: ['patOn', 'patType', 'patRange', 'patSpacing', 'patWidth', 'patTaper', 'patPhase'],
  analysis: ['grade', 'support', 'clamp', 'loadFactor', 'pointLoad', 'limitDisp', 'limitUtil'],
  display: ['defScale', 'resultColor', 'ghosts'],
  seq: ['strategy', 'props', 'stages'],
};

function onParam(k: K): void {
  if (k === 'preset') { loadPreset(P.preset); regenerate(); frameCamera(); renderPanel(); return; }
  if (['baseStrength', 'noise', 'sketchW', 'sketchR', 'imgW'].includes(k)) { afterFieldEdit(); return; }
  if (k === 'imgMode' || k === 'imgPlane') { reprojectImage(); afterFieldEdit(); return; }
  if (k === 'arrows' || k === 'arrowLen') { updateArrows(); applyDisplay(); return; }
  if (KEYS.fieldViz.includes(k)) { updatePlane(); emit('hud'); updateChannelViz(); updateLegend(currentResult()); if (k === 'channel' || k === 'showChannel') renderPanel(); return; }
  if (KEYS.poles.includes(k)) { schedule(regenerate, 30); return; }
  if (KEYS.look.includes(k)) { applyDisplay(); if (S.mode === 'fab') renderPanel(); return; }
  if (KEYS.pattern.includes(k)) { updatePatternUniforms(); applyDisplay(); if (S.mode === 'fab' || S.mode === 'pattern') renderPanelSoft(); return; }
  if (k === 'autoFea') { if (P.autoFea && !S.res) runAnalysis(); return; }
  if (KEYS.analysis.includes(k)) { analysisParamChanged(); return; }
  if (KEYS.display.includes(k)) { applyDisplay(); return; }
  if (KEYS.seq.includes(k)) { if (S.asm) S.asm.stale = true; renderPanel(); return; }
}

function bindPanel(root: HTMLElement): void {
  root.querySelectorAll<HTMLInputElement>('[data-p]').forEach(el => {
    const k = el.dataset.p as K;
    const handler = () => {
      let v: string | number | boolean = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (k === 'lenMin' && +v > P.lenMax) v = P.lenMax; if (k === 'lenMax' && +v < P.lenMin) v = P.lenMin;
      if (k === 'diaMin' && +v > P.diaMax) v = P.diaMax; if (k === 'diaMax' && +v < P.diaMin) v = P.diaMin;
      (P as Record<K, unknown>)[k] = v;
      const o = root.querySelector<HTMLElement>(`[data-o="${k}"]`); if (o) o.textContent = fmtV(v as number, el.step, o.dataset.u || (o.textContent!.split(' ')[1] || ''));
      onParam(k);
    };
    el.addEventListener(el.type === 'range' ? 'input' : 'change', handler);
  });
}

/** Push parameter values (changed by shortcuts or the wheel) back into the panel inputs. */
export function syncInputs(): void {
  document.querySelectorAll<HTMLInputElement>('#side [data-p]').forEach(el => {
    const k = el.dataset.p as K; if (el.type === 'checkbox') el.checked = !!P[k]; else el.value = String(P[k]);
    const o = document.querySelector(`#side [data-o="${k}"]`); if (o && el.type === 'range') { const u = o.textContent!.split(' ')[1] || ''; o.textContent = fmtV(P[k] as number, el.step, u); }
  });
}

/** Refresh only the fabrication drawing / pattern stats. */
export function renderPanelSoft(): void {
  const cvs = document.getElementById('unroll') as HTMLCanvasElement | null;
  if (cvs && S.selected >= 0) { const L = drawUnroll(cvs, S.poles[S.selected]); const el = document.getElementById('routeLen'); if (el) el.textContent = (L).toFixed(2) + ' m'; }
}

function warningsHTML(): string {
  const n = S.poles.length; if (!n) return '';
  const comp = components(n, S.dowels), gnd = new Set<number>(); S.poles.forEach(p => { if (p.grounded) gnd.add(comp[p.id]); });
  const floating = S.poles.filter(p => !gnd.has(comp[p.id])), single = S.poles.filter(p => !p.grounded && p.holes.length === 1);
  const out: string[] = [];
  if (floating.length) out.push(`<div class="note crit"><b>${floating.length} pole${floating.length > 1 ? 's' : ''} not connected to the ground</b> (${floating.slice(0, 8).map(p => pname(p.id)).join(', ')}${floating.length > 8 ? '…' : ''}). Increase dowel reach or paint more density between clusters.</div>`);
  if (single.length) out.push(`<div class="note warn"><b>${single.length} pole${single.length > 1 ? 's' : ''} hang on a single dowel</b> and rely on nut clamping to stop rotation.</div>`);
  if (!out.length) out.push(`<div class="note">Every pole is connected to the ground through dowels.</div>`);
  return out.join('');
}

export function renderPanel(): void {
  const side = $('#side'), m = S.mode; let h = '';
  if (m === 'field') {
    h += `<div class="sec"><h3>Volume and base flow</h3>${SEL('preset', 'Preset', labels(PRESETS))}
      ${R('baseStrength', 'Base flow', 0, 2, 0.05)}${R('noise', 'Turbulence', 0, 1.5, 0.05)}
      <div class="btns"><button class="btn" id="resetField">Clear painted forces</button></div></div>`;
    h += `<div class="sec"><h3>Brush <span class="cap">${toolById(S.tool).name}</span></h3>
      ${S.tool === 'nav' ? '<p>Pick a brush from the left rail (or press C, A, R, T, S, E, D, P) and drag in the viewport. Strokes land on the brush plane; Shift+wheel moves the plane through the volume.</p>' : ''}
      ${R('radius', 'Radius', 0.1, 4, 0.05, 'm')}${R('strength', 'Strength', 0.05, 1.5, 0.05)}
      ${SEL('planeMode', 'Brush plane', { view: 'Facing the view', h: 'Horizontal' })}
      ${P.planeMode === 'h' ? R('planeH', 'Height', 0, +F.max.y.toFixed(1), 0.02, 'm') : R('planeD', 'Depth', -6, 6, 0.02, 'm')}
      ${SEL('channel', 'Paint property', CHANNELS)}
      ${SEL('showChannel', 'Show property', { none: 'Off', ...CHANNELS })}</div>`;
    h += `<div class="sec"><h3>Sketch input</h3><p>Sketch strokes and imported drawings become guides the flow follows. Images also map dark areas to density.</p>
      ${R('sketchW', 'Sketch pull', 0, 4, 0.1)}${R('sketchR', 'Reach', 0.15, 1.5, 0.05, 'm')}
      <div class="btns"><button class="btn" id="exSketch">Load example sketch</button><button class="btn" id="impSvg">Import SVG</button><button class="btn" id="impImg">Import image</button><button class="btn" id="clrSketch">Clear</button></div>
      ${SEL('imgPlane', 'Project onto', { xy: 'Front (elevation)', xz: 'Ground (plan)' })}
      ${SEL('imgMode', 'Image drives', { both: 'Direction and density', contour: 'Direction only', density: 'Density only' })}
      ${R('imgW', 'Image pull', 0, 4, 0.1)}
      <p class="cap">${S.strokes.length} stroke${S.strokes.length === 1 ? '' : 's'} · ${S.image ? 'image: ' + S.image.name : 'no image'}</p></div>`;
    h += `<div class="sec"><h3>Display</h3>${CHK('arrows', 'Show field arrows')}${R('arrowLen', 'Arrow length', 0.05, 0.5, 0.01, 'm')}${CHK('live', 'Rebuild poles after each stroke')}${CHK('autoFea', 'Run FEA after every change')}
      <div class="btns"><button class="btn primary" id="regen">Rebuild poles</button></div>${S.genMs ? `<p class="cap">Last rebuild: ${S.poles.length} poles in ${Math.round(S.genMs)} ms</p>` : ''}</div>`;
  }
  if (m === 'poles') {
    h += `<div class="sec"><h3>Poles</h3><p>Poles are seeded where the density field is high, aligned to the flow, then crossed by the weave angle so neighbours can be doweled.</p>
      ${R('count', 'Count', 100, 3000, 50)}<div class="row"><label for="i_seed">Seed</label><input type="range" id="i_seed" data-p="seed" min="1" max="200" step="1" value="${P.seed}"><output data-o="seed">${P.seed}</output></div>
      ${R('lenMin', 'Length min', 0.2, 2.4, 0.025, 'm')}${R('lenMax', 'Length max', 0.3, 3, 0.025, 'm')}
      ${R('diaMin', 'Ø min', 18, 50, 1, 'mm')}${R('diaMax', 'Ø max', 18, 50, 1, 'mm')}${CHK('stock', 'Snap to stock diameters (22–45 mm)')}
      ${R('weave', 'Weave angle', 0, 60, 1, '°')}${SEL('weaveAxis', 'Weave', { lateral: 'Lateral (shell lattice)', inplane: 'In plane (truss)' })}
      ${R('spacing', 'Spacing', 0.06, 0.6, 0.01, 'm')}${R('snap', 'Ground snap', 0, 1, 0.05, 'm')}${R('clear', 'Clearance', 5, 80, 1, 'mm')}</div>`;
    h += `<div class="sec"><h3>Dowel joints</h3>${SEL('dowel', 'Connector', labels(DOWELS))}
      ${R('reach', 'Max gap', 60, 500, 5, 'mm')}${R('maxJ', 'Joints / pole', 1, 8, 1)}${R('holeSpace', 'Hole spacing', 40, 400, 5, 'mm')}${R('endDist', 'End distance', 20, 250, 5, 'mm')}${CHK('prune', 'Remove poles with fewer than 2 dowels')}${S.pruned ? `<p class="cap">${S.pruned} pole${S.pruned > 1 ? 's' : ''} removed by this rule</p>` : ''}</div>`;
    h += `<div class="sec"><h3>Colour</h3>${SEL('colorBy', 'Colour by', { timber: 'Timber (tint field)', length: 'Length', diameter: 'Diameter', connect: 'Joint count', order: 'Assembly order' })}
      ${COL('woodA', 'Timber light')}${COL('woodB', 'Timber dark')}</div>`;
    h += `<div class="sec"><h3>Checks</h3>${warningsHTML()}</div>`;
  }
  if (m === 'pattern') {
    h += `<div class="sec"><h3>Generative grooves</h3><p>Grooves are generated from how close each pole's surface comes to its neighbours in space. Lines tighten and thicken where poles approach each other and carry from pole to pole, so the pattern reads across the whole structure.</p>
      ${CHK('patOn', 'Show grooves')}
      ${SEL('patType', 'Pattern', { mix: 'Halos + territory edges', halo: 'Proximity halos', cells: 'Territory edges (Voronoi)', fringe: 'Interference fringes' })}
      ${R('patRange', 'Reach', 40, 450, 5, 'mm')}${R('patSpacing', 'Line spacing', 8, 120, 1, 'mm')}${R('patWidth', 'Groove width', 1, 12, 0.5, 'mm')}
      ${CHK('patTaper', 'Grooves widen near neighbours')}${R('patPhase', 'Phase', 0, 1, 0.01)}
      <p class="cap"><b>Halos</b>: lines of equal distance to the nearest pole. <b>Territory</b>: where a surface is equally close to its two nearest poles. <b>Fringes</b>: lines of constant difference between those two distances.</p></div>`;
    h += `<div class="sec"><h3>Toolpath estimate</h3>${S.selected >= 0 ? `<p>${pname(S.selected)}: <b id="routeLen">…</b> of groove on this pole.</p><canvas class="unroll" id="unroll"></canvas>` : '<p>Select a pole in the viewport to see its unrolled surface and routed length.</p>'}</div>`;
  }
  if (m === 'analyse') {
    const r = S.res;
    h += `<div class="sec"><h3>Load case</h3><p>Linear 3D frame model. Each pole is a rigid body; dowels and pole bases are beam elements, with partial torsional clamping from the nuts. Pole bending stress is recovered from the joint forces.</p>
      ${SEL('grade', 'Timber', labels(GRADES))}
      ${SEL('support', 'Base', { fixed: 'Fixed (ground plate)', pinned: 'Pinned' })}
      ${R('clamp', 'Nut clamping', 1, 100, 1, '%')}${R('loadFactor', 'Load factor', 1, 2, 0.05)}
      ${R('pointLoad', 'Point load', 0, 1000, 10, 'N')}<p class="cap">${P.pointLoad > 0 ? (S.selected >= 0 ? 'Applied at mid-length of ' + pname(S.selected) : 'Select a pole to apply the point load') : 'Self-weight only'}</p>
      ${R('limitDisp', 'Deflection limit', 2, 50, 1, 'mm')}${R('limitUtil', 'Stress limit', 50, 150, 5, '%')}
      ${CHK('autoFea', 'Re-run after every design change')}
      <div class="btns"><button class="btn primary" id="runFea">Run analysis</button></div></div>`;
    if (!r) h += `<div class="sec"><p>Results are out of date. Run the analysis to update them.</p></div>`;
    if (r) {
      const crit = r.crit ? (r.crit.kind === 'pole' ? pname(r.crit.id) : 'dowel ' + pname(S.dowels[r.crit.id].pi) + '–' + pname(S.dowels[r.crit.id].pj)) : '–';
      const mass = S.poles.reduce((s, p) => s + Math.PI * p.r * p.r * p.len * GRADES[P.grade].rho, 0) + S.dowels.reduce((s, d) => s + Math.PI * (DOWELS[P.dowel].d / 2) ** 2 * d.len * DOWELS[P.dowel].rho, 0);
      h += `<div class="sec"><h3>Result <span class="pill ${r.status}">${r.status === 'ok' ? 'stable' : r.status === 'warn' ? 'check' : 'fails'}</span></h3>
        <dl class="kv"><dt>Max deflection</dt><dd>${(r.maxDisp * 1000).toFixed(2)} mm</dd><dt>Max stress utilisation</dt><dd>${Math.round(r.maxUtil * 100)}%</dd><dt>Critical member</dt><dd>${crit}</dd>
        <dt>Self-weight</dt><dd>${mass.toFixed(1)} kg</dd><dt>Free / unstable poles</dt><dd>${r.floating.length} / ${r.mech.length}</dd><dt>Solve time</dt><dd>${r.ms ? Math.round(r.ms) + ' ms' : '–'}</dd></dl>
        ${r.issues.map(s => `<div class="note crit">${s}</div>`).join('')}
        ${SEL('resultColor', 'Colour by', { util: 'Stress utilisation', disp: 'Displacement' })}${R('defScale', 'Shape scale', 0, 3, 0.1, '×')}</div>`;
      const top = [...r.poleUtil.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      h += `<div class="sec"><h3>Most stressed poles</h3><div class="list">${top.map(([id, u]) => `<div class="li ${u > P.limitUtil / 100 ? 'crit' : u > 0.7 * P.limitUtil / 100 ? 'warn' : 'ok'}${id === S.selected ? ' cur' : ''}" data-sel="${id}"><span class="n">${pname(id)}</span><span>${Math.round(S.poles[id].len * 1000)} mm · Ø${S.poles[id].dia}</span><span class="s">${Math.round(u * 100)}%</span></div>`).join('')}</div></div>`;
    }
  }
  if (m === 'assemble') {
    const a = S.asm;
    h += `<div class="sec"><h3>Assembly sequence</h3><p>Poles are placed in stages. After each stage the frame analysis re-runs on what is standing, to check the partial structure holds up and stays within tolerance for holographic placement.</p>
      ${SEL('strategy', 'Order', { greedy: 'Connected growth (grounded first)', bottom: 'Bottom up', sweep: 'Sweep along X', random: 'Random (stress test)', custom: 'Custom (edited below)' })}
      ${R('stages', 'Stages', 5, 80, 1)}<p class="cap">${Math.ceil(S.poles.length / P.stages)} poles per stage</p>
      ${R('limitDisp', 'Deflection limit', 2, 50, 1, 'mm')}${R('limitUtil', 'Stress limit', 50, 150, 5, '%')}
      ${CHK('props', 'Add temporary supports under poles that are not yet connected')}${CHK('ghosts', 'Show unplaced poles faintly')}
      <div class="btns"><button class="btn primary" id="runSeq">${a ? 'Re-run sequence' : 'Run sequence'}</button></div>
      ${a && a.stale ? '<div class="note warn">Settings changed since this run. Re-run to update.</div>' : ''}</div>`;
    if (a && a.steps.length) {
      const bad = a.steps.filter(s => s.status === 'crit').length, warn = a.steps.filter(s => s.status === 'warn').length;
      const peak = a.steps.reduce((m, s) => Math.max(m, s.maxDisp), 0), peakU = a.steps.reduce((m, s) => Math.max(m, s.maxUtil), 0);
      h += `<div class="sec"><h3>Summary <span class="pill ${bad ? 'crit' : warn ? 'warn' : 'ok'}">${bad ? bad + ' failing' : warn ? warn + ' to check' : 'feasible'}</span></h3>
        <dl class="kv"><dt>Stages</dt><dd>${a.stages.length} × ${a.stages[0]} poles</dd><dt>Peak deflection</dt><dd>${(peak * 1000).toFixed(1)} mm</dd><dt>Peak utilisation</dt><dd>${Math.round(peakU * 100)}%</dd><dt>Temporary supports</dt><dd>${a.steps.reduce((m, s) => Math.max(m, s.props.length), 0)} max</dd></dl>
        ${S.selected >= 0 ? `<div class="btns"><button class="btn" id="mvEarly">Place ${pname(S.selected)} a stage earlier</button><button class="btn" id="mvLate">Later</button></div>` : '<p class="cap">Select a pole to move it in the order.</p>'}</div>`;
      h += `<div class="sec"><h3>Stages</h3><div class="list" id="stepList">${a.steps.map((st, i) => { const [p0, p1] = stageRange(a, i); return `<div class="li ${st.status}${i === S.asmStep ? ' cur' : ''}" data-step="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>poles ${p0}–${p1}</span><span class="s ${st.status}">${st.status === 'crit' ? (st.floating.length && !st.props.length ? 'free' : st.mech.length ? 'swings' : st.maxUtil > P.limitUtil / 100 ? 'over' : 'sags') : (st.maxDisp * 1000).toFixed(1) + ' mm'}</span></div>`; }).join('')}</div></div>`;
    }
  }
  if (m === 'fab') {
    const p = S.poles[S.selected];
    if (p) {
      const stockLen = stockFor(p.len) ?? 'custom';
      h += `<div class="sec"><h3>${pname(p.id)} <span class="cap">${p.grounded ? 'grounded' : 'free'} · ${p.holes.length} holes</span></h3>
        <dl class="kv"><dt>Cut length</dt><dd>${Math.round(p.len * 1000)} mm</dd><dt>Diameter</dt><dd>${p.dia} mm</dd><dt>Cut from stock</dt><dd>${stockLen} mm</dd><dt>Groove length</dt><dd id="routeLen">…</dd></dl>
        <canvas class="unroll" id="unroll"></canvas>
        <p class="cap">Unrolled surface from end A. Filled ellipses: drill entry; outlined: through-hole exit. 0° is the reference line marked along the top of the pole.</p>
        <div class="btns"><button class="btn" id="fPrev">&#8249; Previous</button><button class="btn" id="fNext">Next &#8250;</button><button class="btn" id="fFrame">Zoom to pole</button></div></div>`;
      h += `<div class="sec"><h3>Drill schedule</h3><div class="tblwrap"><table><thead><tr><th>Hole</th><th>From A</th><th>Rotate</th><th>Tilt</th><th>Ø</th><th>To</th></tr></thead><tbody>
        ${p.holes.map((hl, i) => `<tr><td>H${i + 1}</td><td>${Math.round(hl.pos * 1000)}</td><td>${hl.ang.toFixed(1)}°</td><td>${hl.tilt.toFixed(1)}°</td><td>${DOWELS[P.dowel].hole}</td><td>${pname(hl.other)}</td></tr>`).join('')}</tbody></table></div>
        <p class="cap">mm. Rotate = angle around the pole from the 0° mark. Tilt = angle between hole and pole axis (90° is square).</p></div>`;
    } else h += `<div class="sec"><h3>Fabrication</h3><p>Select a pole in the viewport.</p></div>`;
    const bins: Record<string, number> = {}; for (const q of S.poles) { const s = stockFor(q.len) ?? '>3000'; const k = `${q.dia} mm × ${s}`; bins[k] = (bins[k] || 0) + 1; }
    h += `<div class="sec"><h3>Cut list</h3><div class="tblwrap"><table><thead><tr><th>Stock</th><th>Qty</th></tr></thead><tbody>${Object.entries(bins).sort().map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table></div>
      <p class="cap">${S.dowels.length} × ${DOWELS[P.dowel].label}, ${(S.dowels.reduce((s, d) => s + d.len, 0)).toFixed(1)} m total · ${S.dowels.length * 2} holes · ${S.dowels.length * 4} nuts</p>
      <div class="btns"><button class="btn primary" id="copyCsv">Copy drill schedule (CSV)</button><button class="btn" id="copyJson">Copy model (JSON)</button></div>
      <p class="cap">Hand-off to Fologram for HoloLens drilling and placement is not part of this mockup.</p></div>`;
  }
  side.innerHTML = h; bindPanel(side);
  const click = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  click('resetField', clearPaint);
  click('regen', regenerate);
  click('exSketch', () => { pushUndo(); exampleSketch(); });
  click('impSvg', () => $('#fileSvg').click()); click('impImg', () => $('#fileImg').click());
  click('clrSketch', clearSketch);
  click('runFea', runAnalysis);
  click('runSeq', () => runSequence());
  click('mvEarly', () => moveInOrder(-1)); click('mvLate', () => moveInOrder(1));
  click('fPrev', () => select((S.selected - 1 + S.poles.length) % S.poles.length)); click('fNext', () => select((S.selected + 1) % S.poles.length)); click('fFrame', () => frameCamera(S.poles[S.selected]));
  click('copyCsv', () => copyText(drillCSV(S, P), 'Drill schedule copied as CSV'));
  click('copyJson', () => copyText(modelJSON(S, P, S.asm ? S.asm.order : null), 'Model copied as JSON'));
  side.querySelectorAll<HTMLElement>('[data-sel]').forEach(el => el.onclick = () => select(+el.dataset.sel!));
  side.querySelectorAll<HTMLElement>('[data-step]').forEach(el => el.onclick = () => gotoStep(+el.dataset.step!));
  const cur = side.querySelector('#stepList .cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  renderPanelSoft();
}

function copyText(t: string, msg: string): void {
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;height:40%;z-index:50;font:11px monospace'; document.body.appendChild(ta); ta.select();
    toast('Clipboard blocked. Text is selected: press Ctrl+C, then click away'); ta.onblur = () => ta.remove(); ta.focus();
  };
  try { navigator.clipboard.writeText(t).then(() => toast(msg), fallback); } catch { fallback(); }
}

on('panel', renderPanel);
on('inputs', syncInputs);
