// While the feature agents' work is not merged yet, CODEXBUDDY_E2E_ALLOW_PENDING=1 skips (with the reason) every spec
// whose page or main-process handler does not exist in the source yet. CI never sets it: there every spec runs and a
// missing feature fails. The probe is static (source text), so it never hides a feature that exists but is broken.
// Owner: A7.
import { test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO } from './launch';

const read = (rel: string) => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch { return ''; } };
const mainSources = () => ['electron/app.ts', ...fs.readdirSync(path.join(REPO, 'electron', 'main')).map(f => `electron/main/${f}`)].map(read).join('\n');

export interface Needs {
  /** ui/pages/<page>.ts must mention each of these (e.g. 'TID.models.card(') */
  ui?: Partial<Record<'onboarding' | 'models' | 'settings' | 'help' | 'security' | 'update', string[]>>;
  /** IPC channels that must have a handler wired in the main process */
  ipc?: string[];
}

export function missing(needs: Needs): string[] {
  const out: string[] = [];
  for (const [page, needles] of Object.entries(needs.ui ?? {})) {
    const src = read(`ui/pages/${page}.ts`);
    for (const n of needles ?? []) if (!src.includes(n)) out.push(`ui/pages/${page}.ts 还没有 ${n}`);
  }
  const main = needs.ipc?.length ? mainSources() : '';
  for (const c of needs.ipc ?? []) if (!main.includes(`'${c}'`)) out.push(`主进程还没接 ${c}`);
  return out;
}

/** Declares what a spec file needs; in pending mode the file's tests skip until it exists */
export function needs(n: Needs): void {
  test.beforeEach(() => {
    if (process.env.CODEXBUDDY_E2E_ALLOW_PENDING !== '1') return;
    const gaps = missing(n);
    test.skip(gaps.length > 0, `等集成：${gaps.join('；')}`);
  });
}

/** Most specs start from the model page: onboarding + install + wallet */
export const BASE_NEEDS: Needs = {
  ui: { onboarding: ['TID.onboarding.start'], models: ['TID.models.card('] },
  ipc: ['install:run', 'wallet:get', 'switch:start'],
};
export const merge = (...all: Needs[]): Needs => ({
  ui: all.reduce((acc, n) => {
    for (const [k, v] of Object.entries(n.ui ?? {})) (acc as Record<string, string[]>)[k] = [...((acc as Record<string, string[]>)[k] ?? []), ...(v ?? [])];
    return acc;
  }, {} as NonNullable<Needs['ui']>),
  ipc: all.flatMap(n => n.ipc ?? []),
});
