---
name: release
description: 发布 CodexBuddy 新版本（Windows 安装包 + Mac DMG 传到 GitHub Release，更新签名版本配置），或把已发布的版本改成强制升级。每次先和站主确认是普通发布还是强制发布。站主说「发版 / 发布新版本 / 发一个 26.x.x / 强制发布 / 把 X 改成强制」时使用。
---

# 发布 CodexBuddy

规则来自 `design/approved-spec.md` 第一段（F-01..F-05）。

## 第一步：问清楚，再动手

发布会影响所有真实用户，开始前用一条消息问站主，拿到回答再做：

1. **普通还是强制？**
   - 普通发布（默认）：只抬高签名配置的 `latest`。用户左下角看到「有新版本」，想升再升。
   - 强制发布：`latest` 和 `minVersion` 一起抬到这个版本。旧版打开就被拦住，必须升级。
   - 站主没明说「强制」就按普通发布。建议强制的情况：旧版已经用不了（厂商接口变了）、有安全问题或可能弄坏配置和聊天记录、新配置旧版读不懂。
2. **版本号**：年.月.当月第几个（`26.11.1`、`26.11.2`，下个月 `26.12.1`）。先查 GitHub 上这个月已经发到第几个：`gh release list --repo hhwyt/codex-buddy-releases --limit 5`。
3. **从哪份代码发**：默认 `origin/main` 最新提交。分支没合进 main 的，先问站主要不要合并。

## 第二步：打包和发布

在 main 的最新代码上：

```bash
npm version <版本> --no-git-tag-version
```

```bash
npm run lint && npx tsc --noEmit -p . && npx vitest run
```

```bash
npm run dist
```

```bash
npm run dist:mac
```

- `release/` 里要同时有 `CodexBuddy-Setup-<版本>.exe` 和 `CodexBuddy-<版本>.dmg`。
- 提交版本号改动，推送 main（提交信息 `Release <版本>`）。
- 签名私钥从环境变量 `CODEXBUDDY_SIGNING_KEY` 或默认路径读（见 `scripts/sign-remote-config.mjs`），不要打印。

普通发布：

```bash
node scripts/publish-release.mjs
```

强制发布：

```bash
node scripts/publish-release.mjs --force
```

把已经发布的版本改成强制（不重新打包，只改 `minVersion` 并重新签名）：

```bash
node scripts/publish-release.mjs --force-existing <版本>
```

## 第三步：确认

- 线上配置：`curl -s https://hhwyt.xyz/codex-buddy-releases/remote/config.json`，看 `latest.version` 和 `minVersion` 是否符合这次的选择（GitHub Pages 可能要等一两分钟）。
- Release 页面上两个安装包都在、不是草稿。
- 有 Windows 测试机时，用 `hwy-pc` skill 看 `C:\Users\hwy\AppData\Local\CodexBuddy\state.json` 里 `lastRemote` 是否拿到新版本。

告诉站主：发了哪个版本、普通还是强制、两个安装包链接、线上配置里的 `latest` 和 `minVersion`。

## 不要做的

- 不要在站主没确认普通还是强制时发布。
- 不要发和 GitHub 上已有版本同号、但内容不同的安装包（脚本会拒绝，换个版本号）。
- 不要降低 `minVersion`。
- 不要打印签名私钥或 GitHub 令牌。
