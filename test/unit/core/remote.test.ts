// L1: remote config. Owner: A1.
import { describe, expect, test } from 'vitest';
import { isHidden, isSafeUrl, loadRemote, validateRemote, type Fetcher } from '../../../electron/core/remote';
import { REMOTE_CONFIG_URLS } from '../../../electron/core/endpoints';
import { modelsFor } from '../../../electron/core/catalogs';
import { providerOf, PROVIDERS } from '../../../electron/core/providers';
import nodeFs from 'node:fs';
import nodePath from 'node:path';

const bundledText = nodeFs.readFileSync(nodePath.resolve(__dirname, '../../../remote/config.json'), 'utf8');

const bundled = validateRemote(bundledText)!;
const withSwitches = (s: Partial<typeof bundled.switches>) => JSON.stringify({ ...bundled, switches: { ...bundled.switches, ...s } });

describe('remote', () => {
  test('自带的 remote/config.json 有效，7 家里除官方外都有模型，和内置兜底一致', () => {
    expect(bundled).not.toBeNull();
    for (const p of PROVIDERS.filter(x => !x.officialAccount)) expect(bundled.models[p.id]).toEqual(p.models);
  });
  test('U-04 远程开关能隐藏某张卡或汉化入口', () => {
    const c = validateRemote(withSwitches({ hiddenVendors: ['kimi'], hideZh: true }))!;
    expect(isHidden('kimi', c)).toBe(true);
    expect(isHidden('zhipu', c)).toBe(false);
    expect(c.switches.hideZh).toBe(true);
  });
  test.each([
    ['not json', 'x'],
    ['schema', JSON.stringify({ ...bundled, schema: 2 })],
    ['array', '[]'],
    ['latest', JSON.stringify({ ...bundled, latest: { version: 1 } })],
    ['community', JSON.stringify({ ...bundled, community: null })],
    ['switches', JSON.stringify({ ...bundled, switches: { hiddenVendors: 'x', hideZh: false, hideClone: false } })],
    ['switch type', withSwitches({ hideZh: 'yes' as never })],
    ['model shape', JSON.stringify({ ...bundled, models: { kimi: [{ slug: 'a' }] } })],
    ['model reasoning', JSON.stringify({ ...bundled, models: { kimi: [{ slug: 'a', name: 'A', free: true, reasoning: [1] }] } })],
    ['models not list', JSON.stringify({ ...bundled, models: { kimi: {} } })],
    ['H-03 foreign url', JSON.stringify({ ...bundled, latest: { ...bundled.latest, macUrl: 'https://example.com/x.dmg' } })],
    ['H-03 http', JSON.stringify({ ...bundled, community: { qrUrl: 'http://github.com/q.png', text: '' } })],
  ])('坏的配置不用：%s', (_, text) => { expect(validateRemote(text)).toBeNull(); });
  test('不认识的厂商被忽略，缺 reasoning 补成空', () => {
    const c = validateRemote(JSON.stringify({ ...bundled, models: { other: [], kimi: [{ slug: 'k', name: 'K', free: false }] } }))!;
    expect(c.models).toEqual({ kimi: [{ slug: 'k', name: 'K', free: false, reasoning: [] }] });
  });
  test('H-03 URL 只能是 GitHub / jsDelivr', () => {
    expect(isSafeUrl('')).toBe(true);
    expect(isSafeUrl('https://raw.githubusercontent.com/a/b')).toBe(true);
    expect(isSafeUrl('not a url')).toBe(false);
  });

  const newer = JSON.stringify({ ...bundled, latest: { ...bundled.latest, version: '9.9.9' } });
  test('先读 jsDelivr', async () => {
    const asked: string[] = [];
    const f: Fetcher = async url => { asked.push(url); return newer; };
    const r = await loadRemote(REMOTE_CONFIG_URLS, f, null, bundled);
    expect(r.source).toBe('jsdelivr');
    expect(r.config.latest.version).toBe('9.9.9');
    expect(asked).toEqual([REMOTE_CONFIG_URLS[0]]);
  });
  test('jsDelivr 不通再读 GitHub', async () => {
    const f: Fetcher = async url => { if (url.includes('jsdelivr')) throw new Error('down'); return newer; };
    expect((await loadRemote(REMOTE_CONFIG_URLS, f, null, bundled)).source).toBe('github');
  });
  test('jsDelivr 返回坏文件也换 GitHub', async () => {
    const f: Fetcher = async url => (url.includes('jsdelivr') ? '<html>' : newer);
    expect((await loadRemote(REMOTE_CONFIG_URLS, f, null, bundled)).source).toBe('github');
  });
  test('都读不到：用上次的，再没有就用自带的', async () => {
    const f: Fetcher = async () => { throw new Error('offline'); };
    const last = validateRemote(newer)!;
    expect(await loadRemote(REMOTE_CONFIG_URLS, f, last, bundled)).toEqual({ config: last, source: 'cache' });
    expect(await loadRemote(REMOTE_CONFIG_URLS, f, null, bundled)).toEqual({ config: bundled, source: 'bundled' });
  });
  test('H-03 远程地址只有 jsDelivr 和 GitHub', () => {
    for (const u of REMOTE_CONFIG_URLS) expect(new URL(u).hostname).toMatch(/^(cdn\.jsdelivr\.net|raw\.githubusercontent\.com)$/);
  });
  test('M-24 菜单优先用远程清单，没有就用内置', () => {
    const kimi = providerOf('kimi');
    const c = validateRemote(JSON.stringify({ ...bundled, models: { kimi: [{ slug: 'kimi-new', name: 'Kimi New', free: true }] } }))!;
    expect(modelsFor(kimi, c).map(m => m.slug)).toEqual(['kimi-new']);
    expect(modelsFor(providerOf('zhipu'), c)).toEqual(providerOf('zhipu').models);
    expect(modelsFor(kimi, null)).toEqual(kimi.models);
  });
});
