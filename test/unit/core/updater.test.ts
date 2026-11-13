// L1: update check. Owner: A1.
import { describe, expect, test } from 'vitest';
import { checkUpdate, compareVersions, DAY_MS, shouldPrompt } from '../../../electron/core/updater';
import { validateRemote } from '../../../electron/core/remote';
import nodeFs from 'node:fs';
import nodePath from 'node:path';

const bundledText = nodeFs.readFileSync(nodePath.resolve(__dirname, '../../../remote/config.json'), 'utf8');

const remote = (version: string) => ({ ...validateRemote(bundledText)!, latest: { version, notes: '修好了', macUrl: '', winUrl: '' } });

describe('updater', () => {
  test.each([
    ['0.1.0', '0.1.0', 0], ['v0.2.0', '0.1.9', 1], ['0.1', '0.1.0', 0], ['0.1.0', '0.10.0', -1], ['1.0.0-2', '1.0.0-1', 1], ['x', '0.0.0', 0], ['0.1.0.1', '0.1', 1], ['0.1', '0.1.0.1', -1],
  ])('compareVersions %s %s', (a, b, want) => { expect(compareVersions(a, b)).toBe(want); });
  test('T-02 有新版本 / 已是最新 / 断网', () => {
    expect(checkUpdate('0.1.0', remote('0.2.0'))).toEqual({ kind: 'new', version: '0.2.0', notes: '修好了' });
    expect(checkUpdate('0.2.0', remote('0.2.0'))).toEqual({ kind: 'latest' });
    expect(checkUpdate('0.3.0', remote('0.2.0'))).toEqual({ kind: 'latest' });
    expect(checkUpdate('0.1.0', null)).toEqual({ kind: 'offline' });
  });
  test('U-01 稍后之后同一个版本一天内不再弹', () => {
    const at = 1_000_000;
    expect(shouldPrompt('0.2.0', null, at)).toBe(true);
    expect(shouldPrompt('0.2.0', { version: '0.2.0', at }, at + 1000)).toBe(false);
    expect(shouldPrompt('0.2.0', { version: '0.2.0', at }, at + DAY_MS - 1)).toBe(false);
    expect(shouldPrompt('0.2.0', { version: '0.2.0', at }, at + DAY_MS)).toBe(true);
    expect(shouldPrompt('0.3.0', { version: '0.2.0', at }, at + 1)).toBe(true);
  });
});
