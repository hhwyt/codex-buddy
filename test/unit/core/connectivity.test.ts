import { describe, expect, test } from 'vitest';
import { classifyFailure, isUnreachable, lastLine, reasonOf, testConnectivity } from '../../../electron/core/connectivity';
import type { CodexRunner } from '../../../electron/core/types';

const runner = (out: string, err = '', timedOut = false): CodexRunner => async () => ({ out, err, timedOut });

describe('connectivity', () => {
  test.each([
    ['waiting for network\nwaiting for network', false, 'unreachable'],
    ['', true, 'timeout'],
    ['402 insufficient balance', false, 'balance'],
    ['401 Unauthorized', false, 'auth'],
    ['stream disconnected before completion', false, 'bad-reply'],
    ['404 Not Found: Model not available: x', false, 'model'],
    ['429 Too Many Requests', false, 'rate-limit'],
    ['dns error: failed to resolve', false, 'network'],
    ['something else', false, 'no-reply'],
  ] as const)('classify %s', (err, timedOut, code) => {
    expect(classifyFailure(err, timedOut)).toBe(code);
    expect(reasonOf(code)).not.toMatch(/[。.]$/);
  });
  test('isUnreachable needs two reconnect notices', () => {
    expect(isUnreachable('waiting for network')).toBe(false);
  });
  test('lastLine picks the reply', () => {
    expect(lastLine('\n好了\n\n')).toBe('好了');
    expect(lastLine('')).toBeUndefined();
  });
  test('ok when Codex replies in time', async () => {
    expect(await testConnectivity(runner('好了\n'), '/h')).toEqual({ ok: true, reply: '好了' });
  });
  test('fails with a reason otherwise', async () => {
    const r = await testConnectivity(runner('', '401 Unauthorized'), '/h');
    expect(r).toMatchObject({ ok: false, code: 'auth' });
    expect((await testConnectivity(runner('late', '', true), '/h')).code).toBe('timeout');
  });
});
