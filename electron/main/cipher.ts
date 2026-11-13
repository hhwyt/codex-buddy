// Secrets at rest: AES-256-GCM (iv 12 bytes | tag 16 bytes | ciphertext). The 32-byte key lives in the OS keychain
// through Electron safeStorage in the app; in sandbox runs (tests, e2e) it is a random key file inside the sandbox.
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

/** Wraps the data key with `wrap` (safeStorage) and keeps the wrapped bytes in keyFile; creates one the first time */
export function loadDataKey(fs: FileSystem, keyFile: string, wrap: { encrypt(b: Buffer): Buffer; decrypt(b: Buffer): Buffer }): Uint8Array {
  const saved = fs.readBytes(keyFile);
  if (saved) return new Uint8Array(wrap.decrypt(Buffer.from(saved)));
  const key = randomBytes(32);
  fs.writeBytes(keyFile, new Uint8Array(wrap.encrypt(key)));
  return new Uint8Array(key);
}

/** No wrapping: only for sandbox runs, where the sandbox folder is thrown away */
export const plainWrap = { encrypt: (b: Buffer) => b, decrypt: (b: Buffer) => b };
