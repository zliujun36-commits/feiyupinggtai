import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

export const SOURCE_FILES=['北京_限飞区.json','上海_限飞区.json'];
export const EARTH_RADIUS=6371008.8;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const labels={2:'限飞/禁飞区',3:'加强警示区'};
const colors={2:'#DE4329',3:'#EE8815'};
// These snapshots contain only red restricted and orange enhanced-warning zones.
// Keep all other national KML classifications unchanged; reject unknown JSON levels.
export function circleRing(lng,lat,radius){
 assert(Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=90,'Invalid center');
 assert(Number.isFinite(radius)&&radius>0&&radius<Math.PI*EARTH_RADIUS,'Invalid radius');
 const radians=Math.PI/180,phi=lat*radians,lambda=lng*radians,delta=radius/EARTH_RADIUS;
 // At most 1 m sagitta for these circles, with at least 72 segments.
 const segments=Math.max(72,Math.ceil(Math.PI/Math.acos(1-Math.min(1/radius,1))));
 const ring=Array.from({length:segments},(_,i)=>{
  const theta=i*2*Math.PI/segments;
  const p=Math.asin(Math.sin(phi)*Math.cos(delta)+Math.cos(phi)*Math.sin(delta)*Math.cos(theta));
  const l=lambda+Math.atan2(Math.sin(theta)*Math.sin(delta)*Math.cos(phi),Math.cos(delta)-Math.sin(phi)*Math.sin(p));
  return [l/radians,p/radians];
 });
 ring.push([...ring[0]]);return ring;
}
export function boundsOf(rings){
 const b=[180,90,-180,-90];
 for(const ring of rings){
  assert(ring.length>=4,'Ring too short');assert.deepEqual(ring[0],ring.at(-1),'Unclosed ring');
  for(const p of ring){assert(p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90,'Invalid coordinate');b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}
 }return b;
}
export function convertSnapshot(snapshot,file,sha){
 assert(Array.isArray(snapshot.areas)&&snapshot.count===snapshot.areas.length,'Invalid snapshot count');
 assert(Number.isFinite(Date.parse(snapshot.retrieved_at)),'Missing retrieval timestamp');
 const seen=new Set(),features=[];
 for(const area of snapshot.areas){
  const sourceId=String(area.area_id);assert(/^\d+$/.test(sourceId)&&!seen.has(sourceId),'Duplicate/invalid area ID');seen.add(sourceId);
  const subs=area.sub_areas?.length?area.sub_areas:[area];
  for(const [i,sub] of subs.entries()){
   const level=sub.level??area.level,color=sub.color??area.color;
   assert(labels[level]&&colors[level]===color?.toUpperCase(),'Unverified zone classification');
   let coordinates,kind;
   if(sub.polygon_points?.length){
    assert(sub.shape===1,'Unsupported polygon shape');coordinates=structuredClone(sub.polygon_points);kind='polygon';
   }else{
    assert(sub.shape===0&&Number.isFinite(sub.lng)&&Number.isFinite(sub.lat),'Missing geometry');
    coordinates=[circleRing(sub.lng,sub.lat,sub.radius)];kind='circle';
   }
   const bbox=boundsOf(coordinates);
   features.push({type:'Feature',id:`dji-${sourceId}-${i+1}`,bbox,properties:{
    name:area.name||`DJI ${sourceId}`,sourceId,level:labels[level],sourceKind:'dji-json',sourceFile:file,sourceSha256:sha,
    declaredSource:'DJI FlySafe JSON',retrievedAt:snapshot.retrieved_at,queryCity:snapshot.city,queryScope:snapshot.scope,drone:snapshot.drone,
    sourceLevel:level,sourceColor:color,sourceType:area.type,sourceShape:sub.shape,subAreaIndex:i,geometryKind:kind,
    center:[sub.lng,sub.lat],radiusMeters:sub.radius??null,height:sub.height??area.height??null,
    beginAt:area.begin_at??null,endAt:area.end_at??null,coordinateSystem:'原文件未声明；保留原始经纬度，未作坐标转换',
    description:area.description||''
   },geometry:{type:'Polygon',coordinates}});
  }
 }return features;
}
export function mergeSnapshots(collection,sources){
 const incoming=[],ids=new Set();
 for(const source of sources){
  for(const area of source.data.areas){const id=String(area.area_id);assert(!ids.has(id),'Area ID repeated between snapshots');ids.add(id);}
  incoming.push(...convertSnapshot(source.data,source.file,source.sha256));
 }
 const removed=collection.features.filter(f=>ids.has(f.properties.sourceId));
 const kept=collection.features.filter(f=>!ids.has(f.properties.sourceId));
 const features=[...kept,...incoming];assert.equal(new Set(features.map(f=>f.id)).size,features.length);
 const counts={},bbox=[180,90,-180,-90];let vertexCount=0;
 for(const f of features){counts[f.properties.level]=(counts[f.properties.level]||0)+1;vertexCount+=f.geometry.coordinates.reduce((n,r)=>n+r.length,0);for(let i=0;i<4;i++)bbox[i]=i<2?Math.min(bbox[i],f.bbox[i]):Math.max(bbox[i],f.bbox[i]);}
 const baseSource=collection.metadata.baseSource??{sourceFile:collection.metadata.sourceFile,generatedAt:collection.metadata.generatedAt,sourceSha256:collection.metadata.sourceSha256,featureCount:collection.metadata.featureCount,featuresSha256:hash(JSON.stringify(collection.features))};
 const updates=sources.map(s=>({sourceFile:s.file,sourceSha256:s.sha256,city:s.data.city,retrievedAt:s.data.retrieved_at,drone:s.data.drone,queryBbox:s.data.bbox,scope:s.data.scope,areaCount:s.data.count,featureCount:incoming.filter(f=>f.properties.sourceFile===s.file).length}));
 const summary=`全国基础数据来自 ${baseSource.sourceFile}（${baseSource.generatedAt}）；${updates.map(s=>s.city).join('、')}及查询返回的周边区域已按 ${updates.map(s=>s.retrievedAt.slice(0,10)).sort().at(-1)} 的 DJI FlySafe JSON 更新。现有 ${features.length.toLocaleString('en-US')} 个边界要素；新文件共 ${ids.size} 个区域 ID、${incoming.length} 个子区域边界。仅按 ID 替换，不将矩形查询范围内未返回的旧区域视为已解除。适用机型 ${[...new Set(updates.map(s=>s.drone))].join('、')}；非实时、非行政区完整清单，未经独立核验现行状态。`;
 return {collection:{type:'FeatureCollection',bbox,metadata:{...collection.metadata,baseSource,updates,featureCount:features.length,vertexCount,counts,summary,coordinateSystem:'KML 声明 WGS 84；新增 JSON 未声明，原值保留未转换',notes:[
  '基础 KML 及新增 JSON 的来源声明未经独立核验；不同来源的日期分别展示。',
  '矩形查询包含周边且不保证完整；仅按区域 ID 替换，未匹配旧要素保留。',
  'JSON 子区域保留各自等级与边界；圆形按中心和米制半径以球面公式近似成多边形，最大弦高约 1 米。',
  'JSON level 2 / #DE4329 对应限飞/禁飞区；level 3 / #EE8815 对应加强警示区。其他 KML 分类不变。',
  'height=0 不解释为零米限高，时间戳 0 不解释为永久有效；有效期保留原始值。',
  '未标注区域不代表可飞；DJI 数据不替代官方空域许可。'
 ]},features},removed,incoming};
}
async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const directory=path.join(root,'data-sources/airspace/2026-10-30');await mkdir(directory,{recursive:true});
 const paths=process.argv.slice(2);assert(paths.length===0||paths.length===2,'Pass Beijing and Shanghai JSON paths');
 const sources=[];
 for(const [i,file] of SOURCE_FILES.entries()){
  const bytes=await readFile(paths[i]||path.join(directory,file));
  sources.push({file,sha256:hash(bytes),data:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),bytes});
 }
 const target=path.join(root,'dist/data/airspace.geojson'),base=JSON.parse(await readFile(target,'utf8'));
 assert(base.metadata.sourceKind!=='dji-national','Current dataset uses the national snapshot; use import-national-airspace.mjs');
 const result=mergeSnapshots(base,sources);
 const audit=path.join(directory,'replaced-kml.geojson');
 // Retain the superseded original features for verification and provenance.
 const originals=result.removed.filter(f=>f.properties.sourceKind!=='dji-json');
 if(originals.length){await writeFile(audit,JSON.stringify({type:'FeatureCollection',features:originals}));}
 for(const s of sources)if(paths.length)await writeFile(path.join(directory,s.file),s.bytes);
 await writeFile(target,JSON.stringify(result.collection));
 await writeFile(path.join(root,'dist/data/airspace-summary.json'),JSON.stringify(result.collection.metadata));
 console.log(JSON.stringify({sourceAreas:sources.map(s=>[s.data.city,s.data.count]),removedOriginalFeatures:originals.length,newFeatures:result.incoming.length,total:result.collection.features.length,counts:result.collection.metadata.counts},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
