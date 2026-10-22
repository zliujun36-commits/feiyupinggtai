const host=document.createElement('div');host.id='feiyu-agent';
host.innerHTML=`<button class="agent-launch" aria-label="打开飞域助手" aria-expanded="false" aria-controls="agent-window"><span aria-hidden="true">✦</span> 飞域助手</button>
<section id="agent-window" class="agent-window" role="dialog" aria-label="飞域助手" hidden>
 <header class="agent-header"><div><strong>✦ 飞域助手</strong><small>平台知识 · 数据解读</small></div><button class="agent-close" aria-label="关闭飞域助手">×</button></header>
 <div class="agent-scope"></div><div class="agent-messages" role="log" aria-label="问答记录" aria-live="polite"></div>
 <div class="agent-suggestions"><button>这个平台怎么使用？</button><button>当前地区的数据说明什么？</button><button>规划覆盖 100% 代表什么？</button></div>
 <form class="agent-form"><label class="agent-label" for="agent-question">向飞域助手提问</label><textarea id="agent-question" rows="2" maxlength="1200" placeholder="询问功能、指标或当前地图…"></textarea><div class="agent-actions"><button type="button" class="agent-clear">清空对话</button><button type="button" class="agent-stop" hidden>停止</button><button type="submit" class="agent-send">发送 ↑</button></div></form>
 <p class="agent-status" role="status">正在检查问答服务…</p><p class="agent-note">发送后，问题及相关页面数据将交由 DeepSeek 处理。回答供研究参考，不作为飞行许可。</p>
</section>`;
document.body.append(host);
const $=s=>host.querySelector(s),launch=$('.agent-launch'),panel=$('.agent-window'),input=$('#agent-question'),messages=$('.agent-messages'),send=$('.agent-send'),status=$('.agent-status');
let endpoint='',history=[],controller=null;
const visibleText=id=>{const e=document.getElementById(id);return e&&e.getClientRects().length?e.innerText:''};
function context(){const city=document.getElementById('city-select'),province=document.getElementById('province');return{cityId:city?.value||'',province:province?.value||'',scope:city?.value?city.selectedOptions[0]?.textContent:province?.value||'全国',mode:document.querySelector('.topbar nav button.active')?.textContent||'',filters:[...document.querySelectorAll('#planning-panel select,#planning-panel input')].filter(e=>e.getClientRects().length&&!e.disabled&&(e.type!=='checkbox'||e.checked)).map(e=>(e.closest('label')?.childNodes[0]?.textContent?.trim()||e.id)+': '+(e.selectedOptions?e.selectedOptions[0]?.textContent:e.type==='checkbox'?'开启':e.value)).join('；').slice(0,1800),metrics:(visibleText('filtered-summary')+'\n'+visibleText('viewport-summary')).slice(0,1800),detail:(visibleText('node-detail')+'\n'+visibleText('detail')).slice(0,3500)};}
function bubble(role,text){const item=document.createElement('article');item.className='agent-message '+role;const label=document.createElement('small');label.textContent=role==='user'?'你':'飞域助手';const content=document.createElement('div');content.textContent=text;item.append(label,content);messages.append(item);messages.scrollTop=messages.scrollHeight;return item;}
function welcome(){messages.replaceChildren();bubble('assistant','你好，我可以帮助你了解平台功能、模型指标和当前页面。你想先了解什么？');}
function toggle(open){panel.hidden=!open;launch.setAttribute('aria-expanded',String(open));launch.hidden=open;if(open){$('.agent-scope').textContent='当前页面：'+context().scope+' · '+context().mode;input.focus();}else launch.focus();}
launch.onclick=()=>toggle(true);$('.agent-close').onclick=()=>toggle(false);host.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();toggle(false)}});
$('.agent-clear').onclick=()=>{controller?.abort();controller=null;history=[];welcome();};$('.agent-stop').onclick=()=>controller?.abort();
function pending(value){send.disabled=value||!endpoint;$('.agent-stop').hidden=!value;$('.agent-clear').disabled=value;$('.agent-suggestions').querySelectorAll('button').forEach(b=>b.disabled=value);}
async function ask(question){
 if(controller)return;if(!endpoint){status.textContent='云函数尚未连接，暂时不能调用 DeepSeek。';return;}
 const text=question.trim();if(!text)return;if(text.length>1200){status.textContent='问题请控制在 1200 字以内。';return;}
 const current=context();$('.agent-scope').textContent='本次范围：'+current.scope+' · '+current.mode;
 bubble('user',text);input.value='';controller=new AbortController();const active=controller;const timer=setTimeout(()=>active.abort(),55000);pending(true);status.textContent='正在查阅平台资料并生成回答…';
 try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:text,history,context:current}),signal:active.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'服务暂时不可用');if(typeof data.answer!=='string')throw Error('服务返回格式不正确');
  const item=bubble('assistant',data.answer);if(Array.isArray(data.sources)&&data.sources.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='参考资料（'+data.sources.length+'）';details.append(summary);for(const source of data.sources){try{const u=new URL(source.url);if(u.origin!=='https://zliujun36-commits.github.io')continue;const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='['+source.id+'] '+source.title;details.append(a);}catch{}}item.append(details);}
  history.push({role:'user',content:text},{role:'assistant',content:data.answer});history=history.slice(-6);status.textContent='回答已完成 · 请结合参考资料核对。';messages.scrollTop=messages.scrollHeight;
 }catch(error){bubble('assistant',active.signal.aborted?'本次请求已停止或超时，可以重新提问。':error.message==='Failed to fetch'?'暂时连接不到问答服务，请检查网络后重试。':error.message);status.textContent='未获得回答；问题未加入对话上下文。';}
 finally{clearTimeout(timer);if(controller===active)controller=null;pending(false);}
}
$('.agent-form').onsubmit=e=>{e.preventDefault();ask(input.value)};input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();ask(input.value)}};$('.agent-suggestions').querySelectorAll('button').forEach(b=>b.onclick=()=>{input.value=b.textContent;ask(input.value)});
welcome();send.disabled=true;
try{const response=await fetch(new URL('agent-config.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw Error();const config=await response.json();if(config.endpoint){const u=new URL(config.endpoint);if(u.protocol!=='https:')throw Error();endpoint=u.href;const health=new URL('health',u);const r=await fetch(health,{signal:AbortSignal.timeout(8000)});if(!r.ok||!(await r.json()).ready)throw Error();send.disabled=false;status.textContent='DeepSeek 已连接 · 无需访客提供密钥。';}else status.textContent='服务准备中：云函数尚未连接。';}catch{endpoint='';status.textContent='问答服务尚未就绪，平台其他功能不受影响。';}
