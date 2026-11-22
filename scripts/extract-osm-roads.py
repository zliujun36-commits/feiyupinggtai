"""Extract road ways with original OSM node identities. Run at the project root."""
from pathlib import Path
from collections import defaultdict
import hashlib, json, math, struct
import osmium
cache=Path('.qa/road-fit')
cities=json.loads(Path('dist/data/planning/index.json').read_text('utf8'))['cities']
bounds={}
bins=defaultdict(set)
for city in cities:
    w,s,e,n=city['bounds'];bounds[city['id']]=(w-.055,s-.055,e+.055,n+.055)
    w,s,e,n=bounds[city['id']]
    for x in range(math.floor(w),math.floor(e)+1):
        for y in range(math.floor(s),math.floor(n)+1):bins[x,y].add(city['id'])
out=cache/'ways';out.mkdir(exist_ok=True)
roadtypes=set('motorway trunk primary secondary tertiary unclassified residential living_street service road motorway_link trunk_link primary_link secondary_link tertiary_link'.split())
node_record=struct.Struct('<qii');header=struct.Struct('<QHI')
class Roads(osmium.SimpleHandler):
    def __init__(self):
        super().__init__();self.count=0;self.outputs={}
    def way(self,way):
        if way.tags.get('highway') not in roadtypes or len(way.nodes)<2:return
        try:
            records=[(n.ref,n.location.x,n.location.y) for n in way.nodes]
        except osmium.InvalidLocationError:return
        # libosmium invalid locations have a sentinel even when x/y are read directly.
        if any(abs(x)>1800000000 or abs(y)>900000000 for _,x,y in records):return
        xs=[a[1] for a in records];ys=[a[2] for a in records]
        w,s,e,n=min(xs)/1e7,min(ys)/1e7,max(xs)/1e7,max(ys)/1e7
        possible=set()
        for gx in range(math.floor(w),math.floor(e)+1):
            for gy in range(math.floor(s),math.floor(n)+1):possible.update(bins.get((gx,gy),()))
        targets=[c for c in possible if w<=bounds[c][2] and e>=bounds[c][0] and s<=bounds[c][3] and n>=bounds[c][1]]
        if not targets:return
        name=(way.tags.get('name:zh') or way.tags.get('name') or '').encode()
        packet=header.pack(way.id,len(name),len(records))+name+b''.join(node_record.pack(*v) for v in records)
        for c in targets:
            if c not in self.outputs:self.outputs[c]=(out/(c+'.ways')).open('wb',buffering=32768)
            self.outputs[c].write(packet)
        self.count+=1
        if self.count%250000==0:print('OSM roads',self.count,flush=True)
def main():
    pbf=cache/'china.osm.pbf';mark=out/'complete.json'
    source=(cache/'source.txt').read_text()
    if mark.exists() and json.loads(mark.read_text())['source']==source:return
    sha=hashlib.sha256();md5=hashlib.md5()
    with pbf.open('rb') as raw:
        while block:=raw.read(2**20):sha.update(block);md5.update(block)
    checksum=cache/'source.md5'
    if checksum.exists() and checksum.read_text().strip()!=md5.hexdigest():raise ValueError('OSM extract checksum mismatch')
    # Open every city file afresh so a retry cannot mix two extracts.
    for c in bounds:(out/(c+'.ways')).write_bytes(b'')
    handler=Roads()
    index=cache/'osm-node-locations.idx'
    if index.exists():index.unlink()
    try:handler.apply_file(str(pbf),locations=True,idx='sparse_file_array,'+index.as_posix())
    finally:
        for f in handler.outputs.values():f.close()
    mark.write_text(json.dumps({'ways':handler.count,'source':source,'sha256':sha.hexdigest(),'md5':md5.hexdigest()}))
    if index.exists():index.unlink()
    print('OSM extract complete:',handler.count,flush=True)
if __name__=='__main__':main()
