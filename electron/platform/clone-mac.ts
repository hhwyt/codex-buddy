// 分身 on Mac. Owner: A9. Port of ~/.claude/skills/codex-deepseek-fork/scripts/install.sh:
//   cp -c (APFS clone) ChatGPT.app → <appsDir>/<Name>.app; Info.plist CFBundleName/DisplayName/Identifier
//   (local.codexbuddy.<slug>) and icon from the vendor logo (sips + iconutil); main executable replaced by a launcher
//   that sets CODEX_HOME=~/.codex-<slug>, CODEX_ELECTRON_USER_DATA_PATH + --user-data-dir
//   (~/Library/Application Support/Codex (<Name>)), CODEX_SPARKLE_ENABLED=false, --use-mock-keychain; then
//   codesign --force --deep -s - (ad-hoc, no hardened runtime). Key comes from CodexBuddy itself, no third-party switcher.
// remove(): guardedRemove the .app only (C-07). Tests run against sandbox paths with a fake .app.
import { todo } from '../core/todo';
import type { Clone, Platform } from './types';

export function createMacClone(_platform: Platform): Clone {
  return {
    list: async () => todo('A9', 'mac clone list'),
    make: async () => todo('A9', 'mac clone make'),
    open: async () => todo('A9', 'mac clone open'),
    remove: async () => todo('A9', 'mac clone remove'),
    setZh: async () => todo('A9', 'mac clone setZh'),
  };
}
