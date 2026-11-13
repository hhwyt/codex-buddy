// Update dialog. Owner: A6. U-01 稍后 → same version not again within a day; U-02 立即更新 → progress → 重启;
// U-03 Mac unsigned: main opens the download page in the right-side browser and answers { ok, downloadPage: true }.
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_KEY = 'codexbuddy.update.dismissed';

function dismissedRecently(version: string, now: number): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? 'null') as { version: string; at: number } | null;
    return !!saved && saved.version === version && now - saved.at < DAY_MS;
  } catch { return false; }
}

function rememberDismiss(version: string, now: number): void {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify({ version, at: now })); } catch { /* storage off: main still remembers */ }
}

/** Shows the update dialog (also used by 设置 → 检查更新, which always shows it) */
export function showUpdate(api: BuddyApi, root: HTMLElement, info: { version: string; notes: string }): HTMLElement {
  root.querySelector(`[data-testid="${TID.update.root}"]`)?.closest('.scrim')?.remove();
  const notes = info.notes.split('\n').map(l => l.trim()).filter(Boolean);
  const pct = h('b', { class: 'pct' }, '0%');
  const progress = h('div', { class: 'update-ring', 'data-testid': TID.update.progress, hidden: true }, pct);
  const title = h('h2', {}, `发现新版本 ${info.version}`);
  const list = h('ul', { class: 'update-notes' }, ...notes.map(n => h('li', {}, n)));
  const close = () => { off(); scrim.remove(); };
  const later = h('button', { class: 'btn', type: 'button', 'data-testid': TID.update.later, onclick: () => {
    rememberDismiss(info.version, Date.now());
    void api.invoke('update:dismiss', { version: info.version });
    close();
  } }, '稍后');
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
  }

  root.append(scrim);
  return box;
}

/** U-01: subscribe once at startup; the same version pops at most once a day */
export function watchUpdates(api: BuddyApi, root: HTMLElement): () => void {
  return api.on('update', info => {
    if (dismissedRecently(info.version, Date.now())) return;
    if (root.querySelector(`[data-testid="${TID.update.root}"]`)) return;
    showUpdate(api, root, info);
  });
}
