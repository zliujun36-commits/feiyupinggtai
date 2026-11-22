"""Route model assignments and build same-tier minimum spanning forests on OSM roads."""
import argparse, gzip, hashlib, importlib.util, json, os, struct, subprocess, sys, tempfile
from pathlib import Path
from collections import Counter
import numpy as np
import shapely

spec=importlib.util.spec_from_file_location('fit',Path(__file__).with_name('fit-road-geometry.py'))
fit=importlib.util.module_from_spec(spec);spec.loader.exec_module(fit)
cache=Path('.qa/road-fit');planning=Path('dist/data/planning')
def dump(path,data):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_bytes(data);os.replace(temp,path)
def compact(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def gzipfile(path,data):dump(path,gzip.compress(data,compresslevel=3,mtime=0))
def file_digest(path):
    if not path.exists():return 'missing'
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def table(pack,name,fields):
    t=pack['tables'][name];idx=[t['columns'].index(k) for k in fields]
    return [tuple(r[i] for i in idx) for r in t['rows']]
def get_pairs(pack,scale):
    points=[];ids={};levels=[]
    for name,key in [('candidates','候选点ID'),('centers','中心ID')]:
        cols=[key,'经度','纬度']+(['层级'] if name=='centers' else [])
        for ident,x,y,*level in table(pack,name,cols):
            assert ident not in ids
            ids[ident]=len(points);points.append([x,y]);levels.append(('demand','DZ','LD','DC').index(level[0]) if level else 0)
    xy=np.rint(np.array(points)*1e7).astype('i4')
    pairs=[(ids[a],ids[b],0) for a,b in table(pack,'coverage',['点ID','cluster_uid'])]
    return xy,[k.split('|')[-1] for k in ids],levels,pairs,len(pairs)
def project(p,ep):
    v=ep[:,1]-ep[:,0];t=np.clip(((p-ep[:,0])*v).sum(axis=1)/np.maximum((v*v).sum(axis=1),1e-20),0,1)
    return ep[:,0]+v*t[:,None]
def snap(xy,vertices,edges,obstacles,scale):
    uniq,inverse=np.unique(xy,axis=0,return_inverse=True)
    out=np.zeros((len(uniq),7),'i4');out[:,0:2]=uniq;out[:,2:4]=-1;out[:,6]=2
    pg=uniq/1e7;px=pg*scale;blocked=fit.masked(obstacles,shapely.points(pg))
    out[blocked,6]=1
    if not len(edges):return out[inverse]
    subset=np.flatnonzero(~blocked)
    if not len(subset):return out[inverse]
    def candidates(idx,ei):
        q=project(px[idx],vertices[edges[ei]]*scale/1e7)
        qxy=np.rint(q/scale*1e7).astype('i4')
        spans=np.stack((pg[idx],qxy/1e7),axis=1)
        ok=~fit.masked(obstacles,shapely.linestrings(spans))
        return qxy,ok
    def save(i,edge,q):
        out[i,2:4]=edges[edge];out[i,4:6]=q;out[i,6]=0
    # Tile-boundary candidates include the entire 500 m search radius.
    tile=1000000; padding=np.ceil(500/scale*1e7).astype(int)+2
    grid=uniq//tile
    low=vertices[edges[:,0],1];high=vertices[edges[:,1],1]
    ymin=np.minimum(low,high);ymax=np.maximum(low,high);del low,high
    for gy in np.unique(grid[subset,1]):
        row=subset[grid[subset,1]==gy]
        band=np.flatnonzero((ymax>=int(gy)*tile-padding[1])&(ymin<=(int(gy)+1)*tile+padding[1]))
        if not len(band):continue
        xx=vertices[edges[band],0];xmin=xx.min(axis=1);xmax=xx.max(axis=1);del xx
        for gx in np.unique(grid[row,0]):
            group=row[grid[row,0]==gx]
            local=band[(xmax>=int(gx)*tile-padding[0])&(xmin<=(int(gx)+1)*tile+padding[0])]
            if not len(local):continue
            tree=shapely.STRtree(shapely.linestrings(vertices[edges[local]]*scale/1e7))
            ii=tree.query_nearest(shapely.points(px[group]),max_distance=500,all_matches=False)
            idx=group[ii[0]];ei=local[ii[1]]
            qs,ok=candidates(idx,ei);save(idx[ok],ei[ok],qs[ok])
            for i in idx[~ok]:
                ec=local[tree.query(shapely.Point(px[i]),predicate='dwithin',distance=500)]
                qs,good=candidates(np.full(len(ec),i),ec);ec,qs=ec[good],qs[good]
                if len(qs):
                    j=np.argmin(np.linalg.norm((qs-uniq[i])*scale/1e7,axis=1));save(i,ec[j],qs[j])
            del tree
    return out[inverse]
def city_run(city,folder,zones,exe,ways,job):
    ident=city['id'];done=folder/(ident+'.summary.json')
    shp=Path('2026年5月全国路网数据/2026年5月全国路网数据_分省市')/city['省份']/city['地级市']
    inputs=[planning/city['path'],ways/(ident+'.ways'),shp.with_suffix('.shp'),shp.with_suffix('.dbf')]
    input_digests=[file_digest(f) for f in inputs]
    fingerprint=hashlib.sha256(compact([job,city['bounds'],*input_digests])).hexdigest()
    input_hash=hashlib.sha256(compact([job[:2],city['bounds'],*input_digests])).hexdigest()
    if done.exists():
        old=json.loads(done.read_text('utf8'))
        compatible=old.get('methodVersion')==2 and old.get('inputHash')==input_hash
        if (old.get('buildHash')==fingerprint or compatible) and all((folder/(ident+'.'+k+'.gz')).is_file() for k in ('paths','lines','graph')):return old
    pack=json.loads(gzip.decompress((planning/city['path']).read_bytes()))
    w,s,e,n=city['bounds'];bounds=[w-.055,s-.055,e+.055,n+.055]
    verts,edges,support,obstacles,scale,stats=fit.build_graph(ways/(ident+'.ways'),shp,bounds,zones)
    graph=struct.pack('<4sII',b'FYR2',len(verts),len(edges))+verts.astype('<i4').tobytes()+edges.astype('<u4').tobytes()+support.astype('u1').tobytes()
    xy,ids,levels,pairs,model=get_pairs(pack,scale);stops=snap(xy,verts,edges,obstacles,scale)
    del edges,support,pack
    with tempfile.TemporaryDirectory(dir=cache) as td:
        temp=Path(td);gp=temp/'g.bin';rp=temp/'req.bin';dest=temp/'paths.bin'
        gp.write_bytes(graph)
        with rp.open('wb') as f:
            f.write(struct.pack('<ddII',*scale,len(stops),len(pairs)));f.write(stops.astype('<i4').tobytes())
            f.write(bytes(levels));f.write(np.array(pairs,'<u4')[:,:2].copy().tobytes() if pairs else b'')
        subprocess.run([str(exe.resolve()),gp.name,rp.name,dest.name],cwd=temp,check=True)
        data=dest.read_bytes()
    peer_count=struct.unpack_from('<I',data)[0]
    peers=np.frombuffer(data,'<u4',peer_count*2,4).reshape(-1,2)
    pairs.extend((int(a),int(b),1) for a,b in peers)
    records=[];counter=[Counter(),Counter()];cursor=4+peer_count*8
    # Each overlay segment is retained once per role; coordinates use original OSM precision.
    overlay={};H=struct.Struct('<BffI')
    def segment(a,b,style):
        if a!=b:
            key=(a,b) if a<b else (b,a);overlay[key]=overlay.get(key,0)|(1<<style)
    pts=[tuple(map(int,p)) for p in xy];anchors=[tuple(map(int,p)) for p in stops[:,4:6]]
    vertex={}
    for a,b,kind in pairs:
        code,meters,access,num=H.unpack_from(data,cursor);cursor+=H.size
        path=np.frombuffer(data,'<u4',num,cursor).tolist();cursor+=4*num
        counter[kind][code]+=1
        records.append([a,b,kind,code,round(meters,1),round(access,1),path])
        if code==0:
            p=anchors[a];style=levels[b];segment(pts[a],p,4)
            for v in path:
                q=vertex.get(v)
                if q is None:q=vertex[v]=tuple(map(int,verts[v]))
                segment(p,q,style);p=q
            segment(p,anchors[b],style);segment(anchors[b],pts[b],4)
    assert cursor==len(data) and (sum(counter[0].values())==model)
    gzipfile(folder/(ident+'.graph.gz'),graph)
    paths=compact({'points':[[i,t,*p,*a,int(s[2]),int(s[3]),int(s[6])] for i,t,p,a,s in zip(ids,levels,pts,anchors,stops)],'routes':records})
    gzipfile(folder/(ident+'.paths.gz'),paths)
    shape=bytearray(17*len(overlay));fmt=struct.Struct('<iiiiB')
    for j,((p,q),flags) in enumerate(overlay.items()):fmt.pack_into(shape,j*17,*p,*q,flags)
    gzipfile(folder/(ident+'.lines.gz'),shape)
    summary={'id':ident,'city':city['地级市'],'province':city['省份'],'demands':city['n_candidates'],'model':model,'peers':len(pairs)-model,'modelStatus':[counter[0][k] for k in range(5)],'peerStatus':[counter[1][k] for k in range(5)],'segments':len(overlay),'sourceRoads':shp.with_suffix('.shp').is_file(),**stats}
    summary.update(tiers=[dict(nodes=levels.count(t),edges=sum(levels[a]==t for a,b in peers),blocked=sum(1 for i,k in enumerate(levels) if k==t and stops[i,6]==1),unsnapped=sum(1 for i,k in enumerate(levels) if k==t and stops[i,6]==2)) for t in range(4)],scale=scale.tolist(),graphHash=hashlib.sha256(graph).hexdigest(),pathsHash=hashlib.sha256(paths).hexdigest(),linesHash=hashlib.sha256(shape).hexdigest())
    summary.update(buildHash=fingerprint,inputHash=input_hash,methodVersion=2,bounds=bounds);dump(done,compact(summary));return summary
def national_overview(folder,stats):
    # One genuine road segment per occupied 0.05-degree cell and district.
    # Keep both original endpoints; never draw a line between two sample cells.
    chunks=[];count=0
    layout=np.dtype([('xy','<i4',(2,2)),('flags','u1')])
    for city in stats:
        raw=gzip.decompress((folder/(city['id']+'.lines.gz')).read_bytes())
        data=np.frombuffer(raw,layout);data=data[(data['flags']&15)!=0]
        if len(data):
            coords=data['xy'].astype('i8');mid=coords.sum(axis=1)//1000000
            key=mid[:,0]*4096+mid[:,1]
            span=(coords[:,1]-coords[:,0])*np.array(city['scale'])/1e7
            order=np.lexsort((-(span*span).sum(axis=1),key))
            first=np.r_[True,np.diff(key[order])!=0];data=data[order[first]]
        chunks.extend((struct.pack('<I',len(data)),data.tobytes()));count+=len(data)
    overview=b''.join(chunks);gzipfile(folder/'overview.gz',overview)
    return count,hashlib.sha256(overview).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--city');p.add_argument('--isolated',action='store_true');p.add_argument('--output',type=Path,required=True);p.add_argument('--ways',type=Path,default=cache/'ways');p.add_argument('--exe',type=Path,default=cache/'route-batch.exe');args=p.parse_args()
    idx=json.loads((planning/'index.json').read_bytes());raw=Path('dist/data/airspace.geojson').read_bytes();air=json.loads(raw)
    assert len(air['features'])==air['metadata']['featureCount'] and len(air['features'])>0
    zones=[(f['bbox'],json.dumps(f['geometry'])) for f in air['features']]
    folder=args.output;folder.mkdir(parents=True,exist_ok=True)
    cities=[c for c in idx['cities'] if not args.city or c['id']==args.city]
    if not args.city:assert (cache/'ways/complete.json').exists()
    stats=[];job=[hashlib.sha256(raw).hexdigest(),file_digest(args.exe),file_digest(Path(__file__)),file_digest(Path(fit.__file__))]
    for j,c in enumerate(cities):
        if args.isolated and not args.city:
            subprocess.run([sys.executable,str(Path(__file__).resolve()),'--city',c['id'],'--output',str(folder),'--ways',str(args.ways),'--exe',str(args.exe)],check=True)
            record=json.loads((folder/(c['id']+'.summary.json')).read_bytes())
        else:record=city_run(c,folder,zones,args.exe,args.ways,job)
        stats.append(record)
        print(j+1,'/',len(cities),c['地级市'],record['modelStatus'],record['controls'],flush=True)
    if not args.city:
        assert sum(c['demands'] for c in stats)==idx['stats']['demand_points']
        totals={key:sum(c[key] for c in stats) for key in ('model','peers','demands','segments','controls','edges','supported')}
        for key in ('modelStatus','peerStatus'):totals[key]=[sum(c[key][j] for c in stats) for j in range(5)]
        provenance=json.loads((cache/'ways/complete.json').read_text())
        overviewCount,overviewHash=national_overview(folder,stats)
        dump(folder/'index.json',compact({'version':2,'airHash':hashlib.sha256(raw).hexdigest(),'source':provenance['source'].splitlines()[0],'osmSHA256':provenance['sha256'],'attribution':'© OpenStreetMap contributors, ODbL 1.0','license':'https://www.openstreetmap.org/copyright','survey':'2026-05','regions':len(stats),'overviewCount':overviewCount,'overviewHash':overviewHash,'totals':totals,'cities':stats}))
if __name__=='__main__':main()
