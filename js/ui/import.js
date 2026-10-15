// Example sketch, SVG and image import.
"use strict";

/* sketch import */
function exampleSketch(){
  const pts=(fn,n)=>Array.from({length:n},(_,i)=>fn(i/(n-1)));
  const sz=new V3().subVectors(F.max,F.min), cx=(F.min.x+F.max.x)/2, z=F.min.z+sz.z*0.5;
  S.strokes.push({extrude:'z',pts:pts(t=>new V3(F.min.x+sz.x*(0.08+0.84*t), F.min.y+sz.y*(0.15+0.7*Math.sin(t*Math.PI)) , z),40)});
  S.strokes.push({extrude:'z',pts:pts(t=>new V3(cx+Math.cos(t*Math.PI*3)*sz.x*0.18*(1-t*0.5), F.min.y+sz.y*(0.1+0.8*t), z),40)});
  rebuildSketchViz(); afterFieldEdit(); renderPanel(); toast('Example sketch loaded as two guide curves (extruded through depth)');
}
$('#fileSvg').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return; const txt=await f.text(); e.target.value='';
  const holder=document.createElement('div'); holder.style.cssText='position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden';
  holder.innerHTML=txt; document.body.appendChild(holder);
  const svg=holder.querySelector('svg'); if(!svg){ holder.remove(); toast('That file has no <svg> element'); return; }
  const els=[...svg.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect')];
  const raw=[];
  for(const el of els){ try{ const L=el.getTotalLength(); if(!(L>0)) continue; const n=clamp(Math.ceil(L/6),8,200), m=el.getCTM&&el.getCTM();
    const pts=[]; for(let i=0;i<=n;i++){ let p=el.getPointAtLength(L*i/n); if(m&&svg.createSVGPoint){ const q=svg.createSVGPoint(); q.x=p.x;q.y=p.y; p=q.matrixTransform(m);} pts.push([p.x,p.y]); } raw.push(pts);}catch(err){} }
  holder.remove();
  if(!raw.length){ toast('No drawable curves found in that SVG'); return; }
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; raw.flat().forEach(([x,y])=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);});
  const sz=new V3().subVectors(F.max,F.min), s=Math.min(sz.x*0.9/(x1-x0||1),(P.imgPlane==='xy'?sz.y:sz.z)*0.9/(y1-y0||1));
  pushUndo();
  for(const pts of raw){
    const v=pts.map(([x,y])=>{ const u=(x-(x0+x1)/2)*s, w=(y-(y0+y1)/2)*s;
      return P.imgPlane==='xy'? new V3((F.min.x+F.max.x)/2+u,(F.min.y+F.max.y)/2-w,(F.min.z+F.max.z)/2) : new V3((F.min.x+F.max.x)/2+u,0.02,(F.min.z+F.max.z)/2+w); });
    S.strokes.push({extrude:P.imgPlane==='xy'?'z':'y',pts:v});
  }
  rebuildSketchViz(); afterFieldEdit(); renderPanel(); toast(`Imported ${raw.length} curve${raw.length>1?'s':''} from ${f.name}`);
});
$('#fileImg').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return; e.target.value='';
  const url=URL.createObjectURL(f), im=new Image();
  im.onload=()=>{ const w=160,h=Math.round(160*im.height/im.width)||160, c=document.createElement('canvas'); c.width=w;c.height=h; const x=c.getContext('2d'); x.drawImage(im,0,0,w,h);
    const d=x.getImageData(0,0,w,h).data, lum=new Float32Array(w*h);
    for(let i=0;i<w*h;i++) lum[i]=(0.2126*d[i*4]+0.7152*d[i*4+1]+0.0722*d[i*4+2])/255*(d[i*4+3]/255)+(1-d[i*4+3]/255);
    // light blur so contours give a smooth direction field
    const b=new Float32Array(w*h); for(let pass=0;pass<3;pass++){ for(let j=0;j<h;j++)for(let i=0;i<w;i++){let s=0,n=0;for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){const ii=i+di,jj=j+dj;if(ii>=0&&jj>=0&&ii<w&&jj<h){s+=lum[jj*w+ii];n++;}} b[j*w+i]=s/n;} lum.set(b); }
    pushUndo(); S.image={lum,w,h,plane:P.imgPlane,canvas:c,name:f.name}; URL.revokeObjectURL(url);
    computeImage(); rebuildImageViz(); afterFieldEdit(); renderPanel(); toast(`Image ${f.name} projected onto the ${P.imgPlane==='xy'?'front':'ground'} plane`); };
  im.onerror=()=>toast('That image could not be read'); im.src=url;
});
