import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { hashTree, volatile } from '../e2e/hash';

let root: string;
const write = (rel: string, content: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};
const fingerprint = () => hashTree(root, volatile);
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-hash-'));
  vi.stubEnv('CI', '');
  vi.stubEnv('CODEXBUDDY_X01_STRICT', '');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

test('X-01 开发机网络缓存和工具运行时变化不误报，配置与凭据仍逐字节检查', () => {
  const runtime = ['Default/Network Persistent State', 'Default/Network Action Predictor', 'executor-plugins/codex-app-tools/server.mjs',
    'Local State', 'WasmTtsEngine/20261110.1/bindings_main.wasm', 'component_crx_cache/metadata.json', 'visualizations/chat/review.diff', 'session_index.jsonl', 'sqlite/codex.db', 'Default/Partitions/codex-browser-app/History', 'Default/Partitions/codex-browser-app/Top Sites'];
  for (const rel of runtime) write(rel, 'runtime');
  write('config.toml', 'model = "glm-5"');
  write('auth.json', '{"token":"fixture"}');
  const before = fingerprint();
  for (const rel of runtime) write(rel, 'refreshed runtime');
  expect(fingerprint()).toBe(before);
  write('config.toml', 'model = "different"');
  expect(fingerprint()).not.toBe(before);
  write('config.toml', 'model = "glm-5"');
  write('auth.json', '{"token":"changed"}');
  expect(fingerprint()).not.toBe(before);
});

test('X-01 CI 严格模式也检查运行时文件的字节变化', () => {
  vi.stubEnv('CI', '1');
  for (const file of ['Default/Network Persistent State', 'Local State', 'WasmTtsEngine/20261110.1/bindings_main.wasm', 'component_crx_cache/metadata.json', 'visualizations/chat/review.diff', 'session_index.jsonl', 'sqlite/codex.db', 'Default/Partitions/codex-browser-app/History', 'Default/Partitions/codex-browser-app/Top Sites']) {
    write(file, 'runtime');
    const before = fingerprint();
    write(file, 'changed runtime');
    expect(fingerprint()).not.toBe(before);
  }
});
