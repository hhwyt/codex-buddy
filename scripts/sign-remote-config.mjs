#!/usr/bin/env node
// Signs remote/config.json for release (docs/release.md): writes remote/config.json.sig, a base64 Ed25519 signature
// over the file's exact bytes. The app fetches both files and drops a config whose signature does not check out.
//   node scripts/sign-remote-config.mjs [<config.json>] [--public-key <pem file>]
// Private key: $CODEXBUDDY_SIGNING_KEY (the PEM text, or a path to it), else ~/.codexbuddy/remote-config-ed25519.pem.
// Before writing, the signature is checked against the public key built into the app (electron/core/remote-key.ts),
// or --public-key, so a config signed with the wrong key never ships.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_KEY_FILE = path.join(os.homedir(), '.codexbuddy', 'remote-config-ed25519.pem');
export const EMBEDDED_KEY_FILE = path.join(root, 'electron', 'core', 'remote-key.ts');
const PEM_PUBLIC = /-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/;

/** The private key PEM from $CODEXBUDDY_SIGNING_KEY (text or path) or the default file */
export function readPrivateKey(env = process.env) {
  const v = env.CODEXBUDDY_SIGNING_KEY;
  if (v) return v.includes('-----BEGIN') ? v : fs.readFileSync(v, 'utf8');
  return fs.readFileSync(DEFAULT_KEY_FILE, 'utf8');
}

/** base64 Ed25519 signature over bytes */
export const signBytes = (bytes, privateKeyPem) => sign(null, bytes, createPrivateKey(privateKeyPem)).toString('base64');

/** The public key PEM inside a file (remote-key.ts or a plain .pem) */
export function publicKeyIn(file) {
  const m = PEM_PUBLIC.exec(fs.readFileSync(file, 'utf8'));
  if (!m) throw new Error(`no public key in ${file}`);
  return m[0];
}

/** Signs `configFile`, checks the result against `publicKeyPem`, writes `<configFile>.sig`; returns the .sig path */
export function signConfigFile(configFile, privateKeyPem, publicKeyPem) {
  const bytes = fs.readFileSync(configFile);
  JSON.parse(bytes.toString('utf8')); // a broken file is never signed
  const sig = signBytes(bytes, privateKeyPem);
  if (!verify(null, bytes, createPublicKey(publicKeyPem), Buffer.from(sig, 'base64'))) {
    throw new Error('the signing key does not match the public key built into the app (electron/core/remote-key.ts)');
  }
  const out = `${configFile}.sig`;
  fs.writeFileSync(out, `${sig}\n`);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--public-key');
  const publicFile = at >= 0 ? path.resolve(args[at + 1]) : EMBEDDED_KEY_FILE;
  const rest = args.filter((_, i) => at < 0 || (i !== at && i !== at + 1));
  const config = path.resolve(rest[0] ?? path.join(root, 'remote', 'config.json'));
  try {
    const out = signConfigFile(config, readPrivateKey(), publicKeyIn(publicFile));
    console.log(`signed: ${path.relative(process.cwd(), out) || out}`);
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
