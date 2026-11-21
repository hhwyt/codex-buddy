// Update dialog. Owner: A6. U-01 普通更新只点亮侧栏「有新版本」，点了才弹窗；U-02 立即更新 → progress → 重启;
// U-03 Mac unsigned: main opens the download page in the right-side browser and answers { ok, downloadPage: true }.
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';

/** Shows the update dialog (also used by 设置 → 检查更新, which always shows it) */
export function showUpdate(api: BuddyApi, root: HTMLElement, info: { version: string; notes: string }): HTMLElement {
  root.querySelector(`[data-testid="${TID.update.root}"]`)?.closest('.scrim')?.remove();
  const notes = info.notes.split('\n').map(l => l.trim()).filter(Boolean);
  const pct = h('b', { class: 'pct' }, '0%');
  const progress = h('div', { class: 'update-ring', 'data-testid': TID.update.progress, hidden: true }, pct);
  const title = h('h2', {}, `有新版本 ${info.version}`);
  const list = h('ul', { class: 'update-notes' }, ...notes.map(n => h('li', {}, n)));
  const close = () => { off(); scrim.remove(); };
  const later = h('button', { class: 'btn', type: 'button', 'data-testid': TID.update.later, onclick: () => close() }, '稍后');
  let ready = false;
  const now = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.update.now, onclick: () => void install() }, '立即更新');
  const box = h('div', { class: 'dialog update', role: 'dialog', 'aria-modal': 'true', 'data-testid': TID.update.root },
    progress, title, list, h('div', { class: 'row' }, later, now));
  const scrim = h('div', { class: 'scrim' }, box);
  const off = api.on('step', s => {
    if (s.flow !== 'update') return;
    const m = /(\d{1,3})\s*%/.exec(s.text);
    if (m) pct.textContent = `${Math.min(100, Number(m[1]))}%`;
  });

  async function install(): Promise<void> {
    if (ready) { void api.invoke('update:install'); return; } // second call: restart into the new version
    now.disabled = true;
    later.hidden = true;
    list.hidden = true;
    progress.hidden = false;
    title.textContent = '正在更新';
    const res = await api.invoke('update:install');
    if (!res.ok) {
      close();
      toast(res.reason ?? '没更新成功，稍后再试', { error: true });
      return;
    }
    if (res.downloadPage) { // U-03
      close();
      toast('已在右侧打开下载页');
      return;
    }
    ready = true;
    pct.textContent = '100%';
    title.textContent = '下载好了';
    now.disabled = false;
    now.textContent = '重启';
    later.hidden = false;
  }

  root.append(scrim);
  return box;
}

/** U-01: subscribe once at startup; call onNew when a newer version is available (no dialog here) */
export function watchUpdates(api: BuddyApi, onNew: (info: { version: string; notes: string }) => void): () => void {
  const off = api.on('update', info => onNew(info));
  // The main process may announce before this page listens: ask once as well
  void api.invoke('update:check').then(r => { if (r?.kind === 'new') onNew(r); }).catch(() => undefined);
  return off;
}
