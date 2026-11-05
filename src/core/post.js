// Pós-processamento por nível de qualidade + detecção e escala adaptativa.
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, GodRaysEffect, ToneMappingEffect, ToneMappingMode, Effect, BlendFunction, KernelSize } from 'postprocessing';

/* Cada linha é um degrau. Só o que é "barato de trocar" muda em tempo real. */
export const TIERS = {
  ultra: { dpr: 2, ms: 4, rays: 42, bloomRes: 1, shadow: 2048, shadowEvery: 1 },
  high: { dpr: 1.6, ms: 2, rays: 30, bloomRes: 0.75, shadow: 2048, shadowEvery: 1 },
  mid: { dpr: 1.35, ms: 0, rays: 0, bloomRes: 0.5, shadow: 1024, shadowEvery: 2 },
  low: { dpr: 1, ms: 0, rays: 0, bloomRes: 0.35, shadow: 1024, shadowEvery: 3 },
};
const ORDER = ['ultra', 'high', 'mid', 'low'];

/** Conteúdo gerado: fixado no carregamento, pelo aparelho. */
export function contentFor(mobile, weak) {
  const base = {
    gnomeCell: 0.0135, monsterCell: 0.055, gnomeShells: 7, monsterShells: 12,
    cards: 34, trees: 76, dead: 10, grass: 9000, ferns: 900, shrooms: 120, crystals: 26, rocks: 90, pebbles: 620,
    shafts: 18, mist: 0.34, shaftAmp: 0.085, fireflies: 420, leaves: 120, particles: 500,
    groundDZ: 1, groundSX: 90,
  };
  if (mobile) Object.assign(base, {
    gnomeCell: 0.018, monsterCell: 0.075, gnomeShells: 3, monsterShells: 5,
    cards: 16, trees: 50, dead: 6, grass: 2600, ferns: 260, shrooms: 60, crystals: 12, rocks: 40, pebbles: 260,
    shafts: 10, fireflies: 140, leaves: 50, particles: 220,
    groundDZ: 1.6, groundSX: 44,
  });
  if (weak) Object.assign(base, {
    gnomeCell: 0.021, monsterCell: 0.09, gnomeShells: 0, monsterShells: 3,
    cards: 11, trees: 38, grass: 1200, ferns: 120, shrooms: 50, rocks: 24, pebbles: 150, shafts: 6, fireflies: 70, leaves: 24, particles: 140,
    groundDZ: 2.2, groundSX: 30,
  });
  return base;
}

export function detect() {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const weak = mobile && (cores <= 4 || mem <= 3);
  let tier = mobile ? (weak ? 'low' : 'mid') : 'ultra';
  try {
    const m = /[?#&]q=(ultra|high|mid|low)/.exec(location.search + location.hash);
    if (m) tier = m[1];
  } catch (_) { /* sem query em alguns frames */ }
  return { mobile, weak, tier };
}

const GRADE = /* glsl */ `
uniform float uDanger, uFlashG, uT, uSat, uHit;
float gr(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uT*7.0)*43758.5453); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec3 c = inputColor.rgb;
  vec2 q = uv-0.5;
  float r = dot(q,q);
  float l = dot(c,vec3(0.3,0.59,0.11));
  // medo tira a cor do mundo e puxa a borda para o vermelho
  c = mix(vec3(l), c, uSat - uDanger*0.25);
  float vig = smoothstep(0.62,0.12,r);
  c *= mix(0.42,1.0,vig);
  float pulse = 0.6+0.4*sin(uT*(5.0+uDanger*5.0));
  c = mix(c, c*vec3(1.15,0.55,0.5)+vec3(0.13,0.0,0.01), smoothstep(0.1,0.62,r)*uDanger*pulse);
  c = mix(c, vec3(1.0,0.97,0.86), uFlashG);
  c += vec3(0.55,0.03,0.02)*uHit*smoothstep(0.02,0.5,r);
  // curva levemente em S e grão de filme
  c = mix(c, c*c*(3.0-2.0*c), 0.18);
  c += (gr(uv)-0.5)*0.014;
  outputColor = vec4(c, inputColor.a);
}`;
class GradeEffect extends Effect {
  constructor() {
    super('Grade', GRADE, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([['uDanger', new THREE.Uniform(0)], ['uFlashG', new THREE.Uniform(0)], ['uT', new THREE.Uniform(0)], ['uSat', new THREE.Uniform(1.1)], ['uHit', new THREE.Uniform(0)]]),
    });
  }
}

export class Post {
  constructor(renderer, scene, camera, moon, tierName) {
    Object.assign(this, { renderer, scene, camera, moon });
    this.grade = new GradeEffect();
    this.tierName = tierName;
    this.scale = 1;
    this.composer = null;
    this.apply(tierName);
    /* medidor adaptativo */
    this.acc = 0; this.frames = 0; this.cool = 3; this.budget = 22;
    this.onTier = null;
  }

  apply(name) {
    const T = (this.tier = TIERS[name]);
    this.tierName = name;
    const { renderer, scene, camera } = this;
    if (this.composer) this.composer.dispose();
    this.dpr = Math.min(window.devicePixelRatio || 1, T.dpr) * this.scale;
    renderer.setPixelRatio(this.dpr);
    const c = (this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: T.ms, stencilBuffer: false }));
    c.addPass(new RenderPass(scene, camera));
    const w = window.innerWidth, h = window.innerHeight;
    this.bloom = new BloomEffect({ intensity: 1.05, luminanceThreshold: 0.72, luminanceSmoothing: 0.35, mipmapBlur: true, radius: 0.72, resolutionScale: T.bloomRes, levels: name === 'low' ? 4 : 7 });
    const effects = [this.bloom];
    this.rays = null;
    if (T.rays) {
      this.rays = new GodRaysEffect(camera, this.moon, {
        height: 360, kernelSize: KernelSize.SMALL, density: 0.94, decay: 0.93, weight: 0.3, exposure: 0.3, samples: T.rays, clampMax: 1, blur: true,
      });
      effects.push(this.rays);
    }
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), this.grade);
    c.addPass(new EffectPass(camera, ...effects));
    c.setSize(w, h);
    this.applyShadow(T);
    if (this.onTier) this.onTier(name);
  }

  applyShadow(T) {
    const r = this.renderer;
    r.shadowMap.autoUpdate = T.shadowEvery === 1;
    r.shadowMap.needsUpdate = true;
    if (this.sun && this.sun.shadow.mapSize.x !== T.shadow) {
      this.sun.shadow.mapSize.set(T.shadow, T.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.tier.dpr) * this.scale;
    this.renderer.setPixelRatio(this.dpr);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /** chamado a cada frame com o tempo real gasto */
  measure(rawDt, playing) {
    if (!playing) return;
    this.cool -= rawDt;
    if (this.cool > 0 || document.hidden) return;
    this.acc += rawDt; this.frames++;
    if (this.acc < 1.4) return;
    const ms = (this.acc / this.frames) * 1000;
    this.acc = 0; this.frames = 0;
    this.lastMs = ms;
    if (ms > this.budget) {
      // primeiro reduz a resolução em passos, depois desce o degrau
      if (this.scale > 0.72) { this.scale = Math.max(0.72, this.scale * 0.86); this.resize(); this.cool = 1.5; return; }
      const i = ORDER.indexOf(this.tierName);
      if (i < ORDER.length - 1) { this.scale = 1; this.apply(ORDER[i + 1]); this.cool = 3; }
    }
  }

  render(dt) { this.composer.render(dt); }
}
