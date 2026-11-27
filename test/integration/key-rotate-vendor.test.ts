// L1/L2: 换新 Key 的厂商部分 (Y-05): makeVendor.revokeKey, DeepSeek's console delete script against a stubbed
// platform.deepseek.com page, and the key probe that tells a deleted key from a working one.
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({}));
import { providerOf } from '../../electron/core/providers';
import { probeKey } from '../../electron/main/key-probe';
import { makeVendor } from '../../electron/vendors/base';
import { deepseek, deepseekRevokeKeyScript } from '../../electron/vendors/deepseek';
import type { BrowserDriver } from '../../electron/vendors/types';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const driver = (evaluate: (script: string) => Promise<unknown>) => {
  const opens: { url: string; mode: string }[] = [];
  const b: BrowserDriver = {
    open: async (url, o) => { opens.push({ url, mode: o.mode }); }, url: () => '', evaluate: evaluate as BrowserDriver['evaluate'],
    waitForResponse: async () => '', waitForUrl: async () => true, setMode: () => {}, hasCookie: async () => true,
  };
  return { b, opens };
};

describe('Y-05 makeVendor.revokeKey', () => {
  test('Y-05 没有删 Key 接口的厂商回 false，不开浏览器', async () => {
    const { b, opens } = driver(async () => ({ status: 200, body: '' }));
    expect(await makeVendor(providerOf('kimi')).revokeKey(b, 'sk-x')).toBe(false);
    expect(opens).toEqual([]);
  });

  test('Y-05 有接口：小窗打开官网 Key 页跑脚本；200 才算删掉，别的或出错都不算', async () => {
    let answer: unknown = { status: 200, body: '{}' };
    const scripts: string[] = [];
    const { b, opens } = driver(async s => { scripts.push(s); if (answer instanceof Error) throw answer; return answer; });
    expect(await deepseek.revokeKey(b, 'sk-abcdef0123456789f3a9')).toBe(true);
    expect(opens).toEqual([{ url: providerOf('deepseek').keysUrl, mode: 'pip' }]);
    expect(scripts[0]).toContain('"sk-abcdef0123456789f3a9"');
    answer = { status: 404, body: 'matched 0' };
    expect(await deepseek.revokeKey(b, 'sk-x')).toBe(false);
    answer = new Error('closed');
    expect(await deepseek.revokeKey(b, 'sk-x')).toBe(false);
  });
});

type Call = { url: string; init?: { method?: string; headers: Record<string, string>; body?: string } };
const runDelete = async (key: string, stored: string | null, list: unknown[], del: { status: number; body: unknown } = { status: 200, body: { code: 0, data: { biz_code: 0, biz_data: null } } }) => {
  const calls: Call[] = [];
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'userToken' ? stored : null) });
  vi.stubGlobal('fetch', async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    if (url.endsWith('get_api_keys')) return { status: 200, text: async () => JSON.stringify({ code: 0, data: { biz_code: 0, biz_data: { api_keys: list } } }) };
    return { status: del.status, text: async () => JSON.stringify(del.body) };
  });
  const res = (await (0, eval)(deepseekRevokeKeyScript(key))) as { status: number; body: string };
  return { res, calls };
};
const token = JSON.stringify({ value: 'tok123' });
const OLD = 'sk-0f3e9a7c55d24c6b8a1b2c3d4e5ff3a9';
const listed = [
  { name: 'CodexBuddy', sensitive_id: 'sk-0f3e****f3a9', created_at: 1763000000, tracking_id: 't-old' },
  { name: 'CodexBuddy', sensitive_id: 'sk-77aa****9b10', created_at: 1764100000, tracking_id: 't-new' },
];

describe('Y-05 DeepSeek 官网接口删旧 Key', () => {
  test('Y-05 列出 Key，只有一个和旧 Key 前后对得上：按官网自己的格式删它', async () => {
    const { res, calls } = await runDelete(OLD, token, listed);
    expect(res.status).toBe(200);
    expect(calls.map(c => c.url)).toEqual(['/api/v0/users/get_api_keys', '/api/v0/users/edit_api_keys']);
    expect(calls[0].init!.headers.Authorization).toBe('Bearer tok123');
    expect(calls[1].init!.method).toBe('POST');
    expect(JSON.parse(calls[1].init!.body!)).toEqual({ action: 'delete', name: null, redacted_key: 'sk-0f3e****f3a9', created_at: 1763000000, tracking_id: 't-old' });
  });

  test('Y-05 一个也对不上，或对上两个：不删，回 404', async () => {
    expect((await runDelete('sk-ffffffffffffffffff0000', token, listed)).res.status).toBe(404);
    const twice = await runDelete(OLD, token, [listed[0], { ...listed[0], tracking_id: 't-2' }]);
    expect(twice.res.status).toBe(404);
    expect(twice.calls).toHaveLength(1);
  });

  test('Y-05 列表里是完整 Key 也认；官网拒绝删回 4xx', async () => {
    const full = [{ sensitive_id: OLD, created_at: 1, tracking_id: null }];
    expect((await runDelete(OLD, token, full)).res.status).toBe(200);
    expect((await runDelete(OLD, token, full, { status: 200, body: { code: 0, data: { biz_code: 3 } } })).res.status).toBe(400);
    expect((await runDelete(OLD, token, full, { status: 500, body: 'oops' })).res.status).toBe(500);
  });

  test('Y-05 没登录：等一会还没有登录信息就回 401，不发请求', async () => {
    vi.useFakeTimers();
    const p = runDelete(OLD, null, listed);
    await vi.runAllTimersAsync();
    const { res, calls } = await p;
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

describe('Y-05 用旧 Key 试一下：被拒就算删掉', () => {
  const p = { baseUrl: 'https://api.deepseek.com/', defaultModel: 'deepseek-chat' };
  const answer = (status: number, body = '') => (async () => ({ status, text: async () => body })) as unknown as typeof fetch;

  test('Y-05 401 / 403 / 正文写着 Key 不对 = dead；400 = alive；5xx 和连不上 = unknown', async () => {
    expect(await probeKey(answer(401), p, 'k')).toBe('dead');
    expect(await probeKey(answer(403), p, 'k')).toBe('dead');
    expect(await probeKey(answer(200, '{"base_resp":{"status_code":1004,"status_msg":"login fail"}}'), p, 'k')).toBe('dead');
    expect(await probeKey(answer(400, '{"error":{"message":"Authentication Fails, Your api key is invalid"}}'), p, 'k')).toBe('dead');
    expect(await probeKey(answer(400, '{"error":{"message":"messages must not be empty"}}'), p, 'k')).toBe('alive');
    expect(await probeKey(answer(503), p, 'k')).toBe('unknown');
    expect(await probeKey((async () => { throw new Error('offline'); }) as unknown as typeof fetch, p, 'k')).toBe('unknown');
  });

  test('Y-05 请求发到厂商的 chat/completions，带这个 Key，不生成内容', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return { status: 400, text: async () => '' }; }) as unknown as typeof fetch;
    await probeKey(f, p, 'sk-test-1234');
    expect(seen!.url).toBe('https://api.deepseek.com/chat/completions');
    expect((seen!.init.headers as Record<string, string>).authorization).toBe('Bearer sk-test-1234');
    expect(JSON.parse(seen!.init.body as string)).toEqual({ model: 'deepseek-chat', messages: [], max_tokens: 1 });
  });
});
