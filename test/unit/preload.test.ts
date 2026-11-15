// L1: the preload bridge (window.buddy): invoke goes to buddy:<channel>, on/off to event:<name>. Owner: Base.
import { expect, test, vi } from 'vitest';
import type { BuddyApi } from '../../electron/main/ipc-contract';

const electron = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: unknown, p: unknown) => void>>();
  return {
    exposed: {} as Record<string, unknown>,
    listeners,
    ipcRenderer: {
      invoke: vi.fn(async (channel: string, ...args: unknown[]) => ({ channel, args })),
      on: (ch: string, fn: (e: unknown, p: unknown) => void) => { if (!listeners.has(ch)) listeners.set(ch, new Set()); listeners.get(ch)!.add(fn); },
      removeListener: (ch: string, fn: (e: unknown, p: unknown) => void) => { listeners.get(ch)?.delete(fn); },
    },
  };
});
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (name: string, api: unknown) => { electron.exposed[name] = api; } },
  ipcRenderer: electron.ipcRenderer,
}));

test('页面只拿到 window.buddy：invoke 走 buddy: 通道，on 订阅 event: 事件并能退订', async () => {
  await import('../../electron/preload');
  const api = electron.exposed.buddy as BuddyApi;
  expect(Object.keys(electron.exposed)).toEqual(['buddy']);
  expect(await api.invoke('key:paste', { vendor: 'kimi', key: 'k' })).toEqual({ channel: 'buddy:key:paste', args: [{ vendor: 'kimi', key: 'k' }] });
  const got: unknown[] = [];
  const off = api.on('update', p => got.push(p));
  const fire = (p: unknown) => { for (const fn of electron.listeners.get('event:update') ?? []) fn({ sender: 'main' }, p); };
  fire({ version: '1.0.0', notes: '' });
  off();
  fire({ version: '2.0.0', notes: '' });
  expect(got).toEqual([{ version: '1.0.0', notes: '' }]);
});
