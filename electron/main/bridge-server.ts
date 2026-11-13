// Local bridge: Responses API in (from Codex), Chat Completions out (to the vendor). Owner: A8.
// Listens on 127.0.0.1 only, random port; one route per vendor: http://127.0.0.1:<port>/<vendor>/v1/responses.
// The vendor key comes from auth.json via Codex's Authorization header and is passed through, never logged.
// Translation logic lives in core/bridge (pure, unit tested); this file is only the HTTP plumbing (R-01).
// Vendor errors (401 / 402 / 404 Model not available / 429) go back to Codex with the same status and body, so
// Codex and the connectivity test see exactly what a Responses vendor would have said.
import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { completionToChunk, createSseParser, createStreamTranslator, customToolNames, responsesToChat } from '../core/bridge';

export interface BridgeServer {
  /** e.g. http://127.0.0.1:53121 */
  url: string;
  /** Base URL to write into config.toml for this vendor */
  baseUrlFor(vendor: string): string;
  close(): Promise<void>;
}

export interface BridgeOptions {
  /** Injected for tests; defaults to the global fetch */
  fetch?: typeof fetch;
}

type Obj = Record<string, unknown>;

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param upstreams vendor id → that vendor's Chat Completions base URL (ending at /v1). Read on every request, so
 *        adding a vendor to the same object later works without a restart.
 */
export async function startBridge(upstreams: Record<string, string>, opts: BridgeOptions = {}): Promise<BridgeServer> {
  const doFetch = opts.fetch ?? fetch;

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const match = /^\/([^/]+)\/v1\/responses\/?$/.exec(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    const upstream = match ? upstreams[decodeURIComponent(match[1])] : undefined;
    if (!match || req.method !== 'POST' || !upstream) return sendJson(res, 404, { error: { message: 'Not found' } });
    let body: Obj;
    try {
      const parsed: unknown = JSON.parse(await readBody(req));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Obj;
    } catch {
      return sendJson(res, 400, { error: { message: 'Invalid JSON body' } });
    }
    const model = typeof body.model === 'string' ? body.model : '';
    const wantsStream = body.stream !== false;
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });

    let upstreamRes: Response;
    try {
      upstreamRes = await doFetch(upstream.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream', authorization: req.headers.authorization ?? '' },
        body: JSON.stringify(responsesToChat(body, model)),
        signal: abort.signal,
      });
    } catch {
      return sendJson(res, 502, { error: { message: 'Could not reach the vendor' } });
    }
    if (!upstreamRes.ok) {
      res.writeHead(upstreamRes.status, { 'content-type': upstreamRes.headers.get('content-type') ?? 'application/json' });
      return res.end(await upstreamRes.text().catch(() => ''));
    }

    const translator = createStreamTranslator(`resp_${randomUUID().replace(/-/g, '')}`, { model, customTools: customToolNames(body) });
    const collected: Obj[] = [];
    const emit = (events: Obj[]) => {
      if (!wantsStream) { collected.push(...events); return; }
      for (const e of events) res.write(`event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    const feed = (payloads: string[]) => {
      for (const p of payloads) {
        if (p === '[DONE]') continue;
        let chunk: unknown;
        try { chunk = JSON.parse(p); } catch { continue; }
        if (typeof chunk === 'object' && chunk !== null) emit(translator.push(chunk as Obj));
      }
    };
    if (wantsStream) res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });

    try {
      if (!(upstreamRes.headers.get('content-type') ?? '').includes('text/event-stream')) {
        emit(translator.push(completionToChunk((await upstreamRes.json()) as Obj)));
      } else {
        const parser = createSseParser();
        const decoder = new TextDecoder();
        for await (const bytes of upstreamRes.body as unknown as AsyncIterable<Uint8Array>) feed(parser.feed(decoder.decode(bytes, { stream: true })));
        feed(parser.feed(decoder.decode()));
        feed(parser.flush());
      }
      emit(translator.end());
    } catch {
      if (abort.signal.aborted) return;
      emit(translator.push({ error: { code: 'stream_error', message: '和厂商的连接断了' } }));
    }
    if (wantsStream) return res.end();
    const last = collected[collected.length - 1] as { type: string; response: Obj };
    sendJson(res, last.type === 'response.completed' ? 200 : 502, last.response);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => { if (!res.headersSent) sendJson(res, 500, { error: { message: 'Bridge error' } }); else res.end(); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    baseUrlFor: vendor => `${url}/${encodeURIComponent(vendor)}/v1`,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
