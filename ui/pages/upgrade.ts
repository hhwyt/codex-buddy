import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import type { UpgradeRequiredView, VersionStatus } from '../../electron/main/ipc-contract.js';
import { helpLink } from '../components/help.js';

export function showUpgrade(api: BuddyApi, root: HTMLElement, info: UpgradeRequiredView | null,
  opts: { os: 'mac' | 'win'; current: string; qr: string; status?: VersionStatus }): HTMLElement {
  const scrim = h('div', { class: 'scrim version-gate', 'data-testid': TID.upgrade.root });
  const title = h('h2', {}, info ? '升级后继续使用' : '网络问题');
  const message = h('p', {}, info ? `请升级到 ${info.version}` : '请检查网络后重试。');
  const progress = h('progress', { max: 100, value: 0, 'aria-label': '下载进度', 'data-testid': TID.upgrade.progress });
  progress.hidden = true;
  const help = helpLink();
  const skip = h('button', { class: 'btn', type: 'button', 'data-testid': TID.upgrade.skip, onclick: () => void skipUpgrade() }, '本次先跳过');
  const now = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.upgrade.download }, info ? '立即升级' : '重试');
  const actions = h('div', { class: 'row' }, help, skip, now);
  const setHelp = (on: boolean) => { help.hidden = !on; };
  const setSkip = (on: boolean) => { skip.hidden = !on; };
  setHelp(opts.status === 'offline');
  setSkip(false);
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
      if (!result.ok) throw new Error(result.reason);
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
    } catch (error) {
      title.textContent = info ? '升级没成功' : '网络问题';
      message.textContent = (info && error instanceof Error && error.message) || '请检查网络后重试。';
      progress.hidden = true;
      now.textContent = '重试';
      setHelp(true);
      setSkip(!!info);
    } finally { busy = false; now.disabled = false; delete scrim.dataset.busy; }
  };
  async function skipUpgrade(): Promise<void> {
    if (busy) return;
    await api.invoke('upgrade:skip');
  }
  const onKey = (event: KeyboardEvent) => {
    if (!scrim.isConnected) { document.removeEventListener('keydown', onKey); unsubscribe(); return; }
    if (scrim.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      const buttons = [help, skip, now].filter(b => !b.hidden && !(b as HTMLButtonElement).disabled);
      if (buttons.length) buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + 1) % buttons.length].focus();
    }
  };
  scrim.addEventListener('dispose', () => { document.removeEventListener('keydown', onKey); unsubscribe(); }, { once: true });
  document.addEventListener('keydown', onKey);
  root.append(scrim);
  now.focus();
  return scrim;
}
