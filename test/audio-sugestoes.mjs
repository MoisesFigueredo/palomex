// Confere um a um os pedidos dos áudios: vida, Clarão, 10 s do monstro, alvo nos pés, tatu e tronco.
// uso: node test/audio-sugestoes.mjs <url>
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5199/';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(700);
const G = (fn, a) => p.evaluate(fn, a);
await G(() => window.__g.start());
await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
const quiet = (life = 100) => G((l) => { const g = window.__g, s = g.game; s.god = false; s.gap = l; s.inv = 0; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; s.fallT = 1e6; s.fall = null; s.lane = 0; s.px = 0; s.speed = 12; s.charge = 0; s.y = 0; s.vy = 0; s.grounded = true; s.birdCues = []; g.birds.hideAll(); for (let i = g.props.live.length - 1; i >= 0; i--) g.props.remove(i); g.props.acornList.length = 0; }, life);
const rock = async () => { await G(() => { const s = window.__g.game; s.inv = 0; window.__g.props.add('rock', s.px, 0.1); }); await p.waitForTimeout(120); };
const life = () => G(() => +window.__g.game.gap.toFixed(1));
const state = () => G(() => window.__g.game.state);
const again = async () => { await p.waitForFunction(() => window.__g.game.state === 'over', { timeout: 15000 }); await G(() => window.__g.start()); await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 }); };

/* VIDA */
const startLife = await G(() => window.__g.game.gap);
check('corrida começa com 100 de vida', startLife >= 99, `${startLife}`);
await quiet(100);
await rock();
let v = await life();
check('dano tira 60: de 100 para 40', v >= 39.5 && v <= 41.5 && (await state()) === 'run', `vida ${v}`);
await p.screenshot({ path: 'test/a-hit.png' });
await rock();
check('tapa com a vida baixa mata', (await state()) === 'caught');
await again();
// exatamente a regra: acima de 60 aguenta, com 60 ou menos morre
await quiet(61);
await rock();
check('com 61 aguenta', (await state()) === 'run', `vida ${await life()}`);
await quiet(100);
await G(() => { window.__g.game.gap = 59.5; });
await rock();
check('com menos de 60 morre', (await state()) === 'caught');
await again();

/* TEMPO COM O MONSTRO */
await quiet(100);
await G(() => {
  const g = window.__g;
  window.__onScreen = () => { const v3 = g.camera.position.clone(); g.monster.B.head.getWorldPosition(v3); v3.y += 2.05 * g.monster.group.scale.y; const n = v3.project(g.camera); return n.y > -1 && n.z < 1; };
});
const off = await G(() => window.__onScreen());
check('com a vida cheia o monstro está fora da tela', !off);
await rock();
const t = await G(() => new Promise((res) => {
  const g = window.__g, s0 = performance.now(); let last = 0, safeAt = null;
  (function f() {
    const t2 = (performance.now() - s0) / 1000;
    if (window.__onScreen()) last = t2;
    if (safeAt === null && g.game.gap > 60) safeAt = t2;
    if (t2 > 15) return res({ tela: +last.toFixed(1), seguro: +(safeAt ?? -1).toFixed(1), vida: Math.round(g.game.gap) });
    requestAnimationFrame(f);
  })();
}));
check('monstro fica uns 10 s na tela depois do tapa', t.tela >= 8 && t.tela <= 12, JSON.stringify(t));
check('a vida volta a aguentar um tapa em uns 10 s', t.seguro >= 7 && t.seguro <= 10, JSON.stringify(t));

/* CLARÃO */
await quiet(100);
await G(() => { window.__g.game.gap = 40; window.__g.game.charge = 1; window.__g.input('flash'); });
v = await life();
check('Clarão recupera 40, não tudo', v >= 79.5 && v <= 82, `vida ${v}`);
await p.waitForTimeout(900);

/* ALVO NOS PÉS */
await quiet(100);
await G(() => { window.__g.dropHazard('log'); });
await p.waitForTimeout(250);
let f = await G(() => { const o = window.__g.game.fall; return o && { x: +o.x.toFixed(2), z: +o.z.toFixed(2), kind: o.kind }; });
check('o alvo nasce nos pés do gnomo', f && Math.abs(f.x) < 0.2 && Math.abs(f.z) < 1, JSON.stringify(f));
await p.screenshot({ path: 'test/a-target.png' });
// mudou antes de travar: o alvo vai junto
await G(() => window.__g.input('left'));
await p.waitForTimeout(320);
f = await G(() => { const o = window.__g.game.fall; return { x: +o.x.toFixed(2), locked: o.falling.locked }; });
check('antes de travar, o alvo segue o gnomo', f.x > 1.2, JSON.stringify(f));
await p.waitForFunction(() => window.__g.game.fall?.falling?.locked, { timeout: 2000 });
await p.screenshot({ path: 'test/a-lock.png' });
await p.waitForFunction(() => !window.__g.game.fall, { timeout: 3000 });
await p.waitForTimeout(60);
v = await life();
check('ficou embaixo: cai na cabeça', v < 45, `vida ${v}`);
await p.waitForTimeout(300);
await p.screenshot({ path: 'test/a-bonk.png' });

await quiet(100);
await G(() => { window.__g.dropHazard('rock'); });
await p.waitForFunction(() => window.__g.game.fall?.falling?.locked, { timeout: 2500 });
await G(() => window.__g.input('right'));
await p.waitForFunction(() => !window.__g.game.fall, { timeout: 3000 });
await p.waitForTimeout(80);
v = await life();
check('saiu de baixo depois de travar: escapa', v >= 99, `vida ${v}`);
await p.waitForTimeout(800);
check('o que caiu não bate depois de pousado', (await life()) >= 99);

// sozinho, com a frequência nova
await quiet(100);
const freq = await G(() => new Promise((res) => {
  const g = window.__g, s = g.game; s.god = true; s.fallT = 0.1; s.nextRow = 30;
  let n = 0, kinds = {}, was = false; const s0 = performance.now();
  const iv = setInterval(() => {
    for (const o of g.props.live) if (!o.dead && o.falling) o.falling.seen ||= (kinds[o.kind] = (kinds[o.kind] || 0) + 1, true);
    const on = !!s.fall; if (on && !was) n++; was = on;
    if (performance.now() - s0 > 26000) { clearInterval(iv); res({ quedas: n, kinds }); }
  }, 40);
}));
check('quedas frequentes numa corrida normal', freq.quedas >= 3, JSON.stringify(freq));

/* TATU */
await quiet(100);
await G(() => { window.__g.launchFlock(2.0, 'tatu'); });
await p.waitForTimeout(700);
await p.screenshot({ path: 'test/a-tatu1.png' });
await p.waitForFunction(() => window.__g.birds.list.some((x) => x.on && x.locked && x.kind === 'tatu'), { timeout: 4000 });
await p.waitForTimeout(450);
await p.screenshot({ path: 'test/a-tatu2.png' });
await p.waitForFunction(() => !window.__g.birds.list.some((x) => x.on && x.kind === 'tatu' && !x.passed) , { timeout: 4000 });
v = await life();
check('tatu acerta quem fica parado', v < 45, `vida ${v}`);
await p.waitForTimeout(600);
await quiet(100);
await G(() => { window.__g.launchFlock(1.8, 'tatu'); });
await p.waitForFunction(() => window.__g.birds.list.find((x) => x.kind === 'tatu' && x.on)?.z < 4, { timeout: 4000, polling: 'raf' });
await G(() => window.__g.input('up'));
await p.waitForTimeout(600);
check('dá para pular por cima do tatu', (await life()) >= 99, `vida ${await life()}`);
await quiet(100);
await G(() => { window.__g.launchFlock(1.8, 'tatu'); });
await p.waitForFunction(() => window.__g.birds.list.find((x) => x.kind === 'tatu' && x.on)?.locked, { timeout: 3000 });
await G(() => window.__g.input('left'));
await p.waitForTimeout(1100);
check('dá para desviar do tatu', (await life()) >= 99, `vida ${await life()}`);
// gerador alterna
const mix = await G(() => new Promise((res) => {
  const g = window.__g, s = g.game; s.god = true; const n = { bird: 0, tatu: 0 };
  for (let i = 0; i < 300; i++) { g.birds.hideAll(); s.dist = 100; const kind = (Math.random() < 0.5 ? 'bird' : 'tatu'); g.launchOne(kind, 0, 2, 0); }
  g.birds.hideAll();
  const before = g.birds.launch.bind(g.birds);
  g.birds.launch = (...a) => { n[a[5] || 'bird']++; return before(...a); };
  s.birdCool = 0; s.nextRow = 40; s.fallT = 1e6; s.nextBonusAt = 1e9;
  let k = 0; const iv = setInterval(() => { k++; if (s.birdCool > 0 && !s.birdCues.length) s.birdCool = 0; s.nextRow = Math.min(s.nextRow, 40); if (k > 900) { clearInterval(iv); g.birds.launch = before; res(n); } }, 40);
}));
check('pássaro e tatu aparecem sorteados', mix.bird > 0 && mix.tatu > 0, JSON.stringify(mix));

/* TRONCO */
await quiet(100);
await G(() => { const g = window.__g; g.game.god = false; g.game.lane = 0; g.enterTube('folha'); });
await p.waitForTimeout(200);
const tube = await G(async () => {
  const g = window.__g, s = g.game;
  s.tubeRow = 1e6; g.tube.clear(); g.props.acornList.length = 0;
  s.tubeAcorns = 20; s.acorns = 50; s.inv = 0;
  g.tube.add('knot', s.theta, 1.2);
  await new Promise((r) => setTimeout(r, 400));
  return { ta: s.tubeAcorns, a: s.acorns, st: s.state, gap: Math.round(s.gap) };
});
check('bater no tronco derruba bolotas, mas não mata', tube.ta === 14 && tube.a === 44 && tube.st === 'tube', JSON.stringify(tube));
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
