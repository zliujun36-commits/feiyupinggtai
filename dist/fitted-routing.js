import {codeText} from './route-catalog.js';

export function graphBytes(bytes){
  const header=new DataView(bytes);
  if(header.getUint32(0,false)!==0x46595232)throw Error('OSM 图版本错误');
  const n=header.getUint32(4,true),m=header.getUint32(8,true);
  if(12+n*8+m*9!==bytes.byteLength)throw Error('OSM 图不完整');
  const xy=new Int32Array(bytes,12,n*2),edges=new Uint32Array(bytes,12+n*8,m*2),supported=new Uint8Array(bytes,12+n*8+m*8,m);
  const offsets=new Uint32Array(n+1);
  for(const v of edges){if(v>=n)throw Error('道路端点无效');offsets[v+1]++;}
  for(let i=0;i<n;i++)offsets[i+1]+=offsets[i];
  const cursor=offsets.slice(),arcs=new Uint32Array(m*2);
  for(let e=0;e<m;e++){arcs[cursor[edges[2*e]]++]=e;arcs[cursor[edges[2*e+1]]++]=e;}
  return {xy,edges,supported,offsets,arcs,n};
}
class MinQueue{
  a=[];
  push(x){
    const a=this.a;let i=a.length;a.push(x);
    while(i){const p=(i-1)>>1;if(a[p][0]<=x[0])break;a[i]=a[p];i=p;}a[i]=x;
  }
  pop(){
    const a=this.a,first=a[0],last=a.pop();if(!a.length)return first;
    let i=0;while(i*2+1<a.length){
      let j=i*2+1;if(j+1<a.length&&a[j+1][0]<a[j][0])j++;
      if(a[j][0]>=last[0])break;a[i]=a[j];i=j;
    }a[i]=last;return first;
  }
}
export function createFittedRouter(graph,pack,scale,blocked){
  const {xy,edges,supported,offsets,arcs}=graph;
  const ids=new Map(pack.points.map((p,i)=>[p[0],i]));
  const saved=new Map();
  for(const row of pack.routes){
    const key=row[0]+','+row[1];if(!saved.has(key))saved.set(key,row);
  }
  function vertex(i){return [xy[2*i]/1e7,xy[2*i+1]/1e7];}
  function point(p,i){return [p[i]/1e7,p[i+1]/1e7];}
  function distance(a,b){return Math.hypot((a[0]-b[0])*scale[0],(a[1]-b[1])*scale[1]);}
  function weight(u,v){
    for(let i=offsets[u];i<offsets[u+1];i++){
      const e=arcs[i];if((edges[2*e]^edges[2*e+1]^u)===v)return supported[e]?1:1.18;
    }throw Error('端点与道路版本不匹配');
  }
  function path(a,b){
    const [u,v]=a.slice(6,8),[r,s]=b.slice(6,8),aq=point(a,4),bq=point(b,4);
    if(u===r&&v===s)return [];
    const open=new MinQueue(),g=new Map(),parent=new Map();
    const add=(i,prev,cost)=>{
      if(cost>=(g.get(i)??Infinity))return;
      g.set(i,cost);parent.set(i,prev);open.push([cost+distance(vertex(i),bq),i,cost]);
    };
    const startWeight=weight(u,v),endWeight=weight(r,s);
    for(const i of [u,v])add(i,-1,startWeight*distance(aq,vertex(i)));
    let best=Infinity,last=-1;
    while(open.a.length){
      const [estimate,i,cost]=open.pop();if(estimate>=best)break;if(g.get(i)!==cost)continue;
      const p=vertex(i);
      if(i===r||i===s){const d=cost+endWeight*distance(p,bq);if(d<best){best=d;last=i;}}
      for(let j=offsets[i];j<offsets[i+1];j++){
        const e=arcs[j],k=edges[2*e]^edges[2*e+1]^i;
        add(k,i,cost+distance(p,vertex(k))*(supported[e]?1:1.18));
      }
    }
    if(last<0)throw Error(codeText[3]);
    const out=[];for(let i=last;i!==-1;i=parent.get(i))out.push(i);
    return out.reverse();
  }
  return function route(from,to){
    const ai=ids.get(from),bi=ids.get(to);
    if(ai===undefined||bi===undefined)throw Error('所选对象与当前地区不一致');
    const a=pack.points[ai],b=pack.points[bi],start=point(a,2),end=point(b,2);
    if(a[8]===1||b[8]===1||blocked(start,start)||blocked(end,end))throw Error(codeText[1]);
    if(a[2]===b[2]&&a[3]===b[3])return {points:[start],meters:0,access:0};
    if(a[8]||b[8])throw Error(codeText[2]);
    let row=saved.get(ai+','+bi),reverse=false;
    if(!row){row=saved.get(bi+','+ai);reverse=true;}
    if(row&&row[3]!==0)throw Error(codeText[row[3]]);
    const indices=row?(reverse?row[6].slice().reverse():row[6]):path(a,b);
    const points=[start,point(a,4),...indices.map(vertex),point(b,4),end];
    let meters=0;
    for(let i=1;i<points.length;i++){
      if(blocked(points[i-1],points[i]))throw Error('路线未通过当前空域复核');
      meters+=distance(points[i-1],points[i]);
    }
    return {points,meters,access:distance(points[0],points[1])+distance(points.at(-2),end)};
  };
}
