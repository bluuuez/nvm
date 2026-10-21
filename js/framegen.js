/* NVM – Stabwerke erzeugen, Schwierigkeit bewerten, Antworten bauen
 *
 * Familien (aus der Schnittgrößensammlung abgeleitet, mit Zufallsmaßen):
 *   winkel      Kragwinkel und Knickträger (Ecke)
 *   treppe      Z-förmiger Träger mit Stütze dazwischen
 *   abspann     Kragträger mit Zug- oder Druckstab (Pendelstab)
 *   portal      Rahmen mit Loslager, Dreigelenkrahmen, Giebelrahmen
 *   pendel      Gelenkträger auf Pendelstützen (Nullstäbe, wenn keine H-Last)
 *   dreigelenk  Biegestab auf zwei Pendelstäben
 *   fachwerk    Träger mit Fachwerkunterbau und Nullstäben
 *
 * Schwierigkeit D = Größe + Lösungsweg + Lasten (siehe difficulty()).
 * Wer Pendel- und Nullstäbe erkennt, kommt schnell zum Verlauf; das soll der Generator belohnen.
 */
(function (root) {
  'use strict';
  const NVM = root.NVM;
  const F = NVM.frame;
  const rnd = Math.random;
  const randi = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const maxAbs = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const EPS = 1e-6;

  // ------------------------------------------------------------ Baukasten
  const mk = (name, fam) => ({ name, fam, nodes: [], members: [], sup: [], loads: [] });
  function node(fr, x, y, hinge = false) {
    const i = fr.nodes.findIndex((n) => Math.abs(n.x - x) < EPS && Math.abs(n.y - y) < EPS);
    if (i >= 0) { if (hinge) fr.nodes[i].hinge = true; return i; }
    fr.nodes.push({ x, y, hinge });
    return fr.nodes.length - 1;
  }
  const beam = (fr, a, b, o = {}) => fr.members.push(Object.assign({ a, b }, o)) - 1;
  const rod = (fr, a, b) => beam(fr, a, b, { truss: true });
  const sup = (fr, n, type, ang) => { const s = { n, type }; if (ang !== undefined) s.ang = ang; fr.sup.push(s); };

  // Stabrichtung festlegen: waagerecht von links nach rechts (Faser unten), sonst Faser zur Systemmitte,
  // im Zweifel von unten nach oben (Faser rechts). Vor dem Lastaufbringen aufrufen.
  function orient(fr) {
    const cx = fr.nodes.reduce((s, n) => s + n.x, 0) / fr.nodes.length, cy = fr.nodes.reduce((s, n) => s + n.y, 0) / fr.nodes.length;
    for (const m of fr.members) {
      const A = fr.nodes[m.a], B = fr.nodes[m.b];
      const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy);
      let swap = false;
      if (Math.abs(dy) < EPS) swap = dx < 0;
      else {
        const z = [dy / l, -dx / l], mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        const d = z[0] * (cx - mx) + z[1] * (cy - my);
        if (Math.abs(d) > 0.05) swap = d < 0; else swap = dy < 0;
      }
      if (swap) { [m.a, m.b] = [m.b, m.a]; [m.relA, m.relB] = [m.relB, m.relA]; }
    }
    return fr;
  }
  function mirror(fr) {
    const xm = Math.max(...fr.nodes.map((n) => n.x));
    for (const n of fr.nodes) n.x = xm - n.x;
    for (const s of fr.sup) if (s.ang !== undefined) s.ang = 180 - s.ang;
    return fr;
  }
  const len = (fr, i) => F.geom(fr, i).l;
  const isHor = (fr, i) => Math.abs(F.geom(fr, i).e[1]) < EPS;
  const isVert = (fr, i) => Math.abs(F.geom(fr, i).e[0]) < EPS;
  const supAt = (fr, n) => fr.sup.find((s) => s.n === n);

  // ------------------------------------------------------------ Lasten
  // Rasterstellen im Inneren eines Stabs
  function innerS(fr, i) {
    const l = len(fr, i), st = l <= 2.01 ? 0.5 : 1, out = [];
    for (let s = st; s < l - 1e-6; s += st) out.push(Math.round(s * 1e6) / 1e6);
    return out;
  }
  function rigidNode(fr, j) {
    if (fr.nodes[j].hinge) return false;
    const n = fr.members.filter((m) => (m.a === j && !m.truss && !m.relA) || (m.b === j && !m.truss && !m.relB)).length;
    return n >= 1;
  }
  // eine Last würfeln; used: belegte Stellen
  function addLoad(fr, kinds, used) {
    const beams = fr.members.map((m, i) => i).filter((i) => !fr.members[i].truss);
    for (let t = 0; t < 30; t++) {
      const k = pick(kinds);
      if (k === 'F' || k === 'H') {
        // Knoten (ohne Lager) oder Stabpunkt
        const free = fr.nodes.map((n, j) => j).filter((j) => !supAt(fr, j) && !used.includes('n' + j));
        const useNode = free.length && rnd() < 0.45;
        const v = 10 * randi(1, 5);
        const comp = k === 'F' ? { Fx: 0, Fy: -v } : { Fx: (rnd() < 0.5 ? 1 : -1) * 10 * randi(1, 3), Fy: 0 };
        if (useNode) {
          const j = pick(free);
          if (!fr.members.some((m) => (m.a === j || m.b === j) && !m.truss) && rnd() < 0.5) continue;
          used.push('n' + j); fr.loads.push(Object.assign({ type: 'F', n: j }, comp)); return k;
        }
        const i = pick(beams), ss = innerS(fr, i).filter((s) => !used.includes(i + ':' + s));
        if (!ss.length) continue;
        const s = pick(ss);
        if (k === 'H' && isHor(fr, i)) continue;              // waagerechte Kraft am waagerechten Stab: nur N, selten sinnvoll
        used.push(i + ':' + s); fr.loads.push(Object.assign({ type: 'F', m: i, s }, comp)); return k;
      }
      if (k === 'M') {
        const rn = fr.nodes.map((n, j) => j).filter((j) => rigidNode(fr, j) && !used.includes('n' + j) && !supAt(fr, j));
        const v = 10 * randi(1, 4) * (rnd() < 0.5 ? 1 : -1);
        if (rn.length && rnd() < 0.5) { const j = pick(rn); used.push('n' + j); fr.loads.push({ type: 'M', n: j, M: v }); return k; }
        const i = pick(beams), ss = innerS(fr, i).filter((s) => !used.includes(i + ':' + s));
        if (!ss.length) continue;
        const s = pick(ss); used.push(i + ':' + s); fr.loads.push({ type: 'M', m: i, s, M: v }); return k;
      }
      if (k === 'q' || k === 'tri') {
        if (used.includes('q')) continue;
        const i = pick(beams), l = len(fr, i), g = F.geom(fr, i);
        const qv = 5 * randi(1, 4);
        let dir = -90, basis = 'len';
        if (isVert(fr, i)) dir = pick([0, 180]);
        else if (!isHor(fr, i)) { if (rnd() < 0.5) { dir = 'perp'; } else basis = 'proj'; }
        let s1 = 0, s2 = l;
        if (k === 'q' && l >= 3 && rnd() < 0.35) { const ss = innerS(fr, i); s1 = rnd() < 0.5 ? 0 : pick(ss); s2 = pick(ss.filter((s) => s > s1 + 0.9).concat([l])); }
        let q1 = qv, q2 = qv;
        if (k === 'tri') { if (rnd() < 0.5) q1 = 0; else q2 = 0; q1 && (q1 = 2 * qv); q2 && (q2 = 2 * qv); }
        if (dir === 'perp') {
          // von außen auf den Stab drücken (gegen die Faser), also gegen +z: Vorzeichen über q
          const up = g.z[1] > 0; if (up) { q1 = -q1; q2 = -q2; }
        }
        used.push('q'); fr.loads.push({ type: 'q', m: i, s1, s2, q1, q2, dir, basis }); return k;
      }
    }
    return null;
  }

  // ------------------------------------------------------------ Familien
  const FAM = {
    winkel() {
      const h = pick([2, 3, 4]), a = pick([2, 3, 4]), v = pick(['krag', 'krag', 'knie', 'kniel', 'hang']);
      let fr;
      if (v === 'hang') {
        fr = mk('Kragwinkel', 'winkel');
        const w = node(fr, 0, h), c = node(fr, a, h), e = node(fr, a, 0);
        beam(fr, w, c); beam(fr, c, e); sup(fr, w, 'einsp');
      } else {
        fr = mk(v === 'krag' ? 'Kragwinkel' : 'Knickträger', 'winkel');
        const b = node(fr, 0, 0), c = node(fr, 0, h), e = node(fr, a, h);
        beam(fr, b, c); beam(fr, c, e);
        if (v === 'krag') sup(fr, b, 'einsp');
        else if (v === 'knie') { sup(fr, b, 'fest'); sup(fr, e, 'los'); }
        else { sup(fr, b, 'los', 0); sup(fr, e, 'fest'); }
      }
      return fr;
    },
    treppe() {
      const a = pick([2, 3, 4]), b = pick([2, 3, 4]), h = pick([1, 2, 3]) * (rnd() < 0.5 ? 1 : -1);
      const fr = mk('Treppenträger', 'treppe');
      const n0 = node(fr, 0, 0), n1 = node(fr, a, 0), n2 = node(fr, a, h), n3 = node(fr, a + b, h);
      beam(fr, n0, n1); beam(fr, n1, n2); beam(fr, n2, n3);
      const v = pick(['einsp', 'fl', 'lf', 'gleit']);
      if (v === 'einsp') sup(fr, n0, 'einsp');
      else if (v === 'fl') { sup(fr, n0, 'fest'); sup(fr, n3, 'los'); }
      else if (v === 'lf') { sup(fr, n0, 'los'); sup(fr, n3, 'fest'); }
      else { sup(fr, n0, 'gleit', 0); sup(fr, n3, 'los'); }
      return fr;
    },
    abspann() {
      const a = pick([3, 4, 5, 6]), h = pick([2, 3]), fr = mk('Abgespannter Träger', 'abspann');
      const w = node(fr, 0, h), e = node(fr, a, h);
      const c = pick([a, a, a - 1, a - 2].filter((x) => x >= 2));
      const k = c === a ? e : node(fr, c, h);
      if (k !== e) { beam(fr, w, k); beam(fr, k, e); } else beam(fr, w, e);
      sup(fr, w, 'fest');
      const t = pick([2, 3]);
      if (rnd() < 0.6) { const top = node(fr, 0, h + t); rod(fr, k, top); sup(fr, top, 'fest'); }
      else { fr.name = 'Abgestützter Träger'; const bot = node(fr, 0, h - Math.min(t, h)); rod(fr, k, bot); sup(fr, bot, 'fest'); }
      return fr;
    },
    portal() {
      const l = pick([4, 5, 6, 8]), h = pick([3, 4]), h2 = rnd() < 0.25 ? h + pick([-1, 1]) : h;
      const v = pick(['los', 'los', 'drei', 'drei', 'giebel', 'krag', 'zug']);
      const fr = mk(v === 'drei' ? 'Dreigelenkrahmen' : v === 'giebel' ? 'Giebelrahmen' : 'Rahmen', 'portal');
      const b0 = node(fr, 0, 0), b1 = node(fr, l, 0), t0 = node(fr, 0, h), t1 = node(fr, l, h2);
      beam(fr, b0, t0); beam(fr, b1, t1);
      if (v === 'zug') {
        // Giebel mit Firstgelenk und Zugband zwischen den Traufecken (Sammlung, System 4)
        if (h !== h2 || l % 2) return null;
        fr.name = 'Giebelrahmen mit Zugband';
        const r = node(fr, l / 2, h + pick([1, 2]), true);
        beam(fr, t0, r); beam(fr, r, t1); rod(fr, t0, t1);
        if (rnd() < 0.5) { sup(fr, b0, 'fest'); sup(fr, b1, 'los'); } else { sup(fr, b0, 'los'); sup(fr, b1, 'fest'); }
      } else if (v === 'giebel') {
        const r = node(fr, l / 2, Math.max(h, h2) + pick([1, 2]), true);
        beam(fr, t0, r); beam(fr, r, t1); sup(fr, b0, 'fest'); sup(fr, b1, 'fest');
        if (Math.abs(l / 2 - Math.round(l / 2)) > EPS) return null;
      } else if (v === 'drei') {
        const xs = []; for (let x = 1; x < l; x++) xs.push(x);
        const xg = pick(xs), yg = h + (h2 - h) * xg / l;
        if (h !== h2) return null;
        const g = node(fr, xg, yg, true);
        beam(fr, t0, g); beam(fr, g, t1); sup(fr, b0, 'fest'); sup(fr, b1, 'fest');
      } else if (v === 'krag') {
        if (h !== h2) return null;
        const o = pick([1, 2]), e = node(fr, l + o, h);
        beam(fr, t0, t1); beam(fr, t1, e); sup(fr, b0, 'fest'); sup(fr, b1, 'los');
        fr.name = 'Rahmen mit Kragarm';
      } else {
        if (h !== h2) return null;
        beam(fr, t0, t1);
        if (rnd() < 0.5) { sup(fr, b0, 'fest'); sup(fr, b1, 'los'); } else { sup(fr, b0, 'los'); sup(fr, b1, 'fest'); }
      }
      return fr;
    },
    pendel() {
      // Gelenkträger: k Teile, je Teil eine Stütze mehr als Gelenke … der Löser prüft, ob es aufgeht
      const L = pick([6, 8, 10]), h = pick([2, 3]);
      const fr = mk('Gelenkträger auf Pendelstützen', 'pendel');
      const nh = pick([0, 1, 1, 2]);
      const xs = [0, L];
      const hingeX = [];
      for (let t = 0; t < nh; t++) { const x = randi(2, L - 2); if (!hingeX.some((q) => Math.abs(q - x) < 2)) hingeX.push(x); }
      // Stützstellen
      const need = 3 + hingeX.length;
      const supX = [];
      let cnt = 0;
      const pos = []; for (let x = 0; x <= L; x++) if (!hingeX.includes(x)) pos.push(x);
      const kinds = [];
      // genau eine waagerechte Halterung: Festlager oder waagerechter bzw. schräger Pendelstab
      const hk = pick(['fest', 'fest', 'rodH', 'rodS']);
      kinds.push(hk); cnt += hk === 'fest' ? 2 : 1;
      while (cnt < need) { kinds.push(pick(['los', 'rodV', 'rodV', 'rodV'])); cnt++; }
      if (cnt !== need) return null;
      const P = pos.slice().sort(() => rnd() - 0.5);
      if (P.length < kinds.length) return null;
      kinds.forEach((k, i) => supX.push({ x: P[i], k }));
      supX.sort((p, q) => p.x - q.x);
      const all = [...new Set([...xs, ...hingeX, ...supX.map((s) => s.x)])].sort((p, q) => p - q);
      const ids = all.map((x) => node(fr, x, h, hingeX.includes(x)));
      for (let i = 0; i < ids.length - 1; i++) beam(fr, ids[i], ids[i + 1]);
      for (const s of supX) {
        const j = node(fr, s.x, h);
        if (s.k === 'fest') sup(fr, j, 'fest');
        else if (s.k === 'los') sup(fr, j, 'los');
        else if (s.k === 'rodV') { const g = node(fr, s.x, rnd() < 0.8 ? 0 : 2 * h); rod(fr, j, g); sup(fr, g, 'fest'); }
        else if (s.k === 'rodS') { const d = s.x <= L / 2 ? -1 : 1, g = node(fr, s.x + d * h, 0); rod(fr, j, g); sup(fr, g, 'fest'); }
        else { const d = s.x <= L / 2 ? -1 : 1, g = node(fr, s.x + d * 2, h); if (s.x !== 0 && s.x !== L) return null; rod(fr, j, g); sup(fr, g, 'fest'); }
      }
      if (!hingeX.length) fr.name = 'Träger auf Pendelstützen';
      return fr;
    },
    kombi() {
      // Gelenkträger auf Pendelstützen, am Ende biegesteife Ecke hoch oder runter zu einem Lager (Sammlung, System 7)
      const fr = mk('Gelenkträger mit Rahmenecke', 'kombi');
      const L = pick([6, 8]), h = pick([2, 3]), up = pick([1, 2]) * (rnd() < 0.5 ? 1 : -1), o = pick([0, 1, 2]);
      const xg = randi(3, L - 2);
      const xs = [...new Set([0, xg, L])].sort((p, q) => p - q);
      const ids = xs.map((x) => node(fr, x, h, x === xg));
      for (let i = 0; i < ids.length - 1; i++) beam(fr, ids[i], ids[i + 1]);
      const c = node(fr, L, h + up);
      beam(fr, ids[ids.length - 1], c);
      let e = c;
      if (o) { e = node(fr, L + o, h + up); beam(fr, c, e); }
      // links: Festlager oder Pendelstütze + waagerechter Halt
      const left = pick(['fest', 'rodV']);
      if (left === 'fest') sup(fr, ids[0], 'fest');
      else { const g = node(fr, 0, 0); rod(fr, ids[0], g); sup(fr, g, 'fest'); }
      // eine Pendelstütze zwischen 0 und Gelenk
      const xp = randi(1, xg - 1), jp = node(fr, xp, h);
      if (!fr.members.some((m) => m.a === jp || m.b === jp)) {
        // Knoten in den Stab einfügen
        const i = fr.members.findIndex((m) => fr.nodes[m.a].x < xp && fr.nodes[m.b].x > xp && fr.nodes[m.a].y === h && fr.nodes[m.b].y === h);
        if (i < 0) return null;
        const b = fr.members[i].b; fr.members[i].b = jp; beam(fr, jp, b);
      }
      const gp = node(fr, xp, 0); rod(fr, jp, gp); sup(fr, gp, 'fest');
      sup(fr, e, left === 'fest' ? 'los' : pick(['fest', 'los']));
      if (o === 0 && up < 0 && fr.sup[fr.sup.length - 1].type === 'los') fr.sup[fr.sup.length - 1].ang = 0;
      return fr;
    },
    dreigelenk() {
      // Biegestab, gehalten von zwei Pendelstäben, die sich in einem Gelenk treffen (Sammlung, System 1)
      const fr = mk('Stab auf Pendelstäben', 'dreigelenk');
      const a = pick([2, 3]), b = pick([2, 3, 4]), h = pick([2, 3]);
      const g = node(fr, a, h, true), s1 = node(fr, 0, 0), s2 = node(fr, a + b, 0);
      rod(fr, s1, g); rod(fr, s2, g); sup(fr, s1, 'fest'); sup(fr, s2, 'fest');
      const v = pick(['hor', 'schraeg', 'hoch']);
      let e;
      if (v === 'hor') { e = node(fr, a + pick([3, 4]), h); sup(fr, e, 'los'); }
      else if (v === 'schraeg') { const d = pick([2, 3]); e = node(fr, a + d, h + d); sup(fr, e, 'los', 0); }
      else { e = node(fr, a, h + pick([2, 3])); sup(fr, e, 'los', 0); }
      beam(fr, g, e);
      return fr;
    },
    fachwerk() {
      const e = pick([1, 1.5, 2]), v = pick(['unten', 'unterspannt']);
      if (v === 'unten') {
        // Träger mit Dreieck darunter, rechts Kragarm; Knoten mit zwei Stäben ohne Last: Nullstäbe (Sammlung, System 2)
        const fr = mk('Träger mit Fachwerk', 'fachwerk');
        const t0 = node(fr, 0, e, true), t1 = node(fr, 2 * e, e), t2 = node(fr, 3 * e, e), b = node(fr, e, 0, true);
        beam(fr, t0, t1); beam(fr, t1, t2); rod(fr, t0, b); rod(fr, b, t1);
        sup(fr, t0, 'fest'); sup(fr, b, 'los');
        if (rnd() < 0.7) { const c = node(fr, 2 * e, 0, true); rod(fr, t1, c); rod(fr, b, c); }
        return fr;
      }
      const L = pick([4, 6, 8]), d = pick([1, 1.5]);
      const fr = mk('Unterspannter Träger', 'fachwerk');
      const a = node(fr, 0, d), m = node(fr, L / 2, d, true), b = node(fr, L, d), u = node(fr, L / 2, 0, true);
      beam(fr, a, m); beam(fr, m, b); rod(fr, a, u); rod(fr, u, b); rod(fr, m, u);
      sup(fr, a, 'fest'); sup(fr, b, 'los');
      return fr;
    }
  };
  const FAM_MIN = { winkel: 4, treppe: 4, abspann: 4, portal: 5, pendel: 5, dreigelenk: 6, fachwerk: 6, kombi: 7 };
  // kleine Systeme ohne Pendelstäbe nur in den unteren Rahmenstufen
  const FAM_MAX = { winkel: 5, treppe: 5, abspann: 6 };

  // ------------------------------------------------------------ Schwierigkeit
  // Merkmale des gelösten Systems
  function features(fr, sol) {
    const nb = fr.members.filter((m) => !m.truss).length, nt = fr.members.length - nb;
    // biegesteife Teile (Scheiben): Biegestäbe, die biegesteif zusammenhängen
    const par = fr.members.map((m, i) => i);
    const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    let corners = 0, chains = nb;
    fr.nodes.forEach((n, j) => {
      const rig = fr.members.map((m, i) => i).filter((i) => {
        const m = fr.members[i];
        return !m.truss && !n.hinge && ((m.a === j && !m.relA) || (m.b === j && !m.relB));
      });
      for (let k = 1; k < rig.length; k++) {
        const a = find(rig[0]), b = find(rig[k]); if (a !== b) par[b] = a;
        const ea = F.geom(fr, rig[0]).e, eb = F.geom(fr, rig[k]).e;
        if (Math.abs(ea[0] * eb[1] - ea[1] * eb[0]) > 0.05) corners++; else chains--;
      }
    });
    const bodies = new Set(fr.members.map((m, i) => i).filter((i) => !fr.members[i].truss).map(find)).size;
    const hinges = fr.nodes.filter((n, j) => n.hinge && fr.members.filter((m) => (m.a === j || m.b === j) && !m.truss).length >= 1).length;
    const incl = fr.members.filter((m, i) => !m.truss && !isHor(fr, i) && !isVert(fr, i)).length;
    const inclRods = fr.members.filter((m, i) => m.truss && !isHor(fr, i) && !isVert(fr, i)).length;
    const info = sol ? F.rodInfo(fr, sol) : [];
    const zeroRods = info.filter((r) => r.truss && r.zero).length;
    const zeroBeams = info.filter((r) => !r.truss && r.zero).length;
    return { nb, nt, chains, corners, bodies, hinges, incl, inclRods, zeroRods, zeroBeams, nLoads: fr.loads.length };
  }
  const LOAD_W = (fr, ld) => {
    let w = ld.type === 'F' ? (Math.abs(ld.Fx || 0) > EPS && Math.abs(ld.Fy || 0) > EPS ? 0.8 : 0.5) : ld.type === 'M' ? 0.7 : Math.abs(ld.q1 - ld.q2) > EPS ? 1.2 : 0.8;
    if (ld.m !== undefined && !isHor(fr, ld.m) && !isVert(fr, ld.m)) w += 0.3;
    return w;
  };
  function difficulty(fr, sol) {
    const f = features(fr, sol);
    const G = 0.5 * Math.max(0, f.chains - 1) + 0.35 * f.nt + 0.6 * f.hinges + 0.45 * f.corners + 0.4 * f.incl + 0.15 * f.inclRods;
    const W = 0.8 * Math.max(0, f.bodies - 1) + 0.5 * f.zeroRods;
    const L = fr.loads.reduce((s, ld) => s + LOAD_W(fr, ld), 0);
    return { D: Math.round((G + W + L) * 100) / 100, G, W, L, f };
  }
  // Schwierigkeitsbänder je Stufe (geeicht an den Systemen der Sammlung, siehe Tests)
  const BAND = { 4: [1.2, 3.2], 5: [2.6, 4.6], 6: [3.8, 6], 7: [5.2, 7.6], 8: [6.8, 12] };
  const NLOADS = { 4: [1, 1], 5: [1, 2], 6: [1, 2], 7: [2, 2], 8: [2, 3] };

  function generate(stage, famPref) {
    stage = Math.max(4, Math.min(8, stage));
    const fams = famPref ? [famPref] : Object.keys(FAM).filter((k) => FAM_MIN[k] <= stage && (FAM_MAX[k] || 99) >= stage);
    const band = BAND[stage];
    let best = null, bestDist = Infinity;
    // erst eine Familie wählen, dann darin suchen: so kommen alle Familien gleich oft dran
    const order = fams.slice().sort(() => rnd() - 0.5);
    for (let t = 0; t < 30 * order.length; t++) {
      const fam = order[Math.floor(t / 30)];
      let fr = FAM[fam]();
      if (!fr) continue;
      if (rnd() < 0.5) mirror(fr);
      if (crossing(fr)) continue;
      orient(fr);
      const [n1, n2] = NLOADS[stage];
      const nl = randi(n1, n2), used = [];
      const kinds = stage <= 4 ? ['F', 'F', 'q', 'H'] : ['F', 'F', 'q', 'q', 'H', 'M', 'tri'];
      for (let k = 0; k < nl; k++) addLoad(fr, kinds, used);
      if (!fr.loads.length) continue;
      const sol = F.solve(fr);
      if (!sol.ok) continue;
      const cv = F.curves(fr, sol, 40);
      if (!sane(cv)) continue;
      const d = difficulty(fr, sol);
      fr.D = d.D;
      const dist = d.D < band[0] ? band[0] - d.D : d.D > band[1] ? d.D - band[1] : 0;
      if (dist === 0) return { fr, sol, cv, d };
      if (dist < bestDist) { bestDist = dist; best = { fr, sol, cv, d }; }
    }
    return best;
  }
  // Stäbe dürfen sich nur in gemeinsamen Knoten treffen, und kein Knoten darf mitten auf einem fremden Stab liegen
  function crossing(fr) {
    const P = (j) => fr.nodes[j];
    const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    for (let i = 0; i < fr.members.length; i++) {
      const m = fr.members[i];
      for (let j = 0; j < fr.nodes.length; j++) {
        if (j === m.a || j === m.b) continue;
        const A = P(m.a), B = P(m.b), C = P(j);
        if (Math.abs(cr(A, B, C)) < 1e-6 && C.x >= Math.min(A.x, B.x) - EPS && C.x <= Math.max(A.x, B.x) + EPS && C.y >= Math.min(A.y, B.y) - EPS && C.y <= Math.max(A.y, B.y) + EPS) return true;
      }
      for (let k = i + 1; k < fr.members.length; k++) {
        const n = fr.members[k];
        if ([n.a, n.b].some((x) => x === m.a || x === m.b)) continue;
        const A = P(m.a), B = P(m.b), C = P(n.a), D = P(n.b);
        const d1 = cr(C, D, A), d2 = cr(C, D, B), d3 = cr(A, B, C), d4 = cr(A, B, D);
        if (d1 * d2 < 0 && d3 * d4 < 0) return true;
      }
    }
    return false;
  }
  // keine absurden Zahlen (riesige Werte durch fast parallele Stäbe usw.)
  function sane(cv) {
    const all = cv.flatMap((c) => [...c.N, ...c.V, ...c.M]);
    const m = maxAbs(all);
    return m > 1e-6 && m < 2000 && all.every(isFinite);
  }

  // ------------------------------------------------------------ Antworten
  const SAMP = 21;
  function vecFromCv(cv, qty) {
    const out = [];
    for (const c of cv) {
      const L = c.s[c.s.length - 1];
      for (let k = 0; k < SAMP; k++) {
        const s = L * (0.002 + 0.996 * k / (SAMP - 1));
        let j = c.s.findIndex((v) => v >= s); if (j < 1) j = 1;
        const t = (s - c.s[j - 1]) / Math.max(c.s[j] - c.s[j - 1], 1e-12);
        out.push(c[qty][j - 1] + (c[qty][j] - c[qty][j - 1]) * t);
      }
    }
    return out;
  }
  const norm = (v) => { const m = maxAbs(v); return m < 1e-9 ? null : v.map((x) => x / m); };
  const rms = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);

  // Verläufe manipulieren (Denkfehler, die sich nicht als anderes System rechnen lassen)
  const mapCv = (cv, qty, fn) => cv.map((c, i) => Object.assign({}, c, { [qty]: c[qty].map((v, k) => fn(v, i, k, c)) }));

  function frameOptions(fr, sol, cv, qty) {
    const pool = [];
    const add = (cvx, tag, prio, frx) => pool.push({ cv: cvx, tag, prio: prio + rnd(), fr: frx || fr });
    const info = F.rodInfo(fr, sol);
    const smax = Math.max(...cv.map((c) => maxAbs(c[qty])));
    // 1) Vorzeichen insgesamt
    add(mapCv(cv, qty, (v) => -v), 'vorzeichen', 0.3);
    // 2) Faserseite an senkrechten bzw. schrägen Stäben verwechselt
    const vert = fr.members.map((m, i) => i).filter((i) => !fr.members[i].truss && !isHor(fr, i) && maxAbs(cv[i][qty]) > 0.05 * smax);
    const hor = fr.members.map((m, i) => i).filter((i) => !fr.members[i].truss && isHor(fr, i) && maxAbs(cv[i][qty]) > 0.05 * smax);
    if (qty !== 'N' && vert.length && hor.length) add(mapCv(cv, qty, (v, i) => (vert.includes(i) ? -v : v)), 'faser', 0.8);
    // 3) andere Schnittgröße
    if (qty === 'M') add(cv.map((c) => Object.assign({}, c, { M: c.V })), 'verwechselt', 0.2);
    else if (qty === 'V') add(cv.map((c) => Object.assign({}, c, { V: c.N })), 'verwechselt', 0.3);
    else add(cv.map((c) => Object.assign({}, c, { N: c.V })), 'verwechselt', 0.3);
    // 4) Nullstab übersehen: Nullstab trägt doch Normalkraft
    const zr = info.map((r, i) => i).filter((i) => info[i].truss && info[i].zero);
    const nzN = info.filter((r) => r.truss && !r.zero).map((r) => Math.abs(r.N));
    if (qty === 'N' && zr.length) {
      const v = nzN.length ? -Math.max(...nzN) * 0.7 : -0.6 * smax;
      add(mapCv(cv, 'N', (x, i) => (zr.includes(i) ? v : x)), 'nullstab', 1.2);
    }
    // 5) Pendelstab mit Moment bzw. Querkraft
    const rods = fr.members.map((m, i) => i).filter((i) => fr.members[i].truss);
    if ((qty === 'M' || qty === 'V') && rods.length && smax > 1e-6) {
      const r = pick(rods), sg = rnd() < 0.5 ? 1 : -1;
      add(mapCv(cv, qty, (x, i, k, c) => (i === r ? (qty === 'M' ? sg * 0.6 * smax * (c.s[k] / c.s[c.s.length - 1]) : sg * 0.4 * smax) : x)), 'pendelMoment', 0.9);
    }
    // 6) andere Systeme rechnen
    for (const md of frameMods(fr)) {
      const so = F.solve(md.fr);
      if (!so.ok) continue;
      let c2 = F.curves(md.fr, so, 40);
      if (!sane(c2)) continue;
      // immer auf das Originalsystem zeichnen (sonst verrät die Geometrie die falsche Antwort)
      c2 = c2.map((c, i) => { const k = cv[i].s[cv[i].s.length - 1] / c.s[c.s.length - 1]; return Object.assign({}, c, { s: c.s.map((v) => v * k), crit: c.crit.map((v) => v * k) }); });
      add(c2, md.tag, md.prio);
    }
    pool.sort((a, b) => b.prio - a.prio);
    const ref = norm(vecFromCv(cv, qty));
    if (!ref) return null;
    const keep = [ref], sel = [];
    for (const p of pool) {
      const v = norm(vecFromCv(p.cv, qty));
      if (!v) continue;
      if (keep.some((k) => rms(k, v) < 0.12)) continue;
      keep.push(v); sel.push(p);
      if (sel.length >= 3) break;
    }
    if (sel.length < 3) return null;
    const all = [{ cv, tag: 'richtig', fr }, ...sel];
    const perm = [0, 1, 2, 3].sort(() => rnd() - 0.5);
    return { opts: perm.map((i) => all[i]), correct: perm.indexOf(0) };
  }

  // Systemänderungen = typische Denkfehler, die sich als anderes System rechnen lassen
  function frameMods(fr) {
    const out = [];
    // Last in Gegenrichtung (nur waagerechte Kräfte und Momente, senkrechte Lasten von oben sind eindeutig)
    if (fr.loads.some((l) => (l.type === 'F' && Math.abs(l.Fx || 0) > EPS) || l.type === 'M')) {
      const s = clone(fr);
      for (const l of s.loads) { if (l.type === 'F') l.Fx = -(l.Fx || 0); if (l.type === 'M') l.M = -l.M; }
      out.push({ fr: s, tag: 'lastRichtung', prio: 0.7 });
    }
    // Festlager und Loslager vertauscht
    const iF = fr.sup.map((s, i) => i).filter((i) => fr.sup[i].type === 'fest'), iL = fr.sup.map((s, i) => i).filter((i) => fr.sup[i].type === 'los');
    if (iF.length && iL.length) {
      const s = clone(fr); s.sup[iF[0]].type = 'los'; delete s.sup[iF[0]].ang; s.sup[iL[0]].type = 'fest';
      out.push({ fr: s, tag: 'festLos', prio: 0.8 });
    }
    // Loslager falsch gedreht (waagerecht statt senkrecht)
    if (iL.length) {
      const s = clone(fr), sp = s.sup[iL[0]];
      sp.ang = (sp.ang ?? 90) === 90 ? 0 : 90;
      out.push({ fr: s, tag: 'losGedreht', prio: 0.6 });
    }
    // eine Last vergessen
    if (fr.loads.length >= 2) fr.loads.forEach((l, i) => { const s = clone(fr); s.loads.splice(i, 1); out.push({ fr: s, tag: 'lastFehlt', prio: 0.5 }); });
    // Streckenlast als Einzellast in der Mitte (Formfehler: Knick statt Parabel)
    fr.loads.forEach((l, i) => {
      if (l.type !== 'q') return;
      const s = clone(fr), g = F.geom(fr, l.m);
      const R = (l.q1 + l.q2) / 2 * (l.s2 - l.s1), xc = Math.abs(l.q1 + l.q2) > EPS ? l.s1 + (l.s2 - l.s1) * (l.q1 + 2 * l.q2) / (3 * (l.q1 + l.q2)) : (l.s1 + l.s2) / 2;
      let d;
      if (l.dir === 'perp') d = g.z; else { d = [Math.cos(l.dir * Math.PI / 180), Math.sin(l.dir * Math.PI / 180)]; }
      const k = l.dir !== 'perp' && l.basis === 'proj' ? Math.abs(g.e[0] * d[1] - g.e[1] * d[0]) : 1;
      s.loads[i] = { type: 'F', m: l.m, s: xc, Fx: R * k * d[0], Fy: R * k * d[1] };
      out.push({ fr: s, tag: 'resultierende', prio: 0.75 });
    });
    // Einzellast an eine andere Stelle
    fr.loads.forEach((l, i) => {
      if (l.type !== 'F' || l.m === undefined) return;
      const ss = innerS(fr, l.m).filter((s) => Math.abs(s - l.s) >= 0.3 * len(fr, l.m));
      if (!ss.length) return;
      const s = clone(fr); s.loads[i].s = pick(ss);
      out.push({ fr: s, tag: 'lastVerschoben', prio: 0.4 });
    });
    // Pendelstab in andere Richtung (Fußpunkt verschoben): falsche Wirkungslinie der Stabkraft
    fr.members.forEach((m, i) => {
      if (!m.truss) return;
      const sp = fr.sup.find((s) => s.n === m.a || s.n === m.b);
      if (!sp) return;
      const s = clone(fr), n = s.nodes[sp.n];
      const other = s.nodes[sp.n === m.a ? m.b : m.a];
      if (Math.abs(n.x - other.x) < EPS) n.x += pick([-1, 1]) * Math.max(1, Math.abs(n.y - other.y)); else n.x = other.x;
      out.push({ fr: s, tag: 'pendelRichtung', prio: 0.65 });
    });
    return out;
  }

  // ------------------------------------------------------------ Aufgabe
  const QTY_TEXT = { M: 'Welcher Momentenverlauf gehört zu diesem System?', V: 'Welcher Querkraftverlauf gehört zu diesem System?', N: 'Welcher Normalkraftverlauf gehört zu diesem System?' };
  function pickQty(stage, fr, d, want) {
    if (want && want !== 'mix') return want;
    const w = { M: 3, V: d.D <= 4.5 || stage >= 6 ? 2 : 0.5, N: fr.members.some((m) => m.truss) ? 3 : 1 };
    const tot = w.M + w.V + w.N; let r = rnd() * tot;
    for (const k of ['M', 'V', 'N']) { r -= w[k]; if (r <= 0) return k; }
    return 'M';
  }
  function buildFrameQuestion(stage, qtyWant, famPref) {
    for (let t = 0; t < 40; t++) {
      const g = generate(stage, famPref);
      if (!g) continue;
      const qty = pickQty(stage, g.fr, g.d, qtyWant);
      const smax = Math.max(...g.cv.map((c) => maxAbs(c[qty])));
      if (smax < 1e-6) continue;
      // zu einfach: nirgends Biegung, oder die gefragte Größe nur in einem Stab
      const mM = Math.max(...g.cv.map((c) => maxAbs(c.M)));
      if (mM < 1e-6 || g.cv.filter((c) => maxAbs(c[qty]) > 0.02 * smax).length < 2) continue;
      const r = frameOptions(g.fr, g.sol, g.cv, qty);
      if (!r) continue;
      return {
        type: 'frame' + qty, frame: true, fr: g.fr, fsol: g.sol, fcv: g.cv, qty, diff: g.d,
        sys: { L: 1, ca: 1, sa: 0, alpha: 0, kind: 'frame', name: g.fr.name, loads: [], sup: [], hinges: [] },
        text: QTY_TEXT[qty], opts: r.opts, correct: r.correct, target: [], tol: 0, clickTag: '', solLines: [`Richtig ist Antwort ${r.correct + 1}.`], symbolic: false
      };
    }
    return null;
  }

  // ------------------------------------------------------------ Erklärung
  const fmt = (v, d = 1) => NVM.fmt(v, d), fmtL = (v) => NVM.fmtL(v);
  function supNamesF(fr) {
    const ord = fr.sup.map((s, i) => i).sort((a, b) => fr.nodes[fr.sup[a].n].x - fr.nodes[fr.sup[b].n].x || fr.nodes[fr.sup[a].n].y - fr.nodes[fr.sup[b].n].y);
    const nm = []; ord.forEach((i, k) => { nm[i] = 'ABCDEFGH'[k]; });
    return nm;
  }
  function memberWord(fr, i) {
    const m = fr.members[i], A = fr.nodes[m.a], B = fr.nodes[m.b];
    const x0 = Math.min(...fr.nodes.map((n) => n.x));
    const kind = m.truss ? 'Pendelstab' : 'Stab';
    if (isHor(fr, i)) return `waagerechter ${kind} (x = ${fmtL(Math.min(A.x, B.x) - x0)} … ${fmtL(Math.max(A.x, B.x) - x0)} m)`;
    if (isVert(fr, i)) return `senkrechter ${kind} bei x = ${fmtL(A.x - x0)} m`;
    return `schräger ${kind} (x = ${fmtL(Math.min(A.x, B.x) - x0)} … ${fmtL(Math.max(A.x, B.x) - x0)} m)`;
  }
  // warum ist ein Stab ein Nullstab?
  function zeroReason(fr, i) {
    const m = fr.members[i];
    for (const j of [m.a, m.b]) {
      if (fr.sup.some((sp) => sp.n === j) || fr.loads.some((l) => l.n === j)) continue;
      const at = fr.members.map((x, k) => k).filter((k) => fr.members[k].a === j || fr.members[k].b === j);
      if (!at.every((k) => fr.members[k].truss)) continue;
      const dir = (k) => { const e = F.geom(fr, k).e; return fr.members[k].a === j ? e : [-e[0], -e[1]]; };
      const par = (a, b) => Math.abs(a[0] * b[1] - a[1] * b[0]) < 1e-6;
      if (at.length === 2 && !par(dir(at[0]), dir(at[1]))) return 'Knoten mit zwei Stäben, die nicht auf einer Linie liegen, ohne Last: beide Stäbe sind Nullstäbe.';
      if (at.length === 3) {
        const o = at.filter((k) => k !== i);
        if (par(dir(o[0]), dir(o[1]))) return 'Knoten mit drei Stäben, zwei davon auf einer Linie, ohne Last: der dritte Stab ist ein Nullstab.';
      }
    }
    return isHor(fr, i) ? 'Er ist die einzige waagerechte Halterung, aber keine Last hat einen waagerechten Anteil: also N = 0.' : 'Das Gleichgewicht am Knoten verlangt keine Kraft in seiner Richtung: N = 0.';
  }
  const WHY = {
    vorzeichen: 'Das Bild ist genau gespiegelt, die Vorzeichen sind vertauscht. Positive Werte werden zur gestrichelten Faser angetragen.',
    faser: 'An den senkrechten bzw. schrägen Stäben liegt der Verlauf auf der falschen Seite. An einer biegesteifen Ecke mit zwei Stäben läuft das Moment ohne Sprung weiter und bleibt auf derselben Faserseite (innen bleibt innen).',
    faserV: 'An den senkrechten bzw. schrägen Stäben ist das Vorzeichen von V vertauscht. Welche Richtung positiv ist, legt die gestrichelte Faser fest: V > 0 zeigt am positiven Schnittufer zur Faser hin.',
    verwechselt: 'Das ist der Verlauf einer anderen Schnittgröße.',
    nullstab: 'Hier trägt ein Nullstab Normalkraft. Prüfe die Knoten ohne Last: Treffen sich dort nur zwei Stäbe, die nicht auf einer Linie liegen, sind beide Nullstäbe.',
    pendelMoment: 'Ein Pendelstab (beidseitig gelenkig, keine Last dazwischen) trägt nur Normalkraft: M = 0 und V = 0 im ganzen Stab.',
    lastRichtung: 'Die waagerechte Last bzw. das Moment wurde in der falschen Richtung angesetzt.',
    festLos: 'Fest- und Loslager sind vertauscht: Die waagerechte Kraft nimmt nur das Festlager auf.',
    losGedreht: 'Ein Loslager nimmt nur eine Kraft senkrecht zu seiner Gleitebene auf. Hier wurde es gedreht angenommen.',
    lastFehlt: 'Eine der Lasten fehlt in diesem Verlauf.',
    resultierende: 'Hier wurde die Streckenlast als Einzellast gerechnet. Unter einer Streckenlast ist M gekrümmt, nicht geknickt.',
    lastVerschoben: 'Die Einzellast sitzt in diesem Verlauf an einer anderen Stelle – der Knick bzw. Sprung liegt falsch.',
    pendelRichtung: 'Die Kraft eines Pendelstabs wirkt immer in Stabrichtung. Hier wurde sie mit einer anderen Richtung gerechnet.'
  };
  function feedback(q, ans) {
    const fr = q.fr, sol = q.fsol, cv = q.fcv, why = [];
    const opt = ans.chosen >= 0 && q.opts ? q.opts[ans.chosen] : null;
    if (!ans.ok && ans.tag === 'zeit') why.push('Die Zeit ist abgelaufen. Unten steht, wie man schnell auf die Lösung kommt.');
    else if (!ans.ok && opt) { const t = opt.tag === 'faser' && q.qty === 'V' ? 'faserV' : opt.tag; if (WHY[t]) why.push(WHY[t]); }
    const steps = [], info = F.rodInfo(fr, sol), nm = supNamesF(fr);
    const rods = fr.members.map((m, i) => i).filter((i) => fr.members[i].truss);
    if (rods.length) {
      steps.push('Pendelstäbe erkennen: beidseitig gelenkig, keine Last dazwischen – sie tragen nur Normalkraft, ihre Kraft wirkt in Stabrichtung.');
      for (const i of rods) {
        const n = sol.mem[i].N0;
        steps.push(info[i].zero ? `${memberWord(fr, i)}: Nullstab. ${zeroReason(fr, i)}` : `${memberWord(fr, i)}: N = ${fmt(n)} kN (${n > 0 ? 'Zug' : 'Druck'}).`);
      }
    }
    const rl = sol.R.map((r, k) => {
      const sp = fr.sup[k];
      if (sp.type === 'los') return `${nm[k]} = ${fmt(Math.abs(r.R))} kN ${Math.abs((sp.ang ?? 90) - 90) < 1 || Math.abs((sp.ang ?? 90) - 270) < 1 ? (r.Ry >= 0 ? 'nach oben' : 'nach unten') : (r.Rx >= 0 ? 'nach rechts' : 'nach links')}`;
      const parts = [];
      if (sp.type !== 'gleit' || Math.abs(r.Rx) > 1e-9) parts.push(`${nm[k]}_h = ${fmt(r.Rx)} kN`);
      if (sp.type !== 'gleit') parts.push(`${nm[k]}_v = ${fmt(r.Ry)} kN`);
      if (sp.type === 'einsp' || sp.type === 'gleit') parts.push(`M_${nm[k]} = ${fmt(Math.abs(r.M))} kNm ${r.M > 0 ? '(gegen den Uhrzeigersinn)' : '(im Uhrzeigersinn)'}`);
      return parts.join(', ');
    });
    steps.push(`Auflagerkräfte (h positiv nach rechts, v positiv nach oben): ${rl.join('; ')}.`);
    const f = features(fr, sol);
    if (f.hinges) steps.push('An jedem Gelenk ist M = 0 – das ist meist die Gleichung, die das System lösbar macht.');
    if (f.corners) steps.push('An einer biegesteifen Ecke mit zwei Stäben ist M auf beiden Seiten gleich groß, und die Querkraft des einen Stabs wird zur Normalkraft des anderen.');
    const subs = new Set(fr.loads.map((l) => (l.type === 'q' ? (Math.abs(l.q1 - l.q2) > EPS ? 'tri' : 'q') : l.type)));
    if (subs.has('q')) steps.push('Gleichstreckenlast: V linear, M quadratische Parabel.');
    if (subs.has('tri')) steps.push('Dreieckslast: V quadratisch, M kubisch.');
    if (subs.has('F')) steps.push('Einzellast: Sprung in V, Knick in M.');
    if (subs.has('M')) steps.push('Einzelmoment: Sprung in M, V springt dort nicht.');
    // Extremwerte
    const res = [];
    for (const Q of ['N', 'V', 'M']) {
      let mx = 0, at = null;
      cv.forEach((c, i) => c[Q].forEach((v, k) => { if (Math.abs(v) > mx + 1e-9) { mx = Math.abs(v); at = { i, s: c.s[k], v }; } }));
      if (mx < 1e-6) { res.push(`${Q} = 0 im ganzen System.`); continue; }
      const g = F.geom(fr, at.i), x0 = Math.min(...fr.nodes.map((n) => n.x)), y0 = Math.min(...fr.nodes.map((n) => n.y));
      const px = g.A.x + g.e[0] * at.s - x0, py = g.A.y + g.e[1] * at.s - y0;
      res.push(`|${Q}|max = ${fmt(mx)} ${Q === 'M' ? 'kNm' : 'kN'} bei x = ${fmtL(Math.round(px * 100) / 100)} m, y = ${fmtL(Math.round(py * 100) / 100)} m (${at.v > 0 ? 'positiv' : 'negativ'}).`);
    }
    const merke = {
      M: ['M = 0 an Gelenken, freien Enden und in Pendelstäben.', 'Positive Momente liegen auf der Seite der gestrichelten Faser (Zug).'],
      V: ['V ist die Steigung von M: wo M konstant ist, ist V = 0.', 'In Pendelstäben ist V = 0.'],
      N: ['N ändert sich nur durch Lasten in Stabrichtung. Pendelstäbe haben konstantes N.', 'Nullstäbe zuerst suchen: Sie vereinfachen das Gleichgewicht an den Knoten.']
    }[q.qty];
    return { why, sections: [{ title: 'So kommst du drauf', lines: steps }, { title: 'Ergebnis', lines: res }, { title: 'Merke', lines: merke }] };
  }

  const TIPS = [
    'Erst Pendelstäbe suchen: beidseitig gelenkig, keine Last dazwischen – sie tragen nur Normalkraft.',
    'Knoten ohne Last mit zwei Stäben, die nicht auf einer Linie liegen: beide sind Nullstäbe.',
    'Knoten ohne Last mit drei Stäben, zwei davon auf einer Linie: der dritte ist ein Nullstab.',
    'An einer biegesteifen Ecke mit zwei Stäben ist M auf beiden Seiten gleich – innen bleibt innen.',
    'An jedem Gelenk ist M = 0. Schneide dort, um die fehlende Gleichung zu bekommen.',
    'Ein unbelasteter Teil zwischen Gelenk und Lager bleibt oft ganz ohne Moment.',
    'Die Kraft eines Pendelstabs wirkt in Stabrichtung: Das legt die Wirkungslinie der Auflagerkraft fest.',
    'An der Ecke wird die Querkraft des einen Stabs zur Normalkraft des anderen.'
  ];
  const tip = () => pick(TIPS);

  NVM.framegen = { FAM, FAM_MIN, BAND, generate, difficulty, features, frameOptions, frameMods, buildFrameQuestion, orient, mirror, feedback, tip };
})(typeof window !== 'undefined' ? window : globalThis);
