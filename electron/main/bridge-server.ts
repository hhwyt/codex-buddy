// Local bridge: Responses API in (from Codex), Chat Completions out (to the vendor). Owner: A8.
// Listens on 127.0.0.1 only, random port; one route per vendor: http://127.0.0.1:<port>/<vendor>/v1/responses.
// The vendor key comes from auth.json via Codex's Authorization header and is passed through, never logged.
// Translation logic lives in core/bridge (pure, unit tested); this file is only the HTTP plumbing (R-01).
import { todo } from '../core/todo';

export interface BridgeServer {
  /** e.g. http://127.0.0.1:53121 */
  url: string;
  /** Base URL to write into config.toml for this vendor */
  baseUrlFor(vendor: string): string;
  close(): Promise<void>;
}

export async function startBridge(_upstreams: Record<string, string>): Promise<BridgeServer> {
  return todo('A8', 'startBridge');
}
