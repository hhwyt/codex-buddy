// L2: 智谱 level-1 page script (the console API scripts/vendor/codex.ps1 verified with real logins), run against a
// stubbed bigmodel.cn page. Owner: A4.
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('electron', () => ({}));
import { extractKey } from '../../electron/vendors/base';
import { ZHIPU_CREATE_KEY_SCRIPT } from '../../electron/vendors/zhipu';

type Call = { url: string; init: { headers: Record<string, string>; body: string } };
const run = async (page: { cookie: string; store: Record<string, string> }, answer: { status: number; body: unknown }) => {
  const calls: Call[] = [];
  vi.stubGlobal('document', { cookie: page.cookie });
  vi.stubGlobal('localStorage', { getItem: (k: string) => page.store[k] ?? null });
  vi.stubGlobal('fetch', async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    return { status: answer.status, text: async () => JSON.stringify(answer.body) };
  });
  const res = (await (0, eval)(ZHIPU_CREATE_KEY_SCRIPT)) as { status: number; body: string };
  return { res, calls };
};
const loggedIn = { cookie: 'a=1; bigmodel_token_production=tok=en', store: { 'Bigmodel-Organization': 'org1', 'Bigmodel-Project': 'proj1' } };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('智谱 level 1: console API creates the key', () => {
  test('M-08 logged in: POST with token, organization and project; key = apiKey.secretKey', async () => {
    const { res, calls } = await run(loggedIn, { status: 200, body: { code: 200, data: { apiKey: 'a1b2c3d4e5f6a7b8c9d0', secretKey: 'S3cretS3cretS3cret' } } });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/biz/v1/organization/org1/projects/proj1/api_keys');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'tok=en', 'Bigmodel-Organization': 'org1', 'Bigmodel-Project': 'proj1' });
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ name: expect.stringMatching(/^CodexBuddy-\d{12}$/), keyType: 1, usageScene: 2 });
    expect(res.status).toBe(200);
    expect(extractKey(res.body)).toBe('a1b2c3d4e5f6a7b8c9d0.S3cretS3cretS3cret');
  });

  test('console says no (code ≠ 200): 4xx so the ladder falls through to level 2', async () => {
    const { res } = await run(loggedIn, { status: 200, body: { code: 1001, msg: 'denied' } });
    expect(res.status).toBe(400);
  });

  test('no login state after waiting: 401, no request', async () => {
    vi.useFakeTimers();
    const p = run({ cookie: '', store: {} }, { status: 200, body: {} });
    await vi.runAllTimersAsync();
    const { res, calls } = await p;
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
