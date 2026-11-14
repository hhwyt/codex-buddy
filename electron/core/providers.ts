// The 7 vendors (spike (b), docs/spikes.md). Owner: A1 (data), A4 (vendor flows use these URLs).
// The model lists here are the BUILT-IN FALLBACK; the live lists come from remote/config.json (core/remote.ts) so a new
// model needs no release. Entries marked 待核实 in docs/spikes.md must be checked against the official docs during
// integration. Order = default card order.
import type { BuiltinVendorId, ProviderInfo } from './types';

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'deepseek', name: 'DeepSeek',
    // 2026-11-13: GET /models on a real key lists only these two (deepseek-chat / -reasoner still answer, as old names)
    baseUrl: 'https://api.deepseek.com/v1', wireApi: 'chat', defaultModel: 'deepseek-flash',
    models: [
      { slug: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', free: false, reasoning: [] },
      { slug: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', free: false, reasoning: [] },
    ],
    loginUrl: 'https://platform.deepseek.com/sign_in', keysUrl: 'https://platform.deepseek.com/api_keys',
    rechargeUrl: 'https://platform.deepseek.com/top_up', hosts: ['api.deepseek.com', 'platform.deepseek.com'],
  },
  {
    id: 'zhipu', name: '智谱',
    // Shipped in 0.1.x with wire_api = "responses" against /api/v1 (see main branch electron/buddy.ts)
    baseUrl: 'https://open.bigmodel.cn/api/v1', wireApi: 'responses', defaultModel: 'glm-4.5-flash',
    models: [
      { slug: 'glm-4.5-flash', name: 'GLM-4.5-Flash', free: true, reasoning: [] },
      { slug: 'glm-4.7-flash', name: 'GLM-4.7-Flash', free: true, reasoning: [] },
      { slug: 'glm-4.6', name: 'GLM-4.6', free: false, reasoning: [] },
      { slug: 'glm-5', name: 'GLM-5', free: false, reasoning: [] },
    ],
    loginUrl: 'https://bigmodel.cn/login?redirect=%2Fapikey%2Fplatform', keysUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    rechargeUrl: 'https://bigmodel.cn/finance-center/finance/pay', hosts: ['open.bigmodel.cn', 'bigmodel.cn'],
  },
  {
    id: 'kimi', name: 'Kimi',
    // 2026-11-13: GET /models on a real key; kimi-k2-0905-preview and the other K2 previews answer 404 now
    baseUrl: 'https://api.moonshot.cn/v1', wireApi: 'chat', defaultModel: 'kimi-k2.7-code',
    models: [
      { slug: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', free: false, reasoning: [] },
      { slug: 'kimi-k2.7-code-highspeed', name: 'Kimi K2.7 Code 高速版', free: false, reasoning: [] },
      { slug: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', free: false, reasoning: [] },
      { slug: 'kimi-k3', name: 'Kimi K3', free: false, reasoning: [] },
      { slug: 'kimi-k2.6', name: 'Kimi K2.6', free: false, reasoning: [] },
    ],
    // 2026-11-13: the console moved to platform.kimi.com (platform.moonshot.cn redirects there). Its /login page does not
    // leave for the console when already logged in, so the console is opened: logged out, its own script goes to /login
    // (base.ts waits until a logged-in URL holds)
    loginUrl: 'https://platform.kimi.com/console', keysUrl: 'https://platform.kimi.com/console/api-keys',
    rechargeUrl: 'https://platform.kimi.com/console/pay', hosts: ['api.moonshot.cn', 'platform.moonshot.cn', 'platform.kimi.com'],
  },
  {
    id: 'qwen', name: 'Qwen',
    // DashScope has a Responses endpoint for some models; chat via the bridge is the conservative default (待核实)
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', wireApi: 'chat', defaultModel: 'qwen3-coder-plus',
    models: [
      { slug: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', free: false, reasoning: [] },
      { slug: 'qwen3-coder-flash', name: 'Qwen3 Coder Flash', free: false, reasoning: [] },
      { slug: 'qwen3-max', name: 'Qwen3 Max', free: false, reasoning: [] },
    ],
    // The console itself shows a logged-out visitor the same URL (with a 登录 link): log in on Aliyun's own login page,
    // which comes back to the console (2026-11-13, hwy-pc)
    loginUrl: 'https://account.aliyun.com/login/login.htm?oauth_callback=https%3A%2F%2Fbailian.console.aliyun.com%2F', keysUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    rechargeUrl: 'https://billing-cost.console.aliyun.com/fortune/fund-management/recharge',
    hosts: ['dashscope.aliyuncs.com', 'bailian.console.aliyun.com'],
  },
  {
    id: 'minimax', name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1', wireApi: 'chat', defaultModel: 'MiniMax-M2',
    models: [{ slug: 'MiniMax-M2', name: 'MiniMax-M2', free: false, reasoning: [] }],
    // 2026-11-13: the console moved from platform.minimaxi.com to platform.minimax.cn (the API stays on api.minimaxi.com)
    loginUrl: 'https://platform.minimax.cn/login', keysUrl: 'https://platform.minimax.cn/user-center/basic-information/interface-key',
    rechargeUrl: 'https://platform.minimax.cn/user-center/payment/balance', hosts: ['api.minimaxi.com', 'platform.minimax.cn', 'platform.minimaxi.com'],
  },
  {
    id: 'hunyuan', name: '混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', wireApi: 'chat', defaultModel: 'hunyuan-turbos-latest',
    models: [
      { slug: 'hunyuan-turbos-latest', name: '混元 TurboS', free: false, reasoning: [] },
      { slug: 'hunyuan-t1-latest', name: '混元 T1', free: false, reasoning: [] },
      { slug: 'hunyuan-lite', name: '混元 Lite', free: true, reasoning: [] },
    ],
    loginUrl: 'https://cloud.tencent.com/login?s_url=https%3A%2F%2Fconsole.cloud.tencent.com%2Fhunyuan%2Fstart', keysUrl: 'https://console.cloud.tencent.com/hunyuan/start',
    rechargeUrl: 'https://console.cloud.tencent.com/expense/recharge', hosts: ['api.hunyuan.cloud.tencent.com', 'console.cloud.tencent.com'],
  },
  {
    id: 'openai', name: 'OpenAI 官方账号',
    // Codex's own provider and its own model list: no catalog, no key, login through `codex login` (M-22, M-26)
    baseUrl: 'https://api.openai.com/v1', wireApi: 'responses', defaultModel: '',
    models: [], loginUrl: 'https://chatgpt.com/', keysUrl: 'https://platform.openai.com/api-keys', rechargeUrl: null,
    hosts: ['api.openai.com', 'chatgpt.com', 'auth.openai.com'], officialAccount: true,
  },
];

export const providerOf = (id: BuiltinVendorId): ProviderInfo => PROVIDERS.find(p => p.id === id)!;
export const isBuiltin = (id: string): id is BuiltinVendorId => PROVIDERS.some(p => p.id === id);
