// Floresta inteira gerada por código: árvores, samambaias, grama, cogumelos,
// pedras, arcos de pedra rúnica, feixes de luz, névoa e vagalumes.
// Cada tipo é um InstancedMesh em loop no shader: 1 draw call, sem JS por frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, LOOP, BACK, patch, depthFor, heightAt, rng, noise3, fbm3, clamp, lerp } from '../core/world.js';

/* ---------- utilidades de geometria ---------- */
function paintGeo(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal;
  const c = new Float32Array(p.count * 3), a = new Float32Array(p.count);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const glow = fn(col, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)) || 0;
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; a[i] = glow;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(a, 1));
  return g;
}
export function lump(g, amp, f, sx = 1, sy = 1, sz = 1) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    const d = (fbm3(x * f + 3, y * f + 7, z * f) - 0.5) * amp;
    p.setXYZ(i, (x + (x / l) * d) * sx, (y + (y / l) * d) * sy, (z + (z / l) * d) * sz);
  }
  g.computeVertexNormals();
  return g;
}
export { paintGeo };
/** Icosaedro indexado por soldagem: normais suaves mesmo depois de amassar. */
export function blob(r = 1, detail = 2) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  const p = g.attributes.position;
  const map = new Map(), idx = [], np = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = np.length / 3; map.set(k, j); np.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

/* ---------- texturas pintadas em canvas ---------- */
function leafTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(11);
  g.clearRect(0, 0, S, S);
  // miolo opaco (a casca interna da copa amostra este centro)
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.2, 0, 7); g.fill();
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.283, d = Math.sqrt(r()) * S * 0.42;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
    const l = 12 + r() * 20, w = 5 + r() * 7;
    const v = 150 + r() * 105;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save(); g.translate(x, y); g.rotate(r() * 6.283);
    g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, -w, l, 0); g.quadraticCurveTo(0, w, -l, 0); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function fernTexture() {
  const W = 128, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 6); g.stroke();
  for (let y = H - 10; y > 8; y -= 9) {
    const k = y / H;
    const l = 56 * Math.sin(k * Math.PI * 0.95) + 3;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + s * l * 0.5, y - 12, W / 2 + s * l, y - 14);
      g.quadraticCurveTo(W / 2 + s * l * 0.5, y + 2, W / 2, y + 5);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function mistTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const im = g.createImageData(S, S);
  // ruído periódico em torno de um toro, para repetir sem emenda
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const a = (x / S) * 6.283, b = (y / S) * 6.283;
      const nx = Math.cos(a) * 1.6, ny = Math.sin(a) * 1.6, nz = Math.cos(b) * 1.6 + Math.sin(b) * 0.9;
      const v = clamp((fbm3(nx + 5, ny + 2, nz + 8) - 0.28) * 2.2);
      const i = (x + y * S) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = 255;
      im.data[i + 3] = v * 255;
    }
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ---------- árvore ---------- */
function tube(spine, radii, radial, color) {
  // spine: lista de Vector3; radii: raio por anel; displace por ruído + nervuras
  const pos = [], idx = [], col = [], nor = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(1, 0, 0), B2 = new THREE.Vector3();
  const rings = spine.length;
  for (let i = 0; i < rings; i++) {
    const a = spine[Math.max(i - 1, 0)], b = spine[Math.min(i + 1, rings - 1)];
    T.subVectors(b, a).normalize();
    B2.crossVectors(T, N).normalize();
    N.crossVectors(B2, T).normalize();
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const cx = Math.cos(th), sx = Math.sin(th);
      const px = spine[i];
      const rad = radii[i] * (1 + color.rib(th, i / (rings - 1), px));
      const nx = N.x * cx + B2.x * sx, ny = N.y * cx + B2.y * sx, nz = N.z * cx + B2.z * sx;
      const x = px.x + nx * rad, y = px.y + ny * rad, z = px.z + nz * rad;
      pos.push(x, y, z);
      nor.push(nx, ny, nz);
      const c = color.at(x, y, z, th, ny);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const barkA = new THREE.Color('#2a1d16'), barkB = new THREE.Color('#5a4230'), mossC = new THREE.Color('#47702f');
const barkPaint = (mossAmt) => ({
  rib: (th, k, p) => Math.cos(th * 7 + p.y * 0.25) * 0.09 * (1 - k * 0.6) + (noise3(th * 2.5, p.y * 0.7, 3) - 0.5) * 0.3,
  at: (x, y, z, th) => {
    const n = noise3(th * 5, y * 1.6, x) * 0.7 + noise3(th * 22, y * 0.8, z) * 0.3;
    const c = barkA.clone().lerp(barkB, n);
    const m = clamp((1 - y * 0.32) * mossAmt + (noise3(x * 0.8, y * 0.8, z * 0.8) - 0.5) * 2.0);
    return c.lerp(mossC, m * 0.85);
  },
});

function makeTrunkGeo(r, h, baseR, lean) {
  const spine = [], radii = [];
  const sx = r() * 9, sz = r() * 9;
  const n = 11;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const y = -0.8 + k * h;
    spine.push(new THREE.Vector3(
      (noise3(sx, k * 2.4, 1) - 0.5) * h * 0.22 + lean * k * k * h,
      y,
      (noise3(sz, k * 2.4, 5) - 0.5) * h * 0.22,
    ));
    const flare = 1 + 1.25 * Math.pow(1 - clamp(k * 4.5), 3);
    radii.push(baseR * lerp(1, 0.32, Math.pow(k, 0.8)) * flare);
  }
  return { spine, geo: tube(spine, radii, 12, barkPaint(1.4)) };
}

function makeBranch(start, end, r0, r) {
  const n = 6, spine = [], radii = [];
  const droop = 0.5 + r() * 0.8;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    spine.push(new THREE.Vector3().lerpVectors(start, end, k).add(new THREE.Vector3((r() - 0.5) * 0.5, -Math.sin(k * Math.PI) * droop + 0.5 * k, (r() - 0.5) * 0.5)));
    radii.push(r0 * lerp(1, 0.32, k));
  }
  return tube(spine, radii, 6, barkPaint(0.6));
}

/** copa: cards com normal esférica em volta do centro do tufo */
function makeCanopy(blobs, r, cardsPerBlob) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const P = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), D = new THREE.Vector3();
  const A = new THREE.Vector3(0, 1, 0);
  const topC = new THREE.Color('#7fb04a'), midC = new THREE.Color('#3e7a3a'), lowC = new THREE.Color('#163a30');
  let vi = 0;
  const pushCard = (center, R) => {
    D.set(r() - 0.5, (r() - 0.5) * 0.85, r() - 0.5).normalize();
    const shell = 0.45 + r() * 0.55;
    P.copy(center).addScaledVector(D, R * shell);
    U.crossVectors(D, A).normalize();
    if (U.lengthSq() < 0.01) U.set(1, 0, 0);
    V.crossVectors(U, D).normalize();
    const rot = r() * 6.283, cs = Math.cos(rot), sn = Math.sin(rot);
    const size = R * (0.42 + r() * 0.28);
    const ux = (U.x * cs + V.x * sn) * size, uy = (U.y * cs + V.y * sn) * size, uz = (U.z * cs + V.z * sn) * size;
    const vx = (-U.x * sn + V.x * cs) * size, vy = (-U.y * sn + V.y * cs) * size, vz = (-U.z * sn + V.z * cs) * size;
    const light = clamp(0.5 + D.y * 0.55 + (r() - 0.5) * 0.3);
    const c = light < 0.5 ? lowC.clone().lerp(midC, light * 2) : midC.clone().lerp(topC, (light - 0.5) * 2);
    c.offsetHSL((r() - 0.5) * 0.03, 0, 0);
    const ao = lerp(0.6, 1, shell);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(P.x + ux * a + vx * b, P.y + uy * a + vy * b, P.z + uz * a + vz * b);
      nor.push(D.x + (r() - 0.5) * 0.2, D.y + (r() - 0.5) * 0.2, D.z + (r() - 0.5) * 0.2);
      uv.push((a + 1) / 2, (b + 1) / 2);
      col.push(c.r * ao, c.g * ao, c.b * ao);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  };
  for (const b of blobs) {
    for (let i = 0; i < cardsPerBlob; i++) pushCard(b.c, b.R);
    // casca interna opaca para a copa não ficar oca
    const core = lump(blob(b.R * 0.62, 1), b.R * 0.3, 0.8 / b.R);
    const cp = core.attributes.position, cn = core.attributes.normal, ci = core.index;
    const base = vi;
    for (let i = 0; i < cp.count; i++) {
      const lit = clamp(0.3 + cn.getY(i) * 0.4);
      const c = lowC.clone().lerp(midC, lit);
      pos.push(cp.getX(i) + b.c.x, cp.getY(i) + b.c.y, cp.getZ(i) + b.c.z);
      nor.push(cn.getX(i), cn.getY(i), cn.getZ(i));
      uv.push(0.5, 0.5);
      col.push(c.r * 0.55, c.g * 0.55, c.b * 0.55);
      vi++;
    }
    for (let i = 0; i < ci.count; i++) idx.push(base + ci.getX(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function makeTree(seed, q) {
  const r = rng(seed);
  const h = 14 + r() * 6;
  const lean = (r() - 0.5) * 0.12;
  const { spine, geo: trunk } = makeTrunkGeo(r, h, 0.75 + r() * 0.3, lean);
  const parts = [trunk];
  const blobs = [];
  const top = spine[spine.length - 1];
  blobs.push({ c: top.clone().add(new THREE.Vector3(0, 1.5, 0)), R: 4.8 + r() * 1.5 });
  const nb = 5;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * 6.283 + r();
    const si = 5 + Math.floor(r() * 5);
    const s = spine[si];
    const len = 4 + r() * 4;
    const end = s.clone().add(new THREE.Vector3(Math.cos(a) * len, 2 + r() * 2.5, Math.sin(a) * len));
    parts.push(makeBranch(s, end, 0.3 + r() * 0.12, r));
    blobs.push({ c: end.clone().add(new THREE.Vector3(0, 0.6, 0)), R: 3 + r() * 1.7 });
  }
  const canopy = makeCanopy(blobs, r, q.cards);
  return { trunk: mergeGeometries(parts, false), canopy };
}

function makeDeadTree(seed) {
  const r = rng(seed);
  const h = 9 + r() * 4;
  const { spine, geo } = makeTrunkGeo(r, h, 0.6, (r() - 0.5) * 0.3);
  const parts = [geo];
  for (let i = 0; i < 7; i++) {
    const s = spine[3 + Math.floor(r() * 7)];
    const a = r() * 6.283, l = 2 + r() * 3.5;
    const e = s.clone().add(new THREE.Vector3(Math.cos(a) * l, 1 + r() * 2.5, Math.sin(a) * l));
    parts.push(makeBranch(s, e, 0.12 + r() * 0.1, r));
  }
  return mergeGeometries(parts, false);
}

/* ---------- peças menores ---------- */
function mushroomGeo() {
  const capG = new THREE.SphereGeometry(0.5, 18, 10, 0, 6.283, 0, 1.75);
  const p = capG.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setY(i, y * 0.72 + Math.sin(p.getX(i) * 3) * 0.02);
  }
  capG.computeVertexNormals();
  capG.translate(0, 1, 0);
  const cap2 = paintGeo(capG, (c, x, y, z, nx, ny) => {
    const spots = Math.sin(x * 14) * Math.sin(z * 14) * Math.sin(y * 17);
    if (ny < 0.0 || y < 1.0) { c.set('#ffe7b0'); return 1; } // lamelas acendem
    c.set(spots > 0.42 ? '#fff4d8' : '#2e5a8f');
    return spots > 0.42 ? 0.8 : 0.22;
  });
  const stem = new THREE.CylinderGeometry(0.1, 0.17, 1, 10, 3).translate(0, 0.5, 0);
  paintGeo(stem, (c, x, y) => { c.set('#d6d0ba').multiplyScalar(0.55 + y * 0.45); return 0.15 * y; });
  return mergeGeometries([cap2.toNonIndexed(), stem.toNonIndexed()], false);
}

function rockGeo(seed) {
  const g = lump(blob(1, 3), 0.75, 0.9 + seed * 0.2, 1, 0.72, 1);
  return paintGeo(g, (c, x, y, z, nx, ny) => {
    const n = fbm3(x * 2.2 + seed, y * 2.2, z * 2.2);
    c.set('#4c4f55').lerp(new THREE.Color('#7b7a75'), n);
    const moss = clamp((ny - 0.25) * 2.2 + (n - 0.5) * 1.5);
    c.lerp(new THREE.Color('#3f7230'), moss);
    return 0;
  });
}

function archGeo() {
  // arco monumental de pedras soltas com fendas rúnicas acesas
  const parts = [];
  const r = rng(5);
  const R = 7.9, count = 19;
  for (let i = 0; i < count; i++) {
    const a = (i / (count - 1)) * Math.PI;
    const key = i === Math.floor(count / 2);
    const g = lump(new THREE.BoxGeometry(1.15 + r() * 0.2, (key ? 1.5 : 1.25) + r() * 0.2, 1.2 + r() * 0.3, 6, 6, 6), 0.5, 1.6);
    g.rotateZ(a - Math.PI / 2);
    g.translate(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.02 - 0.2, (r() - 0.5) * 0.25);
    g.deleteAttribute('uv');
    paintGeo(g, (c, x, y, z, nx, ny) => {
      const n = fbm3(x * 1.7, y * 1.7, z * 1.7);
      c.set('#3b3f46').lerp(new THREE.Color('#70716c'), n);
      c.lerp(new THREE.Color('#3f7230'), clamp((ny - 0.3) * 1.8 + (n - 0.5) * 1.6));
      return 0;
    });
    // runa em relevo: uma placa emissiva na face
    parts.push(g);
    const strokes = [[0, 0, 0.5, 0], [0.11, 0.1, 0.3, 0.8], [-0.1, -0.1, 0.28, r() > 0.5 ? 0.8 : -0.8], [0.02, r() > 0.5 ? 0.2 : -0.2, 0.2, 1.57]];
    for (const [sx, sy, len, rot] of strokes) {
      const st = new THREE.BoxGeometry(0.045, len, 0.05).rotateZ(rot).translate(sx, sy, -0.64);
      st.rotateZ(a - Math.PI / 2);
      st.translate(Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.02 - 0.2, 0);
      st.deleteAttribute('uv');
      paintGeo(st, (c) => { c.set('#d7fff0'); return key ? 1.2 : 0.8; });
      parts.push(st);
    }
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
}

function crystalGeo() {
  const parts = [];
  const r = rng(9);
  for (let i = 0; i < 6; i++) {
    const h = 0.8 + r() * 1.7;
    const g = new THREE.ConeGeometry(0.16 + r() * 0.16, h, 5, 1);
    g.translate(0, h / 2, 0).rotateZ((r() - 0.5) * 0.8).rotateX((r() - 0.5) * 0.8);
    g.translate((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
    parts.push(paintGeo(g.toNonIndexed(), (c, x, y) => { c.set('#b6fff0'); return 0.45 + y * 0.35; }));
  }
  const m = mergeGeometries(parts, false);
  m.computeVertexNormals();
  return m;
}

function grassTuft() {
  const parts = [];
  const r = rng(4);
  const blades = 6;
  const pos = [], nor = [], col = [], idx = [];
  let vi = 0;
  for (let b = 0; b < blades; b++) {
    const a = r() * 6.283, ox = (r() - 0.5) * 0.28, oz = (r() - 0.5) * 0.28;
    const dx = Math.cos(a), dz = Math.sin(a);
    const h = 0.3 + r() * 0.35, w = 0.035 + r() * 0.02, bend = 0.1 + r() * 0.22;
    const segs = 3;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const y = k * h, off = k * k * bend, wid = w * (1 - k * 0.9);
      for (const s of [-1, 1]) {
        pos.push(ox + dx * off + -dz * wid * s, y, oz + dz * off + dx * wid * s);
        nor.push(dx * 0.25, 0.95, dz * 0.25);
        const l = 0.4 + k * 0.75;
        col.push(0.26 * l, 0.48 * l, 0.2 * l);
      }
      if (i < segs) { idx.push(vi, vi + 1, vi + 2, vi + 2, vi + 1, vi + 3); }
      vi += 2;
    }
  }
  void parts;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function fernGeo() {
  const pos = [], nor = [], uv = [], idx = [];
  let vi = 0;
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * 6.283;
    const dx = Math.cos(a), dz = Math.sin(a);
    const L = 1.0, W = 0.26, segs = 4;
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const d = k * L * 0.95;
      const y = Math.sin(k * 2.0) * 0.55 - k * k * 0.3;
      for (const s of [-1, 1]) {
        pos.push(dx * d - dz * W * s, y, dz * d + dx * W * s);
        nor.push(dx * 0.3, 0.9, dz * 0.3);
        uv.push((s + 1) / 2, k);
      }
      if (i < segs) idx.push(vi, vi + 1, vi + 2, vi + 2, vi + 1, vi + 3);
      vi += 2;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------- GLSL comum aos efeitos aditivos ---------- */
const WRAP_V = /* glsl */ `
uniform float uTime, uScroll, uLoop, uBack; uniform vec2 uBend;
vec3 wrapZ(vec3 p){ p.z = mod(p.z - uScroll + uBack, uLoop) - uBack; return p; }
vec4 bendW(vec4 w){ float d = w.z - cameraPosition.z; w.x += uBend.x*d*d; w.y += uBend.y*d*d; return w; }
`;
const OUT_F = `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

/* ---------- monta a floresta ---------- */
export function buildForest(scene, q) {
  const r = rng(2024);
  const place = (mesh, i, x, z0, s, rotY = r() * 6.283, sink = 0, sy = s) => {
    const y = heightAt(x, z0) - sink;
    _d.position.set(x, y, z0);
    _d.rotation.set(0, rotY, 0);
    _d.scale.set(s, sy, s);
    _d.updateMatrix();
    mesh.setMatrixAt(i, _d.matrix);
  };
  const inst = (geo, mat, count, opts = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.frustumCulled = false;
    m.castShadow = !!opts.cast;
    m.receiveShadow = opts.receive !== false;
    if (opts.depth) m.customDepthMaterial = opts.depth;
    scene.add(m);
    return m;
  };
  const wrapBase = { wrap: true };

  /* árvores */
  const leafTex = leafTexture();
  const barkMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { ...wrapBase, wind: 0.00025, rim: 0.35, tint: true });
  const barkDepth = depthFor({ ...wrapBase, wind: 0.00025 });
  const leafMat = patch(new THREE.MeshLambertMaterial({ vertexColors: true, map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide }), { ...wrapBase, wind: 0.00035, flutter: 0.05, rim: 0.3, tint: true, extraKey: 'leaf' });
  // copa não inverte a normal no verso: é o truque da folhagem fofa
  const priorLeaf = leafMat.onBeforeCompile;
  leafMat.onBeforeCompile = (s, re) => {
    priorLeaf(s, re);
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
  };
  leafMat.shadowSide = THREE.DoubleSide;
  const leafDepth = depthFor({ ...wrapBase, wind: 0.00035 }, { map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const kinds = [makeTree(31, q), makeTree(87, q), makeTree(142, q)];
  const treePlaces = [];
  const zStep = LOOP / q.trees;
  for (let i = 0; i < q.trees; i++) {
    const near = i % 2 === 0;
    const side = i % 4 < 2 ? 1 : -1;
    const x = side * (near ? 6.6 + r() * 4.5 : 12 + r() * 24);
    treePlaces.push({ x, z: i * zStep + r() * zStep * 0.6, s: near ? 0.85 + r() * 0.4 : 0.75 + r() * 0.55, k: i % 3 });
  }
  kinds.forEach((kind, ki) => {
    const list = treePlaces.filter((t) => t.k === ki);
    const trunk = inst(kind.trunk, barkMat, list.length, { cast: true, depth: barkDepth });
    const canopy = inst(kind.canopy, leafMat, list.length, { cast: true, depth: leafDepth, receive: false });
    list.forEach((t, i) => {
      const rot = r() * 6.283;
      place(trunk, i, t.x, t.z, t.s, rot);
      place(canopy, i, t.x, t.z, t.s, rot);
    });
  });

  /* árvores mortas retorcidas: silhuetas contra a lua */
  const dead = inst(makeDeadTree(9), barkMat, q.dead, { cast: true, depth: barkDepth });
  for (let i = 0; i < q.dead; i++) place(dead, i, (i % 2 ? 1 : -1) * (5.6 + r() * 7), (i / q.dead) * LOOP + r() * 8, 0.8 + r() * 0.5);

  /* grama */
  const grassMat = patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { ...wrapBase, wind: 0.42, rim: 0.2, tint: true, extraKey: 'grass' });
  const grassCol = new THREE.Color();
  const grass = inst(grassTuft(), grassMat, q.grass, {});
  grass.castShadow = false;
  for (let i = 0; i < q.grass; i++) {
    const t = Math.pow(r(), 1.7);
    const x = (r() < 0.5 ? -1 : 1) * (3.05 + t * 22);
    const s = 0.8 + r() * 1.5;
    place(grass, i, x, r() * LOOP, s, undefined, 0.02, s * (0.8 + r() * 0.8));
    grassCol.setHSL(0.26 + r() * 0.1, 0.45, 0.32 + r() * 0.42);
    grass.setColorAt(i, grassCol);
  }

  /* samambaias */
  const fernTex = fernTexture();
  const fernMat = patch(new THREE.MeshLambertMaterial({ color: '#4f9148', map: fernTex, alphaTest: 0.45, side: THREE.DoubleSide }), { ...wrapBase, wind: 0.22, rim: 0.3, tint: true, extraKey: 'fern' });
  const ferns = inst(fernGeo(), fernMat, q.ferns, {});
  ferns.castShadow = false;
  for (let i = 0; i < q.ferns; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (3.3 + Math.pow(r(), 1.5) * 16);
    place(ferns, i, x, r() * LOOP, 0.8 + r() * 1.6);
    grassCol.setHSL(0.28 + r() * 0.08, 0.5, 0.4 + r() * 0.4);
    ferns.setColorAt(i, grassCol);
  }

  /* cogumelos luminosos */
  const glowOpt = { ...wrapBase, glow: true, rim: 0.3 };
  const shroomMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), { ...glowOpt, glowAmp: 1.15, extraKey: 'shr' });
  const shroomDepth = depthFor(wrapBase);
  const shrooms = inst(mushroomGeo(), shroomMat, q.shrooms, { cast: true, depth: shroomDepth });
  const shroomSpots = [];
  for (let i = 0; i < q.shrooms; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (3.5 + Math.pow(r(), 1.8) * 10);
    const z = r() * LOOP;
    const s = i % 13 === 0 ? 1.6 + r() * 1.3 : 0.3 + r() * 0.65;
    place(shrooms, i, x, z, s, undefined, 0, s * (0.9 + r() * 0.4));
    shroomSpots.push({ x, z, s });
  }

  /* cristais */
  const crystalMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, flatShading: true }), { ...glowOpt, glowAmp: 1.1, rim: 0.5, extraKey: 'cry' });
  const crystals = inst(crystalGeo(), crystalMat, q.crystals, { cast: false });
  const crystalSpots = [];
  for (let i = 0; i < q.crystals; i++) {
    const x = (r() < 0.5 ? -1 : 1) * (4.2 + r() * 9);
    const z = r() * LOOP, s = 0.5 + r() * 0.9;
    place(crystals, i, x, z, s);
    crystalSpots.push({ x, z, s: s * 1.4 });
  }

  /* pedras */
  const rockMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), { ...wrapBase, rim: 0.25, tint: true, extraKey: 'rock' });
  const rockDepth = depthFor(wrapBase);
  const rockGeoA = rockGeo(1), rockGeoB = rockGeo(2);
  const rocksA = inst(rockGeoA, rockMat, q.rocks, { cast: true, depth: rockDepth });
  const rocksB = inst(rockGeoB, rockMat, q.pebbles, { cast: false });
  for (let i = 0; i < q.rocks; i++) place(rocksA, i, (r() < 0.5 ? -1 : 1) * (4 + r() * 18), r() * LOOP, 0.5 + r() * 1.8, undefined, 0.15);
  // meio-fio de pedrinhas marcando a estrada: dá leitura de pista e profundidade
  for (let i = 0; i < q.pebbles; i++) {
    const x = (i % 2 ? 1 : -1) * (3.2 + r() * 0.5);
    place(rocksB, i, x, (i / q.pebbles) * LOOP + r() * 2, 0.1 + r() * 0.26, undefined, 0.03);
  }

  /* arcos rúnicos sobre a estrada */
  const archMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { ...glowOpt, glowAmp: 3, rim: 0.3, extraKey: 'arch' });
  const arches = inst(archGeo(), archMat, 3, { cast: true, depth: rockDepth });
  for (let i = 0; i < 3; i++) {
    _d.position.set(0, 0, 30 + i * 64); _d.rotation.set(0, 0, 0); _d.scale.setScalar(1); _d.updateMatrix();
    arches.setMatrixAt(i, _d.matrix);
  }

  /* poças de luz no chão + halos (luz falsa barata em volta dos brilhos) */
  const spots = [...shroomSpots.filter((s) => s.s > 0.5), ...crystalSpots];
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolMat = new THREE.ShaderMaterial({
    uniforms: G, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${WRAP_V} attribute vec2 instanceSize; varying vec2 vU; varying float vFade; varying vec3 vWorld;
      void main(){ vU = uv-0.5; vec3 o = instanceMatrix[3].xyz; vec3 org = wrapZ(o);
        vec4 w = vec4(position * instanceMatrix[0][0], 1.0); w.xyz += org;
        vec4 b = bendW(w); vFade = 1.0 - smoothstep(30.0,70.0,length(b.xyz-cameraPosition));
        gl_Position = projectionMatrix*viewMatrix*b; }`,
    fragmentShader: `uniform vec3 uGlowCol; varying vec2 vU; varying float vFade;
      void main(){ float d = length(vU)*2.0; float a = pow(max(1.0-d,0.0),2.2)*vFade;
        gl_FragColor = vec4(uGlowCol*a*0.38,1.0); ${OUT_F} }`,
  });
  const pools = inst(poolGeo, poolMat, spots.length, { receive: false });
  spots.forEach((s, i) => {
    _d.position.set(s.x, heightAt(s.x, s.z) + 0.04, s.z); _d.rotation.set(0, 0, 0);
    _d.scale.setScalar(2.5 + s.s * 3); _d.updateMatrix();
    pools.setMatrixAt(i, _d.matrix);
  });

  /* feixes de luz: quads aditivos inclinados entre as árvores */
  const shaftGeo = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { ...G, uShaftAmp: { value: q.shaftAmp } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `${WRAP_V} varying vec2 vU; varying float vF; varying float vR;
      void main(){ vU = uv; vec3 o = wrapZ(instanceMatrix[3].xyz);
        vec3 lp = (mat3(instanceMatrix)*position);
        vec4 w = vec4(lp + o, 1.0); vec4 b = bendW(w);
        float d = length(b.xyz - cameraPosition);
        vF = smoothstep(4.0, 16.0, d) * (1.0 - smoothstep(55.0, 110.0, d));
        vR = fract(o.x*7.13);
        gl_Position = projectionMatrix*viewMatrix*b; }`,
    fragmentShader: `uniform vec3 uFogGlow; uniform float uTime, uShaftAmp; varying vec2 vU; varying float vF; varying float vR;
      void main(){ float e = pow(sin(vU.x*3.14159),2.0); float h = smoothstep(0.0,0.2,vU.y)*smoothstep(1.0,0.45,vU.y)*0.9 + 0.1;
        float st = 0.72 + 0.28*sin(vU.x*19.0 + vR*30.0 + uTime*0.35);
        float a = e*h*st*vF*(0.75+0.25*sin(uTime*0.6+vR*20.0));
        gl_FragColor = vec4(uFogGlow*a*uShaftAmp,1.0); ${OUT_F} }`,
  });
  const shafts = inst(shaftGeo, shaftMat, q.shafts, { receive: false });
  for (let i = 0; i < q.shafts; i++) {
    const x = (r() - 0.5) * 22;
    const y = 15;
    const z = r() * LOOP;
    _d.position.set(x, y, z);
    _d.rotation.set(0.36, 0.5 * (r() - 0.5), -0.12 + x * -0.006);
    _d.scale.set(2 + r() * 4.2, 22, 1);
    _d.updateMatrix();
    shafts.setMatrixAt(i, _d.matrix);
  }

  /* camadas de névoa rasteira */
  const mistTex = mistTexture();
  const mistMat = (y, sc, sp, op) => new THREE.ShaderMaterial({
    uniforms: { ...G, uMist: { value: mistTex }, uO: { value: op }, uS: { value: sc }, uSp: { value: sp } },
    transparent: true, depthWrite: false,
    vertexShader: `${WRAP_V} varying vec3 vW; varying vec3 vWb; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 b = bendW(w); vWb = b.xyz; gl_Position = projectionMatrix*viewMatrix*b; }`,
    fragmentShader: `uniform sampler2D uMist; uniform float uTime,uScroll,uO,uS,uSp; uniform vec3 uFog,uFogGlow,uMoonDir; varying vec3 vW; varying vec3 vWb;
      void main(){ vec2 p = vec2(vW.x, vW.z + uScroll);
        float a = texture2D(uMist, p*uS + vec2(uTime*uSp, uTime*uSp*0.4)).a;
        a *= texture2D(uMist, p*uS*0.37 + vec2(-uTime*uSp*0.5, 0.3)).a*1.8;
        float d = length(vWb-cameraPosition);
        a *= smoothstep(11.0,30.0,d)*(1.0-smoothstep(60.0,120.0,d));
        vec3 ray = normalize(vWb-cameraPosition);
        float s = pow(max(dot(ray,uMoonDir),0.0),5.0);
        vec3 col = mix(uFog*1.15,uFogGlow,s*0.7);
        gl_FragColor = vec4(col, a*uO); ${OUT_F} }`,
  });
  const mistGeo = new THREE.PlaneGeometry(100, 170, 8, 34).rotateX(-Math.PI / 2).translate(0, 0, 62);
  const mists = [
    new THREE.Mesh(mistGeo, mistMat(0.3, 0.045, 0.012, q.mist)),
    new THREE.Mesh(mistGeo, mistMat(1.1, 0.03, -0.009, q.mist * 0.7)),
  ];
  mists[0].position.y = 0.32; mists[1].position.y = 1.15;
  mists.forEach((m) => { m.renderOrder = 1; m.frustumCulled = false; scene.add(m); });

  /* vagalumes */
  const count = q.fireflies;
  const fp = new Float32Array(count * 3), fs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    fp[i * 3] = (r() - 0.5) * 34; fp[i * 3 + 1] = 0.25 + r() * r() * 6; fp[i * 3 + 2] = r() * LOOP;
    fs[i * 2] = r() * 6.283; fs[i * 2 + 1] = 0.6 + r() * 1.3;
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  fg.setAttribute('aS', new THREE.BufferAttribute(fs, 2));
  const fm = new THREE.ShaderMaterial({
    uniforms: { ...G, uPx: { value: q.pixelScale } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${WRAP_V} attribute vec2 aS; uniform float uPx; varying float vA;
      void main(){ vec3 p = position; float t = uTime*aS.y;
        p += vec3(sin(t+aS.x)*0.7, sin(t*1.3+aS.x*2.0)*0.45, cos(t*0.8+aS.x)*0.7);
        vec4 w = bendW(vec4(wrapZ(p),1.0)); vec4 mv = viewMatrix*w;
        float blink = pow(sin(uTime*aS.y*1.7+aS.x*3.0)*0.5+0.5, 3.0);
        vA = (0.15+blink)*(1.0-smoothstep(40.0,90.0,-mv.z));
        gl_PointSize = uPx*(0.12+blink*0.14)/max(-mv.z,1.0)*500.0; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uGlowCol; varying float vA;
      void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = pow(max(1.0-d,0.0),2.5)*vA;
        gl_FragColor = vec4(mix(uGlowCol, vec3(1.0,0.95,0.5), 0.55)*a*5.0,1.0); ${OUT_F} }`,
  });
  const ff = new THREE.Points(fg, fm);
  ff.frustumCulled = false;
  ff.renderOrder = 3;
  scene.add(ff);

  /* folhas caindo */
  const lc = q.leaves;
  const lp = new Float32Array(lc * 3), la = new Float32Array(lc * 2);
  for (let i = 0; i < lc; i++) {
    lp[i * 3] = (r() - 0.5) * 22; lp[i * 3 + 1] = r() * 12; lp[i * 3 + 2] = r() * LOOP * 0.5;
    la[i * 2] = r() * 6.283; la[i * 2 + 1] = 0.7 + r() * 0.8;
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lg.setAttribute('aS', new THREE.BufferAttribute(la, 2));
  const lm = new THREE.ShaderMaterial({
    uniforms: { ...G, uPx: { value: q.pixelScale } }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime,uScroll,uPx; uniform vec2 uBend; attribute vec2 aS; varying float vR; varying float vA;
      void main(){ vec3 p = position; float t = uTime*aS.y;
        p.y = mod(p.y - t*0.9, 12.0);
        p.x += sin(t*1.3+aS.x)*1.3; p.z = mod(p.z - uScroll*1.0 + sin(t+aS.x)*1.0 + 14.0, 96.0) - 14.0;
        vec4 w = vec4(p,1.0); float d = w.z-cameraPosition.z; w.x += uBend.x*d*d; w.y += uBend.y*d*d;
        vec4 mv = viewMatrix*w; vR = t*2.0+aS.x; vA = 1.0-smoothstep(25.0,60.0,-mv.z);
        gl_PointSize = uPx*0.16/max(-mv.z,1.0)*500.0; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uRimCol, uTint; varying float vR; varying float vA;
      void main(){ vec2 q = gl_PointCoord-0.5; float c = cos(vR), s = sin(vR); q = vec2(c*q.x-s*q.y, s*q.x+c*q.y);
        q.y *= 1.0+abs(sin(vR*0.7))*3.0; float a = smoothstep(0.5,0.4,length(q)+abs(q.x)*0.5)*vA;
        if (a<0.05) discard; vec3 col = mix(vec3(0.62,0.33,0.1),vec3(0.2,0.42,0.12),fract(vR*0.1))*0.8*uTint + uRimCol*0.05;
        gl_FragColor = vec4(col,a); ${OUT_F} }`,
  });
  const lf = new THREE.Points(lg, lm);
  lf.frustumCulled = false;
  lf.renderOrder = 2;
  scene.add(lf);
}

const _d = new THREE.Object3D();
void BACK;
