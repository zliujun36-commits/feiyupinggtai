import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../dist/feiyu-ai-widget.js', import.meta.url), 'utf8');
// Minimal DOM fixture executes the real widget's event handlers without network or secrets.
function widget(fetchImpl, endpoint='https://test.example/chat') {
  class Element {
    constructor() { this.events = {}; this.children = []; this.value = ''; this.classes = new Set(); this.attributes = {}; this.style = {}; }
    classList = {add: value => this.classes.add(value), contains: value => this.classes.has(value), toggle: (value, force) => {
      const enabled = force ?? !this.classes.has(value); enabled ? this.classes.add(value) : this.classes.delete(value); return enabled;
    }};
    addEventListener(name, handler) { this.events[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    appendChild(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    focus() {}
    querySelectorAll() { return this.children.filter(child => child.className?.startsWith('msg ')); }
    async emit(name) { return this.events[name]?.({preventDefault() {}, target:this}); }
  }
  const elements = new Map();
  const get = selector => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); };
  const shadow = {querySelector:get};
  const windowEvents = {};
  const window = {innerWidth:1280,innerHeight:900,addEventListener:(name, handler) => { windowEvents[name] = handler; }};
  const document = {
    readyState:'complete', currentScript:{getAttribute:name => name === 'data-url' ? endpoint : ''},
    body:new Element(), createElement:() => { const element = new Element(); element.attachShadow = () => shadow; return element; }
  };
  const storage = new Proxy({}, {get() { throw Error('Persistence is forbidden'); }});
  vm.runInNewContext(source, {window, document, URL, AbortController, setTimeout, clearTimeout, fetch:fetchImpl, localStorage:storage, sessionStorage:storage});
  return {window, get, windowEvents, input:async(selector, value) => { get(selector).value = value; await get(selector).emit('input'); },
    ask:async text => { get('.query').value = text; await get('.composer').emit('submit'); }};
}

test('public widget sends no credential, bounded history and live structured map context', async () => {
  const requests = [];
  const ui = widget(async (url, options) => { requests.push({url,...options,body:JSON.parse(options.body)}); return Response.json({answer:'<b>模型文本</b>'}); });
  ui.window.feiyuAIContextProvider = () => ({cityId:'shenzhen',scope:'深圳',detail:'当前筛选'});
  await ui.ask('平台指标');
  assert.equal(requests[0].method,'POST'); assert.equal(requests[0].headers.Authorization,undefined);
  assert.equal(requests[0].credentials,'omit'); assert.equal(requests[0].redirect,'error');
  assert.equal(requests[0].body.question,'平台指标');assert.equal(requests[0].body.context.cityId,'shenzhen');
  assert.deepEqual(requests[0].body.history,[]);
  assert.equal(ui.get('.messages').children.at(-1).textContent,'<b>模型文本</b>');
  assert.equal(ui.get('.messages').children.at(-1).innerHTML,undefined);
  for(let i=0;i<6;i++) await ui.ask('继续');
  assert.equal(requests.at(-1).body.history.length,6);
  ui.window.feiyuAI.clearHistory(); await ui.ask('新对话'); assert.equal(requests.at(-1).body.history.length,0);
  ui.windowEvents.pagehide(); await ui.ask('返回页面'); assert.equal(requests.at(-1).body.history.length,0);
});

test('public widget rejects unsafe endpoints and reports old-server auth failures honestly', async () => {
  let calls=0;
  const fetch=async()=>{ calls++;return Response.json({error:'secret-diagnostic'},{status:401}); };
  await widget(fetch,'http://test.example/chat').ask('测试');assert.equal(calls,0);
  const ui=widget(fetch);await ui.ask('测试');assert.equal(calls,1);
  assert.match(ui.get('.messages').children.at(-1).textContent,/尚未升级/);
  assert.ok(!ui.get('.messages').children.at(-1).textContent.includes('secret-diagnostic'));
  assert.equal(ui.get('.send').disabled,false);
});

test('clearing a pending conversation discards late model replies', async () => {
  let resolve;
  const ui=widget(()=>new Promise(done=>{resolve=done;}));
  const pending=ui.ask('等待');
  assert.equal(ui.get('.send').disabled,true);
  ui.window.feiyuAI.clearHistory();resolve(Response.json({answer:'过期回复'}));await pending;
  assert.equal(ui.get('.send').disabled,false);
  assert.ok(!ui.get('.messages').children.some(element=>element.textContent==='过期回复'));
});

test('resizing clamps to viewport, supports expand/restore, sliders and keyboard', async () => {
  const ui=widget(()=>{throw Error('No model call expected');});
  const panel=ui.get('.panel');
  ui.window.feiyuAI.resizeTo(500,600);assert.equal(panel.style.width,'500px');assert.equal(panel.style.height,'600px');
  await ui.get('.expand').emit('click');assert.equal(panel.style.width,'960px');assert.equal(panel.style.height,'852px');
  await ui.get('.expand').emit('click');assert.equal(panel.style.width,'500px');
  await ui.input('.width-range','550');assert.equal(panel.style.width,'550px');
  ui.get('.resize-handle').events.keydown({key:'ArrowLeft',preventDefault(){}});assert.equal(panel.style.width,'570px');
  ui.get('.panel').getBoundingClientRect=()=>({width:570,height:600});ui.get('.resize-handle').setPointerCapture=()=>{};
  ui.get('.resize-handle').events.pointerdown({button:0,clientX:200,clientY:200,pointerId:1,preventDefault(){}});
  ui.get('.resize-handle').events.pointermove({clientX:100,clientY:100});assert.equal(panel.style.width,'670px');assert.equal(panel.style.height,'700px');
  await ui.get('.resize-handle').emit('pointerup');
  ui.window.innerWidth=390;ui.window.innerHeight=600;ui.windowEvents.resize();
  assert.ok(parseInt(panel.style.width)<=374);assert.ok(parseInt(panel.style.height)<=576);
  await ui.get('.reset-size').emit('click');assert.ok(parseInt(panel.style.height)<=576);
});
