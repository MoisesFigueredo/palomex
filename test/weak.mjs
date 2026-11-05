// Aproximação de celular fraco: CPU 6x mais lenta e conteúdo do degrau "weak".
// Mede boot e tempo de script; a GPU real do celular não dá para emular aqui.
import { chromium } from 'playwright';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-A125M) Mobile' });
const p = await ctx.newPage();
await p.addInitScript(() => { Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }); Object.defineProperty(navigator, 'deviceMemory', { get: () => 3 }); });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const t0 = Date.now();
await p.goto(process.argv[2] || 'http://localhost:5199/');
await p.waitForFunction(() => window.__g, { timeout: 170000 });
console.log('boot com CPU 6x lenta:', ((Date.now() - t0) / 1000).toFixed(1), 's; degrau', await p.evaluate(() => window.__g.post.tierName));
await p.waitForTimeout(1000);
// toca nos botões de verdade, com toque
await p.tap('#btnStart');
await p.waitForTimeout(3500);
const lane0 = await p.evaluate(() => { window.__g.game.god = true; return window.__g.game.lane; });
await p.tap('.pbtn[data-a="left"]');
await p.waitForTimeout(300);
const lane1 = await p.evaluate(() => window.__g.game.lane);
await p.tap('.pbtn[data-a="up"]');
await p.waitForTimeout(120);
const air = await p.evaluate(() => !window.__g.game.grounded);
await p.waitForTimeout(1200);
await p.tap('.pbtn[data-a="down"]');
await p.waitForTimeout(100);
const sl = await p.evaluate(() => window.__g.game.sliding > 0);
await p.evaluate(() => { window.__g.game.charge = 1; });
await p.waitForTimeout(100);
await p.tap('#btnFlash');
await p.waitForTimeout(100);
const fl = await p.evaluate(() => window.__g.game.charge === 0);
console.log('botão esquerda', lane0, '->', lane1, '| pula no ar', air, '| desliza', sl, '| clarão', fl);
const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const s = performance.now(); (function f() { n++; if (performance.now() - s > 3000) r(Math.round(n / 3)); else requestAnimationFrame(f); })(); }));
console.log('fps sob CPU 6x lenta', fps, 'degrau', await p.evaluate(() => window.__g.post.tierName + ' dpr ' + window.__g.post.dpr));
await p.screenshot({ path: 'test/w-run.png' });
console.log(errs.join('\n') || 'sem erros');
await b.close();
