// Rigid-body frame model and block sparse Cholesky solver.
"use strict";

/* ------------------------------------------------------------------ FEA
   Rigid-body-spring frame model: each pole is a rigid body (6 DOF at its centroid); every dowel is a 3D
   Euler-Bernoulli beam between the two pole axes, and every grounded pole is tied to its base plate by a beam
   with the pole's own section (base to centroid). Pole bending stress is recovered from statics of the joint forces.
   Solved with a block sparse Cholesky in geometric nested-dissection order, which keeps thousands of poles fast. */
function frameK(x1,x2,E,G,A,I,J){
  const dx=x2[0]-x1[0],dy=x2[1]-x1[1],dz=x2[2]-x1[2], L=Math.hypot(dx,dy,dz);
  const ex=[dx/L,dy/L,dz/L]; const ref=Math.abs(ex[1])<0.95?[0,1,0]:[1,0,0];
  let ez=[ex[1]*ref[2]-ex[2]*ref[1], ex[2]*ref[0]-ex[0]*ref[2], ex[0]*ref[1]-ex[1]*ref[0]]; const lz=Math.hypot(...ez); ez=ez.map(v=>v/lz);
  const ey=[ez[1]*ex[2]-ez[2]*ex[1], ez[2]*ex[0]-ez[0]*ex[2], ez[0]*ex[1]-ez[1]*ex[0]];
  const R=[ex,ey,ez];
  const k=new Float64Array(144), s=(i,j,v)=>{k[i*12+j]=v;k[j*12+i]=v;};
  const EA=E*A/L, GJ=G*J/L, b12=12*E*I/L**3, b6=6*E*I/L**2, b4=4*E*I/L, b2=2*E*I/L;
  s(0,0,EA);s(0,6,-EA);s(6,6,EA); s(3,3,GJ);s(3,9,-GJ);s(9,9,GJ);
  s(1,1,b12);s(1,5,b6);s(1,7,-b12);s(1,11,b6);s(5,5,b4);s(5,7,-b6);s(5,11,b2);s(7,7,b12);s(7,11,-b6);s(11,11,b4);
  s(2,2,b12);s(2,4,-b6);s(2,8,-b12);s(2,10,-b6);s(4,4,b4);s(4,8,b6);s(4,10,b2);s(8,8,b12);s(8,10,b6);s(10,10,b4);
  const T=new Float64Array(144); for(let b=0;b<4;b++)for(let i=0;i<3;i++)for(let j=0;j<3;j++) T[(b*3+i)*12+b*3+j]=R[i][j];
  const kT=new Float64Array(144), Kg=new Float64Array(144);
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){let v=0;for(let m=0;m<12;m++) v+=k[i*12+m]*T[m*12+j]; kT[i*12+j]=v;}
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){let v=0;for(let m=0;m<12;m++) v+=T[m*12+i]*kT[m*12+j]; Kg[i*12+j]=v;}
  return {Kg,k,T,L};
}
// 6x6 helpers (row-major Float64Array(36))
function sub6(K,r0,c0){ const M=new Float64Array(36); for(let i=0;i<6;i++)for(let j=0;j<6;j++) M[i*6+j]=K[(r0+i)*12+c0+j]; return M; }
function mul6(A,B){ const C=new Float64Array(36); for(let i=0;i<6;i++)for(let k=0;k<6;k++){ const a=A[i*6+k]; if(a===0) continue; for(let j=0;j<6;j++) C[i*6+j]+=a*B[k*6+j]; } return C; }
function tmul6(A,B){ const C=new Float64Array(36); for(let k=0;k<6;k++)for(let i=0;i<6;i++){ const a=A[k*6+i]; if(a===0) continue; for(let j=0;j<6;j++) C[i*6+j]+=a*B[k*6+j]; } return C; }
function tr6(A){ const C=new Float64Array(36); for(let i=0;i<6;i++)for(let j=0;j<6;j++) C[j*6+i]=A[i*6+j]; return C; }
function add6(T,A){ for(let i=0;i<36;i++) T[i]+=A[i]; }
// transform from body centroid DOFs to a point at offset r:  u_p = u_c + theta x r
function rbT(rx,ry,rz){ const T=new Float64Array(36); for(let i=0;i<6;i++) T[i*7]=1;
  T[4]=rz; T[5]=-ry; T[6+3]=-rz; T[6+5]=rx; T[12+3]=ry; T[12+4]=-rx; return T; }
function apply6(T,u,o){ const r=new Float64Array(6); for(let i=0;i<6;i++){let s=0;for(let j=0;j<6;j++) s+=T[i*6+j]*u[o+j]; r[i]=s;} return r; }
// geometric nested dissection: split along the longest axis, separator = left nodes touching the right half
function ndOrder(n,adj,pos){
  const order=[], tag=new Int32Array(n); let tg=0;
  const rec=nodes=>{
    if(nodes.length<=40){ for(const v of nodes) order.push(v); return; }
    const mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
    for(const v of nodes) for(let a=0;a<3;a++){ const x=pos[v*3+a]; if(x<mn[a]) mn[a]=x; if(x>mx[a]) mx[a]=x; }
    let ax=0; if(mx[1]-mn[1]>mx[ax]-mn[ax]) ax=1; if(mx[2]-mn[2]>mx[ax]-mn[ax]) ax=2;
    nodes.sort((p,q)=>pos[p*3+ax]-pos[q*3+ax]);
    const h=nodes.length>>1, L=nodes.slice(0,h), R=nodes.slice(h);
    tg++; for(const v of R) tag[v]=tg;
    const sep=[], Lp=[]; for(const v of L){ let s=false; for(const w of adj[v]) if(tag[w]===tg){s=true;break;} (s?sep:Lp).push(v); }
    rec(Lp); rec(R); for(const v of sep) order.push(v);
  };
  rec([...Array(n).keys()]);
  return order;
}
function chol6(D,ref){ // in-place lower Cholesky of a 6x6 block, returns true if a pivot had to be regularised
  let bad=false;
  for(let j=0;j<6;j++){
    let s=D[j*7]; for(let k=0;k<j;k++) s-=D[j*6+k]*D[j*6+k];
    const tol=1e-10*Math.abs(ref[j*7])+1e-12;
    if(!(s>tol)){ s=Math.abs(ref[j*7])*1e-6+1e-6; bad=true; }
    const l=Math.sqrt(s); D[j*7]=l;
    for(let i=j+1;i<6;i++){ let t=D[i*6+j]; for(let k=0;k<j;k++) t-=D[i*6+k]*D[j*6+k]; D[i*6+j]=t/l; }
    for(let i=0;i<j;i++) D[i*6+j]=0;
  }
  return bad;
}
function blockSolve(n,diag,off,b,pos,adj){
  const order=ndOrder(n,adj,pos), inv=new Int32Array(n); order.forEach((v,i)=>inv[v]=i);
  const colA=Array.from({length:n},()=>[]);
  for(const [key,M] of off){ const a=Math.floor(key/n), c=key-a*n, ia=inv[a], ic=inv[c]; // M: rows a, cols c
    if(ia>ic) colA[ic].push([ia,M]); else colA[ia].push([ic,tr6(M)]); }
  // symbolic factorisation via the elimination tree
  const children=Array.from({length:n},()=>[]), struct=new Array(n), mark=new Int32Array(n).fill(-1);
  for(let j=0;j<n;j++){ const s=[]; mark[j]=j;
    for(const [i] of colA[j]) if(mark[i]!==j){mark[i]=j;s.push(i);}
    for(const c of children[j]) for(const i of struct[c]) if(i>j&&mark[i]!==j){mark[i]=j;s.push(i);}
    s.sort((x,y)=>x-y); struct[j]=Int32Array.from(s); if(s.length) children[s[0]].push(j); }
  // numeric (left-looking, 6x6 blocks)
  const Lv=new Array(n), Ld=new Array(n), rowList=Array.from({length:n},()=>[]), pos2=new Int32Array(n), bad=[];
  for(let j=0;j<n;j++){
    const rows=struct[j], m=rows.length, vals=new Float64Array(36*m);
    for(let q=0;q<m;q++) pos2[rows[q]]=q;
    const D=diag[order[j]].slice();
    for(const [i,M] of colA[j]){ const o=pos2[i]*36; for(let t=0;t<36;t++) vals[o+t]+=M[t]; }
    for(const [k,p] of rowList[j]){
      const Lk=Lv[k], rk=struct[k], o=p*36;
      for(let r=0;r<6;r++)for(let c=0;c<=r;c++){ let s=0; for(let t=0;t<6;t++) s+=Lk[o+r*6+t]*Lk[o+c*6+t]; D[r*6+c]-=s; if(c!==r) D[c*6+r]-=s; }
      for(let q=p+1;q<rk.length;q++){ const to=pos2[rk[q]]*36, io=q*36;
        for(let r=0;r<6;r++)for(let c=0;c<6;c++){ let s=0; for(let t=0;t<6;t++) s+=Lk[io+r*6+t]*Lk[o+c*6+t]; vals[to+r*6+c]-=s; } }
    }
    if(chol6(D,diag[order[j]])) bad.push(order[j]);
    for(let q=0;q<m;q++){ const o=q*36; // X := X C^-T  (forward-substitute each row)
      for(let r=0;r<6;r++) for(let c=0;c<6;c++){ let s=vals[o+r*6+c]; for(let t=0;t<c;t++) s-=vals[o+r*6+t]*D[c*6+t]; vals[o+r*6+c]=s/D[c*7]; } }
    Lv[j]=vals; Ld[j]=D;
    for(let q=0;q<m;q++) rowList[rows[q]].push([j,q]);
  }
  const y=new Float64Array(n*6);
  for(let j=0;j<n;j++) for(let q=0;q<6;q++) y[j*6+q]=b[order[j]*6+q];
  for(let j=0;j<n;j++){ const C=Ld[j], o=j*6;
    for(let r=0;r<6;r++){ let s=y[o+r]; for(let t=0;t<r;t++) s-=C[r*6+t]*y[o+t]; y[o+r]=s/C[r*7]; }
    const rows=struct[j], L=Lv[j];
    for(let q=0;q<rows.length;q++){ const io=rows[q]*6, lo=q*36; for(let r=0;r<6;r++){ let s=0; for(let c=0;c<6;c++) s+=L[lo+r*6+c]*y[o+c]; y[io+r]-=s; } } }
  for(let j=n-1;j>=0;j--){ const C=Ld[j], o=j*6, rows=struct[j], L=Lv[j];
    for(let q=0;q<rows.length;q++){ const io=rows[q]*6, lo=q*36; for(let c=0;c<6;c++){ let s=0; for(let r=0;r<6;r++) s+=L[lo+r*6+c]*y[io+r]; y[o+c]-=s; } }
    for(let r=5;r>=0;r--){ let s=y[o+r]; for(let t=r+1;t<6;t++) s-=C[t*6+r]*y[o+t]; y[o+r]=s/C[r*7]; } }
  const x=new Float64Array(n*6); for(let j=0;j<n;j++) for(let q=0;q<6;q++) x[order[j]*6+q]=y[j*6+q];
  return {x,bad};
}
function analyse(set, opt={}){
  const inS=set?(id=>set.has(id)):(()=>true);
  const poles=S.poles.filter(p=>inS(p.id)), dws=S.dowels.filter(d=>inS(d.pi)&&inS(d.pj));
  const comp=components(S.poles.length,dws,inS), gComp=new Set();
  poles.forEach(p=>{if(p.grounded) gComp.add(comp[p.id]);});
  const floating=poles.filter(p=>!gComp.has(comp[p.id])).map(p=>p.id);
  const useProps=!!opt.props, active=poles.filter(p=>gComp.has(comp[p.id])||useProps);
  const res={body:new Map(), x:null, cen:null, floating, props:[], mech:[], poleUtil:new Map(), poleDisp:new Map(), dowelUtil:new Map(), maxDisp:0, maxUtil:0, crit:null, count:active.length};
  if(!active.length) return finish(res);
  const gr=GRADES[P.grade], dw=DOWELS[P.dowel], g=9.81*P.loadFactor, nb=active.length;
  active.forEach((p,i)=>res.body.set(p.id,i));
  const cen=new Float64Array(nb*3); active.forEach((p,i)=>{ cen[i*3]=(p.a.x+p.b.x)/2; cen[i*3+1]=(p.a.y+p.b.y)/2; cen[i*3+2]=(p.a.z+p.b.z)/2; });
  res.cen=cen;
  const diag=Array.from({length:nb},()=>new Float64Array(36)), off=new Map(), Fv=new Float64Array(nb*6), adj=Array.from({length:nb},()=>[]);
  const elems=[], actions=Array.from({length:nb},()=>[]);
  const sec=p=>{ const A=Math.PI*p.r*p.r, I=Math.PI*p.r**4/4; return {A,I,J:2*I}; };
  const addOff=(a,b,M)=>{ if(a>b){ const k=a*nb+b, X=off.get(k); X?add6(X,M):off.set(k,M.slice()); } else { const k=b*nb+a, X=off.get(k), Mt=tr6(M); X?add6(X,Mt):off.set(k,Mt); } };
  // bases (and temporary supports): beam from the support point to the centroid, with the pole's section
  for(const p of active){
    const bi=res.body.get(p.id), prop=!p.grounded;
    if(!p.grounded&&!useProps) continue;
    if(prop&&gComp.has(comp[p.id])) continue;
    if(prop) res.props.push({pole:p.id, pt:[p.a.x,p.a.y,p.a.z]});
    const s=sec(p), c=[cen[bi*3],cen[bi*3+1],cen[bi*3+2]], fk=frameK([p.a.x,p.a.y,p.a.z],c,gr.E,gr.G,s.A,s.I,s.J);
    let K=sub6(fk.Kg,6,6);
    if(P.support==='pinned'&&!prop){ // condense the free base rotations
      const Krr=[3,4,5].map(i=>[3,4,5].map(j=>fk.Kg[i*12+j])), inv=inv3(Krr);
      for(let i=0;i<6;i++)for(let j=0;j<6;j++){ let s2=0; for(let a=0;a<3;a++)for(let b=0;b<3;b++) s2+=fk.Kg[(6+i)*12+3+a]*inv[a][b]*fk.Kg[(3+b)*12+6+j]; K[i*6+j]-=s2; }
    }
    add6(diag[bi],K); elems.push({kind:'ground',pole:p.id,b:bi,fk,K,r:p.r,A:s.A,f:gr.fm});
  }
  // self weight
  for(const p of active){ const bi=res.body.get(p.id); Fv[bi*6+1]-=sec(p).A*p.len*gr.rho*g; }
  // dowels: beam between the pole axes, attached to both rigid bodies
  const dA=Math.PI*dw.d*dw.d/4, dI=Math.PI*dw.d**4/64, dJ=2*dI*20*(Math.max(P.clamp,0.05)/100);
  for(const d of dws){
    const ba=res.body.get(d.pi), bb=res.body.get(d.pj); if(ba===undefined||bb===undefined) continue;
    const A=S.poles[d.pi], B=S.poles[d.pj], pa=A.a.clone().lerp(A.b,d.ti), pb=B.a.clone().lerp(B.b,d.tj);
    const fk=frameK([pa.x,pa.y,pa.z],[pb.x,pb.y,pb.z],dw.E,dw.G,dA,dI,dJ);
    const TA=rbT(pa.x-cen[ba*3],pa.y-cen[ba*3+1],pa.z-cen[ba*3+2]), TB=rbT(pb.x-cen[bb*3],pb.y-cen[bb*3+1],pb.z-cen[bb*3+2]);
    add6(diag[ba],tmul6(TA,mul6(sub6(fk.Kg,0,0),TA))); add6(diag[bb],tmul6(TB,mul6(sub6(fk.Kg,6,6),TB)));
    addOff(ba,bb,tmul6(TA,mul6(sub6(fk.Kg,0,6),TB)));
    adj[ba].push(bb); adj[bb].push(ba);
    const Wd=dA*d.len*dw.rho*g/2;
    for(const [bi,T] of [[ba,TA],[bb,TB]]){ for(let q=0;q<6;q++) Fv[bi*6+q]+=T[1*6+q]*(-Wd); }
    elems.push({kind:'dowel',id:d.id,fk,ba,bb,TA,TB,ti:d.ti,tj:d.tj,pa,pb,r:dw.d/2,A:dA,f:dw.fy});
  }
  if(opt.pointLoad&&res.body.has(opt.pointLoad.pole)) Fv[res.body.get(opt.pointLoad.pole)*6+1]-=opt.pointLoad.N;
  const {x,bad}=blockSolve(nb,diag,off,Fv,cen,adj);
  res.x=x; res.singular=bad.length;
  // displacement of each pole = rigid motion of its ends
  const MECH=0.25, mech=new Set();
  const ptDisp=(bi,px,py,pz)=>{ const o=bi*6, rx=px-cen[bi*3], ry=py-cen[bi*3+1], rz=pz-cen[bi*3+2];
    return [x[o]+x[o+4]*rz-x[o+5]*ry, x[o+1]+x[o+5]*rx-x[o+3]*rz, x[o+2]+x[o+3]*ry-x[o+4]*rx]; };
  res.ptDisp=ptDisp;
  for(const p of active){ const bi=res.body.get(p.id); let m=0;
    for(const e of [p.a,p.b]){ const d=ptDisp(bi,e.x,e.y,e.z); m=Math.max(m,Math.hypot(d[0],d[1],d[2])); }
    res.poleDisp.set(p.id,m); if(m>MECH||bad.includes(bi)) mech.add(p.id); }
  res.mech=[...mech];
  // member forces
  const endForces=(e,ug)=>{ const ul=new Float64Array(12); for(let i=0;i<12;i++){let v=0;for(let m=0;m<12;m++) v+=e.fk.T[i*12+m]*ug[m]; ul[i]=v;}
    const f=new Float64Array(12); for(let i=0;i<12;i++){let v=0;for(let m=0;m<12;m++) v+=e.fk.k[i*12+m]*ul[m]; f[i]=v;}
    const Fg=new Float64Array(12); for(let i=0;i<12;i++){let v=0;for(let m=0;m<12;m++) v+=e.fk.T[m*12+i]*f[m]; Fg[i]=v;}
    const Nf=Math.abs(f[6]), M=Math.max(Math.hypot(f[4],f[5]),Math.hypot(f[10],f[11])), W=Math.PI*e.r**3/4;
    return {Fg, u:(Nf/e.A+M/W)/e.f}; };
  for(const e of elems){
    if(e.kind==='ground'){ if(mech.has(e.pole)) continue; const ug=new Float64Array(12); for(let q=0;q<6;q++) ug[6+q]=x[e.b*6+q];
      const {u}=endForces(e,ug); res.poleUtil.set(e.pole,Math.max(res.poleUtil.get(e.pole)||0,u)); if(u>res.maxUtil){res.maxUtil=u;res.crit={kind:'pole',id:e.pole};} continue; }
    const d=S.dowels[e.id]; if(mech.has(d.pi)||mech.has(d.pj)) continue;
    const ua=apply6(e.TA,x,e.ba*6), ub=apply6(e.TB,x,e.bb*6), ug=new Float64Array(12); ug.set(ua,0); ug.set(ub,6);
    const {Fg,u}=endForces(e,ug);
    res.dowelUtil.set(e.id,u); if(u>res.maxUtil){res.maxUtil=u;res.crit={kind:'dowel',id:e.id};}
    actions[e.ba].push({t:e.ti,p:e.pa,F:[-Fg[0],-Fg[1],-Fg[2]],M:[-Fg[3],-Fg[4],-Fg[5]]});
    actions[e.bb].push({t:e.tj,p:e.pb,F:[-Fg[6],-Fg[7],-Fg[8]],M:[-Fg[9],-Fg[10],-Fg[11]]});
  }
  // pole bending from statics: cut the pole at each joint and sum everything above the cut
  for(const p of active){ if(mech.has(p.id)) continue;
    const bi=res.body.get(p.id), acts=actions[bi], s0=sec(p), w=s0.A*gr.rho*g, W=Math.PI*p.r**3/4, d=p.dir;
    const cuts=[0]; for(const a of acts) cuts.push(a.t-1e-6,a.t+1e-6);
    let umax=res.poleUtil.get(p.id)||0;
    for(const s of cuts){ if(s<0||s>1) continue;
      const ps=p.a.clone().lerp(p.b,s); let Fx=0,Fy=0,Fz=0,Mx=0,My=0,Mz=0;
      for(const a of acts){ if(a.t<=s) continue; const rx=a.p.x-ps.x, ry=a.p.y-ps.y, rz=a.p.z-ps.z;
        Fx+=a.F[0];Fy+=a.F[1];Fz+=a.F[2]; Mx+=a.M[0]+ry*a.F[2]-rz*a.F[1]; My+=a.M[1]+rz*a.F[0]-rx*a.F[2]; Mz+=a.M[2]+rx*a.F[1]-ry*a.F[0]; }
      const Lw=(1-s)*p.len, Fw=-w*Lw, half=Lw/2; // weight of the part above the cut, at its centre
      const rx=d.x*half, rz=d.z*half; Fy+=Fw; Mx+=-rz*Fw; Mz+=rx*Fw;
      const N=Fx*d.x+Fy*d.y+Fz*d.z, Ma=Mx*d.x+My*d.y+Mz*d.z, Mb=Math.hypot(Mx-Ma*d.x,My-Ma*d.y,Mz-Ma*d.z);
      umax=Math.max(umax,(Math.abs(N)/s0.A+Mb/W)/gr.fm);
    }
    res.poleUtil.set(p.id,umax); if(umax>res.maxUtil){res.maxUtil=umax;res.crit={kind:'pole',id:p.id};}
  }
  for(const [id,m] of res.poleDisp) if(!mech.has(id)) res.maxDisp=Math.max(res.maxDisp,m);
  return finish(res);
}
function inv3(m){ const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2]; const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, det=a*A+b*B+c*C||1e-30;
  return [[A/det,-(b*i-c*h)/det,(b*f-c*e)/det],[B/det,(a*i-c*g)/det,-(a*f-c*d)/det],[C/det,-(a*h-b*g)/det,(a*e-b*d)/det]]; }
function finish(res){
  const lim=P.limitUtil/100, ld=P.limitDisp/1000;
  const issues=[];
  if(res.floating.length&&!res.props.length) issues.push(`${res.floating.length} pole${res.floating.length>1?'s':''} not connected to the ground`);
  if(res.mech.length) issues.push(`${res.mech.length} pole${res.mech.length>1?'s':''} free to rotate (mechanism)`);
  if(res.maxUtil>lim) issues.push(`stress ${Math.round(res.maxUtil*100)}% of capacity`);
  if(res.maxDisp>ld) issues.push(`deflection ${(res.maxDisp*1000).toFixed(1)} mm over ${P.limitDisp} mm limit`);
  res.issues=issues;
  res.status = issues.length?'crit':(res.props.length||res.maxUtil>0.7*lim||res.maxDisp>0.7*ld)?'warn':'ok';
  return res;
}
