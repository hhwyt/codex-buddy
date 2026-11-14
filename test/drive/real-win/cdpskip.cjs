// node cdpskip.cjs <port>: walks through Codex's first-run questions (clicks 工程 / 继续 / 跳过 / 前往… in order)
const { chromium } = require('C:/Users/hwy/cb-topdown/node_modules/playwright');
(async () => {
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${process.argv[2]}`);
  const p = b.contexts().flatMap(c => c.pages()).find(x => x.url().startsWith('app://'));
  const click = async t => { const l = p.getByRole('button', { name: t, exact: true }).or(p.getByText(t, { exact: true })); if (await l.count()) { await l.last().click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(2500); return true; } return false; };
  const log = [];
  for (const t of ['工程', '继续', '跳过']) log.push(t + ':' + await click(t));
  await p.waitForTimeout(2000);
  for (const t of ['前往 ChatGPT', '跳过']) log.push(t + ':' + await click(t));
  await p.waitForTimeout(3000);
  console.log(log.join(' '), '|', (await p.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' '));
  process.exit(0);
})().catch(e => { console.error(String(e)); process.exit(1); });
