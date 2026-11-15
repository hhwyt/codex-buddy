# Windows 真实厂商实测工具（docs/m1-device-win.md 用）

在 hwy-pc 上用（包要用 `npm run dist:drive -- --win dir` 打：正式包开了 Electron fuses、不认调试开关，Playwright 连不上）：
- `server.cjs`：放进站主的桌面会话（`schtasks /IT`）跑，用 Playwright `_electron` 启动打包好的 CodexBuddy（沙盒 `C:\Users\hwy\CodexBuddy-Test`，`CODEXBUDDY_REAL_CODEX=1`），在 `127.0.0.1:47123` 收 `/launch`（body 是额外环境变量 JSON，如 `{"CODEXBUDDY_LOGIN_WINDOWS":"1"}`）、`/eval`（body 是一段 async JS，参数 `ctx = { app, page, shot, fs, path }`）、`/quit`。`ctx.shot(name)` 把整个窗口（含右侧浏览器）存成 `shots/real-win-<name>.png`。
- `poll.js`：/eval 用，读 `login-status.json` 和登录分区里的 cookie，看哪家登录好了。
- `models.ps1`：用真的 Codex CLI（商店包里的 codex.exe）和沙盒 CODEX_HOME，给当前菜单里的每个模型各发一句话。
- `cdpshot.cjs <port> <out.png> [js]`：通过汉化启动器开的 127.0.0.1 调试端口截 Codex 界面。
- `kill-sandbox-codex.ps1`：只关沙盒自己的 Codex（命令行里带 CodexBuddy-Test），不碰站主自己的。
