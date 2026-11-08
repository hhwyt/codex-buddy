// Shared by backend.ts and app.ts (both are plain page scripts, loaded in order by index.html)
type BuddyResult = { ok: boolean; reason?: string; [key: string]: any };
type ScriptLine = { kind: string; line: string };
type LoginRect = { x: number; y: number; w: number; h: number };

/** What the page can ask for: the same in the app and in the browser preview (mock) */
interface BuddyBackend {
  mock: boolean;
  onLine(fn: (payload: ScriptLine) => void): void;
  runInstall(): Promise<{ code: number }>;
  buddy(action: string, args?: Record<string, unknown>): Promise<BuddyResult>;
  showLogin(rect: LoginRect): Promise<void>;
  hideLogin(): Promise<void>;
  openUrl(url: string): Promise<void>;
}

/** Exposed by the Electron preload (electron/preload.ts); absent in a plain browser */
interface BuddyNative {
  runInstall(): Promise<{ code: number }>;
  buddy(action: string, args?: Record<string, unknown>): Promise<BuddyResult>;
  showLogin(rect: LoginRect): Promise<void>;
  hideLogin(): Promise<void>;
  openUrl(url: string): Promise<void>;
  onLine(fn: (payload: ScriptLine) => void): void;
}

interface Window {
  buddyNative?: BuddyNative;
  Backend: BuddyBackend;
}
