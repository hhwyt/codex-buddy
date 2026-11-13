# M1 行为核对：Windows 上亲自驱动打包后的 App

- 机器：hwy-pc（Windows 11），站主远程桌面登录的桌面会话（schtasks /IT）。驱动脚本 [test/drive/m1-drive.spec.ts](../test/drive/m1-drive.spec.ts)，配置 [playwright.drive.config.ts](../playwright.drive.config.ts)。
- 对象：`npx electron-builder --win dir` 打出来的 `release\win-unpacked\CodexBuddy.exe`（Playwright `_electron` 的 executablePath 指向它），不是源码直跑。
- 沙盒：`CODEXBUDDY_SANDBOX` 是新的临时目录；`CODEXBUDDY_ENDPOINTS` 把 7 家接口、远程配置全指向本机假服务（test/fakes）。Codex 是沙盒里的 Test-ChatGPT.app（自己的 bundle id、关自动更新，命令行是假 Codex）。打开 App / 在文件夹里显示 / 外部链接一律只记到 `<沙盒>/opened.log`，什么都不真的打开。站主自己的 Codex（OpenAI.Codex 26.1103.4239.0）和 `%USERPROFILE%\.codex` 没动。
- 测试模式下窗口在屏幕外（x = -30000）、显示时不抢焦点（m1-decisions 2026-11-13）；截图用 Electron 自己的 capturePage，把主页面和右侧浏览器（WebContentsView）按位置拼起来，所以截图里有右侧浏览器，但没有系统画的标题栏三个按钮。
- 截图：`docs/screenshots/win-*.png`；每步的说明在 [win-drive-log.json](screenshots/win-drive-log.json)。
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

## 还不一致 / 没法在这里核实的

- **系统标题栏三个按钮**：Windows 的 titleBarOverlay 由系统画，capturePage 截不到；W-01 的位置断言（左栏顶到上边、右边留 150px）通过了，样子要在真机桌面上看一眼。
- **卡片标签文字**：MF 写「按量付费」，PRD §4 术语表写「按用量付费」，按术语表保留「按用量付费」。
- **画中画里留着上一家的 Key 管理页**（win-05、win-06）：切换成功后浏览器缩回画中画、保留最后一个页面，这是 B-03 的行为；站主之前在 M3 上把它当成了 bug（D「实测发现」）。要不要在切换成功后自动关掉画中画，需要站主定。
- **真实厂商**：这里全是假服务。7 家真实登录、建 Key、模型清单（尤其 MiniMax 只列了 MiniMax-M2）、充值页地址，要在站主登录好的环境里再核（M3 上的 ~/CodexBuddy-Test，之后 Mac mini）。
- **真实 Windows 安装、汉化、分身启动**：沙盒里不跑 codex.ps1、不启动商店版 Codex；分身的 launch.vbs 能不能让商店版 Codex.exe 和原来的同时开（spike d）还没在真机上试。
