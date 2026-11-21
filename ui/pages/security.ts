// 🛡 security panel (overlay). Owner: A6. S-01..S-07: keys masked (the page only ever gets the last 4 chars), reveal in
// Finder / Explorer, 去官网管理, sites in two lists (CodexBuddy 连过的 / 网页里连过的, live), 让 AI 帮我检查, 查看源代码.
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';
import type { ConnectionView } from '../../electron/main/ipc-contract.js';

/** S-01: what a key looks like on screen */
export const maskKey = (tail: string) => `sk-••••${tail.slice(-4)}`;

export function when(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  const d = new Date(at);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return '今天';
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function siteList(sites: ConnectionView[], now: number): HTMLElement[] {
  if (!sites.length) return [h('div', { class: 'muted small' }, '还没有连过')];
  // newest first, one row per host
  const seen = new Map<string, ConnectionView>();
  for (const c of [...sites].sort((a, b) => b.at - a.at)) if (!seen.has(c.host)) seen.set(c.host, c);
  return [
    ...[...seen.values()].map(c => h('div', { class: c.allowed ? 'kv' : 'kv blocked' },
      h('span', {}, c.host), h('span', { class: 'muted' }, c.allowed ? when(c.at, now) : '已拦下'))),
    h('div', { class: 'muted small' }, '没有别的了'),
  ];
}

export function openSecurity(api: BuddyApi, root: HTMLElement): HTMLElement {
  const existing = root.querySelector<HTMLElement>(`[data-testid="${TID.security.root}"]`);
  if (existing) { existing.dispatchEvent(new Event('security-close')); return existing; } // 🛡 again closes it

  const keys = h('div', { class: 'sec-keys' });
  const appSites = h('div', { class: 'sec-sites', 'data-testid': TID.security.appSites });
  const webSites = h('div', { class: 'sec-sites', 'data-testid': TID.security.webSites });
  const drawSites = (c: { app: ConnectionView[]; web: ConnectionView[] }) => {
    const now = Date.now();
    appSites.replaceChildren(...siteList(c.app, now));
    webSites.replaceChildren(...siteList(c.web, now));
  };
  const off = api.on('connections', drawSites); // S-04: live

  const close = () => { off(); document.removeEventListener('keydown', onKey); panel.remove(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const askAi = async () => { // S-06
    const { text } = await api.invoke('security:ask-ai');
    try { await navigator.clipboard.writeText(text); toast('已复制，粘到你自己的 AI 里问问'); }
    catch { toast('没复制成功，再试一次', { error: true, help: false }); }
  };

  const panel = h('aside', { class: 'security', role: 'dialog', 'aria-label': '安全', 'data-testid': TID.security.root },
    h('div', { class: 'row-between' }, h('h2', {}, '安全'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '关掉', title: '关掉', 'data-testid': TID.security.close, onclick: () => close() }, '✕')),
    h('div', { class: 'ft' }, '你的 Key'), keys,
    h('div', { class: 'ft' }, 'CodexBuddy 连过的'), appSites,
    h('div', { class: 'ft' }, '网页里连过的'), webSites,
    h('p', { class: 'muted small' }, '汉化版用的调试端口只开在这台电脑上（127.0.0.1），每次随机'),
    h('div', { class: 'row-between sec-foot' },
      h('button', { class: 'btn', type: 'button', 'data-testid': TID.security.askAi, onclick: () => void askAi() }, '让 AI 帮我检查'),
      h('button', { class: 'lnk', type: 'button', 'data-testid': TID.security.source, onclick: () => void api.invoke('security:source') }, '查看源代码')));
  panel.addEventListener('security-close', close);
  document.addEventListener('keydown', onKey);
  root.append(panel);

  void (async () => {
    // The site lists do not wait for app:state (which asks Windows about Codex and can take a second or two)
    const gotP = api.invoke('security:get');
    void gotP.then(got => drawSites({ app: got.app ?? [], web: got.web ?? [] }), () => undefined);
    const [state, got] = await Promise.all([api.invoke('app:state'), gotP]);
    // a main-side failure answers { ok: false, reason } instead of the lists
    const data = { keys: got.keys ?? [], app: got.app ?? [], web: got.web ?? [] };
    const reveal = state.os === 'win' ? '在文件夹里显示' : '在访达里显示';
    keys.replaceChildren(...(data.keys.length ? data.keys.map(k => h('div', { class: 'sec-key', 'data-testid': TID.security.key(k.vendor) },
      h('div', { class: 'kv' }, h('span', {}, `${k.name} ${maskKey(k.keyTail)}`), h('span', { class: 'muted' }, '存在这台电脑上')),
      h('div', { class: 'links' },
        h('button', { class: 'lnk', type: 'button', 'data-testid': TID.security.reveal(k.vendor), onclick: () => void api.invoke('security:reveal', { vendor: k.vendor }) }, reveal),
        h('button', { class: 'lnk', type: 'button', 'data-testid': TID.security.manage(k.vendor), onclick: () => void api.invoke('security:manage', { vendor: k.vendor }) }, '去官网管理'))))
      : [h('div', { class: 'muted small' }, '还没有 Key')]));
    drawSites(data);
  })();
  return panel;
}
