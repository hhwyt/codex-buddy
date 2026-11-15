// Packaged-build hardening that Electron fuses (package.json build.electronFuses) cannot express. Owner: integration.
// A packaged build refuses to start with a debugging switch on its own command line and never opens DevTools.
// The 汉化 launcher's --remote-debugging-port goes to Codex (ChatGPT.app), not to CodexBuddy, so it is unaffected.
// A drive build (npm run dist:drive, build/drive.config.cjs) sets package.json codexbuddyDebuggable: Playwright drives
// it over these very switches.

/** Chromium / Node switches that would let another program inspect or drive CodexBuddy */
export const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'inspect', 'inspect-brk', 'inspect-port', 'inspect-publish-uid'];

/** Debugging is allowed in a repo run (`electron .`) and in a drive build, never in a release build */
export const debuggable = (packaged: boolean, packageMeta: { codexbuddyDebuggable?: unknown }): boolean =>
  !packaged || packageMeta.codexbuddyDebuggable === true;

/** The debugging switches present on the command line (hasSwitch = app.commandLine.hasSwitch) */
export const debugSwitchesIn = (hasSwitch: (name: string) => boolean): string[] => DEBUG_SWITCHES.filter(s => hasSwitch(s));
