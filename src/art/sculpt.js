// Escultor procedural: descreve um personagem como uma "argila" de primitivas SDF,
// extrai uma malha contínua (surface nets) e deriva dali, por vértice, a cor,
// a quantidade de pelo, o brilho e os pesos de esqueleto. Nada de asset externo.
import * as THREE from 'three';
import { noise3 } from '../core/world.js';

const col = (c) => new THREE.Color(c);

/* ---------- primitivas ---------- */
export function cap(a, b, r1, r2, bone, color, o = {}) {
  return { t: 0, a, b, r1, r2: r2 ?? r1, bone, color: col(color), ...o };
}
export function ell(c, r, bone, color, o = {}) {
  const rr = typeof r === 'number' ? [r, r, r] : r;
  return { t: 1, c, r: rr, bone, color: col(color), ...o };
}

function distPrim(pr, x, y, z) {
  if (pr.t === 0) {
    const ax = pr.a[0], ay = pr.a[1], az = pr.a[2];
    const bx = pr.b[0] - ax, by = pr.b[1] - ay, bz = pr.b[2] - az;
    const px = x - ax, py = y - ay, pz = z - az;
    const bb = pr._bb ?? (pr._bb = bx * bx + by * by + bz * bz || 1e-6);
    let h = (px * bx + py * by + pz * bz) / bb;
    h = h < 0 ? 0 : h > 1 ? 1 : h;
    const dx = px - bx * h, dy = py - by * h, dz = pz - bz * h;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (pr.r1 + (pr.r2 - pr.r1) * h);
  }
  let px = x - pr.c[0], py = y - pr.c[1], pz = z - pr.c[2];
  if (pr.rot) {
    const e = pr._m || (pr._m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...pr.rot)).invert().elements);
    const qx = e[0] * px + e[4] * py + e[8] * pz;
    const qy = e[1] * px + e[5] * py + e[9] * pz;
    const qz = e[2] * px + e[6] * py + e[10] * pz;
    px = qx; py = qy; pz = qz;
  }
  const rx = pr.r[0], ry = pr.r[1], rz = pr.r[2];
  const k0 = Math.sqrt((px * px) / (rx * rx) + (py * py) / (ry * ry) + (pz * pz) / (rz * rz));
  const k1 = Math.sqrt((px * px) / (rx * rx * rx * rx) + (py * py) / (ry * ry * ry * ry) + (pz * pz) / (rz * rz * rz * rz));
  return k1 < 1e-6 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function primBounds(pr) {
  if (pr.t === 0) {
    const R = Math.max(pr.r1, pr.r2) + (pr.k || 0);
    return [
      Math.min(pr.a[0], pr.b[0]) - R, Math.min(pr.a[1], pr.b[1]) - R, Math.min(pr.a[2], pr.b[2]) - R,
      Math.max(pr.a[0], pr.b[0]) + R, Math.max(pr.a[1], pr.b[1]) + R, Math.max(pr.a[2], pr.b[2]) + R,
    ];
  }
  const R = Math.max(...pr.r) + (pr.k || 0);
  return [pr.c[0] - R, pr.c[1] - R, pr.c[2] - R, pr.c[0] + R, pr.c[1] + R, pr.c[2] + R];
}

function field(prims, x, y, z, disp) {
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const pr = prims[i];
    let di = distPrim(pr, x, y, z);
    if (pr.sub) {
      const k = pr.k ?? 0.01;
      const nd = -di;
      const h = Math.max(k - Math.abs(-di - d), 0) / k;
      d = Math.max(d, nd) + (h * h * k) / 4;
    } else {
      const k = pr.k ?? 0.02;
      const h = Math.max(k - Math.abs(d - di), 0) / k;
      d = Math.min(d, di) - (h * h * k) / 4;
    }
  }
  if (disp) d += disp(x, y, z);
  return d;
}

/**
 * Gera a geometria.
 * @param prims primitivas em espaço de pose de repouso
 * @param bones { nome: { p:[x,y,z], parent } }
 * @param o { cell, colorSharp, skinSharp, disp, paint }
 */
export async function sculpt(prims, boneDefs, o = {}) {
  const cell = o.cell ?? 0.02;
  const disp = o.disp;
  const solids = prims.filter((p) => !p.sub);
  const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const p of solids) {
    const q = primBounds(p);
    for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], q[i]); b[i + 3] = Math.max(b[i + 3], q[i + 3]); }
  }
  const pad = cell * 3 + (o.pad ?? 0);
  for (let i = 0; i < 3; i++) { b[i] -= pad; b[i + 3] += pad; }
  const nx = Math.ceil((b[3] - b[0]) / cell) + 1;
  const ny = Math.ceil((b[4] - b[1]) / cell) + 1;
  const nz = Math.ceil((b[5] - b[2]) / cell) + 1;
  const F = new Float32Array(nx * ny * nz).fill(1e3);
  const idx = (i, j, k) => i + nx * (j + ny * k);

  // varredura em blocos: pula regiões longe da superfície
  const BS = 6;
  const diag = cell * BS * 1.8;
  const reach = o.reach ?? 0.1;
  const halfDiag = cell * BS * 0.87;
  const bnx = Math.ceil(nx / BS), bny = Math.ceil(ny / BS), bnz = Math.ceil(nz / BS);
  const active = new Array(bnx * bny * bnz);
  const blockAt = (x, y, z) => {
    const bi = Math.min(bnx - 1, Math.max(0, Math.floor((x - b[0]) / cell / BS)));
    const bj = Math.min(bny - 1, Math.max(0, Math.floor((y - b[1]) / cell / BS)));
    const bk = Math.min(bnz - 1, Math.max(0, Math.floor((z - b[2]) / cell / BS)));
    return active[bi + bnx * (bj + bny * bk)];
  };
  let bcount = 0;
  for (let kb = 0; kb < nz; kb += BS) {
    for (let jb = 0; jb < ny; jb += BS) {
      for (let ib = 0; ib < nx; ib += BS) {
        const cx = b[0] + (ib + BS / 2) * cell, cy = b[1] + (jb + BS / 2) * cell, cz = b[2] + (kb + BS / 2) * cell;
        // só entram as primitivas que podem influenciar este bloco
        const list = [];
        for (let pi = 0; pi < prims.length; pi++) {
          const pr = prims[pi];
          if (distPrim(pr, cx, cy, cz) < (halfDiag + (pr.k ?? 0.02) + reach) * 1.35) list.push(pr);
        }
        active[(ib / BS) + bnx * ((jb / BS) + bny * (kb / BS))] = list;
        if (!list.some((pr) => !pr.sub)) continue;
        const dc = field(list, cx, cy, cz, disp);
        const near = Math.abs(dc) < diag * 1.6;
        for (let k = kb; k < Math.min(kb + BS, nz); k++) {
          for (let j = jb; j < Math.min(jb + BS, ny); j++) {
            for (let i = ib; i < Math.min(ib + BS, nx); i++) {
              F[idx(i, j, k)] = near ? field(list, b[0] + i * cell, b[1] + j * cell, b[2] + k * cell, disp) : dc;
            }
          }
        }
      }
    }
    if (++bcount % 6 === 0) await new Promise((r) => setTimeout(r));
  }

  // surface nets
  const verts = [];
  const vmap = new Int32Array(nx * ny * nz).fill(-1);
  const corners = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        const vals = [];
        for (let c = 0; c < 8; c++) {
          const v = F[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          vals.push(v);
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, c] of edges) {
          if (((mask >> a) & 1) === ((mask >> c) & 1)) continue;
          const t = vals[a] / (vals[a] - vals[c]);
          sx += corners[a][0] + (corners[c][0] - corners[a][0]) * t;
          sy += corners[a][1] + (corners[c][1] - corners[a][1]) * t;
          sz += corners[a][2] + (corners[c][2] - corners[a][2]) * t;
          n++;
        }
        vmap[idx(i, j, k)] = verts.length / 3;
        verts.push(b[0] + (i + sx / n) * cell, b[1] + (j + sy / n) * cell, b[2] + (k + sz / n) * cell);
      }
    }
  }
  const index = [];
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const f0 = F[idx(i, j, k)] < 0;
        const fx = F[idx(i + 1, j, k)] < 0, fy = F[idx(i, j + 1, k)] < 0, fz = F[idx(i, j, k + 1)] < 0;
        const quad = (a, b2, c, d, flip) => {
          if (a < 0 || b2 < 0 || c < 0 || d < 0) return;
          if (flip) index.push(a, c, b2, a, d, c);
          else index.push(a, b2, c, a, c, d);
        };
        if (f0 !== fx) quad(vmap[idx(i, j - 1, k - 1)], vmap[idx(i, j, k - 1)], vmap[idx(i, j, k)], vmap[idx(i, j - 1, k)], !f0);
        if (f0 !== fy) quad(vmap[idx(i - 1, j, k - 1)], vmap[idx(i - 1, j, k)], vmap[idx(i, j, k)], vmap[idx(i, j, k - 1)], !f0);
        if (f0 !== fz) quad(vmap[idx(i - 1, j - 1, k)], vmap[idx(i, j - 1, k)], vmap[idx(i, j, k)], vmap[idx(i - 1, j, k)], !f0);
      }
    }
  }
  await new Promise((r) => setTimeout(r));

  // atributos por vértice
  const nv = verts.length / 3;
  const pos = new Float32Array(verts);
  const nor = new Float32Array(nv * 3);
  const colr = new Float32Array(nv * 3);
  const fur = new Float32Array(nv);
  const glow = new Float32Array(nv);
  const skinI = new Uint16Array(nv * 4);
  const skinW = new Float32Array(nv * 4);
  const boneNames = Object.keys(boneDefs);
  const boneIdx = Object.fromEntries(boneNames.map((n, i) => [n, i]));
  const eps = cell * 0.6;
  const colorSharp = o.colorSharp ?? 120;
  const skinSharp = o.skinSharp ?? 30;
  const dists = new Float32Array(prims.length);
  const tmpW = new Float32Array(boneNames.length);
  const tc = new THREE.Color();

  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const near = blockAt(x, y, z);
    const nearList = near && near.length ? near : prims;
    // um passo de Newton cola o vértice na superfície real
    for (let it = 0; it < 2; it++) {
      const d = it === 0 ? field(nearList, x, y, z, disp) : 0;
      const gx = field(nearList, x + eps, y, z, disp) - field(nearList, x - eps, y, z, disp);
      const gy = field(nearList, x, y + eps, z, disp) - field(nearList, x, y - eps, z, disp);
      const gz = field(nearList, x, y, z + eps, disp) - field(nearList, x, y, z - eps, disp);
      const gl = Math.hypot(gx, gy, gz) || 1;
      const nxx = gx / gl, nyy = gy / gl, nzz = gz / gl;
      if (it === 0) { const s = Math.max(-cell, Math.min(cell, d)); x -= nxx * s * 0.7; y -= nyy * s * 0.7; z -= nzz * s * 0.7; }
      else { nor[v * 3] = nxx; nor[v * 3 + 1] = nyy; nor[v * 3 + 2] = nzz; }
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;

    let dmin = 1e9;
    for (let i = 0; i < nearList.length; i++) {
      if (nearList[i].sub) { dists[i] = 1e9; continue; }
      const d = distPrim(nearList[i], x, y, z); dists[i] = d; if (d < dmin) dmin = d;
    }
    let cw = 0, r = 0, g = 0, bl = 0, fu = 0, gl = 0;
    tmpW.fill(0);
    for (let i = 0; i < nearList.length; i++) {
      const pr = nearList[i];
      if (pr.sub) continue;
      const dd = dists[i] - dmin;
      const wc = Math.exp(-dd * (pr.colorSharp ?? colorSharp));
      if (wc > 0.001 || cw === 0) {
        cw += wc;
        r += pr.color.r * wc; g += pr.color.g * wc; bl += pr.color.b * wc;
        fu += (pr.fur ?? 0) * wc; gl += (pr.glow ?? 0) * wc;
      }
      const ws = Math.exp(-dd * (pr.skinSharp ?? skinSharp));
      tmpW[boneIdx[pr.bone]] += ws;
    }
    tc.setRGB(r / cw, g / cw, bl / cw);
    let fv = fu / cw, gv = gl / cw;
    if (o.paint) {
      const out = o.paint(x, y, z, tc, fv, gv);
      if (out) { if (out.fur !== undefined) fv = out.fur; if (out.glow !== undefined) gv = out.glow; }
    }
    colr[v * 3] = tc.r; colr[v * 3 + 1] = tc.g; colr[v * 3 + 2] = tc.b;
    fur[v] = fv; glow[v] = gv;

    // 4 maiores pesos
    const top = [[-1, 0], [-1, 0], [-1, 0], [-1, 0]];
    for (let i = 0; i < tmpW.length; i++) {
      const w = tmpW[i];
      if (w <= top[3][1]) continue;
      top[3] = [i, w];
      top.sort((a, c) => c[1] - a[1]);
    }
    const sum = top.reduce((s, t) => s + t[1], 0) || 1;
    for (let i = 0; i < 4; i++) {
      skinI[v * 4 + i] = Math.max(0, top[i][0]);
      skinW[v * 4 + i] = top[i][1] / sum;
    }
    if (v % 4000 === 3999) await new Promise((r2) => setTimeout(r2));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinI, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
  geo.setIndex(index);
  // índice só com os triângulos que têm pelo, para as cascas custarem pouco
  const furIndex = [];
  for (let i = 0; i < index.length; i += 3) {
    if (fur[index[i]] > 0.02 || fur[index[i + 1]] > 0.02 || fur[index[i + 2]] > 0.02) furIndex.push(index[i], index[i + 1], index[i + 2]);
  }
  geo.userData.furIndex = furIndex;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  return geo;
}

/* ---------- esqueleto em repouso (sem rotações, tudo identidade) ---------- */
export function buildSkeleton(defs) {
  const bones = {};
  const list = [];
  for (const n of Object.keys(defs)) {
    const b = new THREE.Bone();
    b.name = n;
    bones[n] = b;
    list.push(b);
  }
  let root = null;
  for (const n of Object.keys(defs)) {
    const d = defs[n];
    if (d.parent) {
      const pp = defs[d.parent].p;
      bones[n].position.set(d.p[0] - pp[0], d.p[1] - pp[1], d.p[2] - pp[2]);
      bones[d.parent].add(bones[n]);
    } else {
      bones[n].position.set(d.p[0], d.p[1], d.p[2]);
      root = bones[n];
    }
    bones[n].userData.rest = bones[n].position.clone();
  }
  return { bones, list, root };
}

/* ---------- IK de dois ossos, no espaço do pai do osso superior ---------- */
const _U = new THREE.Vector3(), _D = new THREE.Vector3(), _K = new THREE.Vector3();
const _P = new THREE.Vector3(), _E = new THREE.Vector3(), _O = new THREE.Vector3();
const _Q = new THREE.Quaternion(), _R1 = new THREE.Vector3(), _R2 = new THREE.Vector3();
export function solveIK(upper, lower, target, pole) {
  _U.copy(upper.position);
  _R1.copy(lower.userData.rest);
  _R2.copy(lower.userData.next);
  const a = _R1.length(), b2 = _R2.length();
  _D.copy(target).sub(_U);
  const dl = Math.min(Math.max(_D.length(), Math.abs(a - b2) + 1e-3), a + b2 - 1e-3);
  _D.normalize();
  const cosA = (a * a + dl * dl - b2 * b2) / (2 * a * dl);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _P.copy(pole);
  _O.copy(_P).addScaledVector(_D, -_P.dot(_D)).normalize();
  _K.copy(_D).multiplyScalar(a * cosA).addScaledVector(_O, a * sinA);
  _Q.setFromUnitVectors(_R1.normalize(), _E.copy(_K).normalize());
  upper.quaternion.copy(_Q);
  // alvo final relativo ao joelho, trazido para o espaço do osso superior
  _E.copy(_D).multiplyScalar(dl).sub(_K).normalize();
  _E.applyQuaternion(_Q.invert());
  lower.quaternion.setFromUnitVectors(_R2.normalize(), _E);
}

/* ---------- mola para osso secundário (chapéu, barba, bolsa, rabo) ---------- */
export class Spring {
  constructor(bone, stiff = 60, dampK = 9, gain = 1) {
    Object.assign(this, { bone, stiff, dampK, gain });
    this.ax = 0; this.az = 0; this.vx = 0; this.vz = 0;
  }
  step(dt, fx, fz, tx = 0, tz = 0) {
    this.vx += (-(this.ax - tx) * this.stiff - this.vx * this.dampK + fx * this.gain) * dt;
    this.vz += (-(this.az - tz) * this.stiff - this.vz * this.dampK + fz * this.gain) * dt;
    this.ax += this.vx * dt;
    this.az += this.vz * dt;
    this.bone.rotation.x = this.ax;
    this.bone.rotation.z = this.az;
  }
}

/** Desloca levemente a superfície com ruído, para não parecer plástico. */
export const lumpy = (amp, f) => (x, y, z) => (noise3(x * f + 9, y * f, z * f) - 0.5) * amp;
