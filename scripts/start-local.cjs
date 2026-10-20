// Keep the user's local site running independently of a chat/terminal session.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const url = 'http://127.0.0.1:4173/';
async function healthy() {
  try {
    const response = await fetch(url+'data/planning/index.json', {signal:AbortSignal.timeout(1000)});
    if (!response.ok) return false;
    const data = await response.json();
    return data.version === 3 && data.stats?.demand_points === 496464;
  } catch { return false; }
}
async function main() {
  if (!await healthy()) {
    const logs = path.join(root, '.sites-runtime');
    fs.mkdirSync(logs, {recursive:true});
    const out = fs.openSync(path.join(logs, 'local-server.log'), 'a');
    const err = fs.openSync(path.join(logs, 'local-server-error.log'), 'a');
    const child = spawn(process.execPath, [path.join(root,'server.cjs')], {
      cwd:root, detached:true, windowsHide:true, stdio:['ignore',out,err],
      env:{...process.env,HOST:'127.0.0.1',PORT:'4173'}
    });
    child.on('error', error => {console.error(error.message);process.exitCode=1;});
    child.unref(); fs.closeSync(out); fs.closeSync(err);
    let ready = false;
    for(let attempt=0;attempt<20;attempt++) {
      if(await healthy()) {ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!ready) throw Error('Local site could not start. See .sites-runtime/local-server-error.log; port 4173 may be occupied.');
  }
  console.log('Feiyu is ready: '+url);
  if(process.argv.includes('--open')) {
    const browser = spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,windowsHide:true,stdio:'ignore'});
    browser.on('error',error=>console.error('Please open '+url+' manually. '+error.message));
    browser.unref();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
