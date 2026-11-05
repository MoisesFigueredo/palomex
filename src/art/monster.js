// O Cramunhão do Brejo: fera musgosa com máscara de osso, galhada e veias em brasa.
// Galope por IK nos quatro membros, coluna ondulando, rugido, arremesso, lunge,
// recuo ao ser ofuscado e o bote final.
import * as THREE from 'three';
import { patch, depthFor, damp, lerp, clamp, noise3, fbm3 } from '../core/world.js';
import { cap, ell, sculpt, buildSkeleton, solveIK, Spring } from './sculpt.js';
import { haloTex } from './gnome.js';

const C = {
  hide: '#2a2a22', fur: '#2f4136', moss: '#4f7a3c', mossLit: '#7ea344', bone: '#d9d0ba', boneDark: '#8f8670', claw: '#1a1612', dark: '#0b0a09', mouth: '#3a0d10', tongue: '#7a2230',
};

const bones = {
  root: { p: [0, 0, 0] },
  pelvis: { p: [0, 1.6, -1.55], parent: 'root' },
  sp1: { p: [0, 2.05, -0.75], parent: 'pelvis' },
  sp2: { p: [0, 2.4, 0.05], parent: 'sp1' },
  neck: { p: [0, 2.35, 0.75], parent: 'sp2' },
  head: { p: [0, 2.2, 1.2], parent: 'neck' },
  jaw: { p: [0, 1.98, 1.22], parent: 'head' },
  armL: { p: [1.0, 2.35, 0.25], parent: 'sp2' },
  foreL: { p: [1.5, 1.35, 0.55], parent: 'armL' },
  handL: { p: [1.42, 0.3, 1.0], parent: 'foreL' },
  armR: { p: [-1.0, 2.35, 0.25], parent: 'sp2' },
  foreR: { p: [-1.5, 1.35, 0.55], parent: 'armR' },
  handR: { p: [-1.42, 0.3, 1.0], parent: 'foreR' },
  legL: { p: [0.62, 1.5, -1.65], parent: 'pelvis' },
  shinL: { p: [0.82, 0.9, -0.95], parent: 'legL' },
  footL: { p: [0.82, 0.3, -1.75], parent: 'shinL' },
  legR: { p: [-0.62, 1.5, -1.65], parent: 'pelvis' },
  shinR: { p: [-0.82, 0.9, -0.95], parent: 'legR' },
  footR: { p: [-0.82, 0.3, -1.75], parent: 'shinR' },
  tail1: { p: [0, 1.7, -2.2], parent: 'pelvis' },
  tail2: { p: [0, 1.55, -2.85], parent: 'tail1' },
  tail3: { p: [0, 1.25, -3.4], parent: 'tail2' },
};

function prims() {
  const o = [];
  const body = { fur: 1, glow: 0 };
  // massa do corpo: corcunda gigante, quadril menor
  o.push(ell([0, 1.75, -1.5], [0.82, 0.72, 0.85], 'pelvis', C.fur, { k: 0.3, ...body }));
  o.push(ell([0, 2.15, -0.7], [0.95, 0.85, 0.95], 'sp1', C.fur, { k: 0.4, ...body, glow: 1 }));
  o.push(ell([0, 2.42, 0.1], [1.2, 0.95, 0.9], 'sp2', C.moss, { k: 0.4, ...body, glow: 1 }));
  o.push(ell([0, 2.2, 0.75], [0.62, 0.55, 0.6], 'neck', C.fur, { k: 0.3, fur: 1 }));
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    // braço enorme
    o.push(ell([s * 1.15, 2.3, 0.3], [0.62, 0.62, 0.6], 'arm' + L, C.fur, { k: 0.25, fur: 1 }));
    o.push(cap([s * 1.05, 2.3, 0.25], [s * 1.5, 1.35, 0.55], 0.44, 0.3, 'arm' + L, C.fur, { k: 0.2, fur: 1 }));
    o.push(cap([s * 1.5, 1.35, 0.55], [s * 1.42, 0.38, 0.98], 0.32, 0.26, 'fore' + L, C.fur, { k: 0.12, fur: 0.8 }));
    o.push(ell([s * 1.42, 0.24, 1.08], [0.32, 0.2, 0.34], 'hand' + L, C.hide, { k: 0.1, fur: 0.1 }));
    for (let f = -1; f <= 1; f++) {
      const fx = s * (1.42 + f * 0.19);
      o.push(cap([fx, 0.2, 1.3], [fx + f * 0.05, 0.12, 1.62], 0.09, 0.055, 'hand' + L, C.hide, { k: 0.05, skinSharp: 200 }));
    }
    // perna traseira
    o.push(cap([s * 0.62, 1.55, -1.65], [s * 0.82, 0.9, -0.95], 0.46, 0.27, 'leg' + L, C.fur, { k: 0.2, fur: 1 }));
    o.push(cap([s * 0.82, 0.9, -0.95], [s * 0.82, 0.32, -1.75], 0.25, 0.16, 'shin' + L, C.fur, { k: 0.1, fur: 0.8 }));
    o.push(cap([s * 0.82, 0.22, -1.8], [s * 0.82, 0.16, -1.15], 0.18, 0.14, 'foot' + L, C.hide, { k: 0.1, fur: 0.1, skinSharp: 90 }));
    // galhada: dois ramos com pontas, ligada à máscara
    const base = [s * 0.32, 2.62, 1.05];
    const a1 = [s * 0.72, 3.2, 0.72];
    const a2 = [s * 1.05, 3.75, 0.2];
    const a3 = [s * 1.0, 4.25, -0.3];
    o.push(cap(base, a1, 0.095, 0.07, 'head', C.bone, { k: 0.04, colorSharp: 25 }));
    o.push(cap(a1, a2, 0.07, 0.05, 'head', C.bone, { k: 0.03, colorSharp: 25 }));
    o.push(cap(a2, a3, 0.05, 0.015, 'head', C.bone, { k: 0.02, colorSharp: 25 }));
    o.push(cap(a1, [s * 0.35, 3.75, 0.55], 0.055, 0.012, 'head', C.bone, { k: 0.03, colorSharp: 25 }));
    o.push(cap(a2, [s * 1.55, 3.95, 0.35], 0.045, 0.012, 'head', C.bone, { k: 0.02, colorSharp: 25 }));
    o.push(cap(a2, [s * 0.55, 4.2, 0.0], 0.04, 0.01, 'head', C.bone, { k: 0.02, colorSharp: 25 }));
  }
  // máscara de osso
  o.push(ell([0, 2.42, 1.2], [0.47, 0.4, 0.46], 'head', C.bone, { k: 0.06, colorSharp: 30 }));
  o.push(cap([0, 2.34, 1.5], [0, 2.14, 2.08], 0.27, 0.15, 'head', C.bone, { k: 0.05, colorSharp: 30 }));
  for (const s of [1, -1]) {
    o.push(cap([s * 0.1, 2.58, 1.62], [s * 0.42, 2.62, 1.42], 0.085, 0.075, 'head', C.bone, { k: 0.05, colorSharp: 30 })); // sobrolho
    o.push(cap([s * 0.4, 2.2, 1.42], [s * 0.2, 2.1, 1.78], 0.09, 0.055, 'head', C.bone, { k: 0.05, colorSharp: 30 })); // maçã do rosto
  }
  // mandíbula
  o.push(cap([0, 1.92, 1.25], [0, 1.82, 1.85], 0.27, 0.18, 'jaw', C.boneDark, { k: 0.05, colorSharp: 30, skinSharp: 90 }));
  // órbitas e narinas escavadas
  for (const s of [1, -1]) {
    o.push(ell([s * 0.24, 2.4, 1.72], [0.15, 0.1, 0.2], 'head', C.dark, { sub: true, k: 0.035, rot: [0, 0, s * -0.35] }));
    o.push(ell([s * 0.055, 2.2, 2.16], [0.03, 0.06, 0.08], 'head', C.dark, { sub: true, k: 0.025 }));
  }
  // rabo musgoso
  o.push(cap([0, 1.7, -2.2], [0, 1.55, -2.85], 0.3, 0.2, 'tail1', C.fur, { k: 0.2, fur: 1 }));
  o.push(cap([0, 1.55, -2.85], [0, 1.25, -3.4], 0.2, 0.1, 'tail2', C.moss, { k: 0.1, fur: 1 }));
  o.push(cap([0, 1.25, -3.4], [0, 0.95, -3.85], 0.1, 0.03, 'tail3', C.moss, { k: 0.06, fur: 0.8 }));
  return o;
}

function paint(x, y, z, c, fv, gv) {
  const isBone = c.r > 0.35 && c.g > 0.3;
  if (isBone) {
    // craquelado na máscara
    const n = fbm3(x * 5, y * 5, z * 5);
    c.multiplyScalar(0.72 + n * 0.5);
    return { fur: 0, glow: 0 };
  }
  // musgo no alto das costas, couro por baixo
  const mossy = clamp((y - 2.3) * 1.2 + (noise3(x * 1.3, y * 1.3, z * 1.3) - 0.5) * 1.5);
  const base = new THREE.Color(C.fur).lerp(new THREE.Color(C.moss), mossy).lerp(new THREE.Color(C.mossLit), mossy * mossy * 0.8);
  if (fv > 0.05) {
    const under = clamp((1.7 - y) * 0.8);
    base.multiplyScalar(lerp(1, 0.45, under));
    c.copy(base);
  }
  return { glow: clamp((y - 1.8) * 1.5) * (gv > 0.1 ? 1 : 0) * (Math.abs(x) < 0.9 ? 1 : 0) };
}

function mergeColored(parts) {
  const geo = new THREE.BufferGeometry();
  const nn = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const count = nn.reduce((s, p) => s + p.attributes.position.count, 0);
  for (const name of ['position', 'normal', 'color', 'aGlow']) {
    const size = nn[0].attributes[name].itemSize;
    const arr = new Float32Array(count * size);
    let off = 0;
    for (const p of nn) { arr.set(p.attributes[name].array, off); off += p.attributes[name].array.length; }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return geo;
}
function tint(g, color, glow = 0) {
  const n = g.attributes.position.count;
  const cc = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  const py = g.attributes.position;
  for (let i = 0; i < n; i++) { cc[i * 3] = col.r; cc[i * 3 + 1] = col.g; cc[i * 3 + 2] = col.b; void py; }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g;
}

export class Monster {
  static async create(q) {
    const m = new Monster();
    await m.build(q);
    return m;
  }

  async build(q) {
    const geo = await sculpt(prims(), bones, { cell: q.monsterCell, colorSharp: 18, skinSharp: 5, paint, pad: 0.1, reach: 0.55 });
    const { bones: B, list, root } = buildSkeleton(bones);
    this.B = B;
    for (const [lo, end] of [['shinL', 'footL'], ['shinR', 'footR'], ['foreL', 'handL'], ['foreR', 'handR']]) B[lo].userData.next = B[end].position.clone();

    const ember = new THREE.Color('#ff6a1f');
    const baseOpts = { rim: 0.55, glow: true, veins: true, glowAmp: 3.2, glowColor: ember };
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), baseOpts);
    this.matBody = mat;
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

    // pelo real em cascas
    const furGeo = new THREE.BufferGeometry();
    for (const k of Object.keys(geo.attributes)) furGeo.setAttribute(k, geo.attributes[k]);
    furGeo.setIndex(geo.userData.furIndex);
    furGeo.boundingSphere = geo.boundingSphere;
    for (let i = 1; i <= q.monsterShells; i++) {
      const t = i / q.monsterShells;
      const m = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { fur: true, shell: t, furLen: 0.2, furFreq: 16, droop: 0.05, rim: 0.65 });
      m.color.setScalar(0.42 + t * 0.85);
      const sm = new THREE.SkinnedMesh(furGeo, m);
      sm.frustumCulled = false;
      sm.bind(skel, this.mesh.matrixWorld);
      this.mesh.add(sm);
    }

    // dentes e garras
    const toothMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), { rim: 0.3 });
    this.toothMat = toothMat;
    const upper = [], lower = [], clawsL = [], clawsR = [], clawsFL = [], clawsFR = [];
    const tooth = (x, y, z, r, h, down) => {
      const g = new THREE.ConeGeometry(r, h, 6);
      if (down) g.rotateX(Math.PI);
      return tint(g.translate(x, y, z), C.bone);
    };
    for (let i = 0; i < 9; i++) {
      const a = lerp(-1.25, 1.25, i / 8);
      const x = Math.sin(a) * 0.24;
      const z = 2.17 + 0.22 * (Math.cos(a) - 1) - 0.0;
      const hg = i === 1 || i === 7 ? 0.3 : 0.16 + Math.random() * 0.06;
      upper.push(tooth(x * 0.92, 2.04 - hg / 2 - 2.2, z - 1.16, 0.04, hg, true));
      lower.push(tooth(x * 0.8, hg * 0.4 + 0.02, z - 1.33, 0.035, hg * 0.8, false));
    }
    const fingerClaw = (arr, s, ox, oz, base) => {
      for (let f = -1; f <= 1; f++) {
        const g = new THREE.ConeGeometry(0.065, 0.3, 6).rotateX(Math.PI / 2 + 0.25);
        arr.push(tint(g.translate(s * (ox + f * 0.19) + f * s * 0.05 - base[0], 0.08 - base[1], oz - base[2]), C.claw));
      }
    };
    fingerClaw(clawsL, 1, 1.42, 1.72, bones.handL.p);
    fingerClaw(clawsR, -1, 1.42, 1.72, bones.handR.p);
    fingerClaw(clawsFL, 1, 0.82, -1.0, bones.footL.p);
    fingerClaw(clawsFR, -1, 0.82, -1.0, bones.footR.p);
    const attach = (arr, bone) => {
      const me = new THREE.Mesh(mergeColored(arr), toothMat);
      me.castShadow = false;
      me.frustumCulled = false;
      B[bone].add(me);
      return me;
    };
    attach(upper, 'head');
    attach(lower, 'jaw');
    attach(clawsL, 'handL'); attach(clawsR, 'handR'); attach(clawsFL, 'footL'); attach(clawsFR, 'footR');

    // olhos em brasa
    this.eyeMat = patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 1.5, 0.4) }), { rim: 0 });
    this.eyes = [];
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), this.eyeMat);
      e.position.set(s * 0.24, 2.4 - 2.2, 1.58 - 1.2);
      B.head.add(e);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: '#ff5a20', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
      halo.scale.setScalar(0.62);
      e.add(halo);
      this.eyes.push(e);
    }
    // luz vermelha projetada à frente: quando ele chega perto, o chão e o gnomo avermelham
    this.light = new THREE.PointLight('#ff4518', 10, 15, 1.45);
    this.light.position.set(0, -0.15, 2.9);
    B.head.add(this.light);

    // cogumelos luminosos crescendo nas costas: legíveis pela câmera de trás
    const capG = new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1);
    const stemG = new THREE.CylinderGeometry(0.03, 0.05, 0.16, 6).translate(0, -0.07, 0);
    const shrooms = [];
    const spot = [
      ['sp2', 0.4, 3.4, -0.2, 1.1], ['sp2', -0.55, 3.3, 0.1, 1.3], ['sp2', 0.05, 3.42, 0.35, 0.8], ['sp1', 0.42, 3.0, -0.9, 1.0],
      ['sp1', -0.35, 3.02, -0.8, 0.8], ['sp1', 0.05, 3.05, -0.45, 1.25], ['pelvis', 0.3, 2.48, -1.6, 0.9], ['pelvis', -0.4, 2.42, -1.45, 0.8],
    ];
    const byBone = {};
    for (const [bone, x, y, z, sc] of spot) {
      const bp = bones[bone].p;
      const c = capG.clone().scale(sc, sc, sc).translate(x - bp[0], y - bp[1], z - bp[2]);
      const st = stemG.clone().scale(sc, sc, sc).translate(x - bp[0], y - bp[1], z - bp[2]);
      (byBone[bone] ||= []).push(tint(c, '#ffae57', 1), tint(st, '#e8d8b8', 0.3));
    }
    void shrooms;
    this.shroomMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { rim: 0.3, glow: true, glowAmp: 1.15, glowColor: ember });
    for (const bone in byBone) {
      const me = new THREE.Mesh(mergeColored(byBone[bone]), this.shroomMat);
      me.frustumCulled = false;
      B[bone].add(me);
    }

    this.springs = [new Spring(B.tail1, 40, 6, 1), new Spring(B.tail2, 30, 5, 1.3), new Spring(B.tail3, 22, 4, 1.8)];

    /* animação */
    this.t = 0; this.phase = 0; this.lastFoot = [0, 0, 0, 0];
    this.onFootfall = null;
    this.roar = 0; this.throwT = 1; this.stun = 0; this.lunge = 0; this.pounce = 0; this.emerge = 1; this.lean = 0;
    this.jawOpen = 0.1; this.x = 0; this.running = 0;
    this.hand = new THREE.Vector3();
  }

  throw() { this.throwT = 0; }

  /** param s: { running, speed, roar, stun, lunge, pounce, targetLocal } */
  update(dt, s) {
    const B = this.B;
    this.t += dt;
    const t = this.t;
    this.running = damp(this.running, s.running ?? 0, 3, dt);
    this.roar = damp(this.roar, s.roar ?? 0, 7, dt);
    this.stun = damp(this.stun, s.stun ?? 0, 9, dt);
    this.lunge = damp(this.lunge, s.lunge ?? 0, 7, dt);
    this.pounce = damp(this.pounce, s.pounce ?? 0, 9, dt);
    this.throwT = Math.min(1, this.throwT + dt / 0.9);
    const speed = s.speed ?? 8;
    const R = this.running;

    // galope rotativo: posteriores juntas e anteriores juntas com defasagem
    const cad = (0.95 + speed * 0.05) * (1 - this.stun * 0.8);
    this.phase += cad * dt;
    const ph = this.phase;

    const footCycle = (offs, reach, lift, idx) => {
      const p = (ph + offs) % 1;
      const st = 0.42;
      let z, y;
      if (p < st) { const k = p / st; z = lerp(reach, -reach, k); y = 0; } else {
        const k = (p - st) / (1 - st);
        const e = k * k * (3 - 2 * k);
        z = lerp(-reach, reach, e);
        y = Math.sin(k * Math.PI) * lift;
      }
      // dispara ao pisar (entrada no apoio)
      const inSt = p < st ? 1 : 0;
      if (inSt && !this.lastFoot[idx] && R > 0.5 && this.onFootfall) this.onFootfall(idx);
      this.lastFoot[idx] = inSt;
      return [z * R, y * R];
    };
    const reachFront = 0.85, reachBack = 0.8;
    const [fl, fly] = footCycle(0.0, reachFront, 0.65, 0);
    const [fr, fry] = footCycle(0.12, reachFront, 0.65, 1);
    const [bl, bly] = footCycle(0.5, reachBack, 0.55, 2);
    const [br, bry] = footCycle(0.62, reachBack, 0.55, 3);

    const gal = ph * Math.PI * 2;
    const breathe = Math.sin(t * 1.6);
    // onda de coluna + flexão
    let bodyY = Math.sin(gal + 0.6) * 0.17 * R + breathe * 0.03 * (1 - R);
    let pelvisPitch = Math.sin(gal + 1.7) * 0.2 * R;
    let sp1P = Math.sin(gal + 2.4) * 0.14 * R;
    let sp2P = Math.sin(gal + 3.1) * 0.12 * R + breathe * 0.015;
    let neckP = 0.25 * R + Math.sin(gal + 4.0) * 0.08 * R;
    let headP = -0.1 * R + Math.sin(gal + 4.6) * 0.07 * R;
    let jaw = 0.12 + (Math.sin(t * 1.4) * 0.5 + 0.5) * 0.08 + Math.max(0, Math.sin(gal)) * 0.1 * R;
    let root = 0;
    let armFX = 0, armFY = 0, armFZ = 0; // deslocamento dos braços
    let lhx = 0, lhy = 0, lhz = 0, rhx = 0, rhy = 0, rhz = 0;

    // agachar a frente na corrida: cabeça baixa para o gnomo seguir visível
    sp2P += 0.18 * R;
    bodyY -= 0.28 * R;

    // RUGIDO: empina, abre os braços e a boca
    const ro = this.roar;
    if (ro > 0.001) {
      const quake = Math.sin(t * 34) * 0.018 * ro;
      bodyY += 0.5 * ro;
      pelvisPitch -= 0.3 * ro;
      sp1P -= 0.35 * ro; sp2P -= 0.5 * ro;
      neckP -= 0.15 * ro + quake;
      headP -= 0.25 * ro;
      jaw = lerp(jaw, 0.95, ro);
      lhx += 0.85 * ro; lhy += 1.9 * ro; lhz += 0.1 * ro;
      rhx -= 0.85 * ro; rhy += 1.9 * ro; rhz += 0.1 * ro;
    }
    // ARREMESSO: braço direito arqueia sobre a cabeça e lança
    const th = this.throwT;
    if (th < 1) {
      const up = th < 0.45 ? th / 0.45 : 1 - (th - 0.45) / 0.55;
      const e = up * up * (3 - 2 * up);
      rhy += 3.2 * e; rhx += 1.1 * e; rhz += (th < 0.5 ? -1.3 : 1.6) * e;
      sp2P += (th < 0.45 ? -0.25 : 0.3) * e;
      jaw = Math.max(jaw, 0.5 * e);
    }
    // LUNGE: estica as mãos em direção ao gnomo
    const lu = this.lunge;
    if (lu > 0.001) {
      lhz += 1.5 * lu; lhy += 0.7 * lu; rhz += 1.5 * lu; rhy += 0.7 * lu;
      jaw = Math.max(jaw, 0.65 * lu);
      neckP += 0.2 * lu;
    }
    // RECUO OFUSCADO: esconde a cara e tomba para trás
    const st = this.stun;
    if (st > 0.001) {
      pelvisPitch -= 0.35 * st; sp2P -= 0.55 * st; neckP += 0.35 * st; headP += 0.4 * st;
      root -= 0.5 * st;
      lhy += 2.0 * st; lhz += 0.1 * st; lhx -= 0.6 * st;
      rhy += 2.0 * st; rhz += 0.1 * st; rhx += 0.6 * st;
      jaw = Math.max(jaw, 0.8 * st);
    }
    // BOTE FINAL
    const po = this.pounce;
    if (po > 0.001) {
      bodyY += 0.4 * po; neckP += 0.3 * po; headP -= 0.25 * po;
      jaw = Math.max(jaw, 1 * po * (s.bite ? 0.1 : 1));
      lhz += 1.6 * po; lhy += 0.9 * po; lhx -= 0.6 * po;
      rhz += 1.6 * po; rhy += 0.9 * po; rhx += 0.6 * po;
    }

    /* aplica */
    B.pelvis.position.copy(B.pelvis.userData.rest);
    B.pelvis.position.y += bodyY;
    B.pelvis.position.z += root;
    B.pelvis.rotation.set(pelvisPitch, Math.sin(gal) * 0.06 * R, Math.sin(gal * 0.5) * 0.05 * R);
    B.sp1.rotation.set(sp1P, -Math.sin(gal) * 0.05 * R, 0);
    B.sp2.rotation.set(sp2P, -Math.sin(gal) * 0.07 * R, s.tilt ?? 0);
    B.neck.rotation.set(neckP, s.headYaw ? s.headYaw * 0.5 : 0, 0);
    B.head.rotation.set(headP, s.headYaw ? s.headYaw * 0.5 : 0, Math.sin(t * 0.8) * 0.03);
    this.jawOpen = damp(this.jawOpen, jaw, 14, dt);
    B.jaw.rotation.set(this.jawOpen * 0.75, 0, 0);

    // membros: IK dos alvos no espaço de raiz
    B.root.updateMatrixWorld(true);
    const rootInv = _m.copy(this.mesh.matrixWorld);
    void rootInv;
    B.sp2.updateWorldMatrix(true, false);
    B.pelvis.updateWorldMatrix(true, false);
    const invFront = _m1.copy(B.sp2.matrixWorld).invert().multiply(this.mesh.matrixWorld);
    const invBack = _m2.copy(B.pelvis.matrixWorld).invert().multiply(this.mesh.matrixWorld);

    const poleArmL = _p1.set(0.5, 0.2, -1).transformDirection(invFront);
    const poleArmR = _p2.set(-0.5, 0.2, -1).transformDirection(invFront);
    const poleLeg = _p3.set(0, 0.4, 1).transformDirection(invBack);

    const hL = bones.handL.p, hR = bones.handR.p, fL = bones.footL.p, fR = bones.footR.p;
    _a.set(hL[0] + lhx - R * 0.15, Math.max(hL[1] + fly + lhy - 0.15 * R, 0.25), hL[2] + fl + lhz).applyMatrix4(invFront);
    solveIK(B.armL, B.foreL, _a, poleArmL);
    _a.set(hR[0] + rhx + R * 0.15, Math.max(hR[1] + fry + rhy - 0.15 * R, 0.25), hR[2] + fr + rhz).applyMatrix4(invFront);
    solveIK(B.armR, B.foreR, _a, poleArmR);
    _a.set(fL[0], Math.max(fL[1] + bly, 0.3), fL[2] + bl).applyMatrix4(invBack);
    solveIK(B.legL, B.shinL, _a, poleLeg);
    _a.set(fR[0], Math.max(fR[1] + bry, 0.3), fR[2] + br).applyMatrix4(invBack);
    solveIK(B.legR, B.shinR, _a, poleLeg);

    // mãos/pés ficam na horizontal, pisando de verdade
    for (const [en, up, lo, par, ang] of [
      ['handL', 'armL', 'foreL', 'sp2', (fly > 0.05 ? 0.6 : 0) + (lu + po + ro) * -0.9],
      ['handR', 'armR', 'foreR', 'sp2', (fry > 0.05 ? 0.6 : 0) + (lu + po + ro) * -0.9],
      ['footL', 'legL', 'shinL', 'pelvis', bly > 0.05 ? 0.6 : 0],
      ['footR', 'legR', 'shinR', 'pelvis', bry > 0.05 ? 0.6 : 0],
    ]) {
      B[par].getWorldQuaternion(_qa);
      this.mesh.getWorldQuaternion(_qb);
      _qa.premultiply(_qb.invert());
      _qa.multiply(B[up].quaternion).multiply(B[lo].quaternion).invert();
      B[en].quaternion.copy(_qa).multiply(_qb.setFromAxisAngle(_vx, ang));
    }

    for (let i = 0; i < 3; i++) {
      const sp = this.springs[i];
      sp.step(dt, Math.sin(gal + i) * 4 * R, Math.cos(gal * 0.5 + i) * 3 * R, -0.05 * i, 0);
    }

    /* intensidade dos olhos e das veias */
    const hot = 1 + ro * 1.6 + lu * 0.8;
    const e = 1 - st * 0.9;
    this.eyeMat.color.setRGB(9 * hot * e, 1.5 * hot * e, 0.4 * e);
    this.light.intensity = (s.lightPower ?? 9) * hot * e;
    this.eyes.forEach((m) => { m.children[0].scale.setScalar(0.62 + ro * 0.9); });
  }

  /** posição (no mundo) da mão direita, para soltar o pedregulho */
  handWorld(out) { return this.B.handR.getWorldPosition(out); }
  mouthWorld(out) { return this.B.jaw.getWorldPosition(out); }
}

const _m = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _a = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _vx = new THREE.Vector3(1, 0, 0);
