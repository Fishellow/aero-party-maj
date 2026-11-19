// Les personnages : le modèle Blender, ses animations, et la physique du joueur.
import * as THREE from 'three';
import { W, jellyMat, spawn } from './world.js';

export const SKINS = [
  { id: 'aero', nom: 'Aero', top: '#0a55ff', bot: '#7df2ff' },
  { id: 'feu', nom: 'Braise', top: '#d80d12', bot: '#ffb347' },
  { id: 'mandarine', nom: 'Mandarine', top: '#ff5a00', bot: '#ffe66b' },
  { id: 'eco', nom: 'Éco', top: '#0b8f2e', bot: '#c8ff5a' },
  { id: 'aqua', nom: 'Aqua', top: '#00a2e8', bot: '#b5fff4' },
  { id: 'glacier', nom: 'Glacier', top: '#6aa8ff', bot: '#ffffff' },
  { id: 'violet', nom: 'Améthyste', top: '#6a12e0', bot: '#f0a8ff' },
  { id: 'flore', nom: 'Flore', top: '#ff2f7e', bot: '#ffd9e6' },
  { id: 'aurore', nom: 'Aurore', top: '#1560ff', mid: '#21d07a', bot: '#fff06a' },
  { id: 'soleil', nom: 'Soleil', top: '#ffb300', bot: '#fffbd0' },
  { id: 'lagon', nom: 'Lagon', top: '#00b8a0', mid: '#19d8d0', bot: '#e8ff9a' },
  { id: 'couchant', nom: 'Couchant', top: '#ff2d95', mid: '#ff7a3d', bot: '#ffe45a' },
  { id: 'nuit', nom: 'Minuit', top: '#14182a', bot: '#8fa3c8' },
  { id: 'perle', nom: 'Perle', top: '#c9d6e6', bot: '#ffffff' },
  { id: 'prune', nom: 'Prune', top: '#5a0f8a', mid: '#e0147a', bot: '#ffc9e0' },
  { id: 'menthe', nom: 'Menthe', top: '#19c7a0', bot: '#f0fff0' },
];
export const skinOf = id => SKINS.find(s => s.id === id) || SKINS[0];
export const F = { GROUND: 1, DIVE: 2, STUN: 4, WIN: 8, WAVE: 16, OUT: 32, DANCE: 64, PUSH: 128 };

const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const SCALE = 0.86;

function tagSprite(name) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.font = '600 58px "Segoe UI", Frutiger, Arial'; const w = Math.min(480, x.measureText(name).width + 70), l = (512 - w) / 2;
  const g = x.createLinearGradient(0, 18, 0, 110); g.addColorStop(0, 'rgba(255,255,255,.92)'); g.addColorStop(.5, 'rgba(210,240,255,.78)'); g.addColorStop(.51, 'rgba(160,220,255,.72)'); g.addColorStop(1, 'rgba(225,248,255,.85)');
  x.beginPath(); x.roundRect(l, 18, w, 92, 46); x.fillStyle = g; x.fill(); x.lineWidth = 4; x.strokeStyle = 'rgba(255,255,255,.95)'; x.stroke();
  x.fillStyle = '#0b3d78'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 256, 66, 440);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false })); s.scale.set(2.2, 0.55, 1); s.renderOrder = 5; return s;
}

export class Buddy {
  constructor(skinId, name) {
    this.g = new THREE.Group(); this.tilt = new THREE.Group(); this.g.add(this.tilt);
    this.model = W.perso.clone(true); this.model.scale.setScalar(SCALE); this.model.position.set(0, -0.55, 0); this.tilt.add(this.model); this.tilt.position.y = 0.55;
    const n = k => this.model.getObjectByName(k);
    this.n = { haut: n('haut'), tete: n('tete'), bg: n('bras_g'), bd: n('bras_d'), jg: n('jambe_g'), jd: n('jambe_d'), pg: n('pied_g'), pd: n('pied_d'), mg: n('main_g'), md: n('main_d') };
    this.base = {}; for (const k in this.n) this.base[k] = this.n[k].position.clone();
    this.setSkin(skinId); this.setName(name || '');
    this.ph = Math.random() * 6; this.t = Math.random() * 10; this.run = 0; this.air = 0; this.squash = 0; this.diveK = 0; this.stunK = 0; this.winK = 0; this.waveK = 0; this.danceK = 0; this.wasGround = true; this.spin = 0; this.lastVy = 0;
    W.scene.add(this.g);
  }
  setSkin(id) { this.skin = skinOf(id); this.mat = jellyMat(this.skin); this.model.traverse(m => { if (m.isMesh && !m.userData.deco) { m.material = this.mat; m.castShadow = true; } }); }
  setName(name) { if (this.tag) { this.g.remove(this.tag); this.tag.material.map.dispose(); } this.name = name; if (!name) { this.tag = null; return; } this.tag = tagSprite(name); this.tag.position.y = 1.62; this.g.add(this.tag); }
  setCrown(on) { if (on && !this.crown) { this.crown = spawn('couronne', { parent: this.n.tete, pos: [0, 0.375, 0], scale: 0.62 }); this.crown.traverse(m => m.userData.deco = true); } if (this.crown) this.crown.visible = !!on; }
  dispose() { W.scene.remove(this.g); }
  /** s = { speed, vy, flags } */
  animate(dt, s) {
    const N = this.n, B = this.base, gr = !!(s.flags & F.GROUND); this.t += dt; const t = this.t;
    const dive = !!(s.flags & F.DIVE), stun = !!(s.flags & F.STUN), win = !!(s.flags & F.WIN), wave = !!(s.flags & F.WAVE), dance = !!(s.flags & F.DANCE);
    this.g.visible = !(s.flags & F.OUT);
    this.run = damp(this.run, gr ? clamp(s.speed / 7, 0, 1.15) : 0, 12, dt);
    this.air = damp(this.air, gr ? 0 : 1, 14, dt); this.diveK = damp(this.diveK, dive ? 1 : 0, 16, dt); this.stunK = damp(this.stunK, stun ? 1 : 0, 10, dt);
    this.pushK = damp(this.pushK || 0, (s.flags & F.PUSH) ? 1 : 0, 26, dt); this.winK = damp(this.winK, win ? 1 : 0, 8, dt); this.waveK = damp(this.waveK, wave ? 1 : 0, 10, dt); this.danceK = damp(this.danceK, dance ? 1 : 0, 8, dt);
    if (gr && !this.wasGround) this.squash = clamp(-this.lastVy / 16, 0.25, 1); this.wasGround = gr; this.lastVy = s.vy;
    this.squash = Math.max(0, this.squash - dt * 3.2);
    this.ph += dt * (5 + this.run * 9.5); const ph = this.ph, sn = Math.sin(ph), cs = Math.cos(ph), R = this.run, A = this.air, idle = (1 - R) * (1 - A);
    const up = clamp(s.vy / 10, -1, 1);
    // --- jambes
    const flail = A * (up < 0 ? 1 : 0.25), ft = t * 17;
    let lg = -sn * 0.95 * R, ld = sn * 0.95 * R;
    lg = lerp(lg, -0.75 * Math.max(up, 0) + Math.sin(ft) * 0.5 * flail, A); ld = lerp(ld, 0.55 * Math.max(up, 0) - Math.sin(ft) * 0.5 * flail, A);
    N.jg.rotation.x = lg; N.jd.rotation.x = ld;
    N.jg.position.y = B.jg.y + Math.max(0, cs) * 0.07 * R + A * 0.03; N.jd.position.y = B.jd.y + Math.max(0, -cs) * 0.07 * R + A * 0.03;
    N.pg.rotation.x = Math.max(0, -sn) * 0.6 * R - Math.max(0, sn) * 0.35 * R + A * 0.5; N.pd.rotation.x = Math.max(0, sn) * 0.6 * R - Math.max(0, -sn) * 0.35 * R + A * 0.5;
    // --- haut du corps
    const breathe = Math.sin(t * 2.1) * 0.012 * idle, bob = Math.abs(sn) * 0.075 * R;
    N.haut.position.y = B.haut.y + bob + breathe - this.squash * 0.07;
    N.haut.rotation.x = 0.24 * R + up * -0.12 * A; N.haut.rotation.z = sn * 0.07 * R + Math.sin(t * 0.9) * 0.02 * idle; N.haut.rotation.y = sn * 0.16 * R;
    // --- bras
    let ag = sn * 1.15 * R, ad = -sn * 1.15 * R, zg = -0.1 - 0.12 * R, zd = 0.1 + 0.12 * R;
    ag += Math.sin(t * 1.7) * 0.06 * idle; ad += Math.sin(t * 1.7 + 1) * 0.06 * idle;
    // en l'air : bras levés quand on monte, qui moulinent quand on tombe
    const armUp = A * (1.5 + 0.9 * Math.max(up, 0));
    zg -= armUp; zd += armUp; ag = lerp(ag, Math.sin(ft) * 0.7 * flail, A); ad = lerp(ad, -Math.sin(ft + 1.3) * 0.7 * flail, A);
    // plongeon : bras tendus devant
    if (this.diveK > 0.01) { ag = lerp(ag, -2.75, this.diveK); ad = lerp(ad, -2.75, this.diveK); zg = lerp(zg, -0.25, this.diveK); zd = lerp(zd, 0.25, this.diveK); N.jg.rotation.x = lerp(N.jg.rotation.x, 0.55 + Math.sin(t * 22) * 0.25, this.diveK); N.jd.rotation.x = lerp(N.jd.rotation.x, 0.55 - Math.sin(t * 22) * 0.25, this.diveK); }
    // victoire : bras en l'air qui s'agitent
    if (this.winK > 0.01) { zg = lerp(zg, -2.5 + Math.sin(t * 11) * 0.35, this.winK); zd = lerp(zd, 2.5 + Math.sin(t * 11 + 2) * 0.35, this.winK); ag = lerp(ag, 0, this.winK); ad = lerp(ad, 0, this.winK); }
    // danse : déhanché + bras en alternance
    if (this.danceK > 0.01) { const d = this.danceK, b = t * 7.5; zg = lerp(zg, -1.5 + Math.sin(b) * 1.0, d); zd = lerp(zd, 1.5 + Math.sin(b) * 1.0, d); ag = lerp(ag, Math.cos(b) * 0.6, d); ad = lerp(ad, -Math.cos(b) * 0.6, d);
      N.haut.rotation.z += Math.sin(b) * 0.22 * d; N.haut.rotation.y += Math.sin(b * 0.5) * 0.5 * d; N.haut.position.y += Math.abs(Math.sin(b)) * 0.06 * d; N.jg.rotation.x += Math.max(0, Math.sin(b)) * -0.6 * d; N.jd.rotation.x += Math.max(0, -Math.sin(b)) * -0.6 * d; }
    // coucou : le bras droit salue
    if (this.waveK > 0.01) { zd = lerp(zd, 2.45 + Math.sin(t * 13) * 0.4, this.waveK); ad = lerp(ad, 0, this.waveK); }
    // pousser : les deux bras partent devant d'un coup
    if (this.pushK > 0.01) { ag = lerp(ag, -1.75, this.pushK); ad = lerp(ad, -1.75, this.pushK); zg = lerp(zg, 0.25, this.pushK); zd = lerp(zd, -0.25, this.pushK); N.haut.rotation.x += 0.28 * this.pushK; }
    N.bg.rotation.set(ag, 0, zg); N.bd.rotation.set(ad, 0, zd);
    N.mg.rotation.x = ag * 0.3; N.md.rotation.x = ad * 0.3;
    // --- tête : elle suit avec un peu de retard
    N.tete.position.y = B.tete.y - Math.abs(cs) * 0.02 * R - this.squash * 0.05 + A * up * 0.02;
    N.tete.rotation.x = -0.14 * R + Math.sin(t * 0.7) * 0.05 * idle + A * up * -0.25; N.tete.rotation.y = Math.sin(t * 0.45) * 0.28 * idle - sn * 0.1 * R; N.tete.rotation.z = Math.sin(t * 0.6 + 1) * 0.05 * idle - sn * 0.05 * R + this.danceK * Math.sin(t * 7.5) * 0.2;
    // --- tout le corps : étirement, écrasement, plongeon, culbute
    const st = 1 + A * up * 0.14 - this.squash * 0.3 * Math.cos(this.squash * 5) + this.winK * Math.abs(Math.sin(t * 6)) * 0.06;
    this.tilt.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
    this.tilt.position.y = 0.55 * st + this.winK * Math.abs(Math.sin(t * 6)) * 0.35;
    if (stun) this.spin += dt * 13; else this.spin = damp(this.spin % (Math.PI * 2) > Math.PI ? this.spin % (Math.PI * 2) - Math.PI * 2 : this.spin % (Math.PI * 2), 0, 9, dt);
    this.tilt.rotation.x = this.diveK * 1.35 + this.spin * (stun ? 1 : 1) ; this.tilt.rotation.z = this.stunK * Math.sin(t * 9) * 0.3;
    this.mat.uniforms.uHit.value = this.stunK * (0.25 + 0.25 * Math.sin(t * 30));
  }
}

// ------------------------------------------------------------------ physique du joueur local
export const PR = 0.4, PH = 1.05;
const SPEED = 7.4, GRAV = 27, JUMP = 10.2;
export class Ctl {
  constructor() { this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0; this.grounded = false; this.coyote = 0; this.dive = false; this.diveT = 0; this.stun = 0; this.ground = null; this.jumpBuf = 0; this.frozen = false; this.events = []; }
  place(x, y, z, yaw = 0) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.dive = false; this.stun = 0; this.grounded = false; this.ground = null; }
  knock(vx, vy, vz, stun = 0.7) { this.vel.set(vx, vy, vz); this.stun = stun; this.dive = false; this.grounded = false; this.coyote = 0; this.events.push('hit'); }
  get flags() { return (this.grounded ? F.GROUND : 0) | (this.dive ? F.DIVE : 0) | (this.stun > 0 ? F.STUN : 0); }
  step(dt, inp, level) {
    const p = this.pos, v = this.vel; this.stun = Math.max(0, this.stun - dt);
    const ctl = !this.frozen && this.stun <= 0 && !this.dive, mv = Math.hypot(inp.x, inp.z);
    if (ctl && mv > 0.01) {
      const tx = inp.x / Math.max(mv, 1) * SPEED, tz = inp.z / Math.max(mv, 1) * SPEED, k = this.grounded ? 13 : 4.5, f = 1 - Math.exp(-k * dt);
      v.x += (tx - v.x) * f; v.z += (tz - v.z) * f;
      let d = Math.atan2(inp.x, inp.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * (1 - Math.exp(-14 * dt));
    } else if (this.grounded) { const f = Math.exp(-(this.dive ? 3.5 : this.stun > 0 ? 4 : 12) * dt); v.x *= f; v.z *= f; }
    else if (this.stun <= 0 && !this.dive) { const f = Math.exp(-1.2 * dt); v.x *= f; v.z *= f; }
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt); this.jumpBuf = inp.jump ? 0.14 : Math.max(0, this.jumpBuf - dt); this.diveBuf = inp.dive ? 0.25 : Math.max(0, (this.diveBuf || 0) - dt); this.diveCd = Math.max(0, (this.diveCd || 0) - dt);
    if (ctl && this.jumpBuf > 0 && this.coyote > 0) { v.y = JUMP; this.coyote = 0; this.jumpBuf = 0; this.grounded = false; this.events.push('jump'); }
    if (ctl && this.diveBuf > 0 && this.diveCd <= 0 && !this.frozen) { this.dive = true; this.diveT = 0; this.diveBuf = 0; this.diveCd = 0.55; const s = Math.max(Math.hypot(v.x, v.z), SPEED * 0.9) + 4.2; v.x = Math.sin(this.yaw) * s; v.z = Math.cos(this.yaw) * s; v.y = Math.max(v.y, 0) * 0.4 + 5.2; this.grounded = false; this.events.push('dive'); }
    if (this.dive) { this.diveT += dt; if (this.grounded && this.diveT > 0.3) this.dive = false; if (this.diveT > 1.3) this.dive = false; }
    v.y -= GRAV * dt; if (v.y < -42) v.y = -42;
    const prevY = p.y; p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    const was = this.grounded; this.grounded = false; this.ground = null;
    if (level) for (const c of level.cols) {
      if (!c.on) continue; const top = c.y, bot = c.y - c.h; if (p.y > top || p.y + PH < bot) continue;
      const dx = p.x - c.x, dz = p.z - c.z; let pen, nx, nz, sup;
      if (c.k === 'c') { const d = Math.hypot(dx, dz); pen = c.r + PR - d; if (pen <= 0) continue; sup = d < c.r + 0.12; nx = d > 1e-4 ? dx / d : 1; nz = d > 1e-4 ? dz / d : 0; }
      else { const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), lx = cs * dx - sn * dz, lz = sn * dx + cs * dz, qx = clamp(lx, -c.hx, c.hx), qz = clamp(lz, -c.hz, c.hz);
        let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
        if (d < 1e-5) { const ax = c.hx - Math.abs(lx), az = c.hz - Math.abs(lz); if (ax < az) { ex = Math.sign(lx) || 1; ez = 0; pen = ax + PR; } else { ex = 0; ez = Math.sign(lz) || 1; pen = az + PR; } sup = true; }
        else { pen = PR - d; if (pen <= 0) continue; ex /= d; ez /= d; sup = d < 0.12; }
        nx = cs * ex + sn * ez; nz = -sn * ex + cs * ez; }
      if (sup && prevY >= top - 0.45 && v.y <= 0.01) {
        if (c.bounce) { v.y = c.bounce; p.y = top + 0.01; this.dive = false; this.events.push('boing'); c.hitT = 0; continue; }
        if (!was && v.y < -6) this.events.push('land');
        p.y = top; v.y = 0; this.grounded = true; this.ground = c; if (c.touch) c.touch(c); continue; }
      if (c.soft) continue;
      if (prevY + PH <= bot + 0.15 && v.y > 0) { p.y = bot - PH; v.y = 0; continue; }
      p.x += nx * pen; p.z += nz * pen; const vn = v.x * nx + v.z * nz; if (vn < 0) { v.x -= vn * nx; v.z -= vn * nz; }
    }
    const g = this.ground; if (g && (g.dx || g.dz || g.dy)) { p.x += g.dx; p.z += g.dz; if (g.dy < 0) p.y += g.dy; if (g.dyaw) { const a = g.dyaw, rx = p.x - g.x, rz = p.z - g.z, c = Math.cos(a), s = Math.sin(a); p.x = g.x + c * rx + s * rz; p.z = g.z - s * rx + c * rz; this.yaw += a; } }
  }
}
