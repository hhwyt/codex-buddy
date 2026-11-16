// models page. Owner: A5. M-01..M-28, C-01..C-10 叠卡（切换）和摊开（分身）
// Switch mode reads top to bottom (ui-design/model-page-top.html): order[0], the card in use, lies at the top, whole and
// above the rest; each other card is tucked 22px under the one above it and shows only its head. Most recently used
// first. Click a card below or drag it to the top → switch. Drag that stops short of the top → only reorder (M-05).
// While a switch waits on the user (login / scan / create the key on the official page) the pile stays live: picking
// another card, the one in use, or the other mode drops that switch (switch:cancel) without a 取消了 toast (M-09).
// Machine steps (test, apply) keep the page locked (M-06).
// Nothing in use yet (first visit): the same pile, order[0] whole on top (model-page-top.html; owner 2026-11-15).
// Clone mode: the same bank cards, scaled down and spread in 3 columns, each one an App of its own.
import type { CardView, Outcome, VendorKey, WalletView } from '../../electron/main/ipc-contract.js';
import type { BuddyApi } from '../api.js';
import { confirmRemoveClone, customVendor, firstSuccess, keyFailed } from '../components/card-actions.js';
import { CARD_HEAD, CARD_HEIGHT, CARD_PEEK, CARD_TUCK, CARD_WIDTH, cardFace, faceClass, isLight, type CardActions, type FrontState } from '../components/card.js';
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import { autoFirstSwitch } from './onboarding.js';
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
/** .page's right padding (app.css): the browser covers it before it reaches the stage */
const PAGE_PAD_RIGHT = 32;
/** Space kept between the pile and the expanded browser */
const BROWSER_GAP = 24;
/** The model page never scales below this to fit the window's height (then it scrolls) */
const MIN_FIT_ZOOM = 0.7;

export const renderModels: Page = async ({ api, root }) => {
  const [view, state] = await Promise.all([api.invoke('wallet:get'), api.invoke('app:state')]);
  return mountModels(api, root, view, { codexMissing: state?.codexInstalled === false });
};

export function mountModels(api: BuddyApi, root: HTMLElement, initial: WalletView, opts: { codexMissing?: boolean } = {}): () => void {
  let wallet = initial;
  /** Set once right after install: open Codex when the automatic first switch returns */
  let openCodexAfterSwitch = false;
  let order: VendorKey[] = initial.order.slice();
  let mode = initial.mode;
  // M-16: Codex was deleted since last time → the top card offers 重新安装 right away
  let front: FrontState | null = opts.codexMissing ? { kind: 'missing' } : null;
  let switching = false;
  /** The switch:start now running; superseded = the user picked something else while it waited on them */
  let inflight: { vendor: VendorKey; done: Promise<void>; superseded: boolean } | null = null;
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
  const stage = h('div', { class: 'stage' });
  const hint = h('div', { class: 'reopen-hint', 'data-testid': TID.models.reopenHint }, '重新打开 Codex 生效');
  hint.hidden = true;
  const add = h('button', { class: 'add sw-only', type: 'button', 'data-testid': TID.models.addVendor, onclick: () => { void addVendor(); } }, '＋ 其他厂商');
  const page = h('div', { class: `models ${mode}`, 'data-testid': TID.models.root, 'data-mode': mode }, modeBar, stage, hint, add);
  root.replaceChildren(page);

  const card = (v: VendorKey): CardView => wallet.cards.find(c => c.vendor === v)!;
  /** A switch is waiting on the user (login / scan / create key), not on a machine step */
  const waitingOnUser = () => inflight !== null && (front?.kind === 'login' || front?.kind === 'create');
  const isBusy = () => switching && !waitingOnUser();

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

  /** y of the card at index i of the pile */
  function slotY(i: number): number {
    return i === 0 ? 0 : CARD_HEIGHT - CARD_TUCK + (i - 1) * CARD_PEEK;
  }

  /** Index in the pile a card dragged to y lands on */
  function slotAt(y: number): number {
    const last = order.length - 1;
    if (y < CARD_HEIGHT / 2) return 0;
    return Math.max(1, Math.min(last, 1 + Math.round((y - (CARD_HEIGHT - CARD_TUCK)) / CARD_PEEK)));
  }

  function paint(v: VendorKey, i: number): void {
    const c = card(v);
    const el = els.get(v)!;
    const isFront = mode === 'switch' && i === 0;
    el.replaceChildren(...cardFace(c, {
      front: isFront, inUse: wallet.active === v, state: isFront ? front : null, cloneState: mode === 'clone' ? cloneState(c) : null, actions: actionsFor(v),
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
    page.className = `models ${mode}${isBusy() ? ' busy' : ''}${browserWidth ? ' beside-browser' : ''}`;
    page.dataset.mode = mode;
    // ui-design/app ?t=scan v1: while the user scans or creates the key on the official page, the browser stays big
    document.documentElement.classList.toggle('scan-waiting', waitingOnUser());
    for (const b of modeBar.querySelectorAll<HTMLElement>('.mode-seg')) b.setAttribute('aria-selected', String(b.dataset.m === mode));
    if (mode === 'switch') {
      order.forEach((v, i) => {
        const el = els.get(v)!;
        paint(v, i);
        el.dataset.row = String(i); // 0 = top of the page
        // the whole top card lies above everything; below it, each card under the one above
        if (v !== skip) { ys.set(v, slotY(i)); place(el, -CARD_WIDTH / 2, slotY(i)); el.style.zIndex = String(i === 0 ? n + 1 : n - i); }
      });
      stageTarget = n > 1 ? slotY(n - 1) + CARD_HEAD : CARD_HEIGHT;
      // the bottom card shows only its head, but its whole 240px box still reaches below the stage
      stageReach = n > 1 ? slotY(n - 1) + CARD_HEIGHT : CARD_HEIGHT;
      stage.style.height = `${stageTarget}px`;
    } else {
      const cw = CARD_WIDTH * SPREAD_SCALE, ch = CARD_HEIGHT * SPREAD_SCALE;
      const rank = (c: CardView) => ({ orig: 0, made: 1, making: 2, todo: 3 })[cloneState(c)];
      const list = order.map(card).sort((a, b) => rank(a) - rank(b));
      const x0 = -(SPREAD_COLS * cw + (SPREAD_COLS - 1) * SPREAD_GAP) / 2;
      list.forEach((c, i) => {
        const el = els.get(c.vendor)!;
        paint(c.vendor, order.indexOf(c.vendor));
        delete el.dataset.row;
        place(el, x0 + (i % SPREAD_COLS) * (cw + SPREAD_GAP), Math.floor(i / SPREAD_COLS) * (ch + SPREAD_GAP), SPREAD_SCALE);
        el.style.zIndex = String(10 + i);
      });
      stageTarget = Math.ceil(list.length / SPREAD_COLS) * (ch + SPREAD_GAP);
      stageReach = stageTarget;
      stage.style.height = `${stageTarget}px`;
    }
    fitHeight();
  }

  // ---- fit the window's height (ui-design/app ?t=scroll v2): the whole page scales down so nothing scrolls ----
  let stageTarget = 0;
  let stageReach = 0;
  let zoom = 1;
  /** Zoom on .models so its content fits the page area; measured at full size against the stage's target height
   *  (it animates), never below MIN_FIT_ZOOM; a taller window gives full size back */
  function fitHeight(): void {
    const scroller = root.closest<HTMLElement>('.page') ?? root;
    if (!scroller.clientHeight) return; // not on screen (tests, hidden)
    page.style.zoom = '1';
    // The page's own box, not scrollHeight: cards still flying between pile and spread would count there
    const pad = getComputedStyle(scroller);
    const own = page.offsetHeight - stage.offsetHeight + stageTarget; // the page laid out with the stage at its final height
    const reach = stage.offsetTop + stageReach; // where the lowest card's box ends
    const natural = (parseFloat(pad.paddingTop) || 0) + Math.max(own + (parseFloat(pad.paddingBottom) || 0), reach);
    // rounded down, with 2px to spare: a rounded-up zoom left the page 1px too tall, and the scrollbar came back
    zoom = Math.max(MIN_FIT_ZOOM, Math.min(1, Math.floor(((scroller.clientHeight - 2) / natural) * 1000) / 1000));
    page.style.zoom = zoom === 1 ? '' : zoom.toFixed(3);
    page.style.setProperty('--fit-zoom', zoom.toFixed(3)); // window-px rules (the PiP's room in models.css) divide by it
    if (browserWidth) besideBrowser(browserWidth);
  }
  const onResize = () => fitHeight();
  window.addEventListener('resize', onResize);

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
    if (waitingOnUser() && v === inflight!.vendor) { layout(); return; } // the card already being switched to
    const before = order.slice();
    order = [v, ...order.filter(k => k !== v)];
    if (v === wallet.active && waitingOnUser()) { void backToActive(); return; }
    if (v === wallet.active && front === null) { layout(); return; }
    void switchTo(v, before);
  }

  /** Stops the switch waiting on the user; resolves once its switch:start has returned */
  async function dropPending(): Promise<void> {
    const run = inflight!;
    if (!run.superseded) { run.superseded = true; void api.invoke('switch:cancel'); }
    await run.done;
  }

  async function backToActive(): Promise<void> {
    await dropPending();
    if (!switching) putBack();
  }

  async function switchTo(v: VendorKey, before?: VendorKey[]): Promise<void> {
    if (isBusy()) return;
    const interrupting = waitingOnUser();
    // the order to go back to is the one before the dropped switch
    if (before && !interrupting) revertTo = before;
    if (interrupting) { await dropPending(); if (switching) return; }
    if (order[0] !== v) order = [v, ...order.filter(k => k !== v)];
    switching = true;
    hint.hidden = true;
    front = { kind: card(v).keyTail ? 'test' : 'login' };
    let finish!: () => void;
    const run = { vendor: v, done: new Promise<void>(resolve => { finish = resolve; }), superseded: false };
    inflight = run;
    layout();
    let r: SwitchResult;
    try { r = await api.invoke('switch:start', { vendor: v }); } catch (e) { r = { ok: false, reason: (e as Error).message }; }
    // Right after install: Codex opens the moment the top card is set up (or given up), before any dialog
    // Only once a domestic model really works (站主 11-16: 没配好 Key 时 ChatGPT 不应该启动)
    if (openCodexAfterSwitch) { openCodexAfterSwitch = false; if (r.ok) void api.invoke('codex:open', {}); }
    switching = false;
    inflight = null;
    if (run.superseded) {
      // whoever dropped it carries on; a login that finished just before the cancel still counts
      if (r.ok) await succeed(v, r);
      finish();
      return;
    }
    finish();
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
      // a switch waits on the user: a new card on top replaces it; anything else changes nothing
      if (waitingOnUser()) { const top = order[0]!; order = before; if (top !== before[0]) pick(top); else layout(); return; }
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
    if (waitingOnUser()) void backToActive();
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

  // ---- beside the expanded browser (ui-design/app ?t=browser v1) ----
  /** The pile moves into the free space left of a browser this wide (0 = closed / small window), smaller only if needed */
  let browserWidth = 0;
  function besideBrowser(width: number): void {
    browserWidth = width;
    page.classList.toggle('beside-browser', width > 0);
    if (!width) return;
    // stage px are the page's own (zoomed) px; the browser's width and the page padding are window px
    const stageWidth = stage.clientWidth;
    const free = stageWidth - (width - PAGE_PAD_RIGHT + BROWSER_GAP) / zoom;
    const scale = Math.max(0.5, Math.min(1, free / (CARD_WIDTH + 8)));
    const x = Math.max((CARD_WIDTH / 2) * scale, free / 2);
    page.style.setProperty('--beside-x', `${x}px`);
    page.style.setProperty('--beside-scale', scale.toFixed(3));
    page.style.setProperty('--beside-shift', `${x - stageWidth / 2}px`);
  }

  // ---- events: model changed inside Codex (M-28), login progress, browser closed while scanning (M-09) ----
  const offs = [
    api.on('wallet', w => { if (switching || dragging) { pendingWallet = w; return; } applyWallet(w); }),
    api.on('step', s => {
      if (s.flow !== 'switch' || !switching || !front) return;
      const kind = /login|scan/.test(s.id) ? 'login' : s.id === 'create' ? 'create' : /test/.test(s.id) ? 'test' : null;
      if (kind && front.kind !== kind) { front = { kind }; layout(); }
    }),
    api.on('browser', b => {
      besideBrowser(b.open && b.mode === 'expanded' ? b.width : 0);
      if (!b.open && switching && (front?.kind === 'login' || front?.kind === 'create') && !inflight?.superseded) void api.invoke('switch:cancel');
    }),
  ];

  syncCards();
  layout();
  // Just installed and nothing set up yet: set up the top card (智谱), then open Codex on it (站主 11-16)
  const autoFirst = autoFirstSwitch.pending;
  autoFirstSwitch.pending = false;
  if (autoFirst && !wallet.active && order[0]) { openCodexAfterSwitch = true; void switchTo(order[0]); }
  return () => { for (const off of offs) off(); window.removeEventListener('resize', onResize); document.documentElement.classList.remove('scan-waiting'); };
}
