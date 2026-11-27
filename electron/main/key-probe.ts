// Y-05: does the vendor still accept this key? One chat request with no messages: a key the vendor accepts gets a
// 400 (bad request, nothing generated), a deleted one gets 401/403 or an auth error in the body. Nothing is billed.
import type { ProviderInfo } from '../core/types';

const AUTH_ERROR = /invalid[_ ]?api[_ ]?key|incorrect api key|unauthori[sz]ed|authentication|api key.*(invalid|not found|expired)|login fail|令牌|鉴权|认证失败/i;

export async function probeKey(fetchFn: typeof fetch, p: Pick<ProviderInfo, 'baseUrl' | 'defaultModel'>, key: string): Promise<'alive' | 'dead' | 'unknown'> {
  try {
    const r = await fetchFn(`${p.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: p.defaultModel, messages: [], max_tokens: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401 || r.status === 403) return 'dead';
    const body = await r.text().catch(() => '');
    if (AUTH_ERROR.test(body)) return 'dead';
    return r.status < 500 ? 'alive' : 'unknown';
  } catch { return 'unknown'; }
}
