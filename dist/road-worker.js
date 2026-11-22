import {obstacleCheck} from './road-routing.js';
import {artifact,catalog,checkedAir} from './route-catalog.js';
import {graphBytes,createFittedRouter} from './fitted-routing.js';
let current,router;
self.onmessage=async ({data})=>{
  try {
    if(current!==data.city || !router){
      const [manifest,air,graph,pack]=await Promise.all([catalog(),checkedAir(),artifact(data.city,'graph'),artifact(data.city,'paths')]);
      const city=manifest.cities.find(c=>c.id===data.city);
      router=createFittedRouter(graphBytes(graph),JSON.parse(new TextDecoder().decode(pack)),city.scale,obstacleCheck(air));
      current=data.city;
    }
    const ids=data.ids.map(id=>id.split('|').at(-1));
    const legs=ids.slice(1).map((to,i)=>{
      try{return router(ids[i],to);}catch(error){throw Error('第 '+(i+1)+' 段：'+error.message);}
    });
    self.postMessage({legs});
  }catch(error){self.postMessage({error:error.message});}
};
