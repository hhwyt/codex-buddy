// 测试连通: Codex itself answers once with the new config in a scratch CODEX_HOME (was buddy.ts testHome). Owner: A1.
// The runner is injected (real CLI in the app, test/fakes/fake-codex.mjs in tests).
import type { CodexRunner, FailureCode, TestResult } from './types';

export const TEST_PROMPT = '只回复两个字：好了';
export const TEST_TIMEOUT_MS = 120_000;

const REASONS: Record<FailureCode, string> = {
  unreachable: '连不上这个地址：检查一下地址有没有写错，或者网络能不能打开它',
  timeout: '两分钟内没有回复，可能是网络连不上这个地址',
  balance: '账户余额不足：先去充值，再来切换',
  auth: 'Key 不对，或者没有权限用这个模型',
  'bad-reply': '对方没有正常回复：多半是 Key 不对，或者地址、模型名不对',
  model: '地址或模型名不对',
  'rate-limit': '对方说现在太忙（限速），过一会儿再试',
  network: '连不上这个地址，检查一下网络或地址',
  'no-reply': 'Codex 没有回复',
};
export const reasonOf = (code: FailureCode): string => REASONS[code];

/** Codex says "Reconnecting... waiting for network" while it cannot reach the address; twice is enough to know */
export const isUnreachable = (stderr: string): boolean => (stderr.match(/waiting for network/gi) ?? []).length >= 2;

/** Maps Codex's stderr to a failure code. Order matters: the most specific first */
export function classifyFailure(stderr: string, timedOut: boolean): FailureCode {
  if (isUnreachable(stderr)) return 'unreachable';
  if (timedOut) return 'timeout';
  if (/1113|余额|insufficient|balance|欠费|402/i.test(stderr)) return 'balance';
  if (/401|403|Unauthorized|invalid.{0,20}(key|token)|身份验证|令牌/i.test(stderr)) return 'auth';
  if (/stream (disconnected|closed) before/i.test(stderr)) return 'bad-reply';
  if (/404|not.found|model.{0,30}(exist|available|support)/i.test(stderr)) return 'model';
  if (/429|rate|overload|过载/i.test(stderr)) return 'rate-limit';
  if (/dns|resolve|connect|refused|timed out|tls|certificate/i.test(stderr)) return 'network';
  return 'no-reply';
}

/** The last non-empty stdout line is Codex's reply */
export const lastLine = (out: string): string | undefined => out.split(/\r?\n/).map(l => l.trim()).filter(Boolean).pop();

export async function testConnectivity(run: CodexRunner, codexHome: string, timeoutMs = TEST_TIMEOUT_MS): Promise<TestResult> {
  const { out, err, timedOut } = await run(['exec', '--ephemeral', '--skip-git-repo-check', TEST_PROMPT], { codexHome, timeoutMs, stopEarly: isUnreachable });
  const reply = lastLine(out);
  if (reply && !timedOut) return { ok: true, reply };
  const code = classifyFailure(err, timedOut);
  return { ok: false, code, reason: reasonOf(code) };
}
