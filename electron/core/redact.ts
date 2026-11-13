// Key redaction (was buddy.ts hide). Owner: A1. Anything that could carry a key passes through hide() before it
// reaches a log line, the page, a snapshot or a copied log (S-08).

const PATTERNS: [RegExp, string][] = [
  // Zhipu style: 32 hex + . + 16 chars
  [/[0-9a-f]{32}\.[A-Za-z0-9]{16}/g, '****'],
  // sk-..., Bearer ..., "OPENAI_API_KEY":"..."
  [/(sk-|Bearer\s+|"OPENAI_API_KEY"\s*:\s*")[A-Za-z0-9._-]{6,}/g, '$1****'],
  // OAuth tokens in auth.json
  [/("(access|refresh|id)_token"\s*:\s*")[^"]+/g, '$1****'],
  // api_key = "..." / apiKey: "..." / x-api-key: ...
  [/((?:api[_-]?key|x-api-key)["']?\s*[:=]\s*["']?)[A-Za-z0-9._-]{6,}/gi, '$1****'],
];

export function hide(text: string): string {
  let out = text;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}

/** 「•••• 7c21」: the only form a key ever takes on screen */
export function keyTail(key: string | null | undefined): string | null {
  if (!key || key.length < 8) return null;
  return key.slice(-4);
}

/** True when text still contains something that looks like a full key (used by S-08 scans in tests) */
export function looksLikeKey(text: string): boolean {
  return /sk-[A-Za-z0-9._-]{12,}|[0-9a-f]{32}\.[A-Za-z0-9]{16}/.test(text);
}
