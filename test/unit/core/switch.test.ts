// L1: the switch pipeline (backup → scratch home → 测试连通 → save / roll back). Owner: A1.
import { execFile } from 'node:child_process';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { CATALOG_FILE, catalogSlugs } from '../../../electron/core/catalogs';
import { providerOf, PROVIDERS } from '../../../electron/core/providers';
import { looksLikeKey } from '../../../electron/core/redact';
import { authJson, configFor, pickModel, readActive, switchVendor, type SwitchDeps, type SwitchRequest } from '../../../electron/core/switch';
import { getValue, splitLines } from '../../../electron/core/toml';
import type { CodexRunner, FileSystem, StepEvent } from '../../../electron/core/types';
import { memFs, testCipher } from '../../helpers/memfs';

const HOME = '/u/.codex';
const ORIGINAL_CONFIG = '# mine\nmodel = "gpt-5.5"\napproval_policy = "on-request"\n\n[projects."/x"]\ntrust_level = "trusted"\n';
const ORIGINAL_AUTH = '{"tokens":{"access_token":"tok-aaaaaaaa"}}';
const KEY = 'sk-deepseek-secret-0123456789';

const ok: CodexRunner = async () => ({ out: '好了\n', err: '', timedOut: false });
const failWith = (err: string): CodexRunner => async () => ({ out: '', err, timedOut: false });

function setup(runCodex: CodexRunner = ok, initial: Record<string, string> = { [`${HOME}/config.toml`]: ORIGINAL_CONFIG, [`${HOME}/auth.json`]: ORIGINAL_AUTH }) {
  const fs = memFs(initial);
  const events: StepEvent[] = [];
  let n = 0;
  const deps: SwitchDeps = { fs, cipher: testCipher, runCodex, now: () => new Date('2026-11-13T00:00:00Z'), scratchDir: () => `/tmp/scratch-${++n}`, emit: e => events.push(e) };
  return { fs, events, deps };
}
const req = (id: Parameters<typeof providerOf>[0], extra: Partial<SwitchRequest> = {}): SwitchRequest => {
  const p = providerOf(id);
  return { codexHome: HOME, backupRoot: '/u/backups', provider: p, baseUrl: p.baseUrl, model: p.defaultModel, models: p.models, apiKey: KEY, ...extra };
};
const snapshotOf = (fs: FileSystem) => [fs.readText(`${HOME}/config.toml`), fs.readText(`${HOME}/auth.json`), fs.readText(`${HOME}/${CATALOG_FILE}`)];

describe('switchVendor', () => {
  test('M-02 切换成功：备份、测试连通、保存，菜单只有这一家', async () => {
    const { fs, events, deps } = setup();
    const r = await switchVendor(req('deepseek'), deps);
    expect(r).toMatchObject({ ok: true, reply: '好了', model: 'deepseek-chat', backupDir: '/u/backups/20261113000000-deepseek' });
    expect(events.map(e => `${e.id}:${e.state}`)).toEqual(['backup:start', 'backup:done', 'write:start', 'write:done', 'test:start', 'test:done', 'save:start', 'save:done']);
    const lines = splitLines(fs.readText(`${HOME}/config.toml`));
    expect(getValue(lines, '', 'model_provider')).toBe('deepseek');
    expect(getValue(lines, '', 'model')).toBe('deepseek-chat');
    expect(getValue(lines, '', 'model_catalog_json')).toBe(`${HOME}/${CATALOG_FILE}`);
    expect(getValue(lines, 'model_providers.deepseek', 'wire_api')).toBe('responses');
    expect(getValue(lines, 'projects."/x"', 'trust_level')).toBe('trusted');
    expect(fs.readText(`${HOME}/config.toml`)).toContain('# mine');
    expect(JSON.parse(fs.readText(`${HOME}/auth.json`)!)).toEqual({ OPENAI_API_KEY: KEY });
    // The backup holds the old files; auth.json only encrypted
    expect(fs.readText('/u/backups/20261113000000-deepseek/config.toml')).toBe(ORIGINAL_CONFIG);
    expect(fs.readText('/u/backups/20261113000000-deepseek/auth.json.bin')).not.toContain('tok-aaaaaaaa');
  });

  test('M-07 测试连通没通过：配置、Key、菜单逐字节没变', async () => {
    const { fs, events, deps } = setup(failWith('ERROR: unexpected status 401 Unauthorized: invalid api key'));
    const before = snapshotOf(fs);
    const r = await switchVendor(req('kimi'), deps);
    expect(r).toMatchObject({ ok: false, code: 'auth', reason: 'Key 不对，或者没有权限用这个模型' });
    expect(snapshotOf(fs)).toEqual(before);
    expect(events.at(-1)).toEqual({ id: 'test', state: 'fail', text: 'Key 不对，或者没有权限用这个模型' });
  });

  test.each([
    ['ERROR: unexpected status 402: insufficient balance', 'balance'],
    ['ERROR: unexpected status 429 Too Many Requests', 'rate-limit'],
    ['ERROR: unexpected status 404 Not Found: Model not available: x', 'model'],
  ])('M-07 各种失败都不动配置 %s', async (err, code) => {
    const { fs, deps } = setup(failWith(err));
    const before = snapshotOf(fs);
    expect((await switchVendor(req('zhipu'), deps)).code).toBe(code);
    expect(snapshotOf(fs)).toEqual(before);
  });

  test('M-07 超时也不动配置', async () => {
    const { fs, deps } = setup(async () => ({ out: '', err: '', timedOut: true }));
    const before = snapshotOf(fs);
    expect((await switchVendor(req('qwen'), deps)).code).toBe('timeout');
    expect(snapshotOf(fs)).toEqual(before);
  });

  test('M-07 测试用的是临时目录，里面的菜单和配置指向临时目录', async () => {
    const seen: string[] = [];
    const { fs, deps } = setup(async (args, opts) => { seen.push(opts.codexHome); return { out: '好了', err: '', timedOut: false }; });
    await switchVendor(req('minimax'), deps);
    expect(seen).toEqual(['/tmp/scratch-1']);
    expect(getValue(splitLines(fs.readText('/tmp/scratch-1/config.toml')), '', 'model_catalog_json')).toBe(`/tmp/scratch-1/${CATALOG_FILE}`);
  });

  test('M-24 每一家切换后菜单里只有这一家的模型', async () => {
    for (const p of PROVIDERS.filter(x => !x.officialAccount)) {
      const { fs, deps } = setup();
      expect((await switchVendor(req(p.id), deps)).ok).toBe(true);
      const slugs = catalogSlugs(fs.readText(`${HOME}/${CATALOG_FILE}`));
      expect(slugs).toEqual(p.models.map(m => m.slug));
      const others = PROVIDERS.filter(x => x.id !== p.id).flatMap(x => x.models.map(m => m.slug));
      expect(slugs.some(s => others.includes(s))).toBe(false);
      const cat = JSON.parse(fs.readText(`${HOME}/${CATALOG_FILE}`)!);
      expect(cat.models.every((m: { display_name: string }) => /（(免费|付费)）$/.test(m.display_name))).toBe(true);
      // Only this vendor's provider table is left
      const text = fs.readText(`${HOME}/config.toml`)!;
      expect(text.match(/\[model_providers\./g)).toHaveLength(1);
    }
  });

  test('M-24 从一家切到另一家，上一家的表和模型都去掉', async () => {
    const { fs, deps } = setup();
    await switchVendor(req('zhipu'), deps);
    await switchVendor(req('hunyuan'), deps);
    const text = fs.readText(`${HOME}/config.toml`)!;
    expect(text).not.toContain('model_providers.zhipu');
    expect(text).toContain('[model_providers.hunyuan]');
    expect(catalogSlugs(fs.readText(`${HOME}/${CATALOG_FILE}`))).toEqual(providerOf('hunyuan').models.map(m => m.slug));
  });

  test('M-26 切回 OpenAI 官方：去掉清单和我们的厂商表，用保存的登录', async () => {
    const { fs, deps } = setup();
    await switchVendor(req('deepseek'), deps);
    const r = await switchVendor(req('openai', { apiKey: null, openaiAuth: ORIGINAL_AUTH }), deps);
    expect(r).toMatchObject({ ok: true, model: undefined });
    const lines = splitLines(fs.readText(`${HOME}/config.toml`));
    expect(getValue(lines, '', 'model_catalog_json')).toBeNull();
    expect(getValue(lines, '', 'model_provider')).toBeNull();
    expect(getValue(lines, '', 'model')).toBeNull();
    expect(fs.readText(`${HOME}/config.toml`)).not.toContain('model_providers');
    expect(fs.readText(`${HOME}/auth.json`)).toBe(ORIGINAL_AUTH);
  });

  test('M-22 OpenAI 官方还没登录：不动任何文件', async () => {
    const { fs, events, deps } = setup();
    const before = snapshotOf(fs);
    const r = await switchVendor(req('openai', { apiKey: null }), deps);
    expect(r).toEqual({ ok: false, reason: '还没有登录 OpenAI 账号' });
    expect(snapshotOf(fs)).toEqual(before);
    expect(events).toEqual([{ id: 'write', state: 'fail', text: '还没有登录 OpenAI 账号' }]);
  });

  test('没有 Key 或者清单为空就不切换', async () => {
    const { deps } = setup();
    expect((await switchVendor(req('kimi', { apiKey: null }), deps)).reason).toBe('还没有这一家的 Key');
    expect((await switchVendor(req('kimi', { models: [] }), deps)).reason).toBe('这一家的模型清单是空的');
  });

  test('第一次用：原来没有 config.toml 也能切换', async () => {
    const { fs, deps } = setup(ok, {});
    expect((await switchVendor(req('zhipu'), deps)).ok).toBe(true);
    expect(getValue(splitLines(fs.readText(`${HOME}/config.toml`)), '', 'model')).toBe('glm-4.5-flash');
  });

  test('M-07 保存时出错：退回原来的文件', async () => {
    const { fs, events, deps } = setup();
    const realWrite = fs.writeText.bind(fs);
    const before = snapshotOf(fs);
    let failNext = true;
    fs.writeText = (file, text) => {
      if (file === `${HOME}/config.toml` && failNext) { failNext = false; throw new Error('disk full'); }
      realWrite(file, text);
    };
    const r = await switchVendor(req('deepseek'), deps);
    expect(r).toMatchObject({ ok: false, reason: '保存没成功，配置已经退回原样' });
    expect(snapshotOf(fs).slice(0, 2)).toEqual(before.slice(0, 2));
    expect(events.at(-1)?.state).toBe('fail');
  });

  test('M-07 保存出错且退回也出错：不抛异常', async () => {
    const { deps, fs } = setup();
    const realWrite = fs.writeText.bind(fs);
    fs.writeText = (file, text) => { if (file.startsWith(HOME)) throw new Error('read-only'); realWrite(file, text); };
    expect((await switchVendor(req('deepseek'), deps)).ok).toBe(false);
  });

  test('S-08 步骤文字和结果里没有完整 Key', async () => {
    const { events, deps } = setup();
    const r = await switchVendor(req('deepseek'), deps);
    expect(looksLikeKey(JSON.stringify([events, r]))).toBe(false);
  });
});

describe('configFor / pickModel / readActive', () => {
  test('模型不在清单里：用默认模型，再不行用第一个', () => {
    const p = providerOf('zhipu');
    expect(pickModel({ provider: p, model: 'glm-5', models: p.models })).toBe('glm-5');
    expect(pickModel({ provider: p, model: 'gpt-5.5', models: p.models })).toBe('glm-4.5-flash');
    expect(pickModel({ provider: p, model: 'x', models: [{ slug: 'only', name: 'O', free: true }] })).toBe('only');
    expect(pickModel({ provider: p, model: 'x', models: [] })).toBe('x');
  });
  test('configFor without a catalog path leaves the line out', () => {
    const r = req('kimi');
    const lines = configFor(['model_catalog_json = "/old.json"'], r, null);
    expect(getValue(lines, '', 'model_catalog_json')).toBeNull();
    expect(getValue(lines, 'model_providers.kimi', 'base_url')).toBe(r.baseUrl);
  });
  test('分身：同一个函数写 ~/.codex-<名字> 的配置，走转接层地址', () => {
    const lines = configFor([], { ...req('deepseek'), codexHome: '/u/.codex-deepseek', baseUrl: 'http://127.0.0.1:5555/deepseek/v1' }, '/u/.codex-deepseek/m.json');
    expect(getValue(lines, 'model_providers.deepseek', 'base_url')).toBe('http://127.0.0.1:5555/deepseek/v1');
  });
  test('M-28 卡片跟着 Codex 里选的模型', () => {
    expect(readActive('model_provider = "zhipu"\nmodel = "glm-5"\n')).toEqual({ provider: 'zhipu', model: 'glm-5' });
    expect(readActive(null)).toEqual({ provider: null, model: null });
  });
  test('authJson', () => { expect(JSON.parse(authJson('k'))).toEqual({ OPENAI_API_KEY: 'k' }); });
});

// The same pipeline against real files in a temp dir and the fake Codex CLI (no real ~/.codex)
describe('switchVendor with real files and fake Codex', () => {
  const fakeCodex = path.resolve(__dirname, '../../fakes/fake-codex.mjs');
  const realFs: FileSystem = {
    readText: f => { try { return nodeFs.readFileSync(f, 'utf8'); } catch { return null; } },
    writeText: (f, t) => { nodeFs.mkdirSync(path.dirname(f), { recursive: true }); nodeFs.writeFileSync(f, t); },
    readBytes: f => { try { return nodeFs.readFileSync(f); } catch { return null; } },
    writeBytes: (f, d) => { nodeFs.mkdirSync(path.dirname(f), { recursive: true }); nodeFs.writeFileSync(f, d); },
    exists: f => nodeFs.existsSync(f),
    mkdirp: d => { nodeFs.mkdirSync(d, { recursive: true }); },
    copy: (a, b) => { nodeFs.mkdirSync(path.dirname(b), { recursive: true }); nodeFs.copyFileSync(a, b); },
    list: d => nodeFs.readdirSync(d),
    remove: t => { nodeFs.rmSync(t, { recursive: true, force: true }); },
  };
  const runner = (scenario: string): CodexRunner => (args, opts) => new Promise(resolve => {
    execFile(process.execPath, [fakeCodex, ...args], { env: { ...process.env, CODEX_HOME: opts.codexHome, FAKE_CODEX_SCENARIO: scenario }, timeout: opts.timeoutMs }, (e, out, err) => resolve({ out: String(out), err: String(err), timedOut: false }));
  });
  const bytes = (dir: string) => Object.fromEntries(nodeFs.readdirSync(dir).map(f => [f, nodeFs.readFileSync(path.join(dir, f)).toString('hex')]));

  test.each(['401', 'balance', 'model', 'unreachable'])('M-07 假 Codex 返回 %s：文件逐字节没变', async scenario => {
    const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'cb-a1-'));
    const home = path.join(root, '.codex');
    realFs.writeText(path.join(home, 'config.toml'), ORIGINAL_CONFIG);
    realFs.writeText(path.join(home, 'auth.json'), ORIGINAL_AUTH);
    const before = bytes(home);
    let n = 0;
    const deps: SwitchDeps = { fs: realFs, cipher: testCipher, runCodex: runner(scenario), now: () => new Date(), scratchDir: () => path.join(root, `s${++n}`), emit: () => {} };
    const r = await switchVendor({ ...req('deepseek'), codexHome: home, backupRoot: path.join(root, 'b') }, deps);
    expect(r.ok).toBe(false);
    expect(bytes(home)).toEqual(before);
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  test('M-24 假 Codex 按清单检查：菜单里的模型都能用', async () => {
    const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'cb-a1-'));
    const home = path.join(root, '.codex');
    let n = 0;
    const deps: SwitchDeps = { fs: realFs, cipher: testCipher, runCodex: runner('ok'), now: () => new Date(), scratchDir: () => path.join(root, `s${++n}`), emit: () => {} };
    for (const m of providerOf('zhipu').models) {
      const r = await switchVendor({ ...req('zhipu'), model: m.slug, codexHome: home, backupRoot: path.join(root, 'b') }, deps);
      expect(r).toMatchObject({ ok: true, model: m.slug });
    }
    nodeFs.rmSync(root, { recursive: true, force: true });
  });
});
