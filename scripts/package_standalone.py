"""Package the verified static site with a dependency-free local server."""
from pathlib import Path
import zipfile
ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'飞域-v3-独立部署包.zip'
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    files=list((ROOT/'dist').rglob('*'))+list((ROOT/'scripts').glob('*.mjs'))+list((ROOT/'scripts').glob('*.cjs'))+list((ROOT/'scripts').glob('*.py'))+list((ROOT/'scripts').glob('*.ps1'))+list((ROOT/'tests').glob('*'))+[ROOT/'README.md',ROOT/'package.json',ROOT/'server.cjs']
    for file in files:
        if file.is_file():z.write(file,'feiyu-v3/'+file.relative_to(ROOT).as_posix(),compress_type=zipfile.ZIP_STORED if file.suffix=='.gz' else zipfile.ZIP_DEFLATED)
print(str(target)+' / '+str(target.stat().st_size)+' bytes')
