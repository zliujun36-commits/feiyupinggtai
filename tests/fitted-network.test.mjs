import {unpackRoadGraph} from '../dist/graph-codec.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {graphBytes,createFittedRouter} from '../dist/fitted-routing.js';
import {obstacleCheck} from '../dist/road-routing.js';

function tiny(){
  const xy=[[110,30],[110.01,30],[110.02,30],[110.01,30.004]];
  const edges=[[0,1],[1,2],[1,3]];
  const buffer=new ArrayBuffer(12+8*xy.length+9*edges.length),dv=new DataView(buffer);
  dv.setUint32(0,0x46595232);dv.setUint32(4,xy.length,true);dv.setUint32(8,edges.length,true);
  new Int32Array(buffer,12,xy.length*2).set(xy.flat().map(x=>Math.round(x*1e7)));
  new Uint32Array(buffer,12+xy.length*8,edges.length*2).set(edges.flat());
  new Uint8Array(buffer,12+xy.length*8+edges.length*8).fill(1);
  return graphBytes(buffer);
}
test('arbitrary pair follows the OSM topology; archive reverse lookup and failed checks are explicit',()=>{
  const stop=(id,p,u,v,s=0)=>[id,0,...p,...p,u,v,s];
  const pack={points:[stop('A',[1100000000,300000000],0,1),stop('B',[1100200000,300000000],1,2),
    stop('X',[1100100000,300040000],1,3,1),stop('D',[1100200000,300000000],1,2)],routes:[]};
  const route=createFittedRouter(tiny(),pack,[95500,111195],()=>false);
  assert.ok(route('A','B').points.some(([x,y])=>x===110.01&&y===30));
  assert.equal(route('B','D').meters,0);
  assert.throws(()=>route('A','X'),/空域/);
  assert.throws(()=>route('missing','A'),/对象/);
  pack.routes=[[0,1,0,0,1910,0,[0,1,2]]];
  const saved=createFittedRouter(tiny(),pack,[95500,111195],()=>false);
  assert.deepEqual(saved('B','A').points,saved('A','B').points.slice().reverse());
  assert.throws(()=>createFittedRouter(tiny(),pack,[95500,111195],(a,b)=>a[0]!==b[0])('A','B'),/复核/);
});
test('published index covers every demand and model edge; samples use the current obstacle snapshot',()=>{
  const file=s=>readFileSync(new URL('../dist/data/'+s,import.meta.url)),manifest=JSON.parse(file('road-network/index.json'));
  const index=JSON.parse(file('planning/index.json')),air=file('airspace.geojson');
  assert.equal(createHash('sha256').update(air).digest('hex'),manifest.airHash);
  assert.equal(manifest.regions,index.cities.length);
  assert.equal(manifest.totals.demands,index.stats.demand_points);
  assert.equal(new Set(manifest.cities.map(c=>c.id)).size,369);
  const guard=obstacleCheck(JSON.parse(air));
  for(const name of ['成都市','上海市','广州市']){
    const c=manifest.cities.find(v=>v.city===name),v=index.cities.find(v=>v.id===c.id);
    assert.equal(c.model,v.n_candidates+v.K_DZ+v.K_LD);
    const data=(kind)=>gunzipSync(file('road-network/'+c.id+'.'+kind+(kind==='graph'&&manifest.graphEncoding==='FYP1'?'.pack':'')+'.gz'));
    const g=data('graph'),pack=JSON.parse(data('paths')),router=createFittedRouter(graphBytes(unpackRoadGraph(g.buffer.slice(g.byteOffset,g.byteOffset+g.length))),pack,c.scale,guard);
    for(const kind of [0,1]){
      const row=pack.routes.find(r=>r[2]===kind&&r[3]===0);assert.ok(row);
      const a=pack.points[row[0]][0],b=pack.points[row[1]][0],result=router(a,b);
      assert.ok(Math.abs(result.meters-row[4])<2);assert.ok(result.points.every((p,i,arr)=>!i||!guard(arr[i-1],p)));
    }
  }
});
