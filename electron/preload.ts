// The only bridge between the page and the main process: window.buddy (see main/ipc-contract.ts). Owner: Base.
// A sandboxed preload cannot require local files, so this imports types only; main/ipc.ts registers handlers for the
// contract's channels and nothing else, so any other channel is rejected by Electron ("No handler registered").
import { contextBridge, ipcRenderer } from 'electron';
import type { BuddyApi } from './main/ipc-contract';

const api: BuddyApi = {
  invoke: ((channel: string, ...args: unknown[]) => ipcRenderer.invoke(`buddy:${channel}`, ...args)) as BuddyApi['invoke'],
  on: (event, fn) => {
    const listener = (_e: unknown, payload: Parameters<typeof fn>[0]) => fn(payload);
    ipcRenderer.on(`event:${event}`, listener);
    return () => { ipcRenderer.removeListener(`event:${event}`, listener); };
  },
};

contextBridge.exposeInMainWorld('buddy', api);
