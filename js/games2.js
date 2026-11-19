// La grande fournée de mini-jeux : survie, courses, chasses aux points et micro-jeux de réflexion.
// Chaque jeu est assemblé à partir des mêmes briques (plateformes, barres, bumpers, dalles, bulles, trampolines…).
export function more(A) {
  const { THREE, W, rng, RAINBOW, TAU, backdrop, glassOf, FX, spawn } = A, G = {};
  const ring = (L, n, r, y = 0.2) => { for (let i = 0; i < 16; i++) { const an = i / Math.max(n, 5) * TAU + 0.4; L.spawns.push([Math.cos(an) * r, y, Math.sin(an) * r, Math.atan2(-Math.cos(an), -Math.sin(an))]); } };
  const sky = (L, seed, y = -6) => backdrop(L, seed, { y, r: 62, n: 14, fish: 16, fr: 17, balloons: 4 });
  const LUNE = { grav: 0.42, jump: 0.74 }, GLACE = { slip: 1 };
  const add = (id, nom, aide, type, duree, build) => { G[id] = { nom, aide, type, duree, build }; };
  const lastTramp = (L, x, y, z, s, tint, p) => { const b = L.root.children.length; L.tramp(x, y, z, s, tint, p); return { vis: L.root.children[b], col: L.cols[L.cols.length - 1] }; };

  // ================================================================== SURVIE
  add('sumo', 'Sumo', 'Tout petit plateau. Pousse les autres dehors avec E ou le clic droit.', 'survie', 50, (L, seed, n) => { L.killY = -10; L.cyl(0, 0, 0, 6, { tint: '#ff3b5c', thick: 3 }); ring(L, n, 4.6); sky(L, seed); });
  add('sumoglace', 'Sumo sur Glace', 'Le plateau glisse. Pousse les autres dehors avant de partir en vrille.', 'survie', 50, (L, seed, n) => { L.killY = -10; L.mod = GLACE; L.cyl(0, 0, 0, 7.5, { tint: '#bfefff', thick: 3 }); ring(L, n, 5.6); sky(L, seed); });
  add('sumobumper', 'Sumo Flipper', 'Un petit plateau, un bumper qui rôde, et tes potes qui poussent.', 'survie', 50, (L, seed, n) => { L.killY = -10; L.cyl(0, 0, 0, 7, { tint: '#ffd21f', thick: 3 }); L.bumper(0, 0, 0, 1, '#ff5ac8', t => [Math.cos(t * 0.9) * 3.4 * Math.sin(t * 0.37), Math.sin(t * 0.9) * 3.4]); ring(L, n, 5.6); sky(L, seed); });
  add('manege', 'Manège Infernal', 'Le plateau tourne de plus en plus vite. Saute les barres qui ne bougent pas.', 'survie', 80, (L, seed, n) => {
    L.killY = -10; const w = t => t * (0.45 + Math.min(t, 70) * 0.012); L.cyl(0, 0, 0, 9.5, { tint: '#a04dff', thick: 3, move: t => [0, 0, 0, w(t)] });
    L.bar(0, 0, 0, 9.2, () => 0.6, { tint: '#ffd21f', power: 1.2 }); ring(L, n, 6.5); sky(L, seed); });
  add('retreci', 'Peau de Chagrin', 'Le plateau rétrécit sans arrêt. Reste dessus, pousse les autres.', 'survie', 80, (L, seed, n) => { L.killY = -10; L.cyl(0, 0, 0, 11, { tint: '#3fe26a', thick: 3, rf: t => Math.max(1.6, 11 - t * 0.15) }); L.bumper(0, 0, 0, 0.8, '#ff8a1f', t => [Math.cos(t) * 1.2, Math.sin(t) * 1.2]); ring(L, n, 8); sky(L, seed); });
  const meteors = (L, seed, R0, power = 13) => {
    const N = 26, geo = new THREE.SphereGeometry(1.1, 18, 12), mg = new THREE.CircleGeometry(2.4, 28).rotateX(-Math.PI / 2), slots = [];
    for (let i = 0; i < N; i++) { const b = new THREE.Mesh(geo, glassOf('#ff5a3c')), m = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.4, depthWrite: false })); b.visible = m.visible = false; b.castShadow = true; m.userData.noAO = true; L.root.add(b, m); slots.push({ b, m, k: -1, hit: true }); }
    const IV = 0.55, FALL = 1.25;
    L.ticks.push((t, dt, ctl) => { const k0 = Math.floor((t - FALL) / IV), k1 = Math.floor(t / IV); for (const s of slots) if (s.k < k0 - 1 && s.hit) { s.b.visible = s.m.visible = false; }
      for (let k = Math.max(0, k0); k <= k1; k++) { const cnt = 1 + Math.min(4, Math.floor(k * IV / 14)); for (let j = 0; j < cnt; j++) { const s = slots[(k * 5 + j) % N], R = rng(seed + k * 31 + j * 7), a = R() * TAU, d = Math.sqrt(R()) * R0, x = Math.cos(a) * d, z = Math.sin(a) * d, u = (t - k * IV) / FALL;
        if (s.k !== k * 8 + j) { s.k = k * 8 + j; s.hit = false; }
        if (u < 1) { s.b.visible = s.m.visible = true; s.b.position.set(x, 16 * (1 - u) + 1, z); s.m.position.set(x, 0.04, z); s.m.scale.setScalar(0.3 + u * 0.7); s.m.material.opacity = 0.2 + u * 0.4; }
        else if (!s.hit) { s.hit = true; s.b.visible = s.m.visible = false; FX.spark({ x, y: 0.5, z }, '#ff8a3c', 22, 1.3); FX.ring({ x, y: 0, z }, '#ffffff', 8); if (ctl) { const dx = ctl.pos.x - x, dz = ctl.pos.z - z, dd = Math.hypot(dx, dz); if (dd < 2.6 && ctl.pos.y < 2.5) { ctl.knock(dx / (dd || 1) * power, 8, dz / (dd || 1) * power, 0.6); } } } } } });
  };
  add('meteores', 'Pluie de Météores', 'Des boules tombent du ciel. Sors des cercles rouges avant l\'impact.', 'survie', 80, (L, seed, n) => { L.killY = -10; L.cyl(0, 0, 0, 10, { tint: '#ff8a1f', thick: 3 }); meteors(L, seed, 9.2); ring(L, n, 6.5); sky(L, seed); });
  add('meteoresglace', 'Météores Givrés', 'Des boules tombent du ciel, et en plus ça glisse.', 'survie', 80, (L, seed, n) => { L.killY = -10; L.mod = GLACE; L.cyl(0, 0, 0, 11, { tint: '#bfefff', thick: 3 }); meteors(L, seed, 10, 10); ring(L, n, 6.5); sky(L, seed); });
  const hexes = (L, N, y, tint, touch) => { const Rr = 1.53, out = []; for (let q = -N; q <= N; q++) for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) { const T = L.tile(1.5 * Rr * q, y, Math.sqrt(3) * Rr * (r + q / 2), typeof tint === 'function' ? tint(q, r) : tint, touch); T.ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); out.push(T); } return out; };
  add('anneaux', 'Dernier Cercle', 'Le sol tombe anneau par anneau, de l\'extérieur vers le centre.', 'survie', 75, (L, seed, n, hooks) => { L.killY = -10; const N = 5, ts = hexes(L, N, 0, (q, r) => RAINBOW[Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) % 8], () => { });
    L.ticks.push(t => { const gone = N - Math.floor(Math.max(0, t - 6) / 9); for (const T of ts) if (T.ring > gone) L.killTile(T.i); }); L.bumper(0, 0, 0, 0.9, '#ffd21f', t => [Math.cos(t * 0.8) * 4, Math.sin(t * 1.1) * 4]); ring(L, n, 9); sky(L, seed); });
  add('dallesexpress', 'Dalles Express', 'Un seul étage, et chaque dalle touchée disparaît. Ça va très vite.', 'survie', 60, (L, seed, n, hooks) => { L.killY = -8; hexes(L, 5, 0, '#ffd21f', i => hooks.tile(i)); ring(L, n, 8); sky(L, seed); });
  add('dallesflipper', 'Dalles Flipper', 'Les dalles disparaissent, et des bumpers te projettent où ils veulent.', 'survie', 90, (L, seed, n, hooks) => { L.killY = -18; hexes(L, 4, 0, '#a04dff', i => hooks.tile(i)); hexes(L, 4, -7, '#19c7ff', i => hooks.tile(i));
    for (let i = 0; i < 4; i++) { const ph = i * 1.57; L.bumper(0, 0.1, 0, 0.9, RAINBOW[i * 2], t => [Math.cos(t * 0.7 + ph) * 5.5, Math.sin(t * 0.7 + ph) * 5.5]); } ring(L, n, 7); sky(L, seed, -10); });
  add('triplebarre', 'Triple Barre', 'Trois barres, trois vitesses. Saute au bon moment.', 'survie', 90, (L, seed, n) => { L.killY = -12; L.cyl(0, 0, 0, 10, { tint: '#19c7ff', thick: 3 }); const sp = (a, b) => t => (a + Math.min(t, 70) * b) * t;
    L.bar(0, 0, 0, 9.6, sp(1.0, 0.012), { tint: '#ff3b5c', power: 1.25 }); const b2 = L.bar(0, 0, 0, 9.6, t => -sp(0.75, 0.01)(t) + 1, { tint: '#ffd21f', power: 1.25 }); b2.node.parent.scale.set(0.8, 1.14, 0.8); b2.node.scale.set(9.6 / 0.8, 1 / 1.14, 1 / 0.8);
    const b3 = L.bar(0, 0, 0, 9.6, t => sp(0.5, 0.008)(t) + 2.4, { tint: '#3fe26a', power: 1.25 }); b3.node.parent.scale.set(0.62, 1.28, 0.62); b3.node.scale.set(9.6 / 0.62, 1 / 1.28, 1 / 0.62); ring(L, n, 6.5); sky(L, seed); });
  add('barreslune', 'Barres Lunaires', 'Gravité de la Lune : tes sauts durent une éternité. Vise bien.', 'survie', 90, (L, seed, n) => { L.killY = -12; L.mod = LUNE; L.cyl(0, 0, 0, 10, { tint: '#c9d6e6', thick: 3 }); L.bar(0, 0, 0, 9.6, t => t * (1.3 + Math.min(t, 70) * 0.02), { tint: '#a04dff', power: 1.1 }); const b = L.bar(0, 0, 0, 9.6, t => -t * (1.0 + Math.min(t, 70) * 0.015) + 1.3, { tint: '#19c7ff', power: 1.1 }); b.node.parent.scale.set(0.8, 1.14, 0.8); b.node.scale.set(9.6 / 0.8, 1 / 1.14, 1 / 0.8); ring(L, n, 6.5); sky(L, seed); });
  add('trampos', 'Trampolines Fous', 'Que des trampolines au-dessus de l\'eau, et ils disparaissent un par un.', 'survie', 75, (L, seed, n) => { L.killY = -9; const R = rng(seed), ts = [];
    for (let i = 0; i < 16; i++) { const x = (i % 4 - 1.5) * 4.6, z = (Math.floor(i / 4) - 1.5) * 4.6; ts.push(lastTramp(L, x, 0, z, 1.75, RAINBOW[i % 8], 12.5)); L.spawns.push([x, 0.6, z, 0]); }
    const order = ts.map((_, i) => i).sort(() => R() - 0.5); L.ticks.push(t => { const gone = Math.min(14, Math.floor(Math.max(0, t - 7) / 4.2)); for (let i = 0; i < gone; i++) { const T = ts[order[i]]; if (T.col.on) { T.col.on = false; T.vis.visible = false; FX.spark({ x: T.col.x, y: 0.3, z: T.col.z }, '#ffffff', 12, 0.8); } } const nx = ts[order[gone]]; if (nx && nx.col.on && gone < 14) nx.vis.rotation.z = Math.sin(t * 40) * 0.05 * (((t - 7) / 4.2) % 1 > 0.6 ? 1 : 0); }); sky(L, seed); });
  add('vent', 'Coup de Vent', 'Le vent change de sens et forcit. Reste sur le plateau.', 'survie', 80, (L, seed, n, hooks) => { L.killY = -10; L.cyl(0, 0, 0, 9.5, { tint: '#19c7ff', thick: 3 }); L.wind = [0, 0]; let seen = -1;
    L.ticks.push(t => { const k = Math.floor(t / 5), u = t - k * 5, a = rng(seed + k * 97)() * TAU, s = Math.min(19, 8 + k * 1.5) * Math.min(1, u / 1.2) * (u > 4.3 ? (5 - u) / 0.7 : 1); L.wind[0] = Math.cos(a) * s; L.wind[1] = Math.sin(a) * s;
      if (k !== seen && t > 0.01) { seen = k; hooks.say && hooks.say('Coup de vent !', '#19a4ff', 1.1); } for (let i = 0; i < 3; i++) FX.streak((Math.random() - 0.5) * 26, 0.4 + Math.random() * 3, (Math.random() - 0.5) * 26, L.wind[0] * 1.3, L.wind[1] * 1.3); }); ring(L, n, 4); sky(L, seed); });
  add('billescroisees', 'Carrefour de Billes', 'Les billes arrivent de deux côtés à la fois.', 'survie', 90, (L, seed, n) => { L.killY = -12; const R = rng(seed), sp = t => t * (1 + Math.min(t, 80) * 0.01); L.box(0, 0, 0, 21, 21, { tint: '#ff5ac8', thick: 3 });
    for (let i = 0; i < 6; i++) { const lane = -8 + i * 3.2, dir = i % 2 ? 1 : -1, v = 4 + R() * 3, ph = R() * 30; L.bumper(0, 0, lane, 1.1, RAINBOW[i], t => [dir * (-15 + ((sp(t) * v + ph) % 30)), lane]); const v2 = 4 + R() * 3, ph2 = R() * 30; L.bumper(lane, 0, 0, 1.1, RAINBOW[i + 2], t => [lane, dir * (-15 + ((sp(t) * v2 + ph2) % 30))]); }
    for (let i = 0; i < 16; i++) L.spawns.push([-6.4 + (i % 4) * 4.3, 0.2, -6.4 + Math.floor(i / 4) * 4.3 + 1.6, 0]); sky(L, seed); });
  add('flipperglace', 'Flipper Givré', 'Le flipper géant, mais sur la glace.', 'survie', 90, (L, seed, n) => { L.killY = -12; L.mod = GLACE; L.cyl(0, 0, 0, 11, { tint: '#bfefff', thick: 3 }); const R = rng(seed);
    for (let i = 0; i < 6; i++) { const rad = 3 + (i % 3) * 2.6, w = (0.4 + R() * 0.4) * (i % 2 ? -1 : 1), ph = R() * TAU; L.bumper(rad, 0, 0, 1, RAINBOW[i], t => [Math.cos(ph + t * w) * rad, Math.sin(ph + t * w) * rad]); } ring(L, n, 9.2); sky(L, seed); });

  // ================================================================== MICRO-JEUX DE RÉFLEXION (quiz express)
  function sign() { const c = document.createElement('canvas'); c.width = 512; c.height = 224; const x = c.getContext('2d'), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return { tex, draw(txt, col) { x.clearRect(0, 0, 512, 224); const g = x.createLinearGradient(0, 0, 0, 224); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#dff4ff'); g.addColorStop(0.51, '#bfe6ff'); g.addColorStop(1, '#f2fbff'); x.fillStyle = g; x.beginPath(); x.roundRect(6, 6, 500, 212, 44); x.fill(); x.lineWidth = 10; x.strokeStyle = '#0a63d8'; x.stroke();
      x.font = 'italic 800 ' + (String(txt).length > 5 ? 84 : 132) + 'px "Segoe UI", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = col || '#06346e'; x.fillText(txt, 256, 118, 470); tex.needsUpdate = true; } }; }
  const NOMS = [['ROUGE', '#ff3b5c'], ['JAUNE', '#e0b000'], ['VERT', '#2fbf4f'], ['BLEU', '#1987ff'], ['ROSE', '#ff5ac8'], ['VIOLET', '#8a3dff']];
  const shuffle = (a, R) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const options = (ok, R, spread) => { const s = new Set([ok]); let guard = 0; while (s.size < 4 && guard++ < 200) { const v = ok + Math.round((R() - 0.5) * 2 * spread); if (v >= 0) s.add(v); } let v = ok + 1; while (s.size < 4) s.add(v++); const arr = shuffle([...s], R); return { labels: arr.map(String), ok: arr.indexOf(ok) }; };
  const QUIZ = {
    calcul: (R, k) => { const hard = k > 3, a = 2 + Math.floor(R() * (hard ? 12 : 8)), b = 2 + Math.floor(R() * (hard ? 9 : 7)), mul = hard && R() < 0.5, o = options(mul ? a * b : a + b, R, mul ? 12 : 6); return { q: a + (mul ? ' × ' : ' + ') + b + ' = ?', ...o }; },
    grand: (R, k) => { const s = new Set(); while (s.size < 4) s.add(Math.floor(R() * (k > 3 ? 900 : 99)) + 1); const a = [...s]; return { q: 'Le plus GRAND', labels: a.map(String), ok: a.indexOf(Math.max(...a)) }; },
    petit: (R, k) => { const s = new Set(); while (s.size < 4) s.add(Math.floor(R() * (k > 3 ? 900 : 99)) + 1); const a = [...s]; return { q: 'Le plus PETIT', labels: a.map(String), ok: a.indexOf(Math.min(...a)) }; },
    poissons: (R, k) => { const nb = 3 + Math.floor(R() * (k > 2 ? 8 : 5)), o = options(nb, R, 3); return { q: 'Combien de poissons ?', fish: nb, ...o }; },
    encre: (R) => { const ink = Math.floor(R() * 4); let word = Math.floor(R() * 4); if (word === ink) word = (word + 1) % 4; const idx = shuffle([0, 1, 2, 3], R); return { q: NOMS[word][0], color: NOMS[ink][1], labels: idx.map(i => NOMS[i][0]), cols: idx.map(i => '#06346e'), ok: idx.indexOf(ink) }; },
    pair: (R, k) => { const odd = k % 2 === 1, good = (1 + Math.floor(R() * 40)) * 2 + (odd ? 1 : 0), s = new Set(); while (s.size < 3) s.add((1 + Math.floor(R() * 40)) * 2 + (odd ? 0 : 1)); const a = shuffle([good, ...s], R); return { q: odd ? 'Le nombre IMPAIR' : 'Le nombre PAIR', labels: a.map(String), ok: a.indexOf(good) }; },
    suite: (R) => { const st = 1 + Math.floor(R() * 9), d = 2 + Math.floor(R() * 6), o = options(st + 3 * d, R, 5); return { q: st + ', ' + (st + d) + ', ' + (st + 2 * d) + ', ?', ...o }; },
    intrus: (R) => { const pairs = [['bd', 'db'], ['OQ', 'QO'], ['pq', 'qp'], ['MW', 'WM'], ['69', '96'], ['un', 'nu'], ['EF', 'FE']], p = pairs[Math.floor(R() * pairs.length)], ok = Math.floor(R() * 4); return { q: 'Trouve l\'intrus', labels: [0, 1, 2, 3].map(i => i === ok ? p[1] : p[0]), ok }; },
  };
  function quiz(kind) { return (L, seed, n, hooks) => {
    L.killY = -9; const hub = L.cyl(0, 0, 0, 5, { tint: '#19c7ff', thick: 2 }), pads = [], fish = [];
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * 8.1, z = Math.sin(a) * 8.1, c = L.cyl(x, 0, z, 2.7, { tint: RAINBOW[i * 2], thick: 1.6 }), s = sign(), m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.58), new THREE.MeshBasicMaterial({ map: s.tex, transparent: true, side: THREE.DoubleSide }));
      m.position.set(x * 1.3, 2.6, z * 1.3); m.rotation.y = Math.atan2(-x, -z); m.userData.noAO = true; L.root.add(m); const flat = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), m.material); flat.rotation.x = -Math.PI / 2; flat.rotation.z = Math.atan2(-x, -z); flat.position.set(x, 0.03, z); flat.userData.noAO = true; L.root.add(flat); pads.push({ c, s, m, flat, k: 0 }); }
    if (kind === 'poissons') for (let i = 0; i < 11; i++) { const f = spawn('poisson', { parent: L.root, scale: 1.5, tint: RAINBOW[i % 8], only: ['poisson_a'] }); f.visible = false; fish.push(f); }
    let seen = -1, q = null, hk = 0;
    L.ticks.push((t, dt) => { const D = 7.6, nC = Math.floor(t / D), ph = t - nC * D, warn = Math.max(2.5, 4.7 - nC * 0.22), drop = t > 0.01 && ph > warn && ph < D - 1.0;
      if (nC !== seen && t > 0.01) { seen = nC; q = QUIZ[kind](rng(seed + nC * 131), nC); pads.forEach((p, i) => p.s.draw(q.labels[i], q.cols && q.cols[i])); hooks.say && hooks.say(q.q, q.color || '#0a55c8', warn); }
      if (!q) return; fish.forEach((f, i) => { f.visible = i < (q.fish || 0) && ph < warn; if (f.visible) { const a = i * 2.4 + t * (0.5 + (i % 3) * 0.2) * (i % 2 ? 1 : -1), r = 2 + (i % 4) * 0.9; f.position.set(Math.cos(a) * r, 3 + (i % 5) * 0.75, Math.sin(a) * r); f.rotation.y = -a - (i % 2 ? 1 : -1) * Math.PI / 2; } });
      hk += ((drop ? 1 : 0) - hk) * Math.min(1, dt * (drop ? 9 : 5)); hub.on = hk < 0.35; hub.vis.position.y = -hk * hk * 9; hub.vis.visible = hk < 0.97;
      pads.forEach((p, i) => { const down = drop && i !== q.ok; p.k += ((down ? 1 : 0) - p.k) * Math.min(1, dt * (down ? 9 : 5)); p.c.on = p.k < 0.35; p.c.vis.position.y = -p.k * p.k * 9; p.c.vis.visible = p.flat.visible = p.k < 0.97; p.flat.position.y = 0.03 - p.k * p.k * 9; if (!drop && ph > warn - 0.9 && ph < warn) { hub.vis.position.y = Math.sin(t * 50) * 0.04; if (i !== q.ok) p.c.vis.position.y = Math.sin(t * 50 + i) * 0.04; } }); });
    ring(L, n, 3.4); sky(L, seed); }; }
  add('calcul', 'Calcul Express', 'Une opération s\'affiche. Cours sur la bonne réponse, les autres plateformes tombent.', 'survie', 90, quiz('calcul'));
  add('plusgrand', 'Le Plus Grand', 'Quatre nombres. Va sur le plus grand avant que le reste tombe.', 'survie', 90, quiz('grand'));
  add('pluspetit', 'Le Plus Petit', 'Quatre nombres. Va sur le plus petit avant que le reste tombe.', 'survie', 90, quiz('petit'));
  add('comptepoissons', 'Compte les Poissons', 'Compte les poissons qui tournent, puis file sur le bon chiffre.', 'survie', 90, quiz('poissons'));
  add('encre', 'Piège à Couleurs', 'Un mot s\'affiche. Va sur la couleur de l\'ENCRE, pas sur ce que le mot dit.', 'survie', 90, quiz('encre'));
  add('pairimpair', 'Pair ou Impair', 'Trouve le seul nombre pair, puis le seul impair, et ainsi de suite.', 'survie', 90, quiz('pair'));
  add('suite', 'Suite Logique', 'Trouve le nombre qui continue la suite.', 'survie', 90, quiz('suite'));
  add('intrus', 'L\'Intrus', 'Trois panneaux identiques, un différent. Trouve l\'intrus.', 'survie', 90, quiz('intrus'));

  // ================================================================== COURSES (assemblées par tronçons)
  function course(segs, o = {}) { return (L, seed, n, hooks) => {
    let z = 0, y = 0, ci = 0, minY = 0; const C = () => RAINBOW[(ci++) % 8]; if (o.mod) L.mod = o.mod; L.fall = 11;
    L.box(0, 0, 0, 16, 10, { tint: C() }); for (let i = 0; i < 16; i++) L.spawns.push([-5.6 + (i % 8) * 1.6, 0.1, -3 + Math.floor(i / 8) * 1.8, 0]);
    L.gate('DÉPART', 0, 0, 4.2, { scale: 1.22, tint: '#19c7ff', only: ['orbe', 'bande'] }); L.rail(-8, -5, 8, -5, 0); z = 5;
    const flat = (len, w = 12) => { z += 1.4; L.box(0, y, z + len / 2, w, len, { tint: C() }); L.checks.push([0, y + 0.1, z + Math.min(3, len / 2), z + 0.6]); z += len; };
    for (const [k, a, b] of segs) {
      if (k === 'plat') flat(a || 7, b);
      else if (k === 'trous') for (let i = 0; i < a; i++) { z += 1.5; for (const sx of [-1, 1]) L.cyl(sx * (3.2 + (i % 2)), y, z + 2.4, 2.4, { tint: C() }); z += 4.8; }
      else if (k === 'zigzag') for (let i = 0; i < a; i++) { z += 1.3; L.cyl((i % 2 ? 1 : -1) * 3.4, y, z + 2.2, 2.2, { tint: C() }); z += 4.4; }
      else if (k === 'barre') { z += 1.4; const zz = z + 5.5, yy = y, w = (a || 2) * (ci % 2 ? 1 : -1); L.cyl(0, yy, zz, 5.5, { tint: C() }); L.bar(0, yy, zz, 5.2, t => t * w, { tint: C() }); z += 11; }
      else if (k === 'mobiles') for (let i = 0; i < a; i++) { z += 1.4; const zz = z + 2.2, yy = y, ph = i * 2.1; L.box(0, yy, zz, 4.6, 4.4, { tint: C(), move: t => [Math.sin(t * 1.1 + ph) * 4.2, yy, zz] }); z += 4.4; }
      else if (k === 'bumpers') { z += 1.4; L.box(0, y, z + 6, 13, 12, { tint: C() }); const R = rng(seed + (z | 0)); for (let i = 0; i < (a || 6); i++) L.bumper((R() - 0.5) * 10, y, z + 1.5 + R() * 9, 0.9 + R() * 0.4, C()); z += 12; }
      else if (k === 'tramp') { z += 1.3; for (const sx of [-2.6, 2.6]) L.tramp(sx, y, z + 1.6, 1.6, C(), 19); z += 6.4; y += 5; L.box(0, y, z + 3.5, 11, 7, { tint: C() }); L.checks.push([0, y + 0.1, z + 3, z + 0.6]); z += 7; }
      else if (k === 'pont') { z += 1.2; const len = a || 12, yy = y, zz = z + len / 2; L.box(0, yy, zz, 2, len, { tint: C() }); if (b) { L.bar(3.6, yy, zz - len / 4, 4.2, t => t * 2.1, { tint: C(), s: 0.8 }); L.bar(-3.6, yy, zz + len / 4, 4.2, t => -t * 2.3, { tint: C(), s: 0.8 }); } z += len; }
      else if (k === 'escalier') for (let i = 0; i < a; i++) { z += 1.0; y += 1.15; L.box(0, y, z + 1.6, 7, 3.2, { tint: C() }); z += 3.2; }
      else if (k === 'descente') for (let i = 0; i < a; i++) { z += 1.6; y -= 1.3; L.cyl((i % 2 ? 1 : -1) * 2.2, y, z + 2.2, 2.3, { tint: C() }); z += 4.4; }
      else if (k === 'dalles') { z += 1.5; for (let i = 0; i < a; i++) for (const x of [-2.7, 0, 2.7]) L.tile(x + (i % 2 ? 1.35 : 0), y, z + 1.3 + i * 2.35, '#19c7ff', i2 => hooks.tile(i2)); z += a * 2.35 + 0.6; }
      else if (k === 'verre') { z += 1.5; const R = rng(seed + 77); for (let i = 0; i < a; i++) { const good = R() < 0.5 ? -1 : 1; for (const sx of [-1, 1]) L.tile(sx * 1.7, y, z + 1.3 + i * 2.75, '#bfefff', sx === good ? () => { } : i2 => hooks.tile(i2)); } z += a * 2.75 + 0.3; }
      else if (k === 'tapis') for (let i = 0; i < a; i++) { z += 1.2; L.tramp(i % 2 ? 1.6 : -1.6, y, z + 1.5, 1.5, C(), 13.5); z += 4.3; }
      minY = Math.min(minY, y);
    }
    z += 1.5; L.box(0, y, z + 6, 16, 12, { tint: '#ffd21f' }); L.gate('ARRIVÉE', 0, y, z + 2.6, { scale: 1.22, tint: '#ffd21f', only: ['orbe', 'bande'], c1: '#ffd21f', c2: '#ff8a1f' }); L.deco('podium', 0, y, z + 9, { rot: Math.PI }); L.rail(-8, z + 12, 8, z + 12, y);
    L.finishZ = z + 3.4; L.finishY = y - 0.5; L.killY = minY - 14; if (o.after) o.after(L, seed, hooks, z);
    backdrop(L, seed, { cz: z / 2, y: y / 2, r: 80, n: 16, fish: 12, fr: 20, balloons: 4 }); }; }
  add('sprint', 'Sprint Éclair', 'Tout droit, très court, deux barres. Le plus rapide gagne.', 'course', 60, course([['plat', 8], ['barre', 2.2], ['trous', 2], ['barre', 2.6], ['plat', 6]]));
  add('zigzag', 'Zigzag', 'Des petites plateformes en quinconce. Un saut raté et tu recommences.', 'course', 90, course([['zigzag', 5], ['plat', 6], ['zigzag', 7], ['plat', 5], ['mobiles', 3]]));
  add('pontverre', 'Pont de Verre', 'Deux dalles à chaque pas : une seule tient. Regarde où les autres tombent.', 'course', 120, course([['plat', 5], ['verre', 9], ['plat', 5], ['verre', 7]]));
  add('escalier', 'Escalier Géant', 'Ça grimpe, ça grimpe, puis des trampolines, puis ça grimpe encore.', 'course', 120, course([['escalier', 8], ['plat', 5], ['tramp'], ['escalier', 6], ['barre', 2], ['tramp']]));
  add('toboggan', 'La Grande Descente', 'Une cascade de plateformes vers le bas, avec des bumpers en chemin.', 'course', 120, course([['descente', 6], ['bumpers', 7], ['descente', 6], ['plat', 5], ['descente', 5]]));
  add('tapis', 'Tapis de Trampolines', 'Rebondis de trampoline en trampoline sans jamais toucher le sol.', 'course', 120, course([['tapis', 6], ['plat', 5], ['tapis', 8], ['plat', 5], ['tapis', 5]]));
  add('couloir', 'Couloir des Barres', 'Quatre barres à la suite. Bon courage.', 'course', 120, course([['barre', 1.8], ['barre', 2.2], ['plat', 5], ['barre', 2.6], ['barre', 3]]));
  add('patinoire', 'Patinoire', 'Une course sur la glace : impossible de s\'arrêter net.', 'course', 120, course([['plat', 10], ['trous', 3], ['plat', 8, 7], ['mobiles', 3], ['pont', 12], ['bumpers', 5]], { mod: GLACE }));
  add('lune', 'Course Lunaire', 'Gravité de la Lune : des sauts énormes, des trous énormes.', 'course', 120, course([['trous', 3], ['plat', 5], ['zigzag', 5], ['tramp'], ['descente', 5], ['barre', 1.6]], { mod: LUNE }));
  add('funambule', 'Funambule', 'Des ponts très étroits, balayés par des barres.', 'course', 120, course([['pont', 12], ['plat', 5], ['pont', 16, 1], ['plat', 5], ['dalles', 6], ['pont', 12, 1]]));
  add('feurouge', 'Feu Rouge, Feu Vert', 'Avance au feu vert. Si tu bouges au feu rouge, retour au départ.', 'course', 120, course([['plat', 62, 14]], { after: (L, seed, hooks) => { let seen = -1; const R = rng(seed), sw = [0]; let tt = 0, g = true; while (tt < 200) { tt += g ? 1.8 + R() * 2.6 : 1.4 + R() * 1.6; sw.push(tt); g = !g; }
    L.ticks.push((t, dt, ctl) => { let k = 0; while (k < sw.length - 1 && t >= sw[k + 1]) k++; const red = k % 2 === 1, since = t - sw[k]; if (k !== seen && t > 0.01) { seen = k; hooks.say && hooks.say(red ? 'STOP !' : 'FONCE !', red ? '#ff2a2a' : '#2fbf4f', red ? sw[k + 1] - sw[k] : 0.9); }
      if (red && since > 0.45 && ctl && ctl.pos.z > 5.5 && ctl.pos.z < L.finishZ - 1 && Math.hypot(ctl.vel.x, ctl.vel.z) > 1.3) L.sendBack = true; }); } }));

  // ================================================================== CHASSES AUX POINTS
  add('peinture', 'Guerre de Peinture', 'Chaque dalle touchée prend ta couleur. Le plus de dalles à la fin gagne.', 'points', 45, (L, seed, n) => { L.killY = -10; const N = 7, S = 3.05, cells = [];
    for (let i = 0; i < N * N; i++) { const x = (i % N - (N - 1) / 2) * S, z = (Math.floor(i / N) - (N - 1) / 2) * S, c = L.box(x, 0, z, S - 0.1, S - 0.1, { tint: '#dfeaf7', thick: 1.2 }); c.touch = () => { L.onPaint && L.onPaint(i); }; c.vis.traverse(m => { if (m.isMesh && m.material.name === 'verre') m.material = glassOf('#f2f6fb'); }); cells.push(c); }
    L.paint = (i, col) => { const c = cells[i]; if (!c) return; c.vis.traverse(m => { if (m.isMesh && m.material.name === 'verre') m.material = glassOf(col); }); FX.spark({ x: c.x, y: 0.3, z: c.z }, col, 5, 0.5); }; L.paintN = N * N; L.cellAt = i => cells[i];
    L.bar(0, 0, 0, 10, t => t * 0.8, { tint: '#ffd21f', power: 0.8 }); for (let i = 0; i < 16; i++) L.spawns.push([(i % 4 - 1.5) * S * 2 + S / 2, 0.2, (Math.floor(i / 4) - 1.5) * S * 2 + S / 2, 0]); sky(L, seed); });
  const orbsOn = (L, seed, nb, place, gap = 0.6) => { const R = rng(seed + 5); for (let i = 0; i < nb; i++) { const p = place(R, i); L.orb(p[0], p[1], p[2], i < 6 ? 0 : (i - 5) * gap, p[3]); } };
  add('bulleslune', 'Bulles Lunaires', 'Gravité de la Lune : saute très haut pour attraper les bulles.', 'points', 45, (L, seed, n) => { L.killY = -12; L.mod = LUNE; L.cyl(0, 0, 0, 12, { tint: '#c9d6e6', thick: 3 }); orbsOn(L, seed, 70, R => { const a = R() * TAU, d = Math.sqrt(R()) * 10.5; return [Math.cos(a) * d, 1 + R() * 7.5, Math.sin(a) * d]; }); ring(L, n, 9.5); sky(L, seed); });
  add('pluiebulles', 'Pluie de Bulles', 'Les bulles tombent du ciel. Sois dessous au bon moment.', 'points', 45, (L, seed, n) => { L.killY = -12; L.cyl(0, 0, 0, 12, { tint: '#19c7ff', thick: 3 }); orbsOn(L, seed, 90, R => { const a = R() * TAU, d = Math.sqrt(R()) * 10.5; return [Math.cos(a) * d, 0.9, Math.sin(a) * d, 18]; }, 0.45); ring(L, n, 9.5); sky(L, seed); });
  add('bullesmanege', 'Bulles au Manège', 'Le plateau tourne, les bulles non. Cours à contresens.', 'points', 45, (L, seed, n) => { L.killY = -12; L.cyl(0, 0, 0, 12, { tint: '#ff5ac8', thick: 3, move: t => [0, 0, 0, t * 1.1] }); orbsOn(L, seed, 70, R => { const a = R() * TAU, d = 2 + Math.sqrt(R()) * 9; return [Math.cos(a) * d, 0.9 + (R() < 0.3 ? 1.5 : 0), Math.sin(a) * d]; }); ring(L, n, 9.5); sky(L, seed); });
  add('bullesbilles', 'Bulles et Billes', 'Ramasse les bulles pendant que des billes géantes traversent le plateau.', 'points', 45, (L, seed, n) => { L.killY = -12; const R = rng(seed); L.box(0, 0, 0, 24, 17, { tint: '#ffd21f', thick: 3 });
    for (let i = 0; i < 6; i++) { const lane = -6.5 + i * 2.6, dir = i % 2 ? 1 : -1, v = 4.5 + R() * 3, ph = R() * 34; L.bumper(0, 0, lane, 1.15, RAINBOW[i], t => [dir * (-17 + ((t * v + ph) % 34)), lane]); }
    orbsOn(L, seed, 70, R2 => [(R2() - 0.5) * 21, 0.9, (R2() - 0.5) * 14]); for (let i = 0; i < 16; i++) L.spawns.push([-9 + (i % 8) * 2.6, 0.2, i < 8 ? -7.4 : 7.4, 0]); sky(L, seed); });
  add('bullestramp', 'Bulles Rebond', 'Les bulles sont très haut. Les trampolines sont là pour ça.', 'points', 45, (L, seed, n) => { L.killY = -12; L.cyl(0, 0, 0, 12.5, { tint: '#3fe26a', thick: 3 }); const T = []; for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, d = i === 6 ? 0 : 7; T.push([Math.cos(a) * d, Math.sin(a) * d]); L.tramp(T[i][0], 0, T[i][1], 1.6, RAINBOW[i], 15 + (i % 3) * 3); }
    orbsOn(L, seed, 70, R => { const p = T[Math.floor(R() * 7)]; return [p[0] + (R() - 0.5) * 2.4, 3 + R() * 6, p[1] + (R() - 0.5) * 2.4]; }); ring(L, n, 10.5); sky(L, seed); });
  const hill = (L, seed, R0, zr, fx, fz) => { const ph = rng(seed)() * 9, at = t => [fx(t + ph), fz(t + ph), typeof zr === 'function' ? zr(t) : zr];
    const pad = L.deco('plot', 0, 0.02, 0, { scale: 1.55 }), rg = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.9, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 0.25), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })); rg.userData.noAO = true; L.root.add(rg);
    L.zoneAt = at; L.ticks.push(t => { const z = at(t); pad.position.set(z[0], 0.02, z[1]); pad.scale.set(z[2] * 0.57, 1, z[2] * 0.57); rg.position.set(z[0], 0.47, z[1]); rg.scale.set(z[2], 1, z[2]); rg.material.opacity = 0.3 + Math.sin(t * 5) * 0.1; pad.rotation.y = t; }); };
  add('collineglace', 'Colline Verglacée', 'Reste dans le cercle doré, sur la glace. Bon courage.', 'points', 60, (L, seed, n) => { L.killY = -12; L.mod = GLACE; L.cyl(0, 0, 0, 12, { tint: '#bfefff', thick: 3 }); hill(L, seed, 12, 3.2, t => 6.4 * Math.sin(t * 0.27), t => 6.4 * Math.sin(t * 0.21 + 1.3)); ring(L, n, 10); sky(L, seed); });
  add('collinefolle', 'Colline Folle', 'Le cercle doré file à toute vitesse entre les bumpers.', 'points', 60, (L, seed, n) => { L.killY = -12; L.cyl(0, 0, 0, 12, { tint: '#ff8a1f', thick: 3 }); hill(L, seed, 12, 2.6, t => 7.5 * Math.sin(t * 0.62), t => 7.5 * Math.sin(t * 0.47 + 1.3));
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; L.bumper(Math.cos(a) * 5, 0, Math.sin(a) * 5, 1, RAINBOW[i * 2]); } ring(L, n, 10); sky(L, seed); });
  add('collinemini', 'Colline Minuscule', 'Le cercle doré rétrécit jusqu\'à ne plus tenir qu\'un seul joueur.', 'points', 60, (L, seed, n) => { L.killY = -12; L.cyl(0, 0, 0, 11, { tint: '#a04dff', thick: 3 }); hill(L, seed, 11, t => Math.max(1.1, 4.2 - t * 0.055), t => 5.5 * Math.sin(t * 0.3), t => 5.5 * Math.sin(t * 0.22 + 1.3)); ring(L, n, 9.4); sky(L, seed); });
  return G;
}
