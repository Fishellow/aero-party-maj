// Les niveaux : le lobby et les mini-jeux. Chaque niveau pose des pièces du kit Blender et leurs collisions.
import * as THREE from 'three';
import { W, spawn, clearSpins } from './world.js';
import { PR, PH } from './player.js';
import { makeGrass, bannerTexture, boardTexture, FX } from './fx.js';

export const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const RAINBOW = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#3fe26a', '#19c7ff', '#3d6bff', '#a04dff', '#ff5ac8'];
const TAU = Math.PI * 2;

export class Level {
  constructor() { this.root = new THREE.Group(); W.scene.add(this.root); this.cols = []; this.movers = []; this.bars = []; this.bumpers = []; this.spawns = []; this.checks = []; this.anims = []; this.killY = -20; this.tiles = []; this.hit = 0; this.zones = []; clearSpins(); }
  dispose() { W.scene.remove(this.root); clearSpins(); }
  col(c) { c.on = true; c.dx = c.dy = c.dz = 0; this.cols.push(c); return c; }
  /** plateforme ronde : dessus à la hauteur y */
  cyl(x, y, z, r, o = {}) {
    const ys = o.thick || Math.min(2.2, Math.max(1, r * 0.4)), c = this.col({ k: 'c', x, y, z, r, h: 0.42 * ys });
    if (o.vis !== false) c.vis = spawn('plateforme', { parent: this.root, pos: [x, y, z], scale: [r, ys, r], tint: o.tint, only: ['bande'] });
    if (o.move) this.movers.push({ c, f: o.move }); return c;
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
  bumper(x, y, z, s = 1, tint) { const vis = spawn('bumper', { parent: this.root, pos: [x, y, z], scale: s, tint, only: ['orbe'] }); this.col({ k: 'c', x, y: y + 0.3 * s, z, r: 0.9 * s, h: 0.3 * s }); this.bumpers.push({ x, y: y + 0.82 * s, z, r: 0.85 * s, vis, k: 0, s }); }
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
    for (const f of this.anims) f(t, dt);
    for (const B of this.bumpers) { B.k = Math.max(0, B.k - dt * 3); const k = B.k; B.vis.scale.set(B.s * (1 + k * 0.25), B.s * (1 - k * 0.2), B.s * (1 + k * 0.25)); }
    if (!ctl) return;
    this.hit = Math.max(0, this.hit - dt); const p = ctl.pos;
    if (this.hit <= 0) for (const b of this.bars) {
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
export const GAMES = {
  course: { nom: 'Course Arc-en-ciel', aide: 'Arrive au bout du parcours avant les autres.', type: 'course', duree: 150, build: course },
  dalles: { nom: 'Dalles de Verre', aide: 'Les dalles disparaissent sous tes pieds. Reste en haut le plus longtemps.', type: 'survie', duree: 150, build: dalles },
  tourniquet: { nom: 'Tourniquet', aide: 'Saute par-dessus les barres. Le dernier debout gagne.', type: 'survie', duree: 150, build: tourniquet },
};
export function buildGame(id, seed, n, hooks) { const L = new Level(); L.name = id; GAMES[id].build(L, seed, n, hooks); return L; }
