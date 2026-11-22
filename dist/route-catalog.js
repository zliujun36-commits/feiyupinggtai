import {unpackRoadGraph} from './graph-codec.js';
const directory=new URL('./data/road-network/',import.meta.url);
let manifestPromise;
export const codeText=['沿路网可达','端点位于收录空域内或其边界缓冲带','端点 500 米内没有可安全接入的 OSM 路段','两端位于不同的可用路网连通分区','共址'];
export async function catalog(){
  if(!manifestPromise)manifestPromise=fetch(new URL('index.json',directory),{cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw Error('全国路线索引加载失败');
    const data=await response.json();
    if(data.version!==2 || data.regions!==data.cities.length)throw Error('全国路线索引不完整');
    return data;
  }).catch(error=>{manifestPromise=null;throw error;});
  return manifestPromise;
}
const checksum=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
let airPromise;
export async function checkedAir(){
  if(!airPromise)airPromise=(async()=>{
    const [m,response]=await Promise.all([catalog(),fetch(new URL('./data/airspace.geojson',import.meta.url),{cache:'no-cache'})]);
    if(!response.ok)throw Error('空域数据未就绪');
    const bytes=await response.arrayBuffer();
    if(await checksum(bytes)!==m.airHash)throw Error('空域快照已变更，请重建全国线路后再规划');
    return JSON.parse(new TextDecoder().decode(bytes));
  })().catch(e=>{airPromise=null;throw e;});
  return airPromise;
}
export async function artifact(id,kind){
  const manifest=await catalog(),city=manifest.cities.find(c=>c.id===id);
  if(!city||!['graph','paths','lines'].includes(kind))throw Error('地区路网未收录');
  const packed=kind==='graph' && manifest.graphEncoding==='FYP1';
  return compressed(id+'.'+kind+(packed?'.pack':'')+'.gz',city[kind+'Hash'],packed);
}
export async function overviewArtifact(){
  const manifest=await catalog();return compressed('overview.gz',manifest.overviewHash);
}
async function compressed(name,hash,packed=false){
  const response=await fetch(new URL(name,directory));
  if(!response.ok)throw Error('读取地区线路分片失败');
  const payload=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const bytes=packed?unpackRoadGraph(payload):payload;
  if(await checksum(bytes)!==hash)throw Error('路线数据版本不一致，请刷新重试');
  return bytes;
}
