// 汉化版 launcher on Mac. Owner: A6 (with A2 for OS details).
// Adds <appsDir>/ChatGPT 汉化版.app: a tiny app (ChatGPT icon + 「中」 badge) whose executable starts ChatGPT.app with
// --remote-debugging-port=0 bound to 127.0.0.1 and flips enable_i18n through the debug port. ChatGPT.app untouched (L-02).
// remove(): guardedRemove the launcher app only (L-04).
import { todo } from '../core/todo';
import type { Platform, ZhLauncher } from './types';

export function createMacZh(_platform: Platform): ZhLauncher {
  return {
    exists: async () => todo('A6', 'mac zh exists'),
    add: async () => todo('A6', 'mac zh add'),
    remove: async () => todo('A6', 'mac zh remove'),
    supported: async () => todo('A6', 'mac zh supported'),
  };
}
