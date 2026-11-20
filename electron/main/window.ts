// The main window: no title bar (W-01). Mac: traffic lights inset into the left column (hiddenInset);
// Windows: the three window buttons drawn by the system top right (titleBarOverlay). Owner: Base; A4 adds the
// right-side browser's widening (B-02) in browser.ts.
import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

/** Transparent native button background lets page content and modal scrims paint beneath it. */
const INK = '#0d0d0d';
export const WINDOW_SIZE = { width: 980, height: 680 };

/** devTools false in release builds (main/hardening.ts) */
export function windowOptions(os: 'mac' | 'win', devTools = true): Electron.BrowserWindowConstructorOptions {
  return {
    width: WINDOW_SIZE.width, height: WINDOW_SIZE.height, minWidth: 860, minHeight: 560, useContentSize: true,
    title: 'CodexBuddy', backgroundColor: '#ffffff', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, '..', '..', 'ui', 'assets', 'icon.png'),
    ...(os === 'mac'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: '#00000000', symbolColor: INK, height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, devTools,
    },
  };
}

/** offscreen: test runs (sandbox + fake servers) keep the window off every screen and never focus it, so automated
 *  tests do not show up on, or take the mouse from, the person at the computer; screenshots still work */
export function createMainWindow(os: 'mac' | 'win', { offscreen = false, devTools = true } = {}): BrowserWindow {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const opts = windowOptions(os, devTools);
  opts.width = Math.min(opts.width!, area.width);
  opts.height = Math.min(opts.height!, area.height - 40);
  if (offscreen) Object.assign(opts, { x: -30000, y: -30000, skipTaskbar: true });
  const win = new BrowserWindow(opts);
  win.removeMenu();
  // The page never navigates or opens windows; links go out through shell:open-external
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => (offscreen ? win.showInactive() : win.show()));
  win.loadFile(path.join(__dirname, '..', '..', 'ui', 'index.html'));
  return win;
}
