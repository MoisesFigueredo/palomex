// O gnomo Tonho: esculpido em SDF, animado 100% por código.
// Corrida com IK de pés, pulo com antecipação e squash, deslize, tropeço, susto,
// olhar para trás, chapéu/barba/bolsa com mola e lanterna com luz real.
import * as THREE from 'three';
import { patch, depthFor, damp, lerp, clamp, sstep } from '../core/world.js';
import { cap, ell, sculpt, buildSkeleton, solveIK, Spring } from './sculpt.js';

const C = {
  skin: '#e8a884', nose: '#d9604f', hat: '#c62a2a', hatDark: '#8f1a24', patch: '#3f6d5b', beard: '#f2ebe0',
  tunic: '#23758a', hem: '#17505f', belt: '#4a2c17', gold: '#e9b23b', pants: '#c98f2f', boot: '#5a3419', glove: '#7a4a24', bag: '#8a5a2b',
};

const bones = {
  root: { p: [0, 0, 0] },
  hips: { p: [0, 0.36, 0], parent: 'root' },
  spine: { p: [0, 0.46, 0], parent: 'hips' },
  chest: { p: [0, 0.59, 0], parent: 'spine' },
  head: { p: [0, 0.74, 0.01], parent: 'chest' },
  hat1: { p: [0, 0.95, -0.01], parent: 'head' },
  hat2: { p: [0, 1.13, -0.03], parent: 'hat1' },
  hat3: { p: [0, 1.28, -0.08], parent: 'hat2' },
  beard1: { p: [0, 0.72, 0.1], parent: 'head' },
  beard2: { p: [0, 0.6, 0.13], parent: 'beard1' },
  armL: { p: [0.14, 0.63, 0], parent: 'chest' },
  foreL: { p: [0.25, 0.53, 0], parent: 'armL' },
  handL: { p: [0.31, 0.43, 0.03], parent: 'foreL' },
  armR: { p: [-0.14, 0.63, 0], parent: 'chest' },
  foreR: { p: [-0.25, 0.53, 0], parent: 'armR' },
  handR: { p: [-0.31, 0.43, 0.03], parent: 'foreR' },
  legL: { p: [0.08, 0.33, 0], parent: 'hips' },
  shinL: { p: [0.085, 0.19, 0.015], parent: 'legL' },
  footL: { p: [0.085, 0.055, -0.01], parent: 'shinL' },
  legR: { p: [-0.08, 0.33, 0], parent: 'hips' },
  shinR: { p: [-0.085, 0.19, 0.015], parent: 'legR' },
  footR: { p: [-0.085, 0.055, -0.01], parent: 'shinR' },
  bag: { p: [0, 0.46, -0.16], parent: 'hips' },
};

function prims() {
  const o = [];
  // pernas e botas
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    o.push(cap([s * 0.08, 0.34, 0], [s * 0.085, 0.19, 0.015], 0.062, 0.05, 'leg' + L, C.pants, { k: 0.02 }));
    o.push(cap([s * 0.085, 0.19, 0.015], [s * 0.085, 0.07, -0.005], 0.05, 0.043, 'shin' + L, C.pants, { k: 0.02 }));
    o.push(cap([s * 0.085, 0.085, -0.008], [s * 0.085, 0.045, 0.0], 0.062, 0.062, 'foot' + L, C.boot, { k: 0.015 }));
    o.push(cap([s * 0.085, 0.045, 0.0], [s * 0.088, 0.045, 0.11], 0.06, 0.05, 'foot' + L, C.boot, { k: 0.02 }));
    o.push(cap([s * 0.088, 0.045, 0.11], [s * 0.09, 0.085, 0.165], 0.045, 0.018, 'foot' + L, C.boot, { k: 0.02 })); // bico virado
    // braços
    o.push(cap([s * 0.13, 0.635, 0], [s * 0.25, 0.53, 0], 0.052, 0.04, 'arm' + L, C.tunic, { k: 0.03 }));
    o.push(cap([s * 0.25, 0.53, 0], [s * 0.305, 0.44, 0.025], 0.04, 0.034, 'fore' + L, C.tunic, { k: 0.02 }));
    o.push(ell([s * 0.33, 0.405, 0.04], [0.05, 0.05, 0.05], 'hand' + L, C.glove, { k: 0.015 }));
    o.push(cap([s * 0.31, 0.435, 0.027], [s * 0.3, 0.45, 0.02], 0.05, 0.052, 'hand' + L, C.hem, { k: 0.006 })); // punho
    // orelha
    o.push(ell([s * 0.142, 0.80, 0.0], [0.03, 0.05, 0.022], 'head', C.skin, { k: 0.02, rot: [0, 0, s * -0.3] }));
    // bigode
    o.push(ell([s * 0.05, 0.748, 0.142], [0.058, 0.026, 0.03], 'head', C.beard, { k: 0.015, fur: 0.45, rot: [0, 0, s * -0.35] }));
    // bochecha
    o.push(ell([s * 0.075, 0.782, 0.105], [0.04, 0.032, 0.03], 'head', '#eea48a', { k: 0.04 }));
  }
  // tronco: túnica em forma de sino
  o.push(ell([0, 0.53, 0], [0.135, 0.125, 0.115], 'spine', C.tunic, { k: 0.02 }));
  o.push(ell([0, 0.625, -0.002], [0.122, 0.08, 0.105], 'chest', C.tunic, { k: 0.05 }));
  o.push(cap([0, 0.42, 0], [0, 0.315, 0], 0.145, 0.165, 'hips', C.hem, { k: 0.02, colorSharp: 180 }));
  o.push(ell([0, 0.425, 0], [0.156, 0.03, 0.14], 'spine', C.belt, { k: 0.006, colorSharp: 400 }));
  o.push(ell([0, 0.425, 0.138], [0.034, 0.036, 0.016], 'spine', C.gold, { k: 0.004, colorSharp: 500 }));
  // alça cruzada e bolsa nas costas (é o que o jogador vê o tempo todo)
  o.push(cap([0.12, 0.655, -0.05], [-0.1, 0.45, -0.115], 0.016, 0.016, 'chest', C.belt, { k: 0.006, colorSharp: 500 }));
  o.push(ell([0, 0.46, -0.18], [0.09, 0.075, 0.05], 'bag', C.bag, { k: 0.008, colorSharp: 400, skinSharp: 200 }));
  o.push(ell([0, 0.49, -0.215], [0.078, 0.032, 0.022], 'bag', C.belt, { k: 0.005, colorSharp: 500, skinSharp: 200 }));
  // cabeça
  o.push(ell([0, 0.81, 0.012], [0.138, 0.128, 0.128], 'head', C.skin, { k: 0.03 }));
  o.push(ell([0, 0.778, 0.15], [0.052, 0.05, 0.05], 'head', C.nose, { k: 0.012, colorSharp: 250 }));
  // barba volumosa (com pelo)
  o.push(ell([0, 0.71, 0.075], [0.135, 0.095, 0.09], 'beard1', C.beard, { k: 0.03, fur: 1, colorSharp: 200 }));
  o.push(cap([0, 0.67, 0.115], [0, 0.565, 0.145], 0.08, 0.018, 'beard2', C.beard, { k: 0.03, fur: 1, colorSharp: 200 }));
  for (const s of [1, -1]) o.push(cap([s * 0.122, 0.79, 0.03], [s * 0.1, 0.70, 0.07], 0.022, 0.05, 'beard1', C.beard, { k: 0.03, fur: 0.9, colorSharp: 200, skinSharp: 90 }));
  // chapéu: aba + cone mole de três segmentos
  o.push(ell([0, 0.885, 0.0], [0.168, 0.05, 0.165], 'head', C.hatDark, { k: 0.008, colorSharp: 300 }));
  o.push(cap([0, 0.92, 0], [0, 1.04, -0.018], 0.14, 0.1, 'hat1', C.hat, { k: 0.012, colorSharp: 300 }));
  o.push(cap([0, 1.04, -0.018], [0, 1.17, -0.045], 0.1, 0.058, 'hat2', C.hat, { k: 0.01 }));
  o.push(cap([0, 1.17, -0.045], [0.0, 1.3, -0.1], 0.058, 0.014, 'hat3', C.hat, { k: 0.01 }));
  return o;
}

function paint(x, y, z, c) {
  // remendo costurado na parte de trás do chapéu
  if (z < 0 && y > 0.99 && y < 1.1 && Math.abs(x + 0.03) < 0.055) c.set(C.patch);
  // listras da túnica nas costas
  if (y > 0.46 && y < 0.6 && z < 0 && Math.sin(y * 90) > 0.55) c.offsetHSL(0, 0, -0.04);
  // barra da túnica em zigue-zague
  if (y > 0.3 && y < 0.345 && Math.sin(Math.atan2(x, z) * 18) > 0) c.set('#d8b34c');
}

function buildLantern() {
  const parts = [];
  const add = (g, color, glow = 0) => {
    const n = g.attributes.position.count;
    const cc = new Float32Array(n * 3);
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) { cc[i * 3] = col.r; cc[i * 3 + 1] = col.g; cc[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const iron = '#2c2622';
  add(new THREE.CylinderGeometry(0.058, 0.066, 0.018, 8).translate(0, -0.075, 0), iron);
  add(new THREE.CylinderGeometry(0.03, 0.062, 0.05, 8).translate(0, 0.078, 0), iron);
  add(new THREE.TorusGeometry(0.03, 0.006, 6, 12).translate(0, 0.122, 0), iron);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 4).translate(Math.cos(a) * 0.055, 0, Math.sin(a) * 0.055), iron);
  }
  add(new THREE.SphereGeometry(0.045, 12, 10).scale(1, 1.3, 1), '#ffd98a', 1);
  const geo = new THREE.BufferGeometry();
  const count = parts.reduce((s, p) => s + p.attributes.position.count, 0);
  for (const name of ['position', 'normal', 'color', 'aGlow']) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(count * size);
    let off = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, off); off += p.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return geo;
}

export class Gnome {
  static async create(q) {
    const g = new Gnome();
    await g.build(q);
    return g;
  }

  async build(q) {
    const geo = await sculpt(prims(), bones, { cell: q.gnomeCell, colorSharp: 160, skinSharp: 42, paint, reach: 0.07 });
    const { bones: B, list, root } = buildSkeleton(bones);
    this.B = B;
    for (const [up, lo, end] of [['legL', 'shinL', 'footL'], ['legR', 'shinR', 'footR']]) {
      B[lo].userData.next = B[end].position.clone();
    }

    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }), { rim: 0.8 });
    this.mesh = new THREE.SkinnedMesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.customDepthMaterial = depthFor({});
    this.mesh.add(root);
    this.mesh.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(list);
    this.mesh.bind(skel, this.mesh.matrixWorld);

    this.group = new THREE.Group();
    this.group.add(this.mesh);

    // barba fofa: cascas só nos triângulos com pelo
    if (q.gnomeShells > 0) {
      const furGeo = new THREE.BufferGeometry();
      for (const k of Object.keys(geo.attributes)) furGeo.setAttribute(k, geo.attributes[k]);
      furGeo.setIndex(geo.userData.furIndex);
      furGeo.boundingSphere = geo.boundingSphere;
      for (let i = 1; i <= q.gnomeShells; i++) {
        const t = i / q.gnomeShells;
        const m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { fur: true, shell: t, furLen: 0.035, furFreq: 95, droop: 0.012, rim: 0.7 });
        m.color.setScalar(0.72 + t * 0.4);
        const sm = new THREE.SkinnedMesh(furGeo, m);
        sm.frustumCulled = false;
        sm.bind(skel, this.mesh.matrixWorld);
        this.mesh.add(sm);
        (this.shellMats ||= []).push(m);
      }
    }

    // olhos, sobrancelhas: peças à parte para ficarem nítidas
    const white = patch(new THREE.MeshStandardMaterial({ color: '#fbf6ea', roughness: 0.25 }), { rim: 0.1 });
    const dark = patch(new THREE.MeshStandardMaterial({ color: '#17110d', roughness: 0.2 }), { rim: 0 });
    const brow = patch(new THREE.MeshStandardMaterial({ color: '#d9d2c5', roughness: 0.9 }), { rim: 0.2 });
    const lid = patch(new THREE.MeshStandardMaterial({ color: C.skin, roughness: 0.7 }), { rim: 0.2 });
    this.eyes = []; this.lids = []; this.brows = [];
    const eyeG = new THREE.SphereGeometry(0.036, 16, 12);
    const pupG = new THREE.SphereGeometry(0.018, 12, 10);
    const glintG = new THREE.SphereGeometry(0.006, 6, 6);
    const lidG = new THREE.SphereGeometry(0.0385, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const browG = new THREE.CapsuleGeometry(0.011, 0.05, 4, 8).rotateZ(Math.PI / 2);
    const glintM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    patch(glintM, { rim: 0 });
    for (const s of [1, -1]) {
      const e = new THREE.Group();
      e.position.set(s * 0.05, 0.835 - 0.74, 0.118 - 0.01);
      const w = new THREE.Mesh(eyeG, white);
      const p = new THREE.Mesh(pupG, dark);
      p.position.set(0, 0, 0.024);
      const gl = new THREE.Mesh(glintG, glintM);
      gl.position.set(0.007, 0.008, 0.037);
      e.add(w, p, gl);
      e.userData.pupil = p;
      const l = new THREE.Mesh(lidG, lid);
      l.rotation.x = -0.25;
      e.add(l);
      B.head.add(e);
      this.eyes.push(e); this.lids.push(l);
      const b = new THREE.Mesh(browG, brow);
      b.position.set(s * 0.052, 0.885 - 0.74, 0.122);
      B.head.add(b);
      this.brows.push(b);
    }

    // sino na ponta do chapéu
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), patch(new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.3, metalness: 0.9 }), { rim: 0.6 }));
    bell.position.set(0, 0.03, -0.03);
    B.hat3.add(bell);

    // lanterna na mão direita, com luz de verdade
    this.lantern = new THREE.Group();
    const lg = buildLantern();
    this.lanternMesh = new THREE.Mesh(lg, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), { glow: true, glowAmp: 3.2, rim: 0.2, glowColor: (this.flameColor = new THREE.Color('#ffb765')) }));
    this.lanternMesh.castShadow = false;
    this.lantern.add(this.lanternMesh);
    this.lantern.position.set(-0.02, -0.19, 0.01);
    B.handR.add(this.lantern);
    this.light = new THREE.PointLight('#ffb765', 3.2, 15, 1.25);
    this.light.position.set(0, 0.25, 0.32);
    this.lantern.add(this.light);

    // halo da lanterna (sprite aditivo: barato e lindo com o bloom)
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: '#ffba6b', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 }));
    this.halo.scale.setScalar(0.8);
    this.lantern.add(this.halo);

    this.springs = {
      hat1: new Spring(B.hat1, 90, 11, 1.1), hat2: new Spring(B.hat2, 65, 8, 1.5), hat3: new Spring(B.hat3, 45, 6, 2.0),
      beard1: new Spring(B.beard1, 110, 12, 0.6), beard2: new Spring(B.beard2, 70, 8, 1.0), bag: new Spring(B.bag, 70, 7, 1.3),
    };

    /* estado de animação */
    this.t = 0; this.phase = 0;
    this.w = { idle: 1, run: 0, jump: 0, slide: 0, stumble: 0, scared: 0, caught: 0 };
    this.jumpT = 0; this.vy = 0; this.y = 0; this.landT = 1; this.stumbleT = 1;
    this.look = 0; this.lean = 0; this.fear = 0; this.blink = 0; this.nextBlink = 2;
    this.prevVX = 0; this.vx = 0; this.speed = 8;
    this.squash = 0; this.squashV = 0;
    this.footL = new THREE.Vector3(); this.footR = new THREE.Vector3();
    this.lastStride = 0;
    this.onStep = null;
    this.flicker = 1;
    this.flashBoost = 0;
  }

  /** Troca a cor da chama: luz real, halo e brilho do miolo. */
  setFlame(c) {
    this.flameColor.set(c);
    this.light.color.set(c);
    this.halo.material.color.set(c);
  }

  /** Pisca só o corpo. Nunca esconder a malha inteira: a luz da lanterna é filha dela e
   *  sumir com uma luz obriga a recompilar todos os shaders (engasgo visível). */
  setBlink(on) {
    this.mesh.material.visible = on;
    (this.shellMats || []).forEach((m) => { m.visible = on; });
  }

  /** eventos vindos do jogo */
  land(force = 1) { this.squashV = -7 * force; this.landT = 0; }
  jump() { this.squashV = 6; this.jumpT = 0; }
  stumble() { this.stumbleT = 0; this.squashV = -5; }

  update(dt, s) {
    const B = this.B;
    this.t += dt;
    const t = this.t;
    const speed = s.speed ?? 8;
    this.speed = speed;

    /* ---- pesos dos estados ---- */
    const tgt = { idle: 0, run: 0, jump: 0, slide: 0, stumble: 0, scared: 0, caught: 0 };
    tgt[s.state] = 1;
    this.stumbleT = Math.min(this.stumbleT + dt / 0.55, 1);
    const stumbling = this.stumbleT < 1 ? Math.sin(this.stumbleT * Math.PI) : 0;
    for (const k in this.w) this.w[k] = damp(this.w[k], tgt[k], s.state === 'jump' ? 22 : 14, dt);
    const W = this.w;

    /* ---- ciclo de corrida ---- */
    const cadence = 2.05 + speed * 0.11;
    this.phase += cadence * dt * (s.state === 'jump' ? 1.6 : 1);
    const ph = this.phase % 1;
    const a = ph * Math.PI * 2;
    const stride = Math.round(this.phase * 2);
    if (stride !== this.lastStride) {
      this.lastStride = stride;
      if (W.run > 0.6 && this.onStep) this.onStep(stride % 2 === 0 ? 1 : -1);
    }

    this.fear = damp(this.fear, s.fear ?? 0, 4, dt);
    const lookBack = damp(this.look, s.look ?? 0, 7, dt);
    this.look = lookBack;
    const dvx = (s.vx ?? 0) - this.prevVX;
    this.prevVX = s.vx ?? 0;
    this.lean = damp(this.lean, clamp((s.vx ?? 0) * 0.075, -0.55, 0.55), 12, dt);

    /* ---- pose: cada estado contribui, somando pelo peso ---- */
    let hipY = 0, hipZ = 0, hipX = 0, hipPitch = 0, hipYaw = 0, hipRoll = 0;
    let spP = 0, spY = 0, spR = 0, chP = 0, chY = 0, headP = 0, headY = 0, headR = 0;
    // braços: [pitch, roll, elbow]
    let lP = 0, lR = 0, lE = 0, rP = 0, rR = 0, rE = 0;
    // pés relativos à raiz: x fixo, y, z, pitch
    let lfY = 0, lfZ = 0, lfA = 0, rfY = 0, rfZ = 0, rfA = 0, lfX = 0, rfX = 0;
    const add = (w, o) => {
      if (w < 0.001) return;
      hipY += (o.hipY || 0) * w; hipZ += (o.hipZ || 0) * w; hipX += (o.hipX || 0) * w;
      hipPitch += (o.hipPitch || 0) * w; hipYaw += (o.hipYaw || 0) * w; hipRoll += (o.hipRoll || 0) * w;
      spP += (o.spP || 0) * w; spY += (o.spY || 0) * w; spR += (o.spR || 0) * w;
      chP += (o.chP || 0) * w; chY += (o.chY || 0) * w;
      headP += (o.headP || 0) * w; headY += (o.headY || 0) * w; headR += (o.headR || 0) * w;
      lP += (o.lP || 0) * w; lR += (o.lR || 0) * w; lE += (o.lE || 0) * w;
      rP += (o.rP || 0) * w; rR += (o.rR || 0) * w; rE += (o.rE || 0) * w;
      lfY += (o.lfY || 0) * w; lfZ += (o.lfZ || 0) * w; lfA += (o.lfA || 0) * w; lfX += (o.lfX || 0) * w;
      rfY += (o.rfY || 0) * w; rfZ += (o.rfZ || 0) * w; rfA += (o.rfA || 0) * w; rfX += (o.rfX || 0) * w;
    };

    // IDLE: respira, oscila a lanterna, confere o entorno
    if (W.idle > 0.001) {
      const br = Math.sin(t * 1.7);
      const glance = Math.sin(t * 0.37) * Math.sin(t * 0.91) * 0.9;
      add(W.idle, {
        hipY: -0.012 + br * 0.004, spP: 0.04 + br * 0.015, chP: 0.05 + br * 0.015,
        headP: 0.03 - br * 0.012, headY: glance, headR: glance * 0.12,
        lP: 0.05 + br * 0.02, lR: 0.1, lE: 0.25,
        rP: -1.05 + Math.sin(t * 0.9) * 0.03, rR: 0.25, rE: 1.25,
        lfY: 0, lfZ: 0.012, rfY: 0, rfZ: -0.012, lfX: 0.012, rfX: -0.012,
      });
    }

    // RUN: IK de pés com fase de voo; o corpo pedala na frente do centro de massa
    if (W.run > 0.001) {
      const strideLen = clamp(0.1 + speed * 0.012, 0.13, 0.26);
      const foot = (ofs) => {
        const p = (ph + ofs) % 1;
        const stance = 0.42;
        if (p < stance) {
          const k = p / stance;
          return { z: lerp(strideLen, -strideLen * 1.05, k), y: Math.sin(k * Math.PI) * 0.006, a: lerp(-0.25, 0.55, k) };
        }
        const k = (p - stance) / (1 - stance);
        const e = k * k * (3 - 2 * k);
        return { z: lerp(-strideLen * 1.05, strideLen, e), y: Math.sin(k * Math.PI) * (0.11 + speed * 0.004) + (1 - k) * 0.02, a: lerp(0.9, -0.45, e) };
      };
      const fL = foot(0), fR = foot(0.5);
      const bob = Math.cos(a * 2);
      const pump = Math.sin(a);
      add(W.run, {
        hipY: -0.03 + bob * 0.024, hipYaw: pump * 0.2, hipRoll: Math.sin(a) * 0.05,
        spP: 0.26 + this.fear * 0.08, spY: -pump * 0.16, spR: -Math.sin(a) * 0.03,
        chP: 0.1, chY: -pump * 0.14,
        headP: -0.28 + bob * 0.05, headR: Math.sin(a) * 0.04,
        lP: -pump * 1.05 - 0.15, lR: 0.2, lE: 1.35 - pump * 0.35,
        // lanterna fica mais à frente, sacudindo pouco, para iluminar o caminho
        rP: -0.85 + pump * 0.28, rR: 0.32, rE: 1.0 + Math.cos(a * 2) * 0.12,
        lfY: fL.y, lfZ: fL.z, lfA: fL.a, rfY: fR.y, rfZ: fR.z, rfA: fR.a,
        lfX: -0.01, rfX: 0.01,
      });
    }

    // JUMP: esticado subindo, encolhido no topo, abrindo para aterrissar
    if (W.jump > 0.001) {
      const up = clamp((s.vy ?? 0) / 8, -1, 1);
      const tuck = 1 - Math.abs(up);
      const pedal = Math.sin(t * 22);
      add(W.jump, {
        hipY: 0, hipPitch: -0.25 * up + 0.15 * tuck,
        spP: 0.05 + tuck * 0.35 - up * 0.2, chP: tuck * 0.15,
        headP: -0.1 - tuck * 0.1,
        lP: -2.2 * Math.max(up, 0) - 0.6 * tuck + 0.7 * Math.max(-up, 0), lR: 0.8 + tuck * 0.2, lE: 0.5,
        rP: -1.5 + 0.2 * up, rR: 0.55, rE: 0.8,
        lfY: 0.13 + tuck * 0.07 + pedal * 0.022, lfZ: 0.11 * tuck - 0.08 * up + pedal * 0.05, lfA: 0.5 * up,
        rfY: 0.05 + tuck * 0.15 - pedal * 0.022, rfZ: -0.07 * up + 0.05 * tuck - pedal * 0.05, rfA: 0.7 * up,
      });
    }

    // SLIDE: de bunda no chão, pés à frente, chapéu arrastando
    if (W.slide > 0.001) {
      const jit = Math.sin(t * 38) * 0.008;
      add(W.slide, {
        hipY: -0.22 + jit, hipZ: 0.05, hipPitch: -0.75,
        spP: -0.15, chP: 0.25, headP: 0.5,
        lP: 0.9, lR: 0.75, lE: 0.5,
        rP: -1.2, rR: 0.55, rE: 0.6,
        lfY: 0.07 + jit, lfZ: 0.26, lfA: -0.7,
        rfY: 0.1 - jit, rfZ: 0.22, rfA: -0.5, lfX: 0.03, rfX: -0.03,
      });
    }

    // SCARED: o pulo de susto da abertura, tremendo de olho arregalado
    if (W.scared > 0.001) {
      const shake = Math.sin(t * 55) * 0.025;
      add(W.scared, {
        hipY: 0.07, hipPitch: -0.22, spP: -0.15, chP: -0.1, headP: -0.2 + shake, headY: shake * 2,
        lP: -2.5, lR: 0.9 + shake, lE: 0.7, rP: -2.3, rR: 0.85 - shake, rE: 0.6,
        lfY: 0.11, lfZ: -0.03, lfA: 0.4, rfY: 0.15, rfZ: 0.05, rfA: -0.2, lfX: 0.04, rfX: -0.04,
      });
    }

    // CAUGHT: agarrado, pernas pedalando no ar
    if (W.caught > 0.001) {
      const p = Math.sin(t * 24);
      add(W.caught, {
        hipY: 0.02, hipPitch: 0.15, spP: 0.2, headP: -0.45, headY: Math.sin(t * 12) * 0.3,
        lP: -2.8 + p * 0.3, lR: 0.7, lE: 0.4, rP: -2.8 - p * 0.3, rR: 0.7, rE: 0.4,
        lfY: 0.13 + p * 0.05, lfZ: p * 0.1, lfA: 0.5, rfY: 0.13 - p * 0.05, rfZ: -p * 0.1, rfA: 0.5,
      });
    }

    // TROPEÇO: camada aditiva por cima de qualquer estado
    if (stumbling > 0.001) {
      const wind = Math.sin(t * 26);
      hipPitch += 0.55 * stumbling; hipY -= 0.05 * stumbling;
      spP += 0.55 * stumbling; headP -= 0.5 * stumbling;
      lP = lerp(lP, -2.1 + wind * 1.1, stumbling); lR = lerp(lR, 1.0, stumbling);
      rP = lerp(rP, -2.1 - wind * 1.1, stumbling); rR = lerp(rR, 0.9, stumbling);
    }

    /* ---- olhar para trás ao ver o monstro chegando ---- */
    const lb = lookBack;
    headY = lerp(headY, 1.45 * Math.sign(s.lookSide || 1), lb * 0.85);
    chY += 0.55 * lb * Math.sign(s.lookSide || 1);
    spY += 0.3 * lb * Math.sign(s.lookSide || 1);

    /* ---- squash & stretch por mola ---- */
    this.squashV += (-this.squash * 180 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const sq = clamp(this.squash, -0.28, 0.28);
    const sy = 1 + sq, sxz = 1 / Math.sqrt(Math.max(sy, 0.3));
    B.root.scale.set(sxz, sy, sxz);

    /* ---- aplica ---- */
    const rest = (n) => B[n].userData.rest;
    B.hips.position.set(rest('hips').x + hipX, rest('hips').y + hipY, rest('hips').z + hipZ);
    B.hips.rotation.set(hipPitch, hipYaw, hipRoll + this.lean * 0.3);
    B.spine.rotation.set(spP, spY, spR + this.lean * 0.45);
    B.chest.rotation.set(chP, chY, this.lean * 0.3);
    B.head.rotation.set(headP, headY, headR - this.lean * 0.7);
    B.armL.rotation.set(lP, 0, lR, 'XZY');
    B.foreL.rotation.set(-lE, 0, 0);
    B.armR.rotation.set(rP, 0, -rR, 'XZY');
    B.foreR.rotation.set(-rE, 0, 0);

    // pernas por IK: alvo no espaço da raiz -> espaço dos quadris
    B.root.position.y = 0;
    B.hips.updateMatrix();
    const inv = new THREE.Matrix4().copy(B.hips.matrix).invert();
    const pole = _pole.set(0, 0.05, 1).transformDirection(inv);
    for (const [up, lo, end, fx, fy, fz, fa, side] of [
      ['legL', 'shinL', 'footL', lfX, lfY, lfZ, lfA, 1], ['legR', 'shinR', 'footR', rfX, rfY, rfZ, rfA, -1],
    ]) {
      const rFoot = bones[end].p;
      _t.set(side * 0.085 + fx, Math.max(rFoot[1] + fy, 0.05) , fz + rFoot[2]).applyMatrix4(inv);
      solveIK(B[up], B[lo], _t, pole);
      // pé compensa a rotação acumulada e aplica a pisada
      _q.copy(B.hips.quaternion).multiply(B[up].quaternion).multiply(B[lo].quaternion).invert();
      B[end].quaternion.copy(_q).multiply(_q2.setFromAxisAngle(_x, fa));
    }

    /* ---- olhos e sobrancelhas ---- */
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.blink = 1; this.nextBlink = 1.5 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt * 8);
    const scare = Math.max(W.scared, W.caught, this.fear * 0.7, stumbling);
    const lidRot = lerp(-0.25, -1.65, scare);
    const shut = Math.sin(this.blink * Math.PI);
    for (let i = 0; i < 2; i++) {
      this.lids[i].rotation.x = lerp(lidRot, 0.9, shut);
      this.eyes[i].userData.pupil.scale.setScalar(lerp(1, 0.62, scare));
      this.eyes[i].userData.pupil.position.x = -this.look * 0.012;
      const s2 = i === 0 ? 1 : -1;
      this.brows[i].position.y = 0.885 - 0.74 + scare * 0.022;
      this.brows[i].rotation.z = s2 * lerp(-0.1, 0.42, scare);
    }

    /* ---- molas: chapéu e barba reagem a aceleração e velocidade ---- */
    const accelY = s.vy !== undefined ? -(s.vy - (this._pvy ?? 0)) / Math.max(dt, 1e-3) : 0;
    this._pvy = s.vy ?? 0;
    const drag = W.run + W.slide * 1.3 + W.jump;
    const bob = W.run * Math.cos(a * 2) * 26;
    const fx = accelY * 0.45 * 0.5 + bob;
    const fz = (dvx / Math.max(dt, 1e-3)) * 0.65;
    const sp = this.springs;
    const rearward = -0.17 * drag - speed * 0.012 * drag;
    sp.hat1.step(dt, fx, fz, rearward * 0.8, -this.lean * 0.5);
    sp.hat2.step(dt, fx * 1.1, fz * 1.1, rearward * 1.3 + Math.sin(t * 3) * 0.02, -this.lean * 0.8);
    sp.hat3.step(dt, fx * 1.2, fz * 1.2, rearward * 2.2 + Math.sin(t * 4) * 0.05, -this.lean);
    sp.beard1.step(dt, -fx * 0.2, fz * 0.3, drag * 0.12, 0);
    sp.beard2.step(dt, -fx * 0.3, fz * 0.3, drag * 0.3, 0);
    sp.bag.step(dt, fx * 0.5, fz * 0.3, drag * -0.12, 0);

    /* ---- lanterna: chama viva e pêndulo ---- */
    this.flashBoost = Math.max(0, this.flashBoost - dt * 1.6);
    const n = Math.sin(t * 11) * 0.5 + Math.sin(t * 23.3) * 0.3 + Math.sin(t * 41.7) * 0.2;
    this.flicker = 1 + n * 0.09;
    this.light.intensity = (s.lanternPower ?? 3.2) * this.flicker + this.flashBoost * 40;
    this.light.distance = 13 + this.flashBoost * 25;
    this.halo.material.opacity = 0.36 * this.flicker + this.flashBoost;
    this.halo.scale.setScalar(0.8 + this.flashBoost * 6);
    // a lanterna fica de pé, pendurada, apesar do braço
    B.handR.updateWorldMatrix(true, false);
    B.handR.getWorldQuaternion(_q).invert();
    this.lantern.quaternion.copy(_q).multiply(_q2.setFromEuler(_e.set(Math.sin(a) * 0.12 * W.run + this.vxTilt(), 0, -this.lean * 0.8)));
  }

  vxTilt() { return -0.15 * this.w.run; }
}

const _pole = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0), _e = new THREE.Euler();

let _halo;
export function haloTex() {
  if (_halo) return _halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,.5)');
  r.addColorStop(0.5, 'rgba(255,255,255,.1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  _halo = new THREE.CanvasTexture(c);
  _halo.colorSpace = THREE.SRGBColorSpace;
  return _halo;
}
