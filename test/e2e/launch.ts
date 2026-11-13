// Launch CodexBuddy sandboxed with fake servers. Owner: Base; used by every e2e spec.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { startVendorServer } from '../fakes/vendor-server.mjs';
import { startConfigServer } from '../fakes/config-server.mjs';

export interface Launched {
  app: ElectronApplication;
  page: Page;
  sandbox: string;
  vendors: Awaited<ReturnType<typeof startVendorServer>>;
  config: Awaited<ReturnType<typeof startConfigServer>>;
  close(): Promise<void>;
}

export async function launch(extraEnv: Record<string, string> = {}): Promise<Launched> {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbuddy-e2e-'));
  const vendors = await startVendorServer();
  const config = await startConfigServer();
  const endpoints = {
    remoteConfig: [config.jsdelivrUrl, config.githubUrl],
    vendors: Object.fromEntries(['deepseek', 'zhipu', 'kimi', 'qwen', 'minimax', 'hunyuan', 'openai'].map(v => [v, vendors.vendorUrl(v)])),
  };
  const app = await electron.launch({
    args: [path.join(__dirname, '..', '..')],
    env: { ...process.env, CODEXBUDDY_SANDBOX: sandbox, CODEXBUDDY_ENDPOINTS: JSON.stringify(endpoints), ...extraEnv },
  });
  const page = await app.firstWindow();
  return {
    app, page, sandbox, vendors, config,
    async close() {
      await app.close();
      await vendors.close();
      await config.close();
      fs.rmSync(sandbox, { recursive: true, force: true });
    },
  };
}
