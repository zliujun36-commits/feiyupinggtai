import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../dist/feiyu-ai-widget.js', import.meta.url), 'utf8');
// Minimal DOM fixture executes the real widget's event handlers without network or secrets.
function widget(fetchImpl) {
  class Element {
    constructor() { this.events = {}; this.children = []; this.value = ''; this.classes = new Set(); this.attributes = {}; }
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
  const window = {addEventListener:(name, handler) => { windowEvents[name] = handler; }};
  const document = {
    readyState:'complete', currentScript:{getAttribute:name => name === 'data-url' ? 'https://test.example/' : ''},
    body:new Element(), createElement:() => { const element = new Element(); element.attachShadow = () => shadow; return element; }
  };
  const storage = new Proxy({}, {get() { throw Error('Persistence is forbidden'); }});
  vm.runInNewContext(source, {window, document, URL, AbortController, setTimeout, clearTimeout, fetch:fetchImpl, localStorage:storage, sessionStorage:storage});
  return {window, get, windowEvents, input:async(selector, value) => { get(selector).value = value; await get(selector).emit('input'); },
    ask:async text => { get('.query').value = text; await get('.composer').emit('submit'); }};
}

test('SCF widget sends exact protocol, bounded history, live context and no persistent credentials', async () => {
  const requests = [];
  const ui = widget(async (url, options) => { requests.push({url,...options,body:JSON.parse(options.body)}); return Response.json({reply:'<b>模型文本</b>'}); });
  await ui.ask('缺少口令'); assert.equal(requests.length,0);
  await ui.input('.token','test-only-placeholder');
  ui.window.feiyuAIContextProvider = () => '当前城市：深圳';
  await ui.ask('平台指标');
  assert.equal(requests[0].method,'POST'); assert.equal(requests[0].headers.Authorization,'Bearer test-only-placeholder');
  assert.equal(requests[0].credentials,'omit'); assert.equal(requests[0].redirect,'error');
  assert.deepEqual(requests[0].body,{message:'平台指标',history:[],context:'当前城市：深圳'});
  assert.equal(ui.get('.messages').children.at(-1).textContent,'<b>模型文本</b>');
  assert.equal(ui.get('.messages').children.at(-1).innerHTML,undefined);
  for(let i=0;i<6;i++) await ui.ask('继续');
  assert.equal(requests.at(-1).body.history.length,8);
  ui.window.feiyuAI.clearHistory(); await ui.ask('新对话'); assert.equal(requests.at(-1).body.history.length,0);
  const count = requests.length;
  await ui.input('.url','https://other.example/'); await ui.ask('更换地址'); assert.equal(requests.length,count);
  await ui.input('.token','test-only-placeholder'); ui.windowEvents.pagehide(); await ui.ask('返回页面'); assert.equal(requests.length,count);
  assert.equal(ui.get('.token').value,'');
});

test('SCF widget rejects unsafe URLs, API keys and reports auth failures without echoing server secrets', async () => {
  let calls=0;
  const ui=widget(async()=>{ calls++; return Response.json({error:'secret-diagnostic'}, {status:401}); });
  await ui.input('.token','sk-not-a-real-key'); await ui.ask('测试'); assert.equal(calls,0);
  await ui.input('.url','http://test.example/'); await ui.input('.token','test-only-placeholder'); await ui.ask('测试'); assert.equal(calls,0);
  await ui.input('.url','https://test.example/'); await ui.input('.token','test-only-placeholder'); await ui.ask('测试'); assert.equal(calls,1);
  assert.match(ui.get('.messages').children.at(-1).textContent,/口令不正确/);
  assert.ok(!ui.get('.messages').children.at(-1).textContent.includes('secret-diagnostic'));
  assert.equal(ui.get('.send').disabled,false);
});

test('clearing a pending conversation discards late model replies', async () => {
  let resolve;
  const ui=widget(()=>new Promise(done=>{resolve=done;}));
  await ui.input('.token','test-only-placeholder');
  const pending=ui.ask('等待');
  assert.equal(ui.get('.send').disabled,true);
  ui.window.feiyuAI.clearHistory(); resolve(Response.json({reply:'过期回复'})); await pending;
  assert.equal(ui.get('.send').disabled,false);
  assert.ok(!ui.get('.messages').children.some(element=>element.textContent==='过期回复'));
});
