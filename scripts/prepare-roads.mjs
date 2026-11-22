import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const source = '2026年5月全国路网数据/2026年5月全国路网数据_分省市';
const output = 'dist/data/roads';
fs.mkdirSync(output, {recursive:true});
const cities = JSON.parse(fs.readFileSync('dist/data/planning/index.json')).cities;
const missing = [];
for (const city of cities) {
  const base = path.join(source,city.省份,city.地级市);
  if (!fs.existsSync(base+'.shp')) { missing.push(city.城市Key); continue; }
  if (!fs.readFileSync(base+'.prj','utf8').includes('GCS_WGS_1984')) throw Error('未知坐标系 '+base);
  const shp = fs.readFileSync(base+'.shp');
  if (shp.readInt32BE(0)!==9994 || shp.readInt32LE(32)!==3 || shp.readInt32BE(24)*2!==shp.length) throw Error('无效路网 '+base);
  const words = [];
  for (let offset=100;offset<shp.length;) {
    const start=offset+8;
    offset=start+2*shp.readInt32BE(start-4);
    const type=shp.readInt32LE(start);
    if (type===0) continue;
    if (type!==3) throw Error('非折线 '+base);
    const parts=shp.readInt32LE(start+36), points=shp.readInt32LE(start+40);
    const coords=start+44+parts*4;
    if (coords+points*16!==offset) throw Error('路网折线长度错误');
    for (let part=0; part<parts;part++) {
      const first=shp.readInt32LE(start+44+part*4);
      const last=part+1===parts?points:shp.readInt32LE(start+48+part*4);
      if(last-first<2)continue;
      words.push(last-first);
      let prevX=0,prevY=0;
      for(let i=first;i<last;i++){
        const x=Math.round(shp.readDoubleLE(coords+i*16)*1e6), y=Math.round(shp.readDoubleLE(coords+i*16+8)*1e6);
        if (!(x>=70000000 && x<=140000000 && y>=0 && y<=56000000)) throw Error('无效道路坐标 '+base);
        words.push(x-prevX,y-prevY);prevX=x;prevY=y;
      }
    }
  }
  const data=Buffer.allocUnsafe(words.length*4);
  words.forEach((word,i)=>data.writeInt32LE(word,i*4));
  const filename=path.join(output,city.id+'.bin.gz');
  fs.writeFileSync(filename+'.tmp',gzipSync(data,{level:4}));fs.renameSync(filename+'.tmp',filename);
}
console.log('城市分片',cities.length-missing.length,'缺少路网',missing);
