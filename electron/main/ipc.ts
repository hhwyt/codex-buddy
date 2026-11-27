// Registers one ipcMain handler per contract channel (prefixed buddy:) and sends events (prefixed event:).
// Owner: Base (wiring); each feature agent supplies its handlers through registerIpc's map. A channel without a
// handler answers { ok: false, reason: '这个功能还没做好' } so the page never hangs.
import { ipcMain, type BrowserWindow } from 'electron';
import { hide } from '../core/redact';
import { CHANNELS, type ArgsOf, type Channel, type EventName, type IpcEvents, type ResultOf } from './ipc-contract';

export type Handlers = { [C in Channel]?: (args: ArgsOf<C>) => Promise<ResultOf<C>> | ResultOf<C> };

/** What the person sees when a handler throws: one plain sentence; the raw error only goes to the log */
export function fallbackReason(error: unknown): string {
  const code = String((error as NodeJS.ErrnoException)?.code ?? '');
  const text = `${code} ${String((error as Error)?.message ?? error)}`;
  if (/\b(EPERM|EACCES|EBUSY)\b/.test(text)) return '这一步被电脑拦下了，可能是杀毒软件。把 CodexBuddy 加进杀毒软件的信任名单后再试一次。';
  if (/\bENOSPC\b/.test(text)) return '电脑磁盘满了，清出一些空间后再试一次。';
  if (/\b(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH)\b|fetch failed/i.test(text)) return '网络断了一下，再试一次。';
  return '没做成，再试一次。';
}

export function registerIpc(handlers: Handlers, allows?: (channel: Channel) => Promise<boolean | 'version-required'>,
  log: (line: string) => void = () => undefined): void {
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
        try { log(`${channel} failed: ${hide(String((e as Error)?.stack ?? (e as Error)?.message ?? e))}`); } catch { /* logging must not hide the answer */ }
        return { ok: false, reason: fallbackReason(e) };
      }
    });
  }
}

export function sendEvent<E extends EventName>(win: BrowserWindow | null, event: E, payload: IpcEvents[E]): void {
  if (win && !win.isDestroyed()) win.webContents.send(`event:${event}`, payload);
}
