// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"handleDisabledFileLoadingAsSuccess":true}}
import { describe, expect, test } from 'vitest';
import { createProgress, overallPercent } from '../../ui/components/progress';
import { TID } from '../../ui/testids';

describe('progress', () => {
  test('O-01 做完一行打一个勾，同一步原位更新', () => {
    const p = createProgress();
    p.update({ flow: 'install', id: 'a', state: 'start', text: '检测电脑' });
    p.update({ flow: 'install', id: 'b', state: 'start', text: '安装 Codex' });
    p.update({ flow: 'install', id: 'a', state: 'done', text: '检测电脑' });
    const rows = [...p.el.children] as HTMLElement[];
    expect(rows.map(r => r.dataset.testid)).toEqual([TID.onboarding.step('a'), TID.onboarding.step('b')]);
    expect(rows[0].textContent).toBe('✓检测电脑');
    expect(rows[1].dataset.state).toBe('start');
    p.update({ flow: 'install', id: 'b', state: 'fail', text: '安装 Codex' });
    expect(rows[1].textContent).toBe('✕安装 Codex');
  });

  test('O-01 圆环走总进度：做完几步占几成，正在做的那步按它自己的百分比算，只往前不往后', () => {
    const p = createProgress();
    const pct = () => p.ring.textContent;
    const bar = () => Number(p.ring.querySelector('.bar')!.getAttribute('stroke-dashoffset'));
    const full = bar();
    expect(pct()).toBe('0%');
    p.update({ flow: 'install', id: 'download', state: 'start', text: '下载 Codex 45%' });
    expect(pct()).toBe('15%');
    p.update({ flow: 'install', id: 'download', state: 'done', text: '下载 Codex' });
    expect(pct()).toBe('33%');
    expect(bar()).toBeCloseTo(full * (1 - 0.33), 0);
    p.update({ flow: 'install', id: 'copy', state: 'fail', text: '装进应用程序' });
    expect(pct()).toBe('33%'); // a failed step adds nothing, and 再试一次 picks up from here
    p.update({ flow: 'install', id: 'copy', state: 'done', text: '装进应用程序' });
    p.update({ flow: 'install', id: 'check', state: 'done', text: '检查 Codex' });
    expect(pct()).toBe('100%');
    expect(bar()).toBe(0);
  });

  test('O-01 Windows 报的步骤比 3 步多：按实际步数算；百分比超过 100 按 100', () => {
    expect(overallPercent([{ state: 'done', text: '' }, { state: 'done', text: '' }, { state: 'done', text: '' }, { state: 'start', text: '' }])).toBe(75);
    expect(overallPercent([{ state: 'start', text: '下载 250%' }])).toBe(33);
    expect(overallPercent([])).toBe(0);
  });
});
