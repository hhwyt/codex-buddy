// The check after the first install and the 「给 CodexBuddy 点个 Star」 box (A-01..A-05, design/star-verify/a2.html, b2.html).
// Electron-free: services.ts wires it to Codex, the right-side browser and the gh command.
//   verify     Codex, with the vendor just set up in ~/.codex, answers the project's GitHub address once
//   star       only after the user ticked the box: gh when it is signed in, else the Star button on the GitHub page in
//              the right-side browser (the user signs in there first when needed). Already starred → nothing to do
import { classifyFailure, isUnreachable, TEST_TIMEOUT_MS } from '../core/connectivity';
import type { CodexRunner } from '../core/types';
import type { BrowserDriver } from '../vendors/types';
import type { CommandRunner } from '../platform/clone-mac';

export const REPO_URL = 'https://github.com/hhwyt/codex-buddy';
const REPO_PATH = new URL(REPO_URL).pathname;
/** The model cannot know a project this new: it is told the address and asked to give it back */
export const VERIFY_PROMPT = `CodexBuddy 的 GitHub 地址是 ${REPO_URL} 。请回答：CodexBuddy 的 GitHub 地址是什么？只回答网址`;

export type VerifyResult = { ok: true; answer: string } | { ok: false; reason: string };

export async function verifyAnswer(run: CodexRunner, codexHome: string, vendorName: string, timeoutMs = TEST_TIMEOUT_MS): Promise<VerifyResult> {
  const { out, err, timedOut } = await run(['exec', '--ephemeral', '--skip-git-repo-check', VERIFY_PROMPT], { codexHome, timeoutMs, stopEarly: isUnreachable });
  const answer = out.trim();
  if (answer.toLowerCase().includes(REPO_URL)) return { ok: true, answer: REPO_URL };
  if (answer && !timedOut) return { ok: false, reason: `${vendorName} 回答了，但没答出地址` };
  const code = classifyFailure(err, timedOut);
  if (code === 'auth') return { ok: false, reason: `${vendorName} 说 Key 不对` };
  if (code === 'balance') return { ok: false, reason: `${vendorName} 余额不足` };
  if (code === 'rate-limit') return { ok: false, reason: `${vendorName} 现在太忙，过一会儿再试` };
  if (code === 'model') return { ok: false, reason: `${vendorName} 说没有这个模型` };
  if (code === 'no-reply') return { ok: false, reason: 'Codex 没有回复' };
  return { ok: false, reason: `连不上 ${vendorName}，可能是网络问题` };
}

/** Whether the right-side browser shows the project's page (not an error page or another site) */
export const onRepoPage = (url: string) => url === REPO_URL || url.startsWith(`${REPO_URL}/`) || url.startsWith(`${REPO_URL}?`) || url.startsWith(`${REPO_URL}#`);

// ---------- gh ----------

/** Where gh may be: on PATH, or where its installers put it (a Mac app does not get the shell's PATH) */
export const GH_CANDIDATES: Record<'mac' | 'win', string[]> = {
  mac: ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'],
  win: ['gh', 'C:\\Program Files\\GitHub CLI\\gh.exe'],
};

/** 'already' / 'starred' through the user's signed-in gh; null when gh is missing, signed out or failed */
export async function ghStar(run: CommandRunner, candidates: string[]): Promise<'starred' | 'already' | null> {
  for (const gh of candidates) {
    try { await run(gh, ['auth', 'status']); } catch { continue; }
    try {
      // 204 when starred, 404 (a failed command) when not
      await run(gh, ['api', `/user/starred${REPO_PATH}`]);
      return 'already';
    } catch { /* not starred yet */ }
    try {
      await run(gh, ['api', '-X', 'PUT', `/user/starred${REPO_PATH}`]);
      return 'starred';
    } catch { return null; }
  }
  return null;
}

// ---------- the GitHub page ----------

/** Signed in (GitHub puts the login in a meta tag) and starred (the visible form is the unstar one) */
export const STAR_STATE_SCRIPT = `(() => {
  const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  const forms = sel => [...document.querySelectorAll(sel)].filter(f => (f.getAttribute('action') || '').endsWith(sel.includes('unstar') ? '${REPO_PATH}/unstar' : '${REPO_PATH}/star'));
  return {
    ready: document.readyState === 'complete',
    login: !!(document.querySelector('meta[name="user-login"]')?.getAttribute('content')),
    starred: forms('form[action$="/unstar"]').some(shown),
    button: forms('form[action$="/star"]').some(shown),
  };
})()`;
/** Clicks the visible Star button, the same one the user would click */
export const STAR_CLICK_SCRIPT = `(() => {
  const f = [...document.querySelectorAll('form[action$="${REPO_PATH}/star"]')].find(f => getComputedStyle(f).display !== 'none' && f.getClientRects().length > 0);
  const b = f && f.querySelector('button');
  if (!b) return false;
  b.click();
  return true;
})()`;

export interface StarState { ready: boolean; login: boolean; starred: boolean; button: boolean }
export type StarResult = { ok: true; already: boolean } | { ok: false; kind?: 'cancelled'; reason: string };

/** How long the user has to sign in to GitHub on the right */
export const GITHUB_LOGIN_MS = 10 * 60_000;

export async function starInBrowser(b: BrowserDriver, opts: { sleep?: (ms: number) => Promise<void>; loginMs?: number } = {}): Promise<StarResult> {
  const sleep = opts.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  const state = async (until: (s: StarState) => boolean, tries = 20): Promise<StarState | null> => {
    let last: StarState | null = null;
    for (let i = 0; i < tries; i++) {
      try { last = await b.evaluate<StarState>(STAR_STATE_SCRIPT); } catch { last = null; }
      if (last && until(last)) return last;
      await sleep(500);
    }
    return last;
  };
  const settled = (s: StarState) => s.ready && (s.starred || s.button || !s.login);
  if (!onRepoPage(b.url())) await b.open(REPO_URL, { mode: 'expanded' });
  let s = await state(settled);
  if (!s) return { ok: false, reason: 'GitHub 没打开，可能是网络问题' };
  if (s.starred) return { ok: true, already: true };
  if (!s.login) {
    // The user signs in on GitHub's own page; GitHub brings them back to the project, where the star is clicked
    b.setMode('expanded');
    await b.open(`https://github.com/login?return_to=${encodeURIComponent(REPO_PATH)}`, { mode: 'expanded' });
    if (!(await b.waitForUrl(onRepoPage, opts.loginMs ?? GITHUB_LOGIN_MS))) return { ok: false, kind: 'cancelled', reason: '没登录 GitHub' };
    s = await state(settled);
    if (!s?.login) return { ok: false, kind: 'cancelled', reason: '没登录 GitHub' };
    if (s.starred) return { ok: true, already: true };
  }
  if (!(await b.evaluate<boolean>(STAR_CLICK_SCRIPT).catch(() => false))) return { ok: false, reason: '没找到 Star 按钮，可以在右边自己点' };
  return (await state(x => x.starred))?.starred ? { ok: true, already: false } : { ok: false, reason: '没点上，可以在右边自己点' };
}
