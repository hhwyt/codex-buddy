// @vitest-environment happy-dom
// E-01 / E-05: every error surface shows 去社群咨询 (TID.help) and none of the removed
// 退出 / 稍后 / 先不了 / 复制日志 controls; error toasts carry ✕ + help and last 8 s.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../ui/app';
import { keyFailed } from '../../ui/components/card-actions';
import { promptRestart } from '../../ui/components/restart';
import { toast } from '../../ui/components/toast';
import { renderInstallVerify } from '../../ui/pages/install-verify';
import { renderOnboarding } from '../../ui/pages/onboarding';
import { showUpgrade } from '../../ui/pages/upgrade';
import { TID } from '../../ui/testids';
import { appState, click, fakeApi, settle } from './settings.fake';

const $ = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const INFO = { version: '0.2.0', notes: '', url: 'https://github.com/x/app.dmg' };
const FORBIDDEN = ['退出 CodexBuddy', '稍后', '先不了', '复制日志'];

/** Text of a node skipping anything inside a [hidden] element (E-01's「稍后」button is hidden, not gone). */
function visibleText(root: HTMLElement): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += child.textContent ?? '';
      else if (child.nodeType === 1) {
        const el = child as HTMLElement;
        if (!el.hidden) walk(el);
      }
    }
  };
  walk(root);
  return out;
}

beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });
afterEach(() => { document.body.replaceChildren(); document.documentElement.classList.remove('os-mac'); vi.useRealTimers(); });

describe('E-01 报错处都有去社群咨询，没有退出/稍后/先不了/复制日志', () => {
  it('E-01 网络问题弹窗', async () => {
    await createApp(document.body, fakeApi({ 'network:check': { ok: false } }).api);
    const box = $(TID.network.error)!;
    expect(box.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    for (const w of FORBIDDEN) expect(visibleText(box)).not.toContain(w);
  });

  it('E-01 升级失败', async () => {
    const fake = fakeApi({ 'upgrade:run': { ok: false, reason: '下载失败' } });
    showUpgrade(fake.api, document.body, INFO, { os: 'win', current: '0.1.0', qr: '' });
    click($(TID.upgrade.download));
    await settle();
    const gate = $(TID.upgrade.root)!;
    expect(gate.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    expect($(TID.upgrade.skip)).not.toBeNull();
    for (const w of FORBIDDEN) expect(visibleText(gate)).not.toContain(w);
  });

  it('E-01 拿 Key 失败', () => {
    void keyFailed('登录后没能自动建 Key');
    const box = $(TID.dialog.root)!;
    expect(box.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    expect($(TID.dialog.cancel)).toBeNull();
    expect($(TID.dialog.confirm)!.textContent).toBe('重试');
    for (const w of FORBIDDEN) expect(visibleText(box)).not.toContain(w);
  });

  it('E-01 重启失败', async () => {
    const fake = fakeApi({ 'codex:restart': { ok: false } });
    void promptRestart(fake.api);
    click($(TID.restart.now));
    await settle();
    const box = $(TID.restart.root)!;
    expect(box.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    expect($(TID.restart.later)!.hidden).toBe(true);
    expect($(TID.restart.now)!.textContent).toBe('重试');
    for (const w of FORBIDDEN) expect(visibleText(box)).not.toContain(w);
  });

  it('E-01 安装验证失败', async () => {
    document.documentElement.classList.add('os-mac');
    renderInstallVerify({ api: fakeApi({ 'install:run': { ok: false, reason: '下载没成功' } }).api, root: document.body, go: () => {} });
    await settle();
    const box = $(TID.verify.root)!;
    expect(box.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    expect($(TID.verify.later)).toBeNull();
    expect($(TID.verify.retry)!.textContent).toBe('重试');
    for (const w of FORBIDDEN) expect(visibleText(box)).not.toContain(w);
  });

  it('E-01 引导安装没装好', async () => {
    document.documentElement.classList.add('os-mac');
    renderOnboarding({ api: fakeApi({ 'install:run': { ok: false, reason: '没装好' } }).api, root: document.body, go: () => {} });
    await settle();
    const box = $(TID.onboarding.root)!;
    expect(box.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    expect($(TID.onboarding.copyLog)).toBeNull();
    expect($(TID.onboarding.logPreview)).toBeNull();
    expect($(TID.onboarding.toCommunity)).toBeNull();
    expect($(TID.onboarding.retry)!.textContent).toBe('重试');
    for (const w of FORBIDDEN) expect(visibleText(box)).not.toContain(w);
  });

  it('E-01 出错提示条', () => {
    const el = toast('有个文件正被占用', { error: true });
    expect(el.classList.contains('error')).toBe(true);
    expect(el.querySelector('.toast-x')).not.toBeNull();
    expect(el.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    for (const w of FORBIDDEN) expect(visibleText(el)).not.toContain(w);
  });
});

describe('E-05 出错提示条时长和 help 开关', () => {
  it('E-05 error toast 8 秒后消失、有 ✕ 和 help；help:false 没有 help', () => {
    vi.useFakeTimers();
    const el = toast('有个文件正被占用', { error: true });
    expect($(TID.toast)).not.toBeNull();
    expect(el.querySelector('.toast-x')).not.toBeNull();
    expect(el.querySelector(`[data-testid="${TID.help}"]`)).not.toBeNull();
    vi.advanceTimersByTime(8000);
    expect($(TID.toast)).toBeNull();

    const plain = toast('没复制成功', { error: true, help: false });
    expect(plain.querySelector('.toast-x')).not.toBeNull();
    expect(plain.querySelector(`[data-testid="${TID.help}"]`)).toBeNull();
  });
});
