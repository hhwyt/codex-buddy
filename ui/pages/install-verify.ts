// Install with the check (A-01..A-06, design/install-verify.html#v2): one dialog, four steps. 下载 Codex, 装进应用程序 and
// 检查 Codex come from install:run; the fourth, 「测试 Codex」 with 「尝试打开本项目的 GitHub Repo」 under it, sets up
// the first card, has Codex answer the project's GitHub address and opens that address in the dialog's right half
// (the right-side browser pinned there; login and scan pages of the switch land there too). Under the steps the unticked
// 「给 CodexBuddy 点个 Star」; at the end 稍后 / 打开 ChatGPT in the same dialog. Shown only when the signed switch
// starVerify is on; otherwise onboarding.ts is the install drawer as before.
import type { Outcome, StepView } from '../../electron/main/ipc-contract.js';
import { createProgress } from '../components/progress.js';
import { helpLink } from '../components/help.js';
import { h } from '../dom.js';
import { TID } from '../testids.js';
import { MAC_STEPS } from './onboarding.js';
import type { PageContext } from './types.js';

type Mark = 'pending' | 'start' | 'done' | 'fail';
const MARK: Record<Mark, string> = { pending: '', start: '', done: '✓', fail: '✕' };
const CONSEQUENCE = '如果 ChatGPT 已在运行，会先退出再打开，正在进行的任务会中断。';

export function renderInstallVerify({ api, root, go }: PageContext): () => void {
  let alive = true;
  let stage: 'install' | 'test' | 'done' = 'install';
  let failed: { at: 'install' | 'test'; reason: string } | null = null;
  let vendor = '';
  let restartRequired = false;
  let wantStar = false;
  let star: 'idle' | 'busy' | 'done' = 'idle';
  let starReason = '';
  let pageOpen = false;
  let opening = false;
  let openError = '';

  const progress = createProgress(document.documentElement.classList.contains('os-mac') ? MAC_STEPS : []);
  const testMark = h('span', { class: 'progress-mark', 'aria-hidden': 'true' });
  const testText = h('span', { class: 'progress-text' });
  const testSub = h('small', { 'data-testid': TID.verify.test });
  const testRow = h('li', { class: 'progress-row', 'data-testid': TID.onboarding.step('test') }, testMark, h('span', {}, testText, testSub));
  const setTest = (m: Mark, sub = '') => { testRow.dataset.state = m; testMark.textContent = MARK[m]; testSub.textContent = sub; testSub.hidden = !sub; };
  setTest('pending');

  const title = h('h2', { id: 'iv-title', 'data-testid': TID.verify.title });
  const starBox = h('div', { class: 'verify-star' });
  const tail = h('div', {});
  const left = h('div', { class: 'iv-left' }, title, h('div', { class: 'iv-steps' }, progress.el), starBox, tail);
  const pageSlot = h('div', { class: 'iv-page', 'data-testid': TID.verify.page });
  const box = h('section', { class: 'dialog iv-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'iv-title', 'data-testid': TID.verify.root }, left, pageSlot);
  const scrim = h('div', { class: 'scrim iv-scrim' }, box);
  scrim.addEventListener('click', (e: Event) => { if (e.target === scrim && failed) leave(); });
  root.replaceChildren(scrim);

  /** The right half: where the pinned browser view goes (window coordinates) */
  const sendPlace = () => {
    if (!alive) return;
    const r = pageSlot.getBoundingClientRect();
    void api.invoke('browser:place', pageOpen ? { x: r.left + 1, y: r.top + 1, width: r.width - 2, height: r.height - 2 } : { x: 0, y: 0, width: 0, height: 0 });
  };
  const onResize = () => { if (pageOpen) sendPlace(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && failed) leave(); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  // The right half's box settles after the dialog widens: place the page again whenever it changes
  const slotSize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
  slotSize?.observe(pageSlot);
  const offs = [
    api.on('step', (s: StepView) => { if (s.flow === 'install' && !s.id.startsWith('fix')) progress.update(s); }),
    api.on('browser', b => {
      const open = b.open && b.mode === 'inline';
      if (open === pageOpen) return;
      pageOpen = open;
      box.classList.toggle('wide', open);
      requestAnimationFrame(sendPlace);
    }),
  ];

  function render(): void {
    title.replaceChildren(...(failed ? [h('span', { class: 'err' }, '✕'), '没装好'] : stage === 'done' ? [h('span', { class: 'ok' }, '✓'), '装好了'] : [h('span', { class: 'spin' }), '正在安装']));
    if (star === 'done') starBox.replaceChildren(h('p', { 'data-testid': TID.verify.starDone }, h('span', { class: 'ok' }, '✓'), '已点 Star'));
    else if (star === 'busy') starBox.replaceChildren(h('p', {}, h('span', { class: 'spin' }), '正在点 Star'));
    else {
      const input = h('input', { type: 'checkbox', 'data-testid': TID.verify.star }) as HTMLInputElement;
      input.checked = wantStar;
      input.addEventListener('change', () => { wantStar = input.checked; starReason = ''; if (wantStar) void maybeStar(); });
      starBox.replaceChildren(h('label', {}, input, h('span', {}, '给 CodexBuddy 点个 Star')),
        ...(starReason ? [h('p', { class: 'verify-reason', role: 'alert' }, starReason)] : []));
    }
    if (failed) {
      tail.replaceChildren(h('p', { class: 'verify-reason', role: 'alert', 'data-testid': TID.verify.reason }, failed.reason),
        h('div', { class: 'row' },
          helpLink(),
          h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.verify.retry, onclick: () => void (failed!.at === 'install' ? install() : test()) }, '重试')));
    } else if (stage === 'done') {
      const now = h('button', { class: 'btn primary', type: 'button', 'data-testid': TID.verify.open, onclick: () => void openChatGPT() },
        opening ? (restartRequired ? '正在重启' : '正在打开') : openError ? '再试一次' : restartRequired ? '重启 ChatGPT' : '打开 ChatGPT');
      (now as HTMLButtonElement).disabled = opening;
      tail.replaceChildren(
        ...(openError ? [h('p', { class: 'verify-reason', role: 'alert' }, openError)] : []),
        h('p', { class: 'restart-consequence' }, CONSEQUENCE),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', 'data-testid': TID.verify.close, disabled: opening, onclick: () => leave() }, '稍后'), now));
    } else tail.replaceChildren();
  }

  /** Closes the dialog: the pinned page goes with it; the models page shows what was set up */
  function leave(): void {
    if (!alive) return;
    void api.invoke('browser:close');
    go('models');
  }

  async function openChatGPT(): Promise<void> {
    opening = true; openError = ''; render();
    let r: Outcome;
    try { r = await api.invoke('codex:restart'); } catch { r = { ok: false }; }
    if (!alive) return;
    opening = false;
    if (r.ok) { leave(); return; }
    openError = '请先保存任务并退出 ChatGPT，再试一次。';
    render();
  }

  /** Stars once the test step is over, and only while the box is ticked */
  async function maybeStar(): Promise<void> {
    if (!wantStar || star !== 'idle' || stage !== 'done') return;
    star = 'busy'; render();
    let r: Outcome;
    try { r = await api.invoke('star:run'); } catch { r = { ok: false }; }
    if (!alive) return;
    if (r.ok) star = 'done';
    else { star = 'idle'; wantStar = false; starReason = r.kind === 'cancelled' ? '' : (r.reason ?? '没点上，可以在右边自己点'); }
    render();
  }

  async function install(): Promise<void> {
    failed = null; stage = 'install'; render();
    let r: Outcome;
    try { r = await api.invoke('install:run'); } catch { r = { ok: false }; }
    if (!alive) return;
    if (!r.ok) { failed = { at: 'install', reason: r.reason ?? '安装没完成，请再试一次' }; render(); return; }
    progress.el.append(testRow);
    await test();
  }

  async function test(): Promise<void> {
    failed = null; stage = 'test';
    setTest('start', '尝试打开本项目的 GitHub Repo');
    render();
    // Login and scan pages of the switch, then the project's page, all open in the right half
    sendPlace();
    const fail = (reason: string) => { if (!alive) return; failed = { at: 'test', reason }; setTest('fail'); void api.invoke('browser:close'); render(); };
    let sw: Outcome;
    try { sw = await api.invoke('switch:start', { vendor }); } catch { sw = { ok: false }; }
    if (!alive) return;
    if (!sw.ok) return fail(sw.reason ?? '没配好，再试一次');
    restartRequired = !!sw.restartRequired;
    let v: Outcome;
    try { v = await api.invoke('verify:run'); } catch { v = { ok: false }; }
    if (!alive) return;
    if (!v.ok) return fail(v.reason ?? '没验证成功，再试一次');
    // The switch closes the browser once it has the key: pin it again before the project's page opens
    sendPlace();
    let page: Outcome;
    try { page = await api.invoke('verify:open-repo'); } catch { page = { ok: false }; }
    if (!alive) return;
    if (!page.ok) void api.invoke('browser:close');
    setTest('done', page.ok ? '尝试打开本项目的 GitHub Repo' : 'GitHub 页面没打开，可能是网络问题');
    stage = 'done';
    render();
    void maybeStar();
  }

  render();
  // The first card is the one set up (the models page's order); Mac lists all four rows from the start
  void api.invoke('wallet:get').then(w => {
    if (!alive) return;
    vendor = w.order[0] ?? '';
    testText.textContent = '测试 Codex';
    if (document.documentElement.classList.contains('os-mac')) progress.el.append(testRow);
    void install();
  });
  return () => { alive = false; slotSize?.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); for (const off of offs) off(); };
}
