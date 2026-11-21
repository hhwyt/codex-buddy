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

test('N-01 请求超时结束等待，不能一直挂起', async () => {
  vi.useFakeTimers();
  const fetcher: typeof fetch = (_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => reject(new Error('timeout')));
  });
  const result = checkInternet(fetcher);
  await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);
  expect(await result).toBe(false);
});

test('N-03 启动检查出结果前，读取照常，改配置的操作等检查通过才执行', async () => {
  let finish!: (ok: boolean) => void;
  const verify = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const gate = new NetworkGate(verify, () => {});
  for (const channel of ['app:state', 'wallet:get', 'network:check', 'app:quit', 'switch:cancel', 'browser:close'] as const) {
    expect(await gate.allows(channel)).toBe(true);
  }
  expect(verify).not.toHaveBeenCalled();
  const action = gate.allows('switch:start');
  const again = gate.allows('install:run');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(verify).toHaveBeenCalledTimes(1);
  finish(true);
  expect(await action).toBe(true);
  expect(await again).toBe(true);
});

test('N-03 启动检查失败：操作被拒，读取照常；缓存和内置配置不能放行；重试通过后放行', async () => {
  let reachable = false;
  const verify = vi.fn(async () => reachable);
  const states: string[] = [];
  const gate = new NetworkGate(verify, state => states.push(state));
  expect(await gate.check()).toBe(false);
  expect(await gate.allows('install:run')).toBe(false);
  expect(await gate.allows('codex:open')).toBe(false);
  expect(await gate.allows('wallet:get')).toBe(true);
  expect(verify).toHaveBeenCalledTimes(1);
  reachable = true;
  expect(await gate.check()).toBe(true);
  expect(await gate.allows('install:run')).toBe(true);
  expect(states).toEqual(['offline', 'online']);
});

test('N-04 启动检查通过后，用到一半断网不再拦操作，也不再检查', async () => {
  let reachable = true;
  let systemOnline = true;
  const verify = vi.fn(async () => reachable);
  const gate = new NetworkGate(verify, () => {}, () => systemOnline);
  expect(await gate.check()).toBe(true);
  reachable = false;
  systemOnline = false;
  expect(await gate.allows('switch:start')).toBe(true);
  expect(await gate.check()).toBe(true);
  expect(gate.state).toBe('online');
  expect(verify).toHaveBeenCalledTimes(1);
});

test('N-04 系统报告断网时启动检查直接失败，不发请求；重复检查共用一次请求', async () => {
  const verify = vi.fn(async () => true);
  expect(await new NetworkGate(verify, () => {}, () => false).check()).toBe(false);
  expect(verify).not.toHaveBeenCalled();
  const gate = new NetworkGate(verify, () => {});
  expect(gate.check()).toBe(gate.check());
});

test('N-03 检测异常也必须拒绝', async () => {
  const gate = new NetworkGate(async () => { throw new Error('probe failed'); }, () => {});
  expect(await gate.check()).toBe(false);
  expect(gate.state).toBe('offline');
  expect(await gate.allows('install:run')).toBe(false);
});

test('N-05 正式包清除测试地址、公钥和沙盒环境变量，开发测试保留', () => {
  const env = { CODEXBUDDY_ENDPOINTS: 'fake', CODEXBUDDY_REMOTE_KEY: 'fake', CODEXBUDDY_SANDBOX: 'fake', PATH: 'system', CODEX_HOME: 'user' };
  removeTestEnvironment(env, true);
  expect(env.CODEXBUDDY_ENDPOINTS).toBe('fake');
  removeTestEnvironment(env, false);
  expect(env).toEqual({ PATH: 'system', CODEX_HOME: 'user' });
});
