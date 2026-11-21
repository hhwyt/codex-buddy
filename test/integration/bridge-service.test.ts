// The standalone bridge service (main/bridge-daemon.ts) and CodexBuddy's side of it (main/bridge-service.ts):
// D-01..D-05, in process. That it outlives CodexBuddy as a process of its own: test/e2e/bridge.spec.ts.
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bridgeStateFile, bridgeUpstreamsFile, BRIDGE_NAME, probeBridge, readUpstreams, runBridgeDaemon, upstreamAllowed, type RunningBridge } from '../../electron/main/bridge-daemon';
import { BRIDGE_FLAG, ensureBridge, launchAgentFile, launchAgentPlist, macAutostart, registerUpstream, removeBridge, RUN_KEY, RUN_VALUE, runValue, stopBridge, winAutostart } from '../../electron/main/bridge-service';

let dir: string;
const running: RunningBridge[] = [];
const servers: http.Server[] = [];
const start = async (o: Partial<Parameters<typeof runBridgeDaemon>[0]> = {}) => {
  const b = await runBridgeDaemon({ buddyDir: dir, version: '1.0.0', port: 0, ...o });
  if (b) running.push(b);
  return b;
};
/** A Chat Completions vendor that answers every request with one short reply */
async function fakeVendor(): Promise<string> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'c1', model: 'm', choices: [{ index: 0, message: { role: 'assistant', content: '好了' }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
}
const ask = (url: string) => fetch(`${url}/deepseek/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-x' }, body: JSON.stringify({ model: 'm', input: 'hi', stream: false }) });

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-bridge-')); });
afterEach(async () => {
  for (const b of running.splice(0)) await b.close();
  for (const s of servers.splice(0)) s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('转发服务', () => {
  test('D-01 转发服务按登记文件转发，登记新厂商不用重启', async () => {
    const b = (await start())!;
    expect((await ask(b.url)).status).toBe(404);
    registerUpstream(dir, 'deepseek', await fakeVendor());
    const r = await ask(b.url);
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).toContain('好了');
    expect(await probeBridge(b.port)).toEqual({ name: BRIDGE_NAME, version: '1.0.0', pid: process.pid });
  });

  test('D-02 端口固定：重启后还是同一个端口；被别的程序占了才换，并记住新端口', async () => {
    const first = (await start())!;
    await first.close();
    running.length = 0;
    const second = (await start())!;
    expect(second.port).toBe(first.port);
    await second.close();
    running.length = 0;
    // Another program now holds that port
    const squatter = http.createServer();
    await new Promise<void>(r => squatter.listen(first.port, '127.0.0.1', r));
    servers.push(squatter);
    const third = (await start())!;
    expect(third.port).not.toBe(first.port);
    expect(JSON.parse(fs.readFileSync(bridgeStateFile(dir), 'utf8'))).toMatchObject({ port: third.port, version: '1.0.0' });
  });

  test('D-02 同一版本已在跑：不再起第二个', async () => {
    await start();
    expect(await start()).toBeNull();
  });

  test('D-02 CodexBuddy 的文件夹没了，转发服务自己退出', async () => {
    let gone = false;
    const b = (await start({ goneCheckMs: 50, onGone: () => { gone = true; } }))!;
    fs.rmSync(dir, { recursive: true, force: true });
    for (let i = 0; i < 40 && !gone; i++) await new Promise(r => setTimeout(r, 25));
    expect(gone).toBe(true);
    expect(await probeBridge(b.port, 300)).toBeNull();
  });

  test('D-01 只转发到 https 或本机地址，登记文件里别的地址不用', () => {
    expect(upstreamAllowed('https://api.deepseek.com/v1')).toBe(true);
    expect(upstreamAllowed('http://127.0.0.1:9/v1')).toBe(true);
    expect(upstreamAllowed('http://evil.example/v1')).toBe(false);
    fs.writeFileSync(bridgeUpstreamsFile(dir), JSON.stringify({ a: 'https://x.example/v1', b: 'http://y.example/v1', c: 3 }));
    expect(readUpstreams(dir)).toEqual({ a: 'https://x.example/v1' });
  });
});

describe('CodexBuddy 启动转发服务', () => {
  const deps = (over: Partial<Parameters<typeof ensureBridge>[0]> = {}) => {
    const calls: string[] = [];
    return {
      calls,
      d: {
        buddyDir: dir, version: '2.0.0', sleep: async () => {}, startMs: 1000,
        spawn: () => { calls.push('spawn'); fs.writeFileSync(bridgeStateFile(dir), JSON.stringify({ port: 5000, pid: 9, version: '2.0.0' })); },
        kill: (pid: number) => { calls.push(`kill ${pid}`); },
        probe: async () => (calls.includes('spawn') ? { name: BRIDGE_NAME, version: '2.0.0', pid: 9 } as const : null),
        ...over,
      },
    };
  };

  test('D-04 没在跑：启动一个，等它答应了再用它的端口', async () => {
    const { d, calls } = deps();
    expect(await ensureBridge(d)).toBe('http://127.0.0.1:5000');
    expect(calls).toEqual(['spawn']);
  });

  test('D-04 同版本已在跑：直接用，不再启动', async () => {
    fs.writeFileSync(bridgeStateFile(dir), JSON.stringify({ port: 4000, pid: 7, version: '2.0.0' }));
    const { d, calls } = deps({ probe: async () => ({ name: BRIDGE_NAME, version: '2.0.0', pid: 7 }) });
    expect(await ensureBridge(d)).toBe('http://127.0.0.1:4000');
    expect(calls).toEqual([]);
  });

  test('D-04 升级后旧版本还在跑：停掉旧的，启动新的', async () => {
    fs.writeFileSync(bridgeStateFile(dir), JSON.stringify({ port: 4000, pid: 7, version: '1.0.0' }));
    let old = true;
    const { d, calls } = deps();
    d.kill = (pid: number) => { calls.push(`kill ${pid}`); old = false; };
    d.probe = async (port: number) => (old && port === 4000 ? { name: BRIDGE_NAME, version: '1.0.0', pid: 7 } : calls.includes('spawn') ? { name: BRIDGE_NAME, version: '2.0.0', pid: 9 } : null);
    expect(await ensureBridge(d)).toBe('http://127.0.0.1:5000');
    expect(calls).toEqual(['kill 7', 'spawn']);
  });

  test('D-04 启动不了：报错（app.ts 改用 CodexBuddy 自己里面的转发）', async () => {
    const { d } = deps({ spawn: () => {} });
    await expect(ensureBridge(d)).rejects.toThrow('转发服务没有启动');
  });
});

describe('开机启动和一键还原', () => {
  const spec = { exe: '/Applications/CodexBuddy.app/Contents/MacOS/CodexBuddy', appPath: null, daemon: '/Applications/CodexBuddy.app/Contents/Resources/app.asar/dist/main/bridge-daemon.js', buddyDir: '/Users/a/Library/Application Support/CodexBuddy' };

  test('D-03 Mac：写 LaunchAgent，登录时以 node 模式运行转发服务', async () => {
    const home = path.join(dir, 'home');
    const a = macAutostart(home, spec);
    await a.install();
    const text = fs.readFileSync(launchAgentFile(home), 'utf8');
    expect(text).toBe(launchAgentPlist(spec));
    expect(text).not.toContain('ELECTRON_RUN_AS_NODE');
    expect(text).toContain('<string>--run-script</string>');
    expect(text).toContain('<key>RunAtLoad</key><true/>');
    for (const arg of [spec.exe, spec.daemon, '--buddy-dir', spec.buddyDir]) expect(text).toContain(`<string>${arg}</string>`);
    await a.remove();
    expect(fs.existsSync(launchAgentFile(home))).toBe(false);
  });

  test('D-03 Windows：写当前用户的开机启动项，删除时去掉', async () => {
    const calls: string[][] = [];
    const winSpec = { ...spec, exe: 'C:\\Users\\a\\AppData\\Local\\Programs\\CodexBuddy\\CodexBuddy.exe' };
    const a = winAutostart(async (cmd, args) => { calls.push([cmd, ...args]); return ''; }, winSpec);
    await a.install();
    await a.remove();
    expect(runValue(winSpec)).toBe(`"${winSpec.exe}" ${BRIDGE_FLAG}`);
    expect(runValue({ ...winSpec, appPath: 'C:\\dev\\codex-buddy' })).toBe(`"${winSpec.exe}" "C:\\dev\\codex-buddy" ${BRIDGE_FLAG}`);
    expect(calls).toEqual([
      ['reg.exe', 'add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', runValue(winSpec), '/f'],
      ['reg.exe', 'delete', RUN_KEY, '/v', RUN_VALUE, '/f'],
    ]);
    expect(RUN_KEY.startsWith('HKCU\\')).toBe(true);
  });

  test('D-04 Windows 更新前停掉转发服务（安装包要替换同一个程序），文件留着给新版本用', async () => {
    await start();
    registerUpstream(dir, 'deepseek', 'https://api.deepseek.com/v1');
    const killed: number[] = [];
    await stopBridge({ buddyDir: dir, kill: pid => { killed.push(pid); } });
    expect(killed).toEqual([process.pid]);
    expect(fs.existsSync(bridgeUpstreamsFile(dir))).toBe(true);
    await stopBridge({ buddyDir: path.join(dir, 'none'), kill: pid => { killed.push(pid); } });
    expect(killed).toHaveLength(1);
  });

  test('D-05 一键还原：删开机启动项，停掉转发服务，删掉它的文件', async () => {
    const b = (await start())!;
    registerUpstream(dir, 'deepseek', 'https://api.deepseek.com/v1');
    const killed: number[] = [];
    let removed = false;
    await removeBridge({ buddyDir: dir, autostart: { install: async () => {}, remove: async () => { removed = true; } }, kill: pid => { killed.push(pid); } });
    expect(removed).toBe(true);
    expect(killed).toEqual([process.pid]);
    expect(fs.existsSync(bridgeStateFile(dir))).toBe(false);
    expect(fs.existsSync(bridgeUpstreamsFile(dir))).toBe(false);
    void b;
  });
});
