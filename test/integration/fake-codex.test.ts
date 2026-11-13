// L2: fake Codex CLI through the real runner, against a temp CODEX_HOME.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from 'vitest';
import { testConnectivity } from '../../electron/core/connectivity';
import { codexRunner } from '../../electron/platform/run-codex';

const fake = path.join(__dirname, '..', 'fakes', 'fake-codex.mjs');
function home(model: string, catalog: string[]) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-fake-'));
  fs.writeFileSync(path.join(h, 'c.json'), JSON.stringify({ models: catalog.map(slug => ({ slug })) }));
  fs.writeFileSync(path.join(h, 'config.toml'), `model_provider = "p"\nmodel = "${model}"\nmodel_catalog_json = "${path.join(h, 'c.json')}"\n`);
  fs.writeFileSync(path.join(h, 'auth.json'), '{"OPENAI_API_KEY":"sk-fake-123456"}');
  return h;
}

test('M-07 模型不在清单里测试连通不过', async () => {
  const run = codexRunner(fake);
  expect((await testConnectivity(run, home('glm-5', ['glm-5']), 10_000)).ok).toBe(true);
  const bad = await testConnectivity(run, home('gpt-5.5', ['glm-5']), 10_000);
  expect(bad).toMatchObject({ ok: false, code: 'model' });
});
