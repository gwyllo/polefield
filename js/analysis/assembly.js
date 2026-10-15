// Running FEA, assembly ordering, staged simulation and timeline chart.
"use strict";

/* ------------------------------------------------------------------ analysis + sequence */
let feaTimer=0;
function runAnalysis(){
  const prog=$('#progress'); $('#progLbl').textContent=`Solving ${S.poles.length} poles, ${S.dowels.length} dowels`; $('#progBar').style.width='50%'; prog.hidden=false;
  clearTimeout(feaTimer);
  feaTimer=setTimeout(()=>{ // let the progress note paint before the solve blocks
    const pl=P.pointLoad>0&&S.selected>=0?{pole:S.selected,N:P.pointLoad}:null, t=performance.now();
    S.res=analyse(null,{pointLoad:pl}); S.res.ms=performance.now()-t;
    prog.hidden=true; applyDisplay(); setStatus(); renderPanel();
  },30);
}
function setStatus(){
  const el=$('#status'), r=S.res, b=$('#feaBtn');
  if(!r){ el.className='pill idle'; el.textContent=S.poles.length?'FEA not run':'no structure'; if(b) b.hidden=false; return; }
  el.className='pill '+r.status;
  el.textContent=(r.status==='ok'?'stable':r.status==='warn'?'check':'fails')+` · δ ${(r.maxDisp*1000).toFixed(1)} mm · ${Math.round(r.maxUtil*100)}%`;
}
function makeOrder(strategy){
  const n=S.poles.length, adj=Array.from({length:n},()=>[]);
  for(const d of S.dowels){adj[d.pi].push(d.pj);adj[d.pj].push(d.pi);}
  const mid=p=>p.a.clone().add(p.b).multiplyScalar(0.5);
  if(strategy==='bottom') return S.poles.slice().sort((a,b)=>Math.min(a.a.y,a.b.y)-Math.min(b.a.y,b.b.y)||mid(a).y-mid(b).y).map(p=>p.id);
  if(strategy==='sweep') return S.poles.slice().sort((a,b)=>mid(a).x-mid(b).x).map(p=>p.id);
  if(strategy==='random'){ const r=mulberry32(P.seed+99), o=S.poles.map(p=>p.id); for(let i=o.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[o[i],o[j]]=[o[j],o[i]];} return o; }
  if(strategy==='custom'&&S.asm&&S.asm.order.length===n) return S.asm.order.slice();
  // greedy: start at one end on the ground, then always place the pole with the most dowels into what is already standing
  const placed=new Uint8Array(n), conn=new Int32Array(n), order=[], xmin=F.min.x, xr=Math.max(F.max.x-F.min.x,1);
  const my=S.poles.map(p=>(p.a.y+p.b.y)/2), mx=S.poles.map(p=>((p.a.x+p.b.x)/2-xmin)/xr);
  while(order.length<n){
    let best=-1,bs=-1e9;
    for(let i=0;i<n;i++){ if(placed[i]) continue; const p=S.poles[i];
      const s=(p.grounded?6:0)+Math.min(conn[i],2)*10+conn[i]-my[i]*0.6-mx[i]*14;
      if(s>bs){bs=s;best=i;} }
    placed[best]=1; order.push(best); for(const o of adj[best]) conn[o]++;
  }
  return order;
}
let seqToken=0;
async function runSequence(){
  const tok=++seqToken; const order=makeOrder(P.strategy), n=order.length;
  const per=Math.max(1,Math.ceil(n/P.stages)), stages=[]; for(let k=per;k<n;k+=per) stages.push(k); stages.push(n);
  S.asm={order,stages,steps:[],running:true,strategy:P.strategy}; S.asmStep=0;
  const prog=$('#progress'), bar=$('#progBar'); prog.hidden=false;
  const set=new Set(); let placed=0;
  for(let k=0;k<stages.length;k++){
    if(tok!==seqToken) return;
    while(placed<stages[k]) set.add(order[placed++]);
    $('#progLbl').textContent=`Simulating assembly · stage ${k+1}/${stages.length}`;
    const r=analyse(set,{props:P.props}); S.asm.steps.push(r);
    bar.style.width=((k+1)/stages.length*100)+'%';
    S.asmStep=k; syncTimeline(); await new Promise(res=>setTimeout(res,0));
  }
  S.asm.running=false; prog.hidden=true;
  const bad=S.asm.steps.findIndex(s=>s.status==='crit');
  S.asmStep=bad>=0?bad:stages.length-1;
  syncTimeline(); applyDisplay(); renderPanel();
  toast(bad>=0?`Stage ${bad+1} fails: ${S.asm.steps[bad].issues[0]}`:'Every stage stays within limits');
}
function stageRange(k){ const a=k?S.asm.stages[k-1]:0; return [a+1,S.asm.stages[k]]; }
function syncTimeline(){
  const tl=$('#tl'), on=S.mode==='assemble';
  tl.hidden=!on; if(!on) return;
  const sl=$('#tlStep');
  sl.max=Math.max(0,(S.asm?S.asm.stages.length:1)-1); sl.value=S.asmStep;
  const st=S.asm&&S.asm.steps[S.asmStep];
  if(st){ const [a,b]=stageRange(S.asmStep);
    $('#tlLbl').innerHTML=`Stage <b>${S.asmStep+1}</b>/${S.asm.stages.length} · poles <b>${a}–${b}</b> of ${S.asm.order.length} placed · δ ${(st.maxDisp*1000).toFixed(1)} mm · ${Math.round(st.maxUtil*100)}% · <span class="s ${st.status}">${st.issues[0]||(st.props.length?st.props.length+' temporary support'+(st.props.length>1?'s':''):'ok')}</span>`; }
  else $('#tlLbl').textContent='Run the sequence to simulate each assembly stage';
  drawChart(); if(!S.asm||!S.asm.running) applyDisplay();
}
function drawChart(){
  const c=$('#tlChart'), dpr=window.devicePixelRatio||1, w=c.clientWidth, h=c.clientHeight; if(!w) return;
  c.width=w*dpr; c.height=h*dpr; const x=c.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0); x.clearRect(0,0,w,h);
  const padL=38,padR=40,padT=8,padB=16, W=w-padL-padR, H=h-padT-padB;
  x.font='10px "JetBrains Mono", monospace'; x.fillStyle=css('--muted'); x.strokeStyle=css('--line');
  if(!S.asm){ x.fillText('No sequence yet. Choose a strategy and run it from the panel.',padL,h/2); return; }
  const n=S.asm.stages.length, steps=S.asm.steps, bw=W/n;
  const umax=Math.max(1.2,P.limitUtil/100*1.2,...steps.map(s=>s.maxUtil));
  const dmax=Math.max(P.limitDisp*1.25,...steps.map(s=>s.maxDisp*1000));
  x.lineWidth=1; for(let i=0;i<=4;i++){ const y=padT+H*i/4; x.beginPath(); x.moveTo(padL,y+.5); x.lineTo(padL+W,y+.5); x.stroke(); }
  x.textAlign='right'; x.fillText(Math.round(umax*100)+'%',padL-4,padT+8); x.fillText('0',padL-4,padT+H);
  x.textAlign='left'; x.fillText(dmax.toFixed(0)+' mm',padL+W+4,padT+8); x.fillText('0',padL+W+4,padT+H);
  steps.forEach((s,i)=>{ const bh=clamp(s.maxUtil/umax,0,1)*H; x.fillStyle=css(s.status==='crit'?'--crit':s.status==='warn'?'--warn':'--ok'); x.globalAlpha=i===S.asmStep?1:0.55;
    x.fillRect(padL+i*bw+bw*0.15,padT+H-bh,Math.max(1,bw*0.7),bh);
    if(s.floating.length&&!s.props.length||s.mech.length){ x.fillRect(padL+i*bw+bw*0.15,padT,Math.max(1,bw*0.7),3); } });
  x.globalAlpha=1;
  x.setLineDash([4,3]); x.strokeStyle=css('--crit');
  let y=padT+H-(P.limitUtil/100/umax)*H; x.beginPath(); x.moveTo(padL,y); x.lineTo(padL+W,y); x.stroke();
  x.strokeStyle=css('--seq-hi'); y=padT+H-(P.limitDisp/dmax)*H; x.beginPath(); x.moveTo(padL,y); x.lineTo(padL+W,y); x.stroke(); x.setLineDash([]);
  x.strokeStyle=css('--seq-hi'); x.lineWidth=1.6; x.beginPath();
  steps.forEach((s,i)=>{ const px=padL+(i+.5)*bw, py=padT+H-clamp(s.maxDisp*1000/dmax,0,1)*H; i?x.lineTo(px,py):x.moveTo(px,py); }); x.stroke();
  x.strokeStyle=css('--fg'); x.lineWidth=1; const cx=padL+(S.asmStep+.5)*bw; x.beginPath(); x.moveTo(cx,padT); x.lineTo(cx,padT+H); x.stroke();
  x.fillStyle=css('--muted'); x.textAlign='left'; x.fillText('bars: utilisation per stage  line: deflection  dashed: limits',padL,h-3);
}
$('#tlChart').addEventListener('click',e=>{ if(!S.asm) return; const r=e.currentTarget.getBoundingClientRect(); const W=r.width-78; const i=Math.floor((e.clientX-r.left-38)/W*S.asm.stages.length); gotoStep(i); });
function gotoStep(i){ if(!S.asm) return; S.asmStep=clamp(i,0,S.asm.steps.length-1); syncTimeline(); renderPanel(); }
$('#tlStep').addEventListener('input',e=>gotoStep(+e.target.value));
$('#tlPrev').onclick=()=>gotoStep(S.asmStep-1); $('#tlNext').onclick=()=>gotoStep(S.asmStep+1);
$('#tlPlay').onclick=()=>{ S.playing=!S.playing; $('#tlPlay').textContent=S.playing?'Pause':'Play'; if(S.playing&&S.asm&&S.asmStep>=S.asm.steps.length-1) gotoStep(0); };
let playT=0;
