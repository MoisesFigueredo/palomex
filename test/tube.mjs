// Fase extra de ponta a ponta: pega o item, o tronco aparece, entra, joga, sai e o jogo continua.
// uso: node test/tube.mjs <mobile:0|1> <url>
import { chromium } from 'playwright';
const mob = process.argv[2] === '1';
const url = process.argv[3] || 'http://localhost:5199/';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 720 }, deviceScaleFactor: mob ? 2 : 1, hasTouch: mob, isMobile: mob, userAgent: mob ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' : undefined });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 500)); });
const tag = mob ? 'tm' : 'td';
const G = (fn, a) => p.evaluate(fn, a);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
await p.goto(url);
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(1200);
await G(() => window.__g.start());
await p.waitForTimeout(2700);
await G(() => { const g = window.__g.game; g.god = true; g.gap = 45; g.birdCool = 999; g.evtT = 999; });

async function round(kind, label) {
  console.log('---', kind);
  await G((k) => { const g = window.__g; g.spawnBonus(k, g.game.lane, 14); window.__long = []; let l = performance.now(); (function f() { const n = performance.now(); if (n - l > 80) window.__long.push(Math.round(n - l) + 'ms ' + g.game.state); l = n; if (!window.__stopLong) requestAnimationFrame(f); })(); }, kind);
  await p.waitForTimeout(450);
  await p.screenshot({ path: `test/${tag}-${label}-item.png` });
  await p.waitForFunction(() => window.__g.game.portalKind, { timeout: 6000 });
  check('pegar o item abre o tronco', true);
  await p.waitForFunction(() => window.__g.game.portalZ < 9 || window.__g.game.state === 'tube', { timeout: 8000 });
  await p.screenshot({ path: `test/${tag}-${label}-portal.png` });
  await p.waitForFunction(() => window.__g.game.state === 'tube', { timeout: 9000 });
  check('entrou no tobogã', true);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `test/${tag}-${label}-tube1.png` });
  const before = await G(() => { const g = window.__g.game; return { lane: g.lane, a: g.acorns, gy: +window.__g.gnome.group.position.y.toFixed(2) }; });
  await G(() => window.__g.input('left'));
  await p.waitForTimeout(600);
  const side = await G(() => { const g = window.__g; return { lane: g.game.lane, th: +g.game.theta.toFixed(2), y: +g.gnome.group.position.y.toFixed(2), rz: +g.gnome.group.rotation.z.toFixed(2) }; });
  check('mover sobe a parede do tubo', side.lane === before.lane - 1 || before.lane === -1, JSON.stringify(side));
  await p.screenshot({ path: `test/${tag}-${label}-tube2.png` });
  await G(() => window.__g.input('up'));
  await p.waitForTimeout(120);
  check('dentro do tubo não se pula', await G(() => window.__g.game.grounded));
  // pausa também funciona aqui
  await p.keyboard.press('KeyP');
  await p.waitForTimeout(100);
  const paused = await G(() => window.__g.game.state);
  await p.keyboard.press('KeyP');
  check('pausa e volta para o tubo', paused === 'pause' && (await G(() => window.__g.game.state)) === 'tube');
  // bot simples: muda de pista quando vem nó, pula quando vem raiz
  await G(() => {
    const g = window.__g;
    window.__tb = setInterval(() => {
      const s = g.game; if (s.state !== 'tube') return;
      const near = g.tube.live.filter((o) => !o.dead && o.z > 0.5 && o.z < s.speed * 0.42 && Math.abs(o.theta - (-s.lane * 0.72)) < 0.34).sort((a, c) => a.z - c.z)[0];
      if (!near) return;
      const free = [-1, 0, 1].filter((l) => Math.abs(l - s.lane) === 1 && !g.tube.live.some((o) => !o.dead && o.kind === 'knot' && Math.abs(o.z - near.z) < 2 && Math.abs(o.theta - (-l * 0.72)) < 0.34));
      if (free.length) g.input(free[0] < s.lane ? 'left' : 'right');
    }, 30);
  });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `test/${tag}-${label}-tube3.png` });
  const mid = await G(() => { const g = window.__g.game; return { a: g.acorns, ta: g.tubeAcorns, left: +(g.tubeTotal - g.tubeT).toFixed(1) }; });
  check('cata bolota no tubo', mid.ta > 0, JSON.stringify(mid));
  await p.waitForFunction(() => window.__g.game.tubeTotal - window.__g.game.tubeT < 1.2, { timeout: 40000 });
  await p.screenshot({ path: `test/${tag}-${label}-end.png` });
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
  await G(() => clearInterval(window.__tb));
  await p.waitForTimeout(900);
  await p.screenshot({ path: `test/${tag}-${label}-back.png` });
  const back = await G(() => { const g = window.__g; const s = g.game; return { gap: Math.round(s.gap), forest: !g.tube.mesh.visible, sled: g.tube.sled.visible, rz: g.gnome.group.rotation.z, px: +s.px.toFixed(2), lane: s.lane, flash: !document.querySelector('#btnFlash').hidden }; });
  check('saiu: monstro para trás e floresta de volta', back.gap >= 85 && back.forest && !back.sled && back.rz === 0 && back.flash, JSON.stringify(back));
  console.log('quadros longos', JSON.stringify(await G(() => { window.__stopLong = false; const l = window.__long; window.__long = []; return l.slice(0, 10); })));
  await G(() => { window.__stopLong = true; });
  await p.waitForTimeout(80);
  await G(() => { window.__stopLong = false; const g = window.__g.game; g.birdCool = 999; g.evtT = 999; });
}
await round('folha', 'f');
await round('cogumelo', 'c');

// morrer depois do tubo e voltar ao menu continua normal
await G(() => { const g = window.__g.game; g.god = false; g.gap = 1; g.inv = 0; window.__g.props.add('rock', g.px, 0.1); });
await p.waitForFunction(() => window.__g.game.state === 'over', { timeout: 15000 });
check('morte normal depois da fase', true);
await G(() => window.__g.goMenu());
await p.waitForFunction(() => window.__g.game.state === 'title', { timeout: 5000 });
await p.waitForTimeout(800);
await p.screenshot({ path: `test/${tag}-menu.png` });
console.log(fails ? `${fails} falha(s)` : 'tudo certo', [...new Set(errs)].join(' | ').slice(0, 900));
await b.close();
