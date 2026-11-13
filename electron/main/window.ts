// The main window: no title bar (W-01). Mac: traffic lights inset into the left column (hiddenInset);
// Windows: the three window buttons drawn by the system top right (titleBarOverlay). Owner: Base; A4 adds the
// right-side browser's widening (B-02) in browser.ts.
import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';

/** Window chrome colors = ui/tokens.css --side / --ink (the window paints before the page) */
const SIDE = '#f9f9f9';
const INK = '#0d0d0d';
export const WINDOW_SIZE = { width: 980, height: 680 };

export function windowOptions(os: 'mac' | 'win'): Electron.BrowserWindowConstructorOptions {
  return {
    width: WINDOW_SIZE.width, height: WINDOW_SIZE.height, minWidth: 860, minHeight: 560, useContentSize: true,
    title: 'CodexBuddy', backgroundColor: '#ffffff', autoHideMenuBar: true, show: false,
    ...(os === 'mac'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } }
      : { titleBarStyle: 'hidden' as const, titleBarOverlay: { color: SIDE, symbolColor: INK, height: 40 } }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    },
  };
}

export function createMainWindow(os: 'mac' | 'win'): BrowserWindow {
  const area = screen.getPrimaryDisplay().workAreaSize;
  const opts = windowOptions(os);
  opts.width = Math.min(opts.width!, area.width);
  opts.height = Math.min(opts.height!, area.height - 40);
  const win = new BrowserWindow(opts);
  win.removeMenu();
  // The page never navigates or opens windows; links go out through shell:open-external
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', '..', 'ui', 'index.html'));
  return win;
}
