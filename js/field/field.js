// The 3D vector field: grid, base flow, painted forces, sampling.
"use strict";

/* ------------------------------------------------------------------ field */
const F = {};
function setupField(key, keepParams){
  const pr = PRESETS[key];
  F.min = new V3(...pr.min); F.max = new V3(...pr.max);
  const sz = new V3().subVectors(F.max, F.min);
  const cs=0.3; F.nx = clamp(Math.round(sz.x/cs)+1,5,60); F.ny = clamp(Math.round(sz.y/cs)+1,5,60); F.nz = clamp(Math.round(sz.z/cs)+1,4,60);
  F.hx = sz.x/(F.nx-1); F.hy = sz.y/(F.ny-1); F.hz = sz.z/(F.nz-1);
  const N = F.N = F.nx*F.ny*F.nz;
  F.pos = new Float32Array(N*3); F.base = new Float32Array(N*3); F.paint = new Float32Array(N*3);
  F.sketch = new Float32Array(N*3); F.img = new Float32Array(N*3); F.total = new Float32Array(N*3); F.dir = new Float32Array(N*3);
  F.imgDark = new Float32Array(N);
  F.ch = {density:new Float32Array(N), length:new Float32Array(N).fill(0.5), diameter:new Float32Array(N).fill(0.3), tint:new Float32Array(N)};
  F.densEff = new Float32Array(N);
  for(let k=0;k<F.nz;k++)for(let j=0;j<F.ny;j++)for(let i=0;i<F.nx;i++){
    const c = idx(i,j,k), x=F.min.x+i*F.hx, y=F.min.y+j*F.hy, z=F.min.z+k*F.hz;
    F.pos[c*3]=x;F.pos[c*3+1]=y;F.pos[c*3+2]=z;
    const b = pr.base(x,y,z); F.base[c*3]=b[0];F.base[c*3+1]=b[1];F.base[c*3+2]=b[2];
    F.ch.density[c] = pr.dens(x,y,z);
    if(pr.diam) F.ch.diameter[c] = clamp(pr.diam(x,y,z),0,1); // thicker poles low down, where load collects
  }
  if(!keepParams){ P.weave = pr.weave; P.weaveAxis = pr.weaveAxis; }
  S.strokes = []; S.image = null; S.undo = [];
  rebuildBoundsViz(); rebuildSketchViz(); rebuildImageViz();
  computeImage();
  recomputeField(true);
}
function idx(i,j,k){ return i + F.nx*(j + F.ny*k); }
function noiseVec(x,y,z){
  return [Math.sin(1.9*y+0.7)*Math.cos(1.3*z+0.2), Math.sin(1.7*z+1.1)*Math.cos(1.2*x+0.5), Math.sin(1.5*x+0.3)*Math.cos(1.6*y+0.9)];
}
function recomputeField(full){
  const N=F.N, T=F.total;
  // pre-sketch field (sketch tangents are aligned to it)
  for(let c=0;c<N;c++){
    const x=F.pos[c*3],y=F.pos[c*3+1],z=F.pos[c*3+2], n=noiseVec(x,y,z);
    for(let a=0;a<3;a++) T[c*3+a] = F.base[c*3+a]*P.baseStrength + n[a]*P.noise + F.paint[c*3+a] + F.img[c*3+a]*P.imgW;
  }
  computeSketch();
  for(let c=0;c<N;c++){
    let x=T[c*3]+F.sketch[c*3]*P.sketchW, y=T[c*3+1]+F.sketch[c*3+1]*P.sketchW, z=T[c*3+2]+F.sketch[c*3+2]*P.sketchW;
    T[c*3]=x;T[c*3+1]=y;T[c*3+2]=z;
    const l=Math.hypot(x,y,z);
    if(l<1e-6){F.dir[c*3]=0;F.dir[c*3+1]=1;F.dir[c*3+2]=0;} else {F.dir[c*3]=x/l;F.dir[c*3+1]=y/l;F.dir[c*3+2]=z/l;}
    const useImg = S.image && (P.imgMode==='density'||P.imgMode==='both');
    F.densEff[c] = useImg ? lerp(F.ch.density[c], F.imgDark[c], 0.75) : F.ch.density[c];
  }
  updateArrows(); updateChannelViz();
}
// trilinear sample of an array with `comps` components
function sampleArr(arr, comps, x, y, z, out){
  let fx=clamp((x-F.min.x)/F.hx,0,F.nx-1.0001), fy=clamp((y-F.min.y)/F.hy,0,F.ny-1.0001), fz=clamp((z-F.min.z)/F.hz,0,F.nz-1.0001);
  const i=Math.floor(fx), j=Math.floor(fy), k=Math.floor(fz); fx-=i; fy-=j; fz-=k;
  for(let a=0;a<comps;a++) out[a]=0;
  for(let dk=0;dk<2;dk++)for(let dj=0;dj<2;dj++)for(let di=0;di<2;di++){
    const w=(di?fx:1-fx)*(dj?fy:1-fy)*(dk?fz:1-fz); if(w===0) continue;
    const c=idx(i+di,j+dj,k+dk);
    for(let a=0;a<comps;a++) out[a]+=arr[c*comps+a]*w;
  }
  return out;
}
const _s1=[0], _s3=[0,0,0];
function sScalar(arr,p){ return sampleArr(arr,1,p.x,p.y,p.z,_s1)[0]; }
function fieldDir(p,out){ sampleArr(F.dir,3,p.x,p.y,p.z,_s3); out.set(_s3[0],_s3[1],_s3[2]); if(out.lengthSq()<1e-8) out.set(0,1,0); return out.normalize(); }
