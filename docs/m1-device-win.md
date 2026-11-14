# M1 Windows 真机实测（真实厂商，2026-11-13）

- 机器：hwy-pc（Windows 11），站主远程桌面登录的会话 2。App 是 `electron-builder --win dir` 打出的 `release\win-unpacked\CodexBuddy.exe`。
- 方式：沙盒 `CODEXBUDDY_SANDBOX=C:\Users\hwy\CodexBuddy-Test` + 新加的 `CODEXBUDDY_REAL_CODEX=1`（[electron/platform/sandbox-real-win.ts](../electron/platform/sandbox-real-win.ts)）：路径都在沙盒里，Codex 是真的商店版，用沙盒自己的 CODEX_HOME 和 `--user-data-dir`，跟站主自己开着的 Codex 同时跑；不装、不卸、不关站主的 Codex。没有设 `CODEXBUDDY_ENDPOINTS`，连的都是官方网站。
- 驱动：[test/drive/real-win/](../test/drive/real-win/README.md)（Playwright `_electron` 在桌面会话里启动 App，按 data-testid 点；截图 = 整个窗口，含右侧浏览器）。
- 代码基准 b4da962；第 1 轮修到 e507d27，第 2 轮（a1529c6 起）修到 c7c6250。

## 结论（第 2 轮，2026-11-13 晚，代码到 c7c6250）

| 部分 | 结果 |
|---|---|
| DeepSeek | **通过**：已登录 → 第 2 级拿 Key（官方页点「Create new API key」，App 从页面响应接住）→ 测试连通 → 保存。菜单 2 个模型（DeepSeek V4.1 Flash、DeepSeek V4 Pro，都标「付费」），每个都回了「好」；换 Key 通过；余额够，没碰到充值 |
| Kimi | **通过**（修了 4 处才通）：第 2 级拿 Key。菜单 5 个模型（K2.7 Code、K2.7 Code 高速版、K3.1 Pro、K3、K2.6，都标「付费」），每个都回了「好」。账户是 Tier0，**每分钟只能发 3 次**，连发会 429（累计充值 50 元解锁 Tier1，站主定）|
| Qwen（百炼） | 08:40 时其实是登录着的（有阿里云登录 cookie、页面显示站主名字），但阿里云的登录票据是会话 cookie，我重启 App 装新包后就没了，**需要站主重新扫码**；本轮没测成。登录判断已改成看这个 cookie |
| 智谱、MiniMax、混元 | 未登录，跳过 |
| OpenAI 官方 | 未登录（要系统浏览器登 ChatGPT），跳过 |
| Codex 模型菜单只有这一家 | 通过：读 config.toml 和 codexbuddy-models.json；在真 Codex 界面里打开左下角菜单只有 DeepSeek 的 2 个（截图 36），Kimi 分身里只有 Kimi 的 5 个（截图 44） |
| 分身 | DeepSeek、Kimi 都做成分身并打开：站主自己的 Codex、沙盒主 Codex、两个分身 4 个同时开着；分身界面是中文；分身菜单只有这一家；用分身的 CODEX_HOME 给每个模型发一句话都回了；删除 DeepSeek 分身只删了入口和桌面图标，数据目录哈希删前删后一样（.codex-deepseek 3352 个文件），`Codex (DeepSeek)` 数据目录还在 |
| 汉化版 | 修后**通过**：从「ChatGPT 汉化版」打开，真 Codex 主界面是中文（截图 35）。修前补丁打上了但界面仍是英文（这台 Windows 系统语言是英文） |
| 智谱 / MiniMax 登录页的微信二维码 | 右侧浏览器放大时两家都有二维码（截图 64、66）；画中画小窗里智谱有（65），**MiniMax 的二维码那块是白的**（67，微信二维码在 open.weixin.qq.com 的 iframe 里，缩到 0.39 倍后没画出来）。扫码是放大时做的，影响小，没改 |
| 站主自己的 Codex 和 %USERPROFILE%\.codex | 没动：config.toml / auth.json 两轮前后 SHA256 一样，站主的 Codex 一直开着 |

### 第 2 轮修的问题

| 提交 | 问题 | 修法 |
|---|---|---|
| 84355d0 | Kimi 第 2 级接住的不是 Key（GET 请求里的会话 token 被当成 Key），测不通；测不通的 Key 一直留着，再点还是用它；Kimi 的 /login 已登录也不跳走 | 只读「新建」类请求（POST 等）的响应；被厂商拒的 Key 删掉；Kimi 登录入口改回控制台（没登录时它自己跳 /login，靠 1.5 秒稳定判断） |
| fcc8f59 | Kimi 新建 Key 的响应里 `key` 是 Key 的 ID（ak-…），`auth` 才是 Key（sk-…） | 优先取 sk- 开头的值，再看名字像 key/secret 的字段，最后才看 token |
| c1e103d | 百炼：控制台没登录时网址不变，阿里云登录页已登录时也不跳走，网址判断不了；DeepSeek、Kimi 的模型清单过时（Kimi K2 预览版已经 404，会报 Model not available） | 百炼看阿里云登录 cookie `login_aliyunid_ticket`；两家清单按真 Key 的 `/models` 改（App 内置一份和 remote/config.json 一起改） |
| fdb67ab | 汉化版打开后 Codex 仍是英文：开关打开后 Codex 跟系统语言走 | 启动器加 `--lang=zh-CN`（分身、沙盒汉化版和 codex.ps1 的汉化启动器都加了） |
| 972c211 | 已登录、等用户在官方页点「创建」时，卡上还写「扫码登录」，不知道该干什么 | 这一步卡上写「点右边的「创建」」 |
| c7c6250 | Key 接住后官方页面会把整个 Key 显示出来，还留在画中画里（换模型、截图、共享屏幕都会露）；Kimi（付费）被限速时卡上写「免费模型被限速了」 | 接住 Key 马上关右侧浏览器；付费的家写「被限速了（每分钟能发的次数有限），稍等会恢复」 |

每次修完：M3 上 `npm run lint`（含 tsc）和 `npm run test:cov` 全过（529 个测试，行 96.07%、分支 91.86%、函数 92.07%、语句 94.28%），同步到 hwy-pc 重新打包，从出问题那一步重测。

### 第 2 轮还没做完 / 需要站主

1. **UAC 提示**：我在 DeepSeek 分身里用脚本跳过 Codex 首次引导时，误点到了 Codex 自己的「完成 Windows 设置 → 继续」，Codex 在请求管理员权限（consent.exe 还开着）。这是系统权限，我没点，**请站主点「否」**。
2. **Qwen 要重新扫码**（登录票据是会话 cookie，App 重启就没了；用户第一次切换成功后 Key 已存好，以后不用再登录，但「换 Key」时要重新扫）。智谱、MiniMax、混元、OpenAI 没登录。
3. **Kimi Tier0 每分钟 3 次**：正常用 Codex 很容易被限速；要不要充到 50 元由站主定。
4. 测试中在 DeepSeek、Kimi 账户里各新建了几个名为 CodexBuddy 的 Key（失败的重试留下的），可以在官网删掉不用的。
5. 防火墙框、remote/config.json 未发布同第 1 轮。

### 第 2 轮剩下的风险

- MiniMax 微信二维码在画中画里不显示（见上）。
- 分身摊开模式下右侧浏览器放大时，第三列卡片被盖住（页面不跟着变窄）。
- 模型页右边常驻一条滚动条（7px），设置页的画中画会盖住「检查更新」。
- codex.ps1 是从 codex-install-made-easy 同步来的，这次在本仓库的副本里加了 `--lang=zh-CN`，上游也要加，不然下次同步会丢。

## 第 1 轮结论（2026-11-13 早）

| 部分 | 结果 |
|---|---|
| 一次打开 6 家登录窗口 | 通过（标题「CodexBuddy 登录：<厂商>」，同一个登录分区） |
| 站主扫码登录 | **未完成**：等了约 55 分钟（06:08–07:03），6 家都没登录，站主不在。窗口已重新打开，等站主回来扫 |
| 7 家真实切换、拿 Key、菜单、每个模型发一句话 | **未测**（依赖登录）；OpenAI 官方也没登录，按要求跳过 |
| 分身（做成分身、和原版同时开、能回话、删除留数据） | **未测**（做分身要先拿到 Key）；摊开、切换模式来回切已测 |
| 其他不需要登录的功能 | 通过（下表） |
| 站主自己的 Codex 和 %USERPROFILE%\.codex | 没动：config.toml / auth.json 测试前后 SHA256 一样，站主的 Codex 全程开着 |

## 逐项

| 功能 | 预期 | 实际 | 通过 | 截图 |
|---|---|---|---|---|
| 一次打开 6 家登录页 | 每家一个窗口，标题写厂商，都用 persist:codexbuddy-browser | 6 个窗口：DeepSeek、智谱、Kimi、Qwen、MiniMax、混元，标题对；登录状态写进 `<沙盒>\login-status.json` | 是（修了 2 处，见下） | [03](screenshots/real-win-03-login-windows.png) |
| 欢迎屏 → 开始安装 | 已装 Codex 打勾，进模型页 | 进模型页，「选一个模型」引导在 | 是 | [01](screenshots/real-win-01-welcome.png) |
| 模型页第一次进来 | 7 张卡从上往下叠，智谱一直标「免费」，页面撑满窗口 | 修后符合 | 是（修了 2 处） | [02](screenshots/real-win-02-models-first.png) |
| 切换｜分身来回切 | 分身摊开，没做的显示「做成分身」，OpenAI 卡「打开 ChatGPT」；切回叠卡 | 符合 | 是 | [40](screenshots/real-win-40-clone-spread.png) [41](screenshots/real-win-41-back-to-switch.png) |
| 汉化：切到汉化版 | 字一行行变中文；沙盒桌面和开始菜单加「ChatGPT 汉化版」 | 两个快捷方式都在，提示「从「ChatGPT 汉化版」打开就是中文」 | 是 | [33](screenshots/real-win-33-zh-midway.png) [34](screenshots/real-win-34-zh-on.png) |
| 用汉化版打开 Codex | 真 Codex（沙盒 CODEX_HOME）打开，补丁打上 | 真 Codex 打开，启动器日志「attached / patched page」；还没配厂商所以停在 ChatGPT 登录页，这一页本身是英文。**主界面是不是中文要等切好一家再看** | 部分 | [35](screenshots/real-win-35-codex-signin.png) |
| 汉化：切回英文原版 | 字倒回英文，图标留着，垃圾桶还在 | 符合 | 是 | [36](screenshots/real-win-36-en-midway.png) [37](screenshots/real-win-37-en-on.png) |
| 垃圾桶去掉汉化版 | 只删两个快捷方式，.codex 不动 | 两个快捷方式没了，沙盒 .codex 还在 | 是 | [38](screenshots/real-win-38-trash-hover.png) [39](screenshots/real-win-39-trash-flying.png) [39b](screenshots/real-win-39b-trash-done.png) |
| 去充值 → 右侧浏览器放大 | 窗口向右加宽 480px（屏幕 1440 宽，窗口滑到左边） | 980→1440，x 230→0；DeepSeek 充值页（未登录跳登录页） | 是 | [60](screenshots/real-win-60-recharge-expanded.png) |
| 画中画：缩回 / 换页面 / 放大 / ✕ | 缩成右下角小窗、换页面不动、点小窗放大、只有 ✕ 关 | 都符合；关掉后窗口回到原位原宽 | 是 | [61](screenshots/real-win-61-pip.png) [62](screenshots/real-win-62-pip-other-page.png) [63](screenshots/real-win-63-pip-enlarged.png) |
| 安全面板 | Key 打码；两块「连过的」；让 AI 帮我检查复制提示词；查看源代码 | 两块列表有内容（CodexBuddy 连过的：cdn.jsdelivr.net、raw.githubusercontent.com；网页里连过的：登录页的 70 多个网站）；复制和开源码页都对 | 是（修了 1 处） | [50](screenshots/real-win-50-security.png) |
| 检查更新 | 有新版弹窗 / 已是最新 / 连不上 | 提示「连不上网，稍后再试」：网是通的，是仓库 main 上还没有 remote/config.json（jsDelivr、GitHub 都 404） | 待站主 | [31](screenshots/real-win-31-check-update.png) |
| 帮助 | 粘报错给解释；企业微信码 | 解释对；二维码显示「连上网后显示」（同上，远程配置没发布） | 部分 | [32](screenshots/real-win-32-help.png) |
| 一键还原 | 列出要做的事；只还原沙盒里的东西 | 列出：配置恢复、去掉汉化版图标、退出右侧浏览器登录、聊天记录留着；做完回到欢迎屏，汉化版快捷方式没了；没卸载商店版 Codex | 是 | [70](screenshots/real-win-70-restore-confirm.png) [71](screenshots/real-win-71-restored.png) |
| 切换 DeepSeek（第 2 轮） | 第 2 级拿 Key → 测通 → 保存；菜单只有 DeepSeek | 卡上先「点右边的「创建」」，建好后 ✓ 能用；菜单 2 个，各回「好」 | 是 | [10](screenshots/real-win-10-deepseek-keypage.png) [12](screenshots/real-win-12-deepseek-switched.png) [36](screenshots/real-win-36-codex-menu-deepseek.png) |
| 切换 Kimi（第 2 轮） | 同上 | 修后 ✓ 能用；菜单 5 个，各回「好」（每分钟 3 次，间隔着发） | 是 | [16](screenshots/real-win-16-kimi-switched.png) |
| 换 Key（第 2 轮） | 拿新 Key，测通才替换 | DeepSeek 卡号尾号变了，测通；接住 Key 后右侧浏览器马上关 | 是 | [18](screenshots/real-win-18-change-key-create.png) [19](screenshots/real-win-19-change-key-done.png) |
| 汉化版打开真 Codex（第 2 轮） | 主界面中文 | 修后中文 | 是 | [35](screenshots/real-win-35-codex-zh.png) |
| 分身（第 2 轮） | 做成、和原版同时开、菜单只有这家、能回话、删除留数据 | 都符合 | 是 | [42](screenshots/real-win-42-clones-made.png) [44](screenshots/real-win-44-clone-kimi-menu.png) [45](screenshots/real-win-45-clone-remove-confirm.png) [46](screenshots/real-win-46-clone-removed.png) |
| 智谱 / MiniMax 微信二维码（第 2 轮） | 放大和画中画都看得到 | 放大都有；画中画智谱有、MiniMax 白 | 部分 | [64](screenshots/real-win-64-zhipu-qr-expanded.png) [65](screenshots/real-win-65-zhipu-qr-pip.png) [66](screenshots/real-win-66-minimax-qr-expanded.png) [67](screenshots/real-win-67-minimax-qr-pip.png) |
| G-01 数据保护 | 站主的 .codex 哈希不变 | config.toml F79918E5…CFEE、auth.json 6E4C3B9D…F3BB，前后一样 | 是 | — |

## 修了什么（m1/integrate）

| 提交 | 问题 | 修法 |
|---|---|---|
| 5634a88 | 没有入口一次打开 6 家登录页；沙盒模式下 Codex 是假的，没法真实实测 | `CODEXBUDDY_LOGIN_WINDOWS=1` 开 6 个带厂商名的登录窗口并写登录状态；`CODEXBUDDY_REAL_CODEX=1` 用真 Codex 跑在沙盒里（不装、不卸、不关站主的 Codex，汉化版是沙盒桌面上的启动器） |
| 80c6868 | 页面没撑满窗口，底下空 67px（`#app` 没有高度）；智谱卡第一次显示「按用量付费」、切换后才变「免费」；登录窗口带 File 菜单；登录页的 WebRTC 开 UDP 端口 | `#app` 高 100%；没选过模型时按默认模型标免费 / 付费；登录窗口去菜单；登录窗口和右侧浏览器 WebRTC 只走代理 UDP |
| 864bdbe | Qwen：百炼控制台未登录时网址不变（页面上只有「登录」链接），被当成已登录 | Qwen 登录页改成阿里云账号登录页（登完回控制台）；混元登录后回混元控制台 |
| 525b157 | Kimi：/console 先露一下控制台网址再由脚本跳到 /login，被当成已登录；控制台已经搬到 platform.kimi.com | 登录要在已登录网址上停够 1.5 秒才算；Kimi 的登录、Key、充值页改到 platform.kimi.com |
| e507d27 | Windows 弹「是否允许 CodexBuddy 访问公用和专用网络」（WebRTC 的 mDNS 监听 UDP 5353）；每次进设置 / 安全面板要等约 2 秒（每次都起好几个 PowerShell 查 Codex）；安全面板的网站列表要等这 2 秒才出来 | 关掉 WebRtcHideLocalIpsWithMdns（5353 不再监听）；1.5 秒内查 Codex 只起一次 PowerShell；网站列表先画 |

每次修完：M3 上 `npm run lint` 和 `npm run test:cov` 全过（525 个测试，行 96.0%、分支 91.8%、函数 92.0%、语句 94.2%），同步到 hwy-pc 重新打包，从出问题那一步重测。

## 还没做完 / 需要站主

1. **扫码登录 6 家**：Windows 桌面上 6 个「CodexBuddy 登录：…」窗口开着（07:04 重新打开的）。登完以后按下面「接着测」走。
2. **防火墙框**：第一次运行时 Windows 弹了「Do you want to allow public and private networks to access this app?」，这是系统安全设置，代理不点；请站主点 Cancel（不影响使用）。新包已经不监听 5353，按理不会再弹。
3. **检查更新 / 社群二维码 / 远程模型清单**：仓库 main 上还没有 `remote/config.json`，App 只能用自带的一份；要发布（推 main）由站主定。
4. **OpenAI 官方**：要在系统浏览器登录 ChatGPT（`codex login`），这次没登，跳过。

## 接着测（登录后）

逐家：开始安装 → 点卡片切换（看是第几级拿到 Key）→ 读沙盒 `home\.codex\config.toml` 和 `codexbuddy-models.json`，只有这家、每个标免费 / 付费 → `models.ps1` 给每个模型发一句话 → 截图；余额不够的确认打开了官方充值页，记下来。然后：换 Key、给至少 2 家做分身（和原版同时开、菜单只有这家、能回话、删除后数据目录哈希不变）、分身跟着汉化走、用汉化版打开看主界面是不是中文、一键还原。

## 剩下的风险

- 每家的模型清单还是自带的那份，可能过时（DeepSeek 平台横幅已在说 V4.1 Flash，百炼首页有 Qwen4-Max）；要等拿到 Key 后用各家 `/v1/models` 和真发一句话核对。
- 汉化补丁对 Codex 26.1106 的主界面是否生效，这次只看到启动器打上了补丁，没看到中文主界面。
- 模型页右边有一条常驻的滚动条（叠卡最下面那张卡的身体在 stage 外，多出 7px），没改。
- 画中画在设置页会盖住「检查更新」按钮（只在模型页给卡片让位）。
