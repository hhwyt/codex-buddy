// Codex 搭子 UI: four install screens (welcome, scan, progress, done) and the manage page.
// The install is codex.ps1; its STEP lines drive the screens. Management actions are buddy.ps1 (see backend.js).
const B = window.Backend;
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

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

const state = { screen: null, started: 0, timer: 0, running: false, allDone: false, failed: false, model: '', editionWarn: '', status: null, busy: false };

// ---------------- Screens ----------------
function show(name) {
  if (state.screen === 'scan' && name !== 'scan') B.hideLogin();
  $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
  state.screen = name;
  $('#chip-timer').hidden = !state.started || !['scan', 'progress', 'done'].includes(name);
}
function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------------- Timer ----------------
function elapsed() { return state.started ? (performance.now() - state.started) / 1000 : 0; }
function startTimer() {
  state.started = performance.now();
  $('#chip-timer').hidden = false; $('#chip-timer').classList.remove('stopped');
  const tick = () => {
    const s = elapsed();
    $('#timer-num').textContent = s.toFixed(1);
    $('#chip-timer-text').textContent = `${s.toFixed(1)} 秒`;
    $('#ring-fill').style.strokeDashoffset = String(603 * (1 - (s % 60) / 60));
    state.timer = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(state.timer); tick();
}
function stopTimer() { cancelAnimationFrame(state.timer); $('#chip-timer').classList.add('stopped'); return elapsed(); }

// ---------------- Checklists ----------------
function rowHtml(id, title) {
  return `<li data-id="${id}"><span class="ico">${ICONS}</span><span class="txt"><b></b><small></small></span><span class="sec"></span></li>`;
}
function setRow(list, id, st, text, title) {
  let li = list.querySelector(`li[data-id="${id}"]`);
  if (!li) { list.insertAdjacentHTML('beforeend', rowHtml(id)); li = list.lastElementChild; li.querySelector('b').textContent = title || text; }
  if (st === 'start' && !li.classList.contains('running')) li.dataset.since = String(performance.now());
  li.classList.remove('running', 'done', 'fail');
  li.classList.add(st === 'start' ? 'running' : st);
  if (title) li.querySelector('b').textContent = title;
  li.querySelector('small').textContent = text || '';
  if (st !== 'start' && li.dataset.since) li.querySelector('.sec').textContent = `${((performance.now() - Number(li.dataset.since)) / 1000).toFixed(1)}s`;
}
function resetInstallRows() {
  const list = $('#checklist');
  list.innerHTML = INSTALL_ROWS.map(r => rowHtml(r.id)).join('');
  INSTALL_ROWS.forEach(r => { list.querySelector(`li[data-id="${r.id}"] b`).textContent = r.title; });
  list.querySelectorAll('small').forEach(s => { s.textContent = '等待中'; });
}
function setMini(id, st, text) {
  const box = $('#scan-mini');
  let chip = box.querySelector(`[data-id="${id}"]`);
  if (!chip) { chip = document.createElement('span'); chip.dataset.id = id; box.appendChild(chip); }
  chip.className = st === 'done' ? 'done' : '';
  chip.textContent = (st === 'done' ? '✓ ' : '· ') + text;
}

// ---------------- Install ----------------
async function startInstall() {
  if (state.running) return;
  Object.assign(state, { running: true, allDone: false, failed: false, model: '', editionWarn: '' });
  resetInstallRows();
  $('#scan-mini').innerHTML = '';
  $('#failure').hidden = true; $('#fixing').hidden = true; $('#login-wait').hidden = false;
  $('#login-wait-text').textContent = '正在检测电脑，马上打开智谱登录…';
  $('#progress-title').textContent = '搭子正在帮你装，不用管它';
  $('#btn-start').disabled = true;
  startTimer();
  show('scan');
  await B.buddy('snapshot');
  let code = 1;
  try { code = (await B.runInstall()).code; } catch (e) { console.error(e); }
  await new Promise(r => setTimeout(r, 300));   // Let the last STEP events land
  state.running = false;
  $('#btn-start').disabled = false;
  if (state.allDone) return finishInstall();
  if (!state.failed) failInstall(code === 0 ? '安装没有走完。' : '安装中途停了下来。点「再试一次」，已经下载的部分会接着下。');
}

function onInstallLine(line) {
  const m = STEP_LINE.exec(line);
  if (!m) return;
  const [, id, st, text] = m;
  const list = $('#checklist');
  if (id === 'scan') {
    if (st === 'start') { show('scan'); requestAnimationFrame(placeLogin); }
    else if (st === 'done') show('progress');
    if (st === 'fail') failInstall(text);
    return;
  }
  if (id === 'fix') {
    $('#fixing').hidden = st !== 'start';
    $('#fixing-text').textContent = text;
    if (st === 'done') toast('✓ ' + text);
    return;
  }
  if (id === 'edition') { if (st === 'fail') state.editionWarn = text; return; }
  if (id === 'all') { if (st === 'done') { state.allDone = true; state.model = text; } return; }
  if (!INSTALL_ROWS.some(r => r.id === id)) return;
  setRow(list, id, st, text);
  if (id === 'check' || id === 'install') setMini(id, st, st === 'done' && id === 'check' ? `检测电脑：${text}` : text);
  // An earlier login still works: no scan needed, go straight to the progress screen
  if (id === 'key' && st === 'done' && state.screen === 'scan') show('progress');
  if (st === 'fail') failInstall(text);
}

async function placeLogin() {
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
  $('#failure-text').textContent = text;
  $('#failure').hidden = false;
}

function finishInstall() {
  const seconds = Math.round(stopTimer());
  $('#done-model').textContent = state.model ? `用的是智谱免费模型 ${state.model}` : '';
  $('#done-warn').hidden = !state.editionWarn;
  $('#done-warn').textContent = state.editionWarn ? `${state.editionWarn}。可以在管理页里再切换一次。` : '';
  show('done');
  countUp($('#done-seconds'), seconds);
  confetti($('#confetti'));
  B.buddy('selfinstall');   // Start-menu entry "Codex 搭子", so the manage page is easy to find later
}

function countUp(el, target) {
  const t0 = performance.now(), dur = 1100;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function confetti(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.offsetWidth * devicePixelRatio, h = canvas.height = canvas.offsetHeight * devicePixelRatio;
  const colors = ['#0ea5e9', '#6366f1', '#ec4899', '#f59e0b', '#10b981'];
  const parts = Array.from({ length: 160 }, () => ({
    x: w / 2 + (Math.random() - .5) * w * .3, y: h * .45, vx: (Math.random() - .5) * 26, vy: -Math.random() * 26 - 8,
    s: (Math.random() * 8 + 5) * devicePixelRatio, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = now => {
    ctx.clearRect(0, 0, w, h);
    parts.forEach(p => { p.vy += .7; p.vx *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); });
    if (now - t0 < 3200) requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(frame);
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
  $('#current-name').textContent = KIND_NAMES[s.kind] || '还没配置';
  const bits = [];
  if (s.model) bits.push(`模型 ${s.model}`);
  bits.push(s.edition === 'zh' ? '汉化版' : '英文原版');
  if (s.version) bits.push(`Codex ${s.version}`);
  $('#current-sub').textContent = bits.join(' · ');
  $$('#screen-manage .card').forEach(c => c.classList.toggle('current', c.dataset.kind === s.kind));
  if (s.kind === 'zhipu-paid' && s.model) $('#paid-model').value = s.model;
  if (s.kind === 'custom') { $('#custom-url').value = s.customBaseUrl || ''; $('#custom-model').value = s.model || ''; }
  $$('#edition-seg button').forEach(b => b.classList.toggle('active', b.dataset.edition === s.edition));
  $$('#set-ask button').forEach(b => b.classList.toggle('active', b.dataset.value === String(!!s.askBeforeEdit)));
  $$('#set-effort button').forEach(b => b.classList.toggle('active', b.dataset.value === (s.effort || 'medium')));
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

// Runs one buddy action in the task dialog, one row per STEP line
async function runTask(title, action, args) {
  if (state.busy) return null;
  state.busy = true;
  $('#task-title').textContent = title;
  $('#task-list').innerHTML = '';
  $('#task-result').textContent = ''; $('#task-result').className = 'task-result';
  $('#task-actions').hidden = true; $('#task-copy-log').hidden = true;
  $('#task-modal').hidden = false;
  let r;
  try { r = await B.buddy(action, args); } catch (e) { r = { ok: false, reason: String(e) }; }
  state.busy = false;
  $('#task-list').querySelectorAll('li.running').forEach(li => setRow($('#task-list'), li.dataset.id, r.ok ? 'done' : 'fail', li.querySelector('small').textContent));
  $('#task-result').textContent = r.ok ? '✓ 好了' : `没成功：${r.reason || '原因不明'}${action === 'switch' ? '。原来的配置没动。' : ''}`;
  $('#task-result').className = 'task-result ' + (r.ok ? 'ok' : 'bad');
  $('#task-actions').hidden = false; $('#task-copy-log').hidden = r.ok;
  return r;
}
function onBuddyLine(line) {
  const m = STEP_LINE.exec(line);
  if (!m || $('#task-modal').hidden) return;
  const [, id, st, text] = m;
  setRow($('#task-list'), id, st, st === 'start' ? '' : text, st === 'start' ? text : undefined);
}

async function switchTo(kind) {
  const args = { kind };
  if (kind === 'zhipu-paid') args.model = $('#paid-model').value;
  if (kind === 'custom') Object.assign(args, { baseUrl: $('#custom-url').value.trim(), apiKey: $('#custom-key').value.trim(), model: $('#custom-model').value.trim() });
  const r = await runTask(`切换到：${KIND_NAMES[kind]}`, 'switch', args);
  if (!r) return;
  if (r.ok && kind === 'custom') $('#custom-key').value = '';
  await loadStatus();
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

// ---------------- Wiring ----------------
B.onLine(({ kind, line }) => (kind === 'install' ? onInstallLine : onBuddyLine)(line));
$('#btn-start').onclick = startInstall;
$('#btn-retry').onclick = startInstall;
$('#btn-copy-log').onclick = copyLog;
$('#task-copy-log').onclick = copyLog;
$('#btn-open-codex').onclick = openCodex;
$('#btn-open-codex-2').onclick = openCodex;
$('#btn-to-manage').onclick = async () => { await loadStatus(); show('manage'); };
$('#task-close').onclick = () => { $('#task-modal').hidden = true; };
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.panel').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
});
$$('[data-switch]').forEach(b => b.onclick = () => switchTo(b.dataset.switch));
$$('[data-url]').forEach(a => a.onclick = e => { e.preventDefault(); B.openUrl(a.dataset.url); });
$$('#edition-seg button').forEach(b => b.onclick = async () => {
  if (b.classList.contains('active')) return;
  const r = await runTask(b.dataset.edition === 'zh' ? '切换到汉化版' : '切换到英文原版', 'edition', { edition: b.dataset.edition });
  if (r) await loadStatus();
});
const saveSetting = async (args, label) => {
  const r = await B.buddy('settings', args);
  toast(r.ok ? `✓ 已保存：${label}${r.running ? '（Codex 重新打开后生效）' : ''}` : '没保存成功');
  await loadStatus();
};
$$('#set-ask button').forEach(b => b.onclick = () => saveSetting({ askBeforeEdit: b.dataset.value === 'true' }, `改文件前${b.textContent}`));
$$('#set-effort button').forEach(b => b.onclick = () => saveSetting({ effort: b.dataset.value }, `思考深度「${b.textContent}」`));
$('#btn-restore').onclick = async () => {
  const ok = await confirmBox('还原到安装前的样子？', 'Codex 的配置会放回安装前的样子，汉化版的快捷方式会去掉；如果 Codex 是这次才装的，也会一起卸载。你在 Codex 里的聊天记录不会删。');
  if (!ok) return;
  const r = await runTask('还原中', 'restore');
  if (r && r.ok) {
    $('#task-close').onclick = () => { $('#task-modal').hidden = true; $('#task-close').onclick = () => { $('#task-modal').hidden = true; }; show('welcome'); };
    await loadStatus();
  }
};

// Start: installed and configured → manage page; otherwise the welcome screen
(async () => {
  let s = null;
  try { s = await loadStatus(); } catch (e) { console.error(e); }
  show(s && s.installed && s.kind !== 'none' ? 'manage' : 'welcome');
})();
