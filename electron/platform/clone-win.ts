// 分身 on Windows. Owner: A9. Plan in docs/spikes.md (d): no copy of the Store package; a launcher (.lnk with its own
// System.AppUserModel.ID = CodexBuddy.<Slug>, name and .ico) that starts Codex with CODEX_HOME=%USERPROFILE%\.codex-<slug>
// and --user-data-dir=%APPDATA%\Codex (<Name>). Fallback if two instances cannot run side by side: a portable copy.
import { todo } from '../core/todo';
import type { Clone, Platform } from './types';

export function createWinClone(_platform: Platform): Clone {
  return {
    list: async () => todo('A9', 'win clone list'),
    make: async () => todo('A9', 'win clone make'),
    open: async () => todo('A9', 'win clone open'),
    remove: async () => todo('A9', 'win clone remove'),
    setZh: async () => todo('A9', 'win clone setZh'),
  };
}
