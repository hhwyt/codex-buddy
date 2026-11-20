import type { BuddyApi } from '../api.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';

const prompts = new WeakMap<BuddyApi, Promise<boolean>>();

/** One confirmation for the main desktop app; never asks merely because a file was saved unchanged. */
export function promptRestart(api: BuddyApi, open = false, vendorName?: string): Promise<boolean> {
  const existing = prompts.get(api);
  if (existing) return existing;
  const result = new Promise<boolean>(resolve => {
    const previousFocus = document.activeElement as HTMLElement | null;
    let busy = false;
    const title = h('h2', { id: 'restart-title' }, open ? '配置已保存' : '现在重启 ChatGPT？');
    const text = h('p', {}, open ? (vendorName ? `现在打开 ChatGPT，试试 ${vendorName}？` : '现在打开 ChatGPT，体验新配置？') : '配置已保存，重启后生效。重启会中断正在进行的任务。');
    const error = h('p', { class: 'err', role: 'alert' });
    error.hidden = true;
    const close = (restarted: boolean) => {
      scrim.remove();
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(restarted);
    };
    const later = h('button', { class: 'btn', type: 'button', 'data-testid': TID.restart.later, onclick: () => close(false) }, '稍后');
    const now = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.restart.now, onclick: async () => {
      if (busy) return;
      busy = true;
      later.disabled = now.disabled = true;
      error.hidden = true;
      title.textContent = open ? '正在打开 ChatGPT' : '正在重启 ChatGPT';
      now.textContent = open ? '正在打开' : '正在重启';
      try {
        const result = await api.invoke('codex:restart');
        if (!result.ok) throw new Error();
        close(true);
      } catch {
        title.textContent = open ? '没能打开 ChatGPT' : '没能重启 ChatGPT';
        text.textContent = '配置已保存，重启 ChatGPT 后生效。';
        error.textContent = '请先保存任务并退出 ChatGPT，再试一次。';
        error.hidden = false;
        now.textContent = '再试一次';
        later.disabled = now.disabled = false;
        now.focus();
      } finally { busy = false; }
    } }, open ? '打开 ChatGPT' : '立即重启');
    const box = h('div', { class: 'dialog restart-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'restart-title', 'data-testid': TID.restart.root },
      ...(open ? [h('div', { class: 'restart-saved', 'aria-hidden': 'true' }, '✓')] : []), title, text, ...(open ? [h('p', { class: 'restart-consequence' }, '如果 ChatGPT 已在运行，会先退出再打开，正在进行的任务会中断。')] : []), error, h('div', { class: 'row' }, later, now));
    const scrim = h('div', { class: 'scrim' }, box);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busy) close(false); }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (!busy) (document.activeElement === later ? now : later).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.append(scrim);
    later.focus();
  });
  prompts.set(api, result);
  void result.then(() => prompts.delete(api));
  return result;
}

export function restartNotice(api: BuddyApi, required: boolean): HTMLElement {
  const notice = h('div', { class: 'restart-notice', role: 'status', 'data-testid': TID.restart.notice },
    h('span', {}, '配置已保存，重启 ChatGPT 后生效'),
    h('button', { class: 'btn small', type: 'button', onclick: () => void promptRestart(api) }, '立即重启'));
  notice.hidden = !required;
  api.on('restartRequired', pending => { notice.hidden = !pending; });
  return notice;
}
