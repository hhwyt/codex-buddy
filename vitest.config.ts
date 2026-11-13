// Unit (L1), integration (L2) and UI component (L3) tests. Owner: Base.
// Coverage gate (build-plan §4): lines / branches / functions / statements ≥ 85% over electron/** and ui/**,
// electron/core/** ≥ 95%. On by default; CODEXBUDDY_COV_GATE=0 turns it off for a local look at partial runs only.
import { defineConfig } from 'vitest/config';

const gate = process.env.CODEXBUDDY_COV_GATE !== '0';

export default defineConfig({
  test: {
    include: ['test/{unit,integration,ui}/**/*.test.ts'],
    environment: 'node',
    // UI tests opt into happy-dom with: // @vitest-environment happy-dom
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['electron/**/*.ts', 'ui/**/*.ts'],
      exclude: ['scripts/vendor/**', '**/*.d.ts', 'ui/build/**', 'dist/**', 'electron/main/ipc-contract.ts', 'electron/core/types.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      thresholds: gate
        ? { lines: 85, branches: 85, functions: 85, statements: 85, 'electron/core/**': { lines: 95, branches: 95, functions: 95, statements: 95 } }
        : undefined,
    },
  },
});
