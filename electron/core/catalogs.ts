// Model menu (model_catalog_json). Owner: A1.
// Rule (m1-decisions): after switching to a vendor, Codex's model menu lists ONLY that vendor's models, all of them,
// each labelled「（免费）」or「（付费）」. Switching back to OpenAI removes model_catalog_json (Codex's own list returns).
// Spike (a) confirmed Codex 0.166 reads this file: `codex debug models` shows exactly its entries.
import { setConfig, tomlString } from './toml';
import type { ModelEntry, ProviderInfo, RemoteConfig } from './types';

export const CATALOG_FILE = 'codexbuddy-models.json';

export const labelOf = (m: ModelEntry): string => `${m.name}（${m.free ? '免费' : '付费'}）`;

/** Instructions Codex sends as the system prompt for our models (Codex refuses a catalog entry without them) */
export const BASE_INSTRUCTIONS = [
  'You are Codex, a coding agent working in the user\'s project folder.',
  'Read the relevant files before changing them, make the smallest change that solves the task, and run the project\'s',
  'checks when there are any. Use the tools you are given to read files, edit files and run commands. Explain briefly what',
  'you changed. Answer in the language the user writes in.',
].join(' ');

/** The JSON Codex reads from model_catalog_json: { models: [...] }. Keys follow `codex debug models` of Codex 0.166;
 *  the ones without a default there (support_verbosity, truncation_policy, experimental_supported_tools, and
 *  base_instructions) are required, verified with the real CLI */
export function buildCatalog(models: ModelEntry[]): { models: Record<string, unknown>[] } {
  return {
    models: models.map((m, i) => {
      const levels = m.reasoning ?? [];
      return {
        slug: m.slug,
        display_name: labelOf(m),
        description: labelOf(m),
        default_reasoning_level: levels.length ? (levels.includes('medium') ? 'medium' : levels[0]) : null,
        supported_reasoning_levels: levels.map(effort => ({ effort, description: effort })),
        shell_type: 'default',
        visibility: 'list',
        supported_in_api: true,
        priority: i,
        base_instructions: BASE_INSTRUCTIONS,
        support_verbosity: false,
        truncation_policy: { mode: 'tokens', limit: 10000 },
        experimental_supported_tools: [],
        input_modalities: ['text'],
        context_window: 128000,
        supports_reasoning_effort_updates: false,
      };
    }),
  };
}

/** The model menu for a vendor: the remote list when it has a usable one, else the built-in fallback */
export function modelsFor(provider: ProviderInfo, remote: RemoteConfig | null): ModelEntry[] {
  const live = remote?.models[provider.id];
  return live && live.length ? live : provider.models;
}

/** config.toml lines with model_catalog_json pointing at catalogPath (null = remove the line, back to Codex's list) */
export function setCatalogLine(lines: string[], catalogPath: string | null): string[] {
  return setConfig(lines, { model_catalog_json: catalogPath ? `model_catalog_json = ${tomlString(catalogPath)}` : null }, {});
}

/** Slugs listed in a catalog file's text, [] when unreadable (M-24 checks: only this vendor's models) */
export function catalogSlugs(text: string | null): string[] {
  try {
    const parsed = JSON.parse(text ?? '');
    return Array.isArray(parsed?.models) ? parsed.models.map((m: { slug?: string }) => String(m.slug)) : [];
  } catch {
    return [];
  }
}
