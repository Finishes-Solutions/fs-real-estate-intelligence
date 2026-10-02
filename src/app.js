
import { makeMatcher, encode, decode, describe } from './lib/filter.mjs';
import { USES, entityKey } from './lib/taxonomy.mjs';
import { initTimeline } from './timeline.js';
import { initWho, initChanges } from './views.js';
import { initAsk } from './ask.js';
import { initMarket } from './market.js';
import { initSaved } from './saved.js';
import { initBuildings } from './building.js';

const MAPTILER_KEY = 'vA28jXazwpYesC2b1Ccp';
const getJSON=(u,optional)=>fetch(u,{cache:'no-cache'}).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return r.json(); }).catch(e=>{ if(optional) return null; throw e; });
const [GEO,FIL,CHG]=await Promise.all([getJSON('data/geo.json'),getJSON('data/filings.json'),getJSON('data/changes.json',true)]);
const DATA={...GEO,...FIL,changes:CHG||{runs:[]}};
const R2D=180/Math.PI, EARTH_MI=3958.8;
const fmtM = v => v>=1e9 ? '$'+(v/1e9).toFixed(2)+'B' : v>=1e6 ? '$'+(v/1e6).toFixed(v>=1e8?0:1)+'M' : v>=1e3 ? '$'+Math.round(v/1e3)+'K' : '$'+Math.round(v);
const fmtN = n => n.toLocaleString('en-US');
const fmtMi = d => d==null?'':(d<10?d.toFixed(1):String(Math.round(d)))+' mi';
const COUNTIES=DATA.counties.map(c=>c.name), HOME_C=DATA.home||COUNTIES[0];
const TYPES=['New','Reno','Addition'], TYPE_LABEL={New:'New',Reno:'Renovation',Addition:'Addition'};
const tabsUrl=id=>'https://www.tdlr.texas.gov/TABS/Projects/'+id;
const HOME={center:[-95.72,window.innerWidth<600?29.8:29.98],zoom:window.innerWidth<600?6.95:(window.innerWidth<1000?7.2:7.7)};
const esc=s=>{ const d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; };
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- theme ----------
const root=document.documentElement;
root.dataset.theme='light'; try{ const t=localStorage.getItem('fs-map-theme'); if(t) root.dataset.theme=t; }catch(e){}
const isDark=()=>root.dataset.theme==='dark';
document.getElementById('themeBtn').onclick=()=>{ root.dataset.theme=isDark()?'light':'dark'; try{localStorage.setItem('fs-map-theme',root.dataset.theme);}catch(e){} setBasemap(layers.style); };

// ---------- data ----------
// latest change run: id -> 'new' | field that changed
const LAST_RUN=DATA.changes.runs[0], CHANGED=new Map(); (LAST_RUN?.items||[]).forEach(x=>{ if(!CHANGED.has(x.id)||x.k==='new') CHANGED.set(x.id,x.k); });
const F=DATA.filings.map(f=>({...f,r:Math.max(2.2,Math.min(15,1.6+Math.sqrt(f.cost/1e6)*1.15)),_chg:CHANGED.get(f.id)||null})).sort((a,b)=>b.cost-a.cost);
const BY_ID=new Map(F.map(f=>[f.id,f]));
const state={counties:new Set(COUNTIES),types:new Set(TYPES),min:0,max:0,q:'',uses:null,who:null,d:null,chg:null,month:null,sel:null,shown:150};
const sel={kind:null,label:'',feature:null,counties:new Set(),center:null};
let visible=F, visibleNoWho=F;
const ym=d=>d.toISOString().slice(0,7);
const monthRange=m=>{ const [y,mo]=m.split('-').map(Number); return [m+'-01',new Date(Date.UTC(y,mo,0)).toISOString().slice(0,10)]; };
const inSel=f=>!sel.feature||d3.geoContains(sel.feature,[f.lon,f.lat]);
const countyGeo=DATA.counties.map(c=>({name:c.name,geom:{type:'MultiPolygon',coordinates:c.outline}}));

// ---------- map ----------
const STYLES={dots:['dataviz','dataviz-dark'],streets:['streets-v2','streets-v2-dark'],sat:['hybrid','hybrid'],topo:['topo-v2','topo-v2-dark']};
const layers={style:'dots',roads:true,names:true,counties:true};
const styleUrl=s=>'https://api.maptiler.com/maps/'+STYLES[s][isDark()?1:0]+'/style.json?key='+MAPTILER_KEY;
const map=new maplibregl.Map({container:'map',style:styleUrl('dots'),center:[-93,24],zoom:1.6,minZoom:1,maxZoom:19,maxPitch:70,
  attributionControl:{compact:true},doubleClickZoom:true,dragRotate:true,cooperativeGestures:false});
map.on('error',e=>{ const m=(e&&e.error&&e.error.message)||''; if(/40[13]|Unauthorized|Forbidden/i.test(m)) toast('MapTiler refused the key for this site. Check the key’s allowed origins.'); });

const fc=features=>({type:'FeatureCollection',features});
const ptFeatures=(pts,props)=>pts.map(p=>({type:'Feature',properties:props||{},geometry:{type:'Point',coordinates:p}}));
const GJ={
  land:fc(ptFeatures(DATA.land)), texas:fc(ptFeatures(DATA.texas)),
  cdots:fc(DATA.counties.flatMap(c=>ptFeatures(c.dots,{w:c.name===HOME_C?1:0}))),
  counties:fc(DATA.counties.map(c=>({type:'Feature',properties:{name:c.name,w:c.name===HOME_C?1:0},geometry:{type:'MultiPolygon',coordinates:c.outline}}))),
  clabels:fc(DATA.counties.map(c=>({type:'Feature',properties:{t:c.name.toUpperCase()+' CO.',w:c.name===HOME_C?1:0},geometry:{type:'Point',coordinates:c.label}})))
};
function filingsFC(){ return fc(visible.map(f=>({type:'Feature',id:F.indexOf(f),properties:{i:F.indexOf(f),t:f.type,r:f.r,h:(f.approx||f.type==='Addition')?1:0},geometry:{type:'Point',coordinates:[f.lon,f.lat]}}))); }
const C=()=>isDark()?{new:'#4caf70',reno:'#939a9d',add:'#8acda3',line:'rgba(255,255,255,.55)',waller:'#4caf70',dot:'#8d9598',lab:'#dde1e2',halo:'#16191a',sel:'#4caf70',stroke:'#16191a'}
  : (layers.style==='sat'?{new:'#5fd38a',reno:'#f1f3f3',add:'#c2e3d0',line:'rgba(255,255,255,.85)',waller:'#8acda3',dot:'#ffffff',lab:'#ffffff',halo:'#0b0d0c',sel:'#c2e3d0',stroke:'#0b0d0c'}
  : {new:'#006527',reno:'#6b7174',add:'#1f9249',line:'rgba(22,25,26,.45)',waller:'#006527',dot:'#5b6366',lab:'#23282a',halo:'#ffffff',sel:'#006527',stroke:'#ffffff'});
let labelFont=['Noto Sans Bold'];

function firstSymbolId(){ const l=map.getStyle().layers.find(x=>x.type==='symbol'); return l&&l.id; }
function addOverlays(){
  try{ map.setProjection({type:'globe'}); }catch(e){}
  const c=C(), dots=layers.style==='dots', before=firstSymbolId();
  for(const [id,data] of Object.entries({land:GJ.land,texas:GJ.texas,cdots:GJ.cdots,counties:GJ.counties,clabels:GJ.clabels})) if(!map.getSource(id)) map.addSource(id,{type:'geojson',data});
  ['sel','draft','draftpts'].forEach(id=>{ if(!map.getSource(id)) map.addSource(id,{type:'geojson',data:fc([])}); });
  if(!map.getSource('filings')) map.addSource('filings',{type:'geojson',data:filingsFC()});
  // dot grid: world → Texas → counties, each fading out as you zoom in
  map.addLayer({id:'land-dots',type:'circle',source:'land',layout:{visibility:dots?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,1,4,1.8],'circle-color':c.dot,'circle-opacity':['interpolate',['linear'],['zoom'],2,.55,4.5,0]}},before);
  map.addLayer({id:'texas-dots',type:'circle',source:'texas',layout:{visibility:dots?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,.8,6,1.6],'circle-color':c.dot,'circle-opacity':['interpolate',['linear'],['zoom'],3,.6,6,.5,7.5,0]}},before);
  map.addLayer({id:'county-dots',type:'circle',source:'cdots',layout:{visibility:dots?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,.9,9,2.2,11,3],'circle-color':['case',['==',['get','w'],1],c.waller,c.dot],'circle-opacity':['interpolate',['linear'],['zoom'],5,.35,7,.75,9.5,.55,11,0]}},before);
  map.addLayer({id:'county-line',type:'line',source:'counties',layout:{visibility:layers.counties?'visible':'none'},paint:{'line-color':['case',['==',['get','w'],1],c.waller,c.line],'line-width':['case',['==',['get','w'],1],2,1.2]}},before);
  map.addLayer({id:'sel-fill',type:'fill',source:'sel',paint:{'fill-color':c.sel,'fill-opacity':.09}});
  map.addLayer({id:'sel-line',type:'line',source:'sel',paint:{'line-color':c.sel,'line-width':2.2,'line-dasharray':[3,2]}});
  map.addLayer({id:'draft-fill',type:'fill',source:'draft',filter:['==','$type','Polygon'],paint:{'fill-color':c.sel,'fill-opacity':.1}});
  map.addLayer({id:'draft-line',type:'line',source:'draft',paint:{'line-color':c.sel,'line-width':2,'line-dasharray':[3,2]}});
  map.addLayer({id:'draft-pts',type:'circle',source:'draftpts',paint:{'circle-radius':['case',['==',['get','first'],1],6,4],'circle-color':'#ffffff','circle-stroke-color':c.sel,'circle-stroke-width':2}});
  map.addLayer({id:'county-label',type:'symbol',source:'clabels',minzoom:6.2,layout:{visibility:layers.counties?'visible':'none','text-field':['get','t'],'text-font':labelFont,'text-size':11,'text-letter-spacing':.14,'text-allow-overlap':false},
    paint:{'text-color':['case',['==',['get','w'],1],c.waller,c.lab],'text-halo-color':c.halo,'text-halo-width':1.6}});
  const rz=['interpolate',['exponential',1.6],['zoom'],5,['*',['get','r'],.55],8,['*',['get','r'],1],12,['*',['get','r'],1.7],16,['*',['get','r'],2.4]];
  const col=['match',['get','t'],'New',c.new,'Reno',c.reno,c.add];
  map.addLayer({id:'filings',type:'circle',source:'filings',paint:{'circle-radius':rz,'circle-color':col,
    'circle-opacity':['case',['==',['get','h'],1],.18,['==',['get','t'],'New'],.85,.7],
    'circle-stroke-color':['case',['==',['get','h'],1],col,c.stroke],'circle-stroke-width':['case',['==',['get','h'],1],1.6,1],'circle-pitch-alignment':'map'}});
  map.addLayer({id:'filings-hl',type:'circle',source:'filings',filter:['==',['get','i'],-1],paint:{'circle-radius':['+',rz,6],'circle-color':'rgba(0,0,0,0)','circle-stroke-color':isDark()||layers.style==='sat'?'#ffffff':'#0b0d0c','circle-stroke-width':2.2}});
  applyRoadToggles(); syncSel(); syncHighlight(); overlayHooks.forEach(fn=>fn());
}
const overlayHooks=[];
function applyRoadToggles(){
  const st=map.getStyle(); if(!st) return;
  st.layers.forEach(l=>{
    const sl=l['source-layer'];
    if(sl==='transportation' && l.type!=='symbol') map.setLayoutProperty(l.id,'visibility',layers.roads?'visible':'none');
    if(sl==='transportation_name') map.setLayoutProperty(l.id,'visibility',layers.names?'visible':'none');
  });
}
let styleReady=false;
map.on('style.load',()=>{ styleReady=true; addOverlays(); });
function setBasemap(s){
  layers.style=s; styleReady=false;
  document.querySelectorAll('#styleSeg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.style===s));
  map.setStyle(styleUrl(s),{diff:false});
}

// ---------- filters + list ----------
function curSpec(withSel=true){ const s={};
  if(state.counties.size<COUNTIES.length) s.c=COUNTIES.filter(c=>state.counties.has(c));
  if(state.types.size<TYPES.length) s.t=TYPES.filter(t=>state.types.has(t));
  if(state.uses) s.u=[...state.uses]; if(state.min) s.min=state.min; if(state.max) s.max=state.max;
  if(state.q.trim()) s.q=state.q.trim(); if(state.who) s.who=state.who; if(state.d) s.d=state.d; if(state.chg) s.chg=state.chg;
  if(withSel){ const ss=selSpec(); if(ss) s.sel=ss; } return s; }
function selSpec(){ if(!sel.feature) return null;
  if(sel.kind==='radius') return {k:'r',c:sel.center,mi:radiusMiles,label:sel.place||''};
  if(sel.kind==='county') return {k:'c',names:COUNTIES.filter(n=>sel.counties.has(n))};
  return {k:'p',ring:sel.feature.coordinates[0].slice(0,-1).map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]),label:sel.label}; }
const monthOK=f=>{ if(!state.month) return true; const [a,b]=monthRange(state.month); return f.ts<=b&&f.te>=a; };
const listeners=[];
function applyFilters(){
  const spec=curSpec(false), m=makeMatcher(spec,{changed:CHANGED});
  visible=F.filter(f=>m(f)&&inSel(f)&&monthOK(f));
  if(state.who){ const m2=makeMatcher({...spec,who:null},{changed:CHANGED}); visibleNoWho=F.filter(f=>m2(f)&&inSel(f)&&monthOK(f)); } else visibleNoWho=visible;
  if(sel.kind==='radius'){ visible.forEach(f=>f._d=d3.geoDistance([f.lon,f.lat],sel.center)*EARTH_MI); visible.sort((a,b)=>a._d-b._d); }
  document.getElementById('kCount').textContent=fmtN(visible.length);
  document.getElementById('kValue').textContent=fmtM(visible.reduce((s,f)=>s+f.cost,0));
  document.getElementById('kNew').textContent=fmtN(visible.filter(f=>f.type==='New').length);
  document.getElementById('selbar').classList.add('on');
  document.getElementById('selName').textContent=sel.feature?sel.label:'Everything shown';
  document.getElementById('selStats').textContent=fmtN(visible.length)+' filings · '+fmtM(visible.reduce((s,f)=>s+f.cost,0));
  document.getElementById('selClear').style.display=sel.feature?'':'none';
  state.shown=150; renderList();
  const src=map.getSource&&map.getSource('filings'); if(src) src.setData(filingsFC());
  syncFilterUI(); scheduleHash(); listeners.forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } });
}
const cRow=document.getElementById('countyRow'), tRow=document.getElementById('typeRow');
COUNTIES.forEach(c=>{
  const b=document.createElement('button'); b.className='chip'; b.setAttribute('aria-pressed','true');
  b.innerHTML=c+' <span class="n">'+F.filter(f=>f.county===c).length+'</span>';
  b.onclick=()=>{ const solo=state.counties.size===1&&state.counties.has(c); state.counties=solo?new Set(COUNTIES):new Set([c]);
    [...cRow.querySelectorAll('.chip')].forEach((x,i)=>x.setAttribute('aria-pressed',state.counties.has(COUNTIES[i]))); applyFilters(); if(!solo) fitGeom(countyGeo.find(x=>x.name===c).geom); };
  cRow.appendChild(b);
});
TYPES.forEach(t=>{
  const b=document.createElement('button'); b.className='chip'; b.setAttribute('aria-pressed','true');
  const sw=t==='Addition'?'border:2px solid var(--c-add);background:transparent':'background:var(--c-'+(t==='New'?'new':'reno')+')';
  b.innerHTML='<span class="sw" style="'+sw+'"></span>'+TYPE_LABEL[t];
  b.onclick=()=>{ state.types.has(t)&&state.types.size>1?state.types.delete(t):state.types.add(t); b.setAttribute('aria-pressed',state.types.has(t)); applyFilters(); };
  tRow.appendChild(b);
});
document.getElementById('minCost').onchange=e=>{state.min=+e.target.value; applyFilters();};
let qT; document.getElementById('q').addEventListener('input',e=>{clearTimeout(qT); qT=setTimeout(()=>{state.q=e.target.value; applyFilters();},120);});
// use, dates, updates, active-filter summary
const useSel=document.getElementById('useSel'), dField=document.getElementById('dField'), dFrom=document.getElementById('dFrom'), dTo=document.getElementById('dTo');
{ const n={}; F.forEach(f=>{ const u=f.use||'Unclassified'; n[u]=(n[u]||0)+1; });
  [...USES,'Unclassified'].filter(u=>n[u]).forEach(u=>{ const o=document.createElement('option'); o.value=u; o.textContent=u+' ('+fmtN(n[u])+')'; useSel.appendChild(o); });
  if(!F.some(f=>f.use)) useSel.style.display='none'; }
useSel.onchange=()=>{ state.uses=useSel.value&&useSel.value!=='*'?new Set([useSel.value]):null; applyFilters(); };
const dPeriod=[DATA.period.start.slice(0,7), ym(new Date(Date.now()+3*365*864e5))];
[dFrom,dTo].forEach(i=>{ i.min=dPeriod[0].slice(0,4)+'-01'; i.max=dPeriod[1]; });
function readDates(){ const f=dField.value; dFrom.disabled=dTo.disabled=!f; state.d=f?{f,from:dFrom.value||'',to:dTo.value||''}:null; applyFilters(); }
dField.onchange=()=>{ if(dField.value&&!dFrom.value&&!dTo.value){ const t=ym(new Date()); dFrom.value=dField.value==='reg'?dPeriod[0]:t; } readDates(); };
dFrom.onchange=readDates; dTo.onchange=readDates;
const chgRow=document.getElementById('chgRow');
[['new','New this week'],['any','Any change']].forEach(([k,label])=>{
  const n=k==='new'?[...CHANGED.values()].filter(v=>v==='new').length:CHANGED.size;
  const b=document.createElement('button'); b.className='chip'; b.dataset.chg=k; b.setAttribute('aria-pressed','false'); b.innerHTML=label+' <span class="n">'+fmtN(n)+'</span>';
  b.onclick=()=>{ state.chg=state.chg===k?null:k; applyFilters(); }; chgRow.appendChild(b); });
if(!LAST_RUN) chgRow.style.display='none';
function syncFilterUI(){
  [...cRow.querySelectorAll('.chip')].forEach((x,i)=>x.setAttribute('aria-pressed',state.counties.has(COUNTIES[i])));
  [...tRow.querySelectorAll('.chip')].forEach((x,i)=>x.setAttribute('aria-pressed',state.types.has(TYPES[i])));
  [...chgRow.querySelectorAll('.chip')].forEach(x=>x.setAttribute('aria-pressed',state.chg===x.dataset.chg));
  const minEl=document.getElementById('minCost'); if(![...minEl.options].some(o=>+o.value===state.min)){ const o=document.createElement('option'); o.value=state.min; o.textContent=fmtM(state.min)+'+'; minEl.appendChild(o); } minEl.value=String(state.min);
  const qEl=document.getElementById('q'); if(document.activeElement!==qEl) qEl.value=state.q;
  useSel.querySelector('option[value="*"]')?.remove();
  if(state.uses&&state.uses.size>1){ const o=document.createElement('option'); o.value='*'; o.textContent=state.uses.size+' uses'; useSel.appendChild(o); useSel.value='*'; } else useSel.value=state.uses?[...state.uses][0]:'';
  dField.value=state.d?state.d.f:''; dFrom.value=state.d?.from||''; dTo.value=state.d?.to||''; dFrom.disabled=dTo.disabled=!state.d;
  const nMore=(state.uses?1:0)+(state.d?1:0)+(state.chg?1:0); document.getElementById('moreN').textContent=nMore?'· '+nMore+' on':''; if(nMore) document.getElementById('moreF').open=true;
  const t=filterText(); document.getElementById('activeTxt').textContent=t?'Filters: '+t:''; document.getElementById('activeBar').classList.toggle('on',!!t);
}
document.getElementById('resetAll').onclick=()=>fromSpec({});
// apply a whole filter spec (URL, saved search, AI answer)
function fromSpec(spec,{fly=true}={}){
  state.counties=new Set(spec.c&&spec.c.length?spec.c.filter(c=>COUNTIES.includes(c)):COUNTIES); if(!state.counties.size) state.counties=new Set(COUNTIES);
  state.types=new Set(spec.t&&spec.t.length?spec.t:TYPES);
  state.uses=spec.u&&spec.u.length?new Set(spec.u):null; state.min=spec.min||0; state.max=spec.max||0; state.q=spec.q||'';
  state.who=spec.who||null; state.d=spec.d||null; state.chg=spec.chg||null;
  const s=spec.sel;
  if(s&&s.k==='r'){ setMiles(s.mi,false,true); setRadiusCenter(s.c,s.label||'pin',fly); }
  else if(s&&s.k==='c'){ const set=new Set(s.names.filter(n=>COUNTIES.includes(n))); if(set.size){ setCountySel(set); if(fly) fitGeom(sel.feature); } else clearSelection(); }
  else if(s&&s.k==='p'){ setSelection('shape',s.label||'Custom shape',ringFeature(s.ring)); if(fly) fitGeom(sel.feature); }
  else if(sel.feature) clearSelection();
  else applyFilters();
}
const listEl=document.getElementById('list');
const colorOf=f=>{ const c=C(); return f.type==='New'?c.new:f.type==='Reno'?c.reno:c.add; };
function renderList(){
  document.getElementById('listCount').textContent=(sel.kind==='radius'?'Nearest first · ':'Largest first · ')+fmtN(visible.length);
  const frag=document.createDocumentFragment();
  visible.slice(0,state.shown).forEach(f=>{
    const b=document.createElement('button'); b.className='item'+(state.sel===f?' on':''); b.setAttribute('role','listitem');
    const ds=f.type==='Addition'?'border:2px solid '+colorOf(f):'background:'+colorOf(f);
    b.innerHTML='<span class="dot" style="'+ds+'"></span><span><div class="nm"></div><div class="meta"></div></span><span class="amt">'+fmtM(f.cost)+'</span>';
    b.querySelector('.nm').textContent=f.name;
    b.querySelector('.meta').textContent=(sel.kind==='radius'?fmtMi(f._d)+' · ':'')+(f.city||f.county)+' · '+TYPE_LABEL[f.type]+(f.use?' · '+f.use:'');
    if(f._chg){ const t=document.createElement('span'); t.className='bdg'+(f._chg==='new'?' new':''); t.textContent=f._chg==='new'?'New':'Changed'; b.querySelector('.meta').prepend(t); }
    b.onclick=()=>select(f,true); frag.appendChild(b);
  });
  listEl.replaceChildren(frag);
  if(visible.length>state.shown){ const m=document.createElement('button'); m.className='more'; m.textContent='Show '+Math.min(150,visible.length-state.shown)+' more'; m.onclick=()=>{state.shown+=150; renderList();}; listEl.appendChild(m); }
}

// ---------- detail card ----------
const card=document.getElementById('card'), panel=document.getElementById('panel');
function select(f,fly){
  cardCloseHooks.forEach(fn=>fn());
  state.sel=f; syncHighlight(); [...listEl.querySelectorAll('.item')].forEach((b,i)=>b.classList.toggle('on',visible[i]===f));
  card.innerHTML='<div class="top"><div><div class="kicker">'+esc(f.county)+' County · '+esc(TYPE_LABEL[f.type])+'</div><h2>'+esc(f.name)+'</h2></div>'+
    '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>'+
    '<dl><dt>Est. value</dt><dd style="font-family:var(--font-mono);font-weight:600">'+fmtM(f.cost)+'</dd>'+
    (f.sqft?'<dt>Area</dt><dd style="font-family:var(--font-mono)">'+fmtN(f.sqft)+' sq ft</dd>':'')+
    (sel.kind==='radius'&&f._d!=null?'<dt>Distance</dt><dd style="font-family:var(--font-mono)">'+fmtMi(f._d)+' from center</dd>':'')+
    (f.use?'<dt>Use</dt><dd>'+esc(f.use)+(f.sub?' · '+esc(f.sub):'')+(f.units?' · '+fmtN(f.units)+' units':'')+'</dd>':'')+
    (f.ten?'<dt>Tenant</dt><dd>'+esc(f.ten)+'</dd>':'')+
    '<dt>Address</dt><dd>'+esc(f.addr||'—')+'</dd><dt>Owner</dt><dd>'+esc(f.owner||'—')+'</dd>'+
    (f.dev&&f.dev.toLowerCase()!==String(f.owner).toLowerCase()?'<dt>Developer</dt><dd>'+whoLink('dev',f.dev||f.owner,f.dev)+'</dd>':'')+
    (f.arch?'<dt>Architect</dt><dd>'+whoLink('arch',f.arch,f.arch)+'</dd>':'')+(f.gc?'<dt>GC</dt><dd>'+whoLink('gc',f.gc,f.gc)+'</dd>':'')+
    '<dt>Registered</dt><dd style="font-family:var(--font-mono)">'+esc(f.reg)+'</dd>'+
    '<dt>Schedule</dt><dd style="font-family:var(--font-mono)">'+esc(f.ts)+(f.tsE?'<sup title="Estimated by us: the filer gave no start date">est</sup>':'')+' → '+esc(f.te)+(f.teE?'<sup title="Estimated by us from project type and value">est</sup>':'')+'</dd>'+
    '<dt>Status</dt><dd>'+esc(f.status||'—')+'</dd><dt>TABS #</dt><dd style="font-family:var(--font-mono)">'+esc(f.id)+'</dd></dl>'+
    (f.sum?'<div class="scope sum">'+esc(f.sum)+'</div>':'')+
    (f.scope?'<div class="scope">'+esc(f.scope)+'</div>':'')+historyHtml(f)+
    '<div class="brief" id="briefBox"><button class="btn" id="briefBtn">AI project brief</button></div>'+
    (f.approx?'<div class="note">Location is approximate: the address didn’t geocode, so this marker sits near the city center.</div>':'')+
    (f.misfiled?'<div class="note">The filer tagged this to '+esc(f.county)+' County, but the address is outside it.</div>':'')+
    '<a class="go" href="'+tabsUrl(f.id)+'" target="_blank" rel="noopener">Open TABS record <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h7v7M13 3 4 12"/></svg></a>';
  card.querySelector('.x').onclick=closeCard; card.classList.add('open');
  card.querySelectorAll('[data-who]').forEach(a=>a.onclick=e=>{ e.preventDefault(); const [k,v]=a.dataset.who.split('|'); state.who={k,v,label:a.textContent}; applyFilters(); setView('map'); });
  card.querySelector('#briefBtn').onclick=()=>loadBrief(f);
  scheduleHash();
  if(fly){ const z=Math.max(map.getZoom(),13.5); map.flyTo({center:[f.lon,f.lat],zoom:z,offset:window.innerWidth>860?[-140,0]:[0,-120],duration:reduceMotion?0:900}); if(window.innerWidth<=860) panel.classList.remove('up'); }
}
function whoLink(k,raw,label){ const v=entityKey(raw); return v?'<a href="#" data-who="'+k+'|'+esc(v)+'">'+esc(label)+'</a>':esc(label); }
function historyHtml(f){
  const rows=DATA.changes.runs.flatMap(r=>r.items.filter(x=>x.id===f.id).map(x=>[r.built.slice(0,10),x])); if(!rows.length) return '';
  const fv=(k,v)=>v==null||v===''?'—':k==='cost'?fmtM(v):k==='sqft'?fmtN(v):String(v);
  return '<div class="hist"><div class="lt">History</div>'+rows.map(([d,x])=>'<div><span class="m">'+esc(d)+'</span> '+(x.k==='new'?'First seen':esc(x.label)+': '+esc(fv(x.k,x.from))+' → '+esc(fv(x.k,x.to)))+'</div>').join('')+'</div>'; }
async function loadBrief(f){
  const box=card.querySelector('#briefBox'); if(!box) return; box.innerHTML='<div class="rnote">Writing a brief from the filing, nearby activity and census data…</div>';
  try{ const r=await fetch('api/brief?id='+encodeURIComponent(f.id)); const d=await r.json().catch(()=>({}));
    if(state.sel!==f) return; if(!r.ok) throw new Error(d.error||('Error '+r.status));
    box.innerHTML='<div class="lt">AI project brief</div><div class="btext">'+richText(d.brief)+'</div><div class="rnote">AI-written from the data on this page. Verify before relying on it.</div>'; wireCites(box); }
  catch(e){ if(state.sel===f) box.innerHTML='<div class="rnote">'+esc(e.message)+'</div><button class="btn" id="briefBtn">Try again</button>', box.querySelector('#briefBtn').onclick=()=>loadBrief(f); }
}
// AI text -> safe HTML: escaped, paragraphs, [TABS…] citations become buttons that select the filing
function richText(t){ return esc(t||'').split(/\n{2,}|\n(?=[A-Z][^\n]{0,40}\n)/).map(p=>'<p>'+p.replace(/\n/g,'<br>')+'</p>').join('').replace(/\[(TABS[0-9A-Za-z-]+)\]/g,(m,id)=>BY_ID.has(id)?'<button class="cite" data-id="'+id+'">'+id+'</button>':id); }
function wireCites(el){ el.querySelectorAll('.cite').forEach(b=>b.onclick=()=>{ const f=BY_ID.get(b.dataset.id); if(f){ setView('map'); select(f,true); } }); }
const cardCloseHooks=[];
function clearSel(){ state.sel=null; syncHighlight(); [...listEl.querySelectorAll('.item')].forEach(b=>b.classList.remove('on')); }
function closeCard(){ cardCloseHooks.forEach(fn=>fn()); card.classList.remove('open'); state.sel=null; scheduleHash(); syncHighlight(); [...listEl.querySelectorAll('.item')].forEach(b=>b.classList.remove('on')); }
function syncHighlight(){ if(map.getLayer&&map.getLayer('filings-hl')) map.setFilter('filings-hl',['==',['get','i'],state.sel?F.indexOf(state.sel):-1]); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeCard(); });
document.getElementById('sheetToggle').onclick=()=>panel.classList.toggle('up');

// hover + click on markers
const tip=document.getElementById('tip'), stage=document.getElementById('stage'), viewport=document.getElementById('viewport');
map.on('mousemove','filings',e=>{
  if(mode!=='pan') return; map.getCanvas().style.cursor='pointer';
  const f=F[e.features[0].properties.i]; tip.innerHTML='<b></b><span></span>'; tip.querySelector('b').textContent=f.name;
  tip.querySelector('span').textContent=fmtM(f.cost)+' · '+TYPE_LABEL[f.type]+' · '+(f.city||f.county);
  let x=e.point.x+14, y=e.point.y+14; tip.style.opacity=1; const w=tip.offsetWidth; if(x+w>viewport.clientWidth-8) x=e.point.x-w-14; tip.style.left=x+'px'; tip.style.top=y+'px';
});
map.on('mouseleave','filings',()=>{ if(mode==='pan') map.getCanvas().style.cursor=''; tip.style.opacity=0; });
map.on('click','filings',e=>{ if(mode!=='pan') return; e.preventDefault(); select(F[e.features[0].properties.i],false); });
map.on('click',e=>{ if(mode!=='pan' || e.defaultPrevented || swallowClick) return; if(map.queryRenderedFeatures(e.point,{layers:['filings']}).length) return; if(!(ctx.onMapClick&&ctx.onMapClick(e))) closeCard(); });

// ---------- tools ----------
let mode='pan', draft=[], boxA=null, boxB=null;
const hintEl=document.getElementById('hint'), radiusEl=document.getElementById('radius');
const isTouch=window.matchMedia('(pointer: coarse)').matches;
const HINTS={area:'Drag a box over the area you want.',poly:isTouch?'Tap to drop points. Tap the first point to close the shape.':'Click to drop points. Click the first point or double-click to close. Backspace undoes, Esc cancels.',county:'Click counties to add or remove them from the selection.'};
function setMode(m){
  mode=m; draft=[]; boxA=null; drawDraft();
  document.querySelectorAll('.tools button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===m));
  hintEl.textContent=HINTS[m]||''; hintEl.classList.toggle('on',!!HINTS[m]);
  radiusEl.classList.toggle('on',m==='radius'); if(m==='radius') setTimeout(()=>rq.focus(),30);
  stage.classList.toggle('m-draw',m!=='pan');
  if(m==='area') map.dragPan.disable(); else map.dragPan.enable();
  if(m==='poly') map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
  tip.style.opacity=0;
}
document.querySelectorAll('.tools button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
function ringFeature(ring){
  const r=ring.slice(); if(r[0][0]!==r[r.length-1][0]||r[0][1]!==r[r.length-1][1]) r.push(r[0]);
  let f={type:'Polygon',coordinates:[r]}; if(d3.geoArea(f)>2*Math.PI) f={type:'Polygon',coordinates:[r.slice().reverse()]}; return f;
}
function setSelection(kind,label,feature,counties){
  sel.kind=kind; sel.label=label; sel.feature=feature; sel.counties=counties||new Set(); if(kind!=='radius'){ sel.center=null; setPin(null); }
  syncSel(); applyFilters();
}
function clearSelection(){ sel.kind=null; sel.label=''; sel.feature=null; sel.center=null; sel.counties=new Set(); setPin(null); syncSel(); applyFilters(); }
function syncSel(){ const s=map.getSource&&map.getSource('sel'); if(s) s.setData(fc(sel.feature?[{type:'Feature',properties:{},geometry:sel.feature}]:[])); }
function drawDraft(cursor){
  const s=map.getSource&&map.getSource('draft'), p=map.getSource&&map.getSource('draftpts'); if(!s||!p) return;
  const feats=[];
  if(mode==='area'&&boxA&&cursor){ const r=boxRing(boxA,cursor); if(r) feats.push({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[r]}}); }
  if(mode==='poly'&&draft.length){ const line=draft.concat(cursor?[cursor]:[]); feats.push({type:'Feature',properties:{},geometry:line.length>2?{type:'Polygon',coordinates:[line.concat([line[0]])]}:{type:'LineString',coordinates:line}}); }
  s.setData(fc(feats));
  p.setData(fc(mode==='poly'?draft.map((c,i)=>({type:'Feature',properties:{first:i===0&&draft.length>=3?1:0},geometry:{type:'Point',coordinates:c}})):[]));
}
function boxRing(a,b){ // a,b are screen points
  const pts=[], N=10, edge=(x0,y0,x1,y1)=>{ for(let i=0;i<N;i++){ const ll=map.unproject([x0+(x1-x0)*i/N,y0+(y1-y0)*i/N]); if(ll) pts.push([ll.lng,ll.lat]); } };
  edge(a.x,a.y,b.x,a.y); edge(b.x,a.y,b.x,b.y); edge(b.x,b.y,a.x,b.y); edge(a.x,b.y,a.x,a.y);
  if(pts.length<4) return null; pts.push(pts[0]); return pts;
}
map.on('mousedown',e=>{ if(mode!=='area') return; boxA=e.point; boxB=null; });
map.on('touchstart',e=>{ if(mode!=='area'||e.points.length!==1) return; boxA=e.point; boxB=null; });
const moveDraft=e=>{ if(mode==='area'&&boxA){ boxB=e.point; drawDraft(e.point); } else if(mode==='poly'&&draft.length) drawDraft([e.lngLat.lng,e.lngLat.lat]); };
map.on('mousemove',moveDraft); map.on('touchmove',moveDraft);
const endBox=e=>{ if(mode!=='area'||!boxA) return; const a=boxA, b=boxB||e.point; boxA=null; boxB=null; drawDraft();
  if(!b||Math.hypot(b.x-a.x,b.y-a.y)<8) return; const r=boxRing(a,b); if(!r){ toast('That box is off the globe. Zoom in and try again.'); return; }
  setSelection('area','Area selection',ringFeature(r.slice(0,-1))); setMode('pan'); };
map.on('mouseup',endBox); map.on('touchend',endBox);
map.on('click',e=>{
  if(swallowClick){ swallowClick=false; return; }
  const ll=[e.lngLat.lng,e.lngLat.lat];
  if(mode==='poly'){
    if(draft.length>=3){ const f=map.project(draft[0]); if(Math.hypot(f.x-e.point.x,f.y-e.point.y)<14){ finishPoly(); return; } }
    draft.push(ll); drawDraft();
  } else if(mode==='county'){
    const c=countyGeo.find(x=>d3.geoContains(x.geom,ll)); if(!c){ toast('Click inside one of the seven counties.'); return; }
    const set=new Set(sel.kind==='county'?sel.counties:[]); set.has(c.name)?set.delete(c.name):set.add(c.name);
    if(!set.size){ clearSelection(); return; }
    setCountySel(set);
  } else if(mode==='radius'){ setRadiusCenter(ll,'Dropped pin ('+ll[1].toFixed(4)+', '+ll[0].toFixed(4)+')',false); }
});
map.on('dblclick',e=>{ if(mode==='poly'&&draft.length>=3){ e.preventDefault(); finishPoly(); } });
function setCountySel(set){ const names=COUNTIES.filter(n=>set.has(n));
  setSelection('county',names.length>2?names.length+' counties':names.join(' + ')+(names.length>1?' counties':' County'),{type:'MultiPolygon',coordinates:DATA.counties.filter(x=>set.has(x.name)).flatMap(x=>x.outline)},set); }
function finishPoly(){ const pts=draft.filter((p,i)=>i===0||d3.geoDistance(p,draft[i-1])>1e-7); draft=[]; drawDraft();
  if(pts.length<3){ toast('A shape needs at least three points.'); return; }
  setSelection('shape','Custom shape ('+pts.length+' points)',ringFeature(pts)); setMode('pan'); }
document.addEventListener('keydown',e=>{ if(e.target.closest&&e.target.closest('input,select,textarea')) return;
  if(mode==='poly'&&draft.length){ if(e.key==='Enter'){e.preventDefault(); finishPoly();} else if(e.key==='Backspace'){e.preventDefault(); draft.pop(); drawDraft();} else if(e.key==='Escape'){ draft=[]; drawDraft(); } } });
function fitGeom(g){ const b=d3.geoBounds({type:'Feature',geometry:g}); map.fitBounds([[b[0][0],b[0][1]],[b[1][0],b[1][1]]],{padding:{top:80,bottom:80,left:80,right:80},duration:reduceMotion?0:900}); }

// ---------- radius search (MapTiler geocoding + local index) ----------
const rq=document.getElementById('rq'), rsug=document.getElementById('rsug'), rmi=document.getElementById('rmi'), rrange=document.getElementById('rrange');
let radiusMiles=3, sugs=[], sugI=-1, picked=false, geoCtl=null;
const LOCAL=[]; F.forEach(f=>{ LOCAL.push({t:f.name,k:'Filing',c:[f.lon,f.lat],sub:f.addr}); });
DATA.places.forEach(([n,lon,lat])=>LOCAL.push({t:n+', TX',k:'Town',c:[lon,lat]}));
LOCAL.forEach(o=>o.l=o.t.toLowerCase());
function localSearch(q){
  const m=q.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if(m){ let a=+m[1],b=+m[2],lat=a,lon=b; if(Math.abs(a)>90){lon=a;lat=b;} return [{t:lat.toFixed(5)+', '+lon.toFixed(5),k:'Coordinates',c:[lon,lat]}]; }
  const toks=q.toLowerCase().split(/\s+/).filter(Boolean); if(!toks.length) return [];
  return LOCAL.filter(o=>toks.every(t=>o.l.includes(t))).slice(0,4);
}
async function geocode(q){
  if(geoCtl) geoCtl.abort(); geoCtl=new AbortController();
  const u='https://api.maptiler.com/geocoding/'+encodeURIComponent(q)+'.json?key='+MAPTILER_KEY+'&country=us&limit=6&proximity=-95.9,30.0&autocomplete=true&bbox=-97.6,28.6,-94.2,31.4';
  try{ const r=await fetch(u,{signal:geoCtl.signal}); if(!r.ok) return []; const d=await r.json();
    return (d.features||[]).map(f=>({t:(f.place_name||f.text||'').replace(/, United States$/,''),k:(f.place_type&&f.place_type[0]==='address')?'Address':((f.place_type&&f.place_type[0])||'Place').replace(/^\w/,c=>c.toUpperCase()),c:f.center,bbox:f.bbox})); }
  catch(e){ return []; }
}
function renderSugs(note){
  rsug.replaceChildren(...sugs.map((o,i)=>{ const b=document.createElement('button'); b.type='button'; b.className=i===sugI?'on':''; b.setAttribute('role','option');
    b.innerHTML='<b></b><i></i>'+(o.sub?'<span></span>':''); b.querySelector('b').textContent=o.t; b.querySelector('i').textContent=o.k; if(o.sub) b.querySelector('span').textContent=o.sub;
    b.onclick=()=>pickSug(o); return b; }));
  if(note){ const d=document.createElement('div'); d.className='rnote'; d.textContent=note; rsug.appendChild(d); }
}
let gT;
rq.addEventListener('input',()=>{ picked=false; const q=rq.value.trim(); sugs=localSearch(q); sugI=sugs.length?0:-1; renderSugs();
  clearTimeout(gT); if(q.length<3||/^\s*-?\d/.test(q)&&sugs.length) return;
  gT=setTimeout(async()=>{ const g=await geocode(q); if(picked||rq.value.trim()!==q) return; sugs=g.concat(localSearch(q)).slice(0,8); sugI=sugs.length?0:-1; renderSugs(sugs.length?'':'No match. Try a fuller address or paste lat, long.'); },220); });
rq.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'&&sugs.length){e.preventDefault(); sugI=(sugI+1)%sugs.length; renderSugs();}
  else if(e.key==='ArrowUp'&&sugs.length){e.preventDefault(); sugI=(sugI-1+sugs.length)%sugs.length; renderSugs();}
  else if(e.key==='Enter'&&sugs.length){e.preventDefault(); pickSug(sugs[Math.max(0,sugI)]);} });
function pickSug(o){ picked=true; rq.value=o.t; sugs=[]; renderSugs(); setRadiusCenter(o.c,o.t,true); }
function setMiles(v,fromRange,silent){ v=Math.max(0.1,Math.min(60,+v||0)); radiusMiles=v; if(!fromRange) rrange.value=Math.min(25,v); rmi.value=v;
  document.querySelectorAll('.rpre button').forEach(b=>b.classList.toggle('on',+b.dataset.mi===v)); if(sel.kind==='radius'&&!silent) updateRadius(false); }
rrange.addEventListener('input',()=>setMiles(rrange.value,true)); rmi.addEventListener('change',()=>setMiles(rmi.value));
document.querySelectorAll('.rpre button').forEach(b=>b.onclick=()=>{ setMiles(b.dataset.mi); if(sel.kind==='radius') updateRadius(true); });
setMiles(3);
let pinMarker=null;
function setPin(c){
  if(!c){ if(pinMarker){ pinMarker.remove(); pinMarker=null; } return; }
  if(!pinMarker){ const el=document.createElement('div'); el.className='pin';
    el.innerHTML='<svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 33C13 33 2 20.5 2 12.5a11 11 0 0 1 22 0C24 20.5 13 33 13 33z" fill="#006527" stroke="#fff" stroke-width="2"/><circle cx="13" cy="12.5" r="4" fill="#fff"/></svg>';
    pinMarker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(c).addTo(map); } else pinMarker.setLngLat(c);
}
function setRadiusCenter(c,label,fly){ sel.center=c; sel.place=label; updateRadius(fly); }
function updateRadius(fly){
  const c=sel.center; if(!c) return;
  const feature=d3.geoCircle().center(c).radius(radiusMiles/EARTH_MI*R2D).precision(1)();
  const mi=(radiusMiles%1?radiusMiles:radiusMiles.toFixed(0))+' mi';
  setSelection('radius','Within '+mi+' of '+sel.place,feature); setPin(c);
  if(fly) fitGeom(feature);
}

// ---------- layers panel & controls ----------
const layersEl=document.getElementById('layers'), layersBtn=document.getElementById('layersBtn');
layersBtn.onclick=e=>{ e.stopPropagation(); const on=!layersEl.classList.contains('on'); layersEl.classList.toggle('on',on); layersBtn.setAttribute('aria-expanded',on); };
let swallowClick=false;
document.addEventListener('pointerdown',e=>{ if(layersEl.classList.contains('on')&&!layersEl.contains(e.target)&&!layersBtn.contains(e.target)){ layersEl.classList.remove('on'); layersBtn.setAttribute('aria-expanded',false); if(map.getCanvas().contains(e.target)) swallowClick=true; } });
document.querySelectorAll('#styleSeg button').forEach(b=>b.onclick=()=>setBasemap(b.dataset.style));
document.getElementById('lyRoads').onchange=e=>{ layers.roads=e.target.checked; applyRoadToggles(); };
document.getElementById('lyNames').onchange=e=>{ layers.names=e.target.checked; applyRoadToggles(); };
document.getElementById('lyCounties').onchange=e=>{ layers.counties=e.target.checked; ['county-line','county-label'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',layers.counties?'visible':'none')); };
document.getElementById('ly3d').onchange=e=>map.easeTo({pitch:e.target.checked?55:0,duration:600});
document.getElementById('zin').onclick=()=>map.zoomIn(); document.getElementById('zout').onclick=()=>map.zoomOut();
document.getElementById('home').onclick=()=>map.flyTo({...HOME,pitch:0,bearing:0,duration:reduceMotion?0:1200});
document.getElementById('orbit').onclick=()=>map.flyTo({center:[-93,26],zoom:2.2,pitch:0,bearing:0,duration:reduceMotion?0:1600});

// ---------- toast ----------
const toastEl=document.getElementById('toast'); let toastT=0;
function toast(m){ toastEl.textContent=m; toastEl.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>toastEl.classList.remove('on'),3400); }

// ---------- export ----------
const fmtD=s=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const PERIOD=fmtD(DATA.period.start)+' – '+fmtD(DATA.period.end), today=new Date(), stamp=today.toISOString().slice(0,10);
const slug=s=>(s||'all-filings').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'selection';
const scopeLabel=()=>sel.feature?sel.label:'All filings shown';
function filterText(){ const t=describe(curSpec(false),fmtM); const mo=state.month?'Under construction in '+monthLabel(state.month):''; return [t,mo].filter(Boolean).join(' · '); }
function monthLabel(m){ return new Date(m+'-15T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric'}); }
let downloads=null; const inViewer=!!(window.claude&&window.claude.use);
if(inViewer) window.claude.use('downloads').then(d=>{downloads=d;}).catch(()=>{});
async function saveFile(filename,data,mime){
  if(downloads){ try{ await downloads.save({filename,data}); toast('Saved '+filename);}catch(err){ if(!err||err.code!=='declined') toast('Couldn’t save the file here.'); } return; }
  const blob=data instanceof Blob?data:new Blob([data],{type:mime}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},3000); toast('Saved '+filename);
}
const rowsFor=list=>list.map(f=>({'TABS #':f.id,'Project':f.name,'County':f.county,'City':f.city,'Address':f.addr,'Type':TYPE_LABEL[f.type],
  'Use':f.use||'','Subtype':f.sub||'','Tenant':f.ten||'','Units':f.units??'',
  'Est. value (USD)':Math.round(f.cost),'Sq ft':f.sqft||'','Owner':f.owner,'Developer':f.dev||'','Architect':f.arch||'','GC':f.gc||'','Registered':f.reg,'Status':f.status,'Est. start':f.start,'Est. end':f.end,
  'Timeline start':f.ts,'Timeline end':f.te,'Timeline dates':f.tsE||f.teE?'Partly estimated':'As filed','Change this week':f._chg||'','AI summary':f.sum||'','Scope':f.scope,
  ...(sel.kind==='radius'?{'Distance (mi)':Math.round(f._d*100)/100}:{}),'Location':f.approx?'Approximate (city)':'Address','Latitude':f.lat,'Longitude':f.lon,'TABS link':tabsUrl(f.id)}));
const guard=()=>{ if(!visible.length){ toast('Nothing to export: no filings match.'); return false; } return true; };
document.getElementById('exCsv').onclick=()=>{ if(!guard()) return; const rows=rowsFor(visible), cols=Object.keys(rows[0]);
  const q=v=>{ const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  saveFile('tabs-filings-'+slug(scopeLabel())+'-'+stamp+'.csv','\ufeff'+[cols.join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\r\n'),'text/csv'); };
document.getElementById('exXlsx').onclick=()=>{ if(!guard()) return; if(!window.XLSX){ toast('Excel export is still loading.'); return; }
  const rows=rowsFor(visible), ws=XLSX.utils.json_to_sheet(rows), cols=Object.keys(rows[0]), li=cols.indexOf('TABS link'), pi=cols.indexOf('Project'), vi=cols.indexOf('Est. value (USD)');
  rows.forEach((r,i)=>{ const L=XLSX.utils.encode_cell({r:i+1,c:li}),P=XLSX.utils.encode_cell({r:i+1,c:pi}),V=XLSX.utils.encode_cell({r:i+1,c:vi});
    if(ws[L]) ws[L].l={Target:r['TABS link']}; if(ws[P]) ws[P].l={Target:r['TABS link']}; if(ws[V]) ws[V].z='$#,##0'; });
  ws['!cols']=cols.map(c=>({wch:{'Project':42,'Address':38,'Owner':30,'Scope':60,'TABS link':48}[c]||14})); ws['!autofilter']={ref:ws['!ref']};
  const sum=[['Construction filings — '+scopeLabel()],['TDLR TABS registrations, '+PERIOD],['Generated',stamp],['Filters',filterText()||'None'],[],
    ['Filings',visible.length],['Est. value (USD)',Math.round(visible.reduce((s,f)=>s+f.cost,0))],['New builds',visible.filter(f=>f.type==='New').length],[],['County','Filings','Est. value (USD)','New builds']];
  COUNTIES.forEach(c=>{ const l=visible.filter(f=>f.county===c); if(l.length) sum.push([c,l.length,Math.round(l.reduce((s,f)=>s+f.cost,0)),l.filter(f=>f.type==='New').length]); });
  sum.push([],['Type','Filings','Est. value (USD)']); TYPES.forEach(t=>{ const l=visible.filter(f=>f.type===t); if(l.length) sum.push([TYPE_LABEL[t],l.length,Math.round(l.reduce((s,f)=>s+f.cost,0))]); });
  const ws2=XLSX.utils.aoa_to_sheet(sum); ws2['!cols']=[{wch:28},{wch:14},{wch:18},{wch:12}];
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws2,'Summary'); XLSX.utils.book_append_sheet(wb,ws,'Filings');
  saveFile('tabs-filings-'+slug(scopeLabel())+'-'+stamp+'.xlsx',new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'})),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); };
document.getElementById('exReport').onclick=()=>{ if(!guard()) return; saveFile('tabs-report-'+slug(scopeLabel())+'-'+stamp+'.html',buildReport(visible),'text/html'); };
document.getElementById('selClear').onclick=()=>{ clearSelection(); if(mode==='county') setMode('pan'); };
const RG={}; ['primary','trunk','motorway'].forEach(k=>{ if(DATA.roads&&DATA.roads[k]) RG[k]={type:'MultiLineString',coordinates:DATA.roads[k]}; });
function reportMap(list){
  const w=1000,h=560, fitTo=sel.feature||{type:'MultiPoint',coordinates:list.map(f=>[f.lon,f.lat])};
  const pr=d3.geoMercator().fitExtent([[24,24],[w-24,h-24]],fitTo); pr.clipExtent([[0,0],[w,h]]); const pth=d3.geoPath(pr);
  const span=Math.abs(pr.invert([0,0])[0]-pr.invert([w,0])[0]);
  let svg='<svg viewBox="0 0 '+w+' '+h+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Map of filings"><rect width="'+w+'" height="'+h+'" fill="#f8f9f9"/>';
  DATA.ring.forEach(c=>{ svg+='<path d="'+pth({type:'MultiPolygon',coordinates:c.outline})+'" fill="none" stroke="#dde1e2"/>'; });
  DATA.counties.forEach(c=>{ svg+='<path d="'+pth({type:'MultiPolygon',coordinates:c.outline})+'" fill="'+(c.name===HOME_C?'#f1f8f4':'#ffffff')+'" stroke="#bcc2c4"/>'; });
  [['primary',span<2.5,'#c9cfd1',1.1],['trunk',true,'#9aa1a4',1.6],['motorway',true,'#7b8386',2.2]].forEach(([k,on,col,wd])=>{ if(on&&RG[k]){ const d=pth(RG[k]); if(d) svg+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="'+wd+'" stroke-linecap="round"/>'; } });
  DATA.counties.forEach(c=>{ const p=pr(c.label); if(p&&p[0]>40&&p[0]<w-40&&p[1]>20&&p[1]<h-20) svg+='<text x="'+p[0].toFixed(1)+'" y="'+p[1].toFixed(1)+'" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="11" letter-spacing="1.5" fill="'+(c.name===HOME_C?'#006527':'#6b7174')+'">'+c.name.toUpperCase()+' CO.</text>'; });
  if(sel.feature) svg+='<path d="'+pth(sel.feature)+'" fill="rgba(0,101,39,.06)" stroke="#006527" stroke-width="1.6" stroke-dasharray="6 4"/>';
  list.slice().sort((a,b)=>b.cost-a.cost).forEach(f=>{ const p=pr([f.lon,f.lat]); if(!p) return; const r=Math.max(2.5,Math.min(16,2+Math.sqrt(f.cost/1e6)*1.3)), col=f.type==='New'?'#006527':f.type==='Reno'?'#6b7174':'#1f9249';
    svg+=(f.type==='Addition'||f.approx)?'<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+r.toFixed(1)+'" fill="none" stroke="'+col+'" stroke-width="1.4"/>'
      :'<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+col+'" fill-opacity="'+(f.type==='New'?.8:.6)+'" stroke="#fff" stroke-width=".8"/>'; });
  if(sel.kind==='radius'){ const c=pr(sel.center); if(c) svg+='<circle cx="'+c[0].toFixed(1)+'" cy="'+c[1].toFixed(1)+'" r="6" fill="#006527" stroke="#fff" stroke-width="2"/>'; }
  return svg+'</svg>';
}
function buildReport(list){
  const total=list.reduce((s,f)=>s+f.cost,0), newb=list.filter(f=>f.type==='New'), sq=list.reduce((s,f)=>s+(f.sqft||0),0), pct=v=>total?Math.round(v/total*100)+'%':'–';
  const byC=COUNTIES.map(c=>{const l=list.filter(f=>f.county===c); return [c,l.length,l.reduce((s,f)=>s+f.cost,0),l.filter(f=>f.type==='New').length];}).filter(r=>r[1]);
  const byT=TYPES.map(t=>{const l=list.filter(f=>f.type===t); return [TYPE_LABEL[t],l.length,l.reduce((s,f)=>s+f.cost,0)];}).filter(r=>r[1]);
  const top=list.slice().sort((a,b)=>b.cost-a.cost).slice(0,10), approx=list.filter(f=>f.approx).length, logo=document.querySelector('.brandbar .l-light').src, rad=sel.kind==='radius';
  const rowsHtml=list.map((f,i)=>'<tr><td class="m">'+(i+1)+'</td><td class="m">'+esc(f.reg)+'</td><td><a href="'+tabsUrl(f.id)+'">'+esc(f.name)+'</a>'+(f.scope?'<div class="sc">'+esc(f.scope)+'</div>':'')+'</td><td>'+esc(f.addr||f.city)+'<div class="sc">'+(rad?fmtMi(f._d)+' from center · ':'')+esc(f.county)+' County'+(f.approx?' · approx. location':'')+'</div></td><td>'+esc(TYPE_LABEL[f.type])+'</td><td class="m r">'+fmtM(f.cost)+'</td><td class="m r">'+(f.sqft?fmtN(f.sqft):'–')+'</td><td>'+esc(f.owner||'–')+'</td><td class="m">'+esc(f.status||'–')+(f.start||f.end?'<div class="sc">'+esc(f.start||'?')+' → '+esc(f.end||'?')+'</div>':'')+'</td></tr>').join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Construction filings report — '+esc(scopeLabel())+'</title>'+
  '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">'+
  '<style>@page{size:letter landscape;margin:.45in}*{box-sizing:border-box}body{margin:0;font-family:Montserrat,system-ui,sans-serif;color:#23282a;background:#fff;font-size:12px;line-height:1.45}.wrap{max-width:1100px;margin:0 auto;padding:32px 28px}'+
  '.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #006527;padding-bottom:14px}.hd img{height:44px}.k{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#006527;font-weight:500}'+
  'h1{font-size:26px;letter-spacing:-.02em;margin:6px 0 2px;font-weight:800;color:#0b0d0c}h2{font-size:15px;margin:26px 0 10px;font-weight:700;color:#0b0d0c}.meta{color:#6b7174;font-size:12px}'+
  '.kp{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #e8ebeb;border-radius:6px;margin-top:18px}.kp div{padding:12px 14px}.kp div+div{border-left:1px solid #e8ebeb}.kp div:first-child{border-left:3px solid #006527}'+
  '.kp b{display:block;font-family:"IBM Plex Mono",monospace;font-size:20px;font-weight:600;color:#0b0d0c}.kp span{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#6b7174}'+
  '.map{margin-top:16px;border:1px solid #e8ebeb;border-radius:6px;overflow:hidden}.map svg{display:block;width:100%;height:auto}.lg{display:flex;gap:16px;font-size:11px;color:#4d5457;margin-top:6px}.lg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}'+
  '.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}table{width:100%;border-collapse:collapse}th{font-family:"IBM Plex Mono",monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#6b7174;text-align:left;font-weight:500;border-bottom:1px solid #bcc2c4;padding:6px 8px}'+
  'td{border-bottom:1px solid #e8ebeb;padding:7px 8px;vertical-align:top}.m{font-family:"IBM Plex Mono",monospace;font-size:11px;white-space:nowrap}.r{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}a{color:#006527;font-weight:600;text-decoration:none}.sc{color:#6b7174;font-size:10.5px;margin-top:2px}'+
  '.ft{margin-top:24px;padding-top:10px;border-top:1px solid #e8ebeb;color:#6b7174;font-size:10.5px}.pb{position:fixed;right:18px;top:18px;background:#006527;color:#fff;border:0;border-radius:4px;padding:9px 14px;font:600 12px Montserrat,sans-serif;cursor:pointer}@media print{.pb{display:none}.wrap{padding:0}.full{break-before:page}}</style></head><body>'+
  '<button class="pb" onclick="window.print()">Print or save as PDF</button><div class="wrap"><div class="hd"><div><div class="k">TDLR TABS · Construction filings report</div><h1>'+esc(scopeLabel())+'</h1><div class="meta">Registrations '+PERIOD+' · Generated '+today.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+(filterText()?' · '+esc(filterText()):'')+'</div></div><img src="'+logo+'" alt="Finishes Solutions"></div>'+
  '<div class="kp"><div><b>'+fmtN(list.length)+'</b><span>Filings</span></div><div><b>'+fmtM(total)+'</b><span>Est. value</span></div><div><b>'+fmtN(newb.length)+'</b><span>New builds · '+fmtM(newb.reduce((s,f)=>s+f.cost,0))+'</span></div><div><b>'+(sq?fmtN(sq):'–')+'</b><span>Sq ft as filed</span></div></div>'+
  '<div class="map">'+reportMap(list)+'</div><div class="lg"><span><i style="background:#006527"></i>New construction</span><span><i style="background:#6b7174"></i>Renovation</span><span><i style="border:1.5px solid #1f9249"></i>Addition / approx. location</span><span>Marker size = est. value</span></div>'+
  '<div class="two"><div><h2>By county</h2><table><thead><tr><th>County</th><th class="r">Filings</th><th class="r">Est. value</th><th class="r">Share</th><th class="r">New</th></tr></thead><tbody>'+byC.map(r=>'<tr><td>'+esc(r[0])+'</td><td class="m r">'+fmtN(r[1])+'</td><td class="m r">'+fmtM(r[2])+'</td><td class="m r">'+pct(r[2])+'</td><td class="m r">'+r[3]+'</td></tr>').join('')+'</tbody></table>'+
  '<h2>By type</h2><table><thead><tr><th>Type</th><th class="r">Filings</th><th class="r">Est. value</th><th class="r">Share</th></tr></thead><tbody>'+byT.map(r=>'<tr><td>'+esc(r[0])+'</td><td class="m r">'+fmtN(r[1])+'</td><td class="m r">'+fmtM(r[2])+'</td><td class="m r">'+pct(r[2])+'</td></tr>').join('')+'</tbody></table></div>'+
  '<div><h2>Largest filings</h2><table><thead><tr><th>Project</th><th>City</th><th class="r">Est. value</th></tr></thead><tbody>'+top.map(f=>'<tr><td><a href="'+tabsUrl(f.id)+'">'+esc(f.name)+'</a><div class="sc">'+esc(TYPE_LABEL[f.type])+(f.sqft?' · '+fmtN(f.sqft)+' sq ft':'')+'</div></td><td>'+esc(f.city||f.county)+'</td><td class="m r">'+fmtM(f.cost)+'</td></tr>').join('')+'</tbody></table></div></div>'+
  '<div class="full"><h2>All filings ('+fmtN(list.length)+')</h2><table><thead><tr><th>#</th><th>Registered</th><th>Project</th><th>Location</th><th>Type</th><th class="r">Est. value</th><th class="r">Sq ft</th><th>Owner</th><th>Status</th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>'+
  '<div class="ft">Source: Texas Department of Licensing and Regulation, TABS project registrations ('+PERIOD+'). Each project name links to its TABS record. Costs and dates are filer estimates. Locations come from the US Census and OpenStreetMap geocoders'+(approx?'; '+approx+' filing'+(approx>1?'s are':' is')+' placed at city level':'')+'. Prepared for Finishes Solutions.</div></div></body></html>';
}

// ---------- views ----------
let view='map'; const viewHooks={};
function setView(v){
  if(!document.getElementById('view-'+v)&&v!=='map') v='map'; view=v;
  document.querySelectorAll('#viewbar button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v));
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('on',el.id==='view-'+v));
  stage.dataset.view=v; if(v==='map') setTimeout(()=>map.resize(),0); else viewHooks[v]?.();
  scheduleHash();
}
document.querySelectorAll('#viewbar button').forEach(b=>b.onclick=()=>setView(b.dataset.view));
{ const n=CHANGED.size; document.getElementById('chgBadge').textContent=n?fmtN(n):''; }

// ---------- month slider (map) ----------
const tRange=document.getElementById('tRange'), tLabel=document.getElementById('tLabel'), tPlay=document.getElementById('tPlay'), tsl=document.getElementById('tslider');
const MONTHS=(()=>{ const a=new Date(DATA.period.start.slice(0,7)+'-01T00:00:00Z'), maxEnd=F.reduce((m,f)=>f.te>m?f.te:m,''), cap=ym(new Date(Date.now()+3*365*864e5)), out=[];
  for(let d=a; ym(d)<=(maxEnd.slice(0,7)<cap?maxEnd.slice(0,7):cap); d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1))) out.push(ym(d)); return out.length?out:[ym(new Date())]; })();
tRange.max=MONTHS.length-1; tRange.value=Math.max(0,MONTHS.indexOf(ym(new Date())));
let playT=null;
function setMonth(m){ state.month=m; tsl.classList.toggle('on',!!m); tLabel.textContent=m?'Under construction · '+monthLabel(m):'Under construction by month'; if(m) tRange.value=MONTHS.indexOf(m); applyFilters(); }
let tT; tRange.oninput=()=>{ cancelAnimationFrame(tT); tT=requestAnimationFrame(()=>setMonth(MONTHS[+tRange.value])); };
document.getElementById('tClear').onclick=()=>{ stopPlay(); setMonth(null); };
function stopPlay(){ clearInterval(playT); playT=null; tPlay.classList.remove('on'); tPlay.setAttribute('aria-label','Play through months'); }
tPlay.onclick=()=>{ if(playT){ stopPlay(); return; } tPlay.classList.add('on'); tPlay.setAttribute('aria-label','Pause');
  let i=state.month?MONTHS.indexOf(state.month):0; if(i>=MONTHS.length-1) i=0; setMonth(MONTHS[i]);
  playT=setInterval(()=>{ i++; if(i>=MONTHS.length){ stopPlay(); return; } setMonth(MONTHS[i]); },reduceMotion?1600:850); };

// ---------- URL state (shareable links, saved searches) ----------
let hashT=0, booting=true;
function hashStr(){ const p=new URLSearchParams(encode(curSpec())); if(state.month) p.set('m',state.month); if(view!=='map') p.set('v',view); if(state.sel) p.set('f',state.sel.id); return p.toString(); }
function scheduleHash(){ if(booting) return; clearTimeout(hashT); hashT=setTimeout(()=>{ const h=hashStr(); history.replaceState(null,'',h?'#'+h:location.pathname+location.search); document.getElementById('rssLink').href='api/feed?'+encode(curSpec()); },250); }
document.getElementById('copyLink').onclick=async()=>{ const u=location.href.split('#')[0]+'#'+hashStr(); try{ await navigator.clipboard.writeText(u); toast('Link copied. It opens with these filters.'); }catch(e){ prompt('Copy this link',u); } };

// ---------- modules ----------
if(/[?&]debug\b/.test(location.search)) window.fsDebug=()=>ctx;
const ctx={ DATA,F,BY_ID,CHANGED,COUNTIES,TYPES,TYPE_LABEL,state,sel,map,
  get visible(){ return visible; }, get visibleNoWho(){ return visibleNoWho; }, get view(){ return view; },
  applyFilters,fromSpec,curSpec,select,setView,setMonth,monthLabel,filterText,richText,wireCites,toast,esc,fmtM,fmtN,isDark,C,geocode,hashStr,
  onChange:fn=>listeners.push(fn), onCardClose:fn=>cardCloseHooks.push(fn), closeCard, clearSelection:clearSel, reduceMotion, onView:(v,fn)=>{ viewHooks[v]=fn; }, onOverlays:fn=>overlayHooks.push(fn), tip, viewport };
for (const init of [initTimeline,initWho,initChanges,initAsk,initMarket,initSaved,initBuildings]) { try{ init(ctx); }catch(e){ console.error('module failed',init.name,e); } }

// ---------- boot ----------
{ const s=new Date(DATA.period.start+'T12:00:00'), e=new Date(DATA.period.end+'T12:00:00'); const m=d=>d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  document.getElementById('kicker').textContent='TDLR TABS · '+m(s)+' – '+m(e);
  document.getElementById('periodTxt').textContent=PERIOD; const miss=DATA.unmapped||0; document.getElementById('missTxt').textContent=miss>0?fmtN(miss)+' filing'+(miss>1?'s':'')+' with no mappable address '+(miss>1?'are':'is')+' left off the map. ':''; }
{ const h=location.hash.slice(1), p=new URLSearchParams(h);
  if(h){ fromSpec(decode(h),{fly:false}); if(p.get('m')&&MONTHS.includes(p.get('m'))) setMonth(p.get('m')); } else applyFilters();
  booting=false;
  if(p.get('v')) setView(p.get('v'));
  const f=p.get('f')&&BY_ID.get(p.get('f')); if(f) map.once('load',()=>select(f,true));
  scheduleHash();
  map.once('load',()=>{ if(f) return; if(sel.feature) fitGeom(sel.feature); else if(!reduceMotion) setTimeout(()=>map.flyTo({...HOME,duration:2600,essential:true}),300); else map.jumpTo(HOME); });
}
