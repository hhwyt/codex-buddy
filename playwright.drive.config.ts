// M1 drive of the packaged app (test/drive). Set CODEXBUDDY_E2E_EXECUTABLE to the packaged binary; see the spec's header.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/drive',
  testMatch: '**/*.spec.ts',
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', actionTimeout: 15_000 },
});
