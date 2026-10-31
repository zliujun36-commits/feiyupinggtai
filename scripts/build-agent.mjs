import {sourceSummary} from '../dist/airspace-info.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const index=JSON.parse(await readFile('dist/data/planning/index.json','utf8'));
const methods=JSON.parse(await readFile('dist/data/planning/methods.json','utf8'));
const air=JSON.parse(await readFile('dist/data/airspace.geojson','utf8'));
await writeFile('dist/data/airspace-summary.json',JSON.stringify(air.metadata));
const guide=`飞域是研究数据展示平台，有空域速查、低空物流规划、覆盖对比、数据分析、数据与方法五个模块。顶部切换模块，左侧搜索城市、省份或节点ID；窄屏点击左上角菜单展开查询面板。地图可以缩放、点选对象查看详情。
空域速查提供禁飞、限高、授权、警示、加强警示五类空域边界、机场与空域ID搜索。${sourceSummary(air.metadata)} 高度和有效期以各条记录为准，0值不等于零米限高或永久有效。授权飞行区不等于获准飞行，未标注区域不代表可飞。
低空物流规划支持网络、虚拟选址、需求视图；可筛选需求类型、强度、节点层级、来源、土地与状态，查看需求→DZ→LD→DC完整路径。模型服务半径不是可飞区域。选定地区后可以导出筛选CSV及城市完整关系表。全国为精确汇总的空间网格，放大地区看详细数据；不是抽样推测。
DZ是需求服务组，LD、DC为模型二级、三级网络节点，具体功能以原研究定义为准。三级节点和需求点不是相同计数，虚拟节点包含在节点总数中，不能重复相加。共址节点分别计数，不等于独立物理设施数量。非新增模型节点不能称为已建成设施。
覆盖对比有规划情景、原模型覆盖、新增覆盖。完整路径需求点除以全部需求点是点数覆盖率；完整路径需求权重除以总权重是权重覆盖率。全国指标按全国分子分母汇总，不平均城市比例。原模型未提供历史网络几何快照。
数据分析展示全量地区/全国模型指标；地图对象筛选结果在侧栏单独显示，不能混用分母。POI是需求点邻域计数之和，重叠邻域重复计数，不是城市独立POI总数。
规划模型保留连接、优先复用；缺口采用有限候选的贪心覆盖和逆向去冗余，没有保证全球最优、最少节点或最低成本。预算、容量、土地审批、道路与空域许可未全部设为硬约束。100%规划空间覆盖不代表100%可飞或现实可实施。土地待核查与仅不透水面分类均不是建设许可。距离是模型投影平面距离，不是航程/道路里程/飞行时间。物流坐标基准未独立确认，保留原值，不猜测坐标转换。
平台展示已经完成的模型结果，没有在线重跑规划模型；问答助手不能控制无人机、授予飞行许可或提供实时官方管制结论。`;
await mkdir('cloud/feiyu-agent',{recursive:true});
await writeFile('cloud/feiyu-agent/knowledge.json',JSON.stringify({sourceSha256:index.source_sha256,guide,cities:index.cities,airspace:air.metadata,documents:[...methods.documents,...methods.evidence.map((e,i)=>({file:'验证记录 '+(i+1),content:e.content}))],schemas:methods.schemas}));
console.log('Agent knowledge built from the existing 369-region dataset and methods.');
