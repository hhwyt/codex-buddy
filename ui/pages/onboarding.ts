// Onboarding (no left column). Owner: A11.
// 欢迎「Codex 免费助手 / 国产大模型」+「开始安装」→ 进度一行一行打勾 → 直接进模型页（没有完成屏）O-01
// 已装的那一行由主进程直接发 done「已装好」O-02；能自己修的小问题显示「正在帮你修：…」O-08
// 失败 → 故障屏：「再试一次」从失败处接着做 O-03、「复制日志」先预览且 Key 打码 O-04、「进群发给我们」→ 帮助页 O-05
// 已经配过模型 → 跳过引导 O-06：app.ts 按 app:state.configured 直接进模型页，不进这里
import type { StepView } from '../../electron/main/ipc-contract.js';
import { dialog } from '../components/dialog.js';
import { createProgress } from '../components/progress.js';
import { toast } from '../components/toast.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import type { Page } from './types.js';

/** Step ids starting with this are「正在帮你修」lines, not progress rows (O-08) */
export const FIX_STEP_PREFIX = 'fix';

/** Second line of defense: main already redacts the log (O-04), the page masks anything key-shaped again */
export function maskKeys(text: string): string {
  return text
    .replace(/\b(sk|ak|tk)-[A-Za-z0-9_-]{6,}/g, '$1-••••')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, '$1••••')
    .replace(/((?:api[_-]?key|token|secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{8,}/gi, '$1••••');
}

export const renderOnboarding: Page = ({ api, root, go }) => {
  const view = h('div', { class: 'onb', 'data-testid': TID.onboarding.root });
  root.replaceChildren(view);
  const progress = createProgress();
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

  const welcome = () => view.replaceChildren(
    h('h1', { class: 'onb-title' }, 'Codex 免费助手', h('br'), h('span', { class: 'onb-sub' }, '国产大模型')),
    h('button', { class: 'btn primary onb-start', type: 'button', 'data-testid': TID.onboarding.start, onclick: () => void run() }, '开始安装'));

  // Title, steps and「正在帮你修」share one left edge (a centered title over a left-aligned list looked off)
  const installing = () => view.replaceChildren(h('div', { class: 'onb-steps' }, h('h2', { class: 'onb-head' }, '正在安装 Codex'), progress.el, fixing));

  const failure = (reason: string) => view.replaceChildren(
    h('div', { class: 'onb-failure', 'data-testid': TID.onboarding.failure },
      h('h2', { class: 'onb-head' }, '没装好'),
      progress.el,
      h('p', { class: 'onb-reason' }, reason),
      h('div', { class: 'onb-actions' },
        h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.onboarding.retry, onclick: () => void run() }, '再试一次'),
        h('button', { class: 'btn', type: 'button', 'data-testid': TID.onboarding.copyLog, onclick: () => void copyLog() }, '复制日志'),
        h('button', { class: 'link', type: 'button', 'data-testid': TID.onboarding.toCommunity, onclick: () => go('help') }, '进群发给我们'))));

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
    if (ok) go('models');
    else failure(reason);
  }

  async function copyLog(): Promise<void> {
    const { text } = await api.invoke('install:log');
    const safe = maskKeys(text);
    const yes = await dialog({
      title: '要复制的日志', lines: ['Key 已经打码'], confirm: '复制', cancel: '先不了',
      body: h('pre', { class: 'onb-log', 'data-testid': TID.onboarding.logPreview }, safe),
    });
    if (!yes) return;
    try {
      await navigator.clipboard.writeText(safe);
      toast('已复制');
    } catch {
      toast('没复制成功', { error: true });
    }
  }

  welcome();
  return () => { alive = false; off(); };
};
