import {artifact} from './route-catalog.js';
const km = meters => meters < 1000 ? Math.round(meters)+' 米' : (meters/1000).toFixed(2)+' 公里';
const colors = {demand:'#287b75',DZ:'#278374',LD:'#2864c8',DC:'#8053a6'};
function element(tag,text,cls) {
  const node=document.createElement(tag);
  if (text) node.textContent=text;
  if (cls) node.className=cls;
  return node;
}
export function createRoadPlanner(map,closeDetail,notify) {
  const box=document.querySelector('#road-panel'),status=box.querySelector('[role=status]');
  const list=box.querySelector('ol'),run=box.querySelector('[data-road-run]');
  const routeLayer=L.layerGroup().addTo(map);
  let start,end,worker,calculating=false;
  let peerCity,peerIndex;
  function peers(city){
    if(peerCity===city && peerIndex)return peerIndex;
    peerCity=city;
    peerIndex=artifact(city,'paths').then(bytes=>{
      const pack=JSON.parse(new TextDecoder().decode(bytes)),neighbors=new Map();
      const add=(a,b,length)=>{
        const point=pack.points[b],id=pack.points[a][0];
        if(!neighbors.has(id))neighbors.set(id,[]);
        neighbors.get(id).push({id:point[0],level:['demand','DZ','LD','DC'][point[1]],coord:[point[2]/1e7,point[3]/1e7],length});
      };
      for(const [a,b,kind,code,length] of pack.routes)if(kind===1&&(code===0||code===4)){add(a,b,length);add(b,a,length);}
      return neighbors;
    }).catch(error=>{if(peerCity===city)peerIndex=null;throw error;});
    return peerIndex;
  }
  function refresh() {
    box.querySelector('[data-road-start]').textContent=start?.label || '待选择';
    box.querySelector('[data-road-end]').textContent=end?.label || '待选择';
    run.disabled=!(start && end) || calculating;
  }
  function clearResult() {
    if (calculating) {worker?.terminate(); worker=null;}
    calculating=false;routeLayer.clearLayers();list.replaceChildren();status.textContent='';
  }
  function reset() {
    clearResult();worker?.terminate();worker=null;peerCity=peerIndex=null;start=end=null;refresh();
  }
  box.querySelector('[data-road-clear]').onclick=reset;
  function calculate(stops) {
    clearResult();closeDetail();start=stops[0];end=stops.at(-1);
    calculating=true;refresh();status.textContent='正在读取拟合路网并逐段核查空域…';
    try {
      worker ||= new Worker(new URL('./road-worker.js',import.meta.url),{type:'module'});
      const current=worker;
      function fail(message) {
        if(worker!==current)return;
        current.terminate();worker=null;calculating=false;routeLayer.clearLayers();list.replaceChildren();
        status.textContent=message;notify(message);refresh();
      }
      current.onerror=()=>fail('路网计算线程启动失败，请重试。');
      current.onmessage=({data})=>{
        if(worker!==current)return;
        if(data.error){fail(data.error);return;}
        const bounds=L.latLngBounds([]);let total=0;
        for(const [i,leg] of data.legs.entries()) {
          total+=leg.meters;
          const coords=leg.points.map(([lon,lat])=>[lat,lon]);
          const label=stops[i].label+' → '+stops[i+1].label;
          if (leg.meters>0) {
            const style={color:colors[stops[i+1].level],weight:4,opacity:0.94,smoothFactor:0,noClip:true};
            L.polyline(coords.slice(1,-1),style).addTo(routeLayer).bindTooltip(element('span',label+' · 道路段'));
            for(const pair of [coords.slice(0,2),coords.slice(-2)]) {
              L.polyline(pair,{...style,dashArray:'4 5'}).addTo(routeLayer).bindTooltip(element('span','端点接入段'));
            }
          }
          const item=element('li',label+' · '+(leg.meters===0?'共址':km(leg.meters)+'（含接入 '+km(leg.access)+'）'));
          item.style.borderInlineStart='3px solid '+colors[stops[i+1].level];
          list.append(item);
        }
        for (const stop of stops) {
          const pos=[stop.coord[1],stop.coord[0]];bounds.extend(pos);
          L.circleMarker(pos,{radius:6,color:'#fff',weight:2,fillColor:colors[stop.level],fillOpacity:1})
            .addTo(routeLayer).bindTooltip(element('span',stop.label));
        }
        routeLayer.eachLayer(layer=>{if(layer.getBounds)bounds.extend(layer.getBounds());});
        if(bounds.isValid())map.fitBounds(bounds,{padding:[42,42],maxZoom:16});
        calculating=false;refresh();status.textContent='候选链路 '+data.legs.length+' 段，共 '+km(total)+'。实线沿道路，虚线为端点接入。已核查全部收录空域。';
        notify('已绘制候选链路 · '+km(total));
      };
      current.postMessage({city:start.city,ids:stops.map(s=>s.id)});
    } catch(error) {clearResult();refresh();status.textContent=error.message;}
  }
  run.onclick=()=>{if(start && end)calculate([start,end]);};
  function bindDetail(panel,d,city) {
    if (!city)return;
    const row=d.row;
    const stop={city:city.id,id:d.id,level:row.层级 || 'demand',label:(row.层级 || '需求点')+' · '+(row.名称 || d.id.split('|').at(-1)),coord:[row.经度,row.纬度]};
    const actions=element('div','','road-actions');
    function action(title,fn) {
      const button=element('button',title,'secondary');button.type='button';button.onclick=fn;actions.append(button);
    }
    action('设为起点',()=>{clearResult();start=stop;if(end && end.id!==start.id)calculate([start,end]);else{end=null;closeDetail();refresh();status.textContent='已选起点。请选择终点。';notify(status.textContent);}});
    action('设为终点',()=>{clearResult();end=stop;if(start && start.id!==end.id)calculate([start,end]);else{start=null;closeDetail();refresh();status.textContent='已选终点，请选择另一个对象作为起点。';}});
    if(d.up.length)action('规划上级链路',()=>{
      const stops=[stop,...d.up.map(edge=>({city:city.id,id:edge.parent,level:edge.level,label:edge.level+' · '+edge.parent.split('|').at(-1),coord:[edge.points[1][1],edge.points[1][0]]}))];
      calculate(stops);
    });
    action('同级骨干邻点',async()=>{
      if(actions.querySelector('[data-peer-list]'))return;
      const group=element('div','正在读取骨干网络…','road-peers');
      group.dataset.peerList='';actions.append(group);
      try{
        const adjacent=(await peers(city.id)).get(d.id.split('|').at(-1))||[];
        if(!group.isConnected)return;
        group.textContent=adjacent.length?'选择一条同级链路':'此对象没有同级骨干连接。';
        for(const n of adjacent){
          const button=element('button',n.id+' · '+km(n.length),'secondary');
          button.type='button';button.onclick=()=>calculate([stop,{...n,id:city.城市Key+'|'+n.id,city:city.id,label:(n.level==='demand'?'需求点':n.level)+' · '+n.id}]);group.append(button);
        }
      }catch(error){group.textContent=error.message;}
    });
    panel.querySelector('h2').after(actions);
  }
  refresh();
  return {reset,bindDetail,active:()=>Boolean(start||end)};
}
