import test from 'node:test';
import assert from 'node:assert/strict';
import adapter from '../cloud/feiyu-agent/tencent-handler.cjs';
test('Tencent event adapter: explicit public enablement, CORS, base64 and existing frontend contract',async t=>{
 const old={...process.env};const oldFetch=globalThis.fetch;
 t.after(async()=>{await adapter.closeForTests();globalThis.fetch=oldFetch;for(const k of ['PUBLIC_CHAT_ENABLED','DEEPSEEK_API_KEY','ALLOWED_ORIGINS']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
 process.env.DEEPSEEK_API_KEY='test-key-not-real';process.env.ALLOWED_ORIGINS='https://zliujun36-commits.github.io';delete process.env.PUBLIC_CHAT_ENABLED;
 const event={httpMethod:'GET',path:'/health',headers:{Origin:'https://zliujun36-commits.github.io'}};
 assert.equal(JSON.parse((await adapter.main_handler(event)).body).ready,false);
 process.env.PUBLIC_CHAT_ENABLED='true';
 assert.equal(JSON.parse((await adapter.main_handler(event)).body).ready,true);
 const pre=await adapter.main_handler({...event,httpMethod:'OPTIONS',path:'/chat'});assert.equal(pre.statusCode,204);assert.equal(pre.headers['access-control-allow-origin'],event.headers.Origin);
 globalThis.fetch=async()=>Response.json({choices:[{message:{content:'深圳新增完整路径35个。[S3]'}}]});
 // Refresh the function instance so the model client captures this test-only transport.
 await adapter.closeForTests();
 const r=await adapter.main_handler({...event,httpMethod:'POST',path:'/chat',headers:{...event.headers,'Content-Type':'application/json','x-scf-remote-addr':'192.0.2.1'},isBase64Encoded:true,body:Buffer.from(JSON.stringify({question:'深圳新增覆盖多少',context:{cityId:'e736d30240dd622e'}})).toString('base64')});
 assert.equal(r.statusCode,200);const result=JSON.parse(r.body);assert.match(result.answer,/35/);assert.ok(result.sources.some(s=>s.title.includes('深圳')));
 assert.equal((await adapter.main_handler({...event,headers:{Origin:'https://evil.example'}})).statusCode,403);
 assert.equal((await adapter.main_handler({...event,httpMethod:'POST',path:'/chat',body:'x'.repeat(49000)})).statusCode,413);
 assert.equal((await adapter.main_handler({...event,path:'/unexpected'})).statusCode,404);
});
