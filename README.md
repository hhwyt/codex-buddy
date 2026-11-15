# Codex 搭子

**一键装好 Codex，免费用 AI。**

下载、双击、用微信扫一下码，Codex 就装好了，用的是智谱的免费模型，不用科学上网，不花一分钱。装好以后，还能在搭子里切换模型、切换中文 / 英文界面、改常用设置，或者一键还原到安装前的样子。

第一版只支持 Windows 10 和 Windows 11。

## 能做什么

**安装（4 个画面）**

1. 欢迎：点「开始」，计时器开始走。
2. 扫码：用微信扫码登录智谱。搭子会用你自己的智谱账号建一个 API Key，只保存在你的电脑上。
3. 自动进行：检测电脑、安装 Codex、获取免费 Key、配置模型、测试连通，一行一行打勾。遇到常见问题会自己修，修不好就给你「一键复制日志」。
4. 完成：显示「从零到能用」用了多少秒，点「打开 Codex」就能用。

**装好以后**

- 切换模型：智谱免费（排第一）、智谱付费、OpenAI 官方账号登录、其他厂商（自己填地址、Key、模型名）。每次切换前自动备份；切换后自动测试，测通了才保存。
- 中文 / 英文：汉化版和英文原版一键切换，不用重装。
- 常用设置：「AI 改文件前要不要问我」「思考深度：快 / 平衡 / 深」。
- 还原：一键回到安装前的样子。

## 安全

- Key 只存在你自己的电脑上。搭子留着备用的 Key 用 Windows 自带的加密（DPAPI）保存，只有你这个 Windows 账号能解开。
- 日志和报错里不出现明文 Key，「复制日志」复制出来的内容也没有。
- 不收费、不中转：Codex 直接连智谱（或你选的厂商），中间不经过我们的服务器。

## 它是怎么做的

- 外壳是 [Electron](https://www.electronjs.org/)，自带浏览器内核，Windows 10 老电脑不用另外装组件。整个项目只用 TypeScript。
- 安装的核心逻辑直接用开源项目 [codex-install-made-easy](https://github.com/hhwyt/codex-install-made-easy) 的 `codex.ps1`，没有重写：下载官方 Codex 并校验、国内镜像和微软商店自动选源、断点续传、管理员授权、扫码建 Key、测出可用的免费模型、汉化版，以及几种已知故障的处理。搭子打开它的「机器可读进度」开关（`CODEX_SETUP_STEPS=1`），读 `STEP:<id>:<start|done|fail>:<说明>` 这样的行来驱动界面。
- 装好以后的管理功能（读写 Codex 的配置、切换、测试、还原）在主进程 [`electron/buddy.ts`](electron/buddy.ts)。

```
electron/main.ts            主进程：运行 codex.ps1、按行读 STEP 输出、内嵌智谱登录页
electron/buddy.ts           主进程：读写配置，切换模型、版本、设置、还原
electron/preload.ts         界面和主进程之间的桥
ui/                    界面（HTML/CSS + TypeScript，编译到 ui/build/）
  backend.ts           在 App 里调主进程；在普通浏览器里是模拟后端（预览模式）
scripts/vendor/codex.ps1  从 codex-install-made-easy 同步过来的安装脚本
scripts/preview.sh     在 Mac 的浏览器里预览界面
docs/preview-scenario.md  预览的点击路线
```

## 在浏览器里预览界面

不需要 Windows，在 Mac 上就能把所有画面点一遍（后端是模拟的，不会改你的电脑）：

```bash
npm install
scripts/preview.sh
```

然后打开 <http://127.0.0.1:5180/>。点击路线见 [docs/preview-scenario.md](docs/preview-scenario.md)。

## 构建

产物是一个一键安装包 `CodexBuddy-Setup-<版本>.exe`（NSIS，双击就装、装完自动打开，不用点「下一步」），约 88 MB。推到 `main` 后 GitHub Actions 会在 Windows 上构建一份（见 [.github/workflows/build.yml](.github/workflows/build.yml)）；在 Mac 上也能直接打：

```bash
npm install
npm run dist
```

还没有代码签名，第一次打开时 Windows 可能提示「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」。

## 赞助商

搭子里「其他厂商」上方留了一个「推荐厂商」的位置，会明确标注「赞助」。免费的智谱永远排第一。

想合作请联系：（联系方式待补充）

## 协议

[GNU AGPL-3.0-only](LICENSE)，Copyright (C) 2026 北京序变科技有限公司。

改了代码并拿去给别人用（包括通过网络提供服务），要按同一协议公开你改过的源代码。想贡献代码先看 [CONTRIBUTING.md](CONTRIBUTING.md)（需要签 [CLA](CLA.md)）。
