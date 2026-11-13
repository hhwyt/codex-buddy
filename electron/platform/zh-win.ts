// 汉化版 launcher on Windows. Owner: A6 (with A3). Desktop + Start menu「ChatGPT 汉化版.lnk」, as codex.ps1's edition
// action does today (CODEX_SETUP_ACTION=edition). remove(): guardedRemove both shortcuts only (L-04).
import { todo } from '../core/todo';
import type { Platform, ZhLauncher } from './types';

export function createWinZh(_platform: Platform): ZhLauncher {
  return {
    exists: async () => todo('A6', 'win zh exists'),
    add: async () => todo('A6', 'win zh add'),
    remove: async () => todo('A6', 'win zh remove'),
    supported: async () => todo('A6', 'win zh supported'),
  };
}
