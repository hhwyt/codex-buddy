// The switch state machine: backup → write config → save, or roll back. Owner: A1.
// No connectivity test since 11-16 (站主: the user checks it in Codex); a failed save puts the old files back.
// Writes model_catalog_json with only this vendor's models (M-24) or removes it for OpenAI (M-26).
import { backup } from './backup';
import { buildCatalog, CATALOG_FILE } from './catalogs';
import { PROVIDERS } from './providers';
import { getValue, joinLines, setConfig, splitLines, tomlString } from './toml';
import type { Cipher, CodexRunner, Emit, FileSystem, ModelEntry, ProviderInfo, TestResult } from './types';

export interface SwitchDeps {
  fs: FileSystem;
  cipher: Cipher;
  runCodex: CodexRunner;
  now: () => Date;
  /** Makes an empty scratch dir for the test home and returns its path (the caller cleans it up) */
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

/** auth.json for a key: Codex reads OPENAI_API_KEY when the provider has requires_openai_auth = true */
export const authJson = (key: string): string => `${JSON.stringify({ OPENAI_API_KEY: key })}\n`;

/** The model we write: the asked one when it is on the menu, else the vendor's default, else the first on the menu */
export function pickModel(req: Pick<SwitchRequest, 'provider' | 'model' | 'models'>): string {
  const slugs = req.models.map(m => m.slug);
  if (slugs.includes(req.model)) return req.model;
  if (slugs.includes(req.provider.defaultModel)) return req.provider.defaultModel;
  return slugs[0] ?? req.model;
}

const providerTable = (id: string) => `model_providers.${id}`;
/** Our provider tables for every built-in vendor set to null: only the current vendor's table stays */
const dropAllTables = (): Record<string, string[] | null> =>
  Object.fromEntries(PROVIDERS.filter(p => !p.officialAccount).map(p => [providerTable(p.id), null]));

/** Lines of config.toml for this vendor (pure; used by switchVendor and clones) */
export function configFor(lines: string[], req: Omit<SwitchRequest, 'apiKey' | 'openaiAuth'>, catalogPath: string | null): string[] {
  const p = req.provider;
  if (p.officialAccount) {
    return setConfig(lines, { model_provider: null, model: null, model_catalog_json: null }, dropAllTables());
  }
  const model = pickModel(req);
  return setConfig(
    lines,
    {
      model_provider: `model_provider = ${tomlString(p.id)}`,
      model: `model = ${tomlString(model)}`,
      model_catalog_json: catalogPath ? `model_catalog_json = ${tomlString(catalogPath)}` : null,
    },
    {
      ...dropAllTables(),
      [providerTable(p.id)]: [
        `name = ${tomlString(p.name)}`,
        `base_url = ${tomlString(req.baseUrl)}`,
        // Codex 0.166 only speaks Responses; chat-only vendors are reached through the local bridge (A8)
        'wire_api = "responses"',
        'requires_openai_auth = true',
      ],
    },
  );
}

/** What Codex uses now, read from config.toml (M-28: the card follows the model chosen inside Codex) */
export function readActive(configText: string | null): { provider: string | null; model: string | null } {
  const lines = splitLines(configText);
  return { provider: getValue(lines, '', 'model_provider'), model: getValue(lines, '', 'model') };
}

export async function switchVendor(req: SwitchRequest, deps: SwitchDeps): Promise<SwitchResult> {
  const { fs, emit } = deps;
  const official = !!req.provider.officialAccount;
  const configPath = `${req.codexHome}/config.toml`;
  const authPath = `${req.codexHome}/auth.json`;
  const catalogPath = `${req.codexHome}/${CATALOG_FILE}`;
  const fail = (id: string, r: TestResult, extra: Partial<SwitchResult> = {}): SwitchResult => {
    emit({ id, state: 'fail', text: r.reason! });
    return { ...r, ok: false, ...extra };
  };

  const auth = official ? (req.openaiAuth ?? null) : req.apiKey ? authJson(req.apiKey) : null;
  if (!auth) return fail('write', { ok: false, reason: official ? '还没有登录 OpenAI 账号' : '还没有这一家的 Key' });
  if (!official && !req.models.length) return fail('write', { ok: false, reason: '这一家的模型清单是空的' });

  emit({ id: 'backup', state: 'start', text: '备份现在的配置' });
  const backupDir = backup(fs, deps.cipher, { codexHome: req.codexHome, backupRoot: req.backupRoot }, req.provider.id, deps.now());
  emit({ id: 'backup', state: 'done', text: '已备份' });

  emit({ id: 'write', state: 'start', text: '准备新配置' });
  const oldConfig = fs.readText(configPath);
  const oldAuth = fs.readText(authPath);
  const oldCatalog = fs.readText(catalogPath);
  const lines = splitLines(oldConfig);
  const model = official ? '' : pickModel(req);
  const catalog = official ? null : `${JSON.stringify(buildCatalog(req.models), null, 2)}\n`;
  emit({ id: 'write', state: 'done', text: '新配置准备好了' });

  // No 测试连通 (站主 11-16: 「不要验证了，让用户手动在 ChatGPT 验证」): the config is saved as is
  emit({ id: 'save', state: 'start', text: '保存' });
  try {
    if (catalog) fs.writeText(catalogPath, catalog);
    fs.writeText(authPath, auth);
    fs.writeText(configPath, joinLines(configFor(lines, req, catalog ? catalogPath : null)));
  } catch {
    // Put back what was there; a file that did not exist before cannot be removed here (guard.ts protects codexHome),
    // and without a config line pointing at it a leftover menu file does nothing
    for (const [file, text] of [[configPath, oldConfig], [authPath, oldAuth], [catalogPath, oldCatalog]] as const) {
      try { if (text !== null) fs.writeText(file, text); } catch { /* best effort */ }
    }
    return fail('save', { ok: false, reason: '保存没成功，配置已经退回原样' }, { backupDir });
  }
  emit({ id: 'save', state: 'done', text: '已保存' });
  return { ok: true, backupDir, model: model || undefined };
}
