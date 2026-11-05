// Núcleo visual: toda material do jogo passa por patch(), que injeta:
//  - mundo curvo (estrada "enrola" sem o jogador sair do z=0)
//  - decoração em loop infinito no próprio vertex shader (1 draw call por tipo)
//  - vento, pelo em camadas (shells), névoa com altura e dispersão em volta da lua
//  - luz de contorno (rim) e veias/brilho emissivos
import * as THREE from 'three';

export const LOOP = 192;
export const BACK = 28;

export const G = {
  uTime: { value: 0 },
  uScroll: { value: 0 },
  uLoop: { value: LOOP },
  uBack: { value: BACK },
  uBend: { value: new THREE.Vector2(0, 0) },
  uFog: { value: new THREE.Color('#1a2038') },
  uFogGlow: { value: new THREE.Color('#6d7fb0') },
  uFogDen: { value: 0.02 },
  uFogH: { value: 0.1 },
  uMoonDir: { value: new THREE.Vector3(0.1, 0.2, 1).normalize() },
  uRimCol: { value: new THREE.Color('#8fa6ff') },
  uGlowCol: { value: new THREE.Color('#7dffd2') },
  uTint: { value: new THREE.Color('#ffffff') },
  uFlash: { value: 0 },
  uEyeLight: { value: new THREE.Vector4(0, 0, -10, 0) },
};

const VHEAD = /* glsl */ `
uniform float uTime, uScroll, uLoop, uBack, uWA, uFlutter;
uniform vec2 uBend;
varying vec3 vWP;
#ifdef W_FUR
  attribute float aFur;
  uniform float uShell, uFurLen, uDroop;
  varying float vFur;
  varying vec3 vRest;
#endif
#ifdef W_GLOW
  attribute float aGlow;
  varying float vGlow;
  varying vec3 vRest2;
#endif
`;

const BEGIN = /* glsl */ `
#include <begin_vertex>
float gWrap = 0.0;
vec3 gOrg = vec3(0.0);
#ifdef USE_INSTANCING
  gOrg = instanceMatrix[3].xyz;
  #ifdef W_WRAP
    gWrap = mod(gOrg.z - uScroll + uBack, uLoop) - uBack - gOrg.z;
  #endif
#endif
#ifdef W_WIND
  float wPhase = uTime * 1.3 + gOrg.x * 0.37 + gOrg.z * 0.23;
  float wH = transformed.y * transformed.y;
  transformed.x += sin(wPhase) * wH * uWA;
  transformed.z += cos(wPhase * 0.73) * wH * uWA * 0.7;
  transformed += normal * sin(uTime * 3.1 + position.x * 5.0 + position.y * 3.0 + gOrg.x) * uFlutter;
#endif
#ifdef W_FUR
  vFur = aFur;
  vRest = position;
  transformed += normal * aFur * uFurLen * uShell;
  transformed.y -= uDroop * uShell * uShell * aFur;
#endif
#ifdef W_GLOW
  vGlow = aGlow;
  vRest2 = position;
#endif
`;

const PROJECT = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 gW = modelMatrix * mvPosition;
gW.z += gWrap;
vWP = gW.xyz;
#ifdef W_BEND
  float gDz = gW.z - cameraPosition.z;
  gW.x += uBend.x * gDz * gDz;
  gW.y += uBend.y * gDz * gDz;
#endif
mvPosition = viewMatrix * gW;
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS = /* glsl */ `
#if defined(USE_ENVMAP) || defined(DISTANCE) || defined(USE_SHADOWMAP) || defined(USE_TRANSMISSION) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    worldPosition = instanceMatrix * worldPosition;
  #endif
  worldPosition = modelMatrix * worldPosition;
  worldPosition.z += gWrap;
#endif
`;

export const NOISE_GLSL = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;

const FHEAD = /* glsl */ `
uniform float uTime, uFogDen, uFogH, uFlash, uRim, uGlowAmp;
uniform vec3 uFog, uFogGlow, uMoonDir, uRimCol, uGlowCol, uTint;
varying vec3 vWP;
#if defined(W_FUR) || defined(W_VEINS)
${NOISE_GLSL}
#endif
#ifdef W_FUR
  uniform float uShell, uFurFreq;
  varying float vFur;
  varying vec3 vRest;
#endif
#ifdef W_GLOW
  varying float vGlow;
  varying vec3 vRest2;
#endif
`;

export const FOG_GLSL = /* glsl */ `
{
  vec3 gRay = vWP - cameraPosition;
  float gD = length(gRay);
  float gF = 1.0 - exp(-pow(gD * uFogDen, 1.55));
  float gH = exp(-max(vWP.y, 0.0) * uFogH);
  gF *= mix(0.6, 1.0, gH);
  float gS = pow(max(dot(gRay / max(gD, 0.001), uMoonDir), 0.0), 18.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(uFog, uFogGlow, gS), clamp(gF, 0.0, 1.0));
}
`;

const OPAQUE = /* glsl */ `
#ifdef W_TINT
  outgoingLight *= uTint;
#endif
#ifndef W_BASIC
{
  vec3 gV = normalize(vViewPosition);
  float gR = pow(1.0 - clamp(dot(normal, gV), 0.0, 1.0), 3.0);
  outgoingLight += gR * uRim * uRimCol * (0.25 + diffuseColor.rgb);
  outgoingLight += diffuseColor.rgb * uFlash * 2.2;
}
#endif
#ifdef W_GLOW
  {
    float gG = vGlow;
    #ifdef W_VEINS
      float gN = vn3(vRest2 * 1.9) * 0.65 + vn3(vRest2 * 4.1) * 0.35;
      float gL = smoothstep(0.035, 0.0, abs(gN - 0.5));
      gG *= gL * (0.65 + 0.35 * sin(uTime * 3.0 - vRest2.z * 3.0));
    #endif
    #ifdef W_GLOWSELF
      outgoingLight += diffuseColor.rgb * gG * uGlowAmp;
    #else
      outgoingLight += uGlowCol * gG * uGlowAmp;
    #endif
  }
#endif
#include <opaque_fragment>
`;

const FURFRAG = /* glsl */ `
#ifdef W_FUR
  if (uShell > 0.0) {
    if (vFur < 0.02) discard;
    vec3 gC = vRest * uFurFreq;
    gC += sin(gC.yzx * 0.63) * 0.9 + sin(gC.zxy * 1.7) * 0.25;
    vec3 gI = floor(gC);
    float gRnd = h31(gI);
    vec3 gD3 = fract(gC) - 0.5 - (vec3(h31(gI + 3.1), h31(gI + 7.7), h31(gI + 11.3)) - 0.5) * 0.45;
    float gLen = 0.35 + 0.65 * gRnd;
    float gRad = (1.0 - uShell / max(gLen * max(vFur, 0.2), 0.001)) * 0.62;
    if (gRad <= 0.0 || length(gD3) > gRad) discard;
  }
#endif
`;

let uid = 0;

/** Aplica os recursos do mundo a uma material padrão do three. */
export function patch(mat, o = {}) {
  const {
    wrap = false, bend = true, wind = 0, flutter = 0, rim = 0.5, tint = false,
    glow = false, veins = false, glowAmp = 1, glowSelf = false, glowColor = null,
    fur = false, shell = 0, furLen = 0, furFreq = 30, droop = 0, isDepth = false,
  } = o;
  mat.defines = { ...(mat.defines || {}) };
  if (glowSelf) mat.defines.W_GLOWSELF = 1;
  if (mat.isMeshBasicMaterial) mat.defines.W_BASIC = 1;
  if (wrap) mat.defines.W_WRAP = 1;
  if (bend && !isDepth) mat.defines.W_BEND = 1;
  if (wind || flutter) mat.defines.W_WIND = 1;
  if (fur) mat.defines.W_FUR = 1;
  if (glow) mat.defines.W_GLOW = 1;
  if (veins) mat.defines.W_VEINS = 1;
  if (tint) mat.defines.W_TINT = 1;
  mat.fog = false;
  const key = `w${wrap}${bend}${!!(wind || flutter)}${fur}${glow}${veins}${tint}${isDepth}${glowSelf}`;
  const prior = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => key + (o.extraKey || '');
  mat.onBeforeCompile = (s, r) => {
    Object.assign(s.uniforms, G, {
      uWA: { value: wind }, uFlutter: { value: flutter }, uRim: { value: rim }, uGlowAmp: { value: glowAmp },
      uShell: { value: shell }, uFurLen: { value: furLen }, uFurFreq: { value: furFreq }, uDroop: { value: droop },
    });
    if (glowColor) s.uniforms.uGlowCol = { value: glowColor };
    s.vertexShader = VHEAD + s.vertexShader
      .replace('#include <begin_vertex>', BEGIN)
      .replace('#include <project_vertex>', PROJECT)
      .replace('#include <worldpos_vertex>', WORLDPOS);
    if (!isDepth) {
      s.fragmentShader = FHEAD + s.fragmentShader
        .replace('#include <opaque_fragment>', OPAQUE)
        .replace('#include <fog_fragment>', FOG_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + FURFRAG);
    } else {
      s.vertexShader = s.vertexShader; // profundidade só precisa do vertex
    }
    if (prior) prior(s, r);
    mat.userData.shader = s;
  };
  mat.needsUpdate = true;
  return mat;
}

/** Material de sombra coerente com o patch (mesma ondulação e loop, sem curvar). */
export function depthFor(o = {}, extra = {}) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, ...extra });
  return patch(d, { ...o, isDepth: true, extraKey: extra.alphaTest ? 'a' : '' });
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));

/** Altura do terreno, periódica em LOOP. A versão GLSL em ground.js é idêntica. */
export function heightAt(x, z0) {
  const s = sstep(3.6, 15, Math.abs(x));
  const t = (Math.PI * 2 * z0) / LOOP;
  return s * (1.7 + 1.1 * Math.sin(x * 0.31 + t * 2) + 0.7 * Math.sin(x * 0.73 - t * 5 + 1.3) + 0.35 * Math.sin(x * 1.4 + t * 11));
}

/** PRNG determinístico para a floresta ser igual em toda partida. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruído de valor 3D em JS, para deformar geometria. */
const P = new Uint8Array(512);
{
  const r = rng(77);
  const a = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 512; i++) P[i] = a[i & 255];
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let u = x - xi, v = y - yi, w = z - zi;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const h = (a, b, c) => P[P[P[(X + a) & 255] + ((Y + b) & 255)] + ((Z + c) & 255)] / 255;
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v), w,
  );
}
export const fbm3 = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.03, y * 2.03, z * 2.03) * 0.28 + noise3(x * 4.1, y * 4.1, z * 4.1) * 0.12;
export const uid_ = () => ++uid;
