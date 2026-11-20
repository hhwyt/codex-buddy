/* ---------- building blocks ---------- */
function qr(seed) {
  let x = seed * 9301 + 49297; const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const N = 25, cells = [];
  const finder = (r, c) => { for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const edge = i === 0 || i === 6 || j === 0 || j === 6, core = i > 1 && i < 5 && j > 1 && j < 5; if (edge || core) cells.push([r + i, c + j]); } };
  const inF = (r, c) => (r < 8 && c < 8) || (r < 8 && c > N - 9) || (r > N - 9 && c < 8);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!inF(r, c) && rnd() > 0.52) cells.push([r, c]);
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  return `<svg viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${cells.map(([r, c]) => `<rect x="${c}" y="${r}" width="1" height="1" fill="#111"/>`).join('')}</svg>`;
}

const NAV = ['模型', '设置', '帮助'];
function win({ nav, main, full, browser, pip, overlay, drawer, icons = true, on = '' }) {
  const wide = !!browser;
  return `<div class="win${wide ? ' wide' : ''}">
    <div class="tb"><span class="dots"><i></i><i></i><i></i></span>CodexBuddy
      ${icons ? `<span class="icons"><span class="${on === 'shield' ? 'on' : ''}">🛡</span><span class="${wide ? 'on' : ''}">🌐</span></span>` : ''}</div>
    <div class="body">
      ${nav ? `<div class="nav">${NAV.map((n) => `<div class="${n === nav ? 'on' : ''}">${n}</div>`).join('')}</div>` : ''}
      <div class="main${full ? ' full' : ''}" style="${full ? '' : ''}">${main}${drawer || ''}</div>
      ${browser ? `<div class="browser"><div class="addr">‹ ↻ <span class="u">🔒 ${browser.url}</span><span title="缩小成画中画">⤡</span>✕</div><div class="page">${browser.page}</div></div>` : ''}
      ${pip ? `<div class="pip"><div class="pb"><span class="live"></span>${pip.url}<span style="margin-left:auto">⤢ ✕</span></div><div class="pp"><div class="page">${pip.page}</div></div></div>` : ''}
      ${overlay ? `<div class="mask">${overlay}</div>` : ''}
    </div></div>`;
}
function status(t, sub, btn, alert) {
  return `<div class="status${alert ? ' alert' : ''}"><div><div class="t">${t}</div>${sub ? `<div class="small">${sub}</div>` : ''}</div>${btn || ''}</div>`;
}
function cards({ cur = '', grayOpenAI = true, zhipuPaid = false } = {}) {
  const tile = (name, logo, color, tag, opt = {}) => {
    const on = cur === name;
    return `<div class="tile${on ? ' on' : ''}${opt.grey ? ' grey' : ''}">
      ${on ? '<span class="check">✓</span>' : ''}
      <span class="logo" style="background:${color}">${logo}</span>
      <div class="nm">${name}</div>
      <div class="meta">${opt.zhipu ? `<span class="mseg"><span class="${zhipuPaid ? '' : 'on'}">免费</span><span class="${zhipuPaid ? 'on' : ''}">增强</span></span>${zhipuPaid ? '<span class="ico">¥</span>' : ''}` : `<span class="tag${opt.free ? ' free' : ''}">${tag}</span>${opt.charge ? '<span class="ico" title="去充值">¥</span>' : ''}`}${on ? '<span class="ico">⋯</span>' : ''}</div>
    </div>`;
  };
  return `<div class="tiles">
    ${tile('DeepSeek', 'D', '#4d6bfe', '按量付费', { charge: true })}
    ${tile('智谱', '智', '#1f6feb', '', { zhipu: true })}
    ${tile('OpenAI 官方账号', 'O', '#111827', grayOpenAI ? '打不开网站' : 'ChatGPT 账号', { grey: grayOpenAI })}
    <div class="tile add"><span class="plus">＋</span><div class="nm">其他厂商</div></div>
  </div>`;
}
const LOGO = { 'D':'https://fe-static.deepseek.com/chat/icon-180.png', '智':'https://bigmodel.cn/static/images/favicon.png', 'O':'https://cdn.oaistatic.com/assets/apple-touch-icon-mz9nytnj.webp' };
const lg = (m, z) => LOGO[m.l] ? `<img class="lg" src="${LOGO[m.l]}" alt="" style="width:${z}px; height:${z}px; border-radius:${Math.round(z*.26)}px; object-fit:cover; box-shadow:inset 0 0 0 .5px rgba(0,0,0,.1)">` : `<span class="lg" style="width:${z}px; height:${z}px; font-size:${Math.round(z*.45)}px; border-radius:${Math.round(z*.26)}px; background:${m.c}">${m.l}</span>`;
function wallet([t, sub, btn, alert], { cur = '', pick = '', zhipuPaid = false } = {}) {
  const front = pick || cur;
  const M = [
    { n:'DeepSeek', l:'D', c:'#4d6bfe', tag:'按量付费', pay:true },
    { n:'智谱', l:'智', c:'#1f6feb', tag: zhipuPaid ? '增强' : '免费', zhipu:true, pay:zhipuPaid },
    { n:'OpenAI 官方账号', l:'O', c:'#111827', tag:'打不开网站', grey:true },
  ];
  const strip = (m) => `<div class="wk${m.grey ? ' grey' : ''}">${lg(m, 40)}${m.n}<span class="tg${m.n === cur ? ' cur' : ''}">${m.n === cur ? '✓ 正在用' : m.tag}</span></div>`;
  const add = '<div class="wk add">＋ 其他厂商</div>';
  if (!front) return `<div class="wl"><div class="wl-h">${t}</div>${M.map(strip).join('')}${add}</div>`;
  const m = M.find((x) => x.n === front), using = t.startsWith('正在用');
  const head = `<div class="hd">${lg(m, 44)}${m.n}${m.zhipu ? `<span class="mseg"><span class="${zhipuPaid ? '' : 'on'}">免费</span><span class="${zhipuPaid ? 'on' : ''}">增强</span></span>` : ''}${using ? '<span class="ok-t pulse-ok">✓ 能用</span>' : ''}</div>`;
  const body = using ? `<div class="sb">${sub}</div>`
    : `<div class="st${alert ? ' err' : ''}">${alert ? '' : '<span class="mk run"></span>'}${t}</div>${sub ? `<div class="sb" style="padding-left:0">${sub}</div>` : ''}`;
  const icons = front === cur ? (m.pay ? '<span class="ico">¥</span>' : '') + '<span class="ico">⋯</span>' : '';
  const rest = M.filter((x) => x.n !== front);
  return `<div class="wl top">
    <div class="wk front${alert ? ' alert' : ''}" style="z-index:${rest.length + 2}">${head}${body}<div class="ft">${icons}${btn || ''}</div></div>${rest.map((m, i) => strip(m).replace('<div class="wk', `<div style="z-index:${rest.length - i}" class="wk`)).join('')}${add.replace('wk add', 'wk add after')}</div>`;
}
function switchDlg(name, steps, res, host) {
  const m = (s, l) => `<div class="s"><span class="mk ${s}">${s === 'ok' ? '✓' : s === 'bad' ? '✗' : ''}</span>${l}</div>`;
  return `<div class="dlg"><h3>切换到：${name}</h3>
    <div class="steps3">${m(steps[0], '备份')}<div class="bar"></div>${m(steps[1], '测试连通')}<div class="bar"></div>${m(steps[2], '保存')}</div>
    <div class="beam"><span class="node">💻</span><span class="ln"></span><span class="node">☁</span><span>${host}</span></div><div class="small">看明细 ▸</div>${res || ''}</div>`;
}
const zhipuLogin = { url: 'open.bigmodel.cn/login', page: `<div class="qr">${qr(1)}</div><div>微信扫码登录 / 注册</div>` };
const zhipuKeys = { url: 'open.bigmodel.cn/usercenter/apikeys', page: `<div style="font-size:22px; color:#222">API Keys</div><div class="row" style="gap:10px"><span class="mk run" style="display:inline-flex"></span>新建 Key：CodexBuddy</div><div class="small">sk-••••a3f9</div>` };
const dsLogin = { url: 'platform.deepseek.com/sign_in', page: `<div class="qr">${qr(2)}</div><div>微信扫码或手机号登录</div>` };
const dsPay = { url: 'platform.deepseek.com/top_up', page: `<div style="font-size:22px; color:#222">充值</div><div class="row"><span class="btn">¥10</span><span class="btn">¥50</span><span class="btn">¥100</span></div><div class="qr" style="width:150px; height:150px">${qr(3)}</div><div class="small">请使用微信或支付宝扫码支付</div>` };

const langRow = (on, extra = '') => `<div class="panel"><div class="row" style="justify-content:space-between"><h4>界面</h4><div class="seg"><span class="${on === 'zh' ? 'on' : ''}">汉化版</span><span class="${on === 'en' ? 'on' : ''}">英文原版</span></div></div>${extra}</div>`;
const setPage = (lang) => `${lang}<div class="panel row" style="justify-content:space-between"><h4>版本 1.0.0</h4><span class="btn">检查更新</span></div><div class="panel row" style="justify-content:space-between"><h4>卸载</h4><span class="btn">卸载…</span></div>`;
const stepV = (st, label) => `<div class="sv"><span class="mk ${st}" style="display:inline-flex">${st === 'ok' ? '✓' : ''}</span>${label}</div>`;
const ck = (on, label, sub = '') => `<div class="ckr"><span class="cbx${on ? ' on' : ''}">${on ? '✓' : ''}</span>${label}${sub ? `<span class="small" style="margin-left:6px">${sub}</span>` : ''}</div>`;
/* ---------- scenes ---------- */
const PARTS = [
  { id: 'first', title: '一、第一次打开', lead: '从下载到第一次能用。引导里没有左栏，只做一件事：把 Codex 装好。', scenes: [
    { t: '下载、打开 CodexBuddy', think: '朋友推荐的，听说能免费用 AI 写代码', doing: '下载安装包，Mac 上拖进「应用程序」，双击打开', app: '—', outside: '<b>不在 App 里</b><br>下载页 → 安装包<br>（签名公证之前，Mac 会弹「无法验证开发者」；下载页放一张图教怎么放行）' },
    { t: '欢迎屏', think: '这是干什么的？要我做什么？', doing: '点「开始安装」', app: '先说清楚这是什么：Codex 从安装到使用的免费助手，用国产大模型。主动作只有「开始安装」',
      w: () => win({ icons: false, full: true, main: `<h1 class="big glow">Codex 免费助手<br><span style="color:#0c8df6">国产大模型</span></h1>
        <div class="btn p big">开始安装</div>` }) },
    { t: '自动安装', think: '会不会把电脑弄坏？要等多久？', doing: '什么都不用做，等着', app: '检测电脑、下载并安装 Codex；遇到小问题自己修。已经有 Codex 就直接打勾',
      w: () => win({ icons: false, full: true, main: `<div class="ring"><b class="pct">37%</b></div><div class="row" style="gap:26px; color:var(--sub)"><span><span class="mk ok" style="display:inline-flex; vertical-align:middle">✓</span> 检测电脑</span><span><span class="mk run" style="display:inline-flex; vertical-align:middle"></span> 安装 Codex</span></div>` }) },
    { t: '装好了，进模型页', think: '装好了，然后呢？', doing: '看到「选一个模型就能用」，第一张是免费的，点「用这个」', app: '左栏出现。OpenAI 测过连不上，卡片变灰写原因（不教翻墙）。「打开 Codex」还没出现',
      w: () => win({ nav: '模型', main: wallet(['选一个模型', '']) }) },
    { t: '右侧浏览器自动打开，扫码', think: '扫个码就行？', doing: '用微信扫智谱的码，第一次填手机号和验证码', app: '右侧打开智谱官方登录页（地址栏能看到是官网）。登录后在后台自动建 Key',
      w: () => win({ nav: '模型', main: wallet(['扫码登录', ''], { pick: '智谱' }), browser: zhipuLogin }) },
    { t: '自动配好', think: '—', doing: '等两三秒', app: '扫完码，右侧缩回画中画：App 在里面自己建 Key，用户看得见。然后备份 → 测试连通 → 保存',
      w: () => win({ nav: '模型', main: wallet(['扫码登录', ''], { pick: '智谱' }), pip: zhipuKeys, overlay: switchDlg('智谱', ['ok', 'run', ''], '', 'open.bigmodel.cn') }) },
    { t: '第一次能用了', think: '这么快？', doing: '点「打开 Codex」', app: '「从零到能用 N 秒」（视频封面那一刻）、关注行。免费模型不跳充值、不提充值',
      w: () => win({ nav: '模型', main: wallet(['正在用：<b>智谱</b> <span class="pulse-ok">✓</span> 能用', 'glm-4.5-flash', '<span class="btn p">打开 Codex</span>'], { cur: '智谱' }),
        overlay: `<div class="dlg" style="text-align:center; align-items:center"><div class="sub" style="font-size:18px">从零到能用</div><div><span class="count" data-to="48">48</span> <span style="font-size:24px">秒</span></div><span class="btn p big">打开 Codex</span><div class="small">关注 <b>黄金金不AI</b> 看教程</div></div>` }) },
    { t: '在 Codex 里干活', think: '让它帮我写个小工具', doing: '在 Codex 里聊天、让它改文件', app: 'CodexBuddy 可以关掉了', outside: '<b>不在 CodexBuddy 里</b><br>Codex（Mac 上叫 ChatGPT；测试版叫 Test-ChatGPT）<br>界面默认英文，模型是智谱免费' },
  ] },
  { id: 'daily', title: '二、以后每次打开', lead: '大多数日子不打开 CodexBuddy。打开它，一定落在模型页，第一眼就是「现在能不能用」。', scenes: [
    { t: '日常：直接打开 Codex', think: '今天接着用', doing: '从 Dock 或桌面直接打开 Codex', app: '不参与', outside: '<b>最常见的一天</b><br>用户根本不打开 CodexBuddy', freq: '几乎每天' },
    { t: '打开 CodexBuddy 看一眼', think: '还能用吗？现在用的是哪个？', doing: '看顶上一行，点「打开 Codex」', app: '打开时后台测一次连通（约 1–2 秒），测完显示 ✓',
      w: () => win({ nav: '模型', main: wallet(['正在用：<b>智谱</b> <span class="pulse-ok">✓</span> 能用', 'glm-4.5-flash', '<span class="btn p">打开 Codex</span>'], { cur: '智谱' }) }), freq: '偶尔' },
  ] },
  { id: 'models', title: '三、想换模型、要花钱的时候', lead: '充值、换 Key、看用量都在模型卡片上；付款在右侧浏览器里由用户自己做。', scenes: [
    { t: '免费的被限速了', think: '怎么不动了？', doing: '打开 CodexBuddy，看到原因，点「换个模型」', app: '顶上那一行变成原因 + 一个按钮',
      w: () => win({ nav: '模型', main: wallet(['免费模型被限速了', '稍等会恢复', '<span class="btn p">换个模型</span>', true], { cur: '智谱' }) }), freq: '用得多的人常见' },
    { t: '换成 DeepSeek：登录', think: '听说 DeepSeek 好用', doing: '点 DeepSeek「用这个」，右边扫码登录', app: '右侧打开 DeepSeek 官方登录页',
      w: () => win({ nav: '模型', main: wallet(['扫码登录', ''], { cur: '智谱', pick: 'DeepSeek' }), browser: dsLogin }) },
    { t: 'DeepSeek 余额不够：在右边充值', think: '要先充钱啊', doing: '在右边选金额、扫码付款，再点「再试一次」', app: '测试连通报余额不足 → 右侧直接打开充值页（已是登录状态）。不替用户点付款',
      w: () => win({ nav: '模型', main: wallet(['余额不够', '', '<span class="btn p">再试一次</span>', true], { cur: '智谱', pick: 'DeepSeek' }), browser: dsPay }) },
    { t: '有赠送额度：先用着', think: '要不要先充？', doing: '点「先用着」', app: '测试连通通过 = 有额度。充值页缩回画中画，想充就点它放大',
      w: () => win({ nav: '模型', main: wallet(['正在用：<b>DeepSeek</b> <span class="pulse-ok">✓</span> 能用', 'deepseek-chat', '<span class="btn p">打开 Codex</span>'], { cur: 'DeepSeek' }), pip: dsPay,
        overlay: switchDlg('DeepSeek', ['ok', 'ok', 'ok'], '<div class="res"><b>能用了</b><div class="sub">还有额度，用完再充</div></div><div class="right"><span class="btn p">先用着</span></div>', 'api.deepseek.com') }) },
    { t: '用着用着余额用完了', think: '又不动了', doing: '打开 CodexBuddy，点「去充值」', app: '顶上一行直接说原因',
      w: () => win({ nav: '模型', main: wallet(['余额用完了', '', '<span class="btn p">去充值</span>', true], { cur: 'DeepSeek' }) }), freq: '付费用户每月一两次' },
    { t: '换 Key', think: '我在官网把 Key 删了 / 想换个账号', doing: '卡片「⋯」→「换 Key」，扫一次码', app: '全自动：右侧打开 DeepSeek 登录页，扫码后自动建新 Key、测试连通、保存；不让用户粘贴 Key',
      w: () => win({ nav: '模型', main: wallet(['扫码换 Key', ''], { cur: 'DeepSeek' }),
        browser: dsLogin }) },
  ] },
  { id: 'trouble', title: '四、遇到问题的时候', lead: '问题先放在最前面，一句原因 + 一个按钮。解决不了，就去找人。', scenes: [
    { t: 'Codex 里报了一串英文错', think: '这是什么意思？我弄坏了吗？', doing: '打开 CodexBuddy →「帮助」，把报错粘进去', app: '按已知报错规则用中文解释，给一个按钮；解决不了再扫码问人',
      w: () => win({ nav: '帮助', main: `<div class="panel"><h4>粘贴报错</h4><textarea>stream error: context_length_exceeded …</textarea>
        <div class="res" style="margin-top:10px"><b>对话太长了</b><div class="sub">开个新对话接着做</div></div><div class="right" style="margin-top:10px"><span class="btn p">知道了</span></div></div>
        <div class="panel row" style="justify-content:space-between"><div><h4>扫码问我</h4></div><div class="qr" style="width:120px; height:120px; padding:6px">${qr(4)}</div></div>` }), freq: '新手常见' },
    { t: 'Codex 更新后用不了了', think: '昨天还好好的', doing: '打开 CodexBuddy，点「一键修复」', app: '每次打开都检查；被冲掉的配置重新写回去，做过的步骤跳过',
      w: () => win({ nav: '模型', main: wallet(['✗ Codex 用不了', '', '<span class="btn p">一键修复</span>', true], { cur: '智谱' }) }) },
    { t: '担心 Key 被偷', think: '这个软件靠谱吗？', doing: '点右上角 🛡', app: '看得到 Key 在哪、连过哪些网站；能让自己的 AI 查源代码',
      w: () => win({ nav: '模型', on: 'shield', main: wallet(['正在用：<b>智谱</b> <span class="pulse-ok">✓</span> 能用', 'glm-4.5-flash', '<span class="btn p">打开 Codex</span>'], { cur: '智谱' }),
        drawer: `<div class="drawer"><h3 style="margin:0">安全</h3>
          <b>Key</b>
          <div class="kv"><span>🔑 智谱 sk-••••a3f9</span><span>本机</span></div>
          <div class="row small"><span class="lnk">在访达里显示</span><span class="lnk">去官网管理</span></div>
          <b style="margin-top:6px">连过的网站</b>
          <div class="kv"><span><span class="flowdot"></span>open.bigmodel.cn</span><span>刚刚</span></div>
          <div class="kv"><span><span class="flowdot"></span>persistent.oaistatic.com</span><span>今天</span></div>
          <div class="kv"><span><span class="flowdot"></span>cdn.jsdelivr.net</span><span>今天</span></div>
          <div class="small">仅此 3 个</div>
          <div class="row" style="margin-top:auto"><span class="btn">让 AI 帮我检查</span><span class="lnk">查看源代码</span></div></div>` }) },
  ] },
  { id: 'more', title: '五、设置', lead: '低频的事，一页几块，点一下就生效。', scenes: [
    { t: '设置（默认英文原版）', think: '能不能变成中文？', doing: '点左栏「设置」', app: '第一块是界面语言，默认英文原版；汉化的样子和动画以 language-final.html 为准。下面是版本和卸载',
      w: () => win({ nav: '设置', main: setPage(langRow('en')) }) },
    { t: '切页面，浏览器不动', think: '刚才那个充值页还在吗？', doing: '从模型切到设置', app: '画中画跟着窗口，不跟着页面：切到哪一页都还在右下角；只有用户点 ✕ 才关',
      w: () => win({ nav: '设置', pip: dsPay, main: setPage(langRow('en')) }) },
  ] },
  { id: 'update', title: '六、有新版本', lead: '像微信一样：发现新版本就弹一次提示，用户点一下就更新。', scenes: [
    { t: '弹出更新提示', think: '有新东西了？', doing: '点「立即更新」，或「稍后」', app: '打开时和每隔几小时查一次新版本；有就弹出来。点「稍后」，下次打开再提醒',
      w: () => win({ nav: '模型', main: wallet(['正在用：<b>DeepSeek</b> <span class="pulse-ok">✓</span> 能用', 'deepseek-chat', '<span class="btn p">打开 Codex</span>'], { cur: 'DeepSeek' }),
        overlay: `<div class="dlg" style="width:420px; align-items:center; text-align:center"><div class="upd">⬆</div><h3>发现新版本 1.1.0</h3>
          <div style="text-align:left; width:100%; color:var(--sub)">· 支持 Kimi<br>· 安装更快</div>
          <div class="right" style="width:100%"><span class="btn">稍后</span><span class="btn p">立即更新</span></div></div>` }), freq: '每次发新版' },
    { t: '下载、重启', think: '—', doing: '等一下，点「重启」', app: '后台下载，进度环走完，重启后就是新版本；设置都保留',
      w: () => win({ nav: '模型', main: wallet(['正在用：<b>DeepSeek</b> <span class="pulse-ok">✓</span> 能用', 'deepseek-chat', '<span class="btn p">打开 Codex</span>'], { cur: 'DeepSeek' }),
        overlay: `<div class="dlg" style="width:420px; align-items:center; text-align:center"><div class="ring" style="width:150px; height:150px"><b class="pct" style="font-size:32px">37%</b></div><h3>正在更新</h3><div class="right" style="width:100%; justify-content:center"><span class="btn p">重启</span></div></div>` }) },
  ] },
  { id: 'end', title: '七、不想用了：卸载', lead: '入口在设置最下面。撤不回的先让人看清、自己勾选再点；做完回到最开始的样子。', scenes: [
    { t: '卸载：先看清要删什么', think: '不想用了，想删干净', doing: '设置 →「卸载…」→ 勾选 →「卸载」', app: '默认勾上 CodexBuddy 带来的全部东西；聊天记录和数据目录不在可删的范围里（硬规则）；原来就装着的 Codex 不出现在列表里，不卸',
      w: () => win({ nav: '设置', main: setPage(langRow('zh')),
        overlay: `<div class="dlg" style="width:500px"><h3>卸载</h3>
          <div class="cklist">${ck(1, 'ChatGPT 汉化版')}${ck(1, '分身 App', 'DeepSeek、Kimi，聊天记录留着')}${ck(1, 'Codex', 'CodexBuddy 装的')}${ck(1, '模型设置恢复原样', 'Key 从本机删掉')}${ck(1, '右侧浏览器里的登录')}</div>
          <div class="small">聊天记录和 Codex 的数据一律不动</div><div class="right"><span class="btn">先不了</span><span class="btn p">卸载</span></div></div>` }) },
    { t: '卸载中', think: '—', doing: '等一下', app: '逐项打勾，失败的那一项写原因，其他照常做完',
      w: () => win({ nav: '设置', main: setPage(langRow('zh')),
        overlay: `<div class="dlg" style="width:460px"><h3>正在卸载</h3><div class="steps-v">${stepV('ok', 'ChatGPT 汉化版')}${stepV('ok', '分身')}${stepV('run', 'Codex')}${stepV('', '模型设置恢复原样')}${stepV('', '右侧浏览器里的登录')}</div></div>` }) },
    { t: '卸干净了', think: 'CodexBuddy 自己怎么删？', doing: '点「删除 CodexBuddy」，或者先留着', app: '最后一步删 CodexBuddy 自己：点了退出并移到废纸篓（Windows 走系统卸载）。留着就回到欢迎屏',
      w: () => win({ icons: false, full: true, main: `<div class="mk ok" style="width:56px; height:56px; font-size:28px">✓</div><h1 class="big" style="font-size:34px">都卸干净了</h1><div class="small">聊天记录还在</div>
        <div class="row" style="gap:12px"><span class="btn">留着 CodexBuddy</span><span class="btn p">删除 CodexBuddy</span></div>` }) },
  ] },
];
