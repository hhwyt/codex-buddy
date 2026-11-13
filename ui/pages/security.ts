// 🛡 security panel (overlay). Owner: A6. S-01..S-08: keys masked, reveal in Finder / Explorer, 去官网管理, sites in
// two lists (CodexBuddy 连过的 / 网页里连过的, live), 让 AI 帮我检查, 查看源代码.
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';

export function openSecurity(_api: BuddyApi, root: HTMLElement): HTMLElement {
  const panel = h('aside', { class: 'security', 'data-testid': TID.security.root });
  root.append(panel);
  return panel;
}
