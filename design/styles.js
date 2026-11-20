/* 模型页：11 种主流 UI 风格（站主 2026-11-11：「上面这些风格都画」）。同样的内容：正在用 DeepSeek，其他是智谱、OpenAI（打不开）、＋其他厂商 */
document.head.insertAdjacentHTML('beforeend', `<style>
  .xs .win .main { overflow:hidden; }
  .xs .blob { position:absolute; border-radius:50%; z-index:0; animation:drift 14s ease-in-out infinite alternate; }
  @keyframes drift { to { transform:translate(60px, 40px) scale(1.15); } }
  .xs .z { position:relative; z-index:1; }
  .xs .row2 { display:flex; gap:14px; align-items:center; }

  /* 1 液态玻璃 */
  .x1 .win .body { background:#eef1f7 !important; }
  .x1 .win .nav { width:124px !important; margin:10px 0 10px 10px; border-radius:20px; background:rgba(255,255,255,.4) !important; backdrop-filter:blur(24px) saturate(180%) !important; border:1px solid rgba(255,255,255,.8) !important; box-shadow:inset 0 1px 0 #fff, 0 8px 30px rgba(30,40,90,.08); z-index:2; }
  .x1 .win .nav div.on { background:rgba(255,255,255,.75) !important; box-shadow:0 2px 8px rgba(0,0,0,.06) !important; }
  .x1 .win .main { background:transparent !important; }
  .x1 .gl { background:rgba(255,255,255,.38); backdrop-filter:blur(22px) saturate(190%); -webkit-backdrop-filter:blur(22px) saturate(190%); border:1px solid rgba(255,255,255,.8); border-radius:28px; box-shadow:inset 0 1px 1px rgba(255,255,255,.95), inset 0 -1px 1px rgba(255,255,255,.35), 0 12px 40px rgba(30,40,90,.10); }
  .x1 .hero { padding:26px 28px; display:flex; flex-direction:column; gap:10px; }
  .x1 .hero .nm { font-size:34px; font-weight:700; display:flex; align-items:center; gap:14px; }
  .x1 .mini { flex:1; padding:16px 18px; display:flex; align-items:center; gap:12px; font-weight:600; }
  .x1 .mini.grey { opacity:.5; }
  .x1 .dock { position:absolute; left:50%; bottom:28px; transform:translateX(-50%); display:flex; gap:8px; padding:8px; border-radius:40px; z-index:1; }
  .x1 .dock span { padding:12px 18px; border-radius:30px; color:#334155; }
  .x1 .dock span.p { background:rgba(12,141,246,.85); color:#fff; font-weight:600; box-shadow:inset 0 1px 0 rgba(255,255,255,.5); }

  /* 2 玻璃拟态 */
  .x2 .win { color:#fff !important; }
  .x2 .win .body { background:#3b2fc9 !important; }
  .x2 .win .nav { background:rgba(255,255,255,.08) !important; border-right:1px solid rgba(255,255,255,.18) !important; backdrop-filter:blur(20px) !important; }
  .x2 .win .nav div { color:rgba(255,255,255,.7) !important; } .x2 .win .nav div.on { background:rgba(255,255,255,.2) !important; color:#fff !important; }
  .x2 .fr { background:rgba(255,255,255,.14); backdrop-filter:blur(18px); border:1px solid rgba(255,255,255,.35); border-radius:24px; padding:22px; display:flex; flex-direction:column; gap:12px; font-size:20px; font-weight:600; }
  .x2 .fr.on { background:rgba(255,255,255,.28); }
  .x2 .fr.grey { opacity:.45; }
  .x2 .g2 { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .x2 .wb { background:#fff; color:#3b2fc9; border-radius:14px; padding:10px 20px; font-weight:700; font-size:16px; }

  /* 3 黏土 */
  .x3 .win .body, .x3 .win .nav { background:#eef0ff !important; }
  .x3 .win .nav div.on { background:#fff !important; border-radius:16px !important; box-shadow:0 8px 16px -6px rgba(90,80,200,.3), inset -3px -3px 6px rgba(0,0,0,.05) !important; }
  .x3 .cl { border-radius:38px; padding:24px; display:flex; flex-direction:column; gap:14px; font-size:21px; font-weight:800; color:#2b2b55; box-shadow:0 20px 32px -12px rgba(80,70,180,.35), inset -10px -10px 20px rgba(0,0,0,.07), inset 10px 10px 20px rgba(255,255,255,.75); }
  .x3 .ball { width:58px; height:58px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:24px; box-shadow:inset -6px -6px 12px rgba(0,0,0,.18), inset 6px 6px 12px rgba(255,255,255,.4), 0 8px 14px -4px rgba(0,0,0,.25); }
  .x3 .g2 { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
  .x3 .badge { align-self:flex-start; background:#fff; color:#4f5bd5; border-radius:20px; padding:4px 14px; font-size:15px; box-shadow:0 6px 12px -4px rgba(80,70,180,.3); }
  .x3 .cbtn { background:#6c7bff; color:#fff; border-radius:24px; padding:14px 30px; font-weight:800; font-size:18px; box-shadow:0 14px 22px -8px rgba(108,123,255,.7), inset -4px -4px 8px rgba(0,0,0,.15), inset 4px 4px 8px rgba(255,255,255,.35); }

  /* 4 便当盒 */
  .x4 .bento { display:grid; grid-template-columns:repeat(4, 1fr); grid-auto-rows:150px; gap:12px; }
  .x4 .bx { background:#f5f5f7; border-radius:24px; padding:18px; display:flex; flex-direction:column; gap:8px; font-weight:600; }
  .x4 .bx.big { grid-column:span 2; grid-row:span 2; background:#0c8df6; color:#fff; padding:26px; }
  .x4 .bx .k { font-size:13px; color:#86868b; font-weight:500; } .x4 .bx.big .k { color:rgba(255,255,255,.75); }
  .x4 .bx .v { font-size:30px; font-weight:700; margin-top:auto; }
  .x4 .bx.grey { opacity:.45; }

  /* 5 极光 */
  .x5 .aur { position:absolute; inset:0; filter:blur(70px); opacity:.75; }
  .x5 .hero5 { text-align:center; margin-top:40px; display:flex; flex-direction:column; align-items:center; gap:12px; }
  .x5 .hero5 .nm { font-size:56px; font-weight:800; letter-spacing:-1px; }
  .x5 .r5 { display:flex; gap:14px; margin-top:auto; margin-bottom:10px; }
  .x5 .c5 { flex:1; background:rgba(255,255,255,.65); border:1px solid rgba(255,255,255,.9); border-radius:20px; padding:16px; display:flex; align-items:center; gap:10px; font-weight:600; backdrop-filter:blur(10px); }
  .x5 .c5.grey { opacity:.5; }

  /* 6 新粗野（撞色） */
  .x6 .win .body, .x6 .win .nav { background:#fff4c2 !important; }
  .x6 .win .nav { border-right:3px solid #111 !important; }
  .x6 .win .nav div { color:#111 !important; font-weight:700; } .x6 .win .nav div.on { background:#111 !important; color:#fde047 !important; border-radius:8px !important; box-shadow:none !important; }
  .x6 .nb6 { border:3px solid #111; border-radius:14px; box-shadow:6px 6px 0 #111; padding:20px; display:flex; flex-direction:column; gap:10px; font-size:22px; font-weight:800; color:#111; position:relative; }
  .x6 .g2 { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .x6 .stk { position:absolute; right:-12px; top:-16px; background:#facc15; border:3px solid #111; border-radius:30px; padding:4px 14px; font-size:15px; transform:rotate(8deg); }
  .x6 .bb { background:#111; color:#fde047; border-radius:10px; padding:12px 24px; font-weight:800; box-shadow:4px 4px 0 #f472b6; }

  /* 7 新拟物 */
  .x7 .win .body, .x7 .win .nav { background:#e4e8ef !important; }
  .x7 .win .nav { border-right:0 !important; }
  .x7 .win .nav div.on { background:#e4e8ef !important; box-shadow:inset 4px 4px 8px #c5c9d0, inset -4px -4px 8px #fff !important; border-radius:12px !important; }
  .x7 .nu { background:#e4e8ef; border-radius:26px; box-shadow:9px 9px 18px #c2c6cd, -9px -9px 18px #ffffff; padding:22px; display:flex; flex-direction:column; align-items:center; gap:12px; font-weight:700; color:#475569; }
  .x7 .nu.on { box-shadow:inset 7px 7px 14px #c2c6cd, inset -7px -7px 14px #ffffff; color:#0c8df6; }
  .x7 .nu.grey { opacity:.45; }
  .x7 .g4 { display:grid; grid-template-columns:repeat(4, 1fr); gap:24px; }
  .x7 .knob { width:150px; height:150px; border-radius:50%; background:#e4e8ef; box-shadow:12px 12px 24px #c2c6cd, -12px -12px 24px #fff; display:flex; align-items:center; justify-content:center; }
  .x7 .knob i { width:110px; height:110px; border-radius:50%; box-shadow:inset 6px 6px 12px #c2c6cd, inset -6px -6px 12px #fff; display:flex; align-items:center; justify-content:center; font-style:normal; color:#0c8df6; font-weight:700; font-size:17px; }

  /* 8 铬 / 液态金属 */
  .x8 .win .body, .x8 .win .nav { background:#e6e8eb !important; }
  .x8 .chr { position:relative; overflow:hidden; border-radius:22px; border:1px solid #aeb5be; background:linear-gradient(135deg, #fbfbfc 0%, #cfd4da 30%, #ffffff 48%, #b9c0c8 68%, #f1f3f5 100%); box-shadow:inset 0 1px 0 #fff, 0 10px 24px rgba(40,50,60,.18); padding:22px; display:flex; flex-direction:column; gap:10px; color:#2a2f36; font-weight:700; }
  .x8 .chr::after { content:''; position:absolute; top:0; bottom:0; width:40%; left:-50%; background:linear-gradient(100deg, transparent, rgba(255,255,255,.85), transparent); animation:sheen 3.5s ease-in-out infinite; }
  @keyframes sheen { to { left:120%; } }
  .x8 .ctx { font-size:64px; font-weight:900; letter-spacing:-2px; background:linear-gradient(180deg, #ffffff 0%, #9aa3ad 45%, #3b4249 52%, #c9cfd6 80%, #fff 100%); -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-stroke:1px #8a929b; }
  .x8 .g3 { display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; }
  .x8 .grey { opacity:.5; }

  /* 9 高信息密度 */
  .x9 .win { font-size:13px !important; }
  .x9 .win .body, .x9 .win .nav { background:#fbfbfc !important; }
  .x9 .win .nav div { font-size:13px; padding:6px 10px !important; }
  .x9 table { width:100%; border-collapse:collapse; font-size:13px; }
  .x9 th { text-align:left; color:#8a8f98; font-weight:500; padding:8px 10px; border-bottom:1px solid #ececef; }
  .x9 td { padding:11px 10px; border-bottom:1px solid #f1f1f3; color:#3c4149; }
  .x9 tr.on td { background:#f4f7ff; }
  .x9 .mono { font-family:ui-monospace, Menlo, monospace; }
  .x9 .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:6px; }
  .x9 .kbd { border:1px solid #dcdde1; border-bottom-width:2px; border-radius:5px; padding:1px 6px; font-size:11px; color:#6b6f76; margin-left:6px; }
  .x9 .hd9 { display:flex; align-items:center; gap:10px; font-size:15px; font-weight:600; }

  /* 10 暖米色 / 自然 */
  .x10 .win .body { background:#f6f0e6 !important; } .x10 .win .nav { background:#efe6d8 !important; border-right:0 !important; }
  .x10 .win .nav div { font-family:'Songti SC', Georgia, serif; color:#7a6a55 !important; } .x10 .win .nav div.on { background:#fffaf2 !important; color:#b4532a !important; }
  .x10 .win { font-family:'Songti SC', Georgia, serif !important; color:#3d342a !important; }
  .x10 .h10 { font-size:46px; font-weight:700; line-height:1.2; }
  .x10 .og { background:#fffaf2; border:1px solid #e7dccb; padding:18px 20px; display:flex; align-items:center; gap:12px; font-size:19px; }
  .x10 .tc { background:#b4532a; color:#fff8ee; border-radius:40px; padding:12px 28px; font-size:17px; }
  .x10 .lg10 { width:42px; height:42px; border-radius:50% 46% 52% 44%; display:flex; align-items:center; justify-content:center; color:#fffaf2; font-weight:700; }

  /* 11 暗色霓虹 */
  .x11 .win { color:#e2e8f0 !important; background:#070a13 !important; }
  .x11 .win .body { background:#070a13 !important; background-image:linear-gradient(rgba(34,211,238,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.06) 1px, transparent 1px) !important; background-size:40px 40px !important; }
  .x11 .win .nav { background:rgba(7,10,19,.9) !important; border-right:1px solid #1e293b !important; }
  .x11 .win .nav div { color:#64748b !important; } .x11 .win .nav div.on { background:rgba(34,211,238,.1) !important; color:#22d3ee !important; box-shadow:inset 3px 0 0 #22d3ee !important; }
  .x11 .ne { border:1px solid rgba(34,211,238,.3); border-radius:16px; background:rgba(15,23,42,.75); padding:20px; display:flex; align-items:center; gap:14px; font-size:19px; font-weight:600; }
  .x11 .ne.on { border-color:#22d3ee; box-shadow:0 0 24px rgba(34,211,238,.45), inset 0 0 18px rgba(34,211,238,.12); animation:neon 2.4s ease-in-out infinite; }
  @keyframes neon { 50% { box-shadow:0 0 36px rgba(34,211,238,.7), inset 0 0 24px rgba(34,211,238,.2); } }
  .x11 .ne.grey { opacity:.35; }
  .x11 .glow { color:#22d3ee; text-shadow:0 0 12px rgba(34,211,238,.9); }
  .x11 .nb { border:1px solid #22d3ee; color:#22d3ee; border-radius:12px; padding:12px 26px; text-shadow:0 0 8px #22d3ee; box-shadow:0 0 16px rgba(34,211,238,.4); font-weight:700; }
</style>`);

const XM = [{ n:'DeepSeek', l:'D', c:'#4d6bfe', t:'按量付费' }, { n:'智谱', l:'智', c:'#1f6feb', t:'免费' }, { n:'OpenAI', l:'O', c:'#111827', t:'打不开网站' }];
const OK = '<span class="ok-t">✓ 能用</span>';
const spark = (c) => `<svg width="120" height="34" viewBox="0 0 120 34"><polyline fill="none" stroke="${c}" stroke-width="2" points="0,24 15,20 30,26 45,14 60,18 75,10 90,16 105,8 120,12"/></svg>`;

const STYLES = [
  { name:'液态玻璃', desc:'Apple 2025 年起全系统的样子：侧栏、卡片、底部工具条都是浮着的玻璃，能透出后面流动的颜色', cls:'x1', main:`
    <span class="blob" style="width:340px; height:340px; background:#ffc2dc; left:-60px; top:40px"></span>
    <span class="blob" style="width:380px; height:380px; background:#b8dcff; right:-80px; top:-60px; animation-delay:-5s"></span>
    <span class="blob" style="width:300px; height:300px; background:#c8f2dc; left:260px; bottom:-120px; animation-delay:-9s"></span>
    <div class="gl hero z"><div class="nm">${lg(XM[0], 56)}DeepSeek</div><div class="row2">${OK}<span style="color:#64748b">deepseek-chat</span></div></div>
    <div class="row2 z">${XM.slice(1).map((m, i) => `<div class="gl mini${i ? ' grey' : ''}">${lg(m, 34)}${m.n}</div>`).join('')}<div class="gl mini" style="color:#0c8df6">＋ 其他</div></div>
    <div class="gl dock"><span>¥</span><span>⋯</span><span class="p">打开 Codex</span></div>` },
  { name:'玻璃拟态', desc:'彩色背景上叠毛玻璃卡片，白字；Windows 11 和很多 AI 产品在用', cls:'x2', main:`
    <span class="blob" style="width:300px; height:300px; background:#ff6fb5; right:-40px; top:-40px"></span>
    <span class="blob" style="width:260px; height:260px; background:#ffb547; left:-60px; bottom:-60px; animation-delay:-6s"></span>
    <div class="row2 z" style="justify-content:space-between"><div style="font-size:28px; font-weight:700">模型</div><span class="wb">打开 Codex</span></div>
    <div class="g2 z">
      <div class="fr on">${lg(XM[0], 48)}DeepSeek<span style="font-size:15px">✓ 正在用 · 能用</span></div>
      <div class="fr">${lg(XM[1], 48)}智谱<span style="font-size:15px; opacity:.75">免费</span></div>
      <div class="fr grey">${lg(XM[2], 48)}OpenAI<span style="font-size:15px">打不开网站</span></div>
      <div class="fr" style="align-items:center; justify-content:center; font-size:34px">＋</div>
    </div>` },
  { name:'黏土', desc:'像捏出来的胖胖软软的黏土块，粉嫩配色、大圆角、3D 软阴影；最友好、最像玩具', cls:'x3', main:`
    <div class="row2" style="justify-content:space-between"><div style="font-size:30px; font-weight:800; color:#2b2b55">选个模型</div><span class="cbtn">打开 Codex</span></div>
    <div class="g2">
      <div class="cl" style="background:#c9d4ff"><span class="ball" style="background:#4d6bfe">D</span>DeepSeek<span class="badge">✓ 正在用</span></div>
      <div class="cl" style="background:#ffd6e0"><span class="ball" style="background:#f06292">智</span>智谱<span style="font-size:15px; opacity:.6">免费</span></div>
      <div class="cl" style="background:#e5e7eb; opacity:.6"><span class="ball" style="background:#6b7280">O</span>OpenAI<span style="font-size:15px; opacity:.6">打不开网站</span></div>
      <div class="cl" style="background:#d6f5e3; align-items:center; justify-content:center"><span class="ball" style="background:#34c38f">＋</span>其他厂商</div>
    </div>` },
  { name:'便当盒', desc:'一个大格子分成大小不一的小格，像日式便当；Apple 发布会和 SaaS 首页常用，白底也能做', cls:'x4', main:`
    <div class="bento">
      <div class="bx big"><span class="k">正在用</span><div style="font-size:44px; font-weight:800; margin-top:6px">DeepSeek</div><span>✓ 能用</span>
        <span style="margin-top:auto; align-self:flex-start; background:#fff; color:#0c8df6; border-radius:14px; padding:12px 24px; font-weight:700">打开 Codex</span></div>
      <div class="bx"><span class="k">余额</span><div class="v">¥23.5</div></div>
      <div class="bx"><span class="k">延迟</span>${spark('#0c8df6')}<div class="v" style="font-size:22px">128 ms</div></div>
      <div class="bx">${lg(XM[1], 36)}智谱<span class="k">免费</span></div>
      <div class="bx grey">${lg(XM[2], 36)}OpenAI<span class="k">打不开网站</span></div>
    </div>
    <div class="bento" style="grid-auto-rows:70px; grid-template-columns:3fr 1fr"><div class="bx" style="flex-direction:row; align-items:center; color:#0c8df6">＋ 其他厂商</div><div class="bx" style="align-items:center; justify-content:center; font-size:22px">⋯</div></div>` },
  { name:'极光', desc:'背后一团柔和流动的彩色光，像北极光；很多 AI 工具在用（就是渐变）', cls:'x5', main:`
    <div class="aur"><span class="blob" style="width:420px; height:300px; background:#7dd3fc; left:40px; top:-80px"></span><span class="blob" style="width:380px; height:300px; background:#c4b5fd; left:320px; top:-40px; animation-delay:-4s"></span><span class="blob" style="width:300px; height:260px; background:#fbcfe8; left:520px; top:40px; animation-delay:-8s"></span></div>
    <div class="hero5 z"><span style="color:#64748b; letter-spacing:.3em; font-size:14px">正 在 用</span><div class="nm">DeepSeek</div>${OK}<span class="btn p big" style="margin-top:10px">打开 Codex</span></div>
    <div class="r5 z">${XM.slice(1).map((m, i) => `<div class="c5${i ? ' grey' : ''}">${lg(m, 34)}${m.n}</div>`).join('')}<div class="c5" style="color:#7c3aed">＋ 其他</div></div>` },
  { name:'新粗野（撞色）', desc:'奶黄底、粗黑边、硬阴影、每张卡一种亮色，贴纸歪着贴；独立开发者工具爱用', cls:'x6', main:`
    <div class="row2" style="justify-content:space-between"><div style="font-size:32px; font-weight:900">模型</div><span class="bb">打开 Codex →</span></div>
    <div class="g2">
      <div class="nb6" style="background:#a5b4fc"><span class="stk">✓ 正在用</span><span class="lg" style="width:48px; height:48px; border:3px solid #111; background:#fff; color:#111; font-size:22px">D</span>DeepSeek<span style="font-size:15px">按量付费 · ¥</span></div>
      <div class="nb6" style="background:#fda4af"><span class="lg" style="width:48px; height:48px; border:3px solid #111; background:#fff; color:#111; font-size:22px">智</span>智谱<span style="font-size:15px">免费</span></div>
      <div class="nb6" style="background:#e5e7eb; opacity:.6"><span class="lg" style="width:48px; height:48px; border:3px solid #111; background:#fff; color:#111; font-size:22px">O</span>OpenAI<span style="font-size:15px">打不开网站</span></div>
      <div class="nb6" style="background:#86efac; align-items:center; justify-content:center; font-size:40px">＋</div>
    </div>` },
  { name:'新拟物', desc:'整个界面像一块软塑料，按钮从里面鼓出来，正在用的那个被按进去', cls:'x7', main:`
    <div style="display:flex; align-items:center; gap:40px; justify-content:center; margin-top:10px"><div class="knob"><i>✓ 能用</i></div>
      <div><div style="font-size:36px; font-weight:800; color:#334155">DeepSeek</div><div style="color:#94a3b8; margin:6px 0 18px">deepseek-chat</div><span class="nu" style="display:inline-flex; padding:14px 28px; color:#0c8df6; border-radius:18px">打开 Codex</span></div></div>
    <div class="g4" style="margin-top:auto; margin-bottom:10px">
      <div class="nu on">${lg(XM[0], 40)}DeepSeek</div><div class="nu">${lg(XM[1], 40)}智谱</div><div class="nu grey">${lg(XM[2], 40)}OpenAI</div><div class="nu" style="font-size:28px; color:#0c8df6">＋</div>
    </div>` },
  { name:'铬 / 液态金属', desc:'镜面银色的金属质感，光从表面扫过；潮牌和音乐类产品常用', cls:'x8', main:`
    <div style="text-align:center"><div class="ctx">DeepSeek</div><div style="margin-top:-4px">${OK}</div></div>
    <div class="g3">
      <div class="chr">${lg({ l:'D', c:'#3b4249' }, 44)}DeepSeek<span style="font-size:14px; font-weight:500">✓ 正在用</span></div>
      <div class="chr">${lg({ l:'智', c:'#3b4249' }, 44)}智谱<span style="font-size:14px; font-weight:500">免费</span></div>
      <div class="chr grey">${lg({ l:'O', c:'#3b4249' }, 44)}OpenAI<span style="font-size:14px; font-weight:500">打不开网站</span></div>
    </div>
    <div class="row2" style="justify-content:center; margin-top:auto; margin-bottom:10px"><div class="chr" style="flex-direction:row; padding:12px 22px">＋ 其他厂商</div><div class="chr" style="flex-direction:row; padding:12px 30px; color:#0c8df6">打开 Codex</div></div>` },
  { name:'高信息密度', desc:'小字、表格、等宽数字、快捷键，一屏看全所有数据；像 Linear、Raycast 这类专业工具', cls:'x9', main:`
    <div class="row2" style="justify-content:space-between"><div class="hd9">模型 <span style="font-size:12px; color:#16a34a; background:#ecfdf3; border-radius:10px; padding:2px 8px">全部正常</span></div><span class="btn p" style="font-size:13px; padding:7px 14px">打开 Codex<span class="kbd" style="color:#fff; border-color:rgba(255,255,255,.5)">⌘O</span></span></div>
    <table><tr><th>模型</th><th>状态</th><th>延迟</th><th>今日</th><th>余额</th><th></th></tr>
      <tr class="on"><td>${lg(XM[0], 22)} <b>DeepSeek</b> <span style="color:#8a8f98">deepseek-chat</span></td><td><span class="dot" style="background:#16a34a"></span>正在用</td><td class="mono">128 ms</td><td class="mono">12.4k tok</td><td class="mono">¥23.50</td><td style="color:#8a8f98">⋯</td></tr>
      <tr><td>${lg(XM[1], 22)} 智谱 <span style="color:#8a8f98">glm-4.5-flash</span></td><td><span class="dot" style="background:#94a3b8"></span>待用</td><td class="mono">210 ms</td><td class="mono">—</td><td class="mono">免费</td><td style="color:#8a8f98">⋯</td></tr>
      <tr style="opacity:.5"><td>${lg(XM[2], 22)} OpenAI</td><td><span class="dot" style="background:#dc2626"></span>打不开</td><td class="mono">—</td><td class="mono">—</td><td class="mono">—</td><td></td></tr>
      <tr><td colspan="6" style="color:#0c8df6">＋ 其他厂商 <span class="kbd">⌘N</span></td></tr></table>
    <div style="margin-top:auto; display:flex; gap:30px; color:#8a8f98; font-size:12px"><span>近 1 小时延迟 ${spark('#0c8df6')}</span></div>` },
  { name:'暖米色 / 自然', desc:'米色纸张底、宋体、陶土红点缀、手绘下划线、不规则圆角；像生活方式类产品', cls:'x10', main:`
    <div class="h10">今天用<br><span style="position:relative">DeepSeek<svg style="position:absolute; left:0; bottom:-10px" width="230" height="16" viewBox="0 0 230 16"><path d="M3 10 C 50 2, 90 15, 140 7 S 210 4, 227 9" stroke="#b4532a" stroke-width="3" fill="none" stroke-linecap="round"/></svg></span></div>
    <div class="row2" style="margin-top:6px"><span style="color:#5f7a3a">✓ 能用</span><span class="tc" style="margin-left:auto">打开 Codex</span></div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-top:auto; margin-bottom:10px">
      <div class="og" style="border-radius:28px 18px 32px 20px"><span class="lg10" style="background:#5f7a3a">智</span>智谱<span style="margin-left:auto; color:#9a8a75; font-size:14px">免费</span></div>
      <div class="og" style="border-radius:18px 30px 20px 34px; opacity:.5"><span class="lg10" style="background:#8a7d6b">O</span>OpenAI</div>
      <div class="og" style="border-radius:30px 22px 26px 18px; color:#b4532a; border-style:dashed">＋ 其他厂商</div>
    </div>` },
  { name:'暗色霓虹', desc:'黑底、网格线、青色霓虹光边，正在用的那张在呼吸发光；游戏和加密货币类常用', cls:'x11', main:`
    <div class="row2" style="justify-content:space-between"><div><div style="font-size:13px; letter-spacing:.3em; color:#64748b">ONLINE</div><div style="font-size:40px; font-weight:800" class="glow">DeepSeek</div></div><span class="nb">打开 Codex</span></div>
    <div style="display:flex; flex-direction:column; gap:14px; margin-top:10px">
      <div class="ne on">${lg(XM[0], 40)}DeepSeek<span class="glow" style="margin-left:auto; font-size:15px">● 能用 · 128ms</span></div>
      <div class="ne">${lg(XM[1], 40)}智谱<span style="margin-left:auto; color:#64748b; font-size:15px">免费</span></div>
      <div class="ne grey">${lg(XM[2], 40)}OpenAI<span style="margin-left:auto; font-size:15px">打不开网站</span></div>
      <div class="ne" style="border-color:rgba(232,121,249,.4); color:#e879f9">＋ 其他厂商</div>
    </div>` },
];
if (document.getElementById('styleRoot')) document.getElementById('styleRoot').innerHTML = STYLES.map((v, i) => `<div class="scene" id="x${i + 1}"><div class="cap"><h3><span class="n">${i + 1}</span>${v.name}</h3><dl><dd>${v.desc}</dd></dl></div>
  <div class="shot"><div class="fit xs ${v.cls}">${win({ nav:'模型', main:v.main })}</div></div></div>`).join('');

/* ---------- Little Snitch 思路：你的电脑 → 模型服务器 的连接地图（站主 2026-11-11） ---------- */
document.head.insertAdjacentHTML('beforeend', `<style>
  .ls .win .main { gap:12px !important; }
  .ls .top { display:flex; align-items:center; gap:14px; }
  .ls .top .nm { font-size:30px; font-weight:700; }
  .ls .map { position:relative; border-radius:16px; overflow:hidden; }
  .ls .map svg { display:block; }
  .ls .flow { stroke-dasharray:2 10; stroke-linecap:round; animation:flow 1.1s linear infinite; }
  @keyframes flow { to { stroke-dashoffset:-24; } }
  .ls table { width:100%; border-collapse:collapse; font-size:14px; }
  .ls td { padding:9px 8px; }
  .ls tr + tr td { border-top:1px solid var(--ls-line); }
  .ls .mono { font-family:ui-monospace, Menlo, monospace; font-size:13px; }
  .ls .st { font-size:13px; font-weight:600; }
  .ls .ico { width:28px; height:28px; border-radius:8px; border:1px solid var(--ls-line); display:inline-flex; align-items:center; justify-content:center; color:var(--ls-sub); font-size:13px; margin-left:4px; }
  .ls-light { --ls-line:#eef0f3; --ls-sub:#94a3b8; }
  .ls-light .map { background:#f8fafc; }
  .ls-dark { --ls-line:#1f2937; --ls-sub:#64748b; }
  .ls-dark .win { color:#e5e7eb !important; background:#0b0f17 !important; }
  .ls-dark .win .body { background:#0b0f17 !important; }
  .ls-dark .win .nav { background:#0e131c !important; border-right:1px solid #1f2937 !important; }
  .ls-dark .win .nav div { color:#64748b !important; } .ls-dark .win .nav div.on { background:rgba(56,189,248,.12) !important; color:#38bdf8 !important; }
  .ls-dark .map { background:#0e141f; }
  .ls-dark .ok-t { color:#34d399; }
</style>`);
function lsMap(dark) {
  const W = 780, H = 330, L0 = 90, L1 = 145, T = 49, B = 19;
  const P = (lon, lat) => [((lon < 0 ? lon + 360 : lon) - L0) / (L1 - L0) * W, (T - lat) / (T - B) * H];
  const land = [
    [[-168,66],[-140,70],[-95,72],[-80,73],[-62,60],[-55,50],[-66,44],[-76,35],[-81,25],[-97,26],[-97,18],[-87,15],[-78,8],[-83,8],[-105,20],[-117,32],[-124,40],[-125,49],[-135,58],[-150,60],[-165,62]],
    [[40,45],[40,66],[60,70],[80,73],[110,77],[140,72],[170,70],[180,66],[160,60],[140,55],[138,48],[133,43],[130,42.5],[129,41],[126,40],[124,39.8],[121.5,40.8],[119,39.2],[117.7,38.5],[118.8,37.2],[120.7,37.8],[122.5,37],[119.5,35],[120.5,33],[121.8,31],[121.9,29.8],[121.5,28.5],[120.3,27],[119.5,25.5],[118,24.4],[116.5,23],[114,22.2],[111,21.4],[109.6,21.6],[108,21.5],[106.7,20.5],[105.8,19],[105,10],[100,13],[98,8],[95,16],[90,22],[80,8],[73,20],[66,25],[57,25],[52,28],[48,30],[58,22],[52,12],[44,13],[35,30],[36,36],[28,41]],
    [[130,31],[132,34],[135,34],[140,35],[141,38],[142,40],[140,42],[141,45.5],[139,38],[136,36],[133,35.5],[130,33.5]],[[125,38],[126.5,34.5],[129,35],[129.5,37.5],[128.3,38.6],[125,39.5]],[[108.6,18.2],[111,19.5],[110.5,20.2],[109,20]],
    [[95,5],[105,-6],[120,-8],[140,-4],[150,-6],[125,5],[118,7],[108,2]],
    [[120.7,22],[121.9,25],[121,25.3],[120.1,23]],
  ];
  const inside = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  let dots = '';
  for (let lat = T; lat >= B; lat -= 0.75) for (let lon = L0; lon <= L1; lon += 0.75) {
    const ln = lon > 180 ? lon - 360 : lon;
    if (land.some((p) => inside(ln, lat, p))) { const [x, y] = P(lon, lat); dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2"/>`; }
  }
  const blue = dark ? '#38bdf8' : '#0c8df6', red = dark ? '#f87171' : '#e11d48', dim = dark ? '#475569' : '#94a3b8', txt = dark ? '#e5e7eb' : '#0f172a', sub = dark ? '#94a3b8' : '#64748b';
  const me = P(114.3, 30.6), ds = P(120.2, 30.3), zp = P(116.4, 39.9), oa = [W + 60, 70];
  const arc = (a, b, lift) => { const cx = (a[0] + b[0]) / 2, cy = Math.min(a[1], b[1]) - lift; return { d:`M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`, mid:[(a[0] + 2 * cx + b[0]) / 4, (a[1] + 2 * cy + b[1]) / 4] }; };
  const aDS = arc(me, ds, 90), aZP = arc(me, zp, 50), aOA = arc(me, oa, 120);
  const ring = (p, c) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${c}"/><circle cx="${p[0]}" cy="${p[1]}" r="5" fill="none" stroke="${c}" stroke-width="2"><animate attributeName="r" from="5" to="22" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" from=".8" to="0" dur="1.8s" repeatCount="indefinite"/></circle>`;
  const label = (p, dx, dy, t, s, c) => `<text x="${p[0] + dx}" y="${p[1] + dy}" font-size="13" font-weight="600" fill="${c || txt}">${t}<tspan fill="${sub}" font-weight="400"> ${s}</tspan></text>`;
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <g fill="${dark ? '#243041' : '#d5dbe3'}">${dots}</g>
    <path d="${aZP.d}" fill="none" stroke="${dim}" stroke-width="1.5" stroke-dasharray="3 5"/>
    <path d="${aOA.d}" fill="none" stroke="${red}" stroke-width="1.5" stroke-dasharray="4 6" opacity=".7"/>
    <g transform="translate(${aOA.mid[0]},${aOA.mid[1]})"><circle r="11" fill="${dark ? '#0e141f' : '#fff'}" stroke="${red}"/><text text-anchor="middle" y="5" font-size="14" fill="${red}">✕</text></g>
    <path d="${aDS.d}" fill="none" stroke="${blue}" stroke-width="2.5" opacity=".35"/>
    <path class="flow" d="${aDS.d}" fill="none" stroke="${blue}" stroke-width="3.5"/>
    <circle r="4.5" fill="${blue}"><animateMotion dur="1.6s" repeatCount="indefinite" path="${aDS.d}"/></circle>
    <circle r="3.5" fill="${blue}" opacity=".6"><animateMotion dur="1.6s" begin=".8s" repeatCount="indefinite" path="${aDS.d}" keyPoints="1;0" keyTimes="0;1" calcMode="linear"/></circle>
    ${ring(me, txt)}${ring(ds, blue)}
    <circle cx="${zp[0]}" cy="${zp[1]}" r="4" fill="${dim}"/><circle cx="${oa[0]}" cy="${oa[1]}" r="4" fill="${red}" opacity=".7"/>
    ${label(me, -40, 30, '你的电脑', '')}
    ${label(ds, 12, 18, 'DeepSeek', '杭州 · 128ms', blue)}
    ${label(zp, 10, -8, '智谱', '北京')}
    ${label([W - 10, 64], -150, 0, 'OpenAI', '美国 · 连不上', red)}
  </svg>`;
  const spark = `<svg width="90" height="22" viewBox="0 0 90 22"><polyline fill="none" stroke="${blue}" stroke-width="1.8" points="0,16 10,12 20,17 30,8 40,12 50,5 60,11 70,6 80,9 90,4"/></svg>`;
  const lgx = (l, c) => lg({ l, c }, 26);
  return `<div class="top"><span class="nm">DeepSeek</span><span class="ok-t">✓ 能用</span><span class="btn p" style="margin-left:auto">打开 Codex</span></div>
    <div class="map">${svg}</div>
    <table>
      <tr><td>${lgx('D', '#4d6bfe')} <b>DeepSeek</b></td><td style="color:${sub}">杭州</td><td class="mono">128 ms</td><td>${spark}</td><td class="st" style="color:${blue}">● 正在用</td><td style="text-align:right"><span class="ico">¥</span><span class="ico">⋯</span></td></tr>
      <tr><td>${lgx('智', '#1f6feb')} 智谱</td><td style="color:${sub}">北京</td><td class="mono">210 ms</td><td style="color:${sub}">免费</td><td class="st" style="color:${sub}">待用</td><td></td></tr>
      <tr style="opacity:.6"><td>${lgx('O', '#111827')} OpenAI</td><td style="color:${sub}">美国</td><td class="mono">—</td><td></td><td class="st" style="color:${red}">连不上</td><td></td></tr>
      <tr><td colspan="6" style="color:${blue}">＋ 其他厂商</td></tr>
    </table>`;
}
if (0) document.getElementById('styleRoot').insertAdjacentHTML('afterbegin', [false, true].map((dark) => `<div class="scene" id="ls${dark ? 2 : 1}"><div class="cap"><h3><span class="n">★</span>连接图（${dark ? '深色' : '浅色'}）</h3><dl><dd>学 Little Snitch 网络监视器：模型页就是一张地图，你的电脑连向哪家模型的服务器，就有一条线，数据在线上流动；连不上的那条是断的。安全面板「连过哪些网站」也能用同一张图</dd></dl></div>
  <div class="shot"><div class="fit xs ls ${dark ? 'ls-dark' : 'ls-light'}">${win({ nav:'模型', main:lsMap(dark) })}</div></div></div>`).join(''));

/* ---------- 学 Little Snitch 的 UI 风格：原生三栏、系统字体、小号字、紫/蓝成对、灰色标签右对齐（站主 2026-11-11） ---------- */
document.head.insertAdjacentHTML('beforeend', `<style>
  .fit > .lsw { position:absolute; left:0; top:0; transform-origin:0 0; }
  .lsw { width:1180px; height:700px; border-radius:11px; overflow:hidden; display:flex; font:13px/1.35 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif; color:#1d1d1f; box-shadow:0 0 0 .5px rgba(0,0,0,.25), 0 22px 60px rgba(0,0,0,.28); background:#fff; -webkit-font-smoothing:antialiased; }
  .lsw .sb { width:300px; flex:none; background:#e9e8ea; border-right:.5px solid #cfcfd1; display:flex; flex-direction:column; }
  .lsw .tl { display:flex; align-items:center; height:44px; padding:0 12px; gap:8px; }
  .lsw .tl i { width:12px; height:12px; border-radius:50%; display:inline-block; }
  .lsw .tbi { margin-left:auto; display:flex; gap:14px; color:#6e6e73; font-size:14px; }
  .lsw .tbi span.on { color:#0a64d8; }
  .lsw .search { margin:0 10px 8px; height:24px; border-radius:6px; background:rgba(0,0,0,.06); color:#8e8e93; display:flex; align-items:center; padding:0 8px; gap:6px; font-size:12px; }
  .lsw .row { display:flex; align-items:center; height:26px; margin:0 8px; padding:0 6px; border-radius:6px; gap:7px; }
  .lsw .row .tri { width:10px; color:#8e8e93; font-size:9px; }
  .lsw .row.sel { background:#0a64d8; color:#fff; } .lsw .row.sel .tri { color:#fff; }
  .lsw .row.child { padding-left:26px; font-size:12px; color:#3a3a3c; }
  .lsw .ic { width:18px; height:18px; border-radius:5px; display:inline-flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:700; flex:none; box-shadow:inset 0 0 0 .5px rgba(0,0,0,.15); }
  .lsw .mb { margin-left:auto; display:flex; align-items:flex-end; gap:1px; height:14px; }
  .lsw .mb b { width:2px; background:#b48cf2; } .lsw .mb b.d { background:#5b9cf6; }
  .lsw .ck { display:flex; border:.5px solid #c7c7cc; border-radius:4px; overflow:hidden; background:#fff; }
  .lsw .ck span { width:16px; height:15px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#c7c7cc; }
  .lsw .ck span.y { background:#30c048; color:#fff; } .lsw .ck span.n { background:#ff3b30; color:#fff; }
  .lsw .row.sel .ck { border-color:rgba(255,255,255,.6); }
  .lsw .chips { display:flex; gap:6px; margin:auto 10px 6px; }
  .lsw .chip { flex:1; border-radius:6px; padding:3px 8px; font-size:12px; display:flex; justify-content:space-between; }
  .lsw .chip.u { background:#ebe1fb; color:#7b4fd0; } .lsw .chip.d { background:#dde9fd; color:#2f6fd6; }
  .lsw .chip b { color:#1d1d1f; font-weight:600; }
  .lsw .bars { height:84px; margin:0 10px; display:flex; align-items:center; gap:3px; }
  .lsw .bars div { flex:1; display:flex; flex-direction:column; justify-content:center; height:100%; gap:2px; }
  .lsw .bars i { display:block; border-radius:2px; background:#b48cf2; } .lsw .bars i.d { background:#5b9cf6; }
  .lsw .btb { height:30px; display:flex; align-items:center; gap:10px; padding:0 10px; color:#6e6e73; font-size:12px; border-top:.5px solid #d6d6d8; }
  .lsw .btb .cap { margin:0 auto; background:rgba(0,0,0,.06); border-radius:5px; padding:1px 12px; color:#1d1d1f; }
  .lsw .mapw { flex:1; position:relative; overflow:hidden; background:#aad3f3; }
  .lsw .pill { position:absolute; transform:translate(-50%, -50%); background:#fff; border-radius:10px; padding:2px 9px; font-size:12px; font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,.25); white-space:nowrap; }
  .lsw .pill small { color:#86868b; font-weight:400; margin-left:4px; }
  .lsw .insp { width:290px; flex:none; background:#f5f5f7; border-left:.5px solid #d1d1d6; padding:16px 14px; display:flex; flex-direction:column; gap:10px; overflow:hidden; }
  .lsw .ih { display:flex; align-items:center; gap:10px; font-size:19px; font-weight:600; }
  .lsw .ih .ic { width:34px; height:34px; border-radius:9px; font-size:16px; }
  .lsw .stat { display:flex; gap:8px; }
  .lsw .stat div { flex:1; border-radius:8px; padding:5px 10px; display:flex; justify-content:space-between; font-size:14px; font-weight:600; }
  .lsw .sec { font-size:11px; color:#6e6e73; background:#ebebee; border-radius:4px; padding:3px 8px; margin:2px -6px 0; }
  .lsw .kv { display:grid; grid-template-columns:72px 1fr; gap:3px 10px; font-size:12px; }
  .lsw .kv dt { color:#86868b; text-align:right; } .lsw .kv dd { margin:0; }
  .lsw .nbtn { border:.5px solid #c7c7cc; background:#fff; border-radius:6px; padding:3px 12px; font-size:13px; box-shadow:0 .5px 1px rgba(0,0,0,.1); }
  .lsw .nbtn.p { background:#0a64d8; color:#fff; border-color:#0a64d8; }
</style>`);
function lsWin() {
  const W = 590, H = 700, L0 = 95, L1 = 138, T = 50, B = 14;
  const P = (lon, lat) => [((lon - L0) / (L1 - L0) * W).toFixed(1), ((T - lat) / (T - B) * H).toFixed(1)];
  const polys = [
    [[90,55],[140,55],[138,48],[133,43],[130,42.5],[129,41],[126,40],[124,39.8],[121.5,40.8],[119,39.2],[117.7,38.5],[118.8,37.2],[120.7,37.8],[122.5,37],[119.5,35],[120.5,33],[121.8,31],[121.9,29.8],[121.5,28.5],[120.3,27],[119.5,25.5],[118,24.4],[116.5,23],[114,22.2],[111,21.4],[109.6,21.6],[108,21.5],[106.7,20.5],[105.8,19],[106.5,17],[108.8,15],[109.3,12],[109,10],[90,10]],
    [[125,38],[126.5,34.5],[129,35],[129.5,37.5],[128.3,38.6],[125,39.5]],
    [[130,31],[132,34],[135,34],[140,35],[141,38],[142,40],[140,42],[141,45.5],[139,38],[136,36],[133,35.5],[130,33.5]],
    [[108.6,18.2],[111,19.5],[110.5,20.2],[109,20]],
    [[120.7,22],[121.9,25],[121,25.3],[120.1,23]],
  ];
  const land = polys.map((p) => `<path d="M${p.map((q) => P(...q).join(',')).join('L')}Z" fill="#eef2e2" stroke="#cfd9bd" stroke-width="1.2"/>`).join('');
  const pl = (pts, c, w) => `<path d="M${pts.map((q) => P(...q).join(',')).join('L')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;
  const extra = `<path d="M${[[88,37],[100,36.5],[103,32],[101,27],[96,26],[88,28]].map((q) => P(...q).join(',')).join('L')}Z" fill="#e7e1cd"/>`
    + `<path d="M${[[100,46],[112,44],[118,46],[112,49],[100,50]].map((q) => P(...q).join(',')).join('L')}Z" fill="#ece8d6"/>`
    + pl([[91,33],[97,33],[100,28],[104,28.8],[106.5,29.5],[111,30.5],[114.3,30.6],[117,30.5],[118.8,32],[121.5,31.5]], '#9fcdee', 2.2)
    + pl([[96,35],[103.8,36],[106,37.5],[107,40.5],[111,40.5],[110.5,35.5],[113,34.8],[116,35.5],[118.8,37.6]], '#9fcdee', 1.8)
    + pl([[110,25.5],[110.5,23.5],[113.3,23.1],[113.6,22.4]], '#9fcdee', 1.4);
  const me = P(114.3, 30.6), ds = P(120.2, 30.3), zp = P(116.4, 39.9);
  const line = (a, b, w, c, dash) => `<path d="M${a[0]},${a[1]} Q${(+a[0] + +b[0]) / 2},${Math.min(a[1], b[1]) - 40} ${b[0]},${b[1]}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" ${dash ? 'stroke-dasharray="5 6"' : ''}/>`;
  const city = (lon, lat, n) => { const [x, y] = P(lon, lat); return `<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="#9aa0a6"/><text x="${+x + 6}" y="${+y + 4}" font-size="11" fill="#5f6368">${n}</text>`; };
  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute; inset:0">${land}${extra}
    ${city(121.5, 31.2, '上海')}${city(118.8, 32.1, '南京')}${city(106.5, 29.6, '重庆')}${city(113.6, 34.7, '郑州')}${city(123.4, 41.8, '沈阳')}${city(114.1, 22.6, '深圳')}${city(113.1, 23.3, '广州')}${city(104.1, 30.7, '成都')}${city(108.9, 34.3, '西安')}${city(126.6, 37.5, '首尔')}${city(139.7, 35.7, '东京')}
    <text x="${P(123, 35)[0]}" y="${P(123, 35)[1]}" font-size="12" font-style="italic" fill="#5b8db8">黄海</text><text x="${P(124.5, 28)[0]}" y="${P(124.5, 28)[1]}" font-size="12" font-style="italic" fill="#5b8db8">东海</text>
    ${line(me, zp, 2, '#7d8a99', true)}
    <path d="M${me[0]},${me[1]} Q${W - 80},40 ${W + 20},60" fill="none" stroke="#e0685c" stroke-width="2" stroke-dasharray="5 6"/>
    ${line(me, ds, 4.5, '#3d4f63')}
    <circle cx="${me[0]}" cy="${me[1]}" r="15" fill="#fff" stroke="#34495e" stroke-width="1.5"/><g transform="translate(${me[0] - 8},${me[1] - 6})" fill="none" stroke="#34495e" stroke-width="1.4" stroke-linejoin="round"><rect x="2" y="0" width="12" height="8.5" rx="1.2"/><path d="M0 11h16"/></g>
    <circle cx="${ds[0]}" cy="${ds[1]}" r="8" fill="#fff" stroke="#34495e" stroke-width="2"/><circle cx="${zp[0]}" cy="${zp[1]}" r="7" fill="#fff" stroke="#9aa0a6" stroke-width="2"/></svg>`;
  const bars = (n, seed) => { let x = seed; return Array.from({ length:n }, () => { x = (x * 9301 + 49297) % 233280; return 3 + Math.round(x / 233280 * 11); }); };
  const mb = (seed) => `<span class="mb">${bars(6, seed).map((h, i) => `<b class="${i % 2 ? 'd' : ''}" style="height:${h}px"></b>`).join('')}</span>`;
  const hist = bars(26, 7).map((h, i) => `<div><i style="height:${h * 2.4}px"></i><i class="d" style="height:${bars(1, i + 3)[0] * 2.8}px"></i></div>`).join('');
  const row = (ic, c, n, opt = {}) => `<div class="row${opt.sel ? ' sel' : ''}${opt.child ? ' child' : ''}"><span class="tri">${opt.child ? '' : opt.open ? '⌄' : '›'}</span>${ic ? `<span class="ic" style="background:${c}">${ic}</span>` : '<span style="color:#8e8e93">🌐</span>'}<span style="${opt.grey ? 'color:#a1a1a6' : ''}">${n}</span>${opt.bars ? mb(opt.bars) : '<span class="mb"></span>'}${opt.ck || ''}</div>`;
  const ck = (s) => `<span class="ck"><span class="${s === 'n' ? 'n' : ''}">✕</span><span class="${s === 'y' ? 'y' : ''}">✓</span></span>`;
  return `<div class="lsw">
    <div class="sb">
      <div class="tl"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
        <span class="tbi"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#0a64d8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6e6e73" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l5 2v4c0 3.2-2.2 5.4-5 6.4-2.8-1-5-3.2-5-6.4v-4z"/></svg><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6e6e73" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="1.8" y="2.5" width="12.4" height="11" rx="2"/><path d="M9.5 2.5v11"/></svg><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6e6e73" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6e6e73" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.7c-.5.3-.8.6-.8 1.2v.4M8 11.6v.1"/></svg></span></div>
      <div class="search">⌕ 搜索</div>
      ${row('D', '#4d6bfe', 'DeepSeek', { sel:true, open:true, bars:3, ck:ck('y') })}
      ${row('', '', 'api.deepseek.com', { child:true, bars:5 })}
      ${row('', '', 'platform.deepseek.com', { child:true, bars:9 })}
      ${row('智', '#1f6feb', '智谱', { open:true, bars:11, ck:ck('') })}
      ${row('', '', 'open.bigmodel.cn', { child:true, bars:13 })}
      ${row('O', '#1d1d1f', 'OpenAI', { open:true, grey:true, ck:ck('n') })}
      ${row('', '', '<span style="color:#a1a1a6">api.openai.com</span>', { child:true, ck:ck('n') })}
      ${row('', '', '<span style="color:#a1a1a6">chatgpt.com</span>', { child:true, ck:ck('n') })}
      ${row('＋', '#8e8e93', '其他厂商', {})}
      <div style="font-size:11px; color:#8e8e93; padding:10px 22px 0">只连过这 5 个网站</div>
      <div class="chips"><span class="chip u">↑ 发送 <b>1.2 MB</b></span><span class="chip d">↓ 接收 <b>8.4 MB</b></span></div>
      <div class="bars">${hist}</div>
      <div class="btb"><span>‹</span><span class="cap">今天</span><span>›</span></div>
    </div>
    <div class="mapw">${svg}
      <span class="pill" style="left:${me[0]}px; top:${+me[1] + 30}px">你的电脑</span>
      <span class="pill" style="left:${+ds[0] + 10}px; top:${+ds[1] + 26}px">DeepSeek<small>杭州</small></span>
      <span class="pill" style="left:${zp[0]}px; top:${+zp[1] - 24}px">智谱<small>北京</small></span>
      <span class="pill" style="left:${W - 70}px; top:84px; color:#d93025">OpenAI<small>连不上</small></span>
    </div>
    <div class="insp">
      <div class="ih"><span class="ic" style="background:#4d6bfe">D</span>DeepSeek</div>
      <div class="stat"><div style="background:#ebe1fb; color:#7b4fd0">↑ <span style="color:#1d1d1f">1.2 MB</span></div><div style="background:#dde9fd; color:#2f6fd6">↓ <span style="color:#1d1d1f">8.4 MB</span></div></div>
      <div class="sec">⌄ 状态</div>
      <dl class="kv"><dt>状态</dt><dd><span style="color:#30c048">●</span> 正在用</dd><dt>模型</dt><dd>deepseek-chat</dd><dt>延迟</dt><dd>128 ms</dd><dt>余额</dt><dd>¥23.50</dd></dl>
      <div class="sec">⌄ Key</div>
      <dl class="kv"><dt>Key</dt><dd>sk-••••a3f9</dd><dt>存在</dt><dd>本机 ~/.codex</dd><dt>创建于</dt><dd>今天 14:20</dd></dl>
      <div class="sec">⌄ 连接</div>
      <dl class="kv"><dt>域名</dt><dd>api.deepseek.com<br>platform.deepseek.com</dd><dt>端口</dt><dd>https (443)</dd><dt>连过</dt><dd>2 个域名，0 个别的</dd></dl>
      <div style="margin-top:auto; display:flex; gap:8px; justify-content:flex-end"><span class="nbtn">换 Key</span><span class="nbtn">去充值</span><span class="nbtn p">打开 Codex</span></div>
    </div>
  </div>`;
}
if (document.getElementById('styleRoot')) document.getElementById('styleRoot').insertAdjacentHTML('afterbegin', `<div class="scene" id="ls1"><div class="cap"><h3><span class="n">★</span>学 Little Snitch 的样子</h3><dl><dd>原生 Mac 三栏：左边半透明侧栏是模型列表（小图标、展开三角、选中整行变蓝、右边允许/禁止小方框、紫蓝流量条），中间地图，右边检查器（灰色标签右对齐）。系统字体 13 号，小圆角，紫=发送、蓝=接收成对出现</dd></dl></div>
  <div class="shot"><div class="fit">${lsWin()}</div></div></div>`);
