// Tool rail, mode tabs, HUD and keyboard shortcuts.
import { clamp } from '../engine/math';
import { setMode, setTool, undo } from '../controller';
import { emit, on } from '../events';
import { setBrushRadius } from '../render/brush';
import { P, S, type Mode, type ToolId } from '../state';
import { $ } from './dom';

export interface Tool { id: ToolId; key: string; name: string; tip: string; svg: string }
export const TOOLS: (Tool | null)[] = [
  { id: 'nav', key: 'V', name: 'Navigate', tip: 'Orbit, pan, zoom. Click a pole to select it.', svg: '<ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v18"/><circle cx="12" cy="12" r="1.6"/>' },
  null,
  { id: 'comb', key: 'C', name: 'Direction', tip: 'Drag to comb the flow in the direction you move.', svg: '<path d="M4 17c4-7 9-9 16-9"/><path d="M16 4.5 20 8l-4 3.5"/>' },
  { id: 'attract', key: 'A', name: 'Attract', tip: 'Pull the flow toward the brush. Shift repels.', svg: '<circle cx="12" cy="12" r="1.8"/><path d="M3 12h5M6 9.5 8.5 12 6 14.5M21 12h-5M18 9.5 15.5 12l2.5 2.5M12 3v5M12 21v-5"/>' },
  { id: 'repel', key: 'R', name: 'Repel', tip: 'Push the flow away from the brush. Shift attracts.', svg: '<circle cx="12" cy="12" r="1.8"/><path d="M9 12H3M5.5 9.5 3 12l2.5 2.5M15 12h6M18.5 9.5 21 12l-2.5 2.5M12 9V3M12 15v6"/>' },
  { id: 'twist', key: 'T', name: 'Twist', tip: 'Swirl the flow around the brush axis. Shift reverses.', svg: '<path d="M12 12a2 2 0 1 1 2 2 4.5 4.5 0 1 1-4.5-4.5A7 7 0 1 1 5 17"/>' },
  { id: 'smooth', key: 'S', name: 'Smooth', tip: 'Average neighbouring vectors.', svg: '<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/>' },
  { id: 'erase', key: 'E', name: 'Erase', tip: 'Remove painted forces, back to the base flow.', svg: '<path d="M15.5 4 20 8.5 10 18.5H5.5v-4.5zM4 21h16"/>' },
  null,
  { id: 'scalar', key: 'D', name: 'Property paint', tip: 'Paint density, length, diameter or tint. Shift subtracts.', svg: '<circle cx="6" cy="7" r="1"/><circle cx="12" cy="7" r="1.7"/><circle cx="18" cy="7" r="2.4"/><circle cx="6" cy="16" r="1.7"/><circle cx="12" cy="16" r="2.4"/><circle cx="18" cy="16" r="3"/>' },
  { id: 'sketch', key: 'P', name: 'Sketch', tip: 'Draw guide curves on the brush plane. The flow follows them.', svg: '<path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z"/><path d="M14 7l3 3"/>' },
];
export const toolById = (id: ToolId): Tool => TOOLS.find(t => t && t.id === id)!;
const MODES: [Mode, string][] = [['field', 'Field'], ['poles', 'Poles'], ['pattern', 'Pattern'], ['analyse', 'Analyse'], ['assemble', 'Assemble'], ['fab', 'Fabricate']];

export function buildChrome(): void {
  $('#tabs').innerHTML = MODES.map(([id, l]) => `<button class="tab" role="tab" data-mode="${id}" aria-selected="${S.mode === id}">${l}</button>`).join('');
  $('#tabs').onclick = e => { const b = (e.target as Element).closest<HTMLElement>('[data-mode]'); if (b) setMode(b.dataset.mode as Mode); };
  $('#rail').innerHTML = TOOLS.map(t => t ? `<button class="tool" data-tool="${t.id}" title="${t.name} (${t.key}) · ${t.tip}" aria-label="${t.name}" aria-pressed="${S.tool === t.id}"><svg viewBox="0 0 24 24">${t.svg}</svg><kbd>${t.key}</kbd></button>` : '<hr>').join('') +
    `<hr><button class="tool" id="undoBtn" title="Undo (Ctrl+Z)" aria-label="Undo"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>`;
  $('#rail').onclick = e => { const el = e.target as Element, b = el.closest<HTMLElement>('[data-tool]'); if (b) setTool(b.dataset.tool as ToolId); if (el.closest('#undoBtn')) undo(); };
  $('#panelToggle').onclick = () => $('#side').classList.toggle('open');
}

function syncChrome(): void {
  document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)));
}

export function hudUpdate(): void {
  const t = toolById(S.tool);
  const planeTxt = P.planeMode === 'h' ? `horizontal plane at ${P.planeH.toFixed(2)} m` : `view plane, depth ${P.planeD >= 0 ? '+' : ''}${P.planeD.toFixed(2)} m`;
  $('#toolname').innerHTML = `${t.name}<span>${S.tool === 'nav' ? '' : planeTxt + ' · radius ' + P.radius.toFixed(2) + ' m'}</span>`;
  $('#hud').innerHTML = S.tool === 'nav'
    ? '<b>Left</b> orbit · <b>Right</b> pan · <b>Wheel</b> zoom · <b>Click</b> select pole · <b>C A R T S E D P</b> brushes'
    : '<b>Left</b> paint · <b>Right</b> orbit · <b>Middle</b> pan · <b>Shift+wheel</b> brush depth · <b>[ ]</b> radius · <b>Shift</b> invert · <b>Ctrl+Z</b> undo';
}

document.addEventListener('keydown', e => {
  if ((e.target as Element).matches('input,select,textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.key === '[' || e.key === ']') {
    P.radius = clamp(e.key === '[' ? P.radius / 1.15 : P.radius * 1.15, 0.1, 2.5);
    emit('inputs'); hudUpdate(); setBrushRadius(P.radius); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = TOOLS.find(t => t && t.key.toLowerCase() === e.key.toLowerCase()); if (t) setTool(t.id);
});

on('chrome', syncChrome);
on('hud', hudUpdate);
