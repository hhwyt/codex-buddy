// L4 harness: launch the real Electron app sandboxed, with every external address pointed at fake servers.
// Owner: A7 (Base wrote the first version). Every e2e spec launches through here. Nothing here reads or writes the
// real ~/.codex, /Applications or Codex's data dirs; the only real paths touched are read-only hashes (realdirs.ts).
//
// E2E SEAMS the sandbox build must honour (listed in A7's openIssues for the integration agent):
//   1. Codex installed  = <sandbox>/Applications/ChatGPT.app exists (seedCodex() makes it). Its CLI is the fake Codex:
//      CODEXBUDDY_FAKE_CODEX=<abs path of test/fakes/fake-codex.mjs>, run with CODEXBUDDY_NODE (a node binary).
//      seedCodex() also drops an executable shim at the real CLI's relative path, for platforms that exec it directly.
//   2. Codex running    = the file <sandbox>/fake-codex-running exists (setCodexRunning()).
//   3. Install outcome  = CODEXBUDDY_FAKE_INSTALL: ok (default) | fail-once (fails at step "download" once, the retry
//      resumes there) | fail (always fails) | fix (meets a small problem and shows 正在帮你修 before succeeding).
//      The sandbox install "downloads" into <sandbox>/Applications/ChatGPT.app and keeps <buddyDir>/downloads (O-07).
//   4. 汉化 support      = CODEXBUDDY_FAKE_ZH=unsupported makes ZhLauncher.supported() false (L-06).
//   5. Fake Codex CLI outcome = the file <sandbox>/home/fake-codex-scenario (fake-codex.mjs reads $CODEX_HOME/..).
//   6. External links   = never leave the machine in sandbox mode; captureExternal() stubs shell.openExternal and
//      shell.showItemInFolder in the main process and records the calls.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as VendorFake from '../fakes/vendor-server.mjs';
import type * as ConfigFake from '../fakes/config-server.mjs';
import type { WalletView, AppStateView } from '../../electron/main/ipc-contract';

export const REPO = path.join(__dirname, '..', '..');
export const FAKES = path.join(REPO, 'test', 'fakes');
export const VENDOR_IDS = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] as const;
export type VendorId = (typeof VENDOR_IDS)[number];

// Playwright transpiles imported .mjs files to CommonJS, which breaks import.meta in the fakes; a native dynamic
// import (hidden from the transpiler) loads them as real ES modules.
const nativeImport = new Function('u', 'return import(u)') as <T>(u: string) => Promise<T>;
const loadFake = <T>(name: string) => nativeImport<T>(pathToFileURL(path.join(FAKES, name)).href);

export type VendorServer = Awaited<ReturnType<typeof VendorFake.startVendorServer>>;
export type ConfigServer = Awaited<ReturnType<typeof ConfigFake.startConfigServer>>;

export interface LaunchOptions {
  env?: Record<string, string>;
  /** Prepare the sandbox before the first start (seedCodex, seedUserData…) */
  seed?: (sandbox: string) => void;
  /** Reuse a sandbox from an earlier run (relaunch) */
  sandbox?: string;
  vendors?: VendorServer;
  config?: ConfigServer;
  /** Extra CODEXBUDDY_ENDPOINTS keys (e.g. codexDownload for the real installer against a fake dmg server) */
  endpoints?: Record<string, string>;
}

/** CODEXBUDDY_E2E_EXECUTABLE=<packaged app binary>: drive the packaged app instead of the repo build (m1 drive) */
const packaged = process.env.CODEXBUDDY_E2E_EXECUTABLE;

export interface Launched {
  app: ElectronApplication;
  page: Page;
  sandbox: string;
  home: string;
  vendors: VendorServer;
  config: ConfigServer;
  /** URLs the app asked the OS to open, and paths it asked to reveal */
  external: () => Promise<{ opened: string[]; revealed: string[] }>;
  /** Quit the app and start it again on the same sandbox and fake servers */
  relaunch(env?: Record<string, string>): Promise<Launched>;
  /** Quit the app only (sandbox and fakes stay) */
  quit(): Promise<void>;
  close(): Promise<void>;
}

const appEnv = (sandbox: string, vendors: VendorServer, config: ConfigServer, extra: Record<string, string>, endpoints: Record<string, string> = {}) => ({
  ...process.env,
  CODEXBUDDY_SANDBOX: sandbox,
  CODEXBUDDY_ENDPOINTS: JSON.stringify({
    remoteConfig: [config.jsdelivrUrl, config.githubUrl],
    vendors: Object.fromEntries(VENDOR_IDS.map(v => [v, vendors.vendorUrl(v)])),
    ...endpoints,
  }),
  // The fake config server signs with the test key; test mode trusts it instead of the release key
  CODEXBUDDY_REMOTE_KEY: config.publicKey,
  CODEXBUDDY_FAKE_CODEX: path.join(FAKES, 'fake-codex.mjs'),
  CODEXBUDDY_NODE: process.execPath,
  FAKE_CODEX_LOG: path.join(sandbox, 'fake-codex.log'),
  ...extra,
});

export async function captureExternal(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const g = globalThis as unknown as { __e2e: { opened: string[]; revealed: string[] } };
    g.__e2e = { opened: [], revealed: [] };
    const s = shell as unknown as Record<string, unknown>;
    s.openExternal = async (url: string) => { g.__e2e.opened.push(url); };
    s.showItemInFolder = (p: string) => { g.__e2e.revealed.push(p); };
    s.openPath = async (p: string) => { g.__e2e.revealed.push(p); return ''; };
  });
}

export async function launch(opts: LaunchOptions = {}): Promise<Launched> {
  const sandbox = opts.sandbox ?? fs.mkdtempSync(path.join(os.tmpdir(), 'codexbuddy-e2e-'));
  if (!opts.sandbox) opts.seed?.(sandbox);
  const vendors = opts.vendors ?? await (await loadFake<typeof VendorFake>('vendor-server.mjs')).startVendorServer();
  const config = opts.config ?? await (await loadFake<typeof ConfigFake>('config-server.mjs')).startConfigServer();
  const env = appEnv(sandbox, vendors, config, opts.env ?? {}, opts.endpoints);
  const app = await electron.launch(packaged ? { executablePath: packaged, args: [], env } : { args: [REPO], env });
  const page = await app.firstWindow();
  await captureExternal(app);
  await page.waitForLoadState('domcontentloaded');
  const quit = async () => { await app.close().catch(() => undefined); };
  const run: Launched = {
    app, page, sandbox, vendors, config, home: path.join(sandbox, 'home'),
    async external() {
      const seen = await app.evaluate(() => (globalThis as unknown as { __e2e: { opened: string[]; revealed: string[] } }).__e2e);
      // The sandboxed app never opens anything; it records each open / reveal / external link in <sandbox>/opened.log
      for (const line of (readText(path.join(sandbox, 'opened.log')) ?? '').split('\n').filter(Boolean)) {
        const { kind, target } = JSON.parse(line) as { kind: string; target: string };
        (kind === 'external' ? seen.opened : seen.revealed).push(target);
      }
      return seen;
    },
    async relaunch(env) {
      await quit();
      return launch({ ...opts, sandbox, vendors, config, env: { ...(opts.env ?? {}), ...(env ?? {}) } });
    },
    quit,
    async close() {
      await quit();
      await vendors.close();
      await config.close();
      fs.rmSync(sandbox, { recursive: true, force: true });
    },
  };
  return run;
}

// ---------- sandbox seeds ----------

export const sandboxApps = (sandbox: string) => path.join(sandbox, 'Applications');
export const codexHome = (sandbox: string) => path.join(sandbox, 'home', '.codex');
export const cloneHome = (sandbox: string, slug: string) => path.join(sandbox, 'home', `.codex-${slug}`);
export const codexDataDir = (sandbox: string) => process.platform === 'win32'
  ? path.join(sandbox, 'home', 'AppData', 'Roaming', 'Codex')
  : path.join(sandbox, 'home', 'Library', 'Application Support', 'Codex');

/** A fake ChatGPT.app inside the sandbox whose CLI is test/fakes/fake-codex.mjs (seam 1) */
export function seedCodex(sandbox: string, version = '26.1.0'): void {
  const app = path.join(sandboxApps(sandbox), 'Test-ChatGPT.app');
  fs.mkdirSync(path.join(app, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>local.codexbuddy.test-chatgpt</string>` +
    `<key>CFBundleName</key><string>Test-ChatGPT</string><key>SUEnableAutomaticChecks</key><false/><key>CFBundleExecutable</key><string>ChatGPT</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>\n`);
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'MacOS', 'ChatGPT'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const cliDir = path.join(app, 'Contents', 'Resources', 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS');
  fs.mkdirSync(cliDir, { recursive: true });
  const fake = path.join(FAKES, 'fake-codex.mjs');
  fs.writeFileSync(path.join(cliDir, 'codex'), `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(cliDir, 'codex.cmd'), `@"${process.execPath}" "${fake}" %*\r\n`);
}

/** The user's own Codex data: a config, sessions, chat history, the Electron data dir (G-01 protects all of it) */
export function seedUserData(sandbox: string, clones: string[] = []): void {
  const write = (f: string, s: string) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  const home = codexHome(sandbox);
  write(path.join(home, 'config.toml'), 'model = "gpt-5.5"\n# user comment kept byte for byte\n');
  write(path.join(home, 'sessions', '2026', '11', '01', 'rollout-user.jsonl'), '{"type":"message","text":"我的聊天记录"}\n');
  write(path.join(home, 'history.jsonl'), '{"text":"hello"}\n');
  write(path.join(codexDataDir(sandbox), 'Local Storage', 'leveldb', '000003.log'), 'electron data');
  for (const c of clones) write(path.join(cloneHome(sandbox, c), 'sessions', 'rollout-clone.jsonl'), `{"clone":"${c}"}\n`);
}

export const setCodexRunning = (sandbox: string, on: boolean) => {
  const f = path.join(sandbox, 'fake-codex-running');
  if (on) fs.writeFileSync(f, '1'); else fs.rmSync(f, { force: true });
};
export const setCodexScenario = (sandbox: string, scenario: string) =>
  fs.writeFileSync(path.join(sandbox, 'home', 'fake-codex-scenario'), scenario);

// ---------- reading the app's state ----------

export const appState = (page: Page) => page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<AppStateView> } }).buddy.invoke('app:state'));
export const wallet = (page: Page) => page.evaluate(() => (window as unknown as { buddy: { invoke(c: string): Promise<WalletView> } }).buddy.invoke('wallet:get'));
export const readText = (f: string): string | null => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
export const configToml = (sandbox: string) => readText(path.join(codexHome(sandbox), 'config.toml'));
/** Top-level `key = "value"` of a TOML file */
export const tomlValue = (toml: string | null, key: string) => new RegExp(`^\\s*${key}\\s*=\\s*"(.*)"`, 'm').exec((toml ?? '').split(/\n\[/)[0])?.[1] ?? null;
/** Slugs and display names in the model_catalog_json a config points at */
export function catalogOf(toml: string | null): { slug: string; label: string }[] | null {
  const file = tomlValue(toml, 'model_catalog_json');
  if (!file) return null;
  const json = JSON.parse(readText(file) ?? '{"models":[]}') as { models: { slug: string; display_name?: string; name?: string; description?: string }[] };
  return json.models.map(m => ({ slug: m.slug, label: `${m.display_name ?? m.name ?? ''} ${m.description ?? ''}` }));
}
export const clipboard = (app: ElectronApplication) => app.evaluate(({ clipboard: c }) => c.readText());

/** Every file under a folder, relative path → content (for key scans) */
export function filesUnder(root: string, skip: (rel: string) => boolean = () => false): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (dir: string) => {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const p = path.join(dir, e.name);
      const rel = path.relative(root, p);
      if (skip(rel)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) out.set(rel, fs.readFileSync(p));
    }
  };
  walk(root);
  return out;
}

/** Typed view of the fake vendor server's recorded state (the .mjs is untyped JS) */
export interface FakeRequest { vendor: string; path: string; method: string; model?: string; auth?: string; body?: unknown }
export interface VendorState { requests: FakeRequest[]; keys: Record<string, string[]> }
export const vendorState = (v: VendorServer) => v.state as unknown as VendorState;
