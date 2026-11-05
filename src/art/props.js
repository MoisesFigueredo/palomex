// Obstáculos, bolotas e partículas. Linguagem visual: âmbar = pule, azul = deslize, vermelho = desvie.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, rng, fbm3, clamp, noise3 } from '../core/world.js';
import { blob, lump, paintGeo } from './forest.js';

const merge = (parts) => mergeGeometries(parts.map((p) => {
  const g = p.index ? p.toNonIndexed() : p;
  g.deleteAttribute('uv');
  return g;
}), false);

const AMBER = '#ffb347', BLUE = '#62d6ff', RED = '#ff4a5e';

function fungi(x, y, z, s, color) {
  const cap = new THREE.SphereGeometry(0.12 * s, 10, 6, 0, 6.283, 0, 1.6).scale(1, 0.7, 1).translate(x, y + 0.07 * s, z);
  const stem = new THREE.CylinderGeometry(0.025 * s, 0.04 * s, 0.1 * s, 6).translate(x, y + 0.02 * s, z);
  return [paintGeo(cap, (c) => { c.set(color); return 1; }), paintGeo(stem, (c) => { c.set('#e8dcc0'); return 0.2; })];
}

function bark(g, seed = 0) {
  return paintGeo(g, (c, x, y, z, nx, ny) => {
    const n = fbm3(x * 3 + seed, y * 6, z * 3);
    c.set('#33241a').lerp(new THREE.Color('#6e5238'), n);
    c.lerp(new THREE.Color('#4c7c33'), clamp((ny - 0.45) * 2 + (n - 0.5) * 1.5));
    return 0;
  });
}

function makeLog(len) {
  const parts = [];
  const body = new THREE.CylinderGeometry(0.36, 0.4, len, 14, Math.ceil(len * 3)).rotateZ(Math.PI / 2);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(y, z);
    const d = 1 + Math.cos(a * 9 + x) * 0.05 + (noise3(x * 0.9, y * 2, z * 2) - 0.5) * 0.28;
    p.setXYZ(i, x, y * d, z * d);
  }
  body.computeVertexNormals();
  bark(body).translate(0, 0.36, 0);
  parts.push(body);
  for (const s of [1, -1]) {
    const ring = new THREE.CircleGeometry(0.37, 14).rotateY(s * Math.PI / 2).translate(s * (len / 2 + 0.01), 0.36, 0);
    paintGeo(ring, (c, x, y, z) => {
      const r = Math.hypot(y - 0.36, z);
      c.set(Math.sin(r * 48) > 0 ? '#c7a26d' : '#8d6a42');
      return 0;
    });
    parts.push(ring);
  }
  const r = rng(Math.round(len * 100));
  const n = Math.ceil(len * 3);
  for (let i = 0; i < n; i++) parts.push(...fungi((r() - 0.5) * (len - 0.3), 0.7, (r() - 0.5) * 0.3, 0.9 + r() * 0.8, AMBER));
  return merge(parts);
}

function makeStump() {
  const body = new THREE.CylinderGeometry(0.46, 0.62, 0.6, 14, 3, false);
  lump(body, 0.16, 2.3);
  bark(body, 4).translate(0, 0.3, 0);
  const top = new THREE.CircleGeometry(0.46, 14).rotateX(-Math.PI / 2).translate(0, 0.6, 0);
  paintGeo(top, (c, x, y, z) => { c.set(Math.sin(Math.hypot(x, z) * 40) > 0 ? '#c7a26d' : '#8d6a42'); return 0; });
  return merge([body, top, ...fungi(0.2, 0.6, 0.1, 1.4, AMBER), ...fungi(-0.2, 0.6, -0.12, 1.1, AMBER), ...fungi(0.02, 0.6, 0.26, 0.8, AMBER)]);
}

function makeRootArch(width) {
  // portal de raízes: passa só deslizando; bulbos azuis marcam a altura
  const parts = [];
  const r = rng(77);
  const col = (g) => bark(g, 9);
  const hw = width / 2;
  for (const s of [1, -1]) {
    const pil = new THREE.CylinderGeometry(0.42, 0.72, 2.9, 12, 6);
    lump(pil, 0.32, 1.4);
    col(pil).translate(s * (hw + 0.2), 1.3, 0);
    parts.push(pil);
  }
  const beam = new THREE.CylinderGeometry(0.34, 0.34, width + 1, 14, 10).rotateZ(Math.PI / 2);
  const bp = beam.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    bp.setY(i, bp.getY(i) + Math.cos((x / (width + 1)) * Math.PI) * 0.18 + (noise3(x * 0.7, 3, 1) - 0.5) * 0.25);
    bp.setZ(i, bp.getZ(i) + (noise3(x * 0.7, 9, 1) - 0.5) * 0.25);
  }
  beam.computeVertexNormals();
  col(beam).translate(0, 1.42, 0);
  parts.push(beam);
  const vines = Math.ceil(width * 1.3);
  for (let i = 0; i < vines; i++) {
    const x = -hw + 0.2 + ((width - 0.4) * i) / (vines - 1) + (r() - 0.5) * 0.2;
    const top = 1.3, bot = 0.92 + r() * 0.1;
    const v = new THREE.CylinderGeometry(0.018, 0.018, top - bot, 5).translate(x, (top + bot) / 2, 0);
    paintGeo(v, (c) => { c.set('#3f6d38'); return 0; });
    const bulb = new THREE.SphereGeometry(0.06, 8, 6).translate(x, bot, 0);
    paintGeo(bulb, (c) => { c.set(BLUE); return 1; });
    parts.push(v, bulb);
  }
  return merge(parts);
}

function makeBoulder(red = false) {
  const g = lump(blob(0.85, 3), 0.42, 1.2, 1, 1.1, 1);
  paintGeo(g, (c, x, y, z, nx, ny) => {
    const n = fbm3(x * 2 + 2, y * 2, z * 2);
    c.set('#5d5a5e').lerp(new THREE.Color('#a29d94'), n);
    c.lerp(new THREE.Color('#4d8537'), clamp((ny - 0.62) * 2.4 + (n - 0.5) * 1.3));
    void red;
    return 0.05;
  });
  g.translate(0, 0.72, 0);
  return merge([g]);
}

function makeBramble(width) {
  const parts = [];
  const r = rng(13);
  const n = Math.ceil(width * 6);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * width;
    const y = r() * 1.5 + 0.1;
    const h = 0.45 + r() * 0.7;
    const cone = new THREE.ConeGeometry(0.1 + r() * 0.08, h, 6, 2);
    cone.rotateZ((r() - 0.5) * 2.6).rotateX((r() - 0.5) * 2.2);
    cone.translate(x, y, (r() - 0.5) * 0.4);
    const gy = y;
    parts.push(paintGeo(cone, (c, px, py) => {
      const tip = clamp(Math.abs(py - gy) / (h * 0.5));
      c.set('#25131b').lerp(new THREE.Color(RED), tip * tip);
      return tip * tip * 0.9;
    }));
  }
  const wall = new THREE.BoxGeometry(width, 1.6, 0.55, Math.ceil(width * 3), 5, 2);
  lump(wall, 0.45, 1.1);
  paintGeo(wall, (c, x, y, z) => { c.set('#1a0d12').lerp(new THREE.Color('#3f1d28'), fbm3(x * 3, y * 3, z * 3)); return 0; });
  wall.translate(0, 0.8, 0);
  parts.push(wall);
  return merge(parts);
}

function makeSpring() {
  const capG = new THREE.SphereGeometry(0.72, 20, 10, 0, 6.283, 0, 1.75).scale(1, 0.48, 1).translate(0, 0.42, 0);
  paintGeo(capG, (c, x, y, z, nx, ny) => {
    if (ny < 0.05) { c.set('#ffe6b8'); return 0.8; }
    const a = Math.atan2(z, x), r2 = Math.hypot(x, z);
    const dot = Math.sin(a * 6) * Math.sin(r2 * 12);
    c.set(dot > 0.55 ? '#fff7e0' : '#27d3a5');
    return dot > 0.55 ? 0.7 : 0.5;
  });
  const stem = new THREE.CylinderGeometry(0.2, 0.3, 0.5, 12).translate(0, 0.2, 0);
  paintGeo(stem, (c) => { c.set('#dcd6c0'); return 0.1; });
  return merge([capG, stem]);
}

function makeAcorn() {
  const nut = new THREE.SphereGeometry(0.17, 14, 12).scale(0.88, 1.18, 0.88);
  const np = nut.attributes.position;
  for (let i = 0; i < np.count; i++) {
    const y = np.getY(i);
    if (y < 0) { const k = 1 + y * 0.9; np.setX(i, np.getX(i) * k); np.setZ(i, np.getZ(i) * k); }
  }
  nut.computeVertexNormals();
  paintGeo(nut, (c) => { c.set('#ffcc4d'); return 0.55; });
  const cap = new THREE.SphereGeometry(0.165, 14, 6, 0, 6.283, 0, 1.6).scale(1, 0.62, 1).translate(0, 0.075, 0);
  paintGeo(cap, (c) => { c.set('#6a3f18'); return 0.05; });
  const stem = new THREE.CylinderGeometry(0.018, 0.024, 0.08, 6).translate(0, 0.2, 0);
  paintGeo(stem, (c) => { c.set('#6a3f18'); return 0; });
  return merge([nut, cap, stem]);
}

export function makeHatProp() {
  // o chapéu que sobra no fim: gag visual da tela de derrota
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const k = i / 11;
    pts.push(new THREE.Vector2(0.15 * (1 - k * 0.92) + (i === 0 ? 0.03 : 0), k * 0.46));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) - y * y * 0.5); }
  g.computeVertexNormals();
  paintGeo(g, (c, x, y) => { c.set(y < 0.03 ? '#8f1a24' : '#c62a2a'); return 0; });
  g.deleteAttribute('uv');
  return g;
}

export const LANE = 1.55;

/** Catálogo de obstáculos e pool de meshes. */
export class Props {
  constructor(scene, q) {
    this.scene = scene;
    this.mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }), { glow: true, glowSelf: true, glowAmp: 3.6, rim: 0.35 });
    const W3 = LANE * 3 + 1.6;
    this.kinds = {
      log: { geo: makeLog(1.75), type: 'jump', h: 0.72, hw: 0.75, hz: 0.42 },
      logWide: { geo: makeLog(W3 + 2.2), type: 'jump', h: 0.72, hw: 9, hz: 0.42 },
      stump: { geo: makeStump(), type: 'jump', h: 0.62, hw: 0.55, hz: 0.5 },
      arch: { geo: makeRootArch(W3), type: 'slide', hw: 9, hz: 0.4 },
      rock: { geo: makeBoulder(), type: 'block', hw: 0.72, hz: 0.72 },
      bramble: { geo: makeBramble(LANE * 2 + 0.6), type: 'block', hw: LANE + 0.28, hz: 0.45 },
      spring: { geo: makeSpring(), type: 'spring', hw: 0.72, hz: 0.5 },
    };
    this.pool = {};
    const preN = { log: 8, logWide: 3, stump: 8, arch: 4, rock: 12, bramble: 4, spring: 3 };
    for (const k in this.kinds) {
      this.pool[k] = [];
      for (let i = 0; i < preN[k]; i++) this.pool[k].push(this.spawnMesh(k));
    }
    this.live = [];

    /* bolotas */
    this.acornMax = 110;
    this.acorns = new THREE.InstancedMesh(makeAcorn(), patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.4 }), { glow: true, glowSelf: true, glowAmp: 2.2, rim: 0.7 }), this.acornMax);
    this.acorns.frustumCulled = false;
    this.acorns.castShadow = false;
    scene.add(this.acorns);
    this.acornList = [];
    this.d = new THREE.Object3D();
  }

  spawnMesh(kind) {
    const m = new THREE.Mesh(this.kinds[kind].geo, this.mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.visible = true; // visível até o pré-aquecimento dos shaders
    m.userData.kind = kind;
    m.position.set(0, -50, 0);
    this.scene.add(m);
    return m;
  }

  hideAll() { for (const k in this.pool) this.pool[k].forEach((m) => { m.visible = false; }); }

  add(kind, x, z) {
    const m = this.pool[kind].pop() || this.spawnMesh(kind);
    m.visible = true;
    m.position.set(x, 0, z);
    m.rotation.set(0, kind === 'rock' || kind === 'stump' ? Math.random() * 6.283 : 0, 0);
    m.scale.setScalar(1);
    const k = this.kinds[kind];
    const o = { m, kind, def: k, x, z, type: k.type, h: k.h, hw: k.hw, hz: k.hz, dead: false, fly: null };
    this.live.push(o);
    return o;
  }

  remove(i) {
    const o = this.live[i];
    o.m.visible = false;
    this.pool[o.kind].push(o.m);
    this.live.splice(i, 1);
  }

  clear() {
    while (this.live.length) this.remove(this.live.length - 1);
    this.acornList.length = 0;
  }

  /** arremessa o obstáculo: quebra, flash e fera atravessando */
  launch(o, dirZ = 1) {
    o.dead = true;
    o.fly = {
      vx: (Math.sign(o.x) || (Math.random() < 0.5 ? 1 : -1)) * (3 + Math.random() * 5),
      vy: 7 + Math.random() * 5, vz: dirZ * (3 + Math.random() * 5),
      rx: (Math.random() - 0.5) * 11, rz: (Math.random() - 0.5) * 11, t: 0,
    };
  }

  addAcorn(x, y, z) {
    if (this.acornList.length < this.acornMax) this.acornList.push({ x, y, z, phase: Math.random() * 6.283, picked: false });
  }

  updateAcorns(dt, speed, t) {
    const d = this.d;
    let n = 0;
    for (let i = this.acornList.length - 1; i >= 0; i--) {
      const a = this.acornList[i];
      a.z -= speed * dt;
      if (a.z < -14) { this.acornList.splice(i, 1); continue; }
    }
    for (const a of this.acornList) {
      d.position.set(a.x, a.y + Math.sin(t * 3.4 + a.phase) * 0.07, a.z);
      d.rotation.set(0.15, t * 3 + a.phase, 0.12);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.acorns.setMatrixAt(n++, d.matrix);
    }
    this.acorns.count = n;
    this.acorns.instanceMatrix.needsUpdate = true;
  }
}

/** Faíscas, poeira e estilhaços: um único Points simulado em JS. */
export class Burst {
  constructor(scene, q) {
    const n = q.particles;
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); // rgb + tamanho
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.base = new Float32Array(n * 4);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(this.col, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uBend: { value: null }, uPx: { value: q.pixelScale } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec4 aC; uniform vec2 uBend; uniform float uPx; varying vec3 vC;
        void main(){ vec4 w = vec4(position,1.0); float d = w.z-cameraPosition.z; w.x += uBend.x*d*d; w.y += uBend.y*d*d;
          vec4 mv = viewMatrix*w; vC = aC.rgb; gl_PointSize = uPx*aC.a/max(-mv.z,0.5)*500.0; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ float a = pow(max(1.0-length(gl_PointCoord-0.5)*2.0,0.0),1.6);
        gl_FragColor = vec4(vC*a,1.0); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
    this.geo = g;
    this.tc = new THREE.Color();
  }

  emit(x, y, z, count, o = {}) {
    const { speed = 2, up = 1, color = '#ffffff', size = 0.12, life = 0.7, grav = 5, drag = 2, power = 1, spread = 1, zv = 0 } = o;
    this.tc.set(color).multiplyScalar(power);
    for (let c = 0; c < count; c++) {
      const i = this.cursor;
      this.cursor = (i + 1) % this.n;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const a = Math.random() * 6.283, s = speed * (0.35 + Math.random() * 0.65);
      this.vel[i * 3] = Math.cos(a) * s * spread;
      this.vel[i * 3 + 1] = up * (0.3 + Math.random()) * s;
      this.vel[i * 3 + 2] = Math.sin(a) * s * spread + zv;
      const l = life * (0.6 + Math.random() * 0.6);
      this.life[i] = l; this.max[i] = l;
      this.grav[i] = grav; this.drag[i] = drag;
      this.base[i * 4] = this.tc.r; this.base[i * 4 + 1] = this.tc.g; this.base[i * 4 + 2] = this.tc.b;
      this.base[i * 4 + 3] = size * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt, worldSpeed) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 4 + 3] !== 0) this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.04, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] - worldSpeed) * dt;
      this.col[i * 4] = this.base[i * 4] * k; this.col[i * 4 + 1] = this.base[i * 4 + 1] * k; this.col[i * 4 + 2] = this.base[i * 4 + 2] * k;
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * (0.5 + (1 - k) * 0.7);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aC.needsUpdate = true;
  }
}
