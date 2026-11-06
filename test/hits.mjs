// Dois tapas matam. Vale para obstáculo e pássaro; só 20 s limpos, Clarão ou o tronco perdoam.
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
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(800);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const G = (fn, a) => p.evaluate(fn, a);
const state = () => G(() => window.__g.game.state);
const quiet = () => G(() => { const G2 = window.__g, s = G2.game; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; s.birdCues = []; G2.birds.hideAll(); for (let i = G2.props.live.length - 1; i >= 0; i--) G2.props.remove(i); s.inv = 0; });
const rock = async () => { await G(() => { const s = window.__g.game; s.inv = 0; window.__g.props.add('rock', s.px, 0.1); }); await p.waitForTimeout(160); };
async function newRun() {
  await G(() => window.__g.start());
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
  await quiet();
}
async function waitOver() {
  await p.waitForFunction(() => window.__g.game.state === 'over', { timeout: 15000 });
}

// partida nova, com a barra cheia: ainda assim são só dois
await newRun();
await G(() => { window.__g.game.gap = 100; });
await rock();
let s = await G(() => { const g = window.__g.game; return { st: g.state, hits: g.hits, gap: Math.round(g.gap) }; });
check('primeiro tapa: vivo, monstro colado', s.st === 'run' && s.hits === 1 && s.gap <= 30, JSON.stringify(s));
await p.screenshot({ path: 'test/hit1.png' });
await p.waitForTimeout(1200);
s = await G(() => Math.round(window.__g.game.gap));
check('ferido, a barra não se recupera', s <= 30, `gap ${s}`);
await rock();
check('segundo tapa: morre, mesmo com a barra alta no início', (await state()) === 'caught', await state());
await waitOver();

// pássaro conta como tapa
await newRun();
await rock();
await G(() => { const s2 = window.__g.game; s2.inv = 0; window.__g.launchFlock(0.5); });
await p.waitForFunction(() => window.__g.game.state !== 'run', { timeout: 5000 });
check('obstáculo + pássaro também mata', true);
await waitOver();

// perdão: 20 s limpos
await newRun();
await rock();
await G(() => { window.__g.game.hitT = 0.05; });
await p.waitForTimeout(250);
check('20 s sem apanhar perdoam', (await G(() => window.__g.game.hits)) === 0);
await p.waitForTimeout(600);
await G(() => { window.__g.game.gap = 90; });
await rock();
check('depois do perdão, volta a aguentar um', (await state()) === 'run' && (await G(() => window.__g.game.hits)) === 1);

// perdão: clarão
await G(() => { const g = window.__g; g.game.inv = 0; g.game.charge = 1; g.input('flash'); });
await p.waitForTimeout(150);
const fl = await G(() => { const g = window.__g.game; return { hits: g.hits, gap: Math.round(g.gap) }; });
check('Clarão perdoa e afasta o monstro', fl.hits === 0 && fl.gap > 40, JSON.stringify(fl));
await quiet();
await rock();

// beirada não mata nem estando ferido
await G(() => { const g = window.__g; g.game.lane = 1; g.game.bumpT = 0; g.game.inv = 0; g.input('right'); });
await p.waitForTimeout(150);
check('bater na beirada ferido não mata', (await state()) === 'run');

// perdão: tronco
await G(() => window.__g.enterTube('folha'));
await p.waitForTimeout(200);
await G(() => { window.__g.game.tubeT = window.__g.game.tubeTotal - 0.1; });
await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 6000 });
await p.waitForTimeout(150);
const tb = await G(() => { const g = window.__g.game; return { hits: g.hits, gap: Math.round(g.gap) }; });
check('sair do tronco perdoa', tb.hits === 0 && tb.gap >= 85, JSON.stringify(tb));
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
