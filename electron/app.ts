// CodexBuddy main process entry. Owner: Base (shell); the integration agent wires every feature's handlers here.
// CODEXBUDDY_SANDBOX=<dir>: every path inside <dir> (tests, e2e). CODEXBUDDY_ENDPOINTS=<json>: external addresses
// pointed at fake servers (core/endpoints.ts).
import { app, type BrowserWindow } from 'electron';
import { PROVIDERS } from './core/providers';
import { pickPlatform } from './platform';
import { registerIpc } from './main/ipc';
import type { CardView, WalletView } from './main/ipc-contract';
import { createMainWindow } from './main/window';

const platform = pickPlatform();
const os: 'mac' | 'win' = process.platform === 'win32' ? 'win' : 'mac';
let win: BrowserWindow | null = null;

if (platform.paths.home && process.env.CODEXBUDDY_SANDBOX) {
  // Keep Electron's own profile inside the sandbox too
  app.setPath('userData', `${process.env.CODEXBUDDY_SANDBOX}/electron-user-data`);
}

const defaultWallet = (): WalletView => ({
  order: PROVIDERS.map(p => p.id), active: null, mode: 'switch',
  cards: PROVIDERS.map((p): CardView => ({
    vendor: p.id, name: p.name, model: null, free: false, paid: p.models.some(m => !m.free),
    keyTail: null, cloneMade: false, note: null,
  })),
});

registerIpc({
  'app:state': () => ({
    version: app.getVersion(), os, configured: false, codexInstalled: false, codexRunning: false,
    zh: { on: false, launcherExists: false, supported: true, hidden: false },
    community: { qrUrl: null, text: '连上网后显示' },
  }),
  'wallet:get': () => defaultWallet(),
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    win = createMainWindow(os);
    win.on('closed', () => { win = null; });
  });
  app.on('window-all-closed', () => app.quit());
}
