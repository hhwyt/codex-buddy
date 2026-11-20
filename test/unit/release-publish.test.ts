import { afterEach, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-publish-'));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('V-04 发布元数据来自两个实际安装包，固定版本直链和 SHA-256 一致', () => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'CodexBuddy-Setup-0.2.0.exe'), 'windows-installer');
  fs.writeFileSync(path.join(dir, 'CodexBuddy-0.2.0.dmg'), 'mac-installer');
  const script = path.resolve('scripts/publish-release.mjs');
  const code = `import {releaseMetadata} from ${JSON.stringify('file://' + script)}; console.log(JSON.stringify(releaseMetadata({latest:{}},'0.2.0',${JSON.stringify(dir)})));`;
  const metadata = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }));
  expect(metadata.minVersion).toBe('0.2.0');
  expect(metadata.latest.winUrl).toBe('https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.2.0/CodexBuddy-Setup-0.2.0.exe');
  expect(metadata.latest.macUrl).toBe('https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.2.0/CodexBuddy-0.2.0.dmg');
  expect(metadata.latest.winSha256).toBe(createHash('sha256').update('windows-installer').digest('hex'));
  expect(metadata.latest.macSha256).toBe(createHash('sha256').update('mac-installer').digest('hex'));
});
