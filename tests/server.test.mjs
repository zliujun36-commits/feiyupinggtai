import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
test('static server serves modules and raw gzip, handles HEAD, caching, missing files and traversal',async t=>{
 const proc=spawn(process.execPath,['server.cjs'],{env:{...process.env,PORT:'4187'}});t.after(()=>proc.kill());await once(proc.stdout,'data');const base='http://127.0.0.1:4187';
 const main=await fetch(base);assert.equal(main.status,200);assert.ok((await main.text()).includes('低空空域与无人机物流规划分析平台'));
 const js=await fetch(base+'/platform.js');assert.ok(js.headers.get('content-type').includes('javascript'));
 const r=await fetch(base+'/data/planning/overview.json.gz');assert.equal(r.headers.get('content-encoding'),null);const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(bytes[0],31);assert.equal(bytes[1],139);
 const cached=await fetch(base+'/data/planning/overview.json.gz',{headers:{'If-None-Match':r.headers.get('etag')}});assert.equal(cached.status,304);
 const head=await fetch(base+'/data/planning/index.json',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.text()).length,0);
 assert.equal((await fetch(base+'/missing.json')).status,404);assert.equal((await fetch(base+'/%2e%2e%5cpackage.json')).status,403);
});
