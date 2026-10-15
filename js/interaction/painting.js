// Brush plane, field brushes, sketching, picking and rebuilds.
"use strict";

/* ------------------------------------------------------------------ painting */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2(), plane=new THREE.Plane();
cursor=new THREE.Group();
const ring=new THREE.Mesh(new THREE.RingGeometry(0.97,1,64),new THREE.MeshBasicMaterial({color:0x17694f,side:THREE.DoubleSide,transparent:true,opacity:0.9,depthTest:false}));
const ballMat=new THREE.MeshBasicMaterial({color:0x17694f,wireframe:true,transparent:true,opacity:0.12,depthWrite:false});
const ball=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),ballMat);
cursor.add(ring,ball); cursor.visible=false; scene.add(cursor);
let painting=false, lastHit=null, stroke=null, downXY=null;
function updatePlane(){
  const n=new V3(), p=new V3();
  if(P.planeMode==='h'){ n.set(0,1,0); p.set(0,P.planeH,0); }
  else { camera.getWorldDirection(n); n.negate(); p.copy(controls.target).addScaledVector(n,P.planeD); }
  plane.setFromNormalAndCoplanarPoint(n,p);
  paintPlane.position.copy(P.planeMode==='h'?new V3((F.min.x+F.max.x)/2,P.planeH,(F.min.z+F.max.z)/2):p);
  paintPlane.quaternion.setFromUnitVectors(new V3(0,0,1),n);
  ring.quaternion.setFromUnitVectors(new V3(0,0,1),n);
  return n;
}
function hitPlane(e){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera); updatePlane();
  return ray.ray.intersectPlane(plane,new V3());
}
function pushUndo(){
  S.undo.push({paint:F.paint.slice(), ch:Object.fromEntries(Object.entries(F.ch).map(([k,v])=>[k,v.slice()])), strokes:S.strokes.slice()});
  if(S.undo.length>40) S.undo.shift();
}
function undo(){
  const u=S.undo.pop(); if(!u){toast('Nothing to undo');return;}
  F.paint.set(u.paint); for(const k in u.ch) F.ch[k].set(u.ch[k]); S.strokes=u.strokes;
  rebuildSketchViz(); afterFieldEdit(); toast('Undone');
}
function applyBrush(hit,e){
  const R=P.radius, R2=R*R, n=plane.normal, inv=e.shiftKey, st=P.strength, tool=S.tool;
  const delta=lastHit?hit.clone().sub(lastHit):new V3();
  const T=F.total, N=F.N;
  let avg=null;
  if(tool==='smooth'){ avg=new Float32Array(N*3); const st3=[1,F.nx,F.nx*F.ny];
    for(let k=0;k<F.nz;k++)for(let j=0;j<F.ny;j++)for(let i=0;i<F.nx;i++){ const c=idx(i,j,k), ijk=[i,j,k], dims=[F.nx,F.ny,F.nz]; let cnt=0;
      for(let a=0;a<3;a++){ if(ijk[a]>0){const m=c-st3[a];avg[c*3]+=T[m*3];avg[c*3+1]+=T[m*3+1];avg[c*3+2]+=T[m*3+2];cnt++;} if(ijk[a]<dims[a]-1){const m=c+st3[a];avg[c*3]+=T[m*3];avg[c*3+1]+=T[m*3+1];avg[c*3+2]+=T[m*3+2];cnt++;} }
      avg[c*3]/=cnt;avg[c*3+1]/=cnt;avg[c*3+2]/=cnt; } }
  for(let c=0;c<N;c++){
    const dx=F.pos[c*3]-hit.x, dy=F.pos[c*3+1]-hit.y, dz=F.pos[c*3+2]-hit.z, d2=dx*dx+dy*dy+dz*dz;
    if(d2>R2) continue;
    const q=1-d2/R2, f=q*q*st;
    const d=Math.sqrt(d2)||1e-6;
    let vx=0,vy=0,vz=0;
    switch(tool){
      case 'comb': { const s=10/Math.max(R,0.2); vx=delta.x*s;vy=delta.y*s;vz=delta.z*s; break; }
      case 'attract': case 'repel': { const sg=((tool==='attract')!==inv)?-1:1; vx=sg*dx/d*0.7;vy=sg*dy/d*0.7;vz=sg*dz/d*0.7; break; }
      case 'twist': { const sg=inv?-1:1; const cx=n.y*dz-n.z*dy, cy=n.z*dx-n.x*dz, cz=n.x*dy-n.y*dx, l=Math.hypot(cx,cy,cz)||1; vx=sg*cx/l*0.7;vy=sg*cy/l*0.7;vz=sg*cz/l*0.7; break; }
      case 'smooth': { vx=(avg[c*3]-T[c*3])*0.3; vy=(avg[c*3+1]-T[c*3+1])*0.3; vz=(avg[c*3+2]-T[c*3+2])*0.3; break; }
      case 'erase': { F.paint[c*3]*=1-f*0.3; F.paint[c*3+1]*=1-f*0.3; F.paint[c*3+2]*=1-f*0.3; continue; }
      case 'scalar': { const a=F.ch[P.channel]; a[c]=clamp(a[c]+(inv?-1:1)*f*0.12,0,1); continue; }
    }
    F.paint[c*3]+=vx*f; F.paint[c*3+1]+=vy*f; F.paint[c*3+2]+=vz*f;
    const l=Math.hypot(F.paint[c*3],F.paint[c*3+1],F.paint[c*3+2]); if(l>4){ F.paint[c*3]*=4/l;F.paint[c*3+1]*=4/l;F.paint[c*3+2]*=4/l; }
  }
  recomputeField(false);
}
const cv=renderer.domElement;
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('pointerdown',e=>{
  downXY=[e.clientX,e.clientY];
  const paintTool=S.tool!=='nav';
  controls.mouseButtons.LEFT=(!paintTool||e.altKey)?THREE.MOUSE.ROTATE:-1;
  controls.mouseButtons.RIGHT=paintTool?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;
  controls.mouseButtons.MIDDLE=paintTool?THREE.MOUSE.PAN:THREE.MOUSE.DOLLY;
  if(paintTool&&e.button===0&&!e.altKey){
    const h=hitPlane(e); if(!h) return;
    painting=true; cv.setPointerCapture(e.pointerId); pushUndo(); lastHit=h;
    if(S.tool==='sketch'){ stroke={pts:[h.clone()],extrude:null}; S.strokes.push(stroke); rebuildSketchViz(); }
    else applyBrush(h,e);
  }
},true);
cv.addEventListener('pointermove',e=>{
  if(S.tool==='nav'){cursor.visible=false;return;}
  const h=hitPlane(e); if(!h){cursor.visible=false;return;}
  cursor.visible=true; cursor.position.copy(h); ring.scale.setScalar(P.radius); ball.scale.setScalar(P.radius); ball.visible=S.tool!=='sketch';
  if(S.tool==='sketch') ring.scale.setScalar(0.04);
  if(!painting) return;
  if(S.tool==='sketch'){ if(h.distanceTo(stroke.pts[stroke.pts.length-1])>0.04){ stroke.pts.push(h.clone()); rebuildSketchViz(); } return; }
  applyBrush(h,e); lastHit=h;
});
cv.addEventListener('pointerleave',()=>{ if(!painting) cursor.visible=false; });
cv.addEventListener('pointerup',e=>{
  const moved=downXY?Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1]):99;
  if(painting){
    painting=false; lastHit=null;
    if(S.tool==='sketch'){ if(stroke.pts.length<3){ S.strokes.pop(); S.undo.pop(); } rebuildSketchViz(); stroke=null; }
    afterFieldEdit();
    return;
  }
  if(S.tool==='nav'&&e.button===0&&moved<5) pick(e);
});
cv.addEventListener('wheel',e=>{
  if(!e.shiftKey||S.tool==='nav') return;
  e.preventDefault(); e.stopImmediatePropagation();
  const dv=(e.deltaY||e.deltaX)>0?-0.08:0.08;
  if(P.planeMode==='h') P.planeH=clamp(P.planeH+dv,F.min.y,F.max.y); else P.planeD=clamp(P.planeD+dv,-4,4);
  syncInputs(); updatePlane(); hudUpdate();
},{capture:true,passive:false});
function pick(e){
  const r=cv.getBoundingClientRect(); ndc.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc,camera);
  // analytic ray / pole-capsule test: cheaper than raycasting the merged mesh
  const o=ray.ray.origin, far=o.clone().addScaledVector(ray.ray.direction,300);
  const asm=S.mode==='assemble'&&S.asm&&S.asm.steps.length, rank=new Int32Array(S.poles.length);
  if(asm) S.asm.order.forEach((id,i)=>rank[id]=i);
  const lim=asm?S.asm.stages[S.asmStep+1]??S.asm.stages[S.asmStep]:1e9;
  let best=-1, bs=1e9;
  for(const p of S.poles){ if(asm&&rank[p.id]>=lim) continue; const q=segClosest(o,far,p.a,p.b); if(q.d<p.r*1.6+0.006&&q.s<bs){bs=q.s;best=p.id;} }
  select(best);
}
function select(id){ S.selected=id; applyDisplay(); renderPanel(); }
let regenTimer=0;
function afterFieldEdit(){
  recomputeField(true);
  if(P.live){ clearTimeout(regenTimer); regenTimer=setTimeout(()=>{ regenerate(); },10); }
  updatePatternUniforms(); updateLegend(currentResult());
}
function regenerate(){
  const t=performance.now();
  generate();
  S.genMs=performance.now()-t;
  if(P.autoFea||S.mode==='analyse') runAnalysis(); else { setStatus(); applyDisplay(); renderPanel(); }
  updateStats();
}
