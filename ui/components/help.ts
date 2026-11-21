// 去社群咨询：报错弹窗 / 提示条里的灰色文字链接。点它先把日志复制到剪贴板（Key 打码），
// 再由全局 codexbuddy:help 监听跳到「社群」页。
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { BuddyApi } from '../api.js';

const CHAT_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 14H9l-4 3v-3H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 4Z"/></svg>';

/** Second line of defense: main already redacts the log (O-04), this masks anything key-shaped again */
export function maskKeys(text: string): string {
  return text
    .replace(/\b(sk|ak|tk)-[A-Za-z0-9_-]{6,}/g, '$1-••••')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1••••')
    .replace(/((?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{8,}/gi, '$1••••');
}

/** Copies the install log with keys masked; true when the clipboard accepted it (E-02). No toast either way. */
export async function copyLog(api: BuddyApi): Promise<boolean> {
  try {
    const { text } = await api.invoke('install:log');
    await navigator.clipboard.writeText(maskKeys(text));
    return true;
  } catch { return false; }
}

export function helpLink(): HTMLButtonElement {
  const icon = h('span', { class: 'help-icon', 'aria-hidden': 'true' });
  icon.innerHTML = CHAT_SVG;
  return h('button', {
    class: 'help-link', type: 'button', 'data-testid': TID.help,
    onclick: () => window.dispatchEvent(new CustomEvent('codexbuddy:help')),
  }, icon, '去社群咨询');
}
