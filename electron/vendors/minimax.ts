// minimax: console API for creating a key, login detection. Owner: A4.
import { providerOf } from '../core/providers';
import { makeVendor } from './base';

export const minimax = makeVendor(providerOf('minimax'), {
  // TODO(A4): real login detection and console API (docs/spikes.md (b) lists the key page)
  loggedIn: url => !/login|sign_in/.test(url),
});
