import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {convertSnapshot,mergeSnapshots,circleRing,EARTH_RADIUS,SOURCE_FILES,boundsOf} from '../scripts/update-airspace-json.mjs';
import {featureSourceInfo,validityText,sourceSummary} from '../dist/airspace-info.js';
import {inPolygon} from '../dist/core.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
const load=async f=>JSON.parse(await readFile(new URL(f,import.meta.url),'utf8'));
const data=await load('../dist/data/airspace.geojson');
const archive=await load('../data-sources/airspace/2026-10-30/replaced-kml.geojson');
const sources=await Promise.all(SOURCE_FILES.map(async file=>{const bytes=await readFile(new URL('../data-sources/airspace/2026-10-30/'+file,import.meta.url));return {file,sha256:sha(bytes),data:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))};}));

test('snapshot update preserves all unmatched KML features and replaces only matching IDs, reproducibly',()=>{
 const kept=data.features.filter(f=>f.properties.sourceKind!=='dji-json');
 const original=[...kept,...archive.features].sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5)));
 assert.equal(original.length,4207);assert.equal(sha(JSON.stringify(original)),data.metadata.baseSource.featuresSha256);
 const incomingIds=new Set(sources.flatMap(s=>s.data.areas.map(a=>String(a.area_id))));
 assert.equal(incomingIds.size,51);assert.equal(archive.features.length,53);assert.equal(kept.length,4154);
 assert(archive.features.every(f=>incomingIds.has(f.properties.sourceId)));assert(kept.every(f=>!incomingIds.has(f.properties.sourceId)));
 assert.deepEqual(mergeSnapshots(data,sources).collection,data,'Repeated import must not duplicate or change records');
 assert.equal(data.features.length,4213);assert.equal(new Set(data.features.map(f=>f.id)).size,4213);
 let vertices=0;const counts={};
 for(const f of data.features){assert.deepEqual(boundsOf(f.geometry.coordinates),f.bbox);vertices+=f.geometry.coordinates.reduce((n,r)=>n+r.length,0);counts[f.properties.level]=(counts[f.properties.level]||0)+1;}
 assert.equal(vertices,data.metadata.vertexCount);assert.deepEqual(counts,data.metadata.counts);
});
test('airport subareas, polygon coordinates, source levels and validity are preserved',()=>{
 const added=data.features.filter(f=>f.properties.sourceKind==='dji-json');
 assert.equal(added.length,59);assert.equal(added.filter(f=>f.properties.queryCity==='北京').length,28);
 assert.equal(added.filter(f=>f.properties.queryCity==='上海').length,31);
 for(const s of sources){
  assert.deepEqual(convertSnapshot(s.data,s.file,s.sha256),added.filter(f=>f.properties.sourceFile===s.file));
  for(const a of s.data.areas)for(const [i,sub] of (a.sub_areas?.length?a.sub_areas:[a]).entries()){
   const f=added.find(f=>f.id===`dji-${a.area_id}-${i+1}`);assert(f);
   if(sub.polygon_points)assert.deepEqual(f.geometry.coordinates,sub.polygon_points);
   assert.equal(f.properties.sourceLevel,sub.level);assert.equal(f.properties.beginAt,a.begin_at);
  }
 }
 assert.equal(added.filter(f=>f.properties.sourceId==='40000062').length,4);
 assert.equal(added.filter(f=>f.properties.sourceId==='6150').length,4);
 assert.equal(added.filter(f=>f.properties.name.startsWith('环京禁飞区-')).length,11);
 assert.equal(added.filter(f=>f.properties.level==='加强警示区').length,26);
 const r=added.find(f=>f.properties.sourceId==='960003883').properties;
 assert(featureSourceInfo(r,data.metadata).validity.includes('北京时间'));
 assert(!featureSourceInfo(r,data.metadata).height.includes('0 米'));
 assert.equal(validityText(0,0),'原文件未提供');
 assert(sourceSummary(data.metadata).includes('4,213'));
});
test('circle geometry uses the supplied metre radius, not a fixed degree buffer',()=>{
 const f=data.features.find(f=>f.properties.sourceId==='9371');assert.equal(f.properties.radiusMeters,30000);
 const [lng,lat]=f.properties.center,rad=Math.PI/180;
 for(const [x,y] of f.geometry.coordinates[0]){
  const h=Math.sin((y-lat)*rad/2)**2+Math.cos(lat*rad)*Math.cos(y*rad)*Math.sin((x-lng)*rad/2)**2;
  assert(Math.abs(2*EARTH_RADIUS*Math.asin(Math.sqrt(h))-30000)<.001);
 }
 assert(inPolygon(lng,lat,f.geometry.coordinates));assert(!inPolygon(lng+1,lat,f.geometry.coordinates));
 assert.throws(()=>circleRing(200,40,100));assert.throws(()=>circleRing(116,40,-1));
 const bad=structuredClone(sources[0].data);bad.areas.push(bad.areas[0]);bad.count++;assert.throws(()=>convertSnapshot(bad,'bad.json','hash'),/Duplicate/);
 const unknown=structuredClone(sources[0].data);unknown.areas[0].sub_areas[0].level=99;assert.throws(()=>convertSnapshot(unknown,'bad.json','hash'),/classification/);
});
