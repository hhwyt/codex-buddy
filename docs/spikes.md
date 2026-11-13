# M1 第 0 步实测（Base，2026-11-13）

## (a) Mac 上 Codex 只用第三方模型：通

- CLI：`/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，版本 `codex-cli 0.166.0-alpha.5.1`（`bin/codex` 是转到这里的 shell 包装）。只执行，没改 App。
- `CODEX_HOME` 指向临时目录，`model_provider` 指向本机假厂商（`test/fakes/vendor-server.mjs`），auth.json 只写 `OPENAI_API_KEY`：不登录 ChatGPT 就能发请求，回复「好了」。
- 发的是 **Responses**（`POST <base_url>/responses`，SSE）。
- `model_catalog_json` 生效：`codex debug models` 只列出清单里的模型。清单里每个模型的字段照 `codex debug models` 输出的官方条目（gpt-5.5）复制、改 slug/display_name 即可；字段名：additional_speed_tiers, apply_patch_tool_type, availability_nux, base_instructions, comp_hash, context_window, default_reasoning_level, default_reasoning_summary, default_verbosity, description, display_name, effective_context_window_percent, experimental_supported_tools, include_*_usage_instructions, input_modalities, max_context_window, model_messages, node_repl_*, priority, service_tiers, shell_type, slug, support_verbosity, supported_in_api, supported_reasoning_levels, supports_*, truncation_policy, upgrade, use_responses_lite, visibility, web_search_tool_type。`electron/core/catalogs.ts` 的 buildCatalog 目前只填了一部分，A1 补齐后用真 CLI 跑一次 `debug models` 核对。
- 坑：`codex exec` 不关 stdin 会卡住等输入（"Reading additional input from stdin"），`platform/run-codex.ts` 已用 `stdio: ['ignore', …]`。
- 选了清单外的模型（或别家模型）时，厂商返回 404，Codex 报 `unexpected status 404 Not Found: Model not available: <model>`，重试 5 次后退出码 1：假 Codex CLI 照这个格式模拟。

## (b) 7 家接口：集成时实测（2026-11-13，不带 Key 探测，没用任何账号）

不带 Key 向各家接口发一个 POST，看回什么（401 = 接口在、要 Key；404 = 路径不对）：

| 家 | 地址 | 结果 |
|---|---|---|
| DeepSeek | api.deepseek.com/v1/chat/completions | 401 authentication_error：在 |
| 智谱 | open.bigmodel.cn/api/v1/responses | **HTTP 200** + `{"code":1001,"msg":"Header中未收到Authorization参数…"}`：在，但没 Key 时也回 200 |
| 智谱 | open.bigmodel.cn/api/paas/v4/chat/completions | 401：在 |
| Kimi | api.moonshot.cn/v1/chat/completions | 401 incorrect_api_key_error：在 |
| Qwen | dashscope.aliyuncs.com/compatible-mode/v1/chat/completions | 401：在；/responses 也回 401 InvalidApiKey（要 Key 才知道能不能用） |
| MiniMax | api.minimaxi.com/v1/chat/completions | 401 authorized_error：在 |
| 混元 | api.hunyuan.cloud.tencent.com/v1/chat/completions | 401：在 |

结论：5 家只走 Chat Completions，经转接层（A8）接上，地址都对。智谱保留 0.1.x 用过、在 hwy-pc 真机跑通的 `/api/v1` Responses。智谱没 Key 时回 200 而不是 401：测试连通是让 Codex 回一句话，回不出来就算失败，所以不会误判为「能用」。各家模型清单、充值页地址仍要在 Mac mini 真机上登录后核对（计划第 4 步）。

## (b') 原「待集成时实测」

`electron/core/providers.ts` 和 `remote/config.json` 已按公开资料写了 API 地址、默认模型、模型清单（免费/付费）、Key 管理页、充值页，**全部待核实**（没来得及查官方文档）。重点核：智谱 /api/v1 的 Responses 是否仍可用、Qwen（百炼）是否有 Responses、混元免费模型、各家最新可写代码模型、充值页地址。

## (c) wire_api = "chat"：不通，必须转接层

Codex 0.166 读到 `wire_api = "chat"` 直接报错退出：「`wire_api = "chat"` is no longer supported」。只有 Chat Completions 的厂商全部走 `electron/main/bridge-server.ts`（A8）。

## (d) Windows 分身：这一步测不了，留给 Windows 真机（计划第 5 步）

这一步只在 M3 上做，没有 Windows 机器（站主开机后的 Windows 真机验收是计划第 5 步）。下面的计划不变，clone-win.ts 按它写好、只有 L2 测试。

计划步骤（clone-win.ts 头注释同）：
1. 不复制商店包；在 `%LOCALAPPDATA%\CodexBuddy\apps\<Name>\` 放一个启动器（小 exe 或 PowerShell 隐藏窗口），设置 `CODEX_HOME=%USERPROFILE%\.codex-<slug>`，以 `--user-data-dir=%APPDATA%\Codex (<Name>)` 启动商店版 Codex 的 exe（`<InstallLocation>\app\Codex.exe`）。
2. 桌面和开始菜单建 .lnk，图标用厂商 .ico，设 `System.AppUserModel.ID = CodexBuddy.<Slug>`，任务栏单独分组。
3. 实测：能否与原 Codex 同时开（单实例锁是否跟 user-data-dir 走）、任务栏是否分开、商店包直接启动 exe 是否被拦。
4. 不行就退回「复制一份便携版」，记偏差。

## 其他待集成时实测

- 汉化：Mac 上用调试端口打开 enable_i18n——**通**（2026-11-13，集成时实测）。做法：把 /Applications/ChatGPT.app 用 APFS clone 复制到沙盒，改名 Test-ChatGPT.app、换 bundle id（local.codexbuddy.test-chatgpt）、关自动更新、ad-hoc 重签名；用 `electron/platform/zh-mac.ts` 的 zh-runner.js 原样启动它（CODEX_HOME、--user-data-dir 都在沙盒里，--use-mock-keychain）。runner 在 127.0.0.1 随机端口上连上调试端口、给页面打补丁，Node 自带的 WebSocket 能连上（没被 origin 检查挡住）。页面文字变成「登录 ChatGPT / 继续登录 / 使用其他方式登录 / 注册」，`document.documentElement.lang = zh-CN`。截图 `docs/screenshots/m1-spike-zh-debug-port.png`。分身同理（同一个 runner，C-03：它和正开着的 ChatGPT 同时在跑，互不影响）。真 ChatGPT.app 没启动、没改；前后跑 `scripts/m3-guard.sh` 完全一样。
- 只用 `open --args` 传调试端口（主 App 的汉化启动器）这条没测：要用 `open` 就会经过 LaunchServices，在 M3 上可能把参数交给正在开着的真 ChatGPT，所以没试；runner 对分身用的是直接启动可执行文件，已测通。
- 转接层 R-01：真 CLI 经过转接层完成一轮对话和一次工具调用。
- e2e：2026-11-13 在 hwy-pc（Windows 11，站主远程桌面会话）跑完：89 过、1 跳过（U-03 只在没签名的 Mac 上跑）；打包后的 App 由 test/drive 逐步驱动通过，见 docs/m1-behavior-check.md。Windows 截图基线（*-win32.png）在这次生成并提交。
- `npm run dist:mac` 未跑。
