"""Stream the delivered ZIP into lossless columnar, per-city gzip JSON. Stdlib only."""
import argparse, collections, csv, gzip, hashlib, io, json, math, re, time, zipfile
from pathlib import Path

LEVELS = ('DZ', 'LD', 'DC')
TABLES = ('candidates','centers','virtual_nodes','coverage','edges','demand_coverage','facilities','uncovered')
EXPECTED = dict(regions=369, demand_points=496464, baseline_covered=375068, planning_covered=496464, virtual_total=33853, land_review=26810)

def typed(key, value):
    if value is None or value.strip() == '': return None
    if key in ('covered','is_virtual_plan','qualification_pass','construction_verified','baseline_complete_path','planning_complete_path','needs_function_capacity_land_confirmation','_baseline_connected','包含虚拟规划节点','population_matched','land_is_hard_constraint','existing_facility_required_for_new_nodes'):
        if value.lower() in ('true','1','1.0'): return True
        if value.lower() in ('false','0','0.0'): return False
        raise ValueError('Unexpected boolean: '+key+'='+value)
    if value in ('True','False'): return value == 'True'
    if key.endswith(('ID','Key','_id','_uid')) or key in ('城市Key','facility_id') or any(v in key.lower() for v in ('名称','name','类型','说明','note','reason','source','status','action')): return value
    if re.fullmatch(r'-?\d+',value): return int(value)
    if re.fullmatch(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?',value):
        v=float(value)
        return v if math.isfinite(v) else None
    return value

def read_csv(z, name):
    with z.open(name) as f:
        reader=csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig',newline=''))
        columns=reader.fieldnames or []
        rows=[{k:typed(k,v) for k,v in row.items()} for row in reader]
    return columns, rows

def compact(columns, rows): return {'columns':columns,'rows':[[r.get(c) for c in columns] for r in rows]}
def dump(path, obj, compressed=False):
    content=json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf8')
    path.parent.mkdir(parents=True,exist_ok=True)
    if compressed: content=gzip.compress(content,compresslevel=7,mtime=0)
    path.write_bytes(content)
    return len(content)
def close(a,b): return math.isclose(float(a),float(b),rel_tol=1e-9,abs_tol=1e-6)
def coordinate(row):
    x,y=row.get('经度'),row.get('纬度')
    return isinstance(x,(int,float)) and isinstance(y,(int,float)) and math.isfinite(x) and math.isfinite(y) and -180<=x<=180 and -90<=y<=90

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--out',default='dist/data/planning');args=parser.parse_args()
    source=Path(args.source);out=Path(args.out);started=time.time();z=zipfile.ZipFile(source)
    roots=[n[:-len('manifest.json')] for n in z.namelist() if n.endswith('/manifest.json') and '/cities/' not in n]
    if len(roots)!=1: raise ValueError('Cannot uniquely identify ZIP dataset root')
    root=roots[0];manifest=json.loads(z.read(root+'manifest.json').decode('utf-8-sig'))
    scols,summaries=read_csv(z,root+'city_summary.csv');_,comparison=read_csv(z,root+'scenario_comparison.csv')
    assert summaries==comparison, 'Scenario comparison differs; explicit reconciliation required'
    bykey={r['城市Key']:r for r in summaries};assert len(bykey)==len(summaries)
    dirs=sorted({n.rsplit('/',1)[0]+'/' for n in z.namelist() if '/cities/' in n and n.endswith('/city_summary.csv')})
    result=[];overview=[];errors=[];schemas={};table_counts=collections.Counter();totals=collections.Counter();node_counts=collections.Counter();virtual_counts=collections.Counter();types=collections.Counter();land=collections.Counter();poi=collections.Counter()
    region_reports=[];raw_total_weight=raw_base_weight=raw_plan_weight=0.;total_bytes=0
    for number,directory in enumerate(dirs):
        _,local_summary=read_csv(z,directory+'city_summary.csv');assert len(local_summary)==1
        s=local_summary[0];key=s['城市Key'];national=bykey[key]
        assert set(s)==set(national) and all(close(v,national[k]) if isinstance(v,(int,float)) and isinstance(national[k],(int,float)) else v==national[k] for k,v in s.items()),key+' local summary mismatch'
        tables={};columns={}
        for name in TABLES:
            columns[name],tables[name]=read_csv(z,directory+name+'.csv');schemas[name]=columns[name];table_counts[name]+=len(tables[name])
        candidates=tables['candidates'];centers=tables['centers'];virtual=tables['virtual_nodes'];coverage=tables['coverage'];edges=tables['edges'];dc=tables['demand_coverage'];facilities=tables['facilities']
        demand={r['候选点ID']:r for r in candidates};nodes={r['中心ID']:r for r in centers};states={r['候选点ID']:r for r in dc}
        assert len(demand)==len(candidates)==len(states)==len(dc)==s['n_candidates'],key+' demand duplicate/missing'
        assert len(nodes)==len(centers),key+' duplicate node'
        assert all(r['城市Key']==key for rows in tables.values() for r in rows),key+' region mismatch'
        invalid=[r.get('候选点ID',r.get('中心ID',r.get('facility_id'))) for rows in (candidates,centers,facilities) for r in rows if not coordinate(r)]
        assert not invalid,key+' invalid coordinates'
        actual_virtual={r['中心ID'] for r in centers if r['is_virtual_plan'] is True}
        assert actual_virtual=={r['中心ID'] for r in virtual} and len(actual_virtual)==len(virtual),key+' virtual mismatch'
        for r in virtual:
            assert r['construction_verified'] is False and r['qualification_pass'] is False
            n=nodes[r['中心ID']];assert r['经度']==n['经度'] and r['纬度']==n['纬度']
        assigned={};actions=collections.Counter()
        for r in coverage:
            child,parent=r['点ID'],r['cluster_uid'];level=r['层级'];assert (level,child) not in assigned,key+' duplicate assignment'
            assigned[level,child]=r;actions[r['coverage_action']]+=1
            assert child in (demand if level=='DZ' else nodes) and parent in nodes,key+' unresolved link'
            assert nodes[parent]['层级']==level
            assert r['covered'] is True and r['distance_m']<=r['radius_m']+1e-6 and r['distance_m']>=0
            assert close(r['radius_m'],s['coverage_radius_'+level+'_km']*1000)
        for r in edges:
            a=assigned[r['层级'],r['child_id']]
            assert a['cluster_uid']==r['parent_id'] and a['coverage_action']==r['coverage_action'] and close(a['distance_m'],r['distance_m'])
        assert len(edges)==sum(r['层级']!='DZ' for r in coverage)
        for did,state in states.items():
            assert did in demand
            a=assigned.get(('DZ',did));b=assigned.get(('LD',a['cluster_uid'])) if a else None;c=assigned.get(('DC',b['cluster_uid'])) if b else None
            assert bool(a and b and c)==state['planning_complete_path'],key+' chain state mismatch'
            assert not state['baseline_complete_path'] or state['planning_complete_path']
        base=sum(r['baseline_complete_path'] is True for r in dc);plan=sum(r['planning_complete_path'] is True for r in dc)
        weight=sum(r['规模权重'] or 0 for r in candidates);bw=sum((demand[r['候选点ID']]['规模权重'] or 0) for r in dc if r['baseline_complete_path']);pw=sum((demand[r['候选点ID']]['规模权重'] or 0) for r in dc if r['planning_complete_path'])
        assert base==s['baseline_covered_points'] and plan==s['planning_covered_points'] and close(weight,s['total_demand_weight']) and close(bw,s['baseline_covered_weight'])
        for level in LEVELS:
            count=sum(r['层级']==level for r in centers);v=sum(r['层级']==level for r in virtual)
            assert count==s['K_'+level] and v==s['virtual_'+level]
            assert close(sum(r['簇权重总和'] or 0 for r in centers if r['层级']==level),weight),key+' weight conservation'
            node_counts[level]+=count;virtual_counts[level]+=v
        assert not tables['uncovered'],key+' planning gap'
        fids={r['facility_id']:r for r in facilities};members=collections.Counter(r['facility_id'] for r in centers)
        assert len(fids)==len(facilities) and set(members)==set(fids)
        assert all(v==fids[k]['节点数'] for k,v in members.items())
        x=[r['经度'] for r in candidates];y=[r['纬度'] for r in candidates];bounds=[min(x),min(y),max(x),max(y)] if x else None
        typ=collections.Counter(r['物流类型'] or '未分类' for r in candidates);landcounts=collections.Counter(r['land_review'] or '未提供' for r in virtual);landtypes=collections.Counter(r['landuse_name'] or '未提供' for r in virtual)
        poicount={k:sum(r.get(k) or 0 for r in candidates) for k in columns['candidates'] if '邻域' in k and '数量' in k}
        cid=hashlib.sha256(key.encode()).hexdigest()[:16]
        extras={'types':dict(typ),'virtualLand':dict(landcounts),'virtualLandTypes':dict(landtypes),'poi':poicount,'actions':dict(actions),'facilities':len(facilities),'bounds':bounds,'center':[sum(y)/len(y),sum(x)/len(x)] if x else None}
        item={**s,**extras,'id':cid,'path':'cities/'+cid+'.json.gz','point_coverage':base/len(dc) if dc else None,'planning_point_coverage':plan/len(dc) if dc else None}
        # Every original field is retained once, in columnar tables, with the virtual supplement separate.
        pack={'key':key,'summary':item,'tables':{name:compact(columns[name],tables[name]) for name in TABLES}}
        item['bytes']=dump(out/item['path'],pack,True);total_bytes+=item['bytes'];result.append(item)
        # Exact aggregations, not samples: one record per city / logistics type / ~0.2-degree cell.
        grid={}
        for r in candidates:
            state=states[r['候选点ID']];g=(r['物流类型'] or '未分类',math.floor(r['经度']*5),math.floor(r['纬度']*5))
            a=grid.setdefault(g,[0,0.,0.,0.,0,0.,0.,0.]);w=r['规模权重'] or 0
            a[0]+=1;a[1]+=r['经度'];a[2]+=r['纬度'];a[3]+=w;a[4]+=int(state['baseline_complete_path']);a[5]+=w if state['baseline_complete_path'] else 0;a[6]+=r['需求得分'] or 0;a[7]=max(a[7],r['需求得分'] or 0)
        for (kind,_,_),a in grid.items():overview.append([cid,kind,a[1]/a[0],a[2]/a[0],a[0],a[3],a[4],a[5],a[6]/a[0],a[7]])
        totals.update(regions=1,demand_points=len(candidates),baseline_covered=base,planning_covered=plan,virtual_total=len(virtual),land_review=landcounts['needs_review'])
        raw_total_weight+=weight;raw_base_weight+=bw;raw_plan_weight+=pw;types.update(typ);land.update(landcounts);poi.update(poicount)
        region_reports.append({'key':key,'passed':True,'demand':len(dc),'centers':len(centers),'links':len(coverage),'virtual':len(virtual),'bytes':item['bytes']})
        if (number+1)%30==0:print(f'Validated and compressed {number+1}/{len(dirs)} regions',flush=True)
    assert dict(totals)==EXPECTED,(totals,EXPECTED)
    assert dict(virtual_counts)=={'DZ':210,'LD':27659,'DC':5984}
    assert close(raw_base_weight/raw_total_weight,manifest['baseline_weight_coverage'])
    # Independently count national root rows without importing them into the app or accumulating twice.
    root_counts={}
    for name in TABLES:
        with z.open(root+name+'.csv') as f:
            reader=csv.reader(io.TextIOWrapper(f,encoding='utf-8-sig',newline=''));next(reader);root_counts[name]=sum(1 for _ in reader)
        assert root_counts[name]==table_counts[name],name+' root/city row count mismatch'
    for city,expected in [('成都市',(10187,8854,0,280,34)),('深圳市',(9836,9801,3,10,1))]:
        s=next(v for v in result if v['地级市']==city);assert (s['n_candidates'],s['baseline_covered_points'],s['virtual_DZ'],s['virtual_LD'],s['virtual_DC'])==expected
    docs=[];evidence=[]
    for name in z.namelist():
        if name.startswith(root) and '/' not in name[len(root):] and (name.endswith('.md') or (name.endswith('.json') and not name.endswith('manifest.json'))):
            content=z.read(name).decode('utf-8-sig');entry={'file':name.rsplit('/',1)[-1],'content':content}
            (docs if name.endswith('.md') else evidence).append(entry)
    _,run=read_csv(z,root+'run_status.csv');_,independent=read_csv(z,next(n for n in z.namelist() if '/cities/' not in n and n.endswith('.csv') and n.rsplit('/',1)[-1] not in [x+'.csv' for x in TABLES]+['city_summary.csv','scenario_comparison.csv','run_status.csv']))
    # Do not publish authors' local filesystem paths; manifest meaning and per-region status remain.
    public_manifest={k:v for k,v in manifest.items() if k!='source'}
    allstats={**totals,'nodes':dict(node_counts),'virtual':dict(virtual_counts),'total_weight':raw_total_weight,'baseline_weight':raw_base_weight,'planning_weight':raw_plan_weight,'point_coverage':totals['baseline_covered']/totals['demand_points'],'weight_coverage':raw_base_weight/raw_total_weight,'planning_point_coverage':totals['planning_covered']/totals['demand_points'],'planning_weight_coverage':raw_plan_weight/raw_total_weight,'types':dict(types),'virtualLand':dict(land),'poi':dict(poi)}
    report={'passed':True,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'regions':region_reports,'root_counts':root_counts,'summary_deduplicated':True,'invalid_coordinates':errors,'checked_links':table_counts['coverage'],'checks':['original coordinates retained; no datum conversion','unique composite IDs','virtual subset and flags','root/city counts','full planning chains','stored distance <= city-layer radius','layer weight conservation','co-location members','scenario summary identical','Chengdu and Shenzhen acceptance'],'elapsed_seconds':round(time.time()-started,2),'compressed_city_bytes':total_bytes}
    index={'version':3,'source':source.name,'source_sha256':report['source_sha256'],'coordinate_status':'原始经纬度未变换；来源基准未独立确认','stats':allstats,'cities':sorted(result,key=lambda s:(s['省份'],s['地级市'])),'schemas':schemas,'manifest':public_manifest,'validation':{'passed':True,'regions':len(result),'links':table_counts['coverage'],'invalid_coordinates':len(errors)},'run_status':[{'城市Key':r['城市Key'],'status':r['status']} for r in run],'independent_checks':independent}
    dump(out/'index.json',index);dump(out/'overview.json.gz',{'columns':['city','type','lng','lat','count','weight','baseline','baselineWeight','scoreMean','scoreMax'],'rows':overview},True)
    dump(out/'methods.json',{'documents':docs,'evidence':evidence,'manifest':public_manifest,'schemas':schemas});dump(out/'validation.json',report)
    print(json.dumps({'passed':True,'totals':dict(totals),'node_counts':dict(node_counts),'city_bytes':total_bytes,'overview_cells':len(overview),'seconds':report['elapsed_seconds']},ensure_ascii=True),flush=True)

if __name__=='__main__':main()
