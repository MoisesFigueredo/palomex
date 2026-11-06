// Clarão: quantas bolotas reais ele custa, e o tronco não carrega.
import { chromium } from 'playwright';
const url = process.argv[2] || 'https://palomex.vercel.app/';
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
await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
await p.evaluate(() => { const s = window.__g.game; s.god = true; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; s.fallT = 1e6; s.charge = 0; s.acorns = 0; window.__g.props.acornList.length = 0; });
const feed = (n) => p.evaluate(async (k) => {
  const g = window.__g, s = g.game;
  for (let i = 0; i < k; i++) {
    g.props.addAcorn(s.px, s.y + 0.6, 0.1);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }
  return { charge: +s.charge.toFixed(3), acorns: s.acorns, ready: document.querySelector('#btnFlash').classList.contains('ready') };
}, n);
let r = await feed(22);
check('22 bolotas não enchem mais', r.acorns === 22 && r.charge < 0.45 && !r.ready, JSON.stringify(r));
r = await feed(32);
check('54 bolotas ainda não enchem', r.acorns === 54 && r.charge < 1 && !r.ready, JSON.stringify(r));
r = await feed(1);
await p.waitForTimeout(80);
r = await p.evaluate(() => { const s = window.__g.game; return { charge: s.charge, acorns: s.acorns, ready: document.querySelector('#btnFlash').classList.contains('ready') }; });
check('55 bolotas enchem', r.acorns === 55 && r.charge >= 0.999 && r.ready, JSON.stringify(r));
await p.evaluate(() => { const g = window.__g; g.input('flash'); });
await p.waitForTimeout(100);
const c0 = await p.evaluate(() => window.__g.game.charge);
check('usar esvazia', c0 === 0);
await p.waitForTimeout(600);
await p.evaluate(() => window.__g.enterTube('cogumelo'));
await p.waitForTimeout(200);
await p.evaluate(async () => {
  const g = window.__g, s = g.game;
  for (let i = 0; i < 12; i++) {
    const e = g.gnome.group.position;
    g.props.addAcorn(e.x, e.y + 0.6, 0.1);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }
  window.__t = s.tubeAcorns;
});
r = await p.evaluate(() => ({ got: window.__t, charge: window.__g.game.charge }));
check('bolotas do tronco não carregam o Clarão', r.got > 0 && r.charge === 0, JSON.stringify(r));
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
