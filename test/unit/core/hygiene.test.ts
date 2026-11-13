// L1 scans over the files A1 owns: no humanslive anywhere (H-03), no full key in any text core produces (S-08).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { describeRestore, planRestore } from '../../../electron/core/restore';
import { reasonOf } from '../../../electron/core/connectivity';
import { hide, looksLikeKey } from '../../../electron/core/redact';

const root = path.resolve(__dirname, '../../..');
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

describe('hygiene', () => {
  test('H-03 core 代码和远程配置里不出现 humanslive', () => {
    const files = [...walk(path.join(root, 'electron/core')), path.join(root, 'remote/config.json')];
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/humans\s*live/i);
  });
  test('S-08 打码后的任何输出都不含完整 Key', () => {
    const keys = ['sk-abcdefghijklmnopqrstuvwx', '0123456789abcdef0123456789abcdef.ABCDEFGHabcdefgh'];
    const text = `api_key = "${keys[0]}"\nAuthorization: Bearer ${keys[0]}\n${keys[1]}\nx-api-key: ${keys[0]}`;
    expect(looksLikeKey(text)).toBe(true);
    expect(looksLikeKey(hide(text))).toBe(false);
    const ui = [...describeRestore(planRestore({ original: null, codexInstalledNow: false, codexRunning: true, zhLauncherNow: true, clones: ['DeepSeek'] })), reasonOf('auth')];
    expect(looksLikeKey(ui.join('\n'))).toBe(false);
  });
});
