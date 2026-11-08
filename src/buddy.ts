// Everything the app does to an installed Codex besides the first install (that is codex.ps1): status, model switch,
// edition, settings, restore, open, log.
// Progress goes out as STEP:<id>:<start|done|fail>:<text> lines, like codex.ps1's, so the page shows both the same way.
// Keys are never logged or sent to the page. Keys kept for a later switch back are encrypted with Electron's
// safeStorage (Windows DPAPI: only this Windows account can read them).
import { safeStorage } from 'electron';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type Emit = (line: string) => void;
export type Result = { ok: boolean; [key: string]: unknown };

const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const configPath = path.join(codexHome, 'config.toml');
const authPath = path.join(codexHome, 'auth.json');
const catalogPath = path.join(codexHome, 'humanslive-models.json');
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
export const humansLiveDir = path.join(localAppData, 'HumansLive');
export const buddyDir = path.join(humansLiveDir, 'codex-buddy');
const secretDir = path.join(buddyDir, 'secrets');
const backupDir = path.join(buddyDir, 'backups');
const originalDir = path.join(buddyDir, 'original');
const logDir = path.join(humansLiveDir, 'logs');
const zhipuBaseUrl = 'https://open.bigmodel.cn/api/v1';
const freeModels = ['glm-4.5-flash', 'glm-4.7-flash'];
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const logFile = path.join(logDir, `buddy-${stamp()}.log`);

// ---------------- Log ----------------
/** Anything that could carry a key goes through hide before it reaches a log line or the page */
export function hide(text: string): string {
  return text
    .replace(/[0-9a-f]{32}\.[A-Za-z0-9]{16}/g, '****')
    .replace(/(sk-|Bearer\s+|"OPENAI_API_KEY"\s*:\s*")[A-Za-z0-9._-]{6,}/g, '$1****')
    .replace(/("(access|refresh|id)_token"\s*:\s*")[^"]+/g, '$1****');
}
export function log(text: string) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${new Date().toTimeString().slice(0, 8)}  ${hide(text)}\n`);
  } catch { /* logging never breaks anything */ }
}
const step = (emit: Emit, id: string, state: 'start' | 'done' | 'fail', text: string) => {
  log(`STEP:${id}:${state}:${text}`);
  emit(`STEP:${id}:${state}:${hide(text)}`);
};

// ---------------- Files and secrets ----------------
const readText = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const readLines = (file: string) => (readText(file) ?? '').split(/\r?\n/).filter((_, i, all) => i < all.length - 1 || all[i] !== '');
function writeText(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
const joinLines = (lines: string[]) => lines.join('\n').replace(/\s+$/, '') + '\n';
const encrypt = (text: string) => safeStorage.encryptString(text);
const decrypt = (data: Buffer) => safeStorage.decryptString(data);

function saveSecret(name: string, text: string) {
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(path.join(secretDir, `${name}.bin`), encrypt(text));
}
function readSecret(name: string): string | null {
  const file = path.join(secretDir, `${name}.bin`);
  if (!fs.existsSync(file)) return null;
  try { return decrypt(fs.readFileSync(file)); } catch (e) { log(`secret ${name} unreadable: ${e}`); return null; }
}
const hasSecret = (name: string) => fs.existsSync(path.join(secretDir, `${name}.bin`));
const authKey = (auth: string | null) => /"OPENAI_API_KEY"\s*:\s*"([^"]+)"/.exec(auth ?? '')?.[1] ?? null;
const authJson = (key: string) => `{"OPENAI_API_KEY":"${key}"}\n`;

// ---------------- config.toml, line based like codex.ps1: only the keys we own change, everything else stays ----------------
const tableOf = (line: string) => /^\s*\[([^\]]+)\]/.exec(line)?.[1].trim() ?? null;
export function getValue(lines: string[], table: string, key: string): string | null {
  let current = '';
  for (const line of lines) {
    const t = tableOf(line);
    if (t !== null) { current = t; continue; }
    const m = new RegExp(`^\\s*${key}\\s*=\\s*"(.*)"`).exec(line);
    if (current === table && m) return m[1];
  }
  return null;
}
/** top: key → full line, or null to remove. tables: name → lines, or null to remove. New keys go first (TOML needs
 *  top-level keys before any table), new tables at the end */
export function setConfig(lines: string[], top: Record<string, string | null>, tables: Record<string, string[] | null>): string[] {
  const kept: string[] = [];
  let current = '', skip = false;
  for (const line of lines) {
    const t = tableOf(line);
    if (t !== null) { current = t; skip = t in tables; }
    if (skip) continue;
    const key = /^\s*([A-Za-z_]+)\s*=/.exec(line)?.[1];
    if (current === '' && key && key in top) continue;
    kept.push(line);
  }
  while (kept.length && kept[0] === '') kept.shift();
  const head = Object.keys(top).sort().map(k => top[k]).filter((l): l is string => !!l);
  const tail = Object.keys(tables).sort().flatMap(name => (tables[name] ? ['', `[${name}]`, ...tables[name]!] : []));
  return [...head, ...(head.length ? [''] : []), ...kept, ...tail];
}
export function setTableValue(lines: string[], table: string, key: string, line: string): string[] {
  const out: string[] = [];
  let current = '', done = false, seen = false;
  for (const l of lines) {
    const t = tableOf(l);
    if (t !== null) {
      if (current === table && !done) { out.push(line); done = true; }
      current = t; if (t === table) seen = true;
      out.push(l); continue;
    }
    if (current === table && new RegExp(`^\\s*${key}\\s*=`).test(l)) { if (!done) { out.push(line); done = true; } continue; }
    out.push(l);
  }
  if (current === table && !done) { out.push(line); done = true; }
  if (!seen) out.push('', `[${table}]`, line);
  return out;
}

// ---------------- Windows ----------------
/** Runs a PowerShell snippet hidden and returns its stdout. Only for what Node cannot do: app packages (Appx) */
function powershell(command: string, env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ${command}`], {
      windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('error', e => { log(`powershell failed: ${e}`); resolve({ code: -1, out }); });
    child.on('close', code => resolve({ code: code ?? -1, out }));
  });
}
type Codex = { version: string; location: string; fullName: string; family: string; running: number[] } | null;
/** The installed Codex package and the pids of the running Codex app (not its system sandbox service) */
async function getCodex(): Promise<Codex> {
  const { out } = await powershell(`$p = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if ($p) {
  $appDir = Join-Path $p.InstallLocation 'app\\'
  $running = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($appDir, [StringComparison]::OrdinalIgnoreCase) -and $_.Name -notlike 'codex-windows-sandbox-service*' } | ForEach-Object { $_.ProcessId })
  @{ version = "$($p.Version)"; location = $p.InstallLocation; fullName = $p.PackageFullName; family = $p.PackageFamilyName; running = $running } | ConvertTo-Json -Compress
}`);
  try { return out.trim() ? JSON.parse(out.trim()) : null; } catch { log(`codex info unreadable: ${out}`); return null; }
}
const codexCli = (codex: Codex) => (codex ? path.join(codex.location, 'app', 'resources', 'codex.exe') : null);
const launcherPath = () => { const l = path.join(humansLiveDir, 'codex-zh.ps1'); return fs.existsSync(l) ? l : null; };
function killTree(pid: number) {
  return new Promise<void>(resolve => spawn('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }).on('close', () => resolve()).on('error', () => resolve()));
}

// ---------------- Current choice ----------------
type Kind = 'zhipu-free' | 'zhipu-paid' | 'openai' | 'custom' | 'none';
function current() {
  const lines = readLines(configPath);
  const provider = getValue(lines, '', 'model_provider');
  const model = getValue(lines, '', 'model');
  const auth = readText(authPath);
  const kind: Kind = provider === 'zhipu' ? (freeModels.includes(model ?? '') ? 'zhipu-free' : 'zhipu-paid')
    : provider === 'custom' ? 'custom'
      : !provider && /"tokens"\s*:\s*\{/.test(auth ?? '') ? 'openai' : 'none';
  return { kind, model, provider, lines, auth };
}
/** The Zhipu key: the one saved here, or the one in auth.json while Zhipu is configured (saved on first sight, so
 *  switching away and back needs no new scan) */
function zhipuKey(): string | null {
  const saved = readSecret('zhipu');
  if (saved) return saved;
  const cur = current();
  const key = cur.provider === 'zhipu' ? authKey(cur.auth) : null;
  if (key) saveSecret('zhipu', key);
  return key;
}
function backup(reason: string): string {
  const dir = path.join(backupDir, `${stamp()}-${reason}`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(configPath)) fs.copyFileSync(configPath, path.join(dir, 'config.toml'));
  const auth = readText(authPath);
  if (auth !== null) fs.writeFileSync(path.join(dir, 'auth.json.bin'), encrypt(auth));
  log(`backup: ${dir}`);
  return dir;
}

// ---------------- Test: Codex itself answers once, with the new config in a scratch CODEX_HOME ----------------
function runCodex(cli: string, home: string, args: string[], timeoutMs: number): Promise<{ out: string; err: string; timedOut: boolean }> {
  return new Promise(resolve => {
    const child = spawn(cli, args, { cwd: home, env: { ...process.env, CODEX_HOME: home }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid!); }, timeoutMs);
    child.on('error', e => { err += String(e); });
    child.on('close', () => { clearTimeout(timer); resolve({ out, err, timedOut }); });
  });
}
async function testHome(cli: string, home: string): Promise<{ ok: boolean; reply?: string; reason?: string }> {
  const { out, err, timedOut } = await runCodex(cli, home, ['exec', '--ephemeral', '--skip-git-repo-check', '只回复两个字：好了'], 120_000);
  const reply = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop();
  log(`test reply: ${reply ?? ''}`);
  if (reply && !timedOut) return { ok: true, reply };
  log(`test failed, stderr: ${err.split(/\r?\n/).filter(l => /error|status|40\d|429|余额|insufficient|refused|timed out|dns/i.test(l)).slice(-6).join(' | ')}`);
  const reason = timedOut ? '两分钟内没有回复，可能是网络连不上这个地址'
    : /1113|余额|insufficient|balance|欠费/i.test(err) ? '账户余额不足：先去充值，再来切换'
      : /401|403|Unauthorized|invalid.{0,20}(key|token)|身份验证|令牌/i.test(err) ? 'Key 不对，或者没有权限用这个模型'
        : /stream (disconnected|closed) before/i.test(err) ? '对方没有正常回复：多半是 Key 不对，或者地址、模型名不对'
          : /404|not.found|model.{0,30}(exist|available|support)/i.test(err) ? '地址或模型名不对'
            : /429|rate|overload|过载/i.test(err) ? '对方说现在太忙（限速），过一会儿再试'
              : /dns|resolve|connect|refused|timed out|tls|certificate/i.test(err) ? '连不上这个地址，检查一下网络或地址'
                : 'Codex 没有回复';
  return { ok: false, reason };
}
function scratchHome(configLines: string[], auth: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-buddy-test-'));
  writeText(path.join(dir, 'config.toml'), joinLines(configLines));
  if (auth) writeText(path.join(dir, 'auth.json'), auth);
  return dir;
}

// ---------------- Actions ----------------
async function status(): Promise<Result> {
  const codex = await getCodex();
  const cur = current();
  zhipuKey();   // Saves the key on first sight
  return {
    ok: true, installed: !!codex, version: codex?.version ?? null, edition: launcherPath() ? 'zh' : 'en',
    kind: cur.kind, model: cur.model, customBaseUrl: getValue(cur.lines, 'model_providers.custom', 'base_url'),
    hasZhipuKey: hasSecret('zhipu'), hasOpenaiLogin: hasSecret('openai-auth') || cur.kind === 'openai',
    askBeforeEdit: getValue(cur.lines, '', 'sandbox_mode') === 'read-only', effort: getValue(cur.lines, '', 'model_reasoning_effort') ?? 'medium',
    hasOriginal: fs.existsSync(path.join(originalDir, 'state.json')), running: (codex?.running.length ?? 0) > 0,
  };
}

/** Before the first install: remember what was there, once, so "restore" can put it back */
async function snapshot(): Promise<Result> {
  const statePath = path.join(originalDir, 'state.json');
  if (fs.existsSync(statePath)) return { ok: true, existed: true };
  fs.mkdirSync(originalDir, { recursive: true });
  if (fs.existsSync(configPath)) fs.copyFileSync(configPath, path.join(originalDir, 'config.toml'));
  const auth = readText(authPath);
  if (auth !== null) fs.writeFileSync(path.join(originalDir, 'auth.json.bin'), encrypt(auth));
  const state = {
    takenAt: new Date().toISOString(), configExisted: fs.existsSync(configPath), authExisted: auth !== null,
    catalogExisted: fs.existsSync(catalogPath), codexInstalled: !!(await getCodex()), zhLauncher: !!launcherPath(),
  };
  writeText(statePath, JSON.stringify(state, null, 2));
  log(`snapshot: ${JSON.stringify(state)}`);
  return { ok: true, existed: false };
}

type SwitchArgs = { kind?: string; model?: string; baseUrl?: string; apiKey?: string };
async function switchModel(a: SwitchArgs, emit: Emit): Promise<Result> {
  const kind = String(a.kind);
  const cur = current();
  // Remember what the config holds now, so switching back later needs no key and no login
  if (cur.kind === 'openai' && cur.auth) saveSecret('openai-auth', cur.auth);
  if (cur.kind.startsWith('zhipu')) zhipuKey();
  const codex = await getCodex();
  const cli = codexCli(codex);
  if (!cli || !fs.existsSync(cli)) { step(emit, 'write', 'fail', '没找到 Codex：先在首页完成一次安装'); return { ok: false, reason: '没找到 Codex' }; }

  step(emit, 'backup', 'start', '备份现在的配置');
  const backupPath = backup(kind);
  step(emit, 'backup', 'done', '已备份');

  step(emit, 'write', 'start', '准备新配置');
  const catalogLine = fs.existsSync(catalogPath) ? `model_catalog_json = ${JSON.stringify(catalogPath)}` : null;
  const zhipuTable = ['name = "智谱 GLM"', `base_url = "${zhipuBaseUrl}"`, 'wire_api = "responses"', 'requires_openai_auth = true'];
  const zhipu = (m: string) => setConfig(cur.lines, { model_provider: 'model_provider = "zhipu"', model: `model = "${m}"`, model_catalog_json: catalogLine }, { 'model_providers.zhipu': zhipuTable });
  let candidates: string[] = [];
  let auth: string | null = null;
  let build: (m: string) => string[];
  let needLogin = false;
  const fail = (text: string, reason: string): Result => { step(emit, 'write', 'fail', text); return { ok: false, reason }; };
  if (kind === 'zhipu-free' || kind === 'zhipu-paid') {
    const key = zhipuKey();
    if (!key) return fail('还没有智谱 Key：先在首页完成一次安装', '还没有智谱 Key');
    auth = authJson(key);
    candidates = kind === 'zhipu-free' ? [...new Set([...(a.model ? [a.model] : []), ...freeModels])] : [a.model || 'glm-5'];
    build = zhipu;
  } else if (kind === 'openai') {
    auth = readSecret('openai-auth');
    needLogin = !auth;
    candidates = [''];
    // The Zhipu-only model menu would hide OpenAI's models, so drop it too
    build = () => setConfig(cur.lines, { model_provider: null, model: null, model_catalog_json: null }, {});
  } else if (kind === 'custom') {
    const baseUrl = String(a.baseUrl ?? '').trim().replace(/\/+$/, '');
    const model = String(a.model ?? '').trim();
    const key = String(a.apiKey ?? '').trim() || (cur.kind === 'custom' ? authKey(cur.auth) : null) || readSecret('custom') || '';
    if (!/^https?:\/\/[^\s"]+$/.test(baseUrl) || !model || /["\s]/.test(model) || !key || /["\s]/.test(key)) {
      return fail('地址、Key、模型名要填全（地址以 http:// 或 https:// 开头）', '信息没填全');
    }
    auth = authJson(key);
    candidates = [model];
    const table = ['name = "其他厂商"', `base_url = "${baseUrl}"`, 'wire_api = "responses"', 'requires_openai_auth = true'];
    build = m => setConfig(cur.lines, { model_provider: 'model_provider = "custom"', model: `model = "${m}"`, model_catalog_json: null }, { 'model_providers.custom': table });
  } else {
    return fail(`不认识的选项 ${kind}`, '不认识的选项');
  }
  step(emit, 'write', 'done', '新配置准备好了');

  let test: { ok: boolean; reply?: string; reason?: string } = { ok: false, reason: 'Codex 没有回复' };
  let chosen = '', newLines: string[] = [];
  for (const m of candidates) {
    newLines = build(m);
    const home = scratchHome(newLines, auth);
    try {
      if (needLogin) {
        step(emit, 'login', 'start', '在弹出的浏览器里登录你的 OpenAI（ChatGPT）账号');
        await runCodex(cli, home, ['login'], 600_000);
        auth = readText(path.join(home, 'auth.json'));
        if (!/"tokens"\s*:\s*\{/.test(auth ?? '')) {
          step(emit, 'login', 'fail', '没有登录成功（窗口关了，或者十分钟内没登录）');
          return { ok: false, reason: '没有登录 OpenAI 账号', backup: backupPath };
        }
        step(emit, 'login', 'done', '已登录 OpenAI 账号');
        needLogin = false;
      }
      step(emit, 'test', 'start', m ? `测试连通：让 ${m} 回一句话` : '测试连通：让 Codex 回一句话');
      test = await testHome(cli, home);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
    if (test.ok) { chosen = m; break; }
  }
  if (!test.ok) {
    step(emit, 'test', 'fail', test.reason!);
    return { ok: false, reason: test.reason, backup: backupPath };
  }
  step(emit, 'test', 'done', `通了，回复：${test.reply}`);

  step(emit, 'save', 'start', '保存');
  const running = ((await getCodex())?.running.length ?? 0) > 0;
  writeText(configPath, joinLines(newLines));
  writeText(authPath, auth!);
  if (kind === 'custom') saveSecret('custom', authKey(auth)!);
  if (kind === 'openai') saveSecret('openai-auth', auth!);
  step(emit, 'save', 'done', running ? '已保存，Codex 重新打开后生效' : '已保存');
  log(`switched to ${kind} ${chosen}`);
  return { ok: true, kind, model: chosen || null, reply: test.reply, running };
}

/** Edition = the Chinese launcher and shortcuts from codex.ps1 (CODEX_SETUP_ACTION=edition), plus Codex's own
 *  language setting */
export type RunCodexPs1 = (env: Record<string, string>, emit: Emit) => Promise<number>;
async function edition(a: { edition?: string }, emit: Emit, runCodexPs1: RunCodexPs1): Promise<Result> {
  const target = a.edition === 'en' ? 'en' : 'zh';
  step(emit, 'edition', 'start', target === 'zh' ? '切换到汉化版' : '切换到英文原版');
  const code = await runCodexPs1({ CODEX_SETUP_ACTION: 'edition', CODEX_SETUP_EDITION: target }, line => log(`codex.ps1: ${line}`));
  const ok = code === 0;
  if (ok) {
    backup('edition');
    writeText(configPath, joinLines(setTableValue(readLines(configPath), 'desktop', 'localeOverride', `localeOverride = "${target === 'zh' ? 'zh-CN' : 'en-US'}"`)));
  }
  const running = ((await getCodex())?.running.length ?? 0) > 0;
  if (ok) step(emit, 'edition', 'done', running ? '已切换，Codex 重新打开后生效' : '已切换');
  else step(emit, 'edition', 'fail', '没切换成功，复制日志发给我们');
  return { ok, edition: target, running };
}

async function settings(a: { askBeforeEdit?: boolean; effort?: string }): Promise<Result> {
  backup('settings');
  const top: Record<string, string | null> = {};
  if (typeof a.askBeforeEdit === 'boolean') {
    // Ask: read-only sandbox, so every file change needs a yes. Not asking: edits inside the project folder go ahead,
    // anything beyond it still asks
    top.sandbox_mode = a.askBeforeEdit ? 'sandbox_mode = "read-only"' : 'sandbox_mode = "workspace-write"';
    top.approval_policy = 'approval_policy = "on-request"';
  }
  if (a.effort && ['low', 'medium', 'high'].includes(a.effort)) top.model_reasoning_effort = `model_reasoning_effort = "${a.effort}"`;
  writeText(configPath, joinLines(setConfig(readLines(configPath), top, {})));
  log(`settings: ${Object.values(top).join('; ')}`);
  return { ok: true, running: ((await getCodex())?.running.length ?? 0) > 0 };
}

/** Put back what was there before the first install: config, key file, model menu, edition, and Codex itself if
 *  it was installed by us */
async function restore(emit: Emit, runCodexPs1: RunCodexPs1): Promise<Result> {
  const statePath = path.join(originalDir, 'state.json');
  if (!fs.existsSync(statePath)) { step(emit, 'files', 'fail', '没有找到安装前的记录'); return { ok: false, reason: '没有找到安装前的记录' }; }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  backup('before-restore');
  let codex = await getCodex();
  if (codex?.running.length) {
    step(emit, 'close', 'start', '先关掉正在运行的 Codex');
    for (const pid of codex.running) await killTree(pid);
    step(emit, 'close', 'done', '已关掉 Codex');
  }
  step(emit, 'files', 'start', '还原 Codex 的配置');
  if (state.configExisted) fs.copyFileSync(path.join(originalDir, 'config.toml'), configPath); else fs.rmSync(configPath, { force: true });
  const savedAuth = path.join(originalDir, 'auth.json.bin');
  if (state.authExisted && fs.existsSync(savedAuth)) writeText(authPath, decrypt(fs.readFileSync(savedAuth))); else fs.rmSync(authPath, { force: true });
  if (!state.catalogExisted) fs.rmSync(catalogPath, { force: true });
  fs.rmSync(secretDir, { recursive: true, force: true });
  step(emit, 'files', 'done', '配置已还原');
  if (!state.zhLauncher && launcherPath()) {
    step(emit, 'edition', 'start', '去掉汉化版的快捷方式');
    const code = await runCodexPs1({ CODEX_SETUP_ACTION: 'edition', CODEX_SETUP_EDITION: 'en' }, line => log(`codex.ps1: ${line}`));
    step(emit, 'edition', code === 0 ? 'done' : 'fail', code === 0 ? '已去掉' : '没去掉，可以手动删掉桌面上的「ChatGPT 汉化版」');
  }
  let uninstalled = true;
  codex = await getCodex();
  if (!state.codexInstalled && codex) {
    step(emit, 'uninstall', 'start', '卸载 Codex（安装前这台电脑没有它）');
    const { code, out } = await powershell(`try { Remove-AppxPackage -Package $env:CODEX_PACKAGE -ErrorAction Stop; 'OK' } catch { 'ERROR:' + $_.Exception.Message }`, { CODEX_PACKAGE: codex.fullName });
    log(`uninstall: ${code} ${out.trim()}`);
    uninstalled = out.trim() === 'OK';
    step(emit, 'uninstall', uninstalled ? 'done' : 'fail', uninstalled ? '已卸载 Codex' : '没能自动卸载：打开「设置 → 应用」，找到「ChatGPT」点卸载');
  }
  fs.rmSync(originalDir, { recursive: true, force: true });
  return { ok: true, uninstalled };
}

async function open(): Promise<Result> {
  const codex = await getCodex();
  if (!codex) return { ok: false, reason: '还没装 Codex' };
  const launcher = launcherPath();
  if (launcher) {
    // The same way the "ChatGPT 汉化版" shortcut starts it: through a headless console, so no window flashes
    spawn('conhost.exe', ['--headless', 'powershell.exe', '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', launcher], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } else {
    spawn('explorer.exe', [`shell:AppsFolder\\${codex.family}!App`], { detached: true, stdio: 'ignore' }).unref();
  }
  return { ok: true };
}

/** The newest install log and app log, for "copy log". Logs never hold keys; hide runs again anyway */
function readLog(): Result {
  const files = fs.existsSync(logDir) ? fs.readdirSync(logDir) : [];
  const newest = (prefix: string) => files.filter(f => f.startsWith(prefix)).sort().pop();
  let text = `Codex 搭子 日志  Windows ${os.release()}  ${new Date().toISOString()}\n`;
  for (const name of [newest('codex-'), newest('buddy-')]) {
    if (name) text += `===== ${name} =====\n${fs.readFileSync(path.join(logDir, name), 'utf8')}\n`;
  }
  return { ok: true, text: hide(text.slice(-200_000)) };
}

export async function runAction(action: string, args: Record<string, unknown>, emit: Emit, runCodexPs1: RunCodexPs1): Promise<Result> {
  log(`action: ${action}`);
  try {
    switch (action) {
      case 'status': return await status();
      case 'snapshot': return await snapshot();
      case 'switch': return await switchModel(args as SwitchArgs, emit);
      case 'edition': return await edition(args as { edition?: string }, emit, runCodexPs1);
      case 'settings': return await settings(args as { askBeforeEdit?: boolean; effort?: string });
      case 'restore': return await restore(emit, runCodexPs1);
      case 'open': return await open();
      case 'log': return readLog();
      default: return { ok: false, reason: `unknown action ${action}` };
    }
  } catch (e) {
    log(`EXCEPTION ${(e as Error).stack ?? e}`);
    return { ok: false, reason: `出了意外：${hide(String((e as Error).message ?? e))}` };
  }
}
