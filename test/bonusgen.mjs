// O item nasce sozinho na pista, com espaço livre em volta, e leva à fase extra sem ajuda.
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
await p.evaluate(() => { const g = window.__g; g.start(); g.game.god = true; });
await p.waitForTimeout(2700);
const seen = {};
for (let round = 0; round < 6; round++) {
  await p.evaluate(() => { const g = window.__g.game; g.nextBonusAt = g.dist; g.nextRow = 80; });
  await p.waitForFunction(() => window.__g.game.bonus, { timeout: 15000 });
  const r = await p.evaluate(() => { const G = window.__g, g = G.game, it = g.bonus; const near = G.props.live.filter((o) => !o.dead && Math.abs(o.z - it.z) < g.targetSpeed * 0.6 && Math.abs(o.x - it.x) < o.hw + 0.3).length; return { kind: it.kind, z: Math.round(it.z), near, next: Math.round(g.nextBonusAt - g.dist) }; });
  seen[r.kind] = (seen[r.kind] || 0) + 1;
  if (r.near) console.log('FALHA obstáculo colado no item', JSON.stringify(r));
  if (r.next < 300) console.log('FALHA próximo item cedo demais', JSON.stringify(r));
  await p.evaluate(() => { const g = window.__g; g.spawnBonus; g.game.bonus.m.visible = false; g.game.bonus.m.position.y = -50; g.game.bonus = null; });
}
console.log('itens gerados', JSON.stringify(seen));
// agora deixa o jogo levar: posiciona na pista do item e não toca em mais nada
await p.evaluate(() => { const g = window.__g.game; g.nextBonusAt = g.dist; g.nextRow = 70; g.birdCool = 999; });
await p.waitForFunction(() => window.__g.game.bonus, { timeout: 15000 });
await p.evaluate(() => { const G = window.__g, g = G.game; g.lane = [-1, 0, 1].find((l) => G.X(l) === g.bonus.x); });
await p.waitForFunction(() => window.__g.game.state === 'tube', { timeout: 25000 });
console.log('ok    item gerado levou à fase extra');
console.log(errs.join(' | ') || 'sem erros');
await b.close();
