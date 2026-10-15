// Top-bar status pill and model totals, progress note and toasts.
import { GRADES } from '../engine/params';
import { on } from '../events';
import { P, S } from '../state';
import { $ } from './dom';

export function setStatus(): void {
  const el = $('#status'), r = S.res, b = $('#feaBtn');
  if (!r) { el.className = 'pill idle'; el.textContent = S.poles.length ? 'FEA not run' : 'no structure'; b.hidden = false; return; }
  el.className = 'pill ' + r.status;
  el.textContent = (r.status === 'ok' ? 'stable' : r.status === 'warn' ? 'check' : 'fails') + ` · δ ${(r.maxDisp * 1000).toFixed(1)} mm · ${Math.round(r.maxUtil * 100)}%`;
}

export function updateStats(): void {
  const tl = S.poles.reduce((s, p) => s + p.len, 0);
  const mass = S.poles.reduce((s, p) => s + Math.PI * p.r * p.r * p.len * GRADES[P.grade].rho, 0);
  $('#stats').textContent = `${S.poles.length} poles · ${S.dowels.length} dowels · ${S.dowels.length * 2} holes · ${tl.toFixed(1)} m timber · ${mass.toFixed(0)} kg`;
}

let toastTimer = 0;
export function toast(msg: string): void {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}

on('status', setStatus);
on('stats', updateStats);
on('toast', toast);
on('progress', p => {
  $('#progress').hidden = !p; if (!p) return;
  $('#progLbl').textContent = p.label; $('#progBar').style.width = (p.frac * 100) + '%';
});
