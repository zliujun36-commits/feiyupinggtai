"""Create a credential-free Tencent SCF event-function ZIP from current sources."""
from pathlib import Path
import json
import zipfile

root=Path(__file__).resolve().parent.parent
source=root/'cloud'/'feiyu-agent'
target=root/'.deploy'/'feiyu-scf-ready.zip'
target.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
    for src,dst in [('tencent-handler.cjs','index.js'),('server.mjs','server.mjs'),('knowledge.mjs','knowledge.mjs'),('knowledge.json','knowledge.json'),('TENCENT.md','TENCENT.md')]:
        archive.writestr(dst,(source/src).read_text(encoding='utf-8').replace('\r\n','\n'))
    archive.writestr('package.json',json.dumps({'name':'feiyu-scf-agent','private':True,'type':'commonjs','engines':{'node':'>=20'}},ensure_ascii=False))
print(target)
