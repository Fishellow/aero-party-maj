// Sons fabriqués en direct (pas de fichiers) : bruitages doux + une ambiance calme faite de cloches et de nappes.
let ctx = null, master = null, musicG = null, sfxG = null, started = false;
export const Audio = { vol: 0.7, music: 0.5 };
function init() {
  if (ctx) return; ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination); sfxG = ctx.createGain(); sfxG.connect(master); musicG = ctx.createGain(); musicG.connect(master); setVol();
}
export function setVol() { if (!ctx) return; sfxG.gain.value = Audio.vol * 0.5; musicG.gain.value = Audio.music * 0.22; }
function tone(f0, f1, dur, type = 'sine', g = 0.5, delay = 0, dest = sfxG) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(g, t + 0.008); a.gain.exponentialRampToValueAtTime(0.0008, t + dur); o.connect(a); a.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}
function bell(f, g = 0.3, delay = 0, dest = sfxG, dur = 1.6) { tone(f, 0, dur, 'sine', g, delay, dest); tone(f * 2.01, 0, dur * 0.6, 'sine', g * 0.35, delay, dest); tone(f * 3.02, 0, dur * 0.3, 'sine', g * 0.15, delay, dest); }
const SFX = {
  jump: () => tone(330, 660, 0.16, 'sine', 0.35), land: () => tone(180, 90, 0.1, 'sine', 0.3), dive: () => tone(520, 240, 0.22, 'triangle', 0.25),
  boing: () => { tone(220, 880, 0.3, 'sine', 0.4); tone(440, 1320, 0.25, 'sine', 0.15, 0.03); }, bump: () => { tone(700, 300, 0.18, 'triangle', 0.35); bell(1046, 0.15); },
  hit: () => { tone(240, 70, 0.28, 'sawtooth', 0.22); tone(900, 200, 0.12, 'square', 0.08); }, tick: () => bell(660, 0.3, 0, sfxG, 0.4), go: () => { bell(880, 0.35); bell(1320, 0.3, 0.07); bell(1760, 0.25, 0.14); },
  tile: () => bell(1568, 0.12, 0, sfxG, 0.35), out: () => { tone(500, 120, 0.6, 'triangle', 0.3); }, splash: () => { tone(900, 150, 0.35, 'sine', 0.25); tone(300, 80, 0.5, 'triangle', 0.2, 0.05); },
  hover: () => tone(1400, 1700, 0.05, 'sine', 0.07), card: () => { tone(200, 900, 0.5, 'sine', 0.2); bell(784, 0.2, 0.35); bell(1174, 0.2, 0.47); },
  pop: () => { tone(520, 820, 0.09, 'sine', 0.12); tone(1040, 1300, 0.06, 'sine', 0.04, 0.02); }, push: () => tone(260, 140, 0.12, 'triangle', 0.22),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => bell(f, 0.3, i * 0.11)), click: () => bell(1174, 0.14, 0, sfxG, 0.25), join: () => { bell(784, 0.2); bell(1174, 0.2, 0.12); }, check: () => { bell(988, 0.22); bell(1480, 0.2, 0.09); },
};
export function sfx(n) { if (!ctx) return; try { SFX[n] && SFX[n](); } catch (e) { } }
// ambiance : accords lents + notes de cloche au hasard sur une gamme douce
const CH = [[261.6, 329.6, 392, 493.9], [220, 277.2, 329.6, 415.3], [174.6, 220, 261.6, 329.6], [196, 246.9, 293.7, 392]], PENTA = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5];
function pad(freqs, t, dur) { for (const f of freqs) for (const d of [-3, 3]) { const o = ctx.createOscillator(), a = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = f / 2; o.detune.value = d; lp.type = 'lowpass'; lp.frequency.value = 700; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.06, t + dur * 0.4); a.gain.linearRampToValueAtTime(0, t + dur); o.connect(lp); lp.connect(a); a.connect(musicG); o.start(t); o.stop(t + dur + 0.1); } }
function loop() { if (!ctx) return; const bar = 6, t = ctx.currentTime + 0.1, i = Math.floor(t / bar) % CH.length; pad(CH[i], t, bar * 1.35); for (let k = 0; k < 5; k++) if (Math.random() < 0.7) bell(PENTA[Math.floor(Math.random() * PENTA.length)], 0.09, 0.1 + k * bar / 5 + Math.random() * 0.4, musicG, 2.4); setTimeout(loop, bar * 1000); }
export function startAudio() { if (started) return; started = true; init(); if (ctx.state === 'suspended') ctx.resume(); loop(); }
