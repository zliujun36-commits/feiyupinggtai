'use strict';
// Tencent SCF event-function adapter. Packaged as index.js with a CommonJS package.json.
const http=require('node:http');
const {once}=require('node:events');
let instance;
async function localInstance(){
 if(!instance)instance=(async()=>{
  const {createAgentServer}=await import('./server.mjs');
  const server=createAgentServer({env:{...process.env,TRUST_PROXY:'true'}});
  server.listen(0,'127.0.0.1');await once(server,'listening');server.unref();
  return server;
 })().catch(e=>{instance=null;throw e});
 return instance;
}
exports.main_handler=async(event={})=>{
 const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
 const allowed=(process.env.ALLOWED_ORIGINS||'https://zliujun36-commits.github.io').split(',').map(x=>x.trim());
 const origin=headers.origin||'';
 const cors=allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{};
 const error=(statusCode,message)=>({statusCode,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify({error:message})});
 if(origin&&!allowed.includes(origin))return error(403,'该网站未被允许调用问答服务。');
 const method=String(event.httpMethod||'GET').toUpperCase();
 const path=String(event.path||'/').split('?')[0];
 if(process.env.PUBLIC_CHAT_ENABLED!=='true'){
  if(method==='GET'&&path==='/health')return{statusCode:200,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify({ready:false,service:'feiyu-agent',reason:'public_chat_disabled'})};
  return error(503,'公开问答尚未启用，请管理员完成配置。');
 }
 if(!['GET','POST','OPTIONS'].includes(method)||!['/chat','/health'].includes(path))return error(404,'接口不存在。');
 let body=typeof event.body==='string'?event.body:JSON.stringify(event.body||{});
 if(body.length>48000)return error(413,'请求内容过长。');
 if(event.isBase64Encoded){try{body=Buffer.from(body,'base64').toString('utf8')}catch{return error(400,'请求编码错误。')}}
 if(Buffer.byteLength(body)>24000)return error(413,'请求内容过长。');
 try{
  const server=await localInstance();
  // Only use SCF's injected client address; never forward a visitor's X-Forwarded-For.
  const forwarded={origin,'content-type':headers['content-type']||'application/json','x-forwarded-for':headers['x-scf-remote-addr']||'unknown'};
  return await new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method,headers:forwarded},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({statusCode:res.statusCode,headers:Object.fromEntries(Object.entries(res.headers).filter(([k])=>!['connection','keep-alive','transfer-encoding','date'].includes(k)).map(([k,v])=>[k,String(v)])),body:Buffer.concat(chunks).toString('utf8')}));});
   req.setTimeout(55000,()=>req.destroy(Error('timeout')));req.on('error',reject);req.end(method==='POST'?body:undefined);
  });
 }catch{return error(502,'问答服务暂时不可用，请稍后重试。');}
};
exports.closeForTests=async()=>{if(instance){const s=await instance;s.closeAllConnections();await new Promise(r=>s.close(r));instance=null;}};
