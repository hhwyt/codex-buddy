// node cdpshot.cjs <port> <out.png> [js]: screenshot (and optional eval) of the Codex page behind a 127.0.0.1 debug port
const { chromium } = require('C:/Users/hwy/cb-topdown/node_modules/playwright');
(async () => {
  const [port, out, js] = process.argv.slice(2);
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const pages = b.contexts().flatMap(c => c.pages());
  const p = pages.find(x => !x.url().startsWith('devtools')) || pages[0];
  console.log('pages', pages.map(x => x.url()).join(' | '));
  if (js) console.log('eval', JSON.stringify(await p.evaluate(js)));
  if (out && out !== '-') await p.screenshot({ path: out });
  process.exit(0);
})().catch(e => { console.error(String(e)); process.exit(1); });
