#!/usr/bin/env node
// Source scan (UI-00, UI-01, H-03). Owner: Base. Exit 1 on any hit.
//  - ui/**/*.{ts,css,html}: no hard-coded colors (#hex, rgb(), hsl()) outside ui/tokens.css; no gradients anywhere
//  - electron/**, ui/**, remote/**, scripts/** (not scripts/vendor): no humanslive (any case)
//  - user-facing strings in ui/** and electron/**: no banned words (CC Switch, 傻瓜, HumansLive, 搭子)
// Files listed in LEGACY may contain a hit while they wait for their owner (each entry names the owner).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEGACY = new Set([
  // Windows installer from codex-install-made-easy, vendored as is; A3 renames its internal names (H-03)
  'scripts/vendor/codex.ps1',
]);
const hits = [];
const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'build', 'assets'].includes(e.name)) walk(p, out); }
    else out.push(p);
  }
  return out;
};
const rel = p => path.relative(root, p).split(path.sep).join('/');
const scan = (files, re, why) => {
  for (const f of files) {
    const r = rel(f);
    if (LEGACY.has(r)) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/lint-scan:\s*allow/.test(line)) return;
      if (re.test(line)) hits.push(`${r}:${i + 1}  ${why}: ${line.trim().slice(0, 120)}`);
    });
  }
};

const ui = walk(path.join(root, 'ui')).filter(f => /\.(ts|css|html)$/.test(f));
scan(ui.filter(f => rel(f) !== 'ui/tokens.css'), /#[0-9a-fA-F]{3,8}\b(?![\w-])|\b(rgba?|hsla?)\(/, 'hard-coded color (use tokens.css)');
scan(ui, /gradient\(/i, 'gradient');
const code = [...walk(path.join(root, 'electron')), ...walk(path.join(root, 'ui')), ...walk(path.join(root, 'remote')), ...walk(path.join(root, 'scripts'))]
  .filter(f => /\.(ts|mjs|js|json|css|html|sh|ps1)$/.test(f) && f !== fileURLToPath(import.meta.url));
scan(code, /humans\s*live/i, 'humanslive');
scan([...walk(path.join(root, 'ui')), ...walk(path.join(root, 'electron'))].filter(f => /\.(ts|html)$/.test(f)), /CC Switch|傻瓜|搭子/, 'banned word');

if (hits.length) { console.error(hits.join('\n')); console.error(`\n${hits.length} lint hit(s)`); process.exit(1); }
console.log('lint-scan: clean');
