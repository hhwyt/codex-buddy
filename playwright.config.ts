// End-to-end (L4): the real Electron app via Playwright's _electron, always sandboxed. Owner: Base; A7 adds specs.
// Every spec launches through test/e2e/launch.ts, which sets CODEXBUDDY_SANDBOX (a fresh temp dir) and
// CODEXBUDDY_ENDPOINTS (fake vendor + fake config servers). Nothing touches the real ~/.codex or /Applications.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 10_000 },
});
