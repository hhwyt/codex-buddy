// ALL IPC between the page and the main process. FROZEN by Base; changes go through the integration agent.
// This file is shared by electron/ (CommonJS) and ui/ (ES modules): types and plain constants only, no imports
// of node or electron. The page reaches the main process ONLY through window.buddy (electron/preload.ts):
//   window.buddy.invoke(channel, args)  → Promise<result>      (channels below)
//   window.buddy.on(event, fn)          → unsubscribe function (events below)
// Keys never cross this boundary: the page sees keyTail (last 4 chars) only (S-01, S-08).

export type VendorKey = string; // BuiltinVendorId | `custom-${string}`

export interface CardView {
  vendor: VendorKey;
  name: string;
  /** Model chosen in Codex now (display only, M-28); null before first use */
  model: string | null;
  /** Free model in use (no recharge entry, M-11) */
  free: boolean;
  /** Has paid models → shows「余额 · 去充值 ›」when front (M-18) */
  paid: boolean;
  keyTail: string | null;
  cloneMade: boolean;
  /** Short status line on the card (e.g. 限速 M-14), null when nothing to say */
  note: string | null;
}

export interface WalletView {
  order: VendorKey[];
  active: VendorKey | null;
  cards: CardView[];
  mode: 'switch' | 'clone';
}

export interface AppStateView {
  versionStatus?: VersionStatus;
  version: string;
  os: 'mac' | 'win';
  /** true → skip onboarding, open the model page (O-06) */
  configured: boolean;
  codexInstalled: boolean;
  codexRunning: boolean;
  restartRequired?: boolean;
  zh: { on: boolean; launcherExists: boolean; supported: boolean; hidden: boolean };
  community: { qrUrl: string | null }; // H-02
  /** Forced upgrade (remote minVersion): non-null → the page blocks everything until the user updates. Codex is not affected */
  upgradeRequired: UpgradeRequiredView | null;
}

/** The release to install before CodexBuddy can be used again; url = the download for this OS */
export interface UpgradeRequiredView { version: string; notes: string; url: string }
export type VersionStatus = 'checking' | 'offline' | 'allowed';

export interface StepView { flow: 'install' | 'switch' | 'clone' | 'zh' | 'restore' | 'update' | 'upgrade' | 'repair'; id: string; state: 'start' | 'done' | 'fail'; text: string }
export interface Outcome { ok: boolean; reason?: string; restartRequired?: boolean; openRequired?: boolean; [extra: string]: unknown }
export type NetworkState = 'checking' | 'online' | 'offline';

/** invoke channels: name → [args, result] */
export interface IpcChannels {
  'network:check': [void, Outcome];
  'network:offline': [void, void];
  'app:quit': [void, void];
  'app:state': [void, AppStateView];
  'install:run': [void, Outcome];                                   // O-01..O-03, O-07, O-08
  'install:log': [void, { text: string }];                           // O-04 (already redacted)
  'wallet:get': [void, WalletView];                                  // M-01, M-23
  'wallet:reorder': [{ order: VendorKey[] }, void];                  // M-05
  'wallet:mode': [{ mode: 'switch' | 'clone' }, void];               // C-09
  'switch:start': [{ vendor: VendorKey }, Outcome & { seconds?: number; firstTime?: boolean; running?: boolean }]; // M-02..M-16, M-20, M-21
  'switch:cancel': [void, void];                                     // M-09
  'key:replace': [{ vendor: VendorKey }, Outcome];                   // M-17
  'key:paste': [{ vendor: VendorKey; key: string }, Outcome];        // key ladder level 3
  'recharge:open': [{ vendor: VendorKey }, Outcome];                 // M-13, M-18
  'custom:add': [{ name: string; baseUrl: string; model: string; apiKey: string }, Outcome]; // M-19
  'codex:open': [{ vendor?: VendorKey }, Outcome];                   // M-20
  'codex:restart': [void, Outcome];                                  // M-21, L-05: user-confirmed restart
  'codex:repair': [void, Outcome];                                   // M-15
  'codex:reinstall': [void, Outcome];                                // M-16
  'clone:make': [{ vendor: VendorKey }, Outcome];                    // C-01, C-05, C-06, C-08
  'clone:open': [{ vendor: VendorKey }, Outcome];                    // C-02, C-03
  'clone:remove': [{ vendor: VendorKey }, Outcome];                  // C-07
  'zh:set': [{ on: boolean }, Outcome & { needsReopen?: boolean }];  // L-02, L-03, L-05, L-06, L-07
  'zh:remove': [void, Outcome];                                      // L-04
  'browser:show': [{ mode: 'pip' | 'expanded' }, void];              // B-01..B-03
  'browser:close': [void, void];                                     // B-04, M-09
  'browser:back': [void, void];                                      // B-05
  'browser:reload': [void, void];                                    // B-05
  'security:get': [void, { keys: { vendor: VendorKey; name: string; keyTail: string; file: string }[]; app: ConnectionView[]; web: ConnectionView[] }]; // S-01, S-04
  'security:reveal': [{ vendor: VendorKey }, void];                  // S-02
  'security:manage': [{ vendor: VendorKey }, void];                  // S-03
  'security:ask-ai': [void, { text: string }];                       // S-06
  'security:source': [void, void];                                   // S-07
  'update:check': [void, { kind: 'new'; version: string; notes: string } | { kind: 'latest' } | { kind: 'offline' }]; // T-02
  'update:dismiss': [{ version: string }, void];                     // U-01
  'update:install': [void, Outcome];                                 // U-02, U-03
  'upgrade:run': [void, Outcome];                                    // forced upgrade: download the required version, then Mac opens the dmg / Windows runs the installer and quits
  'restore:plan': [void, { lines: string[] }];                       // T-03
  'restore:run': [void, Outcome];                                    // T-04, C-10
  'shell:open-external': [{ url: string }, void];
}

export interface ConnectionView { host: string; allowed: boolean; at: number }

/** main → page events */
export interface IpcEvents {
  network: NetworkState;
  restartRequired: boolean;
  versionStatus: VersionStatus;
  step: StepView;
  wallet: WalletView;                       // M-28: model changed inside Codex
  /** width: px the expanded browser takes at the window's right edge (0 when closed or in the small window) */
  browser: { open: boolean; mode: 'pip' | 'expanded'; url: string; canGoBack: boolean; width: number };
  connections: { app: ConnectionView[]; web: ConnectionView[] };
  update: { version: string; notes: string }; // U-01
  upgradeRequired: UpgradeRequiredView | null; // forced upgrade changed after a remote config refresh
}

export type Channel = keyof IpcChannels;
export type EventName = keyof IpcEvents;
export type ArgsOf<C extends Channel> = IpcChannels[C][0];
export type ResultOf<C extends Channel> = IpcChannels[C][1];

/** The object preload exposes as window.buddy */
export interface BuddyApi {
  invoke<C extends Channel>(channel: C, ...args: ArgsOf<C> extends void ? [] : [ArgsOf<C>]): Promise<ResultOf<C>>;
  on<E extends EventName>(event: E, fn: (payload: IpcEvents[E]) => void): () => void;
}

/** Every channel name, for preload's allowlist and the contract test */
export const CHANNELS: Channel[] = [
  'network:check', 'network:offline', 'app:quit',
  'app:state', 'install:run', 'install:log', 'wallet:get', 'wallet:reorder', 'wallet:mode', 'switch:start', 'switch:cancel',
  'key:replace', 'key:paste', 'recharge:open', 'custom:add', 'codex:open', 'codex:restart', 'codex:repair', 'codex:reinstall',
  'clone:make', 'clone:open', 'clone:remove', 'zh:set', 'zh:remove', 'browser:show', 'browser:close', 'browser:back',
  'browser:reload', 'security:get', 'security:reveal', 'security:manage', 'security:ask-ai', 'security:source',
  'update:check', 'update:dismiss', 'update:install', 'upgrade:run', 'restore:plan', 'restore:run', 'shell:open-external',
];
export const EVENTS: EventName[] = ['step', 'wallet', 'browser', 'connections', 'update', 'upgradeRequired', 'restartRequired', 'network', 'versionStatus'];
export const NETWORK_READ_CHANNELS: Channel[] = ['app:state', 'wallet:get', 'install:log', 'security:get', 'security:ask-ai', 'restore:plan'];
