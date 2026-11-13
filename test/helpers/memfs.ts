// In-memory FileSystem + identity-ish Cipher for core unit tests. Owner: Base.
import type { Cipher, FileSystem } from '../../electron/core/types';

export function memFs(initial: Record<string, string> = {}): FileSystem & { files: Map<string, Uint8Array | string>; removed: string[] } {
  const files = new Map<string, Uint8Array | string>(Object.entries(initial));
  const removed: string[] = [];
  const under = (p: string, dir: string) => p === dir || p.startsWith(dir.replace(/\/$/, '') + '/');
  return {
    files, removed,
    readText: f => { const v = files.get(f); return v === undefined ? null : typeof v === 'string' ? v : new TextDecoder().decode(v); },
    writeText: (f, t) => { files.set(f, t); },
    readBytes: f => { const v = files.get(f); return v === undefined ? null : typeof v === 'string' ? new TextEncoder().encode(v) : v; },
    writeBytes: (f, d) => { files.set(f, d); },
    exists: f => [...files.keys()].some(k => under(k, f)),
    mkdirp: () => {},
    copy: (a, b) => { const v = files.get(a); if (v !== undefined) files.set(b, v); },
    list: dir => [...new Set([...files.keys()].filter(k => k.startsWith(dir + '/')).map(k => k.slice(dir.length + 1).split('/')[0]))],
    remove: t => { removed.push(t); for (const k of [...files.keys()]) if (under(k, t)) files.delete(k); },
  };
}

/** Reversible and visibly not plaintext: reversed bytes with a marker */
export const testCipher: Cipher = {
  encrypt: t => new TextEncoder().encode('ENC:' + [...t].reverse().join('')),
  decrypt: d => [...new TextDecoder().decode(d).slice(4)].reverse().join(''),
};
