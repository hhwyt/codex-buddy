// 一键还原 plan: what will be done (shown in T-03's confirm dialog) and how. Owner: A1.
// Only undoes CodexBuddy's own changes (T-04, C-10): config back, the Codex we installed uninstalled, clones and the
// 汉化版 launcher removed (entry points only, via guard.ts), browser logins cleared; chat history kept (G-01).

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

/** Steps in the order they run. Nothing to undo → [] */
export function planRestore(inputs: RestoreInputs): RestoreStep[] {
  const steps: RestoreStep[] = [];
  if (inputs.codexRunning) steps.push({ kind: 'close-codex' });
  if (inputs.original) steps.push({ kind: 'config' });
  // The 汉化版 launcher goes only when we added it (it was not there before CodexBuddy)
  if (inputs.zhLauncherNow && !inputs.original?.zhLauncher) steps.push({ kind: 'remove-zh-launcher' });
  for (const vendor of inputs.clones) steps.push({ kind: 'remove-clone', vendor });
  // Codex is uninstalled only when CodexBuddy installed it (T-04: one that was there before stays)
  if (inputs.codexInstalledNow && inputs.original && !inputs.original.codexInstalled) steps.push({ kind: 'uninstall-codex' });
  if (steps.length) steps.push({ kind: 'clear-browser-logins' });
  return steps;
}

const LINES: { [K in RestoreStep['kind']]: (s: Extract<RestoreStep, { kind: K }>) => string } = {
  'close-codex': () => '先关掉正在运行的 Codex',
  config: () => 'Codex 的配置恢复成用 CodexBuddy 之前的样子',
  'remove-zh-launcher': () => '去掉「ChatGPT 汉化版」图标',
  'remove-clone': s => `去掉分身「${s.vendor}」这个 App`,
  'uninstall-codex': () => '卸掉 CodexBuddy 装的 Codex',
  'clear-browser-logins': () => '退出右侧浏览器里的登录',
};

/** Lines for the confirm dialog (T-03), one per step, plain Chinese without trailing punctuation. The last line says
 *  what stays (G-01) */
export function describeRestore(steps: RestoreStep[]): string[] {
  if (!steps.length) return ['没有要还原的东西'];
  const lines = steps.map(s => (LINES[s.kind] as (x: RestoreStep) => string)(s));
  return [...lines, '聊天记录和分身的聊天记录都留着'];
}
