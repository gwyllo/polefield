// Colouring, deformed shape, dowel instances, legend and pattern uniforms.
"use strict";

/* ------------------------------------------------------------------ display */
const _c=new THREE.Color(), _c2=new THREE.Color();
function rampUtil(u,out){ const ok=new THREE.Color(css('--ok')), w=new THREE.Color(css('--warn')), c=new THREE.Color(css('--crit'));
  if(u<0.7) return out.copy(ok).lerp(w,u/0.7); return out.copy(w).lerp(c,clamp((u-0.7)/0.3,0,1)); }
function rampSeq(t,out){ return out.set(css('--seq-lo')).lerp(new THREE.Color(css('--seq-hi')),clamp(t,0,1)); }
function currentResult(){
  if(S.mode==='analyse') return S.res;
  if(S.mode==='assemble'&&S.asm&&S.asm.steps.length) return S.asm.steps[Math.min(S.asmStep,S.asm.steps.length-1)];
  return null;
}
function applyDisplay(){
  if(!poleMesh) return;
  const res=currentResult(), mode=S.mode, asm=!!(mode==='assemble'&&S.asm&&S.asm.steps.length);
  const n=S.poles.length, rank=new Int32Array(n);
  if(S.asm) S.asm.order.forEach((id,i)=>rank[id]=i);
  let placedN=1e9, nextN=1e9;
  if(asm){ placedN=S.asm.stages[S.asmStep]; nextN=S.asm.stages[S.asmStep+1]??placedN; }
  U.uPlaced.value=placedN; U.uNext.value=asm?nextN:1e9; U.uGhosts.value=P.ghosts?1:0; U.uNextCol.value.set(css('--accent'));
  const isPlaced=id=>!asm||rank[id]<placedN;
  let scale=0;
  if(res&&res.maxDisp>0){ scale=(0.12/res.maxDisp)*P.defScale; if(scale*res.maxDisp>0.35) scale=0.35/res.maxDisp; }
  const woodA=new THREE.Color(P.woodA), woodB=new THREE.Color(P.woodB), mechSet=new Set(res?res.mech:[]), floatSet=new Set(res&&!res.props.length?res.floating:[]);
  let maxLen=0,minLen=1e9; for(const p of S.poles){maxLen=Math.max(maxLen,p.len);minLen=Math.min(minLen,p.len);}
  const crit=new THREE.Color(css('--crit')), okc=new THREE.Color(css('--ok')), warnc=new THREE.Color(css('--warn'));
  const g=poleMesh.geometry, col=g.attributes.color.array, pos=g.attributes.position.array, rest=g.attributes.aRest.array, ord=g.attributes.aOrder.array;
  const c=_c;
  for(const p of S.poles){
    if(res && isPlaced(p.id) && res.body.has(p.id)){
      if(mechSet.has(p.id)) c.copy(crit);
      else if(P.resultColor==='disp') rampSeq((res.poleDisp.get(p.id)||0)/(res.maxDisp||1),c);
      else rampUtil((res.poleUtil.get(p.id)||0)/(P.limitUtil/100),c);
    } else if(res && floatSet.has(p.id) && isPlaced(p.id)) c.copy(crit);
    else switch(P.colorBy){
      case 'length': rampSeq((p.len-minLen)/Math.max(maxLen-minLen,1e-3),c); break;
      case 'diameter': rampSeq((p.dia-P.diaMin)/Math.max(P.diaMax-P.diaMin,1),c); break;
      case 'connect': { const k=p.holes.length; c.copy(k===0?crit:k===1&&!p.grounded?warnc:okc); break; }
      case 'order': if(S.asm) rampSeq(rank[p.id]/Math.max(n-1,1),c); else c.copy(woodA); break;
      default: c.copy(woodA).lerp(woodB,p.tint);
    }
    if(p.id===S.selected) c.lerp(new THREE.Color(css('--accent')),0.55);
    const r=asm?rank[p.id]:0;
    for(let v=p.v0,e=p.v0+p.vn;v<e;v++){ col[v*3]=c.r;col[v*3+1]=c.g;col[v*3+2]=c.b; ord[v]=r; }
  }
  g.attributes.color.needsUpdate=true; g.attributes.aOrder.needsUpdate=true;
  // rigid-body deformation, exaggerated
  if(res&&scale>0){
    const x=res.x, cen=res.cen;
    for(const p of S.poles){ const bi=res.body.get(p.id);
      const live=bi!==undefined&&!mechSet.has(p.id)&&isPlaced(p.id);
      for(let v=p.v0,e=p.v0+p.vn;v<e;v++){
        if(!live){ pos[v*3]=rest[v*3];pos[v*3+1]=rest[v*3+1];pos[v*3+2]=rest[v*3+2]; continue; }
        const o=bi*6, rx=rest[v*3]-cen[bi*3], ry=rest[v*3+1]-cen[bi*3+1], rz=rest[v*3+2]-cen[bi*3+2];
        pos[v*3]=rest[v*3]+scale*(x[o]+x[o+4]*rz-x[o+5]*ry); pos[v*3+1]=rest[v*3+1]+scale*(x[o+1]+x[o+5]*rx-x[o+3]*rz); pos[v*3+2]=rest[v*3+2]+scale*(x[o+2]+x[o+3]*ry-x[o+4]*rx);
      } }
    g.attributes.position.needsUpdate=true; S.deformed=true;
  } else if(S.deformed){ pos.set(rest); g.attributes.position.needsUpdate=true; S.deformed=false; }
  poleMesh.castShadow=!asm;
  // dowels
  const steel=new THREE.Color(css('--steel')), m4=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new V3(), up=new V3(0,1,0), dv=new V3();
  for(const d of S.dowels){
    const A=S.poles[d.pi],B=S.poles[d.pj];
    const pa=A.a.clone().lerp(A.b,d.ti), pb=B.a.clone().lerp(B.b,d.tj);
    const vis=isPlaced(d.pi)&&isPlaced(d.pj);
    if(res&&vis&&scale>0){ const ba=res.body.get(d.pi), bb=res.body.get(d.pj);
      if(ba!==undefined&&bb!==undefined&&!mechSet.has(d.pi)&&!mechSet.has(d.pj)){
        const da=res.ptDisp(ba,pa.x,pa.y,pa.z), db=res.ptDisp(bb,pb.x,pb.y,pb.z);
        pa.x+=da[0]*scale;pa.y+=da[1]*scale;pa.z+=da[2]*scale; pb.x+=db[0]*scale;pb.y+=db[1]*scale;pb.z+=db[2]*scale; } }
    dv.subVectors(pb,pa); const gap=dv.length(); dv.normalize();
    q.setFromUnitVectors(up,dv); sc.set(vis?d.r*1.15:0, vis?gap+A.r+B.r+0.04:0, vis?d.r*1.15:0);
    m4.compose(pa.add(pb).multiplyScalar(0.5),q,sc); dowelInst.setMatrixAt(d.id,m4);
    if(res&&vis&&res.dowelUtil.has(d.id)) rampUtil(res.dowelUtil.get(d.id)/(P.limitUtil/100),c); else c.copy(steel);
    dowelInst.setColorAt(d.id,c);
  }
  dowelInst.instanceMatrix.needsUpdate=true; if(dowelInst.instanceColor) dowelInst.instanceColor.needsUpdate=true;
  supportInst.userData.poles.forEach((id,k)=>{ const p=S.poles[id], s=isPlaced(id)?1:0;
    m4.compose(new V3(p.a.x,0.006,p.a.z),new THREE.Quaternion(),new V3(p.r*2.6*s,0.012*s,p.r*2.6*s)); supportInst.setMatrixAt(k,m4); });
  supportInst.instanceMatrix.needsUpdate=true;
  // selection outline
  const sp=S.poles[S.selected];
  selMesh.visible=!!sp&&isPlaced(S.selected);
  if(sp){ dv.copy(sp.dir); selMesh.position.copy(sp.a).add(sp.b).multiplyScalar(0.5); selMesh.quaternion.setFromUnitVectors(up,dv); selMesh.scale.set(sp.r*1.7,sp.len+0.01,sp.r*1.7); selMesh.material.color.set(css('--accent')); }
  // temporary props
  while(gProps.children.length){const o=gProps.children.pop(); o.geometry.dispose();}
  if(res&&res.props.length){
    const mat=new THREE.LineBasicMaterial({color:css('--warn')}), pts=[];
    for(const pr of res.props){ pts.push(new V3(...pr.pt),new V3(pr.pt[0],0,pr.pt[2])); }
    gProps.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),mat));
  }
  // field helpers
  const fm=mode==='field';
  arrows.visible=P.arrows&&fm; boundsBox.visible=fm||mode==='poles'; gSketch.visible=fm; if(imagePlane) imagePlane.visible=fm;
  updateChannelViz();
  U.uPatOn.value=(P.patOn&&mode!=='analyse'&&mode!=='assemble')?1:0;
  updateLegend(res);
}
function updatePatternUniforms(){
  U.uPatType.value=PAT_TYPES[P.patType]; U.uFreq.value=1000/P.patSpacing; U.uHalfW.value=P.patWidth/2000; U.uPhase.value=P.patPhase;
  U.uRange.value=P.patRange/1000; U.uTaper.value=P.patTaper?1:0;
  U.uGroove.value.set(document.documentElement.matches('[data-theme="dark"]')||(matchMedia('(prefers-color-scheme: dark)').matches&&!document.documentElement.matches('[data-theme="light"]'))?'#2a1d10':'#4a3220');
}
function updateLegend(res){
  const el=$('#legend');
  if(res){
    const isU=P.resultColor!=='disp';
    const g=isU?`linear-gradient(90deg,${css('--ok')},${css('--warn')} 70%,${css('--crit')})`:`linear-gradient(90deg,${css('--seq-lo')},${css('--seq-hi')})`;
    el.innerHTML=`<div class="ttl">${isU?'Stress utilisation':'Displacement'}</div><div class="bar" style="background:${g}"></div><div class="ends"><span>0</span><span>${isU?P.limitUtil+'%':(res.maxDisp*1000).toFixed(2)+' mm'}</span></div><div style="margin-top:4px">Shape ×${res.maxDisp>0?Math.round(Math.min(0.12/res.maxDisp*P.defScale,0.35/res.maxDisp)):0}</div>`;
    el.hidden=false;
  } else if(S.mode==='field'){
    const ch=activeChannel();
    el.innerHTML=`<div class="ttl">Field</div><div class="ends" style="margin-top:4px"><span style="color:${css('--field-v')}">&#9473; vertical</span><span style="color:${css('--field-h')}">&#9473; horizontal</span></div>`+
      (ch?`<div class="bar" style="margin-top:8px;background:linear-gradient(90deg,${css('--vp-bg')},${css(CH_COL[ch])})"></div><div class="ends"><span>${CHANNELS[ch]} 0</span><span>1</span></div>`:'')+
      (S.strokes.length?`<div style="margin-top:4px;color:${css('--crit')}">&#9473; ${S.strokes.length} sketch stroke${S.strokes.length>1?'s':''}</div>`:'');
    el.hidden=false;
  } else el.hidden=true;
}
