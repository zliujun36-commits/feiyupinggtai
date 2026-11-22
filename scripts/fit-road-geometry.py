"""Geometry helpers for the offline road builder. Coordinates in EPSG:4326."""
from collections import defaultdict
import math, struct
import numpy as np
from scipy.spatial import cKDTree
import shapely

NODE=np.dtype([('id','<i8'),('xy','<i4',(2,))])
def osm_ways(path):
    xy=[]; ids=[]; names=[]; lengths=[]
    with path.open('rb') as f:
        while header:=f.read(14):
            _,n,k=struct.unpack('<QHI',header)
            name=f.read(n).decode()
            a=np.frombuffer(f.read(16*k),NODE)
            ids.append(a['id']);xy.append(a['xy']);names.append(name);lengths.append(k)
    if not xy:return np.empty((0,2),'i4'),np.empty((0,),np.int64),[],np.empty((0,),int)
    return np.concatenate(xy),np.concatenate(ids),names,np.array(lengths)
def shp_ways(base):
    xy=[];names=[];lengths=[]
    with base.with_suffix('.shp').open('rb') as f,base.with_suffix('.dbf').open('rb') as dbf:
        db=dbf.read();head,rowlen=struct.unpack_from('<HH',db,8)
        assert db[32:36]==b'name'
        f.seek(100);record=0
        while h:=f.read(8):
            _,words=struct.unpack('>ii',h);g=f.read(2*words)
            name=db[head+record*rowlen+1:head+record*rowlen+1+db[48]].decode('utf8','replace').strip()
            record+=1
            if struct.unpack_from('<I',g)[0]==0:continue
            parts,n=struct.unpack_from('<II',g,36)
            indices=np.frombuffer(g,'<i4',parts,44);points=np.frombuffer(g,'<f8',2*n,44+4*parts).reshape(-1,2)
            for a,b in zip(indices,[*indices[1:],n]):
                if b-a>=2:
                    xy.append(np.rint(points[a:b]*1e7).astype('i4'));lengths.append(b-a);names.append(name if name not in ('None','无名路','') else '')
    return (np.concatenate(xy) if xy else np.empty((0,2),'i4')),names,np.array(lengths,dtype=int)
def junctions(coords,names,lengths,common):
    if not len(coords):return {}
    nameid=np.repeat([common.get(n,0) for n in names],lengths)
    idx=np.flatnonzero(nameid)
    # Pack positive China longitude/latitude into int64 without collision.
    geom=coords[idx];key=geom[:,0].astype('int64')*1000000000+geom[:,1]
    order=np.lexsort((nameid[idx],key));ks=key[order];ns=nameid[idx[order]]
    hits=np.flatnonzero((ks[1:]==ks[:-1])&(ns[1:]!=ns[:-1]))
    result=defaultdict(set)
    for j in hits:
        pair=(ns[j],ns[j+1]);result[pair].add(tuple(geom[order[j]].tolist()))
    return result
def controls(sxy,snames,slens,oxy,onames,olens,scale):
    common={n:i+1 for i,n in enumerate(sorted((set(snames)&set(onames))-{''}))}
    a=junctions(sxy,snames,slens,common);b=junctions(oxy,onames,olens,common)
    pairs=set()
    for key in sorted(a.keys() & b.keys()):
        if len(a[key])==len(b[key])==1:
            p=next(iter(a[key]));q=next(iter(b[key]))
            if math.hypot((p[0]-q[0])*scale[0]/1e7,(p[1]-q[1])*scale[1]/1e7)<1300:pairs.add((p,q))
    if not pairs:return np.empty((0,2)),np.empty((0,2)),None
    data=np.array(sorted(pairs),dtype=float)*scale/1e7
    p=data[:,0];delta=data[:,1]-p
    median=np.median(delta,axis=0);keep=np.linalg.norm(delta-median,axis=1)<110
    p,delta=p[keep],delta[keep]
    if len(p)<3:return p,delta,None
    ds,idx=cKDTree(p).query(p,k=min(5,len(p)))
    # Leave each control out for an independent local displacement estimate.
    weights=1/np.maximum(ds[:,1:],10)**2
    est=(delta[idx[:,1:]]*weights[:,:,None]).sum(1)/weights.sum(1)[:,None]
    error=np.linalg.norm(delta-est,axis=1)
    return p,delta,round(float(np.median(error)),2)
def edge_indices(lengths):
    if not len(lengths):return np.empty(0,int)
    mask=np.ones(sum(lengths),bool);mask[np.cumsum(lengths)-1]=False
    return np.flatnonzero(mask)
def corridor_support(sxy,slens,controls_xy,delta,osm_xy,edges,scale):
    supported=np.zeros(len(edges),bool)
    if len(controls_xy)<3 or not len(edges):return supported
    # Sample local road centrelines every <=32 m; orientations distinguish crossing roads.
    pts=sxy.astype(float)*scale/1e7; starts=edge_indices(slens)
    a=pts[starts];v=pts[starts+1]-a;length=np.linalg.norm(v,axis=1)
    valid=length>.2;a=a[valid];v=v[valid];length=length[valid]
    if not len(a):return supported
    steps=np.maximum(1,np.ceil(length/32).astype('i4'));ix=np.repeat(np.arange(len(steps)),steps)
    fraction=(np.arange(len(ix))-np.repeat(np.cumsum(steps)-steps,steps)+.5)/steps[ix]
    sample=a[ix]+v[ix]*fraction[:,None];direction=(v/length[:,None])[ix].astype('f4')
    del pts,starts,a,v,length,steps,ix,fraction,valid
    ct=cKDTree(controls_xy);within=np.zeros(len(sample),bool)
    for i in range(0,len(sample),50000):
        chunk=sample[i:i+50000];ds,ids=ct.query(chunk,k=min(4,len(controls_xy)))
        w=1/np.maximum(ds,10)**2;chunk+=(delta[ids]*w[:,:,None]).sum(1)/w.sum(1)[:,None]
        within[i:i+len(chunk)]=ds[:,0]<=30000
    if not np.any(within):return supported
    if not np.all(within):sample=sample[within];direction=direction[within]
    tree=cKDTree(sample)
    for i in range(0,len(edges),6000):
        ep=osm_xy[edges[i:i+6000]]*scale/1e7;v=ep[:,1]-ep[:,0];length=np.linalg.norm(v,axis=1)
        d=v/np.maximum(length,.01)[:,None]
        # Endpoints and midpoint must agree with the calibrated corridor.
        ok=np.ones(len(v),bool)
        for t in (.1,.5,.9):
            ds,ix=tree.query(ep[:,0]+v*t,k=min(4,len(sample)),distance_upper_bound=42.000001)
            if ds.ndim==1:ds=ds[:,None];ix=ix[:,None]
            ix=np.minimum(ix,len(sample)-1)
            ok &= ((ds<=42)&(abs((direction[ix]*d[:,None]).sum(axis=2))>=0.74)).any(axis=1)
        supported[i:i+len(v)]=ok
    return supported
def obstacle_tree(zones,bounds):
    w,s,e,n=bounds
    selected=[shapely.from_geojson(z) for box,z in zones if box[0]<=e+.02 and box[2]>=w-.02 and box[1]<=n+.02 and box[3]>=s-.02]
    if not selected:return None
    return shapely.STRtree(shapely.buffer(shapely.make_valid(selected),.000182,quad_segs=12))
def masked(tree,geoms):
    out=np.zeros(len(geoms),bool)
    if tree is not None and len(geoms):out[tree.query(geoms,predicate='intersects')[0]]=True
    return out
def build_graph(raw,base,bounds,zones):
    scale=np.array([111195*math.cos(math.radians((bounds[1]+bounds[3])/2)),111195.])
    xy,ids,onames,olens=osm_ways(raw)
    cp=np.empty((0,2));delta=cp;err=None
    if base and base.with_suffix('.shp').is_file():
        sxy,snames,slens=shp_ways(base)
        cp,delta,err=controls(sxy,snames,slens,xy,onames,olens,scale)
    else:sxy=np.empty((0,2));slens=[]
    stats={'controls':len(cp),'looMedianM':err,'offsetM':np.median(delta,axis=0).round(1).tolist() if len(cp) else None}
    oid,first,inverse=np.unique(ids,return_index=True,return_inverse=True)
    vertices=xy[first];starts=edge_indices(olens);edges=np.column_stack((inverse[starts],inverse[starts+1])).astype('u4')
    del xy,ids,first,inverse,oid,starts,onames,olens
    if len(edges):
        edges.sort(axis=1);edges=edges[edges[:,0]!=edges[:,1]]
        edgekeys=np.unique(edges[:,0].astype('uint64')*len(vertices)+edges[:,1]);del edges
        edges=np.empty((len(edgekeys),2),'u4');edges[:,0]=edgekeys//len(vertices);edges[:,1]=edgekeys%len(vertices);del edgekeys
    # Retain full source geometry of each edge. No pixel/tile tracing or smoothing.
    tree=obstacle_tree(zones,bounds)
    safe=np.ones(len(edges),bool)
    for i in range(0,len(edges),30000):
        ep=vertices[edges[i:i+30000]]/1e7
        inside=((ep[:,:,0]>=bounds[0])&(ep[:,:,0]<=bounds[2])&(ep[:,:,1]>=bounds[1])&(ep[:,:,1]<=bounds[3])).all(axis=1)
        safe[i:i+len(ep)]=inside & (~masked(tree,shapely.linestrings(ep)) if tree is not None else True)
    edges=edges[safe]
    used,inv=np.unique(edges.reshape(-1),return_inverse=True)
    vertices=vertices[used];edges=inv.reshape(-1,2).astype('u4')
    del used,inv,safe
    supported=corridor_support(sxy,slens,cp,delta,vertices,edges,scale)
    stats.update(vertices=len(vertices),edges=len(edges),supported=int(supported.sum()))
    return vertices,edges,supported,tree,scale,stats
