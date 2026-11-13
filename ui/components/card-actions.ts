// Dialogs the model page opens: first success (M-20), ＋ 其他厂商 form (M-19), delete a clone (C-07),
// key creation failed (M-10). Owner: A5.
import type { BuddyApi } from '../api.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import { dialog } from './dialog.js';

const FOLLOW = '关注 黄金金不AI 看教程';

/** M-20: 「从零到能用 N 秒」+「打开 Codex」+ 关注行. Resolves when closed. */
export function firstSuccess(api: BuddyApi, seconds: number, root: HTMLElement = document.body): Promise<void> {
  return new Promise(resolve => {
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const box = h('div', { class: 'dialog first-success', role: 'dialog', 'aria-modal': 'true', 'data-testid': TID.firstSuccess.root },
      h('div', { class: 'fs-sub' }, '从零到能用'),
      h('div', { class: 'fs-count' }, h('span', { 'data-testid': TID.firstSuccess.seconds }, String(Math.max(0, Math.round(seconds)))), h('span', { class: 'fs-unit' }, ' 秒')),
      h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.firstSuccess.openCodex, onclick: () => { void api.invoke('codex:open', {}); close(); } }, '打开 Codex'),
      h('div', { class: 'fs-follow' }, FOLLOW));
    const scrim = h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === scrim) close(); } }, box);
    document.addEventListener('keydown', onKey);
    root.append(scrim);
  });
}

/** M-19: name / Base URL / model / Key → 测试连通 → card added. Resolves true when a card was added. */
export function customVendor(api: BuddyApi, root: HTMLElement = document.body): Promise<boolean> {
  return new Promise(resolve => {
    const field = (label: string, testid: string, type = 'text', placeholder = '') =>
      h('input', { class: 'field', type, placeholder, 'aria-label': label, 'data-testid': testid, autocomplete: 'off' });
    const name = field('名字', TID.models.customName, 'text', '名字');
    const baseUrl = field('Base URL', TID.models.customBaseUrl, 'text', 'Base URL');
    const model = field('模型', TID.models.customModel, 'text', '模型');
    const key = field('Key', TID.models.customKey, 'password', 'Key');
    const err = h('p', { class: 'form-error', role: 'alert' });
    err.hidden = true;
    const close = (v: boolean) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    const submit = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.models.customSubmit }, '测试连通');
    submit.addEventListener('click', async () => {
      const args = { name: name.value.trim(), baseUrl: baseUrl.value.trim(), model: model.value.trim(), apiKey: key.value.trim() };
      if (!args.name || !args.baseUrl || !args.model || !args.apiKey) { err.textContent = '四项都要填'; err.hidden = false; return; }
      submit.disabled = true;
      submit.textContent = '正在测试连通';
      let r;
      try { r = await api.invoke('custom:add', args); } catch { r = { ok: false }; }
      if (r.ok) { close(true); return; }
      submit.disabled = false;
      submit.textContent = '测试连通';
      err.textContent = r.reason ?? '没连通，检查一下再试';
      err.hidden = false;
    });
    const box = h('div', { class: 'dialog custom-vendor', role: 'dialog', 'aria-modal': 'true' },
      h('h2', {}, '其他厂商'),
      name, baseUrl, model, key, err,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: () => close(false) }, '先不了'),
        submit));
    const scrim = h('div', { class: 'scrim', onclick: (e: Event) => { if (e.target === scrim) close(false); } }, box);
    document.addEventListener('keydown', onKey);
    root.append(scrim);
    name.focus();
  });
}

/** C-07: confirm first; only the App goes, its chats and settings stay */
export function confirmRemoveClone(name: string, root?: HTMLElement): Promise<boolean> {
  return dialog({
    title: `删除分身「${name}」`,
    lines: ['只删这个 App，聊天记录和设置留着。再做同名分身时自动接上。'],
    confirm: '删除', cancel: '先不了', danger: true, root,
  });
}

/** M-10: key creation failed → reason +「再试一次」 */
export function keyFailed(reason: string | undefined, root?: HTMLElement): Promise<boolean> {
  return dialog({
    title: '没拿到 Key',
    lines: [reason ?? '登录后没能自动建 Key'],
    confirm: '再试一次', cancel: '先不了', root,
  });
}
