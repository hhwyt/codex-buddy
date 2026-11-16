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

export const deepseek = makeVendor(providerOf('deepseek'), { createKeyPageScript: DEEPSEEK_CREATE_KEY_SCRIPT });
