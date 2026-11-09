// CodexBuddy main process. Three jobs:
// 1. run codex.ps1 (from codex-install-made-easy, unchanged apart from its STEP switch) for the install;
// 2. read its output line by line and pass the STEP:<id>:<start|done|fail>:<text> lines to the page;
// 3. read and write Codex's config for the manage page (buddy.ts).
// While the install waits for the WeChat scan, Zhipu's login page is shown inside the window; codex.ps1 reaches it
// through the DevTools port below (CODEX_SETUP_LOGIN_PORT) and creates the key exactly as it does with its own Edge
// window.
import { app, BrowserWindow, ipcMain, screen, shell, WebContentsView } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { buddyDir, log, runAction, type Emit } from './buddy';

const ZHIPU_LOGIN_URL = 'https://bigmodel.cn/login?redirect=%2Fapikey%2Fplatform';
// Port 0: Chromium picks a free port (bound to 127.0.0.1 only) and writes it to <userData>/DevToolsActivePort, so another
// program already on a fixed port can't break the login
app.commandLine.appendSwitch('remote-debugging-port', '0');
const loginDebugPort = () => fs.readFileSync(path.join(app.getPath('userData'), 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
app.commandLine.appendSwitch('lang', 'zh-CN');

let win: BrowserWindow | null = null;
let loginView: WebContentsView | null = null;
const children = new Set<ChildProcess>();

/** codex.ps1 is packed in the app; PowerShell needs it as a real file */
function codexPs1Path(): string {
  const target = path.join(buddyDir, 'scripts', 'codex.ps1');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fs.readFileSync(path.join(__dirname, '..', 'scripts', 'vendor', 'codex.ps1')));
  return target;
}

/** Runs codex.ps1 hidden with STEP lines on, passing each line to onLine. Run through iex of the file text, as
 *  `irm | iex` does: unlike -File, this is not blocked when group policy forbids running .ps1 files */
function runCodexPs1(env: Record<string, string>, onLine: Emit): Promise<number> {
  const script = codexPs1Path().replace(/'/g, "''");
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `iex ([IO.File]::ReadAllText('${script}', [Text.Encoding]::UTF8))`], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, CODEX_SETUP_STEPS: '1', ...env },
  });
  children.add(child);
  // The script's advice is written for its terminal ("rerun this command"); in the app that is the 再试一次 button
  readline.createInterface({ input: child.stdout! }).on('line', line => { if (line.startsWith('STEP:')) onLine(line.replace(/重新运行这行命令(再试一次)?/g, '点「再试一次」')); });
  return new Promise(resolve => {
    child.on('error', e => { log(`codex.ps1 failed to start: ${e}`); });
    child.on('close', code => { children.delete(child); resolve(code ?? -1); });
  });
}

const send = (kind: 'install' | 'buddy') => (line: string) => win?.webContents.send('script-line', { kind, line });

ipcMain.handle('run-install', async () => {
  const code = await runCodexPs1({ CODEX_SETUP_LOGIN_PORT: loginDebugPort(), CODEX_SETUP_NO_OPEN: '1', CODEX_SETUP_EDITION: 'zh' }, send('install'));
  return { code };
});
ipcMain.handle('buddy', (_e, action: string, args: Record<string, unknown>) => runAction(action, args ?? {}, send('buddy'), runCodexPs1));

// Zhipu's login page over the page's login slot. An in-memory session: no cookies of earlier logins, nothing kept,
// like the temporary browser profile codex.ps1 uses
ipcMain.handle('show-login', (_e, r: { x: number; y: number; w: number; h: number }) => {
  if (!win) return;
  const bounds = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) };
  if (loginView) { loginView.setBounds(bounds); return; }
  loginView = new WebContentsView({ webPreferences: { partition: `login-${Date.now()}`, sandbox: true, contextIsolation: true } });
  const contents = loginView.webContents;
  contents.setUserAgent(contents.getUserAgent().replace(/ (Electron|codex-buddy)\/\S+/g, ''));
  contents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.contentView.addChildView(loginView);
  loginView.setBounds(bounds);
  contents.loadURL(ZHIPU_LOGIN_URL);
});
ipcMain.handle('hide-login', () => {
  if (!win || !loginView) return;
  win.contentView.removeChildView(loginView);
  loginView.webContents.close();
  loginView = null;
});
ipcMain.handle('open-url', (_e, url: string) => { if (/^https:\/\/[^\s"]+$/.test(url)) shell.openExternal(url); });

function createWindow() {
  // 980×680, but never larger than the screen's usable area (a 1366×768 laptop at 125% has about 1093×574); the
  // page adapts to smaller windows
  const area = screen.getPrimaryDisplay().workAreaSize;
  const hour = new Date().getHours();
  win = new BrowserWindow({
    width: Math.min(980, area.width), height: Math.min(680, area.height - 40), useContentSize: true, resizable: false, maximizable: false, title: 'CodexBuddy',
    // Same clock rule as ui/theme.ts (07:00–19:00 day), so the window doesn't flash the other theme's color before the page paints
    backgroundColor: hour >= 7 && hour < 19 ? '#f6f7f8' : '#0a0d12', autoHideMenuBar: true,
    // backgroundThrottling off: the stopwatch and the STEP updates keep their pace while the window is minimized
    // The real backend (codex.ps1, Appx, the Windows Codex app) only exists on Windows. Elsewhere (a Mac build to try the UI)
    // there is no bridge, so the page falls back to its preview backend and never touches ~/.codex
    webPreferences: { preload: process.platform === 'win32' ? path.join(__dirname, 'preload.js') : undefined, contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.removeMenu();
  // The page never navigates or opens windows; links go to the default browser through open-url
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));
  win.on('closed', () => { win = null; loginView = null; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
  // Closing the window stops a running install too (a rerun resumes the download)
  app.on('will-quit', () => {
    for (const child of children) if (child.pid) spawn('taskkill.exe', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true });
  });
}
