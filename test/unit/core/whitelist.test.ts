// L1: whitelist + connection log. Owner: A1.
import { describe, expect, test } from 'vitest';
import { allowedHosts, BASE_HOSTS, ConnectionLog, hostOf, isAllowed } from '../../../electron/core/whitelist';
import { PROVIDERS } from '../../../electron/core/providers';

const list = allowedHosts(PROVIDERS);

describe('whitelist', () => {
  test('S-05 白名单外的请求被拦掉', () => {
    expect(isAllowed('api.deepseek.com', list)).toBe(true);
    expect(isAllowed('API.DeepSeek.com:443', list)).toBe(true);
    expect(isAllowed('cdn.jsdelivr.net', list)).toBe(true);
    expect(isAllowed('sub.github.com', list)).toBe(true);
    expect(isAllowed('127.0.0.1:5555', list)).toBe(true);
    expect(isAllowed('evil.com', list)).toBe(false);
    expect(isAllowed('deepseek.com.evil.com', list)).toBe(false);
    expect(isAllowed('notgithub.com', list)).toBe(false);
    expect(isAllowed('', list)).toBe(false);
  });
  test('白名单只有 GitHub、jsDelivr 和 7 家', () => {
    for (const h of BASE_HOSTS) expect(list).toContain(h);
    expect(list.some(h => /humanslive|myqcloud/i.test(h))).toBe(false);
    expect(new Set(list).size).toBe(list.length);
  });
  test('hostOf', () => {
    expect(hostOf('https://API.moonshot.cn/v1/x')).toBe('api.moonshot.cn');
    expect(hostOf('nope')).toBe('');
  });
  test('S-05 拦掉的也记下来；S-04 浏览器的只记不拦，分两块', () => {
    const log = new ConnectionLog(3);
    expect(log.record('evil.com', 'app', list, 1)).toBe(false);
    expect(log.record('api.deepseek.com', 'app', list, 2)).toBe(true);
    expect(log.record('evil.com', 'browser', list, 3)).toBe(true);
    expect(log.list('app')).toEqual([
      { host: 'api.deepseek.com', source: 'app', allowed: true, at: 2 },
      { host: 'evil.com', source: 'app', allowed: false, at: 1 },
    ]);
    expect(log.list('browser')).toEqual([{ host: 'evil.com', source: 'browser', allowed: true, at: 3 }]);
    // Same host again moves to the top with the new time; the cap drops the oldest
    log.record('evil.com', 'app', list, 4);
    log.record('github.com', 'app', list, 5);
    expect(log.list('app').map(r => r.host)).toEqual(['github.com', 'evil.com']);
  });
});
