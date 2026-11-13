// L1: 一键还原 plan. Owner: A1.
import { describe, expect, test } from 'vitest';
import { describeRestore, planRestore, type OriginalState, type RestoreInputs } from '../../../electron/core/restore';

const original = (o: Partial<OriginalState> = {}): OriginalState => ({ takenAt: 't', configExisted: true, authExisted: true, codexInstalled: false, zhLauncher: false, ...o });
const inputs = (o: Partial<RestoreInputs> = {}): RestoreInputs => ({ original: original(), codexInstalledNow: true, codexRunning: false, zhLauncherNow: false, clones: [], ...o });

describe('restore', () => {
  test('T-04 还原：配置恢复、卸掉这次装的 Codex、退出浏览器登录', () => {
    expect(planRestore(inputs()).map(s => s.kind)).toEqual(['config', 'uninstall-codex', 'clear-browser-logins']);
  });
  test('T-04 原来就有的 Codex 不卸', () => {
    expect(planRestore(inputs({ original: original({ codexInstalled: true }) })).map(s => s.kind)).not.toContain('uninstall-codex');
  });
  test('C-10 还原时把分身和汉化版图标一起去掉，先关掉 Codex', () => {
    const steps = planRestore(inputs({ codexRunning: true, zhLauncherNow: true, clones: ['DeepSeek', 'Kimi'] }));
    expect(steps).toEqual([
      { kind: 'close-codex' }, { kind: 'config' }, { kind: 'remove-zh-launcher' },
      { kind: 'remove-clone', vendor: 'DeepSeek' }, { kind: 'remove-clone', vendor: 'Kimi' },
      { kind: 'uninstall-codex' }, { kind: 'clear-browser-logins' },
    ]);
  });
  test('原来就有汉化版图标：不去掉', () => {
    expect(planRestore(inputs({ zhLauncherNow: true, original: original({ zhLauncher: true }) })).map(s => s.kind)).not.toContain('remove-zh-launcher');
  });
  test('没有安装前的记录：不动配置、不卸 Codex', () => {
    const kinds = planRestore(inputs({ original: null, clones: ['DeepSeek'] })).map(s => s.kind);
    expect(kinds).toEqual(['remove-clone', 'clear-browser-logins']);
    expect(planRestore(inputs({ original: null }))).toEqual([]);
  });
  test('T-03 确认框列出会做的事，聊天记录保留，句末没有标点', () => {
    const lines = describeRestore(planRestore(inputs({ codexRunning: true, zhLauncherNow: true, clones: ['DeepSeek'] })));
    expect(lines).toEqual([
      '先关掉正在运行的 Codex', 'Codex 的配置恢复成用 CodexBuddy 之前的样子', '去掉「ChatGPT 汉化版」图标', '去掉分身「DeepSeek」这个 App',
      '卸掉 CodexBuddy 装的 Codex', '退出右侧浏览器里的登录', '聊天记录和分身的聊天记录都留着',
    ]);
    for (const l of lines) expect(l).not.toMatch(/[。，.!！？?]$/);
    expect(describeRestore([])).toEqual(['没有要还原的东西']);
  });
});
