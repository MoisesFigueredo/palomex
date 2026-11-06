// Desafios novos: galho que despenca, cipó, lama e sequências. Inclui prova de que há saída.
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
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(800);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const G = (fn, a) => p.evaluate(fn, a);
await G(() => window.__g.start());
await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
const quiet = () => G(() => { const g = window.__g, s = g.game; s.god = false; s.hits = 0; s.hitT = 0; s.gap = 90; s.inv = 0; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; s.fallT = 1e6; s.lane = 0; s.px = 0; s.speed = 12; s.fall = null; s.y = 0; s.vy = 0; s.grounded = true; s.birdCues = []; g.birds.hideAll(); for (let i = g.props.live.length - 1; i >= 0; i--) g.props.remove(i); g.props.acornList.length = 0; });
const hits = () => G(() => window.__g.game.hits);

// 1) galho despenca, avisa e vira obstáculo de pulo
await quiet();
await G(() => { window.__g.dropBranch(0); });
await p.waitForTimeout(450);
await p.screenshot({ path: 'test/h-fall1.png' });
let st = await G(() => { const f = window.__g.game.fall; return f && { y: +f.m.position.y.toFixed(1), z: +f.z.toFixed(1), ring: +document.body.childElementCount }; });
check('galho está no ar e longe do jogador', st && st.y > 1 && st.z > 8, JSON.stringify(st));
await p.waitForFunction(() => !window.__g.game.fall, { timeout: 4000 });
await p.waitForTimeout(150);
await p.screenshot({ path: 'test/h-fall2.png' });
st = await G(() => { const o = window.__g.props.live[0]; return { y: o.m.position.y, type: o.type, z: +o.z.toFixed(1) }; });
check('pousou na pista, à frente, como obstáculo de pulo', st.y === 0 && st.type === 'jump' && st.z > 6, JSON.stringify(st));
await p.waitForFunction(() => { const o = window.__g.props.live[0], s = window.__g.game; return o.z < s.speed * 0.3; }, { timeout: 4000, polling: 'raf' });
await G(() => window.__g.input('up'));
await p.waitForTimeout(800);
check('pulando, passa', (await hits()) === 0);

await quiet();
await G(() => { window.__g.dropBranch(0); });
await p.waitForFunction(() => { const o = window.__g.props.live[0]; return !o || o.z < -1 || window.__g.game.hits > 0; }, { timeout: 7000, polling: 'raf' });
check('parado, o galho derruba', (await hits()) === 1);

// 2) cipó: posição real importa
await quiet();
await G(() => { const g = window.__g; const o = g.spawnVine(26); o.swing.w = 2.2; });
await p.waitForTimeout(900);
await p.screenshot({ path: 'test/h-vine.png' });
const xs = [];
for (let i = 0; i < 6; i++) { xs.push(await G(() => +window.__g.props.live[0].x.toFixed(2))); await p.waitForTimeout(230); }
check('cipó balança por cima das três pistas', Math.max(...xs) - Math.min(...xs) > 1.8, xs.join(' '));
// ficando sempre longe do cipó, passa ileso
await quiet();
await G(() => {
  const g = window.__g, o = g.spawnVine(24);
  window.__dodge = setInterval(() => { const s = g.game; if (o.z < 0) return; const lane = [-1, 0, 1].sort((a, c) => Math.abs(g.X(c) - o.x) - Math.abs(g.X(a) - o.x))[0]; if (lane < s.lane) g.input('left'); else if (lane > s.lane) g.input('right'); }, 60);
});
await p.waitForFunction(() => { const o = window.__g.props.live[0]; return !o || o.z < -1; }, { timeout: 6000, polling: 'raf' });
await G(() => clearInterval(window.__dodge));
check('fugindo do balanço, dá para passar', (await hits()) === 0);

// 3) lama atrasa, não é tapa
await quiet();
await G(() => { window.__g.game.lane = 0; window.__g.props.add('mud', 0, 7); });
await p.waitForTimeout(350);
await p.screenshot({ path: 'test/h-mud.png' });
await p.waitForFunction(() => window.__g.props.live[0].used, { timeout: 4000 });
const mud = await G(() => { const s = window.__g.game; return { gap: Math.round(s.gap), v: +s.speed.toFixed(1), hits: s.hits, state: s.state }; });
check('lama: mais lento, monstro perto, sem tapa', mud.gap < 85 && mud.v < 10 && mud.hits === 0 && mud.state === 'run', JSON.stringify(mud));
await quiet();
await G(() => { window.__g.props.add('mud', 0, 12 * 0.42 + 1.5); window.__g.input('up'); });
await p.waitForTimeout(100);
await p.waitForTimeout(700);
void 0;

// 4) o gerador: toda fileira deixa saída, e tudo aparece
const report = await G(() => {
  const g = window.__g, s = g.game;
  const res = { kinds: {}, blockedAll: 0, tooClose: 0, rows: 0, minGapS: 99 };
  for (const d of [20, 200, 500, 1000, 2500]) {
    s.dist = d;
    for (let n = 0; n < 900; n++) {
      for (let i = g.props.live.length - 1; i >= 0; i--) g.props.remove(i);
      g.props.acornList.length = 0;
      s.targetSpeed = g.speedAt(0);
      const span = g.spawnRow(100, Math.min(1, d / 1100));
      const byZ = {};
      for (const o of g.props.live) {
        res.kinds[o.kind] = (res.kinds[o.kind] || 0) + 1;
        (byZ[Math.round(o.z)] ||= []).push(o);
      }
      const zs = Object.keys(byZ).map(Number).sort((a, c) => a - c);
      for (const z of zs) {
        res.rows++;
        const row = byZ[z];
        if (row.some((o) => o.type === 'jump' && o.kind === 'logWide') || row.some((o) => o.type === 'slide')) continue;
        const free = [-1, 0, 1].filter((l) => !row.some((o) => o.type !== 'mud' && !o.swing && Math.abs(g.X(l) - o.x) < o.hw + 0.22 && o.type === 'block'));
        const jumpable = row.every((o) => o.type !== 'block');
        if (!free.length && !jumpable) res.blockedAll++;
      }
      for (let i = 1; i < zs.length; i++) res.minGapS = Math.min(res.minGapS, (zs[i] - zs[i - 1]) / g.speedAt(100));
      void span;
    }
  }
  for (let i = g.props.live.length - 1; i >= 0; i--) g.props.remove(i);
  g.props.acornList.length = 0;
  res.minGapS = +res.minGapS.toFixed(2);
  return res;
});
console.log(JSON.stringify(report));
check('nenhuma fileira sem saída', report.blockedAll === 0, `${report.rows} fileiras`);
check('sequências dão tempo de reagir', report.minGapS >= 0.8, `${report.minGapS} s entre fileiras`);
check('galho, cipó e lama aparecem', report.kinds.logWide > 0 && report.kinds.log > 0 && report.kinds.vine > 0 && report.kinds.mud > 0);

// 5) queda aleatória acontece sozinha numa corrida normal
await quiet();
await G(() => { const s = window.__g.game; s.god = true; s.dist = 300; s.nextRow = 40; s.fallT = 0.1; s.birdCool = 1e6; });
let fell = false;
for (let i = 0; i < 90 && !fell; i++) { await p.waitForTimeout(100); fell = await G(() => { const s = window.__g.game; if (!s.fall && s.fallT > 1) s.fallT = 0.1; return !!s.fall; }); }
check('galho cai sozinho durante a corrida', fell);
await p.waitForTimeout(1500);
await p.screenshot({ path: 'test/h-run.png' });
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
