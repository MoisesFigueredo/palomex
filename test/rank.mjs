// Ranking de ponta a ponta no site publicado. Apaga no fim tudo o que criou.
// uso: DATABASE_URL=... node test/rank.mjs <url>
import { chromium } from 'playwright';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
const url = (process.argv[2] || 'https://palomex.vercel.app').replace(/\/$/, '');
const sql = neon(process.env.DATABASE_URL);
let fails = 0;
const check = (n, ok, extra = '') => { if (!ok) fails++; console.log(ok ? 'ok   ' : 'FALHA', n, extra); };
const post = (b) => fetch(url + '/api/rank', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const before = (await sql`select count(*)::int n from palomex_scores`)[0].n;
const made = [];
const newId = () => { const i = randomUUID(); made.push(i); return i; };
const b = await chromium.launch({
  headless: true,
  executablePath: 'C:/Users/canal/AppData/Local/ms-playwright/chromium-1193/chrome-win/chrome.exe',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
try {
  // 1) a senha não vaza para o navegador
  const html = await (await fetch(url + '/')).text();
  check('senha do banco fora da página', !/neon\.tech|npg_|neondb_owner/.test(html), `${html.length} bytes`);
  const pkg = await fetch(url + '/api/rank.js');
  const src = await pkg.text();
  check('código e .env não são servidos', !/DATABASE_URL=|npg_/.test(src) && !/npg_/.test(await (await fetch(url + '/.env.local')).text()));

  // 2) validação do servidor
  const A = newId(), C = newId();
  check('recusa distância impossível', (await post({ player: A, name: 'ZZTeste', m: 99999, acorns: 1, t: 10 })).status === 422);
  check('recusa nome inválido', (await post({ player: A, name: '<script>', m: 10, acorns: 1, t: 10 })).status === 400);
  check('recusa nome de 1 letra', (await post({ player: A, name: 'Z', m: 10, acorns: 1, t: 10 })).status === 400);
  check('recusa jogador inválido', (await post({ player: "x' OR 1=1", name: 'ZZTeste', m: 10, acorns: 1, t: 10 })).status === 400);
  check('injeção no parâmetro não quebra', (await fetch(url + "/api/rank?player=' OR 1=1 --")).status === 200);
  check('método errado recusado', (await fetch(url + '/api/rank', { method: 'DELETE' })).status === 405);

  // 3) melhor resultado e posição
  let r = await post({ player: A, name: 'ZZTeste', m: 300, acorns: 40, t: 60 });
  let j = await r.json();
  check('grava resultado válido', r.status === 200 && j.me.best_m === 300, JSON.stringify(j));
  check('segundo envio em menos de 1 s é barrado', (await post({ player: A, name: 'ZZTeste', m: 310, acorns: 40, t: 60 })).status === 429);
  await new Promise((s) => setTimeout(s, 1200));
  r = await post({ player: A, name: 'ZZTeste', m: 100, acorns: 5, t: 60 });
  j = await r.json();
  check('resultado pior não apaga o recorde', j.me.best_m === 300 && j.me.acorns === 40, JSON.stringify(j.me));
  await post({ player: C, name: 'ZZTeste2', m: 500, acorns: 2, t: 60 });
  const g = await (await fetch(`${url}/api/rank?player=${A}`)).json();
  check('posição respeita a distância', g.top.findIndex((x) => x.name === 'ZZTeste2') < g.top.findIndex((x) => x.name === 'ZZTeste') && g.me.rank === g.top.findIndex((x) => x.name === 'ZZTeste') + 1, JSON.stringify(g.me));
  check('id secreto do jogador não é exposto', !JSON.stringify(g).includes(A) && !('player_id' in g.top[0]));

  // 4) jogando de verdade, no celular
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url + '/');
  await p.waitForFunction(() => window.__g, { timeout: 120000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'test/rk-menu.png' });
  await p.tap('#btnStart');
  await p.waitForTimeout(2700);
  await p.evaluate(() => { const G = window.__g, s = G.game; s.god = true; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; for (let i = G.props.live.length - 1; i >= 0; i--) G.props.remove(i); });
  await p.waitForTimeout(6000);
  await p.evaluate(() => { const G = window.__g, s = G.game; s.god = false; s.gap = 1; s.inv = 0; G.props.add('rock', s.px, 0.1); });
  await p.waitForFunction(() => window.__g.game.state === 'over', { timeout: 15000 });
  await p.waitForTimeout(700);
  check('sem nome, pede o nome ao morrer', await p.isVisible('#overName'));
  await p.screenshot({ path: 'test/rk-over1.png' });
  check('sem nome, nada foi enviado', !(await p.evaluate(() => localStorage.getItem('cg-sent'))));
  await p.fill('#overNameInput', 'Z');
  await p.tap('#overName button');
  await p.waitForTimeout(150);
  check('nome curto avisa no formulário', (await p.textContent('#overName .form-msg')).includes('2 a 14'));
  await p.fill('#overNameInput', 'ZZ Tônho');
  // digitar com espaço não pode reiniciar a corrida
  await p.focus('#overNameInput');
  await p.keyboard.press('Space');
  check('digitar espaço não reinicia', (await p.evaluate(() => window.__g.game.state)) === 'over');
  await p.fill('#overNameInput', 'ZZ Tônho');
  await p.tap('#overName button');
  await p.waitForFunction(() => !document.querySelector('#oRank').hidden, { timeout: 8000 });
  const id = await p.evaluate(() => JSON.parse(localStorage.getItem('cg-player')));
  made.push(id);
  const line = await p.textContent('#oRank');
  check('mostra a posição no mundo', /nº \d+ do mundo/.test(line), line);
  const row = await sql`select name, best_m, acorns from palomex_scores where player_id=${id}`;
  check('foi para o banco', row[0]?.name === 'ZZ Tônho' && row[0].best_m > 0, JSON.stringify(row[0]));
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'test/rk-over2.png' });
  await p.tap('#btnOverRank');
  await p.waitForFunction(() => document.querySelector('.rk.me'), { timeout: 8000 });
  await p.waitForTimeout(200);
  await p.screenshot({ path: 'test/rk-panel.png' });
  check('painel destaca você', (await p.textContent('.rk.me span')) === 'ZZ Tônho');
  await new Promise((s) => setTimeout(s, 1200));
  await p.fill('#rankNameInput', 'ZZ Tonho2');
  await p.tap('#rankName button');
  await p.waitForFunction(() => document.querySelector('.rk.me span')?.textContent === 'ZZ Tonho2', { timeout: 8000 });
  check('troca de nome funciona', true);
  await p.tap('#btnRankBack');
  await p.waitForTimeout(150);
  check('voltar retorna à derrota', await p.isVisible('#btnAgain'));
  await p.tap('#btnMenu');
  await p.waitForFunction(() => window.__g.game.state === 'title', { timeout: 5000 });
  await p.waitForTimeout(600);
  await p.tap('#btnRank');
  await p.waitForFunction(() => document.querySelector('.rk.me'), { timeout: 8000 });
  await p.tap('#btnRankBack');
  await p.waitForTimeout(150);
  check('ranking abre pelo menu', await p.isVisible('#btnStart'));

  // 5) segunda morte com nome salvo envia sozinha
  const m0 = (await sql`select best_m from palomex_scores where player_id=${id}`)[0].best_m;
  await p.tap('#btnStart');
  await p.waitForTimeout(2700);
  await p.evaluate(() => { const G = window.__g, s = G.game; s.god = true; s.nextRow = 1e6; s.birdCool = 1e6; s.evtT = 1e6; s.nextBonusAt = 1e9; for (let i = G.props.live.length - 1; i >= 0; i--) G.props.remove(i); });
  await p.waitForFunction((m) => window.__g.game.dist > m + 8, m0, { timeout: 40000 });
  await new Promise((s) => setTimeout(s, 1200));
  await p.evaluate(() => { const G = window.__g, s = G.game; s.god = false; s.gap = 1; s.inv = 0; G.props.add('rock', s.px, 0.1); });
  await p.waitForFunction(() => window.__g.game.state === 'over', { timeout: 15000 });
  await new Promise((s) => setTimeout(s, 1500));
  const m1 = (await sql`select best_m from palomex_scores where player_id=${id}`)[0].best_m;
  check('recorde novo sobe sozinho', m1 > m0, `${m0} -> ${m1}`);
  check('sem erro na página', !errs.length, errs.join(' | '));
} finally {
  await b.close();
  const clean = await sql`delete from palomex_scores where player_id = any(${made}::uuid[]) or name like 'ZZ%' returning name`;
  const after = (await sql`select count(*)::int n from palomex_scores`)[0].n;
  console.log(`limpeza: ${clean.length} removidos; tabela ${before} -> ${after}`);
  if (after !== before) { console.log('FALHA limpeza'); fails++; }
}
console.log(fails ? `${fails} falha(s)` : 'tudo certo');
