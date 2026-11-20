// A-02..A-05 logic (electron/main/star-verify.ts) and the remote switch (A-01), with fake Codex runs, gh and browser.
import { describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateRemote } from '../../electron/core/remote';
import type { CodexRunner } from '../../electron/core/types';
import { ghStar, onRepoPage, REPO_URL, starInBrowser, STAR_CLICK_SCRIPT, VERIFY_PROMPT, verifyAnswer, type StarState } from '../../electron/main/star-verify';
import type { BrowserDriver } from '../../electron/vendors/types';

const bundledText = fs.readFileSync(path.join(__dirname, '..', '..', 'remote', 'config.json'), 'utf8');
const runner = (out: string, err = '', timedOut = false): CodexRunner & { args?: string[] } => {
  const r: CodexRunner & { args?: string[] } = async args => { r.args = args; return { out, err, timedOut }; };
  return r;
};

describe('A-01 签名配置开关', () => {
  test('A-01 starVerify 缺省是关；只有 true 才开；不是布尔值的配置整份不用', () => {
    const bundled = JSON.parse(bundledText);
    expect(validateRemote(bundledText)!.switches.starVerify).toBeUndefined();
    expect(validateRemote(JSON.stringify({ ...bundled, switches: { ...bundled.switches, starVerify: true } }))!.switches.starVerify).toBe(true);
    expect(validateRemote(JSON.stringify({ ...bundled, switches: { ...bundled.switches, starVerify: false } }))!.switches.starVerify).toBeUndefined();
    expect(validateRemote(JSON.stringify({ ...bundled, switches: { ...bundled.switches, starVerify: 'yes' } }))).toBeNull();
  });
});

describe('A-02 验证', () => {
  test('A-02 用 codex exec 问一次本项目地址，回答里有地址算通过', async () => {
    const run = runner(`${REPO_URL}\n`);
    expect(await verifyAnswer(run, '/h/.codex', 'DeepSeek')).toEqual({ ok: true, answer: REPO_URL });
    expect(run.args).toEqual(['exec', '--ephemeral', '--skip-git-repo-check', VERIFY_PROMPT]);
    expect(VERIFY_PROMPT).toContain('CodexBuddy 的 GitHub 地址是什么？只回答网址');
    expect((await verifyAnswer(runner(`地址是 <${REPO_URL}>`), '/h', 'Kimi')).ok).toBe(true);
  });

  test('A-02 失败各有一句原因', async () => {
    const cases: [ReturnType<typeof runner>, string][] = [
      [runner('我不知道'), 'DeepSeek 回答了，但没答出地址'],
      [runner('', 'ERROR: unexpected status 401 Unauthorized'), 'DeepSeek 说 Key 不对'],
      [runner('', 'Reconnecting... waiting for network\nReconnecting... waiting for network'), '连不上 DeepSeek，可能是网络问题'],
      [runner('', '', true), '连不上 DeepSeek，可能是网络问题'],
      [runner('', 'unexpected status 402: insufficient balance'), 'DeepSeek 余额不足'],
      [runner('', 'thread panicked'), 'Codex 没有回复'],
    ];
    for (const [run, reason] of cases) expect(await verifyAnswer(run, '/h', 'DeepSeek')).toEqual({ ok: false, reason });
  });
});

describe('A-03 打开页面', () => {
  test('A-03 只有本项目的页面算打开了', () => {
    expect(onRepoPage(REPO_URL)).toBe(true);
    expect(onRepoPage(`${REPO_URL}?tab=readme`)).toBe(true);
    expect(onRepoPage(`${REPO_URL}-releases`)).toBe(false);
    expect(onRepoPage('chrome-error://chromewebdata/')).toBe(false);
    expect(onRepoPage('https://github.com/login')).toBe(false);
  });
});

describe('A-05 点 Star', () => {
  test('A-05 gh 已登录：没点过就 PUT，点过就不重复；没登录或没装 gh 返回 null', async () => {
    const calls: string[] = [];
    const gh = (starred: boolean, loggedIn = true) => async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args].join(' '));
      if (cmd === 'missing') throw new Error('ENOENT');
      if (args[0] === 'auth' && !loggedIn) throw new Error('not logged in');
      if (args[0] === 'api' && args.length === 2 && !starred) throw new Error('404');
      return '';
    };
    expect(await ghStar(gh(false), ['missing', 'gh'])).toBe('starred');
    expect(calls).toEqual(['missing auth status', 'gh auth status', 'gh api /user/starred/hhwyt/codex-buddy', 'gh api -X PUT /user/starred/hhwyt/codex-buddy']);
    calls.length = 0;
    expect(await ghStar(gh(true), ['gh'])).toBe('already');
    expect(calls.some(c => c.includes('PUT'))).toBe(false);
    expect(await ghStar(gh(false, false), ['gh'])).toBeNull();
  });

  /** A GitHub page in the right-side browser: signed in or not, starred or not */
  function fakeGithub(o: { login: boolean; starred: boolean; signInOk?: boolean }) {
    const opens: string[] = [];
    let url = '';
    const b: BrowserDriver = {
      open: async u => { opens.push(u); url = u; },
      url: () => url,
      evaluate: async <T,>(script: string) => {
        if (script === STAR_CLICK_SCRIPT) { if (!o.login) return false as T; o.starred = true; return true as T; }
        return { ready: true, login: o.login, starred: o.starred, button: o.login && !o.starred } satisfies StarState as T;
      },
      waitForResponse: async () => '',
      waitForUrl: async pred => {
        if (o.signInOk === false) return false;
        o.login = true;
        url = REPO_URL;
        return pred(url);
      },
      setMode: () => {},
      hasCookie: async () => false,
    };
    return { b, opens, state: o };
  }
  const noWait = { sleep: async () => {} };

  test('A-05 右侧浏览器已登录：打开本项目页面，点 Star', async () => {
    const g = fakeGithub({ login: true, starred: false });
    expect(await starInBrowser(g.b, noWait)).toEqual({ ok: true, already: false });
    expect(g.opens).toEqual([REPO_URL]);
    expect(g.state.starred).toBe(true);
  });

  test('A-05 之前点过：不重复点', async () => {
    const g = fakeGithub({ login: true, starred: true });
    expect(await starInBrowser(g.b, noWait)).toEqual({ ok: true, already: true });
  });

  test('A-05 没登录：先停在 GitHub 登录页，用户登录回到本项目后再点', async () => {
    const g = fakeGithub({ login: false, starred: false });
    expect(await starInBrowser(g.b, noWait)).toEqual({ ok: true, already: false });
    expect(g.opens).toEqual([REPO_URL, 'https://github.com/login?return_to=%2Fhhwyt%2Fcodex-buddy']);
  });

  test('A-05 没登录、用户关了浏览器：不点，算取消', async () => {
    const g = fakeGithub({ login: false, starred: false, signInOk: false });
    expect(await starInBrowser(g.b, noWait)).toEqual({ ok: false, kind: 'cancelled', reason: '没登录 GitHub' });
    expect(g.state.starred).toBe(false);
  });
});
