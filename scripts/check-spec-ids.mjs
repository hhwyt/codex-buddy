#!/usr/bin/env node
// Every acceptance id must have at least one test whose name starts with it (build-plan §4: one missing → fail).
// Ids come from design/approved-spec.md §3 (88 ids) plus any extra ids in the 11-13 build plan's tables.
// Sources: SPEC_PATH / PLAN_PATH env, else design/approved-spec.md in this repo, else the main checkout.
// Test names: test('<ID> …') / it('<ID> …') in test/**/*.ts|mjs. Exit 1 and list what is missing.
// A test declared with .skip / .fixme / .todo does not count: it names the id but tests nothing.
// --report: print the table and always exit 0 (used while the suite is still being written).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const firstExisting = (...files) => files.find(f => f && fs.existsSync(f));
const specPath = firstExisting(process.env.SPEC_PATH, path.join(root, 'design', 'approved-spec.md'), '/Users/hwy/dev/codex-buddy/design/approved-spec.md');
const planPath = firstExisting(process.env.PLAN_PATH, '/Users/hwy/dev/codex-buddy-team/product/build-plan-2026-11-13.md');
if (!specPath) { console.error('approved-spec.md not found: commit design/approved-spec.md or set SPEC_PATH'); process.exit(1); }

const ID = /\b(?:UI|[A-Z])-\d{2}\b/g;
/** Ids that open a table row: | O-01 | … */
export function idsFromTable(text) {
  const ids = new Set();
  for (const line of text.split('\n')) {
    const m = /^\|\s*((?:UI|[A-Z])-\d{2})\s*\|/.exec(line);
    if (m) ids.add(m[1]);
  }
  return ids;
}
/** Range rows like「| C-01..C-10（分身） |」expand to every id in the range */
export function idsFromRanges(text) {
  const ids = new Set();
  for (const m of text.matchAll(/\b((?:UI|[A-Z]))-(\d{2})\.\.\1-(\d{2})\b/g)) {
    for (let i = Number(m[2]); i <= Number(m[3]); i++) ids.add(`${m[1]}-${String(i).padStart(2, '0')}`);
  }
  return ids;
}

const spec = fs.readFileSync(specPath, 'utf8');
const expected = idsFromTable(spec);
if (planPath) {
  const plan = fs.readFileSync(planPath, 'utf8');
  for (const id of [...idsFromTable(plan), ...idsFromRanges(plan)]) expected.add(id);
}

const tested = new Set();
const walk = dir => {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(test|spec)\.(ts|mjs)$/.test(e.name)) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\b(?:test|it)((?:\.\w+)*)\(\s*['"`]((?:UI|[A-Z])-\d{2})\b/g)) {
        if (!/\.(skip|fixme|todo)\b/.test(m[1])) tested.add(m[2]);
      }
    }
  }
};
walk(path.join(root, 'test'));

const missing = [...expected].filter(id => !tested.has(id)).sort();
console.log(`spec ids: ${expected.size}  tested: ${[...expected].filter(id => tested.has(id)).length}  missing: ${missing.length}`);
if (missing.length) console.log(`missing: ${missing.join(' ')}`);
if (missing.length && !process.argv.includes('--report')) process.exit(1);
