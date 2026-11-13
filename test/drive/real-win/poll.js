const st = JSON.parse(ctx.fs.readFileSync("C:/Users/hwy/CodexBuddy-Test/login-status.json","utf8")).status;
const cookies = await ctx.app.evaluate(async ({ session }) => {
  const s = session.fromPartition('persist:codexbuddy-browser');
  const all = await s.cookies.get({});
  const by = {};
  for (const c of all) { const d = c.domain.replace(/^\./,''); (by[d] ||= []).push(c.name); }
  return by;
});
return { st: st.map(s => `${s.name} ${s.loggedIn} ${s.url.slice(0,80)}`), cookies };
