// Codex 搭子 UI: four install screens (welcome, scan, progress, done) and the manage page.
// The install is codex.ps1; its STEP lines drive the screens. Management actions run in the main process (electron/buddy.ts).
const B = window.Backend;
const $ = (sel: string): any => document.querySelector(sel);
const $$ = (sel: string): any[] => [...document.querySelectorAll(sel)];

// Recommended (sponsored) providers, shown above "其他厂商". v1 ships none, so the block stays hidden. Later the list
// comes from the server, one entry per provider:
//   { id: 'acme', name: '某某云', note: '一句话介绍', baseUrl: 'https://…/v1', models: ['model-a'], signupUrl: 'https://…', sponsored: true }
// Picking one fills the "其他厂商" form with its address and first model; the user still brings their own key.
const RECOMMENDED_PROVIDERS = [];

const INSTALL_ROWS = [
  { id: 'check', title: '检测电脑' },
  { id: 'install', title: '安装 Codex' },
  { id: 'key', title: '获取免费 Key' },
  { id: 'config', title: '配置模型' },
  { id: 'test', title: '测试连通' },
];
const KIND_NAMES = { 'zhipu-free': '智谱免费', 'zhipu-paid': '智谱付费', openai: 'OpenAI 官方账号', custom: '其他厂商', none: '还没配置' };
const ICONS = '<svg class="ok" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><svg class="no" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const STEP_LINE = /^STEP:([a-z]+):(start|done|fail):(.*)$/;
// Switch dialog: which of the three stages (备份 → 测试连通 → 保存) each management step belongs to
const SWITCH_STAGE_OF_STEP = { backup: 0, write: 1, login: 1, test: 1, save: 2 };
const SWITCH_STAGE_LAST_STEP = { backup: 0, test: 1, save: 2 };
const WELCOME_BEAT_MS = 2500;   // After 「开始」 the welcome timer runs this long at most before the scan screen

const state = {
  screen: null, started: 0, timer: 0, lastWholeSecond: -1, running: false, allDone: false, failed: false,
  scanned: false, model: '', editionWarn: '', status: null, busy: false, welcomeBeat: 0, afterTaskClose: null,
  finalSeconds: null as number | null,   // Frozen when STEP:all:done arrives
};

// Preview only: ?size=1090x570 renders the app frame at another window size (?theme=day|night is handled by theme.ts)
if (B.mock) {
  const size = /^(\d+)x(\d+)$/.exec(new URLSearchParams(location.search).get('size') || '');
  if (size) Object.assign(document.body.style, { width: `${size[1]}px`, height: `${size[2]}px` });
}

// ---------------- Theme (day / night) ----------------
// theme.ts sets <html data-theme="day|night"> by the clock, before the first paint. When it changes, every colour eases over .5s
// (html.theme-anim in app.css) and the canvases pick up the new colours on their next frame.
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const themeColours = { accent: '', ink: '' };
function readThemeColours() { themeColours.accent = css('--accent-rgb'); themeColours.ink = css('--ink-rgb'); }
readThemeColours();
let themeAnimTimer = 0;
new MutationObserver(() => {
  const html = document.documentElement;
  html.classList.add('theme-anim');
  clearTimeout(themeAnimTimer);
  themeAnimTimer = window.setTimeout(() => html.classList.remove('theme-anim'), 600);
  readThemeColours();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------------- Screens ----------------
function show(name) {
  if (state.screen === 'scan' && name !== 'scan') B.hideLogin();
  if (name !== 'welcome') clearTimeout(state.welcomeBeat);
  if (name === 'welcome' && !state.running) resetWelcome();
  $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
  const changed = state.screen !== name;
  state.screen = name;
  $('#chip-timer').hidden = !state.started || !['scan', 'progress', 'done'].includes(name);
  if (!changed) return;
  $$(`#screen-${name} [data-decode]`).forEach(decode);
  if (name === 'welcome' || name === 'done') startFlow(); else stopFlow();
}

// ---------------- Effects (same as humanslive.ai and the installer's terminal) ----------------
// Text decodes out of noise, like the installer's "HUMANSLIVE.AI ▸" header: only ASCII is scrambled, CJK stays
const DECODE_POOL = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function decode(el) {
  const text: string = el.dataset.text || (el.dataset.text = el.textContent);
  let step = 0;
  clearInterval(el.decodeTimer);
  el.decodeTimer = setInterval(() => {
    const shown = Math.floor((text.length * step) / 14);
    el.textContent = [...text].map((c, i) => (i < shown || !/[!-~]/.test(c) ? c : DECODE_POOL[Math.floor(Math.random() * DECODE_POOL.length)])).join('');
    if (++step > 14) { clearInterval(el.decodeTimer); el.textContent = text; }
  }, 32);
}

// Flow lines drifting over the grid, like the site's first screen. Runs only on the welcome and done screens.
const flow = { raf: 0, parts: [] as { x: number; y: number; age: number; life: number; bright: boolean }[] };
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function startFlow() {
  const canvas = $('#flow');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width = canvas.offsetWidth * dpr, h = canvas.height = canvas.offsetHeight * dpr;
  const ctx = canvas.getContext('2d');
  const spawn = p => Object.assign(p, { x: Math.random() * w, y: Math.random() * h, age: 0, life: 120 + Math.random() * 220, bright: Math.random() < .14 });
  flow.parts = Array.from({ length: 260 }, () => spawn({} as any));
  cancelAnimationFrame(flow.raf);
  canvas.classList.add('on');
  const t0 = performance.now();
  const frame = (now: number) => {
    const t = now - t0;
    ctx.globalCompositeOperation = 'destination-out';   // Fade old strokes into trails, keep the canvas transparent
    ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = .8 * dpr;
    for (const p of flow.parts) {
      const a = Math.sin(p.x * .0019 / dpr + t * .00012) * Math.cos(p.y * .0023 / dpr - t * .0001) * Math.PI * 2 + Math.sin((p.x + p.y) * .0008 / dpr);
      const nx = p.x + Math.cos(a) * .9 * dpr, ny = p.y + Math.sin(a) * .9 * dpr;
      const fade = Math.min(1, p.age / 30, (p.life - p.age) / 30);
      ctx.strokeStyle = p.bright ? `rgba(${themeColours.ink},${.32 * fade})` : `rgba(${themeColours.accent},${.42 * fade})`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
      p.x = nx; p.y = ny;
      if (++p.age > p.life || p.x < 0 || p.x > w || p.y < 0 || p.y > h) spawn(p);
    }
    if (!reducedMotion()) flow.raf = requestAnimationFrame(frame);
  };
  flow.raf = requestAnimationFrame(frame);
}
function stopFlow() { cancelAnimationFrame(flow.raf); $('#flow').classList.remove('on'); }

// Done screen: blue signal lines shoot out from behind the number and three hairline rings spread (no multi-colour confetti)
function signalBurst(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width = canvas.offsetWidth * dpr, h = canvas.height = canvas.offsetHeight * dpr;
  const box = canvas.getBoundingClientRect(), num = $('.done-time').getBoundingClientRect();
  const cx = (num.left + num.width / 2 - box.left) * dpr, cy = (num.top + num.height / 2 - box.top) * dpr;
  const ctx = canvas.getContext('2d');
  const lines = Array.from({ length: 150 }, () => {
    const a = Math.random() * Math.PI * 2, v = (5 + Math.random() * 15) * dpr;
    return { x: cx + Math.cos(a) * 40 * dpr, y: cy + Math.sin(a) * 26 * dpr, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .72, bright: Math.random() < .25 };
  });
  const t0 = performance.now(), life = 2600;
  const frame = (now: number) => {
    const t = now - t0, k = Math.max(0, 1 - t / life);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (const p of lines) {
      p.x += p.vx; p.y += p.vy; p.vx *= .955; p.vy *= .955;
      ctx.strokeStyle = p.bright ? `rgba(${themeColours.ink},${.8 * k})` : `rgba(${themeColours.accent},${.9 * k})`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.moveTo(p.x - p.vx * 3.5, p.y - p.vy * 3.5); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const rt = (t - i * 260) / 1600;
      if (rt <= 0 || rt >= 1) continue;
      ctx.strokeStyle = `rgba(${themeColours.accent},${.6 * (1 - rt)})`; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.ellipse(cx, cy, (120 + rt * 420) * dpr, (70 + rt * 250) * dpr, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (t < life && !reducedMotion()) requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(frame);
}
let toastTimer = 0;
function toast(text: string, ms = 2600) {
  const t = $('#toast');
  t.hidden = true; void t.offsetWidth;   // Restart the pop-in animation
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
}
function restartAnimation(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// ---------------- Timer ----------------
function buildTicks() {
  const g = $('#ring-ticks'), ns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, major = i % 5 === 0, r1 = major ? 105 : 108, r2 = 114;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(120 + r1 * Math.cos(a))); line.setAttribute('y1', String(120 + r1 * Math.sin(a)));
    line.setAttribute('x2', String(120 + r2 * Math.cos(a))); line.setAttribute('y2', String(120 + r2 * Math.sin(a)));
    if (major) line.classList.add('major');
    g.appendChild(line);
  }
}
function elapsed() { return state.started ? (performance.now() - state.started) / 1000 : 0; }
function renderTime(s) {
  const whole = Math.floor(s);
  $('#timer-num').textContent = String(whole);
  $('#timer-dec').textContent = `.${Math.floor((s - whole) * 10)}`;
  $('#chip-timer-text').textContent = `${s.toFixed(1)} 秒`;
  $('#ring-fill').style.strokeDashoffset = String(603.2 * (1 - (s % 60) / 60));
  if (whole !== state.lastWholeSecond) {
    state.lastWholeSecond = whole;
    $$('#ring-ticks line').forEach((l, i) => l.classList.toggle('on', i <= whole % 60 && s > 0));
    if (whole > 0) restartAnimation($('#chip-timer'), 'tick');
  }
}
function startTimer() {
  state.started = performance.now(); state.lastWholeSecond = -1;
  $('#chip-timer').classList.remove('stopped'); $('#chip-timer-label').textContent = '已用时';
  const tick = () => { renderTime(elapsed()); state.timer = requestAnimationFrame(tick); };
  cancelAnimationFrame(state.timer); tick();
}
function stopTimer() {
  cancelAnimationFrame(state.timer);
  const s = elapsed(); renderTime(s);
  $('#chip-timer').classList.add('stopped'); $('#chip-timer-label').textContent = '共用时';
  return s;
}
function resetWelcome() {
  state.started = 0; state.lastWholeSecond = -1; renderTime(0);
  $('#timer-card').classList.remove('running');
  $('#timer-status').textContent = '点「开始」后开始计时';
  $('#btn-start').disabled = false; $('#btn-start-text').textContent = '开始';
}

// ---------------- Checklists ----------------
function rowHtml(id) {
  return `<li data-id="${id}"><span class="ico">${ICONS}</span><span class="txt"><b></b><small></small></span><span class="sec"></span></li>`;
}
function setRow(list, id: string, st: string, text: string, title?: string) {
  let li = list.querySelector(`li[data-id="${id}"]`);
  if (!li) { list.insertAdjacentHTML('beforeend', rowHtml(id)); li = list.lastElementChild; li.querySelector('b').textContent = title || text; }
  if (st === 'start' && !li.classList.contains('running')) li.dataset.since = String(performance.now());
  li.classList.remove('running', 'done', 'fail');
  li.classList.add(st === 'start' ? 'running' : st);
  if (title) li.querySelector('b').textContent = title;
  li.querySelector('small').textContent = text || '';
  const pct = st === 'start' && /(\d{1,3})%/.exec(text || '');
  li.classList.toggle('has-pct', !!pct);
  if (pct) li.style.setProperty('--pct', `${Math.min(100, Number(pct[1]))}%`);
  if (st !== 'start' && li.dataset.since) li.querySelector('.sec').textContent = `${((performance.now() - Number(li.dataset.since)) / 1000).toFixed(1)} 秒`;
  if (list.id === 'checklist') renderInstallProgress();
}
function renderInstallProgress() {
  const list = $('#checklist');
  const done = list.querySelectorAll('li.done').length, running = list.querySelectorAll('li.running').length;
  $('#progress-count').textContent = `${done} / ${INSTALL_ROWS.length}`;
  $('#progress-bar').style.width = `${((done + running * 0.35) / INSTALL_ROWS.length) * 100}%`;
  $('.progress-bar').classList.toggle('full', done === INSTALL_ROWS.length);
}
function resetInstallRows() {
  const list = $('#checklist');
  list.innerHTML = INSTALL_ROWS.map(r => rowHtml(r.id)).join('');
  INSTALL_ROWS.forEach(r => { list.querySelector(`li[data-id="${r.id}"] b`).textContent = r.title; });
  list.querySelectorAll('small').forEach(s => { s.textContent = '等一下就轮到它'; });
  renderInstallProgress();
}
function setMini(id, st, text) {
  const box = $('#scan-mini');
  let chip = box.querySelector(`[data-id="${id}"]`);
  if (!chip) { chip = document.createElement('span'); chip.dataset.id = id; chip.innerHTML = '<i class="mp-ico"></i><em></em>'; box.appendChild(chip); }
  chip.className = st === 'done' ? 'done' : '';
  chip.querySelector('em').textContent = text;
}

// ---------------- Install ----------------
async function startInstall() {
  if (state.running) return;
  const fromWelcome = state.screen === 'welcome';
  Object.assign(state, { running: true, allDone: false, failed: false, scanned: false, model: '', editionWarn: '', finalSeconds: null });
  resetInstallRows();
  $('#scan-mini').innerHTML = '';
  $('#failure').hidden = true; $('#fixing').hidden = true; $('#login-wait').hidden = false;
  $('#login-wait-text').textContent = '正在检测电脑，马上打开智谱登录…';
  $('#progress-title').textContent = '搭子正在帮你装，不用管它';
  $('.progress').classList.remove('failed');
  $('#btn-start').disabled = true; $('#btn-start-text').textContent = '已开始';
  startTimer();
  if (fromWelcome) {
    // A short beat on the welcome screen: the big timer comes alive, then the scan screen slides in
    restartAnimation($('#timer-card'), 'running');
    $('#timer-status').innerHTML = '<span class="spinner"></span>正在检测电脑…';
    state.welcomeBeat = setTimeout(() => { if (state.screen === 'welcome' && state.running) show('scan'); }, WELCOME_BEAT_MS);
  } else show('scan');
  await B.buddy('snapshot');
  let code = 1;
  try { code = (await B.runInstall()).code; } catch (e) { console.error(e); }
  await new Promise(r => setTimeout(r, 300));   // Let the last STEP events land
  state.running = false;
  $('#btn-start').disabled = false; $('#btn-start-text').textContent = '开始';
  if (state.allDone) return finishInstall();
  if (!state.failed) failInstall(code === 0 ? '安装没有走完。' : '安装中途停了下来。点「再试一次」，已经下载的部分会接着下。');
}

function onInstallLine(line) {
  const m = STEP_LINE.exec(line);
  if (!m) return;
  const [, id, st, text] = m;
  const list = $('#checklist');
  if (id === 'scan') {
    if (st === 'start') { state.scanned = true; show('scan'); placeLogin(); }
    else if (st === 'done') show('progress');
    if (st === 'fail') failInstall(text);
    return;
  }
  if (id === 'fix') {
    $('#fixing').hidden = st !== 'start';
    $('#fixing-text').textContent = text;
    if (st === 'start') requestAnimationFrame(() => $('#fixing').scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    if (st === 'done') toast('✓ ' + text);
    return;
  }
  if (id === 'edition') { if (st === 'fail') state.editionWarn = text; return; }
  // Stop the stopwatch right here, not when the done screen renders (a hidden window renders late)
  if (id === 'all') { if (st === 'done') { state.allDone = true; state.model = text; state.finalSeconds = stopTimer(); } return; }
  if (!INSTALL_ROWS.some(r => r.id === id)) return;
  setRow(list, id, st, text);
  if (id === 'check' || id === 'install') setMini(id, st, st === 'done' && id === 'check' ? `检测电脑：${text}` : text);
  // An earlier login still works: no scan needed, go straight to the progress screen
  if (id === 'key' && st === 'done' && ['welcome', 'scan'].includes(state.screen)) show('progress');
  if (state.screen === 'welcome' && ['config', 'test'].includes(id)) show('progress');
  if (st === 'fail') failInstall(text);
}

async function placeLogin() {
  if (state.screen !== 'scan') return;
  // The screen slides in; measure the slot only after it has settled, so the login page lands exactly on it
  const sliding = $('#screen-scan').getAnimations({ subtree: true }).filter(a => a.animationName === 'enter');
  await Promise.all(sliding.map(a => a.finished.catch(() => {})));
  if (state.screen !== 'scan') return;
  const r = $('#login-slot').getBoundingClientRect();
  $('#login-wait-text').textContent = '正在打开智谱登录…';
  await B.showLogin({ x: r.left, y: r.top, w: r.width, h: r.height });
}

function failInstall(text) {
  if (state.failed) return;
  state.failed = true;
  stopTimer();
  show('progress');
  $('#fixing').hidden = true;
  $('#progress-title').textContent = '遇到了一点问题';
  $('.progress').classList.add('failed');
  $('#failure-text').textContent = text;
  $('#failure').hidden = false;
  requestAnimationFrame(() => $('#failure').scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function finishInstall() {
  const seconds = Math.round(state.finalSeconds ?? stopTimer());
  $('#done-model').textContent = state.model ? `用的是智谱免费模型 ${state.model}` : '';
  $('#done-warn').hidden = !state.editionWarn;
  $('#done-warn').textContent = state.editionWarn ? `${state.editionWarn}。可以在管理页里再切换一次。` : '';
  $('#done-facts').innerHTML = (state.scanned ? '<li>扫码 <b>1</b> 次</li>' : '') +
    `<li>自动完成 <b>${INSTALL_ROWS.length}</b> 步</li><li>花费 <b>0</b> 元</li>`;
  show('done');
  // Rhythm: the header decodes, the number counts up, and when it lands the signal burst goes off
  countUp($('#done-seconds'), seconds, () => { restartAnimation($('.done-time'), 'landed'); signalBurst($('#confetti')); });
}

function countUp(el, target, onDone) {
  const t0 = performance.now(), dur = 1300;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 4))));
    if (p < 1) requestAnimationFrame(step); else if (onDone) onDone();
  };
  requestAnimationFrame(step);
}

async function copyLog() {
  const r = await B.buddy('log');
  if (!r.ok) return toast('没拿到日志');
  try { await navigator.clipboard.writeText(r.text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = r.text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('日志已复制，发给我们就行（里面没有你的 Key）', 3500);
}

async function openCodex() {
  toast('正在打开 Codex…');
  const r = await B.buddy('open');
  if (!r.ok) toast(r.reason || '没打开');
  else if (B.mock) toast('预览模式：在 App 里这里会打开 Codex');
}

// ---------------- Manage ----------------
async function loadStatus() {
  const s = await B.buddy('status');
  state.status = s;
  renderManage(s);
  return s;
}
function renderManage(s) {
  const name = KIND_NAMES[s.kind] || '还没配置';
  const nameEl = $('#current-name');
  if (nameEl.textContent !== name) { nameEl.textContent = name; if (state.screen === 'manage') restartAnimation(nameEl, 'changed'); }
  const bits = [];
  if (s.model) bits.push(`模型 ${s.model}`);
  bits.push(s.edition === 'zh' ? '汉化版' : '英文原版');
  if (s.version) bits.push(`Codex ${s.version}`);
  $('#current-sub').textContent = bits.join(' · ');
  $$('#screen-manage .card').forEach(c => c.classList.toggle('current', c.dataset.kind === s.kind));
  // One-click cards that are already in use: the button turns into a quiet "正在用" label
  $$('[data-switch]').forEach(b => {
    const inUse = b.dataset.switch === s.kind && ['zhipu-free', 'openai'].includes(s.kind);
    b.disabled = inUse; b.classList.toggle('in-use', inUse);
    b.textContent = inUse ? '✓ 正在用' : b.dataset.label;
  });
  if (s.kind === 'zhipu-paid' && s.model) $('#paid-model').value = s.model;
  if (s.kind === 'custom') { $('#custom-url').value = s.customBaseUrl || ''; $('#custom-model').value = s.model || ''; }
  $$('#edition-seg button').forEach(b => b.classList.toggle('active', b.dataset.edition === s.edition));
  $$('#set-ask button').forEach(b => b.classList.toggle('active', b.dataset.value === String(!!s.askBeforeEdit)));
  $$('#set-effort button').forEach(b => b.classList.toggle('active', b.dataset.value === (s.effort || 'medium')));
  $('#row-effort').hidden = s.effortSupported === false;   // GLM models ignore 思考深度
  $('#btn-restore').disabled = !s.hasOriginal;
  renderSponsors(RECOMMENDED_PROVIDERS);
}
function renderSponsors(list) {
  $('#sponsor-block').hidden = !list.length;
  $('#sponsor-cards').innerHTML = '';
  list.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = '<span class="badge sponsor">赞助</span><h3></h3><p></p><button class="btn" type="button">填进下面的表单</button>';
    card.querySelector('h3').textContent = p.name;
    card.querySelector('p').textContent = p.note || '';
    card.querySelector('button').onclick = () => {
      $('#custom-url').value = p.baseUrl || ''; $('#custom-model').value = (p.models || [])[0] || ''; $('#custom-key').focus();
      if (p.signupUrl) B.openUrl(p.signupUrl);
    };
    $('#sponsor-cards').appendChild(card);
  });
}

// ---- Task dialog: one buddy action, one row per STEP line; switches also show the three stages ----
function setStage(index, cls) {
  const li = $(`#task-stages li[data-stage="${index}"]`);
  if (!li || li.classList.contains(cls)) return;
  li.classList.remove('running', 'done', 'fail'); li.classList.add(cls);
}
function onSwitchStep(id, st) {
  const stage = SWITCH_STAGE_OF_STEP[id];
  if (stage === undefined) return;
  if (st === 'start') { for (let i = 0; i < stage; i++) setStage(i, 'done'); setStage(stage, 'running'); }
  else if (st === 'fail') setStage(stage, 'fail');
  else if (SWITCH_STAGE_LAST_STEP[id] === stage) setStage(stage, 'done');
}
function showTaskResult(ok: boolean, title: string, text: string) {
  const box = $('#task-result');
  box.className = 'task-result ' + (ok ? 'ok' : 'bad');
  $('#task-result-title').textContent = title;
  $('#task-result-text').textContent = text;
  box.hidden = false;
}
// Only when Codex is open does the user need to reopen it
const reopenNote = (r: BuddyResult): string => (r.running ? 'Codex 开着的话，关掉重新打开一次就生效。' : '');
// result: r => [title, text] for the success / failure banner
async function runTask(title: string, action: string, args?: Record<string, unknown>,
  { stages = false, success }: { stages?: boolean; success?: (r: BuddyResult) => [string, string] } = {}): Promise<BuddyResult | null> {
  if (state.busy) return null;
  state.busy = true;
  $('#task-title').textContent = title;
  $('#task-list').innerHTML = '';
  $('#task-stages').hidden = !stages;
  $$('#task-stages li').forEach(li => li.classList.remove('running', 'done', 'fail'));
  $('#task-result').hidden = true;
  $('#task-actions').hidden = true; $('#task-copy-log').hidden = true;
  $('#task-modal').hidden = false;
  let r: BuddyResult;
  try { r = await B.buddy(action, args); } catch (e) { r = { ok: false, reason: String(e) }; }
  state.busy = false;
  $('#task-list').querySelectorAll('li.running').forEach(li => setRow($('#task-list'), li.dataset.id, r.ok ? 'done' : 'fail', li.querySelector('small').textContent));
  if (stages) {
    if (r.ok) [0, 1, 2].forEach(i => setStage(i, 'done'));
    else if (!$('#task-stages li.fail')) setStage(Number(($('#task-stages li.running') || $('#task-stages li:not(.done)') || { dataset: { stage: 2 } }).dataset.stage), 'fail');
  }
  if (r.ok) { const [okTitle, okText] = success ? success(r) : ['好了', '']; showTaskResult(true, okTitle, okText); }
  else showTaskResult(false, action === 'switch' ? '没切换成功，原来的配置没动' : '没成功', r.reason || '原因不明');
  $('#task-actions').hidden = false; $('#task-copy-log').hidden = r.ok;
  $('#task-close').focus();
  return r;
}
function onBuddyLine(line) {
  const m = STEP_LINE.exec(line);
  if (!m || $('#task-modal').hidden) return;
  const [, id, st, text] = m;
  setRow($('#task-list'), id, st, st === 'start' ? '' : text, st === 'start' ? text : undefined);
  if (!$('#task-stages').hidden) onSwitchStep(id, st);
}

async function switchTo(kind: string, button) {
  const args: Record<string, string> = { kind };
  if (kind === 'zhipu-paid') args.model = $('#paid-model').value;
  if (kind === 'custom') Object.assign(args, { baseUrl: $('#custom-url').value.trim(), apiKey: $('#custom-key').value.trim(), model: $('#custom-model').value.trim() });
  button.classList.add('loading');
  const r = await runTask(`切换到：${KIND_NAMES[kind]}`, 'switch', args, {
    stages: true,
    success: r => [`切换好了，正在用：${KIND_NAMES[kind]}`, reopenNote(r)],
  });
  button.classList.remove('loading');
  if (!r) return;
  if (r.ok && kind === 'custom') $('#custom-key').value = '';
  await loadStatus();
  if (r.ok) state.afterTaskClose = () => restartAnimation($(`#screen-manage .card[data-kind="${kind}"]`), 'just-switched');
}

function confirmBox(title, text) {
  return new Promise(resolve => {
    $('#confirm-title').textContent = title; $('#confirm-text').textContent = text;
    $('#confirm-modal').hidden = false;
    const close = v => { $('#confirm-modal').hidden = true; resolve(v); };
    $('#confirm-yes').onclick = () => close(true);
    $('#confirm-no').onclick = () => close(false);
  });
}

async function saveSetting(group, args, label) {
  const pills = $(group), row = pills.closest('.setting');
  pills.classList.add('saving');
  const r = await B.buddy('settings', args);
  pills.classList.remove('saving');
  toast(r.ok ? `✓ 已保存：${label}${r.running ? '（Codex 重新打开后生效）' : ''}` : '没保存成功');
  await loadStatus();
  if (r.ok) { restartAnimation(row, 'saved-flash'); clearTimeout(row.flashTimer); row.flashTimer = setTimeout(() => row.classList.remove('saved-flash'), 1800); }
}

// ---------------- Wiring ----------------
buildTicks();
B.onLine(({ kind, line }) => (kind === 'install' ? onInstallLine : onBuddyLine)(line));
$('#btn-start').onclick = startInstall;
$('#btn-retry').onclick = startInstall;
$('#btn-copy-log').onclick = copyLog;
$('#task-copy-log').onclick = copyLog;
$('#btn-open-codex').onclick = openCodex;
$('#btn-open-codex-2').onclick = openCodex;
$('#btn-to-manage').onclick = async () => { await loadStatus(); show('manage'); };
$('#task-close').onclick = () => {
  $('#task-modal').hidden = true;
  const next = state.afterTaskClose; state.afterTaskClose = null;
  if (next) next();
};
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
});
$$('[data-switch]').forEach(b => { b.dataset.label = b.textContent; b.onclick = () => switchTo(b.dataset.switch, b); });
$$('[data-url]').forEach(a => a.onclick = e => { e.preventDefault(); B.openUrl(a.dataset.url); });
$$('#edition-seg button').forEach(b => b.onclick = async () => {
  if (b.classList.contains('active')) return;
  const zh = b.dataset.edition === 'zh';
  const r = await runTask(zh ? '切换到汉化版' : '切换到英文原版', 'edition', { edition: b.dataset.edition },
    { success: r => [`切换好了，现在是${zh ? '汉化版' : '英文原版'}`, reopenNote(r)] });
  if (r) await loadStatus();
});
$$('#set-ask button').forEach(b => b.onclick = () => !b.classList.contains('active') && saveSetting('#set-ask', { askBeforeEdit: b.dataset.value === 'true' }, `改文件前${b.textContent}`));
$$('#set-effort button').forEach(b => b.onclick = () => !b.classList.contains('active') && saveSetting('#set-effort', { effort: b.dataset.value }, `思考深度「${b.textContent}」`));
$('#btn-restore').onclick = async () => {
  const ok = await confirmBox('还原到安装前的样子？', 'Codex 的配置会放回安装前的样子，汉化版的快捷方式会去掉；如果 Codex 是这次才装的，也会一起卸载。你在 Codex 里的聊天记录不会删。');
  if (!ok) return;
  const r = await runTask('还原中', 'restore', undefined, { success: () => ['还原好了', '这台电脑已经回到安装前的样子。'] });
  if (r && r.ok) {
    state.afterTaskClose = () => show('welcome');
    await loadStatus();
  }
};

// Start: installed and configured → manage page; otherwise the welcome screen
(async () => {
  let s = null;
  try { s = await loadStatus(); } catch (e) { console.error(e); }
  show(s && s.installed && s.kind !== 'none' ? 'manage' : 'welcome');
})();
