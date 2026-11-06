// Folha de contato: cada item no gnomo, de frente e de costas, numa imagem só.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await p.goto('http://localhost:5199/');
await p.waitForFunction(() => window.__g, { timeout: 120000 });
await p.waitForTimeout(800);
await p.evaluate(() => window.__g.openShop());
await p.waitForTimeout(1000);
const items = await p.evaluate(() => [...document.querySelectorAll('.item')].map((e) => ({ id: e.dataset.id, name: e.querySelector('strong').textContent, tag: e.querySelector('.tag')?.textContent })));
console.log(items.length, 'itens; ids', items.map((i) => i.id).join(','));
mkdirSync('test/sheet', { recursive: true });
const clip = { x: 250, y: 20, width: 470, height: 690 };
const cells = [];
for (const it of items) {
  for (const [view, rot] of [['f', 0.15], ['c', Math.PI + 0.15]]) {
    await p.evaluate(([id, r]) => { const g = window.__g; const c = {}; const slot = [...document.querySelectorAll('.item')].find((e) => e.dataset.id === id); void slot; c.x = id; g.wardrobe.apply({ x: id }); g.gnome.group.rotation.y = r; }, [it.id, rot]);
    await p.waitForTimeout(90);
    await p.evaluate((r) => { window.__g.gnome.group.rotation.y = r; }, rot);
    const buf = await p.screenshot({ clip, type: 'jpeg', quality: 72 });
    cells.push({ label: `${it.name}${view === 'c' ? ' (costas)' : ''}`, src: `data:image/jpeg;base64,${buf.toString('base64')}` });
  }
}
const pg = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const perSheet = 18;
for (let s = 0; s * perSheet < cells.length; s++) {
  const part = cells.slice(s * perSheet, (s + 1) * perSheet);
  await pg.setContent(`<body style="margin:0;background:#111;color:#fff;font:13px sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px">${part.map((c) => `<div><img src="${c.src}" style="width:100%;display:block"><div style="padding:2px 0 6px">${c.label}</div></div>`).join('')}</body>`);
  await pg.waitForTimeout(150);
  await pg.screenshot({ path: `test/sheet/s${s}.png`, fullPage: true });
}
console.log('folhas', Math.ceil(cells.length / perSheet), errs.join(' | ') || 'sem erros');
await b.close();
void readFileSync;
