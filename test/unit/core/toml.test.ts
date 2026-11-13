import { describe, expect, test } from 'vitest';
import { getValue, joinLines, setConfig, setTableValue, splitLines, tomlString } from '../../../electron/core/toml';

const sample = splitLines(`model = "gpt-5.5"
approval_policy = "on-request"

[model_providers.zhipu]
name = "智谱"
base_url = "https://x"

[projects."/a"]
trust_level = "trusted"
`);

describe('toml', () => {
  test('getValue reads top level and tables', () => {
    expect(getValue(sample, '', 'model')).toBe('gpt-5.5');
    expect(getValue(sample, 'model_providers.zhipu', 'base_url')).toBe('https://x');
    expect(getValue(sample, '', 'missing')).toBeNull();
    expect(getValue(sample, 'model_providers.zhipu', 'model')).toBeNull();
  });
  test('setConfig replaces only our keys and tables, keeps the rest in order', () => {
    const out = setConfig(sample, { model: 'model = "glm-5"', model_provider: 'model_provider = "zhipu"' }, { 'model_providers.zhipu': ['name = "新"'] });
    const text = joinLines(out);
    expect(text).toContain('model = "glm-5"');
    expect(text).toContain('model_provider = "zhipu"');
    expect(text).toContain('approval_policy = "on-request"');
    expect(text).toContain('[projects."/a"]\ntrust_level = "trusted"');
    expect(text.match(/\[model_providers\.zhipu\]/g)).toHaveLength(1);
    expect(text).toContain('name = "新"');
    expect(text).not.toContain('base_url = "https://x"');
    expect(text.indexOf('model = "glm-5"')).toBeLessThan(text.indexOf('['));
  });
  test('setConfig removes keys and tables given null', () => {
    const text = joinLines(setConfig(sample, { model: null }, { 'model_providers.zhipu': null }));
    expect(text).not.toMatch(/^model =/m);
    expect(text).not.toContain('zhipu');
    expect(text.startsWith('approval_policy')).toBe(true);
  });
  test('setConfig on an empty file', () => {
    expect(setConfig([], { model: 'model = "a"' }, {})).toEqual(['model = "a"']);
  });
  test('setTableValue updates, inserts into an existing table, or appends a new one', () => {
    expect(joinLines(setTableValue(sample, 'model_providers.zhipu', 'name', 'name = "改"'))).toContain('name = "改"');
    const inserted = setTableValue(sample, 'projects."/a"', 'x', 'x = 1');
    expect(inserted[inserted.length - 1]).toBe('x = 1');
    const mid = setTableValue(splitLines('[a]\nk = 1\n[b]\n'), 'a', 'z', 'z = 2');
    expect(mid).toEqual(['[a]', 'k = 1', 'z = 2', '[b]']);
    expect(setTableValue([], 'desktop', 'localeOverride', 'localeOverride = "zh-CN"')).toEqual(['', '[desktop]', 'localeOverride = "zh-CN"']);
  });
  test('splitLines / joinLines round trip and CRLF', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b']);
    expect(splitLines(null)).toEqual([]);
    expect(joinLines(['a', 'b', '', ''])).toBe('a\nb\n');
    expect(tomlString('C:\\x "y"')).toBe('"C:\\\\x \\"y\\""');
  });
});

describe('toml (duplicates)', () => {
  test('setTableValue collapses a key written twice in the table', () => {
    expect(setTableValue(['[desktop]', 'k = "a"', 'k = "b"'], 'desktop', 'k', 'k = "c"')).toEqual(['[desktop]', 'k = "c"']);
  });
});
