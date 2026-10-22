import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const index=JSON.parse(await readFile('dist/data/planning/index.json','utf8'));
assert.equal(index.cities.length,369);assert.equal(new Set(index.cities.map(c=>c.id)).size,369);
for(const c of index.cities)assert.ok((await stat('dist/data/planning/'+c.path)).size>0);
for(const f of await readdir('dist'))if(f.endsWith('.js'))execFileSync(process.execPath,['--check','dist/'+f]);
// A new asset URL prevents browsers/CDNs from reusing a previous visual release.
// Normalize line endings so Windows checkouts produce the same version as CI.
const css=(await readFile('dist/platform.css','utf8')).replace(/\r\n/g,'\n');
const cssName='platform.'+createHash('sha256').update(css).digest('hex').slice(0,12)+'.css';
await writeFile('dist/'+cssName,css);
const originalHtml=await readFile('dist/index.html','utf8');
assert.match(originalHtml,/href="platform(?:\.[a-f0-9]{12})?\.css"/);
const html=originalHtml.replace(/href="platform(?:\.[a-f0-9]{12})?\.css"/,'href="'+cssName+'"');
if(html!==originalHtml)await writeFile('dist/index.html',html);
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(!match[1].includes('://'))await stat('dist/'+match[1]);}
console.log('Build verified: static dist, 369 city shards, all entry assets and JavaScript syntax.');
