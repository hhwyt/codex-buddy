// Update dialog. Owner: A6. U-01 稍后 → same version not again within a day; U-02 立即更新 → progress → restart;
// U-03 Mac unsigned: 立即更新 opens the download page in the right-side browser.
import type { BuddyApi } from '../api.js';

export function watchUpdates(_api: BuddyApi, _root: HTMLElement): void {
  // A6: subscribe to api.on('update', …) and show the dialog
}
