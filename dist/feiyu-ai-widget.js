/**
 * 飞域 Airspace Explorer · DeepSeek AI 助手（小范围内测专用）
 * 引入：<script defer src="./feiyu-ai-widget.js" data-url="https://你的函数URL"></script>
 * 云函数：使用之前的 feiyu-deepseek-proxy SCF 代码。
 * 安全：APP_ACCESS_TOKEN 只在用户当前页面临时输入和内存保存；不写入源码/浏览器存储。
 * 正式公网开放时必须替换为网站登录 + 服务端短期认证、限流和额度控制。
 */
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
        button{cursor:pointer} [hidden]{display:none!important} :focus-visible{outline:2px solid #279d82;outline-offset:2px}
        .launcher{position:fixed;z-index:1100;right:24px;bottom:91px;display:flex;align-items:center;gap:9px;padding:13px 18px;border:0;border-radius:99px;background:linear-gradient(125deg,#16493f,#126b69);color:#fff;box-shadow:0 14px 40px #123e4470;font:600 14px/1.2 -apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;transition:transform .2s ease}
        .launcher:hover{transform:translateY(-2px)}
        .launcher svg{width:20px;height:20px}
        .panel{position:fixed;z-index:1200;right:24px;bottom:150px;width:min(398px,calc(100vw - 24px));height:min(650px,calc(100dvh - 170px));min-height:0;background:#fff;color:#273936;border:1px solid #dae8e3;box-shadow:0 22px 70px #133b4233;border-radius:18px;display:none;flex-direction:column;overflow:hidden;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif}
        .panel.open{display:flex}
        .top{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(100deg,#16473d,#1f665e);color:white;padding:16px 17px;flex:0 0 auto}
        .title{font-weight:700;font-size:16px;line-height:1.25;display:flex;align-items:center;gap:9px}
        .title .star{font-size:19px;color:#a1f3d1}
        .subtitle{font-size:11px;color:#c3e2db;margin-top:3px}
        .top-actions{display:flex;align-items:center;gap:4px}
        .iconbutton{height:33px;width:33px;border:0;border-radius:8px;background:#ffffff20;color:#fff;font-size:18px}
        .iconbutton:hover{background:#ffffff38}
        .settings{padding:12px 16px;display:none;flex-direction:column;gap:9px;background:#f5faf8;border-bottom:1px solid #dce8e3;flex:0 1 auto;overflow-y:auto;min-height:0;max-height:45%}
        .settings.open{display:flex}
        .settings label{display:flex;flex-direction:column;gap:3px;font-size:12px;font-weight:650;color:#52746c}
        .settings input{width:100%;padding:8px 10px;outline:0;border:1px solid #cdded8;border-radius:8px;color:#183f36;background:white}
        .settings input:focus{border-color:#319d87}
        .settings .note{font-size:11px;line-height:1.5;color:#607f75}
        .clear{border:1px solid #cdded8;border-radius:8px;background:white;color:#467265;padding:6px 10px;align-self:flex-start}
        .messages{background:linear-gradient(180deg,#fafcfb,#f5f9f8);overflow-y:auto;padding:20px 14px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0}
        .msg{white-space:pre-wrap;overflow-wrap:anywhere;border-radius:12px;padding:10px 12px;max-width:88%;font-size:13px;line-height:1.7}
        .msg.assistant{background:white;border:1px solid #e0ebe6;align-self:flex-start;border-bottom-left-radius:3px;color:#314f49}
        .msg.user{align-self:flex-end;background:#197567;color:#fff;border-bottom-right-radius:3px}
        .msg.error{background:#fff6f4;border-color:#f6c7bc;color:#9a463d}
        .busy{color:#759289;font-size:12px;align-self:flex-start;padding:0 6px}
        .suggestions{flex-shrink:0;display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 10px;background:#f5f9f8}
        .suggestions button{background:#fff;border:1px solid #cfe3db;border-radius:99px;color:#397466;font-size:11px;padding:5px 10px}
        .composer{flex-shrink:0;display:flex;align-items:flex-end;gap:8px;padding:12px;background:#fff;border-top:1px solid #e3ece8}
        textarea{height:44px;max-height:108px;resize:vertical;min-height:43px;border:1px solid #d7e4de;border-radius:10px;flex:1;min-width:0;padding:10px 11px;outline:0;color:#233d37;background:#fff}
        textarea:focus{border-color:#279d82}
        .send{background:#167f6f;color:#fff;border:0;border-radius:10px;padding:11px 15px;font-weight:650;white-space:nowrap;min-height:44px}
        .send:disabled{opacity:.5;cursor:not-allowed}
        .foot{flex-shrink:0;font-size:10px;color:#799088;text-align:center;padding:0 10px 10px;background:#fff}
        @media(max-width:600px){.launcher{bottom:112px;right:14px}.panel{right:8px;left:8px;width:auto;bottom:12px;height:min(80dvh,650px)} }
      </style>
      <button class="launcher" type="button" aria-label="打开飞域 AI 助手" aria-expanded="false" aria-controls="feiyu-ai-panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"><path d="M12 3l1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3z"/><path d="M19 18v4m-2-2h4"/></svg>
        AI 智能助手
      </button>
      <section class="panel" role="dialog" id="feiyu-ai-panel" aria-label="飞域 AI 对话面板">
        <header class="top"><div><div class="title"><span class="star">✧</span><span class="label-title"></span></div><div class="subtitle">DeepSeek 接入 · 低空规划研究辅助</div></div>
          <div class="top-actions"><button class="iconbutton config" type="button" title="配置云函数连接" aria-label="配置">⚙</button><button class="iconbutton close" type="button" title="关闭" aria-label="关闭">×</button></div></header>
        <div class="settings"><label>腾讯云函数 URL<input class="url" type="url" spellcheck="false" placeholder="https://...tencentscf.com" autocomplete="off"></label>
          <label>内测访问口令（APP_ACCESS_TOKEN）<input class="token" type="password" placeholder="仅本次页面使用" autocomplete="off"></label>
          <div class="note">不要输入 DeepSeek API Key。访问口令仅保存在当前页面内存；刷新页面即清除。此配置仅适合个人内测，不能作为公开平台的登录机制。</div><div><button class="clear" type="button">清空本次口令</button> <button class="clear-history clear" type="button">清空对话</button></div></div>
        <main class="messages" role="log" aria-label="问答记录" aria-live="polite"><div class="msg assistant">你好，我是飞域 AI 助手。可以帮你分析无人机物流规划思路、空域数据需求及 GIS 技术问题。<br><br>首次使用，请点击右上角 ⚙ 输入内测口令。发送时会附带当前页面的城市、筛选和可见数据；我不会自动读取平台全部数据。</div></main>
        <div class="suggestions"><button type="button">低空物流需要哪些数据？</button><button type="button">如何设计无人机航线？</button></div>
        <form class="composer"><textarea class="query" maxlength="1500" placeholder="输入你的问题…（Enter 发送）" aria-label="消息"></textarea><button class="stop clear" type="button" hidden>停止</button><button class="send" type="submit">发送</button></form>
        <div class="foot">问题及页面上下文会发送给 DeepSeek；回答供研究参考，不构成飞行许可。</div>
      </section>`;

    const $ = (selector) => shadow.querySelector(selector);
    const launcher = $('.launcher');
    const panel = $('.panel');
    const settings = $('.settings');
    const urlInput = $('.url');
    const tokenInput = $('.token');
    const query = $('.query');
    const sendButton = $('.send');
    const messages = $('.messages');
    const history = [];
    const state = { url: initialUrl.trim(), token: '', context: initialContext.trim(), busy: false, controller: null, revision: 0 };
    $('.label-title').textContent = initialTitle;
    urlInput.value = state.url;
    if (!state.url) settings.classList.add('open');

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
    urlInput.addEventListener('input', () => {
      if (state.url !== urlInput.value.trim()) { clearToken(); clearHistory(); }
      state.url = urlInput.value.trim();
    });
    tokenInput.addEventListener('input', () => {state.token = tokenInput.value;});
    function clearToken() { state.revision++; state.controller?.abort(); state.token = ''; tokenInput.value = ''; }
    function clearHistory() { state.revision++; state.controller?.abort(); history.length = 0; messages.querySelectorAll('.msg.user, .msg.assistant:not(:first-child)').forEach(el => el.remove()); }
    $('.clear').addEventListener('click', clearToken);
    $('.clear-history').addEventListener('click', clearHistory);
    $('.stop').addEventListener('click', () => state.controller?.abort());
    window.addEventListener('pagehide', () => { clearToken(); clearHistory(); });
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); togglePanel(false); } });
    $('.suggestions').addEventListener('click', (e) => {if (e.target.tagName === 'BUTTON') {query.value = e.target.textContent;query.focus();}});
    query.addEventListener('keydown', (e) => {if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {e.preventDefault();$('.composer').requestSubmit();}});

    $('.composer').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.busy) return;
      const message = query.value.trim();
      if (!message) return;
      if (!state.url || !state.token) {
        settings.classList.add('open');
        addMessage('请先点击右上角 ⚙，填写函数 URL 与内测访问口令（不是 DeepSeek API Key）。', 'assistant', 'error');
        return;
      }
      let parsedUrl;
      try { parsedUrl = new URL(state.url); } catch {addMessage('函数 URL 格式不正确。', 'assistant', 'error');return;}
      if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {addMessage('请填写 HTTPS 云函数 URL。', 'assistant', 'error');return;}
      if (/^sk-/i.test(state.token.trim())) { addMessage('请勿输入 DeepSeek API Key。请改用云函数的内测访问口令。', 'assistant', 'error'); return; }
      let currentContext = state.context;
      try { if (typeof window.feiyuAIContextProvider === 'function') currentContext = [currentContext, window.feiyuAIContextProvider()].filter(Boolean).join('\n'); } catch { /* Map context is optional. */ }
      const past = history.slice(-8).map(item => ({ ...item, content: item.content.slice(0, 2500) }));
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
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
          },
          body: JSON.stringify({ message, history: past, context: String(currentContext).slice(0, 3500) }),
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        let data;
        try { data = await response.json(); } catch { throw new Error(`接口未返回 JSON（HTTP ${response.status}），请检查是否调用了正确的函数 URL`); }
        if (!response.ok) {
          const errors = {401:'内测口令不正确或已失效，请在设置中重新输入。',403:'当前网站来源未获允许，请核对云函数 FRONTEND_ORIGIN。',429:'请求过于频繁或额度已用完，请稍后再试。',502:'模型上游服务异常，请检查云端配置与余额。',503:'云函数尚未配置完整。'};
          throw new Error(errors[response.status] || `云函数返回错误 HTTP ${response.status}`);
        }
        if (typeof data.reply !== 'string') throw new Error('接口返回缺少 reply 字段，请检查云函数代码。');
        if (revision !== state.revision || controller.signal.aborted) return;
        history.push({role:'user',content:message},{role:'assistant',content:data.reply});
        history.splice(0, Math.max(0, history.length - 8));
        addMessage(data.reply, 'assistant');
      } catch (err) {
        if (revision !== state.revision) return;
        let explanation = err.name === 'AbortError'
          ? '请求已停止或超时，可重新提问。'
          : err.message === 'Failed to fetch'
          ? '无法连接云函数。请检查 HTTPS 地址、FRONTEND_ORIGIN、CORS，以及函数 URL 是否允许公网访问。'
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
      clearToken
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
