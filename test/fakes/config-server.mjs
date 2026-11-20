// Fake remote-config server: serves remote/config.json at a jsDelivr-like and a GitHub-raw-like path, and
// <path>.sig next to it, signed with the test key (remote-test-key.mjs; the app trusts it via CODEXBUDDY_REMOTE_KEY).
// Owner: Base. Modes per source: ok | down (500) | bad (invalid JSON) | slow (never answers) | nosig (no .sig, 404) |
// badsig (a signature over other bytes: a forged config).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_PUBLIC_KEY, testSign } from './remote-test-key.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BUNDLED_CONFIG = path.join(here, '..', '..', 'remote', 'config.json');

/** @param {{ port?: number, config?: unknown }} [opts] */
export function startConfigServer(opts = {}) {
  const state = {
    body: JSON.stringify(opts.config ?? JSON.parse(fs.readFileSync(BUNDLED_CONFIG, 'utf8'))),
    mode: /** @type {Record<'jsdelivr'|'github', string>} */ ({ jsdelivr: 'ok', github: 'ok' }),
    hits: /** @type {string[]} */ ([]),
    hangs: /** @type {http.ServerResponse[]} */ ([]),
    networkMode: /** @type {'ok'|'down'|'slow'|'redirect'} */ ('ok'),
  };
  const server = http.createServer((req, res) => {
    if (req.url === '/network-check') {
      if (state.networkMode === 'slow') { state.hangs.push(res); return; }
      if (state.networkMode === 'down') { res.writeHead(503); return res.end('offline'); }
      if (state.networkMode === 'redirect') { res.writeHead(302, { location: '/portal' }); return res.end(); }
      res.writeHead(200, { 'cache-control': 'no-store' });
      return res.end('online');
    }
    const source = req.url?.startsWith('/jsdelivr/') ? 'jsdelivr' : req.url?.startsWith('/github/') ? 'github' : null;
    if (!source) { res.writeHead(404); return res.end(); }
    state.hits.push(source);
    const mode = state.mode[source];
    if (mode === 'slow') { state.hangs.push(res); return; }
    if (mode === 'down') { res.writeHead(500); return res.end('down'); }
    const body = mode === 'bad' ? '{not json' : state.body;
    if (req.url?.endsWith('.sig')) {
      if (mode === 'nosig') { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(`${testSign(mode === 'badsig' ? `${body} ` : body)}\n`);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(body);
  });
  return new Promise(resolve => {
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url, state, publicKey: TEST_PUBLIC_KEY,
        jsdelivrUrl: `${url}/jsdelivr/remote/config.json`,
        githubUrl: `${url}/github/remote/config.json`,
        setMode: (/** @type {'jsdelivr'|'github'} */ source, /** @type {string} */ mode) => { state.mode[source] = mode; },
        setNetworkMode: (/** @type {'ok'|'down'|'slow'|'redirect'} */ mode) => { state.networkMode = mode; },
        setConfig: (/** @type {unknown} */ config) => { state.body = JSON.stringify(config); },
        close: () => new Promise(r => { for (const h of state.hangs) h.destroy(); server.closeAllConnections?.(); server.close(() => r(undefined)); }),
      });
    });
  });
}
