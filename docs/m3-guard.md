# M3 保护检查（ChatGPT.app 和 ~/.codex 没被碰）

检查脚本：[scripts/m3-guard.sh](../scripts/m3-guard.sh)，和 `codex-buddy-team/builder/m3-baseline.txt` 同样的检查（codesign 校验 ChatGPT.app、版本号、Info.plist 修改时间、`/Applications` 数目、`~/.codex/config.toml` 和 `auth.json` 的哈希、ChatGPT 进程、`/Applications` 里有没有多出汉化版 / Test- / 分身 App）。只算哈希，不读 ~/.codex 的内容。

2026-11-13 站主改了测试地点后，这台 M3 上**没开任何窗口**：没跑 test:e2e、没跑 Playwright、没启动打包后的 App、没截屏；只跑了 typecheck、lint、vitest（单元 / 集成 / 界面组件）和覆盖率。端到端和驱动打包 App 全在 Windows（hwy-pc）上做。

| 检查 | 基线（m3-baseline.txt，01:45） | 开工前（03:14） | 交付前（04:27） | 一致吗 |
|---|---|---|---|---|
| codesign ChatGPT.app | ok | ok | ok | 一致 |
| 版本号 | 26.1027.61615 | 26.1027.61615 | 26.1027.61615 | 一致 |
| Info.plist 修改时间 | 1793712390 | 1793712390 | 1793712390 | 一致 |
| ~/.codex/config.toml 哈希 | df6cd6ad39ad296c | df6cd6ad39ad296c | df6cd6ad39ad296c | 一致 |
| ~/.codex/auth.json 哈希 | 08e2c23a9456e1d3 | 08e2c23a9456e1d3 | 08e2c23a9456e1d3 | 一致 |
| ChatGPT 进程数 | 1（pid 84510） | 1（pid 84510） | 1（pid 84510，同一个进程） | 一致 |
| /Applications 里多出的 汉化版 / Test- / 分身 App | 无 | 无（见下） | 无（同上，4 个都是站主早就装的） | 一致 |

说明：

- `/Applications` 数目：基线写的是 41，这次两次都是 155。差别来自基线那次 `ls` 在受限的 shell 里跑（看不全），不是我们加的：`ls -lt /Applications` 最新的一个是 2026-11-12 的 Lark.app，这次会话没有往 `/Applications` 写任何东西。
- 脚本的通配 `/Applications/DeepSeek*.app /Applications/Kimi*.app /Applications/Qwen*.app /Applications/智谱*.app` 会匹配到站主自己早就装的 App：DeepSeek.app（2026-10-13，bundle id local.codex-fork.deepseek，站主之前用 codex-deepseek-fork 做的）、Kimi Code.app（com.kimi.code.desktop）、Qwen.app（com.qwen.chat）、智谱清言.app（com.zhipu.chatglm），修改时间都早于今天，不是 CodexBuddy 生成的。没有「汉化版」、没有 `Test-` 开头的 App。
