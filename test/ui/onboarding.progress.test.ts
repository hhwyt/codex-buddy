// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"handleDisabledFileLoadingAsSuccess":true}}
import { describe, expect, test } from 'vitest';
import { createProgress } from '../../ui/components/progress';
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
});
