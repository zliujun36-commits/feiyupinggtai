import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {inPolygon,csvText,decodeTable} from '../dist/core.js';
import {summaryStats} from '../dist/charts.js';
const index=JSON.parse(await readFile(new URL('../dist/data/planning/index.json',import.meta.url),'utf8'));
test('geometry boundaries, polygon holes and CSV hostile/formatted values',()=>{
 const shape=[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[3,3],[7,3],[7,7],[3,7],[3,3]]];
 assert.equal(inPolygon(1,1,shape),true);assert.equal(inPolygon(0,5,shape),true);assert.equal(inPolygon(5,5,shape),false);assert.equal(inPolygon(11,5,shape),false);
 const csv=csvText([{x:'=SUM(A1)',y:'中文,"引号"\n下一行',z:null}],['x','y','z']);assert.ok(csv.startsWith('\ufeff'));assert.ok(csv.includes("'=SUM(A1)"));assert.ok(csv.includes('""引号""'));
 assert.deepEqual(decodeTable({columns:['a','b'],rows:[[false,null]]}),[{a:false,b:null}]);
});
test('national figures use weighted denominators, not city averages',()=>{
 const s=summaryStats(index.cities);assert.equal(s.demand_points,496464);assert.equal(s.baseline_covered,375068);assert.equal(s.planning_covered,496464);assert.equal(s.virtual_total,33853);assert.equal(s.land_review,26810);assert.deepEqual(s.virtual,{DZ:210,LD:27659,DC:5984});assert.equal((s.weight_coverage*100).toFixed(2),'85.01');assert.equal((s.point_coverage*100).toFixed(2),'75.55');assert.equal(summaryStats([]).point_coverage,null);
});
test('real Worker: national filters, cities, full paths, radii, exports, empty results and bounded cache',async t=>{
 const worker=new Worker(new URL('./worker-bridge.mjs',import.meta.url));t.after(()=>worker.terminate());let seq=0;const pending=new Map();worker.on('message',({id,result,error})=>{const p=pending.get(id);pending.delete(id);error?p.reject(Error(error)):p.resolve(result)});worker.on('error',err=>{for(const p of pending.values())p.reject(err)});
 const rpc=(method,args={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.postMessage({id,method,args})});
 const view={zoom:5,bounds:[-180,-85,180,85]},filters={levels:['DZ','LD','DC'],nodeKind:'all',scenario:'all',showDemand:true,exportKind:'candidates'};
 await rpc('init',{data:index});await rpc('overview');let r=await rpc('render',{filters,view,city:false});assert.equal(r.metrics.demand_points,496464);assert.ok(r.points.length<30000);
 r=await rpc('render',{filters:{...filters,scenario:'added',levels:['LD'],nodeKind:'virtual'},view,city:false});assert.equal(r.metrics.demand_points,121396);assert.equal(r.metrics.virtual_total,27659);assert.equal(r.metrics.nodes.DZ,0);
 for(const [city,total,baseline,virt] of [['成都市',10187,8854,314],['深圳市',9836,9801,14]]){
  const c=index.cities.find(c=>c.地级市===city);const started=performance.now();await rpc('loadCity',{id:c.id,path:c.path});r=await rpc('render',{filters,view,city:true});assert.equal(r.metrics.demand_points,total);assert.equal(r.metrics.baseline_covered,baseline);assert.equal(r.metrics.virtual_total,virt);
  const detail=await rpc('detail',{id:r.list[0].id});assert.equal(detail.up.length,3);assert.ok(detail.up.every(e=>e.distance<=e.radius+0.01));
  const node=await rpc('detail',{id:detail.up[0].parent});assert.equal(node.radius,c.coverage_radius_DZ_km*1000);assert.ok(node.members.includes(node.id));
  const selected={...filters,scenario:'added'};const exp=await rpc('export',{filters:selected,kind:'candidates'});assert.equal(exp.count,total-baseline);assert.ok(exp.csv.includes('baseline_complete_path'));
  const none=await rpc('render',{filters:{...filters,type:'not-a-type',levels:[]},view,city:true});assert.equal(none.metrics.demand_points,0);assert.equal(none.metrics.point_coverage,null);assert.equal(none.list.length,0);
  const gaps=await rpc('export',{kind:'uncovered'});assert.equal(gaps.count,0);assert.ok(gaps.csv.length>10);
  const edges=await rpc('export',{kind:'edges'});assert.equal(edges.count,c.K_DZ+c.K_LD);
  if(city==='成都市'){const noVirtualDZ=await rpc('render',{filters:{...filters,levels:['DZ'],nodeKind:'virtual',exportKind:'centers'},view,city:true});assert.equal(noVirtualDZ.metrics.virtual_total,0);assert.equal(noVirtualDZ.list.length,0);}
  console.log(city+' decode + network/export tests '+Math.round(performance.now()-started)+'ms');
 }
 for(const c of index.cities.slice(0,4))await rpc('loadCity',{id:c.id,path:c.path});assert.equal((await rpc('debug')).cachedCities,2);
 await rpc('cancel');assert.equal((await rpc('debug')).demands,undefined);
});
