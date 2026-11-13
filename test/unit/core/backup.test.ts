import { describe, expect, test } from 'vitest';
import { backup, restoreBackup, stamp } from '../../../electron/core/backup';
import { memFs, testCipher } from '../../helpers/memfs';

const paths = { codexHome: '/h/.codex', backupRoot: '/b' };
const now = new Date('2026-11-13T08:09:10Z');

describe('backup', () => {
  test('stamp is sortable', () => { expect(stamp(now)).toBe('20261113080910'); });
  test('copies config and stores auth.json encrypted, then restores both', () => {
    const fs = memFs({ '/h/.codex/config.toml': 'model = "a"\n', '/h/.codex/auth.json': '{"OPENAI_API_KEY":"sk-secret-123456"}' });
    const dir = backup(fs, testCipher, paths, 'switch deepseek', now);
    expect(dir).toBe('/b/20261113080910-switch_deepseek');
    expect(fs.readText(`${dir}/config.toml`)).toBe('model = "a"\n');
    expect(fs.readText(`${dir}/auth.json.bin`)).not.toContain('sk-secret-123456');
    fs.writeText('/h/.codex/config.toml', 'changed');
    fs.writeText('/h/.codex/auth.json', 'changed');
    restoreBackup(fs, testCipher, paths, dir);
    expect(fs.readText('/h/.codex/config.toml')).toBe('model = "a"\n');
    expect(fs.readText('/h/.codex/auth.json')).toContain('sk-secret-123456');
  });
  test('nothing to back up: empty folder, restore leaves files alone', () => {
    const fs = memFs();
    const dir = backup(fs, testCipher, paths, 'x', now);
    fs.writeText('/h/.codex/config.toml', 'new');
    restoreBackup(fs, testCipher, paths, dir);
    expect(fs.readText('/h/.codex/config.toml')).toBe('new');
  });
});
