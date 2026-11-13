// Unit (L1), integration (L2) and UI component (L3) tests. Owner: Base.
// Coverage gate (build-plan §4): lines / branches / functions / statements ≥ 85% over electron/** and ui/**,
// electron/core/** ≥ 95%. TEMPORARILY OFF at the Base stage (stubs throw "not implemented"): set
// CODEXBUDDY_COV_GATE=1 to enforce. The integration agent flips the default to on before delivery.
import { defineConfig } from 'vitest/config';

const gate = process.env.CODEXBUDDY_COV_GATE === '1';

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
