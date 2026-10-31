const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
async function main(){
 const data=read('dist/data/airspace.geojson');
 const {boundsOf,mergeSnapshots}=await import('./update-airspace-json.mjs');
 if(data.metadata.sourceKind==='dji-national'){
  const bytes=fs.readFileSync(path.join(root,'data-sources/airspace/national-2026-10-30/全国五类区域_数据.json'));
  const {convertNational}=await import('./import-national-airspace.mjs');
  assert.deepEqual(convertNational(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),hash(bytes)),data);
 }
 let original=data.features;
 if(data.metadata.updates?.length){
  const directory='data-sources/airspace/2026-10-30/';
  const archive=read(directory+'replaced-kml.geojson');
  original=[...data.features.filter(f=>f.properties.sourceKind!=='dji-json'),...archive.features].sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5)));
  assert.equal(original.length,data.metadata.baseSource.featureCount);
  assert.equal(hash(JSON.stringify(original)),data.metadata.baseSource.featuresSha256,'Original KML baseline changed');
  const sources=data.metadata.updates.map(u=>{
   const bytes=fs.readFileSync(path.join(root,directory,u.sourceFile));
   assert.equal(hash(bytes),u.sourceSha256,'Snapshot hash changed');
   return {file:u.sourceFile,sha256:u.sourceSha256,data:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))};
  });
  assert.deepEqual(mergeSnapshots(data,sources).collection,data,'Snapshot geometry or metadata differs from source');
 }
 if(process.argv[2]){
  const source=fs.readFileSync(process.argv[2]);
  assert.equal(hash(source),data.metadata.baseSource?.sourceSha256||data.metadata.sourceSha256);
  const rings=[...source.toString('utf8').matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map(m=>m[1].trim().split(/\s+/).map(p=>p.split(',').slice(0,2).map(Number)));
  assert.equal(original.length,rings.length);
  original.forEach((f,i)=>assert.deepEqual(f.geometry.coordinates,[rings[i]],'KML coordinates differ at '+i));
 }
 assert.equal(data.features.length,data.metadata.featureCount);
 assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
 let vertices=0;const counts=Object.fromEntries(Object.keys(data.metadata.counts).map(k=>[k,0])),bbox=[180,90,-180,-90];
 for(const f of data.features){
  assert.equal(f.geometry.type,'Polygon');assert.deepEqual(boundsOf(f.geometry.coordinates),f.bbox);
  for(let i=0;i<4;i++)bbox[i]=i<2?Math.min(bbox[i],f.bbox[i]):Math.max(bbox[i],f.bbox[i]);
  vertices+=f.geometry.coordinates.reduce((n,r)=>n+r.length,0);counts[f.properties.level]=(counts[f.properties.level]||0)+1;
 }
 assert.equal(vertices,data.metadata.vertexCount);assert.deepEqual(counts,data.metadata.counts);assert.deepEqual(bbox,data.bbox);
 if(data.metadata.updates?.length)assert.deepEqual(read('dist/data/airspace-summary.json'),data.metadata);
 console.log(JSON.stringify({verified:true,regions:data.features.length,vertices,counts,bounds:bbox},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
