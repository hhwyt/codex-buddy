// Fake window.buddy for A6's page tests: canned answers per channel, records every call, fires events on demand.
import type { AppStateView, BuddyApi, Channel, EventName, IpcEvents } from '../../electron/main/ipc-contract';

export function appState(over: Partial<AppStateView> = {}): AppStateView {
  return {
    version: '1.0.0', os: 'mac', configured: true, codexInstalled: true, codexRunning: false,
    zh: { on: false, launcherExists: false, supported: true, hidden: false },
    community: { qrUrl: null, text: '' },
    ...over,
  };
}

type Answer = unknown | ((args: unknown) => unknown);

export function fakeApi(answers: Partial<Record<Channel, Answer>> = {}) {
  const calls: { channel: Channel; args: unknown }[] = [];
  const subs = new Map<EventName, Set<(p: unknown) => void>>();
  const api: BuddyApi = {
    invoke: (async (channel: Channel, args?: unknown) => {
      calls.push({ channel, args });
      const a = channel in answers ? answers[channel] : channel === 'app:state' ? appState() : channel === 'wallet:get' ? { order: [], active: null, cards: [], mode: 'switch' } : { ok: true };
      return typeof a === 'function' ? (a as (x: unknown) => unknown)(args) : a;
    }) as BuddyApi['invoke'],
    on: ((event: EventName, fn: (p: unknown) => void) => {
      if (!subs.has(event)) subs.set(event, new Set());
      subs.get(event)!.add(fn);
      return () => { subs.get(event)!.delete(fn); };
    }) as BuddyApi['on'],
  };
  return {
    api, calls,
    called: (c: Channel) => calls.filter(x => x.channel === c),
    emit<E extends EventName>(event: E, payload: IpcEvents[E]) { for (const fn of subs.get(event) ?? []) fn(payload); },
    listeners: (e: EventName) => subs.get(e)?.size ?? 0,
  };
}

/** Let pending promises and 0 ms timers run */
export const settle = async (rounds = 30) => { for (let i = 0; i < rounds; i++) await new Promise(r => setTimeout(r, 0)); };

export const click = (el: Element | null) => { if (!el) throw new Error('element missing'); (el as HTMLElement).click(); };
