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
let html=originalHtml.replace(/href="platform(?:\.[a-f0-9]{12})?\.css"/,'href="'+cssName+'"');
// The supplied SCF widget replaces the old public-agent UI. Only one launcher is loaded.
html=html.replace(/<link rel="stylesheet" data-feiyu-agent="css" href="[^"]+">/g,'').replace(/<script[^>]*data-feiyu-agent="[^"]+"[^>]*><\/script>/g,'');
const config=JSON.parse(await readFile('dist/agent-config.json','utf8'));
assert.deepEqual(Object.keys(config),['endpoint']);
const endpoint=new URL(config.endpoint);
assert.equal(endpoint.protocol,'https:');
assert.ok(!endpoint.username&&!endpoint.password&&!endpoint.search&&!endpoint.hash);
for(const base of ['feiyu-ai-widget','agent']){
 const content=(await readFile('dist/'+base+'.js','utf8')).replace(/\r\n/g,'\n');
 const name=base+'.'+createHash('sha256').update(content).digest('hex').slice(0,12)+'.js';
 await writeFile('dist/'+name,content);
 const attributes=base==='feiyu-ai-widget'?'defer data-url="'+endpoint.href.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"':'type="module"';
 html=html.replace('</head>','<script '+attributes+' data-feiyu-agent="'+base+'" src="'+name+'"></script></head>');
}
if(html!==originalHtml)await writeFile('dist/index.html',html);
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(!match[1].includes('://'))await stat('dist/'+match[1]);}
console.log('Build verified: static dist, 369 city shards, all entry assets and JavaScript syntax.');
execFileSync(process.execPath,['scripts/build-agent.mjs'],{stdio:'inherit'});
for(const f of ['server.mjs','knowledge.mjs'])execFileSync(process.execPath,['--check','cloud/feiyu-agent/'+f]);
