/* 模型页 10 种风格（站主 2026-11-11：「用这些工具后，给我生成 10 种风格再看看」）。每种学一个公认好看的真实 App 的 UI 语言，不是套「风格名词」 */
document.head.insertAdjacentHTML('beforeend', `<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet"><style>
  .gw { width:1180px; height:700px; border-radius:11px; overflow:hidden; position:relative; display:flex; font:13px/1.4 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; box-shadow:0 0 0 .5px rgba(0,0,0,.3), 0 22px 60px rgba(0,0,0,.25); }
  .fit > .gw, .fit > .lsw { position:absolute; left:0; top:0; transform-origin:0 0; }
  .gw .tl { display:flex; gap:8px; } .gw .tl i { width:12px; height:12px; border-radius:50%; display:block; }
  .gw .tl i:nth-child(1) { background:#ff5f57; } .gw .tl i:nth-child(2) { background:#febc2e; } .gw .tl i:nth-child(3) { background:#28c840; }
  .gw .ic { width:20px; height:20px; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:700; flex:none; }

  /* 2 Things 3 */
  .g2 { background:#fff; color:#1d1d1f; }
  .g2 .sb { width:236px; background:#f5f5f7; border-right:1px solid #e8e8ea; padding:16px 12px; display:flex; flex-direction:column; gap:2px; }
  .g2 .sb .it { display:flex; align-items:center; gap:10px; padding:6px 10px; border-radius:6px; font-size:14px; }
  .g2 .sb .it.on { background:#dcdcdf; font-weight:600; }
  .g2 .main { flex:1; padding:64px 90px 30px; display:flex; flex-direction:column; }
  .g2 h1 { margin:0 0 6px; font-size:28px; font-weight:700; display:flex; align-items:center; gap:12px; letter-spacing:-.3px; }
  .g2 .lead { color:#8e8e93; font-size:14px; margin-bottom:26px; }
  .g2 .cb { width:17px; height:17px; border-radius:5px; border:1.5px solid #c7c7cc; flex:none; display:inline-flex; align-items:center; justify-content:center; font-size:10px; color:#fff; }
  .g2 .cb.on { background:#3478f6; border-color:#3478f6; }
  .g2 .r { display:flex; align-items:center; gap:12px; padding:9px 12px; font-size:15px; }
  .g2 .r .t { margin-left:auto; font-size:12px; color:#8e8e93; }
  .g2 .tag { font-size:11px; border-radius:10px; padding:1px 8px; background:#ececef; color:#636366; }
  .g2 .card { margin:4px -6px 10px; padding:16px 18px 14px; border-radius:9px; background:#fff; box-shadow:0 0 0 .5px rgba(0,0,0,.08), 0 6px 22px rgba(0,0,0,.09); }
  .g2 .note { color:#8e8e93; margin:6px 0 16px 29px; font-size:14px; line-height:1.6; }
  .g2 .bar { display:flex; align-items:center; gap:10px; margin-left:29px; }

  /* 3 Raycast */
  .g3 { background:#2b2a33; justify-content:center; align-items:center; }
  .g3 .pal { width:820px; height:520px; border-radius:14px; background:rgba(28,28,30,.96); border:1px solid rgba(255,255,255,.1); box-shadow:0 30px 80px rgba(0,0,0,.6); color:#e9e9eb; display:flex; flex-direction:column; overflow:hidden; }
  .g3 .q { height:58px; display:flex; align-items:center; gap:12px; padding:0 18px; font-size:18px; color:#7d7d84; border-bottom:1px solid rgba(255,255,255,.08); }
  .g3 .sec { font-size:11px; color:#7d7d84; padding:12px 18px 4px; font-weight:600; }
  .g3 .r { display:flex; align-items:center; gap:12px; margin:0 8px; padding:9px 10px; border-radius:8px; font-size:14px; }
  .g3 .r.on { background:rgba(255,255,255,.09); }
  .g3 .r .s { color:#7d7d84; font-size:13px; }
  .g3 .acc { margin-left:auto; display:flex; gap:12px; align-items:center; color:#9a9aa1; font-size:12px; }
  .g3 .pill { border-radius:5px; padding:1px 7px; font-size:11px; }
  .g3 .ft { margin-top:auto; height:44px; border-top:1px solid rgba(255,255,255,.08); display:flex; align-items:center; padding:0 14px; gap:10px; font-size:12px; color:#9a9aa1; background:rgba(255,255,255,.02); }
  .g3 kbd { font:11px -apple-system; background:rgba(255,255,255,.1); border-radius:4px; padding:1px 6px; color:#d1d1d6; }

  /* 4 Linear */
  .g4 { background:#0b0c0e; color:#e6e6e8; }
  .g4 .sb { width:220px; background:#0f1012; border-right:1px solid #1d1e22; padding:14px 10px; display:flex; flex-direction:column; gap:2px; }
  .g4 .ws { display:flex; align-items:center; gap:8px; padding:10px 8px 14px; font-weight:600; }
  .g4 .it { display:flex; align-items:center; gap:9px; padding:5px 8px; border-radius:6px; color:#9a9ca5; }
  .g4 .it.on { background:#1c1d21; color:#e6e6e8; }
  .g4 .main { flex:1; display:flex; flex-direction:column; border-right:1px solid #1d1e22; }
  .g4 .hd { height:46px; display:flex; align-items:center; padding:0 18px; gap:8px; border-bottom:1px solid #1d1e22; color:#9a9ca5; }
  .g4 .grp { display:flex; align-items:center; gap:8px; padding:8px 18px; background:#131417; color:#c9cad0; font-size:12px; border-bottom:1px solid #1d1e22; }
  .g4 .r { display:flex; align-items:center; gap:12px; padding:0 18px; height:40px; border-bottom:1px solid #16171a; }
  .g4 .r.on { background:#16171b; }
  .g4 .id { color:#6b6f78; font:12px ui-monospace, Menlo, monospace; width:40px; }
  .g4 .lab { margin-left:auto; display:flex; gap:8px; align-items:center; }
  .g4 .lb { border:1px solid #2a2b31; border-radius:12px; padding:1px 8px; font-size:12px; color:#b4b6bd; display:flex; align-items:center; gap:5px; }
  .g4 .lb i { width:7px; height:7px; border-radius:50%; display:block; }
  .g4 .side { width:290px; padding:18px; display:flex; flex-direction:column; gap:14px; }
  .g4 .pr { display:grid; grid-template-columns:70px 1fr; gap:10px; font-size:13px; } .g4 .pr dt { color:#6b6f78; } .g4 .pr dd { margin:0; }
  .g4 .btn4 { background:#5e6ad2; color:#fff; border-radius:6px; padding:7px 14px; font-weight:500; text-align:center; }

  /* 5 Arc */
  .g5 { background:#d4c8f0; padding:8px 8px 8px 0; }
  .g5 .sb { width:250px; padding:14px 12px; display:flex; flex-direction:column; gap:10px; color:#2a2340; }
  .g5 .url { background:rgba(255,255,255,.45); border-radius:10px; padding:8px 12px; color:#5a5274; }
  .g5 .fav { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
  .g5 .fav div { aspect-ratio:1; border-radius:12px; background:rgba(255,255,255,.45); display:flex; align-items:center; justify-content:center; }
  .g5 .fav div.on { background:#fff; box-shadow:0 2px 6px rgba(60,40,120,.15); }
  .g5 .it { display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:9px; font-weight:500; }
  .g5 .it.on { background:rgba(255,255,255,.7); }
  .g5 .page { flex:1; background:#fff; border-radius:10px; box-shadow:0 1px 4px rgba(40,20,90,.14); padding:56px 64px; display:flex; flex-direction:column; gap:22px; color:#1d1d1f; }
  .g5 .big { display:flex; align-items:center; gap:18px; }
  .g5 .stats { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; }
  .g5 .st { border-radius:14px; background:#f6f4fc; padding:16px 18px; } .g5 .st b { display:block; font-size:24px; margin-top:4px; }
  .g5 .ob { display:flex; gap:12px; } .g5 .ob > span { flex:1; border:1px solid #ece9f5; border-radius:12px; padding:12px 14px; display:flex; align-items:center; gap:10px; }

  /* 6 活动监视器 */
  .g6 { background:#fff; color:#1d1d1f; flex-direction:column; }
  .g6 .tb { height:52px; background:#ececec; border-bottom:1px solid #d4d4d4; display:flex; align-items:center; padding:0 14px; gap:16px; }
  .g6 .seg { display:flex; margin:0 auto; border-radius:6px; background:#dcdcdc; padding:2px; }
  .g6 .seg span { padding:3px 16px; border-radius:5px; font-size:12px; } .g6 .seg span.on { background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.15); }
  .g6 .tbtn { width:28px; height:22px; border-radius:5px; display:flex; align-items:center; justify-content:center; color:#555; }
  .g6 table { width:100%; border-collapse:collapse; font-size:12px; }
  .g6 th { text-align:left; font-weight:400; color:#555; padding:4px 10px; border-bottom:1px solid #ddd; border-right:1px solid #e6e6e6; background:#fafafa; }
  .g6 td { padding:4px 10px; height:22px; } .g6 tr:nth-child(odd) td { background:#f4f5f5; } .g6 tr.sel td { background:#0a64d8; color:#fff; }
  .g6 .num { text-align:right; font-variant-numeric:tabular-nums; }
  .g6 .bot { margin-top:auto; height:200px; background:#ececec; border-top:1px solid #d4d4d4; display:flex; gap:18px; padding:16px 20px; }
  .g6 .kv { display:grid; grid-template-columns:auto auto; gap:4px 18px; font-size:12px; align-content:start; } .g6 .kv dt { color:#555; text-align:right; } .g6 .kv dd { margin:0; font-variant-numeric:tabular-nums; }
  .g6 .gr { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; font-size:11px; color:#555; }
  .g6 .gr svg { background:#000; border:1px solid #9a9a9a; }

  /* 7 Teenage Engineering */
  .g7 { background:#e3e2dd; color:#111; font-family:'IBM Plex Mono', ui-monospace, monospace; flex-direction:column; padding:22px 26px; gap:16px; }
  .g7 .lbl { font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#555; }
  .g7 .top { display:flex; align-items:center; gap:18px; }
  .g7 .scr { background:#0b0b0b; border-radius:6px; flex:1; position:relative; color:#fff; padding:18px 22px; display:flex; flex-direction:column; }
  .g7 .seg7 { font-size:120px; font-weight:600; line-height:1; letter-spacing:-4px; }
  .g7 .knobs { display:flex; gap:26px; justify-content:center; }
  .g7 .kn { display:flex; flex-direction:column; align-items:center; gap:8px; }
  .g7 .kn .k { width:74px; height:74px; border-radius:50%; position:relative; box-shadow:inset 0 -4px 0 rgba(0,0,0,.18), 0 3px 0 #bdbcb6; }
  .g7 .kn .k::after { content:''; position:absolute; left:50%; top:8px; width:4px; height:18px; margin-left:-2px; border-radius:2px; background:rgba(255,255,255,.9); }
  .g7 .keys { display:flex; gap:10px; }
  .g7 .key { flex:1; height:58px; border-radius:6px; background:#f4f3ef; box-shadow:0 3px 0 #b9b8b2; display:flex; align-items:flex-end; padding:8px 10px; font-size:12px; font-weight:600; }
  .g7 .key.or { background:#ff5a1f; color:#fff; box-shadow:0 3px 0 #b8400f; }

  /* 8 经典 Mac OS */
  .g8 { background:#dddddd; font-family:Geneva, 'Lucida Grande', 'PingFang SC', sans-serif; font-size:13px; color:#000; flex-direction:column; border-radius:2px; box-shadow:0 0 0 1px #000, 2px 2px 0 1px rgba(0,0,0,.4); }
  .g8 .tbar { height:22px; display:flex; align-items:center; padding:0 6px; gap:8px; background:repeating-linear-gradient(#ddd 0 1px, #999 1px 2px) content-box; border-bottom:1px solid #777; }
  .g8 .tbar .box { width:12px; height:12px; border:1px solid #444; background:#ddd; box-shadow:inset 1px 1px #fff; }
  .g8 .tbar .ttl { margin:0 auto; background:#ddd; padding:0 10px; font-weight:700; }
  .g8 .body8 { flex:1; display:flex; gap:14px; padding:14px; }
  .g8 .inset { background:#fff; border:1px solid #777; box-shadow:inset 1px 1px #555, 1px 1px #fff; }
  .g8 .bevel { background:#ddd; border:1px solid #000; border-radius:5px; box-shadow:inset 1px 1px #fff, inset -1px -1px #999; padding:5px 16px; text-align:center; }
  .g8 .bevel.def { box-shadow:0 0 0 3px #ddd, 0 0 0 4px #000, inset 1px 1px #fff, inset -1px -1px #999; }
  .g8 .icn { width:32px; height:32px; image-rendering:pixelated; display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; border:1px solid #000; }
  .g8 .row8 { display:flex; align-items:center; gap:10px; padding:4px 8px; } .g8 .row8.sel { background:#000; color:#fff; }
  .g8 .grpbox { border:1px solid #888; box-shadow:1px 1px #fff, inset 1px 1px #fff; padding:16px 14px 12px; position:relative; }
  .g8 .grpbox > .lg8 { position:absolute; top:-9px; left:10px; background:#ddd; padding:0 4px; }

  /* 9 Bloomberg 终端 */
  .g9 { background:#000; color:#ffb000; font-family:'IBM Plex Mono', ui-monospace, monospace; font-size:13px; flex-direction:column; }
  .g9 .cmd { background:#ffb000; color:#000; padding:5px 12px; font-weight:600; display:flex; gap:20px; }
  .g9 .bar9 { background:#1b3a8a; color:#fff; padding:3px 12px; display:flex; gap:24px; font-size:12px; }
  .g9 .grid9 { flex:1; display:grid; grid-template-columns:1.4fr 1fr; gap:1px; background:#333; }
  .g9 .pn { background:#000; padding:10px 12px; display:flex; flex-direction:column; gap:4px; }
  .g9 .ph { color:#fff; background:#333; margin:-10px -12px 8px; padding:3px 12px; font-size:12px; }
  .g9 .ln { display:grid; grid-template-columns:28px 1.3fr 1fr 1fr 1fr; gap:8px; }
  .g9 .w { color:#fff; } .g9 .g { color:#3ce26a; } .g9 .r { color:#ff4d4d; } .g9 .c { color:#4fc3f7; }
  .g9 .fk { display:flex; gap:2px; background:#333; padding-top:1px; } .g9 .fk span { flex:1; background:#111; color:#ffb000; padding:5px 8px; font-size:12px; } .g9 .fk span b { color:#000; background:#ffb000; padding:0 4px; margin-right:6px; }

  /* 10 Notion */
  .g10 { background:#fff; color:#37352f; }
  .g10 .sb { width:240px; background:#f7f7f5; padding:14px 8px; display:flex; flex-direction:column; gap:1px; font-size:14px; color:#5f5e5b; }
  .g10 .it { display:flex; align-items:center; gap:8px; padding:4px 10px; border-radius:5px; } .g10 .it.on { background:#ebebea; color:#37352f; font-weight:500; }
  .g10 .pg { flex:1; padding:70px 120px 30px; display:flex; flex-direction:column; gap:10px; }
  .g10 .emo { font-size:62px; line-height:1; }
  .g10 h1 { font-size:40px; margin:6px 0 8px; font-weight:700; }
  .g10 .callout { background:#f1f1ef; border-radius:6px; padding:16px 18px; display:flex; gap:12px; align-items:center; font-size:16px; }
  .g10 .db { border-top:1px solid #e9e9e7; margin-top:12px; }
  .g10 .dr { display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; border-bottom:1px solid #e9e9e7; font-size:14px; }
  .g10 .dr > div { padding:8px 10px; border-right:1px solid #e9e9e7; } .g10 .dr > div:last-child { border-right:0; }
  .g10 .dr.h { color:#9b9a97; font-size:13px; }
  .g10 .opt { border-radius:3px; padding:1px 6px; font-size:13px; }
  .g10 .tg { color:#37352f; padding:3px 4px; font-size:15px; }
</style>`);

const G = {};
G.things = () => `<div class="gw g2">
  <div class="sb"><div class="tl" style="margin:2px 6px 22px"><i></i><i></i><i></i></div>
    <div class="it on"><span style="color:#3478f6">●</span>模型</div><div class="it"><span style="color:#34c759">◆</span>安全</div>
    <div class="it"><span style="color:#8e8e93">⚙</span>设置</div><div class="it"><span style="color:#ff9f0a">?</span>帮助</div></div>
  <div class="main"><h1><span class="cb on" style="width:26px; height:26px; font-size:14px">✓</span>模型</h1><div class="lead">Codex 现在用的是 DeepSeek</div>
    <div class="card"><div style="display:flex; align-items:center; gap:12px; font-size:15px"><span class="cb on">✓</span><b style="font-weight:600">DeepSeek</b><span class="tag">按量付费</span><span style="margin-left:auto; color:#34c759; font-size:13px">● 能用</span></div>
      <div class="note">deepseek-chat · 128 ms · 余额 ¥23.50</div>
      <div class="bar"><span style="color:#8e8e93">¥ 去充值</span><span style="color:#8e8e93">⋯ 换 Key</span><span style="margin-left:auto; color:#3478f6; font-weight:600">打开 Codex</span></div></div>
    <div class="r"><span class="cb"></span>智谱<span class="tag">免费</span></div>
    <div class="r" style="color:#c7c7cc"><span class="cb"></span>OpenAI<span class="t">打不开网站</span></div>
    <div class="r" style="color:#3478f6; margin-top:auto"><span style="font-size:18px">＋</span>其他厂商</div></div></div>`;

G.raycast = () => `<div class="gw g3"><div class="tl" style="position:absolute; left:16px; top:16px"><i></i><i></i><i></i></div><div class="pal">
  <div class="q">⌕ <span>搜索模型、设置、帮助…</span><span style="margin-left:auto; font-size:12px"><kbd>esc</kbd></span></div>
  <div class="sec">正在用</div>
  <div class="r on"><span class="ic" style="background:#4d6bfe">D</span>DeepSeek <span class="s">deepseek-chat</span><span class="acc"><span>128 ms</span><span>¥23.50</span><span class="pill" style="background:rgba(52,199,89,.18); color:#4cd964">能用</span></span></div>
  <div class="sec">可用</div>
  <div class="r"><span class="ic" style="background:#1f6feb">智</span>智谱 <span class="s">glm-4.5-flash</span><span class="acc"><span>210 ms</span><span class="pill" style="background:rgba(255,255,255,.08)">免费</span></span></div>
  <div class="r" style="opacity:.45"><span class="ic" style="background:#555">O</span>OpenAI <span class="s">打不开网站</span></div>
  <div class="r"><span class="ic" style="background:#3a3a3c">＋</span>其他厂商 <span class="s">填地址和 Key</span></div>
  <div class="sec">操作</div>
  <div class="r"><span class="ic" style="background:#3a3a3c">¥</span>去充值 DeepSeek<span class="acc"><kbd>⌘ R</kbd></span></div>
  <div class="r"><span class="ic" style="background:#3a3a3c">⟳</span>换 Key<span class="acc"><kbd>⌘ K</kbd></span></div>
  <div class="ft"><span class="ic" style="background:#0c8df6; width:16px; height:16px">C</span>CodexBuddy<span style="margin-left:auto; color:#e9e9eb">打开 Codex</span><kbd>↵</kbd><span style="color:#4a4a50">|</span>操作<kbd>⌘ K</kbd></div>
</div></div>`;

G.linear = () => `<div class="gw g4">
  <div class="sb"><div class="tl" style="margin:2px 6px 8px"><i></i><i></i><i></i></div><div class="ws"><span class="ic" style="background:#5e6ad2">C</span>CodexBuddy</div>
    <div class="it on">◎ 模型</div><div class="it">◇ 安全</div><div class="it">⚙ 设置</div><div class="it">? 帮助</div></div>
  <div class="main"><div class="hd"><span style="color:#e6e6e8">模型</span><span style="margin-left:auto">☰ 显示</span></div>
    <div class="grp"><span style="color:#f2c94c">◐</span>正在用 <span style="color:#6b6f78">1</span></div>
    <div class="r on"><span class="id">DS-1</span><span class="ic" style="background:#4d6bfe">D</span>DeepSeek<span class="lab"><span class="lb"><i style="background:#26b5ce"></i>按量付费</span><span class="lb"><i style="background:#4cb782"></i>128 ms</span></span></div>
    <div class="grp"><span style="color:#8a8f98">○</span>可用 <span style="color:#6b6f78">1</span></div>
    <div class="r"><span class="id">ZP-2</span><span class="ic" style="background:#1f6feb">智</span>智谱<span class="lab"><span class="lb"><i style="background:#4cb782"></i>免费</span><span class="lb"><i style="background:#8a8f98"></i>210 ms</span></span></div>
    <div class="grp"><span style="color:#eb5757">⊘</span>连不上 <span style="color:#6b6f78">1</span></div>
    <div class="r" style="color:#6b6f78"><span class="id">OA-3</span><span class="ic" style="background:#2a2b31">O</span>OpenAI<span class="lab"><span class="lb">打不开网站</span></span></div>
    <div class="r" style="color:#8a8f98; border:0">＋ 其他厂商</div></div>
  <div class="side"><div style="display:flex; align-items:center; gap:10px; font-size:17px; font-weight:600"><span class="ic" style="background:#4d6bfe; width:26px; height:26px">D</span>DeepSeek</div>
    <dl class="pr"><dt>状态</dt><dd><span style="color:#f2c94c">◐</span> 正在用</dd><dt>模型</dt><dd>deepseek-chat</dd><dt>延迟</dt><dd>128 ms</dd><dt>余额</dt><dd>¥23.50</dd><dt>Key</dt><dd style="font-family:ui-monospace,Menlo,monospace">sk-••••a3f9</dd><dt>标签</dt><dd><span class="lb" style="display:inline-flex"><i style="background:#26b5ce"></i>按量付费</span></dd></dl>
    <div style="margin-top:auto; display:flex; flex-direction:column; gap:8px"><span class="btn4">打开 Codex</span><span style="display:flex; gap:8px"><span class="lb" style="flex:1; justify-content:center; padding:6px">去充值</span><span class="lb" style="flex:1; justify-content:center; padding:6px">换 Key</span></span></div></div></div>`;

G.arc = () => `<div class="gw g5">
  <div class="sb"><div class="tl" style="margin:2px 4px 6px"><i></i><i></i><i></i></div><div class="url">codexbuddy / 模型</div>
    <div class="fav"><div class="on"><span class="ic" style="background:#4d6bfe; width:28px; height:28px; font-size:14px">D</span></div><div><span class="ic" style="background:#1f6feb; width:28px; height:28px; font-size:14px">智</span></div><div style="opacity:.45"><span class="ic" style="background:#333; width:28px; height:28px; font-size:14px">O</span></div><div style="font-size:20px; color:#5a5274">＋</div></div>
    <div style="height:1px; background:rgba(42,35,64,.12); margin:4px 6px"></div>
    <div class="it on">◎ 模型</div><div class="it">◇ 安全</div><div class="it">⚙ 设置</div><div class="it">? 帮助</div>
    <div style="margin-top:auto; display:flex; gap:14px; padding:0 8px; color:#5a5274">🌐 ⌂</div></div>
  <div class="page"><div class="big"><span class="ic" style="background:#4d6bfe; width:72px; height:72px; border-radius:18px; font-size:32px">D</span><div><div style="font-size:34px; font-weight:700; letter-spacing:-.5px">DeepSeek</div><div style="color:#30a46c; font-weight:600">● 能用 · deepseek-chat</div></div><span style="margin-left:auto; background:#1d1d1f; color:#fff; border-radius:12px; padding:12px 22px; font-weight:600">打开 Codex</span></div>
    <div class="stats"><div class="st"><span style="color:#7a7194">延迟</span><b>128 ms</b></div><div class="st"><span style="color:#7a7194">余额</span><b>¥23.50</b></div><div class="st"><span style="color:#7a7194">今天</span><b>12.4k</b></div></div>
    <div style="display:flex; gap:10px"><span style="border:1px solid #ece9f5; border-radius:10px; padding:8px 14px">¥ 去充值</span><span style="border:1px solid #ece9f5; border-radius:10px; padding:8px 14px">⋯ 换 Key</span></div>
    <div style="margin-top:auto; color:#7a7194; font-size:12px">其他模型</div>
    <div class="ob"><span><span class="ic" style="background:#1f6feb">智</span>智谱<span style="margin-left:auto; color:#7a7194">免费</span></span><span style="opacity:.5"><span class="ic" style="background:#333">O</span>OpenAI<span style="margin-left:auto">打不开</span></span><span style="color:#6e56cf">＋ 其他厂商</span></div></div></div>`;

G.activity = () => {
  const pts = Array.from({ length:60 }, (_, i) => `${i * 4},${70 - (20 + 14 * Math.sin(i / 4) + (i * 37 % 11))}`).join(' ');
  return `<div class="gw g6"><div class="tb"><span class="tl"><i></i><i></i><i></i></span><div style="line-height:1.15"><b>CodexBuddy</b><div style="font-size:11px; color:#777">所有模型</div></div>
    <span class="tbtn">ⓧ</span><span class="tbtn">ⓘ</span><span class="tbtn" style="width:auto; padding:0 10px; background:#fff; border:1px solid #ccc">打开 Codex</span>
    <div class="seg"><span class="on">模型</span><span>安全</span><span>设置</span><span>帮助</span></div><span style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:2px 10px; color:#999; width:150px">⌕ 搜索</span></div>
  <table><tr><th>模型名称</th><th>状态</th><th class="num">延迟</th><th class="num">今日 tokens</th><th class="num">余额</th><th>域名</th></tr>
    <tr class="sel"><td><span class="ic" style="background:#4d6bfe; width:16px; height:16px; font-size:9px">D</span> DeepSeek</td><td>正在用</td><td class="num">128 ms</td><td class="num">12,431</td><td class="num">¥23.50</td><td>api.deepseek.com</td></tr>
    <tr><td><span class="ic" style="background:#1f6feb; width:16px; height:16px; font-size:9px">智</span> 智谱</td><td>可用</td><td class="num">210 ms</td><td class="num">0</td><td class="num">免费</td><td>open.bigmodel.cn</td></tr>
    <tr><td style="color:#999"><span class="ic" style="background:#999; width:16px; height:16px; font-size:9px">O</span> OpenAI</td><td style="color:#d70015">连不上</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td style="color:#999">api.openai.com</td></tr>
    <tr><td style="color:#0a64d8">＋ 其他厂商</td><td></td><td></td><td></td><td></td><td></td></tr>
    ${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(9)}</table>
  <div class="bot"><dl class="kv"><dt>请求：</dt><dd>342</dd><dt>失败：</dt><dd>0</dd><dt>平均延迟：</dt><dd>131 ms</dd><dt>Key 位置：</dt><dd>本机</dd><dt>连过的网站：</dt><dd>5</dd></dl>
    <div class="gr">延迟<svg width="260" height="74"><polyline fill="none" stroke="#28c840" stroke-width="1.5" points="${pts}"/></svg><span>128 ms</span></div>
    <div class="gr">余额<svg width="260" height="74"><rect x="0" y="0" width="260" height="74" fill="#000"/>${Array.from({ length:26 }, (_, i) => `<rect x="${i * 10 + 1}" y="${10 + i * 1.6}" width="8" height="${64 - i * 1.6}" fill="#0a84ff"/>`).join('')}</svg><span>¥23.50</span></div>
    <div class="kv" style="align-self:end"><span class="bevel" style="padding:4px 12px; background:#fff; border:1px solid #ccc; border-radius:5px">去充值</span><span style="padding:4px 12px; background:#fff; border:1px solid #ccc; border-radius:5px">换 Key</span></div></div></div>`;
};

G.te = () => `<div class="gw g7"><div class="top"><span class="tl"><i></i><i></i><i></i></span><b style="font-size:14px">codexbuddy</b><span class="lbl">model · safety · settings · help</span><span class="lbl" style="margin-left:auto">v1.0.0</span></div>
  <div class="scr"><div style="display:flex; justify-content:space-between"><span class="lbl" style="color:#888">model 01 / deepseek</span><span class="lbl" style="color:#3ce26a">● online</span></div>
    <div style="display:flex; align-items:flex-end; gap:16px; margin-top:auto"><span class="seg7">128</span><span style="font-size:22px; margin-bottom:14px">ms</span>
      <div style="margin-left:auto; display:flex; align-items:flex-end; gap:5px; height:110px">${[40, 65, 30, 80, 55, 92, 48, 70, 38, 85, 60, 74].map((h, i) => `<i style="display:block; width:14px; height:${h}%; background:${['#2f6df6', '#3ce26a', '#fff', '#ff5a1f'][i % 4]}"></i>`).join('')}</div></div>
    <div style="display:flex; gap:40px; margin-top:16px" class="lbl"><span style="color:#888">balance <b style="color:#fff">¥23.50</b></span><span style="color:#888">today <b style="color:#fff">12.4k tok</b></span><span style="color:#888">key <b style="color:#fff">local</b></span></div></div>
  <div class="knobs">${[['#2f6df6', 'deepseek', 1], ['#3ce26a', '智谱 free', 0], ['#f4f3ef', 'openai ×', 0], ['#ff5a1f', '+ other', 0]].map(([c, n, on]) => `<div class="kn"><span class="k" style="background:${c}; ${on ? 'outline:3px solid #111; outline-offset:4px' : ''}; ${n.includes('×') ? 'opacity:.4' : ''}"></span><span class="lbl" style="color:#111">${n}</span></div>`).join('')}</div>
  <div class="keys"><span class="key or">open codex</span><span class="key">¥ top up</span><span class="key">⟳ new key</span><span class="key">◇ safety</span></div></div>`;

G.macos = () => `<div class="gw g8"><div class="tbar"><span class="box"></span><span class="ttl">CodexBuddy</span><span class="box"></span></div>
  <div class="body8"><div class="inset" style="width:170px; padding:6px 0"><div class="row8 sel">◉ 模型</div><div class="row8">◇ 安全</div><div class="row8">⚙ 设置</div><div class="row8">? 帮助</div></div>
    <div style="flex:1; display:flex; flex-direction:column; gap:16px">
      <div class="grpbox"><span class="lg8">正在用</span><div style="display:flex; align-items:center; gap:14px"><span class="icn" style="background:#3355cc">D</span><div><b style="font-size:16px">DeepSeek</b><div>deepseek-chat · 延迟 128 ms · 余额 ¥23.50</div></div><span style="margin-left:auto">● 能用</span></div></div>
      <div class="inset" style="flex:1; padding:4px 0"><div class="row8"><span class="icn" style="background:#3355cc; width:20px; height:20px">D</span>DeepSeek<span style="margin-left:auto">按量付费</span></div><div class="row8"><span class="icn" style="background:#2a6ad8; width:20px; height:20px">智</span>智谱<span style="margin-left:auto">免费</span></div><div class="row8" style="color:#888"><span class="icn" style="background:#888; width:20px; height:20px">O</span>OpenAI<span style="margin-left:auto">打不开网站</span></div><div class="row8">＋ 其他厂商…</div></div>
      <div style="display:flex; gap:12px; justify-content:flex-end; padding:4px 6px"><span class="bevel">换 Key…</span><span class="bevel">去充值…</span><span class="bevel def">打开 Codex</span></div></div></div></div>`;

G.bloomberg = () => `<div class="gw g9"><div class="cmd"><span class="tl"><i></i><i></i><i></i></span>DEEPSEEK &lt;MODEL&gt; GO<span style="margin-left:auto">CODEXBUDDY 1.0</span></div>
  <div class="bar9"><span>1) 模型</span><span>2) 安全</span><span>3) 设置</span><span>4) 帮助</span><span style="margin-left:auto">11/11 14:32 CST</span></div>
  <div class="grid9"><div class="pn"><div class="ph">模型 · MODELS</div>
      <div class="ln" style="color:#888"><span></span><span>名称</span><span>状态</span><span>延迟</span><span>余额</span></div>
      <div class="ln" style="background:#1a1a1a"><span class="w">1)</span><span class="w">DEEPSEEK</span><span class="g">▲ 正在用</span><span>128ms</span><span>¥23.50</span></div>
      <div class="ln"><span class="w">2)</span><span class="w">智谱</span><span class="c">可用</span><span>210ms</span><span>免费</span></div>
      <div class="ln"><span class="w">3)</span><span style="color:#777">OPENAI</span><span class="r">▼ 连不上</span><span>—</span><span>—</span></div>
      <div class="ln"><span class="w">4)</span><span class="c">+ 其他厂商</span><span></span><span></span><span></span></div>
      <div class="ph" style="margin-top:18px">延迟 · LATENCY 1H</div>
      <svg width="600" height="170"><polyline fill="none" stroke="#ffb000" stroke-width="1.5" points="${Array.from({ length:90 }, (_, i) => `${i * 6.7},${110 - 30 * Math.sin(i / 7) - (i * 53 % 23)}`).join(' ')}"/><line x1="0" y1="85" x2="600" y2="85" stroke="#333" stroke-dasharray="3 4"/></svg></div>
    <div class="pn"><div class="ph">DEEPSEEK · 明细</div>
      <div><span style="color:#888">模型 </span><span class="w">deepseek-chat</span></div><div><span style="color:#888">Key  </span><span class="w">sk-••••a3f9 · 本机</span></div><div><span style="color:#888">域名 </span><span class="w">api.deepseek.com</span></div><div><span style="color:#888">今日 </span><span class="w">12,431 tok</span> <span class="g">+18%</span></div><div><span style="color:#888">余额 </span><span class="w">¥23.50</span> <span class="r">-¥1.20</span></div>
      <div class="ph" style="margin-top:18px">安全 · NETWORK</div><div class="g">● 只连过 5 个网站 · 无遥测</div></div></div>
  <div class="fk"><span><b>GO</b>打开 Codex</span><span><b>F2</b>去充值</span><span><b>F3</b>换 Key</span><span><b>F8</b>安全</span><span><b>F1</b>帮助</span></div></div>`;

G.notion = () => `<div class="gw g10">
  <div class="sb"><div class="tl" style="margin:2px 8px 18px"><i></i><i></i><i></i></div><div class="it" style="font-weight:600; color:#37352f">🦉 CodexBuddy</div><div style="height:10px"></div>
    <div class="it on">🧠 模型</div><div class="it">🛡️ 安全</div><div class="it">⚙️ 设置</div><div class="it">💬 帮助</div></div>
  <div class="pg"><div class="emo">🧠</div><h1>模型</h1>
    <div class="callout"><span style="font-size:22px">✅</span><div><b>正在用 DeepSeek</b><div style="color:#787774; font-size:14px">deepseek-chat · 128 ms · 余额 ¥23.50</div></div><span style="margin-left:auto; background:#2383e2; color:#fff; border-radius:5px; padding:7px 14px; font-size:14px">打开 Codex</span></div>
    <div class="db"><div class="dr h"><div>Aa 名称</div><div>◉ 状态</div><div># 延迟</div><div>≡ 价格</div></div>
      <div class="dr"><div>🟦 DeepSeek</div><div><span class="opt" style="background:#dbeddb; color:#1c3829">正在用</span></div><div>128 ms</div><div><span class="opt" style="background:#fdecc8; color:#402c1b">按量付费</span></div></div>
      <div class="dr"><div>🔷 智谱</div><div><span class="opt" style="background:#e3e2e0">可用</span></div><div>210 ms</div><div><span class="opt" style="background:#dbeddb; color:#1c3829">免费</span></div></div>
      <div class="dr" style="color:#9b9a97"><div>⬛ OpenAI</div><div><span class="opt" style="background:#ffe2dd; color:#5d1715">连不上</span></div><div>—</div><div></div></div>
      <div class="dr" style="color:#9b9a97; border-bottom:0"><div>＋ 新建（其他厂商）</div><div></div><div></div><div></div></div></div>
    <div class="tg" style="margin-top:12px">▸ 去充值</div><div class="tg">▸ 换 Key</div></div></div>`;

const GALLERY = [
  { key:'ls', name:'Little Snitch', learn:'原生 Mac 三栏 + 地图检查器', render:() => lsWin(), score:86, gap:'地图底图没有 Apple 地图精细（开发时用 MapKit）' },
  { key:'things', name:'Things 3', learn:'极致留白、圆形勾选、展开成一张浮起的卡片', render:G.things, score:84, gap:'图标和间距接近，但没有 Things 自家字体的细腻' },
  { key:'raycast', name:'Raycast', learn:'整个 App 就是一个深色命令面板，键盘优先', render:G.raycast, score:84, gap:'真 Raycast 面板是毛玻璃，能透出桌面壁纸' },
  { key:'linear', name:'Linear', learn:'深色、1px 细线、分组列表 + 右侧属性栏', render:G.linear, score:85, gap:'状态图标是字符拼的，不是 Linear 自绘的图标' },
  { key:'arc', name:'Arc 浏览器', learn:'彩色侧栏，内容放在一张白色圆角卡里', render:G.arc, score:80, gap:'中间留白偏多；Arc 侧栏下面还有标签页列表' },
  { key:'activity', name:'活动监视器', learn:'Mac 自带工具：分段控件、斑马纹表格、黑底曲线图', render:G.activity, score:88, gap:'工具栏图标是字符，不是系统图标' },
  { key:'te', name:'Teenage Engineering', learn:'硬件感：等宽小写字、黑屏大数字、四个彩色旋钮、实体按键', render:G.te, score:82, gap:'没有 TE 自家的字体，旋钮缺金属和塑料质感' },
  { key:'macos', name:'经典 Mac OS', learn:'90 年代 Mac：条纹标题栏、立体斜面按钮、分组框', render:G.macos, score:75, gap:'缺像素字体（Chicago）和像素图标，最不像原作' },
  { key:'bloomberg', name:'Bloomberg 终端', learn:'黑底琥珀色等宽字、功能键、数据面板', render:G.bloomberg, score:85, gap:'真终端信息更密、面板更多' },
  { key:'notion', name:'Notion', learn:'像一页文档：大表情图标、提示块、数据库表格、折叠块', render:G.notion, score:87, gap:'缺页面顶部的封面图' },
];
