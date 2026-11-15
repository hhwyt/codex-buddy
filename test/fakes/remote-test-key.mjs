// Test-only Ed25519 keypair for remote/config.json signatures (fake config server, unit and e2e tests), derived from a
// fixed public seed so no private key text sits in the repo. Not a secret. The app trusts it only in test mode
// (sandbox + fake servers: CODEXBUDDY_REMOTE_KEY, electron/app.ts); real builds trust electron/core/remote-key.ts.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

const seed = createHash('sha256').update('codexbuddy remote-config test key').digest();
const key = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });

export const TEST_PRIVATE_KEY = key.export({ type: 'pkcs8', format: 'pem' }).toString();
export const TEST_PUBLIC_KEY = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
/** base64 signature over the exact bytes of `body` (a string is taken as UTF-8) */
export const testSign = body => sign(null, Buffer.from(body), key).toString('base64');
