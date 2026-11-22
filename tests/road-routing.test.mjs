import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {obstacleCheck,roadGraph,planRoad} from '../dist/road-routing.js';
import {decodeTable} from '../dist/core.js';

function rectangle(w,s,e,n){
  return {bbox:[w,s,e,n],geometry:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]}};
}
function collection(zone){return {type:'FeatureCollection',metadata:{featureCount:1},features:[zone]};}
const zone=rectangle(110.009,29.999,110.011,30.001);
const blocked=obstacleCheck(collection(zone));
function graph(lines){
  const words=[];
  for(const line of lines){
    let x=0,y=0;words.push(line.length);
    for(const [lon,lat] of line){
      const xx=Math.round(lon*1e6),yy=Math.round(lat*1e6);
      words.push(xx-x,yy-y);x=xx;y=yy;
    }
  }
  return roadGraph(words);
}
const a=[110,30],b=[110.02,30],c=[110,30.004],d=[110.02,30.004];
test('crossing, boundary contact, near-boundary approach, inner ring and different parts of the box',()=>{
  assert.ok(blocked(a,b));assert.ok(blocked([110.005,30.001],[110.015,30.001]));
  assert.ok(blocked([110.009,30.0011],[110.011,30.0011]));
  assert.ok(!blocked(c,d));assert.ok(!blocked([110.001,30],[110.005,30]));
  const z=rectangle(110,30,110.1,30.1);
  z.geometry.coordinates.push(rectangle(110.02,30.02,110.08,30.08).geometry.coordinates[0]);
  const holes=obstacleCheck(collection(z));
  assert.ok(!holes([110.04,30.04],[110.06,30.06]));
  assert.ok(holes([110.04,30.04],[110.09,30.09]));
});
test('route follows the safe detour; no straight fallback for disconnected roads',()=>{
  const g=graph([[a,b],[a,c,d,b]]);
  const route=planRoad(g,blocked,a,b);
  assert.ok(route.points.some(p=>p[1]===30.004));
  assert.ok(route.meters>2500 && route.meters<3000);
  for(let i=1;i<route.points.length;i++)assert.equal(blocked(route.points[i-1],route.points[i]),false);
  assert.throws(()=>planRoad(graph([[a,c],[c,d],[b,[110.02,29.99]]]),blocked,a,b),/不连通/);
});
test('unsafe access stub and endpoint, excessive access distance and co-located nodes',()=>{
  const g=graph([[a,c,d,b]]);
  const barrier=obstacleCheck(collection(rectangle(110.008,30.002,110.012,30.0025)));
  assert.throws(()=>planRoad(graph([[c,d]]),barrier,[110.01,30.0005],d),/接入/);
  assert.throws(()=>planRoad(g,blocked,[110.01,30],[110.01,30]),/空域/);
  assert.throws(()=>planRoad(g,blocked,[111,30],b),/接入/);
  assert.equal(planRoad(g,blocked,a,a).meters,0);
});
test('invalid airspace extents, missing records and corrupt shards fail closed',()=>{
  assert.throws(()=>obstacleCheck({...collection(zone),features:[]}));
  assert.throws(()=>obstacleCheck(collection({...zone,bbox:[120,30,121,31]})));
  assert.throws(()=>roadGraph([4,2,3]));
});
test('Chengdu real demand chain and four same-tier pairs pass all recorded airspaces',()=>{
  const file=s=>readFileSync(new URL('../dist/data/'+s,import.meta.url));
  const id='a905c0143d26dd63',bytes=gunzipSync(file('roads/'+id+'.bin.gz'));
  const g=roadGraph(new Int32Array(bytes.buffer,bytes.byteOffset,bytes.length/4));
  const air=obstacleCheck(JSON.parse(file('airspace.geojson')));
  const t=JSON.parse(gunzipSync(file('planning/cities/'+id+'.json.gz'))).tables;
  const rows=new Map([...decodeTable(t.candidates),...decodeTable(t.centers)].map(r=>[(r.中心ID||r.候选点ID).split('|').at(-1),[r.经度,r.纬度]]));
  const pairs=[['LG_1979','DZ_733'],['DZ_733','VIRTUAL_LD_100'],['VIRTUAL_LD_100','VIRTUAL_DC_19'],
    ['LG_1979','LG_475114'],['DZ_733','DZ_557'],['VIRTUAL_LD_100','VIRTUAL_LD_11'],['VIRTUAL_DC_19','VIRTUAL_DC_8']];
  for(const [a,b] of pairs){
    const result=planRoad(g,air,rows.get(a),rows.get(b));
    assert.ok(result.meters>0 && result.access<=1000);
    assert.deepEqual(result.points[0],rows.get(a));assert.deepEqual(result.points.at(-1),rows.get(b));
    assert.ok(result.points.every((p,i,arr)=>i===0||!air(arr[i-1],p)));
  }
});
