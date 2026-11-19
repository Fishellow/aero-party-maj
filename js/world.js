// Le monde : rendu, ciel, eau, matières brillantes, et la boîte de décors faite dans Blender.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from '../lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../lib/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from '../lib/jsm/postprocessing/GTAOPass.js';

export const W = { T: THREE, scene: null, cam: null, renderer: null, kit: {}, perso: null, time: 0, spins: [], quality: 1 };
const SUN = new THREE.Vector3(0.45, 0.62, 0.35).normalize();
export const WATER_Y = -34;

const SKY_FRAG = /* glsl */`
uniform float uT; uniform vec3 uSun; varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 zen = vec3(0.0, 0.2, 0.78), mid = vec3(0.04, 0.46, 0.98), hor = vec3(0.5, 0.86, 1.0);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h)); c = mix(c, zen, smoothstep(0.2, 0.95, h));
  c = mix(c, vec3(0.35, 0.8, 1.0), smoothstep(0.0, -0.25, h));
  // aurores : rubans doux qui ondulent
  float a = atan(d.z, d.x);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cy = 0.34 + fi*0.13 + 0.07*sin(a*2.0 + uT*0.11 + fi*2.1) + 0.04*sin(a*5.0 - uT*0.07 + fi);
    float bq = (h - cy) / (0.05 + 0.02*fi); float band = exp(-bq * bq);
    float streak = 0.55 + 0.45*noise(vec2(a*9.0 + fi*7.0, uT*0.15 + fi));
    vec3 ac = mix(vec3(0.3, 1.0, 0.6), vec3(0.5, 0.75, 1.0), 0.5 + 0.5*sin(a*1.5 + fi*1.7));
    ac = mix(ac, vec3(1.0, 0.6, 0.95), smoothstep(0.3, 1.0, sin(a*0.9 + fi*2.3 + 1.0)));
    c += ac * band * streak * 0.26;
  }
  // voile de nuages très haut
  float cl = noise(d.xz / max(h, 0.08) * 1.6 + uT*0.01) * noise(d.xz / max(h, 0.08) * 4.1 - uT*0.015);
  c = mix(c, vec3(1.0), smoothstep(0.32, 0.75, cl) * smoothstep(0.05, 0.4, h) * 0.38);
  // soleil + halos
  float s = clamp(dot(d, uSun), 0.0, 1.0);
  c += vec3(1.0, 0.97, 0.85) * (pow(s, 900.0) * 6.0 + pow(s, 60.0) * 0.55 + pow(s, 6.0) * 0.22);
  float rq = (acos(clamp(s, 0.0, 1.0)) - 0.33) / 0.012; float ring = exp(-rq * rq); c += vec3(0.7, 0.9, 1.0) * ring * 0.10;
  gl_FragColor = vec4(c, 1.0);
}`;
const SKY_VERT = `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = projectionMatrix * vec4(p.xyz, 1.0); gl_Position.z = gl_Position.w; }`;

const WATER_FRAG = /* glsl */`
uniform float uT; uniform vec3 uSun; uniform vec3 uCam; varying vec3 vP;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float hgt(vec2 p){ return noise(p*0.09 + uT*0.25)*1.0 + noise(p*0.23 - uT*0.3)*0.45 + noise(p*0.71 + uT*0.5)*0.18; }
void main(){
  vec2 p = vP.xz; float e = 0.6;
  vec3 n = normalize(vec3(hgt(p-vec2(e,0.)) - hgt(p+vec2(e,0.)), 1.1, hgt(p-vec2(0.,e)) - hgt(p+vec2(0.,e))));
  vec3 v = normalize(uCam - vP); float fr = pow(clamp(1.0 - dot(n, v), 0.0, 1.0), 3.0);
  vec3 deep = vec3(0.0, 0.42, 0.78), shal = vec3(0.1, 0.8, 0.9), sky = vec3(0.5, 0.86, 1.0);
  vec3 c = mix(deep, shal, smoothstep(0.2, 1.3, hgt(p)));
  c = mix(c, sky, fr * 0.85);
  vec3 r = reflect(-uSun, n); c += vec3(1.0, 0.98, 0.9) * pow(max(dot(r, -v), 0.0), 120.0) * 1.6;
  // reflets en filet, comme au fond d'une piscine
  float ca = noise(p*0.5 + uT*0.4) - noise(p*0.5 - uT*0.35 + 9.0); c += vec3(0.6, 1.0, 1.0) * smoothstep(0.06, 0.0, abs(ca)) * 0.22;
  float dist = length(uCam.xz - vP.xz); c = mix(c, vec3(0.5, 0.86, 1.0), smoothstep(300.0, 1100.0, dist));
  gl_FragColor = vec4(c, 1.0);
}`;

const BUBBLE_FRAG = /* glsl */`
varying vec3 vN; varying vec3 vV; varying float vS;
void main(){ vec3 n = normalize(vN); float f = pow(clamp(1.0 - abs(dot(n, normalize(vV))), 0.0, 1.0), 2.2);
  vec3 iri = 0.5 + 0.5*cos(6.283*(f*1.3 + vS + vec3(0.0, 0.33, 0.67)));
  float hl = smoothstep(0.90, 0.97, dot(n, normalize(vec3(-0.45, 0.7, 0.55))));
  float hl2 = smoothstep(0.95, 0.99, dot(n, normalize(vec3(0.5, -0.55, 0.6)))) * 0.4;
  vec3 c = mix(vec3(0.8, 0.95, 1.0), iri, 0.55) * f * 1.25 + vec3(hl + hl2);
  gl_FragColor = vec4(c, clamp(f*0.9 + hl + hl2 + 0.04, 0.0, 1.0)); }`;
const BUBBLE_VERT = `attribute float aS; varying vec3 vN; varying vec3 vV; varying float vS;
void main(){ vS = aS; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vN = normalMatrix * mat3(instanceMatrix) * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;

// --- la matière "gelée brillante" des personnages -----------------------------------------
const JELLY_VERT = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vWN = normalize(mat3(modelMatrix) * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const JELLY_FRAG = /* glsl */`
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform float uHit; uniform float uGhost;
varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
void main(){
  vec3 n = normalize(vN), v = normalize(vV); float ndv = clamp(dot(n, v), 0.0, 1.0);
  float t = vUv.y;
  vec3 c = mix(uBot, uMid, smoothstep(0.02, 0.45, t)); c = mix(c, uTop, smoothstep(0.4, 0.92, t));
  // lumière qui traverse par en dessous
  c += uBot * smoothstep(0.55, 0.0, t) * 0.28 * (0.4 + 0.6*ndv);
  // contour plus sombre et saturé, comme une bille de verre
  float fr = pow(clamp(1.0 - ndv, 0.0, 1.0), 2.2);
  c = mix(c, uTop * 0.36, fr * 0.85);
  // lumière du ciel
  c *= 0.86 + 0.22 * max(vWN.y, 0.0);
  // grand reflet doux en haut + fenêtre nette
  float g = smoothstep(0.25, 0.9, n.y) * smoothstep(0.75, 0.2, length(n.xy - vec2(-0.12, 0.6)));
  c = mix(c, vec3(1.0), g * 0.3);
  vec2 w = n.xy - vec2(-0.36, 0.52);
  float win = smoothstep(0.15, 0.11, abs(w.x + w.y*0.25)) * smoothstep(0.11, 0.075, abs(w.y));
  float bar = smoothstep(0.012, 0.004, abs(w.x + w.y*0.25 - 0.02));
  c = mix(c, vec3(1.0), win * (1.0 - bar*0.55) * 0.9);
  // petit reflet de rebond en bas
  c += vec3(1.0) * smoothstep(0.75, 0.95, dot(n, normalize(vec3(0.45, -0.5, 0.65)))) * 0.16;
  c = mix(c, vec3(1.0), uHit);
  gl_FragColor = vec4(c, 1.0 - uGhost * 0.65);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function jellyMat(skin) {
  const col = h => new THREE.Color(h);
  return new THREE.ShaderMaterial({ vertexShader: JELLY_VERT, fragmentShader: JELLY_FRAG, transparent: false,
    uniforms: { uTop: { value: col(skin.top) }, uMid: { value: col(skin.mid || skin.top).lerp(col(skin.bot), skin.mid ? 0 : 0.45) }, uBot: { value: col(skin.bot) }, uHit: { value: 0 }, uGhost: { value: 0 } } });
}

// --- dernière passe : reflets du soleil dans l'objectif, couleurs, vignette
const GRADE = { uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uVis: { value: 0 }, uAspect: { value: 1.6 }, uFade: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
  uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uVis; uniform float uAspect; uniform float uFade; varying vec2 vUv;
  float disc(vec2 c, float r, float soft){ return smoothstep(r, r * soft, length((vUv - c) * vec2(uAspect, 1.0))); }
  void main(){
    vec3 c = texture2D(tDiffuse, vUv).rgb; c = clamp(c, 0.0, 1.0);
    if (uVis > 0.001) { vec2 s = uSun, d = vec2(0.5) - s; vec3 f = vec3(0.0); float dist = length((vUv - s) * vec2(uAspect, 1.0));
      f += vec3(1.0, 0.95, 0.82) * (0.03 / (dist + 0.035)) * 0.5;
      f += vec3(0.6, 0.85, 1.0) * smoothstep(0.010, 0.0, abs(vUv.y - s.y)) * smoothstep(0.5, 0.0, abs(vUv.x - s.x)) * 0.3;
      f += vec3(0.4, 1.0, 0.6) * disc(s + d * 0.55, 0.05, 0.6) * 0.09;
      f += vec3(1.0, 0.6, 0.9) * disc(s + d * 0.9, 0.028, 0.2) * 0.11;
      f += vec3(0.5, 0.8, 1.0) * disc(s + d * 1.35, 0.09, 0.85) * 0.08;
      f += vec3(1.0, 0.9, 0.5) * disc(s + d * 1.8, 0.14, 0.9) * 0.05;
      float rg = length((vUv - (s + d * 2.2)) * vec2(uAspect, 1.0)); f += vec3(0.6, 0.8, 1.0) * smoothstep(0.02, 0.0, abs(rg - 0.2)) * 0.06;
      c += f * uVis; }
    float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.16); c = (c - 0.5) * 1.07 + 0.5;
    vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.45;
    c = mix(c, vec3(1.0), uFade);
    gl_FragColor = vec4(c, 1.0);
  }` };

function rim(m, color, power = 3, k = 0.6) {
  m.userData.rim = [color, power, k];
  m.onBeforeCompile = s => { s.uniforms.uRim = { value: new THREE.Color(color) };
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;').replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), ${power.toFixed(1)}) * ${k.toFixed(2)};`); };
  m.customProgramCacheKey = () => 'rim' + color + power + k; return m;
}
// --- matières des décors, retrouvées par leur nom donné dans Blender ------------------------
function grassMat() {
  const m = new THREE.MeshStandardMaterial({ color: 0x36c41c, roughness: 0.7 });
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWp; float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float stripe = smoothstep(-0.25, 0.25, sin((vWp.x + vWp.z) * 0.95));
      float n1 = gn(vWp.xz * 0.35), n2 = gn(vWp.xz * 6.0);
      diffuseColor.rgb *= mix(0.86, 1.1, stripe) * (0.88 + 0.22*n1) * (0.94 + 0.12*n2);
      diffuseColor.rgb += vec3(0.10, 0.12, 0.0) * n1;`);
  };
  return m;
}
function makeMats() {
  const P = o => new THREE.MeshPhysicalMaterial(o), S = o => new THREE.MeshStandardMaterial(o);
  return {
    blanc: rim(P({ color: 0xdfeaf7, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }), '#9fd8ff', 3.5, 0.35),
    verre: rim(P({ color: 0x1f9bff, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.66, clearcoat: 1, envMapIntensity: 1.9, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 600] }), '#9fe8ff', 2.5, 0.5),
    verre_clair: rim(P({ color: 0xd8f4ff, roughness: 0.03, transparent: true, opacity: 0.3, clearcoat: 1, envMapIntensity: 2.2, depthWrite: false, iridescence: 1, iridescenceIOR: 1.4, iridescenceThicknessRange: [150, 700] }), '#ffffff', 2.0, 0.55),
    chrome: S({ color: 0xe6eef5, roughness: 0.08, metalness: 1, envMapIntensity: 1.4 }),
    herbe: grassMat(),
    eau: P({ color: 0x7fdcff, roughness: 0.02, transparent: true, opacity: 0.8, emissive: 0x2a9fd0, emissiveIntensity: 0.5, envMapIntensity: 2.0, clearcoat: 1 }),
    bois: S({ color: 0xe2c59a, roughness: 0.55 }),
    feuille: rim(P({ color: 0x27b81a, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25, emissive: 0x0a3a05, emissiveIntensity: 0.5 }), '#d8ff5a', 2.6, 0.5),
    feuille2: rim(P({ color: 0x7ada24, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25, emissive: 0x1a3a05, emissiveIntensity: 0.5 }), '#f4ff7a', 2.6, 0.5),
    petale: P({ color: 0xff5aa8, roughness: 0.3, clearcoat: 1 }),
    coeur: S({ color: 0xffd21f, roughness: 0.4 }),
    lumiere: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1.5, 1.7), toneMapped: false }),
    or: S({ color: 0xffc533, roughness: 0.14, metalness: 1, envMapIntensity: 1.5 }),
    poisson_a: P({ color: 0xff7a12, roughness: 0.2, clearcoat: 1 }),
    poisson_b: P({ color: 0xffffff, roughness: 0.2, clearcoat: 1 }),
    noir: S({ color: 0x10141c, roughness: 0.2 }),
    nuage: S({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.3 }),
    bande: P({ color: 0x1aa4ff, roughness: 0.15, clearcoat: 1, envMapIntensity: 1.3 }),
    orbe: P({ color: 0x3fe26a, roughness: 0.05, clearcoat: 1, envMapIntensity: 1.7, emissive: 0x3fe26a, emissiveIntensity: 0.12 }),
    dalle: rim(P({ color: 0x5fd0ff, roughness: 0.05, transparent: true, opacity: 0.84, clearcoat: 1, envMapIntensity: 1.8, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 650] }), '#ffffff', 2.2, 0.45),
    roche: P({ color: 0xcfdde8, roughness: 0.35, clearcoat: 0.6 }),
    banniere: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    tissu: P({ color: 0xff3b5c, roughness: 0.6, side: THREE.DoubleSide, sheen: 1, sheenColor: 0xffffff }),
    terre: P({ color: 0x3fcf3a, roughness: 0.4, clearcoat: 1 }),
    ...Object.fromEntries(['#ff3b5c', '#ff8a1f', '#ffe21f', '#3fe26a', '#19c7ff', '#3d6bff', '#a04dff'].map((c, i) => ['arc' + i, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.42, depthWrite: false, fog: false })])),
  };
}
const TINTABLE = { bande: 1, orbe: 1, dalle: 1, petale: 1, poisson_a: 1, verre: 1, feuille: 1, feuille2: 1, tissu: 1 };

export async function initWorld(canvas) {
  const r = W.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 0.9;
  const sc = W.scene = new THREE.Scene(); sc.fog = new THREE.Fog(0x9fdcff, 220, 1100);
  W.cam = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  // ciel
  const skyU = W.skyU = { uT: { value: 0 }, uSun: { value: SUN } };
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false }));
  W.sky.frustumCulled = false; W.sky.renderOrder = -10; W.sky.userData.noAO = true; sc.add(W.sky);
  // reflets : on photographie le ciel une fois
  const pm = new THREE.PMREMGenerator(r), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: SKY_FRAG, uniforms: skyU, side: THREE.BackSide })));
  sc.environment = pm.fromScene(es, 0.02).texture; sc.environmentIntensity = 0.65; pm.dispose();
  // lumières
  sc.add(new THREE.HemisphereLight(0xbfe6ff, 0x6fd060, 0.75));
  const sun = W.sun = new THREE.DirectionalLight(0xfff1d6, 2.1); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const c = sun.shadow.camera; c.left = c.bottom = -38; c.right = c.top = 38; c.near = 1; c.far = 220; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  sc.add(sun, sun.target);
  // mer
  W.waterU = { uT: skyU.uT, uSun: { value: SUN }, uCam: { value: new THREE.Vector3() } };
  const water = W.water = new THREE.Mesh(new THREE.CircleGeometry(1500, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ fragmentShader: WATER_FRAG, uniforms: W.waterU, fog: false,
    vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }` }));
  water.position.y = WATER_Y; water.userData.noAO = true; sc.add(water);
  // bulles
  const NB = 90, bg = new THREE.SphereGeometry(1, 20, 14), seeds = new Float32Array(NB);
  W.bub = []; for (let i = 0; i < NB; i++) { seeds[i] = Math.random(); W.bub.push({ x: (Math.random() - 0.5) * 90, y: Math.random() * 46 - 12, z: (Math.random() - 0.5) * 90, s: 0.18 + Math.random() ** 2 * 1.1, v: 0.5 + Math.random() * 1.2, p: Math.random() * 9 }); }
  bg.setAttribute('aS', new THREE.InstancedBufferAttribute(seeds, 1));
  W.bubbles = new THREE.InstancedMesh(bg, new THREE.ShaderMaterial({ vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false, fog: false }), NB);
  W.bubbles.frustumCulled = false; W.bubbles.userData.noAO = true; sc.add(W.bubbles);
  // rendu final avec halo lumineux
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4, type: THREE.HalfFloatType });
  const comp = W.comp = new EffectComposer(r, rt); comp.addPass(new RenderPass(sc, W.cam));
  try { const ao = W.ao = new GTAOPass(sc, W.cam, 4, 4); ao.blendIntensity = 0.9; ao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.3, thickness: 1.2, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false }); ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 }); comp.addPass(ao); } catch (e) { console.warn('pas d\'occlusion ambiante', e); }
  W.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.6, 1.0); comp.addPass(W.bloom); comp.addPass(new OutputPass()); W.grade = new ShaderPass(GRADE); comp.addPass(W.grade);
  // décors
  W.mats = makeMats();
  const L = new GLTFLoader(), load = u => new Promise((ok, ko) => L.load(u, ok, undefined, ko));
  const [kit, perso] = await Promise.all([load('models/kit.glb'), load('models/perso.glb')]);
  for (const o of [...kit.scene.children]) {
    o.traverse(m => { if (!m.isMesh) return; const mm = W.mats[m.material.name]; if (mm) m.material = mm; else console.warn('matière inconnue', m.material.name);
      m.castShadow = !m.material.transparent && m.material.name !== 'lumiere' && m.material.name !== 'banniere'; m.receiveShadow = !m.material.transparent; });
    o.position.set(0, 0, 0); W.kit[o.name] = o;
  }
  for (const k in W.mats) W.mats[k].name = k;
  W.perso = perso.scene.getObjectByName('perso') || perso.scene.children[0];
  resize(); addEventListener('resize', resize);
  return W;
}
export function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio, 2) * W.quality;
  W.renderer.setPixelRatio(pr); W.renderer.setSize(w, h, false); W.comp.setPixelRatio(pr); W.comp.setSize(w, h); W.cam.aspect = w / h; W.cam.updateProjectionMatrix();
}

const tintCache = {};
/** pose une pièce du kit. tint = couleur pour les parties colorables. */
export function spawn(name, opt = {}) {
  const src = W.kit[name]; if (!src) throw new Error('pièce inconnue : ' + name);
  const o = src.clone(true);
  if (opt.tint != null) o.traverse(m => { if (!m.isMesh || !TINTABLE[m.material.name]) return; if (opt.only && !opt.only.includes(m.material.name)) return;
    const key = m.material.name + '|' + opt.tint; let t = tintCache[key];
    if (!t) { t = tintCache[key] = m.material.clone(); t.name = m.material.name; t.color.set(opt.tint); if (m.material.userData.rim) rim(t, ...m.material.userData.rim); if (t.emissive && m.material.name === 'orbe') t.emissive.set(opt.tint); }
    m.material = t; });
  if (opt.pos) o.position.set(...opt.pos); if (opt.rot != null) o.rotation.y = opt.rot;
  if (opt.scale != null) Array.isArray(opt.scale) ? o.scale.set(...opt.scale) : o.scale.setScalar(opt.scale);
  o.traverse(n => { if (/^spin[YZ]_/.test(n.name)) { n.userData.axis = n.name[4] === 'Y' ? 'y' : 'z'; n.userData.speed = opt.spin != null ? opt.spin : 0.6; if (!opt.manual) W.spins.push(n); o.userData.spin = n; } });
  (opt.parent || W.scene).add(o); return o;
}
export function clearSpins() { W.spins.length = 0; }

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3();
export function renderWorld(dt, focus) {
  W.time += dt; W.skyU.uT.value = W.time;
  for (const n of W.spins) n.rotation[n.userData.axis] += n.userData.speed * dt;
  const cp = W.cam.position; W.sky.position.copy(cp); W.sky.scale.setScalar(1500); W.waterU.uCam.value.copy(cp); W.water.position.x = cp.x; W.water.position.z = cp.z;
  const f = focus || cp; W.sun.target.position.set(f.x, f.y, f.z); W.sun.position.set(f.x + SUN.x * 110, f.y + SUN.y * 110, f.z + SUN.z * 110);
  for (let i = 0; i < W.bub.length; i++) { const b = W.bub[i]; b.y += b.v * dt; if (b.y > 34) { b.y = -12; }
    const x = f.x + ((b.x - f.x) % 90 + 135) % 90 - 45, z = f.z + ((b.z - f.z) % 90 + 135) % 90 - 45;
    V.set(x + Math.sin(W.time * 0.5 + b.p) * 1.2, f.y + b.y, z + Math.cos(W.time * 0.4 + b.p) * 1.2); S3.setScalar(b.s * (1 + 0.05 * Math.sin(W.time * 3 + b.p)));
    M4.compose(V, Q, S3); W.bubbles.setMatrixAt(i, M4); }
  W.bubbles.instanceMatrix.needsUpdate = true;
  // reflets du soleil dans l'objectif : seulement si le soleil est à l'écran et pas caché
  V.copy(cp).addScaledVector(SUN, 1000).project(W.cam); const on = V.z < 1 && Math.abs(V.x) < 1.15 && Math.abs(V.y) < 1.15 && !(W.sunBlocked && W.sunBlocked(cp, SUN));
  const gu = W.grade.uniforms; gu.uSun.value.set(V.x * 0.5 + 0.5, V.y * 0.5 + 0.5); gu.uVis.value += ((on ? 1 : 0) - gu.uVis.value) * Math.min(1, dt * 7); gu.uAspect.value = W.cam.aspect; gu.uFade.value = W.fade || 0;
  W.comp.render(dt);
}
