// Registers one ipcMain handler per contract channel (prefixed buddy:) and sends events (prefixed event:).
// Owner: Base (wiring); each feature agent supplies its handlers through registerIpc's map. A channel without a
// handler answers { ok: false, reason: '这个功能还没做好' } so the page never hangs.
import { ipcMain, type BrowserWindow } from 'electron';
import { hide } from '../core/redact';
import { CHANNELS, type ArgsOf, type Channel, type EventName, type IpcEvents, type ResultOf } from './ipc-contract';

export type Handlers = { [C in Channel]?: (args: ArgsOf<C>) => Promise<ResultOf<C>> | ResultOf<C> };

export function registerIpc(handlers: Handlers, authorize?: (channel: Channel) => Promise<boolean>): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(`buddy:${channel}`);
    ipcMain.handle(`buddy:${channel}`, async (_e, args) => {
      const fn = handlers[channel] as ((a: unknown) => unknown) | undefined;
      if (!fn) return { ok: false, reason: '这个功能还没做好' };
      try {
        if (authorize && !(await authorize(channel))) return { ok: false, kind: 'version-required', reason: '请先联网校验版本或升级' };
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
