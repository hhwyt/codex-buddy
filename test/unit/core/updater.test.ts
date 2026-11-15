// L1: update check. Owner: A1.
import { describe, expect, test } from 'vitest';
import { checkUpdate, compareVersions, DAY_MS, raiseFloor, requiredUpgrade, shouldPrompt } from '../../../electron/core/updater';
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
  describe('强制升级（minVersion）', () => {
    const latest = { version: '0.3.0', notes: '必须更新', macUrl: 'https://github.com/m', winUrl: 'https://github.com/w' };
    test('低于最低版本：要升级，下载最新版', () => {
      expect(requiredUpgrade('0.1.0', '0.2.0', latest)).toEqual({ kind: 'required', version: '0.3.0', notes: '必须更新', macUrl: 'https://github.com/m', winUrl: 'https://github.com/w' });
      expect(requiredUpgrade('0.1.9', '0.2', latest)?.kind).toBe('required');
    });
    test('等于或高于最低版本：不拦', () => {
      expect(requiredUpgrade('0.2.0', '0.2.0', latest)).toBeNull();
      expect(requiredUpgrade('0.2.1', '0.2.0', latest)).toBeNull();
      expect(requiredUpgrade('0.1.0', '0.0.0', latest)).toBeNull();
    });
    test('首次没取到配置（没有下限）：放行', () => {
      expect(requiredUpgrade('0.0.1', null, latest)).toBeNull();
    });
    test('最新版比最低版本还低（配置写错）：至少报最低版本', () => {
      expect(requiredUpgrade('0.1.0', '0.5.0', latest)?.version).toBe('0.5.0');
    });
    test('只升不降：下限只会变高', () => {
      expect(raiseFloor(null, '0.2.0')).toBe('0.2.0');
      expect(raiseFloor('0.2.0', '0.3.0')).toBe('0.3.0');
      expect(raiseFloor('0.3.0', '0.2.0')).toBe('0.3.0');
      expect(raiseFloor('0.3.0', '0.0.0')).toBe('0.3.0');
      expect(raiseFloor('0.3.0', null)).toBe('0.3.0');
      expect(raiseFloor(null, undefined)).toBeNull();
    });
  });
});
