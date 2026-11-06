// Deslizar para fora da pista dá um dano pequeno, sem matar e sem acumular por repetição.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5199/';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(800);
await p.tap('#btnStart');
await p.waitForTimeout(2700);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const G = (fn, a) => p.evaluate(fn, a);
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
async function swipe(dx) {
  await touch('touchStart', 195, 420);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', 195 + (dx * i) / 8, 420); await p.waitForTimeout(10); }
  await touch('touchEnd');
  await p.waitForTimeout(40);
}
const setup = (lane, gap = 70) => G(([l, g]) => { const G2 = window.__g, s = G2.game; s.god = false; s.lane = l; s.px = G2.X(l); s.gap = g; s.inv = 0; s.bumpT = 0; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; for (let i = G2.props.live.length - 1; i >= 0; i--) G2.props.remove(i); G2.birds.hideAll(); s.birdCues = []; }, [lane, gap]);
const gap = () => G(() => window.__g.game.gap);

await setup(1);
let g0 = await gap();
await swipe(120);
await p.waitForTimeout(30);
let g1 = await gap();
check('faixa da direita, desliza para a direita: dano pequeno', g0 - g1 > 6 && g0 - g1 < 12, `${g0.toFixed(1)} -> ${g1.toFixed(1)}`);
check('continua na mesma faixa', (await G(() => window.__g.game.lane)) === 1);
await p.screenshot({ path: 'test/bump.png' });

await setup(-1);
g0 = await gap();
await swipe(-120);
await p.waitForTimeout(30);
g1 = await gap();
check('faixa da esquerda, desliza para a esquerda: dano pequeno', g0 - g1 > 6 && g0 - g1 < 12, `${g0.toFixed(1)} -> ${g1.toFixed(1)}`);

await setup(0);
g0 = await gap();
await swipe(120);
g1 = await gap();
check('sair do meio não dói', g1 >= g0, `${g0.toFixed(1)} -> ${g1.toFixed(1)}`);
await setup(1);
g0 = await gap();
await swipe(-120);
g1 = await gap();
check('voltar da beirada para o meio não dói', g1 >= g0 && (await G(() => window.__g.game.lane)) === 0);

await setup(1);
g0 = await gap();
for (let i = 0; i < 4; i++) await G(() => window.__g.input('right'));
g1 = await gap();
check('insistir rápido não multiplica', g0 - g1 < 12, `${g0.toFixed(1)} -> ${g1.toFixed(1)}`);

await setup(1, 4);
await G(() => window.__g.input('right'));
await p.waitForTimeout(150);
check('dano de beirada não mata sozinho', (await G(() => window.__g.game.state)) === 'run', `gap ${(await gap()).toFixed(1)}`);

// dentro do tronco só quica
await setup(0);
await G(() => { window.__g.enterTube('folha'); window.__g.game.lane = 1; });
await p.waitForTimeout(200);
await G(() => { window.__g.game.gap = 50; window.__g.input('right'); });
await p.waitForTimeout(60);
check('dentro do tronco não há dano', (await gap()) === 50, `gap ${await gap()}`);
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
