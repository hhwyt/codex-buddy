// Collects the main process's `step` events in the page (IPC contract event), so specs can check the order. Owner: A7.
import type { Page } from '@playwright/test';
import type { StepView } from '../../electron/main/ipc-contract';

export async function recordSteps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __steps?: unknown[]; buddy: { on(e: string, fn: (p: unknown) => void): () => void } };
    if (w.__steps) return;
    w.__steps = [];
    w.buddy.on('step', s => { w.__steps!.push(s); });
  });
}
export const steps = (page: Page) => page.evaluate(() => ((window as unknown as { __steps?: StepView[] }).__steps ?? []));
export const clearSteps = (page: Page) => page.evaluate(() => { (window as unknown as { __steps?: unknown[] }).__steps = []; });
