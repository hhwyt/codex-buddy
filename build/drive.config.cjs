// electron-builder config for the M1 drive build (test/drive): the release config (package.json "build") without the
// Electron fuses and marked debuggable (electron/main/hardening.ts), because Playwright drives the packaged app over
// --inspect / --remote-debugging-port. Never ship this build to users.
//   npm run dist:drive -- --mac dir      npm run dist:drive -- --win dir
const { build } = require('../package.json');

module.exports = { ...build, electronFuses: null, extraMetadata: { codexbuddyDebuggable: true } };
