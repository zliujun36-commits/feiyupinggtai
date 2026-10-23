import {inPolygon} from './core.js';
'use strict';
const definitions={restricted:{label:'限飞/禁飞区',color:'#cc535e'},authorization:{label:'授权飞行区',color:'#4483cc'},warning:{label:'警示区',color:'#e3a031'},enhanced:{label:'加强警示区',color:'#e47735'},controlled:{label:'管制区',color:'#9863b5'},limited:{label:'限制区',color:'#a96043'}};
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let map,metadata,locationMarker,selected,timer; let enabled=true;
let records=[],filter='all',listLimit=40,currentCity='全国',loading=true,loadFailed=false;
const activeLayers=new Set(Object.keys(definitions)),geometryGroups={},pointGroups={},paths=new Map();
const typeByLabel=Object.fromEntries(Object.entries(definitions).map(([key,value])=>[value.label,key]));
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,5000)}
function included(r){return(filter==='all'||r.type===filter)&&activeLayers.has(r.type)}
function inViewport(r){if(!map)return true;const b=map.getBounds(),v=r.bbox;return v[0]<=b.getEast()&&v[2]>=b.getWest()&&v[1]<=b.getNorth()&&v[3]>=b.getSouth()}
function style(r){return{color:definitions[r.type].color,weight:1.4,fillOpacity:.18,opacity:.9}}
function closeDetail(){if(selected&&paths.has(selected.id))paths.get(selected.id).setStyle(style(selected));selected=null;$('#detail').hidden=true}
function updateLayers(){
 if(!map)return;
 for(const type of Object.keys(definitions)){
  const show=enabled&&activeLayers.has(type)&&(filter==='all'||filter===type),polygons=geometryGroups[type],points=pointGroups[type];if(!polygons)continue;
  if(show)polygons.addTo(map);else map.removeLayer(polygons);
  if(show&&map.getZoom()<8)points.addTo(map);else map.removeLayer(points);
 }
 $('#map-hint').textContent=map.getZoom()<8?'小点为区域中心 · 放大查看原始边界':'点击边界或列表查看详情 · 拖动浏览地图';
 if(selected&&!included(selected))closeDetail();
}
function renderList(){
 const container=$('#region-list');container.replaceChildren();$('#area-title').textContent='当前地图范围';
 if(loading){$('#count').textContent='加载中';container.innerHTML='<p class="empty">正在加载限飞区域边界…</p>';return}
 if(loadFailed){$('#count').textContent='加载失败';container.innerHTML='<p class="empty">区域数据暂时无法加载，请重试。</p>';const retry=document.createElement('button');retry.className='load-more';retry.textContent='重新加载数据';retry.onclick=loadData;container.appendChild(retry);return}
 const visible=records.filter(r=>included(r)&&inViewport(r));
 if(map){const center=map.getCenter();const distance=r=>((r.bbox[0]+r.bbox[2])/2-center.lng)**2*Math.cos(center.lat*Math.PI/180)**2+((r.bbox[1]+r.bbox[3])/2-center.lat)**2;visible.sort((a,b)=>distance(a)-distance(b))}
 $('#count').textContent=visible.length.toLocaleString()+' 个';
 if(!visible.length){container.innerHTML='<p class="empty">当前视野或筛选条件下没有收录区域。<br>未收录不代表可飞，可缩小地图或调整图层。</p>';return}
 const fragment=document.createDocumentFragment();
 for(const r of visible.slice(0,listLimit)){
  const button=document.createElement('button');button.className='region-card'+(selected?.id===r.id?' selected':'');
  button.innerHTML=`<span class="region-card-top"><i class="dot" style="background:${definitions[r.type].color}"></i><strong>${escapeHTML(r.name)}</strong><span class="arrow">↗</span></span><p>${escapeHTML(r.level)} · ID ${escapeHTML(r.sourceId)}</p>`;
  button.onclick=()=>select(r);fragment.appendChild(button);
 }
 container.appendChild(fragment);
 if(visible.length>listLimit){const more=document.createElement('button');more.className='load-more';more.textContent=`继续显示（已显示 ${Math.min(listLimit,visible.length)} / ${visible.length}）`;more.onclick=()=>{listLimit+=40;renderList()};container.appendChild(more)}
}
function select(r){
 closeDetail();selected=r;
 if(!included(r)){filter='all';activeLayers.add(r.type);syncControls();updateLayers()}
 if(map){const b=r.bbox;map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[48,48],maxZoom:13,animate:false});paths.get(r.id)?.setStyle({weight:3,fillOpacity:.32});paths.get(r.id)?.bringToFront()}
 const detail=$('#detail');detail.hidden=false;
 detail.innerHTML=`<button class="detail-close" aria-label="关闭详情">×</button><span class="detail-badge" style="color:${definitions[r.type].color}">${escapeHTML(r.level)}</span><h3>${escapeHTML(r.name)}</h3><dl><dt>原始区域 ID</dt><dd>${escapeHTML(r.sourceId)}</dd><dt>文件生成日期</dt><dd>${escapeHTML(metadata.generatedAt)}</dd><dt>文件标注来源</dt><dd>${escapeHTML(metadata.declaredSource)}</dd><dt>高度 / 有效期</dt><dd>原文件未提供</dd></dl><p class="detail-note">按所提供 KML 的原始边界展示。分类沿用原文件，未核验现行状态；“授权飞行区”不表示已获飞行许可。</p>`;
 detail.querySelector('button').onclick=()=>{closeDetail();renderList()};renderList();
}
function city(name){currentCity=name;closeDetail();$('#map-city').textContent=name;$('#search-results').replaceChildren();$('#search').value='';if(map)map.setView(cities[name],10);listLimit=40;renderList()}
function national(){currentCity='全国';closeDetail();$('#map-city').textContent='全国概览';$('#search-results').replaceChildren();$('#search').value='';if(map)map.setView([35.5,104.2],4);listLimit=40;renderList()}
function allData(){if(!metadata)return;currentCity='全部';closeDetail();$('#map-city').textContent='全部收录范围';const b=metadata.bounds;if(map)map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[30,30]});listLimit=40;renderList()}
function search(){
 const query=$('#search').value.trim().toLowerCase(),container=$('#search-results');container.replaceChildren();if(!query)return;
 const cityQuery=query.replace(/市$/,''),matches=Object.keys(cities).filter(c=>c.includes(cityQuery)),zones=records.filter(r=>r.name.toLowerCase().includes(query)||r.sourceId.includes(query));
 for(const name of matches.slice(0,5)){const b=document.createElement('button');b.textContent=name+' · 定位城市';b.onclick=()=>city(name);container.appendChild(b)}
 for(const r of zones.slice(0,20)){const b=document.createElement('button');b.textContent=`${r.name} · ${r.level} · ${r.sourceId}`;b.onclick=()=>{select(r);container.replaceChildren()};container.appendChild(b)}
 const note=document.createElement('p');if(!matches.length&&!zones.length)note.textContent=loading?'区域数据正在加载，请稍候。':'未找到匹配项。可搜索城市、原文件机场名称（含英文）或区域 ID。';else if(zones.length>20)note.textContent=`找到 ${zones.length} 个区域，显示前 20 个，请输入更完整的名称或 ID。`;if(note.textContent)container.appendChild(note);
}
function syncControls(){$$('[data-filter]').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});$$('[data-layer]').forEach(input=>input.checked=activeLayers.has(input.dataset.layer))}
function createControls(){
 const filters=$('#filters'),legend=$('#legend');filters.replaceChildren();legend.replaceChildren();
 for(const[key,value]of[['all',{label:'全部'}],...Object.entries(definitions)]){const b=document.createElement('button');b.textContent=value.label;b.dataset.filter=key;b.onclick=()=>{filter=key;listLimit=40;syncControls();updateLayers();renderList()};filters.appendChild(b)}
 for(const[key,value]of Object.entries(definitions)){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.layer=key;input.checked=true;input.onchange=()=>{input.checked?activeLayers.add(key):activeLayers.delete(key);listLimit=40;updateLayers();renderList()};const dot=document.createElement('i');dot.className='dot';dot.style.background=value.color;label.append(input,dot,document.createTextNode(value.label));legend.appendChild(label)}
 syncControls();
}
async function loadData(){
 loading=true;loadFailed=false;renderList();
 try{
  const response=await fetch('data/airspace.geojson');if(!response.ok)throw new Error('HTTP '+response.status);const collection=await response.json();
  if(collection.type!=='FeatureCollection'||!Array.isArray(collection.features)||collection.features.length!==collection.metadata.featureCount)throw new Error('Invalid collection');
  const parsed=collection.features.map(f=>{const type=typeByLabel[f.properties.level];if(!type||f.geometry.type!=='Polygon'||f.bbox?.length!==4)throw new Error('Invalid feature');return{...f.properties,id:f.id,type,bbox:f.bbox,feature:f}});
  records=parsed;metadata={...collection.metadata,bounds:collection.bbox};
  if(map){
   for(const type of Object.keys(definitions)){geometryGroups[type]=L.layerGroup();pointGroups[type]=L.layerGroup()}
   for(const r of records){const layer=L.geoJSON(r.feature,{style:()=>style(r),onEachFeature:(_,polygon)=>polygon.on('click',()=>select(r))});layer.addTo(geometryGroups[r.type]);paths.set(r.id,layer);const b=r.bbox;L.circleMarker([(b[1]+b[3])/2,(b[0]+b[2])/2],{radius:3.25,color:definitions[r.type].color,weight:.75,opacity:.9,fillOpacity:.65}).on('click',()=>select(r)).addTo(pointGroups[r.type])}
  }
  $('#dataset-status').textContent=`已收录 ${records.length.toLocaleString()} 个区域`;$('#dataset-date').textContent=`文件生成于 ${metadata.generatedAt} · 非实时数据`;
  $('#source-description').textContent=`当前导入「${metadata.sourceFile}」，共 ${records.length.toLocaleString()} 个区域、${metadata.vertexCount.toLocaleString()} 个边界坐标。文件标注来源为 ${metadata.declaredSource}，生成日期为 ${metadata.generatedAt}。`;
  $('#type-summary').replaceChildren();for(const d of Object.values(definitions)){const li=document.createElement('li');li.textContent=`${d.label}：${metadata.counts[d.label]||0} 个`;$('#type-summary').appendChild(li)}
  updateLayers();
 }catch(error){loadFailed=true;$('#dataset-status').textContent='数据未加载';toast('限飞数据加载失败，请在列表中重试。');console.error('Airspace load failed:',error.message)}finally{loading=false;renderList();if($('#search').value)search()}
}
$('#search').addEventListener('input',search);$('#search-form').onsubmit=e=>{e.preventDefault();search();$('#search-results button')?.click()};$$('[data-city]').forEach(b=>b.onclick=()=>city(b.dataset.city));$('#national').onclick=national;$('#all-data').onclick=allData;
$('#zoom-in').onclick=()=>map?.zoomIn();$('#zoom-out').onclick=()=>map?.zoomOut();$('#reset').onclick=()=>currentCity==='全国'?national():currentCity==='全部'?allData():city(currentCity);
$('#locate').onclick=()=>{if(!map)return toast('地图尚未加载，请刷新后重试。');if(!navigator.geolocation)return toast('当前浏览器不支持定位，请搜索城市。');toast('正在获取位置，请允许浏览器定位…');navigator.geolocation.getCurrentPosition(p=>{const point=[p.coords.latitude,p.coords.longitude];if(locationMarker)map.removeLayer(locationMarker);locationMarker=L.circleMarker(point,{color:'#fff',weight:3,fillColor:'#307cc2',fillOpacity:1,radius:8}).addTo(map).bindTooltip('我的位置');map.setView(point,12);$('#map-city').textContent='我的位置';toast('已定位；附近未标注的区域不代表可飞。')},()=>toast('未能获取位置，请检查定位权限或搜索城市。'),{timeout:10000,enableHighAccuracy:false})};
const dialog=$('#info-dialog');$('#help').onclick=$('#data-info').onclick=()=>dialog.showModal();$('#close-dialog').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
export function initAirspace(sharedMap){map=sharedMap;createControls();map.on('moveend',()=>{if(enabled){listLimit=40;updateLayers();renderList()}});loadData()}
export function enableAirspace(value){enabled=value;updateLayers();if(value)renderList();else closeDetail()}
export function airSearch(query){const q=query.toLowerCase();return records.filter(r=>r.name.toLowerCase().includes(q)||r.sourceId.includes(q)).slice(0,10)}
export function chooseAir(record){select(record)}
const bins=new Map();let indexed=0;
export function screenAirspace(lng,lat){if(indexed!==records.length){bins.clear();for(const r of records){const b=r.bbox;for(let x=Math.floor(b[0]);x<=Math.floor(b[2]);x++)for(let y=Math.floor(b[1]);y<=Math.floor(b[3]);y++){const k=x+','+y;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(r)}}indexed=records.length}return {loaded:records.length>0,hits:(bins.get(Math.floor(lng)+','+Math.floor(lat))||[]).filter(r=>lng>=r.bbox[0]&&lng<=r.bbox[2]&&lat>=r.bbox[1]&&lat<=r.bbox[3]&&inPolygon(lng,lat,r.feature.geometry.coordinates)).map(r=>({name:r.name,level:r.level,id:r.sourceId}))}}