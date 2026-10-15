// Tool rail, mode tabs, HUD, keyboard shortcuts and toasts.
"use strict";

/* ------------------------------------------------------------------ UI */
const TOOLS=[
  {id:'nav',key:'V',name:'Navigate',tip:'Orbit, pan, zoom. Click a pole to select it.',svg:'<ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v18"/><circle cx="12" cy="12" r="1.6"/>'},
  null,
  {id:'comb',key:'C',name:'Direction',tip:'Drag to comb the flow in the direction you move.',svg:'<path d="M4 17c4-7 9-9 16-9"/><path d="M16 4.5 20 8l-4 3.5"/>'},
  {id:'attract',key:'A',name:'Attract',tip:'Pull the flow toward the brush. Shift repels.',svg:'<circle cx="12" cy="12" r="1.8"/><path d="M3 12h5M6 9.5 8.5 12 6 14.5M21 12h-5M18 9.5 15.5 12l2.5 2.5M12 3v5M12 21v-5"/>'},
  {id:'repel',key:'R',name:'Repel',tip:'Push the flow away from the brush. Shift attracts.',svg:'<circle cx="12" cy="12" r="1.8"/><path d="M9 12H3M5.5 9.5 3 12l2.5 2.5M15 12h6M18.5 9.5 21 12l-2.5 2.5M12 9V3M12 15v6"/>'},
  {id:'twist',key:'T',name:'Twist',tip:'Swirl the flow around the brush axis. Shift reverses.',svg:'<path d="M12 12a2 2 0 1 1 2 2 4.5 4.5 0 1 1-4.5-4.5A7 7 0 1 1 5 17"/>'},
  {id:'smooth',key:'S',name:'Smooth',tip:'Average neighbouring vectors.',svg:'<path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/>'},
  {id:'erase',key:'E',name:'Erase',tip:'Remove painted forces, back to the base flow.',svg:'<path d="M15.5 4 20 8.5 10 18.5H5.5v-4.5zM4 21h16"/>'},
  null,
  {id:'scalar',key:'D',name:'Property paint',tip:'Paint density, length, diameter or tint. Shift subtracts.',svg:'<circle cx="6" cy="7" r="1"/><circle cx="12" cy="7" r="1.7"/><circle cx="18" cy="7" r="2.4"/><circle cx="6" cy="16" r="1.7"/><circle cx="12" cy="16" r="2.4"/><circle cx="18" cy="16" r="3"/>'},
  {id:'sketch',key:'P',name:'Sketch',tip:'Draw guide curves on the brush plane. The flow follows them.',svg:'<path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z"/><path d="M14 7l3 3"/>'},
];
const MODES=[['field','Field'],['poles','Poles'],['pattern','Pattern'],['analyse','Analyse'],['assemble','Assemble'],['fab','Fabricate']];
function buildChrome(){
  $('#tabs').innerHTML=MODES.map(([id,l])=>`<button class="tab" role="tab" data-mode="${id}" aria-selected="${S.mode===id}">${l}</button>`).join('');
  $('#tabs').onclick=e=>{const b=e.target.closest('[data-mode]'); if(b) setMode(b.dataset.mode);};
  $('#rail').innerHTML=TOOLS.map(t=>t?`<button class="tool" data-tool="${t.id}" title="${t.name} (${t.key}) · ${t.tip}" aria-label="${t.name}" aria-pressed="${S.tool===t.id}"><svg viewBox="0 0 24 24">${t.svg}</svg><kbd>${t.key}</kbd></button>`:'<hr>').join('')+
    `<hr><button class="tool" id="undoBtn" title="Undo (Ctrl+Z)" aria-label="Undo"><svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg></button>`;
  $('#rail').onclick=e=>{const b=e.target.closest('[data-tool]'); if(b) setTool(b.dataset.tool); if(e.target.closest('#undoBtn')) undo();};
  $('#panelToggle').onclick=()=>$('#side').classList.toggle('open');
}
function setTool(id){
  S.tool=id; document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tool===id));
  paintPlane.visible=id!=='nav'; cursor.visible=false;
  if(id!=='nav'&&S.mode!=='field') setMode('field');
  if(id==='scalar'||id!=='nav') renderPanel();
  updateChannelViz(); hudUpdate(); updateLegend(currentResult());
}
function setMode(m){
  S.mode=m; document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',b.dataset.mode===m));
  if(m!=='field'&&S.tool!=='nav') setTool('nav');
  if(m==='analyse'&&!S.res) runAnalysis();
  if(m==='fab'&&S.selected<0&&S.poles.length) S.selected=0;
  syncTimeline(); applyDisplay(); renderPanel(); hudUpdate();
  if(m==='assemble'&&!S.asm) runSequence();
}
function hudUpdate(){
  const t=TOOLS.find(t=>t&&t.id===S.tool);
  const planeTxt=P.planeMode==='h'?`horizontal plane at ${P.planeH.toFixed(2)} m`:`view plane, depth ${P.planeD>=0?'+':''}${P.planeD.toFixed(2)} m`;
  $('#toolname').innerHTML=`${t.name}<span>${S.tool==='nav'?'':planeTxt+' · radius '+P.radius.toFixed(2)+' m'}</span>`;
  $('#hud').innerHTML=S.tool==='nav'
    ?'<b>Left</b> orbit · <b>Right</b> pan · <b>Wheel</b> zoom · <b>Click</b> select pole · <b>C A R T S E D P</b> brushes'
    :'<b>Left</b> paint · <b>Right</b> orbit · <b>Middle</b> pan · <b>Shift+wheel</b> brush depth · <b>[ ]</b> radius · <b>Shift</b> invert · <b>Ctrl+Z</b> undo';
}
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea')) return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); return; }
  if(e.key==='['){ P.radius=clamp(P.radius/1.15,0.1,2.5); syncInputs(); hudUpdate(); ring.scale.setScalar(P.radius); ball.scale.setScalar(P.radius); return; }
  if(e.key===']'){ P.radius=clamp(P.radius*1.15,0.1,2.5); syncInputs(); hudUpdate(); ring.scale.setScalar(P.radius); ball.scale.setScalar(P.radius); return; }
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const t=TOOLS.find(t=>t&&t.key.toLowerCase()===e.key.toLowerCase()); if(t) setTool(t.id);
});
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('show'),2600); }
