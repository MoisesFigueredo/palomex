// O Pirangaio: pássaro esquisito de olhos desiguais que voa de frente contra o jogador.
// Esculpido no mesmo SDF dos personagens; todos compartilham a malha e têm esqueleto próprio.
import * as THREE from 'three';
import { patch, depthFor, rnd } from '../core/world.js';
import { cap, ell, sculpt, buildSkeleton } from './sculpt.js';

const C = { body: '#6a2d86', belly: '#f0b6c9', skin: '#f58fa3', beak: '#ffc62e', wing: '#2c1b4d', tip: '#21d6b0', leg: '#e88a2a', crest: '#ff4f7b', mouth: '#4a0f22' };

const bones = {
  root: { p: [0, 0, 0] },
  body: { p: [0, 0.95, 0], parent: 'root' },
  head: { p: [0, 1.16, 0.36], parent: 'body' },
  jaw: { p: [0, 1.11, 0.52], parent: 'head' },
  wingL: { p: [0.22, 1.06, 0], parent: 'body' },
  tipL: { p: [0.6, 1.12, -0.03], parent: 'wingL' },
  wingR: { p: [-0.22, 1.06, 0], parent: 'body' },
  tipR: { p: [-0.6, 1.12, -0.03], parent: 'wingR' },
  legL: { p: [0.1, 0.74, -0.1], parent: 'body' },
  legR: { p: [-0.1, 0.74, -0.1], parent: 'body' },
  tail: { p: [0, 0.98, -0.34], parent: 'body' },
};

function prims() {
  const o = [];
  o.push(ell([0, 0.95, 0], [0.3, 0.27, 0.38], 'body', C.body, { k: 0.06 }));
  o.push(ell([0, 0.86, 0.13], [0.2, 0.17, 0.24], 'body', C.belly, { k: 0.05, colorSharp: 40, glow: 0.12 }));
  // pescoço pelado e comprido demais
  o.push(cap([0, 1.08, 0.22], [0, 1.2, 0.38], 0.09, 0.055, 'head', C.skin, { k: 0.05, skinSharp: 18 }));
  o.push(ell([0, 1.25, 0.42], [0.17, 0.16, 0.17], 'head', C.skin, { k: 0.04 }));
  // bico enorme, de cima e de baixo
  o.push(cap([0, 1.2, 0.54], [0, 1.09, 0.95], 0.095, 0.022, 'head', C.beak, { k: 0.03, colorSharp: 140, glow: 0.35 }));
  o.push(cap([0, 1.1, 0.54], [0, 1.02, 0.84], 0.07, 0.018, 'jaw', C.beak, { k: 0.018, colorSharp: 140, skinSharp: 120, glow: 0.3 }));
  // crista de espinhos bagunçada
  for (const [x, z, h] of [[0.02, 0.4, 0.26], [-0.07, 0.32, 0.22], [0.09, 0.3, 0.17], [-0.01, 0.23, 0.19]]) {
    o.push(cap([x, 1.34, z], [x * 2, 1.34 + h, z - 0.12], 0.035, 0.008, 'head', C.crest, { k: 0.02, colorSharp: 140, glow: 0.5 }));
  }
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    // asas pequenas demais para o corpo
    o.push(cap([s * 0.22, 1.06, 0], [s * 0.6, 1.12, -0.03], 0.1, 0.07, 'wing' + L, C.wing, { k: 0.05, skinSharp: 90 }));
    for (const [dz, len] of [[0.08, 0.34], [-0.03, 0.42], [-0.13, 0.32]]) {
      o.push(cap([s * 0.58, 1.12, -0.03 + dz * 0.5], [s * (0.6 + len), 1.1, -0.03 + dz], 0.05, 0.012, 'tip' + L, C.tip, { k: 0.02, colorSharp: 90, skinSharp: 120, glow: 0.35 }));
    }
    // pernas finas penduradas
    o.push(cap([s * 0.1, 0.76, -0.08], [s * 0.1, 0.42, -0.24], 0.024, 0.016, 'leg' + L, C.leg, { k: 0.02, skinSharp: 200 }));
    for (const a of [-0.45, 0, 0.45]) {
      o.push(cap([s * 0.1, 0.42, -0.24], [s * 0.1 + Math.sin(a) * 0.14, 0.34, -0.24 + Math.cos(a) * 0.14], 0.018, 0.008, 'leg' + L, C.leg, { k: 0.012, skinSharp: 200 }));
    }
  }
  for (const a of [-0.45, 0, 0.45]) {
    o.push(cap([0, 0.98, -0.34], [Math.sin(a) * 0.2, 1.03, -0.68], 0.06, 0.018, 'tail', C.tip, { k: 0.03, colorSharp: 60, skinSharp: 90, glow: 0.3 }));
  }
  return o;
}

function paint(x, y, z, c) {
  // listras tortas nas costas, para não parecer nenhum pássaro de verdade
  if (c.b > c.g && y > 0.98 && z < 0.2 && Math.sin(z * 26 + Math.sin(x * 11) * 1.6) > 0.25) c.multiplyScalar(0.48);
}

/** Textura de divisas correndo pela pista: avisa de onde vem o golpe. */
function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 15; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(8, 86); g.lineTo(32, 42); g.lineTo(56, 86); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 9);
  return t;
}

export class Birds {
  static async create(q, scene) {
    const b = new Birds();
    await b.build(q, scene);
    return b;
  }

  async build(q, scene) {
    const geo = await sculpt(prims(), bones, { cell: q.birdCell, colorSharp: 70, skinSharp: 34, paint, reach: 0.12 });
    const mat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { glow: true, glowSelf: true, glowAmp: 1.7, rim: 1.3 });
    const depth = depthFor({});
    const white = patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.2, 0.85) }), { rim: 0 });
    const pupil = patch(new THREE.MeshBasicMaterial({ color: '#08040a' }), { rim: 0 });
    const eyeG = new THREE.SphereGeometry(1, 14, 10);
    const pupG = new THREE.SphereGeometry(0.44, 10, 8);
    this.tex = chevronTexture();
    this.list = [];
    for (let i = 0; i < 3; i++) {
      const { bones: B, list, root } = buildSkeleton(bones);
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.customDepthMaterial = depth;
      mesh.add(root);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(list), mesh.matrixWorld);
      const eyes = [];
      // um olho enorme, outro minúsculo: cada um olha para um lado
      for (const [x, y, z, r] of [[0.1, 1.35, 0.5, 0.095], [-0.1, 1.31, 0.54, 0.045]]) {
        const e = new THREE.Group();
        e.position.set(x, y - bones.head.p[1], z - bones.head.p[2]);
        e.scale.setScalar(r);
        const w = new THREE.Mesh(eyeG, white);
        const p = new THREE.Mesh(pupG, pupil);
        p.position.set(0, 0.2, 0.68);
        e.add(w, p);
        e.userData.pupil = p;
        B.head.add(e);
        eyes.push(e);
      }
      const group = new THREE.Group();
      group.add(mesh);
      group.rotation.y = Math.PI; // voa contra o jogador
      group.scale.setScalar(1.3);
      group.position.set(0, -50, 0);
      scene.add(group);

      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 34).rotateX(-Math.PI / 2),
        patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 0.55, 2.0), map: this.tex, alphaMap: this.tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }), { rim: 0 }),
      );
      strip.frustumCulled = false;
      strip.renderOrder = 2;
      strip.position.set(0, 0.06, 17);
      scene.add(strip);

      this.list.push({ group, B, eyes, strip, on: false, x: 0, y: 1, z: 60, phase: rnd(6.28), locked: false, passed: false, lane: 0, t: 0, T: 2, own: 0, wob: rnd(6.28) });
    }
  }

  hideAll() { this.list.forEach((b) => { b.group.visible = false; b.strip.visible = false; b.on = false; }); }
  active() { return this.list.some((b) => b.on); }
  free() { return this.list.find((b) => !b.on); }

  launch(x, z, T, speed, lane) {
    const b = this.free();
    if (!b) return null;
    Object.assign(b, { on: true, x, y: 1.0, z, t: 0, T, locked: false, passed: false, lane, closing: z / T, role: 'aim' });
    b.group.visible = true;
    b.strip.visible = true;
    b.strip.material.opacity = 0;
    void speed;
    return b;
  }

  remove(b) { b.on = false; b.group.visible = false; b.strip.visible = false; b.group.position.y = -50; }

  /** Pose: bate as asas sem ritmo, balança a cabeça e cada olho vai para um lado. */
  animate(b, dt) {
    const B = b.B;
    b.phase += dt * (15 + Math.sin(b.t * 3.7 + b.wob) * 5);
    const f = b.phase, t = b.t + b.wob;
    const up = Math.sin(f);
    B.wingL.rotation.z = up * 0.95 + 0.1;
    B.wingR.rotation.z = -up * 0.95 - 0.1;
    B.tipL.rotation.z = Math.sin(f - 0.9) * 0.7;
    B.tipR.rotation.z = -Math.sin(f - 0.9) * 0.7;
    B.body.position.y = bones.body.p[1] + Math.cos(f) * 0.05;
    B.body.rotation.set(Math.sin(t * 2.3) * 0.07, 0, Math.sin(t * 1.7) * 0.14);
    // nariz para cima: a câmera, alta e atrás do gnomo, enxerga a cara
    B.head.rotation.set(-0.42 + Math.sin(t * 5.1) * 0.12, Math.sin(t * 3.1) * 0.25, Math.sin(t * 4.3) * 0.2);
    B.jaw.rotation.x = 0.3 + Math.abs(Math.sin(t * (b.locked ? 15 : 7))) * (b.locked ? 0.55 : 0.28);
    B.legL.rotation.x = Math.sin(t * 7) * 0.3 + 0.25;
    B.legR.rotation.x = Math.sin(t * 6.1 + 1) * 0.3 + 0.25;
    B.tail.rotation.y = Math.sin(t * 8) * 0.3;
    b.eyes[0].userData.pupil.position.x = Math.sin(t * 6.3) * 0.32;
    b.eyes[1].userData.pupil.position.x = Math.cos(t * 9.1) * 0.32;
    b.eyes[1].userData.pupil.position.y = Math.sin(t * 7.7) * 0.32;
    b.eyes[0].scale.setScalar(0.095 * (b.locked ? 1.3 : 1));
  }
}
