// Forced upgrade screen (ui-design/force-upgrade.html, version 4). Owner: A6.
// The running version is below the remote minVersion: the whole window is this one screen until the user installs the
// new version. A big ring carries the download; then Mac shows the icon being dragged into 「应用程序」, Windows runs the
// installer (which quits this app and opens the new one). Codex itself keeps working.
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import type { UpgradeRequiredView } from '../../electron/main/ipc-contract.js';

const R = 63;
const C = 2 * Math.PI * R;
const FOLDER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13l3 3 3-3M12 9v7"/></svg>';
const CURSOR_SVG = '<svg class="upg-cursor" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1l11 5-5 1.5L5.5 13z"/></svg>';

type Phase = 'idle' | 'download' | 'install' | 'drag';

export function showUpgrade(api: BuddyApi, root: HTMLElement, info: UpgradeRequiredView, opts: { os: 'mac' | 'win'; current: string; qr: string }): HTMLElement {
  const existing = root.querySelector<HTMLElement>(`[data-testid="${TID.upgrade.root}"]`);
  if (existing) return existing;
  const hero = h('div', { class: 'upg-hero' });
  const words = h('div', { class: 'upg-words' });
  const act = h('div', { class: 'upg-act' });
  const screen = h('div', { class: 'upgrade', 'data-testid': TID.upgrade.root }, h('div', { class: 'upg-center' }, hero, words, act));
  let phase: Phase = 'idle';
  let pct = 0;
  let size = '';

  const ring = (center: Node, cls = '') => {
    const el = h('div', { class: `upg-ring ${cls}`.trim(), 'data-testid': TID.upgrade.progress });
    el.innerHTML = `<svg viewBox="0 0 132 132" aria-hidden="true"><circle class="track" cx="66" cy="66" r="${R}"/><circle class="bar" cx="66" cy="66" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(2)}"/></svg>`;
    el.append(center);
    return el;
  };
  const vline = () => h('p', { class: 'upg-vline' }, '当前 ', h('s', {}, opts.current), h('span', { class: 'upg-arrow' }, '→'), '需要 ', h('b', {}, info.version));
  const calm = (t: string) => h('p', { class: 'upg-calm' }, t);

  function render(): void {
    if (phase === 'idle') {
      hero.replaceChildren(ring(h('b', {}, info.version)));
      words.replaceChildren(h('h1', {}, '该升级了'), vline(), calm('Codex 照常能用，已配好的模型不受影响'));
      act.replaceChildren(
        h('button', { class: 'btn primary big', type: 'button', 'data-testid': TID.upgrade.download, onclick: () => void download() }, opts.os === 'mac' ? '下载新版' : '下载并安装'),
        h('button', { class: 'lnk', type: 'button', 'data-testid': TID.upgrade.ask, onclick: showQr }, '有问题？加群咨询'));
    } else if (phase === 'download') {
      hero.replaceChildren(ring(h('b', {}, String(pct), h('small', {}, '%'))));
      words.replaceChildren(h('h1', { class: 'small' }, `正在下载 ${info.version}`), h('p', { class: 'upg-size' }, size));
      act.replaceChildren();
    } else if (phase === 'install') {
      hero.replaceChildren(ring(h('b', { class: 'upg-label' }, '安装中'), 'spinning'));
      words.replaceChildren(h('h1', { class: 'small' }, '正在安装'), calm('装好会自动打开新版'));
      act.replaceChildren();
    } else {
      const dmg = h('div', { class: 'upg-dmg' }, h('div', { class: 'tb' }, `CodexBuddy ${info.version}`), h('div', { class: 'body' }));
      dmg.lastElementChild!.innerHTML = `<div class="app">C</div><div class="dir">${FOLDER_SVG}</div>${CURSOR_SVG}<div class="lb a">CodexBuddy</div><div class="lb b">应用程序</div>`;
      hero.replaceChildren(dmg);
      words.replaceChildren(h('h1', { class: 'small' }, '把它拖进「应用程序」'), calm('拖好后退出这个窗口，再打开 CodexBuddy'));
      act.replaceChildren(h('div', { class: 'upg-row' },
        h('button', { class: 'btn', type: 'button', 'data-testid': TID.upgrade.reopen, onclick: () => void api.invoke('upgrade:run') }, '再打开安装包'),
        h('button', { class: 'btn', type: 'button', 'data-testid': TID.upgrade.quit, onclick: () => window.close() }, '退出')));
    }
  }

  /** During the download only the numbers move, so nothing else restarts its animation */
  function tick(): void {
    const bar = hero.querySelector('.bar');
    if (bar) bar.setAttribute('stroke-dashoffset', (C * (1 - pct / 100)).toFixed(2));
    const b = hero.querySelector('b');
    if (b) b.replaceChildren(String(pct), h('small', {}, '%'));
    const s = words.querySelector('.upg-size');
    if (s) s.textContent = size;
  }

  api.on('step', s => {
    if (s.flow !== 'upgrade' || phase !== 'download') return;
    if (s.state === 'done') { if (opts.os === 'win') { phase = 'install'; render(); } return; }
    const p = /(\d{1,3})%/.exec(s.text);
    if (p) pct = Math.min(100, Number(p[1]));
    size = /[\d.]+( \/ [\d.]+)? MB/.exec(s.text)?.[0] ?? size;
    tick();
  });

  async function download(): Promise<void> {
    phase = 'download';
    pct = 0;
    size = '';
    render();
    const res = await api.invoke('upgrade:run');
    if (!res.ok) {
      phase = 'idle';
      render();
      toast(res.reason ?? '下载没成功，检查一下网络再试', { error: true });
      return;
    }
    phase = opts.os === 'mac' ? 'drag' : 'install';
    render();
  }

  function showQr(): void {
    const close = () => layer.remove();
    const layer = h('div', { class: 'scrim upg-qr', onclick: (e: Event) => { if (e.target === layer) close(); } },
      h('div', { class: 'dialog' },
        h('img', { class: 'community-qr', src: opts.qr, alt: '企业微信群二维码', 'data-testid': TID.upgrade.qr }),
        h('p', { class: 'community-line' }, '使用有问题？加群咨询'),
        h('p', { class: 'community-sub' }, '扫码加入企业微信群'),
        h('button', { class: 'lnk', type: 'button', 'data-testid': TID.upgrade.qrClose, onclick: close }, '关闭')));
    screen.append(layer);
  }

  render();
  root.replaceChildren(screen);
  return screen;
}
