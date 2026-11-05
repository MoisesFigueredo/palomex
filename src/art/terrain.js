// Terreno com material procedural (estrada, trilhas gastas, seixos, folhas) e céu noturno.
import * as THREE from 'three';
import { G, LOOP, patch, NOISE_GLSL } from '../core/world.js';

const TERRAIN_GLSL = /* glsl */ `
float terrainH(float x, float z0){
  float a = abs(x);
  float s = clamp((a-3.6)/(15.0-3.6),0.0,1.0); s = s*s*(3.0-2.0*s);
  float t = 6.28318530718*z0/${LOOP.toFixed(1)};
  return s*(1.7+1.1*sin(x*0.31+t*2.0)+0.7*sin(x*0.73-t*5.0+1.3)+0.35*sin(x*1.4+t*11.0));
}`;

export function buildGround(scene, q) {
  const dz = q.groundDZ;
  const g = new THREE.PlaneGeometry(90, 192, q.groundSX, Math.round(192 / dz)).rotateX(-Math.PI / 2).translate(0, 0, 68);
  // mais vértices perto da estrada, menos nas bordas
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / 45;
    p.setX(i, Math.sign(x) * Math.pow(Math.abs(x), 1.7) * 45);
  }
  const mat = patch(new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 }), { rim: 0.05, tint: true, extraKey: 'ground' });
  const prior = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prior(s, r);
    s.vertexShader = `varying vec2 vGP;\n${TERRAIN_GLSL}\n` + s.vertexShader
      .replace('#include <beginnormal_vertex>', /* glsl */ `
        float gZ0 = position.z + modelMatrix[3].z + uScroll;
        float gH0 = terrainH(position.x, gZ0);
        vec3 objectNormal = normalize(vec3(gH0 - terrainH(position.x+0.5, gZ0), 0.5, gH0 - terrainH(position.x, gZ0+0.5)));
        vGP = vec2(position.x, gZ0);`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += gH0;');
    s.fragmentShader = `varying vec2 vGP; float gGroundH;
      float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
      float tn(vec2 p, float per){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        vec2 w = vec2(4096.0, per);
        float a=h21(mod(i,w)), b=h21(mod(i+vec2(1,0),w)), c=h21(mod(i+vec2(0,1),w)), d=h21(mod(i+vec2(1,1),w));
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      float tfbm(vec2 p){ return tn(p*0.25,48.0)*0.5 + tn(p*0.5,96.0)*0.25 + tn(p,192.0)*0.15 + tn(p*2.0,384.0)*0.1; }
      vec3 perturbN(vec3 pos, vec3 n, float h, float k){
        vec3 dx=dFdx(pos), dy=dFdy(pos); float hx=dFdx(h)*k, hy=dFdy(h)*k;
        vec3 r1=cross(dy,n), r2=cross(n,dx); float det=dot(dx,r1);
        vec3 grad=sign(det)*(hx*r1+hy*r2); return normalize(abs(det)*n-grad); }
      ` + s.fragmentShader
      .replace('#include <map_fragment>', /* glsl */ `
        vec2 gp = vGP; gp.y = mod(gp.y, ${LOOP.toFixed(1)});
        float gN = tfbm(gp);
        float gN2 = tn(gp*2.0,384.0);
        float gN3 = tn(gp*4.0,768.0);
        float gA = abs(gp.x);
        float gEdge = 3.1 + (gN-0.5)*2.2;
        float gRoad = smoothstep(gEdge+0.35, gEdge-0.45, gA);
        // trilhas gastas nas três pistas: leitura do jogo embutida no chão
        float gTrack = smoothstep(0.62,0.1,abs(gA-1.55)) * smoothstep(0.0,0.3,gA) + smoothstep(0.5,0.05,gA)*0.8;
        vec3 gDirt = mix(vec3(0.115,0.075,0.05), vec3(0.235,0.16,0.10), gN2*0.7+gN*0.3);
        gDirt = mix(gDirt, vec3(0.31,0.225,0.15), gTrack*0.45*(0.5+gN3*0.5));
        // seixos
        vec2 gC = gp*3.2; vec2 gI = floor(gC); vec2 gF = fract(gC)-0.5;
        float gR = h21(mod(gI,vec2(4096.0,614.4)));
        float gPeb = smoothstep(0.24,0.2,length(gF+(gR-0.5)*0.4))*step(0.78,gR);
        gDirt = mix(gDirt, vec3(0.22,0.21,0.2)*(0.5+gR*0.6), gPeb*0.6);
        // folhas secas espalhadas
        vec2 gC2 = gp*1.6+7.0; vec2 gI2 = floor(gC2); vec2 gF2 = fract(gC2)-0.5;
        float gR2 = h21(mod(gI2,vec2(4096.0,307.2)));
        float gAng = gR2*6.28; vec2 gL = vec2(cos(gAng)*gF2.x-sin(gAng)*gF2.y, sin(gAng)*gF2.x+cos(gAng)*gF2.y);
        float gLeaf = smoothstep(0.5,0.42,length(gL*vec2(2.1,5.0)))*step(0.55,gR2);
        vec3 gLeafC = mix(vec3(0.42,0.17,0.04),vec3(0.38,0.28,0.05),fract(gR2*17.0));
        gDirt = mix(gDirt, gLeafC, gLeaf*0.55);
        vec3 gGrass = mix(vec3(0.028,0.075,0.03), vec3(0.075,0.16,0.05), gN*0.6+gN3*0.4);
        gGrass = mix(gGrass, vec3(0.13,0.2,0.05), smoothstep(0.55,0.8,gN2)*0.5);
        diffuseColor.rgb = mix(gGrass, gDirt, gRoad);
        gGroundH = mix(gN3*0.7+gN2*0.4, gN2*0.45+gN3*0.3 - gTrack*0.3, gRoad);`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = perturbN(-vViewPosition, normal, gGroundH, 0.1);');
  };
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.frustumCulled = false;
  scene.add(m);
  return { mesh: m, dz };
}

/* ---------- céu ---------- */
export function buildSky(scene) {
  const U = {
    ...G,
    uZen: { value: new THREE.Color('#050714') },
    uHor: { value: new THREE.Color('#2b3060') },
    uMoonC: { value: new THREE.Color('#fff2d0') },
    uAur: { value: 0.3 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*viewMatrix*vec4(position+cameraPosition,1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform vec3 uZen,uHor,uFog,uFogGlow,uMoonDir,uMoonC; uniform float uTime,uAur,uFlash; varying vec3 vDir;
      ${NOISE_GLSL}
      float fbm(vec3 p){ return vn3(p)*0.55+vn3(p*2.1)*0.28+vn3(p*4.3)*0.17; }
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y,0.0);
        vec3 c = mix(uHor,uZen,pow(h,0.55));
        c = mix(c,uFog,smoothstep(0.1,-0.02,d.y));
        float md = dot(d,uMoonDir);
        // halo largo da lua: base da sensação de luar
        c += uFogGlow*pow(max(md,0.0),14.0)*0.55 + uMoonC*pow(max(md,0.0),160.0)*0.35;
        // estrelas
        vec3 sp = d*170.0; vec3 si = floor(sp); float sr = h31(si);
        if (sr>0.985) { float tw = 0.6+0.4*sin(uTime*(1.0+sr*4.0)+sr*50.0); float sd = length(fract(sp)-0.5);
          c += vec3(0.9,0.95,1.0)*smoothstep(0.32,0.02,sd)*tw*smoothstep(0.03,0.3,h)*(sr-0.985)*170.0; }
        // aurora suave no alto
        if (uAur>0.001 && d.y>0.05) { vec2 ap = d.xz/(d.y+0.25);
          float a = fbm(vec3(ap*vec2(1.2,3.0),uTime*0.05)); float band = smoothstep(0.46,0.72,a)*smoothstep(0.05,0.35,d.y)*smoothstep(0.95,0.4,d.y);
          c += mix(uFogGlow,vec3(0.3,1.0,0.7),0.4)*band*uAur; }
        // nuvens atravessando a lua
        vec2 cp = d.xz/(abs(d.y)+0.32)*0.9 + vec2(uTime*0.012,0.0);
        float cl = smoothstep(0.42,0.78,fbm(vec3(cp,1.0)));
        // disco
        float disc = smoothstep(0.99925,0.99955,md);
        float crat = fbm(d*90.0);
        c = mix(c, uMoonC*(2.3+crat*2.2), disc*(1.0-cl*0.75));
        c = mix(c, uZen*0.6+uFogGlow*pow(max(md,0.0),30.0)*0.8, cl*0.72*smoothstep(-0.02,0.2,d.y));
        c += vec3(uFlash*0.6);
        gl_FragColor = vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  return { sky, U };
}
