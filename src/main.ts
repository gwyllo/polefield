// Entry point: theming, resize, render loop and boot.
import './styles.css';
import { Color, type LineBasicMaterial } from 'three';
import { frameCamera, generateModel, loadPreset, runAnalysis, setMode } from './controller';
import { emit } from './events';
import './interaction/painting';
import { ballMat, ring, updatePlane } from './render/brush';
import { applyDisplay, updatePatternUniforms } from './render/display';
import { boundsBox, paintPlane, rebuildSketchViz, updateArrows } from './render/field-viz';
import { camera, controls, makeGrids, renderer, scene, vp } from './render/scene';
import { P, S } from './state';
import { buildChrome } from './ui/chrome';
import { $, css } from './ui/dom';
import './ui/import';
import { renderPanelSoft } from './ui/panels';
import { setStatus, updateStats } from './ui/status';
import { drawChart, tickPlayback } from './ui/timeline';

function resize(): void {
  const w = vp.clientWidth, h = vp.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (S.mode === 'assemble') drawChart();
}
new ResizeObserver(resize).observe(vp);

function applyTheme(): void {
  scene.background = new Color(css('--vp-bg')); makeGrids();
  ring.material.color.set(css('--accent')); ballMat.color.set(css('--accent'));
  if (paintPlane) { paintPlane.material.color.set(css('--accent')); (paintPlane.children[0] as unknown as { material: LineBasicMaterial }).material.color.set(css('--accent')); }
  if (boundsBox) (boundsBox.material as LineBasicMaterial).color.set(css('--line-2'));
  rebuildSketchViz(); updateArrows(); updatePatternUniforms(); if (S.poles.length) applyDisplay(); if (S.mode === 'assemble') drawChart(); if (S.mode === 'fab' || S.mode === 'pattern') renderPanelSoft();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

function loop(t: number): void {
  requestAnimationFrame(loop);
  controls.update();
  if (P.planeMode === 'view' && S.tool !== 'nav') updatePlane();
  tickPlayback(t);
  renderer.render(scene, camera);
}

/* boot */
buildChrome();
loadPreset(P.preset);
applyTheme();
generateModel();
if (P.autoFea) runAnalysis(); setStatus();
$('#feaBtn').onclick = () => { if (S.mode === 'analyse') runAnalysis(); else setMode('analyse'); };
updateStats(); updatePatternUniforms(); setMode('field'); emit('hud'); frameCamera(); resize();
requestAnimationFrame(loop);

// dev only: inspect state from the browser console
if (import.meta.env.DEV) Object.assign(window, { polefield: { S, P, scene, renderer, camera } });
