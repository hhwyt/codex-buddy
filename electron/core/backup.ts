// Backup of Codex's config before any change (was buddy.ts backup). Owner: A1.
// config.toml is copied as is; auth.json holds a key, so it is stored encrypted (auth.json.bin).
import type { Cipher, FileSystem } from './types';

export const stamp = (now: Date): string => now.toISOString().replace(/[-:T]/g, '').slice(0, 14);

export interface BackupPaths {
  codexHome: string;
  backupRoot: string;
}

/** Copies config.toml and an encrypted auth.json into <backupRoot>/<stamp>-<reason>; returns that folder */
export function backup(fs: FileSystem, cipher: Cipher, paths: BackupPaths, reason: string, now: Date): string {
  const dir = `${paths.backupRoot}/${stamp(now)}-${reason.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  fs.mkdirp(dir);
  const config = `${paths.codexHome}/config.toml`;
  if (fs.exists(config)) fs.copy(config, `${dir}/config.toml`);
  const auth = fs.readText(`${paths.codexHome}/auth.json`);
  if (auth !== null) fs.writeBytes(`${dir}/auth.json.bin`, cipher.encrypt(auth));
  return dir;
}

/** Puts a backup made by backup() back in place. A file the backup does not have is left as it is */
export function restoreBackup(fs: FileSystem, cipher: Cipher, paths: BackupPaths, dir: string): void {
  if (fs.exists(`${dir}/config.toml`)) fs.copy(`${dir}/config.toml`, `${paths.codexHome}/config.toml`);
  const auth = fs.readBytes(`${dir}/auth.json.bin`);
  if (auth) fs.writeText(`${paths.codexHome}/auth.json`, cipher.decrypt(auth));
}
