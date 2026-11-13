import { describe, expect, test } from 'vitest';
import { parseEndpoints, REMOTE_CONFIG_URLS, withEndpoints } from '../../../electron/core/endpoints';
import { providerOf } from '../../../electron/core/providers';

describe('endpoints', () => {
  test('defaults: jsDelivr first, then GitHub', () => {
    expect(parseEndpoints(undefined).remoteConfig).toEqual(REMOTE_CONFIG_URLS);
    expect(REMOTE_CONFIG_URLS[0]).toContain('cdn.jsdelivr.net');
    expect(parseEndpoints('not json').vendors).toEqual({});
  });
  test('overrides point a vendor at the fake server', () => {
    const e = parseEndpoints(JSON.stringify({ remoteConfig: ['http://127.0.0.1:1/c'], vendors: { kimi: 'http://127.0.0.1:2/kimi' } }));
    expect(e.remoteConfig).toEqual(['http://127.0.0.1:1/c']);
    const kimi = withEndpoints(providerOf('kimi'), e);
    expect(kimi.baseUrl).toBe('http://127.0.0.1:2/kimi/v1');
    expect(kimi.rechargeUrl).toBe('http://127.0.0.1:2/kimi/recharge');
    expect(kimi.hosts).toEqual(['127.0.0.1:2']);
    expect(withEndpoints(providerOf('openai'), parseEndpoints(JSON.stringify({ vendors: { openai: 'http://127.0.0.1:3/openai' } }))).rechargeUrl).toBeNull();
    expect(withEndpoints(providerOf('zhipu'), e)).toBe(providerOf('zhipu'));
    expect(parseEndpoints('{"remoteConfig":5,"vendors":null}')).toEqual({ remoteConfig: REMOTE_CONFIG_URLS, vendors: {} });
  });
});
