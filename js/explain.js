/* NVM – Erklärungen
 * Erzeugt zu jeder Aufgabe einen Lösungsweg aus der tatsächlichen Rechnung:
 *   1. Auflagerkräfte über Gleichgewichtsbedingungen (mit Zahlen, Gelenk zuerst)
 *   2. Verlauf bereichsweise mit Sprüngen, Knicken und Extremwerten
 *   3. Merksätze zu den vorkommenden Lasten
 * Bei falschen Antworten wird die gewählte Antwort mit der richtigen verglichen und
 * die erste konkrete Abweichung benannt (Vorzeichen, Randbedingung, Sprung, Form, Extremwert).
 */
(function (root) {
  'use strict';
  const N = root.NVM;
  const { fmt, fmtL, fmtN, sgAt, solveSys, critPts, supNames, distRes, isIncl, maxAbs, interp1, featureRules, classicLine } = N;

  const UNIT = { N: 'kN', V: 'kN', M: 'kNm' };
  const QNAME = { N: 'N', V: 'V', M: 'M' };

  // ---------------------------------------------------------- Grundlagen
  function context(sys, sol) {
    const L = sys.L, e = 1e-7 * L;
    const c = { sys, sol, L, e, ca: sys.ca, sa: sys.sa, incl: isIncl(sys), names: supNames(sys) };
    c.px = (s) => fmtL(s * sys.ca);                       // Lage im Grundriss, wie in der Zeichnung
    c.X = (s) => `x = ${c.px(s)} m`;
    c.at = (s, Q) => sgAt(sol, Math.min(Math.max(s, 0), L))[Q];
    c.left = (s, Q) => (s <= e ? 0 : sgAt(sol, s - e)[Q]);
    c.right = (s, Q) => (s >= L - e ? 0 : sgAt(sol, s + e)[Q]);
    const xs = [];
    for (let i = 0; i <= 200; i++) xs.push(L * i / 200);
    c.scale = {};
    for (const Q of ['N', 'V', 'M']) c.scale[Q] = Math.max(maxAbs(xs.map((s) => c.at(s, Q))), 1e-9);
    return c;
  }
  const sym = (c, u) => {
    const nm = c.names[u.s];
    return u.c === 'V' ? `${nm}_v` : u.c === 'H' ? `${nm}_h` : u.c === 'N' ? `${nm}_⊥` : `M_${nm}`;
  };
  // Einspannmoment wie in der Zeichnung: positiv im Sinne eines positiven Schnittmoments am Stabende
  const clampSign = (c, u) => (u.x < c.L / 2 ? 1 : -1);
  function reactionValue(c, j) {
    const u = c.sol.unk[j], r = c.sol.R[j];
    return u.c === 'M' ? clampSign(c, u) * r : r;
  }
  function dirWord(u, v) {
    if (u.c === 'V') return v >= 0 ? 'nach oben' : 'nach unten';
    if (u.c === 'H') return v >= 0 ? 'nach rechts' : 'nach links';
    if (u.c === 'N') return 'senkrecht zur Stabachse';
    return v < 0 ? 'Zug oben' : 'Zug unten';
  }
  const unitOf = (u) => (u.c === 'M' ? 'kNm' : 'kN');

  function joinTerms(terms) {
    let s = '';
    terms.forEach((t, i) => {
      const neg = t.v < 0;
      if (i === 0) s += neg ? '−' + t.t : t.t;
      else s += neg ? ' − ' + t.t : ' + ' + t.t;
    });
    return s || '0';
  }

  // ---------------------------------------------------------- Lasten als Bausteine
  // Fz: senkrecht, nach unten positiv; Fx: waagerecht, nach rechts positiv; Mc: Moment im Uhrzeigersinn
  function loadItems(c, lo = 0, hi = c.L) {
    const out = [];
    for (const ld of c.sys.loads) {
      if (ld.type === 'F') {
        if (ld.x > lo - c.e && ld.x < hi + c.e) out.push({ kind: 'F', s: ld.x, Fz: ld.v, Fx: ld.Fx, ld });
      } else if (ld.type === 'M') {
        if (ld.x > lo - c.e && ld.x < hi + c.e) out.push({ kind: 'M', s: ld.x, Fz: 0, Fx: 0, Mc: ld.v, ld });
      } else {
        const a = Math.max(ld.x, lo), b = Math.min(ld.x2, hi);
        if (b - a < c.e) continue;
        const qAt = (s) => ld.v + (ld.v2 - ld.v) * (s - ld.x) / (ld.x2 - ld.x);
        const clipped = a > ld.x + c.e || b < ld.x2 - c.e;
        if (ld.type === 'm') out.push({ kind: 'm', s: (a + b) / 2, Fz: 0, Fx: 0, Mc: ld.v * (b - a), len: b - a, ld, clipped });
        else {
          const [R, sc] = distRes(a, b, qAt(a), qAt(b));
          const k = ld.basis === 'proj' ? c.ca : 1;      // je m Grundriss: Länge im Grundriss zählt
          out.push({ kind: 'q', s: sc, Fz: R * k, Fx: 0, len: b - a, ld, clipped });
        }
      }
    }
    return out;
  }
  const lever = (c, s, ps) => ({ dx: (s - ps) * c.ca, dz: -(s - ps) * c.sa });

  // Momentenbeiträge einer Last um ps als Text-Terme (Uhrzeigersinn positiv)
  function loadMomentTerms(c, it, ps) {
    const { dx, dz } = lever(c, it.s, ps);
    const out = [];
    if (it.kind === 'M') out.push({ t: fmtN(Math.abs(it.Mc)), v: it.Mc });
    else if (it.kind === 'm') out.push({ t: `${fmtN(Math.abs(it.ld.v))}·${fmtL(it.len)}`, v: it.Mc });
    else if (it.kind === 'F') {
      if (Math.abs(it.Fz) > 1e-9 && Math.abs(dx) > c.e) out.push({ t: `${fmtN(Math.abs(it.Fz))}·${fmtL(Math.abs(dx))}`, v: dx * it.Fz });
      if (Math.abs(it.Fx) > 1e-9 && Math.abs(dz) > c.e) out.push({ t: `${fmtN(Math.abs(it.Fx))}·${fmtL(Math.abs(dz))}`, v: -dz * it.Fx });
    } else if (Math.abs(dx) > c.e) {
      const uni = it.ld.sub !== 'tri' && !c.incl;
      const t = uni ? `${fmtN(Math.abs(it.ld.v))}·${fmtL(it.len)}·${fmtL(Math.abs(dx))}` : `${fmt(Math.abs(it.Fz))}·${fmtL(Math.abs(dx))}`;
      out.push({ t, v: dx * it.Fz });
    }
    return out;
  }
  // Beitrag einer Lagerreaktion je Einheit der Reaktion zum Moment um ps
  function reactionMomentCoef(c, u, ps) {
    const { dx, dz } = lever(c, u.x, ps);
    switch (u.c) {
      case 'V': return { k: -dx, lev: Math.abs(dx) };
      case 'H': return { k: -dz, lev: Math.abs(dz) };
      case 'N': return { k: -(u.x - ps), lev: Math.abs(u.x - ps) };     // senkrecht zum Stab: Hebel entlang der Achse
      default: return { k: 1, lev: 0 };
    }
  }
  // Kraftbeiträge (V: nach oben positiv, H: nach rechts positiv)
  function loadForceTerm(c, it, dir) {
    if (it.kind === 'M' || it.kind === 'm') return null;
    const v = dir === 'V' ? -it.Fz : it.Fx;
    if (Math.abs(v) < 1e-9) return null;
    if (it.kind === 'F') return { t: fmtN(Math.abs(v)), v };
    const ld = it.ld;
    let t;
    if (ld.sub === 'tri' && !it.clipped) t = `${fmtN(ld.mag)}·${fmtL(ld.basis === 'proj' ? it.len * c.ca : it.len)}/2`;
    else if (!it.clipped) t = `${fmtN(Math.abs(ld.v))}·${fmtL(ld.basis === 'proj' ? it.len * c.ca : it.len)}`;
    else t = fmt(Math.abs(v));
    return { t, v };
  }
  function reactionForceCoef(c, u, dir) {
    if (dir === 'V') return u.c === 'V' ? 1 : u.c === 'N' ? c.ca : 0;
    return u.c === 'H' ? 1 : u.c === 'N' ? -c.sa : 0;
  }

  // ---------------------------------------------------------- Auflagerkräfte
  function reactionSteps(c) {
    const { sol, sys, L, e } = c, U = sol.unk;
    const lines = [], known = new Map();
    const inRange = (u, lo, hi) => u.x > lo - e && u.x < hi + e;
    const resultLine = (j, v) => {
      const u = U[j];
      return `${sym(c, u)} = ${fmt(v)} ${unitOf(u)} (${dirWord(u, v)})`;
    };
    const check = (j, val) => Math.abs(val - reactionValue(c, j)) <= 1e-6 * Math.max(1, Math.abs(val));

    // ΣM um ps über den Bereich [lo, hi]; löst nach Reaktion j auf
    function momentEq(j, ps, pname, lo, hi, note) {
      const terms = [], notes = [];
      let known0 = 0, kU = 0;
      for (const it of loadItems(c, lo, hi)) {
        if (it.kind === 'q' && it.clipped && (it.ld.sub === 'tri' || c.incl)) notes.push(`Anteil der ${it.ld.sub === 'tri' ? 'Dreieckslast' : 'Streckenlast'} im ${note}: R = ${fmt(it.Fz)} kN im Schwerpunkt bei ${c.X(it.s)}`);
        for (const t of loadMomentTerms(c, it, ps)) { terms.push(t); known0 += t.v; }
      }
      for (let i = 0; i < U.length; i++) {
        const u = U[i];
        if (!inRange(u, lo, hi)) continue;
        const { k, lev } = reactionMomentCoef(c, u, ps);
        if (Math.abs(k) < 1e-9) continue;
        if (i === j) {
          kU = k;
          if (u.c === 'M') terms.push({ t: sym(c, u), v: clampSign(c, u) });
          else terms.push({ t: `${sym(c, u)}·${fmtL(lev)}`, v: k });
        } else if (known.has(i)) {
          const r = sol.R[i];
          const t = u.c === 'M' ? fmt(Math.abs(r)) : `${fmt(Math.abs(r))}·${fmtL(lev)}`;
          terms.push({ t, v: k * r }); known0 += k * r;
        } else return false;          // weitere Unbekannte mit Hebelarm: so nicht lösbar
      }
      if (Math.abs(kU) < 1e-12) return false;
      const r = -known0 / kU;
      const shown = U[j].c === 'M' ? clampSign(c, U[j]) * r : r;
      if (!check(j, shown)) return false;
      lines.push(...notes);
      lines.push(`ΣM_${pname} = 0${note ? ` (${note}, Uhrzeigersinn +)` : ' (Uhrzeigersinn +)'}: ${joinTerms(terms)} = 0`);
      lines.push('→ ' + resultLine(j, shown));
      known.set(j, r);
      return true;
    }
    function forceEq(j, dir) {
      const terms = [];
      let known0 = 0;
      for (const it of loadItems(c)) { const t = loadForceTerm(c, it, dir); if (t) { terms.push(t); known0 += t.v; } }
      const kU = reactionForceCoef(c, U[j], dir);
      if (Math.abs(kU) < 1e-12) return false;
      const head = [];
      for (let i = 0; i < U.length; i++) {
        const k = reactionForceCoef(c, U[i], dir);
        if (Math.abs(k) < 1e-12) continue;
        const kTxt = Math.abs(Math.abs(k) - 1) < 1e-9 ? '' : `·${fmt(Math.abs(k), 3)}`;
        if (i === j) head.push({ t: sym(c, U[i]) + kTxt, v: k });
        else if (known.has(i)) { const r = sol.R[i]; head.push({ t: fmt(Math.abs(r)) + kTxt, v: k * r }); known0 += k * r; }
        else return false;
      }
      const r = -known0 / kU;
      if (!check(j, r)) return false;
      lines.push(`Σ${dir} = 0 (${dir === 'V' ? 'nach oben' : 'nach rechts'} +): ${joinTerms(head.concat(terms))} = 0`);
      lines.push('→ ' + resultLine(j, r));
      known.set(j, r);
      return true;
    }

    // Resultierende, die man nicht direkt ablesen kann
    for (const ld of sys.loads) {
      if (ld.type !== 'q') continue;
      const [R, sc] = distRes(ld.x, ld.x2, ld.v, ld.v2);
      if (ld.sub === 'tri') {
        const l = (ld.x2 - ld.x) * (ld.basis === 'proj' ? c.ca : 1);
        lines.push(`Dreieckslast: R = ${fmtN(ld.mag)}·${fmtL(l)}/2 = ${fmt(R * (ld.basis === 'proj' ? c.ca : 1))} kN im Schwerpunkt bei ${c.X(sc)} (ein Drittel von der hohen Seite)`);
      } else if (c.incl) {
        const lp = (ld.x2 - ld.x) * c.ca, ls = ld.x2 - ld.x;
        lines.push(ld.basis === 'proj'
          ? `Last je m Grundriss: R = q·l = ${fmtN(ld.v)}·${fmtL(lp)} = ${fmt(ld.v * lp)} kN, senkrecht, in der Mitte (${c.X(sc)})`
          : `Last je m Stab: R = g·s = ${fmtN(ld.v)}·${fmtL(ls)} = ${fmt(ld.v * ls)} kN, senkrecht, in der Mitte (${c.X(sc)})`);
      }
    }
    if (sys.loads.some((l) => l.type === 'm')) lines.push('Linienmoment: Es zählt das Gesamtmoment m·Länge, ohne Hebelarm.');

    let ok = true;
    // 1) Gelenk: Teil mit nur einer senkrechten Unbekannten zuerst
    for (const h of sys.hinges) {
      for (const [lo, hi, side] of [[0, h, 'linker Teil'], [h, L, 'rechter Teil']]) {
        const js = U.map((u, j) => j).filter((j) => !known.has(j) && inRange(U[j], lo, hi) && U[j].c !== 'H');
        if (js.length === 1 && U[js[0]].c !== 'M') {
          lines.push(`Gelenk bei ${c.X(h)}: Dort ist M = 0, also Momentengleichgewicht nur am ${side === 'linker Teil' ? 'linken' : 'rechten'} Teil:`);
          ok = momentEq(js[0], h, 'G', lo, hi, side) && ok;
        }
      }
    }
    // 2) übrige Unbekannte
    const rest = () => U.map((u, j) => j).filter((j) => !known.has(j));
    const jM = rest().find((j) => U[j].c === 'M');
    const needH = () => {
      const jH = rest().find((j) => U[j].c === 'H');
      if (jH === undefined) return;
      const hasHload = sys.loads.some((l) => Math.abs(l.Fx) > 1e-9) || U.some((u) => u.c === 'N');
      if (hasHload) ok = forceEq(jH, 'H') && ok;
      else { lines.push(`${sym(c, U[jH])} = 0, weil keine waagerechte Last angreift.`); known.set(jH, 0); }
    };
    if (jM !== undefined) {
      const jV = rest().find((j) => U[j].c === 'V' && U[j].s === U[jM].s);
      if (jV !== undefined) ok = forceEq(jV, 'V') && ok;
      needH();
      ok = momentEq(jM, U[jM].x, c.names[U[jM].s], 0, L, '') && ok;
    } else {
      const vs = rest().filter((j) => U[j].c !== 'H');
      if (vs.length === 2) {
        // Drehpunkt dort, wo eine waagerechte Unbekannte sitzt (Festlager), sonst beim ersten Lager
        let jf = vs.find((j) => U.some((u, i) => i !== j && !known.has(i) && u.c === 'H' && u.s === U[j].s));
        if (jf === undefined) jf = vs[0];
        const jl = vs.find((j) => j !== jf);
        ok = momentEq(jl, U[jf].x, c.names[U[jf].s], 0, L, '') && ok;
        if (!c.incl && U[jf].c === 'V' && U[jl].c === 'V') {
          ok = momentEq(jf, U[jl].x, c.names[U[jl].s], 0, L, '') && ok;
          // Kontrolle über ΣV
          const parts = [];
          for (const j of [jf, jl].sort((a, b) => U[a].x - U[b].x)) parts.push({ t: fmt(Math.abs(sol.R[j])), v: sol.R[j] });
          for (const it of loadItems(c)) { const t = loadForceTerm(c, it, 'V'); if (t) parts.push({ t: fmt(Math.abs(t.v)), v: t.v }); }
          const hinged = known.size > 2;
          if (!hinged) lines.push(`Kontrolle ΣV: ${joinTerms(parts)} = 0 ✓`);
        } else {
          needH();
          ok = forceEq(jf, 'V') && ok;
        }
      } else if (vs.length === 1) ok = forceEq(vs[0], 'V') && ok;
    }
    needH();
    if (!ok || rest().length) {
      // Rückfall: nur die Ergebnisse
      return ['Auflagerkräfte aus ΣH = 0, ΣV = 0, ΣM = 0' + (sys.hinges.length ? ' und M = 0 am Gelenk:' : ':'),
        ...U.map((u, j) => (u.c === 'H' && Math.abs(sol.R[j]) < 1e-9 ? null : resultLine(j, reactionValue(c, j)))).filter(Boolean)];
    }
    return lines;
  }

  // ---------------------------------------------------------- Verlauf bereichsweise
  function pointCauses(c, s) {
    const { sys, e } = c, out = [];
    sys.sup.forEach((sp, i) => { if (Math.abs(sp.x - s) < 1e-6) out.push({ k: 'sup', i, txt: `Lager ${c.names[i]}`, short: `Lager ${c.names[i]}` }); });
    for (const ld of sys.loads) {
      if (Math.abs(ld.x - s) > 1e-6) continue;
      if (ld.type === 'F') {
        const txt = ld.sub === 'H' ? `H = ${fmtN(Math.abs(ld.Fx))} kN`
          : ld.sub === 'Fs' ? `F = ${fmtN(ld.mag)} kN schräg: F_v = ${fmt(ld.v)} kN, F_h = ${fmt(Math.abs(ld.Fx))} kN` : `F = ${fmtN(ld.v)} kN`;
        out.push({ k: 'F', txt, short: ld.sub === 'H' ? 'Horizontalkraft' : ld.sub === 'Fs' ? 'schräge Einzellast' : 'Einzellast' });
      }
      else if (ld.type === 'M') out.push({ k: 'M', txt: `Einzelmoment ${fmtN(Math.abs(ld.v))} kNm`, short: 'Einzelmoment' });
    }
    sys.hinges.forEach((h) => { if (Math.abs(h - s) < 1e-6) out.push({ k: 'G', txt: 'Gelenk' }); });
    if ((s < e || s > c.L - e) && !sys.sup.some((sp) => Math.abs(sp.x - s) < 1e-6)) out.push({ k: 'free', txt: 'freies Ende' });
    return out;
  }
  function regionLoads(c, a, b) {
    return c.sys.loads.filter((ld) => (ld.type === 'q' || ld.type === 'm') && ld.x <= a + c.e && ld.x2 >= b - c.e);
  }
  function regionDesc(c, lds) {
    if (!lds.length) return 'unbelastet';
    return lds.map((ld) => {
      if (ld.type === 'm') return `m = ${fmtN(Math.abs(ld.v))} kNm/m`;
      const bs = c.incl ? (ld.basis === 'proj' ? ' je m Grundriss' : ' je m Stab') : '';
      return ld.sub === 'tri' ? `Dreieckslast bis ${fmtN(ld.mag)} kN/m${bs}` : `q = ${fmtN(ld.v)} kN/m${bs}`;
    }).join(' und ');
  }
  // erwarteter Verlauf im Bereich: 0 konstant, 1 linear, 2 quadratisch, 3 kubisch
  function expectedDegree(c, lds, Q, va, vb) {
    const q = lds.filter((l) => l.type === 'q'), tri = q.some((l) => l.sub === 'tri');
    const flat = Math.abs(va - vb) < 1e-4 * c.scale[Q];
    if (Q === 'N') return c.incl && q.length ? 1 : 0;
    if (Q === 'V') return q.length ? (tri ? 2 : 1) : 0;
    if (q.length) return tri ? 3 : 2;
    return flat ? 0 : 1;
  }
  const DEG_WORD = { V: ['konstant', 'linear', 'quadratisch'], M: ['konstant', 'linear', 'als Parabel', 'kubisch'], N: ['konstant', 'linear'] };
  function bisect(f, a, b) {
    let fa = f(a);
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2, fm = f(m);
      if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }
  function regionLine(c, a, b, Qs) {
    const lds = regionLoads(c, a, b);
    const parts = [];
    let extra = '';
    for (const Q of Qs) {
      const va = c.right(a, Q), vb = c.left(b, Q), u = UNIT[Q];
      const d = expectedDegree(c, lds, Q, va, vb);
      if (d === 0) parts.push(`${QNAME[Q]} = ${fmt(va)} ${u} konstant${Q === 'N' && Math.abs(va) > 1e-4 * c.scale.N ? (va > 0 ? ' (Zug)' : ' (Druck)') : ''}`);
      else parts.push(`${QNAME[Q]} ${DEG_WORD[Q][d]} von ${fmt(va)} ${u} auf ${fmt(vb)} ${u}`);
      if (Q === 'V' && Qs.includes('M') && lds.some((l) => l.type === 'q') && !lds.some((l) => l.type === 'm') && va * vb < 0) {
        const s0 = bisect((s) => c.at(s, 'V'), a + c.e * 10, b - c.e * 10);
        extra = `; V = 0 bei ${c.X(s0)}, dort Extremwert M = ${fmt(c.at(s0, 'M'))} kNm`;
      }
    }
    const desc = Qs.includes('N') ? '' : ` (${regionDesc(c, lds)})`;
    return `${c.px(a)} ≤ x ≤ ${c.px(b)} m${desc}: ${parts.join('; ')}${extra}`;
  }
  function eventLine(c, s, Qs) {
    const causes = pointCauses(c, s);
    if (!causes.length) return '';
    const jumps = [];
    for (const Q of Qs) {
      const l = c.left(s, Q), r = c.right(s, Q), d = r - l, u = UNIT[Q];
      if (Math.abs(d) > 1e-4 * c.scale[Q]) {
        if (s < c.e) jumps.push(`${QNAME[Q]} beginnt mit ${fmt(r)} ${u}`);
        else if (s > c.L - c.e) jumps.push(`${QNAME[Q]} springt von ${fmt(l)} ${u} auf 0`);
        else jumps.push(`${QNAME[Q]} springt um ${fmt(d)} ${u} auf ${fmt(r)} ${u}`);
      } else if (Q === 'M' && Math.abs(c.at(s, 'M')) < 1e-4 * c.scale.M && causes.some((k) => ['G', 'free', 'sup'].includes(k.k))) jumps.push('M = 0');
      else if (Q === 'V' && causes.some((k) => k.k === 'free') && Math.abs(c.at(s, 'V')) < 1e-4 * c.scale.V) jumps.push('V = 0');
    }
    if (Qs.includes('M') && causes.some((k) => k.k === 'F' || k.k === 'sup') && s > c.e && s < c.L - c.e) {
      const vl = c.left(s, 'V'), vr = c.right(s, 'V');
      if (Math.abs(vr - vl) > 1e-4 * c.scale.V) jumps.push('Knick in M');
    }
    if (!jumps.length) return '';
    // Lagerreaktionen, die zur betrachteten Größe gehören
    const wantC = Qs.includes('N') ? ['H', 'N'] : ['V', 'N', 'M'];
    const rx = causes.filter((k) => k.k === 'sup').map((k) => {
      const js = c.sol.unk.map((u, j) => j).filter((j) => c.sol.unk[j].s === k.i && wantC.includes(c.sol.unk[j].c) && Math.abs(c.sol.R[j]) > 1e-9);
      return js.map((j) => `${sym(c, c.sol.unk[j])} = ${fmt(reactionValue(c, j))} ${unitOf(c.sol.unk[j])}`).join(', ');
    }).filter(Boolean);
    const head = causes.map((k) => k.txt).join(', ') + (rx.length ? `, ${rx.join(', ')}` : '');
    return `${c.X(s)} (${head}): ${jumps.join(', ')}`;
  }
  function courseLines(c, focus) {
    const Qs = focus === 'N' ? ['N'] : ['V', 'M'];
    if (focus === 'N' && c.scale.N < 1e-6) return ['Keine Last wirkt längs der Stabachse, also ist N = 0 im ganzen Träger.'];
    const cp = critPts(c.sys), out = [];
    if (c.incl) {
      out.push(focus === 'N'
        ? 'Schräger Stab: N wirkt längs der Stabachse. Eine senkrechte Kraft F trägt F·sin α zu N bei (α = Neigung).'
        : 'Schräger Stab: V wirkt quer zur Stabachse. Eine senkrechte Kraft F trägt F·cos α zu V bei, deshalb ist V am Lager kleiner als die senkrechte Lagerkraft.');
    }
    let prev = null;     // letzter konstanter N-Bereich, zum Zusammenfassen
    for (let i = 0; i < cp.length; i++) {
      const ev = eventLine(c, cp[i], Qs);
      if (ev) { out.push(ev); prev = null; }
      if (i < cp.length - 1 && cp[i + 1] - cp[i] > 1e-6) {
        const a = cp[i], b = cp[i + 1];
        if (focus === 'N') {
          const va = c.right(a, 'N'), vb = c.left(b, 'N');
          const flat = Math.abs(va - vb) < 1e-4 * c.scale.N;
          if (flat && prev && Math.abs(prev.v - va) < 1e-4 * c.scale.N) {
            prev.b = b;
            out[prev.idx] = regionLine(c, prev.a, b, Qs);
            continue;
          }
          out.push(regionLine(c, a, b, Qs));
          prev = flat ? { a, b, v: va, idx: out.length - 1 } : null;
        } else out.push(regionLine(c, a, b, Qs));
      }
    }
    return out;
  }

  // ---------------------------------------------------------- Warum die Wahl falsch ist
  // Ortsangaben: bei „Verlauf zum System“ in Metern (das System ist bemaßt), bei „System zum Verlauf“
  // als Anteil der Länge (die kleinen Systembilder haben keine Maße)
  function relNoun(f) {
    if (f < 0.03) return 'dem linken Ende';
    if (f > 0.97) return 'dem rechten Ende';
    const T = [[0.25, 'einem Viertel'], [1 / 3, 'einem Drittel'], [0.5, 'der Mitte'], [2 / 3, 'zwei Dritteln'], [0.75, 'drei Vierteln']];
    for (const [v, w] of T) if (Math.abs(f - v) < 0.03) return w;
    return `etwa ${Math.round(f * 10) * 10} %`;
  }
  function placer(c, mode) {
    if (mode !== 'sys') return { P: (s) => `bei ${c.X(s)}`, RG: (a, b) => `von ${c.X(a)} bis ${c.px(b)} m` };
    const P = (s) => {
      const n = relNoun(s / c.L);
      if (n === 'dem linken Ende') return 'am linken Ende';
      if (n === 'dem rechten Ende') return 'am rechten Ende';
      if (n === 'der Mitte') return 'in der Mitte';
      return `bei ${n} der Länge`;
    };
    return { P, RG: (a, b) => `zwischen ${relNoun(a / c.L)} und ${relNoun(b / c.L)}` };
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // g(s): gewählter Verlauf; gl/gr: links- und rechtsseitiger Wert; extraJumps: Stellen, an denen nur die Wahl springt
  // Vergleicht einen falschen Verlauf g mit dem richtigen.
  // mode 'diag': Antwortbilder sind einzeln skaliert und ohne Zahlen – also nur Formmerkmale
  //              (Vorzeichen, Nullstellen am Rand, Sprünge, Knicke, Form, Lage des Maximums).
  // mode 'sys':  Der gezeigte Verlauf (mit Werten) ist richtig, g gehört zu einem anderen System.
  function curveWhy(c, Q, g0, gl0, gr0, extraJumps, mode) {
    const sys = mode === 'sys';
    const nm = QNAME[Q], u = UNIT[Q];
    const ss = [];
    for (let i = 0; i <= 160; i++) ss.push(c.L * (0.002 + 0.996 * i / 160));
    const sc = c.scale[Q];
    // im Diagramm-Modus auf gleiche Höhe skalieren, damit nur die Form zählt
    let k = 1;
    if (!sys) { const gm = maxAbs(ss.map(g0)); if (gm > 1e-9) k = sc / gm; }
    const g = (s) => k * g0(s), gl = (s) => k * gl0(s), gr = (s) => k * gr0(s);
    const tol = 0.08 * sc;
    const { P, RG } = placer(c, mode);
    const you = sys ? 'Dieses System ergäbe' : 'Deine Wahl';
    const cp = critPts(c.sys);
    const signWord = (v) => (Q === 'M' ? (v > 0 ? 'positiv (Zug unten, auf der Seite der gestrichelten Faser)' : 'negativ (Zug oben)')
      : Q === 'N' ? (v > 0 ? 'positiv (Zug)' : 'negativ (Druck)') : (v > 0 ? 'positiv' : 'negativ'));
    const regionMid = (s) => { for (let i = 0; i < cp.length - 1; i++) if (s >= cp[i] && s <= cp[i + 1]) return (cp[i] + cp[i + 1]) / 2; return s; };
    const causesAt = (s) => pointCauses(c, s).filter((x) => x.k !== 'G' && x.k !== 'free').map((x) => x.short || x.txt).join(', ');
    const realJump = (s0) => {
      if (sys) return '';
      if (regionLoads(c, s0 - c.e, s0 + c.e).some((l) => l.type === 'q')) return ' Dort liegt nur die Streckenlast – sie wirkt verteilt und lässt den Verlauf stetig, ohne Sprung.';
      const js = cp.filter((p) => p > c.e && p < c.L - c.e && Math.abs(c.right(p, Q) - c.left(p, Q)) > tol);
      if (!js.length) return '';
      const n0 = js.reduce((m, p) => (Math.abs(p - s0) < Math.abs(m - s0) ? p : m));
      return ` Richtig springt ${nm} ${P(n0)} (${causesAt(n0)}).`;
    };
    const jumpWhy = Q === 'M' ? 'ein Einzelmoment lässt M springen' : Q === 'N' ? 'eine Kraft längs der Stabachse lässt N springen' : 'eine Kraft quer zum Stab lässt V um ihren Betrag springen';

    // 1) Vorzeichen: gleiche Form, gespiegelt
    const dev = ss.reduce((m, s) => m + Math.abs(g(s) + c.at(s, Q)), 0) / ss.length;
    const same = ss.reduce((m, s) => m + Math.abs(g(s) - c.at(s, Q)), 0) / ss.length;
    if (dev < 0.06 * sc && same > 0.3 * sc) {
      let sm = ss[0];
      for (const s of ss) if (Math.abs(c.at(s, Q)) > Math.abs(c.at(sm, Q))) sm = s;
      const smid = regionMid(sm);
      const sp = Math.abs(c.at(smid, Q)) > 0.5 * Math.abs(c.at(sm, Q)) ? smid : sm;
      const v = c.at(sp, Q);
      const out = [sys
        ? `Dieses System ergäbe genau den gespiegelten Verlauf: ${P(sp)} wäre ${nm} ${v > 0 ? 'negativ' : 'positiv'}, gezeigt ist ${signWord(v)}.`
        : `Die Form stimmt, aber das Vorzeichen ist umgekehrt: ${cap(P(sp))} ist ${nm} ${signWord(v)}.`];
      if (Q === 'V') {
        const j = c.sol.unk.findIndex((x) => Math.abs(x.x) < c.e && x.c === 'V');
        if (j >= 0) out.push(`Schnitt direkt rechts vom linken Lager: Am linken Teil wirkt nur ${sym(c, c.sol.unk[j])} nach ${c.sol.R[j] >= 0 ? 'oben' : 'unten'}. Damit das Teil im Gleichgewicht ist, zeigt V am Schnittufer nach ${c.sol.R[j] >= 0 ? 'unten – das ist die positive Richtung' : 'oben – das ist die negative Richtung'}.`);
        else if (!c.sys.sup.some((p) => p.x < c.e)) out.push('Am freien linken Ende beginnt V bei 0. Lasten nach unten lassen V nach rechts kleiner werden (dV/dx = −q), also wird V negativ.');
      } else if (Q === 'M') out.push('Merkhilfe: M wird auf der Zugseite angetragen. Hängt der Träger zwischen zwei Lagern durch, ist unten Zug; über einer Einspannung oder einem Innenlager ist oben Zug.');
      else if (Q === 'N') out.push('Zieht die Last vom Festlager bzw. von der Einspannung weg, wird der Stab dazwischen gedehnt (Zug). Drückt sie dorthin, wird er gestaucht (Druck).');
      return out;
    }
    // 2) Randbedingungen M = 0 / V = 0
    const bcs = [];
    if (Q === 'M') {
      for (const h of c.sys.hinges) bcs.push({ s: h, at: 'Am Gelenk', there: 'dort sitzt ein Gelenk', why: 'ein Gelenk kein Moment überträgt' });
      for (const s of [0, c.L]) {
        if (pointCauses(c, s).some((x) => x.k === 'free')) bcs.push({ s, at: 'Am freien Ende', there: 'dort ist das freie Ende', why: 'dort nichts dagegenhält' });
        else {
          const sp = c.sys.sup.find((p) => Math.abs(p.x - s) < 1e-6);
          if (sp && sp.type !== 'einsp') {
            const nmS = c.names[c.sys.sup.indexOf(sp)];
            bcs.push({ s, at: `Am gelenkigen Endlager ${nmS}`, there: `dort sitzt das gelenkige Lager ${nmS}`, why: 'ein gelenkiges Lager kein Moment aufnimmt' });
          }
        }
      }
    } else if (Q === 'V') {
      for (const s of [0, c.L]) if (pointCauses(c, s).some((x) => x.k === 'free')) bcs.push({ s, at: 'Am freien Ende', there: 'dort ist das freie Ende', why: 'dort keine Kraft angreift' });
    }
    for (const b of bcs) {
      const s = Math.min(Math.max(b.s, c.L * 0.004), c.L * 0.996), v = c.at(s, Q), gv = g(s);
      if (Math.abs(v) < 0.02 * sc && Math.abs(gv) > tol) {
        return [sys
          ? `Der gezeigte Verlauf ist ${P(b.s)} null, ${b.there}. ${you} dort ${nm} ≠ 0.`
          : `${b.at} (${c.X(b.s)}) muss ${nm} = 0 sein, weil ${b.why}. ${you} ist dort nicht null.`];
      }
    }
    // 3) Sprünge
    for (const s of cp) {
      if (s <= c.e || s >= c.L - c.e) continue;
      const dc = c.right(s, Q) - c.left(s, Q), dg = gr(s) - gl(s);
      const hasC = Math.abs(dc) > tol, hasG = Math.abs(dg) > tol;
      if (hasC && !hasG) {
        return [sys
          ? `Der gezeigte Verlauf springt ${P(s)} um ${fmt(dc)} ${u}. So ein Sprung entsteht nur durch ${Q === 'M' ? 'ein Einzelmoment' : Q === 'N' ? 'eine Kraft längs der Stabachse' : 'eine Einzellast oder ein Lager'} genau an dieser Stelle. Dieses System hat dort nichts davon.`
          : `Bei ${c.X(s)} (${causesAt(s)}) muss ${nm} springen, denn ${jumpWhy}. ${you} verläuft dort ohne Sprung.`];
      }
      if (!hasC && hasG) {
        return [sys
          ? `Dieses System hätte ${P(s)} einen Sprung in ${nm}. Der gezeigte Verlauf ist dort aber stetig.`
          : `${you} springt bei ${c.X(s)}. Dort greift aber nichts an, was ${nm} springen lässt${Q === 'M' ? ' – dafür bräuchte es ein Einzelmoment' : ''}.${realJump(s)}`];
      }
      if (hasC && hasG && Math.sign(dc) !== Math.sign(dg)) {
        return [sys
          ? `Der gezeigte Verlauf springt ${P(s)} ${dc > 0 ? 'nach oben' : 'nach unten'}, dieses System ergäbe einen Sprung ${dg > 0 ? 'nach oben' : 'nach unten'}.`
          : `Bei ${c.X(s)} (${causesAt(s)}) springt ${nm} in die falsche Richtung: richtig ist ein Sprung ${dc > 0 ? 'zu größeren' : 'zu kleineren'} Werten.`];
      }
      if (sys && hasC && hasG && Math.abs(dc - dg) > tol) {
        return [`Der gezeigte Verlauf springt ${P(s)} um ${fmt(dc)} ${u}, dieses System ergäbe dort ${fmt(dg)} ${u}.`];
      }
    }
    for (const s of extraJumps) {
      if (s <= 0.01 * c.L || s >= 0.99 * c.L || cp.some((p) => Math.abs(p - s) < 0.02 * c.L)) continue;
      if (Math.abs(gr(s) - gl(s)) <= tol) continue;
      return [sys
        ? `Dieses System hätte ${P(s)} einen Sprung in ${nm}. Der gezeigte Verlauf ist dort aber stetig.`
        : `${you} springt bei ${c.X(s)}. An dieser Stelle greift aber keine Einzellast an – ein Sprung braucht ${Q === 'M' ? 'ein Einzelmoment' : 'eine Einzellast'}.${realJump(s)}`];
    }
    // 4) Form im Bereich
    const shape = (f, a, w) => {
      const p = [0.06, 0.28, 0.5, 0.72, 0.94].map((t) => f(a + t * w));
      const lin = (t) => p[0] + (p[4] - p[0]) * (t - 0.06) / 0.88;
      return { range: Math.max(...p) - Math.min(...p), curv: Math.max(...[0.28, 0.5, 0.72].map((t, j) => Math.abs(p[j + 1] - lin(t)))) };
    };
    for (let i = 0; i < cp.length - 1; i++) {
      const a = cp[i], b = cp[i + 1], w = b - a;
      if (w < 0.12 * c.L) continue;
      const lds = regionLoads(c, a, b);
      const C = shape((s) => c.at(s, Q), a, w), G = shape(g, a, w);
      const want = C.range < 1e-3 * sc ? 0 : C.curv < 1e-3 * sc ? 1 : 2;
      let got;
      if (G.range < 0.03 * sc) got = 0;
      else if (want === 2) got = G.curv < 0.35 * C.curv ? 1 : 2;
      else got = G.curv > Math.max(0.02 * sc, 0.08 * G.range) ? 2 : 1;
      if (got === want) {
        const cz = Math.max(...[0.2, 0.5, 0.8].map((t) => Math.abs(c.at(a + t * w, Q)))) < 0.02 * sc;
        const gz = Math.max(...[0.2, 0.5, 0.8].map((t) => Math.abs(g(a + t * w)))) < 0.04 * sc;
        if (cz !== gz) {
          const why0 = Q === 'N' ? 'Normalkraft gibt es nur zwischen der Längslast und dem Lager, das sie aufnimmt (Festlager bzw. Einspannung)'
            : Q === 'V' ? 'auf diesem Abschnitt bis zum Rand greift keine Querlast an' : 'auf diesem Abschnitt bis zum Rand greift nichts an, was ein Moment erzeugt';
          return [sys
            ? `Der gezeigte Verlauf ist ${RG(a, b)} ${cz ? 'null' : 'nicht null'}. Dieses System ergäbe dort ${cz ? 'einen Wert ungleich null' : 'null'}.`
            : cz ? `${cap(RG(a, b))} ist ${nm} = 0 – ${why0}. ${you} zeigt dort ${nm} ≠ 0.`
              : `${cap(RG(a, b))} ist ${nm} nicht null. ${you} ist dort null.${Q === 'N' ? ' Prüf, welches Lager die Längskraft aufnimmt – nur das Festlager bzw. die Einspannung kann das.' : ''}`];
        }
        continue;
      }
      const zero = want === 0 && Math.abs(c.at(a + w / 2, Q)) < 0.02 * sc;
      const deg = expectedDegree(c, lds, Q, c.at(a, Q), c.at(b, Q));
      const words = ['konstant', 'linear', 'gekrümmt'];
      const wantTxt = zero ? 'null' : want === 2 ? (DEG_WORD[Q][deg] || 'gekrümmt') : words[want];
      const reason = zero ? 'zwischen diesem Abschnitt und dem freien Ende greift keine Last an' : Q === 'V'
        ? (want === 0 ? 'ohne Streckenlast ist dV/dx = −q = 0' : 'unter der Streckenlast ändert sich V stetig (dV/dx = −q)')
        : Q === 'M'
          ? (want === 2 ? 'unter einer Streckenlast ist M gekrümmt (d²M/dx² = −q)' : want === 1 ? 'ohne Streckenlast ist V konstant, also ist M eine Gerade' : zero ? 'dort wirkt kein Moment mehr' : 'dort ist V = 0, also ändert sich M nicht')
          : (want === 0 ? 'ohne Last längs der Achse bleibt N gleich' : 'die Last längs der Achse ändert N stetig');
      const gotTxt = got === 0 ? 'nahezu konstant' : words[got];
      return [sys
        ? `Der gezeigte Verlauf ist ${RG(a, b)} ${wantTxt} – ${reason}. Dieses System ergäbe dort einen ${['konstanten', 'geraden', 'gekrümmten'][got]} Verlauf.`
        : `${cap(RG(a, b))} (${regionDesc(c, lds)}) ${zero ? `muss ${nm} = 0 sein` : `verläuft ${nm} ${wantTxt}`}, denn ${reason}. ${you} ist dort ${gotTxt}.`];
    }
    // 5) Knicke (nur Diagramm): z. B. Einzellast → Knick in M
    if (!sys && Q !== 'N') {
      const h = 0.02 * c.L;
      const slope = (f, s, dir) => (dir > 0 ? f(s + h) - f(s + 0.2 * h) : f(s - 0.2 * h) - f(s - h)) / (0.8 * h);
      for (const s of cp) {
        if (s <= 2 * h || s >= c.L - 2 * h) continue;
        const cf = (x) => c.at(x, Q);
        const kc = Math.abs(slope(cf, s, 1) - slope(cf, s, -1)) * c.L, kg = Math.abs(slope(g, s, 1) - slope(g, s, -1)) * c.L;
        if (kc > 0.5 * sc && kg < 0.15 * kc) {
          return [`Bei ${c.X(s)} (${causesAt(s)}) hat ${nm} einen Knick, weil ${Q === 'M' ? 'V dort springt (dM/dx = V)' : 'sich dort die Streckenlast ändert (dV/dx = −q)'}. ${you} verläuft dort glatt.`];
        }
      }
    }
    // 6) Vorzeichenbereiche
    let worst = null;
    for (const s of ss) {
      const v = c.at(s, Q), gv = g(s);
      if (Math.abs(v) > 0.2 * sc && Math.abs(gv) > 0.2 * sc && Math.sign(v) !== Math.sign(gv) && (!worst || Math.abs(v) > Math.abs(c.at(worst, Q)))) worst = s;
    }
    if (worst !== null) {
      const v = c.at(worst, Q);
      return [sys
        ? `${cap(P(worst))} ist der gezeigte Verlauf ${v > 0 ? 'positiv' : 'negativ'}, dieses System ergäbe dort das umgekehrte Vorzeichen.`
        : `${cap(P(worst))} ist ${nm} ${signWord(v)}. ${you} liegt dort auf der anderen Seite.`];
    }
    // 7) Lage des Extremwerts
    let sm = ss[0], gm = ss[0];
    for (const s of ss) { if (Math.abs(c.at(s, Q)) > Math.abs(c.at(sm, Q))) sm = s; if (Math.abs(g(s)) > Math.abs(g(gm))) gm = s; }
    if (Math.abs(sm - gm) > 0.1 * c.L && Math.abs(c.at(gm, Q)) < 0.95 * Math.abs(c.at(sm, Q)) && Math.abs(g(sm)) < 0.95 * Math.abs(g(gm))) {
      return [sys
        ? `Im gezeigten Verlauf liegt |${nm}|max ${P(sm)}. Bei diesem System läge es ${P(gm)}.`
        : `|${nm}|max liegt ${P(sm)}${Q === 'M' && Math.abs(c.at(sm, 'V')) < 0.05 * c.scale.V ? ', dort wo V = 0 ist' : ''}. ${you} hat das Maximum ${P(gm)}.`];
    }
    // 8) Nullstellen / Vorzeichenwechsel
    const zeros = (f) => { const z = []; for (let i = 1; i < ss.length; i++) { const p0 = f(ss[i - 1]), p1 = f(ss[i]); if (Math.abs(p0) > 0.03 * sc && Math.abs(p1) > 0.03 * sc && Math.sign(p0) !== Math.sign(p1)) z.push((ss[i - 1] + ss[i]) / 2); } return z; };
    const zc = zeros((s) => c.at(s, Q)), zg = zeros(g);
    for (const z of zc) {
      if (zg.some((y) => Math.abs(y - z) < 0.08 * c.L)) continue;
      const hint = Q === 'V' ? ' – dort hat M sein Extremum' : Q === 'M' && c.sys.hinges.some((h) => Math.abs(h - z) < 0.02 * c.L) ? ' – dort sitzt das Gelenk' : '';
      const near = zg.length ? zg.reduce((m, y) => (Math.abs(y - z) < Math.abs(m - z) ? y : m)) : null;
      return [sys
        ? `Der gezeigte Verlauf wechselt ${P(z)} das Vorzeichen${hint}. Dieses System ${near === null ? 'hätte keinen Vorzeichenwechsel' : `wechselt ${P(near)}`}.`
        : `${nm} wechselt ${P(z)} das Vorzeichen${hint}. ${you} ${near === null ? 'hat gar keinen Vorzeichenwechsel' : `wechselt ${P(near)}`}.`];
    }
    if (!sys && zg.length > zc.length) {
      const extra = zg.find((y) => !zc.some((z) => Math.abs(y - z) < 0.08 * c.L));
      if (extra !== undefined) return [`${you} wechselt ${P(extra)} das Vorzeichen, der richtige Verlauf ${zc.length ? 'nur an anderer Stelle' : 'bleibt durchgehend ' + signWord(c.at(c.L / 2, Q) || c.at(ss[ss.length >> 2], Q)).split(' ')[0]}.`];
    }
    // 9) Proportionen
    let sd = ss[0];
    for (const s of ss) if (Math.abs(g(s) - c.at(s, Q)) > Math.abs(g(sd) - c.at(sd, Q))) sd = s;
    if (sys) return [`Der Verlauf dieses Systems weicht ${P(sd)} deutlich vom gezeigten ab.`];
    const pc = (v) => Math.round(Math.abs(v) / sc * 100);
    return [`Die Form ist ähnlich, aber die Proportionen stimmen nicht: ${cap(P(sd))} erreicht ${nm} etwa ${pc(c.at(sd, Q))} % des Größtwerts, deine Wahl zeigt dort etwa ${pc(g(sd))} %.`];
  }

  function clickWhy(c, q, sTap) {
    const Q = q.type.startsWith('clickV') ? 'V' : 'M', u = UNIT[Q];
    const out = [];
    if (!isNaN(sTap)) out.push(`Dein Tipp: ${c.X(sTap)}, dort ist ${Q} = ${fmt(c.at(sTap, Q))} ${u}.`);
    // nächstgelegene Zielstelle
    let sT = q.target[0];
    if (!isNaN(sTap)) for (const t of q.target) if (Math.abs(t - sTap) < Math.abs(sT - sTap)) sT = t;
    const cp = critPts(c.sys);
    const atCrit = cp.find((p) => Math.abs(p - sT) < 0.012 * c.L);
    const causes = atCrit !== undefined ? pointCauses(c, atCrit) : [];
    const ctxt = causes.map((k) => (k.k === 'sup' ? `über Lager ${c.names[k.i]}` : k.k === 'G' ? 'am Gelenk' : k.k === 'free' ? 'am freien Ende' : `unter ${k.txt}`)).join(', ');
    const sp = atCrit !== undefined ? c.sys.sup.find((p) => Math.abs(p.x - atCrit) < 1e-6) : null;
    let reason;
    if (q.type === 'clickMmax') {
      const v = c.at(sT, 'M');
      if (sp && sp.type === 'einsp') reason = `an der Einspannung ist |M| am größten (${fmt(v)} kNm)`;
      else if (ctxt) reason = `${ctxt} wechselt V das Vorzeichen, also hat M dort sein Extremum (${fmt(v)} kNm)`;
      else reason = `dort wird V = 0 (Streckenlast), also hat M dort sein Extremum (${fmt(v)} kNm)`;
    } else if (q.type === 'clickVmax') {
      const v = Math.max(Math.abs(c.left(sT, 'V')), Math.abs(c.right(sT, 'V')));
      reason = ctxt ? `${ctxt} wird die größte Kraft eingeleitet, |V| = ${fmt(v)} kN` : `dort ist |V| = ${fmt(v)} kN am größten`;
    } else if (q.type === 'clickV0') {
      reason = ctxt ? `${ctxt} springt V über die Null` : 'dort wird V unter der Streckenlast zu null';
    } else {
      reason = ctxt && causes.some((k) => k.k === 'G') ? 'am Gelenk ist M immer null' : 'dort wechselt M zwischen positivem Feldmoment und negativem Stützmoment das Vorzeichen';
    }
    out.push(`Gesucht war ${c.X(sT)}: ${reason}.`);
    return out;
  }

  // ---------------------------------------------------------- Zusammenbau
  function focusOf(type) {
    if (['diagN', 'sysFromN'].includes(type)) return 'N';
    if (['diagV', 'valR', 'clickV0', 'clickVmax', 'sysFromV'].includes(type)) return 'V';
    return 'M';
  }

  // ans: { ok, chosen, clickS, tag }
  function feedback(q, ans) {
    const sys = q.sys, sol = q.sol || solveSys(sys);
    const c = context(sys, sol);
    const focus = focusOf(q.type);
    const why = [];
    const opt = ans.chosen >= 0 && q.opts ? q.opts[ans.chosen] : null;
    if (!ans.ok && ans.tag !== 'zeit') {
      try {
        if (N.isClickType(q.type)) why.push(...clickWhy(c, q, ans.clickS));
        else if (opt && q.type.startsWith('diag')) {
          const L = c.L, d = 0.003 * L;
          const g = (s) => interp1(opt.xs, opt.f, s);
          const jumps = [];
          for (let i = 0; i < opt.xs.length - 1; i++) if (opt.xs[i + 1] - opt.xs[i] < 1e-4 * L) jumps.push((opt.xs[i] + opt.xs[i + 1]) / 2);
          why.push(...curveWhy(c, q.qty, g, (s) => g(s - d), (s) => g(s + d), jumps, 'diag'));
        } else if (opt && q.type.startsWith('sysFrom')) {
          const so = solveSys(opt.sys), Lo = opt.sys.L, k = Lo / c.L, Q = q.qty;
          const g = (s) => sgAt(so, Math.min(Math.max(s * k, 0), Lo))[Q];
          const e = 1e-6 * Lo;
          const jumps = critPts(opt.sys).map((s) => s / k);
          why.push(...curveWhy(c, Q, g, (s) => sgAt(so, Math.max(s * k - e, 0))[Q], (s) => sgAt(so, Math.min(s * k + e, Lo))[Q], jumps, 'sys'));
        }
      } catch (er) { /* Erklärung ist Zusatz – nie die Aufgabe blockieren */ }
      if (opt && opt.expl) why.push((why.length ? 'Typischer Denkfehler: ' : '') + opt.expl);
      if (opt && q.type.startsWith('val')) {
        const cor = q.opts[q.correct];
        why.push(`Richtig ist ${cor.label}, deine Wahl war ${opt.label}.`);
      }
    } else if (ans.tag === 'zeit') why.push('Die Zeit ist abgelaufen. Unten steht, wie man schnell auf die Lösung kommt.');

    const sections = [];
    if (!q.symbolic) {
      let rs = [];
      try { rs = reactionSteps(c); } catch (er) { rs = []; }
      if (rs.length) sections.push({ title: 'Auflagerkräfte', lines: rs });
      if (q.type !== 'valR') {
        let cl = [];
        try { cl = courseLines(c, focus); } catch (er) { cl = []; }
        if (cl.length) sections.push({ title: focus === 'N' ? 'Verlauf von N' : 'Verlauf von V und M', lines: cl });
      }
    }
    // Merksätze passend zur gefragten Größe
    const rel = (r) => (focus === 'N' ? /\bN\b|Normalkraft|längs|Festlager/.test(r) : !/^Horizontalkraft|N > 0 ist Zug|Die Normalkraft hängt/.test(r));
    const merke = featureRules(sys, focus).filter(rel).slice(0, 4);
    const cl = !q.symbolic && classicLine(sys);
    if (cl) merke.unshift('Standardfall: ' + cl);
    sections.push({ title: 'Merke', lines: merke });
    return { why, sections };
  }

  N.explain = { feedback, reactionSteps, courseLines, context, curveWhy };
})(typeof window !== 'undefined' ? window : globalThis);
