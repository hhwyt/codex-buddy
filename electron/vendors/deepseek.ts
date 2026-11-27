// deepseek: login detection and level-2 key capture use the shared defaults in base.ts (console hosts from
// providers.ts). Owner: A4.
// Level 1 (11-16, read from platform.deepseek.com's own bundle): the console keeps its login in localStorage
// "userToken" ({ value }) and creates a key with POST /api/v0/users/edit_api_keys { action: "create" } and
// "Authorization: Bearer <token>"; the new key is data.biz_data.api_key.sensitive_id (biz_code 0 = OK).
import { providerOf } from '../core/providers';
import { KEY_NAME, makeVendor } from './base';

/** Page script on platform.deepseek.com: waits up to 15 s for the login token, then creates a key named CodexBuddy.
 *  Resolves to { status, body } for base.ts level 1: 200 with { key } on success, 4xx/5xx otherwise */
export const DEEPSEEK_CREATE_KEY_SCRIPT = `(async () => {
  const token = () => { try { return (JSON.parse(localStorage.getItem('userToken') || 'null') || {}).value || ''; } catch { return ''; } };
  let t = token();
  for (let i = 0; i < 30 && !t; i++) { await new Promise(r => setTimeout(r, 500)); t = token(); }
  if (!t) return { status: 401, body: 'no login token' };
  const r = await fetch('/api/v0/users/edit_api_keys', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ action: 'create', name: ${JSON.stringify(KEY_NAME)}, redacted_key: null, created_at: null, tracking_id: null, is_exp: false }),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  const k = j && j.data && j.data.biz_code === 0 && j.data.biz_data && j.data.biz_data.api_key && j.data.biz_data.api_key.sensitive_id;
  if (r.status < 300 && k) return { status: 200, body: JSON.stringify({ key: k }) };
  return { status: r.status < 300 ? 400 : r.status, body: text };
})()`;

/** Y-05, read from the same bundle (11-26): GET /api/v0/users/get_api_keys lists { sensitive_id (masked, like
 *  sk-ab…f3a9), created_at, tracking_id }; the console's own 删除 posts edit_api_keys { action: "delete", name: null,
 *  redacted_key: sensitive_id, created_at, tracking_id }. Deletes only when exactly one listed key matches. */
export const deepseekRevokeKeyScript = (key: string) => `(async () => {
  const key = ${JSON.stringify(key)};
  const token = () => { try { return (JSON.parse(localStorage.getItem('userToken') || 'null') || {}).value || ''; } catch { return ''; } };
  let t = token();
  for (let i = 0; i < 30 && !t; i++) { await new Promise(r => setTimeout(r, 500)); t = token(); }
  if (!t) return { status: 401, body: 'no login token' };
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t };
  const list = await fetch('/api/v0/users/get_api_keys', { credentials: 'include', headers });
  let j = null;
  try { j = JSON.parse(await list.text()); } catch {}
  const keys = (j && j.data && j.data.biz_data && j.data.biz_data.api_keys) || [];
  const same = k => {
    const s = String(k.sensitive_id || '');
    const m = /^([^*.\u2026]+)[*.\u2026]+([^*.\u2026]+)$/.exec(s);
    return m ? key.startsWith(m[1]) && key.endsWith(m[2]) : s === key;
  };
  const hits = keys.filter(same);
  if (hits.length !== 1) return { status: 404, body: 'matched ' + hits.length + ' of ' + keys.length };
  const k = hits[0];
  const r = await fetch('/api/v0/users/edit_api_keys', {
    method: 'POST', credentials: 'include', headers,
    body: JSON.stringify({ action: 'delete', name: null, redacted_key: k.sensitive_id, created_at: k.created_at, tracking_id: k.tracking_id ?? null }),
  });
  const text = await r.text();
  let d = null;
  try { d = JSON.parse(text); } catch {}
  const ok = r.status < 300 && d && d.data && d.data.biz_code === 0;
  return { status: ok ? 200 : r.status < 300 ? 400 : r.status, body: text };
})()`;

export const deepseek = makeVendor(providerOf('deepseek'), { createKeyPageScript: DEEPSEEK_CREATE_KEY_SCRIPT, revokeKeyPageScript: deepseekRevokeKeyScript });
