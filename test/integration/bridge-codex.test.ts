// L2 (R-01): the real Codex CLI (from ChatGPT.app, run only, never modified) → our bridge → a scripted fake Chat
// Completions vendor. Temp CODEX_HOME, fake key; skipped where the CLI is not installed (CI, Windows).
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startBridge, type BridgeServer } from '../../electron/main/bridge-server';

const CLI = process.env.CODEXBUDDY_REAL_CODEX ?? '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const KEY = 'sk-fake-bridge-0000';
type Req = { auth?: string; body: any };

/** Fake chat-only vendor: replies text, or (prompt has CALL_TOOL, no tool result yet) calls Codex's shell tool */
function startChatVendor(): Promise<{ url: string; requests: Req[]; close(): Promise<void> }> {
  const requests: Req[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      requests.push({ auth: req.headers.authorization, body });
      if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Unauthorized"}}'); }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (delta: object, finish: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
      const toolResult = body.messages.filter((m: any) => m.role === 'tool').pop();
      const wantsTool = JSON.stringify(body.messages).includes('CALL_TOOL');
      const tools: string[] = (body.tools ?? []).map((t: any) => t.function.name);
      const shell = ['shell_command', 'exec_command', 'shell'].find(n => tools.includes(n));
      if (toolResult) {
        send({ role: 'assistant', content: '工具输出：' });
        send({ content: String(toolResult.content).includes('bridge-ok') ? 'bridge-ok' : '没看到' }, 'stop');
      } else if (wantsTool && shell) {
        const args = shell === 'shell' ? { command: ['echo', 'bridge-ok'] } : shell === 'exec_command' ? { cmd: 'echo bridge-ok' } : { command: 'echo bridge-ok' };
        send({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_x1', type: 'function', function: { name: shell, arguments: '' } }] });
        send({ tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }] }, 'tool_calls');
      } else {
        send({ role: 'assistant', content: '你好' });
        send({ content: '，我是转接层' }, 'stop');
      }
      res.write(`data: ${JSON.stringify({ id: 'c1', choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    close: () => new Promise(r => { server.closeAllConnections(); server.close(() => r()); }),
  })));
}

const roots: string[] = [];
function codexHome(baseUrl: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-bridge-'));
  roots.push(root);
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'config.toml'), [
    'model_provider = "deepseek"', 'model = "deepseek-chat"', 'approval_policy = "never"', 'sandbox_mode = "read-only"', '',
    '[model_providers.deepseek]', 'name = "DeepSeek"', `base_url = "${baseUrl}"`, 'wire_api = "responses"', 'requires_openai_auth = true', '',
  ].join('\n'));
  fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: KEY }));
  return home;
}

function runCodex(home: string, prompt: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise(resolve => {
    const child = spawn(CLI, ['exec', '--ephemeral', '--skip-git-repo-check', prompt], { cwd: home, env: { ...process.env, CODEX_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

describe.skipIf(!fs.existsSync(CLI))('真 Codex CLI 经过转接层', () => {
  let vendor: Awaited<ReturnType<typeof startChatVendor>>;
  let bridge: BridgeServer;
  beforeAll(async () => {
    vendor = await startChatVendor();
    bridge = await startBridge({ deepseek: `${vendor.url}/v1` });
  });
  afterAll(async () => {
    await bridge.close();
    await vendor.close();
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
  });

  test('R-01 真 Codex 经过转接层完成一轮对话', async () => {
    const r = await runCodex(codexHome(bridge.baseUrlFor('deepseek')), '你好');
    if (process.env.BRIDGE_DUMP) fs.writeFileSync(process.env.BRIDGE_DUMP, JSON.stringify(vendor.requests, null, 1));
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('你好，我是转接层');
    const sent = vendor.requests[vendor.requests.length - 1];
    expect(sent.auth).toBe(`Bearer ${KEY}`);
    expect(sent.body.model).toBe('deepseek-chat');
    expect(sent.body.messages[0].role).toBe('system');
    expect(r.err + r.out).not.toContain(KEY);
  }, 90_000);

  test('R-01 真 Codex 经过转接层完成一次工具调用', async () => {
    vendor.requests.length = 0;
    const r = await runCodex(codexHome(bridge.baseUrlFor('deepseek')), 'CALL_TOOL 运行 echo bridge-ok');
    if (process.env.BRIDGE_DUMP) fs.writeFileSync(process.env.BRIDGE_DUMP + '.tool', JSON.stringify(vendor.requests, null, 1));
    expect(r.code, r.err).toBe(0);
    const second = vendor.requests.find(q => q.body.messages.some((m: any) => m.role === 'tool'));
    expect(second, r.err).toBeTruthy();
    const assistant = second!.body.messages.find((m: any) => m.tool_calls);
    expect(assistant.tool_calls[0].id).toBe('call_x1');
    expect(second!.body.messages.find((m: any) => m.role === 'tool').tool_call_id).toBe('call_x1');
    expect(r.out).toContain('工具输出：bridge-ok');
  }, 90_000);

  test('R-01 厂商拒绝 Key 时 Codex 看到原样的 401', async () => {
    const home = codexHome(bridge.baseUrlFor('deepseek'));
    fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({ OPENAI_API_KEY: 'sk-wrong-1111' }));
    const r = await runCodex(home, '你好');
    expect(r.code).not.toBe(0);
    expect(r.err + r.out).toMatch(/401|Unauthorized/);
  }, 120_000);
});
