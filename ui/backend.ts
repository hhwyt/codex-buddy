// One interface for the UI, two implementations:
// - in the app (Electron): calls the main process through the preload bridge (window.buddyNative);
// - in a plain browser (preview mode, scripts/preview.sh): a mock that prints the same STEP lines on a timer, so every
//   screen can be clicked through on a Mac.
// Progress arrives as STEP:<id>:<start|done|fail>:<text> lines; actions resolve with a result object.
(() => {
  const listeners = new Set<(p: ScriptLine) => void>();
  const emit = (kind: string, line: string) => listeners.forEach(fn => fn({ kind, line }));
  const onLine = (fn: (p: ScriptLine) => void) => { listeners.add(fn); };

  const native = window.buddyNative;
  if (native) {
    native.onLine(p => emit(p.kind, p.line));
    window.Backend = {
      mock: false,
      onLine,
      runInstall: () => native.runInstall(),
      buddy: async (action, args) => (await native.buddy(action, args || {})) || { ok: false, reason: '没有拿到结果' },
      showLogin: rect => native.showLogin(rect),
      hideLogin: () => native.hideLogin(),
      openUrl: url => native.openUrl(url),
    };
    return;
  }

  // ---------------- Preview mock ----------------
  document.documentElement.classList.add('preview');
  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || 'normal';   // normal | fix | fail
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  const step = (kind: string, id: string, state: string, text: string) => emit(kind, `STEP:${id}:${state}:${text}`);
  const installed = params.get('state') === 'installed';
  const mock: Record<string, any> = {
    installed, version: '26.1103.4239.0', edition: 'zh', kind: installed ? 'zhipu-free' : 'none', model: installed ? 'glm-4.5-flash' : null,
    customBaseUrl: null, hasZhipuKey: installed, hasOpenaiLogin: false, askBeforeEdit: false, effort: 'medium', hasOriginal: true, running: false,
  };
  let scanned: (() => void) | null = null;
  const bar = () => document.getElementById('preview-bar');
  const showBar = (html: string, handlers?: Record<string, () => void>) => {
    const el = bar(); if (!el) return;
    el.innerHTML = html; el.hidden = false;
    Object.entries(handlers || {}).forEach(([id, fn]) => { const b = el.querySelector<HTMLElement>('#' + id); if (b) b.onclick = fn; });
  };
  const idleBar = () => showBar('预览模式（模拟后端，不会改你的电脑）');

  // A stand-in for Zhipu's login page: a fake QR code and a button that pretends the user scanned it
  const fakeQr = () => {
    let cells = '';
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
      const finder = (a: number, b: number) => x >= a && x < a + 7 && y >= b && y < b + 7;
      const inFinder = finder(0, 0) || finder(18, 0) || finder(0, 18);
      let on;
      if (inFinder) { const fx = x < 7 ? x : x - 18, fy = y < 7 ? y : y - 18; on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4); }
      else on = rnd() > .52;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
    return `<svg viewBox="0 0 25 25" shape-rendering="crispEdges" fill="#0f172a">${cells}</svg>`;
  };

  async function runInstall(): Promise<{ code: number }> {
    const k = 'install';
    step(k, 'check', 'start', '检测电脑');
    await sleep(900);
    step(k, 'install', 'start', '正在后台下载 Codex');
    step(k, 'check', 'done', 'Windows 11 专业版 · x64');
    step(k, 'key', 'start', '获取免费 Key');
    await sleep(500);
    step(k, 'scan', 'start', '用微信扫码登录智谱');
    let pct = 0;
    const dl = setInterval(() => { pct = Math.min(pct + 3, 64); step(k, 'install', 'start', `正在后台下载 Codex ${pct}%`); }, 400);
    await new Promise<void>(resolve => { scanned = resolve; });
    clearInterval(dl);
    step(k, 'scan', 'done', '已登录智谱');
    await sleep(700);
    step(k, 'key', 'done', '已用你的智谱账号建好 Key');
    step(k, 'config', 'start', '测试智谱免费模型');
    await sleep(1400);
    step(k, 'config', 'done', '已配置智谱免费模型 glm-4.5-flash');
    for (; pct < 100; pct += 6) { step(k, 'install', 'start', `下载 Codex ${Math.min(pct, 100)}%`); await sleep(160); }
    step(k, 'install', 'start', '核对安装包是不是 OpenAI 官方原版');
    await sleep(900);
    if (scenario === 'fail') {
      step(k, 'install', 'fail', '这台电脑的 Windows 应用数据库坏了（错误 0x80073CFE），微软商店也装不上任何应用，不是 Codex 的问题。修复办法：打开「设置 → 系统 → 恢复」，点「立即重新安装」（保留文件和软件）。修好后再点「再试一次」。');
      return { code: 1 };
    }
    step(k, 'install', 'start', '安装 Codex');
    await sleep(1600);
    step(k, 'install', 'done', 'Codex 26.1103.4239.0 已装好');
    step(k, 'test', 'start', '让 Codex 回一句话');
    if (scenario === 'fix') {
      await sleep(800);
      step(k, 'fix', 'start', '正在帮你修：这个版本的 Codex 不认模型菜单文件，改用默认菜单');
      await sleep(2200);
      step(k, 'fix', 'done', '已改用默认模型菜单');
    }
    await sleep(1500);
    step(k, 'test', 'done', 'Codex 回复：好了');
    step(k, 'edition', 'done', '汉化版');
    step(k, 'all', 'done', 'glm-4.5-flash');
    Object.assign(mock, { installed: true, kind: 'zhipu-free', model: 'glm-4.5-flash', hasZhipuKey: true });
    return { code: 0 };
  }

  async function buddy(action: string, args: Record<string, any> = {}): Promise<BuddyResult> {
    const k = 'buddy';
    const done = (r: BuddyResult) => r;
    switch (action) {
      case 'status': await sleep(250); return done({ ok: true, ...mock, effortSupported: !String(mock.kind).startsWith('zhipu') });   // GLM models ignore 思考深度
      case 'snapshot': await sleep(150); return done({ ok: true });
      case 'open': await sleep(400); return done({ ok: true });
      case 'log': await sleep(300); return done({ ok: true, text: '（预览模式的示例日志）\n12:00:01  STEP:check:start:检测电脑\n12:00:02  ok Windows 11 · x64\n' });
      case 'settings': await sleep(500); Object.assign(mock, args.effort ? { effort: args.effort } : { askBeforeEdit: !!args.askBeforeEdit }); return done({ ok: true, running: mock.running });
      case 'edition':
        step(k, 'edition', 'start', args.edition === 'zh' ? '切换到汉化版' : '切换到英文原版');
        await sleep(1500);
        mock.edition = args.edition;
        step(k, 'edition', 'done', '已切换');
        return done({ ok: true, edition: args.edition });
      case 'restore':
        step(k, 'files', 'start', '还原 Codex 的配置'); await sleep(900); step(k, 'files', 'done', '配置已还原');
        step(k, 'edition', 'start', '去掉汉化版的快捷方式'); await sleep(700); step(k, 'edition', 'done', '已去掉');
        step(k, 'uninstall', 'start', '卸载 Codex（安装前这台电脑没有它）'); await sleep(1200); step(k, 'uninstall', 'done', '已卸载 Codex');
        Object.assign(mock, { installed: false, kind: 'none', model: null, hasZhipuKey: false, edition: 'en' });
        return done({ ok: true, uninstalled: true });
      case 'switch': {
        step(k, 'backup', 'start', '备份现在的配置'); await sleep(500); step(k, 'backup', 'done', '已备份');
        step(k, 'write', 'start', '准备新配置'); await sleep(400);
        if (args.kind === 'custom' && !(args.baseUrl && args.model && args.apiKey)) {
          step(k, 'write', 'fail', '地址、Key、模型名要填全（地址以 http:// 或 https:// 开头）');
          return done({ ok: false, reason: '信息没填全' });
        }
        step(k, 'write', 'done', '新配置准备好了');
        if (args.kind === 'openai' && !mock.hasOpenaiLogin) {
          step(k, 'login', 'start', '在弹出的浏览器里登录你的 OpenAI（ChatGPT）账号'); await sleep(2000); step(k, 'login', 'done', '已登录 OpenAI 账号');
          mock.hasOpenaiLogin = true;
        }
        const model = args.kind === 'zhipu-free' ? 'glm-4.5-flash' : args.kind === 'zhipu-paid' ? (args.model || 'glm-5') : args.kind === 'custom' ? args.model : null;
        step(k, 'test', 'start', model ? `测试连通：让 ${model} 回一句话` : '测试连通：让 Codex 回一句话');
        await sleep(1800);
        if (args.kind === 'custom' && /bad|wrong|错/.test(args.apiKey)) {
          step(k, 'test', 'fail', 'Key 不对，或者没有权限用这个模型');
          return done({ ok: false, reason: 'Key 不对，或者没有权限用这个模型' });
        }
        step(k, 'test', 'done', '通了，回复：好了');
        step(k, 'save', 'start', '保存'); await sleep(400); step(k, 'save', 'done', '已保存');
        Object.assign(mock, { kind: args.kind, model, customBaseUrl: args.kind === 'custom' ? args.baseUrl : mock.customBaseUrl });
        return done({ ok: true, kind: args.kind, model, reply: '好了' });
      }
      default: return done({ ok: false, reason: 'unknown action' });
    }
  }

  window.Backend = {
    mock: true,
    onLine,
    runInstall,
    buddy,
    showLogin: async () => {
      const slot = document.getElementById('login-slot')!;
      if (!slot.querySelector('.fake-login')) {
        const el = document.createElement('div');
        el.className = 'fake-login';
        el.innerHTML = `<div class="qr">${fakeQr()}</div><p>微信扫码登录 / 注册</p><small>（预览模式：这里在 App 里是智谱的真实登录页）</small>`;
        slot.appendChild(el);
      }
      showBar('预览模式 <button id="pv-scan" type="button">（预览）模拟扫码成功</button>', { 'pv-scan': () => { if (scanned) { scanned(); scanned = null; } idleBar(); } });
    },
    hideLogin: async () => { document.querySelector('#login-slot .fake-login')?.remove(); idleBar(); },
        openUrl: async (url: string) => { window.open(url, '_blank', 'noopener'); },
  };
  document.addEventListener('DOMContentLoaded', idleBar);
})();
