import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {packRoadGraph,unpackRoadGraph} from '../dist/graph-codec.js';

const [source,output,...selected]=process.argv.slice(2);
if(!source||!output) throw Error('Usage: node scripts/pack-page-graphs.mjs INPUT OUTPUT [city IDs...]');
const manifest=JSON.parse(readFileSync(path.join(source,'index.json')));
mkdirSync(output,{recursive:true});
const regions=manifest.cities.filter(c=>!selected.length||selected.includes(c.id));
let total=0,original=0,count=0;
for(const city of regions) {
  const file=city.id+'.graph.gz';
  const rawPath=path.join(source,file);
  const packedName=city.id+'.graph.pack.gz';
  const sourceBytes=readFileSync(existsSync(rawPath)?rawPath:path.join(source,packedName));
  const decoded=gunzipSync(sourceBytes);
  const raw=unpackRoadGraph(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.length));
  const packed=gzipSync(new Uint8Array(packRoadGraph(raw)),{level:7});
  const check=gunzipSync(packed);
  const restored=unpackRoadGraph(check.buffer.slice(check.byteOffset,check.byteOffset+check.length));
  const hash=createHash('sha256').update(new Uint8Array(restored)).digest('hex');
  if(hash!==city.graphHash) throw Error('Graph hash mismatch '+city.city);
  const target=path.join(output,packedName);
  writeFileSync(target+'.tmp',packed);renameSync(target+'.tmp',target);
  total+=packed.length;original+=sourceBytes.length;count++;
  if(count%40===0||count===regions.length) console.log(count+'/'+regions.length,city.city,original,total);
}
if(!selected.length) {
  const indexFile=path.join(output,'index.json');
  writeFileSync(indexFile+'.tmp',JSON.stringify({...manifest,graphEncoding:'FYP1'}));
  renameSync(indexFile+'.tmp',indexFile);
}
