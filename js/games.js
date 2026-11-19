// Les niveaux : le lobby et les mini-jeux. Chaque niveau pose des pièces du kit Blender et leurs collisions.
import * as THREE from 'three';
import { W, spawn, clearSpins } from './world.js';
import { PR, PH } from './player.js';
import { makeGrass, bannerTexture, boardTexture, FX } from './fx.js';
import { more } from './games2.js';

export const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const RAINBOW = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#3fe26a', '#19c7ff', '#3d6bff', '#a04dff', '#ff5ac8'];
const TAU = Math.PI * 2, ORB_GEO = new THREE.SphereGeometry(0.42, 22, 16), ORB_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.35, 0.18), toneMapped: false });

export class Level {
  constructor() { this.root = new THREE.Group(); W.scene.add(this.root); this.cols = []; this.movers = []; this.bars = []; this.bumpers = []; this.spawns = []; this.checks = []; this.anims = []; this.killY = -20; this.tiles = []; this.hit = 0; this.zones = []; this.orbs = []; this.ticks = []; this.shrinks = []; clearSpins(); }
  dispose() { W.scene.remove(this.root); clearSpins(); }
  col(c) { c.on = true; c.dx = c.dy = c.dz = 0; this.cols.push(c); return c; }
  /** plateforme ronde : dessus à la hauteur y */
  cyl(x, y, z, r, o = {}) {
    const ys = o.thick || Math.min(2.2, Math.max(1, r * 0.4)), c = this.col({ k: 'c', x, y, z, r, h: 0.42 * ys });
    if (o.vis !== false) c.vis = spawn('plateforme', { parent: this.root, pos: [x, y, z], scale: [r, ys, r], tint: o.tint, only: ['bande'] });
    if (o.move) this.movers.push({ c, f: o.move }); if (o.rf) this.shrinks.push({ c, f: o.rf, ys }); return c;
  }
  /** dalle rectangulaire sx × sz */
  box(x, y, z, sx, sz, o = {}) {
    const ys = o.thick || 1.6, c = this.col({ k: 'b', x, y, z, hx: sx / 2, hz: sz / 2, yaw: o.yaw || 0, h: 0.4 * ys });
    if (o.vis !== false) c.vis = spawn('bloc', { parent: this.root, pos: [x, y, z], rot: o.yaw || 0, scale: [sx, ys, sz], tint: o.tint, only: ['bande'] });
    if (o.move) this.movers.push({ c, f: o.move }); return c;
  }
  /** barre qui tourne. ang(t) donne son angle. */
  bar(x, y, z, half, ang, o = {}) {
    const s = o.s || 1, vis = spawn('barre', { parent: this.root, pos: [x, y, z], scale: s, tint: o.tint, manual: true });
    vis.userData.spin.scale.x = half / s; this.col({ k: 'c', x, y: y + 0.85 * s, z, r: 0.95 * s, h: 0.85 * s });
    const b = { x, y: y + 0.75 * s, z, half, rad: 0.3 * s, ang, node: vis.userData.spin, a: 0, w: 0, power: o.power || 1 }; this.bars.push(b); return b;
  }
  bumper(x, y, z, s = 1, tint, move) { const vis = spawn('bumper', { parent: this.root, pos: [x, y, z], scale: s, tint, only: ['orbe'] }); if (!move) this.col({ k: 'c', x, y: y + 0.3 * s, z, r: 0.9 * s, h: 0.3 * s }); this.bumpers.push({ x, y: y + 0.82 * s, z, r: 0.85 * s, vis, k: 0, s, move }); }
  /** bulle dorée à ramasser, visible à partir du temps `at` */
  orb(x, y, z, at, fall) { const g = new THREE.Group(), core = new THREE.Mesh(ORB_GEO, ORB_MAT), halo = new THREE.Mesh(ORB_GEO, W.mats.verre_clair); halo.scale.setScalar(1.55); halo.userData.noAO = true; core.castShadow = true; g.add(core, halo); g.position.set(x, y, z); g.visible = false; this.root.add(g); this.orbs.push({ x, y, z, at, g, fall: fall || 0, taken: false, asked: false }); }
  takeOrb(i) { const o = this.orbs[i]; if (!o || o.taken) return false; o.taken = true; o.g.visible = false; FX.spark(o, '#ffe45a', 16, 0.9); FX.ring(o, '#ffe45a', 5); return true; }
  tramp(x, y, z, s = 1.6, tint, power = 19) { const vis = spawn('trampoline', { parent: this.root, pos: [x, y, z], scale: s, tint, only: ['bande'] }); const c = this.col({ k: 'c', x, y: y + 0.05, z, r: s * 0.95, h: 0.5 * s, bounce: power, hitT: 9 }); this.anims.push((t, dt) => { c.hitT += dt; const k = Math.max(0, 1 - c.hitT * 2.5); vis.scale.set(s * (1 + k * 0.12), s * (1 - k * 0.5 * Math.cos(c.hitT * 30)), s * (1 + k * 0.12)); }); }
  deco(name, x, y, z, o = {}) { return spawn(name, Object.assign({ parent: this.root, pos: [x, y, z] }, o)); }
  /** dalle de verre qui disparaît après qu'on a marché dessus */
  tile(x, y, z, tint, onTouch) {
    const i = this.tiles.length, vis = spawn('dalle_hex', { parent: this.root, pos: [x, y, z], tint, only: ['dalle'] });
    const c = this.col({ k: 'c', x, y, z, r: 1.36, h: 0.35, touch: () => { if (!T.dying) onTouch(i); } }), T = { i, c, vis, dying: false, t: 0 }; this.tiles.push(T); return T;
  }
  /** portique avec un texte sur la bannière */
  gate(text, x, y, z, o = {}) { const g = this.deco('portique', x, y, z, o), mat = new THREE.MeshBasicMaterial({ map: bannerTexture(text, o.c1, o.c2) }); g.traverse(m => { if (m.isMesh && m.material.name === 'banniere') m.material = mat; }); return g; }
  /** rambarde de verre le long d'un segment, avec sa collision */
  rail(x1, z1, x2, z2, y) { const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 2)), yaw = Math.atan2(-(z2 - z1), x2 - x1);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; this.deco('barriere', x1 + (x2 - x1) * t, y, z1 + (z2 - z1) * t, { rot: yaw, scale: [len / n / 2, 1, 1] }); }
    this.col({ k: 'b', x: (x1 + x2) / 2, y: y + 1.0, z: (z1 + z2) / 2, hx: len / 2, hz: 0.07, yaw, h: 1.0 }); }
  /** le soleil est-il caché par une plateforme ? (pour les reflets dans l'objectif) */
  blocked(o, d) { for (let k = 1; k <= 14; k++) { const t = k * k * 0.35, x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t; for (const c of this.cols) { if (!c.on || y > c.y || y < c.y - c.h) continue; const dx = x - c.x, dz = z - c.z; if (c.k === 'c' ? dx * dx + dz * dz < c.r * c.r : (Math.abs(Math.cos(c.yaw) * dx - Math.sin(c.yaw) * dz) < c.hx && Math.abs(Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dz) < c.hz)) return true; } } return false; }
  killTile(i) { const T = this.tiles[i]; if (T && !T.dying) { T.dying = true; T.t = 0; } }
  update(t, dt, ctl) {
    for (const m of this.movers) { const c = m.c, p = m.f(t), ox = c.x, oy = c.y, oz = c.z, oyaw = c.yaw || 0; c.x = p[0]; c.y = p[1]; c.z = p[2]; if (p[3] != null) c.yaw = p[3]; c.dx = c.x - ox; c.dy = c.y - oy; c.dz = c.z - oz; c.dyaw = p[3] != null ? c.yaw - oyaw : 0; if (c.vis) { c.vis.position.set(c.x, c.y, c.z); if (p[3] != null) c.vis.rotation.y = c.yaw; } }
    for (const b of this.bars) { const a = b.ang(t); b.w = dt > 0 ? (a - b.a) / dt : 0; b.a = a; b.node.rotation.y = a; }
    for (const T of this.tiles) if (T.dying && T.c.on) { T.t += dt; const k = T.t / 0.6; T.vis.position.y = T.c.y - k * k * 0.5; T.vis.scale.setScalar(Math.max(0.01, 1 - k * k * 0.9)); T.vis.rotation.y = Math.sin(T.t * 40) * 0.06; if (k >= 1) { T.c.on = false; T.vis.visible = false; } }
    for (const s of this.shrinks) { s.c.r = s.f(t); s.c.vis.scale.set(s.c.r, s.ys, s.c.r); }
    for (const f of this.anims) f(t, dt);
    for (const f of this.ticks) f(t, dt, ctl);
    for (const B of this.bumpers) if (B.move) { const p = B.move(t); B.x = p[0]; B.z = p[1]; B.vis.position.x = p[0]; B.vis.position.z = p[1]; }
    for (let i = 0; i < this.orbs.length; i++) { const o = this.orbs[i]; if (o.taken) continue; const on = t >= o.at; o.g.visible = on; if (!on) continue; const k = Math.min(1, (t - o.at) * 3), oy = o.fall ? Math.max(o.y, o.y + o.fall - (t - o.at) * 5) : o.y; o.g.position.y = oy + Math.sin(t * 3 + i) * 0.18; o.g.rotation.y = t * 2 + i; o.g.scale.setScalar(k * (1 + Math.sin(t * 6 + i) * 0.06));
      if (ctl && !o.asked && Math.hypot(ctl.pos.x - o.x, ctl.pos.y + 0.6 - oy, ctl.pos.z - o.z) < 1.25) { o.asked = true; this.onOrb && this.onOrb(i); } }
    for (const B of this.bumpers) { B.k = Math.max(0, B.k - dt * 3); const k = B.k; B.vis.scale.set(B.s * (1 + k * 0.25), B.s * (1 - k * 0.2), B.s * (1 + k * 0.25)); }
    if (!ctl) return;
    this.hit = Math.max(0, this.hit - dt); const p = ctl.pos;
    if (this.hit <= 0 && (t > 1.3 || this.name === 'lobby')) for (const b of this.bars) {
      if (p.y > b.y + b.rad || p.y + PH < b.y - b.rad) continue;
      const ux = Math.cos(b.a), uz = -Math.sin(b.a), rx = p.x - b.x, rz = p.z - b.z, along = Math.max(-b.half, Math.min(b.half, rx * ux + rz * uz)), qx = rx - ux * along, qz = rz - uz * along, d = Math.hypot(qx, qz);
      if (d > b.rad + PR) continue;
      // vitesse du bout de barre à cet endroit + une poussée vers l'extérieur
      const vx = b.w * rz, vz = -b.w * rx, sp = Math.hypot(vx, vz) || 1, rr = Math.hypot(rx, rz) || 1, pw = (9 + Math.min(sp, 14) * 0.6) * b.power;
      ctl.knock(vx / sp * pw + rx / rr * 3.5 * b.power, 7.5, vz / sp * pw + rz / rr * 3.5 * b.power, 0.75); this.hit = 0.35; break;
    }
    for (const B of this.bumpers) { const dx = p.x - B.x, dy = p.y + 0.5 - B.y, dz = p.z - B.z, d = Math.hypot(dx, dy, dz); if (d < B.r + 0.48 && this.hit <= 0) { const h = Math.hypot(dx, dz) || 1; ctl.knock(dx / h * 12.5, 6.5, dz / h * 12.5, 0.3); B.k = 1; this.hit = 0.15; ctl.events.push('bump'); } }
  }
}

// ------------------------------------------------------------------ décor de fond commun
function backdrop(L, seed, o = {}) {
  const R = rng(seed), cx = o.cx || 0, cz = o.cz || 0, base = o.r || 70, y0 = o.y || 0;
  // îlots flottants avec arbres, éoliennes, tours de verre
  const n = o.n || 16;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + R() * 0.3, d = base + R() * 150, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = y0 - 14 + R() * 30, s = 1 + R() * 2.2;
    L.deco('ilot', x, y, z, { scale: s, rot: R() * TAU });
    const kind = R();
    if (kind < 0.2) { L.deco('dome', x, y + 0.3 * s, z, { scale: 0.42 * s, rot: R() * TAU }); }
    else if (kind < 0.42) { L.deco(['tour_a', 'tour_b', 'tour_c'][i % 3], x, y + 0.3 * s, z, { scale: 0.5 * s + 0.25, rot: R() * TAU }); }
    else if (kind < 0.64) { L.deco('eolienne', x, y + 1.1 * s, z, { scale: 0.75 * s + 0.4, rot: Math.atan2(cx - x, cz - z) + Math.PI, spin: 1 + R() * 1.6 }); L.deco('buisson', x + 2.5 * s, y + 0.8 * s, z + 1 * s, { scale: s }); }
    else { for (let k = 0; k < 3; k++) { const b = R() * TAU, rr = (0.6 + R() * 2.6) * s; L.deco(k % 2 ? 'arbre' : 'arbre2', x + Math.cos(b) * rr, y + (1.25 - rr / s * 0.3) * s, z + Math.sin(b) * rr, { scale: (0.8 + R() * 0.5) * s, rot: R() * TAU }); } }
  }
  // arc-en-ciel au loin, grand globe dans le ciel, montgolfières qui dérivent
  const ra = R() * TAU; L.deco('arc_en_ciel', cx + Math.cos(ra) * 330, y0 - 34, cz + Math.sin(ra) * 330, { scale: 7.5, rot: Math.atan2(-Math.cos(ra), -Math.sin(ra)) });
  const ga = ra + 2.1 + R(); const gl = L.deco('globe', cx + Math.cos(ga) * 520, y0 + 230, cz + Math.sin(ga) * 520, { scale: 9, spin: 0.02 }); gl.rotation.z = 0.3; L.anims.push((t, dt) => { gl.rotation.y += dt * 0.012; });
  const bt = ['#ff3b5c', '#ffd21f', '#19c7ff', '#a04dff', '#3fe26a', '#ff8a1f'];
  for (let i = 0; i < (o.balloons || 5); i++) { const a = R() * TAU, d = 38 + R() * 110, bx = cx + Math.cos(a) * d, bz = cz + Math.sin(a) * d, by = y0 + 6 + R() * 34, sc = 0.9 + R() * 0.9, ph = R() * 9, b = L.deco('montgolfiere', bx, by, bz, { scale: sc, tint: bt[i % bt.length], only: ['orbe', 'bande'], rot: R() * TAU }), dr = 0.3 + R() * 0.5;
    L.anims.push(t => { b.position.set(bx + Math.sin(t * 0.05 * dr + ph) * 14, by + Math.sin(t * 0.4 + ph) * 1.2, bz + Math.cos(t * 0.04 * dr + ph) * 14); b.rotation.z = Math.sin(t * 0.5 + ph) * 0.03; }); }
  // nuages
  for (let i = 0; i < 22; i++) { const a = R() * TAU, d = 50 + R() * 320, c = L.deco('nuage', cx + Math.cos(a) * d, y0 + 18 + R() * 80, cz + Math.sin(a) * d, { scale: [3 + R() * 6, 2.4 + R() * 3, 3 + R() * 5], rot: R() * TAU }); const sp = 0.4 + R() * 0.8; L.anims.push((t, dt) => { c.position.x += sp * dt; if (c.position.x > cx + 420) c.position.x -= 840; }); }
  // poissons tropicaux qui nagent dans le ciel
  const tints = ['#ff7a12', '#ffd21f', '#19c7ff', '#ff5ac8', '#3fe26a', '#a04dff'];
  for (let i = 0; i < (o.fish || 14); i++) {
    const rad = (o.fr || 26) + R() * 34, sp = (0.12 + R() * 0.22) * (R() < 0.5 ? -1 : 1), ph = R() * TAU, y = y0 + 3 + R() * 16, s = 1.2 + R() * 2.4, f = L.deco('poisson', 0, 0, 0, { scale: s, tint: tints[i % tints.length], only: ['poisson_a'] }), q = f.getObjectByName('queue'), ox = cx + (R() - 0.5) * 30, oz = cz + (R() - 0.5) * 30;
    L.anims.push(t => { const a = ph + t * sp; f.position.set(ox + Math.cos(a) * rad, y + Math.sin(t * 0.7 + ph) * 1.5, oz + Math.sin(a) * rad); f.rotation.y = -a - Math.sign(sp) * Math.PI / 2 + Math.sin(t * 5 + ph) * 0.12; f.rotation.z = Math.sin(t * 0.7 + ph + 1.5) * 0.15; q.rotation.y = Math.sin(t * 9 + ph) * 0.55; });
  }
}

// ------------------------------------------------------------------ lobby
export function buildLobby() {
  const L = new Level(); L.name = 'lobby'; L.killY = -16;
  L.deco('ile', 0, 0, 0); L.col({ k: 'c', x: 0, y: 0.03, z: 0, r: 23.6, h: 3 });
  L.col({ k: 'c', x: 0, y: 0.2, z: 0, r: 7.5, h: 0.2 });
  L.deco('fontaine', 0, 0.2, 0); L.col({ k: 'c', x: 0, y: 0.82, z: 0, r: 2.75, h: 0.62 }); L.col({ k: 'c', x: 0, y: 2.34, z: 0, r: 1.3, h: 1.6 });
  const R = rng(7);
  // arbres en couronne, lampes le long des allées, arches au bout
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    // Blender (x, y) → jeu (x, -z)
    const ax = c * 20.4, az = -s * 20.4;
    // quatre portiques : on marche dessus pour jouer ou se changer, les deux autres affichent le code et les scores
    const what = ['play', 'skin', 'code', 'scores'][i], face = Math.atan2(-ax, -az), tint = ['#8cf03c', '#ff5ac8', '#19c7ff', '#ffd21f'][i];
    const gate = L.gate(['JOUER', 'VESTIAIRE', 'SOLO', 'SCORES'][i], ax, 0.16, az, { rot: face, scale: 0.6, tint, only: ['orbe', 'bande'], c1: ['#8cf03c', '#ff7ad6', '#19b6ff', '#ffd21f'][i], c2: ['#2f9f08', '#c81f9a', '#0a63d8', '#ff8a1f'][i] });
    if (what === 'play' || what === 'skin') { const pad = L.deco('plot', ax, 0.18, az, { scale: 1.15 }); L.zones.push({ id: what, x: ax, y: 0.3, z: az, r: 1.9, tint }); L.anims.push(t => { const k = 1.15 + Math.sin(t * 3 + i) * 0.04; pad.scale.set(k, 1, k); if (Math.random() < 0.035) FX.spark({ x: ax + (Math.random() - 0.5) * 3, y: 0.3, z: az + (Math.random() - 0.5) * 3 }, tint, 1, 0.25); }); }
    if (what === 'code') L.setCode = txt => { const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(txt, '#19b6ff', '#0a63d8') }); gate.traverse(m => { if (m.isMesh && /^texte/.test(m.name)) m.material = mat; }); };
    if (what === 'scores') { const bd = boardTexture(), pl = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.58), new THREE.MeshBasicMaterial({ map: bd.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })); pl.position.set(0, 2.2, 0); pl.userData.noAO = true; gate.add(pl); L.board = bd.draw; }
    for (const k of [-1, 1]) for (const d of [11.5]) { const lx = c * d + k * 2.9 * s, lz = -s * d + k * 2.9 * c; L.deco('lampe', lx, 0.03, lz, { rot: Math.atan2(k * c, -k * s), scale: 0.72 }); L.col({ k: 'c', x: lx, y: 2.4, z: lz, r: 0.12, h: 2.4 }); }
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, n = 3;
    for (let k = 0; k < n; k++) { const b = a + (k - 1) * 0.36, d = 15.5 + (k % 2) * 4.2 + R() * 1.2, x = Math.cos(b) * d, z = Math.sin(b) * d, sc = 0.95 + R() * 0.4; L.deco(k % 2 ? 'arbre2' : 'arbre', x, 0.03, z, { rot: R() * TAU, scale: sc }); L.col({ k: 'c', x, y: 3, z, r: 0.34 * sc, h: 3 }); }
    for (let k = 0; k < 4; k++) { const b = a + (R() - 0.5) * 1.0, d = 9.5 + R() * 11; L.deco('buisson', Math.cos(b) * d, 0.03, Math.sin(b) * d, { rot: R() * TAU, scale: 0.7 + R() * 0.6 }); }
  }
  const petals = ['#ff5aa8', '#ffd21f', '#ffffff', '#a04dff', '#ff8a1f', '#19c7ff'];
  for (let i = 0; i < 110; i++) { const a = R() * TAU, d = 8.3 + R() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d; const aa = ((Math.atan2(-z, x) - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2); if (Math.min(aa, Math.PI / 2 - aa) * d < 1.9) continue; L.deco('fleur', x, 0.03, z, { rot: R() * TAU, scale: 0.9 + R() * 0.9, tint: petals[i % petals.length], only: ['petale'] }); }
  // de quoi s'amuser en attendant : trampolines, bumpers, tourniquet
  { const tx = -19.2, gate = L.gate('TOURNOI', tx, 0.03, 0, { rot: Math.PI / 2, scale: 0.6, tint: '#a04dff', only: ['orbe', 'bande'], c1: '#c58bff', c2: '#6a12e0' }), pad = L.deco('plot', tx, 0.05, 0, { scale: 1.15 }); L.zones.push({ id: 'tour', x: tx, y: 0.3, z: 0, r: 1.9, tint: '#c58bff' }); L.anims.push(t => { const k = 1.15 + Math.sin(t * 3 + 2) * 0.04; pad.scale.set(k, 1, k); if (Math.random() < 0.035) FX.spark({ x: tx + (Math.random() - 0.5) * 3, y: 0.3, z: (Math.random() - 0.5) * 3 }, '#c58bff', 1, 0.25); }); }
  L.tramp(-12.5, 0.45, 0, 1.7, '#19c7ff', 18); L.tramp(12.5, 0.45, 0, 1.7, '#ff5ac8', 22);
  L.bumper(0, 0.03, 13, 1.1, '#ffd21f'); L.bumper(2.6, 0.03, 15, 0.9, '#3fe26a'); L.bumper(-2.6, 0.03, 15, 0.9, '#ff8a1f');
  L.bar(0, 0.03, -13.5, 4.2, t => t * 1.5, { tint: '#a04dff' });
  // plateformes pour grimper
  L.cyl(15.5, 3.4, -6.5, 1.8, { tint: '#3fe26a' }); L.cyl(18.5, 6.2, -2.5, 1.6, { tint: '#ffd21f' }); L.cyl(17, 9, 2.5, 1.9, { tint: '#ff8a1f', move: t => [17 + Math.sin(t * 0.8) * 2.5, 9, 2.5] });
  const GR = rng(3), onPath = (x, z) => { const d = Math.hypot(x, z); if (d < 7.9 || d > 22.7) return true; const ax = Math.abs(x), az = Math.abs(z); if (Math.hypot(ax - 14.42, az - 14.42) < 3.0) return true; return Math.abs(ax - az) < 2.0 && d < 21.5; };
  makeGrass(L.root, 85000, R2 => { const a = R2() * TAU, d = Math.sqrt(R2()) * 22.8, x = Math.cos(a) * d, z = Math.sin(a) * d; return onPath(x, z) ? null : [x, 0.03, z]; }, GR, 0.68);
  backdrop(L, 11, { r: 75, n: 22, fish: 18, fr: 30, balloons: 7 });
  L.anims.push(() => { if (Math.random() < 0.5) { const a = Math.random() * TAU; FX.drop(Math.cos(a) * 1.25, 2.5, Math.sin(a) * 1.25, a); } if (Math.random() < 0.12) { const a = Math.random() * TAU, d = 8 + Math.random() * 14; FX.mote(Math.cos(a) * d, 0.3, Math.sin(a) * d); } });
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; L.spawns.push([Math.cos(a) * 5.2, 0.3, Math.sin(a) * 5.2 + 0, a]); }
  L.spawns = L.spawns.map(([x, y, z]) => [x * 1.25, y, z * 1.25, Math.atan2(-x, -z)]);
  return L;
}

// ------------------------------------------------------------------ mini-jeux
function course(L, seed, n) {
  const C = i => RAINBOW[i % RAINBOW.length]; L.killY = -14;
  L.box(0, 0, 0, 16, 10, { tint: C(0) });
  for (let i = 0; i < 16; i++) L.spawns.push([-5.6 + (i % 8) * 1.6, 0.1, -3 + Math.floor(i / 8) * 1.8, 0]);
  L.gate('DÉPART', 0, 0, 4.2, { scale: 1.22, tint: C(4), only: ['orbe', 'bande'] });
  L.rail(-8, -5, 8, -5, 0); L.rail(-8, -5, -8, 2, 0); L.rail(8, -5, 8, 2, 0);
  for (const x of [-4, 0, 4]) L.deco('fleche', x, 0.03, 1.2, { rot: Math.PI, scale: [1, 0.12, 1] });
  for (const x of [-4.2, 4.2]) [9.5, 16.5, 23.5].forEach((z, k) => L.cyl(x + (k % 2 ? 1.2 : -1.2) * Math.sign(x), 0, z, 2.6, { tint: C(1 + k) }));
  L.cyl(0, 0, 16.5, 1.7, { tint: C(3) });
  L.box(0, 0, 31.5, 14, 8, { tint: C(2) }); L.bar(0, 0, 31.5, 6.2, t => t * 1.9, { tint: C(0) }); L.checks.push([0, 0.1, 28.5, 27.5]); for (const x of [-6.4, 6.4]) L.deco('drapeau', x, 0, 28, { tint: C(0), only: ['tissu'], rot: x > 0 ? Math.PI : 0 });
  [40, 46, 52].forEach((z, k) => L.box(0, 0, z, 4.6, 4.5, { tint: C(3 + k), move: t => [Math.sin(t * 1.1 + k * 2.1) * 4.5, 0, z] }));
  L.box(0, 0, 59, 12, 6, { tint: C(4) }); L.checks.push([0, 0.1, 59, 56]); for (const x of [-5.5, 5.5]) L.deco('drapeau', x, 0, 56.6, { tint: C(3), only: ['tissu'], rot: x > 0 ? Math.PI : 0 });
  L.box(0, 0, 70.5, 14, 14, { tint: C(5) });
  [[-4, 66], [3.5, 66.5], [0, 70.5], [-4.6, 74], [4.4, 74.5], [-0.5, 76], [1.5, 64.5]].forEach(([x, z], k) => L.bumper(x, 0, z, k === 2 ? 1.3 : 1, C(k)));
  L.tramp(-3, 0, 80.6, 1.7, C(6)); L.tramp(3, 0, 80.6, 1.7, C(7));
  L.box(0, 5, 88.5, 12, 8, { tint: C(6) }); L.checks.push([0, 5.1, 88.5, 84.5]); for (const x of [-5.5, 5.5]) L.deco('drapeau', x, 5, 85.2, { tint: C(5), only: ['tissu'], rot: x > 0 ? Math.PI : 0 }); L.rail(-6, 84.5, -6, 92.5, 5); L.rail(6, 84.5, 6, 92.5, 5);
  L.cyl(0, 5, 99.5, 5.5, { tint: C(7) }); L.bar(0, 5, 99.5, 5.2, t => t * 2.1, { tint: C(1) });
  L.cyl(0, 5, 112, 5.5, { tint: C(0) }); L.bar(0, 5, 112, 5.2, t => -t * 2.5, { tint: C(3) });
  L.cyl(0, 4, 121.5, 2.5, { tint: C(1), move: t => [Math.sin(t * 0.9) * 3, 4, 121.5] }); L.cyl(0, 3, 127.5, 2.5, { tint: C(2), move: t => [-Math.sin(t * 0.9) * 3, 3, 127.5] }); L.cyl(0, 2, 133.5, 2.5, { tint: C(3) });
  L.checks.push([0, 5.1, 112, 109]);
  L.box(0, 2, 142.5, 16, 12, { tint: C(4) }); L.gate('ARRIVÉE', 0, 2, 139.2, { scale: 1.22, tint: '#ffd21f', only: ['orbe', 'bande'], c1: '#ffd21f', c2: '#ff8a1f' }); L.rail(-8, 148.5, 8, 148.5, 2); L.rail(-8, 141, -8, 148.5, 2); L.rail(8, 141, 8, 148.5, 2); L.deco('podium', 0, 2, 145.5, { rot: Math.PI });
  L.finishZ = 140; L.finishY = 1.5; L.length = 140;
  backdrop(L, seed, { cz: 70, r: 85, n: 22, fish: 16, fr: 20 });
  // jalons décoratifs le long du parcours
  for (let z = 10; z < 135; z += 22) for (const s of [-1, 1]) { L.deco('ilot', s * 20, -6, z + s * 4, { scale: 0.8 }); L.deco(z % 44 < 22 ? 'arbre' : 'arbre2', s * 20, -4.9, z + s * 4, { rot: z }); L.deco('lampe', s * 17.8, -5.6, z + s * 4, { rot: s > 0 ? Math.PI : 0 }); }
}
function dalles(L, seed, n, hooks) {
  const tints = ['#19c7ff', '#3fe26a', '#ff5ac8'], Rr = 1.53, N = 4; L.killY = -24;
  for (let l = 0; l < 3; l++) for (let q = -N; q <= N; q++) for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++)
    L.tile(1.5 * Rr * q, -l * 7, Math.sqrt(3) * Rr * (r + q / 2), tints[l], i => hooks.tile(i));
  for (let i = 0; i < 16; i++) { const a = i / Math.max(n, 6) * TAU, d = i < 8 ? 7.2 : 4; L.spawns.push([Math.cos(a) * d, 0.2, Math.sin(a) * d, Math.atan2(-Math.cos(a), -Math.sin(a))]); }
  // anneau de verre et lampes tout autour
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.52; L.deco('ilot', Math.cos(a) * 24, -3, Math.sin(a) * 24, { scale: 0.9 }); L.deco(i % 2 ? 'arbre' : 'arbre2', Math.cos(a) * 24, -1.7, Math.sin(a) * 24, { rot: a }); }
  backdrop(L, seed, { y: -8, r: 70, n: 16, fish: 20, fr: 16 });
}
function tourniquet(L, seed, n) {
  L.killY = -12; L.cyl(0, 0, 0, 9.5, { tint: '#19c7ff', thick: 3 });
  const sp = (w0, w1) => t => { const k = (w1 - w0) / 75, tt = Math.min(t, 75); return w0 * t + 0.5 * k * tt * tt + (t > 75 ? (w1 - w0) * (t - 75) : 0); };
  const a = sp(1.15, 3.4), b = sp(0.8, 2.6);
  L.bar(0, 0, 0, 9.2, t => a(t), { tint: '#ff5ac8', power: 1.25 });
  const b2 = L.bar(0, 0, 0, 9.2, t => -b(t) + 1.2, { tint: '#ffd21f', power: 1.25, s: 1 }); b2.node.parent.scale.set(0.82, 1.12, 0.82); b2.node.scale.set(9.2 / 0.82, 1 / 1.12, 1 / 0.82);
  for (let i = 0; i < 16; i++) { const an = i / Math.max(n, 5) * TAU + 0.6; L.spawns.push([Math.cos(an) * 6.5, 0.2, Math.sin(an) * 6.5, Math.atan2(-Math.cos(an), -Math.sin(an))]); }
  for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; L.deco('lampe', Math.cos(an) * 9.1, 0, Math.sin(an) * 9.1, { rot: -an + Math.PI, scale: 0.8 }); }
  backdrop(L, seed, { y: -6, r: 60, n: 16, fish: 22, fr: 15 });
}
function flipper(L, seed, n) {
  L.killY = -12; L.cyl(0, 0, 0, 11, { tint: '#ff5ac8', thick: 3 });
  const R = rng(seed), sp = t => t * (1 + Math.min(t, 80) * 0.012);
  L.bumper(0, 0, 0, 1.7, '#ffd21f');
  for (let i = 0; i < 7; i++) { const rad = 3.6 + (i % 4) * 1.9, w = (0.5 + R() * 0.5) * (i % 2 ? -1 : 1), ph = R() * TAU, wob = 0.8 + R() * 1.2; L.bumper(rad, 0, 0, 0.95 + (i % 3) * 0.15, RAINBOW[i], t => { const a = ph + sp(t) * w, r = rad + Math.sin(sp(t) * wob + ph) * 1.4; return [Math.cos(a) * r, Math.sin(a) * r]; }); }
  for (let i = 0; i < 16; i++) { const an = i / Math.max(n, 5) * TAU + 0.4; L.spawns.push([Math.cos(an) * 9.4, 0.2, Math.sin(an) * 9.4, Math.atan2(-Math.cos(an), -Math.sin(an))]); }
  for (let i = 0; i < 10; i++) { const an = i / 10 * TAU; L.deco('lampe', Math.cos(an) * 10.6, 0, Math.sin(an) * 10.6, { rot: -an + Math.PI, scale: 0.7 }); }
  backdrop(L, seed, { y: -6, r: 60, n: 16, fish: 22, fr: 16 });
}
function bulles(L, seed, n) {
  L.killY = -12; const R = rng(seed); L.cyl(0, 0, 0, 13, { tint: '#ffd21f', thick: 3 });
  const tops = [[0, 0, 0]];
  [[7, 2.2, 0], [-7, 2.2, 0], [0, 3.4, 7.5], [0, 3.4, -7.5], [0, 5.6, 0]].forEach(([x, y, z], i) => { L.cyl(x, y, z, i === 4 ? 2.6 : 2.2, { tint: RAINBOW[i + 2] }); tops.push([x, y, z]); });
  L.tramp(4.2, 0, 4.2, 1.4, '#19c7ff', 17); L.tramp(-4.2, 0, -4.2, 1.4, '#ff5ac8', 17); L.tramp(-4.2, 0, 4.2, 1.4, '#3fe26a', 21); L.tramp(4.2, 0, -4.2, 1.4, '#a04dff', 21);
  L.bar(0, 0, 0, 11.5, t => t * 0.9, { tint: '#ff8a1f', power: 0.8 });
  for (let i = 0; i < 70; i++) { const k = R(); let x, y, z; if (k < 0.62) { const a = R() * TAU, d = 2 + Math.sqrt(R()) * 10; x = Math.cos(a) * d; z = Math.sin(a) * d; y = 0.9 + (R() < 0.25 ? 1.6 : 0); } else if (k < 0.85) { const p = tops[1 + Math.floor(R() * 5)]; x = p[0] + (R() - 0.5) * 2; z = p[2] + (R() - 0.5) * 2; y = p[1] + 0.9; } else { const s = [[4.2, 4.2], [-4.2, -4.2], [-4.2, 4.2], [4.2, -4.2]][Math.floor(R() * 4)]; x = s[0]; z = s[1]; y = 3.2 + R() * 3; }
    L.orb(x, y, z, i < 6 ? 0 : (i - 5) * 0.62); }
  for (let i = 0; i < 16; i++) { const an = i / Math.max(n, 5) * TAU + 0.3; L.spawns.push([Math.cos(an) * 10.5, 0.2, Math.sin(an) * 10.5, Math.atan2(-Math.cos(an), -Math.sin(an))]); }
  backdrop(L, seed, { y: -6, r: 62, n: 16, fish: 20, fr: 18 });
}
function tour(L, seed, n) {
  L.killY = -14; L.fall = 9; L.cyl(0, 0, 0, 12, { tint: '#19c7ff', thick: 3 }); L.deco('tour_a', 0, 0, 0, { scale: 1.42 }); L.col({ k: 'c', x: 0, y: 60, z: 0, r: 4.7, h: 60 });
  const N = 34, P = i => { const a = i * 0.62; return [Math.cos(a) * 8.2, (i + 1) * 1.3, Math.sin(a) * 8.2]; };
  for (let i = 0; i < N; i++) { const [x, y, z] = P(i), big = i % 8 === 7, tint = RAINBOW[i % 8];
    if (big) { L.cyl(x, y, z, 2.9, { tint }); L.checks.push([x, y + 0.1, z, -999]); L.deco('drapeau', x * 1.26, y, z * 1.26, { tint, only: ['tissu'], rot: -i * 0.62 }); }
    else if (i % 8 === 3) { const a = i * 0.62; L.cyl(x, y, z, 2.0, { tint, move: t => { const r = 8.2 + Math.sin(t * 1.3 + i) * 1.5; return [Math.cos(a) * r, y, Math.sin(a) * r]; } }); }
    else if (i % 8 === 5) { const a = i * 0.62; L.cyl(x, y, z, 2.0, { tint, move: t => [x, y + Math.sin(t * 1.5 + i) * 0.7, z] }); }
    else L.cyl(x, y, z, 2.0, { tint }); }
  const top = P(N - 1)[1]; L.box(0, top + 0.9, 16, 12, 10, { tint: '#ffd21f' }); L.gate('ARRIVÉE', 0, top + 0.9, 13.4, { scale: 0.9, tint: '#ffd21f', only: ['orbe', 'bande'], c1: '#ffd21f', c2: '#ff8a1f' }); L.deco('podium', 0, top + 0.9, 18.5, { rot: Math.PI });
  L.rail(-6, 21, 6, 21, top + 0.9); L.rail(-6, 14, -6, 21, top + 0.9); L.rail(6, 14, 6, 21, top + 0.9);
  L.finishZ = 12.2; L.finishY = top + 0.4;
  for (let i = 0; i < 16; i++) { const an = -0.9 - i * 0.16; L.spawns.push([Math.cos(an) * 10, 0.2, Math.sin(an) * 10, an > -99 ? Math.atan2(Math.cos(0) * 8.2 - Math.cos(an) * 10, -Math.sin(an) * 10) : 0]); }
  backdrop(L, seed, { y: 16, r: 70, n: 20, fish: 22, fr: 16, balloons: 8 });
}
function colline(L, seed, n) {
  L.killY = -12; L.cyl(0, 0, 0, 11.5, { tint: '#3fe26a', thick: 3 });
  const ph = rng(seed)() * 9, at = t => [6.6 * Math.sin(t * 0.31 + ph), 6.6 * Math.sin(t * 0.23 + 1.3 + ph * 0.7), 2.7];
  const pad = L.deco('plot', 0, 0.02, 0, { scale: 1.55 }), ring = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.9, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.25), transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); ring.userData.noAO = true; L.root.add(ring);
  L.zoneAt = at; L.ticks.push(t => { const z = at(t); pad.position.set(z[0], 0.02, z[1]); ring.position.set(z[0], 0.47, z[1]); ring.material.opacity = 0.3 + Math.sin(t * 5) * 0.1; pad.rotation.y = t; });
  L.bar(0, 0, 0, 10.8, t => t * 1.05, { tint: '#ff5ac8', power: 0.9 });
  for (let i = 0; i < 16; i++) { const an = i / Math.max(n, 5) * TAU + 0.5; L.spawns.push([Math.cos(an) * 9.6, 0.2, Math.sin(an) * 9.6, Math.atan2(-Math.cos(an), -Math.sin(an))]); }
  backdrop(L, seed, { y: -6, r: 62, n: 16, fish: 20, fr: 17 });
}
function maree(L, seed, n) {
  const R = rng(seed); L.killY = -8; L.cyl(0, 0, 0, 10, { tint: '#19c7ff', thick: 3 });
  let a = R() * TAU, y = 0;
  for (let i = 0; i < 34; i++) { a += 0.75 + R() * 0.5; y += 0.95 + R() * 0.35; const d = 3.5 + R() * 5.5, x = Math.cos(a) * d, z = Math.sin(a) * d, tint = RAINBOW[i % 8];
    if (i % 9 === 4) L.tramp(x, y - 0.4, z, 1.5, tint, 15); else if (i % 7 === 3) L.cyl(x, y, z, 1.9, { tint, move: t => [x + Math.sin(t * 1.2 + i) * 1.6, y, z] }); else L.cyl(x, y, z, 1.7 + R() * 0.7, { tint }); }
  L.cyl(0, y + 1.1, 0, 3.2, { tint: '#ffd21f' }); L.deco('couronne', 0, y + 2.0, 0, { scale: 3, spin: 1 });
  const sea = new THREE.Mesh(new THREE.CircleGeometry(90, 48).rotateX(-Math.PI / 2), W.mats.eau); sea.userData.noAO = true; sea.renderOrder = 2; L.root.add(sea);
  const top = y + 3; L.ticks.push(t => { const wy = Math.min(top + 2, -6 + 0.36 * t + 0.0026 * t * t) + Math.sin(t * 1.4) * 0.12; sea.position.y = wy; L.killY = wy - 0.35; });
  for (let i = 0; i < 16; i++) { const an = i / Math.max(n, 5) * TAU + 0.2; L.spawns.push([Math.cos(an) * 8, 0.2, Math.sin(an) * 8, Math.atan2(-Math.cos(an), -Math.sin(an))]); }
  backdrop(L, seed, { y: 12, r: 66, n: 18, fish: 22, fr: 16, balloons: 7 });
}
function avalanche(L, seed, n) {
  L.killY = -12; const R = rng(seed); L.box(0, 0, 0, 24, 17, { tint: '#ff8a1f', thick: 3 });
  const sp = t => t * (1 + Math.min(t, 90) * 0.011);
  for (let i = 0; i < 9; i++) { const lane = -7 + i * 1.75, dir = i % 2 ? 1 : -1, v = 4.2 + R() * 3.2, ph = R() * 34, s = 1.05 + (i % 3) * 0.22;
    L.bumper(0, 0, lane, s, RAINBOW[i % 8], t => [dir * (-17 + ((sp(t) * v + ph) % 34)), lane]); }
  L.rail(-12, -8.5, 12, -8.5, 0); L.rail(-12, 8.5, 12, 8.5, 0);
  for (let i = 0; i < 16; i++) L.spawns.push([-9 + (i % 8) * 2.6, 0.2, i < 8 ? -0.9 : 0.9, 0]);
  backdrop(L, seed, { y: -6, r: 62, n: 16, fish: 20, fr: 18 });
}
const COULEURS = [['ROUGE', '#ff3b5c'], ['JAUNE', '#ffd21f'], ['VERT', '#3fe26a'], ['BLEU', '#19a4ff']];
function couleurs(L, seed, n, hooks) {
  L.killY = -10; const R = rng(seed), G = 6, S = 3.5, tiles = [], bag = [];
  for (let i = 0; i < G * G; i++) bag.push(i % 4); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  for (let i = 0; i < G * G; i++) { const x = (i % G - (G - 1) / 2) * S, z = (Math.floor(i / G) - (G - 1) / 2) * S, c = L.box(x, 0, z, S - 0.12, S - 0.12, { tint: COULEURS[bag[i]][1], thick: 1.2 }); c.vis.traverse(m => { if (m.isMesh && m.material.name === 'verre') m.material = glassOf(COULEURS[bag[i]][1]); }); tiles.push({ c, col: bag[i], k: 0 }); }
  // chaque tour : on annonce une couleur, puis toutes les autres dalles tombent
  let seen = -1;
  L.ticks.push((t, dt) => { const D = 5.6, nC = Math.floor(t / D), ph = t - nC * D, warn = Math.max(1.5, 3.3 - nC * 0.16), target = Math.floor(rng(seed + nC * 7919)() * 4), drop = t > 0.01 && ph > warn && ph < D - 0.7;
    if (nC !== seen && t > 0.01) { seen = nC; hooks.say && hooks.say(COULEURS[target][0] + ' !', COULEURS[target][1], warn); }
    for (const T of tiles) { const down = drop && T.col !== target; T.k += ((down ? 1 : 0) - T.k) * Math.min(1, dt * (down ? 9 : 5)); T.c.on = T.k < 0.35; T.c.vis.position.y = -T.k * T.k * 9; T.c.vis.visible = T.k < 0.97; if (!down && !drop && ph < warn && T.col !== target && ph > warn - 0.9) T.c.vis.position.y = Math.sin(t * 50) * 0.04; } });
  for (let i = 0; i < 16; i++) L.spawns.push([(i % 4 - 1.5) * S * 1.02, 0.2, (Math.floor(i / 4) % 4 - 1.5) * S, 0]);
  backdrop(L, seed, { y: -6, r: 62, n: 16, fish: 20, fr: 18 });
}
const glassCache = {}; function glassOf(col) { if (!glassCache[col]) { const m = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.12, clearcoat: 1, envMapIntensity: 0.9, emissive: col, emissiveIntensity: 0.25 }); m.name = 'verre'; glassCache[col] = m; } return glassCache[col]; }
export const GAMES = {
  course: { nom: 'Course Arc-en-ciel', aide: 'Arrive au bout du parcours avant les autres.', type: 'course', duree: 150, build: course },
  dalles: { nom: 'Dalles de Verre', aide: 'Les dalles disparaissent sous tes pieds. Reste en haut le plus longtemps.', type: 'survie', duree: 150, build: dalles },
  tourniquet: { nom: 'Tourniquet', aide: 'Saute par-dessus les barres. Le dernier debout gagne.', type: 'survie', duree: 150, build: tourniquet },
  flipper: { nom: 'Flipper Géant', aide: 'Les bumpers tournent de plus en plus vite. Ne te fais pas éjecter.', type: 'survie', duree: 120, build: flipper },
  bulles: { nom: 'Chasse aux Bulles', aide: 'Ramasse le plus de bulles dorées en 45 secondes.', type: 'points', duree: 45, build: bulles },
  tour: { nom: 'Tour des Nuages', aide: 'Grimpe tout en haut de la tour avant les autres.', type: 'course', duree: 180, build: tour },
  colline: { nom: 'Roi de la Colline', aide: 'Reste dans le cercle doré pour marquer. Pousse les autres dehors avec E.', type: 'points', duree: 60, build: colline },
  maree: { nom: 'Marée Montante', aide: 'L\'eau monte. Grimpe de plateforme en plateforme, le dernier au sec gagne.', type: 'survie', duree: 150, build: maree },
  avalanche: { nom: 'Avalanche de Billes', aide: 'Des billes géantes traversent le plateau. Esquive-les le plus longtemps possible.', type: 'survie', duree: 120, build: avalanche },
  couleurs: { nom: 'Couleur Magique', aide: 'Cours sur la couleur annoncée : toutes les autres dalles tombent.', type: 'survie', duree: 150, build: couleurs },
};
Object.assign(GAMES, more({ THREE, W, rng, RAINBOW, TAU, backdrop, glassOf, FX, spawn }));
export function buildGame(id, seed, n, hooks) { const L = new Level(); L.name = id; GAMES[id].build(L, seed, n, hooks); return L; }
