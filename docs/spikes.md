# M1 第 0 步实测（Base，2026-11-13）

## (a) Mac 上 Codex 只用第三方模型：通

- CLI：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，版本 `codex-cli 0.166.0-alpha.5.1`（`bin/codex` 是转到这里的 shell 包装）。只执行，没改 App。
- `CODEX_HOME` 指向临时目录，`model_provider` 指向本机假厂商（`test/fakes/vendor-server.mjs`），auth.json 只写 `OPENAI_API_KEY`：不登录 ChatGPT 就能发请求，回复「好了」。
- 发的是 **Responses**（`POST <base_url>/responses`，SSE）。
- `model_catalog_json` 生效：`codex debug models` 只列出清单里的模型。清单里每个模型的字段照 `codex debug models` 输出的官方条目（gpt-5.5）复制、改 slug/display_name 即可；字段名：additional_speed_tiers, apply_patch_tool_type, availability_nux, base_instructions, comp_hash, context_window, default_reasoning_level, default_reasoning_summary, default_verbosity, description, display_name, effective_context_window_percent, experimental_supported_tools, include_*_usage_instructions, input_modalities, max_context_window, model_messages, node_repl_*, priority, service_tiers, shell_type, slug, support_verbosity, supported_in_api, supported_reasoning_levels, supports_*, truncation_policy, upgrade, use_responses_lite, visibility, web_search_tool_type。`electron/core/catalogs.ts` 的 buildCatalog 目前只填了一部分，A1 补齐后用真 CLI 跑一次 `debug models` 核对。
- 坑：`codex exec` 不关 stdin 会卡住等输入（"Reading additional input from stdin"），`platform/run-codex.ts` 已用 `stdio: ['ignore', …]`。
- 选了清单外的模型（或别家模型）时，厂商返回 404，Codex 报 `unexpected status 404 Not Found: Model not available: <model>`，重试 5 次后退出码 1：假 Codex CLI 照这个格式模拟。

## (b) 7 家接口：待集成时实测

`electron/core/providers.ts` 和 `remote/config.json` 已按公开资料写了 API 地址、默认模型、模型清单（免费/付费）、Key 管理页、充值页，**全部待核实**（没来得及查官方文档）。重点核：智谱 /api/v1 的 Responses 是否仍可用、Qwen（百炼）是否有 Responses、混元免费模型、各家最新可写代码模型、充值页地址。

## (c) wire_api = "chat"：不通，必须转接层

Codex 0.166 读到 `wire_api = "chat"` 直接报错退出：「`wire_api = "chat"` is no longer supported」。只有 Chat Completions 的厂商全部走 `electron/main/bridge-server.ts`（A8）。

## (d) Windows 分身：待集成时实测

计划步骤（clone-win.ts 头注释同）：
1. 不复制商店包；在 `%LOCALAPPDATA%\CodexBuddy\apps\<Name>\` 放一个启动器（小 exe 或 PowerShell 隐藏窗口），设置 `CODEX_HOME=%USERPROFILE%\.codex-<slug>`，以 `--user-data-dir=%APPDATA%\Codex (<Name>)` 启动商店版 Codex 的 exe（`<InstallLocation>\app\Codex.exe`）。
2. 桌面和开始菜单建 .lnk，图标用厂商 .ico，设 `System.AppUserModel.ID = CodexBuddy.<Slug>`，任务栏单独分组。
3. 实测：能否与原 Codex 同时开（单实例锁是否跟 user-data-dir 走）、任务栏是否分开、商店包直接启动 exe 是否被拦。
4. 不行就退回「复制一份便携版」，记偏差。

## 其他待集成时实测

- 汉化：Mac 上用调试端口打开 enable_i18n 是否可行（L-02、L-06）。
- 转接层 R-01：真 CLI 经过转接层完成一轮对话和一次工具调用。
- e2e：`test/e2e/shell.spec.ts` 已写，未跑（`npm run test:e2e`）。
- `npm run dist:mac` 未跑。
