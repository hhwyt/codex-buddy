// data-testid of every clickable control, grouped by the acceptance id that exercises it (approved-spec §3).
// FROZEN by Base: UI agents use these constants (never string literals) so L3 tests and L4 e2e share one source.
// Functions take a vendor id: card ids differ per vendor.

export const TID = {
  // W-01, W-02: shell
  shell: {
    side: 'shell-side',
    navModels: 'nav-models',
    navSettings: 'nav-settings',
    navCommunity: 'nav-community',
    security: 'top-security', // 🛡 S-01
    browser: 'top-browser', // 🌐 B-03
    main: 'shell-main',
  },
  // O-01..O-08: onboarding
  onboarding: {
    root: 'onb-root',
    start: 'onb-start', // 开始安装
    step: (id: string) => `onb-step-${id}`,
    fixing: 'onb-fixing', // 正在帮你修 O-08
    failure: 'onb-failure',
    retry: 'onb-retry', // 再试一次 O-03
    copyLog: 'onb-copy-log', // 复制日志 O-04
    logPreview: 'onb-log-preview',
    toCommunity: 'onb-to-community', // 进群发给我们 O-05
  },
  // M-01..M-28, C-01..C-10: model page
  models: {
    root: 'models-root',
    modeSwitch: 'mode-switch', // 切换 C-09
    modeClone: 'mode-clone', // 分身 C-09
    card: (v: string) => `card-${v}`,
    cardModel: (v: string) => `card-model-${v}`, // M-28 display only
    changeKey: (v: string) => `card-change-key-${v}`, // 换 M-17
    recharge: (v: string) => `card-recharge-${v}`, // 余额 · 去充值 › M-18
    pasteKey: (v: string) => `card-paste-key-${v}`, // hidden level-3 fallback
    rateLimitSwap: (v: string) => `card-rate-limit-${v}`, // 换个模型 M-14
    cloneMake: (v: string) => `clone-make-${v}`, // 做成分身 C-01
    cloneOpen: (v: string) => `clone-open-${v}`, // 打开 C-02
    cloneRemove: (v: string) => `clone-remove-${v}`, // C-07
    addVendor: 'add-vendor', // ＋ 其他厂商 M-19
    customName: 'custom-name',
    customBaseUrl: 'custom-base-url',
    customModel: 'custom-model',
    customKey: 'custom-key',
    customSubmit: 'custom-submit',
    repair: 'codex-repair', // 一键修复 M-15
    reinstall: 'codex-reinstall', // 重新安装 M-16
    reopenHint: 'reopen-hint', // M-21
    tryLater: 'try-later', // 先用着 M-12
  },
  // M-20 first success dialog
  firstSuccess: {
    root: 'first-success',
    seconds: 'first-success-seconds',
    openCodex: 'first-success-open-codex',
  },
  // T-01..T-04, L-01..L-07: settings
  settings: {
    root: 'settings-root',
    zhCard: 'lang-zh', // 汉化版 preview L-02
    enCard: 'lang-en', // 英文原版 preview L-03
    zhTrash: 'lang-zh-trash', // red trash, bottom right of the zh preview L-04
    langMsg: 'lang-msg', // the line under the two previews: progress, 重新打开 / 先不了, failures (L-05, L-06, T-01)
    version: 'settings-version',
    checkUpdate: 'settings-check-update', // T-02
    restore: 'settings-restore', // 一键还原 T-03
  },
  // H-02: 社群 page
  community: {
    root: 'community-root',
    qr: 'community-qr', // 企业微信群码
    xhsQr: 'community-xhs-qr', // 小红书码
  },
  // S-01..S-08: security panel
  security: {
    root: 'security-root',
    key: (v: string) => `security-key-${v}`,
    reveal: (v: string) => `security-reveal-${v}`, // S-02
    manage: (v: string) => `security-manage-${v}`, // S-03
    appSites: 'security-app-sites', // CodexBuddy 连过的 S-04
    webSites: 'security-web-sites', // 网页里连过的 S-04
    askAi: 'security-ask-ai', // S-06
    source: 'security-source', // S-07
    close: 'security-close',
  },
  // B-01..B-07: right-side browser chrome drawn by the page
  browser: {
    pip: 'browser-pip',
    expand: 'browser-expand',
    shrink: 'browser-shrink',
    close: 'browser-close', // ✕ B-04
    back: 'browser-back',
    reload: 'browser-reload',
    address: 'browser-address', // read-only B-05
  },
  // U-01..U-04: update dialog
  update: {
    root: 'update-root',
    later: 'update-later', // 稍后
    now: 'update-now', // 立即更新
    progress: 'update-progress',
  },
  // forced upgrade screen (ui-design/force-upgrade.html v4)
  upgrade: {
    root: 'upgrade-root',
    download: 'upgrade-download', // 下载新版 / 下载并安装
    progress: 'upgrade-progress', // the ring
    ask: 'upgrade-ask', // 有问题？加群咨询
    qr: 'upgrade-qr',
    qrClose: 'upgrade-qr-close',
    reopen: 'upgrade-reopen', // Mac: 再打开安装包
    quit: 'upgrade-quit', // Mac: 退出
  },
  // shared components
  dialog: {
    root: 'dialog',
    confirm: 'dialog-confirm',
    cancel: 'dialog-cancel', // 先不了 T-03
  },
  toast: 'toast',
} as const;
