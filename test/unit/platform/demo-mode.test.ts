// 演示模式开关：默认关，只有带 --demo-mode 启动才开（electron/platform/mac.ts demo-fast-install）
import { describe, expect, it } from 'vitest';
import { demoModeOn } from '../../../electron/platform/mac';

describe('演示模式', () => {
  it('默认关：普通启动参数不开', () => {
    expect(demoModeOn(['/Applications/CodexBuddy.app/Contents/MacOS/CodexBuddy'])).toBe(false);
    expect(demoModeOn([])).toBe(false);
  });
  it('带 --demo-mode 启动才开', () => {
    expect(demoModeOn(['/Applications/CodexBuddy.app/Contents/MacOS/CodexBuddy', '--demo-mode'])).toBe(true);
  });
});
