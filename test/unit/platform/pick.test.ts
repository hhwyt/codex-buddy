// L1: pickPlatform: a sandbox when CODEXBUDDY_SANDBOX is set, else the real paths for the OS. Owner: Base.
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from 'vitest';
import { pickPlatform } from '../../../electron/platform/index';

test('有 CODEXBUDDY_SANDBOX 时所有路径都在沙盒里，Mac / Windows 各自的布局', () => {
  const root = path.join(os.tmpdir(), 'cb-pick');
  const mac = pickPlatform({ CODEXBUDDY_SANDBOX: root }, 'darwin');
  const win = pickPlatform({ CODEXBUDDY_SANDBOX: root }, 'win32');
  for (const p of [mac, win]) {
    expect(p.paths.codexHome.startsWith(root)).toBe(true);
    expect(p.paths.buddyDir.startsWith(root)).toBe(true);
  }
  expect(mac.paths.zhLauncherPath).toBe(path.join(root, 'Applications', 'ChatGPT 汉化版.app'));
  expect(win.paths.zhLauncherPath.endsWith('ChatGPT 汉化版.lnk')).toBe(true);
});

test('没有沙盒：用真实的用户目录（只看路径，不碰文件）', () => {
  const mac = pickPlatform({}, 'darwin');
  expect(mac.paths.codexHome).toBe(path.join(os.homedir(), '.codex'));
  const win = pickPlatform({}, 'win32');
  expect(win.paths.codexHome.endsWith('.codex')).toBe(true);
});
