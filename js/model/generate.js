// Pole seeding, flow alignment, relaxation, grounding and dowel joints.
"use strict";

/* ------------------------------------------------------------------ pole generation */
function segClosest(p1,q1,p2,q2){
  const d1x=q1.x-p1.x,d1y=q1.y-p1.y,d1z=q1.z-p1.z, d2x=q2.x-p2.x,d2y=q2.y-p2.y,d2z=q2.z-p2.z, rx=p1.x-p2.x,ry=p1.y-p2.y,rz=p1.z-p2.z;
  const a=d1x*d1x+d1y*d1y+d1z*d1z, e=d2x*d2x+d2y*d2y+d2z*d2z, f=d2x*rx+d2y*ry+d2z*rz, c=d1x*rx+d1y*ry+d1z*rz, b=d1x*d2x+d1y*d2y+d1z*d2z;
  const den=a*e-b*b; let s,t, parallel=false;
  if(den>1e-4*a*e){ s=clamp((b*f-c*e)/den,0,1); }
  else { parallel=true; const t0=clamp((-c)/a,0,1), t1=clamp((b-c)/a,0,1); s=(t0+t1)/2; }
  t=(b*s+f)/e;
  if(t<0){t=0;s=clamp(-c/a,0,1);} else if(t>1){t=1;s=clamp((b-c)/a,0,1);}
  const cx=p1.x+d1x*s-(p2.x+d2x*t), cy=p1.y+d1y*s-(p2.y+d2y*t), cz=p1.z+d1z*s-(p2.z+d2z*t);
  return {s,t,d:Math.sqrt(cx*cx+cy*cy+cz*cz), nx:cx, ny:cy, nz:cz, parallel};
}
function distPointSeg(x,y,z,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z, qx=x-a.x,qy=y-a.y,qz=z-a.z, ll=dx*dx+dy*dy+dz*dz;
  const t=ll>0?clamp((qx*dx+qy*dy+qz*dz)/ll,0,1):0, ux=qx-dx*t,uy=qy-dy*t,uz=qz-dz*t;
  return Math.sqrt(ux*ux+uy*uy+uz*uz);
}
function traceEnd(c,len,sgn){
  const q=c.clone(), d=new V3(), prev=fieldDir(c,new V3()).multiplyScalar(sgn); const n=Math.max(2,Math.ceil(len/0.05));
  for(let i=0;i<n;i++){ fieldDir(q,d); if(d.dot(prev)<0) d.negate(); q.addScaledVector(d,len/n); prev.copy(d); }
  return q;
}
function refMark(d){
  const up=new V3(0,1,0), r=up.clone().addScaledVector(d,-d.dot(up));
  if(r.length()<0.15){ r.set(1,0,0).addScaledVector(d,-d.x); }
  return r.normalize();
}
// spatial hash: flat list [i,j,i,j,...] of pole pairs whose segments may come within `extra` of each other
function polePairs(poles, extra){
  const n=poles.length; if(!n) return [];
  let maxL=0; for(const p of poles) maxL=Math.max(maxL,p.len);
  const h=maxL+extra, grid=new Map(), key=(i,j,k)=>(i+512)+1024*((j+512)+1024*(k+512));
  const mx=new Float64Array(n*3), cell=new Int32Array(n*3);
  poles.forEach((p,i)=>{ mx[i*3]=(p.a.x+p.b.x)/2; mx[i*3+1]=(p.a.y+p.b.y)/2; mx[i*3+2]=(p.a.z+p.b.z)/2;
    for(let a=0;a<3;a++) cell[i*3+a]=Math.floor(mx[i*3+a]/h);
    const k=key(cell[i*3],cell[i*3+1],cell[i*3+2]); let l=grid.get(k); if(!l) grid.set(k,l=[]); l.push(i); });
  const pairs=[];
  for(let i=0;i<n;i++){
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const l=grid.get(key(cell[i*3]+dx,cell[i*3+1]+dy,cell[i*3+2]+dz)); if(!l) continue;
      for(const j of l){ if(j<=i) continue; const lim=(poles[i].len+poles[j].len)/2+extra;
        const ex=mx[i*3]-mx[j*3], ey=mx[i*3+1]-mx[j*3+1], ez=mx[i*3+2]-mx[j*3+2];
        if(ex*ex+ey*ey+ez*ez<=lim*lim) pairs.push(i,j); }
    }
  }
  return pairs;
}
function generate(){
  const rng=mulberry32(P.seed*9973+17), seeds=[], m=0.06, sz=new V3().subVectors(F.max,F.min);
  const gh=P.spacing*0.7, grid=new Map(), key=(i,j,k)=>(i+512)+1024*((j+512)+1024*(k+512));
  const maxA=P.count*300;
  for(let a=0;a<maxA && seeds.length<P.count;a++){
    const p=new V3(F.min.x+m+rng()*(sz.x-2*m), F.min.y+0.1+rng()*(sz.y-0.1-m), F.min.z+m+rng()*(sz.z-2*m));
    const d=clamp(sScalar(F.densEff,p),0,1);
    if(rng()>Math.pow(d,1.4)) continue;
    const sp=P.spacing*(1.35-0.5*d), sp2=sp*sp, ci=Math.floor(p.x/gh), cj=Math.floor(p.y/gh), ck=Math.floor(p.z/gh), R=Math.ceil(sp/gh);
    let ok=true;
    for(let dx=-R;dx<=R&&ok;dx++)for(let dy=-R;dy<=R&&ok;dy++)for(let dz=-R;dz<=R&&ok;dz++){
      const l=grid.get(key(ci+dx,cj+dy,ck+dz)); if(l) for(const q of l) if(q.distanceToSquared(p)<sp2){ok=false;break;} }
    if(!ok) continue;
    seeds.push(p); const k=key(ci,cj,ck); let l=grid.get(k); if(!l) grid.set(k,l=[]); l.push(p);
  }
  const poles=seeds.map((c,i)=>{
    const L=Math.round(lerp(P.lenMin,P.lenMax,clamp(sScalar(F.ch.length,c),0,1))*40)/40;
    const f=traceEnd(c,L/2,1), b=traceEnd(c,L/2,-1);
    const dir=new V3().subVectors(f,b); if(dir.length()<1e-3) fieldDir(c,dir); dir.normalize();
    const mid=f.clone().add(b).multiplyScalar(0.5);
    const up=new V3(0,1,0); let n1=new V3().crossVectors(dir,up); if(n1.length()<0.1) n1.set(1,0,0); n1.normalize();
    const n2=new V3().crossVectors(n1,dir).normalize();
    const ang=(rng()<0.5?-1:1)*P.weave*DEG*(0.75+0.5*rng());
    dir.applyAxisAngle(P.weaveAxis==='inplane'?n1:n2, ang).normalize();
    let dia=lerp(P.diaMin,P.diaMax,clamp(sScalar(F.ch.diameter,mid),0,1));
    if(P.stock) dia=STOCK_DIA.reduce((a,v)=>Math.abs(v-dia)<Math.abs(a-dia)?v:a, STOCK_DIA[0]);
    return {id:i, a:mid.clone().addScaledVector(dir,-L/2), b:mid.clone().addScaledVector(dir,L/2), dir, len:L, dia, r:dia/2000,
      tint:clamp(sScalar(F.ch.tint,mid),0,1), grounded:false, holes:[]};
  });
  relax(poles,10);
  for(const p of poles) groundPole(p);
  S.poles=poles;
  makeJoints();
  buildMeshes();
  S.res=null; S.asm=null;
  if(S.selected>=S.poles.length) S.selected=-1;
}
function relax(poles,iters){
  const clear=P.clear/1000, mv=new V3(), rng=mulberry32(P.seed+3);
  const pairs=polePairs(poles,0.15);
  for(let it=0;it<iters;it++){
    let moved=0;
    for(let q=0;q<pairs.length;q+=2){
      const A=poles[pairs[q]], B=poles[pairs[q+1]];
      const need=A.r+B.r+clear;
      const r=segClosest(A.a,A.b,B.a,B.b);
      if(r.d>=need) continue;
      if(r.d<1e-5){ mv.crossVectors(A.dir,B.dir); if(mv.length()<1e-3) mv.set(rng()-.5,rng()-.5,rng()-.5); mv.normalize(); }
      else mv.set(r.nx/r.d,r.ny/r.d,r.nz/r.d);
      const push=(need-r.d)/2+0.002;
      A.a.addScaledVector(mv,push);A.b.addScaledVector(mv,push);B.a.addScaledVector(mv,-push);B.b.addScaledVector(mv,-push); moved++;
    }
    if(!moved) break;
  }
}
function groundPole(p){
  if(p.a.y>p.b.y){const t=p.a;p.a=p.b;p.b=t;}  // end A = lower end
  p.dir.subVectors(p.b,p.a).normalize();
  if(p.a.y<P.snap && p.dir.y>0.2){
    const s=p.b.y/(p.b.y-p.a.y), na=p.b.clone().lerp(p.a,s);
    if(na.distanceTo(p.b)<=P.lenMax*1.4){ p.a.copy(na); p.grounded=true; }
  }
  if(!p.grounded && p.a.y<0){ const s=p.b.y/(p.b.y-p.a.y); p.a.copy(p.b.clone().lerp(p.a,s)); p.grounded=true; }
  p.len=p.a.distanceTo(p.b); p.dir.subVectors(p.b,p.a).normalize();
  p.ref=refMark(p.dir); p.w=new V3().crossVectors(p.dir,p.ref);
}
function makeJoints(){
  const poles=S.poles, n=poles.length, reach=P.reach/1000, ed=P.endDist/1000, hs=P.holeSpace/1000;
  const sub=(p)=>{const e=Math.min(ed,p.len*0.3);return [p.a.clone().addScaledVector(p.dir,e), p.b.clone().addScaledVector(p.dir,-e), e];};
  const segs=poles.map(sub);
  const tryPair=(i,j,maxD)=>{
    const A=poles[i],B=poles[j]; const [a0,a1,ea]=segs[i],[b0,b1,eb]=segs[j];
    const r=segClosest(a0,a1,b0,b1);
    if(r.d>maxD || r.d<A.r+B.r+0.004) return null;
    const ti=(ea+r.s*(A.len-2*ea))/A.len, tj=(eb+r.t*(B.len-2*eb))/B.len;
    const pa=A.a.clone().lerp(A.b,ti), pb=B.a.clone().lerp(B.b,tj), dd=new V3().subVectors(pb,pa).normalize();
    const tilt=Math.min(Math.acos(Math.abs(dd.dot(A.dir))),Math.acos(Math.abs(dd.dot(B.dir))))/DEG;
    if(tilt<50) return null;
    return {i,j,ti,tj,d:r.d,tilt};
  };
  const pairs=polePairs(poles,reach*1.75), nb=Array.from({length:n},()=>[]), cands=[];
  for(let q=0;q<pairs.length;q+=2){ const i=pairs[q], j=pairs[q+1]; nb[i].push(j); nb[j].push(i); const c=tryPair(i,j,reach); if(c) cands.push(c); }
  cands.sort((x,y)=>x.d-y.d);
  const holes=poles.map(()=>[]), dowels=[], has=new Set();
  const par=new Int32Array(n).map((_,i)=>i), gf=Uint8Array.from(poles.map(p=>p.grounded?1:0));
  const find=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
  const ok=(c,maxJ)=>{
    if(holes[c.i].length>=maxJ||holes[c.j].length>=maxJ) return false;
    const si=c.ti*poles[c.i].len, sj=c.tj*poles[c.j].len;
    if(holes[c.i].some(h=>Math.abs(h-si)<hs)||holes[c.j].some(h=>Math.abs(h-sj)<hs)) return false;
    return true;
  };
  const add=c=>{ holes[c.i].push(c.ti*poles[c.i].len); holes[c.j].push(c.tj*poles[c.j].len); dowels.push(c);
    has.add(Math.min(c.i,c.j)*n+Math.max(c.i,c.j)); const a=find(c.i), b=find(c.j); if(a!==b){ par[a]=b; gf[b]|=gf[a]; } };
  for(const c of cands) if(ok(c,P.maxJ)) add(c);
  // connectivity pass: link clusters that do not reach the ground, with a longer reach
  for(let pass=0;pass<2;pass++){
    const extra=[];
    for(let q=0;q<pairs.length;q+=2){ const i=pairs[q], j=pairs[q+1], a=find(i), b=find(j);
      if(a===b||(gf[a]&&gf[b])) continue; const c=tryPair(i,j,reach*1.7); if(c) extra.push(c); }
    extra.sort((x,y)=>x.d-y.d);
    for(const c of extra){ const a=find(c.i), b=find(c.j); if(a===b||(gf[a]&&gf[b])) continue; if(ok(c,P.maxJ+1)) add(c); }
  }
  // every free-standing pole needs two dowels, otherwise it swings on the one it has
  for(let i=0;i<n;i++){
    if(poles[i].grounded||holes[i].length>=2) continue;
    const extra=[]; for(const j of nb[i]){ if(has.has(Math.min(i,j)*n+Math.max(i,j))) continue; const c=tryPair(i,j,reach*1.5); if(c) extra.push(c); }
    extra.sort((x,y)=>x.d-y.d);
    for(const c of extra){ if(holes[i].length>=2) break; if(ok(c,P.maxJ+2)) add(c); }
  }
  S.pruned=0;
  if(P.prune){
    // drop poles left with fewer than two dowels; repeat because removing one can strand a neighbour
    let keep=poles.map(()=>true);
    for(let pass=0;pass<4;pass++){
      const cnt=poles.map(()=>0); for(const d of dowels) if(keep[d.i]&&keep[d.j]){cnt[d.i]++;cnt[d.j]++;}
      let changed=false; poles.forEach((p,i)=>{ if(keep[i]&&!p.grounded&&cnt[i]<2){keep[i]=false;changed=true;} });
      if(!changed) break;
    }
    if(keep.some(k=>!k)){
      const o2n=new Int32Array(n).fill(-1), kept=[];
      poles.forEach((p,i)=>{ if(keep[i]){ o2n[i]=kept.length; kept.push(p);} });
      kept.forEach((p,k)=>p.id=k);
      const nd=dowels.filter(d=>keep[d.i]&&keep[d.j]).map(d=>({...d,i:o2n[d.i],j:o2n[d.j]}));
      S.pruned=n-kept.length; S.poles=kept;
      return makeJointsFinish(kept,nd);
    }
  }
  return makeJointsFinish(poles,dowels);
}
function makeJointsFinish(poles,dowels){
  const dw=DOWELS[P.dowel];
  S.dowels=dowels.map((c,k)=>{
    const A=poles[c.i],B=poles[c.j];
    return {id:k, pi:c.i, pj:c.j, ti:c.ti, tj:c.tj, gap:c.d, tilt:c.tilt, len:c.d+A.r+B.r+0.04, r:dw.d/2};
  });
  for(const p of poles) p.holes=[];
  for(const d of S.dowels){
    for(const [pid,t,oid,ot] of [[d.pi,d.ti,d.pj,d.tj],[d.pj,d.tj,d.pi,d.ti]]){
      const p=poles[pid], o=poles[oid];
      const pa=p.a.clone().lerp(p.b,t), pb=o.a.clone().lerp(o.b,ot), v=pb.sub(pa).normalize();
      let ang=Math.atan2(v.dot(p.w),v.dot(p.ref))/DEG; if(ang<0) ang+=360;
      const tilt=Math.acos(clamp(v.dot(p.dir),-1,1))/DEG; // angle between dowel and pole axis
      p.holes.push({dowel:d.id, t, pos:t*p.len, ang, tilt, other:oid});
    }
  }
  for(const p of poles) p.holes.sort((a,b)=>a.t-b.t);
}
function components(n,dowels,filter){
  const par=[...Array(n).keys()], f=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x];}return x;};
  for(const d of dowels){ const i=d.i??d.pi, j=d.j??d.pj; if(filter&&(!filter(i)||!filter(j))) continue; par[f(i)]=f(j); }
  return par.map((_,i)=>f(i));
}
