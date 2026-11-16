# 发布

## 发布远程配置

所有装好的 CodexBuddy 都会去读 GitHub 上的 [`remote/config.json`](../remote/config.json)（先 jsDelivr，再 GitHub），同时读旁边的 `remote/config.json.sig`。签名对不上、或者没有签名的配置一律不用，当作连不上（用上次存下的那份）。

改 `remote/config.json` → `node scripts/sign-remote-config.mjs` → 提交 `config.json` 和 `config.json.sig`；强制升级就把 `minVersion` 改成要求的版本。

- 两个文件必须在同一个提交里改。只改了 `config.json` 没重新签名，所有 App 都会拒收。
- 发新版：推 `v<版本>` 标签，GitHub Actions（[`release.yml`](../.github/workflows/release.yml)）打 Windows 安装包和 Mac dmg 并发到 Releases；之后在本机把 `latest.version` 和下载直链改成新版、签名、提交。CI 上没有私钥，所以这一步不能交给 CI。
- 签名脚本签的是文件的原样字节，签完不要再动 `config.json`（连空格和换行都不行）。
- jsDelivr 有缓存，配置和签名可能一新一旧，这时 App 会自动改读 GitHub 的；想马上生效可以去 jsDelivr 清缓存。
- 签名脚本会先用 App 里内置的公钥（[`electron/core/remote-key.ts`](../electron/core/remote-key.ts)）验一遍，私钥不对就报错，不会写出 `.sig`。

### 强制升级（minVersion）

- 正在用的版本低于 `minVersion` 时，App 会挡住所有页面，只让用户去下载最新版（`latest` 里的下载地址）。Codex 本身不受影响。
- 只升不降：App 记住自己接受过的最高 `minVersion`（加密存在本机），之后配置里改低、断网、一键还原都不会放开。要放开只能发一个更高版本的 App。
- 用户从来没取到过远程配置（比如第一次打开就没网）时不拦。
- `latest.version` 要不低于 `minVersion`，否则用户下载到的还是被拦的版本。
- 挡住时整个窗口是升级页（强制升级原型第 4 版）：点按钮后 App 自己下载，圆环显示进度。Mac 下好打开 dmg，教用户拖进「应用程序」；Windows 下好运行安装包（旧版退出，装好打开新版）。
- 所以 `latest.macUrl` / `latest.winUrl` 必须是**安装包本身的直链**（如 `https://github.com/hhwyt/codex-buddy/releases/download/v0.2.0/CodexBuddy-0.2.0.dmg`），不能是发布页；Mac 发 `npm run dist:mac` 出的 `release/CodexBuddy-<版本>.dmg`。地址只能在 GitHub / jsDelivr 上，否则整份配置不认。

### 签名密钥

- 私钥只在站主电脑上：`~/.codexbuddy/remote-config-ed25519.pem`（权限 0600），不进仓库（`.gitignore` 挡了 `*.pem`）。也可以用环境变量 `CODEXBUDDY_SIGNING_KEY` 给（私钥 PEM 原文或文件路径）。
- 私钥丢了就再也发不出 App 认的新配置（包括强制升级），只能换一把新钥匙、发新版 App。请把私钥另外备份到安全的地方（比如密码管理器）。
- 换钥匙：`node scripts/gen-signing-key.mjs --force`，把打印出的公钥写进 `electron/core/remote-key.ts`，重新签名，发新版 App。旧版 App 只认旧公钥，换完之后它们收不到新配置。

## 打包

- 正式包：Mac `npm run dist:mac` → `release/CodexBuddy-<版本>.dmg`（Intel + Apple 芯片通用，ad-hoc 签名：没有 Apple 开发者证书，浏览器下载的要右键「打开」放行一次；App 内强制升级自己下的不带隔离标记，直接能开），Windows `npm run dist`。打包时 electron-builder 按 `package.json` 里 `build.electronFuses` 打开 Electron fuses：不认 `NODE_OPTIONS` 和 `--inspect`，只从 `app.asar` 加载代码并校验它的完整性，cookie 加密存。`runAsNode` 保持打开，因为汉化版启动器要用 CodexBuddy 自己的 Electron 跑 `zh-runner.js`。另外正式包打不开 DevTools，命令行带 `--remote-debugging-port`、`--inspect` 之类的开关会直接退出（[`electron/main/hardening.ts`](../electron/main/hardening.ts)）。
- 查 fuses：`npx @electron/fuses read --app release/mac-universal/CodexBuddy.app`。
- 驱动测试（[`test/drive`](../test/drive)）用的包：`npm run dist:drive -- --mac dir` 或 `npm run dist:drive -- --win dir`。它不开 fuses、可以调试，只给 Playwright 用，不能发给用户。
