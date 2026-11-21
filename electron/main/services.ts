// Every IPC channel's handler, built from core + platform + vendors + the right-side browser + the bridge.
// Owner: integration. Electron-free so it runs under vitest against temp dirs and the fake Codex CLI; app.ts passes
// the real pieces in. Keys never leave this file except masked (keyTail) or inside auth.json / the encrypted state.
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { backup, restoreBackup } from '../core/backup';
import { CATALOG_FILE, modelsFor } from '../core/catalogs';
import { guardedRemove, guardedRemoveOwn } from '../core/guard';
import { buildFromDelta, downloadResumable, parseBlockmap, planDelta } from '../core/delta';
import { PROVIDERS, isBuiltin } from '../core/providers';
import { hide, keyTail } from '../core/redact';
import { loadRemote, isHidden, type Fetcher } from '../core/remote';
import { describeRestore, planRestore, type OriginalState, type RestoreStep } from '../core/restore';
import { configFor, readActive, switchVendor, type SwitchResult } from '../core/switch';
import { joinLines, setTableValue, splitLines, tomlString } from '../core/toml';
import type { BuiltinVendorId, Cipher, FailureCode, ModelEntry, ProviderInfo, RemoteConfig, StepEvent } from '../core/types';
import { checkUpdate, raiseFloor, requiredUpgrade, shouldPrompt } from '../core/updater';
import { moveCard, restoreWallet } from '../core/wallet';
import type { Clone, Platform, ZhLauncher } from '../platform/types';
import type { BrowserDriver, Vendor } from '../vendors/types';
import { onRepoPage, REPO_URL, starInBrowser, verifyAnswer } from './star-verify';
import type { CardView, ConnectionView, EventName, IpcEvents, Outcome, StepView, UpgradeRequiredView, VendorKey, WalletView } from './ipc-contract';
import type { Handlers } from './ipc';

/** How long app:state waits for the community QR code before answering without it */
export const QR_WAIT_MS = 3000;
/** app:state and wallet:get wait this long for the remote config, then answer from the cached (or bundled) copy; the page
 *  gets a 'wallet' event when the fetched one changes the cards. Blocked jsDelivr + GitHub took 2 × 8 s, and the model
 *  page sat blank all that time */
export const REMOTE_GRACE_MS = 500;
export const VERSION_CHECK_INTERVAL_MS = 60_000;

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
  /** Highest remote minVersion ever accepted (encrypted): never lowered, kept through 一键还原, enforced offline */
  minVersionFloor: string | null;
  restartRequired: boolean;
}

export const emptyState = (): BuddyState => ({
  order: [], active: null, mode: 'switch', keys: {}, openaiAuth: null, models: {}, zh: false, onboarded: false,
  startedAt: null, firstSuccess: false, original: null, dismissed: null, custom: [], rateLimited: [], lastRemote: null,
  minVersionFloor: null, restartRequired: false,
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
  browser: BrowserDriver & { close(): void; reload?(): void };
  /** Local bridge for chat-only vendors (A8): registers the upstream and returns the base_url for config.toml. It runs as
   *  a service of its own (main/bridge-daemon.ts); remove() takes it and its login item away on 一键还原 (D-05) */
  bridge: { baseUrlFor(vendor: string, upstream: string): string; isBridgeUrl(url: string): boolean; remove?(): Promise<void> };
  cipher: Cipher;
  fetchText: Fetcher;
  /** Fetches bytes (community QR code, inlined as a data: URL because of the page's CSP) */
  fetchBytes(url: string, onProgress?: (received: number, total: number) => void): Promise<{ type: string; data: Uint8Array }>;
  /** Inclusive byte range of a release asset; total from Content-Range (F-06, F-07) */
  fetchRange(url: string, start: number, end: number): Promise<{ data: Uint8Array; total: number }>;
  remoteUrls: string[];
  bundledRemote: RemoteConfig;
  /** Ed25519 public key (PEM) a fetched remote config must be signed with (core/remote-key.ts) */
  remotePublicKey: string;
  version: string;
  os: 'mac' | 'win';
  now(): number;
  emit<E extends EventName>(event: E, payload: IpcEvents[E]): void;
  openExternal(url: string): Promise<void>;
  clearBrowserData(): Promise<void>;
  connections(): { app: ConnectionView[]; web: ConnectionView[] };
  /** PNG of a vendor logo for a clone's icon */
  logoPng(vendor: string): string;
  /** Windows: run the downloaded installer and quit. Mac (forced upgrade): open the downloaded dmg */
  runInstaller(file: string): Promise<void>;
  /** A-05: star with the user's signed-in gh; null when gh is missing or signed out (sandboxes: always null) */
  ghStar?(): Promise<'starred' | 'already' | null>;
  /** Sandbox runs only (CODEXBUDDY_STAR_VERIFY=1, stripped from release builds): the check on without the signed switch */
  forceStarVerify?: boolean;
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

/** An upgrade step that failed, with the sentence the upgrade dialog shows */
class UpgradeFailure extends Error {}

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
  let versionStatus: 'checking' | 'offline' | 'allowed' = 'checking';
  let lastVersionCheck = 0;
  let remoteRefresh: Promise<RemoteConfig> | null = null;
  // E-04: a failed forced upgrade can be skipped for this run only (memory, gone on restart)
  let upgradeFailed = false;
  let upgradeSkipped = false;
  // Forced upgrade: the floor rises with every signed config we accept and never drops (a later, lower minVersion or
  // being offline cannot lower it). Only a fresh signed response permits use
  const savedFloor = (): string | null => { try { return st.minVersionFloor ? dec(st.minVersionFloor) : null; } catch { return null; } };
  const floor = () => raiseFloor(savedFloor(), st.lastRemote?.minVersion);
  const upgradeRequired = (): UpgradeRequiredView | null => {
    if (upgradeSkipped) return null;
    const r = requiredUpgrade(d.version, floor(), remote.latest);
    return r && { version: r.version, notes: r.notes, url: d.os === 'mac' ? r.macUrl : r.winUrl };
  };
  let lastUpgradeSent = 'null';
  const refreshRemote = (): Promise<RemoteConfig> => {
    if (remoteRefresh) return remoteRefresh;
    remoteLoaded = loadRemote(d.remoteUrls, d.fetchText, st.lastRemote, d.bundledRemote, d.remotePublicKey).then(r => {
      const cardsBefore = JSON.stringify([remote.models, remote.switches]);
      remote = r.config;
      online = r.source !== 'cache' && r.source !== 'bundled';
      // N-04: once a fresh signed config has allowed this version, losing the network later does not lock the app
      if (online || versionStatus !== 'allowed') versionStatus = online ? 'allowed' : 'offline';
      lastVersionCheck = d.now();
      if (online) {
        const next = raiseFloor(floor(), r.config.minVersion);
        st.lastRemote = r.config;
        st.minVersionFloor = next ? enc(next) : null;
        save();
      }
      const u = upgradeRequired();
      if (versionStatus !== 'allowed' || u) { switchAbort?.abort(); d.browser.close(); }
      if (JSON.stringify(u) !== lastUpgradeSent) { lastUpgradeSent = JSON.stringify(u); d.emit('upgradeRequired', u); }
      d.emit('versionStatus', versionStatus);
      // the page may already show cards from the cached copy (REMOTE_GRACE_MS): redraw them when models or switches moved
      if (JSON.stringify([remote.models, remote.switches]) !== cardsBefore) d.emit('wallet', wallet());
      return remote;
    }).finally(() => { remoteRefresh = null; });
    remoteRefresh = remoteLoaded;
    return remoteRefresh;
  };
  const getRemote = () => remoteLoaded ?? refreshRemote();
  /** The remote config if it comes within REMOTE_GRACE_MS, else go on with the copy we have (the fetch keeps going) */
  const remoteSoon = async () => {
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([getRemote(), new Promise(r => { timer = setTimeout(r, REMOTE_GRACE_MS); })]);
    clearTimeout(timer);
  };
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
    if (signal?.aborted) return { ok: false, kind: 'cancelled', reason: '取消了，配置没有更改' };
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
      log(`switch ${v} stopped: ${out.kind ?? ''} ${out.reason ?? ''}`);
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

  /** Re-point every Codex home that uses the bridge at the bridge service's port (it changes only when the port was
   *  taken, D-02; configs written by versions before the service still name an old random port). Only CodexBuddy's own
   *  clone homes are touched, never a ~/.codex-<name> someone else made (K-02) */
  const refreshBridgeUrls = async () => {
    const homes = [paths.codexHome, ...(await d.clone.list()).filter(c => c.ownsHome !== false).map(c => c.codexHome)];
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
    // The forced-upgrade floor (no rollback) and the cached remote config are not the user's setup: they stay
    st = { ...emptyState(), lastRemote: st.lastRemote, minVersionFloor: st.minVersionFloor };
    clones = [];
    save();
    // Nothing uses the bridge any more: no login item, no background service (D-05)
    await d.bridge.remove?.().catch(() => undefined);
    return { ok: true };
  };

  const installerPath = (version: string) => path.join(paths.buddyDir, 'downloads', `CodexBuddy-${version}.${d.os === 'mac' ? 'dmg' : 'exe'}`);
  const prepareInstaller = async (version: string, url: string, emit: (event: StepEvent) => void): Promise<string> => {
    const expected = d.os === 'mac' ? remote.latest.macSha256 : remote.latest.winSha256;
    const suffix = d.os === 'mac' ? '.dmg' : '.exe';
    const release = new URL(url);
    if (!expected || !/^[a-f0-9]{64}$/.test(expected) || release.protocol !== 'https:' || release.hostname !== 'github.com'
      || !release.pathname.startsWith(`/hhwyt/codex-buddy-releases/releases/download/v${version}/`) || !release.pathname.endsWith(suffix)) throw new UpgradeFailure('更新包的信息不对，请稍后再试。');
    const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
    const file = installerPath(version);
    const cached = fs.readBytes(file);
    if (cached && digest(cached) === expected) return file;
    if (cached) guardedRemove(fs, file, roots());
    emit({ id: 'download', state: 'start', text: '0%' });
    let previous = -1;
    const progress = (received: number, total: number) => {
      const percent = total > 0 ? Math.min(100, Math.floor(received / total * 100)) : 0;
      if (percent === previous) return;
      previous = percent;
      const mb = (n: number) => (n / 1048576).toFixed(1);
      emit({ id: 'download', state: 'start', text: `${percent}% · ${mb(received)}${total > 0 ? ' / ' + mb(total) : ''} MB` });
    };
    const range = (start: number, end: number) => d.fetchRange(url, start, end);
    const base = installerPath(d.version);
    const done = (data: Uint8Array) => {
      fs.mkdirp(path.dirname(file));
      fs.writeBytes(file, data);
      emit({ id: 'download', state: 'done', text: '100%' });
      // Keep only this installer and the running version's own (the base of the next delta)
      const dir = path.dirname(file);
      for (const name of fs.list(dir)) {
        const other = path.join(dir, name);
        if (/^CodexBuddy-.*\.(exe|dmg|part)$/.test(name) && other !== file && other !== base) guardedRemove(fs, other, roots());
      }
      return file;
    };
    // F-06: rebuild from the running version's installer plus the changed blocks only
    const old = d.version !== version ? fs.readBytes(base) : null;
    if (old) {
      try {
        const asset = d.os === 'mac' ? `CodexBuddy-${d.version}.dmg` : `CodexBuddy-Setup-${d.version}.exe`;
        const oldMap = `https://github.com/hhwyt/codex-buddy-releases/releases/download/v${d.version}/${asset}.blockmap`;
        const [a, b] = await Promise.all([d.fetchBytes(oldMap, () => undefined), d.fetchBytes(`${url}.blockmap`, () => undefined)]);
        const data = await buildFromDelta(old, planDelta(parseBlockmap(a.data), parseBlockmap(b.data)), range, progress);
        if (digest(data) === expected) { log(`upgrade delta ${version}: ok`); return done(data); }
        log(`upgrade delta ${version}: checksum mismatch`);
      } catch (error) { log(`upgrade delta ${version} failed: ${error instanceof Error ? error.message : String(error)}`); }
      previous = -1;
    }
    // F-07: whole installer in ranges, kept in .part so 重试 continues where it stopped
    const part = `${file}.part`;
    try {
      await downloadResumable({
        fetchRange: range, partPath: part, onProgress: progress,
        size: p => fs.readBytes(p)?.length ?? null,
        append: (p, data) => {
          if (fs.appendBytes) fs.appendBytes(p, data);
          else fs.writeBytes(p, new Uint8Array(Buffer.concat([fs.readBytes(p) ?? new Uint8Array(), data])));
        },
      });
    } catch {
      emit({ id: 'download', state: 'fail', text: '更新包下载或校验失败' });
      throw new UpgradeFailure('更新包没下载下来，请检查网络后重试。');
    }
    const data = fs.readBytes(part) ?? new Uint8Array();
    guardedRemove(fs, part, roots());
    if (digest(data) !== expected) {
      emit({ id: 'download', state: 'fail', text: '更新包下载或校验失败' });
      throw new UpgradeFailure('下载的更新包不完整，请再试一次。');
    }
    return done(data);
  };

  // ---------- handlers ----------
  let restarting: Promise<Outcome> | null = null;
  const handlers: Handlers = {
    'app:state': async () => {
      await remoteSoon();
      const codex = await platform.findCodex();
      const codexRunning = await platform.isCodexRunning();
      if (st.restartRequired && !codexRunning) { st.restartRequired = false; save(); d.emit('restartRequired', false); }
      return {
        version: d.version, os: d.os, configured: st.onboarded, codexInstalled: !!codex,
        codexRunning,
        restartRequired: st.restartRequired,
        zh: { on: st.zh, launcherExists: await d.zh.exists(), supported: await d.zh.supported().catch(() => false), hidden: remote.switches.hideZh },
        community: { qrUrl: await communityQr() },
        upgradeRequired: upgradeRequired(),
        versionStatus,
        // A-01: the install dialog with the check, when the signed config turns it on
        starVerify: remote.switches.starVerify === true || d.forceStarVerify === true,
      };
    },

    'install:run': async () => {
      await captureOriginal();
      if (!st.startedAt) { st.startedAt = d.now(); save(); }
      const emit = step('install');
      const r = await platform.installCodex(e => { log(`${e.id} ${e.state} ${e.text}`); emit(e); });
      log(`install ${r.ok ? 'ok' : r.reason}`);
      // Codex is opened by the models page once the top card is set up (站主 11-16: 装完自动打开、默认用国产模型)
      if (r.ok) { st.onboarded = true; save(); }
      return r;
    },
    'install:log': () => ({ text: hide(fs.readText(logFile) ?? '') }),

    'wallet:get': async () => { await remoteSoon(); await refreshClones(); return wallet(); },
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
    'codex:restart': () => {
      if (restarting) return restarting;
      restarting = (async () => {
        try {
          await platform.restartCodex({ zh: st.zh });
          st.restartRequired = false;
          save();
          d.emit('restartRequired', false);
          return { ok: true };
        } catch {
          return { ok: false, reason: '没能重启 ChatGPT。配置已保存，重启后生效。' };
        }
      })().finally(() => { restarting = null; });
      return restarting;
    },
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
      await refreshRemote();
      if (!online) return { ok: false, reason: '连不上网，稍后再试' };
      try {
        const file = installerPath(remote.latest.version);
        const hadInstaller = fs.exists(file);
        await prepareInstaller(remote.latest.version, d.os === 'mac' ? remote.latest.macUrl : remote.latest.winUrl, step('update'));
        if (hadInstaller) await d.runInstaller(file);
        return { ok: true };
      } catch { return { ok: false, reason: '更新包下载或校验失败，请重试' }; }
    },

    'upgrade:run': async () => {
      await refreshRemote();
      // The dialog shows the reason as is: one sentence for each way this can fail
      if (!online) { upgradeFailed = true; return { ok: false, reason: '连不上网，请检查网络后重试。' }; }
      const u = upgradeRequired();
      if (!u) return { ok: false, reason: '当前版本不用升级。' };
      let file: string;
      try { file = await prepareInstaller(u.version, u.url, step('upgrade')); } catch (error) {
        upgradeFailed = true;
        return { ok: false, reason: error instanceof UpgradeFailure ? error.message : '更新包没下载下来，请检查网络后重试。' };
      }
      try { await d.runInstaller(file); } catch { upgradeFailed = true; return { ok: false, reason: '安装程序没能打开，请再试一次。' }; }
      return { ok: true };
    },

    'upgrade:skip': async () => {
      if (!upgradeFailed) return { ok: false, reason: '先点立即升级' };
      upgradeSkipped = true;
      lastUpgradeSent = 'null';
      d.emit('upgradeRequired', null);
      return { ok: true };
    },

    'restore:plan': async () => ({ lines: describeRestore((await restoreSteps()).map(s => (s.kind === 'remove-clone' ? { ...s, vendor: cloneName(s.vendor) } : s))) }),
    'restore:run': async () => {
      const result = await runRestore();
      if (result.ok) d.emit('restartRequired', false);
      return result;
    },

    'shell:open-external': async ({ url }) => { if (/^https:\/\//.test(url)) await d.openExternal(url); },

    // A-02: Codex, with what ~/.codex now holds, answers the project's address once
    'verify:run': async () => {
      const p = st.active ? providerOf(st.active) : null;
      if (!p) return { ok: false, reason: '还没有选模型。' };
      const r = await verifyAnswer(platform.runCodex, paths.codexHome, p.name);
      log(`verify ${p.id}: ${r.ok ? 'ok' : r.reason}`);
      return r;
    },
    // A-03: the project's page on the right, expanded
    'verify:open-repo': async () => {
      await d.browser.open(REPO_URL, { mode: 'expanded' });
      return onRepoPage(d.browser.url()) ? { ok: true } : { ok: false, reason: '没打开，可能是网络问题' };
    },
    // A-04, A-05: only reached after the user ticked 「给 CodexBuddy 点个 Star」
    'star:run': async () => {
      const viaGh = await d.ghStar?.().catch(() => null);
      if (viaGh) {
        log(`star via gh: ${viaGh}`);
        if (onRepoPage(d.browser.url())) d.browser.reload?.();
        return { ok: true, already: viaGh === 'already' };
      }
      const r = await starInBrowser(d.browser);
      log(`star in browser: ${r.ok ? (r.already ? 'already' : 'starred') : r.reason}`);
      return r;
    },
  };

  // Compare only configuration the main desktop app reads; never prompt for wallet order or a clone's own files.
  const configuration = () => JSON.stringify([st.zh, ...['config.toml', 'auth.json', CATALOG_FILE].map(file => fs.readText(path.join(paths.codexHome, file)))]);
  const configChannels = ['switch:start', 'key:replace', 'key:paste', 'custom:add', 'codex:repair', 'zh:set', 'zh:remove'] as const;
  const tracked = handlers as Record<typeof configChannels[number], (args: never) => Outcome | Promise<Outcome>>;
  for (const channel of configChannels) {
    const handler = tracked[channel];
    tracked[channel] = async (args: never) => {
      const before = configuration();
      const result = await handler(args);
      if (!result.ok || before === configuration()) return result;
      const restartRequired = await platform.isCodexRunning();
      st.restartRequired = restartRequired;
      save();
      d.emit('restartRequired', restartRequired);
      return { ...result, restartRequired, openRequired: !restartRequired };
    };
  }

  const versionAllowed = async () => {
    if (!remoteLoaded || versionStatus === 'checking') await getRemote();
    else if (d.now() - lastVersionCheck >= VERSION_CHECK_INTERVAL_MS) await refreshRemote();
    return versionStatus === 'allowed' && !upgradeRequired();
  };

  // The renderer cannot bypass the version gate by invoking a mutation directly.
  const functionalChannels = ['install:run', 'wallet:reorder', 'wallet:mode', 'switch:start', 'key:replace', 'key:paste',
    'recharge:open', 'custom:add', 'codex:open', 'codex:restart', 'codex:repair', 'codex:reinstall', 'clone:make', 'clone:open', 'clone:remove',
    'zh:set', 'zh:remove', 'browser:show', 'browser:back', 'browser:reload', 'browser:place', 'security:reveal', 'security:manage', 'restore:run',
    'verify:run', 'verify:open-repo', 'star:run'] as const;
  const gated = handlers as Record<typeof functionalChannels[number], (args: never) => unknown>;
  for (const channel of functionalChannels) {
    const handler = gated[channel];
    if (!handler) continue;
    gated[channel] = async (args: never) => {
      if (!(await versionAllowed())) return { ok: false, kind: 'version-required', reason: versionStatus === 'offline' ? '连上网后才能使用' : '升级后继续使用' };
      return handler(args);
    };
  }

  /** Startup: validate before enabling configuration writes. */
  const startup = async () => {
    const r = await getRemote();
    if (versionStatus !== 'allowed' || upgradeRequired()) return;
    await refreshBridgeUrls();
    const u = checkUpdate(d.version, r);
    if (u.kind === 'new' && shouldPrompt(u.version, st.dismissed, d.now())) d.emit('update', { version: u.version, notes: u.notes });
  };

  return { handlers, startup, pollModel, wallet, state: () => st, refreshBridgeUrls, checkVersion: refreshRemote, versionAllowed };
}
