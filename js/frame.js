/* NVM – Stabwerke (Rahmen, Gelenkträger, Pendel- und Nullstäbe)
 * Statisch bestimmte ebene Stabwerke exakt lösen.
 *
 * Koordinaten: x nach rechts, y nach oben (Meter).
 * Jeder Stab läuft von Knoten a nach b; lokale Achsen: e (a → b) und
 * z = e um 90° im Uhrzeigersinn gedreht. Die gestrichelte Faser liegt auf der
 * +z-Seite. Vorzeichen wie im Rest von NVM: N > 0 Zug, V > 0 am positiven
 * Schnittufer in +z, M > 0 Zug auf der gestrichelten Seite.
 *
 * Modell:
 *   nodes:   [{ x, y, hinge }]                 hinge = Vollgelenk (alle Stabenden gelenkig)
 *   members: [{ a, b, truss, relA, relB }]     truss = Pendelstab (beide Enden gelenkig, keine Stablasten)
 *            relA/relB: Momentengelenk am Stabende; relVA/relVB: Querkraftgelenk (V = 0);
 *            relNA/relNB: Normalkraftgelenk (N = 0)
 *   sup:     [{ n, type, ang }]                type: 'fest' | 'los' | 'einsp' | 'gleit' (verschiebliche Einspannung);
 *                                               ang = Richtung der Lagerkraft in Grad ('los': 90 = senkrecht,
 *                                               'gleit': 0 = waagerecht, also senkrecht verschieblich)
 *   loads:   [{ type: 'F', n | m+s, Fx, Fy }]  Einzelkraft (global)
 *            [{ type: 'M', n | m+s, M }]       Einzelmoment, im Uhrzeigersinn positiv
 *            [{ type: 'q', m, s1, s2, q1, q2, dir, basis }]
 *                 dir: Wirkrichtung in Grad (−90 = nach unten, 0 = nach rechts) oder 'perp' (+z)
 *                 basis: 'len' (je m Stab) | 'proj' (je m Projektion quer zur Wirkrichtung)
 */
(function (root) {
  'use strict';
  const N = root.NVM || (root.NVM = {});

  const cosd = (d) => Math.cos(d * Math.PI / 180);
  const sind = (d) => Math.sin(d * Math.PI / 180);
  // größter Betrag (Schleife statt reduce: läuft in den Antwort-Vergleichen sehr oft); NaN bleibt NaN
  function maxAbs(a) { let m = 0; for (const v of a) { const x = Math.abs(v); if (x > m) m = x; else if (x !== x) return NaN; } return m; }

  function geom(fr, i) {
    const m = fr.members[i], A = fr.nodes[m.a], B = fr.nodes[m.b];
    const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy);
    const e = [dx / l, dy / l], z = [e[1], -e[0]];
    return { l, e, z, A, B };
  }
  const relA = (fr, i) => !!(fr.members[i].truss || fr.members[i].relA || fr.nodes[fr.members[i].a].hinge);
  const relB = (fr, i) => !!(fr.members[i].truss || fr.members[i].relB || fr.nodes[fr.members[i].b].hinge);

  // Stablasten in lokale Komponenten (wie core.js: P [s, quer(+z), längs(+e)], Mp [s, M im Uhrzeigersinn], D/Da Streckenlasten)
  function localLoads(fr, i) {
    const g = geom(fr, i);
    const P = [], Mp = [], D = [], Da = [];
    for (const ld of fr.loads) {
      if (ld.m !== i) continue;
      if (ld.type === 'F') {
        const F = [ld.Fx || 0, ld.Fy || 0];
        P.push([ld.s, F[0] * g.z[0] + F[1] * g.z[1], F[0] * g.e[0] + F[1] * g.e[1]]);
      } else if (ld.type === 'M') {
        Mp.push([ld.s, ld.M]);
      } else if (ld.type === 'q') {
        let d, k = 1;
        if (ld.dir === 'perp') d = g.z;
        else {
          d = [cosd(ld.dir), sind(ld.dir)];
          if (ld.basis === 'proj') k = Math.abs(g.e[0] * d[1] - g.e[1] * d[0]);
        }
        const cz = k * (d[0] * g.z[0] + d[1] * g.z[1]), cx = k * (d[0] * g.e[0] + d[1] * g.e[1]);
        if (Math.abs(cz) > 1e-12) D.push([ld.s1, ld.s2, ld.q1 * cz, ld.q2 * cz]);
        if (Math.abs(cx) > 1e-12) Da.push([ld.s1, ld.s2, ld.q1 * cx, ld.q2 * cx]);
      }
    }
    return { P, Mp, D, Da };
  }

  // Anteil der Stablasten links von s (ohne Anfangswerte); läuft sehr oft, darum ohne Hilfsarrays
  function loadPart(la, s) {
    let n = 0, v = 0, m = 0;
    for (const p of la.P) if (p[0] < s) { n -= p[2]; v -= p[1]; m -= p[1] * (s - p[0]); }
    for (const q of la.Mp) if (q[0] < s) m += q[1];
    for (const d of la.D) {
      if (s <= d[0]) continue;
      const u = s < d[1] ? s : d[1], len = u - d[0], qu = d[2] + (d[3] - d[2]) * len / (d[1] - d[0]);
      const den = d[2] + qu, R = den / 2 * len;
      const c = Math.abs(den) > 1e-12 ? len * (d[2] + 2 * qu) / (3 * den) : len / 2;
      v -= R; m -= R * (s - (d[0] + c));
    }
    for (const d of la.Da) {
      if (s <= d[0]) continue;
      const u = s < d[1] ? s : d[1], len = u - d[0], qu = d[2] + (d[3] - d[2]) * len / (d[1] - d[0]);
      n -= (d[2] + qu) / 2 * len;
    }
    return { n, v, m };
  }

  // lineare Ausdrücke über den Unbekannten
  const lin = () => ({ c: new Map(), k: 0 });
  function addTo(ex, idx, f) { if (idx < 0 || !f) return; ex.c.set(idx, (ex.c.get(idx) || 0) + f); }

  function gauss(A, b) {
    const n = A.length;
    const M = A.map((r, i) => r.concat([b[i]]));
    const sc = Math.max(1e-300, ...A.map((r) => maxAbs(r)));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-9 * sc) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  function solve(fr) {
    const nm = fr.members.length, nn = fr.nodes.length;
    const unk = [];               // { kind: 'N0'|'V0'|'M0'|'R', m | sup, dir }
    const mi = [];                // je Stab: Indizes N0, V0, M0 (−1 = null)
    const G = [], LA = [];
    for (let i = 0; i < nm; i++) {
      G.push(geom(fr, i)); LA.push(localLoads(fr, i));
      const mm = fr.members[i];
      const ix = { N: -1, V: -1, M: -1 };
      if (!mm.relNA) ix.N = unk.push({ kind: 'N0', m: i }) - 1;
      if (!mm.truss && !mm.relVA) ix.V = unk.push({ kind: 'V0', m: i }) - 1;
      if (!relA(fr, i)) ix.M = unk.push({ kind: 'M0', m: i }) - 1;
      mi.push(ix);
    }
    const ri = fr.sup.map((sp, j) => {
      const r = [];
      if (sp.type === 'los' || sp.type === 'gleit') {
        const a = sp.ang ?? (sp.type === 'los' ? 90 : 0);
        r.push({ idx: unk.push({ kind: 'R', sup: j, d: [cosd(a), sind(a)] }) - 1, d: [cosd(a), sind(a)] });
        if (sp.type === 'gleit') r.push({ idx: unk.push({ kind: 'R', sup: j, mom: true }) - 1, mom: true });
      }
      else {
        r.push({ idx: unk.push({ kind: 'R', sup: j, d: [1, 0] }) - 1, d: [1, 0] });
        r.push({ idx: unk.push({ kind: 'R', sup: j, d: [0, 1] }) - 1, d: [0, 1] });
        if (sp.type === 'einsp') r.push({ idx: unk.push({ kind: 'R', sup: j, mom: true }) - 1, mom: true });
      }
      return r;
    });
    const nU = unk.length;

    // Endwerte je Stab als lineare Ausdrücke
    const endB = [];
    for (let i = 0; i < nm; i++) {
      const g = G[i], lp = loadPart(LA[i], g.l + 1e-12), ix = mi[i];
      const Nl = lin(), Vl = lin(), Ml = lin();
      addTo(Nl, ix.N, 1); Nl.k = lp.n;
      addTo(Vl, ix.V, 1); Vl.k = lp.v;
      addTo(Ml, ix.M, 1); addTo(Ml, ix.V, g.l); Ml.k = lp.m;
      endB.push({ N: Nl, V: Vl, M: Ml });
    }

    const rows = [];
    for (let j = 0; j < nn; j++) {
      const fx = lin(), fy = lin(), mo = lin();
      let momentRow = false;
      for (let i = 0; i < nm; i++) {
        const m = fr.members[i], g = G[i], ix = mi[i];
        if (m.a === j) {
          // Kraft des Stabs auf Knoten a: N0·e + V0·z, Moment +M0 (gegen den Uhrzeigersinn)
          addTo(fx, ix.N, g.e[0]); addTo(fy, ix.N, g.e[1]);
          addTo(fx, ix.V, g.z[0]); addTo(fy, ix.V, g.z[1]);
          if (ix.M >= 0) { addTo(mo, ix.M, 1); momentRow = true; }
        }
        if (m.b === j) {
          const E = endB[i];
          for (const [k, c] of E.N.c) { addTo(fx, k, -c * g.e[0]); addTo(fy, k, -c * g.e[1]); }
          fx.k -= E.N.k * g.e[0]; fy.k -= E.N.k * g.e[1];
          for (const [k, c] of E.V.c) { addTo(fx, k, -c * g.z[0]); addTo(fy, k, -c * g.z[1]); }
          fx.k -= E.V.k * g.z[0]; fy.k -= E.V.k * g.z[1];
          if (!relB(fr, i)) { for (const [k, c] of E.M.c) addTo(mo, k, -c); mo.k -= E.M.k; momentRow = true; }
        }
      }
      fr.sup.forEach((sp, s) => {
        if (sp.n !== j) return;
        for (const r of ri[s]) {
          if (r.mom) { addTo(mo, r.idx, 1); momentRow = true; }
          else { addTo(fx, r.idx, r.d[0]); addTo(fy, r.idx, r.d[1]); }
        }
      });
      for (const ld of fr.loads) {
        if (ld.n !== j || ld.m !== undefined) continue;
        if (ld.type === 'F') { fx.k += ld.Fx || 0; fy.k += ld.Fy || 0; }
        else if (ld.type === 'M') { mo.k -= ld.M; if (Math.abs(ld.M) > 1e-12) momentRow = true; }
      }
      rows.push(fx, fy);
      if (momentRow) rows.push(mo);
    }
    // gelenkiges Stabende b: M(l) = 0
    for (let i = 0; i < nm; i++) if (relB(fr, i) && !fr.members[i].truss) rows.push(endB[i].M);
    // Querkraft- bzw. Normalkraftgelenk am Stabende b: V(l) = 0 bzw. N(l) = 0
    for (let i = 0; i < nm; i++) {
      if (fr.members[i].relVB && !fr.members[i].truss) rows.push(endB[i].V);
      if (fr.members[i].relNB) rows.push(endB[i].N);
    }
    // Pendelstab: Querkraft null und keine Stablasten erlaubt
    const res = { ok: false, why: '', nU, nE: rows.length, unk };
    if (fr.members.some((m, i) => m.truss && fr.loads.some((l) => l.m === i))) { res.why = 'Last auf Pendelstab'; return res; }
    if (rows.length !== nU) { res.why = rows.length > nU ? 'verschieblich' : 'unbestimmt'; return res; }
    const A = rows.map((r) => { const a = new Array(nU).fill(0); for (const [k, c] of r.c) a[k] = c; return a; });
    const b = rows.map((r) => -r.k);
    const x = gauss(A, b);
    if (!x) { res.why = 'verschieblich oder unbestimmt (Ausnahmefall)'; return res; }
    const X = x.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
    const val = (idx) => (idx >= 0 ? X[idx] : 0);
    const mem = fr.members.map((m, i) => ({
      i, l: G[i].l, e: G[i].e, z: G[i].z, la: LA[i], truss: !!m.truss,
      N0: val(mi[i].N), V0: val(mi[i].V), M0: val(mi[i].M)
    }));
    const R = fr.sup.map((sp, s) => {
      const o = { Rx: 0, Ry: 0, M: 0 };
      for (const r of ri[s]) {
        if (r.mom) o.M = X[r.idx];             // Einspannmoment gegen den Uhrzeigersinn positiv
        else { o.Rx += X[r.idx] * r.d[0]; o.Ry += X[r.idx] * r.d[1]; }
      }
      if (sp.type === 'los' || sp.type === 'gleit') o.R = X[ri[s][0].idx];
      return o;
    });
    return { ok: true, mem, R, unk, X };
  }

  // Schnittgrößen im Stab i an der Stelle s (von a aus); side: −1 links vom Punkt, +1 rechts
  function at(sol, i, s, side = 0) {
    const m = sol.mem[i];
    const e = 1e-9 * m.l;
    const ss = side < 0 ? s - e : side > 0 ? s + e : s;
    const lp = loadPart(m.la, ss);
    return { N: m.N0 + lp.n, V: m.V0 + lp.v, M: m.M0 + m.V0 * ss + lp.m };
  }

  // Kritische Stellen je Stab (Lastgrenzen)
  function critS(fr, i, l) {
    const c = [0, l];
    for (const ld of fr.loads) {
      if (ld.m !== i) continue;
      if (ld.type === 'q') c.push(ld.s1, ld.s2); else c.push(ld.s);
    }
    return [...new Set(c.map((v) => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q);
  }
  // Verläufe je Stab, abgetastet; an kritischen Stellen beidseitig
  function curves(fr, sol, n = 60) {
    return sol.mem.map((m, i) => {
      const cr = critS(fr, i, m.l);
      const raw = [];
      for (let k = 0; k <= n; k++) raw.push(Math.round(m.l * k / n * 1e9) / 1e9);
      const eps = 1e-6 * m.l;
      for (const c of cr) raw.push(Math.round(Math.max(0, c - eps) * 1e9) / 1e9, Math.round(Math.min(m.l, c + eps) * 1e9) / 1e9);
      raw.sort((p, q) => p - q);
      const ss = raw.filter((v, k) => k === 0 || v !== raw[k - 1]);
      const N = [], V = [], M = [];
      for (const s of ss) { const lp = loadPart(m.la, s); N.push(m.N0 + lp.n); V.push(m.V0 + lp.v); M.push(m.M0 + m.V0 * s + lp.m); }
      const sc = Math.max(maxAbs(N), maxAbs(V), maxAbs(M), 1);
      const cl = (a) => a.map((v) => (Math.abs(v) < 1e-7 * sc ? 0 : v));
      return { s: ss, N: cl(N), V: cl(V), M: cl(M), crit: cr };
    });
  }

  // Nullstäbe und Pendelstäbe im gelösten System
  function rodInfo(fr, sol) {
    return sol.mem.map((m, i) => {
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => at(sol, i, t * m.l));
      const zero = pts.every((p) => Math.abs(p.N) < 1e-6 && Math.abs(p.V) < 1e-6 && Math.abs(p.M) < 1e-6);
      return { truss: m.truss, zero, N: m.truss ? m.N0 : null };
    });
  }

  N.frame = { solve, at, curves, rodInfo, geom, localLoads };
})(typeof window !== 'undefined' ? window : globalThis);
