// CodexBuddy UI: four install screens (welcome, scan, progress, done) and the manage page.
// The install is codex.ps1; its STEP lines drive the screens. Management actions run in the main process (electron/buddy.ts).
const B = window.Backend;
const $ = (sel: string): any => document.querySelector(sel);
const $$ = (sel: string): any[] => [...document.querySelectorAll(sel)];

// Recommended (sponsored) providers, shown above "其他厂商". v1 ships none, so the block stays hidden. Later the list
// comes from the server, one entry per provider:
//   { id: 'acme', name: '某某云', note: '一句话介绍', baseUrl: 'https://…/v1', models: ['model-a'], signupUrl: 'https://…', sponsored: true }
// Picking one fills the "其他厂商" form with its address and first model; the user still brings their own key.
const RECOMMENDED_PROVIDERS = [];

// Listed in the order they usually finish: Codex downloads in the background while the key and model are set up
const INSTALL_ROWS = [
  { id: 'check', title: '检测电脑' },
  { id: 'key', title: '获取免费 Key' },
  { id: 'config', title: '配置模型' },
  { id: 'install', title: '安装 Codex' },
  { id: 'test', title: '测试连通' },
];
const KIND_NAMES = { 'zhipu-free': '智谱免费', 'zhipu-paid': '智谱付费', openai: 'OpenAI 官方账号', custom: '其他厂商', none: '还没配置' };
const ICONS = '<svg class="ok" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><svg class="no" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const STEP_LINE = /^STEP:([a-z]+):(start|done|fail):(.*)$/;
// Switch dialog: which of the three stages (备份 → 测试连通 → 保存) each management step belongs to
const SWITCH_STAGE_OF_STEP = { backup: 0, write: 1, login: 1, test: 1, save: 2 };
const SWITCH_STAGE_LAST_STEP = { backup: 0, test: 1, save: 2 };

const state = {
  screen: null, started: 0, running: false, allDone: false, failed: false,
  model: '', edition: '', editionWarn: '', status: null, busy: false, afterTaskClose: null,
  finalSeconds: null as number | null,   // Frozen when STEP:all:done arrives
};

// Preview only: ?size=1090x570 renders the app frame at another window size (?theme=day|night is handled by theme.ts)
if (B.mock) {
  const size = /^(\d+)x(\d+)$/.exec(new URLSearchParams(location.search).get('size') || '');
  if (size) Object.assign(document.body.style, { width: `${size[1]}px`, height: `${size[2]}px` });
}

// ---------------- Theme (day / night) ----------------
// theme.ts sets <html data-theme="day|night"> by the clock, before the first paint. When it changes, every colour eases over .5s
// (html.theme-anim in app.css).
let themeAnimTimer = 0;
new MutationObserver(() => {
  const html = document.documentElement;
  html.classList.add('theme-anim');
  clearTimeout(themeAnimTimer);
  themeAnimTimer = window.setTimeout(() => html.classList.remove('theme-anim'), 600);
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ---------------- Screens ----------------
function show(name) {
  if (state.screen === 'scan' && name !== 'scan') B.hideLogin();
  if (name === 'welcome' && !state.running) resetWelcome();
  $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== name; });
  state.screen = name;
}

let toastTimer = 0;
function toast(text: string, ms = 2600) {
  const t = $('#toast');
  t.hidden = true; void t.offsetWidth;   // Restart the pop-in animation
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
}
function restartAnimation(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// ---------------- Timer (no stopwatch on screen: only the done screen shows the total) ----------------
function elapsed() { return state.started ? (performance.now() - state.started) / 1000 : 0; }
function startTimer() { state.started = performance.now(); }
function stopTimer() { return elapsed(); }
function resetWelcome() {
  state.started = 0;
  $('#btn-start').disabled = false; $('#btn-start-text').textContent = '开始';
}

// ---------------- Checklists ----------------
function rowHtml(id) {
  return `<li data-id="${id}"><span class="ico">${ICONS}</span><span class="txt"><b></b><small></small></span></li>`;
}
function setRow(list, id: string, st: string, text: string, title?: string) {
  let li = list.querySelector(`li[data-id="${id}"]`);
  if (!li) { list.insertAdjacentHTML('beforeend', rowHtml(id)); li = list.lastElementChild; li.querySelector('b').textContent = title || text; }
  li.classList.remove('running', 'done', 'fail');
  li.classList.add(st === 'start' ? 'running' : st);
  if (title) li.querySelector('b').textContent = title;
  li.querySelector('small').textContent = text || '';
}
function resetInstallRows() {
  const list = $('#checklist');
  list.innerHTML = INSTALL_ROWS.map(r => rowHtml(r.id)).join('');
  INSTALL_ROWS.forEach(r => { list.querySelector(`li[data-id="${r.id}"] b`).textContent = r.title; });
}

// ---------------- Install ----------------
async function startInstall() {
  if (state.running) return;
  Object.assign(state, { running: true, allDone: false, failed: false, model: '', edition: '', editionWarn: '', finalSeconds: null });
  resetInstallRows();
  $('#failure').hidden = true; $('#fixing').hidden = true; $('#login-wait').hidden = false;
  $('#login-wait-text').textContent = '正在检测电脑，马上打开智谱登录…';
  $('#progress-title').textContent = '正在自动安装，不用管它';
  $('.progress').classList.remove('failed');
  $('#btn-start').disabled = true; $('#btn-start-text').textContent = '已开始';
  startTimer();
  show('scan');
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
    if (st === 'start') { show('scan'); placeLogin(); }
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
  if (id === 'edition') { if (st === 'done') state.edition = text; if (st === 'fail') state.editionWarn = text; return; }
  // Stop the stopwatch right here, not when the done screen renders (a hidden window renders late)
  if (id === 'all') { if (st === 'done') { state.allDone = true; state.model = text; state.finalSeconds = stopTimer(); } return; }
  if (!INSTALL_ROWS.some(r => r.id === id)) return;
  setRow(list, id, st, text);
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
  // Next time the user opens Codex itself, not this app; the Chinese shortcut is named 「ChatGPT 汉化版」, which nobody would guess
  $('#done-model').textContent = state.edition === '汉化版' ? '以后从桌面或开始菜单的「ChatGPT 汉化版」打开 Codex' : '以后从开始菜单的「ChatGPT」打开 Codex';
  $('#done-warn').hidden = !state.editionWarn;
  $('#done-warn').textContent = state.editionWarn ? `${state.editionWarn}。可以在管理页里再切换一次。` : '';
  $('#done-seconds').textContent = String(seconds);
  show('done');
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
  $('#task-details').open = !stages; $('#task-details').classList.toggle('foldable', stages);
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
  const pills = $(group);
  pills.classList.add('saving');
  const r = await B.buddy('settings', args);
  pills.classList.remove('saving');
  toast(r.ok ? `✓ 已保存：${label}${r.running ? '（Codex 重新打开后生效）' : ''}` : '没保存成功');
  await loadStatus();
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
