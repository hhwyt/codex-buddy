// Secrets at rest: AES-256-GCM (iv 12 bytes | tag 16 bytes | ciphertext). The 32-byte key is a plain file next to the
// state (buddyDir/data-key.bin, owner-only). No OS keychain (站主 11-16: Codex keeps its own keys in plain files, and the
// keychain prompted on every rebuild and quit the app when refused).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Cipher, FileSystem } from '../core/types';

export function aesCipher(key: Uint8Array): Cipher {
  if (key.length !== 32) throw new Error('key must be 32 bytes');
  return {
    encrypt(text) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
      return new Uint8Array(Buffer.concat([iv, c.getAuthTag(), body]));
    },
    decrypt(data) {
      const buf = Buffer.from(data);
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

/** Reads the 32-byte data key from keyFile, or creates one. A key file from before 11-16 holds the key wrapped by the
 *  OS keychain: `legacyUnwrap` gets it out once and it is saved plain. replaced = the old key could not be read (the
 *  secrets encrypted with it are lost) */
export function loadDataKey(fs: FileSystem, keyFile: string, legacyUnwrap?: (b: Buffer) => Buffer): { key: Uint8Array; replaced: boolean } {
  const saved = fs.readBytes(keyFile);
  if (saved && saved.length === 32) return { key: new Uint8Array(saved), replaced: false };
  if (saved && legacyUnwrap) {
    try {
      const key = legacyUnwrap(Buffer.from(saved));
      if (key.length === 32) {
        fs.writeBytes(keyFile, new Uint8Array(key));
        return { key: new Uint8Array(key), replaced: false };
      }
    } catch { /* keychain refused or entry gone: start over below */ }
  }
  const key = randomBytes(32);
  fs.writeBytes(keyFile, new Uint8Array(key));
  return { key: new Uint8Array(key), replaced: !!saved };
}
