// One bank-card face on the model page. Owner: A5. Layout and wording from ui-design/model-page-top.html.
// Colors come from tokens.css (--face-<id>) through the .face-<id> class; nothing here writes a color value.
import type { CardView } from '../../electron/main/ipc-contract.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';

export const CARD_WIDTH = 380;
export const CARD_HEIGHT = 240; // 380 / 1.586
export const CARD_PEEK = 50; // step between card heads in the pile
export const CARD_TUCK = 22; // how far each head tucks under the card above it
export const CARD_HEAD = 72; // a card below the top shows only this much (PEEK + TUCK); the rest is clipped

const BUILTIN = ['zhipu', 'deepseek', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'];
const LIGHT = new Set(['openai']);

/** What the front card is doing, drawn on its face (approved-spec §1: 状态都显示在最上层那张卡上) */
export type FrontState =
  | { kind: 'login' } // 扫码登录
  | { kind: 'create' } // 点右边的「创建」(level 2: the key is made on the official page)
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
  /** 分身 mode: where this card's clone stands (the face stays the 切换 bank card, only the actions differ); null in 切换 */
  cloneState: 'made' | 'making' | 'todo' | 'orig' | null;
  actions: CardActions;
}

export const faceClass = (vendor: string): string => `face-${BUILTIN.includes(vendor) ? vendor : 'custom'}`;
export const isLight = (vendor: string): boolean => LIGHT.has(vendor);
export const logoSrc = (vendor: string): string | null =>
  BUILTIN.includes(vendor) ? `assets/logos/${vendor}${vendor === 'openai' ? '.webp' : '.png'}` : null;

const spin = () => h('span', { class: 'spin', 'aria-hidden': 'true' });
const btn = (text: string, testid: string | null, onclick: () => void, cls = 'act') =>
  h('button', { class: cls, type: 'button', 'data-testid': testid ?? undefined, onclick: (e: Event) => { e.stopPropagation(); onclick(); } }, text);

/** 智谱's free models are throttled for everyone; a paid account is held to its own per-minute limit (Kimi: 3 a minute
 *  until 50 元 has been topped up) */
const rateText = (c: CardView): string => (c.free ? '免费模型被限速了，稍等会恢复' : '被限速了（每分钟能发的次数有限），稍等会恢复');

function tag(c: CardView): string {
  if (c.free) return '免费';
  if (c.paid) return '按用量付费';
  return '';
}

function status(c: CardView, o: FaceOptions): HTMLElement {
  if (o.cloneState === 'orig') return h('span', { class: 'st quiet' }, '原来的');
  if (o.cloneState === 'made') return h('span', { class: 'st quiet' }, '分身');
  const s = o.front ? o.state : null;
  if (s?.kind === 'login') return h('span', { class: 'st' }, spin(), '扫码登录');
  if (s?.kind === 'create') return h('span', { class: 'st' }, spin(), '点右边的「创建」');
  if (s?.kind === 'test') return h('span', { class: 'st' }, spin(), '正在切换');
  if (s?.kind === 'fail') return h('span', { class: 'st bad' }, '✗ 连不上');
  if (s?.kind === 'balance') return h('span', { class: 'st bad' }, '余额不够');
  if (s?.kind === 'rate') return h('span', { class: 'st bad' }, '被限速');
  if (s?.kind === 'broken' || s?.kind === 'missing') return h('span', { class: 'st bad' }, '✗ 用不了');
  if (o.front && o.inUse && c.note) return h('span', { class: 'st bad' }, c.note);
  if (o.front && o.inUse) return h('span', { class: 'st ok' }, '✓ 能用');
  return h('span', { class: 'st quiet' }, tag(c));
}

/** The row of buttons a problem state puts on the front card; in 分身 mode the clone's actions, in the same place */
function alertRow(c: CardView, o: FaceOptions): HTMLElement | null {
  if (o.cloneState) return cloneRow(c, o);
  if (!o.front) return null;
  const a = o.actions;
  const row = (text: string, ...buttons: HTMLElement[]) => h('div', { class: 'alert' }, h('span', { class: 'alert-text' }, text), ...buttons);
  switch (o.state?.kind) {
    case 'balance':
      return row('充完再试', btn('去充值', TID.models.recharge(c.vendor), a.recharge), btn('再试一次', null, a.retry, 'act strong'));
    case 'rate':
      return row(rateText(c), btn('换个模型', TID.models.rateLimitSwap(c.vendor), a.swapModel, 'act strong'));
    case 'broken':
      return row('Codex 用不了', btn('一键修复', TID.models.repair, a.repair, 'act strong'));
    case 'missing':
      return null;
    case 'trial':
      return row('还有额度，用完再充', btn('先用着', TID.models.tryLater, a.tryLater, 'act strong'));
    case 'paste': {
      const input = h('input', { class: 'paste-input', type: 'password', placeholder: '粘贴 Key', 'aria-label': '粘贴 Key', autocomplete: 'off' });
      return h('div', { class: 'alert' }, input, btn('用这个', TID.models.pasteKey(c.vendor), () => { if (input.value.trim()) a.pasteKey(input.value.trim()); }, 'act strong'));
    }
    default:
      if (o.inUse && o.state === null && c.note && /限速/.test(c.note)) {
        return row(rateText(c), btn('换个模型', TID.models.rateLimitSwap(c.vendor), a.swapModel, 'act strong'));
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
  // the empty text slot keeps the buttons at the right (站主 2026-11-15 dropped the 「自己的聊天记录」 line)
  const row = (...items: HTMLElement[]) => h('div', { class: 'alert' }, h('span', { class: 'alert-text' }), ...items);
  switch (o.cloneState) {
    case 'orig': return row(btn('打开 ChatGPT', TID.models.cloneOpen(c.vendor), a.cloneOpen, 'act strong'));
    case 'made': return row(btn('删除', TID.models.cloneRemove(c.vendor), a.cloneRemove, 'act quiet'), btn('打开', TID.models.cloneOpen(c.vendor), a.cloneOpen, 'act strong'));
    case 'making': return row(h('span', { class: 'st' }, spin(), '正在复制'));
    default: return row(btn('做成分身', TID.models.cloneMake(c.vendor), a.cloneMake, 'act strong'));
  }
}

/** Children of one card element (the element itself is owned by the page so it can animate) */
export function cardFace(c: CardView, o: FaceOptions): Node[] {
  const showKeyActions = o.front && o.inUse && c.vendor !== 'openai';
  const pay = o.front && o.inUse && c.paid && !c.free && o.state?.kind !== 'balance';
  return [
    h('div', { class: 'top' }, logo(c), h('span', { class: 'name' }, c.name), h('span', { class: 'st-wrap' }, status(c, o))),
    h('div', { class: 'num' },
      c.keyTail ? `sk-•••• •••• ${c.keyTail}` : '•••• •••• ••••',
      showKeyActions ? btn('换', TID.models.changeKey(c.vendor), o.actions.changeKey) : null),
    alertRow(c, o),
    h('div', { class: 'bot' },
      h('div', {}, h('div', { class: 'lbl' }, 'Model'), h('div', { class: 'val', 'data-testid': TID.models.cardModel(c.vendor) }, c.model ?? '—')),
      pay ? h('button', { class: 'pay', type: 'button', 'data-testid': TID.models.recharge(c.vendor), onclick: (e: Event) => { e.stopPropagation(); o.actions.recharge(); } },
        h('div', { class: 'lbl' }, '余额'), h('div', { class: 'val' }, '去充值 ›')) : null),
  ].filter((n): n is HTMLElement => n !== null);
}
