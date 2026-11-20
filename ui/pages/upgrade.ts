import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import type { UpgradeRequiredView, VersionStatus } from '../../electron/main/ipc-contract.js';
import { showCommunityOverlay } from './community.js';

export function showUpgrade(api: BuddyApi, root: HTMLElement, info: UpgradeRequiredView | null,
  opts: { os: 'mac' | 'win'; current: string; qr: string; status?: VersionStatus }): HTMLElement {
  const scrim = h('div', { class: 'scrim version-gate', 'data-testid': TID.upgrade.root });
  const title = h('h2', {}, info ? '升级后继续使用' : opts.status === 'offline' ? '网络问题' : '正在校验版本');
  const message = h('p', {}, info ? `请升级到 ${info.version}` : opts.status === 'offline' ? '请检查网络后重试。' : '');
  const progress = h('progress', { max: 100, value: 0, 'aria-label': '下载进度', 'data-testid': TID.upgrade.progress });
  progress.hidden = true;
  const quit = h('button', { class: 'btn', type: 'button', onclick: () => void api.invoke('app:quit') }, '退出 CodexBuddy');
  const now = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.upgrade.download }, info ? '立即升级' : '重试');
  now.hidden = !info && opts.status !== 'offline';
  const community = h('button', { class: 'btn', type: 'button', 'data-testid': TID.upgrade.community }, '去社群问问');
  const actions = h('div', { class: 'row' }, quit, now);
  let communityAdded = false;
  const addCommunity = () => { if (!communityAdded) { actions.insertBefore(community, now); communityAdded = true; } };
  if (opts.status === 'offline') addCommunity();
  const dialog = h('div', { class: 'dialog version-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'version-title' }, title, message, progress, actions);
  title.id = 'version-title';
  scrim.append(dialog);
  let busy = false;
  let downloaded = false;
  let overlay: ReturnType<typeof showCommunityOverlay> | null = null;
  const unsubscribe = api.on('step', event => {
    if (event.flow !== 'upgrade' || !busy) return;
    const percent = /(\d{1,3})%/.exec(event.text);
    if (percent) progress.value = Math.min(100, Number(percent[1]));
    if (event.state === 'done') { title.textContent = '正在安装更新'; progress.hidden = true; }
  });
  function openCommunity(): void {
    overlay?.close();
    overlay = showCommunityOverlay(api, root, { offline: opts.status === 'offline' }, () => {
      overlay = null;
      community.focus();
    });
  }
  community.onclick = () => openCommunity();
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
      title.textContent = info ? '升级没成功' : '网络问题';
      message.textContent = '请检查网络后重试。';
      progress.hidden = true;
      now.textContent = info ? '再试一次' : '重试';
      addCommunity();
    } finally { busy = false; now.disabled = false; delete scrim.dataset.busy; }
  };
  const onKey = (event: KeyboardEvent) => {
    if (!scrim.isConnected) { document.removeEventListener('keydown', onKey); unsubscribe(); return; }
    if (overlay) return; // the lock overlay owns the keyboard while it is open
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = [quit, ...(communityAdded ? [community] : []), now].filter(b => !b.hidden && !b.disabled);
      if (buttons.length) buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length].focus();
    }
  };
  scrim.addEventListener('dispose', () => { overlay?.close(); document.removeEventListener('keydown', onKey); unsubscribe(); }, { once: true });
  document.addEventListener('keydown', onKey);
  root.append(scrim);
  quit.focus();
  return scrim;
}
