// Where a clone keeps its data (K-01, K-02, C-08). New clones: ~/.codex-codexbuddy-<slug> and a 「Codex (CodexBuddy <Name>)」
// Electron data folder, with a .codexbuddy-clone mark inside the Codex home. Versions before 2026-11-20 used
// ~/.codex-<slug>, which other tools (the codex-deepseek-fork skill) use too: such a folder still counts as CodexBuddy's
// only when it carries the mark or was made after CodexBuddy's own folder; otherwise CodexBuddy leaves it alone.
import { statSync } from 'node:fs';
import * as path from 'node:path';
import type { FileSystem } from '../core/types';

export const CLONE_MARK = '.codexbuddy-clone';

/** Creation time in ms, or null when unknown */
export type BornAt = (file: string) => number | null;
export const nodeBornAt: BornAt = file => {
  try { const t = statSync(file).birthtimeMs; return t > 0 ? t : null; } catch { return null; }
};

export function ownsCloneHome(fs: FileSystem, home: string, buddyDir: string, bornAt: BornAt): boolean {
  if (fs.exists(path.join(home, CLONE_MARK))) return true;
  const made = bornAt(home);
  const buddy = bornAt(buddyDir);
  return made !== null && buddy !== null && made >= buddy;
}

/** Electron data folder of a new clone, under the platform's data root */
export const cloneUserData = (root: string, displayName: string) => path.join(root, `Codex (CodexBuddy ${displayName})`);

/** Makes the folders and marks the Codex home as CodexBuddy's */
export function prepareCloneHome(fs: FileSystem, dirs: { codexHome: string; userData: string }, slug: string): void {
  fs.mkdirp(dirs.codexHome);
  fs.mkdirp(dirs.userData);
  const mark = path.join(dirs.codexHome, CLONE_MARK);
  if (!fs.exists(mark)) fs.writeText(mark, `CodexBuddy clone: ${slug}\n`);
}
