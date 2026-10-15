// Pole names, groove maths on the CPU and the unrolled pole drawing.
"use strict";

/* ------------------------------------------------------------------ fabrication drawing */
function pname(id){ return 'P'+String(id+1).padStart(4,'0'); }
function patDistCPU(d1,d2){
  const f=U.uFreq.value, ph=U.uPhase.value, R=U.uRange.value;
  if(d1>R) return 1;
  const bands=v=>Math.abs((((v*f+ph+0.5)%1)+1)%1-0.5)/f;
  let halo=bands(d1), cells=(d2-d1)*0.5, fringe=bands((d2-d1)*0.5);
  if(d2>R*1.6){ cells=1; fringe=1; }
  switch(P.patType){ case 'halo': return halo; case 'cells': return cells; case 'fringe': return fringe; default: return Math.min(halo,cells); }
}
function patHalfW(d1){ const t=clamp(d1/U.uRange.value,0,1); return U.uHalfW.value*(P.patTaper?lerp(1.6,0.3,t):1); }
function drawUnroll(canvas,p){
  const dpr=window.devicePixelRatio||1, W=canvas.clientWidth||300, H=Math.round(W*0.3);
  canvas.style.height=H+'px'; canvas.width=W*dpr; canvas.height=H*dpr;
  const x=canvas.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0);
  const padX=6,padY=14, w=W-2*padX, h=H-2*padY-10;
  const wood=new THREE.Color(P.woodA).lerp(new THREE.Color(P.woodB),p.tint);
  const img=x.createImageData(Math.round(w*dpr),Math.round(h*dpr)), iw=img.width, ih=img.height, d=img.data;
  const c=new V3(), o=new V3(), px=[0,0]; let grooveArea=0, grooveW=0;
  for(let j=0;j<ih;j++){ const th=(j/ih)*Math.PI*2; o.copy(p.ref).multiplyScalar(Math.cos(th)).addScaledVector(p.w,Math.sin(th)).multiplyScalar(p.r);
    for(let i=0;i<iw;i++){ const t=i/(iw-1); c.copy(p.a).lerp(p.b,t).add(o);
      let g=0; if(P.patOn){ proxAt(p.id,c.x,c.y,c.z,px); const hw=patHalfW(px[0]); if(patDistCPU(px[0],px[1])<hw){ g=1; grooveArea++; grooveW+=hw*2; } }
      const k=(j*iw+i)*4; d[k]=g?0x3d:wood.r*255; d[k+1]=g?0x2a:wood.g*255; d[k+2]=g?0x18:wood.b*255; d[k+3]=255; } }
  x.fillStyle=css('--panel-2'); x.fillRect(0,0,W,H);
  x.putImageData(img,padX*dpr,padY*dpr);
  x.strokeStyle=css('--line-2'); x.strokeRect(padX+.5,padY+.5,w,h);
  // holes: entry and exit (through holes are drilled 180° apart)
  const hd=DOWELS[P.dowel].hole/1000, sx=w/p.len, sy=h/(Math.PI*2*p.r);
  for(const hl of p.holes){
    for(const [a,solid] of [[hl.ang,true],[(hl.ang+180)%360,false]]){
      const cx=padX+hl.t*w, cy=padY+a/360*h;
      x.beginPath(); x.ellipse(cx,cy,Math.max(2,hd/2*sx),Math.min(h/2,hd/2*sy),0,0,Math.PI*2);
      x.fillStyle=solid?css('--fg'):'transparent'; x.strokeStyle=css('--fg'); x.lineWidth=1.2; if(solid) x.fill(); x.stroke(); }
  }
  x.font='10px "JetBrains Mono", monospace'; x.fillStyle=css('--muted');
  x.textAlign='left'; x.fillText('A · base end',padX,10); x.textAlign='right'; x.fillText(`${Math.round(p.len*1000)} mm`,W-padX,10);
  x.textAlign='left'; x.fillText(`0°`,padX+2,padY+h+11); x.textAlign='right'; x.fillText(`circumference ×${Math.max(1,Math.round(sy/sx))} vertical scale`,W-padX,padY+h+11);
  // approximate routed length = groove area / mean groove width
  const pxArea=(p.len/iw)*(Math.PI*2*p.r/ih);
  return grooveArea?grooveArea*pxArea/(grooveW/grooveArea):0;
}
