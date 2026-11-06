// Acessórios do Tonho: peças presas aos ossos, com capa e cachecol de pano animado.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, clamp, lerp } from '../core/world.js';
import { paintGeo } from './forest.js';

export const SLOTS = [
  { id: 'cabeca', name: 'Cabeça' },
  { id: 'rosto', name: 'Rosto' },
  { id: 'pescoco', name: 'Pescoço' },
  { id: 'costas', name: 'Costas' },
  { id: 'lanterna', name: 'Lanterna' },
  { id: 'pes', name: 'Pés' },
  { id: 'magia', name: 'Magia' },
];

const I = {
  laco: '<path fill="currentColor" d="M12 10.500 3 5v14l9-5.500 9 5.500V5zM10 10h4v4h-4z"/>',
  tapaolho: '<path fill="none" stroke="currentColor" stroke-width="2" d="M2 6l20 3"/><circle cx="9" cy="13" r="5" fill="currentColor"/>',
  bigode: '<path fill="currentColor" d="M12 11c-2-3-5-3-7-1-1 1-2 1-3 0 0 4 3 6 6 5 2-.700 3-2 4-3 1 1 2 2.300 4 3 3 1 6-1 6-5-1 1-2 1-3 0-2-2-5-2-7 1z"/>',
  antena: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M11 21C10 13 8 8 5 6m8 15c1-8 3-13 6-15"/><circle cx="5" cy="5" r="2.500" fill="currentColor"/><circle cx="19" cy="5" r="2.500" fill="currentColor"/>',
  escuros: '<path fill="currentColor" d="M2 8h9v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4zm11 0h9v4a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4z"/>',
  colar: '<path fill="none" stroke="currentColor" stroke-width="2" d="M4 4c1 9 4 12 8 12s7-3 8-12"/><path fill="currentColor" d="M12 15c-2 0-3 1-3 2.500S10.500 22 12 22s3-3 3-4.500S14 15 12 15z"/>',
  bota: '<path fill="currentColor" d="M7 3h7v10l6 3c1 .500 1.500 2 1.500 4H5.500z"/>',
  chifre: '<path fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" d="M9 21C8 14 6 9 3 4m3.500 7L10 6m5 15c1-7 3-12 6-17m-3.500 7L14 6"/>',
  morcego: '<path fill="currentColor" d="M12 9c-2-3-6-4-11-3 2 2 2 5 1 8 1.500-1.500 3-1.500 4 0 1-1.500 2.500-1.500 3.500.500.800-.500 1.700-1 2.500-1s1.700.500 2.500 1c1-2 2.500-2 3.500-.500 1-1.500 2.500-1.500 4 0-1-3-1-6 1-8-5-1-9 0-11 3z"/>',
  foguete: '<path fill="currentColor" d="M12 1c3 3 4 7 4 11l2 4h-3l-1 2h-4l-1-2H6l2-4c0-4 1-8 4-11zM10 20h4l-2 4z"/>',
  aureola: '<ellipse cx="12" cy="9" rx="9" ry="4" fill="none" stroke="currentColor" stroke-width="2.500"/><path fill="currentColor" opacity=".35" d="M7 15h10v6H7z"/>',
  estrela: '<path fill="currentColor" d="M12 2l3 7 7 .800-5.300 4.700L18 22l-6-3.700L6 22l1.300-7.500L2 9.800 9 9z"/>',
  pena: '<path fill="currentColor" d="M19 3C11 4 6 9 5.500 16L3 21l1.500 1 2.500-4c7-.5 12-5.500 12-15z"/>',
  oculos: '<path fill="none" stroke="currentColor" stroke-width="2" d="M3 13a4 4 0 1 0 8 0 4 4 0 1 0-8 0zm10 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0zM11 12c.700-.700 1.300-.700 2 0"/>',
  monoculo: '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 9a5 5 0 1 0 10 0A5 5 0 1 0 5 9zm9 4c2 2 3 4 3 8"/>',
  cachecol: '<path fill="currentColor" d="M5 5c4 2.500 10 2.500 14 0l1 3.500c-1.500 1-3 1.700-4.500 2l2 11-3.500.5-1.800-11.200C10 11 7 10 4 8.500z"/>',
  capa: '<path fill="currentColor" d="M7 3h10l4 18c-2.500-1.500-5.500 1.500-9 0-3.500 1.500-6.500-1.500-9 0z"/>',
  asas: '<path fill="currentColor" d="M11.500 11C9 5 5 2.500 2 4c-1 4 3 8 9.500 7zm1 0C15 5 19 2.500 22 4c1 4-3 8-9.500 7zm-1 1.500C7 12 3.500 14.500 4.500 18c3 1 6-1.500 7-5.500zm1 0c4.500-.500 8 2 7 5.500-3 1-6-1.500-7-5.500z"/>',
  coroa: '<path fill="currentColor" d="M3 8l4.500 4L12 4l4.500 8L21 8l-1.500 11h-15z"/>',
  cartola: '<path fill="currentColor" d="M7 3h10v12H7zM3 16h18v3H3z"/>',
  chama: '<path fill="currentColor" d="M12 2c1 4 6 6.500 6 12a6 6 0 0 1-12 0c0-2.500 1.500-4 2.500-5.500.5 2 1.500 2.500 2 2.500C11 8 10.500 5 12 2z"/>',
  vagalume: '<path fill="currentColor" d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm14 1.500a1.500 1.500 0 1 0 0 3 1.500 1.500 0 0 0 0-3zM6 17.500a1.500 1.500 0 1 0 0 3 1.500 1.500 0 0 0 0-3zm12.500-1a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
};

export const CATALOG = [
  { id: 'pena', slot: 'cabeca', name: 'Pena de Pirangaio', price: 300, desc: 'Arrancada de quem tentou te bicar.', icon: I.pena, color: '#21d6b0' },
  { id: 'oculos', slot: 'rosto', name: 'Óculos de leitura', price: 400, desc: 'Para enxergar o tronco antes de bater.', icon: I.oculos, color: '#e9b23b' },
  { id: 'laco', slot: 'cabeca', name: 'Laço de domingo', price: 500, desc: 'Até na fuga, bem arrumado.', icon: I.laco, color: '#ff7ab8' },
  { id: 'cachecol', slot: 'pescoco', name: 'Cachecol listrado', price: 700, desc: 'Voa atrás de você quando corre.', icon: I.cachecol, color: '#ff6d5a' },
  { id: 'tapaolho', slot: 'rosto', name: 'Tapa-olho pirata', price: 800, desc: 'Metade da visão, o dobro da moral.', icon: I.tapaolho, color: '#c9c4b4' },
  { id: 'bigodao', slot: 'rosto', name: 'Bigodão de respeito', price: 900, desc: 'Barba só não bastava.', icon: I.bigode, color: '#b0703a' },
  { id: 'chamaVerde', slot: 'lanterna', name: 'Chama verde', price: 1000, desc: 'Luz de pântano na floresta inteira.', icon: I.chama, color: '#5fff8a', flame: '#5fff8a' },
  { id: 'antenas', slot: 'cabeca', name: 'Antenas de besouro', price: 1100, desc: 'Balançam a cada passo.', icon: I.antena, color: '#b6ff5a' },
  { id: 'chamaAzul', slot: 'lanterna', name: 'Chama azul', price: 1200, desc: 'Muda a luz real da lanterna.', icon: I.chama, color: '#5fb8ff', flame: '#5fb8ff' },
  { id: 'escuros', slot: 'rosto', name: 'Óculos escuros', price: 1400, desc: 'Correndo do monstro, mas com estilo.', icon: I.escuros, color: '#8d94a8' },
  { id: 'colar', slot: 'pescoco', name: 'Colar de bolotas', price: 1600, desc: 'Para quem tem bolota sobrando.', icon: I.colar, color: '#ffc64d' },
  { id: 'monoculo', slot: 'rosto', name: 'Monóculo chique', price: 1800, desc: 'Fugir, sim. Perder a pose, nunca.', icon: I.monoculo, color: '#ffd76b' },
  { id: 'coroa', slot: 'cabeca', name: 'Coroa de cogumelos', price: 2200, desc: 'Brilha no escuro da floresta.', icon: I.coroa, color: '#ffb347' },
  { id: 'botasOuro', slot: 'pes', name: 'Botas de ouro', price: 2600, desc: 'Pesadas, caras e totalmente inúteis.', icon: I.bota, color: '#ffd24a' },
  { id: 'capa', slot: 'costas', name: 'Capa de herói', price: 3000, desc: 'Ondula no vento da corrida.', icon: I.capa, color: '#a04bd6' },
  { id: 'chamaRosa', slot: 'lanterna', name: 'Chama rosa', price: 3400, desc: 'A floresta em volta muda de cor.', icon: I.chama, color: '#ff6fd0', flame: '#ff6fd0' },
  { id: 'botasAladas', slot: 'pes', name: 'Botas aladas', price: 3800, desc: 'Asinhas nos calcanhares. Só enfeite.', icon: I.bota, color: '#7df3ff' },
  { id: 'chifres', slot: 'cabeca', name: 'Galhada do Cramunhão', price: 4500, desc: 'Ele vai querer de volta.', icon: I.chifre, color: '#e6dcc2' },
  { id: 'cartola', slot: 'cabeca', name: 'Cartolinha na ponta', price: 5000, desc: 'Um chapéu em cima do chapéu.', icon: I.cartola, color: '#c9c4b4' },
  { id: 'morcego', slot: 'costas', name: 'Asas de morcego', price: 6000, desc: 'Batem como quem está atrasado.', icon: I.morcego, color: '#b04bff' },
  { id: 'orbita', slot: 'magia', name: 'Cogumelos em órbita', price: 7000, desc: 'Giram na sua cintura, brilhando.', icon: I.vagalume, color: '#d07bff' },
  { id: 'chamaOuro', slot: 'lanterna', name: 'Chama de ouro', price: 8000, desc: 'Luz de quem já correu muito.', icon: I.chama, color: '#ffd24a', flame: '#ffd24a' },
  { id: 'asas', slot: 'costas', name: 'Asas de fada', price: 9000, desc: 'Não voam. Mas batem bonito.', icon: I.asas, color: '#7df3ff' },
  { id: 'vagalumes', slot: 'magia', name: 'Vagalumes amigos', price: 10000, desc: 'Giram em volta da sua cabeça.', icon: I.vagalume, color: '#f4ff7a' },
  { id: 'foguete', slot: 'costas', name: 'Mochila-foguete', price: 14000, desc: 'Solta fogo de verdade. Não voa também.', icon: I.foguete, color: '#ff8a3c' },
  { id: 'aureola', slot: 'cabeca', name: 'Auréola de sobrevivente', price: 16000, desc: 'Para quem escapou mais de uma vez.', icon: I.aureola, color: '#fff2a0' },
  { id: 'chamaArco', slot: 'lanterna', name: 'Chama arco-íris', price: 20000, desc: 'Passa por todas as cores, sem parar.', icon: I.chama, color: '#ff5fd0', flame: 'arco' },
  { id: 'rastro', slot: 'magia', name: 'Rastro de estrelas', price: 25000, desc: 'O troféu: deixa um rastro por onde passa.', icon: I.estrela, color: '#ffe680', trail: true },
];

const merge = (parts) => mergeGeometries(parts.map((p) => {
  const g = p.index ? p.toNonIndexed() : p;
  g.deleteAttribute('uv');
  return g;
}), false);
const solidColor = (g, color, glow = 0) => paintGeo(g, (c) => { c.set(color); return glow; });

/** Pano preso no alto e solto embaixo, recalculado em JS: poucos vértices, movimento bonito. */
class Cloth {
  constructor(mat, w0, w1, len, cols, rows, paint) {
    Object.assign(this, { w0, w1, len, cols, rows });
    const g = new THREE.PlaneGeometry(1, 1, cols, rows);
    g.deleteAttribute('uv');
    paintGeo(g, () => 0);
    const col = g.attributes.color;
    const c = new THREE.Color();
    const n = (cols + 1) * (rows + 1);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / (cols + 1)), k = r / rows, u = (i % (cols + 1)) / cols;
      paint(c, k, u);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.lift = 0.1;
    this.bulge = 0;
    this.step(0, 0, 0, 0);
  }

  step(dt, t, run, vy) {
    const target = clamp(0.1 + run * 1.05 + vy * -0.05, -0.1, 1.45);
    this.lift += (target - this.lift) * (1 - Math.exp(-dt * 5));
    const p = this.geo.attributes.position;
    const { cols, rows, w0, w1, len } = this;
    for (let r = 0; r <= rows; r++) {
      const k = r / rows;
      // o ângulo cresce pano abaixo, dando a curva natural
      const a = this.lift * (0.45 + k * 0.75);
      const y = -len * k * Math.cos(a);
      // passa por cima da bolsa em vez de atravessá-la
      const over = clamp(k / 0.32);
      const z = -len * k * Math.sin(a) - 0.006 - (this.bulge || 0) * over * over * (3 - 2 * over);
      const w = lerp(w0, w1, k);
      for (let i = 0; i <= cols; i++) {
        const u = i / cols - 0.5;
        const wave = Math.sin(t * (6 + run * 7) - k * 6 + u * 4) * k * (0.012 + run * 0.045);
        p.setXYZ(r * (cols + 1) + i, u * w, y + wave * 0.4, z + wave);
      }
    }
    p.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

export class Wardrobe {
  constructor(gnome) {
    this.gnome = gnome;
    const B = gnome.B;
    this.items = {};
    const solid = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15 }), { glow: true, glowSelf: true, glowAmp: 2, rim: 0.6 });
    const cloth = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), { glow: true, glowSelf: true, glowAmp: 2, rim: 0.55, extraKey: 'cloth' });
    const glass = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }), { glow: true, glowSelf: true, glowAmp: 1.4, rim: 0.9, extraKey: 'wing' });
    const spark = patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.6, 1.4) }), { rim: 0 });
    const add = (id, bone, obj) => {
      obj.visible = false;
      (B[bone]).add(obj);
      (this.items[id] ||= []).push(obj);
      return obj;
    };
    const mesh = (geo, mat = solid) => { const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; };

    /* pena no chapéu */
    const fp = new THREE.PlaneGeometry(0.075, 0.36, 2, 8);
    const pp = fp.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i), k = y / 0.36 + 0.5;
      pp.setX(i, pp.getX(i) * Math.sin(k * Math.PI) * 1.6);
      pp.setZ(i, -k * k * 0.14);
    }
    fp.computeVertexNormals();
    paintGeo(fp, (c, x, y) => { c.set(Math.sin(y * 70) > 0.3 ? '#21d6b0' : '#6a2d86'); return 0.2; });
    const feather = mesh(merge([fp]), cloth);
    feather.position.set(0.135, 0.1, -0.04);
    feather.rotation.set(0.25, 0.3, -0.5);
    add('pena', 'hat1', feather);

    /* óculos */
    const eyeY = 0.835 - 0.74, eyeZ = 0.118 - 0.01 + 0.033;
    const rings = [];
    for (const s of [1, -1]) rings.push(solidColor(new THREE.TorusGeometry(0.043, 0.0065, 8, 22).translate(s * 0.05, eyeY, eyeZ), '#e9b23b', 0.15));
    rings.push(solidColor(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6).rotateZ(Math.PI / 2).translate(0, eyeY + 0.005, eyeZ), '#e9b23b', 0.15));
    for (const s of [1, -1]) rings.push(solidColor(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5).rotateX(Math.PI / 2).translate(s * 0.094, eyeY, eyeZ - 0.06), '#e9b23b', 0.1));
    add('oculos', 'head', mesh(merge(rings)));

    /* monóculo com correntinha */
    const mono = [solidColor(new THREE.TorusGeometry(0.05, 0.008, 8, 24).translate(0.05, eyeY, eyeZ + 0.003), '#ffd76b', 0.3)];
    for (let i = 0; i < 7; i++) mono.push(solidColor(new THREE.SphereGeometry(0.0055, 5, 4).translate(0.095 + i * 0.008, eyeY - 0.03 - i * 0.022, eyeZ - i * 0.012), '#ffd76b', 0.3));
    add('monoculo', 'head', mesh(merge(mono)));

    /* cachecol: gola + duas pontas soltas */
    const neck = new THREE.TorusGeometry(0.118, 0.04, 8, 22).rotateX(Math.PI / 2).translate(0, 0.095, -0.012);
    paintGeo(neck, (c, x, y, z) => { c.set(Math.sin(Math.atan2(z, x) * 7) > 0 ? '#e8533f' : '#f6e7c8'); return 0; });
    add('cachecol', 'chest', mesh(merge([neck])));
    const stripes = (c, k) => c.set(Math.sin(k * 16) > 0 ? '#e8533f' : '#f6e7c8');
    this.scarfA = new Cloth(cloth, 0.07, 0.085, 0.36, 2, 8, stripes);
    this.scarfB = new Cloth(cloth, 0.07, 0.08, 0.26, 2, 6, stripes);
    this.scarfA.bulge = 0.125;
    this.scarfB.bulge = 0.125;
    this.scarfA.mesh.position.set(0.05, 0.075, -0.125);
    this.scarfB.mesh.position.set(-0.04, 0.075, -0.125);
    add('cachecol', 'chest', this.scarfA.mesh);
    add('cachecol', 'chest', this.scarfB.mesh);

    /* capa */
    this.cape = new Cloth(cloth, 0.2, 0.36, 0.5, 6, 10, (c, k, u) => {
      const edge = Math.abs(u - 0.5) > 0.44 || k > 0.92;
      if (edge) c.set('#ffd76b'); else c.set('#7a2fb0').lerp(new THREE.Color('#3f1a6b'), k);
    });
    this.cape.bulge = 0.135;
    this.cape.mesh.position.set(0, 0.075, -0.115);
    add('capa', 'chest', this.cape.mesh);
    const clasp = solidColor(new THREE.SphereGeometry(0.03, 10, 8).translate(0, 0.07, 0.112), '#ffd76b', 0.4);
    add('capa', 'chest', mesh(merge([clasp])));

    /* asas de fada */
    this.wings = [];
    const wingShape = (s) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.bezierCurveTo(0.12, 0.3, 0.42, 0.42, 0.46, 0.2);
      sh.bezierCurveTo(0.48, 0.06, 0.24, -0.03, 0.14, -0.02);
      sh.bezierCurveTo(0.32, -0.08, 0.36, -0.28, 0.2, -0.3);
      sh.bezierCurveTo(0.08, -0.31, 0.02, -0.14, 0, 0);
      const g = new THREE.ShapeGeometry(sh, 14);
      paintGeo(g, (c, x, y) => {
        const v = Math.abs(Math.sin(Math.atan2(y, x) * 9));
        c.set('#7df3ff').lerp(new THREE.Color('#ff8ee0'), clamp(Math.hypot(x, y) * 1.9));
        return v > 0.93 ? 1 : 0.35;
      });
      if (s < 0) g.scale(-1, 1, 1);
      return merge([g]);
    };
    for (const s of [1, -1]) {
      const w = mesh(wingShape(s), glass);
      w.position.set(s * 0.03, 0.03, -0.115);
      w.renderOrder = 3;
      w.userData.side = s;
      add('asas', 'chest', w);
      this.wings.push(w);
    }

    /* coroa de cogumelos em volta da aba */
    const cr = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const x = Math.cos(a) * 0.158, z = Math.sin(a) * 0.155, y = 0.885 - 0.74 + 0.03;
      const s = i % 2 ? 0.8 : 1.1;
      cr.push(solidColor(new THREE.SphereGeometry(0.044 * s, 10, 6, 0, 6.283, 0, 1.65).scale(1, 0.75, 1).translate(x, y + 0.045 * s, z), '#ffb347', 0.75));
      cr.push(solidColor(new THREE.CylinderGeometry(0.012 * s, 0.018 * s, 0.05 * s, 6).translate(x, y + 0.015 * s, z), '#f2e6c8', 0.2));
    }
    add('coroa', 'head', mesh(merge(cr)));

    /* cartolinha na ponta do chapéu */
    const top = [
      solidColor(new THREE.CylinderGeometry(0.052, 0.046, 0.11, 14).translate(0, 0.075, -0.01), '#1c1820'),
      solidColor(new THREE.CylinderGeometry(0.086, 0.086, 0.012, 16).translate(0, 0.022, -0.01), '#1c1820'),
      solidColor(new THREE.CylinderGeometry(0.0485, 0.0475, 0.022, 14).translate(0, 0.04, -0.01), '#ffd76b', 0.3),
    ];
    const hatTop = mesh(merge(top));
    hatTop.rotation.x = -0.3;
    add('cartola', 'hat3', hatTop);

    /* vagalumes em órbita */
    this.flies = new THREE.Group();
    this.flySparks = [];
    const sg = new THREE.SphereGeometry(0.013, 8, 6);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(sg, spark);
      m.frustumCulled = false;
      m.userData.a = (i / 6) * 6.283;
      this.flies.add(m);
      this.flySparks.push(m);
    }
    this.flies.position.set(0, 0.2, 0);
    add('vagalumes', 'head', this.flies);

    /* ---------- segunda coleção ---------- */
    const P = (id, bone, parts, mat = solid) => add(id, bone, mesh(merge(parts), mat));
    const hatY = 0.885 - 0.74;

    /* laço no chapéu */
    {
      const a = (s) => solidColor(new THREE.ConeGeometry(0.052, 0.13, 10).rotateZ(s * Math.PI / 2).scale(1, 1, 0.55).translate(s * 0.075, 0.045, -0.128), '#ff7ab8', 0.08);
      P('laco', 'hat1', [a(1), a(-1), solidColor(new THREE.SphereGeometry(0.027, 10, 8).translate(0, 0.045, -0.13), '#ff4f96', 0.1)]);
    }
    /* tapa-olho */
    {
      const patch1 = solidColor(new THREE.CylinderGeometry(0.044, 0.044, 0.012, 16).rotateX(Math.PI / 2).translate(-0.05, eyeY, eyeZ + 0.006), '#14110f');
      const strap = solidColor(new THREE.TorusGeometry(0.14, 0.0065, 6, 34).rotateX(Math.PI / 2).rotateZ(0.32).translate(0, eyeY + 0.003, -0.005), '#14110f');
      P('tapaolho', 'head', [patch1, strap]);
    }
    /* bigodão */
    {
      const m = [];
      for (const s of [1, -1]) {
        m.push(solidColor(new THREE.CapsuleGeometry(0.03, 0.09, 5, 9).rotateZ(s * 1.2).translate(s * 0.058, 0.012, 0.168), '#6b3a1a'));
        m.push(solidColor(new THREE.CapsuleGeometry(0.018, 0.05, 5, 8).rotateZ(s * 0.3).translate(s * 0.122, 0.045, 0.16), '#6b3a1a'));
      }
      P('bigodao', 'head', m);
    }
    /* antenas */
    this.antennae = [];
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(s * 0.06, 0.09, -0.015);
      g.rotation.z = -s * 0.42;
      const stem = mesh(merge([solidColor(new THREE.CylinderGeometry(0.006, 0.009, 0.2, 6).translate(0, 0.1, 0), '#3a4a18'), solidColor(new THREE.SphereGeometry(0.027, 10, 8).translate(0, 0.21, 0), '#b6ff5a', 0.9)]));
      g.add(stem);
      add('antenas', 'hat1', g);
      this.antennae.push(g);
    }
    /* óculos escuros */
    {
      const q = [];
      for (const s of [1, -1]) {
        q.push(solidColor(new THREE.CylinderGeometry(0.047, 0.047, 0.01, 18).rotateX(Math.PI / 2).translate(s * 0.05, eyeY, eyeZ + 0.003), '#08080c'));
        q.push(solidColor(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5).rotateX(Math.PI / 2).translate(s * 0.096, eyeY, eyeZ - 0.06), '#08080c'));
      }
      q.push(solidColor(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6).rotateZ(Math.PI / 2).translate(0, eyeY + 0.006, eyeZ), '#08080c'));
      P('escuros', 'head', q);
    }
    /* colar de bolotas */
    {
      const c = [solidColor(new THREE.TorusGeometry(0.13, 0.006, 6, 30).rotateX(Math.PI / 2).translate(0, 0.075, -0.012), '#8a5a2b')];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.283 + 0.35;
        const x = Math.cos(a) * 0.132, z = Math.sin(a) * 0.132 - 0.012;
        c.push(solidColor(new THREE.SphereGeometry(0.024, 8, 7).scale(0.85, 1.15, 0.85).translate(x, 0.05, z), '#ffc64d', 0.6));
        c.push(solidColor(new THREE.SphereGeometry(0.021, 8, 5, 0, 6.283, 0, 1.6).scale(1, 0.6, 1).translate(x, 0.062, z), '#6a3f18'));
      }
      P('colar', 'chest', c);
    }
    /* botas */
    for (const side of [1, -1]) {
      const bone = side > 0 ? 'footL' : 'footR';
      // segue o desenho da bota: cano, sola e bico virado
      const gold = (a, b2, r1, r2) => {
        const A = new THREE.Vector3(...a), B3 = new THREE.Vector3(...b2);
        const g = new THREE.CylinderGeometry(r2, r1, A.distanceTo(B3), 12);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B3.clone().sub(A).normalize()));
        g.translate((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2);
        const s1 = new THREE.SphereGeometry(r1, 10, 8).translate(...a);
        const s2 = new THREE.SphereGeometry(r2, 10, 8).translate(...b2);
        return [g, s1, s2].map((x) => solidColor(x, '#ffcf3f', 0.14));
      };
      add('botasOuro', bone, mesh(merge([
        ...gold([0, 0.032, 0.002], [0, -0.01, 0.01], 0.07, 0.07),
        ...gold([0, -0.01, 0.01], [0, -0.01, 0.122], 0.068, 0.058),
        ...gold([0, -0.01, 0.122], [0, 0.032, 0.178], 0.052, 0.026),
      ])));
      // asinha na lateral de fora
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.bezierCurveTo(-0.06, 0.1, -0.18, 0.15, -0.22, 0.13);
      sh.bezierCurveTo(-0.17, 0.1, -0.19, 0.08, -0.2, 0.06); sh.bezierCurveTo(-0.14, 0.06, -0.15, 0.03, -0.16, 0.0);
      sh.bezierCurveTo(-0.09, 0.02, -0.05, 0.0, 0, 0);
      const fin = new THREE.ShapeGeometry(sh, 8);
      paintGeo(fin, (c, x) => { c.set('#f4fbff').lerp(new THREE.Color('#7df3ff'), clamp(-x * 5)); return 0.35; });
      fin.scale(1.5, 1.5, 1);
      fin.rotateY(Math.PI / 2).translate(side * 0.078, 0.02, 0.05);
      add('botasAladas', bone, mesh(merge([fin]), cloth));
    }
    /* galhada */
    {
      const h = [];
      for (const s of [1, -1]) {
        const seg = (a, b2, r1, r2) => {
          const A = new THREE.Vector3(...a), B3 = new THREE.Vector3(...b2);
          const len = A.distanceTo(B3);
          const g = new THREE.CylinderGeometry(r2, r1, len, 7);
          g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B3.clone().sub(A).normalize()));
          g.translate((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2);
          return solidColor(g, '#e6dcc2');
        };
        const r0 = [s * 0.075, 0.03, -0.005], r1 = [s * 0.16, 0.13, -0.03], r2 = [s * 0.19, 0.26, -0.08];
        h.push(seg(r0, r1, 0.02, 0.015), seg(r1, r2, 0.015, 0.006), seg(r1, [s * 0.255, 0.18, -0.03], 0.012, 0.004), seg([s * 0.175, 0.2, -0.055], [s * 0.1, 0.27, -0.06], 0.01, 0.004));
      }
      P('chifres', 'hat1', h);
    }
    /* asas de morcego */
    this.bats = [];
    {
      const batShape = (s) => {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0.04); sh.lineTo(0.17, 0.2); sh.lineTo(0.42, 0.3);
        sh.quadraticCurveTo(0.38, 0.14, 0.44, 0.02); sh.quadraticCurveTo(0.32, 0.05, 0.27, -0.09);
        sh.quadraticCurveTo(0.19, -0.02, 0.1, -0.13); sh.quadraticCurveTo(0.08, -0.04, 0, -0.06); sh.lineTo(0, 0.04);
        const g = new THREE.ShapeGeometry(sh, 8);
        paintGeo(g, (c, x, y) => { c.set('#2a0f3f').lerp(new THREE.Color('#8a1f5e'), clamp(x * 2 - y)); return 0.1; });
        if (s < 0) g.scale(-1, 1, 1);
        return merge([g]);
      };
      for (const s of [1, -1]) {
        const w = mesh(batShape(s), cloth);
        w.position.set(s * 0.03, 0.03, -0.118);
        w.userData.side = s;
        add('morcego', 'chest', w);
        this.bats.push(w);
      }
    }
    /* cogumelos em órbita */
    {
      const o = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.283;
        const x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.3, y = (i % 2) * 0.05;
        o.push(solidColor(new THREE.SphereGeometry(0.05, 10, 6, 0, 6.283, 0, 1.65).scale(1, 0.75, 1).translate(x, y + 0.035, z), '#d07bff', 0.85));
        o.push(solidColor(new THREE.CylinderGeometry(0.012, 0.018, 0.05, 6).translate(x, y + 0.01, z), '#f2e6ff', 0.3));
      }
      this.orbit = mesh(merge(o));
      this.orbit.position.set(0, 0, 0);
      add('orbita', 'spine', this.orbit);
    }
    /* mochila-foguete */
    {
      const r = [];
      for (const s of [1, -1]) {
        r.push(solidColor(new THREE.CylinderGeometry(0.048, 0.048, 0.2, 12).translate(s * 0.06, -0.03, -0.17), '#b7bcc6'));
        r.push(solidColor(new THREE.ConeGeometry(0.048, 0.07, 12).translate(s * 0.06, 0.105, -0.17), '#d9322f'));
        r.push(solidColor(new THREE.CylinderGeometry(0.03, 0.044, 0.04, 10).translate(s * 0.06, -0.15, -0.17), '#3a3d45'));
      }
      r.push(solidColor(new THREE.BoxGeometry(0.1, 0.11, 0.05).translate(0, 0, -0.135), '#3a3d45'));
      P('foguete', 'chest', r);
      this.fires = [];
      const fireM = patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 2.3, 0.5) }), { rim: 0 });
      for (const s of [1, -1]) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.2, 8).rotateX(Math.PI).translate(0, -0.1, 0), fireM);
        f.position.set(s * 0.06, -0.17, -0.17);
        f.frustumCulled = false;
        add('foguete', 'chest', f);
        this.fires.push(f);
      }
    }
    /* auréola */
    {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 28).rotateX(Math.PI / 2), patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 3, 1.5) }), { rim: 0 }));
      halo.position.set(0, 0.075, -0.015);
      halo.rotation.x = -0.3;
      halo.frustumCulled = false;
      add('aureola', 'hat3', halo);
    }
    void hatY;

    this.t = 0;
    this.setAll(true); // visíveis até o pré-aquecimento dos shaders
  }

  setAll(v) { for (const id in this.items) this.items[id].forEach((o) => { o.visible = v; }); }

  /** equip: { slot: idDoItem } */
  apply(equip) {
    this.setAll(false);
    let flame = '#ffb765';
    this.rainbow = false;
    this.trail = false;
    for (const slot in equip) {
      const it = CATALOG.find((c) => c.id === equip[slot]);
      if (!it) continue;
      if (it.flame === 'arco') this.rainbow = true;
      else if (it.flame) flame = it.flame;
      if (it.trail) this.trail = true;
      (this.items[it.id] || []).forEach((o) => { o.visible = true; });
    }
    this.gnome.setFlame(flame);
  }

  update(dt, run, vy) {
    this.t += dt;
    const t = this.t;
    if (this.cape.mesh.visible) this.cape.step(dt, t, run, vy);
    if (this.scarfA.mesh.visible) { this.scarfA.step(dt, t, run, vy); this.scarfB.step(dt, t + 1.3, run * 0.9, vy); }
    if (this.wings[0].visible) {
      const f = 0.55 + Math.sin(t * (run > 0.3 ? 30 : 7)) * (run > 0.3 ? 0.42 : 0.2);
      for (const w of this.wings) w.rotation.set(-0.15, w.userData.side * f, 0);
    }
    if (this.bats[0].visible) {
      const f = 0.5 + Math.sin(t * (run > 0.3 ? 19 : 4.5)) * (run > 0.3 ? 0.55 : 0.16);
      for (const w of this.bats) w.rotation.set(-0.1, w.userData.side * f, 0);
    }
    if (this.antennae[0].visible) {
      this.antennae.forEach((g, i) => { g.rotation.x = Math.sin(t * (run > 0.3 ? 15 : 3) + i) * (0.1 + run * 0.28) - run * 0.5; });
    }
    if (this.orbit.visible) this.orbit.rotation.y = t * 2.1;
    if (this.fires[0].visible) {
      for (const f of this.fires) { const k = 0.65 + Math.random() * 0.5 + run * 0.7; f.scale.set(1, k, 1); }
    }
    if (this.rainbow) { _rb.setHSL((t * 0.22) % 1, 1, 0.62); this.gnome.setFlame(_rb); }
    if (this.flies.visible) {
      for (const m of this.flySparks) {
        const a = m.userData.a + t * 1.7;
        m.position.set(Math.cos(a) * 0.3, Math.sin(a * 2.3) * 0.09, Math.sin(a) * 0.3);
      }
    }
  }
}
const _rb = new THREE.Color();
