import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import type { UpgradeRequiredView, VersionStatus } from '../../electron/main/ipc-contract.js';

export function showUpgrade(api: BuddyApi, root: HTMLElement, info: UpgradeRequiredView | null,
  opts: { os: 'mac' | 'win'; current: string; qr: string; status?: VersionStatus }): HTMLElement {
  const scrim = h('div', { class: 'scrim version-gate', 'data-testid': TID.upgrade.root });
  const title = h('h2', {}, info ? '升级后继续使用' : opts.status === 'offline' ? '连上网后才能使用' : '正在校验版本');
  const message = h('p', {}, info ? `请升级到 ${info.version}` : opts.status === 'offline' ? '请检查网络后重试' : '');
  const progress = h('progress', { max: 100, value: 0, 'aria-label': '下载进度', 'data-testid': TID.upgrade.progress });
  progress.hidden = true;
  const quit = h('button', { class: 'btn', type: 'button', onclick: () => void api.invoke('app:quit') }, '退出 CodexBuddy');
  const now = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.upgrade.download }, info ? '立即升级' : '重新连接');
  now.hidden = !info && opts.status !== 'offline';
  const actions = h('div', { class: 'row' }, quit, now);
  const dialog = h('div', { class: 'dialog version-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'version-title' }, title, message, progress, actions);
  title.id = 'version-title';
  scrim.append(dialog);
  let busy = false;
  let downloaded = false;
  const unsubscribe = api.on('step', event => {
    if (event.flow !== 'upgrade' || !busy) return;
    const percent = /(\d{1,3})%/.exec(event.text);
    if (percent) progress.value = Math.min(100, Number(percent[1]));
    if (event.state === 'done') { title.textContent = '正在安装更新'; progress.hidden = true; }
  });
  now.onclick = async () => {
    if (busy) return;
    busy = true;
    now.disabled = true;
    scrim.dataset.busy = 'true';
    try {
      if (!info) { await api.invoke('update:check'); return; }
      title.textContent = downloaded ? '正在安装更新' : `正在下载 ${info.version}`;
      message.textContent = '';
      progress.hidden = downloaded;
      progress.value = 0;
      const result = await api.invoke('upgrade:run');
      if (!result.ok) throw new Error();
      downloaded = true;
      progress.hidden = true;
      if (opts.os === 'mac') {
        title.textContent = '安装 CodexBuddy';
        message.textContent = '拖进「应用程序」并替换，然后重新打开';
        now.textContent = '再打开安装包';
      } else {
        title.textContent = '正在安装更新';
        now.hidden = true;
      }
    } catch {
      title.textContent = info ? '升级没成功' : '连上网后才能使用';
      message.textContent = info ? '请检查网络后重试' : '请检查网络后重试';
      progress.hidden = true;
      now.textContent = info ? '再试一次' : '重新连接';
    } finally { busy = false; now.disabled = false; delete scrim.dataset.busy; }
  };
  const onKey = (event: KeyboardEvent) => {
    if (!scrim.isConnected) { document.removeEventListener('keydown', onKey); unsubscribe(); return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (document.activeElement === quit && !now.hidden && !now.disabled ? now : quit).focus();
    }
  };
  scrim.addEventListener('dispose', () => { document.removeEventListener('keydown', onKey); unsubscribe(); }, { once: true });
  document.addEventListener('keydown', onKey);
  root.append(scrim);
  quit.focus();
  return scrim;
}
