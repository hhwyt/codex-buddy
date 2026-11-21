// Installation drawer: real progress, retry at the failed step, and masked logs.
import type { StepView } from '../../electron/main/ipc-contract.js';
import { createProgress } from '../components/progress.js';
import { helpLink, maskKeys } from '../components/help.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { PageContext } from './types.js';

export { maskKeys };

/** Step ids starting with this are「正在帮你修」lines, not progress rows (O-08) */
export const FIX_STEP_PREFIX = 'fix';
/** Set right after a fresh install: the models page sets up its top card once, then opens Codex */
export const autoFirstSwitch = { pending: false };

/** The Mac install's three steps (electron/platform/mac.ts), listed grey from the start; Windows rows appear as codex.ps1
 *  reports them */
export const MAC_STEPS = [{ id: 'download', text: '下载 Codex' }, { id: 'copy', text: '装进应用程序' }, { id: 'check', text: '检查 Codex' }];

export function renderOnboarding({ api, root, go }: PageContext): () => void {
  const view = h('div', { class: 'onb' });
  const drawer = h('section', { class: 'install-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': '安装 Codex', tabindex: '-1', 'data-testid': TID.onboarding.root },
    h('h2', { class: 'onb-head' }, '安装 Codex'), view);
  root.replaceChildren(h('div', { class: 'install-scrim' }, drawer));
  drawer.focus();
  const progress = createProgress(document.documentElement.classList.contains('os-mac') ? MAC_STEPS : []);
  const fixing = h('p', { class: 'onb-fixing', 'data-testid': TID.onboarding.fixing, hidden: true });
  let running = false;
  let alive = true;

  const onStep = (s: StepView) => {
    if (s.flow !== 'install') return;
    if (s.id.startsWith(FIX_STEP_PREFIX)) {
      fixing.hidden = s.state !== 'start';
      fixing.textContent = `正在帮你修：${s.text}`;
      return;
    }
    progress.update(s);
  };
  const off = api.on('step', onStep);

  const installing = () => view.replaceChildren(h('div', { class: 'onb-steps', role: 'status' }, progress.el, fixing));

  const failure = (reason: string) => view.replaceChildren(
    h('div', { class: 'onb-failure', 'data-testid': TID.onboarding.failure },
      h('h2', { class: 'onb-head' }, '没装好'),
      progress.el,
      h('p', { class: 'onb-reason' }, reason),
      h('div', { class: 'onb-actions' },
        helpLink(),
        h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.onboarding.retry, onclick: () => void run() }, '重试'))));

  async function run(): Promise<void> {
    if (running) return;
    running = true;
    fixing.hidden = true;
    installing();
    let ok = false;
    let reason = '安装没完成，请再试一次';
    try {
      const out = await api.invoke('install:run');
      ok = out.ok;
      if (out.reason) reason = out.reason;
    } catch {
      // keep the default reason: the main process failed without saying why
    }
    running = false;
    if (!alive) return;
    if (ok) {
      // 站主 11-16: right after installing, set up the top card (智谱) and then open Codex on it
      autoFirstSwitch.pending = true;
      go('models');
    }
    else failure(reason);
  }

  void run();
  return () => { alive = false; off(); };
}
