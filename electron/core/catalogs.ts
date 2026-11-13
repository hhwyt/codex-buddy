// Model menu (model_catalog_json). Owner: A1.
// Rule (m1-decisions): after switching to a vendor, Codex's model menu lists ONLY that vendor's models, all of them,
// each labelled「（免费）」or「（付费）」. Switching back to OpenAI removes model_catalog_json (Codex's own list returns).
// Spike (a) confirmed Codex 0.166 reads this file: `codex debug models` shows exactly its entries.
// Base implements the line edits; A1 completes buildCatalog's per-model fields (copy the shape Codex's own
// `codex debug models` prints; see docs/spikes.md for the full key list).
import { setConfig, tomlString } from './toml';
import type { ModelEntry } from './types';

export const CATALOG_FILE = 'codexbuddy-models.json';

export const labelOf = (m: ModelEntry): string => `${m.name}（${m.free ? '免费' : '付费'}）`;

/** The JSON Codex reads from model_catalog_json: { models: [...] } */
export function buildCatalog(models: ModelEntry[]): { models: Record<string, unknown>[] } {
  return {
    models: models.map((m, i) => ({
      slug: m.slug,
      display_name: labelOf(m),
      description: labelOf(m),
      default_reasoning_level: m.reasoning?.[0] ?? null,
      supported_reasoning_levels: (m.reasoning ?? []).map(effort => ({ effort, description: effort })),
      shell_type: 'default',
      visibility: 'list',
      supported_in_api: true,
      priority: i,
      // TODO(A1): fill the remaining keys Codex 0.166 expects (see docs/spikes.md (a)); a minimal copy of the gpt-5.5
      // entry with slug/display_name replaced was verified to work
    })),
  };
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
