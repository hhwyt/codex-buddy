// zhipu: login detection and level-2 key capture use the shared defaults in base.ts (console hosts from providers.ts).
// Owner: A4.
// Level 1 is the console API the Windows installer (scripts/vendor/codex.ps1, verified with real logins) already uses:
// the page's bigmodel_token_production cookie goes in the Authorization header, the organization and project ids come
// from localStorage, and the key is apiKey + "." + secretKey.
import { providerOf } from '../core/providers';
import { KEY_NAME, makeVendor } from './base';

/** Page script on bigmodel.cn: waits up to 15 s for the login state the console writes after login, then creates a
 *  key named CodexBuddy-<yyMMddHHmmss> (智谱 key names must differ). Resolves to { status, body } for base.ts level 1:
 *  200 with { key } on success, 4xx/5xx with the console's answer otherwise */
export const ZHIPU_CREATE_KEY_SCRIPT = `(async () => {
  const state = () => ({
    token: (document.cookie.split('; ').find(c => c.startsWith('bigmodel_token_production=')) || '').split('=').slice(1).join('='),
    organization: localStorage.getItem('Bigmodel-Organization'),
    project: localStorage.getItem('Bigmodel-Project'),
  });
  let s = state();
  for (let i = 0; i < 30 && !(s.token && s.organization && s.project); i++) {
    await new Promise(r => setTimeout(r, 500));
    s = state();
  }
  if (!(s.token && s.organization && s.project)) return { status: 401, body: 'no login state' };
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const name = ${JSON.stringify(KEY_NAME)} + '-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  const r = await fetch('/api/biz/v1/organization/' + s.organization + '/projects/' + s.project + '/api_keys', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: s.token, 'Bigmodel-Organization': s.organization, 'Bigmodel-Project': s.project },
    body: JSON.stringify({ name, keyType: 1, usageScene: 2 }),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (r.status < 300 && j && j.code === 200 && j.data && j.data.apiKey && j.data.secretKey) {
    return { status: 200, body: JSON.stringify({ key: j.data.apiKey + '.' + j.data.secretKey }) };
  }
  return { status: r.status < 300 ? 400 : r.status, body: text };
})()`;

export const zhipu = makeVendor(providerOf('zhipu'), { createKeyPageScript: ZHIPU_CREATE_KEY_SCRIPT });
