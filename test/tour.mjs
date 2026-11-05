// Passeio pelos sistemas: atmosferas, clarão, pedregulho, pulo, troca de qualidade, pausa.
import { chromium } from 'playwright';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text().slice(0, 400)); });
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
await p.goto('http://localhost:5199/');
await p.waitForFunction(() => window.__g, { timeout: 180000 });
await p.waitForTimeout(800);
await p.evaluate(() => { window.__g.start(); window.__g.game.god = true; });
await p.waitForTimeout(350);
await p.screenshot({ path: 'test/t-intro1.png' });
await p.waitForTimeout(500);
await p.screenshot({ path: 'test/t-intro2.png' });
await p.waitForTimeout(1800);
const shot = (n) => p.screenshot({ path: `test/t-${n}.png` });

for (const [i, d] of [[1, 660], [2, 1310], [3, 1960]]) {
  await p.evaluate((x) => { const g = window.__g.game; g.dist = x; g.gap = 22; }, d);
  await p.waitForTimeout(2400);
  await shot('atmos' + i);
}
await p.evaluate(() => { const g = window.__g.game; g.dist = 200; g.gap = 25; });
await p.waitForTimeout(900);
await shot('close');
await p.evaluate(() => { window.__g.input('up'); });
await p.waitForTimeout(260);
await shot('jump');
await p.evaluate(() => { const g = window.__g.game; g.charge = 1; window.__g.input('flash'); });
await p.waitForTimeout(140);
await shot('flash');
await p.waitForTimeout(1300);
console.log('estado', await p.evaluate(() => { const g = window.__g.game; return { gap: Math.round(g.gap), charge: g.charge, stun: +g.stun.toFixed(2) }; }));

// troca de qualidade em tempo real
for (const t of ['high', 'mid', 'low', 'ultra']) {
  await p.evaluate((n) => window.__g.post.apply(n), t);
  await p.waitForTimeout(700);
  const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); (function f() { n++; if (performance.now() - s > 1200) r(Math.round(n / 1.2)); else requestAnimationFrame(f); })(); }));
  console.log('qualidade', t, 'fps', fps);
}
// pausa e retomada pelo teclado
await p.keyboard.press('KeyP');
await p.waitForTimeout(150);
await shot('pause');
console.log('pausado', await p.evaluate(() => window.__g.game.state));
await p.keyboard.press('KeyP');
await p.waitForTimeout(150);
console.log('voltou', await p.evaluate(() => window.__g.game.state));

// pedregulho: espera o monstro arremessar
await p.evaluate(() => { const g = window.__g.game; g.evtT = 0; g.dist = 300; });
let seen = false;
for (let i = 0; i < 120 && !seen; i++) {
  await p.waitForTimeout(100);
  seen = await p.evaluate(() => { const g = window.__g.game; if (!g.boulder) g.evtT = 0; return !!g.boulder && g.boulder.t > 0.55; });
}
console.log('pedregulho visto', seen);
if (seen) await shot('boulder');

// segunda partida depois da captura
await p.evaluate(() => { const g = window.__g.game; g.god = false; g.gap = 1; g.inv = 0; window.__g.props.add('rock', g.px, 0.1); });
await p.waitForTimeout(1200);
await shot('caught');
await p.waitForTimeout(3700);
await shot('over');
console.log('fim', await p.evaluate(() => window.__g.game.state));
await p.click('#btnAgain');
await p.waitForTimeout(2600);
console.log('2a partida', await p.evaluate(() => { const g = window.__g.game; return { s: g.state, d: Math.floor(g.dist), gap: Math.round(g.gap) }; }));
await shot('again');
console.log([...new Set(errs)].slice(0, 8).join('\n') || 'sem erros');
await b.close();
