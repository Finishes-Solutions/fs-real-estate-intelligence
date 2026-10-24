
import { DEFAULT_TAB } from './lib/project.mjs';
import './cursors.js';
import { makeMatcher, encode, decode, describe } from './lib/filter.mjs';
import { camStr as camFmt, parseCam, parseLatLng, parsePlanRef, startHash, showsFilings, hasSpec } from './lib/urlstate.mjs';
import { USES, entityKey } from './lib/taxonomy.mjs';
import { recentChanges } from './lib/changes.mjs';
import { dockSide } from './lib/planview.mjs';
import { aiErrorMessage, spotQuestion } from './lib/assist-logic.mjs';
import { initTimeline } from './timeline.js';
import { initWho, initChanges } from './views.js';
import { initAssistant } from './assistant.js';
import { initMarket } from './market.js';
import { initMarkets } from './markets.js';
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
import { initUtilities } from './utilities.js';
import { initCrime } from './crime.js';
import { initCrimeUS } from './crimeus.js';
import { initFema } from './fema.js';
import { initAreaReports, areaMap } from './reportkit.js';
import { initDriveTime } from './drivetime.js';
import { initTraffic } from './traffic.js';
import { initAirports } from './airports.js';
import { initAirReport } from './airreport.js';
import { initGlance } from './glance.js';
import { initQuickLayers } from './quicklayers.js';
import { initLayerFilters } from './layerfilters.js';
import { initCardTabs } from './cardtabs.js';
import { initPlaces } from './places.js';
import { initDevLayers } from './devlayers.js';
import { initEnv } from './env.js';
import { initOwner } from './owner.js';
import { initGoogle } from './google.js';
import { initSitePlan } from './siteplan.js';
import { initSettings, BASES } from './settings.js';
import { renderNav, syncNav as syncNavTabs, leafFor, pathOf, labelOf, parentOf } from './nav.js';
import { plainText, textBlocks } from './lib/assist-logic.mjs';
import { contains as inArea } from './lib/geomatch.mjs';
import { refused, mapErrorRefused, standIn, downSince, markDown, photonSearchUrl, photonReverseUrl, fromPhoton } from './lib/maptiler.mjs';

const MAPTILER_KEY = 'vA28jXazwpYesC2b1Ccp';
// MapTiler refused the key (monthly quota used up, account suspended): basemaps come from OpenFreeMap and searches from
// Photon until it's been DOWN_HOURS (lib/maptiler.mjs). Remembered across reloads so each load doesn't fail first.
let mtDown=false; try{ mtDown=!!downSince(localStorage); }catch(e){}
function setMtDown(){ if(mtDown) return false; mtDown=true; try{ markDown(localStorage); }catch(e){} return true; }
// index.html starts the data downloads before any module has loaded; each is taken over once (a later call fetches again)
const boot=u=>{ const q=window.__boot?.[u]; if(q) delete window.__boot[u]; return q; };
const getJSON=(u,optional)=>(boot(u)||fetch(u,{cache:'no-cache'})).then(r=>{ if(!r.ok) throw new Error(u+' '+r.status); return r.json(); }).catch(e=>{ if(optional) return null; throw e; });
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
// read live: the OS setting can change while the app is open (ctx.reduceMotion is a getter over this)
const motionMQ=window.matchMedia('(prefers-reduced-motion: reduce)'); let reduceMotion=motionMQ.matches;
motionMQ.addEventListener?.('change',e=>{ reduceMotion=e.matches; if(reduceMotion){ cancelAnimationFrame(hlT); stopAllOrbits(); } }); // a pulse or spin under way stops

// ---------- theme ----------
const root=document.documentElement;
// light only (dark mode was removed): data-theme is always "light", and a choice saved by an older version is dropped
root.dataset.theme='light'; try{ localStorage.removeItem('fs-map-theme'); }catch(e){}

// ---------- data ----------
// latest change run: id -> 'new' | field that changed
const LAST_RUN=DATA.changes.runs[0], CHANGED=recentChanges(DATA.changes);
const F=DATA.filings.map(f=>({...f,r:Math.max(2.2,Math.min(15,1.6+Math.sqrt(f.cost/1e6)*1.15)),_chg:CHANGED.get(f.id)||null})).sort((a,b)=>b.cost-a.cost);
const BY_ID=new Map(F.map(f=>[f.id,f]));
const state={counties:new Set(COUNTIES),types:new Set(TYPES),min:0,max:0,q:'',uses:null,who:null,d:null,chg:null,st:null,sqmin:0,sqmax:0,co:'',exact:0,umin:0,month:null,sel:null,shown:150};
const sel={kind:null,label:'',feature:null,counties:new Set(),center:null};
// registration period presets; the default view is the last 12 months of filings
let lastFilN=0, datePicked=false; // the Dates row was set by hand (src/app.js, syncFilterUI)
const PERIODS=[['3m','3 mo',3],['12m','12 mo',12],['2y','2 yr',24],['5y','5 yr',60],['all','All',0]];
function periodSpec(k){ const p=PERIODS.find(x=>x[0]===k)||PERIODS[1]; if(!p[2]) return {f:'all',from:'',to:''}; const d=new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-p[2]+1); return {f:'reg',from:ym(d),to:''}; }
const periodOf=d=>{ if(!d) return 'all'; if(d.f==='all') return 'all'; if(d.f!=='reg'||d.to) return null; const hit=PERIODS.find(p=>p[2]&&periodSpec(p[0]).from===d.from); return hit?hit[0]:null; };
const DEFAULT_SPEC=()=>({d:periodSpec('12m')});
let visible=F, visibleNoWho=F;
const monthRange=m=>{ const [y,mo]=m.split('-').map(Number); return [m+'-01',new Date(Date.UTC(y,mo,0)).toISOString().slice(0,10)]; };
// county selections match on each filing's own county; other areas use the fast point-in-area test (lib/geomatch.mjs)
const inSel=f=>!sel.feature||(sel.kind==='county'&&sel.counties.size?sel.counties.has(f.county):inArea(sel.feature,[f.lon,f.lat]));
const countyGeo=DATA.counties.map(c=>({name:c.name,geom:{type:'MultiPolygon',coordinates:c.outline}}));

// ---------- map ----------
const STYLES={dots:'dataviz',streets:'streets-v2',sat:'hybrid',topo:'topo-v2',esri:null,free:null,google:null,gsat:null}; // MapTiler map ids (light)
// keyless basemaps: Esri World Imagery (with OpenFreeMap labels and buildings on top) and OpenFreeMap streets
const OFM='https://tiles.openfreemap.org';
const ESRI_STYLE={version:8,glyphs:OFM+'/fonts/{fontstack}/{range}.pbf',
  sources:{esri:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community'},
    openmaptiles:{type:'vector',url:OFM+'/planet',attribution:'© OpenMapTiles © OpenStreetMap contributors (via OpenFreeMap)'}},
  layers:[{id:'esri',type:'raster',source:'esri'},
    {id:'esri-road-lbl',type:'symbol',source:'openmaptiles','source-layer':'transportation_name',minzoom:12,layout:{'symbol-placement':'line','text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':11},paint:{'text-color':'#ffffff','text-halo-color':'#0b0d0c','text-halo-width':1.4}},
    {id:'esri-place-lbl',type:'symbol',source:'openmaptiles','source-layer':'place',filter:['in',['get','class'],['literal',['city','town','village','suburb','neighbourhood']]],layout:{'text-field':['get','name'],'text-font':['Noto Sans Bold'],'text-size':['match',['get','class'],'city',14,'town',12.5,11]},paint:{'text-color':'#ffffff','text-halo-color':'#0b0d0c','text-halo-width':1.6}}]};
const isSat=()=>layers.style==='sat'||layers.style==='esri'||layers.style==='gsat';
// property-first: filing dots start hidden (Layers → Filings, the Construction Filings section or the assistant turn them on)
// Settings › Map › Default base map (fs-basemap) is where the map opens; links never carry a basemap. Google needs its tile session first, so it isn't offered.
const BOOT_BASES=['dots','streets','sat','topo','esri','free'];
const layers={style:(()=>{ try{ const b=localStorage.getItem('fs-basemap'); if(BOOT_BASES.includes(b)) return b; }catch(e){} return 'dots'; })(),roads:true,names:true,counties:true,grid:true,size:'uniform',heat:'off',dots:false};
try{ const L=JSON.parse(localStorage.getItem('fs-map-layers')||'{}'); if(['uniform','value'].includes(L.size)) layers.size=L.size; if(typeof L.grid==='boolean') layers.grid=L.grid; }catch(e){} // the map always opens without filings (dots and heatmap off); dot size and the grid are remembered
const saveLayers=()=>{ try{ localStorage.setItem('fs-map-layers',JSON.stringify({v:2,size:layers.size,heat:layers.heat,dots:layers.dots,grid:layers.grid})); }catch(e){} syncFilingsSw(); }; // every change to the filing layer passes here
// Google base maps need a tile session first (src/google.js): a promise of the style
const styleUrl=s=>s==='google'||s==='gsat'?(ctx.googleStyle?.(s)||Promise.reject(new Error('Google maps aren’t available.'))):s==='esri'?ESRI_STYLE:s==='free'?OFM+'/styles/liberty':mtDown?(standIn(s,false)||ESRI_STYLE):'https://api.maptiler.com/maps/'+STYLES[s]+'/style.json?key='+MAPTILER_KEY;
const map=new maplibregl.Map({container:'map',style:styleUrl(layers.style),center:[-93,24],zoom:1.6,minZoom:1,maxZoom:19,maxPitch:70,antialias:true,
  attributionControl:{compact:true},doubleClickZoom:true,dragRotate:true,cooperativeGestures:false});
// the style or a tile refused: redraw the same basemap from the keyless stand-in (once; the tiles of one view all fail together)
map.on('error',e=>{ if(!mapErrorRefused(e)||!setMtDown()) return; toast('MapTiler isn’t serving maps right now (its monthly limit is used up), so this is the free OpenStreetMap map.'); if(STYLES[layers.style]) setBasemap(layers.style); });

const fc=features=>({type:'FeatureCollection',features});
const GJ={
  // the dot grid's coverage: the whole world (two halves, so the globe never sees one ring around the date line), and the home county
  world:fc([[-180,0],[0,180]].map(([w,e])=>({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[w,-85],[e,-85],[e,85],[w,85],[w,-85]]]}}))),
  homefill:fc(DATA.counties.filter(c=>c.name===HOME_C).map(c=>({type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:c.outline}}))),
  counties:fc(DATA.counties.map(c=>({type:'Feature',properties:{name:c.name,w:c.name===HOME_C?1:0},geometry:{type:'MultiPolygon',coordinates:c.outline}}))),
  clabels:fc(DATA.counties.map(c=>({type:'Feature',properties:{t:c.name.toUpperCase()+' CO.',w:c.name===HOME_C?1:0},geometry:{type:'Point',coordinates:c.label}})))
};
const IDX=new Map(F.map((f,i)=>[f,i]));
function filingsFC(){ return fc(visible.map(f=>({type:'Feature',properties:{i:IDX.get(f),t:f.type,r:f.r,lc:Math.log10(Math.max(f.cost,1e4)),h:(f.approx||f.type==='Addition')?1:0},geometry:{type:'Point',coordinates:[f.lon,f.lat]}}))); }
const C=()=>(isSat()?{new:'#5fd38a',reno:'#f1f3f3',add:'#c2e3d0',line:'rgba(255,255,255,.85)',waller:'#8acda3',dot:'#ffffff',lab:'#ffffff',halo:'#0b0d0c',sel:'#c2e3d0',stroke:'#0b0d0c'}
  : {new:'#006527',reno:'#6b7174',add:'#1f9249',line:'rgba(22,25,26,.45)',waller:'#006527',dot:'#5b6366',lab:'#23282a',halo:'#ffffff',sel:'#006527',stroke:'#ffffff'});
let labelFont=['Noto Sans Bold'];

// one cell of the dot grid's pattern (7 px, drawn at 2x for sharp dots); the home county's dots are a touch bigger so they cover the grey ones
function gridImg(color,r){ const n=14, cv=document.createElement('canvas'); cv.width=cv.height=n; const g=cv.getContext('2d',{willReadFrequently:true}); g.fillStyle=color; g.beginPath(); g.arc(n/2,n/2,r,0,Math.PI*2); g.fill(); return g.getImageData(0,0,n,n); }
function addGridImages(c){ for(const [id,col,r] of [['grid-dot',c.dot,1.2],['grid-dot-home',c.waller,1.6]]){ const img=gridImg(col,r); if(map.hasImage(id)) map.updateImage(id,img); else map.addImage(id,img,{pixelRatio:2}); } }
function setGrid(on){ layers.grid=on; saveLayers(); ['grid-dots','grid-home'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',on?'visible':'none')); const el=document.getElementById('lyGrid'); if(el) el.checked=on; }
function firstSymbolId(){ const l=map.getStyle().layers.find(x=>x.type==='symbol'); return l&&l.id; }
function addOverlays(){
  try{ map.setProjection({type:'globe'}); }catch(e){}
  const c=C(), before=firstSymbolId();
  for(const [id,data] of Object.entries({world:GJ.world,homefill:GJ.homefill,counties:GJ.counties,clabels:GJ.clabels})) if(!map.getSource(id)) map.addSource(id,{type:'geojson',data});
  ['sel','draft','draftpts'].forEach(id=>{ if(!map.getSource(id)) map.addSource(id,{type:'geojson',data:fc([])}); });
  if(!map.getSource('filings')){ map.addSource('filings',{type:'geojson',data:filingsFC()}); filingsDirty=false; }
  // dot grid: a fine halftone over all land at every zoom, on every basemap. It's a repeating pattern drawn just under the
  // basemap's own water (which covers it, so the sea stays clean and bridges and roads stay on top); the home county's dots
  // are green. On imagery the dots are white and fainter. Layers → Dot Grid turns it off.
  addGridImages(c);
  const water=map.getStyle().layers.find(l=>l.type==='fill'&&/^water$/i.test(l['source-layer']||'')), gridBefore=water?water.id:before;
  // kept faint so it's texture, not something to read: the home county's green dots a little stronger so it still stands out
  const op=k=>isSat()?['interpolate',['linear'],['zoom'],1,.2*k,10,.16*k,14,.1*k,17,.05*k]:['interpolate',['linear'],['zoom'],1,.3*k,10,.24*k,14,.15*k,17,.06*k];
  map.addLayer({id:'grid-dots',type:'fill',source:'world',layout:{visibility:layers.grid?'visible':'none'},paint:{'fill-pattern':'grid-dot','fill-opacity':op(1)}},gridBefore);
  map.addLayer({id:'grid-home',type:'fill',source:'homefill',layout:{visibility:layers.grid?'visible':'none'},paint:{'fill-pattern':'grid-dot-home','fill-opacity':op(1.6)}},gridBefore);
  map.addLayer({id:'county-line',type:'line',source:'counties',layout:{visibility:layers.counties?'visible':'none','line-join':'round'},paint:{'line-color':['case',['==',['get','w'],1],c.waller,c.line],'line-width':['interpolate',['linear'],['zoom'],6,['case',['==',['get','w'],1],1.8,1],11,['case',['==',['get','w'],1],2.2,1.4],16,['case',['==',['get','w'],1],3,2]]}},before);
  map.addLayer({id:'sel-fill',type:'fill',source:'sel',paint:{'fill-color':c.sel,'fill-opacity':.09}});
  map.addLayer({id:'sel-line',type:'line',source:'sel',paint:{'line-color':c.sel,'line-width':2.2,'line-dasharray':[3,2]}});
  map.addLayer({id:'draft-fill',type:'fill',source:'draft',filter:['==','$type','Polygon'],paint:{'fill-color':c.sel,'fill-opacity':.1}});
  map.addLayer({id:'draft-line',type:'line',source:'draft',paint:{'line-color':c.sel,'line-width':2,'line-dasharray':[3,2]}});
  map.addLayer({id:'draft-pts',type:'circle',source:'draftpts',paint:{'circle-radius':['case',['==',['get','first'],1],6,4],'circle-color':'#ffffff','circle-stroke-color':c.sel,'circle-stroke-width':2}});
  map.addLayer({id:'county-label',type:'symbol',source:'clabels',minzoom:6.2,layout:{visibility:layers.counties?'visible':'none','text-field':['get','t'],'text-font':labelFont,'text-size':11,'text-letter-spacing':.14,'text-allow-overlap':false},
    paint:{'text-color':['case',['==',['get','w'],1],c.waller,c.lab],'text-halo-color':c.halo,'text-halo-width':1.6}});
  addUsCounties();
  const col=['match',['get','t'],'New',c.new,'Reno',c.reno,c.add];
  map.addLayer({id:'heat',type:'heatmap',source:'filings',maxzoom:17,layout:{visibility:'none'},paint:{'heatmap-radius':['interpolate',['linear'],['zoom'],4,8,8,18,11,32,14,48,17,70],'heatmap-intensity':['interpolate',['linear'],['zoom'],4,.6,9,.9,13,1.3],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],11,.85,15,.4],'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',.08,'rgba(138,205,163,.18)',.25,'rgba(138,205,163,.55)',.45,'#8acda3',.65,'#4caf70',.82,'#1f9249',.93,'#006527',1,'#00351a']}});
  map.addLayer({id:'filings',type:'circle',source:'filings',paint:{'circle-color':col,
    'circle-stroke-color':['case',['==',['get','h'],1],col,c.stroke],'circle-stroke-width':['case',['==',['get','h'],1],1.4,.8],'circle-pitch-alignment':'map'}});
  map.addLayer({id:'filings-hl',type:'circle',source:'filings',filter:['==',['get','i'],-1],paint:{'circle-radius':['+',markerRadius(),6],'circle-color':'rgba(0,0,0,0)','circle-stroke-color':isSat()?'#ffffff':'#0b0d0c','circle-stroke-width':2.2}});
  if(!map.getSource('hl')) map.addSource('hl',{type:'geojson',data:fc([])});
  map.addLayer({id:'hl-glow',type:'circle',source:'hl',paint:{'circle-radius':16,'circle-color':'#eda100','circle-opacity':.18,'circle-blur':.6,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'hl-ring',type:'circle',source:'hl',paint:{'circle-radius':9,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#eda100','circle-stroke-width':2.6,'circle-pitch-alignment':'map'}});
  if(!map.getSource('focus')) map.addSource('focus',{type:'geojson',data:fc([])});
  map.addLayer({id:'focus-halo',type:'circle',source:'focus',filter:['==',['get','approx'],1],paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,18,14,46],'circle-color':c.sel,'circle-opacity':.10,'circle-stroke-color':c.sel,'circle-stroke-width':1.2,'circle-stroke-opacity':.6,'circle-pitch-alignment':'map'}});
  map.addLayer({id:'focus-dot',type:'circle',source:'focus',paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,6,14,9],'circle-color':['match',['get','t'],'New',c.new,'Reno',c.reno,c.add],'circle-stroke-color':layers.style==='sat'?'#ffffff':'#0b0d0c','circle-stroke-width':3,'circle-pitch-alignment':'map'}});
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
let filingsDirty=true;
// the quick layer buttons follow the filings layer (set once ctx exists: styleFilings can run before that)
let syncQL=()=>{};
function syncFilingsData(){ if(!filingsDirty||!(layers.dots||layers.heat!=='off')) return; const src=map.getSource&&map.getSource('filings'); if(src){ src.setData(filingsFC()); filingsDirty=false; } }
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
  syncFilingsData();
  syncSelBar();
  const lf=document.getElementById('lyFilings'); if(lf) lf.checked=layers.dots; syncQL();
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
// the room the open chat panel and property card take over the map, so a fitted place isn't hidden behind them
function coverPad(base=60){ const m=map.getContainer().getBoundingClientRect(), p={top:base,bottom:base,left:base,right:base};
  for(const el of [document.getElementById('ai'),document.getElementById('card')]){ if(!el||!el.offsetParent||el.id==='card'&&!el.classList.contains('open')) continue; const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2||r.right<=m.left||r.left>=m.right||r.bottom<=m.top||r.top>=m.bottom) continue;
    // docked to the right edge (the property card, the site plan, the assistant drawer), whatever its width; a sheet
    // that spans the map (phones) covers the bottom instead (lib/planview.mjs)
    const side=dockSide(r,m);
    if(side==='right') p.right=Math.max(p.right,m.right-r.left+base/2); else if(side==='left') p.left=Math.max(p.left,r.right-m.left+base/2);
    else if(side==='bottom') p.bottom=Math.max(p.bottom,m.bottom-r.top+base/2); }
  return p; }
// a bounding box [[w,s],[e,n]] in view, clear of the panels; returns the zoom it lands on
function fitBox(b,o={}){ const opt={padding:coverPad(),maxZoom:17,...o}; let z=null; try{ z=map.cameraForBounds(b,opt)?.zoom??null; }catch(e){} safeFit(b,opt); return z; }
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
// ---------- US county lines: every county in the US. National 1:10m lines (data/uscounties.json, fetched after the map is up)
// under the home counties' own outlines; from zoom 10 the exact Census TIGER/Line lines for the cells in view (/api/counties)
// replace them. If those can't be fetched the national lines simply stay. ----------
let US=null; const PRECISE_Z=10, CELL=.5, MAX_CELLS=40, pCells=new Map(); let pOK=false;
const HOME_COUNTY=new Set(COUNTIES.map(n=>n+' County'));
getJSON('data/uscounties.json',true).then(d=>{ if(!d||!d.lines) return;
  US={uslines:fc([{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:d.lines}}]),usstates:fc([{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:d.states||[]}}]),
    uslabels:fc((d.labels||[]).map(([t,x,y])=>({type:'Feature',properties:{t},geometry:{type:'Point',coordinates:[x,y]}})))};
  if(styleReady) addUsCounties(); syncPrecise(); });
const preciseFC=()=>{ const seen=new Map(); for(const c of pCells.values()) for(const k of c.counties||[]) if(!seen.has(k.id)&&!(k.id.startsWith('48')&&HOME_COUNTY.has(k.name))) seen.set(k.id,{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:k.lines}}); return fc([...seen.values()]); };
function addUsCounties(){
  if(!US||!map.getLayer('county-line')) return; const c=C(), vis=layers.counties?'visible':'none';
  for(const k of Object.keys(US)) if(!map.getSource(k)) map.addSource(k,{type:'geojson',data:US[k]});
  if(!map.getSource('usprecise')) map.addSource('usprecise',{type:'geojson',data:preciseFC()});
  const w=['interpolate',['linear'],['zoom'],3,.35,6,.7,9,1,12,1.3,16,1.8];
  if(!map.getLayer('us-county-line')) map.addLayer({id:'us-county-line',type:'line',source:'uslines',layout:{visibility:vis,'line-join':'round'},paint:{'line-color':c.line,'line-width':w,'line-opacity':.7}},'county-line');
  if(!map.getLayer('us-county-precise')) map.addLayer({id:'us-county-precise',type:'line',source:'usprecise',minzoom:PRECISE_Z,layout:{visibility:vis,'line-join':'round'},paint:{'line-color':c.line,'line-width':w,'line-opacity':.7}},'county-line');
  if(!map.getLayer('us-state-line')) map.addLayer({id:'us-state-line',type:'line',source:'usstates',layout:{visibility:vis,'line-join':'round'},paint:{'line-color':c.line,'line-width':['interpolate',['linear'],['zoom'],2,.6,6,1.3,10,2,16,2.6],'line-opacity':.9}},'county-line');
  if(!map.getLayer('us-county-label')) map.addLayer({id:'us-county-label',type:'symbol',source:'uslabels',minzoom:6.5,layout:{visibility:vis,'text-field':['get','t'],'text-font':labelFont,'text-size':10,'text-letter-spacing':.1,'text-transform':'uppercase','text-max-width':9,'text-allow-overlap':false},
    paint:{'text-color':c.lab,'text-opacity':.75,'text-halo-color':c.halo,'text-halo-width':1.5}},'county-label');
  syncCoarse();
}
// the national lines step aside once the exact lines for everything in view have arrived
function syncCoarse(){ map.getLayer('us-county-line')&&map.setPaintProperty('us-county-line','line-opacity',pOK&&map.getZoom()>=PRECISE_Z?0:.7); }
function cellsInView(){ const b=map.getBounds(), out=[], f=v=>Math.floor(v/CELL)*CELL;
  for(let x=f(b.getWest());x<b.getEast();x+=CELL) for(let y=f(Math.max(b.getSouth(),-15));y<Math.min(b.getNorth(),72);y+=CELL) out.push([x,y]);
  return out.length>16?null:out; } // a tilted view to the horizon: too many cells, keep the national lines
// the cells in view right now; a fetch that finishes after the map moved on still lands in the cache and redraws
let pCur=null, pRaf=0;
const pReady=()=>!!pCur&&pCur.every(([x,y])=>{ const v=pCells.get(x+','+y); return v&&!v.err&&!v.pending; });
function redrawPrecise(){ pRaf=0;
  for(const [x,y] of pCur||[]){ const k=x+','+y, v=pCells.get(k); if(v){ pCells.delete(k); pCells.set(k,v); } } // most recently seen last
  for(const k of [...pCells.keys()]){ if(pCells.size<=MAX_CELLS) break; if(!pCells.get(k).pending) pCells.delete(k); }
  map.getSource('usprecise')?.setData(preciseFC()); pOK=pReady(); syncCoarse(); }
function syncPrecise(){
  pCur=US&&layers.counties&&map.getZoom()>=PRECISE_Z?cellsInView():null;
  pOK=pReady(); syncCoarse(); if(!pCur||pOK) return;
  const now=Date.now(), need=pCur.filter(([x,y])=>{ const c=pCells.get(x+','+y); return !c||(c.err&&now-c.at>3e5); }); // cells already loading are left alone
  for(const [x,y] of need){ const k=x+','+y; pCells.set(k,{pending:1,at:now});
    fetch('/api/counties?x='+x+'&y='+y).then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(d=>pCells.set(k,{counties:d.counties||[],at:Date.now()}),()=>pCells.set(k,{err:1,at:Date.now()}))
      .then(()=>{ if(!pRaf) pRaf=requestAnimationFrame(redrawPrecise); }); }
}
let preciseT=0; map.on('moveend',()=>{ clearTimeout(preciseT); preciseT=setTimeout(syncPrecise,300); }); // once the map settles, not every frame of a follow or orbit
let styleReady=false;
map.on('style.load',()=>{ styleReady=true; addOverlays(); });
function setBasemap(s){
  layers.style=s; styleReady=false;
  document.querySelectorAll('#styleSeg button').forEach(x=>x.setAttribute('aria-pressed',x.dataset.style===s));
  try{ if(map.getTerrain()) map.setTerrain(null); }catch(e){} // MapLibre breaks if terrain is live during a style swap; live.js re-adds it on style.load
  const st=styleUrl(s);
  if(st&&typeof st.then==='function'){ st.then(x=>{ if(layers.style===s) map.setStyle(x,{diff:false}); },e=>{ toast(e.message); if(layers.style===s) setBasemap('dots'); }); return; }
  map.setStyle(st,{diff:false});
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
  return {k:'p',ring:urlRing(sel.feature),label:sel.label,...(sel.kind==='area'?{box:1}:{})}; }
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
// The panel's scope header (pinned at the top while the panel scrolls): what the panel is about — the selected area, or
// the map view (named after the nearest place) — with its filing count, Compare and a "…" menu (save, link, alerts)
const SEL_KIND={area:'Box',shape:'Shape',radius:'Radius',county:'County',place:'Place'};
const SEL_IC={view:'<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12"/>',area:'<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2.2 1.6"/>',
  shape:'<path d="M3 4.5 9 2l4.5 5-2.5 6.5-7.5-1.5z"/>',radius:'<circle cx="8" cy="8" r="5.8"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/>',
  county:'<path d="M3 2.5h6l1 3h3.5v8H3z"/>',place:'<path d="M8 14.5s5-4.3 5-8.2A5 5 0 0 0 3 6.3c0 3.9 5 8.2 5 8.2z"/><circle cx="8" cy="6.3" r="1.8"/>'};
let selIcK='';
const viewPlaceSafe=()=>{ try{ const c=map.getCenter(); return nearestPlace([c.lng,c.lat])||farLabel; }catch(e){ return null; } }; // farLabel (below) is filled after the first move
// with nothing selected the header names the place in view (the far-away name arrives about 600 ms after a move)
let selNameT=0; map.on('moveend',()=>{ if(sel.feature) return; clearTimeout(selNameT); selNameT=setTimeout(syncSelBar,800); });
function syncSelBar(){
  const k=sel.feature?(SEL_IC[sel.kind]?sel.kind:'shape'):'view';
  document.getElementById('selKind').innerHTML=sel.feature?'<span class="sk-l">Selected area · </span>'+(SEL_KIND[sel.kind]||'Area'):'<span class="sk-l">No area picked</span>'; // phones show only the kind
  const vp=sel.feature?null:viewPlaceSafe(); document.getElementById('selName').textContent=sel.feature?sel.label:vp?'Map view near '+vp:'Map view';
  if(selIcK!==k){ selIcK=k; document.getElementById('selIcon').innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+SEL_IC[k]+'</svg>'; }
  // with no area picked the count is for the whole region (and your filters), not what's in view: say so
  const stEl=document.getElementById('selStats'); stEl.textContent=fmtN(visible.length)+' filing'+(visible.length===1?'':'s')+(sel.feature?'':' region-wide')+' · '+fmtM(visible.reduce((s,f)=>s+f.cost,0));
  stEl.title=sel.feature?'':'Every filing in the region that matches your filters, wherever the map is looking. Pick an area to count one place.';
  document.getElementById('selPick').hidden=!!sel.feature;
  // Save search and alerts only mean something once there is a filter or an area; Copy link always works
  const custom=filterChips({area:true}).some(c=>!c.fixed);
  // (shown but off with nothing to save, so the menu doesn't change shape)
  for(const id of ['saveSearch','rssLink']){ const b=document.getElementById(id); b.removeAttribute('hidden'); b.toggleAttribute('disabled',!custom&&id==='saveSearch'); b.setAttribute('aria-disabled',String(!custom)); b.classList.toggle('is-off',!custom); b.title=custom?'':'Pick an area or set a filter first'; }
  if(!custom) document.getElementById('saveForm').hidden=true;
  syncFilingsHead();
}
// the Construction Filings header: the live count for the panel's scope, the data period, and an honest "On map" switch
function syncFilingsHead(){
  const n=visible.length, where=sel.feature?sel.label:state.counties.size<COUNTIES.length?(state.counties.size>2?state.counties.size+' counties':[...state.counties].join(' + ')+(state.counties.size>1?' counties':' County')):'';
  const fl=document.getElementById('filingsLive'); fl.textContent=fmtN(n)+' filing'+(n===1?'':'s')+' · '+fmtM(visible.reduce((s,f)=>s+f.cost,0))+(where?' · '+where:''); fl.title=fl.textContent;
  syncFilingsSw();
}
function syncFilingsSw(){ const sw=document.getElementById('filingsOnMap'); if(sw) sw.checked=layers.dots||layers.heat!=='off'; }
function applyFilters(){
  const spec=curSpec(false), m=makeMatcher(spec,{changed:CHANGED});
  visible=F.filter(f=>m(f)&&inSel(f)&&monthOK(f));
  if(state.who){ const m2=makeMatcher({...spec,who:null},{changed:CHANGED}); visibleNoWho=F.filter(f=>m2(f)&&inSel(f)&&monthOK(f)); } else visibleNoWho=visible;
  if(sel.kind==='radius'){ visible.forEach(f=>f._d=d3.geoDistance([f.lon,f.lat],sel.center)*EARTH_MI); visible.sort((a,b)=>a._d-b._d); }
  document.getElementById('selbar').classList.add('on');
  syncSelBar();
  document.getElementById('selClear').style.display=sel.feature?'':'none';
  state.shown=150; renderList();
  // the dot layer is only rebuilt while it's showing (10k points); turning it on catches up
  filingsDirty=true; syncFilingsData();
  syncFilterUI(); scheduleHash(); listeners.forEach(fn=>{ try{ fn(); }catch(e){ console.error(e); } });
}
const cRow=document.getElementById('countyRow'), tRow=document.getElementById('typeRow'), pRow=document.getElementById('periodRow');
PERIODS.forEach(([k,label])=>{ const b=document.createElement('button'); b.className='chip'; b.dataset.p=k; b.textContent=label; b.setAttribute('aria-pressed','false');
  b.onclick=()=>{ state.d=periodSpec(k); datePicked=false; applyFilters(); }; pRow.appendChild(b); });
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
// a minimum above the maximum (value, sq ft, dates) is swapped, so the result is never silently empty
const swapped=what=>ctx.toast?.('The minimum was above the maximum, so '+what+' were swapped.');
const costChange=e=>{ state.min=+document.getElementById('minCost').value; state.max=+document.getElementById('maxCost').value; if(state.min&&state.max&&state.min>state.max){ [state.min,state.max]=[state.max,state.min]; swapped('the two values'); } applyFilters(); };
document.getElementById('minCost').onchange=costChange; document.getElementById('maxCost').onchange=costChange;
// multi-select chip rows (use, status): nothing pressed = no filter
function chipRow(rowId,values,key,label=v=>v){ const row=document.getElementById(rowId); const n={}; F.forEach(f=>{ const v=key==='uses'?(f.use||'Unclassified'):(f.status||'Unknown'); n[v]=(n[v]||0)+1; });
  values.filter(v=>n[v]).forEach(v=>{ const b=document.createElement('button'); b.className='chip'; b.type='button'; b.dataset.v=v; b.setAttribute('aria-pressed','false'); b.innerHTML=esc(label(v))+' <span class="n">'+fmtN(n[v])+'</span>';
    b.onclick=()=>{ const set=new Set(state[key]||[]); set.has(v)?set.delete(v):set.add(v); state[key]=set.size?set:null; applyFilters(); }; row.appendChild(b); });
  if(row.querySelectorAll('.chip').length<2) row.style.display='none'; }
chipRow('useRow',[...USES,'Unclassified'],'uses');
chipRow('statusRow',['Registered','Review complete','Inspection complete','Closed','Unknown'],'st');
const sqMin=document.getElementById('sqMin'), sqMax=document.getElementById('sqMax'), uMin=document.getElementById('uMin'), coQ=document.getElementById('coQ'), exactBtn=document.getElementById('exactBtn');
let numT; const readSq=(commit=false)=>{ let a=Math.max(0,+sqMin.value||0), b=Math.max(0,+sqMax.value||0);
  if(a&&b&&a>b){ if(!commit) return; [a,b]=[b,a]; sqMin.value=a; sqMax.value=b; swapped('the two sizes'); } // typing: wait until the boxes are left, then swap
  state.sqmin=a; state.sqmax=b; applyFilters(); };
[sqMin,sqMax].forEach(i=>{ i.addEventListener('input',()=>{ clearTimeout(numT); numT=setTimeout(()=>readSq(false),350); });
  i.addEventListener('change',()=>{ clearTimeout(numT); readSq(true); }); });
uMin.onchange=()=>{ state.umin=+uMin.value; applyFilters(); };
let coT; coQ.addEventListener('input',()=>{ clearTimeout(coT); coT=setTimeout(()=>{ state.co=coQ.value; applyFilters(); },250); });
exactBtn.onclick=()=>{ state.exact=state.exact?0:1; applyFilters(); };
// Construction Filings: collapsible (remembered in this browser; starts collapsed). Opening it by hand puts the filing dots
// on the map; a section restored open from an earlier visit leaves the map alone, and the header's "On map" switch says
// which it is. It sits last in the panel, under the area and its reports.
const secF=document.getElementById('secFilings'), secFBody=document.getElementById('filingsBody');
function setFilingsOpen(open,{save=false,dots=false}={}){
  secF.setAttribute('aria-expanded',open); secFBody.classList.toggle('collapsed',!open); document.getElementById('panel').classList.toggle('list-collapsed',!open);
  if(open&&dots) showFilings();
  if(save) try{ localStorage.setItem('fs-sec-filings',open?'1':'0'); }catch(e){}
}
{ let open=false; try{ open=(localStorage.getItem('fs-sec-filings')??'0')!=='0'; }catch(e){} setFilingsOpen(open); }
secF.onclick=()=>setFilingsOpen(secF.getAttribute('aria-expanded')!=='true',{save:true}); // opening or closing the list never touches the map: only the On map switch does
document.getElementById('filingsOnMap').onchange=e=>setFilingsShown(e.target.checked);
// use, dates, updates, active-filter summary
const dField=document.getElementById('dField'), dFrom=document.getElementById('dFrom'), dTo=document.getElementById('dTo');

const dPeriod=[DATA.period.start.slice(0,7), ym(new Date(Date.now()+3*365*864e5))];
[dFrom,dTo].forEach(i=>{ i.min=dPeriod[0].slice(0,4)+'-01'; i.max=dPeriod[1]; });
function readDates(){ const f=dField.value; dFrom.disabled=dTo.disabled=!f; if(f&&dFrom.value&&dTo.value&&dFrom.value>dTo.value){ [dFrom.value,dTo.value]=[dTo.value,dFrom.value]; swapped('the two dates'); } datePicked=!!f; state.d=f?{f,from:dFrom.value||'',to:dTo.value||''}:{f:'all',from:'',to:''}; applyFilters(); }
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
  // the Filed chips already say a preset period: the Dates row shows only a range of your own (or one picked by hand)
  const dd=state.d&&state.d.f!=='all'&&(!pk||datePicked)?state.d:null; dField.value=dd?dd.f:''; dFrom.value=dd?.from||''; dTo.value=dd?.to||''; dFrom.disabled=dTo.disabled=!dd;
  const nMore=(state.uses?1:0)+(state.d&&!pk?1:0)+(state.chg?1:0)+(state.st?1:0)+(state.sqmin||state.sqmax?1:0)+(state.umin?1:0)+(state.co.trim()?1:0)+(state.exact?1:0); document.getElementById('moreN').textContent=nMore?'· '+nMore+' on':''; if(nMore) document.getElementById('moreF').open=true;
  const nAll=Object.keys(curSpec(false)).filter(k=>k!=='d').length+(pk&&pk!=='12m'?1:0); const nBadge=nAll+ctx_lfCount(); { /* the Filings section starts folded; a new filter opens it */ const fe=document.getElementById('filingsSecN'); if(fe) fe.textContent=nAll?'· '+nAll+' on':''; if(nAll>lastFilN) document.getElementById('lfFilings').open=true; lastFilN=nAll; } const fN=document.getElementById('filterN'); fN.textContent=nBadge||''; fN.hidden=!nBadge; syncClear(); try{ ctx.syncFilterFooter?.(); }catch(e){}
  document.getElementById('filterBtn').classList.toggle('on',!!nBadge);
  let lt=''; try{ lt=ctx.layerFilterText?.()||''; }catch(e){}
  // only the default period set: "No filters on" and no Clear All
  const none=!nBadge&&!state.month, ft=filterText(), t=none?'':[lt,ft?'Filings: '+ft:''].filter(Boolean).join(' · '); document.getElementById('activeTxt').textContent=t||'No filters on'; document.getElementById('activeBar').classList.toggle('on',true);
  document.getElementById('activeBar').classList.toggle('none',none);
}
// the Clear button beside Filters (and on phones beside the filter button): shown whenever anything narrows the view (filters,
// a period other than the default, a time-lapse month, a selected area or a searched place's outline), one click clears it all
const hasPlace=()=>{ try{ return !!ctx.hasPlace?.(); }catch(e){ return false; } };
const ctx_lfCount=()=>{ try{ return ctx.layerFilterCount?.()||0; }catch(e){ return 0; } }; // layer filters (src/layerfilters.js) // ctx is created further down; boot runs this before
function syncClear(){
  const pk=periodOf(state.d), parts=[], nF=Object.keys(curSpec(false)).filter(k=>k!=='d').length+(pk&&pk!=='12m'?1:0);
  const nL=ctx_lfCount(); if(nF) parts.push(nF===1?'1 filing filter':nF+' filing filters'); if(nL) parts.push(nL===1?'1 layer filter':nL+' layer filters'); if(state.month) parts.push('the month'); if(sel.feature) parts.push('the selected area'); if(hasPlace()) parts.push('the search outline');
  const n=nF+nL+(state.month?1:0)+(sel.feature?1:0)+(hasPlace()?1:0), t=parts.length?'Clear '+parts.join(', ').replace(/, ([^,]*)$/,' and $1'):'';
  for(const id of ['filterClear','mClear']){ const b=document.getElementById(id); if(!b) continue; b.hidden=!n; b.title=t; b.setAttribute('aria-label',t||'Clear'); const sp=b.querySelector('span'); if(sp) sp.textContent=n>1?'Clear ('+n+')':'Clear'; }
  renderConstraints();
}
// Under the layer buttons (desktop): everything that narrows the map as removable chips, ending in "Clear all". It replaces
// the old "Clear (n)" button (#filterClear, kept hidden: phones still use #mClear). Built from the same parts as above:
// the filing filters and the month (filterChips), each layer threshold, the Match everything mode, the selected area and a
// searched place's outline.
const fchipsEl=document.getElementById('fchips');
function constraintChips(){
  const out=filterChips({area:true}).filter(c=>!c.fixed);
  try{ out.push(...(ctx.layerFilterChips?.()||[])); }catch(e){}
  if(hasPlace()){ let l=''; try{ l=ctx.placeLabel?.()||''; }catch(e){} out.push({label:'Outline: '+(String(l).split(',')[0]||'searched place'),remove:()=>ctx.clearPlace?.()}); }
  return out;
}
function renderConstraints(){ if(!fchipsEl) return; let cs=[]; try{ cs=constraintChips(); }catch(e){}
  const html=cs.map((c,i)=>'<span class="fchip">'+esc(c.label)+'<button type="button" data-i="'+i+'" aria-label="Remove: '+esc(c.label)+'" title="Remove">×</button></span>').join('')+(cs.length?'<button type="button" class="fc-all">Clear all</button>':'');
  fchipsEl.hidden=!cs.length; if(fchipsEl.innerHTML!==html) fchipsEl.innerHTML=html;
  fchipsEl.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{ const c=cs[+b.dataset.i]; if(c) c.remove(); });
  const all=fchipsEl.querySelector('.fc-all'); if(all) all.onclick=()=>clearEverything(); }
function clearEverything(){ clearFilters(); ctx.toast?.('Cleared: showing everything'); }
let openFilters=()=>{}, closeFilters=()=>{}; // set below once the popup is wired; exposed as ctx.openFilters / closeFilters
const clearFilters=()=>{ ctx.clearPlace?.(); ctx.clearLayerFilters?.(); fromSpec(DEFAULT_SPEC()); if(state.month) setMonth(null); };
document.getElementById('resetAll').onclick=clearFilters;
// Filters: a popup from the map toolbar (between County and Export), with a Clear button beside it while any are on.
// Filters only act on construction filings, so changing one puts the filing dots on the map.
{ const btn=document.getElementById('filterBtn'), pop=document.getElementById('filterPop'), wrap=document.getElementById('fwrap');
  // On Filings pages, Compare and Reports the same popup floats over the page under the "Edit filters" button that opened
  // it (only the construction filters show there), instead of jumping to the Map. The node itself never moves.
  const sub=pop.querySelector('.fpop-h span'), subMap=sub.textContent; let anchor=null;
  const place=()=>{ if(anchor&&!anchor.isConnected){ anchor=document.querySelector('#view-'+ctx.view+' [data-edit-filters]')||anchor; anchor.setAttribute?.('aria-expanded','true'); } // pages redraw
    if(!anchor||!pop.classList.contains('fpop-floating')||matchMedia('(max-width:700px)').matches){ pop.style.left=pop.style.top=pop.style.maxHeight=''; return; }
    const r=anchor.getBoundingClientRect(), w=Math.min(460,innerWidth-16), top=Math.round(r.bottom+8);
    pop.style.left=Math.round(Math.max(8,Math.min(r.right-w,innerWidth-w-8)))+'px'; pop.style.top=top+'px'; pop.style.maxHeight=Math.max(240,innerHeight-top-12)+'px'; };
  const setOpen=(open,at=null)=>{ if(open&&matchMedia('(max-width:700px)').matches) document.getElementById('moreF').open=true;
    const floating=open&&!!at; anchor=floating?at:null; pop.classList.toggle('fpop-floating',floating); sub.textContent=floating?'Construction filings, here and on the map':subMap;
    if(floating) document.getElementById('lfFilings').open=true;
    pop.hidden=!open; btn.setAttribute('aria-expanded',open&&!floating); btn.classList.toggle('open',open&&!floating);
    document.querySelectorAll('[data-edit-filters]').forEach(b=>b.setAttribute('aria-expanded',String(floating&&b===at))); place();
    if(open) (floating?pop.querySelector('#filtersBody select,#filtersBody button.chip,#filtersBody input'):pop.querySelector('select,button.chip,input'))?.focus({preventScroll:true}); };
  addEventListener('resize',place); listeners.push(()=>{ if(!pop.hidden&&anchor) requestAnimationFrame(place); });
  const dismiss=()=>{ const a=anchor; setOpen(false); (a&&a.isConnected?a:btn).focus(); };
  btn.onclick=()=>setOpen(pop.hidden);
  document.getElementById('filterClose').onclick=dismiss;
  document.getElementById('filterDone').onclick=()=>setOpen(false); // phones: the sheet's "Show N filings" button
  const clearAll=clearEverything;
  document.getElementById('filterClear').onclick=clearAll; const mc=document.getElementById('mClear'); if(mc) mc.onclick=clearAll;
  // only the construction filters put the filing dots on the map (the layer filters have their own layers)
  pop.addEventListener('change',e=>{ if(e.target.closest('#filtersBody')) showFilings(); }); pop.addEventListener('click',e=>{ if(e.target.closest('#filtersBody')&&e.target.closest('.chip,button[data-k],button[data-v]')) showFilings(); });
  document.addEventListener('pointerdown',e=>{ if(!pop.hidden&&!wrap.contains(e.target)&&!e.target.closest('.kpi-pop,[data-edit-filters],.vscope')) setOpen(false); }); // the scope bar's chips and Reset change the same filters, so the popup stays open
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!pop.hidden){ e.preventDefault(); dismiss(); } });
  // openFilters({at: button}): pages whose content follows the filters keep the user where they are
  openFilters=({at=null}={})=>{ const here=at&&ctx.view!=='map'&&(parentOf(ctx.view)==='filings'||['compare','reports'].includes(ctx.view));
    if(here){ if(!pop.hidden&&anchor===at){ setOpen(false); return; } setOpen(true,at); return; }
    if(ctx.view!=='map') setView('map'); setOpen(true); };
  closeFilters=()=>{ if(!pop.hidden) setOpen(false); }; }
// ---------- page kit: scope bar, empty states, Export ▾ menus (shared by every page) ----------
// The filters in effect as removable chips: [{label, remove()}]. The registration period is always listed first; it can be
// removed (back to the default last 12 months) only when it isn't the default.
const PERIOD_LABEL={'3m':'Filed in the last 3 months','12m':'Filed in the last 12 months','2y':'Filed in the last 2 years','5y':'Filed in the last 5 years',all:'Filed any time'};
const RESET={c:()=>{ state.counties=new Set(COUNTIES); },t:()=>{ state.types=new Set(TYPES); },u:()=>{ state.uses=null; },min:()=>{ state.min=0; state.max=0; },max:()=>{ state.min=0; state.max=0; },
  who:()=>{ state.who=null; },chg:()=>{ state.chg=null; },st:()=>{ state.st=null; },sqmin:()=>{ state.sqmin=0; state.sqmax=0; },sqmax:()=>{ state.sqmin=0; state.sqmax=0; },
  umin:()=>{ state.umin=0; },co:()=>{ state.co=''; },exact:()=>{ state.exact=0; },q:()=>{ state.q=''; }};
// every filing filter back to the default (and the month and, unless area is false, the selected area)
function resetFilings({area=true}={}){ Object.values(RESET).forEach(f=>f()); state.d=periodSpec('12m');
  if(state.month) setMonth(null); if(area&&sel.feature) clearSelection(); else applyFilters(); }
function filterChips({area=true}={}){
  const s=curSpec(false), out=[], pk=periodOf(state.d), drop=fn=>()=>{ fn(); applyFilters(); };
  out.push({label:pk?PERIOD_LABEL[pk]:describe({d:state.d},fmtM)||'Any time',fixed:pk==='12m',remove:drop(()=>{ state.d=periodSpec('12m'); })});
  const seen=new Set();
  for(const k of Object.keys(s)){ if(k==='d'||!RESET[k]) continue; const g=k==='max'?'min':k==='sqmax'?'sqmin':k; if(seen.has(g)) continue; seen.add(g);
    const part=g==='min'?{min:s.min,max:s.max}:g==='sqmin'?{sqmin:s.sqmin,sqmax:s.sqmax}:{[k]:s[k]};
    out.push({label:describe(part,fmtM),remove:drop(RESET[k])}); }
  if(state.month) out.push({label:'Under construction '+monthLabel(state.month),remove:()=>showTime(false)});
  if(area&&sel.feature) out.push({label:(['area','shape','radius'].includes(sel.kind)?'':'Area: ')+sel.label,remove:()=>clearSelection()});
  return out;
}
// the bar under a page header: "5,291 filings · $16.3B", the filters as chips, [Edit filters] [Reset]
function scopeBar(el,{list=visible,area=true,lead='',count=true}={}){
  if(!el) return; const chips=filterChips({area}), n=list.length, v=list.reduce((t,f)=>t+f.cost,0), canReset=chips.some(c=>!c.fixed);
  el.className='vscope';
  el.innerHTML=(lead||count?'<span class="vs-n">'+(lead?esc(lead):'<b>'+fmtN(n)+'</b> filing'+(n===1?'':'s')+' · '+fmtM(v))+'</span>':'')+'<span class="vs-chips">'+chips.map((c,i)=>'<span class="vs-chip'+(c.fixed?' fixed':'')+'">'+esc(c.label)+
    (c.fixed?'':'<button type="button" data-rm="'+i+'" aria-label="Remove filter: '+esc(c.label)+'">×</button>')+'</span>').join('')+'</span>'+
    '<span class="vs-act"><button type="button" class="btn sm" data-edit-filters aria-haspopup="dialog" aria-controls="filterPop" aria-expanded="false">Edit filters</button>'+(canReset?'<button type="button" class="btn sm ghost" data-reset>Reset</button>':'')+'</span>';
  el.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>chips[+b.dataset.rm].remove());
  el.querySelector('[data-edit-filters]').onclick=e=>openFilters({at:e.currentTarget});
  el.querySelector('[data-reset]')?.addEventListener('click',()=>resetFilings({area}));
}
// an empty page or section: icon, title, one sentence, buttons [{label, id?, primary?, attrs?}]
const VE_IC={search:'<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',pin:'<path d="M8 14.5s5-4.3 5-8.2A5 5 0 0 0 3 6.3c0 3.9 5 8.2 5 8.2z"/><circle cx="8" cy="6.3" r="1.8"/>',
  doc:'<path d="M4 1.5h5.5L12.5 4.5v10H4zM9.5 1.5v3h3M6 8h4.5M6 11h4.5"/>',areas:'<rect x="1.5" y="3" width="6" height="10" rx="1"/><rect x="8.5" y="3" width="6" height="10" rx="1"/>',
  bookmark:'<path d="M4 1.8h8v12.4l-4-3-4 3z"/>',clock:'<circle cx="8" cy="8" r="6.3"/><path d="M8 4.5V8l2.4 1.6"/>',star:'<path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>'};
function vempty({icon='doc',title='',text='',actions=[],extra=''}={}){
  return '<div class="vempty"><span class="ve-ic"><svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(VE_IC[icon]||VE_IC.doc)+'</svg></span>'+
    (title?'<b>'+esc(title)+'</b>':'')+(text?'<p>'+text+'</p>':'')+extra+(actions.length?'<div class="ve-act">'+actions.map(a=>'<button type="button" class="btn md'+(a.primary?' primary':'')+'"'+(a.id?' id="'+a.id+'"':'')+(a.attrs||'')+'>'+esc(a.label)+'</button>').join('')+'</div>':'')+'</div>';
}
// "Export ▾": a small menu (a <details>) of [{label, sub?, attrs}] or {divider:true} or {html}
function exportMenu(items,{label='Export',cls=''}={}){
  return '<details class="vmenu '+cls+'"><summary class="btn">'+esc(label)+' <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 3.5 3 3 3-3"/></svg></summary><div class="vm-pop" role="menu">'+
    items.map(it=>it.divider?'<hr>':it.html?it.html:'<button type="button" role="menuitem"'+(it.attrs||'')+'>'+esc(it.label)+(it.sub?'<em>'+esc(it.sub)+'</em>':'')+'</button>').join('')+'</div></details>';
}
// close an open menu on a click elsewhere, after picking an item, or on Esc
document.addEventListener('click',e=>{ document.querySelectorAll('details.vmenu[open]').forEach(d=>{ if(!d.contains(e.target)||e.target.closest('.vm-pop [role=menuitem]')) d.open=false; }); });
document.addEventListener('keydown',e=>{ if(e.key!=='Escape') return; const d=document.querySelector('details.vmenu[open]'); if(d){ e.preventDefault(); d.open=false; d.querySelector('summary')?.focus(); } });
// apply a whole filter spec (URL, saved search, AI answer)
function fromSpec(spec,{fly=true}={}){
  state.counties=new Set(spec.c&&spec.c.length?spec.c.filter(c=>COUNTIES.includes(c)):COUNTIES); if(!state.counties.size) state.counties=new Set(COUNTIES);
  state.types=new Set(spec.t&&spec.t.length?spec.t:TYPES);
  state.uses=spec.u&&spec.u.length?new Set(spec.u):null; state.min=spec.min||0; state.max=spec.max||0; state.q=spec.q||'';
  state.who=spec.who||null; state.d=spec.d||null; datePicked=false; state.chg=spec.chg||null;
  state.st=spec.st&&spec.st.length?new Set(spec.st):null; state.sqmin=spec.sqmin||0; state.sqmax=spec.sqmax||0; state.co=spec.co||''; state.exact=spec.exact?1:0; state.umin=spec.umin||0;
  const s=spec.sel;
  if(s&&s.k==='r'){ setMiles(s.mi,false,true); setRadiusCenter(s.c,s.label||'pin',fly); }
  else if(s&&s.k==='c'){ const set=new Set(s.names.filter(n=>COUNTIES.includes(n))); if(set.size){ setCountySel(set); if(fly) fitGeom(sel.feature); } else clearSelection(); }
  else if(s&&s.k==='p'){ setSelection(s.box?'area':'shape',(!s.label||/^(Area selection|Custom shape)/.test(s.label))?areaName(s.box?'Box':'Shape',ringCenter(s.ring)):s.label,ringFeature(s.ring)); if(fly) fitGeom(sel.feature); }
  else if(sel.feature) clearSelection();
  else applyFilters();
}
const listEl=document.getElementById('list');
const colorOf=f=>{ const c=C(); return f.type==='New'?c.new:f.type==='Reno'?c.reno:c.add; };
function renderList(){
  document.getElementById('listCount').textContent=(sel.kind==='radius'?'Nearest first · ':'Largest first · ')+fmtN(visible.length);
  const frag=document.createDocumentFragment();
  if(!visible.length){ const narrowed=filterChips({area:false}).some(c=>!c.fixed);
    listEl.innerHTML=vempty({icon:'search',title:sel.feature?'No filings in this area':'No filings match',text:narrowed?'Your filters leave nothing here. Clear them to see everything in '+(sel.feature?'this area':'the region')+'.':sel.feature?'Nothing was registered here in the current period. Pick another area, or widen the period under Filters.':'Widen the period under Filters.',actions:narrowed?[{label:'Clear filters',id:'listClearF'}]:[]});
    document.getElementById('listClearF')?.addEventListener('click',()=>resetFilings({area:false})); return; }
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
// the card's action row (under the title, in the pinned header; a footer on phones): a few buttons, then "⋯" with the rest.
// items are menu entries: [label, attrs] buttons, {href,label} links (open in a new tab) or {divider:true}
const DOTS='<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12.5" cy="8" r="1.4"/></svg>';
const SPARK='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5 9.4 6.6 14.5 8l-5.1 1.4L8 14.5 6.6 9.4 1.5 8l5.1-1.4z"/></svg>';
function cardMore(items){ return '<details class="vmenu cmore"><summary class="btn sm" aria-label="More actions" title="More actions">'+DOTS+'</summary><div class="vm-pop" role="menu">'+
  items.map(it=>it.divider?'<hr>':it.href?'<a role="menuitem" href="'+esc(it.href)+'" target="_blank" rel="noopener">'+esc(it.label)+(it.sub?'<em>'+esc(it.sub)+'</em>':'')+'</a>':'<button type="button" role="menuitem"'+(it.attrs||'')+'>'+esc(it.label)+(it.sub?'<em>'+esc(it.sub)+'</em>':'')+'</button>').join('')+'</div></details>'; }
function cardActs(main,more){ return '<div class="cact" role="toolbar" aria-label="Actions">'+main+'<span class="cact-w"></span>'+cardMore(more)+'</div>'; }
// a short line for screen readers (the card itself isn't a live region: it re-renders too often)
const cardStatusEl=document.getElementById('cardStatus');
function cardStatus(msg){ if(!cardStatusEl) return; cardStatusEl.textContent=''; requestAnimationFrame(()=>{ cardStatusEl.textContent=msg; }); }
// copy a link that reopens this card (a filing: f=; a property: b=lat,lng)
async function copyCardLink(extra){ const p=new URLSearchParams(hashStr()); for(const [k,v] of Object.entries(extra||{})) p.set(k,v); const u=location.href.split('#')[0]+'#'+p.toString();
  try{ await navigator.clipboard.writeText(u); toast('Link copied. It opens this card.'); }catch(e){ prompt('Copy this link',u); } }
let navT=0;
function syncNav(){ card.querySelectorAll('.bnav [data-sec]').forEach(b=>{ const el=card.querySelector('#'+b.dataset.sec); b.hidden=!(el&&!el.hidden&&el.innerHTML.trim()); }); navFade(); spySoon(); }
new MutationObserver(()=>{ cancelAnimationFrame(navT); navT=requestAnimationFrame(syncNav); }).observe(card,{childList:true,subtree:true});
// the chip row fades at an edge that has more chips past it
function navFade(){ const n=card.querySelector('.bnav'); if(!n) return; n.classList.toggle('fl',n.scrollLeft>2); n.classList.toggle('fr',n.scrollLeft+n.clientWidth<n.scrollWidth-2); }
card.addEventListener('scroll',e=>{ if(e.target.classList?.contains('bnav')) navFade(); },true);
// scroll-spy: the chip of the section at the top of the card is lit (and kept in view in the chip row); a scrolled card
// folds its header to the title and actions
let spyRaf=0, spyHold=0;
const spySoon=()=>{ if(!spyRaf) spyRaf=requestAnimationFrame(spy); };
card.addEventListener('scroll',spySoon,{passive:true});
function spy(){ spyRaf=0; if(!card.classList.contains('open')) return;
  const y=card.scrollTop, room=card.scrollHeight-card.clientHeight;
  const was=card.classList.contains('compact'), fold=y>40&&room>160?true:y<=2?false:was; if(fold!==was) card.classList.toggle('compact',fold);
  if(performance.now()<spyHold) return; // a chip was just clicked: it stays lit while the card scrolls to it
  if(card.classList.contains('sp-mode')) return; // the site plan panel lights its own chips (src/siteplan.js)
  const nav=card.querySelector('.bnav'); if(!nav) return;
  const chips=[...nav.querySelectorAll('[data-sec]:not([hidden])')]; if(!chips.length) return;
  const off=(card.querySelector('.ctabs')?.offsetHeight||0)+(card.querySelector(':scope>.top')?.offsetHeight||0)+16;
  let on=chips[0];
  if(y>=room-4&&room>0) on=chips[chips.length-1];
  else for(const b of chips){ const el=card.querySelector('#'+b.dataset.sec); if(el&&el.offsetTop-off<=y) on=b; }
  for(const b of nav.querySelectorAll('[data-sec]')) b.setAttribute('aria-current',String(b===on));
  const l=on.offsetLeft-nav.offsetLeft, r=l+on.offsetWidth;
  if(l<nav.scrollLeft+8) nav.scrollLeft=Math.max(0,l-28); else if(r>nav.scrollLeft+nav.clientWidth-8) nav.scrollLeft=r-nav.clientWidth+28;
  navFade(); }
card.addEventListener('click',e=>{ const b=e.target.closest('.bnav [data-sec]'); if(!b) return; const el=card.querySelector('#'+b.dataset.sec); if(!el) return;
  card.querySelectorAll('.bnav [data-sec]').forEach(x=>x.setAttribute('aria-current',x===b)); spyHold=performance.now()+(reduceMotion?120:900);
  // the sticky card-tabs strip and the title/pills block both sit over the content: land the section just below them
  const at=()=>el.offsetTop-(card.querySelector('.ctabs')?.offsetHeight||0)-(card.querySelector('.top')?.offsetHeight||0)-8;
  const t0=at(); card.scrollTo({top:t0,behavior:reduceMotion?'auto':'smooth'});
  // sections above it may fill in while scrolling: correct once, unless the person has scrolled away since
  clearTimeout(navFix); navFix=setTimeout(()=>{ if(el.isConnected&&Math.abs(card.scrollTop-Math.min(t0,card.scrollHeight-card.clientHeight))<40&&Math.abs(at()-card.scrollTop)>4) card.scrollTo({top:at()}); },reduceMotion?50:700); });
let navFix=0;
function select(f,fly){
  showFilings();
  if(cpOpening) stopAllOrbits(); else { cpush=null; cardCloseHooks.forEach(fn=>fn()); }
  state.sel=f; syncHighlight(); [...listEl.querySelectorAll('.item')].forEach((b,i)=>b.classList.toggle('on',visible[i]===f));
  const fld=(k,v,w)=>'<div class="f'+(w?' w':'')+'"><div class="fl">'+k+'</div><div class="fv">'+v+'</div></div>';
  const people=[['Owner',f.owner?whoLink('own',f.owner,f.owner):'—'],f.dev&&f.dev.toLowerCase()!==String(f.owner).toLowerCase()?['Developer',whoLink('dev',f.dev||f.owner,f.dev)]:null,f.arch?['Architect',whoLink('arch',f.arch,f.arch)]:null,f.gc?['General contractor',whoLink('gc',f.gc,f.gc)]:null].filter(Boolean);
  const gsv='https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+f.lat.toFixed(6)+','+f.lon.toFixed(6);
  card.innerHTML='<div class="top"><div><div class="kicker">'+esc(f.county)+' County · '+esc(TYPE_LABEL[f.type])+'</div><h2>'+esc(f.name)+'</h2>'+(f.addr?'<div class="bsub">'+esc(f.addr)+'</div>':'')+'<button class="btn sm cshow" type="button" id="fShowMap">Show on map</button></div>'+
    '<button class="x" aria-label="Close"><svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>'+
    cardActs('<button class="btn sm askai" type="button" id="fAsk">'+SPARK+'Ask AI</button><button class="btn sm" type="button" id="fProp" data-push title="Open the property card: owner, value, zoning and the building at this spot">Property card</button>',
      [['Open property card',' id="fProp2" data-push'],{href:tabsUrl(f.id),label:'TABS record ↗',sub:'The filing on the TDLR TABS site'},{href:gsv,label:'Street View ↗',sub:'Google Street View at the site'},['Add site note',' id="fNote" data-push'],{divider:true},['Select more',' id="fMulti" title="Then click or tap more filings, buildings or parcels to compare them in tabs (or Shift-click)"'],['Copy link',' id="fLink"']].map(x=>Array.isArray(x)?{label:x[0],attrs:x[1]}:x))+
    cardNav([['fProj','Project'],['fSched','Schedule'],['fPeople','People'],['fScope','Scope'],['airSec','Air'],['briefBox','AI Brief'],['liveSec','From Here']])+'</div>'+
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
    '<div class="bsec brief-sec" id="briefBox"><div class="lt">AI Project Brief</div><button class="btn" id="briefBtn">Write a Brief</button><div class="rnote">From the filing, nearby activity and census data.</div></div>';
  card.querySelector('.x').onclick=closeCard; card.classList.add('open'); card.scrollTop=0;
  ctx.tabs?.track({id:'f:'+f.id,kind:'filing',label:f.name,reopen:()=>select(f,false),leave:()=>{ if(state.sel===f) clearSel(); }});
  card.querySelectorAll('[data-who]').forEach(a=>a.onclick=e=>{ e.preventDefault(); const [k,v]=a.dataset.who.split('|'); state.who={k,v,label:a.textContent}; applyFilters(); setView('map'); });
  card.querySelector('#briefBtn').onclick=()=>loadBrief(f);
  card.querySelector('#fShowMap').onclick=()=>{ setView('map',{user:true}); select(f,true); }; // over a page (Timeline, Changes…): only shown there
  card.querySelector('#fNote').onclick=()=>ctx.addNote?.({at:[f.lon,f.lat],label:f.addr||f.name}); // data-push: "← <filing>" goes back with its tabs
  // the property at the filing's spot, in front of this card (data-push: "← <filing>" comes back)
  for(const id of ['#fProp','#fProp2']) card.querySelector(id).onclick=()=>{ if(f.approx){ toast('This filing’s address didn’t geocode, so its marker is at the city center: there’s no property to open.'); return; } ctx.openBuildingAt([f.lon,f.lat]); };
  card.querySelector('#fAsk').onclick=()=>ctx.assistant?.ask('Tell me more about '+f.name);
  card.querySelector('#fMulti').onclick=()=>ctx.tabs?.setAdding(true);
  card.querySelector('#fLink').onclick=()=>copyCardLink();
  cardStatus('Filing: '+f.name);
  card.querySelector('#showAll')?.addEventListener('click',()=>{ clearHighlight(); if(state.month) setMonth(null); fromSpec(DEFAULT_SPEC(),{fly:false}); select(f,false); });
  scheduleHash(); cardRenderHooks.forEach(fn=>fn({kind:'filing',f}));
  if(fly){ const z=f.approx?Math.min(Math.max(map.getZoom(),12.5),13.5):Math.max(map.getZoom(),16); map.flyTo({center:[f.lon,f.lat],zoom:z,offset:window.innerWidth<=700?[0,-Math.round(window.innerHeight*.2)]:window.innerWidth<=1100?[-200,0]:[-Math.round((card.offsetWidth+24)/2),0],duration:reduceMotion?0:900});  }
}
function whoLink(k,raw,label){ const v=entityKey(raw); return v?'<a href="#" data-who="'+k+'|'+esc(v)+'">'+esc(label)+'</a>':esc(label); }
function historyHtml(f){
  const rows=DATA.changes.runs.flatMap(r=>r.items.filter(x=>x.id===f.id).map(x=>[r.built.slice(0,10),x])); if(!rows.length) return '';
  const fv=(k,v)=>v==null||v===''?'—':k==='cost'?fmtM(v):k==='sqft'?fmtN(v):String(v);
  return '<div class="fhist"><div class="fl">History</div>'+rows.map(([d,x])=>'<div><span class="m">'+esc(d)+'</span> '+(x.k==='new'?'First seen':esc(x.label)+': '+esc(fv(x.k,x.from))+' → '+esc(fv(x.k,x.to)))+'</div>').join('')+'</div>'; }
async function loadBrief(f){
  const box=card.querySelector('#briefBox'); if(!box) return; box.innerHTML='<div class="lt">AI Project Brief</div><div class="rnote loading">Writing a brief from the filing, nearby activity and census data…</div>';
  try{ let r; try{ const ai=ctx.aiFor?.('brief')||{}; r=await fetch('api/brief?id='+encodeURIComponent(f.id)+(ai.provider?'&provider='+ai.provider:'')+(ai.model?'&model='+encodeURIComponent(ai.model):'')); ctx.noteModel?.(r); }catch(e){ throw new Error(aiErrorMessage({network:true,offline:navigator.onLine===false})); }
    const d=await r.json().catch(()=>({}));
    if(state.sel!==f) return; if(!r.ok) throw new Error(aiErrorMessage({status:r.status,error:d.error}));
    box.innerHTML='<div class="lt">AI Project Brief</div><div class="btext">'+richText(d.brief)+'</div><div class="ssrc src">AI-written from the data on this page. Verify before relying on it.</div>'; wireCites(box); }
  catch(e){ if(state.sel===f) box.innerHTML='<div class="lt">AI Project Brief</div><div class="rnote">'+esc(e.message)+' <button class="lnk" id="briefBtn" type="button">Retry</button></div>', box.querySelector('#briefBtn').onclick=()=>loadBrief(f); }
}
// AI text -> safe HTML: escaped, paragraphs, [TABS…] citations become buttons that select the filing
function richText(t){ return textBlocks(esc(plainText(t||''))).replace(/\[(TABS[0-9A-Za-z-]+)\]/g,(m,id)=>BY_ID.has(id)?'<button class="cite" data-id="'+id+'">'+id+'</button>':id); }
function wireCites(el){ el.querySelectorAll('.cite').forEach(b=>b.onclick=()=>{ const f=BY_ID.get(b.dataset.id); if(f){ setView('map'); select(f,true); } }); }
const cardCloseHooks=[];
function clearSel(){ state.sel=null; syncHighlight(); [...listEl.querySelectorAll('.item')].forEach(b=>b.classList.remove('on')); }
function closeCard(){ if(cpOpening){ stopAllOrbits(); return; } // a report opening from the card: the card behind it stays selected
  cpush=null; cardCloseHooks.forEach(fn=>fn()); card.classList.remove('open','compact'); state.sel=null; scheduleHash(); syncHighlight(); [...listEl.querySelectorAll('.item')].forEach(b=>b.classList.remove('on')); }
function syncHighlight(){ if(map.getLayer&&map.getLayer('filings-hl')) map.setFilter('filings-hl',['==',['get','i'],state.sel?IDX.get(state.sel):-1]);
  const f=state.sel; map.getSource&&map.getSource('focus')?.setData(fc(f?[{type:'Feature',properties:{t:f.type,approx:f.approx?1:0,name:f.name.length>40?f.name.slice(0,38)+'…':f.name+(f.approx?' (approx.)':'')},geometry:{type:'Point',coordinates:[f.lon,f.lat]}}]:[])); }
// ---------- card "children": a report, a filing or a note opened from a property or filing card ----------
// It takes the card over, but the card it came from stays selected (highlight, tabs, scroll), and "← <name>" in the new
// card's header (or Esc) brings it back. Buttons that open one carry data-push; ctx.cardPush(reopen, label, run) does
// the same from code. While one opens, closeCard() only stops the orbit and the card tabs wait behind it.
let cpush=null, cpOpening=false, cpEnd=null;
const cardTopEl=()=>card.querySelector(':scope>.top');
function cardPushBegin(reopen,label){
  if(cpOpening) return null;
  const nested=!!cpush;
  if(!nested){ const t=ctx.tabs?.active(), r=reopen||t?.reopen; if(!r||!card.classList.contains('open')) return null;
    cpush={reopen:r,tabId:reopen?null:t.id,label:label||cardTopEl()?.querySelector('h2')?.textContent?.trim()||'Back',scroll:card.scrollTop}; }
  const top0=cardTopEl(); cpOpening=true;
  return ()=>{ cpOpening=false; if(!nested&&top0&&top0.isConnected){ cpush=null; return; } card.scrollTop=0; decorateBack(); if(cpush) cardStatus('Opened from '+cpush.label+'. Back or Esc returns to it.'); };
}
function cardPush(reopen,label,run){ const end=cardPushBegin(reopen,label); try{ run?.(); }finally{ end?.(); } }
card.addEventListener('click',e=>{ if(cpOpening||!e.target.closest?.('[data-push]')) return; cpEnd=cardPushBegin(); if(cpEnd) setTimeout(()=>{ if(cpEnd){ const f=cpEnd; cpEnd=null; f(); } },0); },true);
card.addEventListener('click',()=>{ if(cpEnd){ const f=cpEnd; cpEnd=null; f(); } });
const BACK='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>';
function decorateBack(){ if(!cpush||cpOpening) return; const head=cardTopEl()?.firstElementChild; if(!head||head.querySelector('.cback')) return;
  const b=document.createElement('button'); b.type='button'; b.className='cback'; b.innerHTML=BACK+'<span></span>'; b.querySelector('span').textContent=cpush.label; b.title='Back to '+cpush.label+' (Esc)';
  b.onclick=e=>{ e.stopPropagation(); cardBack(); }; head.prepend(b); }
new MutationObserver(decorateBack).observe(card,{childList:true});
// every card's × is the property card's icon button (reports, places and child cards wrote a bare "×" that rendered small and faint)
const X_ICON='<svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
new MutationObserver(()=>{ const x=card.querySelector(':scope>.top>.x'); if(x&&!x.firstElementChild&&x.textContent.trim()==='×') x.innerHTML=X_ICON; }).observe(card,{childList:true});
function cardBack(){ const p=cpush; if(!p) return false; cpush=null;
  if(!(p.tabId&&ctx.tabs?.reopen?.(p.tabId))) p.reopen();
  const y=p.scroll; requestAnimationFrame(()=>{ card.scrollTop=y; setTimeout(()=>{ if(card.scrollTop<y-2) card.scrollTop=y; },400); });
  cardStatus('Back to '+p.label+'.'); return true; }
// Esc: back to the card a report came from, else close the card. Not while typing, and not when something else (the
// Layers panel, a menu, the search box, Settings, a popup) already handled it: those call preventDefault. On window, so
// it runs after the page's own document-level handlers.
addEventListener('keydown',e=>{ if(e.key!=='Escape'||e.defaultPrevented||!card.classList.contains('open')) return;
  if(e.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
  if(card.classList.contains('sp-mode')) return; // a site plan is never closed by Esc: it steps back itself (src/siteplan.js), and × or Done closes it
  e.preventDefault(); if(!cardBack()) closeCard(); });
document.getElementById('sheetToggle').onclick=()=>panel.classList.toggle('up');

// hover + click on markers
const tip=document.getElementById('tip'), stage=document.getElementById('stage'), viewport=document.getElementById('viewport');
map.on('mousemove','filings',e=>{
  if(mode!=='pan') return; map.getCanvas().style.cursor='var(--cur-pointer)';
  const f=F[e.features[0].properties.i]; tip.innerHTML='<b></b><span></span>'; tip.querySelector('b').textContent=f.name;
  tip.querySelector('span').textContent=fmtM(f.cost)+' · '+TYPE_LABEL[f.type]+' · '+(f.city||f.county);
  let x=e.point.x+14, y=e.point.y+14; tip.style.opacity=1; const w=tip.offsetWidth; if(x+w>viewport.clientWidth-8) x=e.point.x-w-14; tip.style.left=x+'px'; tip.style.top=y+'px';
});
map.on('mouseleave','filings',()=>{ if(mode==='pan') map.getCanvas().style.cursor=''; tip.style.opacity=0; });
map.on('click','filings',e=>{ if(mode!=='pan') return; e.preventDefault(); ctx.tabs?.arm(e); select(F[e.features[0].properties.i],false); });
// Shift-drag is MapLibre's box zoom, and it swallows every Shift-click (even one that doesn't drag): hand a Shift-click back
// as a click, so Shift-click adds buildings, parcels, filings, planes and airports to the card's tabs (src/cardtabs.js)
map.on('boxzoomcancel',e=>{ const o=e.originalEvent; if(o?.type==='mouseup'&&o.shiftKey&&maplibregl.MapMouseEvent) map.fire(new maplibregl.MapMouseEvent('click',map,o)); });
map.on('click',e=>{ if(mode!=='pan' || e.defaultPrevented || swallowClick) return; const own=['filings',...(ctx.clickLayers||[])].filter(id=>map.getLayer(id)); if(own.length&&map.queryRenderedFeatures(e.point,{layers:own}).length) return; if(!ctx.mapClickHandlers.some(h=>h(e))) closeCard(); });

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
  pmenu.querySelector('[data-a=radius]').onclick=()=>{ hideMenu(); setMiles(1,false,true); setRadiusCenter(c,pinLabel(c),true); };
  pmenu.querySelector('[data-a=ask]').onclick=async()=>{ hideMenu(); const a=await spotAddress(c); ctx.assistant?.ask(spotQuestion(a||nearName(c),c,!!a)); };
  pmenu.querySelector('a').onclick=hideMenu;
}
const hideMenu=()=>pmenu.classList.remove('on');
// the street address at a right-clicked spot (MapTiler reverse geocoding), for "Ask AI about this spot"; null when there is none nearby
async function spotAddress(c){ try{
  if(!mtDown){ const r=await fetch('https://api.maptiler.com/geocoding/'+c[0]+','+c[1]+'.json?key='+MAPTILER_KEY+'&limit=1&types=address,poi',{signal:AbortSignal.timeout(2500)});
    if(r.ok){ const f=(await r.json())?.features?.[0]; return f?(f.place_name||f.text||'').replace(/, United States$/,'')||null:null; }
    if(!refused(r.status)) return null; setMtDown(); }
  const r=await fetch(photonReverseUrl(c),{signal:AbortSignal.timeout(2500)}), f=r.ok?fromPhoton(await r.json())[0]:null;
  return f&&/address|poi/.test(f.type)?f.t:null; }catch(e){ return null; } }
map.on('contextmenu',e=>{ e.preventDefault(); if(mode==='pan'&&!ctx.planOpen?.()) placeMenu(e.point,e.lngLat); }); // a site plan open: its own menu (src/siteplan.js)
{ let lp=0,start=null; // long-press on touch screens
  map.on('touchstart',e=>{ clearTimeout(lp); if(e.points.length!==1||mode!=='pan'||ctx.planOpen?.()) return; start=e.point; lp=setTimeout(()=>{ placeMenu(e.point,e.lngLat); swallowClick=true; },550); });
  map.on('touchmove',e=>{ if(start&&Math.hypot(e.point.x-start.x,e.point.y-start.y)>10) clearTimeout(lp); });
  map.on('touchend',()=>clearTimeout(lp)); }
document.addEventListener('pointerdown',e=>{ if(pmenu.classList.contains('on')&&!pmenu.contains(e.target)) hideMenu(); });
map.on('movestart',hideMenu);

// ---------- tools ----------
let mode='pan', draft=[], boxA=null, boxB=null;
const hintEl=document.getElementById('hint'), radiusEl=document.getElementById('radius');
const isTouch=window.matchMedia('(pointer: coarse)').matches;
const HINTS={area:'Drag a box over the area you want.'+(isTouch?'':' Esc to cancel.'),poly:isTouch?'Tap to drop points. Tap the first point to close the shape.':'Click to drop points. Click the first point or double-click to close. Backspace undoes. Esc to cancel.',county:'Click counties to add or remove them from the selection.'+(isTouch?'':' Esc to cancel.')};
function setMode(m){
  mode=m; draft=[]; boxA=null; drawDraft();
  document.querySelectorAll('.tools button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===m));
  syncModeUI(m);
  hintEl.textContent=HINTS[m]||''; hintEl.classList.toggle('on',!!HINTS[m]);
  radiusEl.classList.toggle('on',m==='radius'); if(m==='radius') setTimeout(()=>rq.focus(),30);
  stage.classList.toggle('m-draw',m!=='pan'); stage.dataset.dmode=m; // each drawing tool has its own cursor (src/cursors.js)
  if(m==='area') map.dragPan.disable(); else map.dragPan.enable();
  if(m==='poly') map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
  tip.style.opacity=0;
}
document.querySelectorAll('.tools button[data-mode]').forEach(b=>b.onclick=()=>{ setMode(b.dataset.mode); setSelSheet(false); });
// Phones: the five area tools fold into one "Select ▾" pill that opens them as a small sheet with their names; while a
// tool is in use a "Drawing a shape · Cancel" chip says so and gets back to moving the map.
const MODE_TXT={area:'Drawing a box',poly:'Drawing a shape',radius:'Radius search',county:'Picking counties'};
const selPill=document.getElementById('selPill'), modeChip=document.getElementById('modeChip');
function setSelSheet(on){ document.querySelector('.app').classList.toggle('sel-open',!!on); selPill?.setAttribute('aria-expanded',String(!!on)); }
function syncModeUI(m){ if(modeChip){ modeChip.hidden=m==='pan'||!MODE_TXT[m]; document.getElementById('modeChipT').textContent=MODE_TXT[m]||''; }
  if(!selPill) return; const ic=(m==='pan'?selIc0:document.querySelector('.tools button[data-mode="'+m+'"] svg'))?.cloneNode(true);
  if(ic){ ic.setAttribute('class','sp-ic'); selPill.querySelector('.sp-ic').replaceWith(ic); } selPill.classList.toggle('on',m!=='pan'); }
const selIc0=selPill?.querySelector('.sp-ic')?.cloneNode(true);
selPill&&(selPill.onclick=()=>setSelSheet(!document.querySelector('.app').classList.contains('sel-open')));
document.getElementById('selClose')?.addEventListener('click',()=>setSelSheet(false));
document.getElementById('modeCancel')?.addEventListener('click',()=>setMode('pan'));
document.addEventListener('pointerdown',e=>{ if(document.querySelector('.app').classList.contains('sel-open')&&!e.target.closest('#mapTools,#selPill')) setSelSheet(false); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&document.querySelector('.app').classList.contains('sel-open')){ e.preventDefault(); setSelSheet(false); } });
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
// drawn areas are named for where they are: "Box near Tomball", "Shape near Katy" (the nearest place we know, else the map's own name for the view)
const ringCenter=r=>{ let x=0,y=0; for(const p of r){ x+=p[0]; y+=p[1]; } return [x/r.length,y/r.length]; };
const nearName=c=>nearestPlace(c)||viewPlaceSafe();
const areaName=(kind,c)=>{ const n=nearName(c); return n?kind+' near '+n:kind; };
// a dropped pin: the nearest place by name; coordinates only where we know of none
const pinLabel=ll=>nearName(ll)||ll[1].toFixed(4)+', '+ll[0].toFixed(4);
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
  setSelection('area',areaName('Box',ringCenter(r)),ringFeature(r.slice(0,-1))); setMode('pan'); };
map.on('mouseup',endBox); map.on('touchend',endBox);
map.on('click',e=>{
  if(swallowClick){ swallowClick=false; return; }
  const ll=[e.lngLat.lng,e.lngLat.lat];
  if(mode==='poly'){
    if(draft.length>=3){ const f=map.project(draft[0]); if(Math.hypot(f.x-e.point.x,f.y-e.point.y)<14){ finishPoly(); return; } }
    draft.push(ll); drawDraft();
  } else if(mode==='county'){
    const c=countyGeo.find(x=>inArea(x.geom,ll)); if(!c){ toast('Click inside one of the seven counties.'); return; }
    const set=new Set(sel.kind==='county'?sel.counties:[]); set.has(c.name)?set.delete(c.name):set.add(c.name);
    if(!set.size){ clearSelection(); return; }
    setCountySel(set);
  } else if(mode==='radius'){ setRadiusCenter(ll,pinLabel(ll),false); }
});
map.on('dblclick',e=>{ if(mode==='poly'&&draft.length>=3){ e.preventDefault(); finishPoly(); } });
function setCountySel(set){ const names=COUNTIES.filter(n=>set.has(n));
  setSelection('county',names.length>2?names.length+' counties':names.join(' + ')+(names.length>1?' counties':' County'),{type:'MultiPolygon',coordinates:DATA.counties.filter(x=>set.has(x.name)).flatMap(x=>x.outline)},set); }
function finishPoly(){ const pts=draft.filter((p,i)=>i===0||d3.geoDistance(p,draft[i-1])>1e-7); draft=[]; drawDraft();
  if(pts.length<3){ toast('A shape needs at least three points.'); return; }
  setSelection('shape',areaName('Shape',ringCenter(pts)),ringFeature(pts)); setMode('pan'); }
document.addEventListener('keydown',e=>{
  // Esc: a shape in progress is dropped first; otherwise any area tool (box, shape, radius, county) goes back to Move
  if(e.key==='Escape'&&mode!=='pan'&&!e.defaultPrevented&&!document.getElementById('layers')?.classList.contains('on')){
    const t=e.target.closest?e.target:null, typing=t&&t.closest('input,select,textarea,[contenteditable="true"]')&&!t.closest('#radius');
    if(!typing&&!document.querySelector('details.vmenu[open]')){
      if(mode==='radius'&&e.target===rq&&sugs.length){ sugs=[]; renderSugs(); e.preventDefault(); return; } // the suggestions close first
      e.preventDefault(); if(draft.length||boxA){ draft=[]; boxA=null; boxB=null; drawDraft(); if(mode==='poly') return; } setMode('pan'); return; } }
  if(e.target.closest&&e.target.closest('input,select,textarea')) return;
  if(mode==='poly'&&draft.length){ if(e.key==='Enter'){e.preventDefault(); finishPoly();} else if(e.key==='Backspace'){e.preventDefault(); draft.pop(); drawDraft();} } });
// the box around an area's own coordinates: d3.geoBounds reads a ring wound the "wrong" way (drive-time bands, circles)
// as the whole world minus the area, which zoomed the map all the way out
function fitGeom(g){ g=g?.geometry||g; let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const walk=c=>{ if(typeof c[0]==='number'){ x0=Math.min(x0,c[0]); x1=Math.max(x1,c[0]); y0=Math.min(y0,c[1]); y1=Math.max(y1,c[1]); } else c.forEach(walk); };
  if(g?.coordinates) walk(g.coordinates); else if(g?.geometries) g.geometries.forEach(x=>walk(x.coordinates)); if(!isFinite(x0)) return;
  safeFit([[x0,y0],[x1,y1]],{padding:80}); }

// ---------- radius search (MapTiler geocoding + local index) ----------
const rq=document.getElementById('rq'), rsug=document.getElementById('rsug'), rmi=document.getElementById('rmi'), rrange=document.getElementById('rrange');
const MAX_MI=60; // the slider, the number box and links all stop here
rrange.max=rmi.max=MAX_MI;
let radiusMiles=3, sugs=[], sugI=-1, picked=false, geoCtl={};
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
  // each box has its own slot (o.slot; the radius box is 'radius'): a newer request cancels the older one in the same slot only
  let ctl; if(!o.exact&&!o.world){ const k=o.slot||'radius'; geoCtl[k]?.abort(); ctl=geoCtl[k]=new AbortController(); }
  const c=map.getCenter(), prox=o.exact||o.world?c.lng.toFixed(4)+','+c.lat.toFixed(4):'-95.9,30.0', bbox=o.exact?'-106.7,25.8,-93.5,36.5':'-97.6,28.6,-94.2,31.4';
  const u='https://api.maptiler.com/geocoding/'+encodeURIComponent(q)+'.json?key='+MAPTILER_KEY+'&limit='+(o.limit||6)+'&proximity='+prox+'&autocomplete='+!(o.exact||o.world)+(o.world?'':'&country=us&bbox='+bbox);
  const c2=ctl||new AbortController(), tm=setTimeout(()=>c2.abort(),8000); // a geocoder that hangs must not hang the assistant
  try{
    if(!mtDown){ const r=await fetch(u,{signal:c2.signal});
      if(r.ok){ const d=await r.json(); clearTimeout(tm);
        return (d.features||[]).map(f=>({t:(f.place_name||f.text||'').replace(/, United States$/,''),name:f.text||'',type:(f.place_type&&f.place_type[0])||'place',k:(f.place_type&&f.place_type[0]==='address')?'Address':((f.place_type&&f.place_type[0])||'Place').replace(/^\w/,c=>c.toUpperCase()),c:f.center,bbox:f.bbox})); }
      if(!refused(r.status)) return []; setMtDown(); }
    // MapTiler is out: Photon (OpenStreetMap), same region box and bias
    const r=await fetch(photonSearchUrl(q,{limit:o.limit||6,prox,bbox:o.world?'':bbox}),{signal:c2.signal}); if(!r.ok) return []; const d=await r.json(); clearTimeout(tm);
    return fromPhoton(d); }
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
function setMiles(v,fromRange,silent){ v=Math.max(0.1,Math.min(MAX_MI,+v||0)); radiusMiles=v; if(!fromRange) rrange.value=v; rmi.value=v;
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
const layersEl=document.getElementById('layers'), layersBtn=document.getElementById('layersBtn'), layersOpen=document.getElementById('layersOpen');
// The [Layers · N] button in the map's tool row opens the panel right under it. #layersBtn (hidden, in the camera rail) stays
// as the trigger other code clicks (phone More › Layers, Settings › Map layers). On phones the panel is a bottom sheet.
function placeLayers(){ const a=layersOpen&&layersOpen.offsetParent?layersOpen:null;
  if(!layersEl.classList.contains('on')||!a||matchMedia('(max-width:700px)').matches){ layersEl.style.removeProperty('--ly-top'); layersEl.style.removeProperty('--ly-left'); return; }
  const host=layersEl.offsetParent?.getBoundingClientRect(), q=a.getBoundingClientRect(); if(!host||!q.height) return;
  // keep the panel inside the controls' column (#mapleft), so it doesn't spill over the camera rail or the assistant drawer
  const ml=document.getElementById('mapleft').getBoundingClientRect(), maxL=Math.max(ml.left,ml.right-(layersEl.offsetWidth||320))-host.left;
  layersEl.style.setProperty('--ly-top',Math.round(q.bottom-host.top+8)+'px'); layersEl.style.setProperty('--ly-left',Math.round(Math.max(16,Math.min(q.left-host.left,maxL,host.width-336)))+'px'); }
function setLayersOpen(on){ const was=layersEl.classList.contains('on'); layersEl.classList.toggle('on',on); layersBtn.setAttribute('aria-expanded',on); layersOpen?.setAttribute('aria-expanded',on); layersOpen?.classList.toggle('open',on);
  if(on&&!was){ try{ ctx.openLayerGroups?.(); }catch(e){} layersEl.scrollTop=0; } placeLayers(); }
layersBtn.onclick=e=>{ e.stopPropagation(); setLayersOpen(!layersEl.classList.contains('on')); };
layersOpen&&(layersOpen.onclick=e=>{ e.stopPropagation(); setLayersOpen(!layersEl.classList.contains('on')); });
document.getElementById('layersX')?.addEventListener('click',()=>{ setLayersOpen(false); layersOpen?.offsetParent&&layersOpen.focus({preventScroll:true}); });
document.getElementById('layersDone')?.addEventListener('click',()=>setLayersOpen(false));
addEventListener('resize',placeLayers); if(layersOpen&&window.ResizeObserver) new ResizeObserver(placeLayers).observe(document.getElementById('mapleft'));
let swallowClick=false;
document.addEventListener('pointerdown',e=>{ if(layersEl.classList.contains('on')&&!layersEl.contains(e.target)&&!layersBtn.contains(e.target)&&!layersOpen?.contains(e.target)){ setLayersOpen(false); if(map.getCanvas().contains(e.target)) swallowClick=true; } });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&layersEl.classList.contains('on')){ e.preventDefault(); setLayersOpen(false); } });
document.querySelectorAll('#styleSeg button').forEach(b=>{ if(BASES[b.dataset.style]) b.textContent=BASES[b.dataset.style]; /* one list of base-map names, shared with Settings */ b.onclick=()=>setBasemap(b.dataset.style); b.setAttribute('aria-pressed',b.dataset.style===layers.style); });
document.querySelectorAll('#sizeSeg button').forEach(b=>b.onclick=()=>{ layers.size=b.dataset.size; saveLayers(); styleFilings(); });
document.querySelectorAll('#heatSeg button').forEach(b=>b.onclick=()=>{ layers.heat=b.dataset.heat; saveLayers(); styleFilings(); });
document.getElementById('lyFilings').onchange=e=>{ layers.dots=e.target.checked; saveLayers(); styleFilings(); if(!map.getLayer('filings')) syncLegend(); };
syncLegend();
function showFilings(){ if(layers.dots) return; layers.dots=true; saveLayers(); const lf=document.getElementById('lyFilings'); if(lf) lf.checked=true; if(map.getLayer('filings')) styleFilings(); else syncLegend(); syncQL(); }
// on the map at all: dots or the heatmap (the Filings quick button shows either, and turns both off)
const filingsShown=()=>layers.dots||layers.heat!=='off';
function setFilingsShown(v){ layers.dots=!!v; if(!v) layers.heat='off'; saveLayers(); const lf=document.getElementById('lyFilings'); if(lf) lf.checked=layers.dots; if(map.getLayer('filings')) styleFilings(); else syncLegend(); syncQL(); }
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
document.getElementById('lyGrid').checked=layers.grid; document.getElementById('lyGrid').onchange=e=>setGrid(e.target.checked);
document.getElementById('lyCounties').onchange=e=>{ layers.counties=e.target.checked; ['county-line','county-label','us-county-line','us-county-precise','us-state-line','us-county-label'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',layers.counties?'visible':'none')); syncPrecise(); };
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
// Reset view ▾: Whole region (#home, which the assistant clicks for "show the whole region") and Globe (#orbit)
const resetBtn=document.getElementById('resetView'), resetPop=document.getElementById('resetPop');
const setResetOpen=on=>{ resetPop.hidden=!on; resetBtn.setAttribute('aria-expanded',String(on)); resetBtn.classList.toggle('open',on); if(on) resetPop.querySelector('button')?.focus({preventScroll:true}); };
resetBtn.onclick=e=>{ e.stopPropagation(); setResetOpen(resetPop.hidden); };
document.addEventListener('pointerdown',e=>{ if(!resetPop.hidden&&!e.target.closest('#resetMenu')) setResetOpen(false); });
resetPop.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); setResetOpen(false); resetBtn.focus(); } });
document.getElementById('home').onclick=()=>{ if(!resetPop.hidden) setResetOpen(false); stopAllOrbits(); map.flyTo({...HOME,pitch:0,bearing:0,roll:0,duration:reduceMotion?0:1200}); };
document.getElementById('orbit').onclick=()=>{ if(!resetPop.hidden) setResetOpen(false); stopAllOrbits(); map.flyTo({center:[-93,26],zoom:2.2,pitch:0,bearing:0,roll:0,duration:reduceMotion?0:1600}); };

// ---------- toast ----------
const toastEl=document.getElementById('toast'); let toastT=0;
// toast(text) or toast(text, {action:{label, run}}): with an action the note carries a button and stays a little longer
function toast(m,o={}){ toastEl.textContent=m; const a=o.action; toastEl.classList.toggle('act',!!a);
  if(a){ const b=document.createElement('button'); b.type='button'; b.textContent=a.label; b.onclick=()=>{ toastEl.classList.remove('on','act'); a.run(); }; toastEl.append(' ',b); }
  toastEl.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>toastEl.classList.remove('on','act'),o.ms||(a?6500:3400)); }
// Tab and Shift+Tab stay inside an open dialog (Settings, Export): past the last control back to the first, and the reverse
function trapTab(box,e){ if(e.key!=='Tab'||!box) return;
  const f=[...box.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null); if(!f.length) return;
  const first=f[0], last=f[f.length-1], a=document.activeElement;
  if(e.shiftKey&&(a===first||a===box||!box.contains(a))){ e.preventDefault(); last.focus(); } else if(!e.shiftKey&&(a===last||!box.contains(a))){ e.preventDefault(); first.focus(); } }
function clearToast(){ clearTimeout(toastT); toastEl.classList.remove('on','act'); } // a mode changed: its old instruction goes

// ---------- export ----------
const fmtD=s=>new Date(s+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const PERIOD=fmtD(DATA.period.start)+' – '+fmtD(DATA.period.end), today=new Date(), stamp=today.toISOString().slice(0,10);
const slug=s=>(s||'all-filings').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'selection';
const scopeLabel=()=>sel.feature?sel.label:'All filings shown';
function filterText(){ const t=describe(curSpec(false),fmtM); const mo=state.month?'Under construction '+monthLabel(state.month):''; return [t,mo].filter(Boolean).join(' · '); }
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
const csvText=(rows,pre=[])=>{ if(!rows.length) return ''; const cols=Object.keys(rows[0]), q=v=>{ const s=String(v==null?'':v); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; };
  return '\ufeff'+[...pre.map(r=>r.map(q).join(',')),cols.join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\r\n'); };
const fileBase=(kind,label)=>'fs-'+kind+'-'+slug(label||scopeLabel())+'-'+stamp;
function exportCsv(rows,name,pre){ saveFile(name+'.csv',csvText(rows,pre),'text/csv'); } // pre: [[...cells]] lines above the header (e.g. a filters line)
// Excel: one or more sheets [{name, rows|aoa, link}] (link: column holding a URL to hyperlink)
function exportXlsx(sheets,name){
  if(!window.XLSX){ toast('Getting Excel export ready…'); loadXlsx().then(()=>exportXlsx(sheets,name),()=>toast('Excel export couldn’t load. Check your connection and try again.')); return; }
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
document.getElementById('selClear').onclick=()=>{ clearSelection(); setMode('pan'); }; // whichever tool made the area is done with: the radius dialog closes too
// the filings on a street map, framed on the selection (or the filings), for the Summary report
function reportMap(list){
  const pts=list.slice().sort((a,b)=>b.cost-a.cost).map(f=>{ const col=f.type==='New'?'#006527':f.type==='Reno'?'#6b7174':'#1f9249';
    return {c:[f.lon,f.lat],r:+Math.max(2.5,Math.min(14,2+Math.sqrt(f.cost/1e6)*1.2)).toFixed(1),color:col,o:f.type==='New'?.85:.7,hollow:f.type==='Addition'||!!f.approx}; });
  if(sel.kind==='radius'&&sel.center) pts.push({c:sel.center,r:6,color:'#006527'});
  const fit=sel.feature||(list.length?{type:'MultiPoint',coordinates:list.map(f=>[f.lon,f.lat])}:{type:'MultiPolygon',coordinates:DATA.counties.flatMap(c=>c.outline)});
  return areaMap(sel.feature?[{geometry:sel.feature,stroke:'#006527',fill:'rgba(0,101,39,.08)',dash:true}]:[],{W:1000,H:560,fit,points:pts});
}

// ---------- views ----------
let view='map'; const appEl=document.querySelector('.app'), viewHooks={}, viewChangeHooks=[], cardRenderHooks=[];
function setView(v,{user}={}){
  // every page id works (#v=who, #v=projects, saved reports, the assistant); a group id (filings, marketgrp, work) opens its last-used page
  if(!document.getElementById('view-'+v)&&v!=='map') v=leafFor(v);
  if(!document.getElementById('view-'+v)&&v!=='map') v='map'; const was=view;
  // "← Back to <page>": only when the user clicked something on the page (or on the card over it) that lands on the Map;
  // the app bar, the assistant, links and boot never leave one. Any other page choice clears it.
  if(v==='map'&&was!=='map'){ if(user??(pageAct&&pageAct.from===was&&performance.now()-pageAct.t<1500)) setBack(was); }
  else if(v!=='map') setBack(null);
  pageAct=null; if(v!==was) closeFilters(); view=v; if(v!==was&&v!==prevView) prevView=was;
  syncNavTabs(v); // app bar tab, sub-tab row (src/nav.js)
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('on',el.id==='view-'+v));
  stage.dataset.view=v; appEl.dataset.view=v; // pages (not the Map) hide the list panel and use the full width (app.css)
  // the map is wider on a page (no panel); resize it now, not on the next tick, so a fit/fly that follows this call
  // (Compare's "go", "show on map", the assistant) is measured against the map's real width
  if(v==='map'){ appEl.classList.remove('pview-open'); if(was!=='map') map.resize(); setTimeout(()=>map.resize(),0); } else viewHooks[v]?.();
  if(v==='changes') changesSeen();
  viewChangeHooks.forEach(fn=>fn(v));
  syncTitle(); const moved=v!==was; scheduleHash(moved&&!popping);
  if(moved&&!navBoot) pageArrived(v);
}
let pageAct=null, back=null, prevView=null, popping=false;
// boot switches pages without announcing them; navKb: this navigation came from a keyboard press on a nav button
let navBoot=false, navKb=false;
document.addEventListener('click',e=>{ navKb=e.isTrusted&&e.detail===0&&!!e.target.closest?.('#viewbar,#vtabs,#helpBtn,#mnav,#msheet'); if(navKb) setTimeout(()=>{ navKb=false; }); },true); // Enter/Space clicks have detail 0
// say which page opened; from the keyboard, focus lands on its heading (mouse and touch users keep their place)
function pageArrived(v){ cardStatus((document.getElementById('view-'+v)?.getAttribute('aria-label')||labelOf(v))+' page'); if(!navKb) return; navKb=false;
  requestAnimationFrame(()=>{ if(view!==v) return; const sec=document.getElementById('view-'+v);
    const h=v==='map'?map.getCanvas():sec&&(sec.querySelector('h1,h2')||sec); if(!h) return;
    if(h!==map.getCanvas()&&!h.hasAttribute('tabindex')){ h.setAttribute('tabindex','-1'); h.classList.add('pg-focus'); } h.focus({preventScroll:true}); }); }
// My Work › Projects: the project page follows the address (#pj=) on Back/Forward
function syncProject(pj,pt){ if(view!=='projects') return; const cur=ctx.currentProject?.()??ctx.sitePlan?.where?.project??null;
  if(cur===(pj||null)){ const t=ctx.sitePlan?.where?.tab; if(pj&&t&&t!==(pt||DEFAULT_TAB)) ctx.sitePlan.show(pj,pt||DEFAULT_TAB); return; } // the same project, another tab (#pt= edited or pasted)
  if(ctx.openProject) ctx.openProject(pj||null,pt); else if(pj) ctx.sitePlan?.show?.(pj,pt); }
// the tab title names the page ("Reports · Real Estate Intelligence Platform"), so history and tab lists make sense
const APP_NAME='Real Estate Intelligence Platform';
function syncTitle(){ document.title=pathOf(view)+' · '+APP_NAME; }
// the ? button: opens Data & help, and (pressed) goes back to the page it was opened from
function helpToggle(){ if(view==='sources') setView(prevView&&prevView!=='sources'?prevView:'map'); else setView('sources'); }
// a click anywhere else (the app bar's Map tab, the phone tab bar, the assistant) forgets the page click, so it can't leave a chip
document.addEventListener('click',e=>{ if(e.isTrusted) pageAct=view!=='map'&&e.target.closest?.('.view,#card')?{t:performance.now(),from:view}:null; },true);
const backEl=document.createElement('div'); backEl.className='backchip'; backEl.hidden=true;
backEl.innerHTML='<button type="button" class="bk-go"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8H3.5M7.5 3.5 3 8l4.5 4.5"/></svg><span></span></button><button type="button" class="bk-x" aria-label="Dismiss"><svg width="12" height="12" viewBox="0 0 16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>';
document.getElementById('viewport').appendChild(backEl);
function setBack(from){
  if(!from){ back=null; backEl.hidden=true; appEl.classList.remove('has-back'); return; }
  const sec=document.getElementById('view-'+from); // read the scroll positions now, before the page is hidden
  back={from,top:sec?.scrollTop||0,inner:[...(sec?.querySelectorAll('.g-scroll')||[])].map(el=>el.scrollTop)};
  backEl.querySelector('span').textContent='Back to '+labelOf(from); backEl.hidden=false; appEl.classList.add('has-back');
}
backEl.querySelector('.bk-go').onclick=()=>{ const b=back; if(!b) return; setView(b.from);
  const put=()=>{ const sec=document.getElementById('view-'+b.from); if(!sec) return; sec.scrollTop=b.top; sec.querySelectorAll('.g-scroll').forEach((el,i)=>{ if(b.inner[i]!=null) el.scrollTop=b.inner[i]; }); };
  put(); requestAnimationFrame(()=>{ put(); setTimeout(put,120); }); };
backEl.querySelector('.bk-x').onclick=()=>setBack(null);
// Changes badge: filings new or changed in nightly checks since you last opened Changes (all of this week's on a first visit)
const CHG_SEEN='fs-chg-seen';
function changesBadge(){
  let seen=null; try{ seen=localStorage.getItem(CHG_SEEN); }catch(e){}
  const ids=new Set(); for(const r of DATA.changes.runs||[]){ if(seen&&r.built<=seen) break; for(const x of r.items) if(CHANGED.has(x.id)) ids.add(x.id); }
  ctx.setBadge('changes',ids.size,{alert:true,roll:false,title:'New and changed filings since your last visit'}); // on the Changes sub-tab only, not the Filings tab
}
function changesSeen(){ const last=DATA.changes.runs?.[0]?.built; if(!last) return; try{ localStorage.setItem(CHG_SEEN,last); }catch(e){} changesBadge(); }

// ---------- month slider (map) ----------
const tRange=document.getElementById('tRange'), tLabel=document.getElementById('tLabel'), tPlay=document.getElementById('tPlay'), tsl=document.getElementById('tslider');
const MONTHS=(()=>{ const a=new Date(DATA.period.start.slice(0,7)+'-01T00:00:00Z'), maxEnd=F.reduce((m,f)=>f.te>m?f.te:m,''), cap=ym(new Date(Date.now()+3*365*864e5)), out=[];
  for(let d=a; ym(d)<=(maxEnd.slice(0,7)<cap?maxEnd.slice(0,7):cap); d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1))) out.push(ym(d)); return out.length?out:[ym(new Date())]; })();
tRange.max=MONTHS.length-1; tRange.value=Math.max(0,MONTHS.indexOf(ym(new Date())));
let playT=null;
// Time-lapse: "Play by month" sits on the Filings row in Map layers and on the Filings legend. It puts the filings on the
// map first, then plays month by month; the month shows as a removable chip under the map's layer buttons.
const syncTimeBtns=()=>{ const on=tsl.classList.contains('show'); document.querySelectorAll('[data-timelapse]').forEach(b=>{ b.setAttribute('aria-pressed',String(on)); const sp=b.querySelector('span'); if(sp) sp.textContent=on?'Stop time-lapse':'Play by month'; b.querySelector('path')?.setAttribute('d',on?'M2.5 2.5h7v7h-7z':'M3 1.5v9l7-4.5z'); }); };
function showTime(on){ tsl.classList.toggle('show',on); syncTimeBtns(); if(!on){ stopPlay(); if(state.month) setMonth(null); } }
function startTimelapse(){ showFilings(); if(ctx.view!=='map') setView('map'); showTime(true); if(!playT) tPlay.click(); }
document.addEventListener('click',e=>{ const b=e.target.closest('[data-timelapse]'); if(!b) return; if(tsl.classList.contains('show')) showTime(false); else startTimelapse(); });
function setMonth(m){ state.month=m; tsl.classList.toggle('on',!!m); if(m&&!tsl.classList.contains('show')){ tsl.classList.add('show'); syncTimeBtns(); } tLabel.textContent=m?'Under construction · '+monthLabel(m):'Under construction by month'; if(m) tRange.value=MONTHS.indexOf(m); applyFilters(); }
let tT; tRange.oninput=()=>{ cancelAnimationFrame(tT); tT=requestAnimationFrame(()=>setMonth(MONTHS[+tRange.value])); };
document.getElementById('tClear').onclick=()=>showTime(false);
function stopPlay(){ clearInterval(playT); playT=null; tPlay.classList.remove('on'); tPlay.setAttribute('aria-label','Play through months'); }
tPlay.onclick=()=>{ if(playT){ stopPlay(); return; } tPlay.classList.add('on'); tPlay.setAttribute('aria-label','Pause');
  let i=state.month?MONTHS.indexOf(state.month):0; if(i>=MONTHS.length-1) i=0; setMonth(MONTHS[i]);
  playT=setInterval(()=>{ i++; if(i>=MONTHS.length){ stopPlay(); return; } setMonth(MONTHS[i]); },reduceMotion?1600:850); };

// ---------- URL state (shareable links, saved searches) ----------
let hashT=0, booting=true;
// the address carries the filters, the page (v=) and an open card. A copied link adds "ml" (map center and zoom) when
// nothing is selected. The live address (o.live) also keeps where you are, so a reload comes back to it: the camera
// (ml=lat,lng,zoom[,bearing,pitch]), an open property card (b=lat,lng), the open site plan (sp=project.plan) or the
// project on the Projects page (pj=). Saved searches and copied links leave those out.
const LAST_KEY='fs-last-hash';
let camReady=false; // the camera goes in the address only once the map has been put somewhere (not the whole-world start before the fly-in)
const camStr=()=>{ const c=map.getCenter(); return camFmt({lat:c.lat,lng:c.lng,zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()}); };
function hashStr({map:withMap=false,live=false}={}){ const p=new URLSearchParams(encode(curSpec())); if(state.month) p.set('m',state.month); if(view!=='map') p.set('v',view); if(state.sel) p.set('f',state.sel.id);
  if(withMap&&!sel.feature&&!state.sel&&view==='map'){ const c=map.getCenter(); p.set('ml',[c.lat.toFixed(5),c.lng.toFixed(5),map.getZoom().toFixed(2)].join(',')); }
  if(live){ const w=ctx.sitePlan?.where||{};
    const pj=w.project||(view==='projects'&&ctx.currentProject?.()); if(w.plan) p.set('sp',w.plan); else if(pj){ p.set('pj',pj); if(w.tab&&w.tab!==DEFAULT_TAB) p.set('pt',w.tab); } // pt: the project page's tab (none: the first, Feasibility)
    if(view==='map'){ const b=!state.sel&&!w.plan&&ctx.currentBuilding?.(); if(b?.center) p.set('b',b.center[1].toFixed(6)+','+b.center[0].toFixed(6)); }
    if(camReady) p.set('ml',camStr()); } // on every page, so coming back to the map after a reload finds it where it was
  return p.toString(); }
// a new page is a new history entry (so the browser's Back button steps back through pages and then leaves the app);
// filter, card and map moves only rewrite the current entry. The last address is also kept on this device, so the bare
// page (the installed app opening, a bookmark) comes back to it.
function commitHash(push){ const h=hashStr({live:true}), url=h?'#'+h:location.pathname+location.search;
  try{ push?history.pushState(null,'',url):history.replaceState(null,'',url); }catch(e){}
  try{ localStorage.setItem(LAST_KEY,h); }catch(e){}
  document.getElementById('rssLink').href='api/feed?'+encode(curSpec()); }
function scheduleHash(o=false){ if(booting) return; const push=typeof o==='object'?!!o?.push&&!popping:!!o; clearTimeout(hashT); if(push){ commitHash(true); return; } hashT=setTimeout(()=>commitHash(false),250); } // push: a boolean, or {push} (src/siteplan.js)
// Back / Forward: show the page (and the project on the Projects page) the address names, without adding history
addEventListener('popstate',()=>{ if(booting) return; const p=new URLSearchParams(location.hash.slice(1)), v=p.get('v')||'map';
  popping=true; try{ if(v!==view) setView(v); syncProject(p.get('pj'),p.get('pt')); }finally{ popping=false; } });
document.getElementById('copyLink').onclick=async()=>{ const u=location.href.split('#')[0]+'#'+hashStr({map:true}); try{ await navigator.clipboard.writeText(u); toast('Link copied. It opens with these filters.'); }catch(e){ prompt('Copy this link',u); } };

// ---------- the Map panel: pick buttons, "…" menu, links, first-visit tip ----------
// no area yet: Box / Shape / Radius / County start the same tools as the map's toolbar (on a phone, from the Map tab)
document.querySelectorAll('#selPick [data-pick]').forEach(b=>b.onclick=()=>{
  if(matchMedia('(max-width:700px)').matches) document.querySelector('#mnav [data-tab=map]')?.click();
  setMode(b.dataset.pick); });
{ const menu=document.getElementById('scopeMenu'), form=document.getElementById('saveForm'), nameEl=document.getElementById('saveName');
  // the menu opens fresh each time: the name field only after "Save search"
  menu.addEventListener('toggle',()=>{ if(!menu.open) form.hidden=true; });
  document.getElementById('saveSearch').addEventListener('click',e=>{ e.stopPropagation(); // keep the menu open for the name field
    noErr(); form.hidden=false; nameEl.value=filterChips({area:true}).filter(c=>!c.fixed).map(c=>c.label.replace(/^Area: /,'')).join(' · ').slice(0,60)||'All filings'; nameEl.focus(); nameEl.select(); });
  const errEl=document.getElementById('saveErr'), noErr=()=>{ errEl.hidden=true; nameEl.removeAttribute('aria-invalid'); };
  nameEl.addEventListener('input',noErr);
  form.onsubmit=e=>{ e.preventDefault(); const name=nameEl.value.trim(); if(!name){ errEl.hidden=false; nameEl.setAttribute('aria-invalid','true'); nameEl.focus(); return; } if(ctx.saveSearch?.(name)===false) return; menu.open=false; };
  nameEl.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.stopPropagation(); form.hidden=true; document.getElementById('saveSearch').focus(); } }); }
document.getElementById('rssLink').addEventListener('click',e=>{ if(e.currentTarget.getAttribute('aria-disabled')==='true') e.preventDefault(); });
document.getElementById('savedAll').onclick=()=>setView('saved');
document.getElementById('arepAll').onclick=()=>setView('reports');
document.getElementById('footSources').onclick=()=>setView('sources');
const INTRO='fs-tip-intro', introEl=document.getElementById('introTip');
try{ introEl.hidden=localStorage.getItem(INTRO)==='1'; }catch(e){ introEl.hidden=false; }
document.getElementById('introTipOk').onclick=()=>{ introEl.hidden=true; try{ localStorage.setItem(INTRO,'1'); }catch(e){} };
// Data & help › Getting started: the tip again, at the top of the Map panel
function showIntro(){ try{ localStorage.removeItem(INTRO); }catch(e){} introEl.hidden=false; setView('map');
  if(matchMedia('(max-width:700px)').matches) document.querySelector('#mnav [data-tab=list]')?.click();
  else if(appEl.classList.contains('pcollapsed')) document.getElementById('panelToggle')?.click();
  panel.scrollTop=0; requestAnimationFrame(()=>document.getElementById('introTipOk').focus({preventScroll:true})); }

// ---------- modules ----------
if(/[?&]debug\b/.test(location.search)) window.fsDebug=()=>ctx;
const ctx={ DATA,F,BY_ID,CHANGED,COUNTIES,TYPES,TYPE_LABEL,state,sel,map,
  get visible(){ return visible; }, get visibleNoWho(){ return visibleNoWho; }, get view(){ return view; },
  applyFilters,fromSpec,curSpec,select,setView,setMonth,monthLabel,filterText,richText,wireCites,toast,clearToast,trapTab,esc,fmtM,fmtN,C,geocode,hashStr,
  onChange:fn=>listeners.push(fn), onCardClose:fn=>cardCloseHooks.push(fn), onViewChange:fn=>viewChangeHooks.push(fn), onCardRender:fn=>cardRenderHooks.push(fn), cardRendered:info=>cardRenderHooks.forEach(fn=>fn(info)), onSave:fn=>saveHooks.push(fn), mapClickHandlers:[], clickLayers:[], setRadiusCenter, setMiles, fitGeom, fitBox, coverPad, saveFile, card, panel, closeCard, clearSelection:clearSel, get reduceMotion(){ return reduceMotion; }, onView:(v,fn)=>{ viewHooks[v]=fn; }, onOverlays:fn=>overlayHooks.push(fn), tip, viewport };
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
  try{ let f=null;
    if(!mtDown){ const r=await fetch('https://api.maptiler.com/geocoding/'+k+'.json?key='+MAPTILER_KEY+'&limit=1&types=place,municipality,locality,county,region,country');
      if(r.ok){ f=(await r.json())?.features?.[0]; f=f&&{t:(f.place_name||f.text||'').replace(/, United States$/,'')}; } else if(refused(r.status)) setMtDown(); }
    if(mtDown){ const r=await fetch(photonReverseUrl([c.lng,c.lat])), p=r.ok?fromPhoton(await r.json())[0]:null; // the town around the spot, not the house
      f=p&&{t:p.t.split(', ').slice(p.type==='address'||p.type==='poi'||p.type==='street'?1:0).join(', ')}; }
    farLabel=f?.t||null; farCache.set(k,farLabel); }catch(e){ farLabel=null; } },600); });
function screenContext(){
  const c=map.getCenter(), b=map.getBounds(), z=map.getZoom(), near=nearestPlace([c.lng,c.lat])||farLabel;
  const inView=visible.filter(f=>f.lon>=b.getWest()&&f.lon<=b.getEast()&&f.lat>=b.getSouth()&&f.lat<=b.getNorth());
  const top=inView.slice().sort((a,b)=>b.cost-a.cost).slice(0,8).map(f=>f.id+' '+f.name.slice(0,60)+' ('+(f.use||TYPE_LABEL[f.type])+', est. '+fmtM(f.cost)+', '+(f.city||f.county)+')');
  const lines=['View: '+(view==='map'?'map':view+' tab ('+pathOf(view)+')')+'; map centered '+c.lat.toFixed(4)+', '+c.lng.toFixed(4)+(near?' (near '+near+')':'')+', zoom '+z.toFixed(1)+(z>=14?' (street level, 3D buildings visible)':z>=11?' (neighborhood)':z>=8?' (city/county)':' (region)')+(map.getPitch()>20?', tilted 3D':'')+(orbitRaf?', orbiting':''),
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
ctx.cardPush=cardPush; ctx.cardBack=cardBack; ctx.cardChild=()=>cpush?(cpOpening?'opening':'open'):null; ctx.cardChildDrop=()=>{ cpush=null; }; ctx.cardActs=cardActs; ctx.cardStatus=cardStatus; ctx.copyCardLink=copyCardLink; ctx.SPARK=SPARK;
ctx.setMode=setMode; ctx.helpToggle=helpToggle; ctx.setFilingsOpen=setFilingsOpen; ctx.showIntro=showIntro; ctx.filterChips=filterChips; ctx.scopeBar=scopeBar; ctx.resetFilings=resetFilings; ctx.vempty=vempty; ctx.exportMenu=exportMenu; ctx.openFilters=o=>openFilters(o); ctx.closeFilters=()=>closeFilters(); ctx.syncClear=syncClear; ctx.syncFilterUI=()=>syncFilterUI(); ctx.fitBox=fitBox;
// map legends (bottom left, next to the Filings one): any layer that colours its data adds one while it's on
ctx.setLegend=(id,html)=>{ const box=document.querySelector('.legends'); if(!box) return; let el=box.querySelector('[data-lg="'+id+'"]');
  if(!html){ el?.remove(); return; } if(!el){ el=document.createElement('div'); el.className='xlegend'; el.dataset.lg=id; box.appendChild(el); } if(el.innerHTML!==html) el.innerHTML=html; };
// One Legend card: every legend above is a section with its title as a header row. One section is open at a time (the
// newest layer's, until you pick another); the chevron folds the whole card to its header. Filings shows at every width.
{ const box=document.getElementById('legends'), tog=document.getElementById('lgToggle'), head=box?.querySelector('.lg-h b'); let open=null, seen=new Set(), raf=0, min=false, held=null;
  try{ min=localStorage.getItem('fs-legend-min')==='1'||(localStorage.getItem('fs-legend-min')==null&&matchMedia('(max-width:700px)').matches); }catch(e){}
  const keyOf=el=>el.dataset.lg||(el.id==='dLegend'?'demo':'');
  const shown=el=>el.classList.contains('dlegend')?el.classList.contains('on'):el.classList.contains('legend')?(document.documentElement.dataset.filings!=='off'||el.classList.contains('heat')):true;
  const sync=()=>{ raf=0; if(!box) return; const all=[...box.querySelectorAll(':scope>.legend,:scope>.dlegend,:scope>.xlegend')], vis=all.filter(shown), keys=vis.map(keyOf);
    const fresh=keys.filter(k=>!seen.has(k)); seen=new Set(keys); if(fresh.length&&!booting) open=fresh[fresh.length-1]; if(!keys.includes(open)) open=keys[keys.length-1]||null;
    for(const el of all){ const k=keyOf(el), t=el.querySelector(':scope>.t'); el.classList.toggle('lg-open',k===open||vis.length===1); el.classList.toggle('lg-one',vis.length===1);
      if(t&&!t.hasAttribute('tabindex')){ t.setAttribute('tabindex','0'); t.setAttribute('role','button'); } t?.setAttribute('aria-expanded',String(k===open||vis.length===1)); }
    box.classList.toggle('lg-empty',!vis.length); box.classList.toggle('lg-min',min);
    if(head) head.textContent=min&&vis.length?'Legend · '+vis.length:'Legend';
    tog?.setAttribute('aria-expanded',String(!min)); const lab=min?'Show the legend':'Hide the legend'; tog?.setAttribute('aria-label',lab); if(tog) tog.title=lab; };
  const soon=()=>{ if(!raf) raf=requestAnimationFrame(sync); };
  if(box){ new MutationObserver(soon).observe(box,{childList:true,subtree:true,attributes:true,attributeFilter:['class']}); new MutationObserver(soon).observe(document.documentElement,{attributes:true,attributeFilter:['data-filings']});
    const pick=e=>{ const t=e.target.closest('.t'); if(!t||!box.contains(t)||t.closest('.lg-h')) return; const el=t.parentElement; if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ') return; if(e.type==='keydown') e.preventDefault(); open=keyOf(el); held=null; if(min){ min=false; try{ localStorage.setItem('fs-legend-min','0'); }catch(err){} } sync(); };
    box.addEventListener('click',pick); box.addEventListener('keydown',pick);
    box.querySelector('.lg-h').addEventListener('click',()=>{ held=null; min=!min; try{ localStorage.setItem('fs-legend-min',min?'1':'0'); }catch(e){} sync(); });
    ctx.foldLegend=v=>{ if(v==null){ if(held!=null){ min=held; held=null; sync(); } return; } if(held==null) held=min; min=!!v; sync(); }; // folded for now (the site plan on a phone), without changing the saved choice; null puts it back as it was
    sync(); } }
syncQL=()=>ctx.syncQuickLayers?.();
Object.assign(ctx,{ viewLabels, nearestPlace, viewPlace:()=>{ const c=map.getCenter(); return nearestPlace([c.lng,c.lat])||farLabel; }, basemap:()=>layers.style, mapTilerDown:()=>mtDown, mode:()=>mode, screenContext, vocab, orbitAt, stopOrbit, onOrbitStop:fn=>orbitStops.push(fn), flatView, periodSpec, matchWith:o=>{ const m=makeMatcher({...curSpec(false),...o},{changed:CHANGED}); return F.filter(f=>m(f)&&inSel(f)&&monthOK(f)); }, highlight, clearHighlight, highlighted, showFilings, filingsShown, setFilingsShown, cardNav, fitToVisible:()=>fitPoints(visible), setMapOptions, mapPadding,
  snapshot:()=>({spec:curSpec(),month:state.month}), restore:s=>{ fromSpec(s.spec,{fly:false}); setMonth(s.month||null); fitPoints(visible); },
  resetAll:()=>{ closeCard(); clearHighlight(); ctx.live?.clearRoute(); ctx.clearNearby?.(); ctx.clearPlace?.(); if(state.month) setMonth(null); fromSpec(DEFAULT_SPEC()); map.flyTo({...HOME,duration:reduceMotion?0:1000}); },
  filtered:()=>{ const m=makeMatcher(curSpec(false),{changed:CHANGED}); return F.filter(f=>m(f)&&monthOK(f)); },
  BOOT_BASES,
  setSelection, clearAreaSelection:clearSelection, fixWinding, fc, countyGeo, HOME_C, PERIOD, stamp, scopeLabel, fileBase, rowsFor, summaryAoa, reportMap,
  exportCsv, exportXlsx, loadXlsx, exportGeoJSON, entityKey, get layersState(){ return layers; },
  coverage:()=>fmtN(F.length)+' filings in '+COUNTIES.join(', ')+' counties, registered '+DATA.period.start+' to '+DATA.period.end+'. Uses tagged: '+(F.some(f=>f.use)?'yes':'not yet (AI tagging pending), so use filters other than use') });
renderNav(ctx); changesBadge(); // menus first: modules look up the badge spans and the sub-tab rows
ctx.scheduleHash=scheduleHash;
for (const init of [initCardTabs,initGoogle,initPlaces,initDevLayers,initOwner,initAreaReports,initTimeline,initWho,initChanges,initKpis,initCompare,initMapSearch,initExport,initReports,initChatCards,initNearby,initAssistant,initMarket,initMarkets,initSaved,initField,initTeam,initBuildings,initMobile,initLive,initPlanes,initArea,initRegrid,initSite,initUtilities,initCrime,initCrimeUS,initFema,initEnv,initDriveTime,initTraffic,initAirports,initAirReport,initSources,initGlance,initQuickLayers,initLayerFilters,initSitePlan,initSettings]) { try{ init(ctx); }catch(e){ console.error('module failed',init.name,e); } }

// ---------- the card's dock ----------
// Desktop: an open card is a full-height column at the right edge of the map (src/app.css, "property card dock"); the
// map buttons and the controls' column step left of it (all CSS). A closed card drops its folded header.
new MutationObserver(()=>{ if(!card.classList.contains('open')&&card.classList.contains('compact')) card.classList.remove('compact'); }).observe(card,{attributes:true,attributeFilter:['class']});

// ---------- boot ----------
{ const s=new Date(DATA.period.start+'T12:00:00'), e=new Date(DATA.period.end+'T12:00:00'); const m=d=>d.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  document.getElementById('filingsPeriod').textContent='TDLR · '+m(s)+' – '+m(e);
  document.getElementById('periodTxt').textContent=PERIOD; const miss=DATA.unmapped||0; document.getElementById('missTxt').textContent=miss>0?fmtN(miss)+' filing'+(miss>1?'s':'')+' with no mappable address '+(miss>1?'are':'is')+' left off the map. ':''; }
{ let h=location.hash.slice(1);
  // the bare page (a reload of it, the installed app opening, a bookmark): come back to where you were. A link with
  // anything in it wins; a first visit has nothing kept and flies in to the region.
  if(!h){ let kept=''; try{ kept=localStorage.getItem(LAST_KEY)||''; }catch(e){} h=startHash(h,kept); if(h) try{ history.replaceState(null,'','#'+h); }catch(e){} }
  const p=new URLSearchParams(h), keys=[...p.keys()];
  // a link with filters puts the filing dots on; the date range alone (which the app writes into the address itself) doesn't,
  // so a reload opens like a fresh start: no filings until you turn them on
  if(h&&hasSpec(keys)){ if(showsFilings(keys)) showFilings(); fromSpec(decode(h),{fly:false}); if(p.get('m')&&MONTHS.includes(p.get('m'))) setMonth(p.get('m')); } else fromSpec(DEFAULT_SPEC(),{fly:false});
  booting=false;
  if(p.get('v')){ popping=true; navBoot=true; try{ setView(p.get('v')); }finally{ popping=false; navBoot=false; } } // the page a link opens on is the first history entry, not a new one
  syncTitle();
  // the project open on the Projects page
  if(p.get('pj')&&view==='projects') ctx.sitePlan?.show(p.get('pj'),p.get('pt'));
  // the camera goes in the address (debounced), so a reload keeps the view: from the first move after the map loads (the fly-in, a link's card)
  map.once('load',()=>map.on('moveend',()=>{ camReady=true; scheduleHash(); }));
  // the map position (#ml=lat,lng,zoom[,bearing,pitch]): a copied link, or where you were before the reload
  const mll=parseCam(p.get('ml'));
  if(mll){ camReady=true; map.jumpTo(mll); }
  // the open site plan (#sp=project.plan): it frames its own site
  const sp=parsePlanRef(p.get('sp')), spOk=view==='map'&&!!sp&&!!ctx.sitePlan?.has(sp[0],sp[1]);
  if(spOk) map.once('load',()=>{ try{ ctx.sitePlan.open(sp[0],sp[1]); }catch(e){ console.error(e); } });
  const f=!spOk&&p.get('f')&&BY_ID.get(p.get('f')); if(f) map.once('load',()=>select(f,true));
  // a property card (#b=lat,lng): that building, or the parcel there. With a kept map position, that view (the building
  // is in it unless you panned away with the card open), else close in on it.
  const bll=!f&&!spOk?parseLatLng(p.get('b')):null;
  if(bll) map.once('load',()=>{ if(!mll||!map.getBounds().contains(bll)) map.jumpTo({center:bll,zoom:17.5}); map.once('idle',()=>{ if(!ctx.buildingAt?.(bll)) ctx.openBuildingAt(bll); }); });
  scheduleHash();
  // (not when a site plan was opened before the map finished loading: the fly-in used to carry the map off the site)
  map.once('load',()=>{ if(f||bll||mll||spOk||ctx.planOpen?.()) return; if(sel.feature) fitGeom(sel.feature); else if(!reduceMotion) setTimeout(()=>{ if(!ctx.planOpen?.()) map.flyTo({...HOME,duration:2600,essential:true}); },300); else map.jumpTo(HOME); });
  cardRenderHooks.push(()=>scheduleHash()); // a property card opening (b=)
}

// the Excel library (about 880 KB, only the Excel exports use it): fetched a few seconds after the app is up, when the
// page is idle, or straight away by the first export that needs it
var xlsxP=null; // var: an export can call loadXlsx before this line has run
function loadXlsx(){ if(window.XLSX) return Promise.resolve(); return xlsxP||(xlsxP=new Promise((ok,no)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.async=true;
  s.onload=()=>window.XLSX?ok():no(new Error('xlsx')); s.onerror=()=>{ xlsxP=null; s.remove(); no(new Error('xlsx')); }; document.head.appendChild(s); })); }
setTimeout(()=>{ const go=()=>loadXlsx().catch(()=>{}); window.requestIdleCallback?requestIdleCallback(go,{timeout:5000}):go(); },3000);

// installable app + offline shell (served over https only)
// The offline cache serves the app files it has, so a new release used to show only after a second reload. When a new
// version takes over: reload right away if the page only just opened, otherwise say so (never reload mid-task).
if('serviceWorker' in navigator && location.protocol==='https:'){
  const hadSW=!!navigator.serviceWorker.controller, t0=Date.now(); let swDone=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ if(!hadSW||swDone) return; swDone=true;
    if(Date.now()-t0<15000) location.reload(); else toast('A new version of the app is ready. Reload the page to use it.'); });
  navigator.serviceWorker.register('sw.js').then(r=>r.update?.()).catch(()=>{});
}
