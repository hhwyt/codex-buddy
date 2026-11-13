// L1/L2 (R-01): the bridge's HTTP plumbing on 127.0.0.1, against the shared fake vendor and injected fetches.
import { afterEach, describe, expect, test } from 'vitest';
import { startBridge, type BridgeServer } from '../../electron/main/bridge-server';
import { startVendorServer } from '../fakes/vendor-server.mjs';

type Any = any;
const open: { close(): Promise<unknown> }[] = [];
afterEach(async () => { while (open.length) await open.pop()!.close(); });

async function bridgeWith(upstreams: Record<string, string>, fetchImpl?: typeof fetch): Promise<BridgeServer> {
  const b = await startBridge(upstreams, fetchImpl ? { fetch: fetchImpl } : {});
  open.push(b);
  return b;
}
async function vendor(): Promise<Any> {
  const v = await startVendorServer({ reply: '好了' });
  open.push(v);
  return v;
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-fake-1', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const events = (text: string) => text.split('\n\n').filter(Boolean).map(b => JSON.parse(b.split('\n').find(l => l.startsWith('data: '))!.slice(6)));
const sseResponse = (text: string) => new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });

describe('转接服务', () => {
  test('R-01 只监听 127.0.0.1 随机端口，每家一个地址', async () => {
    const b = await bridgeWith({ deepseek: 'http://x/v1' });
    expect(b.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(b.baseUrlFor('deepseek')).toBe(`${b.url}/deepseek/v1`);
    expect(b.baseUrlFor('custom-我的')).toBe(`${b.url}/custom-${encodeURIComponent('我的')}/v1`);
  });

  test('R-01 流式文字：转成 Responses 事件，Key 原样带给厂商', async () => {
    const v = await vendor();
    const b = await bridgeWith({ deepseek: v.vendorUrl('deepseek') + '/v1/' });
    const res = await post(`${b.baseUrlFor('deepseek')}/responses`, { model: 'deepseek-chat', input: '你好', stream: true });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const ev = events(await res.text());
    expect(ev[0].type).toBe('response.created');
    expect(ev.find(e => e.type === 'response.output_text.delta').delta).toBe('好了');
    expect(ev[ev.length - 1]).toMatchObject({ type: 'response.completed', response: { usage: { total_tokens: 2 } } });
    const sent = v.state.requests[v.state.requests.length - 1];
    expect(sent).toMatchObject({ path: '/v1/chat/completions', auth: 'Bearer sk-fake-1', model: 'deepseek-chat' });
    expect(sent.body.messages).toEqual([{ role: 'user', content: '你好' }]);
  });

  test('R-01 流式工具调用转成 function_call', async () => {
    const v = await vendor();
    const b = await bridgeWith({ kimi: v.vendorUrl('kimi') + '/v1' });
    const res = await post(`${b.baseUrlFor('kimi')}/responses`, { model: 'kimi-k2-0905-preview', input: 'CALL_TOOL', tools: [{ type: 'function', name: 'shell', parameters: {} }] });
    const done = events(await res.text()).pop();
    expect(done.response.output[0]).toMatchObject({ type: 'function_call', call_id: 'call_1', name: 'shell', arguments: '{"command":["echo","hi"]}' });
  });

  test('R-01 stream=false 时返回整个 response，厂商不流式时也能转', async () => {
    const v = await vendor();
    const b = await bridgeWith({ zhipu: v.vendorUrl('zhipu') + '/v1' });
    const res = await post(`${b.baseUrlFor('zhipu')}/responses`, { model: 'glm-5', input: 'hi', stream: false });
    expect(res.status).toBe(200);
    expect((await res.json()).output[0].content[0].text).toBe('好了');
    const plain = await bridgeWith({ zhipu: 'http://up/v1' }, async () => new Response(JSON.stringify({ choices: [{ index: 0, message: { content: '非流式' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }));
    const ev = events(await (await post(`${plain.baseUrlFor('zhipu')}/responses`, { model: 'glm-5', input: 'hi' })).text());
    expect(ev.find(e => e.type === 'response.output_text.delta').delta).toBe('非流式');
  });

  test('R-01 厂商的 401、402、404、429 原样转给 Codex', async () => {
    const v = await vendor();
    const b = await bridgeWith({ qwen: v.vendorUrl('qwen') + '/v1' });
    const url = `${b.baseUrlFor('qwen')}/responses`;
    const notListed = await post(url, { model: 'gpt-5.5', input: 'hi' });
    expect(notListed.status).toBe(404);
    expect(await notListed.text()).toContain('Model not available: gpt-5.5');
    for (const [scenario, status] of [['401', 401], ['balance', 402], ['429', 429]] as const) {
      v.setScenario(scenario);
      const r = await post(url, { model: 'qwen3-max', input: 'hi' });
      expect(r.status).toBe(status);
      expect(r.headers.get('content-type')).toContain('application/json');
    }
    const noType = await bridgeWith({ qwen: 'http://up/v1' }, async () => new Response(null, { status: 500 }));
    const r = await post(`${noType.baseUrlFor('qwen')}/responses`, { model: 'm', input: 'hi' });
    expect(r.status).toBe(500);
  });

  test('R-01 路径、方法、厂商、请求体不对时报错', async () => {
    const b = await bridgeWith({ deepseek: 'http://up/v1' }, async () => sseResponse(''));
    expect((await fetch(`${b.url}/deepseek/v1/responses`)).status).toBe(404);
    expect((await post(`${b.url}/nobody/v1/responses`, {})).status).toBe(404);
    expect((await post(`${b.url}/deepseek/v1/models`, {})).status).toBe(404);
    expect((await fetch(`${b.url}`, { method: 'POST' })).status).toBe(404);
    expect((await post(`${b.url}/deepseek/v1/responses`, 'not json')).status).toBe(400);
    expect((await post(`${b.url}/deepseek/v1/responses`, '[1]')).status).toBe(400);
    expect((await post(`${b.url}/deepseek/v1/responses`, 'null')).status).toBe(400);
  });

  test('R-01 连不上厂商时返回 502，不带 Key', async () => {
    const b = await bridgeWith({ deepseek: 'http://127.0.0.1:1/v1' });
    const r = await post(`${b.baseUrlFor('deepseek')}/responses`, { model: 'm', input: 'hi' }, { authorization: 'Bearer sk-secret-9999' });
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain('sk-secret');
  });

  test('R-01 流中途断开时发 response.failed，坏数据行跳过', async () => {
    const enc = new TextEncoder();
    const broken = () => {
      let n = 0;
      return new ReadableStream<Uint8Array>({
        pull(c) {
          if (n++) return c.error(new Error('reset'));
          c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"半"}}]}\n\ndata: not-json\n\ndata: 5\n\n'));
        },
      });
    };
    const b = await bridgeWith({ deepseek: 'http://up/v1' }, async () => new Response(broken(), { headers: { 'content-type': 'text/event-stream' } }));
    const ev = events(await (await post(`${b.baseUrlFor('deepseek')}/responses`, { model: 'm', input: 'hi' })).text());
    expect(ev.map(e => e.type)).toContain('response.output_text.delta');
    expect(ev[ev.length - 1]).toMatchObject({ type: 'response.failed', response: { error: { code: 'stream_error' } } });
    const failed = await post(`${b.baseUrlFor('deepseek')}/responses`, { model: 'm', input: 'hi', stream: false });
    expect(failed.status).toBe(502);
  });

  test('R-01 结尾没有空行和 [DONE] 也能收尾', async () => {
    const b = await bridgeWith({ deepseek: 'http://up/v1' }, async () => sseResponse('data: {"choices":[{"delta":{"content":"尾"}}]}'));
    const ev = events(await (await post(`${b.baseUrlFor('deepseek')}/responses`, { model: 'm', input: 'hi' })).text());
    expect(ev[ev.length - 1].response.output[0].content[0].text).toBe('尾');
  });

  test('R-01 Codex 中途断开时停止向厂商的请求', async () => {
    let signal: AbortSignal | undefined;
    const b = await bridgeWith({ deepseek: 'http://up/v1' }, async (_u, init) => {
      signal = init!.signal!;
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));
          signal!.addEventListener('abort', () => c.error(new Error('aborted')));
        },
      });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    });
    const ctl = new AbortController();
    const res = await fetch(`${b.baseUrlFor('deepseek')}/responses`, { method: 'POST', body: JSON.stringify({ model: 'm', input: 'hi' }), signal: ctl.signal });
    const reader = res.body!.getReader();
    await reader.read();
    ctl.abort();
    await expect.poll(() => signal?.aborted).toBe(true);
  });

  test('R-01 后加的厂商不用重启就能用，内部出错返回 500', async () => {
    const upstreams: Record<string, string> = {};
    const b = await bridgeWith(upstreams, async () => sseResponse('data: [DONE]\n\n'));
    upstreams['custom-x'] = 'http://up/v1';
    expect((await post(`${b.baseUrlFor('custom-x')}/responses`, { model: 'm', input: 'hi' })).status).toBe(200);
    const bad = await bridgeWith(new Proxy({}, { get: () => { throw new Error('boom'); } }));
    expect((await post(`${bad.url}/x/v1/responses`, {})).status).toBe(500);
  });
});
