// Fake window.buddy for onboarding / pip UI tests. Owner: A11.
import { vi } from 'vitest';
import type { BuddyApi, IpcEvents } from '../../electron/main/ipc-contract';

type Handlers = Record<string, (args?: unknown) => unknown>;

export function fakeApi(handlers: Handlers = {}) {
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  const invoke = vi.fn(async (channel: string, args?: unknown) => handlers[channel]?.(args));
  const api = {
    invoke,
    on(event: string, fn: (p: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return () => { listeners.get(event)!.delete(fn); };
    },
  } as unknown as BuddyApi;
  const emit = <E extends keyof IpcEvents>(event: E, payload: IpcEvents[E]) => { for (const fn of listeners.get(event) ?? []) fn(payload); };
  const count = (event: string) => listeners.get(event)?.size ?? 0;
  return { api, invoke, emit, count };
}

export const flush = () => new Promise(r => setTimeout(r, 0));
