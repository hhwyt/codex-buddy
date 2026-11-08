// The only bridge between the page and the main process: four calls and one event
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('buddyNative', {
  runInstall: () => ipcRenderer.invoke('run-install'),
  buddy: (action: string, args: unknown) => ipcRenderer.invoke('buddy', action, args),
  showLogin: (rect: { x: number; y: number; w: number; h: number }) => ipcRenderer.invoke('show-login', rect),
  hideLogin: () => ipcRenderer.invoke('hide-login'),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  onLine: (fn: (payload: { kind: string; line: string }) => void) => {
    ipcRenderer.on('script-line', (_e, payload) => fn(payload));
  },
});
