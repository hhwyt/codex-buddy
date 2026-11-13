// config.toml read/write, line based (was buddy.ts): only the keys we own change, everything else stays byte for byte.
// Owner: A1.

export const splitLines = (text: string | null): string[] =>
  (text ?? '').split(/\r?\n/).filter((_, i, all) => i < all.length - 1 || all[i] !== '');
export const joinLines = (lines: string[]): string => lines.join('\n').replace(/\s+$/, '') + '\n';

const tableOf = (line: string) => /^\s*\[([^\]]+)\]/.exec(line)?.[1].trim() ?? null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A string value of key in table ('' = top level), or null */
export function getValue(lines: string[], table: string, key: string): string | null {
  let current = '';
  const re = new RegExp(`^\\s*${escapeRe(key)}\\s*=\\s*"(.*)"`);
  for (const line of lines) {
    const t = tableOf(line);
    if (t !== null) { current = t; continue; }
    const m = re.exec(line);
    if (current === table && m) return m[1];
  }
  return null;
}

/** top: key → full line, or null to remove. tables: name → lines, or null to remove. New keys go first (TOML needs
 *  top-level keys before any table), new tables at the end */
export function setConfig(lines: string[], top: Record<string, string | null>, tables: Record<string, string[] | null>): string[] {
  const kept: string[] = [];
  let current = '', skip = false;
  for (const line of lines) {
    const t = tableOf(line);
    if (t !== null) { current = t; skip = t in tables; }
    if (skip) continue;
    const key = /^\s*([A-Za-z_]+)\s*=/.exec(line)?.[1];
    if (current === '' && key && key in top) continue;
    kept.push(line);
  }
  while (kept.length && kept[0] === '') kept.shift();
  const head = Object.keys(top).sort().map(k => top[k]).filter((l): l is string => !!l);
  const tail = Object.keys(tables).sort().flatMap(name => (tables[name] ? ['', `[${name}]`, ...tables[name]!] : []));
  return [...head, ...(head.length && kept.length ? [''] : []), ...kept, ...tail];
}

/** Set one key inside a table, creating the table at the end if missing */
export function setTableValue(lines: string[], table: string, key: string, line: string): string[] {
  const out: string[] = [];
  let current = '', done = false, seen = false;
  const re = new RegExp(`^\\s*${escapeRe(key)}\\s*=`);
  for (const l of lines) {
    const t = tableOf(l);
    if (t !== null) {
      if (current === table && !done) { out.push(line); done = true; }
      current = t;
      if (t === table) seen = true;
      out.push(l);
      continue;
    }
    if (current === table && re.test(l)) {
      if (!done) { out.push(line); done = true; }
      continue;
    }
    out.push(l);
  }
  if (current === table && !done) { out.push(line); done = true; }
  if (!seen) out.push('', `[${table}]`, line);
  return out;
}

/** TOML basic string literal */
export const tomlString = (s: string): string => JSON.stringify(s);
