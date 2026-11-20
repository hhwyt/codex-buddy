import { afterEach, expect, test, vi } from 'vitest';
import { checkInternet, NetworkGate, NETWORK_TIMEOUT_MS } from '../../electron/main/network-gate';
import { removeTestEnvironment } from '../../electron/main/hardening';

afterEach(() => vi.useRealTimers());

test('N-01 真实请求禁用缓存与跳转，一条正常连接即可通过，其他请求随即取消', async () => {
  const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('unreachable')).mockResolvedValueOnce(new Response('ok'));
  expect(await checkInternet(fetcher)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const options = fetcher.mock.calls[0][1]!;
  expect(options.cache).toBe('no-store');
  expect(options.redirect).toBe('error');
  expect(options.signal!.aborted).toBe(true);
});

test('N-01 错误状态、跳转到其他地址、请求失败都不能放行', async () => {
  const redirected = new Response('portal');
  Object.defineProperty(redirected, 'url', { value: 'https://unrelated.example/login' });
  expect(await checkInternet(vi.fn<typeof fetch>().mockResolvedValue(redirected), ['https://expected.example/'])).toBe(false);
  expect(await checkInternet(vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 })))).toBe(false);
  expect(await checkInternet(vi.fn<typeof fetch>().mockRejectedValue(new Error('no network')))).toBe(false);
});

test('N-01 请求超时结束转圈，不能一直挂起', async () => {
  vi.useFakeTimers();
  const fetcher: typeof fetch = (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('timeout')));
  });
  const result = checkInternet(fetcher);
  await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);
  expect(await result).toBe(false);
});

test('N-03 默认拒绝后台功能，只放行检查、退出和终止进行中的操作', async () => {
  const verify = vi.fn(async () => true);
  const gate = new NetworkGate(verify, () => {});
  for (const channel of ['install:run', 'wallet:get', 'codex:open', 'codex:restart', 'zh:set', 'restore:run'] as const) {
    expect(await gate.allows(channel)).toBe(false);
  }
  for (const channel of ['network:check', 'app:quit', 'network:offline', 'switch:cancel', 'browser:close'] as const) {
    expect(await gate.allows(channel)).toBe(true);
  }
  expect(verify).not.toHaveBeenCalled();
});

test('N-03 功能操作需要新请求，内存里的成功和本地配置不能替代连接', async () => {
  let reachable = true;
  const verify = vi.fn(async () => reachable);
  const states: string[] = [];
  const gate = new NetworkGate(verify, state => states.push(state));
  expect(await gate.check()).toBe(true);
  expect(await gate.allows('wallet:get')).toBe(true);
  expect(verify).toHaveBeenCalledTimes(1);
  reachable = false;
  expect(await gate.allows('install:run')).toBe(false);
  expect(verify).toHaveBeenCalledTimes(2);
  expect(gate.state).toBe('offline');
  reachable = true;
  expect(await gate.allows('codex:open')).toBe(false);
  expect(await gate.check()).toBe(true);
  expect(states).toEqual(['online', 'offline', 'online']);
  expect(new NetworkGate(verify, () => {}).state).toBe('checking');
});

test('N-04 系统已断网时立即拒绝，不把系统的在线标志当作成功验证', async () => {
  let systemOnline = true;
  const verify = vi.fn(async () => true);
  const gate = new NetworkGate(verify, () => {}, () => systemOnline);
  expect(await gate.check()).toBe(true);
  systemOnline = false;
  expect(await gate.allows('wallet:get')).toBe(false);
  expect(await gate.check()).toBe(false);
  expect(verify).toHaveBeenCalledTimes(1);
});

test('N-04 旧请求不能在断网后或新重试后重新放行，重复检查共用一次请求', async () => {
  let resolveOld!: (result: boolean) => void;
  const verify = vi.fn<() => Promise<boolean>>().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(true);
  const gate = new NetworkGate(verify, () => {});
  const old = gate.check();
  expect(gate.check()).toBe(old);
  await Promise.resolve();
  gate.block();
  expect(await gate.check()).toBe(true);
  resolveOld(true);
  expect(await old).toBe(false);
  expect(gate.state).toBe('online');
});

test('N-03 检测异常也必须拒绝', async () => {
  const gate = new NetworkGate(async () => { throw new Error('probe failed'); }, () => {});
  expect(await gate.check()).toBe(false);
  expect(gate.state).toBe('offline');
});

test('N-05 正式包清除测试地址、公钥和沙盒环境变量，开发测试保留', () => {
  const env = { CODEXBUDDY_ENDPOINTS: 'fake', CODEXBUDDY_REMOTE_KEY: 'fake', CODEXBUDDY_SANDBOX: 'fake', PATH: 'system', CODEX_HOME: 'user' };
  removeTestEnvironment(env, true);
  expect(env.CODEXBUDDY_ENDPOINTS).toBe('fake');
  removeTestEnvironment(env, false);
  expect(env).toEqual({ PATH: 'system', CODEX_HOME: 'user' });
});
