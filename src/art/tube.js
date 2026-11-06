// Fase extra: o tobogã por dentro do tronco velho gigante, a boca do tronco na estrada,
// os itens que abrem a fase (folha de cannabis e cogumelo mágico) e o trenó do gnomo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patch, fbm3, clamp, rng, NOISE_GLSL } from '../core/world.js';
import { blob, lump, paintGeo } from './forest.js';

export const TUBE_R = 3.6;
export const THETA = 0.72; // ângulo entre as pistas, em radianos

const merge = (parts) => mergeGeometries(parts.map((p) => {
  const g = p.index ? p.toNonIndexed() : p;
  g.deleteAttribute('uv');
  return g;
}), false);

/* ---------- itens ---------- */
function leafGeo() {
  // sete folíolos serrilhados, do maior no centro aos menores na base
  const parts = [];
  const blades = [[0, 0.92], [0.62, 0.82], [-0.62, 0.82], [1.22, 0.62], [-1.22, 0.62], [1.95, 0.36], [-1.95, 0.36]];
  for (const [a, len] of blades) {
    const sh = new THREE.Shape();
    const n = 9, w = 0.105;
    sh.moveTo(0, 0);
    for (let i = 1; i <= n; i++) { const k = i / n; const wd = Math.sin(k * Math.PI) ** 0.8 * w * (i % 2 ? 1.25 : 0.72); sh.lineTo(wd, k * len); }
    for (let i = n - 1; i >= 1; i--) { const k = i / n; const wd = Math.sin(k * Math.PI) ** 0.8 * w * (i % 2 ? 1.25 : 0.72); sh.lineTo(-wd, k * len); }
    sh.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(sh);
    paintGeo(g, (c, x, y) => { const vein = Math.abs(x) < 0.012; c.set(vein ? '#d8ff9a' : '#39d353').lerp(new THREE.Color('#123f1a'), vein ? 0 : clamp(1 - y / len) * 0.5); return vein ? 1 : 0.55; });
    g.rotateZ(-a);
    parts.push(g);
  }
  parts.push(paintGeo(new THREE.CylinderGeometry(0.018, 0.024, 0.3, 6).translate(0, -0.15, 0), (c) => { c.set('#7dbb4a'); return 0.3; }));
  return merge(parts).translate(0, 0.1, 0);
}
function magicShroomGeo() {
  const cap = new THREE.SphereGeometry(0.42, 20, 12, 0, 6.283, 0, 1.72).scale(1, 0.78, 1).translate(0, 0.42, 0);
  paintGeo(cap, (c, x, y, z, nx, ny) => {
    if (ny < 0.02) { c.set('#ffe2f4'); return 1; }
    const a = Math.atan2(z, x);
    const dots = Math.sin(a * 5) * Math.sin(y * 18 + a * 2);
    c.set(dots > 0.5 ? '#fff6c2' : '#b13cff').lerp(new THREE.Color('#ff3fb4'), clamp((0.74 - y) * 2.4));
    return dots > 0.5 ? 1 : 0.6;
  });
  const stem = new THREE.CylinderGeometry(0.1, 0.15, 0.46, 12).translate(0, 0.2, 0);
  paintGeo(stem, (c, x, y) => { c.set('#f6ecff').lerp(new THREE.Color('#58e0ff'), clamp(0.5 - y)); return 0.45; });
  return merge([cap, stem]).translate(0, -0.3, 0);
}

/* ---------- a boca do tronco ---------- */
function barkPaint(g, seed = 0) {
  return paintGeo(g, (c, x, y, z, nx, ny) => {
    const a = Math.atan2(y, x);
    const n = fbm3(Math.cos(a) * 3 + seed, Math.sin(a) * 3, z * 0.5);
    c.set('#21140c').lerp(new THREE.Color('#6a4a2d'), n);
    c.lerp(new THREE.Color('#4a8236'), clamp((ny - 0.5) * 1.7 + (n - 0.5) * 2));
    return 0.05;
  });
}
function portalGeo() {
  const Ro = 7.4, Ri = 4.7, L = 16;
  const parts = [];
  const outer = new THREE.CylinderGeometry(Ro, Ro * 1.06, L, 34, 14, true).rotateX(Math.PI / 2);
  const op = outer.attributes.position;
  for (let i = 0; i < op.count; i++) {
    const x = op.getX(i), y = op.getY(i), z = op.getZ(i);
    const a = Math.atan2(y, x);
    const d = 1 + Math.cos(a * 15 + z * 0.3) * 0.022 + (fbm3(Math.cos(a) * 2.4, Math.sin(a) * 2.4, z * 0.22) - 0.5) * 0.3;
    op.setXYZ(i, x * d, y * d, z);
  }
  outer.computeVertexNormals();
  parts.push(barkPaint(outer));
  const inner = new THREE.CylinderGeometry(Ri, Ri, L, 30, 3, true).rotateX(Math.PI / 2);
  paintGeo(inner, (c, x, y, z) => { c.set('#3a2412').lerp(new THREE.Color('#0d0705'), clamp((z + L / 2) / L * 1.5)); return 0; });
  parts.push(inner);
  // face cortada: anéis de crescimento à mostra, a cara de "tronco velho"
  const face = new THREE.RingGeometry(Ri, Ro * 1.1, 42, 6).rotateY(Math.PI);
  const fp = face.attributes.position;
  for (let i = 0; i < fp.count; i++) { fp.setZ(i, (fbm3(fp.getX(i) * 0.4, fp.getY(i) * 0.4, 2) - 0.5) * 0.5); }
  face.computeVertexNormals();
  face.translate(0, 0, -L / 2);
  paintGeo(face, (c, x, y) => {
    const r = Math.hypot(x, y) + (fbm3(x * 0.5, y * 0.5, 4) - 0.5) * 0.7;
    c.set(Math.sin(r * 9) > 0 ? '#c9975a' : '#6d4827');
    return 0.1;
  });
  parts.push(face);
  // fungos acesos em volta da boca
  const r = rng(61);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rad = Ri + 0.4 + r() * 1.7, s = 0.5 + r() * 1.1;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    const cp = new THREE.SphereGeometry(0.15 * s, 10, 6, 0, 6.283, 0, 1.65).scale(1, 0.6, 1).rotateX(-0.5).translate(x, y, -L / 2 - 0.22 * s);
    parts.push(paintGeo(cp, (c) => { c.set('#ffb347'); return 0.2; }));
  }
  // raízes grossas descendo pelas laterais
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const rt = new THREE.CylinderGeometry(0.34 - i * 0.05, 0.75 - i * 0.1, 7 + i, 10, 6);
      lump(rt, 0.55, 0.9);
      rt.rotateZ(s * (0.75 + i * 0.28)).translate(s * (6.6 + i * 1.1), -1.6, -L / 2 + 2 + i * 4);
      parts.push(barkPaint(rt, i + 2));
    }
  }
  return merge(parts);
}

/* ---------- obstáculos de dentro ---------- */
function knotGeo() {
  const b = lump(blob(0.6, 2), 0.45, 1.5, 1, 1.5, 1);
  paintGeo(b, (c, x, y, z) => { c.set('#160b08').lerp(new THREE.Color('#3b1a1e'), fbm3(x * 3, y * 3, z * 3)); return 0; });
  b.translate(0, 0.75, 0);
  const parts = [b];
  const r = rng(8);
  for (let i = 0; i < 13; i++) {
    const a = r() * 6.283, y = 0.2 + r() * 1.3, h = 0.34 + r() * 0.36;
    const cone = new THREE.ConeGeometry(0.075, h, 6, 2);
    const yy = h;
    paintGeo(cone, (c, px, py) => { const t = clamp((py + yy / 2) / yy); c.set('#1b0d10').lerp(new THREE.Color('#ff4a5e'), t * t); return t * t * 1.5; });
    cone.rotateZ(1.2 * Math.cos(a)).rotateX(1.2 * Math.sin(a)).translate(Math.cos(a) * 0.42, y, Math.sin(a) * 0.42);
    parts.push(cone);
  }
  return merge(parts);
}
function sledGeo() {
  const cap = new THREE.SphereGeometry(0.5, 20, 8, 0, 6.283, 0, 1.3).scale(1, 0.34, 1.3).rotateX(Math.PI);
  cap.translate(0, 0.16, -0.05);
  paintGeo(cap, (c, x, y, z) => {
    const d = Math.sin(x * 11) * Math.sin(z * 9);
    c.set(d > 0.45 ? '#fff0cf' : '#cf2f2f');
    return d > 0.45 ? 0.2 : 0.05;
  });
  return merge([cap]);
}

const TUBE_FRAG_HEAD = /* glsl */ `
uniform float uTubeZ, uTrip, uHaze; uniform vec3 uTubeA, uTubeB;
varying vec3 vTP;
${NOISE_GLSL}
vec3 hsv(float h, float s, float v){ vec3 k = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0; return v * mix(vec3(1.0), clamp(k, 0.0, 1.0), s); }
vec3 tubeBump(vec3 pos, vec3 n, float h, float k){
  vec3 dx = dFdx(pos), dy = dFdy(pos); float hx = dFdx(h) * k, hy = dFdy(h) * k;
  vec3 r1 = cross(dy, n), r2 = cross(n, dx); float det = dot(dx, r1);
  return normalize(abs(det) * n - sign(det) * (hx * r1 + hy * r2));
}
float gTubeH; vec3 gTubeE;
`;

const TUBE_COLOR = /* glsl */ `
{
  float a = atan(vTP.x, ${TUBE_R.toFixed(1)} - vTP.y);
  float z = vTP.z + uTubeZ;
  vec3 ang = vec3(cos(a), sin(a), 0.0);
  // veio da madeira correndo ao longo do tronco
  float plate = vn3(vec3(ang.xy * 4.0, z * 0.07));
  float fiber = vn3(vec3(ang.xy * 26.0, z * 0.1)) * 0.6 + vn3(vec3(ang.xy * 62.0, z * 0.24)) * 0.4;
  float grain = plate * 0.55 + fiber * 0.45;
  float rib = pow(0.5 + 0.5 * sin(z * 0.62 + plate * 5.0), 6.0);
  float crack = smoothstep(0.42, 0.5, abs(fiber - 0.5) * 3.2 + plate * 0.2);
  vec3 wood = mix(vec3(0.16, 0.08, 0.035), vec3(0.62, 0.38, 0.19), grain);
  wood = mix(wood, vec3(0.05, 0.022, 0.01), crack * 0.75);
  // musgo e pó de cupim nas emendas
  wood = mix(wood, vec3(0.2, 0.3, 0.08), smoothstep(0.62, 0.8, vn3(vec3(ang.xy * 7.0, z * 0.2))) * 0.55);
  wood *= 1.0 - rib * 0.78;
  // anéis de luz: dão a sensação de velocidade dentro do tubo
  float ringZ = fract(z / 19.0);
  float ring = smoothstep(0.011, 0.0, abs(ringZ - 0.5));
  // veias de seiva e bolotinhas de fungo aceso
  float vein = smoothstep(0.012, 0.0, abs(vn3(vec3(ang.xy * 3.0, z * 0.14)) - 0.5)) * smoothstep(0.45, 0.7, plate);
  vec3 cellP = vec3(ang.xy * 9.0, z * 0.8);
  float spot = smoothstep(0.88, 0.98, vn3(cellP * 1.4));
  vec3 cA = uTubeA, cB = uTubeB;
  if (uTrip > 0.001) {
    // cogumelo: tudo escorre em arco-íris
    float hue = z * 0.022 + a * 0.16 + uTime * 0.13 + sin(z * 0.11 + uTime) * 0.08;
    wood = mix(wood, hsv(hue, 0.72, 0.22 + grain * 0.75) * (1.0 - rib * 0.7) * (1.0 - crack * 0.55), uTrip);
    cA = mix(cA, hsv(hue + 0.33, 0.9, 1.0), uTrip);
    cB = mix(cB, hsv(hue + 0.62, 0.9, 1.0), uTrip);
  }
  diffuseColor.rgb = wood;
  // a madeira tem luz própria fraca: é ela, e não o neon, que manda na imagem
  gTubeE = wood * 0.42 + cA * ring * 1.5 + cB * (vein * 0.7 + spot * 1.1);
  gTubeH = fiber * 0.5 + plate * 0.4 - rib * 1.5 - crack * 0.5;
}
`;

export class Tube {
  constructor(scene, q, propsMat) {
    this.q = q;
    this.U = {
      uTubeZ: { value: 0 }, uTrip: { value: 0 }, uHaze: { value: 0 },
      uTubeA: { value: new THREE.Color('#7dff9a') }, uTubeB: { value: new THREE.Color('#3bdc6a') },
    };
    /* o interior */
    const geo = new THREE.CylinderGeometry(TUBE_R, TUBE_R, 200, q.tubeRadial, q.tubeLen, true).rotateX(Math.PI / 2).translate(0, TUBE_R, 66);
    const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.BackSide }), { rim: 0.08, extraKey: 'tube' });
    const prior = mat.onBeforeCompile;
    const U = this.U;
    mat.onBeforeCompile = (s, r) => {
      prior(s, r);
      Object.assign(s.uniforms, U);
      s.vertexShader = 'varying vec3 vTP;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTP = position;');
      s.fragmentShader = TUBE_FRAG_HEAD + s.fragmentShader
        .replace('#include <map_fragment>', TUBE_COLOR)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = tubeBump(-vViewPosition, normal, gTubeH, 0.09);')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gTubeE;');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);

    /* material de dois lados para folha, cogumelo e boca do tronco */
    const dbl = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }), { glow: true, glowSelf: true, glowAmp: 2.2, rim: 0.5, extraKey: 'dbl' });

    this.portal = new THREE.Mesh(portalGeo(), dbl);
    this.portal.frustumCulled = false;
    this.portal.castShadow = false;
    this.portal.receiveShadow = true;
    this.portal.position.set(0, 3.1, -300);
    scene.add(this.portal);
    // luz da descida lá no fundo da boca
    const mc = document.createElement('canvas');
    mc.width = mc.height = 128;
    const mg = mc.getContext('2d');
    const grad = mg.createRadialGradient(64, 76, 2, 64, 64, 64);
    grad.addColorStop(0, '#fff'); grad.addColorStop(0.14, '#999'); grad.addColorStop(0.42, '#1c1c1c'); grad.addColorStop(1, '#000');
    mg.fillStyle = grad; mg.fillRect(0, 0, 128, 128);
    const mt = new THREE.CanvasTexture(mc);
    mt.colorSpace = THREE.SRGBColorSpace;
    this.mouth = new THREE.Mesh(new THREE.CircleGeometry(4.75, 28), patch(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 0.5), map: mt }), { rim: 0 }));
    this.mouth.rotation.y = Math.PI;
    this.mouth.position.set(0, 0, 2.5);
    this.mouth.frustumCulled = false;
    this.portal.add(this.mouth);

    this.items = {
      folha: new THREE.Mesh(leafGeo(), dbl),
      cogumelo: new THREE.Mesh(magicShroomGeo(), dbl),
    };
    for (const k in this.items) {
      const m = this.items[k];
      m.frustumCulled = false;
      m.castShadow = true;
      m.scale.setScalar(k === 'folha' ? 1.15 : 1.25);
      m.position.set(0, -50, 0);
      scene.add(m);
    }

    this.sled = new THREE.Mesh(sledGeo(), propsMat);
    this.sled.frustumCulled = false;
    this.sled.castShadow = false;

    /* obstáculos */
    this.defs = { knot: knotGeo() };
    this.mat = propsMat;
    this.pool = { knot: [] };
    this.live = [];
    for (let i = 0; i < 12; i++) this.pool.knot.push(this.make('knot'));
    this.scene = scene;
    for (const k in this.pool) this.pool[k].forEach((m) => scene.add(m));
  }

  make(k) {
    const m = new THREE.Mesh(this.defs[k], this.mat);
    m.frustumCulled = false;
    m.position.y = -50;
    return m;
  }

  /** ponto na parede do tubo, a uma altura h da madeira, em direção ao centro */
  static at(theta, h = 0, out = new THREE.Vector3()) {
    const r = TUBE_R - h;
    return out.set(Math.sin(theta) * r, TUBE_R - Math.cos(theta) * r, 0);
  }

  add(kind, theta, z) {
    const m = this.pool[kind].pop() || (() => { const n = this.make(kind); this.scene.add(n); return n; })();
    m.visible = true;
    Tube.at(theta, 0, m.position);
    m.position.z = z;
    m.rotation.set(0, 0, theta);
    m.scale.setScalar(1);
    const o = { m, kind, theta, z, dead: false, vy: 0 };
    this.live.push(o);
    return o;
  }

  remove(i) {
    const o = this.live[i];
    o.m.visible = false;
    o.m.position.y = -50;
    this.pool[o.kind].push(o.m);
    this.live.splice(i, 1);
  }

  clear() { while (this.live.length) this.remove(this.live.length - 1); }

  setVisible(v) {
    this.mesh.visible = v;
    for (const k in this.pool) this.pool[k].forEach((m) => { m.visible = v && false; });
  }

  setMood(kind) {
    const U = this.U;
    if (kind === 'cogumelo') {
      U.uTubeA.value.set('#ff4fd8'); U.uTubeB.value.set('#6df2ff'); U.uTrip.value = 1;
      this.mouth.material.color.setRGB(1.5, 0.3, 1.6);
    } else {
      U.uTubeA.value.set('#7dff9a'); U.uTubeB.value.set('#3bdc6a'); U.uTrip.value = 0;
      this.mouth.material.color.setRGB(0.2, 1.4, 0.5);
    }
  }
}
