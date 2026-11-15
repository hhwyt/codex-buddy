// Forced upgrade (remote minVersion) on the real app: the whole window becomes ui-design/force-upgrade.html v4. Owner: A7.
import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import { TID } from '../../ui/testids';
import { finishOnboarding } from './flows';
import { launch, REPO, seedCodex, seedUserData, type Launched } from './launch';

const REMOTE = JSON.parse(fs.readFileSync(path.join(REPO, 'remote', 'config.json'), 'utf8'));
const SHOTS = process.env.CODEXBUDDY_UPGRADE_SHOTS; // a folder: save a screenshot of every phase there
let run: Launched | undefined;
let files: http.Server | undefined;
test.afterEach(async () => { await run?.close(); run = undefined; files?.close(); files = undefined; });

/** Serves a 4 MB "installer" in 64 KB pieces, slowly enough to watch the ring move */
async function slowFile(): Promise<string> {
  files = http.createServer((_req, res) => {
    const size = 4 * 1024 * 1024;
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(size) });
    let sent = 0;
    const t = setInterval(() => {
      res.write(Buffer.alloc(65536, 1));
      sent += 65536;
      if (sent >= size) { clearInterval(t); res.end(); }
    }, 40);
  });
  await new Promise<void>(r => files!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(files.address() as AddressInfo).port}/`;
}
/** The remote config only takes GitHub download links (H-03): send that one link to the local file server instead */
const RELEASE = 'https://github.com/hhwyt/codex-buddy/releases/download/v9.9.9/CodexBuddy-9.9.9';
const routeDownloads = (local: string) => run!.app.evaluate((_e, [release, to]) => {
  const real = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => real(String(url).startsWith(release) ? to : url, init)) as typeof fetch;
}, [RELEASE, local]);
const shot = async (name: string) => { if (SHOTS) await run!.page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

test('强制升级：配置抬高下限 → 整个窗口换成升级页；重开还是它；下载走圆环，下好打开安装包', async () => {
  const url = await slowFile();
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  await finishOnboarding(run.page);
  run.config.setConfig({ ...REMOTE, minVersion: '9.9.9', latest: { ...REMOTE.latest, version: '9.9.9', macUrl: `${RELEASE}.dmg`, winUrl: `${RELEASE}.exe` } });
  await run.page.getByTestId(TID.shell.navSettings).click();
  await run.page.getByTestId(TID.settings.checkUpdate).click();
  const screen = run.page.getByTestId(TID.upgrade.root);
  await expect(screen).toBeVisible();
  await expect(run.page.getByTestId(TID.shell.side)).toBeHidden();

  run = await run.relaunch();
  await routeDownloads(url);
  await expect(run.page.getByTestId(TID.upgrade.root)).toContainText('该升级了');
  await expect(run.page.getByTestId(TID.upgrade.root)).toContainText('需要 9.9.9');
  await shot('1-idle');
  await run.page.getByTestId(TID.upgrade.ask).click();
  await expect(run.page.getByTestId(TID.upgrade.qr)).toBeVisible();
  await shot('2-qr');
  await run.page.getByTestId(TID.upgrade.qrClose).click();

  await run.page.getByTestId(TID.upgrade.download).click();
  await expect(run.page.getByTestId(TID.upgrade.progress)).toContainText(/[4-8]\d%/, { timeout: 10_000 });
  await expect(run.page.getByTestId(TID.upgrade.root)).toContainText('/ 4.0 MB');
  await shot('3-download');
  const win = process.platform === 'win32';
  await expect(run.page.getByTestId(TID.upgrade.root)).toContainText(win ? '正在安装' : '把它拖进「应用程序」', { timeout: 20_000 });
  await shot('4-done');
  const opened = fs.readFileSync(path.join(run.sandbox, 'opened.log'), 'utf8');
  expect(opened).toContain(`CodexBuddy-9.9.9.${win ? 'exe' : 'dmg'}`);
});
