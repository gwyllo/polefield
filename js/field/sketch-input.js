// Sketch strokes and imported images as field guides.
"use strict";

/* sketches: strokes become tangent guides in the field */
function computeSketch(){
  const SK=F.sketch; SK.fill(0);
  if(!S.strokes.length) return;
  const R=P.sketchR, T=F.total;
  for(let c=0;c<F.N;c++){
    const px=F.pos[c*3],py=F.pos[c*3+1],pz=F.pos[c*3+2];
    for(const st of S.strokes){
      const pts=st.pts, ex=st.extrude; let best=1e9, tx=0,ty=0,tz=0;
      for(let s=0;s<pts.length-1;s++){
        const a=pts[s], b=pts[s+1];
        let dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
        let qx=px-a.x, qy=py-a.y, qz=pz-a.z;
        if(ex==='z'){dz=0;qz=0;} else if(ex==='y'){dy=0;qy=0;}
        const ll=dx*dx+dy*dy+dz*dz; if(ll<1e-10) continue;
        const t=clamp((qx*dx+qy*dy+qz*dz)/ll,0,1);
        const ux=qx-dx*t, uy=qy-dy*t, uz=qz-dz*t, d2=ux*ux+uy*uy+uz*uz;
        if(d2<best){best=d2; const l=Math.sqrt(ll); tx=dx/l;ty=dy/l;tz=dz/l;}
      }
      if(best>9*R*R) continue;
      const wgt=Math.exp(-best/(R*R));
      // align tangent with the existing flow so strokes never cancel it
      const dot=tx*T[c*3]+ty*T[c*3+1]+tz*T[c*3+2]; const sg = dot<0?-1:1;
      SK[c*3]+=tx*wgt*sg; SK[c*3+1]+=ty*wgt*sg; SK[c*3+2]+=tz*wgt*sg;
    }
  }
}
/* image import: contours of the image drive direction, darkness drives density */
function computeImage(){
  F.img.fill(0); F.imgDark.fill(0);
  const im=S.image; if(!im) return;
  const {lum,w,h}=im, sz=new V3().subVectors(F.max,F.min);
  const L=(u,v)=>{const x=clamp(u*(w-1),0,w-1), y=clamp(v*(h-1),0,h-1), i=Math.floor(x), j=Math.floor(y), fx=x-i, fy=y-j, i1=Math.min(i+1,w-1), j1=Math.min(j+1,h-1);
    return lum[j*w+i]*(1-fx)*(1-fy)+lum[j*w+i1]*fx*(1-fy)+lum[j1*w+i]*(1-fx)*fy+lum[j1*w+i1]*fx*fy;};
  let gmax=1e-6; const tmp=[];
  for(let c=0;c<F.N;c++){
    const x=F.pos[c*3],y=F.pos[c*3+1],z=F.pos[c*3+2];
    let u=(x-F.min.x)/sz.x, v = im.plane==='xy' ? 1-(y-F.min.y)/sz.y : (z-F.min.z)/sz.z;
    const e=1.5/w, gu=(L(u+e,v)-L(u-e,v))/(2*e), gv=(L(u,v+e)-L(u,v-e))/(2*e);
    F.imgDark[c]=1-L(u,v); tmp.push([gu,gv]); gmax=Math.max(gmax,Math.hypot(gu,gv));
  }
  if(P.imgMode==='density') return;
  for(let c=0;c<F.N;c++){
    const [gu,gv]=tmp[c], m=Math.hypot(gu,gv)/gmax; if(m<0.02) continue;
    // tangent = perpendicular to gradient (follows the drawn contours)
    let tu=-gv, tv=gu; const l=Math.hypot(tu,tv); tu/=l; tv/=l;
    if(im.plane==='xy'){ F.img[c*3]=tu*m; F.img[c*3+1]=-tv*m; } else { F.img[c*3]=tu*m; F.img[c*3+2]=tv*m; }
  }
}
