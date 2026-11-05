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
import { Props, Burst, LANE, makeHatProp } from './art/props.js';

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), pad: $('pad'), flash: $('btnFlash'), title: $('title'), pause: $('pause'), over: $('over'),
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
  boulder: null, bendX: 0, bendY: -0.0004, bendTX: 0, bendTY: -0.0004, bendT: 0, runTime: 0, hat: null, best: store.get('cg-best', 0),
};
let gnome, monster, props, burst, ground, skyU, moon, post, blob, ringMark, hatMesh;
const tmp = new THREE.Vector3();

function setProgress(p, msg) {
  performance.mark(msg);
  ui.lfill.style.width = `${Math.round(p * 100)}%`;
  ui.lmsg.textContent = msg;
  return new Promise((r) => setTimeout(r));
}

async function boot() {
  await setProgress(0.08, 'Plantando a floresta');
  ground = buildGround(scene, q);
  buildForest(scene, q);
  const s = buildSky(scene);
  skyU = s.U;
  moon = new THREE.Mesh(new THREE.CircleGeometry(15, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 3.2, 2.6), transparent: true, depthWrite: false, fog: false }));
  moon.frustumCulled = false;
  moon.renderOrder = -9;
  scene.add(moon);

  await setProgress(0.32, 'Esculpindo o gnomo');
  gnome = await Gnome.create(q);
  scene.add(gnome.group);
  await setProgress(0.55, 'Acordando o Cramunhão');
  monster = await Monster.create(q);
  scene.add(monster.group);

  await setProgress(0.82, 'Espalhando bolotas');
  props = new Props(scene, q);
  burst = new Burst(scene, q);
  burst.points.material.uniforms.uBend = G.uBend;

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

  // pedregulho arremessado usa a geometria do catálogo
  game.bMesh = new THREE.Mesh(props.kinds.rock.geo, props.mat);
  game.bMesh.frustumCulled = false; game.bMesh.castShadow = true; game.bMesh.visible = true;
  game.bMesh.position.y = -50;
  scene.add(game.bMesh);

  hatMesh = new THREE.Mesh(makeHatProp(), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), { rim: 0.8 }));
  hatMesh.frustumCulled = false; hatMesh.castShadow = true; hatMesh.position.y = -50;
  scene.add(hatMesh);

  gnome.onStep = (side) => {
    audio.step_(side);
    if (game.state === 'run' && Math.random() < 0.7) burst.emit(game.px + side * 0.09, 0.06, -0.08, 2, { speed: 1, up: 0.8, color: '#a58a6a', size: 0.09, life: 0.42, grav: 1.5, power: 0.55 });
  };
  monster.onFootfall = (i) => {
    const near = clamp(1 - (monsterDist() - 2.5) / 7);
    if (game.state === 'run' || game.state === 'intro') {
      game.shake = Math.max(game.shake, 0.06 + near * 0.26);
      if (i < 2 || Math.random() < 0.5) audio.thud(0.25 + near * 0.8);
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
  game.bMesh.visible = false;
  hatMesh.visible = false;

  await setProgress(1, 'Pronto');
  setupInput();
  showTitle();
  gsap.to(ui.loader, { opacity: 0, duration: 0.7, onComplete: () => { ui.loader.hidden = true; } });
  window.__g = { game, gnome, monster, props, camera, post, input: act, start: startRun, renderer, X };
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
    const k = e.code;
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Space: 'flash' };
    if (map[k]) { e.preventDefault(); act(map[k]); }
    if (k === 'KeyP' || k === 'Escape') togglePause();
    if (k === 'KeyM') toggleMute();
    if ((k === 'Enter' || k === 'Space') && game.state === 'title') startRun();
    if ((k === 'Enter' || k === 'Space') && game.state === 'over') startRun();
  });

  // botões físicos na tela: respondem no toque (não no soltar) e aceitam dois dedos juntos
  document.querySelectorAll('.pbtn').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      b.classList.add('on');
      buzz(9);
      act(b.dataset.a);
    });
    const off = () => b.classList.remove('on');
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  ui.flash.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    ui.flash.classList.add('on');
    act('flash');
    setTimeout(() => ui.flash.classList.remove('on'), 120);
  });

  // deslizar o dedo em qualquer parte da tela e arrastar com o mouse
  let sx = 0, sy = 0, active = false, moved = false, id = -1;
  const area = $('game');
  area.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    sx = e.clientX; sy = e.clientY; active = true; moved = false; id = e.pointerId;
  });
  area.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== id) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    const th = 26;
    if (Math.abs(dx) > th || Math.abs(dy) > th) {
      if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left');
      else act(dy < 0 ? 'up' : 'down');
      sx = e.clientX; sy = e.clientY; moved = true;
      buzz(7);
    }
  });
  const end = (e) => { if (e.pointerId === id) active = false; };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);
  // evita rolagem e zoom por gesto no iOS
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  $('btnStart').addEventListener('click', startRun);
  $('btnAgain').addEventListener('click', startRun);
  $('btnResume').addEventListener('click', togglePause);
  $('btnPause').addEventListener('click', togglePause);
  $('btnMute').addEventListener('click', toggleMute);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (game.state === 'run') togglePause();
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
  if (game.state === 'run') {
    game.state = 'pause';
    ui.pause.hidden = false; ui.pad.hidden = true; ui.flash.hidden = true;
    audio.suspend();
  } else if (game.state === 'pause') {
    game.state = 'run';
    ui.pause.hidden = true; ui.pad.hidden = !isTouch; ui.flash.hidden = false;
    audio.resume();
  }
}

/* ---------- ações do gnomo ---------- */
function move(d) {
  const nl = clamp(game.lane + d, -1, 1);
  if (nl === game.lane) { gnome.squashV -= 2; return; }
  game.lane = nl;
  audio.whoosh();
}
function doJump() {
  if (game.grounded) {
    game.vy = 8.6; game.grounded = false; game.sliding = 0;
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
  game.gap = Math.min(100, game.gap + 38);
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
  burst.emit(game.px, 0.7, 0, 50, { speed: 11, up: 0.6, color: '#fff0c4', size: 0.14, life: 0.8, power: 4, grav: 1 });
  showToast('Clarão!', '#ffc64d');
  game.timeScale = 0.45;
  gsap.to(game, { timeScale: 1, duration: 0.55, delay: 0.1 });
}
function hitObstacle(o) {
  if (game.inv > 0 || game.god) return;
  game.inv = 1.15;
  game.gap -= 34;
  game.speed *= 0.68;
  game.sliding = 0;
  game.shake = 0.8;
  game.hitFx = 1;
  game.combo = 0;
  gnome.stumble();
  audio.hit();
  buzz([30, 30, 50]);
  props.launch(o, 1);
  burst.emit(o.x, 0.6, o.z, 24, { speed: 6, up: 1, color: '#a98d68', size: 0.2, life: 0.8, power: 0.8, grav: 8 });
  if (game.gap <= 0) caught();
  else { game.lunge = 0.9; audio.roar(0.45); }
}

/* ---------- cinemáticas ---------- */
function showTitle() {
  game.state = 'title';
  ui.title.hidden = false;
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
    dist: 0, speed: 0, acorns: 0, gap: 66, charge: 0, lane: 0, px: 0, y: 0, vy: 0, grounded: true, sliding: 0, inv: 0,
    nextRow: 30, evtT: 8, lookT: 3, look: 0, roar: 0, lunge: 0, stun: 0, pounce: 0, bite: false, boulder: null, combo: 0,
    atmos: -1, camD: 0, runTime: 0, bendTX: 0, bendTY: -0.0004, bendT: 4, slideAfter: false, gnomeLift: 0, hat: null,
  });
  game.bMesh.visible = false;
  hatMesh.visible = false;
  gnome.group.visible = true;
  gnome.group.position.set(0, 0, 0);
  gnome.group.rotation.set(0, 0, 0);
  ringMark.material.opacity = 0;
  ui.dist.textContent = '0'; ui.acorns.textContent = '0';
}

function startRun() {
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
      game.targetSpeed = 9;
      audio.setRunning(true);
      ui.hud.hidden = false; ui.pad.hidden = !isTouch; ui.flash.hidden = false;
      ui.flash.querySelector('kbd').hidden = isTouch;
      showToast(ATMOS[0].name);
      game.atmos = 0;
    }, null, 1.15);
  game.introMon = 0;
}

function caught() {
  if (game.state !== 'run') return;
  game.state = 'caught';
  ui.hud.hidden = true; ui.pad.hidden = true; ui.flash.hidden = true;
  audio.setRunning(false);
  audio.roar(1.1);
  buzz([60, 40, 120]);
  game.pounce = 1;
  game.timeScale = 0.35;
  for (let i = props.live.length - 1; i >= 0; i--) { const o = props.live[i]; if (o.z > -12 && o.z < 16) { burst.emit(o.x, 0.6, o.z, 10, { speed: 5, up: 1, color: '#a98d68', size: 0.2, life: 0.6, power: 0.7, grav: 8 }); props.remove(i); } }
  props.acornList.length = 0;
  game.boulder = null; game.bMesh.visible = false; ringMark.material.opacity = 0;
  gsap.to(game, { camD: 1, duration: 1.1, ease: 'power2.inOut' });
  gsap.to(game, { timeScale: 0.85, duration: 0.8, delay: 0.5 });
  gsap.to(game, { speed: 0, targetSpeed: 0, duration: 1.1 });
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
      gnome.group.visible = false;
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
      $('oBest').textContent = game.best;
      const m = Math.floor(game.dist);
      $('overTitle').textContent = isRecord && m > 50 ? 'Novo recorde!' : 'Nhac.';
      $('overLine').textContent = isRecord && m > 50 ? 'Morreu, mas morreu longe. Sobrou só o chapéu.' : 'Sobrou só o chapéu.';
      ui.over.hidden = false;
      gsap.from('#over > *', { y: 18, opacity: 0, stagger: 0.07, duration: 0.45, ease: 'power2.out' });
      game.state = 'over';
    }, null, 3.0);
  game.gnomeLift = 0;
}

/* ---------- geração da pista ---------- */
const X = (lane) => -lane * LANE; // pista -1 é a esquerda na tela (+x)
const rint = (n) => Math.floor(Math.random() * n);
function acornLine(lane, z, n = 5, step = 1.8, arc = 0) {
  for (let i = 0; i < n; i++) {
    const h = arc ? Math.sin((i / (n - 1)) * Math.PI) * arc : 0;
    props.addAcorn(X(lane), 0.55 + h, z + i * step);
  }
}
function spawnRow(z, diff) {
  const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
  const r = Math.random();
  const hard = diff > 0.3;
  let span = 0;
  if (r < 0.2) {
    props.add('rock', X(lanes[0]), z);
    if (diff > 0.15 && Math.random() < 0.6) props.add(Math.random() < 0.5 ? 'rock' : 'stump', X(lanes[1]), z);
    acornLine(lanes[2], z - 4, 5);
  } else if (r < 0.37) {
    props.add('logWide', 0, z);
    acornLine(lanes[0], z - 2.4, 5, 1.2, 1.15);
  } else if (r < 0.53) {
    props.add('arch', 0, z);
    acornLine(lanes[0], z - 3, 4, 2);
  } else if (r < 0.67) {
    const free = lanes[0];
    const c = free === 0 ? [-1, 1] : [free === 1 ? -0.5 : 0.5];
    if (free === 0) { props.add('rock', X(-1), z); props.add('rock', X(1), z); } else props.add('bramble', X(c[0]), z);
    acornLine(free, z - 5, 6);
  } else if (r < 0.82) {
    props.add('log', X(lanes[0]), z);
    props.add('stump', X(lanes[1]), z);
    if (hard) props.add('stump', X(lanes[2]), z);
    else acornLine(lanes[2], z - 3, 4);
  } else if (r < 0.9) {
    props.add('spring', X(lanes[0]), z);
    acornLine(lanes[0], z + 2.5, 9, 1.75, 3.6);
    if (hard) props.add('rock', X(lanes[1]), z);
    span = 9;
  } else {
    // respiro: curva de bolotas trocando de pista
    const a = lanes[0], b = lanes[1];
    acornLine(a, z, 4); acornLine(b, z + 10, 4);
    span = 6;
  }
  return span;
}

function updateTrack(dt) {
  const diff = clamp(game.dist / 1600);
  game.nextRow -= game.speed * dt;
  while (game.nextRow < 118) {
    const span = spawnRow(game.nextRow, diff);
    const gap = Math.max(10, game.targetSpeed * (1.34 - diff * 0.42));
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
    if (o.z < -0.7 && (o.type === 'slide' || o.type === 'block')) o.m.scale.y = Math.max(0.02, 1 + (o.z + 0.7) / 1.8);
    if (o.dead) continue;

    // o monstro atravessa o que sobrou para trás
    const mz = -monsterDist();
    if (o.z < mz - 0.4 && Math.abs(o.x - game.mx) < 2.6 && mz > -8.5) {
      props.launch(o, -1);
      burst.emit(o.x, 0.6, o.z, 16, { speed: 5, up: 1, color: '#9c8466', size: 0.26, life: 0.7, power: 0.6, grav: 7 });
      game.shake = Math.max(game.shake, 0.35);
      audio.thud(0.6);
      continue;
    }
    if (Math.abs(o.z - pz) > o.hz + 0.26) continue;
    if (Math.abs(game.px - o.x) > o.hw + 0.22) continue;
    if (o.type === 'jump') { if (h < o.h - 0.1) hitObstacle(o); }
    else if (o.type === 'slide') { if (game.sliding <= 0) hitObstacle(o); }
    else if (o.type === 'block') { hitObstacle(o); }
    else if (o.type === 'spring' && h < 0.5 && game.vy <= 0) {
      game.vy = 14.2; game.grounded = false; game.sliding = 0;
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
      game.charge = Math.min(1, game.charge + 1 / 22);
      audio.coin(game.combo);
      burst.emit(a.x, a.y, a.z, 6, { speed: 2.4, up: 1, color: '#ffd76b', size: 0.09, life: 0.45, power: 3, grav: 2 });
      ui.acorns.textContent = game.acorns;
      if (game.charge >= 1 && !ui.flash.classList.contains('ready')) { showToast('Clarão pronto!', '#ffc64d'); buzz(25); }
    }
  }
}

/* ---------- arremesso de pedregulho ---------- */
function tryThrow() {
  const lane = [-1, 0, 1][rint(3)];
  const T = 1.25;
  const landZ = Math.max(13, game.speed * 1.15);
  const zAtSpawn = landZ + game.speed * T;
  // nunca jogar onde já criaria um beco sem saída
  for (const o of props.live) {
    const zl = o.z - game.speed * T;
    if (Math.abs(zl - landZ) < 7) return false;
  }
  monster.throw();
  audio.boulder();
  setTimeout(() => audio.thud(0.2), 200);
  game.boulder = { lane, x: X(lane), t: 0, T, z: zAtSpawn };
  game.bMesh.visible = true;
  return true;
}
function updateBoulder(dt) {
  const b = game.boulder;
  if (!b) return;
  b.t += dt;
  b.z -= game.speed * dt;
  const k = clamp(b.t / b.T);
  const y0 = 7;
  const y = lerp(y0, 0, k) + Math.sin(k * Math.PI) * 9;
  const z = lerp(-7, b.z, k);
  const x = lerp(game.mx, b.x, k);
  game.bMesh.position.set(x, y, z);
  game.bMesh.rotation.x += dt * 7;
  game.bMesh.rotation.z += dt * 4;
  ringMark.position.set(b.x, 0.07, b.z);
  ringMark.material.opacity = 0.45 + Math.sin(b.t * 22) * 0.35;
  ringMark.scale.setScalar(1.25 - k * 0.3);
  if (k >= 1) {
    game.bMesh.visible = false;
    ringMark.material.opacity = 0;
    const o = props.add('rock', b.x, b.z);
    o.m.rotation.y = Math.random() * 6;
    game.shake = Math.max(game.shake, 0.55);
    audio.thud(1);
    burst.emit(b.x, 0.2, b.z, 34, { speed: 7, up: 0.9, color: '#b09a7e', size: 0.34, life: 0.9, power: 0.7, grav: 5 });
    burst.emit(b.x, 0.3, b.z, 14, { speed: 8, up: 1.2, color: '#ff8a4a', size: 0.09, life: 0.6, power: 4, grav: 10 });
    game.boulder = null;
  }
}

/* ---------- loop de jogo ---------- */
function monsterDist() { return lerp(1.75, 7.6, clamp(game.gap / 100)); }

function updateRun(dt) {
  game.runTime += dt;
  // velocidade cresce e tende a um teto; tropeçar derruba e recupera
  game.targetSpeed = 9 + 12.5 * (1 - Math.exp(-game.dist / 1500));
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
    game.vy -= (game.vy > 0 ? 22 : 30) * dt;
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

  // o monstro: a fuga limpa abre vantagem, mas a fera nunca desiste
  const diff = clamp(game.dist / 1600);
  game.gap = Math.min(100, game.gap + (3.8 - diff * 2.3) * dt);
  game.stun = Math.max(0, game.stun - dt);
  game.lunge = Math.max(0, game.lunge - dt * 1.6);
  game.mx = damp(game.mx, game.px, game.gap < 30 ? 3.8 : 2.4, dt);
  // eventos
  game.evtT -= dt;
  if (game.evtT <= 0 && game.stun <= 0) {
    if (game.dist > 120 && Math.random() < 0.55 + diff * 0.2 && !game.boulder && tryThrow()) game.evtT = rnd(6, 10) - diff * 2.5;
    else {
      game.roar = 0.75; audio.roar(0.7);
      game.shake = 0.5;
      setTimeout(() => { game.roar = 0; }, 900);
      game.evtT = rnd(7, 11);
    }
  }
  // olhada para trás quando a fera está em cima
  game.lookT -= dt;
  if (game.lookT < 0) { game.look = game.gap < 45 ? 1 : 0; game.lookT = game.look ? 0.5 : rnd(2, 4); game.lookSide = Math.random() < 0.5 ? 1 : -1; }

  updateTrack(dt);
  updateBoulder(dt);

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
  ui.gapBox.classList.toggle('alarm', game.gap < 34);
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

  // Morte: gira para frente e encara o bote de baixo
  if (game.camD > 0.001) {
    const d = game.camD;
    const mx = game.px;
    const deathP = _v5.set(mx + (portrait ? 1.2 : 2.3), 1.0, portrait ? 6.6 : 4.8);
    const deathL = _v6.set(mx, 1.6, -1);
    if (game.hat) { deathP.set(game.px + (portrait ? 0.7 : 0.4), portrait ? 1.0 : 0.6, 5.2 + (portrait ? 2.4 : 0)); deathL.set(portrait ? game.px : game.px - 1.3, portrait ? 0.75 : 1.2, 0); }
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
  else if (game.state === 'caught' || game.state === 'over') {
    // o mundo desacelera; obstáculos seguem até parar
    props.updateAcorns(dt, game.speed, G.uTime.value);
    for (const o of props.live) { o.z -= game.speed * dt; o.m.position.z = o.z; }
  } else if (game.state === 'intro') {
    game.speed = damp(game.speed, game.camK * 7, 2, dt);
  } else if (game.state === 'title') {
    props.updateAcorns(dt, 0, G.uTime.value);
  }
  burst.update(dt, game.speed);

  // rolagem do mundo
  game.scroll = ((game.scroll || 0) + game.speed * dt);
  const sc = game.scroll % 192;
  G.uScroll.value = sc;
  ground.mesh.position.z = -(game.scroll % ground.dz);

  game.bendX = damp(game.bendX, running ? game.bendTX : 0, 0.65, dt);
  game.bendY = damp(game.bendY, running ? game.bendTY : -0.0002, 0.65, dt);
  G.uBend.value.set(game.bendX, game.bendY);

  /* gnomo */
  const fear = clamp(1 - game.gap / 45);
  let gState = 'idle';
  if (game.state === 'intro') gState = game.scared ? 'scared' : 'run';
  else if (running) gState = !game.grounded ? 'jump' : game.sliding > 0 ? 'slide' : 'run';
  else if (game.state === 'caught') gState = game.grabbed || game.gnomeLift > 0 ? 'caught' : 'scared';
  gnome.group.position.set(game.px, game.y, 0);
  gnome.group.rotation.y = damp(gnome.group.rotation.y, clamp(-(game.vx || 0) * 0.055, -0.5, 0.5), 11, dt);
  gnome.update(dt, {
    state: gState, speed: game.speed, vy: game.vy, vx: game.vx || 0, fear, look: running ? game.look : 0,
    lookSide: game.lookSide, lanternPower: 3.2 + game.flashFx * 10,
  });
  // piscar enquanto invulnerável
  gnome.mesh.visible = !(game.inv > 0 && running) || Math.sin(G.uTime.value * 34) > -0.35;

  /* monstro */
  const mg = monster.group;
  const mScale = game.state === 'caught' || game.state === 'over' ? 0.92 : lerp(1, 0.68, game.camK);
  game.mScale = damp(game.mScale ?? 1, mScale, 5, dt);
  mg.scale.setScalar(game.mScale);
  if (game.state === 'title') {
    // à espreita no escuro: só os olhos e o contorno
    mg.position.set(Math.sin(G.uTime.value * 0.3) * 0.3, 0, -11.5);
    mg.rotation.y = 0;
    monster.update(dt, { running: 0, speed: 0, roar: 0, lightPower: 3, headYaw: Math.sin(G.uTime.value * 0.5) * 0.35 });
  } else if (game.state === 'intro') {
    mg.position.set(game.mx, 0, lerp(-11, -7.6, game.introMon || 0));
    monster.update(dt, { running: game.camK, speed: 8, roar: game.roar, lightPower: 9 });
  } else if (running) {
    const d = monsterDist();
    mg.position.set(game.mx, 0, -d - 1.4);
    mg.rotation.y = clamp((game.px - game.mx) * 0.2, -0.4, 0.4);
    monster.update(dt, {
      running: 1, speed: game.speed, roar: game.roar, stun: game.stun > 0 ? 1 : 0, lunge: Math.max(game.lunge, game.gap < 25 ? 0.5 + Math.sin(G.uTime.value * 3) * 0.4 : 0),
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
    if (game.hat) {
      const h = game.hat;
      h.t += dt; h.vy -= 3.1 * dt;
      hatMesh.position.y = Math.max(0.05, hatMesh.position.y + h.vy * dt);
      hatMesh.position.x += (Math.sin(h.t * 4.4) * 0.7 + 0.1) * dt;
      hatMesh.position.z = Math.min(hatMesh.position.z + dt * 1.1, 1.0);
      hatMesh.rotation.z = hatMesh.position.y > 0.06 ? Math.sin(h.t * 4.4) * 0.5 : damp(hatMesh.rotation.z, 1.2, 4, dt);
    }
  }

  /* sombra de contato */
  const bs = Math.max(0.35, 1 - game.y * 0.38);
  blob.position.set(game.px, 0.045, 0.02);
  blob.scale.set(0.82 * bs, 1, 1.05 * bs);
  blob.material.opacity = 0.6 * bs;
  blob.visible = gnome.group.visible;

  /* céu e lua */
  moon.position.copy(camera.position).addScaledVector(G.uMoonDir.value, 280);
  moon.lookAt(camera.position);

  updateCamera(dt);

  /* pós */
  game.hitFx = Math.max(0, game.hitFx - dt * 2.6);
  const u = post.grade.uniforms;
  u.get('uDanger').value = running ? clamp(1 - game.gap / 38) : game.state === 'caught' ? 0.9 : 0;
  u.get('uFlashG').value = game.flashFx;
  u.get('uHit').value = game.hitFx * 0.7;
  u.get('uT').value = G.uTime.value;
  audio.setFear(running ? clamp(1 - game.gap / 60) : game.state === 'title' ? 0.12 : 0.3);

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
