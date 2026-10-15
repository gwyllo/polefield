// Assembly timeline: stage slider, playback and the per-stage chart.
import { stageRange } from '../engine/assembly';
import { clamp } from '../engine/math';
import { gotoStep } from '../controller';
import { on } from '../events';
import { applyDisplay } from '../render/display';
import { P, S } from '../state';
import { $, css } from './dom';

export function syncTimeline(): void {
  const tl = $('#tl'), active = S.mode === 'assemble';
  tl.hidden = !active; if (!active) return;
  const sl = $<HTMLInputElement>('#tlStep');
  sl.max = String(Math.max(0, (S.asm ? S.asm.stages.length : 1) - 1)); sl.value = String(S.asmStep);
  const st = S.asm && S.asm.steps[S.asmStep];
  if (S.asm && st) {
    const [a, b] = stageRange(S.asm, S.asmStep);
    $('#tlLbl').innerHTML = `Stage <b>${S.asmStep + 1}</b>/${S.asm.stages.length} · poles <b>${a}–${b}</b> of ${S.asm.order.length} placed · δ ${(st.maxDisp * 1000).toFixed(1)} mm · ${Math.round(st.maxUtil * 100)}% · <span class="s ${st.status}">${st.issues[0] || (st.props.length ? st.props.length + ' temporary support' + (st.props.length > 1 ? 's' : '') : 'ok')}</span>`;
  }
  else $('#tlLbl').textContent = 'Run the sequence to simulate each assembly stage';
  drawChart(); if (!S.asm || !S.asm.running) applyDisplay();
}

export function drawChart(): void {
  const c = $<HTMLCanvasElement>('#tlChart'), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (!w) return;
  c.width = w * dpr; c.height = h * dpr; const x = c.getContext('2d')!; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const padL = 38, padR = 40, padT = 8, padB = 16, W = w - padL - padR, H = h - padT - padB;
  x.font = '10px "JetBrains Mono", monospace'; x.fillStyle = css('--muted'); x.strokeStyle = css('--line');
  if (!S.asm) { x.fillText('No sequence yet. Choose a strategy and run it from the panel.', padL, h / 2); return; }
  const n = S.asm.stages.length, steps = S.asm.steps, bw = W / n;
  const umax = Math.max(1.2, P.limitUtil / 100 * 1.2, ...steps.map(s => s.maxUtil));
  const dmax = Math.max(P.limitDisp * 1.25, ...steps.map(s => s.maxDisp * 1000));
  x.lineWidth = 1; for (let i = 0; i <= 4; i++) { const y = padT + H * i / 4; x.beginPath(); x.moveTo(padL, y + .5); x.lineTo(padL + W, y + .5); x.stroke(); }
  x.textAlign = 'right'; x.fillText(Math.round(umax * 100) + '%', padL - 4, padT + 8); x.fillText('0', padL - 4, padT + H);
  x.textAlign = 'left'; x.fillText(dmax.toFixed(0) + ' mm', padL + W + 4, padT + 8); x.fillText('0', padL + W + 4, padT + H);
  steps.forEach((s, i) => {
    const bh = clamp(s.maxUtil / umax, 0, 1) * H; x.fillStyle = css(s.status === 'crit' ? '--crit' : s.status === 'warn' ? '--warn' : '--ok'); x.globalAlpha = i === S.asmStep ? 1 : 0.55;
    x.fillRect(padL + i * bw + bw * 0.15, padT + H - bh, Math.max(1, bw * 0.7), bh);
    if (s.floating.length && !s.props.length || s.mech.length) { x.fillRect(padL + i * bw + bw * 0.15, padT, Math.max(1, bw * 0.7), 3); }
  });
  x.globalAlpha = 1;
  x.setLineDash([4, 3]); x.strokeStyle = css('--crit');
  let y = padT + H - (P.limitUtil / 100 / umax) * H; x.beginPath(); x.moveTo(padL, y); x.lineTo(padL + W, y); x.stroke();
  x.strokeStyle = css('--seq-hi'); y = padT + H - (P.limitDisp / dmax) * H; x.beginPath(); x.moveTo(padL, y); x.lineTo(padL + W, y); x.stroke(); x.setLineDash([]);
  x.strokeStyle = css('--seq-hi'); x.lineWidth = 1.6; x.beginPath();
  steps.forEach((s, i) => { const px = padL + (i + .5) * bw, py = padT + H - clamp(s.maxDisp * 1000 / dmax, 0, 1) * H; if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke();
  x.strokeStyle = css('--fg'); x.lineWidth = 1; const cx = padL + (S.asmStep + .5) * bw; x.beginPath(); x.moveTo(cx, padT); x.lineTo(cx, padT + H); x.stroke();
  x.fillStyle = css('--muted'); x.textAlign = 'left'; x.fillText('bars: utilisation per stage  line: deflection  dashed: limits', padL, h - 3);
}

$('#tlChart').addEventListener('click', e => {
  if (!S.asm) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const W = r.width - 78;
  gotoStep(Math.floor((e.clientX - r.left - 38) / W * S.asm.stages.length));
});
$('#tlStep').addEventListener('input', e => gotoStep(+(e.target as HTMLInputElement).value));
$('#tlPrev').onclick = () => gotoStep(S.asmStep - 1); $('#tlNext').onclick = () => gotoStep(S.asmStep + 1);
$('#tlPlay').onclick = () => { S.playing = !S.playing; $('#tlPlay').textContent = S.playing ? 'Pause' : 'Play'; if (S.playing && S.asm && S.asmStep >= S.asm.steps.length - 1) gotoStep(0); };

let playT = 0;
/** Advance playback; called from the render loop. */
export function tickPlayback(t: number): void {
  if (!(S.playing && S.asm && !S.asm.running && t - playT > 420)) return;
  playT = t;
  if (S.asmStep < S.asm.steps.length - 1) gotoStep(S.asmStep + 1); else { S.playing = false; $('#tlPlay').textContent = 'Play'; }
}

on('timeline', syncTimeline);
