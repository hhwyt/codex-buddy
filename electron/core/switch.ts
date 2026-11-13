// The switch state machine: snapshot → backup → write a scratch home → 测试连通 → save, or roll back. Owner: A1.
// Invariant (M-07): a failed test leaves config.toml and auth.json byte for byte unchanged.
// Writes model_catalog_json with only this vendor's models (M-24) or removes it for OpenAI (M-26).
import { todo } from './todo';
import type { Cipher, CodexRunner, Emit, FileSystem, ModelEntry, ProviderInfo, TestResult } from './types';

export interface SwitchDeps {
  fs: FileSystem;
  cipher: Cipher;
  runCodex: CodexRunner;
  now: () => Date;
  /** Makes an empty scratch dir for the test home and returns its path */
  scratchDir: () => string;
  emit: Emit;
}

export interface SwitchRequest {
  /** Target CODEX_HOME: ~/.codex for 切换, ~/.codex-<name> for a clone */
  codexHome: string;
  backupRoot: string;
  provider: ProviderInfo;
  /** Base URL Codex should use: the vendor's own (responses) or the local bridge (chat) */
  baseUrl: string;
  model: string;
  models: ModelEntry[];
  /** Key to write into auth.json; null for the OpenAI official account */
  apiKey: string | null;
  /** Saved ChatGPT login (auth.json text) for switching back to OpenAI */
  openaiAuth?: string | null;
}

export interface SwitchResult extends TestResult {
  backupDir?: string;
  model?: string;
}

export async function switchVendor(_req: SwitchRequest, _deps: SwitchDeps): Promise<SwitchResult> {
  return todo('A1', 'switchVendor');
}

/** Lines of config.toml for this vendor (pure; used by switchVendor and clones) */
export function configFor(_lines: string[], _req: Omit<SwitchRequest, 'apiKey' | 'openaiAuth'>, _catalogPath: string | null): string[] {
  return todo('A1', 'configFor');
}
