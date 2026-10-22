import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
test('static server serves modules and raw gzip, handles HEAD, caching, missing files and traversal',async t=>{
 const proc=spawn(process.execPath,['server.cjs'],{env:{...process.env,PORT:'4187'}});t.after(()=>proc.kill());await once(proc.stdout,'data');const base='http://127.0.0.1:4187';
 const main=await fetch(base);assert.equal(main.status,200);const html=await main.text();assert.ok(html.includes('低空空域与无人机物流规划分析平台'));
 const cssRef=html.match(/href="(platform\.([a-f0-9]{12})\.css)"/);assert.ok(cssRef,'HTML must reference a versioned stylesheet');
 const cssResponse=await fetch(base+'/'+cssRef[1]);assert.equal(cssResponse.status,200);assert.ok(cssResponse.headers.get('content-type').includes('text/css'));
 const css=(await cssResponse.text()).replace(/\r\n/g,'\n');assert.equal(createHash('sha256').update(css).digest('hex').slice(0,12),cssRef[2],'served stylesheet must match the version in its URL');
 const js=await fetch(base+'/platform.js');assert.ok(js.headers.get('content-type').includes('javascript'));
 const r=await fetch(base+'/data/planning/overview.json.gz');assert.equal(r.headers.get('content-encoding'),null);const bytes=new Uint8Array(await r.arrayBuffer());assert.equal(bytes[0],31);assert.equal(bytes[1],139);
 const cached=await fetch(base+'/data/planning/overview.json.gz',{headers:{'If-None-Match':r.headers.get('etag')}});assert.equal(cached.status,304);
 const head=await fetch(base+'/data/planning/index.json',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.text()).length,0);
 assert.equal((await fetch(base+'/missing.json')).status,404);assert.equal((await fetch(base+'/%2e%2e%5cpackage.json')).status,403);
});
