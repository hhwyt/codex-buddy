# 发布

客户端从 [GitHub Pages](https://hhwyt.xyz/codex-buddy-releases/remote/config.json) 获取版本配置，并读取同目录的 `config.json.sig`。备用地址为 GitHub Pages 默认域名、jsDelivr 和 GitHub Raw。只有内置公钥验签通过的在线响应才能放行；本机缓存和内置配置仅用于展示。

## 安装包与版本配置

安装包发布到公开仓库 [codex-buddy-releases](https://github.com/hhwyt/codex-buddy-releases/releases)，源码仓库保持私有。下载直链固定到具体版本，例如 `https://github.com/hhwyt/codex-buddy-releases/releases/download/v0.2.2/CodexBuddy-Setup-0.2.2.exe`。

应用通过 GitHub 官方 API 查找同一版本、同一文件名和同一直链对应的安装包，再使用文件下载接口获取字节。下载完成后必须符合签名配置中的 SHA-256；校验失败不执行，缓存的安装包也必须重新核对哈希。

## 发布命令

1. 设置 `package.json` 与锁文件的版本，运行静态检查、测试和打包。
2. Windows 使用 `npm run dist`，Mac 使用 `npm run dist:mac`。安装包名称分别为 `CodexBuddy-Setup-<版本>.exe`、`CodexBuddy-<版本>.dmg`。CI 将构建包保存在私有源码仓库的草稿 Release。
3. 将两个安装包放进同一目录，执行 `npm run release:publish -- <安装包目录>`。需要已登录的 GitHub CLI 和本机签名私钥。

发布脚本计算两个安装包的哈希，生成并签署版本配置，发布公开 Release，再用一次 Git 提交发布 `remote/config.json` 和签名。`latest.version` 与 `minVersion` 都设为当前包版本。源仓库内置的配置只提供离线展示，不随发布命令改写。草稿允许补齐缺失安装包，已发布版本的安装包不可替换；重复执行必须核对文件哈希。

私钥位于 `~/.codexbuddy/remote-config-ed25519.pem`，不上传到 GitHub。签名脚本会核对内置公钥；私钥不匹配时停止发布。配置与签名必须成对发布，签署后不可修改文件字节。

## 联网与强制升级

启动时先检查联网状态并校验签名版本配置。运行中每 60 秒检查版本，恢复前台或电脑唤醒时也会检查。未取得有效在线版本配置时不能使用功能。

当前版本低于最低版本时，弹窗只显示「升级后继续使用」「请升级到 <版本>」，保留「退出 CodexBuddy」「立即升级」。界面与后台功能接口同时限制，不能关闭弹窗继续使用。客户端保存接受过的最高最低版本，降低服务端下限、断网或还原配置都不能解除限制。

Windows 下载并验证安装包后退出程序，由安装包替换程序并打开新版。每用户安装目录、应用标识和数据目录保持固定；卸载设置禁止删除用户数据。CodexBuddy 的密钥与设置、Codex 聊天目录均保留。启动时本机转接地址的临时端口可以变化，模型和账号设置必须保留。

Mac 构建为 Intel 与 Apple 芯片通用 DMG，使用 ad-hoc 签名。下载后打开 DMG，用户将应用拖进「应用程序」完成替换。

## 正式包检查

正式包启用 `package.json` 中的 Electron fuses，禁止 DevTools、调试开关与测试环境覆盖，仅从完整性校验的 `app.asar` 加载。驱动测试包允许调试，不能发布给用户。

Windows 升级验证使用两个实际发布的安装包。升级前备份并记录聊天文件、配置、加密密钥的哈希；升级后核对实际运行版本、受保护文件与模型设置，检查代理仍关闭。
