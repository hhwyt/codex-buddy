// Real-vendor drive server: launches the packaged CodexBuddy (sandbox, real Codex) with Playwright's _electron and
// runs JS posted to http://127.0.0.1:47123/eval against it. Started in the desktop session (schtasks /IT).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('C:/Users/hwy/cb-topdown/node_modules/playwright');
const ROOT = 'C:/Users/hwy/cb-real';
const SHOTS = path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const log = (...a) => fs.appendFileSync(path.join(ROOT, 'server.log'), `${new Date().toISOString()} ${a.join(' ')}\n`);
let app = null, page = null;

async function launch(extraEnv = {}) {
  app = await _electron.launch({
    executablePath: 'C:/Users/hwy/cb-topdown/release/win-unpacked/CodexBuddy.exe',
    env: { ...process.env, CODEXBUDDY_SANDBOX: 'C:\\Users\\hwy\\CodexBuddy-Test', CODEXBUDDY_REAL_CODEX: '1', ...extraEnv },
    timeout: 60000, args: extraEnv.__ARGS ? extraEnv.__ARGS.split(' ') : [],
  });
  app.process().stdout?.on('data', d => log('[app]', String(d).trim()));
  app.process().stderr?.on('data', d => log('[app!]', String(d).trim()));
  // The main window is the one loading ui/index.html
  for (let i = 0; i < 60 && !page; i++) {
    for (const w of app.windows()) if (w.url().includes('index.html')) page = w;
    if (!page) await new Promise(r => setTimeout(r, 500));
  }
  log('launched', page ? page.url() : 'no page');
}

async function shot(name) {
  const file = path.join(SHOTS, `real-win-${name}.png`);
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('index.html')); w.webContents.invalidate(); });
  await page.waitForTimeout(250);
  const parts = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(x => x.webContents.getURL().includes('index.html'));
    const base = await w.webContents.capturePage();
    const scale = base.getSize().width / Math.max(1, w.getContentBounds().width);
    const out = [{ x: 0, y: 0, url: base.toDataURL() }];
    for (const v of w.contentView.children) {
      if (!v.webContents || v.webContents.id === w.webContents.id || !v.getVisible()) continue;
      const b = v.getBounds();
      if (b.width > 0 && b.height > 0) out.push({ x: b.x * scale, y: b.y * scale, url: (await v.webContents.capturePage()).toDataURL() });
    }
    return out;
  });
  const png = await page.evaluate(async list => {
    const imgs = await Promise.all(list.map(p => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = p.url; })));
    const c = document.createElement('canvas');
    c.width = imgs[0].naturalWidth; c.height = imgs[0].naturalHeight;
    const g = c.getContext('2d');
    imgs.forEach((img, i) => g.drawImage(img, list[i].x, list[i].y));
    return c.toDataURL('image/png').split(',')[1];
  }, parts);
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
  return file;
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', async () => {
    try {
      let out;
      if (req.url === '/launch') { await launch(body ? JSON.parse(body) : {}); out = 'ok'; }
      else if (req.url === '/quit') { await app.close().catch(() => {}); app = null; page = null; out = 'closed'; }
      else {
        const fn = new AsyncFunction('ctx', body);
        out = await fn({ app, page, shot, fs, path, log, require, setPage: p => { page = p; } });
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, out }, null, 1));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ ok: false, err: String(e && e.stack || e) }));
    }
  });
}).listen(47123, '127.0.0.1', () => log('listening'));
