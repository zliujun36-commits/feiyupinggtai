// Source-specific labels: a local snapshot update is not a national data refresh.
export function sourceSummary(metadata){
 return metadata.summary||`空域来自 ${metadata.sourceFile}，共 ${metadata.featureCount.toLocaleString()} 个边界要素；文件声明来源 ${metadata.declaredSource}，生成日期 ${metadata.generatedAt}，未经独立核验现行状态。`;
}
export function validityText(begin,end){
 const date=value=>Number.isFinite(value)&&value>0?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value*1000)):'未提供';
 return !begin&&!end?'原文件未提供':`${date(begin)} — ${date(end)}（北京时间；原文件声明）`;
}
export function featureSourceInfo(record,metadata){
 if(record.sourceKind==='dji-national')return {dateLabel:'数据抓取日期',date:record.retrievedAt,source:record.declaredSource,file:record.sourceFile,height:record.height>0?`${record.height} 米（源文件原值；未确认海拔或真高）`:'原始 height=0；不解释为零米限高',validity:validityText(record.beginAt,record.endAt),note:`全国查询快照，机型 ${record.drone}；区域代码 ${record.countryCode}。${record.reviewFlags}。坐标基准未核实，未作转换；未认证当前生效状态。`};
 if(record.sourceKind!=='dji-json')return {dateLabel:'文件生成日期',date:metadata.baseSource?.generatedAt||metadata.generatedAt,source:metadata.declaredSource,file:metadata.baseSource?.sourceFile||metadata.sourceFile,height:'原文件未提供',validity:'原文件未提供',note:'按基础 KML 原始边界展示；本次 JSON 未覆盖此区域 ID，保留旧记录，未核验现行状态。'};
 return {dateLabel:'数据抓取日期',date:record.retrievedAt,source:record.declaredSource,file:record.sourceFile,height:record.height>0?`${record.height} 米（原文件声明）`:'原始 height=0 或未提供；不解释为零米限高',validity:validityText(record.beginAt,record.endAt),note:`${record.queryCity}范围查询（包含周边、不保证完整），机型 ${record.drone}。${record.geometryKind==='circle'?'按原始中心及 '+record.radiusMeters+' 米半径生成圆形近似边界。':'保留原始子区域多边形。'}坐标基准未声明，未作转换；抓取日期不代表官方生效日期。`};
}
