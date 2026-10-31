import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {circleRing,boundsOf} from './update-airspace-json.mjs';
export function convertNational(d,sha){
 assert.equal(d.metadata.failed_requests.length,0);assert.equal(d.records.length,d.metadata.detail_count);
 const ids=new Set(),keys=new Set(),counts={'禁飞区':0,'限高区':0,'授权区':0,'警示区':0,'加强警示区':0};
 const features=d.records.map(r=>{
  assert(!ids.has(r.record_id),'Duplicate record ID');ids.add(r.record_id);
  const g=r.geometry,key=JSON.stringify([r.area_id,g]);assert(!keys.has(key),'Duplicate subarea');keys.add(key);
  const category=g.level===2?(g.height?'限高区':'禁飞区'):({0:'警示区',1:'授权区',3:'加强警示区'})[g.level];assert.equal(category,r.category);assert(category in counts);counts[category]++;
  const coordinates=g.shape===0?[circleRing(g.lng,g.lat,g.radius)]:structuredClone(g.polygon_points);assert([0,1].includes(g.shape));const bbox=boundsOf(coordinates);
  return {type:'Feature',id:r.record_id,bbox,properties:{name:r.name,sourceId:String(r.area_id),level:category,sourceKind:'dji-national',sourceFile:'全国五类区域_数据.json',sourceSha256:sha,declaredSource:'DJI FlySafe JSON',retrievedAt:d.metadata.end,drone:d.metadata.drone,sourceLevel:g.level,sourceColor:g.color,height:g.height,beginAt:r.begin_at,endAt:r.end_at,countryCode:r.country_code,reviewFlags:r.review_flags,geometryKind:g.shape===0?'circle':'polygon',center:[g.lng,g.lat],radiusMeters:g.radius},geometry:{type:'Polygon',coordinates}};
 });
 assert.equal(new Set(features.map(f=>f.properties.sourceId)).size,d.metadata.parent_count);
 const bbox=[180,90,-180,-90];let vertexCount=0;for(const f of features){for(let i=0;i<4;i++)bbox[i]=i<2?Math.min(bbox[i],f.bbox[i]):Math.max(bbox[i],f.bbox[i]);vertexCount+=f.geometry.coordinates.reduce((s,r)=>s+r.length,0);}
 const metadata={sourceFile:'全国五类区域_数据.json',sourceSha256:sha,sourceKind:'dji-national',generatedAt:d.metadata.end,declaredSource:'DJI FlySafe JSON',featureCount:features.length,parentCount:d.metadata.parent_count,vertexCount,counts,drone:d.metadata.drone,scope:d.metadata.methodology.scope,coordinateSystem:'原文件未声明，保留原始坐标未转换',summary:`唯一数据源：全国五类区域_数据.json，抓取于 ${d.metadata.end}，机型 ${d.metadata.drone}。共 ${d.metadata.parent_count} 个区域 ID、${features.length} 个子区域边界；旧 KML 与京沪快照已全部退出展示。${d.metadata.methodology.scope} ${d.metadata.methodology.limitation} 未收录不代表可飞；原始高度不推断海拔或真高，时间为源文件声明。`};
 return {type:'FeatureCollection',bbox,metadata,features};
}
if(process.argv[1]?.endsWith('import-national-airspace.mjs')){
 const dest='data-sources/airspace/national-2026-10-30';await mkdir(dest,{recursive:true});const file=dest+'/全国五类区域_数据.json';const bytes=await readFile(process.argv[2]||file);const result=convertNational(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),createHash('sha256').update(bytes).digest('hex'));
 if(process.argv[2])await writeFile(file,bytes);await writeFile('dist/data/airspace.geojson',JSON.stringify(result));await writeFile('dist/data/airspace-summary.json',JSON.stringify(result.metadata));console.log(result.metadata.counts);
}
