import {readFile,stat,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const index=JSON.parse(await readFile('dist/data/planning/index.json','utf8'));
assert.equal(index.cities.length,369);assert.equal(new Set(index.cities.map(c=>c.id)).size,369);
for(const c of index.cities)assert.ok((await stat('dist/data/planning/'+c.path)).size>0);
for(const f of await readdir('dist'))if(f.endsWith('.js'))execFileSync(process.execPath,['--check','dist/'+f]);
const html=await readFile('dist/index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(!match[1].includes('://'))await stat('dist/'+match[1]);}
console.log('Build verified: static dist, 369 city shards, all entry assets and JavaScript syntax.');
