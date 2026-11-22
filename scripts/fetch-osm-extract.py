from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import urllib.request as net, time, sys, os
out=Path('.qa/road-fit')
out.mkdir(parents=True,exist_ok=True)
stamp=out/'source.txt'
url=stamp.read_text().splitlines()[0] if stamp.exists() else 'https://download.geofabrik.de/asia/china-latest.osm.pbf'
def openrange(url,start,end):
    return net.urlopen(net.Request(url, headers={'Range':f'bytes={start}-{end}','User-Agent':'Feiyu-University-Research/1.0','Accept-Encoding':'identity'}),timeout=80)
with openrange(url,0,0) as r:
    size=int(r.headers['Content-Range'].split('/')[-1]);url=r.geturl();version=r.headers.get('Last-Modified','')
block=8*1024*1024
identity=f'{url}\n{size}\n{version}\n'
if stamp.exists() and stamp.read_text()!=identity: raise ValueError('Source version changed; use new cache directory')
stamp.write_text(identity);dest=out/'china.osm.pbf';tmp=out/'china.partial'
if dest.exists() and dest.stat().st_size==size:sys.exit()
resume=tmp.exists() and tmp.stat().st_size==size
if not resume:
    with tmp.open('wb') as f:f.truncate(size)
def fetch(index):
    marker=out/f'part-{index}.ok'
    if resume and marker.exists():return
    start=index*block;end=min(size,(index+1)*block)-1
    for attempt in range(6):
        try:
            with openrange(url,start,end) as r:
                if r.status!=206 or r.headers['Content-Range']!=f'bytes {start}-{end}/{size}':raise ValueError(str(r.headers))
                with tmp.open('r+b') as f:
                    f.seek(start);n=0
                    while chunk:=r.read(256*1024):n+=f.write(chunk)
                    if n!=end-start+1:raise ValueError('partial response')
            marker.touch();return
        except Exception as e:
            if attempt==5:raise
            print('retry',index,repr(e)[:150],flush=True);time.sleep(1+attempt)
count=(size+block-1)//block
print('source',identity.strip(),count,flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:
    for n,_ in enumerate(pool.map(fetch,range(count)),1):
        if n%10==0:print(n,'/',count,flush=True)
os.replace(tmp,dest)
