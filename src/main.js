// Palomex — jogo, câmera, cinemáticas e controles.
import * as THREE from 'three';
import gsap from 'gsap';
import '@fontsource/lilita-one/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import './style.css';
import { G, patch, clamp, lerp, damp, rnd } from './core/world.js';
import { Audio } from './core/audio.js';
import { Post, detect, contentFor } from './core/post.js';
import { Gnome } from './art/gnome.js';
import { Monster } from './art/monster.js';
import { buildForest } from './art/forest.js';
import { buildGround, buildSky } from './art/terrain.js';
import { Props, Burst, LANE, VINE_LEN, makeHatProp } from './art/props.js';
import { Birds } from './art/bird.js';
import { Wardrobe, CATALOG, SLOTS } from './art/accessories.js';
import { Tube, TUBE_R, THETA } from './art/tube.js';

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), flash: $('btnFlash'), title: $('title'), pause: $('pause'), over: $('over'),
  dist: $('dist'), acorns: $('acorns'), gap: $('gapFill'), gapBox: document.querySelector('.gap'), ring: $('flashRing'), toast: $('toast'),
  loader: $('loader'), lfill: $('lfill'), lmsg: $('lmsg'),
};
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* sem armazenamento */ } },
};

/* ---------- atmosferas: a noite muda conforme a corrida avança ---------- */
const hex = (c) => new THREE.Color(c);
const ATMOS = [
  { name: 'Mata do Crepúsculo', fog: '#3a2a4d', glow: '#d9744f', zen: '#141338', hor: '#7a3f5e', moon: '#ffe6c0', hemiS: '#8a7fb8', hemiG: '#2c2030', sun: '#ffc79e', sunI: 2.5, rim: '#ffa582', leaf: '#ffffff', glowC: '#7dffd2', den: 0.0205, aur: 0, hemi: 1.15 },
  { name: 'Noite Azul', fog: '#142348', glow: '#7f9fe0', zen: '#040818', hor: '#21386e', moon: '#e9f1ff', hemiS: '#6a88d0', hemiG: '#16203a', sun: '#a7c3ff', sunI: 2.9, rim: '#8fb4ff', leaf: '#b9cfff', glowC: '#68e0ff', den: 0.0215, aur: 0.35, hemi: 1.1 },
  { name: 'Brejo Esmeralda', fog: '#0d3a33', glow: '#6fe0aa', zen: '#03130f', hor: '#10493c', moon: '#dcffe8', hemiS: '#5fb79a', hemiG: '#0d2a22', sun: '#a8ffd2', sunI: 2.4, rim: '#74ffc0', leaf: '#b6f2c4', glowC: '#a4ff5a', den: 0.0255, aur: 0.5, hemi: 1.1 },
  { name: 'Floresta Rubra', fog: '#3c1120', glow: '#ff6a4a', zen: '#10040c', hor: '#5e1626', moon: '#ffd2bd', hemiS: '#a4566f', hemiG: '#2a0d15', sun: '#ff9d80', sunI: 2.6, rim: '#ff7058', leaf: '#ffb89c', glowC: '#ffc04a', den: 0.0235, aur: 0.15, hemi: 1.05 },
].map((a) => {
  const o = { ...a };
  for (const k of ['fog', 'glow', 'zen', 'hor', 'moon', 'hemiS', 'hemiG', 'sun', 'rim', 'leaf', 'glowC']) o[k] = hex(a[k]);
  return o;
});
const ATMOS_LEN = 650; // metros por atmosfera

/* ---------- boot ---------- */
const device = detect();
const isTouch = device.mobile || matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
if (isTouch) document.documentElement.classList.add('is-touch');
const params = new URLSearchParams(location.search);
const q = contentFor(device.mobile, device.weak);
q.pixelScale = 1;

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: false, alpha: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.25, 700);
camera.position.set(0, 3, -6);
scene.add(camera);

const hemi = new THREE.HemisphereLight('#8a7fb8', '#2c2030', 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffc79e', 2.5);
sun.position.set(-11, 26, 34);
sun.target.position.set(0, 0, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 30, bottom: -26, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);

G.uMoonDir.value.set(-0.07, 0.085, 1).normalize();

const audio = new Audio();
const game = {
  state: 'load', dist: 0, speed: 0, targetSpeed: 0, acorns: 0, gap: 55, charge: 0, timeScale: 1,
  lane: 0, px: 0, y: 0, vy: 0, grounded: true, sliding: 0, inv: 0, bufferJump: 0, combo: 0, comboT: 0,
  nextRow: 26, evtT: 7, lookT: 3, look: 0, roar: 0, lunge: 0, stun: 0, pounce: 0, bite: false,
  camK: 0, camD: 0, shake: 0, hitFx: 0, flashFx: 0, atmos: -1, fearCam: 0, mx: 0, slideFx: 0,
  wallet: store.get('cg-wallet', 0), owned: store.get('cg-owned', []), equip: store.get('cg-equip', {}), camS: 0, camT: 0, nextBonusAt: 170, bonus: null, portalKind: null, tubeKind: null, bendX: 0, bendY: -0.0004, bendTX: 0, bendTY: -0.0004, bendT: 0, runTime: 0, hat: null, best: store.get('cg-best', 0),
};
let forestGroup, tube, wardrobe, birds, gnome, monster, props, burst, ground, skyU, moon, post, blob, ringMark, hatMesh;
const tmp = new THREE.Vector3();

function setProgress(p, msg) {
  performance.mark(msg);
  ui.lfill.style.width = `${Math.round(p * 100)}%`;
  ui.lmsg.textContent = msg;
  return new Promise((r) => setTimeout(r));
}

async function boot() {
  await setProgress(0.08, 'Plantando a floresta');
  forestGroup = new THREE.Group();
  scene.add(forestGroup);
  ground = buildGround(forestGroup, q);
  buildForest(forestGroup, q);
  const s = buildSky(scene);
  skyU = s.U;
  moon = new THREE.Mesh(new THREE.CircleGeometry(15, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.2, 2.6), transparent: true, depthWrite: false, fog: false }));
  moon.frustumCulled = false;
  moon.renderOrder = -9;
  scene.add(moon);

  await setProgress(0.32, 'Esculpindo o gnomo');
  gnome = await Gnome.create(q);
  scene.add(gnome.group);
  wardrobe = new Wardrobe(gnome);
  await setProgress(0.55, 'Acordando o Cramunhão');
  monster = await Monster.create(q);
  scene.add(monster.group);
  birds = await Birds.create(q, scene);

  await setProgress(0.82, 'Espalhando bolotas');
  props = new Props(scene, q);
  burst = new Burst(scene, q);
  burst.points.material.uniforms.uBend = G.uBend;
  tube = new Tube(scene, q, props.mat);
  gnome.group.add(tube.sled);

  // sombra de contato do gnomo: essencial para ler a altura do pulo
  const blobM = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.5, depthWrite: false, alphaMap: blobTex() });
  patch(blobM, { rim: 0 });
  blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobM);
  blob.frustumCulled = false;
  blob.renderOrder = 2;
  scene.add(blob);

  // alvo do pedregulho
  const ringM = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.7, 0.35), transparent: true, opacity: 0, depthWrite: false, alphaMap: ringTex(), blending: THREE.AdditiveBlending });
  patch(ringM, { rim: 0 });
  ringMark = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2), ringM);
  ringMark.frustumCulled = false;
  ringMark.renderOrder = 2;
  scene.add(ringMark);

  hatMesh = new THREE.Mesh(makeHatProp(), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), { rim: 0.8 }));
  hatMesh.frustumCulled = false; hatMesh.castShadow = true; hatMesh.position.y = -50;
  scene.add(hatMesh);

  gnome.onStep = (side) => {
    audio.step_(side);
    if (game.state === 'run' && Math.random() < 0.7) burst.emit(game.px + side * 0.09, 0.06, -0.08, 2, { speed: 1, up: 0.8, color: '#a58a6a', size: 0.09, life: 0.42, grav: 1.5, power: 0.55 });
  };
  monster.onFootfall = (i) => {
    const near = clamp(1 - (monsterDist() - 2.5) / 3.5);
    if (game.state === 'run' || game.state === 'intro') {
      if (near > 0) game.shake = Math.max(game.shake, near * 0.3);
      if (near > 0 && (i < 2 || Math.random() < 0.5)) audio.thud(0.12 + near * 0.8);
      const b = monster.group.position;
      const sx = i % 2 === 0 ? 1.4 : -1.4, sz = i < 2 ? 1.3 : -1.5;
      burst.emit(b.x + sx, 0.1, b.z + sz, 7, { speed: 2.2, up: 0.8, color: '#9d8a70', size: 0.34, life: 0.8, grav: 0.8, power: 0.4 });
    }
  };

  post = new Post(renderer, scene, camera, moon, device.tier);
  post.sun = sun;
  post.applyShadow(post.tier);
  sun.shadow.mapSize.set(post.tier.shadow, post.tier.shadow);
  post.onTier = (name) => { window.__tier = name; };

  await setProgress(0.92, 'Acendendo a lanterna');
  applyAtmos(0, 1);
  gnome.update(0.016, { state: 'idle', speed: 0 });
  monster.update(0.016, { running: 0 });
  updateCamera(0.016);
  // pré-aquece os shaders agora: evita engasgo no meio da corrida
  await renderer.compileAsync(scene, camera);
  post.render(0.016);
  props.hideAll();
  birds.hideAll();
  wardrobe.apply(game.equip);
  tube.setVisible(false);
  tube.sled.visible = false;
  tube.portal.visible = false;
  for (const k in tube.items) tube.items[k].visible = false;
  hatMesh.visible = false;

  await setProgress(1, 'Pronto');
  setupInput();
  showTitle();
  syncScore(); // reenvia recorde que não chegou (sem internet na hora)
  gsap.to(ui.loader, { opacity: 0, duration: 0.7, onComplete: () => { ui.loader.hidden = true; } });
  window.__g = { game, gnome, monster, props, camera, post, input: act, start: startRun, renderer, X, syncScore, birds, launchFlock, wardrobe, openShop, closeShop, goMenu, launchOne, LIFE: { HIT_DAMAGE, FLASH_HEAL, LIFE_REGEN, LIFE_SAFE }, tube, spawnBonus, enterTube, dropHazard, spawnVine, spawnRow, springRow, logRow, jumpPath, speedAt };
}

function blobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(0.5, '#999'); r.addColorStop(1, '#000');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function ringTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 9;
  g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke();
  g.lineWidth = 6;
  for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; g.beginPath(); g.moveTo(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16); g.lineTo(64 + Math.cos(a) * 36, 64 + Math.sin(a) * 36); g.stroke(); }
  return new THREE.CanvasTexture(c);
}

/* ---------- atmosfera ---------- */
const _ca = new THREE.Color();
function applyAtmos(i, t) {
  const A = ATMOS[i % ATMOS.length], B = ATMOS[(i + 1) % ATMOS.length];
  const mix = (a, b, out) => out.copy(a).lerp(b, t);
  // t aqui é o avanço A->B
  mix(A.fog, B.fog, G.uFog.value);
  mix(A.glow, B.glow, G.uFogGlow.value);
  mix(A.rim, B.rim, G.uRimCol.value);
  mix(A.leaf, B.leaf, G.uTint.value);
  mix(A.glowC, B.glowC, G.uGlowCol.value);
  G.uFogDen.value = lerp(A.den, B.den, t);
  mix(A.zen, B.zen, skyU.uZen.value);
  mix(A.hor, B.hor, skyU.uHor.value);
  mix(A.moon, B.moon, skyU.uMoonC.value);
  skyU.uAur.value = lerp(A.aur, B.aur, t);
  mix(A.hemiS, B.hemiS, hemi.color);
  mix(A.hemiG, B.hemiG, hemi.groundColor);
  hemi.intensity = lerp(A.hemi, B.hemi, t);
  mix(A.sun, B.sun, sun.color);
  sun.intensity = lerp(A.sunI, B.sunI, t);
  _ca.copy(skyU.uMoonC.value).multiplyScalar(3.6);
  moon.material.color.copy(_ca);
}
function updateAtmos() {
  const k = game.dist / ATMOS_LEN;
  const i = Math.floor(k);
  const f = k - i;
  const t = clamp((f - 0.82) / 0.18);
  applyAtmos(i, t * t * (3 - 2 * t));
  if (i !== game.atmos) {
    if (game.atmos >= 0) showToast(ATMOS[i % ATMOS.length].name);
    game.atmos = i;
  }
}
function showToast(text, color = '') {
  ui.toast.textContent = text;
  ui.toast.style.color = color;
  gsap.killTweensOf(ui.toast);
  gsap.fromTo(ui.toast, { opacity: 0, y: 12, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)' });
  gsap.to(ui.toast, { opacity: 0, duration: 0.4, delay: 1.5 });
}

/* ---------- entrada ---------- */
function act(a) {
  if (game.state === 'tube') {
    if (a !== 'left' && a !== 'right') return; // lá dentro não se pula: é só para os lados
    tilt.hold = 1.3;
    game.lane = nearestLane();
    move(a === 'left' ? -1 : 1);
    return;
  }
  if (game.state !== 'run') return;
  if (a === 'left') move(-1);
  else if (a === 'right') move(1);
  else if (a === 'up') doJump();
  else if (a === 'down') doSlide();
  else if (a === 'flash') doFlash();
}
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* sem vibração */ } }

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target.matches?.('input')) return;
    if (rankFrom) { if (e.code === 'Escape') closeRank(); return; }
    const k = e.code;
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'flash' };
    if (map[k]) { e.preventDefault(); act(map[k]); }
    if (game.state === 'shop') { if (k === 'Escape') closeShop(); return; }
    if (k === 'KeyP' || k === 'Escape') togglePause();
    if (k === 'KeyM') toggleMute();
    if ((k === 'Enter' || k === 'Space') && game.state === 'title') startRun();
    if ((k === 'Enter' || k === 'Space') && game.state === 'over') startRun();
  });

  ui.flash.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    ui.flash.classList.add('on');
    act('flash');
    setTimeout(() => ui.flash.classList.remove('on'), 120);
  });

  // deslizar o dedo em qualquer parte da tela e arrastar com o mouse
  let sx = 0, sy = 0, active = false, id = -1;
  const area = $('game');
  area.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    sx = e.clientX; sy = e.clientY; active = true; id = e.pointerId;
  });
  area.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== id) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    const th = 32;
    if (Math.abs(dx) > th || Math.abs(dy) > th) {
      if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left');
      else act(dy < 0 ? 'up' : 'down');
      // um gesto vale uma ação: o próximo só conta depois de soltar o dedo
      active = false;
      buzz(7);
    }
  });
  const end = (e) => { if (e.pointerId === id) active = false; };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);
  // evita rolagem e zoom por gesto no iOS
  document.addEventListener('touchmove', (e) => { if (!e.target.closest?.('.scroll')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  $('btnStart').addEventListener('click', startRun);
  $('btnAgain').addEventListener('click', startRun);
  $('btnMenu').addEventListener('click', goMenu);
  $('btnRank').addEventListener('click', () => openRank(ui.title));
  $('btnOverRank').addEventListener('click', () => openRank(ui.over));
  $('btnRankBack').addEventListener('click', closeRank);
  $('overName').addEventListener('submit', onNameSubmit);
  $('rankName').addEventListener('submit', onNameSubmit);
  $('btnShop').addEventListener('click', openShop);
  $('btnShopBack').addEventListener('click', closeShop);
  $('shopList').addEventListener('click', onShopClick);
  $('btnResume').addEventListener('click', togglePause);
  $('btnPause').addEventListener('click', togglePause);
  $('btnMute').addEventListener('click', toggleMute);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (game.state === 'run' || game.state === 'tube') togglePause();
      audio.suspend();
    } else if (game.state !== 'pause') audio.resume();
  });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 180));
  // mantém a tela acesa durante a partida
  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch (_) { /* opcional */ }
}
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  post.resize();
}
function toggleMute() {
  audio.setMuted(!audio.muted);
  $('btnMute').classList.toggle('off', audio.muted);
  store.set('cg-mute', audio.muted);
}
function togglePause() {
  if (game.state === 'run' || game.state === 'tube') {
    game.pausedFrom = game.state;
    game.state = 'pause';
    ui.pause.hidden = false; ui.flash.hidden = true;
    audio.suspend();
  } else if (game.state === 'pause') {
    game.state = game.pausedFrom || 'run';
    ui.pause.hidden = true; ui.flash.hidden = game.state === 'tube';
    audio.resume();
  }
}

const FLASH_COST = 55; // bolotas catadas na estrada para encher o Clarão

/* ---------- ações do gnomo ---------- */
function move(d) {
  const nl = clamp(game.lane + d, -1, 1);
  if (nl === game.lane) { bumpEdge(d); return; }
  game.lane = nl;
  audio.whoosh();
}
/** Deslizou para fora da pista: bate na borda e leva um dano pequeno. */
function bumpEdge(d) {
  gnome.squashV -= 3;
  if (game.state !== 'run') return; // dentro do tronco só quica
  game.px += X(d) > 0 ? 0.42 : -0.42; // tranco para fora, o amortecimento traz de volta
  if ((game.bumpT || 0) > 0 || game.inv > 0 || game.god) return;
  game.bumpT = 0.6; // insistir não multiplica o dano
  // não mata sozinho: quem encerra a corrida é obstáculo, pássaro ou o monstro
  game.gap = Math.max(game.gap - 9, Math.min(game.gap, 3));
  game.speed *= 0.93;
  game.shake = Math.max(game.shake, 0.38);
  game.hitFx = Math.max(game.hitFx, 0.45);
  game.lunge = Math.max(game.lunge, 0.35);
  audio.thud(0.35);
  audio.bonk();
  buzz(35);
  const edge = Math.sign(X(d)) * 3.05;
  burst.emit(edge, 0.25, 0, 12, { speed: 3.4, up: 0.9, color: '#b19472', size: 0.16, life: 0.5, power: 0.75, grav: 6 });
}
function doJump() {
  if (game.grounded) {
    game.vy = JUMP_V; game.grounded = false; game.sliding = 0;
    gnome.jump();
    audio.jump();
    burst.emit(game.px, 0.08, 0, 6, { speed: 1.6, up: 0.6, color: '#b19472', size: 0.12, life: 0.5, power: 0.5 });
  } else game.bufferJump = 0.16;
}
function doSlide() {
  if (!game.grounded) { game.vy = Math.min(game.vy, -13); game.slideAfter = true; return; }
  if (game.sliding <= 0) audio.slide();
  game.sliding = 0.72;
}
function doFlash() {
  if (game.charge < 1) { gnome.squashV -= 1.5; return; }
  game.charge = 0;
  game.stun = 1.5;
  if (game.fall) { game.fall = null; ringMark.material.opacity = 0; }
  game.gap = Math.min(100, game.gap + FLASH_HEAL); // recupera parte da vida, não toda
  gnome.flashBoost = 1;
  gsap.fromTo(game, { flashFx: 0.85 }, { flashFx: 0, duration: 0.8, ease: 'power2.out' });
  gsap.fromTo(G.uFlash, { value: 1.1 }, { value: 0, duration: 1.0, ease: 'power2.out' });
  audio.flash();
  game.shake = 0.5;
  buzz(40);
  // abre caminho: tudo que está logo à frente voa longe
  for (const o of props.live) {
    if (!o.dead && o.z > -2 && o.z < 24) {
      props.launch(o, 1);
      burst.emit(o.x, 0.8, o.z, 22, { speed: 7, up: 1, color: '#ffd98a', size: 0.17, life: 0.8, power: 2.6, grav: 3 });
    }
  }
  for (const b of birds.list) if (b.on && b.z < 55) { featherBurst(b); birds.remove(b); }
  burst.emit(game.px, 0.7, 0, 50, { speed: 11, up: 0.6, color: '#fff0c4', size: 0.14, life: 0.8, power: 4, grav: 1 });
  showToast('Clarão!', '#ffc64d');
  game.timeScale = 0.45;
  gsap.to(game, { timeScale: 1, duration: 0.55, delay: 0.1 });
}
function hitObstacle(o) {
  if (game.inv > 0 || game.god) return;
  props.launch(o, 1);
  burst.emit(o.x, 0.6, o.z, 24, { speed: 6, up: 1, color: '#a98d68', size: 0.2, life: 0.8, power: 0.8, grav: 8 });
  hurt();
}
// Vida de 100. Cada tapa tira 60: com 60 ou menos, o próximo mata.
const HIT_DAMAGE = 60;
const LIFE_SAFE = 60; // acima disto, aguenta um tapa e o monstro já saiu de cena
const LIFE_REGEN = 2.5; // por segundo: de 40 a mais de 60 em 10 s
const FLASH_HEAL = 40;
function hurt() {
  game.inv = 1.15;
  const dead = game.gap <= HIT_DAMAGE;
  game.gap = dead ? 0 : game.gap - HIT_DAMAGE;
  game.speed *= 0.68;
  game.sliding = 0;
  game.shake = 0.8;
  game.hitFx = 1;
  game.combo = 0;
  gnome.stumble();
  audio.hit();
  buzz([30, 30, 50]);
  if (dead) caught();
  else { game.lunge = 0.9; audio.roar(0.45); showToast('Mais um tapa e ele te pega!', '#ff8a7a'); }
}

/* ---------- cinemáticas ---------- */
function showTitle() {
  game.state = 'title';
  ui.title.hidden = false;
  $('walletTitle').textContent = game.wallet;
  if (game.best > 0) {
    $('bestTitle').hidden = false;
    $('bestTitle').textContent = `Recorde: ${game.best} metros`;
  }
  gsap.from('#title h1', { y: -30, opacity: 0, duration: 0.9, ease: 'back.out(1.6)', delay: 0.4 });
  gsap.from('.head p', { opacity: 0, duration: 0.8, delay: 0.9 });
  gsap.from('.foot', { opacity: 0, y: 16, duration: 0.7, delay: 1.0 });
  monster.group.position.set(0, 0, -12);
}

function resetRun() {
  props.clear();
  Object.assign(game, {
    dist: 0, speed: 0, acorns: 0, gap: 100, charge: 0, lane: 0, px: 0, y: 0, vy: 0, grounded: true, sliding: 0, inv: 0,
    nextRow: 30, evtT: 8, lookT: 3, look: 0, roar: 0, lunge: 0, stun: 0, pounce: 0, bite: false, combo: 0,
    atmos: -1, camD: 0, runTime: 0, bendTX: 0, bendTY: -0.0004, bendT: 4, slideAfter: false, gnomeLift: 0, hat: null,
  });
  birds.hideAll();
  game.birdCues = []; game.birdCool = 5; game.birdSeen = false; game.tatuSeen = false;
  leaveTubeWorld();
  hideBonus();
  game.fall = null; game.fallT = 5;
  game.nextBonusAt = 170;
  hatMesh.visible = false;
  gnome.group.position.set(0, 0, 0);
  gnome.group.rotation.set(0, 0, 0);
  ringMark.material.opacity = 0;
  ui.dist.textContent = '0'; ui.acorns.textContent = '0';
}

function startRun() {
  requestTilt();
  audio.unlock();
  audio.resume();
  if (store.get('cg-mute', false) && !audio.muted) toggleMute();
  const again = game.state === 'over';
  if (game.state !== 'title' && !again) return;
  ui.title.hidden = true; ui.over.hidden = true;
  resetRun();
  game.state = 'intro';
  const tl = gsap.timeline();
  if (again) {
    game.camK = 0;
    monster.group.position.set(0, 0, -9);
    game.mx = 0;
  }
  // o gnomo ouve, olha, leva o susto; o monstro surge rugindo atrás dele
  tl.call(() => { audio.roar(1); game.roar = 1; game.shake = 0.9; buzz(90); game.scared = true; gnome.squashV = 8; })
    .to(game, { introMon: 1, duration: 0.5, ease: 'power3.out' }, 0)
    .to(game, { camK: 1, duration: 1.15, ease: 'power2.inOut' }, 0.55)
    .call(() => {
      game.roar = 0; game.scared = false;
      game.state = 'run';
      game.targetSpeed = 10;
      audio.setRunning(true);
      ui.hud.hidden = false; ui.flash.hidden = false;
      ui.flash.querySelector('kbd').hidden = isTouch;
      showToast(ATMOS[0].name);
      game.atmos = 0;
    }, null, 1.15);
  game.introMon = 0;
}

function caught() {
  if (game.state !== 'run') return;
  game.state = 'caught';
  ui.hud.hidden = true; ui.flash.hidden = true;
  audio.setRunning(false);
  audio.roar(1.1);
  buzz([60, 40, 120]);
  game.pounce = 1;
  game.timeScale = 0.35;
  for (let i = props.live.length - 1; i >= 0; i--) { const o = props.live[i]; if (o.z > -12 && o.z < 16) { burst.emit(o.x, 0.6, o.z, 10, { speed: 5, up: 1, color: '#a98d68', size: 0.2, life: 0.6, power: 0.7, grav: 8 }); props.remove(i); } }
  props.acornList.length = 0;
  ringMark.material.opacity = 0; game.fall = null;
  birds.hideAll(); game.birdCues = [];
  gsap.to(game, { camD: 1, duration: 1.1, ease: 'power2.inOut' });
  gsap.to(game, { timeScale: 0.85, duration: 0.8, delay: 0.5 });
  gsap.to(game, { speed: 0, targetSpeed: 0, duration: 1.1 });
  // bolotas catadas mais um bônus pela distância viram moeda da loja
  const distBonus = Math.floor(game.dist / 25);
  game.earned = game.acorns + distBonus;
  game.wallet += game.earned;
  store.set('cg-wallet', game.wallet);
  const runM = Math.floor(game.dist);
  const prevRun = store.get('cg-bestrun', null);
  if (!prevRun || runM > prevRun.m) store.set('cg-bestrun', { m: runM, acorns: game.acorns, t: Math.ceil(game.runTime) + 1 });
  $('oRank').hidden = true;
  syncScore();
  const best = Math.max(game.best, Math.floor(game.dist));
  const isRecord = best > game.best;
  game.best = best;
  store.set('cg-best', best);
  // sequência: agarra, leva à boca, morde, sobra o chapéu
  const tl = gsap.timeline();
  tl.call(() => { game.grabbed = true; }, null, 0.45)
    .to(game, { gnomeLift: 1, duration: 0.6, ease: 'power2.in' }, 0.45)
    .call(() => {
      game.bite = true; game.grabbed = false;
      audio.gulp();
      game.shake = 0.9;
      monster.mouthWorld(tmp);
      burst.emit(tmp.x, tmp.y, tmp.z, 24, { speed: 4, up: 1, color: '#fff0c4', size: 0.1, life: 0.7, power: 2 });
      hatMesh.position.copy(tmp).setY(tmp.y + 0.3);
      hatMesh.visible = true;
      game.hat = { t: 0, vy: 1.7 };
    }, null, 1.08)
    .call(() => {
      $('oDist').textContent = Math.floor(game.dist);
      $('oAc').textContent = game.acorns;
      $('oEarned').textContent = `+${game.earned} bolotas (${game.acorns} catadas + ${game.earned - game.acorns} pela distância). Total: ${game.wallet}`;
      $('oBest').textContent = game.best;
      const m = Math.floor(game.dist);
      $('overTitle').textContent = isRecord && m > 50 ? 'Novo recorde!' : 'Nhac.';
      $('overLine').textContent = isRecord && m > 50 ? 'Morreu, mas morreu longe. Sobrou só o chapéu.' : 'Sobrou só o chapéu.';
      ui.over.hidden = false;
      $('overName').hidden = !!playerName();
      if (!playerName()) $('overName').querySelector('.form-msg').textContent = '';
      showOverRank();
      gsap.from('#over > *', { y: 18, opacity: 0, stagger: 0.07, duration: 0.45, ease: 'power2.out' });
      game.state = 'over';
    }, null, 3.0);
  game.gnomeLift = 0;
}

/* ---------- ranking mundial ---------- */
const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,12}[\p{L}\p{N}.]$/u;
function playerId() {
  let id = store.get('cg-player', null);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
    store.set('cg-player', id);
  }
  return id;
}
const playerName = () => store.get('cg-name', '');
let myRank = null;
async function postScore(name, run) {
  const r = await fetch('/api/rank', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ player: playerId(), name, m: run?.m || 0, acorns: run?.acorns || 0, t: run?.t || 0 }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'falha');
  return body;
}
/** Envia o recorde se ele ainda não chegou ao servidor. Sem nome, espera o jogador escolher. */
async function syncScore() {
  const name = playerName();
  const run = store.get('cg-bestrun', null);
  if (!name || !run || run.m <= store.get('cg-sent', 0)) return;
  try {
    const { me } = await postScore(name, run);
    store.set('cg-sent', run.m);
    myRank = me;
    showOverRank();
  } catch (_) { /* tenta de novo na próxima morte ou ao abrir o jogo */ }
}
function showOverRank() {
  const el = $('oRank');
  if (ui.over.hidden || !myRank?.rank) { el.hidden = true; return; }
  el.textContent = `Você é o nº ${myRank.rank} do mundo, com ${myRank.best_m} metros`;
  el.hidden = false;
}
async function onNameSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const input = form.querySelector('input');
  const msg = form.querySelector('.form-msg');
  const name = input.value.trim().replace(/\s+/g, ' ');
  msg.classList.remove('ok');
  if (!NAME_OK.test(name)) { msg.textContent = 'Use de 2 a 14 letras ou números.'; return; }
  msg.textContent = 'Salvando';
  const prevName = playerName();
  store.set('cg-name', name);
  try {
    const run = store.get('cg-bestrun', null);
    const { me } = await postScore(name, run);
    if (run) store.set('cg-sent', Math.max(store.get('cg-sent', 0), run.m));
    myRank = me;
    msg.textContent = 'Salvo';
    msg.classList.add('ok');
    input.blur();
    if (form.id === 'overName') { form.hidden = true; showOverRank(); }
    else loadRank();
  } catch (err) {
    if (err.message === 'devagar') msg.textContent = 'Espere um instante e salve de novo.';
    else if (err.message === 'nome') msg.textContent = 'Use de 2 a 14 letras ou números.';
    else {
      // o nome fica guardado e o recorde sobe depois; só avisa
      msg.textContent = 'Sem conexão com o ranking. Tentamos de novo depois.';
      return;
    }
    if (prevName) store.set('cg-name', prevName);
  }
}
let rankFrom = null;
function openRank(from) {
  rankFrom = from;
  from.hidden = true;
  $('rank').hidden = false;
  $('rankNameInput').value = playerName();
  $('rankName').querySelector('.form-msg').textContent = '';
  loadRank();
}
function closeRank() {
  if (!rankFrom) return;
  $('rank').hidden = true;
  rankFrom.hidden = false;
  if (rankFrom === ui.over) { $('overName').hidden = !!playerName(); showOverRank(); }
  rankFrom = null;
}
function rankRow(pos, name, m, isMe) {
  const row = document.createElement('div');
  row.className = `rk${pos <= 3 ? ` p${pos}` : ''}${isMe ? ' me' : ''}`;
  const b = document.createElement('b'); b.textContent = pos;
  const s = document.createElement('span'); s.textContent = name; // textContent: nome nunca vira HTML
  const em = document.createElement('em'); em.textContent = `${m} m`;
  row.append(b, s, em);
  return row;
}
async function loadRank() {
  const list = $('rankList');
  const info = $('rankInfo');
  info.textContent = 'Carregando';
  try {
    const r = await fetch(`/api/rank?player=${encodeURIComponent(playerId())}`);
    if (!r.ok) throw new Error('falha');
    const { top, total, me } = await r.json();
    myRank = me;
    list.replaceChildren();
    info.textContent = me?.rank ? `Você é o nº ${me.rank} de ${total}` : `${total} ${total === 1 ? 'jogador' : 'jogadores'}`;
    if (!top.length) {
      const p = document.createElement('p');
      p.className = 'rk-empty';
      p.textContent = 'Ninguém no ranking ainda. Corra e seja o primeiro.';
      list.append(p);
    }
    top.forEach((t, i) => list.append(rankRow(i + 1, t.name, t.best_m, me?.rank === i + 1)));
    if (me?.rank > top.length) {
      const gap = document.createElement('div');
      gap.className = 'rk-gap'; gap.textContent = '...';
      list.append(gap, rankRow(me.rank, me.name, me.best_m, true));
    }
  } catch (_) {
    list.replaceChildren();
    info.textContent = '';
    const p = document.createElement('p');
    p.className = 'rk-empty';
    p.textContent = 'Sem conexão com o ranking. Confira a internet e abra de novo.';
    list.append(p);
  }
}

/* ---------- menu principal e loja ---------- */
function fadeSwap(fn) {
  gsap.killTweensOf('#fade');
  gsap.to('#fade', { opacity: 1, duration: 0.22, onComplete: () => { fn(); gsap.to('#fade', { opacity: 0, duration: 0.4 }); } });
}
function goMenu() {
  if (game.state !== 'over') return;
  game.state = 'fading';
  fadeSwap(() => {
    gsap.killTweensOf(game);
    resetRun();
    Object.assign(game, { camK: 0, camD: 0, timeScale: 1, introMon: 0, speed: 0, targetSpeed: 0, grabbed: false, scared: false });
    gnome.group.rotation.set(0, 0, 0);
    applyAtmos(0, 0);
    ui.over.hidden = true;
    ui.title.hidden = false;
    $('walletTitle').textContent = game.wallet;
    if (game.best > 0) { $('bestTitle').hidden = false; $('bestTitle').textContent = `Recorde: ${game.best} metros`; }
    game.state = 'title';
  });
}
let shopSel = null;
function openShop() {
  if (game.state !== 'title') return;
  audio.unlock();
  game.state = 'shop';
  shopSel = null;
  ui.title.hidden = true;
  $('shop').hidden = false;
  renderShop();
  gsap.to(game, { camS: 1, duration: 0.7, ease: 'power2.inOut' });
}
function closeShop() {
  if (game.state !== 'shop') return;
  game.state = 'title';
  shopSel = null;
  wardrobe.apply(game.equip); // desfaz o item só experimentado
  // volta pelo caminho curto em vez de desenrolar as voltas já dadas
  const r = gnome.group.rotation.y;
  gnome.group.rotation.y = Math.atan2(Math.sin(r), Math.cos(r));
  $('shop').hidden = true;
  ui.title.hidden = false;
  $('walletTitle').textContent = game.wallet;
  gsap.to(game, { camS: 0, duration: 0.6, ease: 'power2.inOut' });
}
function renderShop() {
  $('walletShop').textContent = game.wallet;
  const list = $('shopList');
  const top = list.scrollTop;
  list.innerHTML = SLOTS.map((sl) => {
    const rows = CATALOG.filter((c) => c.slot === sl.id).sort((a, c) => a.price - c.price).map((c) => {
      const owned = game.owned.includes(c.id);
      const on = game.equip[c.slot] === c.id;
      const sel = shopSel === c.id && !owned;
      const short = c.price - game.wallet;
      let right;
      if (on) right = '<span class="tag">Usando</span>';
      else if (owned) right = '<span class="tag">Usar</span>';
      else if (sel) right = short > 0 ? `<span class="buy" role="button" aria-disabled="true" data-disabled="1" style="background:rgba(255,255,255,.14);color:var(--dim)">Faltam ${short}</span>` : `<span class="buy" role="button" data-buy="${c.id}">Comprar ${c.price}</span>`;
      else right = `<span class="tag">${c.price} bolotas</span>`;
      return `<button class="item${on ? ' on' : ''}${owned ? ' owned' : ''}${sel ? ' sel' : ''}" data-id="${c.id}" aria-pressed="${on}">
        <svg viewBox="0 0 24 24" style="color:${c.color}" aria-hidden="true">${c.icon}</svg>
        <span><strong>${c.name}</strong><small>${c.desc}</small></span>${right}</button>`;
    }).join('');
    return `<p class="slot-name">${sl.name}</p>${rows}`;
  }).join('');
  list.scrollTop = top;
}
function onShopClick(e) {
  const buy = e.target.closest('[data-buy]');
  if (buy) {
    const c = CATALOG.find((x) => x.id === buy.dataset.buy);
    if (!c || game.wallet < c.price || game.owned.includes(c.id)) return;
    game.wallet -= c.price;
    game.owned.push(c.id);
    game.equip[c.slot] = c.id;
    store.set('cg-wallet', game.wallet);
    store.set('cg-owned', game.owned);
    store.set('cg-equip', game.equip);
    shopSel = null;
    wardrobe.apply(game.equip);
    audio.coin(5); audio.coin(7);
    buzz(25);
    renderShop();
    return;
  }
  if (e.target.closest('[data-disabled]')) return;
  const b = e.target.closest('.item');
  if (!b) return;
  const c = CATALOG.find((x) => x.id === b.dataset.id);
  if (game.owned.includes(c.id)) {
    // comprado: liga e desliga
    if (game.equip[c.slot] === c.id) delete game.equip[c.slot];
    else game.equip[c.slot] = c.id;
    store.set('cg-equip', game.equip);
    shopSel = null;
    wardrobe.apply(game.equip);
  } else {
    // não comprado: experimenta no gnomo sem gastar nada
    shopSel = shopSel === c.id ? null : c.id;
    wardrobe.apply(shopSel ? { ...game.equip, [c.slot]: c.id } : game.equip);
  }
  buzz(8);
  renderShop();
}

/* ---------- geração da pista ---------- */
const X = (lane) => -lane * LANE; // pista -1 é a esquerda na tela (+x)
const rint = (n) => Math.floor(Math.random() * n);
const speedCurve = (d) => 10 + 14 * (1 - Math.exp(-d / 1100));
// Física do pulo em um só lugar: as bolotas seguem exatamente o que o gnomo vai fazer.
const JUMP_V = 8.6, SPRING_V = 14.2, G_UP = 22, G_DOWN = 30;
function jumpPath(v0) {
  const up = v0 / G_UP, h = (v0 * v0) / (2 * G_UP), down = Math.sqrt((2 * h) / G_DOWN);
  return { T: up + down, y: (t) => (t < up ? v0 * t - 0.5 * G_UP * t * t : h - 0.5 * G_DOWN * (t - up) * (t - up)) };
}
/** Pontos da curva do pulo: o espaço entre bolotas se mantém, e a quantidade cresce com a distância. */
function jumpArc(speed, v0, minN = 5, step = 2.2) {
  const p = jumpPath(v0);
  const L = speed * p.T;
  const n = Math.max(minN, Math.round(L / step));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (p.T * (i + 0.5)) / n;
    pts.push({ d: speed * t, y: 0.6 + p.y(t) });
  }
  return { pts, L };
}
/** Velocidade prevista quando o gnomo chegar em z: a pista nasce bem antes de ser alcançada. */
function speedAt(z) { return speedCurve(game.dist + Math.max(z, 0) * 0.62); }
function acornLine(lane, z, n = 5, step = 1.8) {
  // correndo mais rápido, a mesma fila fica mais comprida
  const s = step * Math.max(1, speedAt(z) / 11);
  for (let i = 0; i < n; i++) props.addAcorn(X(lane), 0.55, z + i * s);
}
function logRow(lane, z) {
  props.add('logWide', 0, z);
  // o topo da curva cai bem em cima do tronco
  const { pts, L } = jumpArc(speedAt(z), JUMP_V);
  for (const p of pts) props.addAcorn(X(lane), p.y, z - L / 2 + p.d);
}
function layArc(x, z0, speed, spring) {
  // tira a prévia deste cogumelo e desenha de novo
  const list = props.acornList;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].spring === spring) list.splice(i, 1);
  for (const p of jumpArc(speed, SPRING_V, 6).pts) {
    props.addAcorn(x, p.y, z0 + p.d);
    if (list.length) list[list.length - 1].spring = spring;
  }
}
function springRow(lane, z) {
  const o = props.add('spring', X(lane), z);
  const speed = speedAt(z);
  layArc(X(lane), z, speed, o);
  return { o, span: speed * jumpPath(SPRING_V).T };
}
function blockAllBut(free, z) {
  if (free === 0) { props.add('rock', X(-1), z); props.add('rock', X(1), z); }
  else props.add('bramble', X(free === 1 ? -0.5 : 0.5), z);
}
function spawnVine(z, lane = 0) {
  const o = props.add('vine', 0, z);
  // o período é folgado: dá para ler o balanço antes de chegar
  o.swing = { A: Math.asin(Math.min(0.42, (LANE * 1.25) / VINE_LEN)), w: rnd(1.9, 2.6), ph: Math.random() * 6.283 };
  void lane;
  return o;
}
function spawnRow(z, diff) {
  const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
  const hard = diff > 0.3;
  const sp = speedAt(z);
  // sequências aparecem cedo e ficam cada vez mais comuns
  if (diff > 0.05 && Math.random() < 0.14 + diff * 0.2) {
    const kind = Math.random();
    if (kind < 0.4) {
      // zigue-zague: a saída muda de lado na fileira seguinte
      const a = lanes[0];
      const b = a === 0 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      blockAllBut(a, z);
      blockAllBut(b, z + sp * 0.95);
      acornLine(a, z - 4, 3);
      return sp * 0.95;
    }
    if (kind < 0.75) {
      // desvia e logo em seguida pula o galho
      blockAllBut(lanes[0], z);
      logRow(lanes[0], z + sp * 0.95);
      return sp * 0.95;
    }
    // pula o galho e desliza
    logRow(lanes[0], z);
    props.add('arch', 0, z + sp * 0.95);
    return sp * 0.95;
  }
  const r = Math.random();
  let span = 0;
  if (r < 0.1) {
    spawnVine(z);
    acornLine(lanes[0], z - 5, 3);
  } else if (r < 0.2) {
    // lama em duas pistas: a terceira fica livre, mas pular também salva
    props.add('mud', X(lanes[0]), z);
    if (Math.random() < 0.6) props.add('mud', X(lanes[1]), z);
    acornLine(lanes[2], z - 3, 5);
  } else if (r < 0.32) {
    props.add('rock', X(lanes[0]), z);
    if (diff > 0.15 && Math.random() < 0.6) props.add(Math.random() < 0.5 ? 'rock' : 'stump', X(lanes[1]), z);
    acornLine(lanes[2], z - 4, 5);
  } else if (r < 0.46) {
    logRow(lanes[0], z);
  } else if (r < 0.6) {
    props.add('arch', 0, z);
    acornLine(lanes[0], z - 3, 4, 2);
  } else if (r < 0.74) {
    const free = lanes[0];
    blockAllBut(free, z);
    acornLine(free, z - 5, 6);
  } else if (r < 0.88) {
    props.add('log', X(lanes[0]), z);
    props.add('stump', X(lanes[1]), z);
    if (hard) props.add('stump', X(lanes[2]), z);
    else acornLine(lanes[2], z - 3, 4);
  } else if (r < 0.95) {
    // o trecho reservado acompanha o pulo: nunca aterrissa em obstáculo que não deu para ver
    span = springRow(lanes[0], z).span;
    if (hard) props.add('rock', X(lanes[1]), z);
  } else {
    // respiro: curva de bolotas trocando de pista
    const a = lanes[0], b = lanes[1];
    acornLine(a, z, 4); acornLine(b, z + 10, 4);
    span = 6;
  }
  return span;
}

function updateTrack(dt) {
  const diff = clamp(game.dist / 1100);
  game.nextRow -= game.speed * dt;
  while (game.nextRow < 118) {
    if (game.dist >= game.nextBonusAt && !game.bonus && !game.portalKind) {
      const sp = game.targetSpeed;
      const lane = [-1, 0, 1][rint(3)];
      const z = game.nextRow + sp * 0.7;
      spawnBonus(Math.random() < 0.5 ? 'folha' : 'cogumelo', lane, z);
      acornLine(lane, z - 8, 5, 1.5);
      game.nextRow = z + sp * 1.1;
      game.nextBonusAt = game.dist + rnd(380, 560);
      continue;
    }
    if (game.birdCool <= 0 && game.dist > 70) {
      // abre um corredor: antes e depois do pássaro a pista fica limpa para o desvio
      const sp = game.targetSpeed;
      const cue = game.nextRow + sp * 1.15;
      game.birdCues.push({ z: cue });
      game.nextRow = cue + sp * 1.8;
      game.birdCool = rnd(7, 12) - diff * 4;
      continue;
    }
    const span = spawnRow(game.nextRow, diff);
    // tempo de reação cai de 1,2 s para 0,82 s; nunca menos que isso
    const gap = Math.max(10, game.targetSpeed * (1.2 - diff * 0.38));
    game.nextRow += gap + span + rnd(0, 3);
  }
  // obstáculos
  const pz = 0, h = game.y;
  for (let i = props.live.length - 1; i >= 0; i--) {
    if (game.state !== 'run') return; // a captura esvazia a lista no meio do laço
    const o = props.live[i];
    o.z -= game.speed * dt;
    if (o.fly) {
      const f = o.fly;
      f.t += dt;
      f.vy -= 18 * dt;
      o.x += f.vx * dt;
      o.z += f.vz * dt;
      o.m.position.y += f.vy * dt;
      o.m.rotation.x += f.rx * dt;
      o.m.rotation.z += f.rz * dt;
      o.m.position.x = o.x;
      o.m.position.z = o.z;
      o.m.scale.setScalar(Math.max(0.02, 1 - Math.max(0, f.t - 0.8) * 1.5));
      if (f.t > 1.5 || o.z < -30) props.remove(i);
      continue;
    }
    o.m.position.z = o.z;
    if (o.z < -32) { props.remove(i); continue; }
    if (o.swing) {
      const a = Math.sin(G.uTime.value * o.swing.w + o.swing.ph) * o.swing.A;
      o.m.rotation.z = a;
      o.x = Math.sin(a) * VINE_LEN;
    }
    if (o.falling && updateFalling(o, dt)) continue;
    if (o.z < -0.7 && (o.type === 'slide' || o.type === 'block')) o.m.scale.y = Math.max(0.02, 1 + (o.z + 0.7) / 1.8);
    if (o.dead) continue;

    // o monstro atravessa o que sobrou para trás
    const mz = -monsterDist();
    if (o.type !== 'mud' && o.z < mz - 0.4 && Math.abs(o.x - game.mx) < 2.6 && mz > -8.5) {
      props.launch(o, -1);
      burst.emit(o.x, 0.6, o.z, 16, { speed: 5, up: 1, color: '#9c8466', size: 0.26, life: 0.7, power: 0.6, grav: 7 });
      game.shake = Math.max(game.shake, 0.35);
      audio.thud(0.6);
      continue;
    }
    if (Math.abs(o.z - pz) > o.hz + 0.26) continue;
    if (Math.abs(game.px - o.x) > o.hw + 0.22) continue;
    if (o.type === 'mud') {
      if (h < 0.22 && !o.used) {
        o.used = true;
        game.speed = Math.min(game.speed, game.targetSpeed * 0.62);
        if (!game.god) game.gap = Math.max(Math.min(game.gap, 3), game.gap - 12);
        game.shake = Math.max(game.shake, 0.25);
        game.lunge = Math.max(game.lunge, 0.4);
        audio.splat();
        buzz(30);
        burst.emit(game.px, 0.15, 0, 16, { speed: 3, up: 1, color: '#b45cff', size: 0.14, life: 0.6, power: 1.4, grav: 7 });
      }
    } else if (o.type === 'jump') { if (h < o.h - 0.1) hitObstacle(o); }
    else if (o.type === 'slide') { if (game.sliding <= 0) hitObstacle(o); }
    else if (o.type === 'block') { hitObstacle(o); }
    else if (o.type === 'spring' && h < 0.5 && game.vy <= 0) {
      game.vy = SPRING_V; game.grounded = false; game.sliding = 0;
      // redesenha com a velocidade de agora: um tombo antes do cogumelo muda a distância do pulo
      layArc(o.x, 0, game.speed, o);
      gnome.jump(); gnome.squashV = 9;
      audio.bigJump();
      o.m.scale.set(1.25, 0.55, 1.25);
      gsap.to(o.m.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1.2,0.3)' });
      burst.emit(o.x, 0.4, o.z, 18, { speed: 4, up: 1.1, color: '#6df0c8', size: 0.14, life: 0.7, power: 2.4 });
    }
  }
  // bolotas: leve ímã na hora de catar
  const t = G.uTime.value;
  props.updateAcorns(dt, game.speed, t);
  const list = props.acornList;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const dx = a.x - game.px, dy = a.y - (h + 0.6), dz = a.z;
    if (Math.abs(dz) < 3 && Math.abs(dx) < 1.2 && Math.abs(dy) < 1.5) { a.x -= dx * dt * 12; a.y -= dy * dt * 12; }
    if (dx * dx + dy * dy * 0.7 + dz * dz < 0.5) {
      list.splice(i, 1);
      game.acorns++;
      game.combo++;
      game.comboT = 1;
      game.charge = Math.min(1, game.charge + 1 / FLASH_COST);
      audio.coin(game.combo);
      burst.emit(a.x, a.y, a.z, 6, { speed: 2.4, up: 1, color: '#ffd76b', size: 0.09, life: 0.45, power: 3, grav: 2 });
      ui.acorns.textContent = game.acorns;
      if (game.charge >= 1 && !ui.flash.classList.contains('ready')) { showToast('Clarão pronto!', '#ffc64d'); buzz(25); }
    }
  }
}

/* ---------- o que cai do céu: mira no gnomo, trava e cai na cabeça ---------- */
const FALL_T = 1.5; // do estalo até a pancada
const FALL_LOCK = 0.48; // fração do tempo em que ainda segue o gnomo; depois é só sair de baixo
function dropHazard(kind = 'log', T = FALL_T) {
  if (game.fall || game.portalKind) return null;
  // precisa haver para onde fugir: nada pesado chegando na hora da queda
  for (const o of props.live) {
    if (o.dead || o.type === 'mud') continue;
    // só atrapalha o que bloqueia pista bem na hora da fuga; galho e portal se resolvem junto
    const at = o.z / Math.max(game.speed, 1);
    if (o.type === 'block' && at > T - 0.55 && at < T + 0.35) return null;
  }
  const o = props.add(kind, game.px, 0.4);
  o.falling = { t: 0, T, z: 0.4, rx: rnd(-4, 4), rz: rnd(-4, 4), locked: false };
  o.m.position.y = 10;
  game.fall = o;
  audio.crack();
  ringMark.material.color.setRGB(4.6, 2.3, 0.4);
  return o;
}
/** Devolve true enquanto ainda está no ar. */
function updateFalling(o, dt) {
  const f = o.falling;
  f.t += dt;
  const k = clamp(f.t / f.T);
  o.z = f.z; // cai onde o gnomo está: não anda junto com a estrada
  if (k < FALL_LOCK) {
    o.x = damp(o.x, game.px, 12, dt); // o alvo segue os pés
  } else if (!f.locked) {
    f.locked = true;
    o.x = X(game.lane);
    audio.screech();
    buzz(22);
    ringMark.material.color.setRGB(6, 0.7, 0.3);
    if (!game.fallSeen) { game.fallSeen = true; showToast('Olha pra cima! Sai de baixo!', '#ffc64d'); }
  }
  o.m.position.set(o.x, 10 * (1 - k * k), o.z);
  o.m.rotation.x = f.rx * (1 - k);
  o.m.rotation.z = f.rz * (1 - k);
  ringMark.position.set(o.x, 0.07, o.z);
  ringMark.material.opacity = f.locked ? 0.6 + Math.sin(f.t * 30) * 0.35 : 0.5;
  ringMark.scale.setScalar(f.locked ? 1 - (k - FALL_LOCK) * 0.5 : 1);
  if (Math.random() < dt * 24) burst.emit(o.x + rnd(-0.6, 0.6), o.m.position.y + 0.4, o.z, 1, { speed: 0.5, up: -0.2, color: o.kind === 'rock' ? '#8d8a84' : '#79a83f', size: 0.1, life: 0.7, power: 0.8, grav: 2 });
  if (k < 1) return true;
  o.falling = null;
  o.m.rotation.set(0, 0, 0);
  o.m.position.y = 0;
  game.fall = null;
  ringMark.material.opacity = 0;
  game.shake = Math.max(game.shake, 0.45);
  audio.thud(0.8);
  burst.emit(o.x, 0.2, o.z, 24, { speed: 5, up: 0.8, color: '#a58a6a', size: 0.22, life: 0.7, power: 0.6, grav: 4 });
  // já caiu: o que sobra no chão fica para trás, não bate de novo
  o.dead = true;
  if (Math.abs(game.px - o.x) < 0.85 && game.y < 1.6 && game.inv <= 0 && !game.god) {
    props.launch(o, 1);
    hurt();
  }
  return false;
}

/* ---------- arremesso do monstro: joga pedra, que cai em cima de você ---------- */
function tryThrow() {
  if (birds.active() || game.birdCues.length || game.fall) return false;
  const o = dropHazard('rock');
  if (!o) return false;
  monster.throw();
  audio.boulder();
  return true;
}

/* ---------- virar o celular dentro do tronco ---------- */
const TILT_DEAD = 3, TILT_FULL = 20; // graus
const tilt = { raw: 0, zero: 0, smooth: 0, at: -1e9, hold: 0, listening: false };
function onOrientation(e) {
  if (e.gamma === null || e.beta === null) return;
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const ang = ((angle % 360) + 360) % 360;
  // o eixo "para os lados" depende de como o aparelho está na mão
  tilt.raw = ang === 90 ? e.beta : ang === 270 ? -e.beta : ang === 180 ? -e.gamma : e.gamma;
  tilt.at = performance.now();
}
function listenTilt() {
  if (tilt.listening) return;
  tilt.listening = true;
  window.addEventListener('deviceorientation', onOrientation);
}
/** O iPhone exige pedir licença durante um toque. Se negar, deslizar continua valendo. */
function requestTilt() {
  if (!isTouch || tilt.listening) return;
  const DOE = window.DeviceOrientationEvent;
  if (!DOE) return;
  if (typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then((r) => { if (r === 'granted') listenTilt(); }).catch(() => {});
  } else listenTilt();
}
const tiltLive = () => performance.now() - tilt.at < 1000;
const nearestLane = () => clamp(Math.round(-game.theta / THETA), -1, 1);
/** Devolve de -1 a 1 (positivo = direita), ou null quando quem manda é o dedo. */
function tiltNow(dt) {
  tilt.hold = Math.max(0, tilt.hold - dt);
  if (!tiltLive() || tilt.hold > 0) return null;
  const d = tilt.raw - tilt.zero;
  const v = Math.abs(d) < TILT_DEAD ? 0 : (d - Math.sign(d) * TILT_DEAD) / (TILT_FULL - TILT_DEAD);
  tilt.smooth = damp(tilt.smooth, clamp(v, -1, 1), 16, dt);
  return tilt.smooth;
}

/* ---------- fase extra: tobogã dentro do tronco velho ---------- */
const STAGE = {
  folha: { name: 'Tobogã do Tronco Velho', sub: 'Viagem verde: devagar e cheio de bolota', time: 24, speed: 12.5, mult: 1, fog: '#1d2c12', glow: '#9dff8a', rim: '#d8ffb0', sat: 1.05 },
  cogumelo: { name: 'Tobogã do Tronco Velho', sub: 'Viagem de cogumelo: bolota em dobro', time: 20, speed: 16.5, mult: 2, fog: '#2a0f4a', glow: '#ff6fe0', rim: '#ffd0ff', sat: 1.7 },
};
function spawnBonus(kind, lane = game.lane, z = 12) {
  hideBonus();
  const m = tube.items[kind];
  m.visible = true;
  m.position.set(X(lane), 1.0, z);
  game.bonus = { kind, m, x: X(lane), z };
  return game.bonus;
}
function hideBonus() {
  if (game.bonus) { game.bonus.m.visible = false; game.bonus.m.position.y = -50; }
  game.bonus = null;
}
function updateBonus(dt) {
  const b = game.bonus;
  const t = G.uTime.value;
  if (b) {
    b.z -= game.speed * dt;
    b.m.position.set(b.x, 1.0 + Math.sin(t * 3) * 0.1, b.z);
    b.m.rotation.y = t * 2.2;
    if (Math.random() < dt * 14) burst.emit(b.x, 1, b.z, 1, { speed: 1, up: 1, color: b.kind === 'folha' ? '#6dff8a' : '#ff6fe0', size: 0.11, life: 0.7, power: 2.4, grav: -1 });
    const dx = b.x - game.px, dy = 1.0 - (game.y + 0.6);
    if (dx * dx + dy * dy * 0.5 + b.z * b.z < 1.3) {
      const kind = b.kind;
      burst.emit(b.x, 1, b.z, 40, { speed: 6, up: 0.9, color: kind === 'folha' ? '#6dff8a' : '#ff6fe0', size: 0.14, life: 0.9, power: 3, grav: 1 });
      hideBonus();
      openPortal(kind);
    } else if (b.z < -6) hideBonus();
  }
  // a boca do tronco vem pela estrada
  if (game.portalKind) {
    game.portalZ -= game.speed * dt;
    tube.portal.position.set(0, 3.1, game.portalZ + 8);
    if (game.portalZ < 0.6 && !game.tubePending) {
      game.tubePending = true;
      audio.portal();
      gsap.killTweensOf('#fade');
      gsap.to('#fade', { opacity: 1, duration: 0.14, onComplete: () => { enterTube(game.portalKind); gsap.to('#fade', { opacity: 0, duration: 0.5 }); } });
    }
  }
}
function openPortal(kind) {
  audio.pickup();
  buzz(35);
  game.portalKind = kind;
  // limpa a estrada até a boca do tronco, sem pedra nem pássaro no caminho
  game.portalZ = Math.max(26, game.speed * 2.5);
  for (let i = props.live.length - 1; i >= 0; i--) { const o = props.live[i]; if (o.z > -2) props.remove(i); }
  birds.hideAll();
  game.birdCues = [];
  ringMark.material.opacity = 0; game.fall = null;
  game.nextRow = 400; // nada novo nasce antes de entrar
  game.birdCool = 999;
  game.evtT = 999;
  tube.setMood(kind);
  tube.portal.visible = true;
  tube.portal.position.set(0, 3.1, game.portalZ + 8);
  showToast('Olha o tronco velho!', kind === 'folha' ? '#8dff9a' : '#ff9df0');
}
function enterTube(kind) {
  const S = STAGE[kind];
  game.tubePending = false;
  game.portalKind = null;
  tube.portal.visible = false;
  game.state = 'tube';
  game.tubeKind = kind;
  game.tubeT = 0;
  game.tubeTotal = S.time;
  game.tubeSpeed = S.speed;
  game.tubeRow = 26;
  game.theta = -game.lane * THETA;
  game.px = 0; game.mx = 0;
  game.y = 0; game.vy = 0; game.grounded = true; game.sliding = 0;
  game.tubeAcorns = 0;
  game.tubeEnding = false;
  game.camT = 1;
  game.fxT = 0;
  props.clear();
  tube.clear();
  tube.setMood(kind);
  forestGroup.visible = false;
  tube.setVisible(true);
  tube.sled.visible = true;
  G.uFog.value.set(S.fog); G.uFogGlow.value.set(S.glow); G.uRimCol.value.set(S.rim);
  G.uTint.value.set('#ffffff');
  G.uFogDen.value = 0.024;
  hemi.intensity = 1.5; hemi.color.set(kind === 'folha' ? '#f2e2b8' : '#ffe6ff'); hemi.groundColor.set(kind === 'folha' ? '#a98a55' : '#a87ad0');
  sun.intensity = 0;
  post.grade.uniforms.get('uSat').value = S.sat;
  monster.group.position.set(0, -60, -20);
  ui.flash.hidden = true;
  ui.gapBox.classList.remove('alarm');
  ui.gapBox.classList.add('stage');
  ui.gapBox.classList.toggle('trip', kind === 'cogumelo');
  audio.stage = kind;
  tilt.zero = tilt.raw;
  tilt.smooth = 0;
  tilt.hold = 0;
  const hint = tiltLive() ? 'Vire o celular para os lados' : isTouch ? 'Deslize para os lados' : 'Setas para os lados';
  showToast(`${S.name}: ${hint}`, kind === 'folha' ? '#8dff9a' : '#ff9df0');
}
function leaveTubeWorld() {
  if (!forestGroup) return;
  forestGroup.visible = true;
  tube.clear();
  tube.setVisible(false);
  tube.sled.visible = false;
  tube.portal.visible = false;
  game.portalKind = null; game.tubePending = false; game.tubeKind = null;
  game.camT = 0;
  camera.up.set(0, 1, 0);
  gnome.group.rotation.z = 0;
  post.grade.uniforms.get('uSat').value = 1.1;
  ui.gapBox.classList.remove('stage', 'trip');
  audio.stage = null;
}
function exitTube() {
  if (game.tubeEnding) return;
  game.tubeEnding = true;
  gsap.killTweensOf('#fade');
  gsap.to('#fade', { opacity: 1, duration: 0.3, onComplete: () => {
    const got = game.tubeAcorns;
    leaveTubeWorld();
    props.clear();
    game.state = 'run';
    game.px = X(game.lane); game.mx = game.px;
    game.y = 0; game.vy = 0; game.grounded = true;
    game.gap = Math.max(game.gap, 90); // o monstro ficou para trás
    game.inv = 1.6;
    game.nextRow = 22;
    game.birdCool = 7; game.evtT = 8; game.fallT = 5;
    ui.flash.hidden = false;
    gsap.to('#fade', { opacity: 0, duration: 0.6 });
    showToast(`+${got} bolotas! O Cramunhão ficou para trás`, '#ffc64d');
  } });
}
function tubeAcorn(theta, z, h = 0.5) {
  Tube.at(theta, h, tmp);
  props.addAcorn(tmp.x, tmp.y, z);
}
function spawnTubeRow(z) {
  const L = [-1, 0, 1].sort(() => Math.random() - 0.5);
  const th = (l) => -l * THETA;
  const r = Math.random();
  // só nós de desviar. Dois de uma vez, só na viagem de cogumelo, e raramente
  if (r < 0.62) {
    tube.add('knot', th(L[0]), z);
    for (let i = 0; i < 6; i++) tubeAcorn(th(L[1]), z - 7 + i * 1.6);
    return 0;
  }
  if (r < 0.72 && game.tubeKind === 'cogumelo') {
    tube.add('knot', th(L[0]), z);
    tube.add('knot', th(L[1]), z);
    for (let i = 0; i < 6; i++) tubeAcorn(th(L[2]), z - 7 + i * 1.6);
    return 0;
  }
  // respiro: espiral de bolotas para balançar de um lado ao outro do tubo
  for (let i = 0; i < 16; i++) tubeAcorn(Math.sin(i * 0.42) * THETA, z + i * 1.4);
  return 12;
}
const TUBE_HIT_COST = 6;
function updateTube(dt) {
  const S = STAGE[game.tubeKind];
  game.tubeT += dt;
  game.runTime += dt;
  const left = game.tubeTotal - game.tubeT;
  game.speed = damp(game.speed, game.tubeSpeed, 2, dt);
  tube.U.uTubeZ.value += game.speed * dt;

  // lateral: desliza pela parede curva
  const prev = game.theta;
  const tn = tiltNow(dt);
  if (tn !== null) {
    game.theta = damp(game.theta, -tn * THETA * 1.2, 8, dt);
    game.lane = nearestLane();
  } else game.theta = damp(game.theta, -game.lane * THETA, 9, dt);
  game.vx = ((game.theta - prev) * TUBE_R) / Math.max(dt, 1e-3);

  game.inv -= dt;

  // obstáculos
  if (left > 3.2) {
    game.tubeRow -= game.speed * dt;
    while (game.tubeRow < 90) {
      const span = spawnTubeRow(game.tubeRow);
      game.tubeRow += Math.max(15, game.tubeSpeed * 1.4) + span + rnd(0, 3);
    }
  }
  for (let i = tube.live.length - 1; i >= 0; i--) {
    const o = tube.live[i];
    o.z -= game.speed * dt;
    if (o.vy) {
      o.vy -= 22 * dt;
      o.m.position.y += o.vy * dt;
      o.m.rotation.x += dt * 7;
    }
    o.m.position.z = o.z;
    if (o.z < -24) { tube.remove(i); continue; }
    if (o.dead || Math.abs(o.z) > 0.55 || Math.abs(o.theta - game.theta) > 0.27) continue;
    if (game.inv <= 0 && !game.god) {
      // aqui não há morte: só o tombo, a pancada e a velocidade que cai
      game.inv = 0.9;
      game.speed *= 0.72;
      // aqui se vem colher: bater derruba bolotas, senão desviar não valeria nada
      const lost = Math.min(TUBE_HIT_COST * S.mult, game.tubeAcorns);
      if (lost > 0) {
        game.tubeAcorns -= lost;
        game.acorns -= lost;
        ui.acorns.textContent = game.acorns;
        showToast(`-${lost} bolotas`, '#ff8a7a');
        Tube.at(game.theta, 0.6, tmp);
        burst.emit(tmp.x, tmp.y, 0.2, 18, { speed: 5, up: 1, color: '#ffd76b', size: 0.13, life: 0.7, power: 2.6, grav: 8 });
      }
      game.shake = 0.65;
      game.hitFx = 0.8;
      game.combo = 0;
      gnome.stumble();
      audio.hit();
      buzz([30, 30, 50]);
      o.dead = true; o.vy = 7;
      burst.emit(o.m.position.x, o.m.position.y + 0.5, o.z, 20, { speed: 5, up: 1, color: '#a98d68', size: 0.18, life: 0.7, power: 0.9, grav: 7 });
    }
  }

  // bolotas
  Tube.at(game.theta, game.y + 0.6, tmp);
  const gx = tmp.x, gy = tmp.y;
  props.updateAcorns(dt, game.speed, G.uTime.value);
  const list = props.acornList;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    const dx = a.x - gx, dy = a.y - gy, dz = a.z;
    if (Math.abs(dz) < 3 && dx * dx + dy * dy < 2.2) { a.x -= dx * dt * 12; a.y -= dy * dt * 12; }
    if (dx * dx + dy * dy * 0.8 + dz * dz < 0.7) {
      list.splice(i, 1);
      game.acorns += S.mult;
      game.tubeAcorns += S.mult;
      game.combo++;
      audio.coin(game.combo);
      burst.emit(a.x, a.y, a.z, 6, { speed: 2.4, up: 1, color: game.tubeKind === 'folha' ? '#b6ff8a' : '#ffd76b', size: 0.09, life: 0.45, power: 3, grav: 2 });
      ui.acorns.textContent = game.acorns;
    }
  }

  // atmosfera de cada viagem
  const t = G.uTime.value;
  game.fxT -= dt;
  if (game.fxT <= 0) {
    if (game.tubeKind === 'folha') {
      // fumaça verde preguiçosa
      game.fxT = 0.09;
      const a = (Math.random() - 0.5) * 1.5;
      Tube.at(a, 0.4 + Math.random() * 2.4, tmp);
      burst.emit(tmp.x, tmp.y, 16 + Math.random() * 18, 1, { speed: 0.5, up: 0.4, color: '#7dff9a', size: 1.5, life: 2.1, power: 0.16, grav: -0.2, drag: 1 });
    } else {
      game.fxT = 0.03;
      const a = Math.random() * 6.283;
      Tube.at(a, 0.3, tmp);
      _ca.setHSL((t * 0.4 + Math.random() * 0.3) % 1, 1, 0.6);
      burst.emit(tmp.x, tmp.y, 24, 1, { speed: 0.2, up: 0.1, color: `#${_ca.getHexString()}`, size: 0.13, life: 1.2, power: 2.4, grav: 0, drag: 0 });
    }
  }
  if (game.tubeKind === 'cogumelo') {
    G.uFog.value.setHSL((t * 0.09) % 1, 0.75, 0.13);
    G.uFogGlow.value.setHSL((t * 0.09 + 0.35) % 1, 0.9, 0.55);
    G.uRimCol.value.setHSL((t * 0.09 + 0.6) % 1, 0.9, 0.75);
  }
  // a luz no fim do tronco
  const end = clamp(1 - left / 2.6);
  if (end > 0) {
    G.uFog.value.lerp(_white, end * end);
    G.uFogDen.value = 0.024 + end * 0.03;
  }
  ui.gap.style.width = `${clamp(left / game.tubeTotal) * 100}%`;
  if (left <= 0) exitTube();
}
const _white = new THREE.Color(2.6, 2.5, 2.1);

/* ---------- pássaros ---------- */
function featherBurst(b) {
  if (b.kind === 'tatu') {
    burst.emit(b.x, 0.4, b.z, 22, { speed: 5, up: 1, color: '#a9743c', size: 0.2, life: 0.8, power: 1, grav: 8 });
    return;
  }
  burst.emit(b.x, b.y + 0.1, b.z, 20, { speed: 5, up: 0.9, color: '#c77be0', size: 0.15, life: 0.9, power: 1.3, grav: 1.6, drag: 3 });
  burst.emit(b.x, b.y + 0.1, b.z, 10, { speed: 4, up: 0.9, color: '#21d6b0', size: 0.12, life: 0.8, power: 1.5, grav: 1.6, drag: 3 });
}
const randomFlyer = () => (Math.random() < 0.5 ? 'bird' : 'tatu');
function launchOne(kind, x, T, lane) {
  const b = birds.launch(x, kind === 'tatu' ? 46 : 62, T, game.speed, lane, kind);
  // o tatu sai cavando: terra voando no ponto onde aparece
  if (b && kind === 'tatu') burst.emit(x, 0.15, b.z, 26, { speed: 5, up: 1.1, color: '#8a6a44', size: 0.34, life: 0.8, power: 0.75, grav: 7 });
  return b;
}
function launchFlock(T, kind = 'bird') {
  const diff = clamp(game.dist / 1100);
  const t = T ?? lerp(2.1, 1.6, diff);
  const aim = launchOne(kind ?? randomFlyer(), game.px, t, game.lane);
  if (aim) aim.role = 'aim';
  // mais adiante vem um segundo: fecha mais uma pista, mas sempre sobra uma ao lado
  if (diff > 0.4) {
    const wing = launchOne(kind ?? randomFlyer(), -game.px, t, 0);
    if (wing) wing.role = 'wing';
  }
}
function updateBirds(dt) {
  const diff = clamp(game.dist / 1600);
  game.birdCool -= dt;
  for (let i = game.birdCues.length - 1; i >= 0; i--) {
    const c = game.birdCues[i];
    c.z -= game.speed * dt;
    const T = lerp(2.1, 1.6, diff);
    if (c.z <= game.speed * T) { launchFlock(T, null); game.birdCues.splice(i, 1); }
  }
  birds.tex.offset.y += dt * 3.2;
  const pulse = 0.55 + Math.sin(G.uTime.value * 20) * 0.35;
  const aimLane = () => birds.list.find((x) => x.on && x.role === 'aim')?.lane ?? game.lane;
  for (const b of birds.list) {
    if (!b.on) continue;
    b.t += dt;
    b.z -= b.closing * dt;
    if (!b.locked) {
      // persegue a posição do jogador até travar
      const tx = b.role === 'aim' ? game.px : -game.px;
      b.x = damp(b.x, tx, 3.4, dt) ;
      if (b.t / b.T >= 0.54) {
        b.locked = true;
        if (b.role === 'aim') {
          b.lane = game.lane;
          audio.screech();
          buzz(22);
          if (b.kind === 'tatu' && !game.tatuSeen) { game.tatuSeen = true; showToast('Tatu! Desvia ou pula!', '#ffb45e'); }
          if (b.kind === 'bird' && !game.birdSeen) { game.birdSeen = true; showToast('Pássaro! Sai da frente!', '#ff8ad8'); }
        } else {
          const lane = aimLane();
          b.lane = lane === 0 ? (Math.random() < 0.5 ? -1 : 1) : -lane;
        }
      }
    } else {
      b.x = damp(b.x, X(b.lane), 10, dt);
    }
    // aviso correndo pela pista
    const len = clamp(b.z, 0.6, 34);
    b.strip.position.set(b.locked ? X(b.lane) : b.x, 0.06, len / 2);
    b.strip.scale.z = len / 34;
    b.strip.material.opacity = b.locked && !b.passed ? pulse : 0;

    // cruzamento com o gnomo
    // o pássaro vem na altura da cabeça; por cima do tatu dá para pular
    if (!b.passed && Math.abs(b.z) < 0.7 && Math.abs(game.px - b.x) < 0.68 && game.y < (b.kind === 'tatu' ? 0.62 : 1.95)) {
      if (game.inv <= 0 && !game.god) {
        featherBurst(b);
        audio.squawk();
        birds.remove(b);
        hurt();
        if (game.state !== 'run') return;
        continue;
      }
    }
    if (!b.passed && b.z < -0.7) {
      b.passed = true;
      audio.whoosh();
      burst.emit(b.x, b.y, b.z, 6, { speed: 2.5, up: 0.5, color: '#c77be0', size: 0.11, life: 0.6, power: 1.1, grav: 1.5 });
    }
    // passou: arremete por cima da câmera
    if (b.kind === 'tatu') {
      // emerge da terra, corre levantando poeira e, depois de passar, cava de volta
      const up = clamp(b.t / 0.4);
      const down = b.passed ? clamp((-b.z - 1.5) / 3) : 0;
      b.group.position.set(b.x, (up - 1) * 1.1 - down * 1.1, b.z);
      if (Math.random() < dt * 20) burst.emit(b.x, 0.1, b.z - 0.5, 1, { speed: 1, up: 0.5, color: '#a58a6a', size: 0.17, life: 0.5, power: 0.5, grav: 1.5, zv: game.speed * 0.4 });
    } else {
      if (b.passed) b.y += dt * (6 + (-b.z) * 0.7);
      const wob = b.locked ? 0 : Math.sin(b.t * 5 + b.wob) * 0.22;
      b.group.position.set(b.x, b.y - 0.19 + wob, b.z);
      b.group.rotation.z = (b.x - (b.px ?? b.x)) * -2.2;
    }
    b.px = b.x;
    birds.animate(b, dt);
    if (b.z < -18) birds.remove(b);
  }
}

/* ---------- loop de jogo ---------- */
function monsterDist() { return lerp(1.75, 8.95, clamp(game.gap / 100)); }

function updateRun(dt) {
  game.runTime += dt;
  // velocidade cresce e tende a um teto; tropeçar derruba e recupera
  game.targetSpeed = speedCurve(game.dist);
  game.speed = damp(game.speed, game.targetSpeed, 1.4, dt);
  game.dist += game.speed * dt * 0.62;
  ui.dist.textContent = Math.floor(game.dist);

  // movimentação lateral
  const tx = X(game.lane);
  const prevX = game.px;
  game.px = damp(game.px, tx, 13, dt);
  game.vx = (game.px - prevX) / Math.max(dt, 1e-3);

  // salto com gravidade assimétrica: sobe rápido, cai pesado
  if (!game.grounded) {
    game.vy -= (game.vy > 0 ? G_UP : G_DOWN) * dt;
    game.y += game.vy * dt;
    if (game.y <= 0) {
      const v = -game.vy;
      game.y = 0; game.vy = 0; game.grounded = true;
      gnome.land(clamp(v / 10, 0.4, 1.3));
      audio.land();
      burst.emit(game.px, 0.08, 0, 10, { speed: 2.5, up: 0.6, color: '#b19472', size: 0.15, life: 0.5, power: 0.6, grav: 2 });
      if (game.bufferJump > 0) doJump();
      else if (game.slideAfter) { game.slideAfter = false; doSlide(); }
    }
  }
  game.bufferJump -= dt;
  if (game.sliding > 0) {
    game.sliding -= dt;
    game.slideFx -= dt;
    if (game.slideFx <= 0) {
      game.slideFx = 0.035;
      burst.emit(game.px, 0.07, 0.18, 2, { speed: 1.9, up: 0.5, color: '#ffb36b', size: 0.06, life: 0.35, power: 2.4, grav: 6 });
    }
  }
  game.inv -= dt;
  game.bumpT = (game.bumpT || 0) - dt;

  // o monstro: a fuga limpa abre vantagem, mas a fera nunca desiste
  const diff = clamp(game.dist / 1600);
  // a vida volta aos poucos; ao passar da linha, o monstro já ficou para trás
  const lifeBefore = game.gap;
  game.gap = Math.min(100, game.gap + LIFE_REGEN * dt);
  if (lifeBefore <= LIFE_SAFE && game.gap > LIFE_SAFE) showToast('Ufa! Ele ficou para trás', '#8fdc6a');
  game.stun = Math.max(0, game.stun - dt);
  game.lunge = Math.max(0, game.lunge - dt * 1.6);
  game.mx = damp(game.mx, game.px, game.gap <= LIFE_SAFE ? 3.8 : 2.4, dt);
  // eventos
  game.evtT -= dt;
  if (game.evtT <= 0 && game.stun <= 0) {
    if (game.dist > 120 && Math.random() < 0.55 + diff * 0.2 && tryThrow()) game.evtT = rnd(6, 10) - diff * 2.5;
    else {
      game.roar = 0.75; audio.roar(game.gap <= LIFE_SAFE ? 0.7 : 0.35);
      game.shake = game.gap <= LIFE_SAFE ? 0.5 : 0.15;
      setTimeout(() => { game.roar = 0; }, 900);
      game.evtT = rnd(7, 11);
    }
  }
  // olhada para trás quando a fera está em cima
  game.lookT -= dt;
  if (game.lookT < 0) { game.look = game.gap <= LIFE_SAFE ? 1 : 0; game.lookT = game.look ? 0.5 : rnd(2, 4); game.lookSide = Math.random() < 0.5 ? 1 : -1; }

  updateTrack(dt);
  if (game.state === 'run') updateBirds(dt);
  game.fallT -= dt;
  // nextRow enorme significa pista parada (entrada do tronco ou teste): nada cai
  if (game.state === 'run' && game.fallT <= 0 && game.nextRow < 300) {
    const fell = !birds.active() && !game.birdCues.length && dropHazard(Math.random() < 0.72 ? 'log' : 'rock');
    // sem brecha agora, tenta de novo logo em seguida
    game.fallT = fell ? rnd(3, 6) - clamp(game.dist / 1100) * 1.5 : 0.5;
  }
  if (game.state === 'run') updateBonus(dt);

  // o mundo faz curvas e morros (só o shader, a pista segue reta)
  game.bendT -= dt;
  if (game.bendT <= 0) {
    game.bendT = rnd(3.5, 7);
    const s = 0.35 + diff * 0.65;
    game.bendTX = (Math.random() - 0.5) * 0.0042 * s;
    game.bendTY = -0.0008 + (Math.random() - 0.4) * 0.0024 * s;
  }
  updateAtmos();

  // HUD
  const pct = clamp(game.gap, 0, 100);
  ui.gap.style.width = `${pct}%`;
  ui.gapBox.classList.toggle('alarm', game.gap <= LIFE_SAFE);
  ui.ring.style.strokeDashoffset = 283 * (1 - game.charge);
  ui.flash.classList.toggle('ready', game.charge >= 1);
}

function updateCamera(dt) {
  const portrait = camera.aspect < 0.9;
  const near = clamp(1 - (monsterDist() - 2.2) / 6);
  game.fearCam = damp(game.fearCam, near, 2.5, dt);
  const f = game.fearCam;
  // Chase: atrás e acima. O celular em pé recua para enquadrar as três pistas.
  const cz = portrait ? -9.6 : -9.4, cy = portrait ? 5.4 : 4.6, fov = portrait ? 50 : 38;
  const cx = game.px * (portrait ? 0.72 : 0.55);
  const chasePos = _v1.set(cx, cy + f * 0.5 + game.y * 0.15, cz - f * 0.4);
  const chaseLook = _v2.set(game.px * (portrait ? 0.6 : 0.42), 0.72 + game.y * 0.25, 5);

  // Título: de frente para o gnomo, monstro à espreita ao fundo
  const t = G.uTime.value;
  const portraitBack = portrait ? 2.2 : 0;
  const titlePos = _v3.set(portrait ? 0.0 : 1.1 + Math.sin(t * 0.16) * 0.2, 0.95 + Math.sin(t * 0.21) * 0.05, 3.3 + portraitBack);
  const titleLook = _v4.set(portrait ? 0 : -0.2, portrait ? 1.15 : 1.0, -1.5);

  const e = game.camK;
  camera.position.lerpVectors(titlePos, chasePos, e);
  // o arco passa por cima do gnomo em vez de atravessá-lo
  camera.position.y += Math.sin(e * Math.PI) * 2.4;
  camera.position.x += Math.sin(e * Math.PI) * 2.6;
  _look.lerpVectors(titleLook, chaseLook, e);
  let tf = lerp(portrait ? 58 : 40, fov, e) + game.speed * 0.2 * e;

  // Loja: perto do gnomo, deixando espaço para o painel
  if (game.camS > 0.001) {
    const s = game.camS;
    camera.position.lerp(_v5.set(0, portrait ? 1.05 : 0.95, portrait ? 3.7 : 2.5), s);
    _look.lerp(_v6.set(portrait ? 0 : 0.42, portrait ? 0.05 : 0.72, 0), s);
    tf = lerp(tf, portrait ? 44 : 38, s);
  }

  // Tobogã: por dentro do tubo, girando junto com a parede
  camera.up.set(0, 1, 0);
  if (game.camT > 0.001) {
    const th = game.theta || 0;
    const cth = th * 0.72;
    const rr = portrait ? 1.65 : 2.05;
    camera.position.set(Math.sin(cth) * rr, TUBE_R - Math.cos(cth) * rr, portrait ? -4.9 : -3.7);
    _look.set(Math.sin(th) * (TUBE_R - 1.5), TUBE_R - Math.cos(th) * (TUBE_R - 1.5), 7);
    camera.up.set(-Math.sin(cth), Math.cos(cth), 0);
    const trip = game.tubeKind === 'cogumelo' ? Math.sin(t * 2.3) * 5 : 0;
    tf = (portrait ? 62 : 52) + game.speed * 0.45 + trip;
  }

  // Morte: gira para frente e encara o bote de baixo
  if (game.camD > 0.001) {
    const d = game.camD;
    const mx = game.px;
    const deathP = _v5.set(mx + (portrait ? 1.2 : 2.3), 1.0, portrait ? 6.6 : 4.8);
    const deathL = _v6.set(mx, 1.6, -1);
    if (game.hat) { deathP.set(game.px + (portrait ? 0.7 : 0.4), portrait ? 1.0 : 0.6, 5.2 + (portrait ? 2.4 : 0)); deathL.set(portrait ? game.px : game.px - 1.3, portrait ? -0.45 : 1.2, 0); }
    camera.position.lerp(deathP, d * d * (3 - 2 * d));
    camera.position.y += Math.sin(d * Math.PI) * 1.2;
    _look.lerp(deathL, d);
    tf = lerp(tf, portrait ? 62 : 46, d);
  }

  // tremor com ruído suave
  game.shake = Math.max(0, game.shake - dt * 1.9);
  const sh = game.shake * game.shake;
  if (sh > 0.0001) {
    camera.position.x += Math.sin(t * 61) * sh * 0.33;
    camera.position.y += Math.sin(t * 73 + 1.7) * sh * 0.28;
  }
  camera.lookAt(_look);
  if (sh > 0.0001) camera.rotation.z += Math.sin(t * 47) * sh * 0.018;
  if (Math.abs(camera.fov - tf) > 0.03) { camera.fov = tf; camera.updateProjectionMatrix(); }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3(), _look = new THREE.Vector3();

let last = performance.now();
let frameN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (game.state === 'load') return;
  post.measure(raw, game.state === 'run');
  if (game.state === 'pause') return;
  const dt = Math.min(raw, 1 / 20) * game.timeScale;
  G.uTime.value += dt;
  const running = game.state === 'run';

  if (running) updateRun(dt);
  else if (game.state === 'tube') updateTube(dt);
  else if (game.state === 'caught' || game.state === 'over') {
    // o mundo desacelera; obstáculos seguem até parar
    props.updateAcorns(dt, game.speed, G.uTime.value);
    for (const o of props.live) { o.z -= game.speed * dt; o.m.position.z = o.z; }
  } else if (game.state === 'intro') {
    game.speed = damp(game.speed, game.camK * 7, 2, dt);
  } else if (game.state === 'title' || game.state === 'shop') {
    props.updateAcorns(dt, 0, G.uTime.value);
  }
  burst.update(dt, game.speed);

  // rolagem do mundo
  game.scroll = ((game.scroll || 0) + game.speed * dt);
  const sc = game.scroll % 192;
  G.uScroll.value = sc;
  ground.mesh.position.z = -(game.scroll % ground.dz);

  if (game.state === 'tube') {
    // o tobogã serpenteia, e o cogumelo entorta bem mais
    const k = game.tubeKind === 'cogumelo' ? 1.5 : 1;
    const tt = game.tubeT;
    game.bendTX = Math.sin(tt * 0.62) * 0.0052 * k;
    game.bendTY = (Math.sin(tt * 0.41 + 1.3) * 0.0034 - 0.0016) * k;
    game.bendX = damp(game.bendX, game.bendTX, 1.6, dt);
    game.bendY = damp(game.bendY, game.bendTY, 1.6, dt);
  } else {
    game.bendX = damp(game.bendX, running ? game.bendTX : 0, 0.65, dt);
    game.bendY = damp(game.bendY, running ? game.bendTY : -0.0002, 0.65, dt);
  }
  G.uBend.value.set(game.bendX, game.bendY);

  /* gnomo */
  const fear = clamp((LIFE_SAFE - game.gap) / 30);
  let gState = 'idle';
  if (game.state === 'intro') gState = game.scared ? 'scared' : 'run';
  else if (running) gState = !game.grounded ? 'jump' : game.sliding > 0 ? 'slide' : 'run';
  else if (game.state === 'tube') gState = 'slide';
  else if (game.state === 'caught') gState = game.grabbed || game.gnomeLift > 0 ? 'caught' : 'scared';
  gnome.group.position.set(game.px, game.y, 0);
  if (game.state === 'shop') gnome.group.rotation.y += dt * 0.85;
  else gnome.group.rotation.y = damp(gnome.group.rotation.y, clamp(-(game.vx || 0) * 0.055, -0.5, 0.5), 11, dt);
  gnome.update(dt, {
    state: gState, speed: game.speed, vy: game.vy, vx: game.vx || 0, fear, look: running ? game.look : 0,
    lookSide: game.lookSide, lanternPower: 3.2 + game.flashFx * 10,
  });
  // piscar enquanto invulnerável
  gnome.setBlink(!(game.inv > 0 && running) || Math.sin(G.uTime.value * 34) > -0.35);
  wardrobe.update(dt, game.state === 'tube' ? 0.95 : gnome.w.run * clamp(game.speed / 14), game.vy);
  if (wardrobe.trail && (running || game.state === 'tube')) {
    game.trailT = (game.trailT || 0) - dt;
    if (game.trailT <= 0) {
      game.trailT = 0.035;
      const gp = gnome.group.position;
      _ca.setHSL(0.13 + Math.random() * 0.05, 1, 0.68);
      burst.emit(gp.x + (Math.random() - 0.5) * 0.3, gp.y + 0.45 + Math.random() * 0.4, -0.2, 1, { speed: 0.5, up: 0.5, color: `#${_ca.getHexString()}`, size: 0.11, life: 0.9, power: 2.8, grav: 0.4 });
    }
  }
  if (game.state === 'tube') {
    Tube.at(game.theta, game.y, gnome.group.position);
    gnome.group.rotation.z = game.theta;
  }

  /* monstro */
  const mg = monster.group;
  if (game.state === 'tube') {
    monster.update(dt, { running: 0, speed: 0, lightPower: 0 });
  } else {
  const mScale = game.state === 'caught' || game.state === 'over' ? 0.92 : lerp(1, 0.68, game.camK);
  game.mScale = damp(game.mScale ?? 1, mScale, 5, dt);
  mg.scale.setScalar(game.mScale);
  if (game.state === 'title' || game.state === 'shop') {
    // à espreita no escuro: só os olhos e o contorno
    mg.position.set(Math.sin(G.uTime.value * 0.3) * 0.3, 0, -11.5);
    mg.rotation.y = 0;
    monster.update(dt, { running: 0, speed: 0, roar: 0, lightPower: 3, headYaw: Math.sin(G.uTime.value * 0.5) * 0.35 });
  } else if (game.state === 'intro') {
    mg.position.set(game.mx, 0, lerp(-11, -9.4, game.introMon || 0));
    monster.update(dt, { running: game.camK, speed: 8, roar: game.roar, lightPower: 9 });
  } else if (running) {
    const d = monsterDist();
    mg.position.set(game.mx, 0, -d - 1.4);
    mg.rotation.y = clamp((game.px - game.mx) * 0.2, -0.4, 0.4);
    monster.update(dt, {
      running: 1, speed: game.speed, roar: game.roar, stun: game.stun > 0 ? 1 : 0, lunge: Math.max(game.lunge, game.gap <= 45 ? 0.5 + Math.sin(G.uTime.value * 3) * 0.4 : 0),
      tilt: (game.px - game.mx) * -0.08, headYaw: (game.px - game.mx) * 0.25, lightPower: 6 + fear * 14,
    });
  } else {
    // o bote
    if (game.bite) game.pounce = 0.45;
    mg.position.x = damp(mg.position.x, game.px, 7, dt);
    mg.position.z = damp(mg.position.z, -2.5, 6, dt);
    monster.update(dt, { running: game.state === 'over' ? 0 : 0.3, speed: 4, pounce: game.pounce, bite: game.bite, roar: game.bite ? 0 : 0.2, lightPower: 4 });
    if (game.gnomeLift > 0 && !game.bite) {
      monster.mouthWorld(tmp);
      const l = game.gnomeLift;
      gnome.group.position.set(lerp(game.px, tmp.x, l), lerp(0.2, tmp.y - 0.2, l), lerp(0, tmp.z + 0.1, l));
      gnome.group.rotation.x = -l * 0.7;
    }
    if (game.bite) gnome.group.position.y = -50; // engolido: sai de cena, mas a luz continua existindo
    if (game.hat) {
      const h = game.hat;
      h.t += dt; h.vy -= 3.1 * dt;
      hatMesh.position.y = Math.max(0.05, hatMesh.position.y + h.vy * dt);
      hatMesh.position.x += (Math.sin(h.t * 4.4) * 0.7 + 0.1) * dt;
      hatMesh.position.z = Math.min(hatMesh.position.z + dt * 1.1, 1.0);
      hatMesh.rotation.z = hatMesh.position.y > 0.06 ? Math.sin(h.t * 4.4) * 0.5 : damp(hatMesh.rotation.z, 1.2, 4, dt);
    }
  }

  }

  /* sombra de contato */
  const bs = Math.max(0.35, 1 - game.y * 0.38);
  blob.position.set(game.px, 0.045, 0.02);
  blob.rotation.z = 0;
  if (game.state === 'tube') {
    Tube.at(game.theta, 0.05, blob.position);
    blob.position.z = 0.02;
    blob.rotation.z = game.theta;
  }
  blob.scale.set(0.82 * bs, 1, 1.05 * bs);
  blob.material.opacity = 0.6 * bs;
  blob.visible = !game.bite;

  /* céu e lua */
  moon.position.copy(camera.position).addScaledVector(G.uMoonDir.value, 280);
  moon.lookAt(camera.position);

  updateCamera(dt);

  /* pós */
  game.hitFx = Math.max(0, game.hitFx - dt * 2.6);
  const u = post.grade.uniforms;
  u.get('uDanger').value = running ? clamp((LIFE_SAFE + 2 - game.gap) / 34) * 0.8 : game.state === 'caught' ? 0.9 : 0;
  u.get('uFlashG').value = game.flashFx;
  u.get('uHit').value = game.hitFx * 0.7;
  u.get('uT').value = G.uTime.value;
  audio.setFear(running ? clamp((LIFE_SAFE + 5 - game.gap) / 40) : game.state === 'title' || game.state === 'shop' ? 0.12 : 0.3);

  /* sombra em frames alternados no celular: economia real sem perda visível */
  frameN++;
  if (post.tier.shadowEvery > 1 && frameN % post.tier.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
  post.render(raw);
}
requestAnimationFrame(frame);

window.addEventListener('error', (e) => { const el = $('err'); el.hidden = false; el.textContent = `Falhou: ${e.message}`; });
boot().catch((e) => {
  console.error(e);
  const el = $('err'); el.hidden = false; el.textContent = 'Não consegui ligar o 3D neste aparelho. Atualize o navegador e tente de novo.';
});
void params;
