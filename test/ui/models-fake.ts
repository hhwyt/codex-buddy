// Fake window.buddy for the model page tests (L3). Owner: A5.
import type { BuddyApi, CardView, Channel, EventName, IpcEvents, WalletView } from '../../electron/main/ipc-contract';

const NAMES: Record<string, string> = {
  deepseek: 'DeepSeek', zhipu: '智谱', kimi: 'Kimi', qwen: 'Qwen', minimax: 'MiniMax', hunyuan: '混元', openai: 'OpenAI 官方账号',
};
export const ORDER = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'];

export function cardOf(vendor: string, over: Partial<CardView> = {}): CardView {
  return {
    vendor, name: NAMES[vendor] ?? vendor, model: null, free: vendor === 'zhipu', paid: vendor !== 'zhipu' && vendor !== 'openai',
    keyTail: null, cloneMade: false, note: null, ...over,
  };
}

export function walletOf(over: Partial<WalletView> = {}, cards: Partial<Record<string, Partial<CardView>>> = {}): WalletView {
  return { order: ORDER.slice(), active: null, mode: 'switch', openaiSignedIn: true, cards: ORDER.map(v => cardOf(v, cards[v])), ...over };
}

type Handler = (args: any) => any;

export interface FakeApi extends BuddyApi {
  calls: { channel: Channel; args: any }[];
  handle(channel: Channel, fn: Handler): void;
  emit<E extends EventName>(event: E, payload: IpcEvents[E]): void;
  callsOf(channel: Channel): any[];
  listeners(event: EventName): number;
}

export function fakeApi(wallet: WalletView): FakeApi {
  const handlers = new Map<Channel, Handler>();
  const subs = new Map<EventName, Set<(p: any) => void>>();
  const calls: { channel: Channel; args: any }[] = [];
  let current = wallet;
  handlers.set('wallet:get', () => structuredClone(current));
  handlers.set('wallet:reorder', ({ order }) => { current = { ...current, order }; });
  handlers.set('wallet:mode', ({ mode }) => { current = { ...current, mode }; });
  const api: FakeApi = {
    calls,
    async invoke(channel: Channel, ...rest: any[]) {
      const args = rest[0];
      calls.push({ channel, args });
      const fn = handlers.get(channel);
      const result = fn ? await fn(args) : { ok: true };
      // the main process makes the card the one in use once a switch succeeds
      if (channel === 'switch:start' && result?.ok) current = { ...current, active: args.vendor };
      return result as any;
    },
    on(event, fn) {
      if (!subs.has(event)) subs.set(event, new Set());
      subs.get(event)!.add(fn as any);
      return () => { subs.get(event)!.delete(fn as any); };
    },
    handle(channel, fn) { handlers.set(channel, fn); },
    emit(event, payload) { for (const fn of subs.get(event) ?? []) fn(payload); },
    callsOf(channel) { return calls.filter(c => c.channel === channel).map(c => c.args); },
    listeners(event) { return subs.get(event)?.size ?? 0; },
  } as FakeApi;
  return api;
}

/** Let pending promises and their follow-ups run */
export async function settle(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise(r => setTimeout(r, 0));
}

export function deferred<T>(): { promise: Promise<T>; resolve(v: T): void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}

const pe = (type: string, y: number) => new PointerEvent(type, { bubbles: true, clientY: y, clientX: 0, pointerId: 1 });

/** pointerdown + pointerup without moving = a click on the card */
export function tap(el: Element): void {
  el.dispatchEvent(pe('pointerdown', 100));
  el.dispatchEvent(pe('pointerup', 100));
}

/** pointerdown, then move by dy in steps, then optionally up */
export function drag(el: Element, dy: number, opts: { release?: boolean; steps?: number } = {}): void {
  const steps = opts.steps ?? 5;
  el.dispatchEvent(pe('pointerdown', 100));
  for (let i = 1; i <= steps; i++) el.dispatchEvent(pe('pointermove', 100 + (dy * i) / steps));
  if (opts.release !== false) el.dispatchEvent(pe('pointerup', 100 + dy));
}
