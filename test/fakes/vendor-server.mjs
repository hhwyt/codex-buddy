// Fake vendor server: stands in for all 7 vendors in tests and spikes. Owner: Base (A7 extends).
// Every vendor lives under /<vendor>/...:
//   GET  /<vendor>/login           login page; its button sets a cookie (stands in for the QR scan)
//   POST /<vendor>/api/keys        console API that creates a key named CodexBuddy (needs the login cookie)
//   GET  /<vendor>/keys            key management page (shows the created key in its JSON, for level-2 key capture)
//   GET  /<vendor>/recharge        recharge page (has a pay button the app must never click)
//   POST /<vendor>/v1/chat/completions  Chat Completions (plain or stream)
//   POST /<vendor>/v1/responses         Responses API (SSE stream, what Codex sends)
// Scenario (per server or per vendor): ok | 401 | 429 | balance | timeout | keyfail
// Model check: a request whose model is not in that vendor's list gets 404 "Model not available".
// Run directly: `node test/fakes/vendor-server.mjs` prints the base URL (PORT env picks the port).
import http from 'node:http';

export const VENDORS = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'];
const DEFAULT_MODELS = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  zhipu: ['glm-4.5-flash', 'glm-4.7-flash', 'glm-4.6', 'glm-5'],
  kimi: ['kimi-k2-0905-preview', 'kimi-k2-turbo-preview', 'kimi-k2-thinking'],
  qwen: ['qwen3-coder-plus', 'qwen3-coder-flash', 'qwen3-max'],
  minimax: ['MiniMax-M2'],
  hunyuan: ['hunyuan-turbos-latest', 'hunyuan-t1-latest'],
  openai: ['gpt-5.5'],
};

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => resolve(body));
  });
}
const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const html = (res, body) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta charset="utf-8"><body>${body}</body>`); };

function sse(res, events) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

/** The Responses stream for one assistant text reply, or one function call when the prompt asks for a tool */
export function responsesEvents(text, toolCall) {
  const id = `resp_${Date.now()}`;
  const item = toolCall
    ? { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: toolCall.name, arguments: JSON.stringify(toolCall.arguments ?? {}) }
    : { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] };
  return [
    { type: 'response.created', response: { id } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, ...(toolCall ? {} : { content: [] }) } },
    ...(toolCall ? [] : [{ type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: text }]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, usage: { input_tokens: 1, input_tokens_details: null, output_tokens: 1, output_tokens_details: null, total_tokens: 2 } } },
  ];
}

/**
 * @param {{ port?: number, scenario?: string, models?: Record<string,string[]>, reply?: string }} [opts]
 */
export function startVendorServer(opts = {}) {
  const state = {
    scenario: opts.scenario ?? 'ok',
    perVendor: /** @type {Record<string,string>} */ ({}),
    models: { ...DEFAULT_MODELS, ...(opts.models ?? {}) },
    reply: opts.reply ?? '好了',
    /** @type {{ vendor: string, path: string, method: string, model?: string, auth?: string, body?: any }[]} */
    requests: [],
    keys: /** @type {Record<string,string[]>} */ ({}),
    hangs: /** @type {http.ServerResponse[]} */ ([]),
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const [, vendor, ...rest] = url.pathname.split('/');
    const sub = '/' + rest.join('/');
    const raw = req.method === 'POST' ? await readBody(req) : '';
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const entry = { vendor, path: sub, method: req.method ?? 'GET', model: body?.model, auth: req.headers.authorization, body };
    state.requests.push(entry);
    if (!VENDORS.includes(vendor)) return json(res, 404, { error: 'unknown vendor' });
    const scenario = state.perVendor[vendor] ?? state.scenario;
    const loggedIn = /fake_login=1/.test(req.headers.cookie ?? '');

    if (sub === '/login') {
      return html(res, `<h1>${vendor} 登录</h1><button id="fake-login" onclick="document.cookie='fake_login=1; path=/';location.href='/${vendor}/keys'">扫码登录</button>`);
    }
    if (sub === '/recharge') return html(res, `<h1>${vendor} 充值</h1><button id="fake-pay">付款</button>`);
    if (sub === '/keys') {
      const keys = state.keys[vendor] ?? [];
      return html(res, `<h1>${vendor} Key 管理</h1><button id="fake-create">创建</button><script id="data" type="application/json">${JSON.stringify({ keys })}</script>`);
    }
    if (sub === '/api/keys' && req.method === 'POST') {
      if (scenario === 'keyfail') return json(res, 500, { error: 'create key failed' });
      if (!loggedIn && !req.headers['x-fake-login']) return json(res, 401, { error: 'not logged in' });
      const key = `sk-fake-${vendor}-${Math.random().toString(36).slice(2, 14)}`;
      (state.keys[vendor] ??= []).push(key);
      return json(res, 200, { name: body?.name ?? 'CodexBuddy', key });
    }
    const isChat = sub === '/v1/chat/completions';
    const isResponses = sub === '/v1/responses';
    if (isChat || isResponses) {
      if (scenario === 'timeout') { state.hangs.push(res); return; }
      if (scenario === '401' || !req.headers.authorization) return json(res, 401, { error: { message: 'Unauthorized: invalid api key' } });
      if (scenario === '429') return json(res, 429, { error: { message: 'rate limit exceeded' } });
      if (scenario === 'balance') return json(res, 402, { error: { message: 'insufficient balance 余额不足' } });
      const models = state.models[vendor] ?? [];
      if (!models.includes(body?.model)) return json(res, 404, { error: { message: `Model not available: ${body?.model}` } });
      const wantsTool = JSON.stringify(body ?? {}).includes('CALL_TOOL');
      if (isResponses) {
        const tool = wantsTool && Array.isArray(body?.tools) && body.tools.length && !JSON.stringify(body.input ?? '').includes('function_call_output')
          ? { name: body.tools[0].name ?? body.tools[0].function?.name ?? 'shell', arguments: { command: ['echo', 'hi'] } } : null;
        return sse(res, responsesEvents(state.reply, tool));
      }
      const hasToolResult = (body?.messages ?? []).some(m => m.role === 'tool');
      const tool = wantsTool && body?.tools?.length && !hasToolResult ? body.tools[0].function?.name : null;
      if (body?.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const base = { id: 'chat_1', object: 'chat.completion.chunk', model: body.model };
        if (tool) {
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: tool, arguments: '' } }] } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"command":["echo","hi"]}' } }] } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: state.reply } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      const message = tool
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: tool, arguments: '{"command":["echo","hi"]}' } }] }
        : { role: 'assistant', content: state.reply };
      return json(res, 200, { id: 'chat_1', object: 'chat.completion', model: body.model, choices: [{ index: 0, message, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    return json(res, 404, { error: 'not found' });
  });
  return new Promise(resolve => {
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        state,
        vendorUrl: (/** @type {string} */ v) => `${url}/${v}`,
        setScenario: (/** @type {string} */ s, /** @type {string|undefined} */ vendor) => { if (vendor) state.perVendor[vendor] = s; else state.scenario = s; },
        close: () => new Promise(r => { for (const h of state.hangs) h.destroy(); server.closeAllConnections?.(); server.close(() => r(undefined)); }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startVendorServer({ port: Number(process.env.PORT ?? 0), scenario: process.env.FAKE_SCENARIO }).then(s => console.log(s.url));
}
