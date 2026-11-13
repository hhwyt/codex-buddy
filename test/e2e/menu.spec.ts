// Codex model menu M-24..M-26 and the bridge R-01, checked on what the running app wrote and serves. Owner: A7.
// M-24: model_catalog_json lists exactly the vendor's models from remote/config.json, each marked（免费）or（付费）.
// M-25: every listed model answers a real request through the app's own route (bridge or vendor), no 404.
// R-01: a chat-only vendor goes through the app's 127.0.0.1 bridge: one plain turn and one tool call.
import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { finishOnboarding, switchTo } from './flows';
import { catalogOf, codexHome, configToml, launch, readText, REPO, seedCodex, seedUserData, tomlValue, vendorState, type Launched } from './launch';
import { BASE_NEEDS, needs } from './pending';

let run: Launched;
needs(BASE_NEEDS);
test.afterEach(async () => { await run?.close(); });

const REMOTE = JSON.parse(fs.readFileSync(path.join(REPO, 'remote', 'config.json'), 'utf8')) as { models: Record<string, { slug: string; free: boolean }[]> };
const THIRD_PARTY = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan'];

async function ready(): Promise<Launched> {
  run = await launch({ seed: s => { seedCodex(s); seedUserData(s); } });
  await finishOnboarding(run.page);
  return run;
}
/** base_url of the provider the config uses, and the key Codex will send */
function route(): { baseUrl: string; key: string } {
  const toml = configToml(run.sandbox)!;
  const provider = tomlValue(toml, 'model_provider')!;
  const section = toml.split(/\n(?=\[)/).find(s => s.startsWith(`[model_providers.${provider}]`) || s.startsWith(`[model_providers."${provider}"]`)) ?? '';
  const baseUrl = /base_url\s*=\s*"([^"]+)"/.exec(section)![1];
  const key = /"OPENAI_API_KEY"\s*:\s*"([^"]+)"/.exec(readText(path.join(codexHome(run.sandbox), 'auth.json')) ?? '')?.[1] ?? '';
  return { baseUrl, key };
}
async function responses(model: string, input: string, tools: unknown[] = []): Promise<{ status: number; body: string }> {
  const { baseUrl, key } = route();
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, stream: true, input: [{ role: 'user', content: [{ type: 'input_text', text: input }] }], tools }),
  });
  return { status: res.status, body: await res.text() };
}

test('M-24 切换后 Codex 菜单里只有这一家的模型，每个都标免费或付费', async () => {
  test.setTimeout(240_000); // six vendors in a row
  await ready();
  for (const v of THIRD_PARTY) {
    await switchTo(run, v);
    const cat = catalogOf(configToml(run.sandbox));
    expect(cat, v).not.toBeNull();
    expect(cat!.map(m => m.slug).sort(), v).toEqual(REMOTE.models[v].map(m => m.slug).sort());
    for (const m of cat!) expect(m.label, `${v} ${m.slug}`).toMatch(/（免费）|（付费）/);
    const others = THIRD_PARTY.filter(o => o !== v).flatMap(o => REMOTE.models[o].map(m => m.slug));
    for (const m of cat!) expect(others, v).not.toContain(m.slug);
  }
});

test('M-25 菜单里每个模型都能实际发一句话，不报 Model not available', async () => {
  test.setTimeout(240_000); // six vendors in a row
  await ready();
  for (const v of THIRD_PARTY) {
    await switchTo(run, v);
    for (const m of catalogOf(configToml(run.sandbox))!) {
      const r = await responses(m.slug, '你好');
      expect(r.status, `${v} ${m.slug}`).toBe(200);
      expect(r.body, `${v} ${m.slug}`).not.toContain('Model not available');
      expect(r.body, `${v} ${m.slug}`).toContain('response.completed');
    }
  }
});

test('M-26 切回 OpenAI 官方后菜单恢复成 Codex 自带的官方模型', async () => {
  await ready();
  await switchTo(run, 'deepseek');
  expect(catalogOf(configToml(run.sandbox))).not.toBeNull();
  await switchTo(run, 'openai');
  const toml = configToml(run.sandbox);
  expect(tomlValue(toml, 'model_catalog_json')).toBeNull();
  expect(['openai', null]).toContain(tomlValue(toml, 'model_provider'));
});

test('R-01 Codex 经过转接层能完成一轮对话和一次工具调用', async () => {
  await ready();
  await switchTo(run, 'deepseek'); // chat-only vendor (spike (c)): must go through the bridge
  const { baseUrl } = route();
  expect(new URL(baseUrl).hostname).toBe('127.0.0.1');
  expect(baseUrl).not.toContain(run.vendors.vendorUrl('deepseek'));
  const model = tomlValue(configToml(run.sandbox), 'model') ?? 'deepseek-chat';
  const plain = await responses(model, '你好');
  expect(plain.status).toBe(200);
  expect(plain.body).toContain('response.output_text.delta');
  expect(plain.body).toContain('好了');
  const tools = [{ type: 'function', name: 'shell', description: 'run a command', parameters: { type: 'object', properties: { command: { type: 'array', items: { type: 'string' } } } } }];
  const tool = await responses(model, 'CALL_TOOL 列出文件', tools);
  expect(tool.status).toBe(200);
  expect(tool.body).toContain('function_call');
  expect(vendorState(run.vendors).requests.filter(r => r.vendor === 'deepseek' && r.path === '/v1/chat/completions').length).toBeGreaterThanOrEqual(2);
  // The real Codex CLI, only when a developer points at one (never in CI, never the user's real ~/.codex)
  const cli = process.env.CODEXBUDDY_REAL_CODEX_CLI;
  if (cli) {
    const r = spawnSync(cli, ['exec', '--skip-git-repo-check', '--ephemeral', '你好'], { env: { ...process.env, CODEX_HOME: codexHome(run.sandbox) }, encoding: 'utf8', timeout: 60_000 });
    expect(r.status, r.stderr).toBe(0);
  }
});
