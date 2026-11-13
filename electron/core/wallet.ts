// Card stack logic (叠卡). Owner: A1 (logic) for A5 (ui/pages/models.ts). Pure functions, no DOM.
// M-02 click a back card → it moves to the front and switching starts; M-03 drag to the front → switch;
// M-05 drag not reaching the front → reorder only, no switch, no config change; M-07 failed test → back to old order;
// M-23 order and active card survive restarts (persisted by main through settings).
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

/** order with vendor moved to index (clamped) */
export function moveCard(order: VendorId[], vendor: VendorId, toIndex: number): VendorId[] {
  const rest = order.filter(v => v !== vendor);
  const at = Math.max(0, Math.min(rest.length, Math.trunc(toIndex)));
  return [...rest.slice(0, at), vendor, ...rest.slice(at)];
}

/** Saved order merged with the vendors that exist now: unknown ones dropped, new ones appended (M-23 after an update
 *  adds or a remote switch hides a vendor) */
export function restoreWallet(saved: Partial<WalletState> | null, vendors: VendorId[]): WalletState {
  const kept = (saved?.order ?? []).filter(v => vendors.includes(v));
  const order = [...new Set([...kept, ...vendors])];
  const active = saved?.active && order.includes(saved.active) ? saved.active : null;
  return { order, active };
}

export function reduceWallet(state: WalletState, action: WalletAction): WalletOutcome {
  const same = { state, startSwitch: null };
  switch (action.type) {
    case 'click': {
      if (!state.order.includes(action.vendor) || action.vendor === state.active) return same;
      return { state: { ...state, order: moveCard(state.order, action.vendor, 0) }, startSwitch: action.vendor };
    }
    case 'drop': {
      if (!state.order.includes(action.vendor)) return same;
      const order = moveCard(state.order, action.vendor, action.toIndex);
      const front = order[0] === action.vendor && action.vendor !== state.active;
      return { state: { ...state, order }, startSwitch: front ? action.vendor : null };
    }
    case 'switch-failed':
      return { state: { order: [...action.previous.order], active: action.previous.active }, startSwitch: null };
    case 'switch-ok':
      return { state: { order: moveCard(state.order, action.vendor, 0), active: action.vendor }, startSwitch: null };
  }
}
