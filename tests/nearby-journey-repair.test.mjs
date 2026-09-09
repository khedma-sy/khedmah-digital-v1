import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPage, loadSource, primitives, css, deferred, readSource } from './helpers/client-page-harness.mjs';
const discovery=loadSource(readSource('apps/frontend/lib/discovery-context.ts'),{});
const mapContext=loadSource(readSource('apps/frontend/lib/map-context.ts'),{'./discovery-context':discovery});
const searchContext=loadSource(readSource('apps/frontend/lib/search-context.ts'),{'./discovery-context':discovery});
function fixture({query='',key=false,unsupported=false,constructorFails=false}={}) {
 let params=new URLSearchParams(query),timerId=0;
 const timers=new Map(),requests=[],gps=[],handles=[],markers=[],popups=[],navigations=[];
 const setTimeout=(callback,ms)=>{timers.set(++timerId,{callback,ms});return timerId;};const clearTimeout=id=>timers.delete(id);
 class MapHandle {
  constructor(){if(constructorFails)throw new Error('Map unavailable');this.events=new Map();this.center={lat:0,lng:0};this.bounds={south:33,west:36,north:34,east:37};this.panCount=0;handles.push(this);}
  addListener(name,callback){this.events.set(name,callback);return{remove:()=>this.events.delete(name)};}
  emit(name){this.events.get(name)?.();}
  getBounds(){return{toJSON:()=>this.bounds};}getCenter(){return{lat:()=>this.center.lat,lng:()=>this.center.lng};}
  panTo(point){this.panCount++;this.center=point;}
  fitBounds(bounds){this.bounds=bounds;}
 }
 class Marker {constructor(options){this.options=options;this.events=new Map();markers.push(this);}setMap(map){this.map=map;}addListener(name,callback){this.events.set(name,callback);return{remove:()=>this.events.delete(name)};}}
 const maps={Map:MapHandle,Marker,Circle:class{setMap(){}},InfoWindow:class{constructor(options){this.options=options;}open(){popups.push(this.options);}close(){}}};
 const runtime={setTimeout,clearTimeout,...(key?{google:{maps}}:{})};
 const navigator=unsupported?{}:{geolocation:{getCurrentPosition:(ok,fail)=>gps.push({ok,fail})}};
 const document={createElement:()=>({}),getElementById:()=>null,head:{appendChild(){}}};
 const api={search:{query:body=>{const d=deferred();d.body=body;requests.push(d);return d.promise;}}};
 const router={push:href=>navigations.push(href),replace:href=>navigations.push(href)};
 const cities=[{code:'damascus',nameAr:'دمشق'},{code:'aleppo',nameAr:'حلب'}],categories=[{code:'plumbing',nameAr:'سباكة'}];
 const h=clientPage(readSource('apps/frontend/app/map/page.tsx').replace('export default function MarketplaceMapPage()','function MarketplaceMapPage()')+'\nexport default MapDiscovery;',{
  'next/link':{default:'Link'},'next/navigation':{useRouter:()=>router,useSearchParams:()=>params},'../../lib/api-client':{api},
  '../../lib/map-context':mapContext,'../../lib/search-context':searchContext,
  '../../lib/use-syrian-cities':{useSyrianCities:()=>({cities,isLoading:false,error:''}),canonicalCityCode:(v,c)=>c.some(i=>i.code===v)?v:undefined,cityLabel:v=>v},
  '../../lib/use-categories':{useCategories:()=>({categories,isLoading:false,error:''})},
  '../components/platform-icon':{PlatformIcon:'PlatformIcon'},'../components/ui-primitives':primitives,'../discovery.module.css':{default:css}
 },{window:runtime,document,navigator,setTimeout,clearTimeout,process:{env:{NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:key?'fixture-only':''}}});
 h.find(n=>n.props.ref).props.ref.current={};
 function runTimers(ms){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.callback();}h.render();}
 const locateButton=()=>h.find(n=>n.props.onClick?.name==='locateUser');
 return{h,timers,requests,gps,handles,markers,popups,navigations,runtime,navigator,runTimers,locateButton,
  initialize(){runtime.initKhedmahMap?.();h.render();},
  locate(){locateButton().props.onClick();h.render();},
  position(latitude=33.5,longitude=36.3,index=gps.length-1){gps[index].ok({coords:{latitude,longitude}});h.render();},
  navigate(query){params=new URLSearchParams(query);h.render();},
  emit(name,index=handles.length-1){handles[index].emit(name);h.render();},
  async resolve(i,providers=[]){requests[i].resolve({businesses:providers,total:providers.length});await h.flush();},
  async reject(i){requests[i].reject(new Error('offline'));await h.flush();}
 };
}

test('nearby never requests GPS automatically or sends the default camera as user coordinates',()=>{
 const f=fixture();assert.equal(f.gps.length,0);assert.equal(f.requests[0].body.latitude,undefined);assert.equal(f.requests[0].body.longitude,undefined);
});
test('nearby without SDK can search using an explicitly granted valid GPS position',async()=>{
 const f=fixture({query:'categoryCode=plumbing'});await f.resolve(0);f.locate();f.position();
 assert.equal(f.requests.at(-1).body.latitude,33.5);assert.equal(f.requests.at(-1).body.categoryCode,'plumbing');
});
for(const point of [[NaN,36],[91,36],[33,181],[Infinity,36]])test(`nearby rejects invalid GPS ${point} without poisoning future searches`,async()=>{
 const f=fixture();await f.resolve(0);f.locate();f.position(...point);
 assert.equal(f.requests.some(r=>r.body.latitude!==undefined),false);assert.equal(f.locateButton().props.disabled,false);
});
test('nearby geolocation policy exceptions are recoverable',async()=>{
 const f=fixture();await f.resolve(0);f.navigator.geolocation.getCurrentPosition=()=>{throw new Error('denied');};
 assert.doesNotThrow(()=>f.locate());assert.equal(f.locateButton().props.disabled,false);
});
test('nearby unsupported geolocation keeps the manual filter link available',()=>{
 const f=fixture({unsupported:true});f.locate();assert.match(f.h.text,/غير مدعوم/);assert.ok(f.h.find(n=>n.type==='ActionLink'&&n.props.href.startsWith('/search')));
});
test('GPS cannot publish after the user changes city',async()=>{
 const f=fixture({query:'cityCode=damascus'});await f.resolve(0);f.locate();f.navigate('cityCode=aleppo');f.position();
 assert.equal(f.requests.some(r=>r.body.latitude!==undefined),false);assert.equal(f.requests.at(-1).body.cityCode,'aleppo');
});
test('GPS cannot publish after unmount',()=>{
 const f=fixture();f.locate();f.h.unmount();f.gps[0].ok({coords:{latitude:33.5,longitude:36.3}});assert.equal(f.h.writesAfterUnmount,0);
});
test('map navigation waits for post-pan bounds, never the old camera bounds',async()=>{
 const f=fixture({key:true});f.initialize();f.emit('tilesloaded');await f.resolve(0);f.locate();f.position();
 assert.equal(f.handles[0].panCount,1);assert.equal(f.requests.some(r=>r.body.latitude!==undefined),false);
 const map=f.handles[0];map.bounds={south:34,west:37,north:35,east:38};f.emit('idle');f.runTimers(300);
 const q=new URLSearchParams(f.navigations.at(-1).split('?')[1]);assert.equal(q.get('south'),'34');
 f.navigate(q.toString());assert.equal(f.requests.at(-1).body.latitude,33.5);
});
test('a missing post-pan idle event cannot leave GPS busy indefinitely',async()=>{
 const f=fixture({key:true});f.initialize();f.emit('tilesloaded');await f.resolve(0);f.locate();f.position();
 assert.ok([...f.timers.values()].some(t=>t.ms===10000));f.runTimers(10000);
 assert.equal(f.locateButton().props.disabled,false);assert.match(f.h.text,/حدود الخريطة/);
 assert.equal(f.requests.some(r=>r.body.latitude!==undefined),false);
});
test('SDK pan failures are caught and do not leave the locate button disabled',async()=>{
 const f=fixture({key:true});f.initialize();f.emit('tilesloaded');await f.resolve(0);f.handles[0].panTo=()=>{throw new Error('pan failed');};
 f.locate();assert.doesNotThrow(()=>f.position());assert.equal(f.locateButton().props.disabled,false);
});
for(const event of ['dragstart','zoom_changed','idle'])test(`queued ${event} from a disposed map cannot update state or leave timers`,()=>{
 const f=fixture({key:true});f.initialize();f.emit('idle');f.emit('dragstart');const late=f.handles[0].events.get(event);
 f.h.unmount();late();assert.equal(f.h.writesAfterUnmount,0);assert.equal(f.timers.size,0);
});
test('stale marker click cannot reopen a previous search result',async()=>{
 const f=fixture({key:true});f.initialize();await f.resolve(0,[{id:'old',name:'قديم',lat:33.5,lng:36.3}]);
 const old=f.markers.at(-1);const late=old.events.get('click');f.navigate('q=new');late();
 assert.equal(f.popups.length,0);assert.equal(old.events.size,0);
});
test('unmounted marker click cannot open an info window',async()=>{
 const f=fixture({key:true});f.initialize();await f.resolve(0,[{id:'old',name:'قديم',lat:33.5,lng:36.3}]);
 const old=f.markers.at(-1),late=old.events.get('click');f.h.unmount();late();assert.equal(f.popups.length,0);assert.equal(old.events.size,0);
});
test('current marker retains its encoded profile destination',async()=>{
 const f=fixture({key:true});f.initialize();await f.resolve(0,[{id:'p/a',name:'نشاط',lat:33.5,lng:36.3}]);
 f.markers.at(-1).events.get('click')();assert.equal(f.popups[0].content.href,'/business-profiles/p%2Fa?source=map');
});
test('SDK callback cleanup must not replace a newer route owner',()=>{
 const f=fixture({key:true});f.initialize();const newer=()=>{};f.runtime.gm_authFailure=newer;f.runtime.initKhedmahMap=newer;f.h.unmount();
 assert.equal(f.runtime.gm_authFailure,newer);assert.equal(f.runtime.initKhedmahMap,newer);
});
test('Map constructor failures show list recovery rather than an uncaught exception',()=>{
 const f=fixture({key:true,constructorFails:true});assert.doesNotThrow(()=>f.initialize());
 assert.equal(f.h.find(n=>n.type==='main').props['data-map-status'],'error');
});
test('invalid explicit map bounds block the request without silently widening it',()=>{
 const f=fixture({query:'categoryCode=plumbing&south=34&west=36&north=33&east=37'});assert.equal(f.requests.length,0);
 f.h.click('مسح تحديد المنطقة');assert.equal(new URLSearchParams(f.navigations.at(-1).split('?')[1]).get('categoryCode'),'plumbing');
});
test('map render readiness requires actual tile events, not only SDK construction',()=>{
 const f=fixture({key:true});f.initialize();assert.equal(f.h.find(n=>n.type==='main').props['data-map-render-status'],'loading');
 f.emit('idle');assert.equal(f.h.find(n=>n.type==='main').props['data-map-render-status'],'loading');
 f.emit('tilesloaded');assert.equal(f.h.find(n=>n.type==='main').props['data-map-render-status'],'ready');
});
test('nearby request retry retains query category and city',async()=>{
 const f=fixture({query:'q=صيانة&categoryCode=plumbing&cityCode=damascus'});await f.reject(0);f.h.click('إعادة تحميل النتائج');
 assert.equal(JSON.stringify(f.requests[0].body),JSON.stringify(f.requests[1].body));
});
test('unmounted map query results and errors are ignored',async()=>{
 for(const outcome of ['resolve','reject']){const f=fixture();f.h.unmount();await f[outcome](0);assert.equal(f.h.writesAfterUnmount,0);}
});
