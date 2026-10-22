import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('./knowledge.json',import.meta.url),'utf8'));
export const dataVersion=data.sourceSha256;
const cityName=c=>c.地级市;
function stats(cities){
 const s={地区数:cities.length,需求点:0,原模型完整路径:0,规划完整路径:0,需求总权重:0,原模型覆盖权重:0,规划覆盖权重:0,DZ节点:0,LD节点:0,DC节点:0,新增虚拟DZ:0,新增虚拟LD:0,新增虚拟DC:0};
 for(const c of cities){s.需求点+=c.n_candidates;s.原模型完整路径+=c.baseline_covered_points;s.规划完整路径+=c.planning_covered_points;s.需求总权重+=c.total_demand_weight;s.原模型覆盖权重+=c.baseline_covered_weight;s.规划覆盖权重+=c.total_demand_weight*c.planning_weight_coverage;for(const l of ['DZ','LD','DC']){s[l+'节点']+=c['K_'+l];s['新增虚拟'+l]+=c['virtual_'+l]}}
 s.新增覆盖需求点=s.规划完整路径-s.原模型完整路径;
 s.原模型点数覆盖率=s.需求点?s.原模型完整路径/s.需求点:null;s.规划点数覆盖率=s.需求点?s.规划完整路径/s.需求点:null;s.原模型权重覆盖率=s.需求总权重?s.原模型覆盖权重/s.需求总权重:null;
 return s;
}
const terms=text=>new Set((text.toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]{2}/g)||[]));
const docs=data.documents.flatMap(d=>d.content.match(/[\s\S]{1,1500}/g)?.map((content,i)=>({title:d.file+' · 第 '+(i+1)+' 段',content}))||[]);
export function retrieve(question,context={}){
 const sources=[];
 const add=(title,content,view='methods',city='')=>{const id='S'+(sources.length+1);sources.push({id,title,url:'https://zliujun36-commits.github.io/feiyupinggtai/#mode='+view+(city?'&city='+encodeURIComponent(city):''),content});};
 add('平台使用方法与统计口径',data.guide);
 add('全国模型指标（全量，非当前筛选）',stats(data.cities),'analysis');
 const named=data.cities.filter(c=>question.includes(cityName(c))||question.includes(cityName(c).replace(/市$/,'')));
 const selected=data.cities.find(c=>c.id===context.cityId);
 const matches=[...new Set([...named,...(selected?[selected]:[])])];
 for(const c of matches.slice(0,6))add(c.省份+' / '+cityName(c)+' 全量模型指标',{...stats([c]),城市原始汇总:c},'analysis',c.id);
 if(matches.length>6)add('检索范围说明','本次城市匹配超过六个，仅提供前六个；不能声称已完成所有城市比较。');
 const provinces=[...new Set(data.cities.map(c=>c.省份))].filter(p=>question.includes(p)||(!named.length&&context.province===p));
 for(const p of provinces.slice(0,2))add(p+' 全量模型指标',stats(data.cities.filter(c=>c.省份===p)),'analysis');
 if(/最多|最少|排名|前\s*\d|top|最大/i.test(question)){
  const key=/虚拟/.test(question)?'virtual_total':/新增.*覆盖/.test(question)?'planning_additional_covered_points':'n_candidates';
  const value=c=>key==='virtual_total'?c.virtual_DZ+c.virtual_LD+c.virtual_DC:c[key];
  const ascending=/最少|最小|升序/.test(question);
  add('地区排名（最多列出十个）',{排序字段:key,排序方向:ascending?'升序':'降序',结果:[...data.cities].sort((a,b)=>(value(b)-value(a))*(ascending?-1:1)).slice(0,10).map(c=>({地区:c.城市Key,数值:value(c)}))},'analysis');
 }
 if(/空域|飞|机场|许可|限制|授权|警示/.test(question))add('空域来源与分类',data.airspace);
 const q=terms(question);
 const ranked=docs.map(d=>({...d,score:[...terms(d.content)].filter(t=>q.has(t)).length})).sort((a,b)=>b.score-a.score).filter(d=>d.score>0).slice(0,4);
 for(const d of ranked)add(d.title,d.content);
 if(/字段|schema|数据表/.test(question))add('原始字段字典',data.schemas);
 return sources;
}
