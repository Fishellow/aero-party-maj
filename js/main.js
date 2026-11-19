// Aero Party — le chef d'orchestre : menus, lobby, manches, synchronisation entre joueurs.
import * as THREE from 'three';
import { W, initWorld, renderWorld, resize, WATER_Y } from './world.js';
import { Buddy, Ctl, SKINS, skinOf, F } from './player.js';
import { buildLobby, buildGame, GAMES } from './games.js';
import { Net } from './net.js';
import { sfx, startAudio, Audio, setVol } from './audio.js';
import { FX, initFx, grassShare } from './fx.js';

const $ = id => document.getElementById(id), B = document.body;
const BR = window.AERO || null;
const ST = { get(k, d) { try { const v = BR ? BR.store.get(k) : localStorage.getItem('aero.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { BR ? BR.store.set(k, JSON.stringify(v)) : localStorage.setItem('aero.' + k, JSON.stringify(v)); } catch (e) { } } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Joueur';
const grad = s => `radial-gradient(circle at 50% 120%, ${s.bot} 0%, transparent 60%), linear-gradient(180deg, ${s.top} 0%, ${s.mid || s.top} 50%, ${s.bot} 100%)`;
const MENU_SPOT = [3.4, 0.3, 5.6];

const G = window.__G = {
  phase: 'boot', me: { id: 'h', name: cleanName(ST.get('name', '')), skin: ST.get('skin', 'aero'), score: 0 }, P: new Map(), level: null, ctl: new Ctl(), buddy: null, game: null, lv: 0, round: 0,
  cam: { yaw: Math.PI, pitch: 0.32, dist: 7.5, tgt: new THREE.Vector3(), pos: new THREE.Vector3(), look: new THREE.Vector3() }, opt: Object.assign({ sens: 1, vol: 0.7, mus: 0.5, q: 1, auto: true }, ST.get('opt', {})),
  keys: {}, press: {}, locked: false, drag: false, spawnI: 0, myFlags: 0, emote: 0, emoteT: 0, lastGames: [], states: {}, sendT: 0, busy: false, shake: 0, kick: 0, wet: false, fade: 1, menuYaw: 0,
};
const me = G.me;
const screen = s => { B.dataset.screen = s; }, ui = u => { B.dataset.ui = u; if (u === 'join') setTimeout(() => $('code').focus(), 60); };
const paused = () => B.dataset.screen === 'pause';

// ------------------------------------------------------------------ petits outils d'interface
let toastT = 0; function toast(s, ms = 2800) { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
let banT = 0; function banner(s, ms = 2500) { const b = $('banner'); b.textContent = s; b.classList.add('on'); clearTimeout(banT); if (ms) banT = setTimeout(() => b.classList.remove('on'), ms); }
function center(s) { const c = $('center'); c.textContent = s; c.classList.remove('pop'); if (s) { void c.offsetWidth; c.classList.add('pop'); } }
function skinPicker() {
  const el = $('skins'); el.textContent = ''; for (const s of SKINS) { const b = document.createElement('button'); b.style.background = grad(s); b.title = s.nom; b.setAttribute('aria-label', s.nom); b.classList.toggle('on', s.id === me.skin);
    b.onmouseenter = () => sfx('hover'); b.onclick = () => { me.skin = s.id; ST.set('skin', s.id); sfx('click'); if (G.buddy) { G.buddy.setSkin(s.id); FX.spark({ x: G.ctl.pos.x, y: G.ctl.pos.y + 0.7, z: G.ctl.pos.z }, s.bot, 18, 0.7); } skinPicker(); sendMe(); drawList(); }; el.appendChild(b); }
  $('skinname').textContent = skinOf(me.skin).nom; $('plateorb').style.background = grad(skinOf(me.skin)); $('platename').textContent = me.name;
}
function everyone() { return [me, ...G.P.values()]; }
function drawList() {
  const g = G.game, rows = everyone().slice().sort((a, b) => b.score - a.score).map(p => { const r = g && g.res[p.id]; return `<li class="${p.id === me.id ? 'me ' : ''}${r ? (r.out != null ? 'out' : 'fin') : ''}"><i style="background:${grad(skinOf(p.skin))}"></i><span>${esc(p.name)}</span><b>${p.score}</b></li>`; });
  $('plist').innerHTML = rows.join(''); $('roomcode').textContent = Net.online ? Net.code : 'SOLO'; $('bCopy').style.display = Net.online ? '' : 'none';
  if (G.level && G.level.board) G.level.board(everyone().slice().sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, top: skinOf(p.skin).top, bot: skinOf(p.skin).bot })));
  if (G.level && G.level.setCode) { const txt = Net.online ? 'CODE  ' + Net.code : 'HORS LIGNE'; if (G.level.codeTxt !== txt) { G.level.codeTxt = txt; G.level.setCode(txt); } }
  const host = Net.isHost || !Net.online, pr = $('prompt'); pr.classList.toggle('host', host && G.phase === 'lobby');
  if (G.phase !== 'lobby') pr.textContent = ''; else if (host) pr.innerHTML = `<kbd>Entrée</kbd> Lancer une manche${G.P.size ? ` · ${G.P.size + 1} joueurs` : ''}`; else pr.textContent = G.busy ? 'Une manche est en cours, tu joues la suivante' : 'En attente de l\'hôte…';
}

// ------------------------------------------------------------------ joueurs distants
function addRemote(r) { const p = { id: r.id, name: r.name, skin: r.skin, score: r.score || 0, buddy: new Buddy(r.skin, r.name), tgt: null, flags: F.GROUND, speed: 0, vy: 0, lv: -1 }; p.buddy.g.visible = false; G.P.set(r.id, p); if (G.phase !== 'boot' && G.phase !== 'menu') { toast(`${r.name} a rejoint la partie`); sfx('join'); } return p; }
function syncRoster(list) {
  const seen = new Set();
  if (!Array.isArray(list)) return;
  for (const r0 of list.slice(0, 16)) { const r = { id: String(r0.id).slice(0, 8), name: cleanName(r0.name), skin: skinOf(r0.skin).id, score: Math.round(+r0.score) || 0 }; if (r.id === me.id) { me.score = r.score; continue; } seen.add(r.id); const p = G.P.get(r.id);
    if (!p) addRemote(r); else { if (p.skin !== r.skin) p.buddy.setSkin(r.skin); if (p.name !== r.name) p.buddy.setName(r.name); p.name = r.name; p.skin = r.skin; p.score = r.score; } }
  for (const [id, p] of G.P) if (!seen.has(id)) { p.buddy.dispose(); G.P.delete(id); toast(`${p.name} est parti`); }
  crowns(); drawList();
}
function roster() { return everyone().map(p => ({ id: p.id, name: p.name, skin: p.skin, score: p.score })); }
function pushRoster() { if (Net.isHost) Net.send({ t: 'roster', r: roster() }); crowns(); drawList(); }
function sendMe() { if (!Net.online) return; if (Net.isHost) pushRoster(); else Net.send({ t: 'me', name: me.name, skin: me.skin }); }
function crowns() { const all = everyone(), top = Math.max(...all.map(p => p.score)); for (const p of all) { const b = p === me ? G.buddy : p.buddy; if (b) b.setCrown(G.phase !== 'menu' && top > 0 && p.score === top); } }

// ------------------------------------------------------------------ réseau
Net.on('hi', (m, id) => { if (!Net.isHost) return; addRemote({ id, name: cleanName(m.name), skin: skinOf(m.skin).id, score: 0 }); pushRoster(); if (G.game) Net.to(id, { t: 'busy' }); });
Net.on('me', (m, id) => { const p = G.P.get(id); if (!Net.isHost || !p) return; p.name = cleanName(m.name); const s = skinOf(m.skin).id; if (s !== p.skin) { p.skin = s; p.buddy.setSkin(s); } p.buddy.setName(p.name); pushRoster(); });
Net.on('_left', (m, id) => { const p = G.P.get(id); if (!p) return; p.buddy.dispose(); G.P.delete(id); delete G.states[id]; toast(`${p.name} est parti`); pushRoster(); });
Net.on('_closed', () => { toast('L\'hôte a quitté : la partie est terminée', 4500); toMenu(); });
Net.on('roster', m => syncRoster(m.r));
Net.on('busy', () => { G.busy = true; drawList(); });
Net.on('s', (m, id) => { if (Net.isHost && Array.isArray(m.d)) { G.states[id] = m.d; applyState(id, m.d); } });
Net.on('S', m => { for (const id in m.d) if (id !== me.id) applyState(id, m.d[id]); });
Net.on('start', m => onStart(m));
Net.on('tile', (m, id) => { const i = m.i | 0; if (!G.level || !G.game || G.phase !== 'play' || !G.level.tiles[i]) return; if (Net.isHost) Net.send({ t: 'tile', i }, id); G.level.killTile(i); });
Net.on('orb', (m, id) => { if (Net.isHost) claimOrb(m.i | 0, id); });
Net.on('orbx', m => gotOrb(m.i, m.id));
Net.on('pt', (m, id) => { if (Net.isHost) paintClaim(m.i | 0, id); });
Net.on('ptx', m => gotPaint(m.i | 0, String(m.id)));
Net.on('pts', m => { const g = G.game; if (!g || g.def.type !== 'points' || !m.d) return; for (const id in m.d) g.pts[String(id).slice(0, 8)] = Math.round(+m.d[id]) || 0; showPts(); });
const hostT = () => G.game ? (Net.now() - G.game.t0) / 1000 : -1;
// arrivée annoncée par un invité : l'hôte attend (2 s au plus) que la position reçue le confirme
Net.on('push', (m, id) => { if (Net.isHost) relayPush(id, String(m.to)); });
Net.on('pushed', m => { if (m.to === me.id) gotPushed(+m.x || 0, +m.z || 0); const p = G.P.get(m.by); if (p) { p.pushT = 0.3; } });
Net.on('fin', (m, id) => { const g = G.game; if (!Net.isHost || !g || g.def.type !== 'course' || hostT() < 3 || g.res[id]) return; g.pend[id] = hostT(); });
Net.on('out', (m, id) => { const g = G.game; if (!Net.isHost || !g || g.def.type !== 'survie' || hostT() < 0) return; setRes(id, 'out', hostT()); });
Net.on('res', m => { if (G.game && (m.k === 'fin' || m.k === 'out')) { G.game.res[String(m.id)] = { [m.k]: +m.time || 0 }; drawList(); const p = G.P.get(m.id); if (p && m.id !== me.id) toast(m.k === 'out' ? `${p.name} est éliminé` : `${p.name} est arrivé`); } });
Net.on('end', m => onEnd(m));
Net.on('lobby', () => enterLobby());
function applyState(id, d) { const p = G.P.get(id); if (!p) return; p.tgt = { x: d[0], y: d[1], z: d[2], yaw: d[3] }; p.flags = d[4]; p.speed = d[5]; p.vy = d[6]; if (p.lv !== d[7]) { p.lv = d[7]; p.snap = true; } }

// ------------------------------------------------------------------ déroulé
function setLevel(L) { G.fpsT = -3; G.fpsN = 0; if (G.level) G.level.dispose(); G.level = L; W.sunBlocked = (o, d) => L.blocked(o, d); G.fade = 1; }
function placeMe(i) { const s = G.level.spawns[i % G.level.spawns.length]; G.ctl.place(s[0], s[1], s[2], s[3]); G.cam.yaw = s[3] + Math.PI; G.cam.pitch = 0.3; G.cam.dist = 7.5; G.cam.tgt.set(s[0], s[1] + 1.15, s[2]); G.spawnI = i; }
function hideOverlays() { $('banner').style.color = ''; $('banner').style.webkitTextStroke = ''; $('card').classList.remove('on'); $('results').classList.remove('on'); center(''); $('banner').classList.remove('on'); }
function enterLobby() {
  G.game = null; G.busy = false; G.lv = 0; if (!G.level || G.level.name !== 'lobby') setLevel(buildLobby()); else G.fade = 1; G.phase = 'lobby'; G.ctl.frozen = false; G.myFlags = 0;
  const ids = everyone().map(p => p.id).sort(); placeMe(Math.max(0, ids.indexOf(me.id)));
  screen('game'); ui('main'); hideOverlays(); $('gname').textContent = ''; $('gtime').textContent = ''; G.buddy.setName(''); G.zone = null; G.zoneT = 0; crowns(); drawList();
}
function toMenu() {
  Net.close(); for (const p of G.P.values()) p.buddy.dispose(); G.P.clear(); G.states = {}; me.score = 0; me.id = 'h'; G.game = null; G.busy = false;
  if (!G.level || G.level.name !== 'lobby') setLevel(buildLobby()); G.phase = 'menu'; G.ctl.place(...MENU_SPOT, -0.3); G.ctl.frozen = true; G.menuYaw = -0.3; if (document.pointerLockElement) document.exitPointerLock();
  screen('menu'); ui('main'); hideOverlays(); if (G.buddy) { G.buddy.setCrown(false); G.buddy.setName(''); } $('bCreate').disabled = false; skinPicker();
}
async function createRoom() {
  if ($('bCreate').disabled) return; $('bCreate').disabled = true; startAudio();
  const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  try { await Net.host(code); } catch (e) { toast('Pas de connexion : tu joues hors ligne', 4000); Net.isHost = true; Net.online = false; }
  me.id = 'h'; $('bCreate').disabled = false; enterLobby(); if (Net.online) toast(`Partie créée : donne le code ${code} à tes potes`, 5000);
}
async function joinRoom() {
  const code = $('code').value.toUpperCase().replace(/[^A-Z]/g, ''), msg = $('joinmsg'); if (code.length !== 4) { msg.textContent = 'Le code fait quatre lettres.'; return; }
  msg.textContent = 'Connexion…'; $('bJoin').disabled = true; startAudio();
  try { await Net.join(code); me.id = Net.myId; Net.send({ t: 'hi', name: me.name, skin: me.skin }); msg.textContent = ''; enterLobby(); }
  catch (e) { msg.textContent = e && e.type === 'full' ? 'Cette partie est pleine.' : 'Partie introuvable. Vérifie le code avec ton pote.'; Net.close(); }
  $('bJoin').disabled = false;
}
function hostStart(force, chain) {
  if ((G.phase !== 'lobby' && !chain) || (Net.online && !Net.isHost)) return;
  if (!chain) G.chain = null;
  const ids = Object.keys(GAMES).filter(g => !G.lastGames.includes(g)), id = force || ids[Math.floor(Math.random() * ids.length)]; G.lastGames.push(id); if (G.lastGames.length >= Object.keys(GAMES).length) G.lastGames = [id];
  const m = { t: 'start', g: id, seed: Math.floor(Math.random() * 1e9), t0: Net.now() + (chain ? 5200 : 6500), order: everyone().map(p => p.id), lv: ++G.round, tour: G.chain ? [G.chain.n - G.chain.left + 1, G.chain.n] : null };
  if (G.chain) G.chain.left--;
  Net.send(m); onStart(m);
}
function onStart(m) {
  const def = GAMES[m.g]; if (!def) return; G.busy = false;
  G.game = { id: m.g, def, t0: m.t0, order: m.order, res: {}, pts: {}, pend: {}, own: {}, ask: {}, done: false, over: false, check: -1, cd: 4, endAt: 0 }; G.lv = m.lv; G.round = m.lv;
  setLevel(buildGame(m.g, m.seed, m.order.length, { tile: i => { if (G.phase !== 'play') return; G.level.killTile(i); FX.spark(G.level.tiles[i].c, '#bff3ff', 6, 0.5); sfx('tile'); Net.send({ t: 'tile', i }); }, say: (txt, col, sec) => { const b = $('banner'); b.style.color = col; b.style.webkitTextStroke = '10px #fff'; b.style.paintOrder = 'stroke fill'; banner(txt, sec * 1000); sfx('tick'); } }));
  G.level.onPaint = i => { const g = G.game, now = performance.now(); if (G.phase !== 'play' || g.own[i] === me.id || now - (g.ask[i] || 0) < 350) return; g.ask[i] = now; if (Net.isHost || !Net.online) paintClaim(i, me.id); else Net.send({ t: 'pt', i }); };
  G.level.onOrb = i => { if (G.phase !== 'play') { G.level.orbs[i].asked = false; return; } if (Net.isHost || !Net.online) claimOrb(i, me.id); else Net.send({ t: 'orb', i }); }; G.lastGY = 0;
  placeMe(Math.max(0, m.order.indexOf(me.id))); G.ctl.frozen = true; G.phase = 'intro'; G.myFlags = 0;
  screen('game'); ui('main'); hideOverlays(); $('cardnum').textContent = m.tour ? 'Tournoi · manche ' + (+m.tour[0] | 0) + ' sur ' + (+m.tour[1] | 0) : 'Manche ' + (m.lv | 0); $('cardname').textContent = def.nom; $('cardaide').textContent = def.aide; $('card').classList.add('on'); setTimeout(() => $('card').classList.remove('on'), 3300);
  $('gname').textContent = def.nom; $('gtime').textContent = ''; $('gtime').classList.remove('low'); drawList(); sfx('card');
}
function claimOrb(i, id) { const g = G.game, L = G.level; if (!g || g.over || g.def.type !== 'points' || !L.orbs[i] || L.orbs[i].taken || hostT() < L.orbs[i].at) return; if (id !== me.id) { const s = G.states[id]; if (!s || Math.hypot(s[0] - L.orbs[i].x, s[2] - L.orbs[i].z) > 4) return; } Net.send({ t: 'orbx', i, id }); gotOrb(i, id); }
function gotOrb(i, id) { const g = G.game; if (!g || !G.level.takeOrb(i)) return; g.pts[id] = (g.pts[id] || 0) + 1; if (id === me.id) { sfx('pop'); $('gname').textContent = g.def.nom + ' · ' + g.pts[id]; } }
// pousser : l'hôte vérifie que les deux joueurs sont bien côte à côte, puis prévient celui qui est poussé
const posOf = id => id === me.id ? [G.ctl.pos.x, G.ctl.pos.y, G.ctl.pos.z] : G.states[id];
const pushLast = {};
function relayPush(by, to) { const a = posOf(by), b = posOf(to), now = performance.now(); if (!a || !b || by === to || now - (pushLast[by] || 0) < 600) return; const dx = b[0] - a[0], dz = b[2] - a[2], d = Math.hypot(dx, dz); if (d > 2.4 || Math.abs(b[1] - a[1]) > 1.6) return; pushLast[by] = now; const m = { t: 'pushed', to, by, x: dx / (d || 1), z: dz / (d || 1) }; Net.send(m); if (to === me.id) gotPushed(m.x, m.z); const p = G.P.get(by); if (p) p.pushT = 0.3; }
function gotPushed(x, z) { const c = G.ctl; if (c.frozen || (G.myFlags & F.OUT)) return; c.knock(x * 9.5, 4.2, z * 9.5, 0.28); }
function doPush() { const c = G.ctl; if (!playing() || c.frozen || c.stun > 0 || (G.pushCd || 0) > 0) return; G.pushCd = 0.7; G.pushT = 0.28; sfx('push'); const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); FX.puff({ x: c.pos.x + fx * 0.8, y: c.pos.y + 0.5, z: c.pos.z + fz * 0.8 }, 5, 0.8);
  let best = null, bd = 1.9; for (const p of G.P.values()) { if (p.lv !== G.lv || !p.tgt || (p.flags & F.OUT)) continue; const b = p.buddy.g.position, dx = b.x - c.pos.x, dz = b.z - c.pos.z, d = Math.hypot(dx, dz); if (d < bd && Math.abs(b.y - c.pos.y) < 1.4 && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = p; } }
  if (!best) return; if (Net.isHost) relayPush(me.id, best.id); else Net.send({ t: 'push', to: best.id }); }
// guerre de peinture : l'hôte attribue chaque dalle, le score est le nombre de dalles à sa couleur
function paintClaim(i, id) { const g = G.game, L = G.level; if (!g || g.over || !L.paint || i < 0 || i >= L.paintN || g.own[i] === id || G.phase !== 'play') return; if (id !== me.id) { const s = G.states[id], c = L.cellAt(i); if (!s || Math.hypot(s[0] - c.x, s[2] - c.z) > 3.4) return; } Net.send({ t: 'ptx', i, id }); gotPaint(i, id); }
function gotPaint(i, id) { const g = G.game, L = G.level; if (!g || !L.paint || i < 0 || i >= L.paintN) return; g.own[i] = id; const p = id === me.id ? me : G.P.get(id); L.paint(i, p ? skinOf(p.skin).top : '#ffffff'); g.pts = {}; for (const k in g.own) g.pts[g.own[k]] = (g.pts[g.own[k]] || 0) + 1; showPts(); }
function showPts() { const g = G.game; if (g && g.def.type === 'points') $('gname').textContent = g.def.nom + ' · ' + (g.pts[me.id] || 0); }
function hillTick(t) { const g = G.game, L = G.level; if (!L.zoneAt || (Net.online && !Net.isHost) || t < (g.hillAt || 0)) return; g.hillAt = t + 0.5; const z = L.zoneAt(t); for (const id of g.order) { const s = posOf(id); if (!s || (id !== me.id && (!G.P.has(id) || G.states[id][7] !== G.lv))) continue; if (Math.hypot(s[0] - z[0], s[2] - z[1]) < z[2] && s[1] > -0.5 && s[1] < 2.5) g.pts[id] = (g.pts[id] || 0) + 1; } Net.send({ t: 'pts', d: g.pts }); showPts(); }
function setRes(id, k, time) { const g = G.game; if (!g || g.over || g.res[id]) return; g.res[id] = { [k]: time }; Net.send({ t: 'res', id, k, time }); drawList(); const p = G.P.get(id); if (p && id !== me.id) toast(k === 'out' ? `${p.name} est éliminé` : `${p.name} est arrivé`); }
function report(k, time) { if (Net.isHost || !Net.online) setRes(me.id, k, time); else { G.game.res[me.id] = { [k]: time }; Net.send({ t: k, time }); drawList(); } }
function hostCheckEnd(t) {
  const g = G.game; if (!g || g.over || (Net.online && !Net.isHost)) return;
  for (const id in g.pend) { const st = G.states[id], L = G.level; if (st && st[7] === G.lv && st[2] >= L.finishZ - 3 && st[1] >= L.finishY - 2) { setRes(id, 'fin', g.pend[id]); delete g.pend[id]; } else if (t - g.pend[id] > 2) delete g.pend[id]; }
  const ids = g.order.filter(id => id === me.id || G.P.has(id)), n = ids.length; let end = t > g.def.duree;
  if (g.def.type === 'points') { /* fin au chrono seulement */ }
  else if (g.def.type === 'course') { const fins = ids.filter(id => g.res[id]); if (fins.length === n) end = true; if (fins.length && !g.endAt) g.endAt = t + 30; if (g.endAt && t > g.endAt) end = true; }
  else { const alive = ids.filter(id => !g.res[id]); if (n > 1 ? alive.length <= 1 : alive.length === 0) end = true; }
  if (!end) return; g.over = true;
  const posZ = id => id === me.id ? G.ctl.pos.z : (G.states[id] ? G.states[id][2] : 0), posY = id => id === me.id ? G.ctl.pos.y : (G.states[id] ? G.states[id][1] : 0), val = id => { const r = g.res[id]; if (g.def.type === 'points') return g.pts[id] || 0; if (g.id === 'tour') return r ? 1e6 - r.fin : posY(id); return g.def.type === 'course' ? (r ? 1e6 - r.fin : posZ(id)) : (r ? r.out : 1e6); };
  const rank = ids.slice().sort((a, b) => val(b) - val(a)), pts = {}, scores = {};
  rank.forEach((id, i) => { pts[id] = (n - i) * 10 + (i === 0 ? 5 : 0); const p = id === me.id ? me : G.P.get(id); p.score += pts[id]; });
  for (const p of everyone()) scores[p.id] = p.score;
  const last = G.chain && G.chain.left <= 0, m = { t: 'end', rank: last ? everyone().slice().sort((a, b) => b.score - a.score).map(p => p.id) : rank, pts, scores, fin: !!last, suite: !!(G.chain && !last) }; Net.send(m); onEnd(m);
  const lv = G.lv; setTimeout(() => { if (G.phase !== 'results' || G.lv !== lv) return; if (G.chain && G.chain.left > 0) hostStart(null, true); else { G.chain = null; Net.send({ t: 'lobby' }); enterLobby(); } }, last ? 11000 : G.chain ? 6000 : 8000);
}
function onEnd(m) {
  const g = G.game, c0 = G.ctl; if (!g) return; g.over = true; G.phase = 'results'; c0.frozen = true; if (document.pointerLockElement) document.exitPointerLock();
  if (!m || !Array.isArray(m.rank) || !m.scores || !m.pts) return;
  for (const p of everyone()) if (m.scores[p.id] != null) p.score = Math.round(+m.scores[p.id]) || 0;
  const byId = id => id === me.id ? me : G.P.get(id), won = m.rank[0] === me.id;
  $('reslist').innerHTML = m.rank.map((id, i) => { const p = byId(id); return p ? `<li style="--i:${i}"><span class="rk">${i + 1}</span><i style="background:${grad(skinOf(p.skin))}"></i><span class="nm">${esc(p.name)}</span><span class="pt">+${+m.pts[id] || 0}</span><span class="tot">${p.score} pts</span></li>` : ''; }).join('');
  const champ = byId(m.rank[0]); $('restitle').textContent = m.fin ? (won ? 'Champion !' : 'Tournoi terminé') : won ? 'Victoire !' : 'Résultats'; if (m.fin && champ) banner(champ.name + ' gagne le tournoi', 9000); hideOverlays(); screen('game'); ui('main'); $('results').classList.add('on'); if (m.fin && $('restitle').textContent) banner((byId(m.rank[0]) || me).name + ' gagne le tournoi', 9000);
  G.myFlags = won ? F.WIN : (G.myFlags & F.OUT); sfx(won ? 'win' : 'check'); crowns(); drawList(); if (won && c0.pos.y > -20) FX.confetti(c0.pos, 160);
}

// ------------------------------------------------------------------ commandes
const cv = $('c');
const playing = () => ['lobby', 'intro', 'play'].includes(G.phase) && !paused();
const lock = () => { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => { }); };
function pause(on) { if (G.phase === 'menu' || G.phase === 'boot') return; screen(on ? 'pause' : 'game'); ui('main'); if (on) { skinPicker(); if (document.pointerLockElement) document.exitPointerLock(); } else if (G.phase !== 'results') lock(); }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && e.target.id === 'code') joinRoom(); if (e.key === 'Enter' && e.target.id === 'pseudo') e.target.blur(); if (e.key === 'Escape') { e.target.blur(); ui('main'); } return; }
  if (!G.keys[e.code]) G.press[e.code] = true; G.keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
  if (e.code === 'Enter' && G.phase === 'lobby' && !paused()) hostStart();
  if (e.code === 'Escape') { if (B.dataset.ui !== 'main') ui('main'); else if (!document.pointerLockElement) pause(!paused()); }
  if (e.code === 'KeyE' || e.code === 'KeyF') doPush();
  if (e.code === 'Digit1' || e.code === 'Numpad1') { G.emote = F.WAVE; G.emoteT = 1.8; } if (e.code === 'Digit2' || e.code === 'Numpad2') { G.emote = F.DANCE; G.emoteT = 4; }
});
addEventListener('keyup', e => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; });
addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => { startAudio(); if (G.phase === 'menu') { G.drag = true; return; } if (!playing()) return; if (!document.pointerLockElement) { G.drag = true; lock(); } else if (e.button === 0) G.press.Dive = true; else if (e.button === 2) doPush(); });
addEventListener('mouseup', () => { G.drag = false; });
addEventListener('mousemove', e => { if (G.phase === 'menu') { if (G.drag) G.menuYaw += e.movementX * 0.012; return; } if (!(document.pointerLockElement === cv || G.drag) || !playing()) return; const s = 0.0024 * G.opt.sens; G.cam.yaw -= e.movementX * s; G.cam.pitch = Math.max(-0.35, Math.min(1.25, G.cam.pitch + e.movementY * s)); });
addEventListener('wheel', e => { G.cam.dist = Math.max(4, Math.min(14, G.cam.dist + Math.sign(e.deltaY) * 0.8)); }, { passive: true });
document.addEventListener('pointerlockchange', () => { const on = document.pointerLockElement === cv; if (G.locked && !on && playing()) pause(true); G.locked = on; });

for (const b of document.querySelectorAll('.nav button, .btn, .back, .seg button, #plate, #prompt')) { b.addEventListener('mouseenter', () => sfx('hover')); b.addEventListener('click', () => { startAudio(); sfx('click'); }); }
for (const b of document.querySelectorAll('.back')) b.addEventListener('click', () => { ui('main'); ST.set('opt', G.opt); });
$('bCreate').onclick = createRoom; $('bJoin').onclick = joinRoom; $('prompt').onclick = () => hostStart();
$('bGoJoin').onclick = () => { $('joinmsg').textContent = ''; ui('join'); }; $('bGoSkin').onclick = $('bGoSkin2').onclick = $('plate').onclick = () => ui('skin'); $('bGoOpt').onclick = $('bGoOpt2').onclick = () => ui('opts');
$('bCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(Net.code).then(() => toast('Code copié')); };
$('bResume').onclick = () => pause(false); $('bLeave').onclick = () => toMenu();
$('bQuit').onclick = () => { if (BR) BR.quit(); else window.close(); }; $('bFull').onclick = () => { if (BR) BR.toggleFull(); else if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); };
$('pseudo').value = ST.get('name', ''); $('pseudo').placeholder = 'Joueur';
$('pseudo').oninput = () => { me.name = cleanName($('pseudo').value); $('platename').textContent = me.name; }; $('pseudo').onchange = () => { ST.set('name', me.name); sendMe(); drawList(); };
$('code').oninput = e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
function applyOpt() { Audio.vol = G.opt.vol; Audio.music = G.opt.mus; setVol(); W.quality = G.opt.q; if (W.renderer) { W.renderer.shadowMap.enabled = G.opt.q > 0.7; W.bloom.enabled = G.opt.q > 0.7; if (W.ao) W.ao.enabled = G.opt.q >= 1; const ms = G.opt.q >= 1 ? 2048 : 1024; if (W.sun.shadow.mapSize.x !== ms) { W.sun.shadow.mapSize.set(ms, ms); if (W.sun.shadow.map) { W.sun.shadow.map.dispose(); W.sun.shadow.map = null; } } W.scene.traverse(o => { if (o.userData.grassFull) o.count = Math.round(o.userData.grassFull * grassShare()); }); resize(); } $('oSens').value = G.opt.sens; $('oVol').value = G.opt.vol; $('oMus').value = G.opt.mus; for (const b of $('oQual').children) b.classList.toggle('on', G.opt.auto ? b.dataset.q === '0' : +b.dataset.q === G.opt.q); }
$('oSens').oninput = e => { G.opt.sens = +e.target.value; }; $('oVol').oninput = e => { G.opt.vol = +e.target.value; applyOpt(); }; $('oMus').oninput = e => { G.opt.mus = +e.target.value; applyOpt(); };
for (const b of $('oQual').children) b.onclick = () => { if (b.dataset.q === '0') { G.opt.auto = true; G.opt.q = 1; } else { G.opt.auto = false; G.opt.q = +b.dataset.q; } G.fpsN = 0; G.fpsT = -3; applyOpt(); ST.set('opt', G.opt); };
G.dbg = { games: () => Object.keys(GAMES), tournoi: n => { for (const p of everyone()) p.score = 0; G.chain = { n: n || 5, left: n || 5 }; hostStart(null, true); }, push: doPush, start: g => hostStart(g), lobby: () => { Net.send({ t: 'lobby' }); enterLobby(); }, solo: () => { Net.close(); Net.isHost = true; me.id = 'h'; enterLobby(); }, Net, ui, pause };

const fit = () => document.documentElement.style.setProperty('--z', Math.max(0.75, Math.min(2.2, innerHeight / 900)).toFixed(3)); fit(); addEventListener('resize', fit);
// ------------------------------------------------------------------ boucle de jeu
const inp = { x: 0, z: 0, jump: false, dive: false }, V = new THREE.Vector3();
function playLogic(t, dt) {
  const g = G.game, L = G.level, c = G.ctl, p = c.pos;
  if (G.phase === 'intro') { const left = (g.t0 - Net.now()) / 1000, n = Math.ceil(left); if (n <= 3 && n >= 1 && n !== g.cd) { g.cd = n; center(String(n)); sfx('tick'); } if (left <= 0) { G.phase = 'play'; c.frozen = false; center('GO !'); sfx('go'); setTimeout(() => { if ($('center').textContent === 'GO !') center(''); }, 900); } }
  if ((G.phase === 'results' || g.done) && !(G.myFlags & F.OUT) && (p.y < L.killY || (L.fall && c.grounded === false && p.y < (G.lastGY || 0) - 14))) { const k = g.def.type === 'course' && g.done ? [0, L.finishY + 1.2, L.finishZ + 3] : L.spawns[G.spawnI]; c.place(k[0] + (Math.random() - 0.5) * 3, k[1] + 0.5, k[2], 0); G.fade = 0.6; }
  if (c.grounded) G.lastGY = p.y;
  if (G.phase !== 'play') return;
  const left = Math.max(0, g.def.duree - t); $('gtime').textContent = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'); $('gtime').classList.toggle('low', left < 10);
  if (!g.done) {
    if (g.def.type === 'course') {
      L.checks.forEach((k, i) => { if (i > g.check && c.grounded && p.z >= k[3] && p.y > k[1] - 1) { g.check = i; sfx('check'); toast('Point de passage'); FX.ring(p, '#ffe45a', 9); FX.spark(p, '#ffe45a', 18); } });
      if (c.grounded) G.lastGY = p.y;
      if (L.sendBack) { L.sendBack = false; const k = L.spawns[G.spawnI]; c.place(k[0], k[1] + 0.3, k[2], 0); G.fade = 0.5; sfx('out'); toast('Tu as bougé au feu rouge'); }
      if (p.y < L.killY || (L.fall && p.y < G.lastGY - L.fall)) { G.lastGY = -99; const k = g.check >= 0 ? L.checks[g.check] : L.spawns[G.spawnI]; c.place(k[0] + (Math.random() - 0.5) * 3, k[1] + 0.5, k[2], 0); G.fade = 0.6; }
      if (p.z > L.finishZ && p.y > L.finishY && c.grounded) { g.done = true; report('fin', t); const pos = Object.keys(g.res).length; banner(pos <= 1 ? 'Premier !' : `Arrivé ${pos}e`, 4000); G.myFlags = F.WIN; sfx('win'); FX.confetti(p, 140); }
    } else if (g.def.type === 'points') { if (p.y < L.killY) { placeMe(G.spawnI); G.fade = 0.6; } hillTick(t); }
    else if (p.y < L.killY) { g.done = true; report('out', t); G.myFlags = F.OUT; c.frozen = true; banner('Éliminé', 3500); sfx('out'); }
  }
  hostCheckEnd(t);
}
function camera(dt) {
  const cam = G.cam, c = G.ctl;
  if (G.phase === 'menu' || G.phase === 'boot') {
    // caméra de présentation : le personnage à droite, la fontaine derrière ; plus près dans le vestiaire
    const near = B.dataset.ui === 'skin', bx = MENU_SPOT[0], bz = MENU_SPOT[2], sway = Math.sin(W.time * 0.25) * 0.25, snap = G.fade > 0.95 || cam.pos.lengthSq() < 0.01;
    V.set(bx + (near ? -0.85 : -1.75) + sway, near ? 1.15 : 1.35, bz + (near ? 3.2 : 5.0)); if (snap) cam.pos.copy(V); else cam.pos.lerp(V, 1 - Math.exp(-3.5 * dt));
    V.set(bx + (near ? -0.72 : -1.55), near ? 0.72 : 0.95, bz); if (snap) cam.look.copy(V); else cam.look.lerp(V, 1 - Math.exp(-3.5 * dt));
    W.cam.position.copy(cam.pos); W.cam.lookAt(cam.look); if (Math.abs(W.cam.fov - 38) > 0.05) { W.cam.fov = 38; W.cam.updateProjectionMatrix(); } return; }
  let tx = c.pos.x, ty = c.pos.y + 1.15, tz = c.pos.z;
  if (G.myFlags & F.OUT) { const a = [...G.P.values()].find(p => p.lv === G.lv && !(p.flags & F.OUT) && p.tgt); if (a) { tx = a.buddy.g.position.x; ty = a.buddy.g.position.y + 1.15; tz = a.buddy.g.position.z; } else { ty = 3; tx = 0; tz = 0; } }
  const k = 1 - Math.exp(-14 * dt); cam.tgt.x += (tx - cam.tgt.x) * k; cam.tgt.z += (tz - cam.tgt.z) * k; cam.tgt.y += (ty - cam.tgt.y) * (1 - Math.exp(-7 * dt));
  if (cam.tgt.distanceToSquared(V.set(tx, ty, tz)) > 900) cam.tgt.set(tx, ty, tz);
  G.shake = Math.max(0, G.shake - dt * 1.6); G.kick = Math.max(0, G.kick - dt * 2.2); const fov = 62 + G.kick * 9 + Math.min(8, Math.hypot(c.vel.x, c.vel.z) * 0.45); if (Math.abs(W.cam.fov - fov) > 0.05) { W.cam.fov += (fov - W.cam.fov) * Math.min(1, dt * 8); W.cam.updateProjectionMatrix(); }
  // en fin de manche la caméra tourne doucement autour du joueur
  if (G.phase === 'results') cam.yaw += dt * 0.25;
  const cp = Math.cos(cam.pitch); W.cam.position.set(cam.tgt.x + Math.sin(cam.yaw) * cp * cam.dist, cam.tgt.y + Math.sin(cam.pitch) * cam.dist, cam.tgt.z + Math.cos(cam.yaw) * cp * cam.dist); W.cam.lookAt(cam.tgt);
  if (G.shake > 0) { const s = G.shake * G.shake * 1.4; W.cam.position.x += (Math.random() - 0.5) * s; W.cam.position.y += (Math.random() - 0.5) * s; W.cam.rotation.z += (Math.random() - 0.5) * s * 0.08; }
}
let last = performance.now(), raf = 0;
function frame(viaTimer) {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; const c = G.ctl, L = G.level, g = G.game, menu = G.phase === 'menu';
  const t = g ? (Net.now() - g.t0) / 1000 : W.time;
  // commandes → direction par rapport à la caméra
  const K = G.keys, ix = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), iz = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), fx = -Math.sin(G.cam.yaw), fz = -Math.cos(G.cam.yaw);
  const free = playing(); inp.x = free ? fx * iz - fz * ix : 0; inp.z = free ? fz * iz + fx * ix : 0; inp.jump = free && !!G.press.Space; inp.dive = free && !!(G.press.Dive || G.press.ShiftLeft || G.press.ShiftRight); G.press = {};
  if (L) {
    L.update(g ? Math.max(0, t) : t, dt, menu || c.frozen ? null : c);
    const steps = dt > 0.02 ? 2 : 1; for (let i = 0; i < steps; i++) { c.step(dt / steps, inp, L); inp.jump = inp.dive = false; }
    // on se pousse un peu entre joueurs
    for (const p of G.P.values()) { if (p.lv !== G.lv || (p.flags & F.OUT) || !p.tgt) continue; const b = p.buddy.g.position, dx = c.pos.x - b.x, dz = c.pos.z - b.z, d = Math.hypot(dx, dz); if (d < 0.78 && d > 0.001 && Math.abs(c.pos.y - b.y) < 1) { const k = (0.78 - d) * 0.5 / d; c.pos.x += dx * k; c.pos.z += dz * k; } }
    const col = skinOf(me.skin).bot;
    for (const ev of c.events) { if (menu) continue; sfx(ev); if (ev === 'jump') FX.puff(c.pos, 6, 0.7); if (ev === 'land') { FX.puff(c.pos, 12, 1.1); G.shake = Math.max(G.shake, 0.12); } if (ev === 'boing') { FX.ring(c.pos, '#ffffff', 7); FX.spark(c.pos, col, 14); G.kick = 1; } if (ev === 'bump') { FX.spark(c.pos, '#ffe45a', 20, 1.2); G.shake = 0.3; } if (ev === 'hit') { FX.spark(c.pos, '#ffffff', 22, 1.3); G.shake = 0.45; } if (ev === 'dive') { FX.puff(c.pos, 8, 1); G.kick = 0.7; } }
    c.events.length = 0;
    if (c.dive) FX.trail(c.pos, col); if (!menu && c.grounded && Math.hypot(c.vel.x, c.vel.z) > 5 && Math.random() < dt * 9) FX.puff(c.pos, 1, 0.45);
    if (c.pos.y < WATER_Y + 0.3 && c.vel.y < -5 && !G.wet) { G.wet = true; FX.splash(c.pos.x, WATER_Y + 0.2, c.pos.z); sfx('splash'); } if (c.pos.y > WATER_Y + 3) G.wet = false;
    if (G.phase === 'lobby' && c.pos.y < L.killY) { placeMe(G.spawnI); G.fade = 0.6; }
    // portiques du lobby : on reste dessus pour lancer la manche, on passe dessous pour se changer
    if (G.phase === 'lobby' && !paused()) { const z = L.zones.find(z => Math.hypot(c.pos.x - z.x, c.pos.z - z.z) < z.r && c.pos.y < 1.6) || null, host = Net.isHost || !Net.online;
      if (z !== G.zone) { G.zone = z; G.zoneT = 0; G.zoneN = 9; if (!z) $('banner').classList.remove('on'); else { FX.ring(z, z.tint, 8); sfx('check'); if (z.id === 'skin') { pause(true); ui('skin'); } else if (!host) banner('Seul l\'hôte lance la manche', 2200); } }
      if (z && z.id === 'tour' && host) { G.zoneT += dt; const n = Math.ceil(3 - G.zoneT); if (n !== G.zoneN) { G.zoneN = n; if (n > 0) { banner('Tournoi dans ' + n, 0); sfx('tick'); FX.ring(z, z.tint, 9); FX.spark({ x: z.x, y: 0.4, z: z.z }, z.tint, 14, 0.8); } } if (G.zoneT >= 3) { $('banner').classList.remove('on'); G.zone = null; for (const p of everyone()) p.score = 0; pushRoster(); G.chain = { n: 5, left: 5 }; hostStart(null, true); } }
      if (z && z.id === 'play' && host) { G.zoneT += dt; const n = Math.ceil(3 - G.zoneT); if (n !== G.zoneN) { G.zoneN = n; if (n > 0) { banner('Départ dans ' + n, 0); sfx('tick'); FX.ring(z, z.tint, 9); FX.spark({ x: z.x, y: 0.4, z: z.z }, z.tint, 14, 0.8); } } if (G.zoneT >= 3) { $('banner').classList.remove('on'); G.zone = null; hostStart(); } } }
    if (g) playLogic(t, dt);
  }
  // mon personnage
  G.emoteT -= dt; if (G.emoteT <= 0 || Math.hypot(c.vel.x, c.vel.z) > 1.5 || !c.grounded) G.emote = 0;
  G.pushCd = Math.max(0, (G.pushCd || 0) - dt); G.pushT = Math.max(0, (G.pushT || 0) - dt);
  const flags = (G.myFlags & F.OUT) ? F.OUT : (c.flags | G.myFlags | G.emote | (G.pushT > 0 ? F.PUSH : 0)), sp = Math.hypot(c.vel.x, c.vel.z);
  if (G.buddy) { if (menu) { const spin = B.dataset.ui === 'skin'; if (!G.drag) G.menuYaw += spin ? dt * 0.5 : (-0.3 - G.menuYaw) * (1 - Math.exp(-2 * dt)); c.yaw = G.menuYaw; }
    G.buddy.g.position.copy(c.pos); G.buddy.g.rotation.y = c.yaw; G.buddy.animate(dt, { speed: sp, vy: c.vel.y, flags: menu ? F.GROUND | (W.time % 9 < 1.8 ? F.WAVE : 0) : flags }); }
  // les autres
  for (const p of G.P.values()) { const b = p.buddy, tg = p.tgt; b.g.visible = !!tg && p.lv === G.lv; if (!tg) continue;
    if (p.snap) { b.g.position.set(tg.x, tg.y, tg.z); b.g.rotation.y = tg.yaw; p.snap = false; }
    const k = 1 - Math.exp(-16 * dt); b.g.position.x += (tg.x - b.g.position.x) * k; b.g.position.y += (tg.y - b.g.position.y) * k; b.g.position.z += (tg.z - b.g.position.z) * k;
    let d = tg.yaw - b.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); b.g.rotation.y += d * k; b.animate(dt, p); if (p.lv !== G.lv) b.g.visible = false; }
  // envoi de ma position 15 fois par seconde
  G.sendT -= dt; if (Net.online && G.sendT <= 0 && !menu) { G.sendT = 1 / 15; const r = x => Math.round(x * 100) / 100, d = [r(c.pos.x), r(c.pos.y), r(c.pos.z), r(c.yaw), flags, r(sp), r(c.vel.y), G.lv];
    if (Net.isHost) { G.states.h = d; Net.send({ t: 'S', d: G.states }); } else Net.send({ t: 's', d }); }
  // l'herbe s'écarte sous les joueurs
  { const who = W.grassWho.value; let i = 0; who[i++].copy(c.pos); for (const p of G.P.values()) if (i < 8 && p.buddy.g.visible) who[i++].copy(p.buddy.g.position); for (; i < 8; i++) who[i].set(0, -999, 0); }
  G.fade = Math.max(0, G.fade - dt * 1.8); W.fade = G.fade * G.fade;
  if (B.dataset.phase !== G.phase) B.dataset.phase = G.phase;
  if (viaTimer !== true && !document.hidden) { G.fpsT = (G.fpsT || 0) + dt; if (G.fpsT > 0) G.fpsN = (G.fpsN || 0) + 1; if (G.fpsT >= 2.5) { const fps = G.fpsN / G.fpsT; G.fpsT = 0; G.fpsN = 0; if (G.opt.auto && fps < 48 && G.opt.q > 0.6) { G.opt.q = G.opt.q >= 1 ? 0.8 : 0.6; G.fpsT = -3; applyOpt(); ST.set('opt', G.opt); toast('Qualité réduite pour garder le jeu fluide', 3500); } } }
  FX.update(dt); camera(dt); renderWorld(dt, menu ? V.set(MENU_SPOT[0], 0, MENU_SPOT[2]) : G.cam.tgt);
  if (viaTimer !== true) raf = requestAnimationFrame(frame);
}
// fenêtre cachée : l'image ne se dessine plus, mais le jeu doit continuer (l'hôte relaie tout le monde)
setInterval(() => { if (G.phase !== 'boot' && performance.now() - last > 120) frame(true); }, 50);

// ------------------------------------------------------------------ démarrage
const TIPS = ['Préparation de l\'île', 'Gonflage des montgolfières', 'Lâcher de poissons', 'Polissage des bulles'];
(async function boot() {
  let ti = 0; const tip = setInterval(() => { $('loadtxt').textContent = TIPS[++ti % TIPS.length]; }, 900);
  try {
    $('loadbar').style.width = '30%'; await initWorld(cv); initFx(); $('loadbar').style.width = '75%';
    G.buddy = new Buddy(me.skin, ''); applyOpt(); toMenu(); screen('load'); $('loadbar').style.width = '100%';
    // on laisse le monde se dessiner une fois (compilation des matières) avant de lever le rideau
    frame(true); await new Promise(r => setTimeout(r, 450)); clearInterval(tip); G.fade = 0; last = performance.now(); raf = requestAnimationFrame(frame); screen('menu');
    if (BR) { const majReady = v => { $('ver').textContent = 'Mise à jour ' + v + ' prête'; if (G.phase === 'menu') { toast('Mise à jour installée, le jeu redémarre', 2500); setTimeout(() => BR.relaunch(), 2600); } else toast("Mise à jour prête : elle s'installera au prochain lancement", 5000); };
      BR.onUpdate((what, data) => { if (what === 'progress') $('ver').textContent = 'Mise à jour… ' + data + ' %'; if (what === 'ready') majReady(data); });
      BR.info().then(i => { $('ver').textContent = 'Version ' + i.version; if (i.ready) majReady(i.ready); }); }
  } catch (e) { clearInterval(tip); console.error(e); $('loadtxt').textContent = 'Erreur au chargement : ' + (e && e.message || e); }
})();
