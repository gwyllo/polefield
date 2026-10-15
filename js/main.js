// Camera framing, resize, theming, render loop and boot.
"use strict";

/* camera */
function frameCamera(p){
  if(p){ const c=p.a.clone().add(p.b).multiplyScalar(.5); const d=camera.position.clone().sub(controls.target).normalize(); controls.target.copy(c); camera.position.copy(c).addScaledVector(d,p.len*1.6+0.6); controls.update(); return; }
  const c=F.min.clone().add(F.max).multiplyScalar(.5), s=F.max.distanceTo(F.min);
  controls.target.copy(c); camera.position.set(c.x+s*0.85,c.y+s*0.55,c.z+s*1.05); controls.update();
}
function resize(){ const w=vp.clientWidth,h=vp.clientHeight; if(!w||!h) return; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); if(S.mode==='assemble') drawChart(); }
new ResizeObserver(resize).observe(vp);
function applyTheme(){
  scene.background=new THREE.Color(css('--vp-bg')); makeGrids();
  ring.material.color.set(css('--accent')); ballMat.color.set(css('--accent'));
  if(paintPlane){ paintPlane.material.color.set(css('--accent')); paintPlane.children[0].material.color.set(css('--accent')); }
  if(boundsBox) boundsBox.material.color.set(css('--line-2'));
  rebuildSketchViz(); updateArrows(); updatePatternUniforms(); if(S.poles.length) applyDisplay(); if(S.mode==='assemble') drawChart(); if(S.mode==='fab'||S.mode==='pattern') renderPanelSoft();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
new MutationObserver(applyTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});

let lastT=0;
function loop(t){
  requestAnimationFrame(loop);
  controls.update();
  if(P.planeMode==='view'&&S.tool!=='nav') updatePlane();
  if(S.playing&&S.asm&&!S.asm.running&&t-playT>420){ playT=t; if(S.asmStep<S.asm.steps.length-1) gotoStep(S.asmStep+1); else { S.playing=false; $('#tlPlay').textContent='Play'; } }
  renderer.render(scene,camera);
}

/* boot */
buildChrome();
setupField(P.preset);
applyTheme();
generate();
if(P.autoFea) runAnalysis(); setStatus();
$('#feaBtn').onclick=()=>{ if(S.mode==='analyse') runAnalysis(); else setMode('analyse'); };
updateStats(); updatePatternUniforms(); setMode('field'); hudUpdate(); frameCamera(); resize();
requestAnimationFrame(loop);
