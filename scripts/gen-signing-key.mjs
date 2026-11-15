#!/usr/bin/env node
// Creates the Ed25519 keypair that signs remote/config.json (docs/release.md). Run once, on the site owner's computer.
//   node scripts/gen-signing-key.mjs [--out <file>] [--force]
// The private key goes to ~/.codexbuddy/remote-config-ed25519.pem (mode 0600, folder 0700) and never into the repo.
// Prints the public key to paste into electron/core/remote-key.ts, and its SHA-256 fingerprint.
import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_KEY_FILE = path.join(os.homedir(), '.codexbuddy', 'remote-config-ed25519.pem');

/** SHA-256 over the public key's DER (SPKI) bytes, as hex pairs */
export function fingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex').match(/../g).join(':');
}

/** Writes a new private key to `file` (refuses to replace one unless force) and returns the public key PEM */
export function generateSigningKey(file, { force = false } = {}) {
  if (fs.existsSync(file) && !force) throw new Error(`${file} already exists (pass --force to replace it; every installed app would then reject new configs)`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const file = at >= 0 ? path.resolve(args[at + 1]) : DEFAULT_KEY_FILE;
  try {
    const pub = generateSigningKey(file, { force: args.includes('--force') });
    console.log(`private key: ${file} (0600, keep it off the repo)`);
    console.log(`fingerprint: ${fingerprint(pub)}`);
    console.log('public key (put it in electron/core/remote-key.ts):');
    console.log(pub.trim());
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
