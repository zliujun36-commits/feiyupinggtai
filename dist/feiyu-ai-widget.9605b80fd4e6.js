// Feiyu public assistant: credentials stay in SCF; browser uses the public /chat endpoint.
(() => {
  'use strict';
  if (window.__feiyuAIWidgetLoaded) return;
  window.__feiyuAIWidgetLoaded = true;

  const script = document.currentScript;
  const initialUrl = script?.getAttribute('data-url') || '';
  const initialTitle = script?.getAttribute('data-title') || '飞域 AI 助手';
  const initialContext = script?.getAttribute('data-context') || '';

  function boot() {
    const root = document.createElement('div');
    root.id = 'feiyu-ai-widget-root';
    document.body.appendChild(root);
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; }
        button,input,textarea{font:inherit}
        button{cursor:pointer} [hidden]{display:none!important} :focus-visible{outline:2px solid #4b82da;outline-offset:2px}
        .launcher{position:fixed;z-index:1100;right:24px;bottom:91px;display:flex;align-items:center;gap:9px;padding:13px 18px;border:0;border-radius:99px;background:linear-gradient(125deg,#101f35,#285dc0);color:#fff;box-shadow:0 14px 40px #10243d40;font:600 14px/1.2 -apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;transition:transform .2s ease}
        .launcher:hover{transform:translateY(-2px)}
        .launcher svg{width:20px;height:20px}
        .panel{position:fixed;z-index:1200;right:24px;bottom:24px;width:min(410px,calc(100vw - 32px));height:min(640px,calc(100dvh - 48px));min-height:0;background:#fff;color:#253b59;border:1px solid #dbe4f0;box-shadow:0 22px 70px #10243d33;border-radius:18px;display:none;flex-direction:column;overflow:hidden;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif}
        .panel.open{display:flex}
        .top{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(100deg,#101f35,#1b365c);color:white;padding:16px 17px;flex:0 0 auto}
        .title{font-weight:700;font-size:16px;line-height:1.25;display:flex;align-items:center;gap:9px}
        .title .star{font-size:19px;color:#9bbfff}
        .subtitle{font-size:11px;color:#bfd0e7;margin-top:3px}
        .top-actions{display:flex;align-items:center;gap:4px}
        .iconbutton{height:33px;width:33px;border:0;border-radius:8px;background:#ffffff20;color:#fff;font-size:18px}
        .iconbutton:hover{background:#ffffff38}
        .settings{padding:12px 16px;display:none;flex-direction:column;gap:9px;background:#f3f6fc;border-bottom:1px solid #e1e8f2;flex:0 1 auto;overflow-y:auto;min-height:0;max-height:35%}
        .settings.open{display:flex}
        .settings label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:650;color:#526b8b}
        .settings input{width:100%;padding:8px 10px;outline:0;border:1px solid #cfdaea;border-radius:8px;color:#253b59;background:white}
        .settings input:focus{border-color:#4b82da}
        .settings .note{font-size:11px;line-height:1.5;color:#637b98}
        .clear{border:1px solid #cfdaea;border-radius:8px;background:white;color:#47648b;padding:6px 10px;align-self:flex-start}
        .messages{background:linear-gradient(180deg,#fafbfd,#f3f6fb);overflow-y:auto;padding:20px 14px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0}
        .msg{white-space:pre-wrap;overflow-wrap:anywhere;border-radius:12px;padding:10px 12px;max-width:88%;font-size:13px;line-height:1.7}
        .msg.assistant{background:white;border:1px solid #e0e7f1;align-self:flex-start;border-bottom-left-radius:3px;color:#314b6d}
        .msg.user{align-self:flex-end;background:#285fc5;color:#fff;border-bottom-right-radius:3px}
        .msg.error{background:#fff6f4;border-color:#f6c7bc;color:#9a463d}
        .busy{color:#7188a5;font-size:12px;align-self:flex-start;padding:0 6px}
        .suggestions{flex-shrink:0;display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 10px;background:#f3f6fb}
        .suggestions button{background:#fff;border:1px solid #d3dfef;border-radius:99px;color:#426998;font-size:11px;padding:5px 10px}
        .composer{flex-shrink:0;display:flex;align-items:flex-end;gap:8px;padding:12px;background:#fff;border-top:1px solid #e3eaf4}
        textarea{height:44px;max-height:108px;resize:vertical;min-height:43px;border:1px solid #d7e2f0;border-radius:10px;flex:1;min-width:0;padding:10px 11px;outline:0;color:#243d60;background:#fff}
        textarea:focus{border-color:#4b82da}
        .send{background:#2863c7;color:#fff;border:0;border-radius:10px;padding:11px 15px;font-weight:650;white-space:nowrap;min-height:44px}
        .send:disabled{opacity:.5;cursor:not-allowed}
        .foot{flex-shrink:0;font-size:10px;color:#7588a1;text-align:center;padding:0 10px 10px;background:#fff}
        @media(max-width:600px){.launcher{bottom:112px;right:14px}.panel{right:8px;left:8px;width:auto;bottom:12px;height:min(80dvh,650px);max-height:calc(100dvh - 24px);max-width:calc(100vw - 16px)} }
        .resize-handle{position:absolute;left:0;top:0;width:22px;height:22px;border:0;border-radius:17px 0 5px 0;color:#a7c7fa;background:#ffffff12;cursor:nwse-resize;touch-action:none;font-size:14px;z-index:2}
        .size-row{display:flex;gap:12px}.size-row label{flex:1;min-width:0}.size-row input{padding:0;accent-color:#2863c7}
        .references{font-size:11px;margin-top:8px}.references a{display:block;color:#426998}
        @media(max-width:600px){.resize-handle,.width-setting{display:none!important}.top{padding:14px 12px}.title{font-size:15px}.panel{right:8px!important;left:8px!important;width:auto!important}}
      </style>
      <button class="launcher" type="button" aria-label="打开飞域 AI 助手" aria-expanded="false" aria-controls="feiyu-ai-panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3z"/><path d="M19 18v4m-2-2h4"/></svg>
        AI 智能助手
      </button>
      <section class="panel" role="dialog" id="feiyu-ai-panel" aria-label="飞域 AI 对话面板">
        <header class="top"><div><div class="title"><span class="star">✧</span><span class="label-title"></span></div><div class="subtitle">DeepSeek 接入 · 低空规划研究辅助</div></div>
          <div class="top-actions"><button class="iconbutton config" type="button" title="调整窗口大小" aria-label="窗口设置">⚙</button><button class="iconbutton expand" type="button" title="展开窗口" aria-label="展开窗口" aria-pressed="false">⤢</button><button class="iconbutton close" type="button" title="关闭" aria-label="关闭">×</button></div></header>
        <button class="resize-handle" type="button" aria-label="拖动调整窗口大小" title="拖动左上角调整大小；方向键也可调整">↖</button>
        <div class="settings"><div class="size-row"><label class="width-setting">窗口宽度 <output class="width-value"></output><input class="width-range" aria-label="窗口宽度" type="range" min="320" max="960" step="10"></label><label>窗口高度 <output class="height-value"></output><input class="height-range" aria-label="窗口高度" type="range" min="300" max="900" step="10"></label></div>
          <div><button class="reset-size clear" type="button">恢复默认大小</button> <button class="clear-history clear" type="button">清空对话</button></div></div>
        <main class="messages" role="log" aria-label="问答记录" aria-live="polite"><div class="msg assistant">你好，我是飞域 AI 助手。可以帮你分析无人机物流规划思路、空域数据需求及 GIS 技术问题。<br><br>可以直接提问，无需填写口令。回答会参考平台资料和当前城市、筛选及选中对象。点击右上角调整窗口大小。</div></main>
        <div class="suggestions"><button type="button">低空物流需要哪些数据？</button><button type="button">如何设计无人机航线？</button></div>
        <form class="composer"><textarea class="query" maxlength="1200" placeholder="输入你的问题…（Enter 发送）" aria-label="消息"></textarea><button class="stop clear" type="button" hidden>停止</button><button class="send" type="submit">发送</button></form>
        <div class="foot">问题及页面上下文会发送给 DeepSeek；回答供研究参考，不构成飞行许可。</div>
      </section>`;

    const $ = (selector) => shadow.querySelector(selector);
    const launcher = $('.launcher');
    const panel = $('.panel');
    const settings = $('.settings');
    const query = $('.query');
    const sendButton = $('.send');
    const messages = $('.messages');
    const history = [];
    const state = { url: initialUrl.trim(), context: initialContext.trim(), busy: false, controller: null, revision: 0 };
    $('.label-title').textContent = initialTitle;


    const addMessage = (text, role, extraClass = '') => {
      const el = document.createElement('div');
      el.className = `msg ${role} ${extraClass}`;
      el.textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    };

    const togglePanel = (force) => {
      const isOpen = typeof force === 'boolean' ? force : !panel.classList.contains('open');
      panel.classList.toggle('open', isOpen);
      launcher.setAttribute('aria-expanded', String(isOpen));
      launcher.hidden = isOpen;
      if (isOpen) query.focus(); else launcher.focus();
    };

    launcher.addEventListener('click', () => togglePanel());
    $('.close').addEventListener('click', () => togglePanel(false));
    $('.config').addEventListener('click', () => settings.classList.toggle('open'));
    function clearHistory() { state.revision++; state.controller?.abort(); history.length = 0; messages.querySelectorAll('.msg.user, .msg.assistant:not(:first-child)').forEach(el => el.remove()); }
    $('.clear-history').addEventListener('click', clearHistory);
    $('.stop').addEventListener('click', () => state.controller?.abort());
    window.addEventListener('pagehide', clearHistory);
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); togglePanel(false); } });

    let expanded = false, preferred = {width:410, height:640}, drag = null;
    function resizeTo(width, height) {
      const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
      const maxWidth = Math.max(1, viewportWidth - (viewportWidth <= 600 ? 16 : 48));
      const maxHeight = Math.max(1, viewportHeight - (viewportWidth <= 600 ? 24 : 48));
      const w = Math.round(Math.min(maxWidth, Math.max(Math.min(320,maxWidth), Number(width) || 410)));
      const h = Math.round(Math.min(maxHeight, Math.max(Math.min(300,maxHeight), Number(height) || 640)));
      panel.style.width = `${w}px`; panel.style.height = `${h}px`;
      $('.width-range').max = String(Math.min(960,maxWidth)); $('.width-range').min = String(Math.min(320,maxWidth));
      $('.height-range').max = String(Math.min(900,maxHeight)); $('.height-range').min = String(Math.min(300,maxHeight));
      $('.width-range').value = String(w); $('.height-range').value = String(h);
      $('.width-value').textContent = `${w} px`; $('.height-value').textContent = `${h} px`;
      return {width:w,height:h};
    }
    function setExpanded(value) {
      expanded = value; $('.expand').setAttribute('aria-pressed',String(value));
      $('.expand').setAttribute('aria-label',value?'还原窗口':'展开窗口');
      $('.expand').title = value?'还原窗口':'展开窗口';
      resizeTo(value?Math.min(960,window.innerWidth-48):preferred.width,value?window.innerHeight-48:preferred.height);
    }
    function customSize(width,height) { setExpanded(false); preferred = resizeTo(width,height); }
    $('.width-range').addEventListener('input', () => customSize(Number($('.width-range').value),preferred.height));
    $('.height-range').addEventListener('input', () => customSize(preferred.width,Number($('.height-range').value)));
    $('.expand').addEventListener('click', () => setExpanded(!expanded));
    $('.reset-size').addEventListener('click', () => {preferred={width:410,height:640};setExpanded(false);});
    const handle = $('.resize-handle');
    handle.addEventListener('pointerdown', e => {
      if(e.button!==0) return;
      e.preventDefault();setExpanded(false);
      const rect=panel.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,width:rect.width,height:rect.height};
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {if(drag) customSize(drag.width+drag.x-e.clientX,drag.height+drag.y-e.clientY);});
    for(const event of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(event,()=>{drag=null;});
    handle.addEventListener('keydown', e => {
      const deltas={ArrowLeft:[20,0],ArrowRight:[-20,0],ArrowUp:[0,20],ArrowDown:[0,-20]};
      const delta=deltas[e.key];if(delta){e.preventDefault();customSize(preferred.width+delta[0],preferred.height+delta[1]);}
    });
    window.addEventListener('resize', () => setExpanded(expanded));
    resizeTo(preferred.width,preferred.height);
    $('.suggestions').addEventListener('click', (e) => {if (e.target.tagName === 'BUTTON') {query.value = e.target.textContent;query.focus();}});
    query.addEventListener('keydown', (e) => {if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {e.preventDefault();$('.composer').requestSubmit();}});

    $('.composer').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.busy) return;
      const message = query.value.trim();
      if (!message) return;
      if (!state.url) { addMessage('问答服务尚未配置，请联系平台管理员。', 'assistant', 'error'); return; }
      if(message.length>1200) { addMessage('请将问题控制在 1200 字以内。','assistant','error');return; }
      let parsedUrl;
      try { parsedUrl = new URL(state.url); } catch {addMessage('问答服务地址配置不正确。', 'assistant', 'error');return;}
      if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {addMessage('问答服务需要有效的 HTTPS 地址。', 'assistant', 'error');return;}
      let currentContext = {};
      try { if (typeof window.feiyuAIContextProvider === 'function') currentContext = window.feiyuAIContextProvider(); } catch { /* Map context is optional. */ }
      if(!currentContext || typeof currentContext !== 'object') currentContext={detail:String(currentContext || '')};
      const context={};
      for(const key of ['cityId','province','mode','scope','filters','metrics','detail']) context[key]=String(currentContext[key] || '').slice(0,key==='detail'?3500:1800);
      if(state.context)context.detail=[context.detail,state.context].filter(Boolean).join('\n').slice(0,3500);
      const past = history.slice(-6).map(item => ({ ...item, content: item.content.slice(0, 2200) }));
      const revision = state.revision;
      addMessage(message, 'user');
      query.value = '';
      state.busy = true;
      sendButton.disabled = true;
      $('.stop').hidden = false;
      messages.setAttribute('aria-busy', 'true');
      const wait = document.createElement('div');
      wait.className = 'busy';
      wait.textContent = 'DeepSeek 正在生成回答…';
      messages.appendChild(wait);
      messages.scrollTop = messages.scrollHeight;
      const controller = new AbortController();
      state.controller = controller;
      const timer = setTimeout(() => controller.abort(), 85_000);
      try {
        const response = await fetch(parsedUrl.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ question:message, history:past, context }),
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        let data;
        try { data = await response.json(); } catch { throw new Error(`接口未返回 JSON（HTTP ${response.status}），请检查是否调用了正确的函数 URL`); }
        if (!response.ok) {
          const errors = {401:'管理员尚未升级公开问答服务，请稍后再试。',403:'当前网站尚未获准访问问答服务，请联系管理员。',429:'请求过于频繁或额度已用完，请稍后再试。',502:'模型上游服务异常，请检查云端配置与余额。',503:'公开问答服务尚未启用，请联系管理员。'};
          throw new Error(errors[response.status] || `云函数返回错误 HTTP ${response.status}`);
        }
        if (typeof data.answer !== 'string') throw new Error('问答服务版本不匹配，请管理员升级云函数。');
        if (revision !== state.revision || controller.signal.aborted) return;
        history.push({role:'user',content:message},{role:'assistant',content:data.answer});
        history.splice(0, Math.max(0, history.length - 6));
        const item=addMessage(data.answer, 'assistant');
        if(Array.isArray(data.sources)) {
          const refs=document.createElement('details');refs.className='references';
          const summary=document.createElement('summary');summary.textContent='参考资料';refs.appendChild(summary);
          for(const source of data.sources.slice(0,12))try {
            const url=new URL(source.url);if(url.origin!=='https://zliujun36-commits.github.io')continue;
            const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`[${source.id}] ${source.title}`;refs.appendChild(link);
          }catch{}
          if(refs.children.length>1)item.appendChild(refs);
        }
      } catch (err) {
        if (revision !== state.revision) return;
        let explanation = err.name === 'AbortError'
          ? '请求已停止或超时，可重新提问。'
          : err.message === 'Failed to fetch'
          ? '暂时无法连接问答服务，请稍后重试；若持续出现，请联系管理员检查网站来源配置。'
          : err.message;
        addMessage(`调用失败：${explanation}`, 'assistant', 'error');
      } finally {
        clearTimeout(timer);
        wait.remove();
        state.busy = false;
        sendButton.disabled = false;
        state.controller = null;
        $('.stop').hidden = true;
        messages.setAttribute('aria-busy', 'false');
        if (panel.classList.contains('open')) query.focus();
      }
    });

    // 当网站已有真实地图中心点/筛选状态时，可以选择性传给 AI 作“未验证的参考资料”。
    // 不要传入私密坐标、用户账户信息或真正未经授权共享的限制数据。
    window.feiyuAI = {
      open: () => togglePanel(true),
      close: () => togglePanel(false),
      setContext: (text) => {state.context = String(text ?? '').slice(0, 3500);},
      clearHistory,
      resizeTo: customSize
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
