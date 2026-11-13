// minimax: login detection and key capture use the shared defaults in base.ts (console hosts from providers.ts). Owner: A4.
// Level-1 console API not set: the official API has to be checked with a real login (openIssues), so the ladder
// starts at level 2 (user clicks「创建」on the official key page, the key is caught from the response).
import { providerOf } from '../core/providers';
import { makeVendor } from './base';

export const minimax = makeVendor(providerOf('minimax'));
