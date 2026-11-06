// Loja de ponta a ponta com cliques reais, mais a medição de engasgo no tombo e na morte.
// uso: node test/shop.mjs <mobile:0|1> <url>
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
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)); });
const tag = mob ? 'sm' : 'sd';
const press = (sel) => (mob ? p.tap(sel) : p.click(sel));
const boot = async () => { await p.waitForFunction(() => window.__g, { timeout: 120000 }); await p.waitForTimeout(1500); };
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const G = (fn) => p.evaluate(fn);
await p.goto(url);
await boot();
await p.screenshot({ path: `test/${tag}-menu.png` });

// 1) partida real: morre, ganha bolotas, sem engasgo
await press('#btnStart');
await p.waitForTimeout(2600);
await G(() => { const g = window.__g.game; g.god = false; g.gap = 90; g.inv = 0; g.acorns = 12; window.__long = []; let l = performance.now(); (function f() { const n = performance.now(); if (n - l > 70) window.__long.push(Math.round(n - l) + 'ms ' + g.state); l = n; requestAnimationFrame(f); })(); });
await G(() => { const g = window.__g.game; window.__g.props.add('rock', g.px, 0.1); });
await p.waitForTimeout(1500);
await G(() => { const g = window.__g.game; g.gap = 1; g.inv = 0; window.__g.props.add('rock', g.px, 0.1); });
await p.waitForFunction(() => window.__g.game.state === 'over', { timeout: 15000 });
await p.waitForTimeout(900);
console.log('quadros longos tombo+morte:', JSON.stringify(await G(() => window.__long)));
const after = await G(() => { const g = window.__g.game; return { wallet: g.wallet, earned: g.earned, ac: g.acorns, d: Math.floor(g.dist) }; });
check('morrer guarda bolotas + bônus de distância', after.earned === after.ac + Math.floor(after.d / 25) && after.wallet === after.earned, JSON.stringify(after));
await p.screenshot({ path: `test/${tag}-over.png` });

// 2) menu
await press('#btnMenu');
await p.waitForFunction(() => window.__g.game.state === 'title', { timeout: 5000 });
await p.waitForTimeout(900);
const vis = await G(() => !document.querySelector('#title').hidden && document.querySelector('#over').hidden);
check('Menu volta ao título', vis);
await p.screenshot({ path: `test/${tag}-menu2.png` });

// 3) loja
await G(() => { window.__g.game.wallet = 50000; });
await press('#btnShop');
await p.waitForTimeout(900);
await p.screenshot({ path: `test/${tag}-shop.png` });
const item = (id) => `.item[data-id="${id}"]`;
if (mob) {
  // rolar a lista com o dedo, começando em cima de um item
  const box = await p.locator('#shopList').boundingBox();
  const cdp = await ctx.newCDPSession(p);
  const x = box.x + box.width / 2, y0 = box.y + box.height - 30;
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', y0);
  for (let i = 1; i <= 24; i++) { await touch('touchMove', y0 - i * 12); await p.waitForTimeout(16); }
  await touch('touchEnd');
  await p.waitForTimeout(150);
  const top = await G(() => document.querySelector('#shopList').scrollTop);
  check('lista rola com o dedo', top > 100, `scrollTop ${Math.round(top)}`);
  await G(() => { document.querySelector('#shopList').scrollTop = 0; });
}
await p.locator(item('capa')).scrollIntoViewIfNeeded();
await press(item('capa'));
await p.waitForTimeout(100);
const prev = await G(() => { const g = window.__g; return { visible: g.wardrobe.items.capa[0].visible, wallet: g.game.wallet, owned: g.game.owned.length }; });
check('experimentar mostra sem gastar', prev.visible && prev.wallet === 50000 && prev.owned === 0, JSON.stringify(prev));
await press('[data-buy="capa"]');
await p.waitForTimeout(100);
const bought = await G(() => { const g = window.__g.game; return { wallet: g.wallet, owned: g.owned.join(), eq: g.equip.costas }; });
check('comprar desconta e veste', bought.wallet === 47000 && bought.owned === 'capa' && bought.eq === 'capa', JSON.stringify(bought));
await p.locator(item('chamaAzul')).scrollIntoViewIfNeeded();
await press(item('chamaAzul'));
await p.waitForTimeout(80);
await press('[data-buy="chamaAzul"]');
const flame = await G(() => '#' + window.__g.gnome.light.color.getHexString());
check('chama muda a luz real', flame !== '#ffb765', flame);
await p.locator(item('coroa')).scrollIntoViewIfNeeded();
await press(item('coroa'));
await p.waitForTimeout(80);
await press('[data-buy="coroa"]');
await p.waitForTimeout(800);
await p.screenshot({ path: `test/${tag}-shop2.png` });
// sem dinheiro
await G(() => { window.__g.game.wallet = 10; });
await p.locator(item('vagalumes')).scrollIntoViewIfNeeded();
await press(item('vagalumes'));
await p.waitForTimeout(100);
const noMoney = await G(() => { const x = document.querySelector('[data-disabled]'); return { txt: x && x.textContent, canBuy: !!document.querySelector('[data-buy]'), preview: window.__g.wardrobe.items.vagalumes[0].visible }; });
check('sem bolotas não compra, mas experimenta', noMoney.txt === 'Faltam 9990' && !noMoney.canBuy && noMoney.preview, JSON.stringify(noMoney));
await press('#btnShopBack');
await p.waitForTimeout(800);
const undo = await G(() => { const g = window.__g; return { fly: g.wardrobe.items.vagalumes[0].visible, s: g.game.state }; });
check('sair desfaz o experimentado', !undo.fly && undo.s === 'title', JSON.stringify(undo));

// 4) persiste ao recarregar
await p.reload();
await boot();
const kept = await G(() => { const g = window.__g; return { wallet: g.game.wallet, owned: g.game.owned.join(), capa: g.wardrobe.items.capa[0].visible, coroa: g.wardrobe.items.coroa[0].visible, fly: g.wardrobe.items.vagalumes[0].visible }; });
check('recarregar mantém itens', kept.owned === 'capa,chamaAzul,coroa' && kept.capa && kept.coroa && !kept.fly, JSON.stringify(kept));
await p.screenshot({ path: `test/${tag}-menu3.png` });

// 5) corre vestido
await press('#btnStart');
await p.waitForTimeout(3000);
await G(() => { window.__g.game.god = true; });
await p.waitForTimeout(600);
await p.screenshot({ path: `test/${tag}-run.png` });
check('capa visível na corrida', await G(() => window.__g.wardrobe.items.capa[0].visible && window.__g.game.state === 'run'));
console.log(fails ? `${fails} falha(s)` : 'tudo certo', errs.join(' | '));
await b.close();
