// node vendorcall.cjs <vendor> <base> [model]: decrypts the sandbox key in memory (never printed) and calls the vendor's
// /models and one chat completion; prints only ids, status and error text
const fs = require('fs'); const crypto = require('crypto');
const dir = 'C:/Users/hwy/CodexBuddy-Test/home/AppData/Local/CodexBuddy/';
const [vendor, base, model] = process.argv.slice(2);
const st = JSON.parse(fs.readFileSync(dir + 'state.json', 'utf8'));
const k = fs.readFileSync(dir + 'data-key.bin'); const buf = Buffer.from(st.keys[vendor].enc, 'base64');
const d = crypto.createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12)); d.setAuthTag(buf.subarray(12, 28));
const key = Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
const mask = s => s.split(key).join('sk-***');
(async () => {
  const h = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const m = await fetch(`${base}/models`, { headers: h }); const mt = await m.text();
  try { console.log('models', m.status, JSON.parse(mt).data.map(x => x.id).sort().join(', ')); } catch { console.log('models', m.status, mask(mt).slice(0, 300)); }
  if (model) {
    const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: h, body: JSON.stringify({ model, messages: [{ role: 'user', content: '回复一个字：好' }], max_tokens: 20 }) });
    console.log('chat', model, r.status, mask(await r.text()).slice(0, 300));
  }
})();
