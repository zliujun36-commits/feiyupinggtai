"""Independent whole-release accounting, topology, checksum and obstacle checks."""
import argparse, gzip, hashlib, json, struct
from collections import Counter
from pathlib import Path
import numpy as np
import shapely
def unpack_graph(data):
    magic,n,m=struct.unpack_from('<4sII',data)
    assert magic==b'FYP1' and len(data)==12+8*n+8*m+(m+7)//8
    offset=12
    def column(count):
        nonlocal offset
        planes=np.frombuffer(data,'u1',count*4,offset).reshape(4,count)
        offset+=4*count
        return np.ascontiguousarray(planes.T).view('<u4').reshape(-1)
    xy=np.empty((n,2),dtype='<i4')
    for axis in range(2):
        d=column(n)
        xy[:,axis]=np.cumsum((d>>1)^(-(d&1)),dtype='<u4').view('<i4')
    e=np.empty((m,2),dtype='<u4')
    e[:,0]=np.cumsum(column(m),dtype='<u4')
    e[:,1]=e[:,0]+1+column(m)
    flags=np.unpackbits(np.frombuffer(data,'u1',offset=offset),bitorder='little',count=m)
    return struct.pack('<4sII',b'FYR2',n,m)+xy.tobytes()+e.tobytes()+flags.tobytes()

def verify_city(folder,summary,city,zones,selected,packed):
    ident=summary['id']
    def content(kind):
        suffix='.pack.gz' if packed and kind=='graph' else '.gz'
        b=gzip.decompress((folder/(ident+'.'+kind+suffix)).read_bytes())
        if packed and kind=='graph':b=unpack_graph(b)
        assert hashlib.sha256(b).hexdigest()==summary[kind+'Hash'];return b
    graph=content('graph');magic,n,m=struct.unpack_from('<4sII',graph)
    assert magic==b'FYR2' and len(graph)==12+8*n+9*m
    edges=np.frombuffer(graph,'<u4',2*m,12+n*8).reshape(-1,2)
    keys=edges[:,0].astype('uint64')*(n+1)+edges[:,1]
    assert len(keys)<2 or np.all(keys[:-1]<keys[1:])
    pack=json.loads(content('paths'));pts=pack['points'];routes=pack['routes']
    assert len({p[0] for p in pts})==len(pts)==city['n_candidates']+sum(city['K_'+k] for k in ['DZ','LD','DC'])
    endpoints=np.array([p[2:4] for p in pts if p[8]!=1],dtype=float).reshape(-1,2)/1e7
    if len(endpoints):assert not zones.query(shapely.points(endpoints),predicate='intersects').size
    relations=set();peers=set();counts=[Counter(),Counter()]
    roots=list(range(len(pts)))
    def root(i):
        while roots[i]!=i:
            roots[i]=roots[roots[i]]
            i=roots[i]
        return i
    paired=[]
    for a,b,kind,code,length,access,path in routes:
        assert 0<=a<len(pts) and 0<=b<len(pts) and 0<=code<5 and kind in (0,1)
        pa,pb=pts[a],pts[b];counts[kind][code]+=1
        if kind:
            assert pa[1]==pb[1] and (min(a,b),max(a,b)) not in peers and code in (0,4)
            ra,rb=root(a),root(b)
            assert ra!=rb,'cycle in a same-tier backbone'
            roots[ra]=rb
            peers.add((min(a,b),max(a,b)))
        else:
            assert pb[1]==pa[1]+1 and (pa[0],pb[0]) not in relations;relations.add((pa[0],pb[0]))
        if code==0:
            assert pa[8]==pb[8]==0 and access<=1000.1 and length>=access-.11
            if path:
                assert path[0] in pa[6:8] and path[-1] in pb[6:8]
                paired.extend(min(u,v)*(n+1)+max(u,v) for u,v in zip(path,path[1:]))
            else:assert pa[6:8]==pb[6:8]
        elif code==4:assert pa[2:4]==pb[2:4] and pa[8]!=1 and pb[8]!=1
        else:assert not path
    queries=np.array(list(set(paired)),dtype=np.uint64)
    if len(queries):positions=np.searchsorted(keys,queries);assert np.all(positions<len(keys)) and np.all(keys[positions]==queries)
    assert len(relations)==city['n_candidates']+city['K_DZ']+city['K_LD']==summary['model']
    original=json.loads(gzip.decompress((Path('dist/data/planning')/city['path']).read_bytes()))['tables']['coverage']
    child=original['columns'].index('点ID');parent=original['columns'].index('cluster_uid')
    assert relations=={(r[child].split('|')[-1],r[parent].split('|')[-1]) for r in original['rows']}
    for k,field in enumerate(['modelStatus','peerStatus']):assert [counts[k][i] for i in range(5)]==summary[field]
    lines=np.frombuffer(content('lines'),dtype=np.dtype([('xy','<i4',(2,2)),('style','u1')]))
    assert len(lines)==summary['segments']
    assert np.isin(selected,lines.view('V17')).all()
    for i in range(0,len(lines),10000):
        hit=zones.query(shapely.linestrings(lines['xy'][i:i+10000]/1e7),predicate='intersects')
        assert not hit.size,(city['地级市'],'overlay intersects buffered obstacle',hit.shape)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('folder',type=Path);args=ap.parse_args()
    folder=args.folder;manifest=json.loads((folder/'index.json').read_bytes())
    idx=json.loads(Path('dist/data/planning/index.json').read_bytes());cities={c['id']:c for c in idx['cities']}
    raw=Path('dist/data/airspace.geojson').read_bytes();assert manifest['airHash']==hashlib.sha256(raw).hexdigest()
    air=json.loads(raw);assert len(air['features'])==air['metadata']['featureCount']
    shapes=shapely.from_geojson([json.dumps(f['geometry']) for f in air['features']])
    zones=shapely.STRtree(shapely.buffer(shapely.make_valid(shapes),.00018,quad_segs=8))
    assert {c['id'] for c in manifest['cities']}==set(cities) and len(manifest['cities'])==len(cities)
    overview=gzip.decompress((folder/'overview.gz').read_bytes());assert hashlib.sha256(overview).hexdigest()==manifest['overviewHash']
    cursor=0;overview_count=0
    for j,summary in enumerate(manifest['cities']):
        ident=summary['id'];city=cities[ident]
        samples=struct.unpack_from('<I',overview,cursor)[0];cursor+=4
        selected=np.frombuffer(overview,'V17',samples,cursor);cursor+=samples*17;overview_count+=samples
        try:verify_city(folder,summary,city,zones,selected,manifest.get('graphEncoding')=='FYP1')
        except Exception as error:raise RuntimeError('Verification failed for '+city['地级市']) from error
        if j%40==0:print('verified',j+1,city['地级市'],flush=True)
    assert cursor==len(overview) and overview_count==manifest['overviewCount']
    totals=manifest['totals']
    for field in ('model','peers','demands','segments','controls','edges','supported'):
        assert totals[field]==sum(c[field] for c in manifest['cities']),field
    for field in ('modelStatus','peerStatus'):
        assert totals[field]==[sum(c[field][s] for c in manifest['cities']) for s in range(5)],field
    print('Verified all',len(cities),'regions:',manifest['totals'],flush=True)
if __name__=='__main__':main()
