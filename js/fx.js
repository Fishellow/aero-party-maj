// Effets : herbe en 3D qui bouge au vent, particules (poussière, éclaboussures, confettis, étincelles), texte sur bannières.
import * as THREE from 'three';
import { W } from './world.js';

// ------------------------------------------------------------------ herbe
let bladeGeo = null, grassMat = null;
function blade() {
  if (bladeGeo) return bladeGeo; const g = new THREE.BufferGeometry(), N = 4, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N, w = 0.5 * (1 - t * t * 0.92); pos.push(-w, t, 0, w, t, 0); uv.push(0, t, 1, t); }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return bladeGeo = g;
}
function grassMaterial() {
  if (grassMat) return grassMat; const m = grassMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  m.onBeforeCompile = s => {
    s.uniforms.uT = W.skyU.uT; s.uniforms.uWho = W.grassWho;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aInfo; uniform float uT; uniform vec3 uWho[8]; varying float vH; varying float vTint;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <project_vertex>', `
        vH = uv.y; vTint = aInfo.y; vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float k = uv.y * uv.y;
        vec4 wp = instanceMatrix * vec4(transformed, 1.0); float hgt = wp.y - ip.y;
        float wv = sin(uT * 1.7 + ip.x * 0.33 + ip.z * 0.27 + aInfo.x) * 0.6 + sin(uT * 3.3 + ip.x * 0.9 + aInfo.x * 2.0) * 0.22;
        wp.x += (wv * 0.11 + aInfo.z * 0.25) * k; wp.z += cos(uT * 1.3 + ip.z * 0.4 + aInfo.x) * 0.07 * k;
        // l'herbe s'écrase et s'écarte sous les pieds des joueurs
        for (int i = 0; i < 8; i++) { vec3 d = ip.xyz - uWho[i]; float dd = length(d.xz); float push = smoothstep(1.0, 0.2, dd) * step(abs(d.y), 1.2); wp.y -= hgt * push * 0.7; wp.xz += d.xz / max(dd, 0.05) * push * 0.3 * uv.y; }
        vec4 mvPosition = modelViewMatrix * wp; gl_Position = projectionMatrix * mvPosition;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH; varying float vTint;')
      .replace('#include <color_fragment>', `vec3 tip = mix(vec3(0.30, 0.84, 0.10), vec3(0.74, 0.96, 0.24), vTint); diffuseColor.rgb = mix(vec3(0.03, 0.30, 0.03), tip, smoothstep(0.0, 0.9, vH)); diffuseColor.rgb += vec3(0.25, 0.3, 0.05) * pow(vH, 6.0);`);
  };
  return m;
}
export const grassShare = () => W.quality >= 1 ? 1 : W.quality >= 0.8 ? 0.55 : 0.25;
/** plante de l'herbe. pick(R) renvoie [x, y, z] ou null si on ne peut pas pousser là. */
export function makeGrass(parent, count, pick, R, size = 1) {
  const pts = []; for (let i = 0; i < count * 3 && pts.length < count; i++) { const p = pick(R); if (p) pts.push(p); }
  const mesh = new THREE.InstancedMesh(blade(), grassMaterial(), pts.length), info = new Float32Array(pts.length * 3), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  pts.forEach((p, i) => { const h = (0.22 + R() * R() * 0.5) * size; P.set(p[0], p[1], p[2]); Q.setFromAxisAngle(Y, R() * Math.PI * 2); S.set(0.07 + R() * 0.07, h, 1); M.compose(P, Q, S); mesh.setMatrixAt(i, M); info[i * 3] = R() * 6.28; info[i * 3 + 1] = R(); info[i * 3 + 2] = (R() - 0.5) * 0.5; });
  mesh.geometry = blade().clone(); mesh.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 3)); mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.noAO = true; mesh.userData.grassFull = pts.length; mesh.count = Math.round(pts.length * grassShare()); parent.add(mesh); return mesh;
}

// ------------------------------------------------------------------ particules
const MAX = 1400; let pts = null, pPos, pCol, pSize, pv = [], head = 0;
export function initFx() {
  W.grassWho = { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, -999, 0)) };
  const g = new THREE.BufferGeometry(); pPos = new Float32Array(MAX * 3); pCol = new Float32Array(MAX * 4); pSize = new Float32Array(MAX);
  g.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(pCol, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  for (let i = 0; i < MAX; i++) pv.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 0, s1: 0, a: 1, kind: 0 });
  pts = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uPx: { value: 1 } },
    vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uPx; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPx / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float soft = smoothstep(0.5, 0.18, d); float ring = smoothstep(0.5, 0.42, d) * smoothstep(0.30, 0.42, d);
      float a = vC.a > 1.5 ? ring * (vC.a - 2.0) : (vC.a < 0.0 ? step(max(abs(p.x), abs(p.y)), 0.38) * -vC.a : soft * vC.a); if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }` }));
  pts.frustumCulled = false; pts.renderOrder = 4; W.scene.add(pts);
}
const C = new THREE.Color();
function emit(x, y, z, o) { const i = head; head = (head + 1) % MAX; const p = pv[i]; p.life = p.max = o.life; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.g = o.g || 0; p.drag = o.drag || 0; p.s0 = o.s0; p.s1 = o.s1 == null ? o.s0 : o.s1; p.a = o.a == null ? 1 : o.a; p.kind = o.kind || 0;
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; C.set(o.color || '#ffffff'); pCol[i * 4] = C.r; pCol[i * 4 + 1] = C.g; pCol[i * 4 + 2] = C.b; }
const rnd = (a, b) => a + Math.random() * (b - a);
export const FX = {
  /** petit nuage de poussière au sol */
  puff(p, n = 8, power = 1, color = '#ffffff') { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(1, 3.2) * power; emit(p.x + Math.cos(a) * 0.2, p.y + 0.08, p.z + Math.sin(a) * 0.2, { life: rnd(0.35, 0.7), vx: Math.cos(a) * s, vy: rnd(0.4, 1.6) * power, vz: Math.sin(a) * s, drag: 3.5, s0: rnd(0.25, 0.4), s1: rnd(0.7, 1.1), a: 0.5, color }); } },
  /** étincelles qui jaillissent */
  spark(p, color = '#ffffff', n = 16, power = 1) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, e = rnd(-0.3, 1.2), s = rnd(3, 8) * power; emit(p.x, p.y, p.z, { life: rnd(0.3, 0.7), vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s, g: 9, drag: 1.5, s0: rnd(0.14, 0.26), s1: 0.02, a: 1, color: i % 3 ? color : '#ffffff' }); } },
  /** plouf : gerbe + anneaux */
  splash(x, y, z) { for (let i = 0; i < 46; i++) { const a = Math.random() * 6.28, s = rnd(1, 5); emit(x, y, z, { life: rnd(0.6, 1.3), vx: Math.cos(a) * s, vy: rnd(5, 15), vz: Math.sin(a) * s, g: 22, drag: 0.5, s0: rnd(0.2, 0.5), s1: 0.08, a: 0.85, color: i % 2 ? '#dff8ff' : '#8fe6ff' }); }
    for (let k = 0; k < 3; k++) emit(x, y + 0.05, z, { life: 1.1 + k * 0.35, s0: 1, s1: 9 + k * 5, a: 2.7, color: '#ffffff' }); },
  /** confettis de victoire */
  confetti(p, n = 90) { const cols = ['#ff3b5c', '#ffd21f', '#3fe26a', '#19c7ff', '#a04dff', '#ff8a1f', '#ffffff']; for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = rnd(1.5, 6); emit(p.x, p.y + 1.2, p.z, { life: rnd(1.6, 3.2), vx: Math.cos(a) * s, vy: rnd(6, 13), vz: Math.sin(a) * s, g: 9, drag: 1.6, s0: rnd(0.16, 0.3), a: -1, color: cols[i % cols.length], kind: 1 }); } },
  /** anneau qui s'élargit (trampoline, bumper, point de passage) */
  ring(p, color = '#ffffff', size = 5) { emit(p.x, p.y + 0.1, p.z, { life: 0.5, s0: 0.6, s1: size, a: 2.9, color }); },
  /** traînée pendant le plongeon */
  trail(p, color) { emit(p.x + rnd(-0.2, 0.2), p.y + rnd(0.3, 0.8), p.z + rnd(-0.2, 0.2), { life: 0.45, s0: 0.5, s1: 0.05, a: 0.55, color }); },
  /** goutte de fontaine */
  drop(x, y, z, a) { emit(x, y, z, { life: 0.9, vx: Math.cos(a) * 1.6, vy: 2.6, vz: Math.sin(a) * 1.6, g: 9, s0: 0.12, s1: 0.05, a: 0.8, color: '#dff8ff' }); },
  /** graine lumineuse qui monte doucement */
  mote(x, y, z) { emit(x, y, z, { life: 5, vx: rnd(-0.3, 0.3), vy: rnd(0.25, 0.6), vz: rnd(-0.3, 0.3), s0: 0.05, s1: 0.16, a: 0.7, color: Math.random() < 0.5 ? '#fff9c4' : '#d8ffb0' }); },
  update(dt) {
    if (!pts) return; pts.material.uniforms.uPx.value = W.renderer.domElement.height * 0.9;
    for (let i = 0; i < MAX; i++) { const p = pv[i]; if (p.life <= 0) { if (pSize[i] !== 0) { pSize[i] = 0; pCol[i * 4 + 3] = 0; } continue; }
      p.life -= dt; const t = 1 - Math.max(p.life, 0) / p.max, f = Math.exp(-p.drag * dt); p.vx *= f; p.vz *= f; p.vy = p.vy * f - p.g * dt;
      if (p.kind === 1 && p.vy < -1.6) { p.vy = -1.6; p.vx += Math.sin(p.life * 9 + i) * dt * 4; }
      pPos[i * 3] += p.vx * dt; pPos[i * 3 + 1] += p.vy * dt; pPos[i * 3 + 2] += p.vz * dt; pSize[i] = p.life > 0 ? p.s0 + (p.s1 - p.s0) * t : 0;
      const fade = Math.min(1, (1 - t) * 3); pCol[i * 4 + 3] = p.a > 1.5 ? 2 + (p.a - 2) * (1 - t) : p.a < 0 ? p.a * Math.min(1, (1 - t) * 4) : p.a * fade; }
    const g = pts.geometry; g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
  },
};

// ------------------------------------------------------------------ texte sur les bannières
export function bannerTexture(text, c1 = '#19b6ff', c2 = '#0a63d8') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, c1); g.addColorStop(0.5, c2); g.addColorStop(0.51, c2); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, 1024, 160);
  x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(0, 0, 1024, 74);
  x.fillStyle = 'rgba(255,255,255,.16)'; for (let i = -2; i < 24; i++) { x.beginPath(); x.moveTo(i * 60, 160); x.lineTo(i * 60 + 28, 160); x.lineTo(i * 60 + 100, 0); x.lineTo(i * 60 + 72, 0); x.fill(); }
  x.font = 'italic 800 104px "Segoe UI", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 12; x.strokeStyle = 'rgba(0,40,110,.55)'; x.strokeText(text, 512, 86); x.fillStyle = '#fff'; x.fillText(text, 512, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; return t;
}

/** panneau des scores : renvoie la texture et une fonction pour la redessiner */
export function boardTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 352; const x = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const draw = rows => {
    x.clearRect(0, 0, 1024, 352); const g = x.createLinearGradient(0, 0, 0, 352); g.addColorStop(0, 'rgba(10,99,216,.82)'); g.addColorStop(1, 'rgba(6,46,120,.88)'); x.fillStyle = g; x.beginPath(); x.roundRect(4, 4, 1016, 344, 36); x.fill(); x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,.85)'; x.stroke();
    x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.roundRect(14, 12, 996, 130, 28); x.fill();
    const n = Math.min(rows.length, 8), cols = n > 4 ? 2 : 1, per = Math.ceil(n / cols), rh = Math.min(78, 320 / per), cw = 1024 / cols;
    rows.slice(0, 8).forEach((r, i) => { const cx = Math.floor(i / per) * cw, y = 18 + (i % per) * rh + rh / 2;
      x.font = 'italic 800 ' + Math.round(rh * 0.5) + 'px "Segoe UI", Arial'; x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = i === 0 && r.score > 0 ? '#ffe45a' : '#ffffff'; x.fillText(String(i + 1), cx + 34, y);
      const og = x.createLinearGradient(0, y - rh * 0.3, 0, y + rh * 0.3); og.addColorStop(0, r.top); og.addColorStop(1, r.bot); x.fillStyle = og; x.beginPath(); x.arc(cx + 108, y, rh * 0.3, 0, 6.3); x.fill(); x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
      x.font = '700 ' + Math.round(rh * 0.52) + 'px "Segoe UI", Arial'; x.fillStyle = '#fff'; x.fillText(r.name, cx + 150, y + 2, cw - 300); x.textAlign = 'right'; x.fillStyle = '#d8ff8a'; x.fillText(r.score + ' pts', cx + cw - 34, y + 2); });
    t.needsUpdate = true; };
  draw([]); return { tex: t, draw };
}
