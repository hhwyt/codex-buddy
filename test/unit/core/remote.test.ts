// L1: remote config. Owner: A1.
import { describe, expect, test } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { isHidden, isSafeUrl, loadRemote, validateRemote, verifySignature, type Fetcher } from '../../../electron/core/remote';
import { REMOTE_CONFIG_PUBLIC_KEY } from '../../../electron/core/remote-key';
import { TEST_PUBLIC_KEY, testSign } from '../../fakes/remote-test-key.mjs';
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
  /** Fetcher that answers <url> with body(url) and <url>.sig with the test key's signature over it */
  const signed = (body: (url: string) => string, asked: string[] = []): Fetcher => async url => {
    asked.push(url);
    return url.endsWith('.sig') ? testSign(body(url.slice(0, -4))) : body(url);
  };
  const load = (f: Fetcher, last: typeof bundled | null = null) => loadRemote(REMOTE_CONFIG_URLS, f, last, bundled, TEST_PUBLIC_KEY);
  test('先读 GitHub Pages（配置和签名都从同一处取）', async () => {
    const asked: string[] = [];
    const r = await load(signed(() => newer, asked));
    expect(r.source).toBe('pages');
    expect(r.config.latest.version).toBe('9.9.9');
    expect(asked.sort()).toEqual([REMOTE_CONFIG_URLS[0], `${REMOTE_CONFIG_URLS[0]}.sig`]);
  });
  test('jsDelivr 不通再读 GitHub', async () => {
    const f: Fetcher = async url => { if (url.includes('jsdelivr') || url.includes('.github.io/')) throw new Error('down'); return signed(() => newer)(url, 1); };
    expect((await load(f)).source).toBe('github');
  });
  test('jsDelivr 返回坏文件也换 GitHub', async () => {
    expect((await load(signed(url => ((url.includes('jsdelivr') || url.includes('.github.io/')) ? '<html>' : newer)))).source).toBe('github');
  });
  test('都读不到：用上次的，再没有就用自带的', async () => {
    const f: Fetcher = async () => { throw new Error('offline'); };
    const last = validateRemote(newer)!;
    expect(await load(f, last)).toEqual({ config: last, source: 'cache' });
    expect(await load(f)).toEqual({ config: bundled, source: 'bundled' });
  });

  describe('签名（防伪造）', () => {
    const forged = (sig: (url: string) => Promise<string>): Fetcher => async url => (url.endsWith('.sig') ? sig(url) : newer);
    test.each([
      ['没有签名文件', forged(async () => { throw new Error('404'); })],
      ['签名是空的', forged(async () => '')],
      ['签名不是 base64 的 64 字节', forged(async () => 'bm90IGEgc2ln')],
      ['别的私钥签的', forged(async () => sign(null, Buffer.from(newer), generateKeyPairSync('ed25519').privateKey).toString('base64'))],
      ['签的是别的内容', forged(async () => testSign(bundledText))],
      ['内容被改了一个字节', async (url: string) => (url.endsWith('.sig') ? testSign(newer) : newer.replace('9.9.9', '9.9.8'))],
    ])('%s：当作连不上，用上次的', async (_, f) => {
      const last = validateRemote(withSwitches({ hideZh: true }))!;
      expect(await load(f as Fetcher, last)).toEqual({ config: last, source: 'cache' });
    });
    test('jsDelivr 的签名对不上，GitHub 的对得上：用 GitHub 的', async () => {
      const f: Fetcher = async url => ((url.includes('jsdelivr') || url.includes('.github.io/')) && url.endsWith('.sig') ? testSign('x') : signed(() => newer)(url, 1));
      expect((await load(f)).source).toBe('github');
    });
    test('verifySignature：签名末尾的换行不碍事，坏公钥不抛错', () => {
      expect(verifySignature(newer, `${testSign(newer)}\n`, TEST_PUBLIC_KEY)).toBe(true);
      expect(verifySignature(newer, testSign(newer), 'not a key')).toBe(false);
      expect(verifySignature(newer, testSign(newer), REMOTE_CONFIG_PUBLIC_KEY)).toBe(false);
    });
    test('仓库里的 remote/config.json.sig 是用内置公钥签的，和文件逐字节对得上', () => {
      const sig = nodeFs.readFileSync(nodePath.resolve(__dirname, '../../../remote/config.json.sig'), 'utf8');
      expect(verifySignature(bundledText, sig, REMOTE_CONFIG_PUBLIC_KEY)).toBe(true);
    });
  });

  describe('minVersion', () => {
    test('不写就是 0.0.0，写了原样带出', () => {
      const { minVersion: _m, ...noMin } = JSON.parse(bundledText);
      expect(validateRemote(JSON.stringify(noMin))!.minVersion).toBe('0.0.0');
      expect(validateRemote(JSON.stringify({ ...bundled, minVersion: '0.3.1' }))!.minVersion).toBe('0.3.1');
      expect(bundled.minVersion).toBe('0.0.0');
    });
    test.each([[1], [''], ['v0.2'], ['0.2.0-beta'], ['1.2.3.4.5']])('坏的 minVersion %s：整份配置不用', v => {
      expect(validateRemote(JSON.stringify({ ...bundled, minVersion: v }))).toBeNull();
    });
  });
  test('H-03 远程地址只有 jsDelivr 和 GitHub', () => {
    for (const u of REMOTE_CONFIG_URLS) expect(new URL(u).hostname).toMatch(/^(hhwyt\.github\.io|cdn\.jsdelivr\.net|raw\.githubusercontent\.com)$/);
  });
  test('M-24 菜单优先用远程清单，没有就用内置', () => {
    const kimi = providerOf('kimi');
    const c = validateRemote(JSON.stringify({ ...bundled, models: { kimi: [{ slug: 'kimi-new', name: 'Kimi New', free: true }] } }))!;
    expect(modelsFor(kimi, c).map(m => m.slug)).toEqual(['kimi-new']);
    expect(modelsFor(providerOf('zhipu'), c)).toEqual(providerOf('zhipu').models);
    expect(modelsFor(kimi, null)).toEqual(kimi.models);
  });
});
