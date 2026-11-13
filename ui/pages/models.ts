// models page. Owner: A5. M-01..M-28, C-01..C-10 叠卡（切换）和摊开（分身）
// Switch mode reads top to bottom (ui-design/model-page-top.html): order[0], the card in use, lies at the top, whole and
// above the rest; each other card is tucked 22px under the one above it and shows only its head. Most recently used
// first. Click a card below or drag it to the top → switch. Drag that stops short of the top → only reorder (M-05).
// Nothing in use yet (first visit): a「选一个模型」line on top and every card as a head only, so none looks in use.
// Clone mode: the same cards spread in 3 columns, each one an App of its own.
import type { CardView, Outcome, VendorKey, WalletView } from '../../electron/main/ipc-contract.js';
import type { BuddyApi } from '../api.js';
import { confirmRemoveClone, customVendor, firstSuccess, keyFailed } from '../components/card-actions.js';
import { CARD_HEAD, CARD_HEIGHT, CARD_PEEK, CARD_TUCK, CARD_WIDTH, cardFace, faceClass, isLight, type CardActions, type FrontState } from '../components/card.js';
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

type SwitchResult = Outcome & { seconds?: number; firstTime?: boolean; running?: boolean };

/** Failure kinds the main process puts in Outcome.kind for switch:start (see openIssues: shared with main) */
const STATE_OF_KIND: Record<string, FrontState['kind']> = {
  'no-balance': 'balance', 'rate-limited': 'rate', 'codex-broken': 'broken', 'codex-missing': 'missing', 'paste-key': 'paste',
};

const SPREAD_SCALE = 0.6;
const SPREAD_GAP = 18;
const SPREAD_COLS = 3;
const SHAKE_MS = 400;

export const renderModels: Page = async ({ api, root }) => {
  const [view, state] = await Promise.all([api.invoke('wallet:get'), api.invoke('app:state')]);
  return mountModels(api, root, view, { codexMissing: state?.codexInstalled === false });
};

export function mountModels(api: BuddyApi, root: HTMLElement, initial: WalletView, opts: { codexMissing?: boolean } = {}): () => void {
  let wallet = initial;
  let order: VendorKey[] = initial.order.slice();
  let mode = initial.mode;
  // M-16: Codex was deleted since last time → the top card offers 重新安装 right away
  let front: FrontState | null = opts.codexMissing ? { kind: 'missing' } : null;
  let switching = false;
  let dragging = false;
  let pendingWallet: WalletView | null = null;
  /** order before the switch now on screen, to put the cards back when it fails */
  let revertTo: VendorKey[] | null = null;
  const making = new Set<VendorKey>();
  const els = new Map<VendorKey, HTMLElement>();
  const ys = new Map<VendorKey, number>();

  const modeBtn = (m: 'switch' | 'clone', text: string, testid: string) =>
    h('button', { type: 'button', class: 'mode-seg', 'data-m': m, 'data-testid': testid, onclick: () => setMode(m) }, text);
  const modeBar = h('div', { class: 'mode', role: 'tablist' },
    modeBtn('switch', '切换', TID.models.modeSwitch), modeBtn('clone', '分身', TID.models.modeClone));
  const guide = h('div', { class: 'guide sw-only', 'data-testid': TID.models.guide }, '选一个模型');
  const stage = h('div', { class: 'stage' });
  const hint = h('div', { class: 'reopen-hint', 'data-testid': TID.models.reopenHint }, '重新打开 Codex 生效');
  hint.hidden = true;
  const add = h('button', { class: 'add sw-only', type: 'button', 'data-testid': TID.models.addVendor, onclick: () => { void addVendor(); } }, '＋ 其他厂商');
  const page = h('div', { class: `models ${mode}`, 'data-testid': TID.models.root, 'data-mode': mode }, modeBar, guide, stage, hint, add);
  root.replaceChildren(page);

  const card = (v: VendorKey): CardView => wallet.cards.find(c => c.vendor === v)!;
  const isBusy = () => switching;

  function syncCards(): void {
    for (const c of wallet.cards) {
      if (els.has(c.vendor)) continue;
      const el = h('div', { class: `card ${faceClass(c.vendor)}${isLight(c.vendor) ? ' light' : ''}`, 'data-testid': TID.models.card(c.vendor), 'data-vendor': c.vendor, tabindex: '0', role: 'button', 'aria-label': c.name });
      el.addEventListener('pointerdown', e => onPointerDown(el, e));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c.vendor); } });
      els.set(c.vendor, el);
      stage.append(el);
    }
    for (const [v, el] of els) if (!wallet.cards.some(c => c.vendor === v)) { el.remove(); els.delete(v); }
    order = order.filter(v => els.has(v));
    for (const c of wallet.cards) if (!order.includes(c.vendor)) order.push(c.vendor);
  }

  function cloneState(c: CardView): 'made' | 'making' | 'todo' | 'orig' {
    if (c.vendor === 'openai') return 'orig';
    if (making.has(c.vendor)) return 'making';
    return c.cloneMade ? 'made' : 'todo';
  }

  function actionsFor(v: VendorKey): CardActions {
    return {
      changeKey: () => { void changeKey(v); },
      recharge: () => { void api.invoke('recharge:open', { vendor: v }); },
      retry: () => { void switchTo(v); },
      repair: () => { void fixCodex(v, 'codex:repair'); },
      reinstall: () => { void fixCodex(v, 'codex:reinstall'); },
      swapModel: () => { toast('在 Codex 左下角的模型菜单里换一个'); },
      tryLater: () => { front = null; void api.invoke('browser:show', { mode: 'pip' }); layout(); },
      pasteKey: key => { void pasteKey(v, key); },
      cloneMake: () => { void cloneMake(v); },
      cloneOpen: () => { void cloneOpen(v); },
      cloneRemove: () => { void cloneRemove(v); },
    };
  }

  /** The top card shows whole once something is in use or being switched to; before that every card is a head */
  const wholeTop = () => wallet.active !== null || front !== null || switching;

  /** y of the card at index i of the pile */
  function slotY(i: number): number {
    if (!wholeTop()) return i * CARD_PEEK;
    return i === 0 ? 0 : CARD_HEIGHT - CARD_TUCK + (i - 1) * CARD_PEEK;
  }

  /** Index in the pile a card dragged to y lands on */
  function slotAt(y: number): number {
    const last = order.length - 1;
    if (!wholeTop()) return Math.max(0, Math.min(last, Math.round(y / CARD_PEEK)));
    if (y < CARD_HEIGHT / 2) return 0;
    return Math.max(1, Math.min(last, 1 + Math.round((y - (CARD_HEIGHT - CARD_TUCK)) / CARD_PEEK)));
  }

  function paint(v: VendorKey, i: number): void {
    const c = card(v);
    const el = els.get(v)!;
    const isFront = mode === 'switch' && i === 0 && wholeTop();
    el.replaceChildren(...cardFace(c, {
      front: isFront, inUse: wallet.active === v, state: isFront ? front : null, cloneState: cloneState(c), actions: actionsFor(v),
    }));
    el.classList.toggle('whole', isFront);
    el.classList.toggle('cur', isFront && wallet.active === v);
  }

  function place(el: HTMLElement, x: number, y: number, scale = 1): void {
    el.style.transform = `translate(${x}px, ${y}px)${scale === 1 ? '' : ` scale(${scale})`}`;
  }

  /** skip: the card under the finger keeps its own position */
  function layout(skip?: VendorKey): void {
    const n = order.length;
    page.className = `models ${mode}${switching ? ' busy' : ''}`;
    page.dataset.mode = mode;
    for (const b of modeBar.querySelectorAll<HTMLElement>('.mode-seg')) b.setAttribute('aria-selected', String(b.dataset.m === mode));
    guide.hidden = mode !== 'switch' || wholeTop();
    if (mode === 'switch') {
      order.forEach((v, i) => {
        const el = els.get(v)!;
        paint(v, i);
        el.classList.remove('todo');
        el.dataset.row = String(i); // 0 = top of the page
        // the whole top card lies above everything; below it, each card under the one above
        if (v !== skip) { ys.set(v, slotY(i)); place(el, -CARD_WIDTH / 2, slotY(i)); el.style.zIndex = String(i === 0 ? n + 1 : n - i); }
      });
      stage.style.height = `${n > 1 ? slotY(n - 1) + CARD_HEAD : CARD_HEIGHT}px`;
    } else {
      const cw = CARD_WIDTH * SPREAD_SCALE, ch = CARD_HEIGHT * SPREAD_SCALE;
      const rank = (c: CardView) => ({ orig: 0, made: 1, making: 2, todo: 3 })[cloneState(c)];
      const list = order.map(card).sort((a, b) => rank(a) - rank(b));
      const x0 = -(SPREAD_COLS * cw + (SPREAD_COLS - 1) * SPREAD_GAP) / 2;
      list.forEach((c, i) => {
        const el = els.get(c.vendor)!;
        paint(c.vendor, order.indexOf(c.vendor));
        el.classList.toggle('todo', rank(c) === 3);
        delete el.dataset.row;
        place(el, x0 + (i % SPREAD_COLS) * (cw + SPREAD_GAP), Math.floor(i / SPREAD_COLS) * (ch + SPREAD_GAP), SPREAD_SCALE);
        el.style.zIndex = String(10 + i);
      });
      stage.style.height = `${Math.ceil(list.length / SPREAD_COLS) * (ch + SPREAD_GAP)}px`;
    }
  }

  function applyWallet(w: WalletView): void {
    wallet = w;
    order = w.order.slice();
    syncCards();
    layout();
  }

  async function refresh(): Promise<void> {
    const w = await api.invoke('wallet:get');
    if (switching || dragging) { pendingWallet = w; return; }
    applyWallet(w);
  }

  // ---- switching (M-02..M-21) ----
  function pick(v: VendorKey): void {
    if (mode !== 'switch' || isBusy()) return;
    const before = order.slice();
    order = [v, ...order.filter(k => k !== v)];
    if (v === wallet.active && front === null) { layout(); return; }
    void switchTo(v, before);
  }

  async function switchTo(v: VendorKey, before?: VendorKey[]): Promise<void> {
    if (switching) return;
    if (before) revertTo = before;
    if (order[0] !== v) order = [v, ...order.filter(k => k !== v)];
    switching = true;
    hint.hidden = true;
    front = { kind: card(v).keyTail ? 'test' : 'login' };
    layout();
    let r: SwitchResult;
    try { r = await api.invoke('switch:start', { vendor: v }); } catch (e) { r = { ok: false, reason: (e as Error).message }; }
    switching = false;
    if (r.ok) return succeed(v, r);
    const kind = typeof r.kind === 'string' ? r.kind : '';
    if (kind === 'cancelled') { putBack(); toast('取消了，什么都没改'); return; }
    if (kind === 'key-failed') {
      putBack();
      if (await keyFailed(r.reason)) await switchTo(v, order.slice());
      return;
    }
    const state = STATE_OF_KIND[kind];
    if (state) { front = { kind: state }; layout(); flushPending(); return; }
    // anything else: the connection test failed → shake, go back, config untouched (M-07)
    front = { kind: 'fail' };
    layout();
    const el = els.get(v)!;
    el.classList.add('shake');
    toast(r.reason ?? '连不上，原来的配置没动', { error: true });
    setTimeout(() => { el.classList.remove('shake'); putBack(); }, SHAKE_MS);
  }

  function putBack(): void {
    front = null;
    if (revertTo) order = revertTo.filter(v => els.has(v));
    revertTo = null;
    layout();
    flushPending();
  }

  function flushPending(): void {
    if (!pendingWallet || switching || dragging) return;
    const w = pendingWallet;
    pendingWallet = null;
    applyWallet(w);
  }

  async function succeed(v: VendorKey, r: SwitchResult): Promise<void> {
    revertTo = null;
    front = r.trial ? { kind: 'trial' } : null;
    wallet = { ...wallet, active: v };
    layout();
    await api.invoke('wallet:reorder', { order: order.slice() });
    const name = card(v).name;
    toast(typeof r.host === 'string' ? `已切换到 ${name} · 只连了 ${r.host}` : `已切换到 ${name}`);
    if (r.running) hint.hidden = false;
    const w = await api.invoke('wallet:get');
    wallet = w;
    order = w.order.length ? w.order.slice() : order;
    syncCards();
    pendingWallet = null;
    layout();
    if (r.firstTime) await firstSuccess(api, r.seconds ?? 0);
  }

  async function fixCodex(v: VendorKey, channel: 'codex:repair' | 'codex:reinstall'): Promise<void> {
    if (switching) return;
    switching = true;
    layout();
    let r: Outcome;
    try { r = await api.invoke(channel); } catch (e) { r = { ok: false, reason: (e as Error).message }; }
    switching = false;
    if (!r.ok) { layout(); toast(r.reason ?? '没修好', { error: true }); return; }
    front = null;
    await switchTo(v);
  }

  async function pasteKey(v: VendorKey, key: string): Promise<void> {
    let r: Outcome;
    try { r = await api.invoke('key:paste', { vendor: v, key }); } catch (e) { r = { ok: false, reason: (e as Error).message }; }
    if (!r.ok) { toast(r.reason ?? '这个 Key 用不了', { error: true }); return; }
    front = null;
    await switchTo(v);
  }

  async function changeKey(v: VendorKey): Promise<void> {
    if (switching) return;
    switching = true;
    front = { kind: 'login' };
    layout();
    let r: Outcome;
    try { r = await api.invoke('key:replace', { vendor: v }); } catch (e) { r = { ok: false, reason: (e as Error).message }; }
    switching = false;
    front = null;
    if (r.ok) { toast('换好了，新 Key 测通了'); await refresh(); return; }
    layout();
    toast(r.reason ? `没换成，还在用原来的 Key：${r.reason}` : '没换成，还在用原来的 Key', { error: true });
  }

  // ---- pointer: click or drag (M-02..M-06) ----
  function onPointerDown(el: HTMLElement, e: PointerEvent): void {
    if (mode !== 'switch' || isBusy()) return;
    if ((e.target as Element | null)?.closest?.('button, input')) return;
    const v = el.dataset.vendor!;
    const before = order.slice();
    const startY = e.clientY;
    const y0 = ys.get(v) ?? 0;
    let moved = false;
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
    el.classList.add('drag');
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 4) moved = true;
      const y = y0 + ev.clientY - startY;
      place(el, -CARD_WIDTH / 2, y);
      const i = slotAt(y);
      const rest = order.filter(k => k !== v);
      rest.splice(i, 0, v);
      if (rest.join() !== order.join()) { order = rest; layout(v); } // the others make room (M-04)
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('drag');
      dragging = false;
      if (!moved) { order = before; pick(v); return; }
      if (order[0] === v && v !== wallet.active) { void switchTo(v, before); return; }
      if (order[0] !== before[0] && order[0] !== wallet.active) { order = before; layout(); return; }
      layout();
      if (order.join() !== before.join()) void api.invoke('wallet:reorder', { order: order.slice() }); // M-05
      flushPending();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // ---- mode (C-09) ----
  function setMode(m: 'switch' | 'clone'): void {
    if (m === mode || isBusy()) return;
    mode = m;
    layout();
    void api.invoke('wallet:mode', { mode: m });
  }

  // ---- clones (C-01, C-02, C-07) ----
  async function cloneMake(v: VendorKey): Promise<void> {
    if (making.has(v)) return;
    making.add(v);
    layout();
    let r: Outcome;
    try { r = await api.invoke('clone:make', { vendor: v }); } catch (e) { r = { ok: false, reason: (e as Error).message }; }
    making.delete(v);
    if (r.ok) toast(`做好了，多了一个「${card(v).name}」，图标是它自己的`);
    else toast(r.reason ?? '没做成分身', { error: true });
    await refresh();
    layout();
  }

  async function cloneOpen(v: VendorKey): Promise<void> {
    const r = v === 'openai' ? await api.invoke('codex:open', {}) : await api.invoke('clone:open', { vendor: v });
    if (!r.ok) toast(r.reason ?? '没打开', { error: true });
  }

  async function cloneRemove(v: VendorKey): Promise<void> {
    if (!(await confirmRemoveClone(card(v).name))) return;
    const r = await api.invoke('clone:remove', { vendor: v });
    if (r.ok) toast('删好了，聊天记录和设置留着');
    else toast(r.reason ?? '没删掉', { error: true });
    await refresh();
  }

  // ---- ＋ 其他厂商 (M-19) ----
  async function addVendor(): Promise<void> {
    if (await customVendor(api)) { toast('加好了'); await refresh(); }
  }

  // ---- events: model changed inside Codex (M-28), login progress, browser closed while scanning (M-09) ----
  const offs = [
    api.on('wallet', w => { if (switching || dragging) { pendingWallet = w; return; } applyWallet(w); }),
    api.on('step', s => {
      if (s.flow !== 'switch' || !switching || !front) return;
      const kind = /login|scan/.test(s.id) ? 'login' : /test/.test(s.id) ? 'test' : null;
      if (kind && front.kind !== kind) { front = { kind }; layout(); }
    }),
    api.on('browser', b => { if (!b.open && switching && front?.kind === 'login') void api.invoke('switch:cancel'); }),
  ];

  syncCards();
  layout();
  return () => { for (const off of offs) off(); };
}
