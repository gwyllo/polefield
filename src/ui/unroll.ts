// Unrolled pole drawing: grooves and drill holes on the flattened surface.
import * as THREE from 'three';
import { DOWELS } from '../engine/params';
import { patDist, patHalfW, patternConfig, proxAt } from '../engine/patterns';
import type { Pole } from '../engine/types';
import { P, S } from '../state';
import { css } from './dom';

/** Draw pole `p` unrolled from end A into `canvas`; returns the approximate routed groove length (m). */
export function drawUnroll(canvas: HTMLCanvasElement, p: Pole): number {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth || 300, H = Math.round(W * 0.3);
  canvas.style.height = H + 'px'; canvas.width = W * dpr; canvas.height = H * dpr;
  const x = canvas.getContext('2d')!; x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const padX = 6, padY = 14, w = W - 2 * padX, h = H - 2 * padY - 10;
  const wood = new THREE.Color(P.woodA).lerp(new THREE.Color(P.woodB), p.tint);
  const img = x.createImageData(Math.round(w * dpr), Math.round(h * dpr)), iw = img.width, ih = img.height, d = img.data;
  const cfg = patternConfig(P), c = new THREE.Vector3(), o = new THREE.Vector3(), px = [0, 0]; let grooveArea = 0, grooveW = 0;
  for (let j = 0; j < ih; j++) {
    const th = (j / ih) * Math.PI * 2; o.copy(p.ref).multiplyScalar(Math.cos(th)).addScaledVector(p.w, Math.sin(th)).multiplyScalar(p.r);
    for (let i = 0; i < iw; i++) {
      const t = i / (iw - 1); c.copy(p.a).lerp(p.b, t).add(o);
      let g = 0; if (P.patOn) { proxAt(S.poles, S.nbr, p.id, c.x, c.y, c.z, px); const hw = patHalfW(px[0], cfg); if (patDist(px[0], px[1], cfg) < hw) { g = 1; grooveArea++; grooveW += hw * 2; } }
      const k = (j * iw + i) * 4; d[k] = g ? 0x3d : wood.r * 255; d[k + 1] = g ? 0x2a : wood.g * 255; d[k + 2] = g ? 0x18 : wood.b * 255; d[k + 3] = 255;
    }
  }
  x.fillStyle = css('--panel-2'); x.fillRect(0, 0, W, H);
  x.putImageData(img, padX * dpr, padY * dpr);
  x.strokeStyle = css('--line-2'); x.strokeRect(padX + .5, padY + .5, w, h);
  // holes: entry and exit (through holes are drilled 180° apart)
  const hd = DOWELS[P.dowel].hole / 1000, sx = w / p.len, sy = h / (Math.PI * 2 * p.r);
  for (const hl of p.holes) {
    for (const [a, solid] of [[hl.ang, true], [(hl.ang + 180) % 360, false]] as const) {
      const cx = padX + hl.t * w, cy = padY + a / 360 * h;
      x.beginPath(); x.ellipse(cx, cy, Math.max(2, hd / 2 * sx), Math.min(h / 2, hd / 2 * sy), 0, 0, Math.PI * 2);
      x.fillStyle = solid ? css('--fg') : 'transparent'; x.strokeStyle = css('--fg'); x.lineWidth = 1.2; if (solid) x.fill(); x.stroke();
    }
  }
  x.font = '10px "JetBrains Mono", monospace'; x.fillStyle = css('--muted');
  x.textAlign = 'left'; x.fillText('A · base end', padX, 10); x.textAlign = 'right'; x.fillText(`${Math.round(p.len * 1000)} mm`, W - padX, 10);
  x.textAlign = 'left'; x.fillText(`0°`, padX + 2, padY + h + 11); x.textAlign = 'right'; x.fillText(`circumference ×${Math.max(1, Math.round(sy / sx))} vertical scale`, W - padX, padY + h + 11);
  // approximate routed length = groove area / mean groove width
  const pxArea = (p.len / iw) * (Math.PI * 2 * p.r / ih);
  return grooveArea ? grooveArea * pxArea / (grooveW / grooveArea) : 0;
}
