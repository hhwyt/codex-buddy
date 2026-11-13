import { describe, expect, test } from 'vitest';
import { buildCatalog, catalogSlugs, labelOf, setCatalogLine } from '../../../electron/core/catalogs';
import { providerOf, PROVIDERS, isBuiltin } from '../../../electron/core/providers';
import { getValue } from '../../../electron/core/toml';

describe('catalogs', () => {
  test('labels say 免费 or 付费', () => {
    expect(labelOf({ slug: 'a', name: 'A', free: true })).toBe('A（免费）');
    expect(labelOf({ slug: 'b', name: 'B', free: false })).toBe('B（付费）');
  });
  test('catalog lists exactly the given models', () => {
    const zhipu = providerOf('zhipu');
    const cat = buildCatalog(zhipu.models);
    expect(catalogSlugs(JSON.stringify(cat))).toEqual(zhipu.models.map(m => m.slug));
    expect(cat.models.every(m => /（(免费|付费)）$/.test(String(m.display_name)))).toBe(true);
    expect(buildCatalog([{ slug: 'r', name: 'R', free: false, reasoning: ['low', 'high'] }]).models[0].default_reasoning_level).toBe('low');
  });
  test('setCatalogLine writes and removes model_catalog_json', () => {
    const withLine = setCatalogLine(['model = "x"'], '/h/.codex/codexbuddy-models.json');
    expect(getValue(withLine, '', 'model_catalog_json')).toBe('/h/.codex/codexbuddy-models.json');
    expect(getValue(setCatalogLine(withLine, null), '', 'model_catalog_json')).toBeNull();
  });
  test('catalogSlugs tolerates junk', () => {
    expect(catalogSlugs(null)).toEqual([]);
    expect(catalogSlugs('{"x":1}')).toEqual([]);
  });
  test('7 vendors in the default card order, each non-official one with models', () => {
    expect(PROVIDERS.map(p => p.id)).toEqual(['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai']);
    for (const p of PROVIDERS) if (!p.officialAccount) expect(p.models.length).toBeGreaterThan(0);
    expect(isBuiltin('kimi')).toBe(true);
    expect(isBuiltin('custom-x')).toBe(false);
  });
});
