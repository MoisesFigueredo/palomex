// Bolotas no ar: mede quantas o gnomo cata de verdade em cada velocidade, sem ajuda.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5199/';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(800);
await p.evaluate(() => window.__g.start());
await p.waitForTimeout(2700);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const G = (fn, a) => p.evaluate(fn, a);
const clear = (dist) => G((d) => { const g = window.__g, s = g.game; s.god = true; s.dist = d; s.speed = g.speedAt(0); s.targetSpeed = s.speed; s.lane = 0; s.px = 0; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; s.y = 0; s.vy = 0; s.grounded = true; for (let i = g.props.live.length - 1; i >= 0; i--) g.props.remove(i); g.props.acornList.length = 0; g.birds.hideAll(); s.birdCues = []; }, dist);

for (const dist of [0, 600, 1500, 6000]) {
  // cogumelo saltador
  await clear(dist);
  await p.waitForTimeout(60);
  const a0 = await G(() => { const g = window.__g, s = g.game; g.springRow(0, 9); return { total: g.props.acornList.length, ac: s.acorns, v: +s.speed.toFixed(1) }; });
  await p.waitForFunction(() => !window.__g.game.grounded, { timeout: 6000 });
  const inAir = await G(() => { const g = window.__g; const l = g.props.acornList.map((x) => x.z).sort((a, c) => a - c); let m = 1e9; for (let i = 1; i < l.length; i++) m = Math.min(m, l[i] - l[i - 1]); return { n: l.length, last: +l[l.length - 1].toFixed(1), minGap: +m.toFixed(2) }; });
  await p.waitForFunction(() => window.__g.game.grounded, { timeout: 6000 });
  await p.waitForTimeout(120);
  const got = (await G(() => window.__g.game.acorns)) - a0.ac;
  const pct = Math.round((got / inAir.n) * 100);
  check(`cogumelo a ${a0.v} m/s`, pct >= 90, `catou ${got}/${inAir.n} (${pct}%), última a ${inAir.last} m, espaço mínimo ${inAir.minGap} m`);

  // tronco largo: pulo normal no tempo certo
  await clear(dist);
  await p.waitForTimeout(60);
  const a1 = await G(() => { const g = window.__g, s = g.game; g.logRow(0, s.speed * 1.6); return { total: g.props.acornList.length, ac: s.acorns, v: +s.speed.toFixed(1), T: g.jumpPath(8.6).T }; });
  // pula para o tronco ficar no topo da curva
  await p.waitForFunction(() => { const g = window.__g, s = g.game; const log = g.props.live[0]; return log && log.z <= s.speed * g.jumpPath(8.6).T / 2; }, { timeout: 6000, polling: 'raf' });
  await G(() => window.__g.input('up'));
  await p.waitForTimeout(1000);
  const got2 = (await G(() => window.__g.game.acorns)) - a1.ac;
  const pct2 = Math.round((got2 / a1.total) * 100);
  check(`pulo no tronco a ${a1.v} m/s`, pct2 >= 80, `catou ${got2}/${a1.total} (${pct2}%)`);
}

// geração real: no trecho reservado do cogumelo não pode haver nada onde ele aterrissa
await clear(3000);
const land = await G(() => {
  const g = window.__g, s = g.game;
  const { span } = g.springRow(0, 30);
  return { span: +span.toFixed(1), speed: +s.speed.toFixed(1), air: +(s.speed * g.jumpPath(14.2).T).toFixed(1) };
});
check('trecho reservado cobre o pulo', land.span >= land.air * 0.95, JSON.stringify(land));
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
