// Shared domain types for electron/core. FROZEN by Base: change only through the integration agent.
// core/ is pure logic: it never imports electron and never touches real files or the network; everything is injected
// through the interfaces below, so unit tests run against in-memory fakes (coverage target 95%).

/** The 7 vendors, in the default card order (m1-decisions: DeepSeek, 智谱, Kimi, Qwen, MiniMax, 混元, OpenAI), plus
 *  user-added ones ("＋ 其他厂商") whose ids start with "custom-" */
export const VENDOR_IDS = ['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'] as const;
export type BuiltinVendorId = (typeof VENDOR_IDS)[number];
export type VendorId = BuiltinVendorId | `custom-${string}`;

/** One model in a vendor's menu. free = shown as「（免费）」, else「（付费）」 */
export interface ModelEntry {
  slug: string;
  name: string;
  free: boolean;
  /** Reasoning levels this model accepts in Codex's menu; [] when it has none */
  reasoning?: string[];
}

/** How Codex reaches the vendor. responses = Codex talks to it directly; chat = through our 127.0.0.1 bridge
 *  (Codex 0.166 rejects wire_api = "chat", see docs/spikes.md) */
export type WireApi = 'responses' | 'chat';

/** Static facts about one vendor (electron/core/providers.ts). Owner: A1 (data), A4 (URLs used by vendors/) */
export interface ProviderInfo {
  id: BuiltinVendorId;
  /** Card title as the user sees it */
  name: string;
  /** API base URL ending at /v1 (or the vendor's equivalent); Codex or the bridge appends /responses or /chat/completions */
  baseUrl: string;
  wireApi: WireApi;
  defaultModel: string;
  /** Built-in fallback menu; the live one comes from remote/config.json */
  models: ModelEntry[];
  loginUrl: string;
  keysUrl: string;
  /** Only vendors with paid models have a recharge page (「余额 · 去充值 ›」) */
  rechargeUrl: string | null;
  /** Hosts CodexBuddy itself may reach for this vendor (whitelist) */
  hosts: string[];
  /** OpenAI official account: login happens in the system browser through `codex login`, no key */
  officialAccount?: boolean;
}

/** One line of progress shown in the UI (the old STEP:<id>:<state>:<text> lines) */
export interface StepEvent {
  id: string;
  state: 'start' | 'done' | 'fail';
  text: string;
}
export type Emit = (event: StepEvent) => void;

/** Why a connectivity test failed, as a stable code the UI maps to its text */
export type FailureCode =
  | 'unreachable' | 'timeout' | 'balance' | 'auth' | 'bad-reply' | 'model' | 'rate-limit' | 'network' | 'no-reply';

export interface TestResult {
  ok: boolean;
  reply?: string;
  code?: FailureCode;
  /** User-facing reason (Chinese, no trailing punctuation) */
  reason?: string;
}

/** Everything core needs from the file system. Paths are absolute. Implemented by platform (real) and by tests
 *  (in-memory). Every removal goes through guard.ts, never through remove() directly from feature code */
export interface FileSystem {
  readText(file: string): string | null;
  writeText(file: string, text: string): void;
  readBytes(file: string): Uint8Array | null;
  writeBytes(file: string, data: Uint8Array): void;
  exists(file: string): boolean;
  mkdirp(dir: string): void;
  copy(from: string, to: string): void;
  list(dir: string): string[];
  /** Raw removal. Only guard.ts calls this */
  remove(target: string): void;
}

/** Encrypt / decrypt for secrets at rest (Electron safeStorage in the app; identity-like in tests) */
export interface Cipher {
  encrypt(text: string): Uint8Array;
  decrypt(data: Uint8Array): string;
}

/** Runs the Codex CLI once (real: platform spawns it; tests: test/fakes/fake-codex.mjs) */
export type CodexRunner = (args: string[], opts: { codexHome: string; timeoutMs: number; stopEarly?: (stderr: string) => boolean }) =>
  Promise<{ out: string; err: string; timedOut: boolean }>;

/** What the model page shows for one card */
export interface CardState {
  vendor: VendorId;
  /** Model currently chosen in Codex (follows Codex's own menu, M-28) */
  model: string | null;
  hasKey: boolean;
  /** Last 4 chars of the key, for「•••• 7c21」 */
  keyTail: string | null;
  /** Clone (分身) made for this vendor */
  cloneMade: boolean;
  hidden: boolean;
}

export interface WalletState {
  /** Card order, front first */
  order: VendorId[];
  /** The vendor Codex uses now, or null (M-01) */
  active: VendorId | null;
}

/** remote/config.json, read jsDelivr → GitHub → bundled fallback (core/remote.ts) */
export interface RemoteConfig {
  schema: 1;
  latest: { version: string; notes: string; macUrl: string; winUrl: string };
  models: Partial<Record<BuiltinVendorId, ModelEntry[]>>;
  community: { qrUrl: string; text: string };
  switches: { hiddenVendors: string[]; hideZh: boolean; hideClone: boolean };
}
