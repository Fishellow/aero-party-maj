// Parties en ligne : un joueur héberge, les autres le rejoignent avec un code. Tout passe par l'hôte.
// XPeer (lib/xpeer.js) ouvre la liaison directe entre joueurs, avec un chemin de secours.
const GUEST_MAY = new Set(['hi', 'me', 's', 'tile', 'fin', 'out', 'orb']);
export const Net = {
  peer: null, isHost: false, online: false, code: '', myId: 'h', conns: new Map(), hostConn: null, offset: 0, rtt: 1e9, handlers: {}, seq: 0, timer: null,
  now() { return performance.now() + this.offset; },
  on(t, f) { this.handlers[t] = f; },
  emit(m, from) { const f = this.handlers[m.t]; if (f) try { f(m, from); } catch (e) { console.error(e); } },
  host(code) {
    this.close(); this.isHost = true; this.myId = 'h'; this.code = code; this.offset = 0;
    return new Promise((ok, ko) => {
      const p = this.peer = new XPeer('aero-' + code); let done = false;
      p.on('open', () => { if (done) return; done = true; this.online = true; ok(); });
      p.on('error', e => { if (done) return; done = true; ko(e); });
      // un invité qui ne donne plus de nouvelles pendant 9 s est considéré comme parti
      this.timer = setInterval(() => { const n = performance.now(); for (const [id, c] of this.conns) if (n - c.last > 9000) { this.conns.delete(id); this.emit({ t: '_left' }, id); try { c.close(); } catch (e) { } } else if (c.open) c.send({ t: 'hb' }); }, 2000);
      p.on('connection', c => {
        const id = 'p' + (++this.seq); c.on('open', () => { if (this.conns.size >= 15) { c.send({ t: 'full' }); return setTimeout(() => c.close(), 300); } this.conns.set(id, c); c.last = performance.now(); c.send({ t: 'you', id }); });
        const gone = () => { if (this.conns.get(id) === c) { this.conns.delete(id); this.emit({ t: '_left' }, id); try { c.close(); } catch (e) { } } };
        c.on('data', m => { if (!m || !m.t) return; c.last = performance.now(); if (m.t === 'bye') return gone(); if (m.t === 'pg') return c.send({ t: 'pn', c: m.c, h: performance.now() }); if (this.conns.get(id) === c && GUEST_MAY.has(m.t)) this.emit(m, id); });
        c.on('close', gone);
      });
    });
  },
  join(code) {
    this.close(); this.isHost = false; this.code = code; this.rtt = 1e9;
    return new Promise((ok, ko) => {
      const p = this.peer = new XPeer(); let done = false; const fail = e => { if (done) return; done = true; ko(e); };
      p.on('error', fail); setTimeout(() => fail({ type: 'timeout' }), 30000);
      p.on('open', () => {
        const c = this.hostConn = p.connect('aero-' + code, { now: true });
        c.last = performance.now(); c.on('open', () => { c.last = performance.now(); this.ping(); this.timer = setInterval(() => { this.ping(); if (done && this.hostConn === c && performance.now() - c.last > 10000) { this.online = false; this.hostConn = null; this.emit({ t: '_closed' }, 'h'); try { c.close(); } catch (e) { } } }, 2000); });
        c.on('data', m => { if (!m || !m.t) return; c.last = performance.now(); if (m.t === 'hb') return; if (m.t === 'bye') { if (this.hostConn === c) { this.online = false; this.hostConn = null; this.emit({ t: '_closed' }, 'h'); } return; }
          if (m.t === 'pn') { const n = performance.now(), rtt = n - m.c; if (rtt < this.rtt + 15) { this.rtt = Math.min(rtt, this.rtt); this.offset = m.h + rtt / 2 - n; } return; }
          if (m.t === 'you') { this.myId = m.id; this.online = true; if (!done) { done = true; ok(); } return; }
          if (m.t === 'full') return fail({ type: 'full' });
          if (typeof m.t === 'string' && m.t[0] !== '_') this.emit(m, 'h'); });
        c.on('close', () => { if (!done) return fail({ type: 'peer-unavailable' }); if (this.hostConn === c) { this.online = false; this.emit({ t: '_closed' }, 'h'); } });
      });
    });
  },
  ping() { if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'pg', c: performance.now() }); },
  /** invité → hôte ; hôte → tout le monde */
  send(m, except) { if (this.isHost) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(m); } else if (this.hostConn && this.hostConn.open) this.hostConn.send(m); },
  to(id, m) { const c = this.conns.get(id); if (c && c.open) c.send(m); },
  close() { try { this.send({ t: 'bye' }); } catch (e) { } clearInterval(this.timer); const p = this.peer; this.peer = null; this.hostConn = null; this.conns = new Map(); this.online = false; this.offset = 0; if (p) setTimeout(() => { try { p.destroy(); } catch (e) { } }, 150); },
};
addEventListener('beforeunload', () => { try { Net.send({ t: 'bye' }); } catch (e) { } });
