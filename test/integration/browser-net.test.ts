// L2: CodexBuddy's own network whitelist and the two connection lists (S-04, S-05). Owner: A4.
import * as http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

const fx = vi.hoisted(() => ({ partitions: [] as string[] }));
vi.mock('electron', () => {
  const sessions: Record<string, any> = {};
  const get = (name: string) => {
    const s: any = sessions[name] ??= { handler: null, webRequest: { onBeforeRequest: (h: any) => { s.handler = h; } } };
    return s;
  };
  return { session: { get defaultSession() { return get('default'); }, fromPartition: (p: string) => { fx.partitions.push(p); return get(p); } } };
});

import { session } from 'electron';
import { PROVIDERS } from '../../electron/core/providers';
import type { ConnectionRecord } from '../../electron/core/whitelist';
import { BROWSER_PARTITION } from '../../electron/main/browser';
import {
  checkRequest, connections, defaultAllowedHosts, guardedFetch, hostAllowed, installNetGuard, readBytes, record, resetConnections, githubInstallerUrl,
} from '../../electron/main/net';

const allowed = defaultAllowedHosts(PROVIDERS);
let recs: ConnectionRecord[];
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((_q, r) => r.end('ok'));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));
beforeEach(() => {
  resetConnections();
  recs = [];
  installNetGuard(() => allowed, r => recs.push(r));
});

const run = (s: any, url: string) => new Promise<any>(r => s.handler({ url }, r));

describe('whitelist', () => {
  test('S-05 白名单含 GitHub、jsDelivr 和 7 家域名', () => {
    for (const h of ['github.com', 'objects.githubusercontent.com', 'cdn.jsdelivr.net', 'open.bigmodel.cn', 'api.deepseek.com',
      'api.moonshot.cn', 'dashscope.aliyuncs.com', 'api.minimaxi.com', 'api.hunyuan.cloud.tencent.com', 'api.openai.com']) {
      expect(hostAllowed(h, allowed)).toBe(true);
    }
    expect(hostAllowed('sub.github.com', allowed)).toBe(true);
    expect(hostAllowed('evilgithub.com', allowed)).toBe(false);
    expect(hostAllowed('github.com.evil.example', allowed)).toBe(false);
    expect(hostAllowed('127.0.0.1:5678', [])).toBe(true);
    expect(hostAllowed('[::1]:80', [])).toBe(true);
    expect(hostAllowed('localhost', [])).toBe(true);
    expect(hostAllowed('example.com:8443', ['example.com:8443'])).toBe(true);
    expect(allowed.join(' ')).not.toMatch(/humanslive/i);
  });

  test('S-05 白名单外的请求被拦掉，并且记录下来', async () => {
    const app = session.defaultSession as any;
    expect(await run(app, 'https://evil.example/steal')).toEqual({ cancel: true });
    expect(await run(app, 'https://cdn.jsdelivr.net/gh/x/config.json')).toEqual({ cancel: false });
    expect(await run(app, 'file:///Applications/ui/index.html')).toEqual({ cancel: false });
    expect(await run(app, 'devtools://devtools/x')).toEqual({ cancel: false });
    expect(connections().app.map(r => [r.host, r.allowed])).toEqual(expect.arrayContaining([['evil.example', false], ['cdn.jsdelivr.net', true]]));
    expect(connections().app).toHaveLength(2);
    expect(recs.find(r => r.host === 'evil.example')).toMatchObject({ source: 'app', allowed: false });
  });

  test('S-05 主进程自己的请求也过白名单', async () => {
    await expect(guardedFetch('https://evil.example/x')).rejects.toThrow('不在白名单里，没有连 evil.example');
    const r = await guardedFetch(`${base}/cfg`);
    expect(await r.text()).toBe('ok');
    expect(connections().app.map(c => c.host)).toContain('evil.example');
  });

  test('S-04 连过的网站实时更新，分「CodexBuddy 连过的」和「网页里连过的」', async () => {
    expect(fx.partitions).toContain(BROWSER_PARTITION);
    const web = session.fromPartition(BROWSER_PARTITION) as any;
    // The browser is never filtered, only logged
    expect(await run(web, 'https://some-cdn.example/qr.png')).toEqual({});
    expect(await run(web, 'https://some-cdn.example/qr2.png')).toEqual({});
    expect(await run(web, 'blob:https://x/1')).toEqual({});
    await run(session.defaultSession, 'https://github.com/hhwyt');
    const c = connections();
    expect(c.web.map(r => r.host)).toEqual(['some-cdn.example']);
    expect(c.app.map(r => r.host)).toEqual(['github.com']);
    // One live update per new host, not per request
    expect(recs.map(r => `${r.source}:${r.host}`)).toEqual(['browser:some-cdn.example', 'app:github.com']);
    record('app', 'github.com', false);
    expect(recs).toHaveLength(3);
    expect(checkRequest('app', 'not a url')).toBe(true);
  });

  test('S-04 列表按时间新的在前', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000); record('browser', 'a.example', true);
      vi.setSystemTime(2000); record('browser', 'b.example', true);
      expect(connections().web.map(r => r.host)).toEqual(['b.example', 'a.example']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('readBytes（强制升级下载安装包）', () => {
  const stream = (chunks: number[], headers: Record<string, string> = {}) => new Response(new ReadableStream({
    start(c) { for (const n of chunks) c.enqueue(new Uint8Array(n).fill(1)); c.close(); },
  }), { headers });

  test('带进度：一块一块报「已下 / 总大小」，拼回完整的字节', async () => {
    const seen: [number, number][] = [];
    const data = await readBytes(stream([3, 4, 5], { 'content-length': '12' }), (got, total) => seen.push([got, total]));
    expect(seen).toEqual([[3, 12], [7, 12], [12, 12]]);
    expect(data).toHaveLength(12);
  });

  test('服务器没给大小：总大小报 0；不要进度就一次读完', async () => {
    const seen: number[] = [];
    await readBytes(stream([2, 2]), (_got, total) => seen.push(total));
    expect(seen).toEqual([0, 0]);
    expect([...(await readBytes(new Response(new Uint8Array([9, 8]))))]).toEqual([9, 8]);
  });
});


test('V-04 GitHub release lookup pins the installer name and URL; foreign or missing assets are rejected', async () => {
  const url = 'https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.2.1/CodexBuddy-Setup-0.2.1.exe';
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ assets: [{ id: 123, name: 'CodexBuddy-Setup-0.2.1.exe', browser_download_url: url }] })));
  try {
    await expect(githubInstallerUrl(url)).resolves.toBe('https://api.github.com/repos/hhwyt/codex-buddy-releases/releases/assets/123');
    expect(spy.mock.calls[0][0]).toBe('https://api.github.com/repos/hhwyt/codex-buddy-releases/releases/tags/v0.2.1');
    await expect(githubInstallerUrl('https://example.com/installer.exe')).rejects.toThrow();
    spy.mockResolvedValue(new Response(JSON.stringify({ assets: [{ id: 123, name: 'CodexBuddy-Setup-0.2.1.exe', browser_download_url: 'https://example.com/installer.exe' }] })));
    await expect(githubInstallerUrl(url)).rejects.toThrow('Installer unavailable');
  } finally { spy.mockRestore(); }
});
