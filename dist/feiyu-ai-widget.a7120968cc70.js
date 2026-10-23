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
        :host {
          all: initial;
          --fy-ink: #11213A;
          --fy-blue: #2864C8;
          --fy-bg: #F5F8FC;
          --fy-line: #DCE5F0;
          --fy-muted: #62738A;
          --fy-accent: #29B5A6;
          --fy-font: -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;
        }
        *, *::before, *::after { box-sizing: border-box; }
        button,input,textarea { font: inherit; }
        button { cursor: pointer; transition: background-color 160ms ease,border-color 160ms ease,color 160ms ease,box-shadow 160ms ease; }
        [hidden] { display: none!important; }
        :focus-visible { outline: 2px solid var(--fy-blue); outline-offset: 3px; }
        .launcher { position: fixed; z-index: 1100; right: 24px; bottom: 91px; display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 12px 16px; border: 1px solid #314B70; border-radius: 12px; background: var(--fy-ink); color: #fff; box-shadow: 0 4px 16px #11213A24; font: 600 14px/1.4 var(--fy-font); }
        .launcher:hover { background: #1B3558; border-color: #5276A5; box-shadow: 0 6px 20px #11213A2B; }
        .launcher svg { width: 20px; height: 20px; color: #80D5CC; }
        .panel { position: fixed; z-index: 1200; right: 24px; bottom: 24px; width: min(410px,calc(100vw - 32px)); height: min(640px,calc(100dvh - 48px)); min-height: 0; background: #fff; color: var(--fy-ink); border: 1px solid var(--fy-line); box-shadow: 0 8px 32px #11213A24; border-radius: 12px; display: none; flex-direction: column; overflow: hidden; font: 14px/1.6 var(--fy-font); }
        .panel { container: feiyu-chat / size; }
        .panel.open { display: flex; }
        .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--fy-ink); color: #fff; padding: 16px; flex: 0 0 auto; border-bottom: 1px solid #263D5B; }
        .top > div:first-child { min-width: 0; }
        .title { font-weight: 650; font-size: 16px; line-height: 1.5; display: flex; align-items: center; gap: 8px; }
        .title .star { font-size: 20px; color: #80D5CC; flex-shrink: 0; }
        .subtitle { font-size: 11px; color: #BDCADB; margin-top: 4px; }
        .top-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .iconbutton { display: grid; place-items: center; height: 32px; width: 32px; padding: 0; border: 1px solid #ffffff24; border-radius: 8px; background: #ffffff0A; color: #E8EFF9; font-size: 18px; }
        .iconbutton:hover,.iconbutton[aria-pressed="true"] { background: #ffffff1F; border-color: #ffffff50; color: #fff; }
        .iconbutton:focus-visible { outline-color: #A6C6FF; }
        .settings { padding: 16px; display: none; flex-direction: column; gap: 16px; background: var(--fy-bg); border-bottom: 1px solid var(--fy-line); flex: 0 1 auto; overflow-y: auto; min-height: 0; max-height: 35%; }
        .settings.open { display: flex; }
        .settings label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #485E7B; }
        .settings input { width: 100%; padding: 8px; border: 1px solid var(--fy-line); border-radius: 8px; color: var(--fy-ink); background: #fff; }
        .settings input:focus-visible { outline: 2px solid var(--fy-blue); outline-offset: 2px; }
        .settings output { font-weight: 400; font-variant-numeric: tabular-nums; color: var(--fy-muted); }
        .settings .note { font-size: 11px; line-height: 1.6; color: var(--fy-muted); }
        .clear { border: 1px solid var(--fy-line); border-radius: 8px; background: #fff; color: #435A78; padding: 8px 12px; align-self: flex-start; font-size: 12px; line-height: 1.5; }
        .clear:hover { background: #EEF4FC; border-color: #B4C9E8; color: var(--fy-blue); }
        .messages { background: var(--fy-bg); overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; flex: 1; min-height: 0; scrollbar-width: thin; scrollbar-color: #BCCADB transparent; }
        .settings { scrollbar-width: thin; scrollbar-color: #BCCADB transparent; }
        .messages::-webkit-scrollbar,.settings::-webkit-scrollbar { width: 6px; }
        .messages::-webkit-scrollbar-thumb,.settings::-webkit-scrollbar-thumb { background: #BCCADB; border-radius: 8px; }
        .messages::-webkit-scrollbar-thumb:hover,.settings::-webkit-scrollbar-thumb:hover { background: #94ABC8; }
        .msg { white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 12px; padding: 12px 16px; max-width: 92%; font-size: 13px; line-height: 1.8; flex-shrink: 0; }
        .msg.assistant { background: #fff; border: 1px solid var(--fy-line); align-self: flex-start; border-bottom-left-radius: 4px; color: #30445F; }
        .msg.user { align-self: flex-end; background: var(--fy-blue); color: #fff; border: 1px solid var(--fy-blue); border-bottom-right-radius: 4px; }
        .msg.error { background: #FFF5F4; border-color: #F0CCC8; color: #A03D35; }
        .busy { display: flex; align-items: center; gap: 8px; color: var(--fy-muted); font-size: 12px; align-self: flex-start; padding: 0 8px; flex-shrink: 0; }
        .busy::before { content: ''; display: block; width: 12px; height: 12px; border: 2px solid #CDDCEF; border-top-color: var(--fy-blue); border-radius: 50%; animation: feiyu-wait 900ms linear infinite; flex-shrink: 0; }
        @keyframes feiyu-wait { to { transform: rotate(360deg); } }
        .suggestions { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 16px; background: var(--fy-bg); }
        .suggestions button { max-width: 100%; background: #fff; border: 1px solid var(--fy-line); border-radius: 8px; color: #4D6381; font-size: 11px; line-height: 1.5; padding: 8px; text-align: left; }
        .suggestions button:hover { background: #ECF3FE; border-color: #B3C9EB; color: var(--fy-blue); }
        .composer { flex-shrink: 0; display: flex; align-items: flex-end; gap: 8px; padding: 16px; background: #fff; border-top: 1px solid var(--fy-line); }
        textarea { height: 48px; max-height: 108px; resize: vertical; min-height: 48px; border: 1px solid var(--fy-line); border-radius: 10px; flex: 1; min-width: 0; padding: 12px; outline: 0; color: var(--fy-ink); background: #fff; line-height: 1.5; transition: border-color 160ms ease,box-shadow 160ms ease; }
        textarea::placeholder { color: #78889D; }
        textarea:hover { border-color: #B3C6DF; }
        textarea:focus { border-color: var(--fy-blue); box-shadow: 0 0 0 3px #2864C814; }
        .send { background: var(--fy-blue); color: #fff; border: 1px solid var(--fy-blue); border-radius: 10px; padding: 12px 16px; font-weight: 600; white-space: nowrap; min-height: 48px; }
        .send:hover:not(:disabled) { background: #2057B3; border-color: #2057B3; }
        .send:disabled { background: #8DAAD8; border-color: #8DAAD8; cursor: not-allowed; }
        .stop { align-self: flex-end; min-height: 48px; padding: 12px 8px; white-space: nowrap; }
        .foot { flex-shrink: 0; font-size: 10px; line-height: 1.6; color: var(--fy-muted); text-align: center; padding: 0 16px 16px; background: #fff; }
        .resize-handle { position: absolute; left: 0; top: 0; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 11px 0 4px 0; color: #BDCADB; background: #ffffff0A; cursor: nwse-resize; touch-action: none; font-size: 12px; z-index: 2; }
        .resize-handle:hover { color: #fff; background: #ffffff24; }
        .size-row { display: flex; gap: 16px; }
        .size-row label { flex: 1; min-width: 0; }
        .size-row input { padding: 0; accent-color: var(--fy-blue); cursor: pointer; }
        .references { font-size: 11px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--fy-line); }
        .references summary { cursor: pointer; color: #526B8D; }
        .references a { display: block; color: var(--fy-blue); text-decoration-thickness: 1px; text-underline-offset: 3px; margin-top: 4px; }
        .references a:hover { color: #1D4C97; }
        @media(max-width:960px) {
          .launcher { bottom: 192px; }
        }
        @media(max-width:600px) {
          .launcher { bottom: 192px; right: 16px; }
          .panel { right: 8px!important; left: 8px!important; width: auto!important; bottom: 12px; height: min(80dvh,650px); max-height: calc(100dvh - 24px); max-width: calc(100vw - 16px); }
          .resize-handle,.width-setting { display: none!important; }
          .top { padding: 16px; }
          .title { font-size: 15px; }
          .query { font-size: 16px; }
        }
        @media(max-width:380px) {
          .top { padding: 12px; }
          .top-actions { gap: 2px; }
          .messages,.settings,.composer { padding: 12px; }
          .suggestions { padding: 0 12px 12px; }
          .msg { padding: 12px; max-width: 96%; }
          .send { padding: 12px; }
          .foot { padding: 0 12px 12px; }
        }
        @media(max-height:480px) {
          .top { padding-top: 8px; padding-bottom: 8px; }
          .messages { padding-top: 8px; padding-bottom: 8px; }
          .suggestions { padding-bottom: 8px; }
          .suggestions button { padding: 4px 8px; }
          .composer { padding-top: 8px; padding-bottom: 8px; }
          .foot { padding-bottom: 8px; }
        }
        @container feiyu-chat (max-height:420px) {
          .top { padding-top: 4px; padding-bottom: 4px; }
          .title { font-size: 14px; line-height: 20px; }
          .subtitle { font-size: 10px; line-height: 14px; margin-top: 2px; }
          .settings { padding-top: 8px; padding-bottom: 8px; gap: 8px; }
          .messages { padding-top: 8px; padding-bottom: 8px; gap: 8px; min-height: min(64px,22cqh); }
          .suggestions { padding-bottom: 8px; gap: 8px; flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #BCCADB transparent; }
          .suggestions::-webkit-scrollbar { height: 4px; }
          .suggestions::-webkit-scrollbar-thumb { background: #BCCADB; border-radius: 8px; }
          .suggestions button { padding: 4px 8px; flex: 0 0 auto; white-space: nowrap; max-width: none; }
          .composer { padding-top: 8px; padding-bottom: 8px; }
          textarea { height: 40px; min-height: 40px; max-height: 56px; padding: 8px; }
          .send,.stop { min-height: 40px; padding-top: 8px; padding-bottom: 8px; }
          .foot { font-size: 10px; line-height: 1.4; padding-bottom: 4px; }
        }
        @media(prefers-reduced-motion:reduce) {
          *,*::before,*::after { transition: none!important; animation: none!important; }
        }
      </style>
      <button class="launcher" type="button" aria-label="打开飞域 AI 助手" aria-expanded="false" aria-controls="feiyu-ai-panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3z"/><path d="M19 18v4m-2-2h4"/></svg>
        AI 智能助手
      </button>
      <section class="panel" role="dialog" id="feiyu-ai-panel" aria-label="飞域 AI 对话面板">
        <header class="top"><div><div class="title"><span class="star">✧</span><span class="label-title"></span></div><div class="subtitle">通用问答 · 飞域平台知识</div></div>
          <div class="top-actions"><button class="iconbutton config" type="button" title="调整窗口大小" aria-label="窗口设置">⚙</button><button class="iconbutton expand" type="button" title="展开窗口" aria-label="展开窗口" aria-pressed="false">⤢</button><button class="iconbutton close" type="button" title="关闭" aria-label="关闭">×</button></div></header>
        <button class="resize-handle" type="button" aria-label="拖动调整窗口大小" title="拖动左上角调整大小；方向键也可调整">↖</button>
        <div class="settings"><div class="size-row"><label class="width-setting">窗口宽度 <output class="width-value"></output><input class="width-range" aria-label="窗口宽度" type="range" min="320" max="960" step="10"></label><label>窗口高度 <output class="height-value"></output><input class="height-range" aria-label="窗口高度" type="range" min="300" max="900" step="10"></label></div>
          <div><button class="reset-size clear" type="button">恢复默认大小</button> <button class="clear-history clear" type="button">清空对话</button></div></div>
        <main class="messages" role="log" aria-label="问答记录" aria-live="polite"><div class="msg assistant">你好，我是飞域 AI。可以帮你解答日常问题、学习写作、编程和学术研究，也熟悉飞域的平台功能、数据与模型。<br><br>询问平台时，我会结合平台资料和当前页面；其他问题也可以直接问。涉及最新信息或论文引用时，请核对原始来源。</div></main>
        <div class="suggestions"><button type="button">解释当前平台指标</button><button type="button">如何设计对照实验？</button><button type="button">解释 Python 列表推导式</button></div>
        <form class="composer"><textarea class="query" maxlength="1200" placeholder="输入你的问题…（Enter 发送）" aria-label="消息"></textarea><button class="stop clear" type="button" hidden>停止</button><button class="send" type="submit">发送</button></form>
        <div class="foot">问题及页面上下文会发送给 DeepSeek；重要信息请核实，回答不代表飞行许可。</div>
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
