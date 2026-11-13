# M1 行为核对：Windows 上亲自驱动打包后的 App

- 机器：hwy-pc（Windows 11），站主远程桌面登录的桌面会话（schtasks /IT）。驱动脚本 [test/drive/m1-drive.spec.ts](../test/drive/m1-drive.spec.ts)，配置 [playwright.drive.config.ts](../playwright.drive.config.ts)。
- 对象：`npx electron-builder --win dir` 打出来的 `release\win-unpacked\CodexBuddy.exe`（Playwright `_electron` 的 executablePath 指向它），不是源码直跑。
- 沙盒：`CODEXBUDDY_SANDBOX` 是新的临时目录；`CODEXBUDDY_ENDPOINTS` 把 7 家接口、远程配置全指向本机假服务（test/fakes）。Codex 是沙盒里的 Test-ChatGPT.app（自己的 bundle id、关自动更新，命令行是假 Codex）。打开 App / 在文件夹里显示 / 外部链接一律只记到 `<沙盒>/opened.log`，什么都不真的打开。站主自己的 Codex（OpenAI.Codex 26.1103.4239.0）和 `%USERPROFILE%\.codex` 没动。
- 测试模式下窗口在屏幕外（x = -30000）、显示时不抢焦点（m1-decisions 2026-11-13）；截图用 Electron 自己的 capturePage，把主页面和右侧浏览器（WebContentsView）按位置拼起来，所以截图里有右侧浏览器，但没有系统画的标题栏三个按钮。
- 截图：`docs/screenshots/win-*.png`（2026-11-13 复核修复后在打包的 App 上重跑了一遍，提交 39081cc）；每步的说明在 [win-drive-log.json](screenshots/win-drive-log.json)。
- 对照的参考图：定稿原型在同一台 Windows 上用 Electron 离屏渲染（[ref-model-switch.png](screenshots/ref-model-switch.png)、[ref-model-clone.png](screenshots/ref-model-clone.png)、[ref-language.png](screenshots/ref-language.png)），不在 M3 上开窗口。

## 逐步对照

「来源」：计划 = product/build-plan-2026-11-13.md 的验收编号，MF = model-page-final.html，LF = language-final.html，D = m1-decisions.md。

| # | 步骤（截图） | 预期（来源） | 实际 | 一致吗 |
|---|---|---|---|---|
| 1 | 欢迎屏 [win-01](screenshots/win-01-welcome.png) | 只有「Codex 免费助手 / 国产大模型」和黑色胶囊「开始安装」（O-01，PRD） | 一样；没有别的字 | 一致 |
| 2 | 开始安装 [win-02](screenshots/win-02-installing.png) | 一行行打勾：下载 Codex → 装进应用程序 → 检查 Codex（O-01） | 一样。Windows 沙盒里用安装替身把 Test-ChatGPT.app 写进沙盒（真实 Windows 安装走 codex.ps1 / 商店，沙盒里不跑） | 一致（见偏差 1） |
| 3 | 装好进模型页 [win-03](screenshots/win-03-models-first.png) | 不出「完成」页，直接到模型页；7 张卡叠成一摞，顺序 DeepSeek、智谱、Kimi、Qwen、MiniMax、混元、OpenAI（O-01，D「卡片默认顺序」，MF） | 一样；最上层 DeepSeek，没有「正在用」 | 一致 |
| 4 | 第一次用 DeepSeek [win-04](screenshots/win-04-login-enlarged.png) | 右侧浏览器放大到官方登录页（M-08，B-02） | 放大到假服务的 /deepseek/login；窗口不够宽时盖住右半边（B-02 的窄屏规则） | 一致 |
| 5 | 第一次成功 [win-05](screenshots/win-05-first-success.png) | 弹窗「从零到能用 N 秒」+「打开 Codex」+ 关注行（M-19） | 一样（2 秒）；底下 toast「已切换到 DeepSeek」 | 一致 |
| 6–11 | 逐家切换 [win-06](screenshots/win-06-switch-zhipu.png) [07](screenshots/win-07-switch-kimi.png) [08](screenshots/win-08-switch-qwen.png) [09](screenshots/win-09-switch-minimax.png) [10](screenshots/win-10-switch-hunyuan.png) [11](screenshots/win-11-switch-openai.png) | 卡抽到最上层、「✓ 能用」；config.toml 的 model_catalog_json 里只有这一家的模型，每个标（免费）/（付费）；切回 OpenAI 去掉清单（M-02、M-24、M-26，D「模型菜单」） | 每家切完都读 config.toml 和清单文件断言：只有这家的模型、不含别家任何一个，和 remote/config.json 一致；OpenAI 时没有 model_catalog_json | 一致 |
| 12 | 测不通退回 [win-13](screenshots/win-13-failing.png) [win-14](screenshots/win-14-failed-back.png) | 卡抖一下回原位，config.toml 逐字节不变，原来那家还在用（M-07） | 一样：断言 config.toml 前后逐字节相同，DeepSeek 仍是正在用 | 一致 |
| 13 | Key 不对 [win-14b](screenshots/win-14b-key-failed.png) | 弹窗写原因，「再试一次」「先不了」（M-10） | 一样 | 一致 |
| 14 | 余额不够 [win-15](screenshots/win-15-no-balance.png) → 再试一次 [win-16](screenshots/win-16-retry-ok.png) | 官方充值页在右侧放大；卡上「去充值」「再试一次」；充完再试能用（M-13） | 一样；再试一次后 Kimi 正在用 | 一致 |
| 15 | 被限速 [win-17](screenshots/win-17-rate-limited.png) → 换个模型 [win-18](screenshots/win-18-swap-model.png) | 卡上「被限速」和「换个模型」；模型在 Codex 左下角菜单里换（M-14，D「用哪家的哪个模型在 Codex 里换」） | 一样；换个模型给出提示「在 Codex 左下角的模型菜单里换一个」 | 一致 |
| 16 | 换 Key [win-19](screenshots/win-19-change-key.png) | 卡号旁「换」；新 Key 测通才替换（M-17，MF） | 一样：卡号尾 4 位变了 | 一致 |
| 17 | 去充值 [win-20](screenshots/win-20-recharge.png) | 右下「余额 · 去充值 ›」只在付费模型；打开官方充值页，App 不替用户点付款（M-18，D「充值」） | 一样；断言页面上的「付款」按钮 1 秒内没被点 | 一致 |
| 18 | 画中画 [win-21](screenshots/win-21-pip.png) 放大 [win-22](screenshots/win-22-pip-enlarged.png) | 缩回右下角小窗，再点放大（B-01、B-03） | 一样 | 一致 |
| 19 | 分身模式 [win-23](screenshots/win-23-clone-spread.png) 对照 [ref-model-clone](screenshots/ref-model-clone.png) | 卡片摊开 3 列；OpenAI 卡「原来的」+「打开 ChatGPT」；没做的卡饱和度降低 +「做成分身」（C-09，MF） | 一样（这次把原来那张卡的按钮从「打开」改成了 MF 的「打开 ChatGPT」） | 一致（已修） |
| 20 | 做成分身 [win-24](screenshots/win-24-clone-made.png) | DeepSeek 卡变「打开」；分身有自己的 CODEX_HOME（~/.codex-deepseek），菜单只有 DeepSeek 的模型（C-01、C-04、C-06） | Windows：沙盒的 `AppData\Local\CodexBuddy\apps\deepseek\launch.vbs` 设置 CODEX_HOME=…\.codex-deepseek，桌面和开始菜单各一个 DeepSeek.lnk；分身的 config.toml 清单只有 DeepSeek | 一致（已修，见下「修了什么」1） |
| 21 | 打开分身 | 记录到 opened.log 的是这个分身（C-02） | 一样 | 一致 |
| 22 | 删除分身 [win-25](screenshots/win-25-clone-remove-confirm.png) [win-26](screenshots/win-26-clone-removed.png) | 先确认；只删入口（启动器 + .lnk）；~/.codex-deepseek 哈希不变（C-07，D「删除只删入口」） | 一样：删前后 hashTree 相同，.lnk 不在了 | 一致 |
| 23 | 切回切换模式 [win-27](screenshots/win-27-back-to-switch.png) | 卡片叠回去，切换模式的状态不变（C-09） | 一样 | 一致 |
| 24 | 设置页 [win-28](screenshots/win-28-settings.png) 对照 [ref-language](screenshots/ref-language.png) | 两张预览图，默认英文原版，没有垃圾桶（L-01，LF，D「默认英文」） | 和 LF 的样子一样 | 一致 |
| 25 | 切汉化版 [win-29](screenshots/win-29-zh-midway.png) [win-30](screenshots/win-30-zh-on.png) | 字从上往下一行行变中文；加上「ChatGPT 汉化版」；预览框右下角出现红色垃圾桶；「好了：从「ChatGPT 汉化版」打开就是中文」+「打开看看」（L-02，LF） | 一样（中途截图里能看到扫线和一半中文）；沙盒的开始菜单出现 ChatGPT 汉化版.lnk | 一致 |
| 26 | 切回英文 [win-31](screenshots/win-31-en-midway.png) [win-32](screenshots/win-32-en-on.png) | 扫线从下往上倒回英文；汉化版图标留着（L-03，LF） | 一样；.lnk 还在 | 一致 |
| 27 | 垃圾桶 [win-33](screenshots/win-33-trash-hover.png) [win-34](screenshots/win-34-trash-flying.png) [win-35](screenshots/win-35-trash-done.png) | 鼠标移上去显示「去掉汉化版」，不配文字；图标飞进废纸篓；只删入口，Codex 和聊天记录不动（L-04，D「废纸篓」） | 一样；~/.codex 和 Codex 数据目录的哈希前后相同 | 一致 |
| 28 | 安全面板 [win-36](screenshots/win-36-security.png) | Key 只显示后 4 位；Windows 写「在文件夹里显示」；去官网管理；两块「CodexBuddy 连过的 / 网页里连过的」；调试端口只开在 127.0.0.1（S-01..S-07） | 一样；页面全文里找不到任何一把完整的 Key | 一致 |
| 29 | 更新弹窗 [win-37](screenshots/win-37-update.png) | 有新版本时弹窗「稍后 / 立即更新」（T-02、U-01） | 一样 | 一致 |
| 30 | 一键还原 [win-38](screenshots/win-38-restore-confirm.png) [win-39](screenshots/win-39-restored.png) | 先列出会做的事，写明聊天记录留着；回到引导；CodexBuddy 装的 Codex 卸掉，sessions 不动（T-03、T-04） | 一样；sessions 哈希前后相同，沙盒里的 Test-ChatGPT.app 被卸掉 | 一致（已修：原来「聊天记录…留着」写了两遍） |

## 不一致、已经修好的

1. **Windows 上做分身失败但卡片照样显示「打开」**：Electron 的 `shell.writeShortcutLink(…, 'replace')` 在 .lnk 不存在时直接失败，分身的快捷方式一个都没建；而 clone.json 先写了，列表就把它当成做好了。改成 `'create'`（不存在就建、存在就覆盖），并把 clone.json 挪到最后写（快捷方式建不成就不算做好）。[electron/platform/clone-win.ts](../electron/platform/clone-win.ts)，测试 C-01。
2. **卡片头部在 Windows 上偏到中间、而且可以拖动窗口**：卡片的头部 class 叫 `top`，和外壳顶栏的 `.top` 撞了，吃到了顶栏的 `justify-content:flex-end`、Windows 的 `padding-right:150px` 和 `-webkit-app-region: drag`（点卡片头部会拖窗口）。顶栏样式改成只认 `header.top`。现在「✓ 能用 / 按用量付费」靠右，和 MF 一样。[ui/app.css](../ui/app.css)
3. **「✓ 能用」在蓝色卡上是绿色**：A6 的全局 `.ok`（绿）盖过了卡片的颜色。按 MF：品牌色卡上白字，智谱 / Kimi 的深色卡上浅蓝 `#5ab0ff`（新 token `--face-ok-dark`），OpenAI 浅色卡上蓝。[ui/models.css](../ui/models.css)
4. **「OpenAI 官方账号」折成两行**，第二行被下一张卡盖住：卡片名不折行。
5. **一键还原确认框把「聊天记录留着」写了两遍**（core 的最后一行 + 页面又加一行）：页面只在清单里没提聊天记录时才补一行。测试 T-03。
6. **分身模式里原来那张卡的按钮**：MF 是「打开 ChatGPT」，原来写成「打开」。
7. **键盘焦点框是系统强调色（橙色）**：改成 1 条 2px 的 App 蓝色描边（`:focus-visible`）。
8. **帮助页在网络慢时等很久**：`app:state` 等社群二维码下载，最长 60 秒（Windows 上取 raw.githubusercontent.com 很慢，H-02 超时）。改成最多等 3 秒，下好了下次就有。测试 H-02。
9. **MiniMax、Kimi 控制台换了域名**（D「实测发现」）：MiniMax 登录 / Key / 充值页改到 platform.minimax.cn，白名单加 platform.minimax.cn、platform.kimi.com；控制台跳到 platform.* 新域名时也认得出「已登录」。测试 M-08。
10. **测试窗口不出现在站主屏幕上**（D「实测发现」）：测试模式（沙盒 + 假服务）下窗口放在屏幕外、显示时不抢焦点、不进任务栏；Windows 上同时关掉「被遮挡就不画」，截图照样能截。测试 W-01。

11. **Windows 分身开的是 `app\Codex.exe` 空壳**（复核 blocker）：商店包的真程序是 `app\ChatGPT.exe`，`Codex.exe` 只有 20 KB；按 AppUserModelID 激活又会丢掉 CODEX_HOME。分身启动器改成走 Codex 包自带的启动别名 `%LOCALAPPDATA%\Microsoft\WindowsApps\chatgpt-desktop.exe`（带包身份运行 ChatGPT.exe，继承环境变量、传参数），`--user-data-dir` 指向分身自己的数据目录；`app\ChatGPT.exe` 只拿来当图标。launch.vbs 改存 UTF-16（智谱、混元这种中文名在 ANSI 里存不下）。[electron/platform/clone-win.ts](../electron/platform/clone-win.ts)，测试 C-04、C-01。
12. **Windows 分身选了汉化也是英文**（L-07）：原来只给 Codex 加了调试端口，没人去连。现在汉化的分身由启动器用 CodexBuddy 自带的 Electron 跑和 Mac 同一个 zh-runner.js：开 127.0.0.1 随机端口、每个页面打开 enable_i18n；CodexBuddy 不在了就直接英文打开。分身已经开着时（命令行里带着它的数据目录）只把它调到前面。测试 L-07（真的跑 zh-runner.js 连假调试端口，断言 enable_i18n 被打开）。
13. **切换成功后画中画还留着上一家的 Key 管理页、挡住最上层卡的「换」**（D「实测发现」1、2）：切换成功就关掉右侧浏览器；只有 M-12（只剩赠送额度）时把充值页留在画中画。测试 M-02（集成：关掉、不再打开；端到端：画中画关了以后「换」点得到）。
14. **换页后上一页的提示还在**（win-29 里删分身的「删好了…」盖在设置页上）：左栏切页时清掉提示。测试 W-02。
15. **Codex 发给厂商的请求不走白名单**：127.0.0.1 中转改用 guardedFetch，进「CodexBuddy 连过的」；「其他厂商」填的地址在用上以后加进白名单。
16. **X-01 在 Windows 上几乎没查东西**：加上商店版 Codex 的数据目录 `%LOCALAPPDATA%\Packages\OpenAI.Codex_*\LocalCache\Roaming\Codex`、开始菜单里的「ChatGPT 汉化版.lnk」，并比对桌面和开始菜单里的 .lnk 清单（测试多留一个快捷方式就失败）。站主的 Codex 开着时自己会改的缓存（GrShaderCache、ShaderCache 等）跳过；这些是 hwy-pc 空闲两分钟实测出来的。C-03 在 Windows 上读两个 .lnk 的 AppUserModelID，必须是 `CodexBuddy.Kimi`，不是商店包的。

## Windows 真机检查（hwy-pc，2026-11-13，不碰站主的 Codex）

站主的 Codex（OpenAI.Codex 26.1106.6628.0，开着 11 个 ChatGPT.exe）全程没关、没改；所有文件在 `C:\Users\hwy\codex-buddy-m1-sandbox` 下；没有用真实账号（汉化那次给分身放了一个假 Key `sk-fake-test-0000`，只为让 Codex 进主界面）。

| 检查 | 做法 | 结果 |
|---|---|---|
| spike d：分身和原来的 Codex 同时开 | 在站主桌面会话里用启动别名开第二个 Codex，`--user-data-dir` 和 CODEX_HOME 都在沙盒 | 第二个 ChatGPT.exe 起来了，带自己的 codex.exe app-server；沙盒 CODEX_HOME 里写了 config.toml、sqlite 等 27 项；站主的 11 个进程前后都在；关分身只关它自己那一组进程 |
| 分身（不汉化，C-01..C-04） | 用打包代码 `createWinClone` 在沙盒里做 DeepSeek 分身，再 `wscript launch.vbs` | ChatGPT.exe 命令行是 `chatgpt-desktop.exe --user-data-dir="…\Codex (DeepSeek)"`；`.codex-deepseek` 被写入；站主进程不受影响 |
| 分身（汉化，L-07） | 同上做「智谱」分身（中文名），`launch.vbs` 走 zh-runner | ChatGPT.exe 带 `--remote-debugging-port`；zh.log「attached」「patched page」；通过调试端口读页面：`window.__codexBuddyZh = true`，`getLayer('72216192').get('enable_i18n') = true`。hwy-pc 的系统语言是 en-US，Codex 的界面语言跟系统走，所以页面还是英文；中文界面要在中文系统或把 Codex 语言设成中文时看 |

## 还不一致 / 没法在这里核实的

- **系统标题栏三个按钮**：Windows 的 titleBarOverlay 由系统画，capturePage 截不到；W-01 的位置断言（左栏顶到上边、右边留 150px）通过了，样子要在真机桌面上看一眼。
- **卡片标签文字**：MF 写「按量付费」，PRD §4 术语表写「按用量付费」，按术语表保留「按用量付费」。
- **真实厂商**：这里全是假服务。7 家真实登录、建 Key、充值页地址要在站主登录好的环境里再核（M3 上的 ~/CodexBuddy-Test，之后 Mac mini）。**MiniMax 模型清单只有 MiniMax-M2**：这次去查官方文档，platform.minimaxi.com 302 到 platform.minimax.cn，文档页没取到，清单没改；发布前要在登录的环境里核对 MiniMax 现在的编程模型和 API 域名（api.minimaxi.com 还是 api.minimax.cn）。
- **Windows 真实安装没跑**：沙盒里「开始安装」只是把 Test-ChatGPT.app 写进沙盒，没跑 codex.ps1 / 商店安装（hwy-pc 上已经装着站主的 Codex，真装会动到它）；第 2 步只在 Mac（假 dmg）上算真的装了。真实安装要在一台没装 Codex 的 Windows（或新建的 Windows 用户）上试。
- **Windows 主程序的汉化启动器**（codex.ps1 写的「ChatGPT 汉化版.lnk」）没在真机上跑：它会去开站主的 Codex，并在 Codex 开着时问要不要重启；沙盒里只写替身快捷方式。分身的汉化程序已经在真机上验过（上表）。
- **M-25 每个模型真的能回话、R-01** 只对假服务跑过。
- **分身在任务栏上是不是单独一组**：.lnk 的 AppUserModelID 是 CodexBuddy.<名字>，但窗口是商店包的进程开的，任务栏可能和原来的 ChatGPT 并在一起；要在站主桌面上看一眼。

## 复核修复后的重跑（2026-11-13）

- M3：typecheck、lint、test:cov（512 个测试；行 96.5%、分支 92.1%、函数 92.4%、语句 94.5%）、check:ids（88/88）全过；M3 上没开窗口。
- hwy-pc：test:e2e 89 个通过（U-03 只在 Mac 上跑），含 X-01 / G-01 新加的商店版 Codex 数据目录和快捷方式清单；打包后驱动（m1-drive）一遍通过。
- 截图里能看到的变化：win-05、win-06、win-11 切换成功后画中画关了，最上层卡的「换」露出来；win-29 设置页上不再留着删分身的提示。
