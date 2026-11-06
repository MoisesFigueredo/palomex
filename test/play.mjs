// Bot joga de verdade: lê a pista, reage e registra métricas. Sem trapaça, salvo o modo god.
// uso: node test/play.mjs <saida> <w> <h> <mobile> <segundos> <god:0|1> <q>
import { chromium } from 'playwright';
const [out = 'p', w = '1280', h = '720', mob = '0', secs = '45', god = '0', q = ''] = process.argv.slice(2);
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +mob ? 2 : 1, hasTouch: !!+mob, isMobile: !!+mob, userAgent: +mob ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' : undefined });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text().slice(0, 500)); });
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await p.goto('http://localhost:5199/' + (q ? '?q=' + q : ''));
await p.waitForFunction(() => window.__g, { timeout: 180000 });
await p.waitForTimeout(800);
await p.evaluate((g) => {
  const G = window.__g;
  G.game.god = !!g;
  G.start();
  window.__bot = { hits: 0, frames: [], t: performance.now() };
  // reação do bot: 0,5 s antes de chegar, como um jogador razoável
  setInterval(() => {
    const s = G.game;
    if (s.state !== 'run') return;
    if (s.fall && s.fall.falling?.locked && Math.abs(s.px - s.fall.x) < 1) {
      const lanes = [-1, 0, 1].filter((l) => Math.abs(l - s.lane) === 1);
      G.input(lanes[0] < s.lane ? 'left' : 'right');
      return;
    }
    const bird = G.birds.list.find((x) => x.on && x.locked && !x.passed && x.lane === s.lane && x.z < x.closing * 0.55);
    if (bird) {
      const lanes = [-1, 0, 1].filter((l) => Math.abs(l - s.lane) === 1 && !G.birds.list.some((x) => x.on && x.locked && !x.passed && x.lane === l));
      if (lanes.length) G.input(lanes[0] < s.lane ? 'left' : 'right');
      return;
    }
    const look = Math.max(4, s.speed * 0.55);
    const near = G.props.live.filter((o) => !o.dead && !o.falling && o.type !== 'mud' && o.z > 0.6 && o.z < look).sort((a, c) => a.z - c.z)[0];
    if (!near) return;
    const px = G.X(s.lane);
    const blocked = (lane) => G.props.live.some((o) => !o.dead && Math.abs(o.z - near.z) < 2.2 && Math.abs(G.X(lane) - o.x) < o.hw + 0.22 && (o.type === 'block'));
    const onMine = Math.abs(px - near.x) < near.hw + 0.22;
    if (!onMine) return;
    if (near.type === 'jump' && near.z < s.speed * 0.3 && s.grounded) G.input('up');
    else if (near.type === 'slide' && near.z < s.speed * 0.26) G.input('down');
    else if (near.type === 'block') {
      const opts = [-1, 0, 1].filter((l) => Math.abs(l - s.lane) === 1 && !blocked(l));
      if (opts.length) G.input(opts[0] < s.lane ? 'left' : 'right');
    }
  }, 30);
  let last = performance.now();
  (function f() { const n = performance.now(); window.__bot.frames.push(n - last); last = n; requestAnimationFrame(f); })();
}, +god);
const dur = +secs * 1000;
const t0 = Date.now();
let shot = 0;
while (Date.now() - t0 < dur) {
  await p.waitForTimeout(Math.min(dur / 5, 8000));
  const st = await p.evaluate(() => { const g = window.__g.game; return { s: g.state, d: Math.floor(g.dist), gap: Math.round(g.gap), v: +g.speed.toFixed(1), a: g.acorns }; });
  console.log(JSON.stringify(st));
  await p.screenshot({ path: `test/${out}-${shot++}.png` });
  if (st.s === 'over') break;
}
const stats = await p.evaluate(() => {
  const f = window.__bot.frames.slice(60).sort((a, c) => a - c);
  const g = window.__g;
  return { n: f.length, med: f[f.length >> 1]?.toFixed(1), p95: f[Math.floor(f.length * 0.95)]?.toFixed(1), p99: f[Math.floor(f.length * 0.99)]?.toFixed(1), max: f[f.length - 1]?.toFixed(1), tier: g.post.tierName, dpr: g.post.dpr };
});
console.log('quadros ms', JSON.stringify(stats));
console.log([...new Set(errs)].slice(0, 8).join('\n') || 'sem erros');
await b.close();
