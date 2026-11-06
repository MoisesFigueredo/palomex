// Pássaro de ponta a ponta: ficar parado machuca, desviar salva, clarão derruba, e a pista abre corredor.
import { chromium } from 'playwright';
const mob = process.argv[2] === '1';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 720 }, deviceScaleFactor: mob ? 2 : 1, hasTouch: mob, isMobile: mob, userAgent: mob ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' : undefined });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); });
await p.goto(process.argv[3] || 'http://localhost:5199/');
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(600);
const tag = mob ? 'bm' : 'bd';
await p.screenshot({ path: `test/${tag}-title.png` });
await p.evaluate(() => { window.__g.start(); });
await p.waitForTimeout(2600);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
// limpa a pista para isolar o teste do pássaro
const prep = () => p.evaluate(() => { const G = window.__g, g = G.game; g.hits = 0; g.hitT = 0; g.gap = 80; g.inv = 0; g.god = false; g.nextBonusAt = 1e9; g.birdCool = 999; g.birdCues = []; g.evtT = 999; g.lane = 0; g.nextRow = 400; for (let i = G.props.live.length - 1; i >= 0; i--) G.props.remove(i); G.birds.hideAll(); });
const bird = () => p.evaluate(() => { const x = window.__g.birds.list[0]; return { on: x.on, z: +x.z.toFixed(1), locked: x.locked, x: +x.x.toFixed(2), lane: x.lane }; });
const waitLock = () => p.waitForFunction(() => window.__g.birds.list[0].locked, { timeout: 8000 });

// 1) parado leva a bicada
await prep();
await p.waitForTimeout(400);
await p.evaluate(() => window.__g.launchFlock(2.1));
await p.waitForTimeout(500);
await p.screenshot({ path: `test/${tag}-far.png` });
await waitLock();
await p.waitForTimeout(350);
await p.screenshot({ path: `test/${tag}-lock.png` });
console.log('travado', JSON.stringify(await bird()));
await p.waitForTimeout(1100);
let g = await p.evaluate(() => Math.round(window.__g.game.gap));
check('parado na pista: pássaro bate', g < 70, `gap ${g}`);
await p.waitForTimeout(1300);

// 2) desviando depois de travar não toma dano
await prep();
await p.waitForTimeout(300);
await p.evaluate(() => window.__g.launchFlock(2.1));
await waitLock();
await p.evaluate(() => window.__g.input('left'));
await p.waitForTimeout(650);
await p.screenshot({ path: `test/${tag}-dodge.png` });
await p.waitForTimeout(500);
g = await p.evaluate(() => Math.round(window.__g.game.gap));
const st = await bird();
check('mudou de pista: passa direto', g >= 80, `gap ${g} ${JSON.stringify(st)}`);
await p.waitForTimeout(800);

// 3) mudar antes de travar não adianta: ele corrige a mira
await prep();
await p.waitForTimeout(300);
await p.evaluate(() => { window.__g.launchFlock(2.1); window.__g.input('left'); });
await waitLock();
const aim = await bird();
check('antes de travar, mira na pista nova', aim.lane === -1, JSON.stringify(aim));
await p.waitForTimeout(1500);

// 4) clarão derruba
await prep();
await p.waitForTimeout(300);
await p.evaluate(() => window.__g.launchFlock(2.1));
await p.waitForTimeout(700);
await p.evaluate(() => { const G = window.__g; G.game.charge = 1; G.input('flash'); });
await p.waitForTimeout(100);
check('clarão derruba o pássaro', !(await bird()).on);
await p.waitForTimeout(1200);

// 5) bando: sempre sobra uma pista livre e ao lado
await prep();
await p.evaluate(() => { window.__g.game.dist = 900; window.__g.launchFlock(1.9); });
await waitLock();
await p.waitForTimeout(120);
const lanes = await p.evaluate(() => window.__g.birds.list.filter((x) => x.on).map((x) => x.lane));
const me = await p.evaluate(() => window.__g.game.lane);
const free = [-1, 0, 1].filter((l) => !lanes.includes(l));
check('bando deixa pista ao lado', lanes.length === 2 && free.some((l) => Math.abs(l - me) === 1), `pássaros ${lanes} eu ${me} livre ${free}`);
await p.waitForTimeout(1600);

// 6) o gerador abre corredor e dispara sozinho
await prep();
await p.evaluate(() => { const g = window.__g.game; g.god = true; g.dist = 200; g.nextRow = 60; g.birdCool = 0; });
let auto = false;
for (let i = 0; i < 100 && !auto; i++) { await p.waitForTimeout(100); auto = await p.evaluate(() => window.__g.birds.active()); }
check('gerador lança sozinho', auto);
const inWay = await p.evaluate(() => { const G = window.__g, g = G.game; const b0 = G.birds.list.find((x) => x.on); const arrive = g.speed * (b0.T - b0.t); return G.props.live.filter((o) => !o.dead && o.z > 0 && Math.abs(o.z - arrive * 0 - 0) < 0).length + G.props.live.filter((o) => !o.dead && Math.abs(o.z - arrive) < g.speed * 0.6 && o.type !== 'spring').length; });
check('corredor limpo na chegada', inWay === 0, `obstáculos no caminho ${inWay}`);

console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
