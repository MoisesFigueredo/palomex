// Rola a lista da loja com arrasto de toque real, começando em cima de um item.
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5199/';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });
const p = await ctx.newPage();
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(1500);
await p.tap('#btnShop');
await p.waitForTimeout(900);
const info = () => p.evaluate(() => { const l = document.querySelector('#shopList'); const cs = getComputedStyle(l); return { top: Math.round(l.scrollTop), sh: l.scrollHeight, ch: l.clientHeight, ta: cs.touchAction, ov: cs.overflowY, item: getComputedStyle(document.querySelector('.item')).touchAction, game: getComputedStyle(document.querySelector('#game')).touchAction }; });
console.log('antes', JSON.stringify(await info()));
const box = await p.locator('#shopList').boundingBox();
const cdp = await ctx.newCDPSession(p);
const x = box.x + box.width / 2;
const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const y0 = box.y + box.height - 40;
await touch('touchStart', y0);
for (let i = 1; i <= 24; i++) { await touch('touchMove', y0 - i * 12); await p.waitForTimeout(16); }
await touch('touchEnd');
await p.waitForTimeout(500);
console.log('depois do arrasto', JSON.stringify(await info()));
const sel = await p.evaluate(() => document.querySelector('.item.sel')?.dataset.id || null);
console.log('arrastar selecionou item por engano:', sel);
await b.close();
