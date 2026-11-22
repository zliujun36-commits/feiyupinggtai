// Points are [longitude, latitude]. Expand obstacles by 0.00018 degrees in
// lon/lat space to cover boundary contact and rounding of source coordinates.
import {inPolygon} from './core.js';
const margin=0.00018;
const radians=Math.PI/180;
function offset(a,b,scale){return [(b[0]-a[0])*scale,b[1]-a[1]];}
function project(p,a,b,scale){
  const [dx,dy]=offset(a,b,scale),[px,py]=offset(a,p,scale);
  const t=Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy||1)));
  return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
}
function gap(p,a,b){
  const q=project(p,a,b,1);
  return Math.hypot(q[0]-p[0],q[1]-p[1]);
}
function side(a,b,p){return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);}
function closeSegments(a,b,c,d){
  if(Math.max(a[0],b[0])+margin<Math.min(c[0],d[0])||Math.max(c[0],d[0])+margin<Math.min(a[0],b[0])||
     Math.max(a[1],b[1])+margin<Math.min(c[1],d[1])||Math.max(c[1],d[1])+margin<Math.min(a[1],b[1]))return false;
  if(side(a,b,c)*side(a,b,d)<0 && side(c,d,a)*side(c,d,b)<0)return true;
  return Math.min(gap(a,c,d),gap(b,c,d),gap(c,a,b),gap(d,a,b))<=margin;
}
export function obstacleCheck(collection){
  if(collection.type!=='FeatureCollection'||!collection.features.length||collection.metadata.featureCount!==collection.features.length)
    throw Error('空域数据不完整，暂停规划');
  const cells=new Map();
  function visit(x0,y0,x1,y1,callback){
    for(let x=Math.floor(x0*4);x<=Math.floor(x1*4);x++)
      for(let y=Math.floor(y0*4);y<=Math.floor(y1*4);y++)if(callback(x*1024+y))return true;
    return false;
  }
  for(const zone of collection.features){
    const [w,s,e,n]=zone.bbox || [];
    const rings=zone.geometry?.coordinates;
    if(zone.geometry?.type!=='Polygon'||![w,s,e,n].every(Number.isFinite)||w>e||s>n||!rings?.length)
      throw Error('空域边界格式错误，已停止规划');
    for(const ring of rings){
      if(ring.length<4 || ring[0][0]!==ring.at(-1)[0] || ring[0][1]!==ring.at(-1)[1] ||
          ring.some(([x,y])=>!Number.isFinite(x)||!Number.isFinite(y)||x<w||x>e||y<s||y>n))
        throw Error('空域边界不闭合或超出索引范围，已停止规划');
    }
    visit(w-margin,s-margin,e+margin,n+margin,key=>{
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(zone);
    });
  }
  return function blocked(a,b){
    const w=Math.min(a[0],b[0]),e=Math.max(a[0],b[0]),s=Math.min(a[1],b[1]),n=Math.max(a[1],b[1]);
    return visit(w,s,e,n,key=>cells.get(key)?.some(zone=>{
      const box=zone.bbox;
      if(w>box[2]+margin||e<box[0]-margin||s>box[3]+margin||n<box[1]-margin)return false;
      const rings=zone.geometry.coordinates;
      if(inPolygon(...a,rings)||inPolygon(...b,rings))return true;
      return rings.some(r=>r.some((p,i)=>i>0 && closeSegments(a,b,r[i-1],p)));
    }));
  };
}
export function roadGraph(words){
  const ids=new Map(),positions=[],heads=[],neighbors=[],links=[];
  function vertex(x,y){
    const key=(x-70000000)*67108864+y;
    let id=ids.get(key);
    if(id===undefined){id=positions.length;ids.set(key,id);positions.push([x/1e6,y/1e6]);heads.push(-1);}
    return id;
  }
  function arc(from,to){links.push(heads[from]);heads[from]=neighbors.length;neighbors.push(to);}
  for(let i=0;i<words.length;){
    const count=words[i++];if(count<2||i+2*count>words.length)throw Error('路网分片损坏');
    let x=0,y=0,prev=-1;
    for(let j=0;j<count;j++){
      x+=words[i++];y+=words[i++];const id=vertex(x,y);
      if(prev>=0&&prev!==id){arc(prev,id);arc(id,prev);}prev=id;
    }
  }
  return {positions,heads,neighbors,links};
}
class Queue{
  items=[];
  push(value){
    let i=this.items.length;this.items.push(value);
    while(i){const parent=(i-1)>>1;if(this.items[parent][0]<=value[0])break;this.items[i]=this.items[parent];i=parent;}
    this.items[i]=value;
  }
  pop(){
    const first=this.items[0],last=this.items.pop();
    if(this.items.length){let i=0;while(2*i+1<this.items.length){let child=2*i+1;
      if(child+1<this.items.length&&this.items[child+1][0]<this.items[child][0])child++;
      if(last[0]<=this.items[child][0])break;this.items[i]=this.items[child];i=child;
    }this.items[i]=last;}return first;
  }
}
export function planRoad(graph,blocked,start,end){
  for(const p of [start,end]){
    if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('起终点坐标无效');
    if(blocked(p,p))throw Error('起点或终点位于收录空域内或紧邻边界，无法规划');
  }
  const scale=Math.cos((start[1]+end[1])*0.5*radians);
  const distance=(a,b)=>Math.hypot(...offset(a,b,scale))*111195;
  if(distance(start,end)===0)return {points:[start],meters:0,access:0};
  const {positions,heads,neighbors,links}=graph;
  function snap(p){
    let best=null,limit=500;
    for(let u=0;u<heads.length;u++)for(let j=heads[u];j>=0;j=links[j]){
      const v=neighbors[j];if(v<=u)continue;
      const a=positions[u],b=positions[v];
      if(p[0]<Math.min(a[0],b[0])-0.01||p[0]>Math.max(a[0],b[0])+0.01||p[1]<Math.min(a[1],b[1])-0.005||p[1]>Math.max(a[1],b[1])+0.005)continue;
      const q=project(p,a,b,scale),d=distance(p,q);
      if(d<limit&&!blocked(p,q)&&!blocked(a,b)){limit=d;best={u,v,q,d};}
    }
    if(!best)throw Error('端点 500 米内没有可接入的避限路段');
    return best;
  }
  const a=snap(start),b=snap(end);
  let path=[start,a.q];
  if(a.u!==b.u||a.v!==b.v){
    const endId=positions.length,queue=new Queue(),cost=new Float64Array(endId+1).fill(Infinity),prev=new Int32Array(endId+1).fill(-1);
    function relax(u,v,weight){
      const g=(u<0?0:cost[u])+weight;
      if(g>=cost[v])return;
      cost[v]=g;prev[v]=u;queue.push([g+(v===endId?0:distance(positions[v],b.q)),v,g]);
    }
    for(const u of [a.u,a.v])relax(-1,u,distance(a.q,positions[u]));
    while(queue.items.length){
      const [,u,g]=queue.pop();if(g!==cost[u])continue;if(u===endId)break;
      if(u===b.u||u===b.v)relax(u,endId,distance(positions[u],b.q));
      for(let i=heads[u];i>=0;i=links[i]){
        const v=neighbors[i],weight=distance(positions[u],positions[v]);
        if(g+weight<cost[v]&&!blocked(positions[u],positions[v]))relax(u,v,weight);
      }
    }
    if(!Number.isFinite(cost[endId]))throw Error('避让后所选路网接入点不连通');
    const chain=[];for(let i=prev[endId];i>=0;i=prev[i])chain.push(positions[i]);path=path.concat(chain.reverse());
  }
  path.push(b.q,end);
  let meters=0;
  for(let i=1;i<path.length;i++){
    if(blocked(path[i-1],path[i]))throw Error('路径未通过最终空域复核');
    meters+=distance(path[i-1],path[i]);
  }
  return {points:path,meters,access:a.d+b.d};
}
