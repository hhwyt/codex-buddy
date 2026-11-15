// Every IPC channel's handler, built from core + platform + vendors + the right-side browser + the bridge.
// Owner: integration. Electron-free so it runs under vitest against temp dirs and the fake Codex CLI; app.ts passes
// the real pieces in. Keys never leave this file except masked (keyTail) or inside auth.json / the encrypted state.
import * as path from 'node:path';
import { backup, restoreBackup } from '../core/backup';
import { CATALOG_FILE, modelsFor } from '../core/catalogs';
import { classifyFailure, reasonOf } from '../core/connectivity';
import { guardedRemove, guardedRemoveOwn } from '../core/guard';
import { PROVIDERS, isBuiltin } from '../core/providers';
import { hide, keyTail } from '../core/redact';
import { loadRemote, isHidden, type Fetcher } from '../core/remote';
import { describeRestore, planRestore, type OriginalState, type RestoreStep } from '../core/restore';
import { configFor, readActive, switchVendor, type SwitchResult } from '../core/switch';
import { joinLines, setTableValue, splitLines, tomlString } from '../core/toml';
import type { BuiltinVendorId, Cipher, FailureCode, ModelEntry, ProviderInfo, RemoteConfig, StepEvent } from '../core/types';
import { checkUpdate, shouldPrompt } from '../core/updater';
import { moveCard, restoreWallet } from '../core/wallet';
import type { Clone, Platform, ZhLauncher } from '../platform/types';
import type { BrowserDriver, Vendor } from '../vendors/types';
import type { CardView, ConnectionView, EventName, IpcEvents, Outcome, StepView, VendorKey, WalletView } from './ipc-contract';
import type { Handlers } from './ipc';

/** How long app:state waits for the community QR code before answering without it */
export const QR_WAIT_MS = 3000;

export interface CustomVendor { id: `custom-${string}`; name: string; baseUrl: string; model: string }

/** Everything CodexBuddy remembers (buddyDir/state.json). Secrets are encrypted (base64 of cipher output) */
export interface BuddyState {
  order: VendorKey[];
  active: VendorKey | null;
  mode: 'switch' | 'clone';
  keys: Record<string, { enc: string; tail: string }>;
  openaiAuth: string | null;
  models: Record<string, string>;
  zh: boolean;
  onboarded: boolean;
  startedAt: number | null;
  firstSuccess: boolean;
  original: (OriginalState & { backupDir: string }) | null;
  dismissed: { version: string; at: number } | null;
  custom: CustomVendor[];
  rateLimited: string[];
  lastRemote: RemoteConfig | null;
}

export const emptyState = (): BuddyState => ({
  order: [], active: null, mode: 'switch', keys: {}, openaiAuth: null, models: {}, zh: false, onboarded: false,
  startedAt: null, firstSuccess: false, original: null, dismissed: null, custom: [], rateLimited: [], lastRemote: null,
});

export interface ServiceDeps {
  /** M-12: the vendor's own balance (only vendors with a balance API); null when unknown */
  balance?(provider: ProviderInfo, key: string): Promise<{ granted: number; toppedUp: number } | null>;
  platform: Platform;
  clone: Clone;
  zh: ZhLauncher;
  /** Providers with CODEXBUDDY_ENDPOINTS applied, in card order */
  providers: ProviderInfo[];
  vendors: Record<BuiltinVendorId, Vendor>;
  browser: BrowserDriver & { close(): void };
  /** Local bridge for chat-only vendors (A8): registers the upstream and returns the base_url for config.toml */
  bridge: { baseUrlFor(vendor: string, upstream: string): string; isBridgeUrl(url: string): boolean };
  cipher: Cipher;
  fetchText: Fetcher;
  /** Fetches bytes (community QR code, inlined as a data: URL because of the page's CSP) */
  fetchBytes(url: string): Promise<{ type: string; data: Uint8Array }>;
  remoteUrls: string[];
  bundledRemote: RemoteConfig;
  version: string;
  os: 'mac' | 'win';
  now(): number;
  emit<E extends EventName>(event: E, payload: IpcEvents[E]): void;
  openExternal(url: string): Promise<void>;
  clearBrowserData(): Promise<void>;
  connections(): { app: ConnectionView[]; web: ConnectionView[] };
  /** PNG of a vendor logo for a clone's icon */
  logoPng(vendor: string): string;
  /** Windows update: run the downloaded installer and quit */
  runInstaller(file: string): Promise<void>;
}

export const SOURCE_URL = 'https://github.com/hhwyt/codex-buddy';
const ASK_AI = [
  '请帮我检查开源项目 CodexBuddy（https://github.com/hhwyt/codex-buddy）的源代码，回答三个问题：',
  '1. 它把我的 API Key 存在哪里，有没有加密，有没有发给除了模型厂商以外的任何地方',
  '2. 它会连哪些网址，代码里的白名单是什么',
  '3. 它删除东西时会不会删掉 ~/.codex 里的聊天记录',
].join('\n');

/** auth.json that holds only an API key CodexBuddy wrote (no ChatGPT login tokens): ours to take away on 一键还原 */
export const onlyOurKey = (text: string): boolean => {
  try { const o = JSON.parse(text); return !!o && typeof o === 'object' && Object.keys(o).every(k => k === 'OPENAI_API_KEY'); } catch { return false; }
};
/** codexbuddy-models.json in the shape buildCatalog writes */
export const isOurCatalog = (text: string): boolean => {
  try { return Array.isArray(JSON.parse(text)?.models); } catch { return false; }
};

// Codex ran but answered nothing usable: Codex itself is broken → 一键修复 (M-15). Network trouble is a plain failure
const FAIL_KIND: Partial<Record<FailureCode, string>> = {
  balance: 'no-balance', 'rate-limit': 'rate-limited', auth: 'key-failed', 'no-reply': 'codex-broken', 'bad-reply': 'codex-broken',
};

export function createServices(d: ServiceDeps) {
  const { platform, cipher } = d;
  const { fs, paths } = platform;
  const stateFile = path.join(paths.buddyDir, 'state.json');
  const logFile = path.join(paths.buddyDir, 'install.log');
  const roots = () => paths.protectedRoots();

  // ---------- state ----------
  const load = (): BuddyState => {
    try { return { ...emptyState(), ...JSON.parse(fs.readText(stateFile) ?? '{}') }; } catch { return emptyState(); }
  };
  let st = load();
  const save = () => fs.writeText(stateFile, `${JSON.stringify(st, null, 2)}\n`);
  const enc = (s: string) => Buffer.from(cipher.encrypt(s)).toString('base64');
  const dec = (s: string) => cipher.decrypt(new Uint8Array(Buffer.from(s, 'base64')));
  const keyOf = (v: string): string | null => (st.keys[v] ? dec(st.keys[v].enc) : null);
  const step = (flow: StepView['flow']) => (e: StepEvent) => d.emit('step', { flow, ...e });
  const log = (line: string) => fs.writeText(logFile, `${fs.readText(logFile) ?? ''}${new Date(d.now()).toISOString()} ${hide(line)}\n`);

  // ---------- remote config ----------
  let remote: RemoteConfig = st.lastRemote ?? d.bundledRemote;
  let remoteLoaded: Promise<RemoteConfig> | null = null;
  let online = false;
  const refreshRemote = (): Promise<RemoteConfig> => {
    remoteLoaded = loadRemote(d.remoteUrls, d.fetchText, st.lastRemote, d.bundledRemote).then(r => {
      remote = r.config;
      online = r.source === 'jsdelivr' || r.source === 'github';
      if (online) { st.lastRemote = r.config; save(); }
      return remote;
    });
    return remoteLoaded;
  };
  const getRemote = () => remoteLoaded ?? refreshRemote();
  let qrData: string | null = null;
  const communityQr = async (): Promise<string | null> => {
    const url = remote.community.qrUrl;
    if (!url) return null;
    if (qrData) return qrData;
    // A slow network must not hold up app:state: wait at most 3 s; a later answer is kept for the next call
    const fetched = d.fetchBytes(url)
      .then(({ type, data }) => { qrData = `data:${type};base64,${Buffer.from(data).toString('base64')}`; })
      .catch(() => { /* offline: the page shows its cached copy (H-02) */ });
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([fetched, new Promise(r => { timer = setTimeout(r, QR_WAIT_MS); })]);
    clearTimeout(timer);
    return qrData;
  };

  // ---------- vendors ----------
  const customOf = (v: string) => st.custom.find(c => c.id === v) ?? null;
  const providerOf = (v: VendorKey): ProviderInfo | null => {
    const p = d.providers.find(x => x.id === v);
    if (p) return p;
    const c = customOf(v);
    if (!c) return null;
    return {
      id: c.id as BuiltinVendorId, name: c.name, baseUrl: c.baseUrl, wireApi: 'chat', defaultModel: c.model,
      models: [{ slug: c.model, name: c.model, free: false, reasoning: [] }], loginUrl: '', keysUrl: '', rechargeUrl: null,
      hosts: [hostOf(c.baseUrl)],
    };
  };
  const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
  const modelsOf = (p: ProviderInfo): ModelEntry[] => (isBuiltin(p.id) ? modelsFor(p, remote) : p.models);
  const visible = () => [...d.providers.filter(p => !isHidden(p.id, remote)).map(p => p.id as VendorKey), ...st.custom.map(c => c.id)];
  const baseUrlOf = (p: ProviderInfo) => (p.wireApi === 'chat' ? d.bridge.baseUrlFor(p.id, p.baseUrl) : p.baseUrl);

  // ---------- Codex ----------
  const configPath = (home: string) => path.join(home, 'config.toml');
  const scratch = () => path.join(paths.home, `.codexbuddy-test-${d.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const cleanScratch = (dir: string) => { try { guardedRemove(fs, dir, roots()); } catch { /* left for the next start */ } };

  const captureOriginal = async () => {
    if (st.original) return;
    const backupDir = backup(fs, cipher, { codexHome: paths.codexHome, backupRoot: path.join(paths.buddyDir, 'original') }, 'original', new Date(d.now()));
    st.original = {
      takenAt: new Date(d.now()).toISOString(), backupDir,
      configExisted: fs.exists(configPath(paths.codexHome)), authExisted: fs.exists(path.join(paths.codexHome, 'auth.json')),
      catalogExisted: fs.exists(path.join(paths.codexHome, CATALOG_FILE)),
      codexInstalled: !!(await platform.findCodex()), zhLauncher: await d.zh.exists(),
    };
    save();
  };

  /** The user's own ChatGPT login in ~/.codex/auth.json, kept (encrypted) so switching back to OpenAI works (M-26) */
  const keepOpenaiLogin = () => {
    const auth = fs.readText(path.join(paths.codexHome, 'auth.json'));
    if (auth && /"tokens"\s*:\s*\{/.test(auth)) { st.openaiAuth = enc(auth); save(); }
  };

  /** OpenAI official: `codex login` in the system browser, in a scratch home (M-22) */
  const openaiLogin = async (emit: (e: StepEvent) => void, signal?: AbortSignal): Promise<string | null> => {
    if (st.openaiAuth) return dec(st.openaiAuth);
    emit({ id: 'login', state: 'start', text: '在浏览器里登录 OpenAI' });
    const dir = scratch();
    fs.mkdirp(dir);
    try {
      await platform.runCodex(['login'], { codexHome: dir, timeoutMs: 10 * 60_000, signal });
      if (signal?.aborted) { emit({ id: 'login', state: 'fail', text: '取消了' }); return null; }
      const auth = fs.readText(path.join(dir, 'auth.json'));
      if (!auth) { emit({ id: 'login', state: 'fail', text: '没有登录成功' }); return null; }
      st.openaiAuth = enc(auth);
      save();
      emit({ id: 'login', state: 'done', text: '已登录' });
      return auth;
    } finally { cleanScratch(dir); }
  };

  /** Gets a key: saved one, else the key ladder in the right-side browser (M-08, M-10). null + outcome on failure */
  const obtainKey = async (v: VendorKey, emit: (e: StepEvent) => void, force = false): Promise<{ ok: true; key: string } | Outcome> => {
    if (!force) { const k = keyOf(v); if (k) return { ok: true, key: k }; }
    const vendor = isBuiltin(v) ? d.vendors[v] : null;
    if (!vendor) return { ok: false, kind: 'paste-key', reason: '粘贴这一家的 Key' };
    emit({ id: 'login', state: 'start', text: '扫码登录' });
    // Level 2: the user creates the key on the official page; the card says so (it no longer says 扫码登录)
    const r = await vendor.obtainKey(d.browser, () => emit({ id: 'create', state: 'start', text: '在右边的官方页面点「创建」' }));
    if (!r.ok) {
      emit({ id: 'login', state: 'fail', text: r.reason === 'cancelled' ? '取消了' : '没拿到 Key' });
      if (r.reason === 'cancelled') return { ok: false, kind: 'cancelled', reason: '取消了' };
      if (r.reason === 'need-paste') return { ok: false, kind: 'paste-key', reason: '没能自动拿到 Key，粘贴一下' };
      return { ok: false, kind: 'key-failed', reason: r.detail ?? '没拿到 Key，再试一次' };
    }
    emit({ id: 'login', state: 'done', text: '已登录，拿到 Key' });
    setKey(v, r.key);
    // The official page now shows the whole key (DeepSeek, Kimi): do not leave it on screen in the small window
    d.browser.close();
    return { ok: true, key: r.key };
  };
  const setKey = (v: string, key: string) => { st.keys[v] = { enc: enc(key), tail: keyTail(key) ?? '' }; save(); };

  /** Writes this vendor into a Codex home (切换 or a clone) after the connectivity test */
  const applyVendor = async (v: VendorKey, codexHome: string, flow: StepView['flow'], signal?: AbortSignal): Promise<Outcome & { result?: SwitchResult }> => {
    const p = providerOf(v);
    if (!p) return { ok: false, reason: '没有这一家' };
    const emit = step(flow);
    let apiKey: string | null = null;
    let openaiAuth: string | null = null;
    if (p.officialAccount) {
      openaiAuth = await openaiLogin(emit, signal);
      if (!openaiAuth) return { ok: false, kind: 'cancelled', reason: '没有登录 OpenAI' };
    } else {
      const k = await obtainKey(v, emit);
      if (!('key' in k) || typeof k.key !== 'string') return k;
      apiKey = k.key;
    }
    const models = modelsOf(p);
    const dir = scratch();
    try {
      const result = await switchVendor(
        { codexHome, backupRoot: path.join(paths.buddyDir, 'backups'), provider: p, baseUrl: baseUrlOf(p), model: st.models[v] ?? p.defaultModel, models, apiKey, openaiAuth },
        { fs, cipher, runCodex: platform.runCodex, now: () => new Date(d.now()), scratchDir: () => dir, emit },
      );
      log(`switch ${v}: ${result.ok ? 'ok' : `${result.code} ${result.reason}`}`);
      if (!result.ok) {
        const kind = result.code ? FAIL_KIND[result.code] : undefined;
        if (result.code === 'rate-limit' && !st.rateLimited.includes(v)) { st.rateLimited.push(v); save(); }
        // A key the vendor refuses is not kept: the next try gets a new one instead of failing the same way
        if (result.code === 'auth' && st.keys[v]) { delete st.keys[v]; save(); }
        return { ok: false, reason: result.reason, ...(kind ? { kind } : {}), result };
      }
      st.rateLimited = st.rateLimited.filter(x => x !== v);
      if (result.model) st.models[v] = result.model;
      // Our own write is not the user picking a model in Codex (pollModel)
      if (codexHome === paths.codexHome) lastModel = readActive(fs.readText(configPath(codexHome))).model;
      save();
      return { ok: true, result };
    } finally { cleanScratch(dir); }
  };

  /** The switch in flight; switch:cancel aborts it (stops `codex login`, M-09) */
  let switchAbort: AbortController | null = null;
  const switchTo = async (v: VendorKey): Promise<Outcome & { seconds?: number; firstTime?: boolean; running?: boolean }> => {
    if (!(await platform.findCodex())) return { ok: false, kind: 'codex-missing', reason: '没找到 Codex' };
    await captureOriginal();
    keepOpenaiLogin();
    const abort = new AbortController();
    switchAbort = abort;
    let r: Awaited<ReturnType<typeof applyVendor>>;
    try { r = await applyVendor(v, paths.codexHome, 'switch', abort.signal); } finally { if (switchAbort === abort) switchAbort = null; }
    if (!r.ok) {
      const { result: _r, ...out } = r;
      if (out.kind === 'no-balance') await openRecharge(v); // M-13: the recharge page opens enlarged
      return out;
    }
    st.active = v;
    st.order = moveCard(walletOrder() as never[], v as never, 0) as VendorKey[];
    const firstTime = !st.firstSuccess;
    st.firstSuccess = true;
    save();
    const seconds = firstTime && st.startedAt ? Math.max(1, Math.round((d.now() - st.startedAt) / 1000)) : undefined;
    const running = await platform.isCodexRunning();
    d.emit('wallet', wallet());
    // M-12: only gift credit left (never topped up) → 先用着, the recharge page waits in the small window. Otherwise the
    // login / Key page this switch used is done with: close it, so it neither shows the previous vendor's page nor covers
    // the top card's 换 and 去充值 (site owner, 2026-11-13)
    const trial = await trialCredit(v);
    const rechargeUrl = providerOf(v)?.rechargeUrl;
    if (trial && rechargeUrl) await d.browser.open(rechargeUrl, { mode: 'pip' });
    else d.browser.close();
    return { ok: true, firstTime, ...(seconds ? { seconds } : {}), running, ...(trial ? { trial: true } : {}) };
  };

  // ---------- wallet ----------
  const walletOrder = () => restoreWallet({ order: st.order as never, active: st.active as never }, visible() as never).order as VendorKey[];
  let clones: string[] = [];
  const refreshClones = async () => { clones = (await d.clone.list()).map(c => c.slug); return clones; };
  const wallet = (): WalletView => {
    const order = walletOrder();
    const live = readActive(fs.readText(configPath(paths.codexHome)));
    const cards = order.map((v): CardView => {
      const p = providerOf(v)!;
      const models = modelsOf(p);
      const model = v === st.active && live.model ? live.model : st.active === v && p.officialAccount ? null : st.models[v] ?? null;
      // Not picked yet: the model a switch would start with (智谱 = its free model), so the tag does not change on switching
      const entry = models.find(m => m.slug === (model ?? p.defaultModel));
      return {
        vendor: v, name: p.name, model, free: !!entry?.free, paid: !p.officialAccount && models.some(m => !m.free),
        keyTail: st.keys[v]?.tail ?? null, cloneMade: clones.includes(v),
        note: st.rateLimited.includes(v) ? '被限速' : null,
      };
    });
    return { order, active: st.active && order.includes(st.active) ? st.active : null, cards, mode: st.mode };
  };

  /** M-28: Codex's own model menu changed config.toml → the card follows */
  let lastModel: string | null = readActive(fs.readText(configPath(paths.codexHome))).model;
  const vendorOf = (v: VendorKey) => (isBuiltin(v) ? d.vendors[v] : null);
  const openRecharge = async (v: VendorKey) => { const vendor = vendorOf(v); return !!vendor && vendor.openRecharge(d.browser); };
  const trialCredit = async (v: VendorKey): Promise<boolean> => {
    const p = providerOf(v);
    const key = keyOf(v);
    if (!p || !key || !d.balance) return false;
    const b = await d.balance(p, key).catch(() => null);
    return !!b && b.granted > 0 && b.toppedUp <= 0;
  };
  let checkingModel: Promise<void> | null = null;
  /** M-11: the user picked a paid model in Codex's menu → test it with the saved key; no balance → recharge page (M-13) */
  const checkPaidModel = (v: VendorKey, model: string) => {
    const p = providerOf(v);
    if (!p || p.officialAccount || modelsOf(p).find(m => m.slug === model)?.free !== false || checkingModel) return;
    checkingModel = applyVendor(v, paths.codexHome, 'switch').then(async r => {
      if (!r.ok && r.kind === 'no-balance') await openRecharge(v);
    }).finally(() => { checkingModel = null; });
  };
  const pollModel = () => {
    const now = readActive(fs.readText(configPath(paths.codexHome))).model;
    if (now === lastModel) return false;
    lastModel = now;
    if (st.active && now) {
      st.models[st.active] = now; save();
      checkPaidModel(st.active, now);
    }
    d.emit('wallet', wallet());
    return true;
  };

  /** The bridge listens on a new port every start: re-point every Codex home that uses it */
  const refreshBridgeUrls = async () => {
    const homes = [paths.codexHome, ...(await d.clone.list()).map(c => c.codexHome)];
    for (const home of homes) {
      const text = fs.readText(configPath(home));
      const { provider } = readActive(text);
      const p = provider ? providerOf(provider) : null;
      if (!p || p.wireApi !== 'chat') continue;
      const next = joinLines(setTableValue(splitLines(text), `model_providers.${p.id}`, 'base_url', `base_url = ${tomlString(baseUrlOf(p))}`));
      if (next !== text) fs.writeText(configPath(home), next);
    }
  };

  // ---------- restore ----------
  const restoreSteps = async (): Promise<RestoreStep[]> => planRestore({
    original: st.original, codexInstalledNow: !!(await platform.findCodex()), codexRunning: await platform.isCodexRunning(),
    zhLauncherNow: await d.zh.exists(), clones: await refreshClones(),
  });
  const cloneName = (slug: string) => providerOf(slug)?.name ?? slug;

  const runRestore = async (): Promise<Outcome> => {
    const steps = await restoreSteps();
    const emit = step('restore');
    for (const s of steps) {
      const text = describeRestore([s])[0];
      emit({ id: s.kind, state: 'start', text });
      try {
        switch (s.kind) {
          case 'close-codex':
            // M-21: never close Codex for the user
            emit({ id: s.kind, state: 'fail', text: '先退出 Codex 再还原' });
            return { ok: false, reason: '先退出 Codex 再还原' };
          case 'config': {
            const o = st.original!;
            restoreBackup(fs, cipher, { codexHome: paths.codexHome, backupRoot: '' }, o.backupDir);
            // A file Codex did not have before cannot be deleted (guard protects ~/.codex): strip our lines instead
            if (!o.configExisted) fs.writeText(configPath(paths.codexHome), joinLines(configFor(splitLines(fs.readText(configPath(paths.codexHome))), { provider: PROVIDERS.find(p => p.officialAccount)!, codexHome: '', backupRoot: '', baseUrl: '', model: '', models: [] }, null)));
            // Files CodexBuddy added itself go away again, but only while they still hold just what we wrote
            const roots = paths.protectedRoots();
            if (!o.authExisted) guardedRemoveOwn(fs, path.join(paths.codexHome, 'auth.json'), roots, onlyOurKey);
            if (o.catalogExisted === false) guardedRemoveOwn(fs, path.join(paths.codexHome, CATALOG_FILE), roots, isOurCatalog);
            break;
          }
          case 'remove-zh-launcher': await d.zh.remove(); break;
          case 'remove-clone': await d.clone.remove(s.vendor); break;
          case 'uninstall-codex': {
            const r = await platform.uninstallCodex();
            if (!r.ok) throw new Error(r.reason);
            break;
          }
          case 'clear-browser-logins': await d.clearBrowserData(); break;
        }
        emit({ id: s.kind, state: 'done', text });
      } catch (e) {
        const reason = (e as Error).message || '没还原完';
        emit({ id: s.kind, state: 'fail', text: reason });
        return { ok: false, reason };
      }
    }
    st = emptyState();
    clones = [];
    save();
    return { ok: true };
  };

  // ---------- handlers ----------
  const handlers: Handlers = {
    'app:state': async () => {
      await getRemote();
      const codex = await platform.findCodex();
      return {
        version: d.version, os: d.os, configured: st.onboarded, codexInstalled: !!codex,
        codexRunning: await platform.isCodexRunning(),
        zh: { on: st.zh, launcherExists: await d.zh.exists(), supported: await d.zh.supported().catch(() => false), hidden: remote.switches.hideZh },
        community: { qrUrl: await communityQr(), text: (st.lastRemote && remote.community.text) || '' },
      };
    },

    'install:run': async () => {
      await captureOriginal();
      if (!st.startedAt) { st.startedAt = d.now(); save(); }
      const emit = step('install');
      const r = await platform.installCodex(e => { log(`${e.id} ${e.state} ${e.text}`); emit(e); });
      log(`install ${r.ok ? 'ok' : r.reason}`);
      if (r.ok) { st.onboarded = true; save(); }
      return r;
    },
    'install:log': () => ({ text: hide(fs.readText(logFile) ?? '') }),

    'wallet:get': async () => { await getRemote(); await refreshClones(); return wallet(); },
    'wallet:reorder': ({ order }) => { st.order = order.filter(v => visible().includes(v)); save(); },
    'wallet:mode': ({ mode }) => { st.mode = mode; save(); },
    'switch:start': ({ vendor }) => switchTo(vendor),
    'switch:cancel': () => { switchAbort?.abort(); d.browser.close(); },
    'key:replace': async ({ vendor }) => {
      const k = await obtainKey(vendor, step('switch'), true);
      if (!('key' in k)) return k;
      return st.active === vendor ? switchTo(vendor) : { ok: true };
    },
    'key:paste': async ({ vendor, key }) => {
      if (!key.trim()) return { ok: false, reason: 'Key 是空的' };
      setKey(vendor, key.trim());
      return switchTo(vendor);
    },
    'recharge:open': async ({ vendor }) => {
      const v = isBuiltin(vendor) ? d.vendors[vendor] : null;
      return v && (await v.openRecharge(d.browser)) ? { ok: true } : { ok: false, reason: '这一家没有充值页' };
    },
    'custom:add': async ({ name, baseUrl, model, apiKey }) => {
      if (!name.trim() || !/^https?:\/\//.test(baseUrl) || !model.trim() || !apiKey.trim()) return { ok: false, reason: '名字、地址、模型和 Key 都要填' };
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `v${st.custom.length + 1}`;
      const id = `custom-${slug}` as const;
      st.custom = [...st.custom.filter(c => c.id !== id), { id, name: name.trim(), baseUrl: baseUrl.trim().replace(/\/+$/, ''), model: model.trim() }];
      setKey(id, apiKey.trim());
      const r = await switchTo(id);
      if (!r.ok) { st.custom = st.custom.filter(c => c.id !== id); delete st.keys[id]; save(); }
      return r;
    },
    'codex:open': async () => { await platform.openCodex({ zh: st.zh }); return { ok: true }; },
    // M-15: steps already in place are ticked without redoing them; then the vendor in use is written again
    'codex:repair': async () => {
      if (!st.active) return { ok: false, reason: '还没有选模型' };
      const emit = step('repair');
      emit({ id: 'check', state: 'start', text: '检查 Codex' });
      if (!(await platform.findCodex())) { emit({ id: 'check', state: 'fail', text: '没找到 Codex' }); return { ok: false, kind: 'codex-missing', reason: '没找到 Codex' }; }
      emit({ id: 'check', state: 'done', text: 'Codex 已装好，跳过' });
      const r = await applyVendor(st.active, paths.codexHome, 'repair');
      if (!r.ok) { const { result: _r, ...out } = r; return out; }
      emit({ id: 'config', state: 'done', text: '配置重写好了' });
      return { ok: true };
    },
    'codex:reinstall': async () => platform.installCodex(step('repair')),

    'clone:make': async ({ vendor }) => {
      const p = providerOf(vendor);
      if (!p) return { ok: false, reason: '没有这一家' };
      const emit = step('clone');
      emit({ id: 'copy', state: 'start', text: '正在复制' });
      const info = await d.clone.make({ slug: vendor, displayName: p.name, iconPng: d.logoPng(vendor), zh: st.zh });
      emit({ id: 'copy', state: 'done', text: '复制好了' });
      const r = await applyVendor(vendor, info.codexHome, 'clone');
      if (!r.ok) { const { result: _r, ...out } = r; return out; }
      await refreshClones();
      d.emit('wallet', wallet());
      return { ok: true };
    },
    'clone:open': async ({ vendor }) => { await d.clone.open(vendor); return { ok: true }; },
    'clone:remove': async ({ vendor }) => {
      await d.clone.remove(vendor);
      await refreshClones();
      d.emit('wallet', wallet());
      return { ok: true };
    },

    'zh:set': async ({ on }) => {
      const emit = step('zh');
      if (on) {
        emit({ id: 'check', state: 'start', text: '检查 Codex' });
        if (!(await d.zh.supported())) {
          emit({ id: 'check', state: 'fail', text: '这个版本的 Codex 暂时不能汉化，先用英文' });
          return { ok: false, reason: '这个版本的 Codex 暂时不能汉化，先用英文' };
        }
        emit({ id: 'check', state: 'done', text: '检查 Codex' });
        emit({ id: 'add', state: 'start', text: '加汉化版图标' });
        if (!(await d.zh.exists())) await d.zh.add();
        emit({ id: 'add', state: 'done', text: '加汉化版图标' });
      }
      await d.clone.setZh(on);
      st.zh = on;
      save();
      emit({ id: 'done', state: 'done', text: '好了' });
      return { ok: true, needsReopen: await platform.isCodexRunning() };
    },
    'zh:remove': async () => {
      if (st.zh) { await d.clone.setZh(false); st.zh = false; save(); }
      await d.zh.remove();
      return { ok: true };
    },

    'security:get': async () => {
      const activeFile = path.join(paths.codexHome, 'auth.json');
      const keys = Object.entries(st.keys).map(([vendor, k]) => ({
        vendor, name: providerOf(vendor)?.name ?? vendor, keyTail: k.tail, file: vendor === st.active ? activeFile : stateFile,
      }));
      return { keys, ...d.connections() };
    },
    'security:reveal': async ({ vendor }) => {
      await platform.revealInFolder(vendor === st.active ? path.join(paths.codexHome, 'auth.json') : stateFile);
    },
    'security:manage': async ({ vendor }) => { if (isBuiltin(vendor)) await d.vendors[vendor].openKeyManagement(d.browser); },
    'security:ask-ai': () => ({ text: ASK_AI }),
    'security:source': () => d.openExternal(SOURCE_URL),

    'update:check': async () => {
      const r = await refreshRemote();
      // Offline = neither jsDelivr nor GitHub answered (only the cached or bundled copy is left)
      return checkUpdate(d.version, online ? r : null);
    },
    'update:dismiss': ({ version }) => { st.dismissed = { version, at: d.now() }; save(); },
    'update:install': async () => {
      const latest = remote.latest;
      if (d.os === 'mac') {
        // Unsigned Mac build (m1-decisions): open the download page instead of updating in place (U-03)
        await d.browser.open(latest.macUrl, { mode: 'expanded' });
        return { ok: true, downloadPage: true };
      }
      const file = path.join(paths.buddyDir, 'downloads', `CodexBuddy-Setup-${latest.version}.exe`);
      if (fs.exists(file)) { await d.runInstaller(file); return { ok: true }; }
      const emit = step('update');
      emit({ id: 'download', state: 'start', text: '0%' });
      try {
        const { data } = await d.fetchBytes(latest.winUrl);
        fs.writeBytes(file, data);
      } catch {
        emit({ id: 'download', state: 'fail', text: '下载没成功' });
        return { ok: false, reason: '下载没成功，检查一下网络再试' };
      }
      emit({ id: 'download', state: 'done', text: '100%' });
      return { ok: true };
    },

    'restore:plan': async () => ({ lines: describeRestore((await restoreSteps()).map(s => (s.kind === 'remove-clone' ? { ...s, vendor: cloneName(s.vendor) } : s))) }),
    'restore:run': () => runRestore(),

    'help:explain': ({ text }) => explain(text),
    'shell:open-external': async ({ url }) => { if (/^https:\/\//.test(url)) await d.openExternal(url); },
  };

  /** Startup: the update prompt (U-01), bridge URLs, model polling */
  const startup = async () => {
    await refreshBridgeUrls();
    const r = await getRemote();
    const u = checkUpdate(d.version, r);
    if (u.kind === 'new' && shouldPrompt(u.version, st.dismissed, d.now())) d.emit('update', { version: u.version, notes: u.notes });
  };

  return { handlers, startup, pollModel, wallet, state: () => st, refreshBridgeUrls };
}

/** H-01: a pasted error → what it means, in plain Chinese */
export function explain(text: string): { title: string; body: string } {
  const t = text.trim();
  if (!t) return { title: '先粘贴报错', body: '把 Codex 里看到的报错整段复制过来' };
  if (/model.{0,30}not.{0,5}(available|exist|found)/i.test(t)) {
    return { title: '这个模型现在用不了', body: '在 Codex 左下角的模型菜单里换一个，或者回到 CodexBuddy 重新切换这一家' };
  }
  if (/wire_api|config\.toml|parse|invalid.{0,10}config/i.test(t)) {
    return { title: 'Codex 的配置有问题', body: '回到 CodexBuddy 的模型页，点一下正在用的那张卡重新切换，配置会重写' };
  }
  const code = classifyFailure(t, /timed out|超时/i.test(t) && !/429/.test(t));
  if (code === 'no-reply') return { title: '没认出这个报错', body: '把报错发到群里，我们帮你看' };
  return { title: reasonOf(code).split('：')[0], body: reasonOf(code) };
}
