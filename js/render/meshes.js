// Merged pole mesh, proximity attributes and instanced dowels.
"use strict";

/* ------------------------------------------------------------------ meshes: one merged pole mesh, instanced dowels */
const NR=12, PROX_MAX=0.45;
let poleMesh=null, dowelInst=null, supportInst=null;
const _px=[0,0];
// distance from a point on pole `pid` to the surfaces of its two nearest neighbouring poles
function proxAt(pid,x,y,z,out){
  let d1=PROX_MAX, d2=PROX_MAX;
  for(const j of S.nbr[pid]){ const q=S.poles[j]; const d=distPointSeg(x,y,z,q.a,q.b)-q.r; if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; }
  out[0]=Math.max(0,d1); out[1]=Math.max(0,d2); return out;
}
function buildMeshes(){
  const poles=S.poles;
  // neighbour lists for the proximity pattern
  const pairs=polePairs(poles,PROX_MAX); S.nbr=poles.map(()=>[]);
  for(let q=0;q<pairs.length;q+=2){ const i=pairs[q], j=pairs[q+1], A=poles[i], B=poles[j];
    if(segClosest(A.a,A.b,B.a,B.b).d-A.r-B.r<PROX_MAX){ S.nbr[i].push(j); S.nbr[j].push(i); } }
  let V=0, I=0;
  for(const p of poles){ p.nL=Math.max(3,Math.ceil(p.len*32)); p.v0=V; p.vn=(p.nL+1)*(NR+1)+2*(NR+2); V+=p.vn; I+=p.nL*NR*6+2*NR*3; }
  const pos=new Float32Array(V*3), nor=new Float32Array(V*3), col=new Float32Array(V*3), rest=new Float32Array(V*3), prox=new Float32Array(V*2), ord=new Float32Array(V), vt=new Float32Array(V), ind=new Uint32Array(I);
  const c=new V3(), off=new V3();
  let v=0, ii=0;
  for(const p of poles){
    const put=(t,ox,oy,oz,nx,ny,nz)=>{ c.copy(p.a).lerp(p.b,t); const x=c.x+ox,y=c.y+oy,z=c.z+oz;
      pos[v*3]=rest[v*3]=x;pos[v*3+1]=rest[v*3+1]=y;pos[v*3+2]=rest[v*3+2]=z; nor[v*3]=nx;nor[v*3+1]=ny;nor[v*3+2]=nz;
      proxAt(p.id,x,y,z,_px); prox[v*2]=_px[0]; prox[v*2+1]=_px[1]; vt[v]=t; return v++; };
    const base=v, nL=p.nL;
    for(let i=0;i<=nL;i++)for(let j=0;j<=NR;j++){
      const th=j/NR*Math.PI*2; off.copy(p.ref).multiplyScalar(Math.cos(th)).addScaledVector(p.w,Math.sin(th));
      put(i/nL, off.x*p.r,off.y*p.r,off.z*p.r, off.x,off.y,off.z);
    }
    for(let i=0;i<nL;i++)for(let j=0;j<NR;j++){ const a=base+i*(NR+1)+j, b=a+NR+1; ind[ii++]=a;ind[ii++]=b;ind[ii++]=a+1; ind[ii++]=b;ind[ii++]=b+1;ind[ii++]=a+1; }
    for(const [t,s] of [[0,-1],[1,1]]){
      const ctr=put(t,0,0,0,p.dir.x*s,p.dir.y*s,p.dir.z*s);
      for(let j=0;j<=NR;j++){ const th=j/NR*Math.PI*2; off.copy(p.ref).multiplyScalar(Math.cos(th)).addScaledVector(p.w,Math.sin(th)); put(t,off.x*p.r,off.y*p.r,off.z*p.r,p.dir.x*s,p.dir.y*s,p.dir.z*s); }
      for(let j=0;j<NR;j++){ if(s<0){ind[ii++]=ctr;ind[ii++]=ctr+2+j;ind[ii++]=ctr+1+j;} else {ind[ii++]=ctr;ind[ii++]=ctr+1+j;ind[ii++]=ctr+2+j;} }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('aRest',new THREE.BufferAttribute(rest,3));
  g.setAttribute('aProx',new THREE.BufferAttribute(prox,2)); g.setAttribute('aOrder',new THREE.BufferAttribute(ord,1));
  g.setIndex(new THREE.BufferAttribute(ind,1)); g.computeBoundingSphere();
  if(poleMesh){ gPoles.remove(poleMesh); poleMesh.geometry.dispose(); }
  else { poleMesh=null; }
  const mat=poleMesh?poleMesh.material:poleMaterial();
  poleMesh=new THREE.Mesh(g,mat); poleMesh.castShadow=true; poleMesh.receiveShadow=true; poleMesh.frustumCulled=false; gPoles.add(poleMesh);
  S.vt=vt; S.deformed=false;
  // dowels and base plates as instanced meshes
  if(dowelInst) gDowels.remove(dowelInst);
  dowelInst=new THREE.InstancedMesh(dowelGeo,dowelMat,Math.max(1,S.dowels.length)); dowelInst.count=S.dowels.length; dowelInst.castShadow=true; dowelInst.frustumCulled=false;
  dowelInst.setColorAt(0,new THREE.Color()); gDowels.add(dowelInst);
  if(supportInst) gSupports.remove(supportInst);
  const gp=poles.filter(p=>p.grounded);
  supportInst=new THREE.InstancedMesh(supportGeo,supportMat,Math.max(1,gp.length)); supportInst.count=gp.length; supportInst.frustumCulled=false; supportInst.userData.poles=gp.map(p=>p.id);
  gSupports.add(supportInst);
  applyDisplay();
}
