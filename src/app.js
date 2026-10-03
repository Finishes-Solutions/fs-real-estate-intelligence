
import { makeMatcher, encode, decode, describe } from './lib/filter.mjs';
import { USES, entityKey } from './lib/taxonomy.mjs';
import { recentChanges } from './lib/changes.mjs';
import { initTimeline } from './timeline.js';
import { initWho, initChanges } from './views.js';
import { initAssistant } from './assistant.js';
import { initMarket } from './market.js';
import { initSaved } from './saved.js';
import { initBuildings } from './building.js';
import { initMobile } from './mobile.js';
import { initField } from './field.js';
import { initMapSearch } from './mapsearch.js';
import { initCompare } from './compare.js';
import { initKpis } from './kpis.js';
import { initExport } from './export.js';
import { initReports } from './reports.js';
import { initChatCards } from './chatcards.js';
import { initNearby } from './nearby.js';
import { initLive } from './live.js';
import { initSources } from './sources.js';
import { initPlanes } from './planes.js';
import { initTeam } from './team.js';
import { initArea } from './area.js';
import { initRegrid } from './regrid.js';
import { initSite } from './site.js';
import { initCrime } from './crime.js';
import { initFema } from './fema.js';
import { initAreaReports } from './reportkit.js';
import { initDriveTime } from './drivetime.js';
import { initTraffic } from './traffic.js';
import { initAirports } from './airports.js';
import { initGlance } from './glance.js';
import { plainText, textBlocks } from './lib/assist-logic.mjs';

const MAPTILER_KEY = 'vA28jXazwpYesC2b1Ccp';
const getJSON=(u,optional)=>fetch(u,{cache:'no-cache'}).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return r.json(); }).catch(e=>{ if(optional) return null; throw e; });
const [GEO,FIL,CHG]=await Promise.all([getJSON('data/geo.json'),getJSON('data/filings.json'),getJSON('data/changes.json',true)]);
const DATA={...GEO,...FIL,changes:CHG||{runs:[]}};
const R2D=180/Math.PI, EARTH_MI=3958.8;
const ym=d=>d.toISOString().slice(0,7);
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
const LAST_RUN=DATA.changes.runs[0], CHANGED=recentChanges(DATA.changes);
const F=DATA.filings.map(f=>({...f,r:Math.max(2.2,Math.min(15,1.6+Math.sqrt(f.cost/1e6)*1.15)),_chg:CHANGED.get(f.id)||null})).sort((a,b)=>b.cost-a.cost);
const BY_ID=new Map(F.map(f=>[f.id,f]));
const state={counties:new Set(COUNTIES),types:new Set(TYPES),min:0,max:0,q:'',uses:null,who:null,d:null,chg:null,st:null,sqmin:0,sqmax:0,co:'',exact:0,umin:0,month:null,sel:null,shown:150};
const sel={kind:null,label:'',feature:null,counties:new Set(),center:null};
// registration period presets; the default view is the last 12 months of filings
const PERIODS=[['3m','3 mo',3],['12m','12 mo',12],['2y','2 yr',24],['5y','5 yr',60],['all','All',0]];
function periodSpec(k){ const p=PERIODS.find(x=>x[0]===k)||PERIODS[1]; if(!p[2]) return {f:'all',from:'',to:''}; const d=new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-p[2]+1); return {f:'reg',from:ym(d),to:''}; }
const periodOf=d=>{ if(!d) return 'all'; if(d.f==='all') return 'all'; if(d.f!=='reg'||d.to) return null; const hit=PERIODS.find(p=>p[2]&&periodSpec(p[0]).from===d.from); return hit?hit[0]:null; };
const DEFAULT_SPEC=()=>({d:periodSpec('12m')});
let visible=F, visibleNoWho=F;
const monthRange=m=>{ const [y,mo]=m.split('-').map(Number); return [m+'-01',new Date(Date.UTC(y,mo,0)).toISOString().slice(0,10)]; };
const inSel=f=>!sel.feature||d3.geoContains(sel.feature,[f.lon,f.lat]);
const countyGeo=DATA.counties.map(c=>({name:c.name,geom:{type:'MultiPolygon',coordinates:c.outline}}));

// ---------- map ----------
const STYLES={dots:['dataviz','dataviz-dark'],streets:['streets-v2','streets-v2-dark'],sat:['hybrid','hybrid'],topo:['topo-v2','topo-v2-dark'],esri:null,free:null};
// keyless basemaps: Esri World Imagery (with OpenFreeMap labels and buildings on top) and OpenFreeMap streets
const OFM='https://tiles.openfreemap.org';
const ESRI_STYLE={version:8,glyphs:OFM+'/fonts/{fontstack}/{range}.pbf',
  sources:{esri:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'},
    openmaptiles:{type:'vector',url:OFM+'/planet',attribution:'© OpenMapTiles © OpenStreetMap contributors (via OpenFreeMap)'}},
  layers:[{id:'esri',type:'raster',source:'esri'},
    {id:'esri-road-lbl',type:'symbol',source:'openmaptiles','source-layer':'transportation_name',minzoom:12,layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':11},paint:{'text-color':'#ffffff','text-halo-color':'#0b0d0c','text-halo-width':1.4}},
    {id:'esri-place-lbl',type:'symbol',source:'openmaptiles','source-layer':'place',filter:['in',['get','class'],['literal',['city','town','village','suburb','neighbourhood']]],layout:{'text-field':['get','name'],'text-font':['Noto Sans Bold'],'text-size':['match',['get','class'],'city',14,'town',12.5,11]},paint:{'text-color':'#ffffff','text-halo-color':'#0b0d0c','text-halo-width':1.6}}]};
const isSat=()=>layers.style==='sat'||layers.style==='esri';
// property-first: filing dots start hidden (Layers → Filings, the Construction Filings section or the assistant turn them on)
const layers={style:'dots',roads:true,names:true,counties:true,size:'uniform',heat:'off',dots:false};
try{ const L=JSON.parse(localStorage.getItem('fs-map-layers')||'{}'); if(['uniform','value'].includes(L.size)) layers.size=L.size; if(['off','count','value'].includes(L.heat)) layers.heat=L.heat; if(L.v===2&&typeof L.dots==='boolean') layers.dots=L.dots; }catch(e){} // v2: older saves had dots on for everyone
const saveLayers=()=>{ try{ localStorage.setItem('fs-map-layers',JSON.stringify({v:2,size:layers.size,heat:layers.heat,dots:layers.dots})); }catch(e){} };
const styleUrl=s=>s==='esri'?ESRI_STYLE:s==='free'?OFM+'/styles/liberty':'https://api.maptiler.com/maps/'+STYLES[s][isDark()?1:0]+'/style.json?key='+MAPTILER_KEY;
const map=new maplibregl.Map({container:'map',style:styleUrl('dots'),center:[-93,24],zoom:1.6,minZoom:1,maxZoom:19,maxPitch:70,
  attributionControl:{compact:true},doubleClickZoom:true,dragRotate:true,cooperativeGestures:false});
map.on('error',e=>{ const m=(e&&e.error&&e.error.message)||''; if(/40[13]|Unauthorized|Forbidden/i.test(m)&&STYLES[layers.style]) toast('MapTiler refused the key for this site. Check the key’s allowed origins.'); });

const fc=features=>({type:'FeatureCollection',features});
const ptFeatures=(pts,props)=>pts.map(p=>({type:'Feature',properties:props||{},geometry:{type:'Point',coordinates:p}}));
const GJ={
  land:fc(ptFeatures(DATA.land)), texas:fc(ptFeatures(DATA.texas)),
  cdots:fc(DATA.counties.flatMap(c=>ptFeatures(c.dots,{w:c.name===HOME_C?1:0}))),
  counties:fc(DATA.counties.map(c=>({type:'Feature',properties:{name:c.name,w:c.name===HOME_C?1:0},geometry:{type:'MultiPolygon',coordinates:c.outline}}))),
  clabels:fc(DATA.counties.map(c=>({type:'Feature',properties:{t:c.name.toUpperCase()+' CO.',w:c.name===HOME_C?1:0},geometry:{type:'Point',coordinates:c.label}})))
};
const IDX=new Map(F.map((f,i)=>[f,i]));
function filingsFC(){ return fc(visible.map(f=>({type:'Feature',properties:{i:IDX.get(f),t:f.type,r:f.r,lc:Math.log10(Math.max(f.cost,1e4)),h:(f.approx||f.type==='Addition')?1:0},geometry:{type:'Point',coordinates:[f.lon,f.lat]}}))); }
const C=()=>isDark()?{new:'#4caf70',reno:'#939a9d',add:'#8acda3',line:'rgba(255,255,255,.55)',waller:'#4caf70',dot:'#8d9598',lab:'#dde1e2',halo:'#16191a',sel:'#4caf70',stroke:'#16191a'}
  : (isSat()?{new:'#5fd38a',reno:'#f1f3f3',add:'#c2e3d0',line:'rgba(255,255,255,.85)',waller:'#8acda3',dot:'#ffffff',lab:'#ffffff',halo:'#0b0d0c',sel:'#c2e3d0',stroke:'#0b0d0c'}
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
  // dot grid: world → Texas → counties. Small points that hand off to the next finer grid, and fade out
  // completely by street level so they never clutter a close-up view.
  map.addLayer({id:'land-dots',type:'circle',source:'land',maxzoom:5,layout:{visibility:dots?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],1,.7,4,1.1],'circle-color':c.dot,'circle-opacity':['interpolate',['linear'],['zoom'],1,.45,3,.4,4.6,0],'circle-pitch-alignment':'map'}},before);
  map.addLayer({id:'texas-dots',type:'circle',source:'texas',minzoom:2.5,maxzoom:8.5,layout:{visibility:dots?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,.55,5,.8,7,1.1],'circle-color':c.dot,'circle-opacity':['interpolate',['linear'],['zoom'],2.5,0,3.5,.45,6,.4,7,.2,8,0],'circle-pitch-alignment':'map'}},before);
  map.addLayer({id:'county-dots',type:'circle',source:'cdots',minzoom:5.5,maxzoom:12,layout:{visibility:dots?'visible':'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,.5,8,.8,10,1.1,11.5,1.3],'circle-color':['case',['==',['get','w'],1],c.waller,c.dot],'circle-opacity':['interpolate',['linear'],['zoom'],5.5,0,6.5,.35,8.5,.45,10,.3,11.5,0],'circle-pitch-alignment':'map'}},before);
  map.addLayer({id:'county-line',type:'line',source:'counties',layout:{visibility:layers.counties?'visible':'none','line-join':'round'},paint:{'line-color':['case',['==',['get','w'],1],c.waller,c.line],'line-width':['interpolate',['linear'],['zoom'],6,['case',['==',['get','w'],1],1.8,1],11,['case',['==',['get','w'],1],2.2,1.4],16,['case',['==',['get','w'],1],3,2]]}},before);
  map.addLayer({id:'sel-fill',type:'fill',source:'sel',paint:{'fill-color':c.sel,'fill-opacity':.09}});
  map.addLayer({id:'sel-line',type:'line',source:'sel',paint:{'line-color':c.sel,'line-width':2.2,'line-dasharray':[3,2]}});
  map.addLayer({id:'draft-fill',type:'fill',source:'draft',filter:['==','$type','Polygon'],paint:{'fill-color':c.sel,'fill-opacity':.1}});
  map.addLayer({id:'draft-line',type:'line',source:'draft',paint:{'line-color':c.sel,'line-width':2,'line-dasharray':[3,2]}});
  map.addLayer({id:'draft-pts',type:'circle',source:'draftpts',paint:{'circle-radius':['case',['==',['get','first'],1],6,4],'circle-color':'#ffffff','circle-stroke-color':c.sel,'circle-stroke-width':2}});
  map.addLayer({id:'county-label',type:'symbol',source:'clabels',minzoom:6.2,layout:{visibility:layers.counties?'visible':'none','text-field':['get','t'],'text-font':labelFont,'text-size':11,'text-letter-spacing':.14,'text-allow-overlap':false},
    paint:{'text-color':['case',['==',['get','w'],1],c.waller,c.lab],'text-halo-color':c.halo,'text-halo-width':1.6}});
  const col=['match',['get','t'],'New',c.new,'Reno',c.reno,c.add];
  map.addLayer({id:'heat',type:'heatmap',source:'filings',maxzoom:17,layout:{visibility:'none'},paint:{'heatmap-radius':['interpolate',['linear'],['zoom'],4,8,8,18,11,32,14,48,17,70],'heatmap-intensity':['interpolate',['linear'],['zoom'],4,.6,9,.9,13,1.3],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],11,.85,15,.4],'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',.08,isDark()?'rgba(76,175,112,.12)':'rgba(138,205,163,.18)',.25,isDark()?'rgba(76,175,112,.45)':'rgba(138,205,163,.55)',.45,'#8acda3',.65,'#4caf70',.82,'#1f9249',.93,'#006527',1,isDark()?'#e8f5ec':'#00351a']}});
  map.addLayer({id:'filings',type:'circle',source:'filings',paint:{'circle-color':col,
    'circle-stroke-color':['case',['==',['get','h'],1],col,c.stroke],'circle-stroke-width':['case',['==',['get','h'],1],1.4,.8],'circle-pitch-alignment':'map'}});
  map.addLayer({id:'filings-hl',type:'circle',source:'filings',filter:['==',['get','i'],-1],paint:{'circle-radius':['+',markerRadius(),6],'circle-color':'rgba(0,0,0,0)','circle-stroke-color':isDark()||isSat()?'#ffffff':'#0b0d0c','circle-stroke-width':2.2}});
  if(!map.getSource('hl')) map.addSource('hl',{type:'geojson',data:fc([])});
  map.addLayer({id:'hl-glow',type:'circle',source:'hl',paint:{'circle-radius':16,'circle-color':'#eda100','circle-opacity':.18,'circle-blur':.6,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'hl-ring',type:'circle',source:'hl',paint:{'circle-radius':9,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#eda100','circle-stroke-width':2.6,'circle-pitch-alignment':'map'}});
  if(!map.getSource('focus')) map.addSource('focus',{type:'geojson',data:fc([])});
  map.addLayer({id:'focus-halo',type:'circle',source:'focus',filter:['==',['get','approx'],1],paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,18,14,46],'circle-color':c.sel,'circle-opacity':.10,'circle-stroke-color':c.sel,'circle-stroke-width':1.2,'circle-stroke-opacity':.6,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'focus-dot',type:'circle',source:'focus',paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,6,14,9],'circle-color':['match',['get','t'],'New',c.new,'Reno',c.reno,c.add],'circle-stroke-color':isDark()||layers.style==='sat'?'#ffffff':'#0b0d0c','circle-stroke-width':3,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'focus-label',type:'symbol',source:'focus',layout:{'text-field':['get','name'],'text-font':labelFont,'text-size':12,'text-offset':[0,1.4],'text-anchor':'top','text-max-width':14,'text-allow-overlap':true},paint:{'text-color':c.lab,'text-halo-color':c.halo,'text-halo-width':1.8}});
  map.addLayer({id:'hl-label',type:'symbol',source:'hl',minzoom:8,layout:{'text-field':['get','name'],'text-font':labelFont,'text-size':11.5,'text-offset':[0,1.5],'text-anchor':'top','text-max-width':12,'text-optional':true},paint:{'text-color':c.lab,'text-halo-color':c.halo,'text-halo-width':1.6}});
  styleFilings();
  applyRoadToggles(); syncSel(); syncHighlight(); overlayHooks.forEach(fn=>fn());
  if(hlData.length) map.getSource('hl').setData(fc(hlData));
}
// marker size: uniform by default (zoom only); optional size by estimated value
function markerRadius(){ return layers.size==='value'
  ? ['interpolate',['exponential',1.6],['zoom'],5,['*',['get','r'],.55],8,['*',['get','r'],1],12,['*',['get','r'],1.7],16,['*',['get','r'],2.4]]
  : ['interpolate',['linear'],['zoom'],4,1.7,7,2.5,10,3.5,13,4.8,16,6.5]; }
function styleFilings(){
  if(!map.getLayer||!map.getLayer('filings')) return;
  const heat=layers.heat!=='off', base=['case',['==',['get','h'],1],.2,['==',['get','t'],'New'],.88,.72];
  map.setPaintProperty('filings','circle-radius',markerRadius());
  map.setPaintProperty('filings-hl','circle-radius',['+',markerRadius(),6]);
  // with the heatmap on, dots step back until you are close enough to read individual projects
  map.setPaintProperty('filings','circle-opacity',heat?['interpolate',['linear'],['zoom'],10,0,12.5,['*',base,1]]:base);
  map.setPaintProperty('filings','circle-stroke-opacity',heat?['interpolate',['linear'],['zoom'],10,0,12.5,1]:1);
  map.setLayoutProperty('heat','visibility',heat?'visible':'none');
  ['filings','filings-hl'].forEach(id=>map.setLayoutProperty(id,'visibility',layers.dots?'visible':'none'));
  const lf=document.getElementById('lyFilings'); if(lf) lf.checked=layers.dots;
  map.setPaintProperty('heat','heatmap-weight',layers.heat==='value'?['interpolate',['linear'],['get','lc'],4.7,.04,6,.2,7,.55,8,1,9.5,2]:1);
  syncLegend();
}
function syncLegend(){
  document.documentElement.dataset.filings=layers.dots?'on':'off'; // hides the Filings legend and the phone's filing count while the dots are off
  document.querySelector('.legend')?.classList.toggle('heat',layers.heat!=='off');
  const lg=document.getElementById('legendT'); if(lg) lg.textContent=layers.heat!=='off'?(layers.heat==='value'?'Heatmap = est. value':'Heatmap = number of filings'):layers.size==='value'?'Dot size = est. value':'Filings';
  document.querySelectorAll('#sizeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.size===layers.size));
  document.querySelectorAll('#heatSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.heat===layers.heat));
}
// assistant highlights: pulsing rings + labels on specific filings
let hlData=[], hlIds=[], hlT=0;
function highlight(list,label){
  hlIds=list.map(f=>f.id); hlData=list.map(f=>({type:'Feature',properties:{name:f.name.length>34?f.name.slice(0,32)+'…':f.name},geometry:{type:'Point',coordinates:[f.lon,f.lat]}}));
  map.getSource('hl')?.setData(fc(hlData));
  if(list.length===1) map.flyTo({center:[list[0].lon,list[0].lat],zoom:Math.max(map.getZoom(),14),duration:reduceMotion?0:1200});
  else fitPoints(list);
  cancelAnimationFrame(hlT); if(reduceMotion) return; const t0=performance.now();
  const tick=t=>{ const k=((t-t0)/1100)%1; if(!map.getLayer('hl-ring')) return; map.setPaintProperty('hl-glow','circle-radius',12+k*18); map.setPaintProperty('hl-glow','circle-opacity',.32*(1-k)); if(t-t0<9000) hlT=requestAnimationFrame(tick); else { map.setPaintProperty('hl-glow','circle-radius',16); map.setPaintProperty('hl-glow','circle-opacity',.18); } };
  hlT=requestAnimationFrame(tick);
}
const highlighted=()=>hlIds.slice();
function clearHighlight(){ hlData=[]; hlIds=[]; cancelAnimationFrame(hlT); map.getSource('hl')?.setData(fc([])); }
function fitPoints(list){
  if(!list.length) return;
  // ignore the farthest 2% so one odd geocode doesn't zoom the map out to the whole state
  const xs=list.map(f=>f.lon).sort((a,b)=>a-b), ys=list.map(f=>f.lat).sort((a,b)=>a-b), q=a=>[a[Math.floor((a.length-1)*.02)],a[Math.ceil((a.length-1)*.98)]];
  const [x0,x1]=list.length>20?q(xs):[xs[0],xs[xs.length-1]], [y0,y1]=list.length>20?q(ys):[ys[0],ys[ys.length-1]];
  if(x1-x0<.004&&y1-y0<.004){ map.flyTo({center:[(x0+x1)/2,(y0+y1)/2],zoom:Math.max(map.getZoom(),14),duration:reduceMotion?0:1000}); return; }
  safeFit([[x0,y0],[x1,y1]],{padding:60,maxZoom:15});
}
// fitBounds throws when the padding leaves no room (small screens with a drawer open); shrink the padding instead
function safeFit(b,o={}){ for(const pad of [o.padding??60,24,0]){ try{ if(map.cameraForBounds(b,{...o,padding:pad})){ map.fitBounds(b,{...o,padding:pad,duration:reduceMotion?0:1000}); return; } }catch(e){} } map.flyTo({center:[(b[0][0]+b[1][0])/2,(b[0][1]+b[1][1])/2],duration:reduceMotion?0:1000}); }
// keep the map's visual center clear of the assistant drawer / sheet
function mapPadding(){
  const open=document.querySelector('.app').classList.contains('ai-open'), ai=document.getElementById('ai'), phone=innerWidth<=700;
  const pad={top:0,bottom:0,left:0,right:0}; if(open&&ai){ const r=ai.getBoundingClientRect(); if(phone) pad.bottom=Math.round(r.height); else pad.right=Math.round(r.width); }
  map.setPadding(pad);
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
  try{ if(map.getTerrain()) map.setTerrain(null); }catch(e){} // MapLibre breaks if terrain is live during a style swap; live.js re-adds it on style.load
  map.setStyle(styleUrl(s),{diff:false});
}

// ---------- filters + list ----------
function curSpec(withSel=true){ const s={};
  if(state.counties.size<COUNTIES.length) s.c=COUNTIES.filter(c=>state.counties.has(c));
  if(state.types.size<TYPES.length) s.t=TYPES.filter(t=>state.types.has(t));
  if(state.uses) s.u=[...state.uses]; if(state.min) s.min=state.min; if(state.max) s.max=state.max;
  if(state.q.trim()) s.q=state.q.trim(); if(state.who) s.who=state.who; if(state.d) s.d=state.d; if(state.chg) s.chg=state.chg;
  if(state.st) s.st=[...state.st]; if(state.sqmin) s.sqmin=state.sqmin; if(state.sqmax) s.sqmax=state.sqmax; if(state.co.trim()) s.co=state.co.trim(); if(state.exact) s.exact=1; if(state.umin) s.umin=state.umin;
  if(withSel){ const ss=selSpec(); if(ss) s.sel=ss; } return s; }
function selSpec(){ if(!sel.feature) return null;
  if(sel.kind==='radius') return {k:'r',c:sel.center,mi:radiusMiles,label:sel.place||''};
  if(sel.kind==='county') return {k:'c',names:COUNTIES.filter(n=>sel.counties.has(n))};
  return {k:'p',ring:urlRing(sel.feature),label:sel.label}; }
function urlRing(g){ let ring=g.coordinates[0];
  if(g.type==='MultiPolygon') ring=g.coordinates.map(p=>p[0]).sort((a,b)=>Math.abs(d3.geoArea({type:'Polygon',coordinates:[b]})-2*Math.PI)-Math.abs(d3.geoArea({type:'Polygon',coordinates:[a]})-2*Math.PI))[0]||[];
  ring=ring.slice(0,-1); const step=Math.max(1,Math.ceil(ring.length/160)); return ring.filter((p,i)=>i%step===0).map(p=>[+p[0].toFixed(4),+p[1].toFixed(4)]); }
// d3 wants clockwise outer rings; GeoJSON from other sources is usually counter-clockwise
function fixWinding(g){ const fix=rings=>{ const poly={type:'Polygon',coordinates:rings}; return d3.geoArea(poly)>2*Math.PI?rings.map(r=>r.slice().reverse()):rings; };
  if(g.type==='Polygon') return {type:'Polygon',coordinates:fix(g.coordinates)};
  if(g.type==='MultiPolygon') return {type:'MultiPolygon',coordinates:g.coordinates.map(fix)};
  return g; }
const monthOK=f=>{ if(!state.month) return true; const [a,b]=monthRange(state.month); return f.ts<=b&&f.te>=a; };
const listeners=[];
function applyFilters(){
  const spec=curSpec(false), m=makeMatcher(spec,{changed:CHANGED});
  visible=F.filter(f=>m(f)&&inSel(f)&&monthOK(f));
  if(state.who){ const m2=makeMatcher({...spec,who:null},{changed:CHANGED}); visibleNoWho=F.filter(f=>m2(f)&&inSel(f)&&monthOK(f)); } else visibleNoWho=visible;
  if(sel.kind==='radius'){ visible.forEach(f=>f._d=d3.geoDistance([f.lon,f.lat],sel.center)*EARTH_MI); visible.sort((a,b)=>a._d-b._d); }
  document.getElementById('selbar').classList.add('on');
  document.getElementById('selName').textContent=sel.feature?sel.label:'Everything shown';
  document.getElementById('selStats').textContent=fmtN(visible.length)+' filings · '+fmtM(visible.reduce((s,f)=>s+f.cost,0));
  document.getElementById('selClear').style.display=sel.feature?'':'none';
  state.shown=150; renderList();
  const src=map.getSource&&map.getSource('filings'); if(src) src.setData(filingsFC());
  syncFilterUI(); scheduleHash(); listeners.forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } });
}
const cRow=document.getElementById('countyRow'), tRow=document.getElementById('typeRow'), pRow=document.getElementById('periodRow');
PERIODS.forEach(([k,label])=>{ const b=document.createElement('button'); b.className='chip'; b.dataset.p=k; b.textContent=label; b.setAttribute('aria-pressed','false');
  b.onclick=()=>{ state.d=periodSpec(k); applyFilters(); }; pRow.appendChild(b); });
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
document.getElementById('maxCost').onchange=e=>{state.max=+e.target.value; applyFilters();};
// multi-select chip rows (use, status): nothing pressed = no filter
function chipRow(rowId,values,key,label=v=>v){ const row=document.getElementById(rowId); const n={}; F.forEach(f=>{ const v=key==='uses'?(f.use||'Unclassified'):(f.status||'Unknown'); n[v]=(n[v]||0)+1; });
  values.filter(v=>n[v]).forEach(v=>{ const b=document.createElement('button'); b.className='chip'; b.type='button'; b.dataset.v=v; b.setAttribute('aria-pressed','false'); b.innerHTML=esc(label(v))+' <span class="n">'+fmtN(n[v])+'</span>';
    b.onclick=()=>{ const set=new Set(state[key]||[]); set.has(v)?set.delete(v):set.add(v); state[key]=set.size?set:null; applyFilters(); }; row.appendChild(b); });
  if(row.querySelectorAll('.chip').length<2) row.style.display='none'; }
chipRow('useRow',[...USES,'Unclassified'],'uses');
chipRow('statusRow',['Registered','Review complete','Inspection complete','Closed','Unknown'],'st');
const sqMin=document.getElementById('sqMin'), sqMax=document.getElementById('sqMax'), uMin=document.getElementById('uMin'), coQ=document.getElementById('coQ'), exactBtn=document.getElementById('exactBtn');
let numT; [sqMin,sqMax].forEach(i=>i.addEventListener('input',()=>{ clearTimeout(numT); numT=setTimeout(()=>{ state.sqmin=Math.max(0,+sqMin.value||0); state.sqmax=Math.max(0,+sqMax.value||0); applyFilters(); },350); }));
uMin.onchange=()=>{ state.umin=+uMin.value; applyFilters(); };
let coT; coQ.addEventListener('input',()=>{ clearTimeout(coT); coT=setTimeout(()=>{ state.co=coQ.value; applyFilters(); },250); });
exactBtn.onclick=()=>{ state.exact=state.exact?0:1; applyFilters(); };
// collapsible Filters and List sections (remembered in this browser)
// Construction Filings starts collapsed; opening it also puts the filing dots on the map
for(const [btnId,bodyId,key,dflt] of [['secFilings','filingsBody','fs-sec-filings','0'],['secList','list','fs-sec-list']]){
  const b=document.getElementById(btnId), body=document.getElementById(bodyId), set=open=>{ b.setAttribute('aria-expanded',open); body.classList.toggle('collapsed',!open); if(bodyId!=='filtersBody') document.querySelector('.panel')?.classList.toggle('list-collapsed',!open||document.getElementById('secFilings').getAttribute('aria-expanded')!=='true'||document.getElementById('secList').getAttribute('aria-expanded')!=='true'); };
  let open=true; try{ open=(localStorage.getItem(key)??dflt)!=='0'; }catch(e){} set(open);
  b.onclick=()=>{ const o=b.getAttribute('aria-expanded')!=='true'; set(o); if(o&&bodyId==='filingsBody') showFilings(); try{ localStorage.setItem(key,o?'1':'0'); }catch(e){} };
}
// use, dates, updates, active-filter summary
const dField=document.getElementById('dField'), dFrom=document.getElementById('dFrom'), dTo=document.getElementById('dTo');

const dPeriod=[DATA.period.start.slice(0,7), ym(new Date(Date.now()+3*365*864e5))];
[dFrom,dTo].forEach(i=>{ i.min=dPeriod[0].slice(0,4)+'-01'; i.max=dPeriod[1]; });
function readDates(){ const f=dField.value; dFrom.disabled=dTo.disabled=!f; state.d=f?{f,from:dFrom.value||'',to:dTo.value||''}:{f:'all',from:'',to:''}; applyFilters(); }
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
  const pk=periodOf(state.d); [...pRow.querySelectorAll('.chip')].forEach(x=>x.setAttribute('aria-pressed',x.dataset.p===pk));
  const minEl=document.getElementById('minCost'); if(![...minEl.options].some(o=>+o.value===state.min)){ const o=document.createElement('option'); o.value=state.min; o.textContent=fmtM(state.min)+'+'; minEl.appendChild(o); } minEl.value=String(state.min);
  document.querySelectorAll('#useRow .chip').forEach(x=>x.setAttribute('aria-pressed',!!state.uses&&state.uses.has(x.dataset.v)));
  document.querySelectorAll('#statusRow .chip').forEach(x=>x.setAttribute('aria-pressed',!!state.st&&state.st.has(x.dataset.v)));
  const maxEl=document.getElementById('maxCost'); if(state.max&&![...maxEl.options].some(o=>+o.value===state.max)){ const o=document.createElement('option'); o.value=state.max; o.textContent=fmtM(state.max); maxEl.appendChild(o); } maxEl.value=String(state.max||0);
  if(document.activeElement!==sqMin) sqMin.value=state.sqmin||''; if(document.activeElement!==sqMax) sqMax.value=state.sqmax||'';
  uMin.value=String(state.umin||0); if(document.activeElement!==coQ) coQ.value=state.co||''; exactBtn.setAttribute('aria-pressed',!!state.exact);
  const dd=state.d&&state.d.f!=='all'?state.d:null; dField.value=dd?dd.f:''; dFrom.value=dd?.from||''; dTo.value=dd?.to||''; dFrom.disabled=dTo.disabled=!dd;
  const nMore=(state.uses?1:0)+(state.d&&!pk?1:0)+(state.chg?1:0)+(state.st?1:0)+(state.sqmin||state.sqmax?1:0)+(state.umin?1:0)+(state.co.trim()?1:0)+(state.exact?1:0); document.getElementById('moreN').textContent=nMore?'· '+nMore+' on':''; if(nMore) document.getElementById('moreF').open=true;
  const nAll=Object.keys(curSpec(false)).filter(k=>k!=='d').length+(pk&&pk!=='12m'?1:0); const fN=document.getElementById('filterN'); fN.textContent=nAll||''; fN.hidden=!nAll; document.getElementById('filterClear').hidden=!nAll&&!state.month;
  document.getElementById('filterBtn').classList.toggle('on',!!nAll);
  const t=filterText(); document.getElementById('activeTxt').textContent=t?'Filters: '+t:''; document.getElementById('activeBar').classList.toggle('on',!!t);
}
let openFilters=()=>{}; // set below once the popup is wired; exposed as ctx.openFilters
const clearFilters=()=>{ ctx.clearPlace?.(); fromSpec(DEFAULT_SPEC()); if(state.month) setMonth(null); };
document.getElementById('resetAll').onclick=clearFilters;
// Filters: a popup from the map toolbar (between County and Export), with a Clear button beside it while any are on.
// Filters only act on construction filings, so changing one puts the filing dots on the map.
{ const btn=document.getElementById('filterBtn'), pop=document.getElementById('filterPop'), wrap=document.getElementById('fwrap');
  const setOpen=open=>{ pop.hidden=!open; btn.setAttribute('aria-expanded',open); btn.classList.toggle('open',open); if(open) pop.querySelector('select,button.chip,input')?.focus({preventScroll:true}); };
  btn.onclick=()=>setOpen(pop.hidden);
  document.getElementById('filterClose').onclick=()=>{ setOpen(false); btn.focus(); };
  document.getElementById('filterClear').onclick=()=>{ clearFilters(); ctx.toast?.('Filters cleared'); };
  pop.addEventListener('change',()=>showFilings()); pop.addEventListener('click',e=>{ if(e.target.closest('.chip,button[data-k],button[data-v]')) showFilings(); });
  document.addEventListener('pointerdown',e=>{ if(!pop.hidden&&!wrap.contains(e.target)&&!e.target.closest('.kpi-pop')) setOpen(false); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!pop.hidden){ setOpen(false); btn.focus(); } });
  openFilters=()=>{ if(ctx.view!=='map') setView('map'); setOpen(true); }; }
// apply a whole filter spec (URL, saved search, AI answer)
function fromSpec(spec,{fly=true}={}){
  state.counties=new Set(spec.c&&spec.c.length?spec.c.filter(c=>COUNTIES.includes(c)):COUNTIES); if(!state.counties.size) state.counties=new Set(COUNTIES);
  state.types=new Set(spec.t&&spec.t.length?spec.t:TYPES);
  state.uses=spec.u&&spec.u.length?new Set(spec.u):null; state.min=spec.min||0; state.max=spec.max||0; state.q=spec.q||'';
  state.who=spec.who||null; state.d=spec.d||null; state.chg=spec.chg||null;
  state.st=spec.st&&spec.st.length?new Set(spec.st):null; state.sqmin=spec.sqmin||0; state.sqmax=spec.sqmax||0; state.co=spec.co||''; state.exact=spec.exact?1:0; state.umin=spec.umin||0;
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
  if(visible.length>state.shown){ const m=document.createElement('button'); m.className='more'; m.textContent='Show '+Math.min(150,visible.length-state.shown)+' More'; m.onclick=()=>{state.shown+=150; renderList();}; listEl.appendChild(m); }
}

// ---------- detail card ----------
const card=document.getElementById('card'), panel=document.getElementById('panel');
// section chips under a card's title: one per section that has content (sections other modules add later appear as they
// arrive); a chip scrolls the card to its section
function cardNav(items){ return '<nav class="bnav" aria-label="Card sections">'+items.map(([id,l])=>'<button type="button" data-sec="'+id+'" hidden>'+esc(l)+'</button>').join('')+'</nav>'; }
let navT=0;
function syncNav(){ card.querySelectorAll('.bnav [data-sec]').forEach(b=>{ const el=card.querySelector('#'+b.dataset.sec); b.hidden=!(el&&!el.hidden&&el.innerHTML.trim()); }); }
new MutationObserver(()=>{ cancelAnimationFrame(navT); navT=requestAnimationFrame(syncNav); }).observe(card,{childList:true,subtree:true});
card.addEventListener('click',e=>{ const b=e.target.closest('.bnav [data-sec]'); if(!b) return; const el=card.querySelector('#'+b.dataset.sec); if(!el) return;
  card.querySelectorAll('.bnav [data-sec]').forEach(x=>x.setAttribute('aria-current',x===b));
  card.scrollTo({top:el.offsetTop-(card.querySelector('.top')?.offsetHeight||0)-10,behavior:reduceMotion?'auto':'smooth'}); });
function select(f,fly){
  showFilings();
  cardCloseHooks.forEach(fn=>fn());
  state.sel=f; syncHighlight(); [...listEl.querySelectorAll('.item')].forEach((b,i)=>b.classList.toggle('on',visible[i]===f));
  const fld=(k,v,w)=>'<div class="f'+(w?' w':'')+'"><div class="fl">'+k+'</div><div class="fv">'+v+'</div></div>';
  const people=[['Owner',esc(f.owner||'—')],f.dev&&f.dev.toLowerCase()!==String(f.owner).toLowerCase()?['Developer',whoLink('dev',f.dev||f.owner,f.dev)]:null,f.arch?['Architect',whoLink('arch',f.arch,f.arch)]:null,f.gc?['General contractor',whoLink('gc',f.gc,f.gc)]:null].filter(Boolean);
  const gsv='https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+f.lat.toFixed(6)+','+f.lon.toFixed(6);
  card.innerHTML='<div class="top"><div><div class="kicker">'+esc(f.county)+' County · '+esc(TYPE_LABEL[f.type])+'</div><h2>'+esc(f.name)+'</h2>'+(f.addr?'<div class="bsub">'+esc(f.addr)+'</div>':'')+'</div>'+
    '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>'+
    cardNav([['fProj','Project'],['fSched','Schedule'],['fPeople','People'],['fScope','Scope'],['airSec','Air'],['briefBox','AI Brief'],['liveSec','From Here'],['fTools','Tools']])+'</div>'+
    (f.sum?'<div class="bover"><div class="kicker">Overview</div><div>'+esc(f.sum)+'</div></div>':'')+
    (f.approx?'<div class="note">Location is approximate: the address didn’t geocode, so this marker sits at the city center (shaded circle), not on the site.</div>':'')+
    (f.prec==='street'?'<div class="note">Placed on '+esc((f.addr||'the street').replace(/^\s*0*\s*\d*[a-z]?(?:-\w+)?\s+/i,'').split(',')[0])+(f.zip?' in '+esc(f.zip):'')+', not at the exact site: '+(/^\s*0*[1-9]/.test(f.addr||'')?'no map service has this house number yet (often a new subdivision or a new address)':'the filing gives no house number')+'.</div>':f.prec==='intersection'?'<div class="note">Placed at the intersection named in the filing.</div>':'')+
    (!visible.includes(f)?'<div class="note">Your current filters'+(sel.feature?' and selection (“'+esc(sel.label)+'”)':'')+' hide this filing, so it’s shown on its own. <button class="lnk" id="showAll">Clear Filters</button></div>':'')+
    (f.misfiled?'<div class="note">The filer tagged this to '+esc(f.county)+' County, but the address is outside it.</div>':'')+
    '<div class="bsec" id="fProj"><div class="lt">Project</div><div class="fgrid">'+
      fld('Est. value','<span class="mono">'+fmtM(f.cost)+'</span>')+fld('Area',f.sqft?'<span class="mono">'+fmtN(f.sqft)+' sq ft</span>':'<span class="fv dim">Not given</span>')+
      (f.use?fld('Use',esc(f.use)+(f.sub?' · '+esc(f.sub):'')):'')+(f.units?fld('Units',fmtN(f.units)):'')+(f.ten?fld('Tenant',esc(f.ten)):'')+
      (sel.kind==='radius'&&f._d!=null?fld('Distance',fmtMi(f._d)+' from center'):'')+fld('Address',esc(f.addr||'—'),true)+
    '</div><div class="ssrc src">TDLR TABS registration. Costs are filer estimates.</div></div>'+
    '<div class="bsec" id="fSched"><div class="lt">Schedule</div><dl>'+
      '<dt>Registered</dt><dd class="mono">'+esc(f.reg)+'</dd>'+
      '<dt>Start</dt><dd class="mono">'+esc(f.ts)+(f.tsE?'<sup title="Estimated by us: the filer gave no start date">est</sup>':'')+'</dd>'+
      '<dt>Finish</dt><dd class="mono">'+esc(f.te)+(f.teE?'<sup title="Estimated by us from project type and value">est</sup>':'')+'</dd>'+
      '<dt>Status</dt><dd>'+esc(f.status||'—')+'</dd><dt>TABS #</dt><dd class="mono">'+esc(f.id)+'</dd></dl>'+
      ((f.tsE||f.teE)?'<div class="ssrc src">“est” dates are our estimates from the project type and value.</div>':'')+historyHtml(f)+'</div>'+
    '<div class="bsec" id="fPeople"><div class="lt">People</div><dl>'+people.map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl><div class="ssrc src">Developer, architect and GC are AI-extracted from the filing text and can be wrong.</div></div>'+
    (f.scope?'<div class="bsec" id="fScope"><div class="lt">Scope of Work</div><div class="scope">'+esc(f.scope)+'</div></div>':'')+
    '<div class="bsec brief-sec" id="briefBox"><div class="lt">AI Project Brief</div><button class="btn" id="briefBtn">Write a Brief</button><div class="rnote">From the filing, nearby activity and census data.</div></div>'+
    '<div class="bsec" id="fTools"><div class="lt">Tools</div><div class="bacts">'+
      '<a class="btn" href="'+tabsUrl(f.id)+'" target="_blank" rel="noopener">TABS Record ↗</a><a class="btn" href="'+gsv+'" target="_blank" rel="noopener">Street View ↗</a>'+
      '<button class="btn" type="button" id="fNote">Add Site Note</button><button class="btn askai" type="button" id="fAsk">Ask AI About It</button></div></div>';
  card.querySelector('.x').onclick=closeCard; card.classList.add('open');
  card.querySelectorAll('[data-who]').forEach(a=>a.onclick=e=>{ e.preventDefault(); const [k,v]=a.dataset.who.split('|'); state.who={k,v,label:a.textContent}; applyFilters(); setView('map'); });
  card.querySelector('#briefBtn').onclick=()=>loadBrief(f);
  card.querySelector('#fNote').onclick=()=>ctx.addNote?.({at:[f.lon,f.lat]});
  card.querySelector('#fAsk').onclick=()=>ctx.assistant?.ask('Tell me more about '+f.name);
  card.querySelector('#showAll')?.addEventListener('click',()=>{ clearHighlight(); if(state.month) setMonth(null); fromSpec(DEFAULT_SPEC(),{fly:false}); select(f,false); });
  scheduleHash(); cardRenderHooks.forEach(fn=>fn({kind:'filing',f}));
  if(fly){ const z=f.approx?Math.min(Math.max(map.getZoom(),12.5),13.5):Math.max(map.getZoom(),16); map.flyTo({center:[f.lon,f.lat],zoom:z,offset:window.innerWidth<=700?[0,-Math.round(window.innerHeight*.22)]:window.innerWidth<=1100?[-200,0]:[-140,0],duration:reduceMotion?0:900});  }
}
function whoLink(k,raw,label){ const v=entityKey(raw); return v?'<a href="#" data-who="'+k+'|'+esc(v)+'">'+esc(label)+'</a>':esc(label); }
function historyHtml(f){
  const rows=DATA.changes.runs.flatMap(r=>r.items.filter(x=>x.id===f.id).map(x=>[r.built.slice(0,10),x])); if(!rows.length) return '';
  const fv=(k,v)=>v==null||v===''?'—':k==='cost'?fmtM(v):k==='sqft'?fmtN(v):String(v);
  return '<div class="fhist"><div class="fl">History</div>'+rows.map(([d,x])=>'<div><span class="m">'+esc(d)+'</span> '+(x.k==='new'?'First seen':esc(x.label)+': '+esc(fv(x.k,x.from))+' → '+esc(fv(x.k,x.to)))+'</div>').join('')+'</div>'; }
async function loadBrief(f){
  const box=card.querySelector('#briefBox'); if(!box) return; box.innerHTML='<div class="lt">AI Project Brief</div><div class="rnote">Writing a brief from the filing, nearby activity and census data…</div>';
  try{ const r=await fetch('api/brief?id='+encodeURIComponent(f.id)); const d=await r.json().catch(()=>({}));
    if(state.sel!==f) return; if(!r.ok) throw new Error(d.error||('Error '+r.status));
    box.innerHTML='<div class="lt">AI Project Brief</div><div class="btext">'+richText(d.brief)+'</div><div class="ssrc src">AI-written from the data on this page. Verify before relying on it.</div>'; wireCites(box); }
  catch(e){ if(state.sel===f) box.innerHTML='<div class="lt">AI Project Brief</div><div class="rnote">'+esc(e.message)+'</div><button class="btn" id="briefBtn">Try Again</button>', box.querySelector('#briefBtn').onclick=()=>loadBrief(f); }
}
// AI text -> safe HTML: escaped, paragraphs, [TABS…] citations become buttons that select the filing
function richText(t){ return textBlocks(esc(plainText(t||''))).replace(/\[(TABS[0-9A-Za-z-]+)\]/g,(m,id)=>BY_ID.has(id)?'<button class="cite" data-id="'+id+'">'+id+'</button>':id); }
function wireCites(el){ el.querySelectorAll('.cite').forEach(b=>b.onclick=()=>{ const f=BY_ID.get(b.dataset.id); if(f){ setView('map'); select(f,true); } }); }
const cardCloseHooks=[];
function clearSel(){ state.sel=null; syncHighlight(); [...listEl.querySelectorAll('.item')].forEach(b=>b.classList.remove('on')); }
function closeCard(){ cardCloseHooks.forEach(fn=>fn()); card.classList.remove('open'); state.sel=null; scheduleHash(); syncHighlight(); [...listEl.querySelectorAll('.item')].forEach(b=>b.classList.remove('on')); }
function syncHighlight(){ if(map.getLayer&&map.getLayer('filings-hl')) map.setFilter('filings-hl',['==',['get','i'],state.sel?IDX.get(state.sel):-1]);
  const f=state.sel; map.getSource&&map.getSource('focus')?.setData(fc(f?[{type:'Feature',properties:{t:f.type,approx:f.approx?1:0,name:f.name.length>40?f.name.slice(0,38)+'…':f.name+(f.approx?' (approx.)':'')},geometry:{type:'Point',coordinates:[f.lon,f.lat]}}]:[])); }
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
map.on('click',e=>{ if(mode!=='pan' || e.defaultPrevented || swallowClick) return; if(map.queryRenderedFeatures(e.point,{layers:['filings']}).length) return; if(!ctx.mapClickHandlers.some(h=>h(e))) closeCard(); });

// ---------- place menu: right-click (desktop) or long-press (touch) anywhere on the map ----------
const pmenu=document.createElement('div'); pmenu.className='pmenu'; pmenu.setAttribute('role','menu'); viewport.appendChild(pmenu);
function placeMenu(pt,ll){
  const c=[+ll.lng.toFixed(6),+ll.lat.toFixed(6)];
  pmenu.innerHTML='<div class="pm-h">'+c[1].toFixed(5)+', '+c[0].toFixed(5)+'</div>'+
    '<button data-a="note" role="menuitem">Add Site Note Here</button><button data-a="radius" role="menuitem">Filings Within 1 Mile</button>'+
    '<button data-a="ask" role="menuitem">Ask AI About This Spot</button><a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+c[1]+','+c[0]+'" target="_blank" rel="noopener" role="menuitem">Street View ↗</a>';
  const w=220, x=Math.min(pt.x, viewport.clientWidth-w-8), y=Math.min(pt.y, viewport.clientHeight-190);
  pmenu.style.left=Math.max(8,x)+'px'; pmenu.style.top=Math.max(8,y)+'px'; pmenu.classList.add('on');
  pmenu.querySelector('[data-a=note]').onclick=()=>{ hideMenu(); ctx.addNote?.({at:c}); };
  pmenu.querySelector('[data-a=radius]').onclick=()=>{ hideMenu(); setMiles(1,false,true); setRadiusCenter(c,'Pin ('+c[1].toFixed(4)+', '+c[0].toFixed(4)+')',true); };
  pmenu.querySelector('[data-a=ask]').onclick=()=>{ hideMenu(); ctx.assistant?.ask('What is being built within 1 mile of '+c[1].toFixed(5)+', '+c[0].toFixed(5)+'? Show it on the map.'); };
  pmenu.querySelector('a').onclick=hideMenu;
}
const hideMenu=()=>pmenu.classList.remove('on');
map.on('contextmenu',e=>{ e.preventDefault(); if(mode==='pan') placeMenu(e.point,e.lngLat); });
{ let lp=0,start=null; // long-press on touch screens
  map.on('touchstart',e=>{ clearTimeout(lp); if(e.points.length!==1||mode!=='pan') return; start=e.point; lp=setTimeout(()=>{ placeMenu(e.point,e.lngLat); swallowClick=true; },550); });
  map.on('touchmove',e=>{ if(start&&Math.hypot(e.point.x-start.x,e.point.y-start.y)>10) clearTimeout(lp); });
  map.on('touchend',()=>clearTimeout(lp)); }
document.addEventListener('pointerdown',e=>{ if(pmenu.classList.contains('on')&&!pmenu.contains(e.target)) hideMenu(); });
map.on('movestart',hideMenu);

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
function fitGeom(g){ const b=d3.geoBounds({type:'Feature',geometry:g}); safeFit([[b[0][0],b[0][1]],[b[1][0],b[1][1]]],{padding:80}); }

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
// search box: region-biased autocomplete. The assistant passes {exact:true}: whole-Texas, no autocomplete, own request;
// {world:true}: anywhere on Earth, biased to the map center (the assistant, for places outside Texas)
async function geocode(q,o={}){
  let ctl; if(!o.exact&&!o.world){ if(geoCtl) geoCtl.abort(); ctl=geoCtl=new AbortController(); }
  const c=map.getCenter(), prox=o.exact||o.world?c.lng.toFixed(4)+','+c.lat.toFixed(4):'-95.9,30.0', bbox=o.exact?'-106.7,25.8,-93.5,36.5':'-97.6,28.6,-94.2,31.4';
  const u='https://api.maptiler.com/geocoding/'+encodeURIComponent(q)+'.json?key='+MAPTILER_KEY+'&limit='+(o.limit||6)+'&proximity='+prox+'&autocomplete='+!(o.exact||o.world)+(o.world?'':'&country=us&bbox='+bbox);
  const c2=ctl||new AbortController(), tm=setTimeout(()=>c2.abort(),8000); // a geocoder that hangs must not hang the assistant
  try{ const r=await fetch(u,{signal:c2.signal}); if(!r.ok) return []; const d=await r.json(); clearTimeout(tm);
    return (d.features||[]).map(f=>({t:(f.place_name||f.text||'').replace(/, United States$/,''),name:f.text||'',type:(f.place_type&&f.place_type[0])||'place',k:(f.place_type&&f.place_type[0]==='address')?'Address':((f.place_type&&f.place_type[0])||'Place').replace(/^\w/,c=>c.toUpperCase()),c:f.center,bbox:f.bbox})); }
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
  clearTimeout(gT); if(q.length<3||sugs[0]?.k==='Coordinates') return; // only "lat, long" skips the lookup: "1004 Priya Ln" starts with a digit too
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
document.querySelectorAll('#sizeSeg button').forEach(b=>b.onclick=()=>{ layers.size=b.dataset.size; saveLayers(); styleFilings(); });
document.querySelectorAll('#heatSeg button').forEach(b=>b.onclick=()=>{ layers.heat=b.dataset.heat; saveLayers(); styleFilings(); });
document.getElementById('lyFilings').onchange=e=>{ layers.dots=e.target.checked; saveLayers(); styleFilings(); };
syncLegend();
function showFilings(){ if(layers.dots) return; layers.dots=true; saveLayers(); if(map.getLayer('filings')) styleFilings(); }
function setMapOptions(a){ const done=[];
  if(a.heatmap){ layers.heat=a.heatmap; done.push(a.heatmap==='off'?'heatmap off':'heatmap by '+(a.heatmap==='value'?'value':'count')); }
  if(typeof a.size_by_value==='boolean'){ layers.size=a.size_by_value?'value':'uniform'; done.push(a.size_by_value?'dots sized by value':'uniform dots'); }
  if(typeof a.show_filings==='boolean'){ layers.dots=a.show_filings; done.push(a.show_filings?'filings shown':'filings hidden'); }
  if(a.heatmap||typeof a.size_by_value==='boolean'||typeof a.show_filings==='boolean'){ saveLayers(); styleFilings(); }
  if(a.basemap&&a.basemap in STYLES){ setBasemap(a.basemap); done.push(a.basemap+' basemap'); }
  if(typeof a.tilt==='boolean'){ document.getElementById('ly3d').checked=a.tilt; set3d(a.tilt); done.push(a.tilt?'tilted 3D':'flat'); }
  if(a.demographics){ const s=document.getElementById('lyDemo'); s.value=a.demographics==='off'?'':a.demographics; s.dispatchEvent(new Event('change')); done.push(a.demographics==='off'?'demographics off':'demographics: '+(s.selectedOptions[0]?.textContent||a.demographics)); }
  return done.length?done:['no change']; }
document.getElementById('lyRoads').onchange=e=>{ layers.roads=e.target.checked; applyRoadToggles(); };
document.getElementById('lyNames').onchange=e=>{ layers.names=e.target.checked; applyRoadToggles(); };
document.getElementById('lyCounties').onchange=e=>{ layers.counties=e.target.checked; ['county-line','county-label'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',layers.counties?'visible':'none')); };
// ---------- camera: 3D toggle, flat reset, globe guard ----------
let orbitRaf=0;
function stopOrbit(){ cancelAnimationFrame(orbitRaf); orbitRaf=0; }
const orbitStops=[stopOrbit]; // building.js adds its own spin
function stopAllOrbits(){ orbitStops.forEach(fn=>fn()); }
// Off = flat and north up. On = tilted (not at globe zoom, where a tilt only pushes the globe off-centre).
function set3d(on){ stopAllOrbits(); map.easeTo(on?{pitch:Math.max(map.getPitch(),55),duration:reduceMotion?0:600}:{pitch:0,bearing:0,roll:0,duration:reduceMotion?0:600}); }
// back to a flat, north-up map of the same spot. At globe zoom the spot itself may be a pole or off the edge, so re-centre on Texas then.
function flatView(){ stopAllOrbits(); const z=map.getZoom(), c=map.getCenter(), far=z<4&&(Math.abs(c.lat)>60||!isFinite(c.lat));
  map.easeTo({center:far?[-93,26]:c,zoom:isFinite(z)?z:HOME.zoom,pitch:0,bearing:0,roll:0,duration:reduceMotion?0:700}); }
const ly3d=document.getElementById('ly3d'), flatBtn=document.getElementById('flat'), needle=flatBtn.querySelector('.needle');
ly3d.onchange=e=>set3d(e.target.checked);
let camRaf=0;
// tilting the map by hand (right-drag, ctrl-drag, two fingers) switches 3D on; flattening it switches it off. The reset button lights up and its needle points north.
map.on('move',()=>{ if(camRaf) return; camRaf=requestAnimationFrame(()=>{ camRaf=0; const p=map.getPitch(), b=map.getBearing();
  ly3d.checked=p>1; needle.style.transform='rotate('+(-b)+'deg)'; flatBtn.classList.toggle('on',p>1||Math.abs(b)>.5); }); });
// zoomed out to the globe while tilted or rotated: the globe slides off-centre or shows upside down. Straighten it once the gesture ends.
map.on('moveend',()=>{ if(map.isEasing()||orbitRaf||map.getZoom()>=4) return; if(map.getPitch()>.5||Math.abs(map.getBearing())>.5) map.easeTo({pitch:0,bearing:0,roll:0,duration:reduceMotion?0:600}); });
flatBtn.onclick=flatView;
document.getElementById('zin').onclick=()=>map.zoomIn(); document.getElementById('zout').onclick=()=>map.zoomOut();
document.getElementById('home').onclick=()=>{ stopAllOrbits(); map.flyTo({...HOME,pitch:0,bearing:0,roll:0,duration:reduceMotion?0:1200}); };
document.getElementById('orbit').onclick=()=>{ stopAllOrbits(); map.flyTo({center:[-93,26],zoom:2.2,pitch:0,bearing:0,roll:0,duration:reduceMotion?0:1600}); };

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
// every file the app saves passes through here; the Reports tab records exports (onSave)
const saveHooks=[];
async function saveFile(filename,data,mime){
  saveHooks.forEach(fn=>{ try{ fn(filename,data,mime); }catch(e){ console.error(e); } });
  if(downloads){ try{ await downloads.save({filename,data}); toast('Saved '+filename);}catch(err){ if(!err||err.code!=='declined') toast('Couldn’t save the file here.'); } return; }
  const blob=data instanceof Blob?data:new Blob([data],{type:mime}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},3000); toast('Saved '+filename);
}
const rowsFor=list=>list.map(f=>({'TABS #':f.id,'Project':f.name,'County':f.county,'City':f.city,'Address':f.addr,'Type':TYPE_LABEL[f.type],
  'Use':f.use||'','Subtype':f.sub||'','Tenant':f.ten||'','Units':f.units??'',
  'Est. value (USD)':+(+f.cost).toFixed(2),'Sq ft':f.sqft||'','Owner':f.owner,'Developer':f.dev||'','Architect':f.arch||'','GC':f.gc||'','Registered':f.reg,'Status':f.status,'Est. start':f.start,'Est. end':f.end,
  'Timeline start':f.ts,'Timeline end':f.te,'Timeline dates':f.tsE||f.teE?'Partly estimated':'As filed','Change this week':f._chg||'','AI summary':f.sum||'','Scope':f.scope,
  ...(sel.kind==='radius'?{'Distance (mi)':Math.round(f._d*100)/100}:{}),'Location':f.approx?'Approximate (city)':f.prec==='street'?'Street (house not found)':f.prec==='intersection'?'Intersection':'Address','Latitude':f.lat,'Longitude':f.lon,'TABS link':tabsUrl(f.id)}));
const csvText=rows=>{ if(!rows.length) return ''; const cols=Object.keys(rows[0]), q=v=>{ const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  return '\ufeff'+[cols.join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\r\n'); };
const fileBase=(kind,label)=>'fs-'+kind+'-'+slug(label||scopeLabel())+'-'+stamp;
function exportCsv(rows,name){ saveFile(name+'.csv',csvText(rows),'text/csv'); }
// Excel: one or more sheets [{name, rows|aoa, link}] (link: column holding a URL to hyperlink)
function exportXlsx(sheets,name){
  if(!window.XLSX){ toast('Excel export is still loading. Try again in a moment.'); return; }
  const wb=XLSX.utils.book_new();
  for(const sh of sheets){
    const ws=sh.aoa?XLSX.utils.aoa_to_sheet(sh.aoa):XLSX.utils.json_to_sheet(sh.rows);
    if(sh.rows&&sh.rows.length){ const cols=Object.keys(sh.rows[0]), li=cols.indexOf('TABS link'), pi=cols.indexOf('Project'), vi=cols.indexOf('Est. value (USD)');
      sh.rows.forEach((r,i)=>{ const L=li>=0&&XLSX.utils.encode_cell({r:i+1,c:li}),P=pi>=0&&XLSX.utils.encode_cell({r:i+1,c:pi}),V=vi>=0&&XLSX.utils.encode_cell({r:i+1,c:vi});
        if(L&&ws[L]) ws[L].l={Target:r['TABS link']}; if(P&&ws[P]&&r['TABS link']) ws[P].l={Target:r['TABS link']}; if(V&&ws[V]) ws[V].z='$#,##0.00'; });
      ws['!cols']=cols.map(c=>({wch:{'Project':42,'Address':38,'Owner':30,'Scope':60,'AI summary':50,'TABS link':48,'Name':36,'Metric':26}[c]||14})); ws['!autofilter']={ref:ws['!ref']}; }
    else if(sh.aoa) ws['!cols']=[{wch:30},{wch:18},{wch:18},{wch:18},{wch:18}];
    XLSX.utils.book_append_sheet(wb,ws,sh.name.slice(0,31));
  }
  saveFile(name+'.xlsx',new Uint8Array(XLSX.write(wb,{bookType:'xlsx',type:'array'})),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function summaryAoa(list,label){
  const sum=[['Construction filings — '+(label||scopeLabel())],['TDLR TABS registrations, '+PERIOD],['Generated',stamp],['Filters',filterText()||'None'],[],
    ['Filings',list.length],['Est. value (USD)',+list.reduce((s,f)=>s+f.cost,0).toFixed(2)],['New builds',list.filter(f=>f.type==='New').length],[],['County','Filings','Est. value (USD)','New builds']];
  COUNTIES.forEach(c=>{ const l=list.filter(f=>f.county===c); if(l.length) sum.push([c,l.length,+l.reduce((s,f)=>s+f.cost,0).toFixed(2),l.filter(f=>f.type==='New').length]); });
  sum.push([],['Type','Filings','Est. value (USD)']); TYPES.forEach(t=>{ const l=list.filter(f=>f.type===t); if(l.length) sum.push([TYPE_LABEL[t],l.length,+l.reduce((s,f)=>s+f.cost,0).toFixed(2)]); });
  return sum; }
function exportGeoJSON(list,name){ const rows=rowsFor(list);
  saveFile(name+'.geojson',JSON.stringify(fc(list.map((f,i)=>({type:'Feature',properties:rows[i],geometry:{type:'Point',coordinates:[f.lon,f.lat]}})))),'application/geo+json'); }
function exportHtml(list,name){ saveFile(name+'.html',buildReport(list),'text/html'); }
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
  '<button class="pb" onclick="window.print()">Print or Save as PDF</button><div class="wrap"><div class="hd"><div><div class="k">TDLR TABS · Construction filings report</div><h1>'+esc(scopeLabel())+'</h1><div class="meta">Registrations '+PERIOD+' · Generated '+today.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+(filterText()?' · '+esc(filterText()):'')+'</div></div><img src="'+logo+'" alt="Finishes Solutions"></div>'+
  '<div class="kp"><div><b>'+fmtN(list.length)+'</b><span>Filings</span></div><div><b>'+fmtM(total)+'</b><span>Est. value</span></div><div><b>'+fmtN(newb.length)+'</b><span>New builds · '+fmtM(newb.reduce((s,f)=>s+f.cost,0))+'</span></div><div><b>'+(sq?fmtN(sq):'–')+'</b><span>Sq ft as filed</span></div></div>'+
  '<div class="map">'+reportMap(list)+'</div><div class="lg"><span><i style="background:#006527"></i>New construction</span><span><i style="background:#6b7174"></i>Renovation</span><span><i style="border:1.5px solid #1f9249"></i>Addition / approx. location</span><span>Marker size = est. value</span></div>'+
  '<div class="two"><div><h2>By county</h2><table><thead><tr><th>County</th><th class="r">Filings</th><th class="r">Est. value</th><th class="r">Share</th><th class="r">New</th></tr></thead><tbody>'+byC.map(r=>'<tr><td>'+esc(r[0])+'</td><td class="m r">'+fmtN(r[1])+'</td><td class="m r">'+fmtM(r[2])+'</td><td class="m r">'+pct(r[2])+'</td><td class="m r">'+r[3]+'</td></tr>').join('')+'</tbody></table>'+
  '<h2>By type</h2><table><thead><tr><th>Type</th><th class="r">Filings</th><th class="r">Est. value</th><th class="r">Share</th></tr></thead><tbody>'+byT.map(r=>'<tr><td>'+esc(r[0])+'</td><td class="m r">'+fmtN(r[1])+'</td><td class="m r">'+fmtM(r[2])+'</td><td class="m r">'+pct(r[2])+'</td></tr>').join('')+'</tbody></table></div>'+
  '<div><h2>Largest filings</h2><table><thead><tr><th>Project</th><th>City</th><th class="r">Est. value</th></tr></thead><tbody>'+top.map(f=>'<tr><td><a href="'+tabsUrl(f.id)+'">'+esc(f.name)+'</a><div class="sc">'+esc(TYPE_LABEL[f.type])+(f.sqft?' · '+fmtN(f.sqft)+' sq ft':'')+'</div></td><td>'+esc(f.city||f.county)+'</td><td class="m r">'+fmtM(f.cost)+'</td></tr>').join('')+'</tbody></table></div></div>'+
  '<div class="full"><h2>All filings ('+fmtN(list.length)+')</h2><table><thead><tr><th>#</th><th>Registered</th><th>Project</th><th>Location</th><th>Type</th><th class="r">Est. value</th><th class="r">Sq ft</th><th>Owner</th><th>Status</th></tr></thead><tbody>'+rowsHtml+'</tbody></table></div>'+
  '<div class="ft">Source: Texas Department of Licensing and Regulation, TABS project registrations ('+PERIOD+'). Each project name links to its TABS record. Costs and dates are filer estimates. Locations come from the US Census and OpenStreetMap geocoders'+(approx?'; '+approx+' filing'+(approx>1?'s are':' is')+' placed at city level':'')+'. Prepared for Finishes Solutions.</div></div></body></html>';
}

// ---------- views ----------
let view='map'; const viewHooks={}, viewChangeHooks=[], cardRenderHooks=[];
function setView(v){
  if(!document.getElementById('view-'+v)&&v!=='map') v='map'; view=v;
  document.querySelectorAll('#viewbar button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v));
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('on',el.id==='view-'+v));
  stage.dataset.view=v; if(v==='map') setTimeout(()=>map.resize(),0); else viewHooks[v]?.();
  viewChangeHooks.forEach(fn=>fn(v));
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
const timeBtn=document.getElementById('timeBtn');
function showTime(on){ tsl.classList.toggle('show',on); timeBtn.setAttribute('aria-pressed',on); if(!on){ stopPlay(); if(state.month) setMonth(null); } }
timeBtn.onclick=()=>showTime(!tsl.classList.contains('show'));
function setMonth(m){ state.month=m; tsl.classList.toggle('on',!!m); if(m&&!tsl.classList.contains('show')){ tsl.classList.add('show'); timeBtn.setAttribute('aria-pressed',true); } tLabel.textContent=m?'Under construction · '+monthLabel(m):'Under construction by month'; if(m) tRange.value=MONTHS.indexOf(m); applyFilters(); }
let tT; tRange.oninput=()=>{ cancelAnimationFrame(tT); tT=requestAnimationFrame(()=>setMonth(MONTHS[+tRange.value])); };
document.getElementById('tClear').onclick=()=>showTime(false);
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
  onChange:fn=>listeners.push(fn), onCardClose:fn=>cardCloseHooks.push(fn), onViewChange:fn=>viewChangeHooks.push(fn), onCardRender:fn=>cardRenderHooks.push(fn), cardRendered:info=>cardRenderHooks.forEach(fn=>fn(info)), onSave:fn=>saveHooks.push(fn), mapClickHandlers:[], setRadiusCenter, setMiles, fitGeom, saveFile, card, panel, closeCard, clearSelection:clearSel, reduceMotion, onView:(v,fn)=>{ viewHooks[v]=fn; }, onOverlays:fn=>overlayHooks.push(fn), tip, viewport };
// close in: steeper tilt and a slower spin so one building stays framed and doesn't whip past.
// Each spin step is a jumpTo, which cancels any running easeTo/flyTo, so the spin gives way as soon as anything else moves the camera.
function orbitAt(c,zoom){ stopOrbit(); const close=zoom>=16.5; map.flyTo({center:c,zoom,pitch:close?65:60,duration:reduceMotion?0:2200,essential:true});
  map.once('moveend',()=>{ if(reduceMotion||map.isEasing()) return; const sp=close?.06:.1, step=()=>{ if(map.isEasing()){ stopOrbit(); return; } map.setBearing((map.getBearing()+sp)%360); orbitRaf=requestAnimationFrame(step); }; orbitRaf=requestAnimationFrame(step); }); }
['mousedown','touchstart','wheel'].forEach(ev=>map.on(ev,()=>orbitRaf&&stopOrbit()));
// What the user is looking at, in a few compact lines for the AI (chat and voice)
function nearestPlace(c){ let best=null,bd=1e9; for(const p of DATA.places||[]){ const d=(p[1]-c[0])**2*.75+(p[2]-c[1])**2; if(d<bd){bd=d;best=p;} } return best&&bd<.05?best[0]:null; }
// Outside the home region nearestPlace knows nothing, so name the spot with MapTiler's reverse geocoder (on moveend,
// debounced, cached by ~1 km cell): the assistant then knows "here" is e.g. Lyon, France.
let farLabel=null, farT=0; const farCache=new Map();
map.on('moveend',()=>{ clearTimeout(farT); farT=setTimeout(async()=>{ const c=map.getCenter();
  if(nearestPlace([c.lng,c.lat])){ farLabel=null; return; }
  const k=c.lng.toFixed(2)+','+c.lat.toFixed(2); if(farCache.has(k)){ farLabel=farCache.get(k); return; }
  try{ const r=await fetch('https://api.maptiler.com/geocoding/'+k+'.json?key='+MAPTILER_KEY+'&limit=1&types=place,municipality,locality,county,region,country'); const d=r.ok?await r.json():null;
    const f=d?.features?.[0]; farLabel=f?(f.place_name||f.text||'').replace(/, United States$/,''):null; farCache.set(k,farLabel); }catch(e){ farLabel=null; } },600); });
function screenContext(){
  const c=map.getCenter(), b=map.getBounds(), z=map.getZoom(), near=nearestPlace([c.lng,c.lat])||farLabel;
  const inView=visible.filter(f=>f.lon>=b.getWest()&&f.lon<=b.getEast()&&f.lat>=b.getSouth()&&f.lat<=b.getNorth());
  const top=inView.slice().sort((a,b)=>b.cost-a.cost).slice(0,8).map(f=>f.id+' '+f.name.slice(0,60)+' ('+(f.use||TYPE_LABEL[f.type])+', est. '+fmtM(f.cost)+', '+(f.city||f.county)+')');
  const lines=['View: '+(view==='map'?'map':view+' tab')+'; map centered '+c.lat.toFixed(4)+', '+c.lng.toFixed(4)+(near?' (near '+near+')':'')+', zoom '+z.toFixed(1)+(z>=14?' (street level, 3D buildings visible)':z>=11?' (neighborhood)':z>=8?' (city/county)':' (region)')+(map.getPitch()>20?', tilted 3D':'')+(orbitRaf?', orbiting':''),
    'Visible area: W '+b.getWest().toFixed(3)+' S '+b.getSouth().toFixed(3)+' E '+b.getEast().toFixed(3)+' N '+b.getNorth().toFixed(3),
    'Filings on screen: '+fmtN(inView.length)+' of '+fmtN(visible.length)+' matching, est. '+fmtM(inView.reduce((s,f)=>s+f.cost,0))+(top.length?'. Largest in view: '+top.join('; '):''),
    'Map display: '+(layers.dots?'filing dots on':'filing dots hidden')+', heatmap '+layers.heat+', basemap '+layers.style];
  if(state.sel){ const f=state.sel; lines.push('Open card: filing '+f.id+' "'+f.name+'", '+(f.addr||f.city)+', '+TYPE_LABEL[f.type]+(f.use?', '+f.use:'')+', est. '+fmtM(f.cost)+', registered '+f.reg+', schedule '+f.ts+' to '+f.te+', status '+(f.status||'?')+(f.dev?', developer '+f.dev:'')); }
  else if(ctx.currentBuilding?.()) { const bd=ctx.currentBuilding(); lines.push('Open card: building at '+bd.center[1].toFixed(5)+', '+bd.center[0].toFixed(5)+(bd.title?' ('+bd.title+')':'')+(bd.height?', about '+Math.round(bd.height*3.28)+' ft tall':'')); }
  if(hlIds.length) lines.push('Highlighted on the map: '+hlIds.slice(0,12).join(', '));
  if(sel.feature) lines.push('Selected area: '+sel.label);
  const lv=ctx.live?.state?.(), on=lv?Object.keys(lv).filter(k=>lv[k]):[]; if(on.length) lines.push('Live layers on: '+on.join(', '));
  const ps=ctx.placeSummary?.(); if(ps?.place) lines.push('Outlined on the map: '+ps.place+(ps.kind?' ('+ps.kind+')':''));
  const bs=ctx.buildingStats?.(); if(bs&&bs.length>1) lines.push('Buildings selected: '+bs.length);
  const nv=(ctx.field?.db?.notes||[]).filter(n=>n.lng>=b.getWest()&&n.lng<=b.getEast()&&n.lat>=b.getSouth()&&n.lat<=b.getNorth()); if(nv.length) lines.push('Team site notes in view: '+nv.length+' ('+nv.slice(0,5).map(n=>n.title||'untitled').join('; ')+')');
  return lines.join('\n');
}
// names the basemap draws around the map center (streets, places, businesses) and the building under it, for describe_view
function viewLabels(radius=140){
  const p=map.project(map.getCenter()), box=[[p.x-radius,p.y-radius],[p.x+radius,p.y+radius]], out={streets:[],places:[],businesses:[],water:[]}, seen=new Set();
  let feats=[]; try{ feats=map.queryRenderedFeatures(box); }catch(e){}
  for(const f of feats){
    const pr=f.properties||{}, name=pr.name_en||pr['name:en']||pr.name||pr['name:latin']; if(!name||f.layer?.type!=='symbol') continue;
    const sl=f.sourceLayer||f.layer?.['source-layer']||'', k=sl+'|'+name; if(seen.has(k)) continue; seen.add(k);
    const bucket=/transportation/.test(sl)?'streets':/place/.test(sl)?'places':/poi/.test(sl)?'businesses':/water/.test(sl)?'water':null;
    if(bucket&&out[bucket].length<10) out[bucket].push(bucket==='businesses'&&pr.class?name+' ('+String(pr.subclass||pr.class).replace(/_/g,' ')+')':name);
  }
  let bld=null; try{ const h=map.getLayer('fs-bldg')&&map.queryRenderedFeatures(p,{layers:['fs-bldg']})[0]; if(h){ const hm=h.properties.render_height??h.properties.height; bld={height_ft:hm?Math.round(hm*3.281):null,name:h.properties.name||null}; } }catch(e){}
  return { ...out, building_at_center:bld, zoom:+map.getZoom().toFixed(1), note:map.getZoom()<13?'Zoomed out: street and building names appear from about zoom 14.':undefined };
}
function vocab(){ const n=new Map(); visible.forEach(f=>{ if(f.city) n.set(f.city,(n.get(f.city)||0)+1); if(f.dev) n.set(f.dev,(n.get(f.dev)||0)+1); });
  return [...n.entries()].sort((a,b)=>b[1]-a[1]).slice(0,30).map(x=>x[0]).join(', '); } // the busiest cities and developers on screen (the voice transcriber's hint list takes the first few)
ctx.setMode=setMode; ctx.openFilters=()=>openFilters();
// map legends (bottom left, next to the Filings one): any layer that colours its data adds one while it's on
ctx.setLegend=(id,html)=>{ const box=document.querySelector('.legends'); if(!box) return; let el=box.querySelector('[data-lg="'+id+'"]');
  if(!html){ el?.remove(); return; } if(!el){ el=document.createElement('div'); el.className='xlegend'; el.dataset.lg=id; box.appendChild(el); } if(el.innerHTML!==html) el.innerHTML=html; };
Object.assign(ctx,{ viewLabels, nearestPlace, viewPlace:()=>{ const c=map.getCenter(); return nearestPlace([c.lng,c.lat])||farLabel; }, basemap:()=>layers.style, mode:()=>mode, screenContext, vocab, orbitAt, stopOrbit, onOrbitStop:fn=>orbitStops.push(fn), flatView, periodSpec, matchWith:o=>{ const m=makeMatcher({...curSpec(false),...o},{changed:CHANGED}); return F.filter(f=>m(f)&&inSel(f)&&monthOK(f)); }, highlight, clearHighlight, highlighted, showFilings, cardNav, fitToVisible:()=>fitPoints(visible), setMapOptions, mapPadding,
  snapshot:()=>({spec:curSpec(),month:state.month}), restore:s=>{ fromSpec(s.spec,{fly:false}); setMonth(s.month||null); fitPoints(visible); },
  resetAll:()=>{ closeCard(); clearHighlight(); ctx.live?.clearRoute(); ctx.clearNearby?.(); ctx.clearPlace?.(); if(state.month) setMonth(null); fromSpec(DEFAULT_SPEC()); map.flyTo({...HOME,duration:reduceMotion?0:1000}); },
  filtered:()=>{ const m=makeMatcher(curSpec(false),{changed:CHANGED}); return F.filter(f=>m(f)&&monthOK(f)); },
  setSelection, clearAreaSelection:clearSelection, fixWinding, fc, countyGeo, HOME_C, PERIOD, stamp, scopeLabel, fileBase, rowsFor, summaryAoa, reportMap, buildReport,
  exportCsv, exportXlsx, exportGeoJSON, exportHtml, entityKey, get layersState(){ return layers; },
  coverage:()=>fmtN(F.length)+' filings in '+COUNTIES.join(', ')+' counties, registered '+DATA.period.start+' to '+DATA.period.end+'. Uses tagged: '+(F.some(f=>f.use)?'yes':'not yet (AI tagging pending), so use filters other than use') });
for (const init of [initAreaReports,initTimeline,initWho,initChanges,initKpis,initCompare,initMapSearch,initExport,initReports,initChatCards,initNearby,initAssistant,initMarket,initSaved,initField,initTeam,initBuildings,initMobile,initLive,initPlanes,initArea,initRegrid,initSite,initCrime,initFema,initDriveTime,initTraffic,initAirports,initSources,initGlance]) { try{ init(ctx); }catch(e){ console.error('module failed',init.name,e); } }

// ---------- map buttons next to an open card ----------
// Desktop: when there is room under the map buttons (420 px or more), the card is capped to that space and scrolls,
// so the buttons stay in their column at the edge. Otherwise (short windows) the buttons step left of the card.
{ const ctrlsEl=document.querySelector('.ctrls'), layersEl=document.getElementById('layers'), appEl=document.querySelector('.app'), stageEl=document.querySelector('.stage');
  let raf=0;
  const sync=()=>{ raf=0;
    const open=card.classList.contains('open')&&innerWidth>1100&&!layersEl.classList.contains('on');
    const avail=open?Math.floor(stageEl.getBoundingClientRect().bottom-16-(ctrlsEl.getBoundingClientRect().bottom+12)):0;
    const on=open&&avail>=420; appEl.classList.toggle('card-below',on);
    if(on) appEl.style.setProperty('--card-max',avail+'px'); else appEl.style.removeProperty('--card-max'); };
  const soon=()=>{ if(!raf) raf=requestAnimationFrame(sync); };
  new MutationObserver(soon).observe(card,{attributes:true,attributeFilter:['class']});
  new MutationObserver(soon).observe(layersEl,{attributes:true,attributeFilter:['class']});
  new ResizeObserver(soon).observe(stageEl); addEventListener('resize',soon); }

// ---------- boot ----------
{ const s=new Date(DATA.period.start+'T12:00:00'), e=new Date(DATA.period.end+'T12:00:00'); const m=d=>d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  document.getElementById('filingsPeriod').textContent='TDLR · '+m(s)+' – '+m(e);
  document.getElementById('periodTxt').textContent=PERIOD; const miss=DATA.unmapped||0; document.getElementById('missTxt').textContent=miss>0?fmtN(miss)+' filing'+(miss>1?'s':'')+' with no mappable address '+(miss>1?'are':'is')+' left off the map. ':''; }
{ const h=location.hash.slice(1), p=new URLSearchParams(h);
  if(h&&[...p.keys()].some(k=>k!=='v'&&k!=='f')){ showFilings(); fromSpec(decode(h),{fly:false}); if(p.get('m')&&MONTHS.includes(p.get('m'))) setMonth(p.get('m')); } else fromSpec(DEFAULT_SPEC(),{fly:false});
  booting=false;
  if(p.get('v')) setView(p.get('v'));
  const f=p.get('f')&&BY_ID.get(p.get('f')); if(f) map.once('load',()=>select(f,true));
  scheduleHash();
  map.once('load',()=>{ if(f) return; if(sel.feature) fitGeom(sel.feature); else if(!reduceMotion) setTimeout(()=>map.flyTo({...HOME,duration:2600,essential:true}),300); else map.jumpTo(HOME); });
}

// installable app + offline shell (served over https only)
// The offline cache serves the app files it has, so a new release used to show only after a second reload. When a new
// version takes over: reload right away if the page only just opened, otherwise say so (never reload mid-task).
if('serviceWorker' in navigator && location.protocol==='https:'){
  const hadSW=!!navigator.serviceWorker.controller, t0=Date.now(); let swDone=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!hadSW||swDone) return; swDone=true;
    if(Date.now()-t0<15000) location.reload(); else toast('A new version of the app is ready. Reload the page to use it.'); });
  navigator.serviceWorker.register('sw.js').then(r=>r.update?.()).catch(()=>{});
}
