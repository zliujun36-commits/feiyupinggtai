import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {convertNational} from '../scripts/import-national-airspace.mjs';
const bytes=readFileSync('data-sources/airspace/national-2026-10-30/全国五类区域_数据.json');
const source=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),sha=createHash('sha256').update(bytes).digest('hex');
const actual=JSON.parse(readFileSync('dist/data/airspace.geojson','utf8'));
test('national snapshot is sole source; no retained KML or duplicated subareas',()=>{
 assert.deepEqual(convertNational(source,sha),actual);assert.equal(actual.features.length,1528);assert.equal(new Set(actual.features.map(f=>f.id)).size,1528);assert.equal(new Set(actual.features.map(f=>f.properties.sourceId)).size,1188);
 assert.deepEqual(actual.metadata.counts,{'禁飞区':810,'限高区':112,'授权区':28,'警示区':0,'加强警示区':578});
});
test('original polygons, heights and time windows survive conversion',()=>{
 for(let i=0;i<source.records.length;i++){const r=source.records[i],f=actual.features[i];if(r.shape_raw===1)assert.deepEqual(f.geometry.coordinates,r.geometry.polygon_points);assert.equal(f.properties.height,r.geometry.height);assert.equal(f.properties.beginAt,r.begin_at);assert.equal(f.properties.endAt,r.end_at);}
});
test('duplicate input and incomplete fetches fail rather than silently publishing',()=>{
 const d=structuredClone(source);d.records[1]=d.records[0];assert.throws(()=>convertNational(d,sha),/Duplicate/);
 const bad=structuredClone(source);bad.metadata.failed_requests.push('failed');assert.throws(()=>convertNational(bad,sha));
});
