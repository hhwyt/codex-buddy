// Read-only tree hashes for X-01 and G-01. Owner: A7.
// hashTree never follows symlinks (it hashes the link text), never writes, and reports a missing path as 'absent'.
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function hashTree(root: string, ignore: (rel: string) => boolean = () => false): string {
  const h = createHash('sha256');
  const visit = (p: string, rel: string) => {
    let st: fs.Stats;
    try { st = fs.lstatSync(p); } catch { h.update(`${rel}\0absent\0`); return; }
    if (st.isSymbolicLink()) { h.update(`${rel}\0link\0${fs.readlinkSync(p)}\0`); return; }
    if (st.isDirectory()) {
      h.update(`${rel}\0dir\0`);
      let names: string[] = [];
      try { names = fs.readdirSync(p).sort(); } catch { h.update('unreadable\0'); return; }
      for (const n of names) {
        const r = rel ? `${rel}/${n}` : n;
        if (!ignore(r)) visit(path.join(p, n), r);
      }
      return;
    }
    h.update(`${rel}\0file\0${st.size}\0`);
    try { h.update(fs.readFileSync(p)); } catch { h.update('unreadable\0'); }
  };
  visit(root, '');
  return h.digest('hex');
}

/** The real user paths CodexBuddy tests must never touch (X-01, G-01). Read-only. */
export function realProtectedPaths(home = os.homedir()): string[] {
  const list = [path.join(home, '.codex')];
  try {
    for (const n of fs.readdirSync(home)) if (n.startsWith('.codex-')) list.push(path.join(home, n));
  } catch { /* unreadable home: only ~/.codex */ }
  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    list.push(path.join(roaming, 'Codex'), path.join(home, 'Desktop', 'ChatGPT 汉化版.lnk'));
  } else {
    list.push('/Applications/ChatGPT.app', '/Applications/ChatGPT 汉化版.app', path.join(home, 'Library', 'Application Support', 'Codex'));
  }
  return list.sort();
}

/**
 * On CI (no real Codex running) every byte counts. On a developer's machine the real Codex may be open while the suite
 * runs and keeps writing its own sessions, logs and databases; those entries are skipped there (CODEXBUDDY_X01_STRICT=1
 * forces the strict mode). CodexBuddy never writes them, so skipping them cannot hide a CodexBuddy write.
 */
export const strictHashes = () => !!process.env.CI || process.env.CODEXBUDDY_X01_STRICT === '1';
const VOLATILE = /^(sessions|archived_sessions|log|logs|shell_snapshots|tmp|\.tmp|cache|Cache|Code Cache|GPUCache|DawnCache|Crashpad|Session Storage|Local Storage|IndexedDB|blob_storage|Network|Shared Dictionary|WebStorage|Service Worker)(\/|$)|(^|\/)(history\.jsonl|[^/]*\.sqlite[^/]*|[^/]*\.log|LOCK|Cookies[^/]*|Preferences|TransportSecurity|Trust Tokens[^/]*)$/;
export const volatile = (rel: string) => !strictHashes() && VOLATILE.test(rel);

export const hashAll = (paths: string[]): Record<string, string> => Object.fromEntries(paths.map(p => [p, hashTree(p, volatile)]));

/** Names in /Applications: nothing may be installed there by tests */
export const applicationsListing = (): string[] => {
  if (process.platform === 'win32') return [];
  try { return fs.readdirSync('/Applications').sort(); } catch { return []; }
};

export const SNAPSHOT_FILE = path.join(os.tmpdir(), 'codexbuddy-e2e-x01-before.json');
