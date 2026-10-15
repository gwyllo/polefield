// Merged pole shader (proximity grooves, assembly staging) and shared geometry.
import * as THREE from 'three';
import { scene } from './scene';

// shared uniforms for the merged pole mesh: generative grooves + assembly staging
export const U = {
  uPatOn: { value: 1 }, uPatType: { value: 3 }, uFreq: { value: 33 }, uHalfW: { value: 0.0015 }, uRange: { value: 0.2 }, uPhase: { value: 0 }, uTaper: { value: 1 },
  uGroove: { value: new THREE.Color(0x3a2a1a) }, uPlaced: { value: 1e9 }, uNext: { value: 1e9 }, uGhosts: { value: 1 }, uNextCol: { value: new THREE.Color(0x17694f) },
};

function poleOBC(shader: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, U);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 aProx; attribute float aOrder; varying vec2 vProx; varying float vOrder;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvProx = aProx; vOrder = aOrder;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform float uPatOn; uniform int uPatType; uniform float uFreq; uniform float uHalfW; uniform float uRange; uniform float uPhase; uniform float uTaper;
uniform vec3 uGroove; uniform float uPlaced; uniform float uNext; uniform float uGhosts; uniform vec3 uNextCol; varying vec2 vProx; varying float vOrder;
float bands(float v){ return abs(fract(v*uFreq+uPhase+0.5)-0.5)/uFreq; }
float patDist(){
  float d1=vProx.x, d2=vProx.y;
  if(d1>uRange) return 1.0;
  float halo=bands(d1), cells=(d2-d1)*0.5, fringe=bands((d2-d1)*0.5);
  if(d2>uRange*1.6){ cells=1.0; fringe=1.0; }
  if(uPatType==0) return halo;
  if(uPatType==1) return cells;
  if(uPatType==2) return fringe;
  return min(halo,cells);
}`)
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if(vOrder>=uNext-0.5){ if(uGhosts<0.5) discard; if(mod(floor(gl_FragCoord.x),3.0)+mod(floor(gl_FragCoord.y),3.0)>0.5) discard; }
else if(vOrder>=uPlaced-0.5){ if(mod(floor(gl_FragCoord.x)+floor(gl_FragCoord.y),2.0)>0.5) discard; }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
if(vOrder>=uPlaced-0.5 && vOrder<uNext-0.5) diffuseColor.rgb=uNextCol;
if(uPatOn>0.5){ float d=patDist(); float t=clamp(vProx.x/max(uRange,1e-4),0.0,1.0);
  float hw=uHalfW*mix(1.0,mix(1.6,0.3,t),uTaper);
  float aa=max(fwidth(d),1e-5); float g=(1.0-smoothstep(hw-aa,hw+aa,d))*clamp(hw/aa,0.0,1.0); diffuseColor.rgb=mix(diffuseColor.rgb,uGroove,g*0.85); }`);
}

export function poleMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0 });
  m.onBeforeCompile = poleOBC; m.customProgramCacheKey = () => 'pole-merged';
  return m;
}

export const dowelGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
export const dowelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.5 });
export const supportGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
export const supportMat = new THREE.MeshStandardMaterial({ color: 0x50544f, roughness: 0.6 });
export const selMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x17694f, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
selMesh.visible = false; scene.add(selMesh);
