// Gesto real de toque: uma puxada deve mudar só uma pista, seja curta ou longa.
// uso: node test/swipe.mjs <url>
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
await p.waitForTimeout(2800);
await p.evaluate(() => { window.__g.game.god = true; });
const cdp = await ctx.newCDPSession(p);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const lane = () => p.evaluate(() => window.__g.game.lane);
const setLane = (l) => p.evaluate((v) => { window.__g.game.lane = v; }, l);
async function swipe(dx, dy = 0, steps = 10) {
  const x0 = 195, y0 = 420;
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', x0 + (dx * i) / steps, y0 + (dy * i) / steps);
    await p.waitForTimeout(12);
  }
  await touch('touchEnd');
  await p.waitForTimeout(60);
}
let fails = 0;
const check = (name, got, want) => { const ok = got === want; if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', name, '-> pista', got, '(esperado', want + ')'); };

await setLane(-1); await swipe(180); check('canto esquerdo, puxada longa para a direita', await lane(), 0);
await setLane(1); await swipe(-180); check('canto direito, puxada longa para a esquerda', await lane(), 0);
await setLane(-1); await swipe(70); check('canto esquerdo, puxada curta', await lane(), 0);
await setLane(0); await swipe(12); check('tremida de 12 px não move', await lane(), 0);
await setLane(-1); await swipe(70); await swipe(70); check('duas puxadas separadas cruzam a pista', await lane(), 1);
await setLane(0); await swipe(150, 40); check('puxada torta vale uma pista', await lane(), -1 + 2);
check('sem botões de pista na tela', await p.evaluate(() => document.querySelectorAll('.pbtn, #pad').length), 0);
await p.evaluate(() => { window.__g.game.charge = 1; });
await p.tap('#btnFlash'); await p.waitForTimeout(60); check('Clarão responde ao toque', await p.evaluate(() => window.__g.game.charge), 0);
await p.waitForTimeout(100);
const air0 = await p.evaluate(() => window.__g.game.grounded);
await swipe(0, -160); const air1 = await p.evaluate(() => !window.__g.game.grounded);
check('puxada para cima pula', air0 && air1, true);
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
process.exit(fails ? 1 : 0);
