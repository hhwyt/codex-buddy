import { describe, expect, test } from 'vitest';
import { GuardError, guardedRemove, protectedHit, type ProtectedRoots } from '../../../electron/core/guard';
import { memFs } from '../../helpers/memfs';

const roots: ProtectedRoots = {
  home: '/Users/u', codexHome: '/Users/u/.codex',
  appDataDirs: ['/Users/u/Library/Application Support/Codex'],
};

describe('guard', () => {
  test.each([
    '/Users/u/.codex', '/Users/u/.codex/sessions', '/Users/u/.codex-deepseek', '/Users/u/.codex-kimi/config.toml',
    '/Users/u/Library/Application Support/Codex', '/Users/u/Library/Application Support/Codex (DeepSeek)',
    '/Users/u', '/Users', '/', 'C:', '',
  ])('G-01 拒绝删除用户数据 %s', target => {
    expect(protectedHit(target, roots)).not.toBeNull();
  });
  test.each([
    '/Applications/DeepSeek.app', '/Applications/ChatGPT 汉化版.app', '/Users/u/Library/Application Support/CodexBuddy/backups',
    '/Users/u/Desktop/ChatGPT 汉化版.lnk', '/Users/u/.codexbuddy-tmp',
  ])('允许删除入口 %s', target => {
    expect(protectedHit(target, roots)).toBeNull();
  });
  test('Windows paths are compared case-insensitively with either slash', () => {
    const win: ProtectedRoots = { home: 'C:\\Users\\U', codexHome: 'C:\\Users\\U\\.codex', appDataDirs: ['C:\\Users\\U\\AppData\\Roaming\\Codex'] };
    expect(protectedHit('c:/users/u/.CODEX/sessions', win)).not.toBeNull();
    expect(protectedHit('C:\\Users\\U\\AppData\\Roaming\\Codex\\x', win)).not.toBeNull();
    expect(protectedHit('C:\\Users\\U\\Desktop\\ChatGPT 汉化版.lnk', win)).toBeNull();
  });
  test('G-01 guardedRemove 删入口，不删数据目录', () => {
    const fs = memFs({ '/Applications/DeepSeek.app/Contents/Info.plist': 'x', '/Users/u/.codex-deepseek/sessions/a.jsonl': 'chat' });
    guardedRemove(fs, '/Applications/DeepSeek.app', roots);
    expect(fs.exists('/Applications/DeepSeek.app')).toBe(false);
    expect(() => guardedRemove(fs, '/Users/u/.codex-deepseek', roots)).toThrow(GuardError);
    expect(fs.readText('/Users/u/.codex-deepseek/sessions/a.jsonl')).toBe('chat');
    guardedRemove(fs, '/Applications/Missing.app', roots);
    expect(fs.removed).toEqual(['/Applications/DeepSeek.app']);
  });
});

describe('guard (Windows data dirs)', () => {
  const win: ProtectedRoots = { home: 'C:/Users/U', codexHome: 'C:/Users/U/.codex', appDataDirs: [] };
  test.each([
    'C:\\Users\\U\\AppData\\Roaming\\Codex', 'C:\\Users\\U\\AppData\\Local\\Codex (DeepSeek)\\Cache',
    'C:\\Users\\U\\AppData\\Local\\Packages\\OpenAI.Codex_2p2nqsd0c76g0\\LocalState',
  ])('G-01 拒绝删除 Codex 的 Windows 数据目录 %s', t => { expect(protectedHit(t, win)).not.toBeNull(); });
  test('G-01 Windows 上快捷方式可以删', () => {
    expect(protectedHit('C:\\Users\\U\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\ChatGPT 汉化版.lnk', win)).toBeNull();
  });
  test('G-01 Windows 上 CodexBuddy 自己的分身启动器文件夹可以删', () => {
    expect(protectedHit('C:\\Users\\U\\AppData\\Local\\CodexBuddy\\apps\\deepseek', win)).toBeNull();
  });
});
