#!/usr/bin/env node
// Fake Codex CLI. Owner: Base. Behaves like `codex exec --ephemeral --skip-git-repo-check <prompt>` and `codex login`
// as far as CodexBuddy can tell, reading $CODEX_HOME/config.toml and auth.json.
// Scenario: FAKE_CODEX_SCENARIO = ok | 401 | 429 | balance | timeout | unreachable | model (default ok)
//   or a file $CODEX_HOME/../fake-codex-scenario (lets a test change it between runs).
// Model check: when config.toml has model_catalog_json, the model must be one of its slugs, else it fails like the
// real CLI does: "unexpected status 404 Not Found: Model not available: <model>" (spike (a)).
// Every run appends one JSON line to $FAKE_CODEX_LOG (if set): { args, model, provider, catalog, key: '****' + last 4 }.
import fs from 'node:fs';
import path from 'node:path';

const home = process.env.CODEX_HOME;
const args = process.argv.slice(2);
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const config = home ? read(path.join(home, 'config.toml')) ?? '' : '';
const top = config.split(/\n\[/)[0];
const val = key => new RegExp(`^\\s*${key}\\s*=\\s*"(.*)"`, 'm').exec(top)?.[1] ?? null;
const model = val('model');
const provider = val('model_provider');
const catalogPath = val('model_catalog_json');
let catalog = null;
if (catalogPath) {
  try { catalog = JSON.parse(read(catalogPath) ?? '').models.map(m => m.slug); } catch { catalog = []; }
}
const auth = home ? read(path.join(home, 'auth.json')) : null;
const key = /"OPENAI_API_KEY"\s*:\s*"([^"]+)"/.exec(auth ?? '')?.[1] ?? null;
const scenarioFile = home ? read(path.join(home, '..', 'fake-codex-scenario')) : null;
const scenario = (scenarioFile ?? process.env.FAKE_CODEX_SCENARIO ?? 'ok').trim();

if (process.env.FAKE_CODEX_LOG) {
  fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args, model, provider, catalog, key: key ? `****${key.slice(-4)}` : null, scenario }) + '\n');
}

const fail = (lines, code = 1) => { for (const l of lines) process.stderr.write(l + '\n'); process.exit(code); };

if (args[0] === '--version') { console.log('codex-cli 0.166.0-fake'); process.exit(0); }
if (args[0] === 'login') {
  if (scenario === 'login-fail') process.exit(1);
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ tokens: { access_token: 'fake-access', refresh_token: 'fake-refresh', id_token: 'fake-id' } }));
  process.exit(0);
}
if (args[0] !== 'exec') fail([`fake codex: unsupported ${args.join(' ')}`], 2);

switch (scenario) {
  case 'timeout': setTimeout(() => {}, 1e9); break;
  case 'unreachable':
    for (let i = 1; i <= 5; i++) process.stderr.write(`ERROR: Reconnecting... ${i}/5 (stream disconnected: waiting for network)\n`);
    setTimeout(() => process.exit(1), 50);
    break;
  case '401': fail(['ERROR: unexpected status 401 Unauthorized: invalid api key']); break;
  case '429': fail(['ERROR: unexpected status 429 Too Many Requests: rate limit exceeded']); break;
  case 'balance': fail(['ERROR: unexpected status 402: insufficient balance 余额不足']); break;
  case 'model': fail([`ERROR: unexpected status 404 Not Found: Model not available: ${model}`]); break;
  default:
    if (provider && provider !== 'openai' && !key) fail(['ERROR: unexpected status 401 Unauthorized: missing api key']);
    if (catalog && model && !catalog.includes(model)) fail([`ERROR: unexpected status 404 Not Found: Model not available: ${model}`]);
    process.stderr.write(`session id: fake\n--------\nuser\n${args[args.length - 1]}\ncodex\n好了\ntokens used\n2\n`);
    process.stdout.write('好了\n');
    process.exit(0);
}
