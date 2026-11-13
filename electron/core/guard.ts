// Data guard (G-01). Owner: A1. HARD RULE: every deletion in CodexBuddy goes through guardedRemove(). It refuses any
// path that is, contains, or lies inside a user data directory: ~/.codex, ~/.codex-<name> (sessions, chat history,
// config), Codex's Electron data dirs. Deleting a clone, the 汉化版 launcher, or 一键还原 removes entry points only.
import type { FileSystem } from './types';

export interface ProtectedRoots {
  /** e.g. /Users/x/.codex */
  codexHome: string;
  /** Parent of ~/.codex-<name>: the home directory. Any child named .codex or .codex-* is protected */
  home: string;
  /** Codex Electron data dirs, e.g. ~/Library/Application Support/Codex, …/Codex (DeepSeek), %APPDATA%\Codex */
  appDataDirs: string[];
}

export class GuardError extends Error {
  constructor(public readonly target: string, public readonly protectedPath: string) {
    super(`refused to remove ${target}: protected user data ${protectedPath}`);
    this.name = 'GuardError';
  }
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const within = (child: string, parent: string) => child === parent || child.startsWith(parent + '/');

/** The protected path that target hits, or null when target is safe to remove */
export function protectedHit(target: string, roots: ProtectedRoots): string | null {
  const t = norm(target);
  if (!t || t === '/' || /^[a-z]:$/.test(t)) return target;
  const home = norm(roots.home);
  // The home dir itself or anything above it
  if (within(home, t)) return roots.home;
  const fixed = [roots.codexHome, ...roots.appDataDirs].map(norm);
  for (const p of fixed) if (within(t, p) || within(p, t)) return p;
  // ~/.codex-<name>
  if (within(t, home)) {
    const first = t.slice(home.length + 1).split('/')[0];
    if (first === '.codex' || first.startsWith('.codex-')) return `${roots.home}/${first}`;
  }
  // Codex (Name) data dirs on Mac, under any Application Support
  if (/\/application support\/codex( \([^/]*\))?(\/|$)/.test(t)) return target;
  // Windows: %APPDATA%\Codex*, %LOCALAPPDATA%\Codex* (but not our own CodexBuddy folder), and the Store package's data (Packages\OpenAI.Codex_*)
  if (/\/appdata\/(roaming|local)\/(codex(?!buddy)[^/]*|packages\/openai\.codex[^/]*)(\/|$)/.test(t)) return target;
  return null;
}

/** Remove target unless it touches protected data; throws GuardError instead of removing */
export function guardedRemove(fs: FileSystem, target: string, roots: ProtectedRoots): void {
  const hit = protectedHit(target, roots);
  if (hit) throw new GuardError(target, hit);
  if (fs.exists(target)) fs.remove(target);
}
