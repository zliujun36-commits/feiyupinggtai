const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'dist'),port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.gz':'application/octet-stream'};
http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end()}
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end()}
 const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||pathname.includes('\0')||pathname.includes('\\')){res.writeHead(403);return res.end()}
 fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);return res.end('Not found')}
  const etag='"'+stat.size+'-'+Math.trunc(stat.mtimeMs)+'"';res.setHeader('ETag',etag);res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end()}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Content-Length',stat.size);
  // .json.gz is application-level compression. Do not set Content-Encoding:gzip.
  if(req.method==='HEAD')return res.end();const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
 });
}).listen(port,host,()=>console.log(`Local: http://${host}:${port}`));
