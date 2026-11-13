// 一键还原 plan: what will be done (shown in T-03's confirm dialog) and how. Owner: A1.
// Only undoes CodexBuddy's own changes (T-04, C-10): config back, the Codex we installed uninstalled, clones and the
// 汉化版 launcher removed (entry points only, via guard.ts), browser logins cleared; chat history kept (G-01).
import { todo } from './todo';

export interface OriginalState {
  takenAt: string;
  configExisted: boolean;
  authExisted: boolean;
  codexInstalled: boolean;
  zhLauncher: boolean;
}

export type RestoreStep =
  | { kind: 'close-codex' }
  | { kind: 'config' }
  | { kind: 'remove-zh-launcher' }
  | { kind: 'remove-clone'; vendor: string }
  | { kind: 'uninstall-codex' }
  | { kind: 'clear-browser-logins' };

export interface RestoreInputs {
  original: OriginalState | null;
  codexInstalledNow: boolean;
  codexRunning: boolean;
  zhLauncherNow: boolean;
  clones: string[];
}

export function planRestore(_inputs: RestoreInputs): RestoreStep[] {
  return todo('A1', 'planRestore');
}

/** Lines for the confirm dialog (T-03), one per step, plain Chinese without trailing punctuation */
export function describeRestore(_steps: RestoreStep[]): string[] {
  return todo('A1', 'describeRestore');
}
