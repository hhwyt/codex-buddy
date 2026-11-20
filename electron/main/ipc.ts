// Registers one ipcMain handler per contract channel (prefixed buddy:) and sends events (prefixed event:).
// Owner: Base (wiring); each feature agent supplies its handlers through registerIpc's map. A channel without a
// handler answers { ok: false, reason: '这个功能还没做好' } so the page never hangs.
import { ipcMain, type BrowserWindow } from 'electron';
import { hide } from '../core/redact';
import { CHANNELS, type ArgsOf, type Channel, type EventName, type IpcEvents, type ResultOf } from './ipc-contract';

export type Handlers = { [C in Channel]?: (args: ArgsOf<C>) => Promise<ResultOf<C>> | ResultOf<C> };

export function registerIpc(handlers: Handlers, allows?: (channel: Channel) => Promise<boolean | 'version-required'>): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(`buddy:${channel}`);
    ipcMain.handle(`buddy:${channel}`, async (_e, args) => {
      const fn = handlers[channel] as ((a: unknown) => unknown) | undefined;
      try {
        const permission = allows ? await allows(channel) : true;
        if (permission === 'version-required') return { ok: false, kind: 'version-required', reason: '升级后继续使用' };
        if (!permission) return { ok: false, kind: 'network', reason: '网络问题' };
        if (!fn) return { ok: false, reason: '这个功能还没做好' };
        return await fn(args);
      } catch (e) {
        return { ok: false, reason: `出了意外：${hide(String((e as Error).message ?? e))}` };
      }
    });
  }
}

export function sendEvent<E extends EventName>(win: BrowserWindow | null, event: E, payload: IpcEvents[E]): void {
  if (win && !win.isDestroyed()) win.webContents.send(`event:${event}`, payload);
}
