# CodexBuddy

[English](README.md) | **简体中文**

**一键装好 OpenAI 的 Codex，在任意模型之间一键切换。**

- **一键安装**：下载官方 Codex 并装好，不用敲命令。
- **支持很多模型**：OpenAI 官方账号、DeepSeek、智谱（免费）、Kimi、通义（Qwen）、MiniMax、混元，也能手动加任意厂商。
- **一键切换**：Codex 在这些模型之间点一下就切换，Key 自动建好、测通。
- **右侧内置浏览器**：登录账号、微信扫码、充值都在厂商官网页面里完成，不用离开 App。
- **分身**：把一个模型做成独立的 App，有自己的图标和聊天记录，能和原版同时开。
- **汉化**：Codex 在英文和中文之间切换，不用重装。
- **一键还原**：随时恢复成用 CodexBuddy 之前的样子。

CodexBuddy 帮你装好 Codex 桌面 App，并把它接到国产模型厂商：DeepSeek、智谱、Kimi、通义（Qwen）、MiniMax、混元。不用科学上网，不用敲命令，不用改配置文件。用微信扫一下码，CodexBuddy 就在厂商官网上用你自己的账号建好 API Key，测通以后把 Codex 切过去。

支持 macOS（Intel 和 Apple 芯片）和 Windows 10 / 11。

## 能做什么

**第一次打开**

点「开始安装」。CodexBuddy 下载官方的 Codex App 并装好，每一步在进度圆环下面打勾。电脑上已经装了 Codex 的，原样保留，不动它。

**切换模型**

每家厂商是一张银行卡，叠在一起，正在用的那张在最上面。

- 点一张卡（或把它拖到最上面）就切换。第一次切到某家时，右边会打开它的官方登录页：微信扫码后，CodexBuddy 在你的账号里建好 Key，测通了才保存。
- 没测通就什么都不改，卡片抖一下退回原位。
- 可以换 Key、在官方页面充值，或者手动添加其他厂商（填地址、Key、模型名）。
- 你在 Codex 里选的模型会显示在卡上。

**分身**

把某一家做成一个独立的 App，比如带 DeepSeek 图标的「DeepSeek」。每个分身有自己的聊天记录和设置，能和原来的 Codex 同时开。

**中文界面**

Codex 的英文原版和汉化版一键切换，不用重装。

**一键还原**

把一切恢复到装 CodexBuddy 之前的样子：Codex 的配置、汉化版入口、分身。聊天记录保留。

**社群**

「社群」页有作者的微信二维码（加好友后拉你进交流群）和小红书账号。每个报错都带「去社群咨询」：点了会复制日志（Key 已打码），再打开这一页。

**更新**

普通发布只在左侧导航最下面亮起「有新版本」，想更新时再点。强制发布只在旧版已经用不了或不安全时使用，会要求先更新再继续用；更新失败可以「本次先跳过」，下次打开再提示。更新只下载安装包里变了的部分，通常一两 MB，断网后接着下。

## 隐私和安全

- **Key 只在你自己的电脑上。** 用 AES-256-GCM 加密保存，加密用的钥匙存在同一个只有你自己能读的文件夹里。这能防止 Key 被误复制或误上传，但挡不住已经在你电脑上运行的恶意程序。日志和复制出去的报错里都不会出现 Key。
- **不经过中间人。** Codex 直接连你选的厂商。CodexBuddy 自己没有服务器；只提供 Chat 接口的厂商，会在本机 127.0.0.1 上跑一个小转接。
- **只连少数几个地址。** CodexBuddy 自己只连 GitHub、jsDelivr 和各家厂商自己的域名。🛡 面板里列出了它和内置浏览器连过的每一个地址。
- **远程设置带签名。** 模型列表、最低版本、社群码来自 [`remote/config.json`](remote/config.json)，用 Ed25519 签名。签名对不上的配置，App 一律不用。
- **可以自己查。** 🛡 面板能复制一段提示词，让 AI 帮你审查这份源代码。
- **汉化版调试端口。** 汉化版运行期间，ChatGPT 会在本机 127.0.0.1 上开一个随机调试端口。网页连不上它，但同一台电脑上的其他程序能连。

## 它是怎么做的

只用 [Electron](https://www.electronjs.org/) 和 TypeScript。

```
electron/
  app.ts          入口：窗口、服务、网络白名单
  core/           和平台无关的逻辑：厂商、切换、模型清单、远程配置、还原、白名单
  main/           主进程：IPC、右侧浏览器、本机转接、加密、加固
  platform/       macOS 和 Windows：装 Codex、分身、汉化版入口
  vendors/        每家厂商的登录和建 Key
ui/               界面（TypeScript + CSS，编译到 ui/build/）
remote/           远程配置和它的签名
scripts/          签名、打包，以及 Windows 安装脚本 codex.ps1
test/             单元、集成、界面、端到端测试
docs/             发布说明和真机测试记录
```

Windows 上安装 Codex 直接用 [codex-install-made-easy](https://github.com/hhwyt/codex-install-made-easy) 的 `codex.ps1`，读它的机器可读进度行（`STEP:<id>:<start|done|fail>:<说明>`）。

## 开发

需要 Node.js 22。

```bash
npm install
npm start            # 编译并运行
npm test             # 单元、集成、界面测试
npm run test:cov     # 同上，带覆盖率（最低 85%）
npm run test:e2e     # 端到端：真的 Electron App，在沙盒里连假的服务器
npm run lint         # 类型检查和源码扫描
```

测试不会碰你真实的 `~/.codex` 和已经装好的 App：每次运行都用一个用完就扔的沙盒。

## 打包

```bash
npm run dist         # Windows 安装包：release/CodexBuddy-Setup-<版本>.exe
npm run dist:mac     # macOS：release/CodexBuddy-<版本>.dmg（Intel 和 Apple 芯片通用）
```

暂时还没有用付费证书签名。Windows 上 SmartScreen 可能提示「Windows 已保护你的电脑」：点「更多信息 → 仍要运行」。macOS 上第一次打开时，右键 App 选「打开」。版本号是「年.月.当月第几个」（26.11.1 是 2026 年 11 月第一个版本）。发版流程见 [docs/release.md](docs/release.md)。

## 协议

[GNU AGPL-3.0-only](LICENSE)，Copyright (C) 2026 北京序变科技有限公司。

如果你改了 CodexBuddy 并给别人用（包括通过网络提供服务），必须按同一协议公开你改过的源代码。想贡献代码请先看 [CONTRIBUTING.md](CONTRIBUTING.md)；贡献需要签 [CLA](CLA.md)。
