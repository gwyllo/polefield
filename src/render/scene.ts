// three.js renderer, camera, lights, ground and scene groups.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { $, css } from '../ui/dom';

// The colours in this app are authored as sRGB hex and were tuned on three r128, which did no colour
// management and wrote linear output. Keep that look: no sRGB decode of inputs, no encode on output.
THREE.ColorManagement.enabled = false;

export const vp = $('#vp');
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
vp.prepend(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
camera.position.set(6.2, 4.4, 7.4);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.3, 0); controls.enableDamping = true; controls.dampingFactor = 0.12; controls.update();

// Light intensities are scaled to match r128: PI for its legacy (non-physical) lighting units, and ~6% for the
// Fresnel energy conservation MeshStandardMaterial has applied to diffuse light since then.
const LEGACY = Math.PI * 1.065;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f7a, 0.95 * LEGACY));
const sun = new THREE.DirectionalLight(0xffffff, 0.85 * LEGACY); sun.position.set(8, 18, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 60 }); sun.shadow.bias = -0.0005;
scene.add(sun);
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShadowMaterial({ opacity: 0.16 }));
shadowCatcher.rotation.x = -Math.PI / 2; shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);

let grids: THREE.GridHelper[] = [];
export function makeGrids(): void {
  grids.forEach(g => { scene.remove(g); g.geometry.dispose(); });
  const gm = new THREE.GridHelper(60, 600, css('--grid-minor'), css('--grid-minor')), gM = new THREE.GridHelper(60, 60, css('--grid-major'), css('--grid-major'));
  gm.position.y = -0.001; gM.position.y = -0.0005; grids = [gm, gM]; grids.forEach(g => scene.add(g));
}

export const gPoles = new THREE.Group(), gDowels = new THREE.Group(), gSupports = new THREE.Group(), gProps = new THREE.Group(), gSketch = new THREE.Group();
scene.add(gPoles, gDowels, gSupports, gProps, gSketch);
