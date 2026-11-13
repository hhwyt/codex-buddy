// openai: the official account logs in through Codex itself in the system browser (M-22, M-26); no key, no recharge
// page. obtainKey answers 'failed' with a note so the caller routes it to `codex login`. Owner: A4.
import { providerOf } from '../core/providers';
import { makeVendor } from './base';

export const openai = makeVendor(providerOf('openai'));
