// Spawns the Codex CLI with CODEX_HOME set (was buddy.ts runCodex). Owner: Base; A2 / A3 reuse it.
// stdin is closed: `codex exec` otherwise waits for more input ("Reading additional input from stdin", spike (a)).
import { spawn } from 'node:child_process';
import type { CodexRunner } from '../core/types';

export function codexRunner(cli: string, killTree: (pid: number) => void = pid => { try { process.kill(pid); } catch { /* gone */ } }): CodexRunner {
  return (args, { codexHome, timeoutMs, stopEarly }) => new Promise(resolve => {
    const child = spawn(cli, args, { cwd: codexHome, env: { ...process.env, CODEX_HOME: codexHome }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false, stopped = false;
    child.stdout!.on('data', d => { out += d; });
    child.stderr!.on('data', d => {
      err += d;
      if (!stopped && stopEarly?.(err)) { stopped = true; killTree(child.pid!); }
    });
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid!); }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); resolve({ out, err: err + String(e), timedOut }); });
    // 'exit', not 'close': Codex starts a background git fetch that inherits its pipes and can outlive it
    child.on('exit', () => { clearTimeout(timer); setTimeout(() => resolve({ out, err, timedOut }), 100); });
  });
}
