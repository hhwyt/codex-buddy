// One bank-card face on the model page. Owner: A5. Layout and wording from ui-design/model-page-final.html.
// Colors come from tokens.css (--face-<id>) through the .face-<id> class; nothing here writes a color value.
import type { CardView } from '../../electron/main/ipc-contract.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';

export const CARD_WIDTH = 380;
export const CARD_HEIGHT = 240; // 380 / 1.586
export const CARD_PEEK = 50; // how much of each card's head shows above the one in front of it

const BUILTIN = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'];
const LIGHT = new Set(['openai']);

/** What the front card is doing, drawn on its face (approved-spec §1: 状态都显示在最上层那张卡上) */
export type FrontState =
  | { kind: 'login' } // 扫码登录
  | { kind: 'test' } // 测试连通
  | { kind: 'fail' } // ✗ 连不上 (before the card shakes back)
  | { kind: 'balance' } // 余额不够 M-13
  | { kind: 'rate' } // 被限速 M-14
  | { kind: 'broken' } // ✗ 用不了 → 一键修复 M-15
  | { kind: 'missing' } // ✗ 用不了 → 重新安装 M-16
  | { kind: 'trial' } // 有赠送额度 → 先用着 M-12
  | { kind: 'paste' }; // level-3 key fallback

export interface CardActions {
  changeKey(): void;
  recharge(): void;
  retry(): void;
  repair(): void;
  reinstall(): void;
  swapModel(): void;
  tryLater(): void;
  pasteKey(key: string): void;
  cloneMake(): void;
  cloneOpen(): void;
  cloneRemove(): void;
}

export interface FaceOptions {
  /** The card sits on top of the pile */
  front: boolean;
  /** The card is the one in use (wallet.active) */
  inUse: boolean;
  state: FrontState | null;
  cloneState: 'made' | 'making' | 'todo' | 'orig';
  actions: CardActions;
}

export const faceClass = (vendor: string): string => `face-${BUILTIN.includes(vendor) ? vendor : 'custom'}`;
export const isLight = (vendor: string): boolean => LIGHT.has(vendor);
export const logoSrc = (vendor: string): string | null =>
  BUILTIN.includes(vendor) ? `assets/logos/${vendor}${vendor === 'openai' ? '.webp' : '.png'}` : null;

const spin = () => h('span', { class: 'spin', 'aria-hidden': 'true' });
const btn = (text: string, testid: string | null, onclick: () => void, cls = 'act') =>
  h('button', { class: cls, type: 'button', 'data-testid': testid ?? undefined, onclick: (e: Event) => { e.stopPropagation(); onclick(); } }, text);

function tag(c: CardView): string {
  if (c.free) return '免费';
  if (c.paid) return '按用量付费';
  return '';
}

function status(c: CardView, o: FaceOptions): HTMLElement {
  const s = o.front ? o.state : null;
  if (s?.kind === 'login') return h('span', { class: 'st' }, spin(), '扫码登录');
  if (s?.kind === 'test') return h('span', { class: 'st' }, spin(), '测试连通');
  if (s?.kind === 'fail') return h('span', { class: 'st bad' }, '✗ 连不上');
  if (s?.kind === 'balance') return h('span', { class: 'st bad' }, '余额不够');
  if (s?.kind === 'rate') return h('span', { class: 'st bad' }, '被限速');
  if (s?.kind === 'broken' || s?.kind === 'missing') return h('span', { class: 'st bad' }, '✗ 用不了');
  if (o.front && o.inUse && c.note) return h('span', { class: 'st bad' }, c.note);
  if (o.front && o.inUse) return h('span', { class: 'st ok' }, '✓ 能用');
  return h('span', { class: 'st quiet' }, tag(c));
}

/** The row of buttons a problem state puts on the front card */
function alertRow(c: CardView, o: FaceOptions): HTMLElement | null {
  if (!o.front) return null;
  const a = o.actions;
  const row = (text: string, ...buttons: HTMLElement[]) => h('div', { class: 'alert' }, h('span', { class: 'alert-text' }, text), ...buttons);
  switch (o.state?.kind) {
    case 'balance':
      return row('充完再试', btn('去充值', TID.models.recharge(c.vendor), a.recharge), btn('再试一次', null, a.retry, 'act strong'));
    case 'rate':
      return row('免费模型被限速了，稍等会恢复', btn('换个模型', TID.models.rateLimitSwap(c.vendor), a.swapModel, 'act strong'));
    case 'broken':
      return row('Codex 用不了', btn('一键修复', TID.models.repair, a.repair, 'act strong'));
    case 'missing':
      return row('Codex 被删了', btn('重新安装', TID.models.reinstall, a.reinstall, 'act strong'));
    case 'trial':
      return row('还有额度，用完再充', btn('先用着', TID.models.tryLater, a.tryLater, 'act strong'));
    case 'paste': {
      const input = h('input', { class: 'paste-input', type: 'password', placeholder: '粘贴 Key', 'aria-label': '粘贴 Key', autocomplete: 'off' });
      return h('div', { class: 'alert' }, input, btn('用这个', TID.models.pasteKey(c.vendor), () => { if (input.value.trim()) a.pasteKey(input.value.trim()); }, 'act strong'));
    }
    default:
      if (o.inUse && o.state === null && c.note && /限速/.test(c.note)) {
        return row('免费模型被限速了，稍等会恢复', btn('换个模型', TID.models.rateLimitSwap(c.vendor), a.swapModel, 'act strong'));
      }
      return null;
  }
}

function logo(c: CardView): HTMLElement {
  const src = logoSrc(c.vendor);
  return h('span', { class: 'logo' }, src ? h('img', { src, alt: '' }) : h('span', { class: 'logo-letter' }, c.name.slice(0, 1)));
}

function cloneRow(c: CardView, o: FaceOptions): HTMLElement {
  const a = o.actions;
  let right: HTMLElement;
  if (o.cloneState === 'orig') right = btn('打开 ChatGPT', TID.models.cloneOpen(c.vendor), a.cloneOpen, 'clbtn');
  else if (o.cloneState === 'made') right = btn('打开', TID.models.cloneOpen(c.vendor), a.cloneOpen, 'clbtn');
  else if (o.cloneState === 'making') right = h('span', { class: 'clbtn make' }, spin(), '正在复制');
  else right = btn('做成分身', TID.models.cloneMake(c.vendor), a.cloneMake, 'clbtn make');
  const left = o.cloneState === 'made' || o.cloneState === 'orig' ? '自己的聊天记录' : '';
  return h('div', { class: 'cl-row cl-only' },
    h('span', { class: 'cl-note' }, left),
    h('span', { class: 'cl-btns' },
      o.cloneState === 'made' ? btn('删除', TID.models.cloneRemove(c.vendor), a.cloneRemove, 'act quiet') : null,
      right));
}

/** Children of one card element (the element itself is owned by the page so it can animate) */
export function cardFace(c: CardView, o: FaceOptions): Node[] {
  const showKeyActions = o.front && o.inUse && c.vendor !== 'openai';
  const pay = o.front && o.inUse && c.paid && !c.free && o.state?.kind !== 'balance';
  const cloneTag = o.cloneState === 'orig' ? '原来的' : o.cloneState === 'made' ? '分身' : '';
  return [
    h('div', { class: 'top' }, logo(c), h('span', { class: 'name' }, c.name),
      h('span', { class: 'sw-only st-wrap' }, status(c, o)),
      h('span', { class: 'cl-only cl-tag' }, cloneTag)),
    h('div', { class: 'num sw-only' },
      c.keyTail ? `sk-•••• •••• ${c.keyTail}` : '•••• •••• ••••',
      showKeyActions ? btn('换', TID.models.changeKey(c.vendor), o.actions.changeKey) : null),
    alertRow(c, o),
    h('div', { class: 'bot sw-only' },
      h('div', {}, h('div', { class: 'lbl' }, 'Model'), h('div', { class: 'val', 'data-testid': TID.models.cardModel(c.vendor) }, c.model ?? '—')),
      pay ? h('button', { class: 'pay', type: 'button', 'data-testid': TID.models.recharge(c.vendor), onclick: (e: Event) => { e.stopPropagation(); o.actions.recharge(); } },
        h('div', { class: 'lbl' }, '余额'), h('div', { class: 'val' }, '去充值 ›')) : null),
    cloneRow(c, o),
  ].filter((n): n is HTMLElement => n !== null);
}
