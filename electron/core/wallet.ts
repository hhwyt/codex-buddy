// Card stack logic (叠卡). Owner: A1 (logic) for A5 (ui/pages/models.ts). Pure functions, no DOM.
// M-02 click a back card → it moves to the front and switching starts; M-03 drag to the front → switch;
// M-05 drag not reaching the front → reorder only, no switch, no config change; M-07 failed test → back to old order;
// M-23 order and active card survive restarts (persisted by main through settings).
import { todo } from './todo';
import type { VendorId, WalletState } from './types';

export type WalletAction =
  | { type: 'click'; vendor: VendorId }
  | { type: 'drop'; vendor: VendorId; toIndex: number }
  | { type: 'switch-failed'; previous: WalletState }
  | { type: 'switch-ok'; vendor: VendorId };

export interface WalletOutcome {
  state: WalletState;
  /** Start a switch to this vendor (only when a card reached the front) */
  startSwitch: VendorId | null;
}

export function initialWallet(order: VendorId[]): WalletState {
  return { order: [...order], active: null };
}

export function reduceWallet(_state: WalletState, _action: WalletAction): WalletOutcome {
  return todo('A1', 'reduceWallet');
}
