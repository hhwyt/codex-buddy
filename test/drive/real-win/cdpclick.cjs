// node cdpclick.cjs <port> <text> <out.png>: real mouse click (CDP input) on the element whose text starts with <text>, then screenshot
const { chromium } = require('C:/Users/hwy/cb-topdown/node_modules/playwright');
(async () => {
  const [port, text, out] = process.argv.slice(2);
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const p = b.contexts().flatMap(c => c.pages()).find(x => x.url().startsWith('app://'));
  await p.getByText(text, { exact: false }).last().click({ timeout: 5000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: out });
  console.log(await p.evaluate(() => [...document.querySelectorAll('[role=menu],[role=listbox],[role=dialog]')].map(e => e.innerText).join(' ## ').slice(0, 600)));
  process.exit(0);
})().catch(e => { console.error(String(e)); process.exit(1); });
