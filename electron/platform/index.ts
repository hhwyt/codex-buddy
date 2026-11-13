// Picks the platform: sandbox when CODEXBUDDY_SANDBOX is set (tests, e2e), else by OS. Owner: Base.
import { createMacPlatform, macPaths } from './mac';
import { sandboxPaths, sandboxRoot } from './sandbox';
import { createWinPlatform, winPaths } from './win';
import type { Platform } from './types';

export function pickPlatform(env: NodeJS.ProcessEnv = process.env, osName: NodeJS.Platform = process.platform): Platform {
  const root = sandboxRoot(env);
  const isWin = osName === 'win32';
  if (root) {
    const paths = sandboxPaths(root, isWin ? 'win' : 'mac');
    return isWin ? createWinPlatform(paths) : createMacPlatform(paths);
  }
  return isWin ? createWinPlatform(winPaths()) : createMacPlatform(macPaths());
}
