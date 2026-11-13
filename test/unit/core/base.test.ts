// L1 tests for the logic Base moved out of buddy.ts. A1 extends.
import { describe, expect, test } from 'vitest';
import { hide, keyTail, looksLikeKey } from '../../../electron/core/redact';
import { getValue, joinLines, setConfig, setTableValue, splitLines } from '../../../electron/core/toml';
import { GuardError, guardedRemove, protectedHit } from '../../../electron/core/guard';
import { buildCatalog, catalogSlugs, labelOf, setCatalogLine } from '../../../electron/core/catalogs';
import { classifyFailure, testConnectivity } from '../../../electron/core/connectivity';
import type { FileSystem } from '../../../electron/core/types';

describe('redact', () => {
  test('S-08 日志里的 Key 被打码', () => {
    const t = hide('Bearer sk-abcdef123456 {"OPENAI_API_KEY":"sk-zzzzzzzzzzzz"} 0123456789abcdef0123456789abcdef.ABCDEFGHabcdefgh "access_token":"x.y"');
    expect(looksLikeKey(t)).toBe(false);
    expect(t).toContain('****');
    expect(keyTail('sk-123456787c21')).toBe('7c21');
    expect(keyTail('short')).toBeNull();
  });
});

describe('toml', () => {
  test('setConfig keeps unrelated lines', () => {
    const lines = splitLines('model = "a"\n\n[x]\ny = "1"\n');
    const out = setConfig(lines, { model: 'model = "b"', model_provider: 'model_provider = "p"' }, { 'model_providers.p': ['base_url = "u"'] });
    expect(getValue(out, '', 'model')).toBe('b');
    expect(getValue(out, 'x', 'y')).toBe('1');
    expect(getValue(out, 'model_providers.p', 'base_url')).toBe('u');
    expect(joinLines(setTableValue(out, 'desktop', 'k', 'k = "v"'))).toContain('[desktop]\nk = "v"');
  });
});

describe('guard', () => {
  const roots = { codexHome: '/u/.codex', home: '/u', appDataDirs: ['/u/Library/Application Support/Codex'] };
  test('G-01 删除碰到数据目录就拒绝', () => {
    for (const p of ['/u/.codex', '/u/.codex/sessions', '/u/.codex-deepseek', '/u', '/', '/u/Library/Application Support/Codex (DeepSeek)']) {
      expect(protectedHit(p, roots)).not.toBeNull();
    }
    expect(protectedHit('/Applications/DeepSeek.app', roots)).toBeNull();
    const removed: string[] = [];
    const fs = { exists: () => true, remove: (p: string) => removed.push(p) } as unknown as FileSystem;
    expect(() => guardedRemove(fs, '/u/.codex-kimi', roots)).toThrow(GuardError);
    guardedRemove(fs, '/Applications/Kimi.app', roots);
    expect(removed).toEqual(['/Applications/Kimi.app']);
  });
});

describe('catalogs', () => {
  test('M-24 菜单只有这一家的模型并标免费付费', () => {
    const cat = buildCatalog([{ slug: 'glm-4.5-flash', name: 'GLM', free: true }, { slug: 'glm-5', name: 'GLM-5', free: false }]);
    expect(catalogSlugs(JSON.stringify(cat))).toEqual(['glm-4.5-flash', 'glm-5']);
    expect(labelOf({ slug: 'a', name: 'A', free: false })).toBe('A（付费）');
    expect(catalogSlugs('nope')).toEqual([]);
  });
  test('M-26 切回官方去掉清单', () => {
    const withCat = setCatalogLine(['model = "x"'], '/h/c.json');
    expect(getValue(withCat, '', 'model_catalog_json')).toBe('/h/c.json');
    expect(getValue(setCatalogLine(withCat, null), '', 'model_catalog_json')).toBeNull();
  });
});

describe('connectivity', () => {
  test('classifies failures', () => {
    expect(classifyFailure('waiting for network\nwaiting for network', false)).toBe('unreachable');
    expect(classifyFailure('', true)).toBe('timeout');
    expect(classifyFailure('402 insufficient balance', false)).toBe('balance');
    expect(classifyFailure('401 Unauthorized', false)).toBe('auth');
    expect(classifyFailure('Model not available', false)).toBe('model');
    expect(classifyFailure('429', false)).toBe('rate-limit');
  });
  test('ok reply', async () => {
    const r = await testConnectivity(async () => ({ out: '好了\n', err: '', timedOut: false }), '/h');
    expect(r).toEqual({ ok: true, reply: '好了' });
  });
});
