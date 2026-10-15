// Field arrows, property points, bounds, brush plane, sketch and image overlays.
"use strict";

// field arrows + channel points
let arrows=null, chanPts=null, boundsBox=null, paintPlane=null, cursor=null, imagePlane=null;
function rebuildBoundsViz(){
  if(arrows){scene.remove(arrows);arrows.geometry.dispose();}
  if(chanPts){scene.remove(chanPts);chanPts.geometry.dispose();}
  if(boundsBox){scene.remove(boundsBox);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(F.N*6),3)); g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(F.N*6),3));
  arrows=new THREE.LineSegments(g,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:0.9}));
  scene.add(arrows);
  const pg=new THREE.BufferGeometry(); pg.setAttribute('position',new THREE.BufferAttribute(F.pos.slice(),3)); pg.setAttribute('color',new THREE.BufferAttribute(new Float32Array(F.N*3),3));
  chanPts=new THREE.Points(pg,new THREE.PointsMaterial({size:0.07,vertexColors:true,sizeAttenuation:true}));
  scene.add(chanPts);
  boundsBox=new THREE.Box3Helper(new THREE.Box3(F.min.clone(),F.max.clone()), new THREE.Color(css('--line-2')));
  scene.add(boundsBox);
  if(paintPlane){scene.remove(paintPlane);}
  const sz=new V3().subVectors(F.max,F.min), s=Math.max(sz.x,sz.y,sz.z)*1.15;
  paintPlane=new THREE.Mesh(new THREE.PlaneGeometry(s,s,12,12), new THREE.MeshBasicMaterial({color:css('--accent'),transparent:true,opacity:0.05,depthWrite:false,side:THREE.DoubleSide}));
  const pe=new THREE.LineSegments(new THREE.EdgesGeometry(paintPlane.geometry), new THREE.LineBasicMaterial({color:css('--accent'),transparent:true,opacity:0.35}));
  paintPlane.add(pe); paintPlane.visible=false; scene.add(paintPlane);
}
function updateArrows(){
  if(!arrows) return;
  const pos=arrows.geometry.attributes.position.array, col=arrows.geometry.attributes.color.array;
  const ch=new THREE.Color(css('--field-h')), cv=new THREE.Color(css('--field-v')), bg=new THREE.Color(css('--vp-bg'));
  const L=P.arrowLen, tmp=new THREE.Color(), tail=new THREE.Color();
  for(let c=0;c<F.N;c++){
    const dx=F.dir[c*3],dy=F.dir[c*3+1],dz=F.dir[c*3+2];
    const mag=Math.hypot(F.total[c*3],F.total[c*3+1],F.total[c*3+2]);
    const l=L*clamp(0.35+mag*0.45,0.35,1.25);
    const x=F.pos[c*3],y=F.pos[c*3+1],z=F.pos[c*3+2];
    pos[c*6]=x-dx*l*0.5;pos[c*6+1]=y-dy*l*0.5;pos[c*6+2]=z-dz*l*0.5;
    pos[c*6+3]=x+dx*l*0.5;pos[c*6+4]=y+dy*l*0.5;pos[c*6+5]=z+dz*l*0.5;
    tmp.copy(ch).lerp(cv,Math.abs(dy)); tail.copy(tmp).lerp(bg,0.8);
    col[c*6]=tail.r;col[c*6+1]=tail.g;col[c*6+2]=tail.b; col[c*6+3]=tmp.r;col[c*6+4]=tmp.g;col[c*6+5]=tmp.b;
  }
  arrows.geometry.attributes.position.needsUpdate=true; arrows.geometry.attributes.color.needsUpdate=true;
  arrows.geometry.computeBoundingSphere();
}
const CH_COL = {density:'--accent', length:'--field-h', diameter:'--seq-hi', tint:'--crit'};
function activeChannel(){ if(S.tool==='scalar') return P.channel; return P.showChannel==='none'?null:P.showChannel; }
function updateChannelViz(){
  if(!chanPts) return;
  const ch=activeChannel(); chanPts.visible=!!ch && S.mode==='field'; if(!ch) return;
  const arr = ch==='density'?F.densEff:F.ch[ch];
  const hi=new THREE.Color(css(CH_COL[ch])), lo=new THREE.Color(css('--vp-bg')), t=new THREE.Color(), col=chanPts.geometry.attributes.color.array;
  for(let c=0;c<F.N;c++){ t.copy(lo).lerp(hi,clamp(arr[c],0,1)); col[c*3]=t.r;col[c*3+1]=t.g;col[c*3+2]=t.b; }
  chanPts.geometry.attributes.color.needsUpdate=true;
}
function rebuildSketchViz(){
  while(gSketch.children.length){const o=gSketch.children.pop(); o.geometry.dispose();}
  const m=new THREE.LineBasicMaterial({color:css('--crit')});
  for(const st of S.strokes){
    const g=new THREE.BufferGeometry().setFromPoints(st.pts);
    gSketch.add(new THREE.Line(g,m));
  }
}
function rebuildImageViz(){
  if(imagePlane){scene.remove(imagePlane); imagePlane.geometry.dispose(); imagePlane=null;}
  if(!S.image) return;
  const sz=new V3().subVectors(F.max,F.min), tex=new THREE.CanvasTexture(S.image.canvas);
  const isXY=S.image.plane==='xy';
  imagePlane=new THREE.Mesh(new THREE.PlaneGeometry(sz.x, isXY?sz.y:sz.z), new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0.35,depthWrite:false,side:THREE.DoubleSide}));
  if(isXY) imagePlane.position.set((F.min.x+F.max.x)/2,(F.min.y+F.max.y)/2,F.min.z-0.01);
  else { imagePlane.rotation.x=-Math.PI/2; imagePlane.position.set((F.min.x+F.max.x)/2,0.003,(F.min.z+F.max.z)/2); }
  scene.add(imagePlane);
}
