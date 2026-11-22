import {catalog,artifact,checkedAir,overviewArtifact} from './route-catalog.js';
const colors=['#287b75','#278374','#2864c8','#8053a6','#65798f'];
const num=v=>v.toLocaleString('zh-CN');
function spatialLines(bytes){
  if(bytes.byteLength%17)throw Error('路线几何分片损坏');
  const view=new DataView(bytes),cells=new Map();
  const key=(x,y)=>x*8192+y;
  for(let i=0;i<bytes.byteLength;i+=17){
    const a=view.getInt32(i,true)/1e7,b=view.getInt32(i+4,true)/1e7;
    const c=view.getInt32(i+8,true)/1e7,d=view.getInt32(i+12,true)/1e7;
    for(let x=Math.floor(Math.min(a,c)*20);x<=Math.floor(Math.max(a,c)*20);x++){
      for(let y=Math.floor(Math.min(b,d)*20);y<=Math.floor(Math.max(b,d)*20);y++){
        const k=key(x,y);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);
      }
    }
  }
  return {view,cells,key};
}
export function networkLayer(map){
  const text=document.querySelector('#route-network-count'),toggle=document.querySelector('#route-network-show');
  const home=document.querySelector('#route-network-home');
  const canvas=L.DomUtil.create('canvas','feiyu-route-network leaflet-layer leaflet-zoom-hide');
  canvas.style.pointerEvents='none';canvas.setAttribute('aria-hidden','true');
  map.getPanes().overlayPane.prepend(canvas);
  let active=false,region=null,province='',version=0,scene=[],tick=0,coarse=false,available=[],overview,renderKey='';
  const cache=new Map();
  function full(id){
    if(cache.has(id)){const hit=cache.get(id);cache.delete(id);cache.set(id,hit);return hit;}
    const pending=artifact(id,'lines').then(spatialLines).catch(error=>{cache.delete(id);throw error;});
    cache.set(id,pending);while(cache.size>8)cache.delete(cache.keys().next().value);return pending;
  }
  function overviews(){
    if(!overview)overview=Promise.all([overviewArtifact(),catalog()]).then(([bytes,m])=>{
      const result=new Map(),v=new DataView(bytes);let i=0;
      for(const c of m.cities){
        const n=v.getUint32(i,true);i+=4;result.set(c.id,spatialLines(bytes.slice(i,i+17*n)));i+=17*n;
      }if(i!==bytes.byteLength)throw Error('全国线路概览长度错误');return result;
    }).catch(error=>{overview=null;throw error;});
    return overview;
  }
  function draw(){
    if(!active||!scene.length||!toggle.checked){canvas.hidden=true;return;}
    canvas.hidden=false;
    const {x:w,y:h}=map.getSize(),dpr=Math.min(2,window.devicePixelRatio||1);
    canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';
    L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const box=map.getBounds(),x0=Math.floor(box.getWest()*20),x1=Math.floor(box.getEast()*20),
      y0=Math.floor(box.getSouth()*20),y1=Math.floor(box.getNorth()*20);
    const parts=Array.from({length:5},()=>new Path2D());
    for(const {view,cells,key} of scene){
    const visible=new Set();
    if((x1-x0+1)*(y1-y0+1)>cells.size*2){for(const group of cells.values())for(const i of group)visible.add(i);}
    else for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const i of cells.get(key(x,y))||[])visible.add(i);
    for(const i of visible){
      const x=view.getInt32(i,true)/1e7,y=view.getInt32(i+4,true)/1e7,xx=view.getInt32(i+8,true)/1e7,yy=view.getInt32(i+12,true)/1e7;
      if(Math.min(x,xx)>box.getEast()||Math.max(x,xx)<box.getWest()||Math.min(y,yy)>box.getNorth()||Math.max(y,yy)<box.getSouth())continue;
      const a=map.latLngToContainerPoint([y,x]),b=map.latLngToContainerPoint([yy,xx]);
      if(!coarse && a.x===b.x && a.y===b.y)continue;
      const mask=view.getUint8(i+16),type=(mask&8)?3:(mask&4)?2:(mask&2)?1:(mask&1)?0:4;
      if(a.x===b.x && a.y===b.y)parts[type].rect(a.x,a.y,.6,.6);
      else {parts[type].moveTo(a.x,a.y);parts[type].lineTo(b.x,b.y);}
    }
    }
    for(const k of [4,0,1,2,3]){
      ctx.strokeStyle=colors[k];ctx.globalAlpha=k===4?.5:.66;ctx.lineWidth=k===4?1.2:1.8;ctx.setLineDash(k===4?[3,4]:[]);ctx.stroke(parts[k]);
    }
  }
  function schedule(){cancelAnimationFrame(tick);tick=requestAnimationFrame(draw);}
  async function redraw(){
    schedule();
    if(!active||!available.length||!toggle.checked)return;
    const box=map.getBounds();
    const visible=region?available:available.filter(({bounds:b})=>b[0]<=box.getEast()&&b[2]>=box.getWest()&&b[1]<=box.getNorth()&&b[3]>=box.getSouth());
    const detailed=Boolean(region)||(map.getZoom()>=9&&visible.length<=8);
    const signature=(detailed?'city/':'overview/')+visible.map(c=>c.id).join('/');
    if(signature===renderKey)return;
    renderKey=signature;const token=version;
    try{
      let next=[];
      if(detailed){
        for(let i=0;i<visible.length;i+=2){
          if(token!==version||renderKey!==signature)return;
          next.push(...await Promise.all(visible.slice(i,i+2).map(c=>full(c.id))));
        }
      }else{const nation=await overviews();next=visible.map(c=>nation.get(c.id));}
      if(token===version&&renderKey===signature){scene=next;coarse=!detailed;schedule();}
    }catch(error){if(token===version&&renderKey===signature){scene=[];renderKey='';text.textContent='线路加载失败：'+error.message;schedule();}}
  }
  map.on('moveend resize zoomend',redraw);toggle.onchange=redraw;
  home.onclick=()=>document.querySelector('[data-region="全国"]').click();
  async function set(on,city){
    const id=city?.id||null,p=document.querySelector('#province').value;
    if(active===on&&id===region&&province===p&&available.length)return;
    const token=++version;active=on;region=id;province=p;scene=[];available=[];renderKey='';canvas.hidden=true;home.hidden=!city&&!p;
    toggle.closest('label').hidden=!on;if(!active)return;
    text.textContent='正在读取全国链路索引…';
    try{
      const [manifest]=await Promise.all([catalog(),checkedAir()]);if(token!==version)return;
      available=manifest.cities.filter(v=>id?v.id===id:!p||v.province===p);
      const item=id?available[0]:p?{
        ...Object.fromEntries(['demands','model','peers'].map(k=>[k,available.reduce((v,c)=>v+c[k],0)])),
        modelStatus:Array.from({length:5},(_,i)=>available.reduce((v,c)=>v+c.modelStatus[i],0))
      }:manifest.totals;
      if(!item)throw Error('未找到地区线路汇总');
      const [drawn,blocked,off,disjoint,shared]=item.modelStatus;
      text.textContent=(city?city.地级市:(p||'全国')+' '+available.length+' 个地区')+' · '+num(item.demands)+' 个需求点。上下级关系 '+num(item.model)+' 条：沿路可达 '+num(drawn)+'、共址 '+num(shared)+'、空域阻断 '+num(blocked)+'、无法接路 '+num(off)+'、路网不连通 '+num(disjoint)+'。同级骨干链路 '+num(item.peers)+' 条（按可达分区构建最小生成森林）。';
      if(!id)text.textContent+=' 全国概览抽取实际路段显示分布；放大或选择地区看完整折线。';
      else if(item.controls>=3)text.textContent+=' 本地区同名路口控制点 '+num(item.controls)+' 个，留一验证中位残差 '+item.looMedianM+' 米。';
      else text.textContent+=item.sourceRoads?' 本地区同名路口控制点不足，路段直接使用 OSM 几何。':' 此地区无对应的 5 月路网分片，使用 OSM 补充道路。';
      await redraw();
    }catch(error){if(token===version){scene=[];canvas.hidden=true;text.textContent='线路加载失败：'+error.message;}}
  }
  return {set};
}
