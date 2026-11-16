// L2: DeepSeek level-1 page script, run against a stubbed platform.deepseek.com page. Owner: A4.
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({}));
import { extractKey } from '../../electron/vendors/base';
import { DEEPSEEK_CREATE_KEY_SCRIPT } from '../../electron/vendors/deepseek';

type Call = { url: string; init: { headers: Record<string, string>; body: string } };
const run = async (stored: string | null, answer: { status: number; body: unknown }) => {
  const calls: Call[] = [];
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'userToken' ? stored : null) });
  vi.stubGlobal('fetch', async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    return { status: answer.status, text: async () => JSON.stringify(answer.body) };
  });
  const res = (await (0, eval)(DEEPSEEK_CREATE_KEY_SCRIPT)) as { status: number; body: string };
  return { res, calls };
};
const token = JSON.stringify({ value: 'tok123', __version: '0' });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('DeepSeek level 1: console API creates the key', () => {
  test('logged in: POST edit_api_keys create with Bearer token; key = sensitive_id', async () => {
    const { res, calls } = await run(token, { status: 200, body: { code: 0, data: { biz_code: 0, biz_data: { api_key: { sensitive_id: 'sk-0123456789abcdef0123456789abcdef' } } } } });
    expect(calls[0].url).toBe('/api/v0/users/edit_api_keys');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok123');
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ action: 'create', name: 'CodexBuddy' });
    expect(extractKey(res.body)).toBe('sk-0123456789abcdef0123456789abcdef');
  });

  test('too many keys (biz_code 1): 4xx, falls through to level 2', async () => {
    const { res } = await run(token, { status: 200, body: { code: 0, data: { biz_code: 1, biz_data: null } } });
    expect(res.status).toBe(400);
  });

  test('no login token after waiting: 401, no request', async () => {
    vi.useFakeTimers();
    const p = run(null, { status: 200, body: {} });
    await vi.runAllTimersAsync();
    const { res, calls } = await p;
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
