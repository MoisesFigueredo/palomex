// Virar o celular dentro do tronco. O sensor é simulado: o sentido real só se confirma no aparelho.
// uso: node test/tilt.mjs <url>
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5199/';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const phone = (w = 390, h = 844) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });

async function open(ctxOpts, init) {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  if (init) await p.addInitScript(init);
  await p.goto(url);
  await p.waitForFunction(() => window.__g, { timeout: 120000 });
  await p.waitForTimeout(700);
  return p;
}
// mantém o sensor "vivo", como um aparelho real, e deixa trocar o ângulo a qualquer hora
const sensor = (p) => p.evaluate(() => {
  window.__tilt = { gamma: 0, beta: 40 };
  window.__tiltT = setInterval(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: window.__tilt.beta, gamma: window.__tilt.gamma })), 30);
});
const setTilt = (p, v) => p.evaluate((x) => { Object.assign(window.__tilt, x); }, v);
const theta = (p) => p.evaluate(() => +window.__g.game.theta.toFixed(2));
const clearTube = (p) => p.evaluate(() => { const g = window.__g; g.game.god = true; g.game.tubeTotal = 999; g.game.tubeRow = 1e6; g.tube.clear(); g.props.acornList.length = 0; });

/* 1) celular em pé */
{
  const p = await open(phone());
  await p.tap('#btnStart');
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
  await sensor(p);
  await setTilt(p, { gamma: 12 }); // segurando meio torto
  await p.waitForTimeout(150);
  await p.evaluate(() => { const g = window.__g; g.game.god = true; g.game.lane = 0; g.enterTube('folha'); });
  await clearTube(p);
  await p.waitForTimeout(500);
  check('entra centrado, mesmo segurando torto', Math.abs(await theta(p)) < 0.05, `theta ${await theta(p)}`);
  await p.screenshot({ path: 'test/tilt-enter.png' });
  await setTilt(p, { gamma: 12 + 2 });
  await p.waitForTimeout(350);
  check('tremida pequena não mexe', Math.abs(await theta(p)) < 0.05, `theta ${await theta(p)}`);
  await setTilt(p, { gamma: 12 + 25 });
  await p.waitForTimeout(600);
  const right = await theta(p);
  check('vira para a direita: sobe a parede da direita', right < -0.75, `theta ${right}`);
  await p.screenshot({ path: 'test/tilt-right.png' });
  await setTilt(p, { gamma: 12 - 25 });
  await p.waitForTimeout(700);
  const left = await theta(p);
  check('vira para a esquerda: sobe a parede da esquerda', left > 0.75, `theta ${left}`);
  await setTilt(p, { gamma: 12 + 11.5 });
  await p.waitForTimeout(600);
  const mid = await theta(p);
  check('meio giro para meio caminho: é contínuo', mid < -0.25 && mid > -0.6, `theta ${mid}`);
  // deslizar o dedo continua valendo e assume por um instante
  await setTilt(p, { gamma: 12 });
  await p.waitForTimeout(500);
  await p.evaluate(() => window.__g.input('left'));
  await p.waitForTimeout(400);
  const swiped = await theta(p);
  check('deslizar o dedo funciona junto com o sensor', swiped > 0.5, `theta ${swiped}`);
  await p.waitForTimeout(1300);
  const backTilt = await theta(p);
  check('depois de um instante, o sensor volta a mandar', Math.abs(backTilt) < 0.15, `theta ${backTilt}`);
  // sair do tronco continua na pista certa
  await setTilt(p, { gamma: 12 + 25 });
  await p.waitForTimeout(500);
  await p.evaluate(() => { const s = window.__g.game; s.tubeTotal = s.tubeT + 0.1; });
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 6000 });
  await p.waitForTimeout(150);
  const out = await p.evaluate(() => { const s = window.__g.game; return { lane: s.lane, px: +s.px.toFixed(2) }; });
  check('sai na pista onde estava', out.lane === 1 && Math.abs(out.px + 1.55) < 0.1, JSON.stringify(out));
  check('fora do tronco, virar não mexe', await p.evaluate(async () => { const s = window.__g.game; const l = s.lane; window.__tilt.gamma = -40; await new Promise((r) => setTimeout(r, 200)); return s.lane === l; }));
  check('sem erro', !p.errs.length, p.errs.join(' | '));
  await p.context().close();
}

/* 2) deitado: o eixo muda */
{
  const p = await open(phone(844, 390));
  await p.tap('#btnStart');
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
  const ang = await p.evaluate(() => screen.orientation?.angle ?? window.orientation ?? 0);
  await sensor(p);
  await p.evaluate(() => { const g = window.__g; g.game.god = true; g.game.lane = 0; g.enterTube('folha'); });
  await clearTube(p);
  await p.waitForTimeout(300);
  await setTilt(p, { beta: 40 + 25, gamma: 0 });
  await p.waitForTimeout(600);
  const t = await theta(p);
  check(`deitado (ângulo ${ang}) usa o outro eixo`, ang === 90 ? t < -0.7 : ang === 270 ? t > 0.7 : true, `theta ${t}`);
  await p.context().close();
}

/* 3) iPhone: pede licença no toque; negar não quebra nada */
for (const answer of ['granted', 'denied']) {
  const p = await open(phone(), `window.__asked = 0; DeviceOrientationEvent.requestPermission = () => { window.__asked++; return Promise.resolve('${answer}'); };`);
  check(`iPhone (${answer}): não pede antes do toque`, (await p.evaluate(() => window.__asked)) === 0);
  await p.tap('#btnStart');
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
  check(`iPhone (${answer}): pediu ao tocar em Correr`, (await p.evaluate(() => window.__asked)) === 1);
  await sensor(p);
  await p.evaluate(() => { const g = window.__g; g.game.god = true; g.game.lane = 0; g.enterTube('folha'); });
  await clearTube(p);
  await setTilt(p, { gamma: 25 });
  await p.waitForTimeout(600);
  const t = await theta(p);
  check(`iPhone (${answer}): ${answer === 'granted' ? 'obedece ao sensor' : 'ignora o sensor'}`, answer === 'granted' ? t < -0.7 : Math.abs(t) < 0.05, `theta ${t}`);
  if (answer === 'denied') {
    await p.evaluate(() => window.__g.input('right'));
    await p.waitForTimeout(500);
    check('iPhone (denied): deslizar funciona', (await theta(p)) < -0.6);
  }
  await p.context().close();
}

/* 4) a descida com o sensor é jogável: um jogador que desvia em cima da hora */
for (const kind of ['folha', 'cogumelo']) {
  const p = await open(phone());
  await p.tap('#btnStart');
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 8000 });
  await sensor(p);
  await p.evaluate((k) => { const g = window.__g; g.game.lane = 0; g.enterTube(k); }, kind);
  await p.evaluate(() => {
    const g = window.__g, s = g.game;
    window.__stats = { knots: 0, doubles: 0, hits: 0, seen: new Set(), roots: 0 };
    const base = g.gnome.stumble.bind(g.gnome);
    g.gnome.stumble = () => { window.__stats.hits++; base(); };
    window.__drive = setInterval(() => {
      if (s.state !== 'tube') return;
      for (const o of g.tube.live) {
        if (!window.__stats.seen.has(o)) { window.__stats.seen.add(o); window.__stats.knots++; if (o.kind !== 'knot') window.__stats.roots++; }
      }
      // reage a 0,5 s de distância, como quem presta atenção, e vira até a pista livre
      const near = g.tube.live.filter((o) => !o.dead && o.z > 0 && o.z < s.speed * 0.5);
      if (!near.length) return;
      const free = [0.72, 0, -0.72].filter((th) => !near.some((o) => Math.abs(o.theta - th) < 0.3));
      if (!free.length) return;
      const target = free.sort((a, c) => Math.abs(a - s.theta) - Math.abs(c - s.theta))[0];
      window.__tilt.gamma = -(target / (0.72 * 1.2)) * 17 - Math.sign(target) * 3;
    }, 40);
  }, null);
  await p.waitForFunction(() => window.__g.game.state === 'run', { timeout: 40000 });
  const r = await p.evaluate(() => { clearInterval(window.__drive); const x = window.__stats; return { knots: x.knots, roots: x.roots, hits: x.hits, ac: window.__g.game.tubeAcorns }; });
  check(`${kind}: só nós, nenhuma raiz de pular`, r.roots === 0 && r.knots > 0, JSON.stringify(r));
  check(`${kind}: dá para desviar virando o celular`, r.hits <= 1, JSON.stringify(r));
  await p.context().close();
}
console.log(fails ? `${fails} falha(s)` : 'tudo certo');
await b.close();
