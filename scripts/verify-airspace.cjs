const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const path=require('node:path');
const source=fs.readFileSync(process.argv[2]||'C:/Users/86181/Desktop/限飞区信息/限飞区.kml');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/data/airspace.geojson'),'utf8'));
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),data.metadata.sourceSha256);
const originals=[...source.toString('utf8').matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map(m=>m[1].trim().split(/\s+/).map(p=>p.split(',').slice(0,2).map(Number)));
assert.equal(data.features.length,originals.length);
assert.equal(data.features.length,data.metadata.featureCount);
assert.equal(new Set(data.features.map(f=>f.id)).size,data.features.length);
let vertices=0;const counts={};
data.features.forEach((f,i)=>{
 assert.equal(f.geometry.type,'Polygon');assert.equal(f.geometry.coordinates.length,1);
 assert.deepEqual(f.geometry.coordinates[0],originals[i],'Coordinates differ from source at '+i);
 const ring=f.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));
 const bounds=[Math.min(...ring.map(p=>p[0])),Math.min(...ring.map(p=>p[1])),Math.max(...ring.map(p=>p[0])),Math.max(...ring.map(p=>p[1]))];assert.deepEqual(bounds,f.bbox);
 for(const [lng,lat] of ring){assert(Number.isFinite(lng)&&Number.isFinite(lat));assert(Math.abs(lng)<=180&&Math.abs(lat)<=90)}
 vertices+=ring.length;counts[f.properties.level]=(counts[f.properties.level]||0)+1;
});
assert.equal(vertices,data.metadata.vertexCount);assert.deepEqual(counts,data.metadata.counts);
console.log(JSON.stringify({verified:true,regions:data.features.length,vertices,counts,bounds:data.bbox,bytes:fs.statSync(path.join(__dirname,'../dist/data/airspace.geojson')).size},null,2));
