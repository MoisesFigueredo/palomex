// uso: node test/shot.mjs <saida> <w> <h> <mobile:0|1> <cenario> <qualidade>  (usa GPU real)
import { chromium } from 'playwright';
const [out = 's', w = '1280', h = '720', mob = '0', scen = 'all', q = ''] = process.argv.slice(2);
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const ctx = await b.newContext({
  viewport: { width: +w, height: +h }, deviceScaleFactor: +mob ? 2 : 1, hasTouch: !!+mob, isMobile: !!+mob,
  userAgent: +mob ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1' : undefined,
});
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text().slice(0, 900)); });
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').slice(0, 500)));
const t0 = Date.now();
await p.goto('http://localhost:5199/' + (q ? '?q=' + q : ''));
await p.waitForFunction(() => window.__g || !document.querySelector('#err').hidden, { timeout: 180000 }).catch(() => errs.push('timeout boot'));
console.log('boot ms', Date.now() - t0);
if (!(await p.evaluate(() => !!window.__g))) {
  console.log(errs.join('\n'));
  console.log(await p.evaluate(() => document.querySelector('#err').textContent));
  await b.close();
  process.exit(1);
}
await p.waitForTimeout(2000);
await p.screenshot({ path: `test/${out}-title.png` });
if (scen !== 'title') {
  await p.evaluate(() => { window.__g.start(); window.__g.game.god = true; });
  await p.waitForTimeout(450);
  await p.screenshot({ path: `test/${out}-intro.png` });
  await p.waitForTimeout(2400);
  await p.evaluate(() => { window.__g.game.gap = 38; });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `test/${out}-run.png` });
  await p.evaluate(() => { window.__g.input('up'); });
  await p.waitForTimeout(280);
  await p.screenshot({ path: `test/${out}-jump.png` });
  await p.waitForTimeout(900);
  await p.evaluate(() => { window.__g.input('down'); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `test/${out}-slide.png` });
  const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); (function f() { n++; if (performance.now() - t > 2000) r(n / 2); else requestAnimationFrame(f); })(); }));
  console.log('fps', fps, await p.evaluate(() => { const g = window.__g; return g.post.tierName + ' dpr ' + g.post.dpr + ' calls ' + g.renderer.info.render.calls + ' tris ' + g.renderer.info.render.triangles + ' dist ' + Math.floor(g.game.dist) + ' state ' + g.game.state; }));
  await p.evaluate(() => { const g = window.__g.game; g.god = false; g.gap = 1; g.inv = 0; window.__g.props.add('rock', g.px, 0.1); });
  await p.waitForTimeout(1100);
  await p.screenshot({ path: `test/${out}-caught.png` });
  await p.waitForTimeout(3800);
  await p.screenshot({ path: `test/${out}-over.png` });
  console.log('estado final', await p.evaluate(() => window.__g.game.state));
}
console.log([...new Set(errs)].slice(0, 12).join('\n') || 'sem erros');
await b.close();
