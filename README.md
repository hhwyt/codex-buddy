# CodexBuddy

**English** | [简体中文](README.zh-CN.md)

> **Noncommercial only.** CodexBuddy is licensed under [CC BY-NC-SA 4.0](LICENSE): free for personal and noncommercial use; commercial use is not permitted; modified versions must be shared under the same license.

**Install OpenAI's Codex in one click and switch it between any models.**

- **One-click install**: downloads the official Codex app and sets it up, no command line.
- **Many models**: your official OpenAI account, DeepSeek, Zhipu (free), Kimi, Qwen, MiniMax, Hunyuan, or any provider you add by hand.
- **One-click switching**: move Codex between any of these models in a click; keys are created and tested for you.
- **Built-in browser on the right**: sign in, scan the WeChat code and top up on each provider's official page without leaving the app.
- **Clones (分身)**: turn a model into its own app with its own icon and chat history, running next to the original.
- **Chinese interface (汉化)**: switch Codex between English and Chinese without reinstalling.
- **One-click restore**: put everything back the way it was.

## Download

Download the installer and run it; there is nothing to build. Open the **[latest release](https://github.com/hhwyt/codex-buddy-releases/releases/latest)** and pick the file for your computer:

| Computer | File | Install |
|---|---|---|
| Windows 10 / 11 | `CodexBuddy-Setup-<version>.exe` | Double-click it. If Windows says "Windows protected your PC", choose More info → Run anyway. |
| Mac (Intel or Apple silicon) | `CodexBuddy-<version>.dmg` | Open it and drag CodexBuddy into Applications. The first time, right-click the app and choose Open. |

Once installed, the app tells you when a new version is out; you don't need to come back here.

CodexBuddy installs the Codex desktop app for you and connects it to a Chinese model provider: DeepSeek, Zhipu (智谱), Kimi, Qwen (通义), MiniMax or Hunyuan (混元). No VPN, no command line, no config files. Scan a QR code with WeChat, and CodexBuddy gets an API key from your own account on the provider's official site, tests it, and switches Codex over.

It runs on macOS (Intel and Apple silicon) and Windows 10 / 11.

## What it does

**First run**

Click 开始安装 (Install). CodexBuddy downloads the official Codex app and installs it, ticking off each step under a progress ring. If Codex is already installed, it is left as it is.

**Switching models**

Every provider is a bank card in a stack; the one in use sits on top.

- Click a card (or drag it to the top) to switch. The first time, the provider's official sign-in page opens on the right: scan with WeChat, and CodexBuddy creates a key in your account and tests it before saving anything.
- If the test fails, nothing changes and the card shakes back into place.
- Change the key, top up your balance on the official page, or add another provider by hand (base URL, key, model).
- The model you pick inside Codex shows on the card.

**Clones (分身)**

Turn a provider into its own app, for example a "DeepSeek" app with DeepSeek's icon. Each clone has its own chat history and settings and can run next to the original Codex.

**Chinese interface**

Switch Codex between its English original and a Chinese translation without reinstalling.

**One-click restore**

Put everything back the way it was before CodexBuddy: your Codex configuration, the Chinese launcher and the clones. Chat history is kept.

**Community**

The 社群 page has the author's WeChat QR code (add it and you are invited to the user group) and Xiaohongshu account. Every error message has a 去社群咨询 (ask the community) link: it copies the log with keys masked and opens this page.

**Updates**

A normal release only lights up 有新版本 (new version) at the bottom of the sidebar; update when you like. A forced release, used only when older versions stop working or are unsafe, asks you to update before going on; if that update fails you can skip it until the next start. Updates download only the parts of the installer that changed, usually 1–2 MB, and resume after a dropped connection.

## Privacy and security

- **Your keys stay on your computer.** They are encrypted with AES-256-GCM; the encryption key is stored in the same owner-only folder. This protects against keys being copied or uploaded by mistake, not against malware already running on your computer. Keys never appear in logs or copied error reports.
- **No middleman.** Codex talks to the provider you chose directly. CodexBuddy has no server of its own; when a provider only offers a Chat-style API, a small bridge runs locally on 127.0.0.1.
- **Short allow-list.** CodexBuddy itself only connects to GitHub, jsDelivr and the providers' own domains. The 🛡 panel lists every host it and the built-in browser have contacted.
- **Signed remote settings.** The model list, minimum version and community code come from [`remote/config.json`](remote/config.json), signed with Ed25519. The app ignores any copy whose signature does not match.
- **Check it yourself.** The 🛡 panel can copy a prompt that asks an AI to review this source code for you.
- **Chinese-interface debug port.** While the Chinese interface is running, ChatGPT opens a random debug port on 127.0.0.1 on this computer. Web pages cannot reach it, but other programs on the same computer can.

## How it is built

[Electron](https://www.electronjs.org/) and TypeScript only.

```
electron/
  app.ts          entry: windows, services, network guard
  core/           platform-free logic: providers, switching, catalogs, remote config, restore, allow-list
  main/           main process: IPC handlers, right-side browser, local bridge, encryption, hardening
  platform/       macOS and Windows: install Codex, clones, Chinese launcher
  vendors/        sign-in and key creation for each provider
ui/               the interface (TypeScript + CSS, compiled to ui/build/)
remote/           remote config and its signature
scripts/          signing, packaging and the vendored Windows installer (codex.ps1)
test/             unit, integration, UI and end-to-end tests
docs/             release notes and device test reports
```

The Windows installation of Codex reuses `codex.ps1` from [codex-install-made-easy](https://github.com/hhwyt/codex-install-made-easy) and reads its machine-readable progress lines (`STEP:<id>:<start|done|fail>:<text>`).

## Develop

Node.js 22.

```bash
npm install
npm start            # build and run
npm test             # unit, integration and UI tests
npm run test:cov     # the same with coverage (85% minimum)
npm run test:e2e     # end to end: the real Electron app, sandboxed, against fake servers
npm run lint         # type check and source scan
```

Tests never touch your real `~/.codex` or installed apps: every run uses a throw-away sandbox.

## Build

```bash
npm run dist         # Windows installer: release/CodexBuddy-Setup-<version>.exe
npm run dist:mac     # macOS: release/CodexBuddy-<version>.dmg (Intel + Apple silicon)
```

Builds are not signed with a paid certificate yet. Versions are year.month.n (26.11.1 is the first release of November 2026). Releasing is described in [docs/release.md](docs/release.md).

## License

[CC BY-NC-SA 4.0](LICENSE). Copyright (C) 2026 [hhwyt](https://github.com/hhwyt).

**No commercial use.** You may read, run and modify CodexBuddy for personal and other noncommercial purposes. Selling it, bundling it into a paid product or service, or using it in a business is not permitted without a separate commercial license from the copyright holder. If you modify CodexBuddy and share it, you must credit the original and release your version under this same license.
