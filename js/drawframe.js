/* NVM – Stabwerke zeichnen
 * System (Stäbe, Gelenke, Lager, Lasten, Bemaßung) und Schnittgrößenverläufe
 * senkrecht zu jedem Stab. Positiv wird zur gestrichelten Faser (+z) angetragen.
 */
(function (root) {
  'use strict';
  const NVM = root.NVM;
  const { fmt, fmtL, fmtN } = NVM;
  const { text, line, arrowL, makeLabeler, support, momentArc, beamSvg, FIB, SUP, dimTick, r1, esc } = NVM.draw._;
  const F = NVM.frame;

  const uniq = (a, d = 1e-6) => a.slice().sort((p, q) => p - q).filter((v, i, s) => !i || v - s[i - 1] > d);

  // Weltkoordinaten (y oben) auf das Bild abbilden
  function layout(fr, W, Hmin, Hmax, m) {
    const xs = fr.nodes.map((n) => n.x), ys = fr.nodes.map((n) => n.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 1e-9), h = Math.max(y1 - y0, 1e-9);
    let k = (W - m.l - m.r) / w;
    if (h > 1e-6) k = Math.min(k, (Hmax - m.t - m.b) / h);
    const H = Math.max(Hmin, Math.min(Hmax, (y1 - y0) * k + m.t + m.b));
    const ox = m.l + (W - m.l - m.r - (x1 - x0) * k) / 2;
    const oy = m.t + (H - m.t - m.b - (y1 - y0) * k) / 2;
    const P = (x, y) => [ox + (x - x0) * k, oy + (y1 - y) * k];
    return { P, k, H, x0, x1, y0, y1 };
  }

  // Bildschirmrichtungen eines Stabs
  function scr(fr, i, L) {
    const g = F.geom(fr, i), A = L.P(g.A.x, g.A.y), B = L.P(g.B.x, g.B.y);
    return { g, A, B, e: [g.e[0], -g.e[1]], z: [g.z[0], -g.z[1]], len: g.l * L.k, at: (s) => [A[0] + g.e[0] * s * L.k, A[1] - g.e[1] * s * L.k] };
  }

  // Richtungen, in die vom Knoten aus Stäbe gehen (Bildschirm, Einheitsvektoren)
  function nodeDirs(fr, j, L) {
    const d = [];
    fr.members.forEach((m, i) => {
      if (m.a !== j && m.b !== j) return;
      const s = scr(fr, i, L);
      d.push(m.a === j ? s.e : [-s.e[0], -s.e[1]]);
    });
    return d;
  }
  // freieste Richtung aus Kandidaten (Winkel in Grad, Bildschirm)
  function freest(dirs, cands) {
    let best = cands[0], bv = -Infinity;
    for (const c of cands) {
      const v = [Math.cos(c * Math.PI / 180), Math.sin(c * Math.PI / 180)];
      const cl = dirs.length ? Math.max(...dirs.map((d) => d[0] * v[0] + d[1] * v[1])) : -1;
      if (-cl > bv + 1e-6) { bv = -cl; best = c; }
    }
    return best;
  }

  // gelenkige Stabenden: Kreis am Knoten, wenn dort nichts biegesteif verbunden ist, sonst kurz davor auf dem Stab
  function hingeMarks(fr, L, compact) {
    const r = compact ? 3.6 : 5;
    let g = '';
    fr.nodes.forEach((n, j) => {
      let rigid = 0, rel = [];
      fr.members.forEach((m, i) => {
        if (m.a !== j && m.b !== j) return;
        const isRel = m.truss || n.hinge || (m.a === j ? m.relA : m.relB);
        if (isRel) rel.push(i); else rigid++;
      });
      if (fr.sup.some((sp) => sp.n === j && (sp.type === 'einsp' || sp.type === 'gleit'))) rigid++;
      const hasPin = fr.sup.some((sp) => sp.n === j && (sp.type === 'fest' || sp.type === 'los'));
      if (!rel.length) return;
      const p = L.P(n.x, n.y);
      if (rigid <= 1) { if (!hasPin) g += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="${r}" class="sv-hinge"/>`; return; }
      for (const i of rel) {
        const s = scr(fr, i, L), m = fr.members[i];
        const u = m.a === j ? s.e : [-s.e[0], -s.e[1]], d = r + 3;
        g += `<circle cx="${r1(p[0] + u[0] * d)}" cy="${r1(p[1] + u[1] * d)}" r="${r}" class="sv-hinge"/>`;
      }
    });
    return g;
  }

  // Querkraftgelenk: Stab unterbrochen, zwei Querstriche (Sammlung, System 8)
  // Normalkraftgelenk: Hülse um den Stab (Sammlung, System 12)
  function releaseMarks(fr, L, compact) {
    let g = '';
    const k = compact ? 1 : 1.1;
    fr.members.forEach((m, i) => {
      for (const end of ['A', 'B']) {
        const v = m['relV' + end], n = m['relN' + end];
        if (!v && !n) continue;
        const s = scr(fr, i, L), p = end === 'A' ? s.A : s.B, e = s.e, z = s.z;
        const P = (a, b) => [p[0] + e[0] * a + z[0] * b, p[1] + e[1] * a + z[1] * b];
        const poly = (pts, cls) => `<polygon points="${pts.map((q) => r1(q[0]) + ',' + r1(q[1])).join(' ')}" class="${cls}"/>`;
        if (v) {
          const w = 4 * k, h = 9 * k;
          g += poly([P(-w, -h), P(w, -h), P(w, h), P(-w, h)], 'sv-gap');
          g += line(...P(-w, -h), ...P(-w, h), 'sv-rel') + line(...P(w, -h), ...P(w, h), 'sv-rel');
        } else {
          const w = 11 * k, h = 6 * k;
          g += poly([P(-w, -h), P(w, -h), P(w, h), P(-w, h)], 'sv-sleeve');
          const sg = end === 'A' ? 1 : -1;            // der eigene Stab endet in der Hülse
          g += line(...P(-sg * w, 0), ...P(sg * w * 0.35, 0), 'sv-rel');
        }
      }
    });
    return g;
  }

  function supportsSvg(fr, L, compact, lab) {
    let g = '';
    fr.sup.forEach((sp) => {
      const n = fr.nodes[sp.n], p = L.P(n.x, n.y), dirs = nodeDirs(fr, sp.n, L);
      let rot, outw = 1;
      if (sp.type === 'einsp' || sp.type === 'gleit') {
        // Wand senkrecht zum Stab, Schraffur auf der abgewandten Seite
        const u = dirs[0] || [1, 0];
        rot = Math.atan2(-u[1], -u[0]) * 180 / Math.PI;
        g += support(p[0], p[1], 'einsp', rot, 1, compact, 1, true);
        if (sp.type === 'gleit') {
          const a = rot * Math.PI / 180, ox = Math.cos(a), oy = Math.sin(a), hh = SUP(compact).h * 1.45, wx = -oy, wy = ox, o = -4;
          g += line(p[0] + ox * o - wx * hh, p[1] + oy * o - wy * hh, p[0] + ox * o + wx * hh, p[1] + oy * o + wy * hh, 'sv-sup-wall');
        }
        if (lab) lab.box(p[0] - 26, p[1] - 26, p[0] + 26, p[1] + 26);
        return;
      }
      if (sp.type === 'los') {
        const a = sp.ang ?? 90;                         // Lagerkraft-Richtung (Welt); Lager liegt in dieser Achse
        const base = 90 - a;                             // Bildschirm-Drehung, bei der die Lagerachse passt
        const cand = [base, base + 180];
        // Drehung rot: Lager zeigt in Bildschirmrichtung (−sin rot, cos rot) vom Knoten weg
        rot = cand.reduce((b, c) => {
          const v = [-Math.sin(c * Math.PI / 180), Math.cos(c * Math.PI / 180)];
          const cl = dirs.length ? Math.max(...dirs.map((d) => d[0] * v[0] + d[1] * v[1])) : -1;
          return cl < b.cl - 1e-6 ? { c, cl } : b;
        }, { c: cand[0], cl: Infinity }).c;
      } else {
        // bevorzugt unten; nur wenn dort ein Stab im Weg ist (weniger als 60° Abstand), oben, links oder rechts
        const ok = (c) => { const v = [Math.cos(c * Math.PI / 180), Math.sin(c * Math.PI / 180)]; return !dirs.some((d) => d[0] * v[0] + d[1] * v[1] > 0.5); };
        // unten, sonst zur Außenseite des Systems, erst dann oben
        const cx = fr.nodes.reduce((a, q) => a + q.x, 0) / fr.nodes.length, out = n.x < cx ? 180 : 0;
        const order = [90, out, 270, 180 - out];
        const v = order.find(ok) ?? freest(dirs, order);   // Bildschirmwinkel (90 = nach unten)
        rot = v - 90;
      }
      g += support(p[0], p[1], sp.type, rot, outw, compact, 1, true);
      if (lab) {
        const a = rot * Math.PI / 180, v = [-Math.sin(a), Math.cos(a)], d = compact ? 22 : 30;
        lab.box(Math.min(p[0], p[0] + v[0] * d) - 16, Math.min(p[1], p[1] + v[1] * d) - 4, Math.max(p[0], p[0] + v[0] * d) + 16, Math.max(p[1], p[1] + v[1] * d) + 4);
      }
    });
    return g;
  }

  function loadsSvg(fr, L, opts, lab) {
    const compact = opts.compact, sym = !!opts.symbolic;
    const fs = compact ? 12 : 15, head = compact ? 8 : 11, aLen = compact ? 34 : 52, qMax = compact ? 22 : 36, rM = compact ? 12 : 17;
    let g = '';
    const qs = fr.loads.filter((l) => l.type === 'q');
    const qmax = qs.length ? Math.max(...qs.map((l) => Math.max(Math.abs(l.q1), Math.abs(l.q2)))) : 1;
    for (const ld of qs) {
      const s = scr(fr, ld.m, L);
      const sg = Math.sign(ld.q1 || ld.q2) || 1;
      const d0 = ld.dir === 'perp' ? s.z : [Math.cos(ld.dir * Math.PI / 180), -Math.sin(ld.dir * Math.PI / 180)], d = [d0[0] * sg, d0[1] * sg];
      const lift = 3, hA = Math.abs(ld.q1) / qmax * qMax, hB = Math.abs(ld.q2) / qmax * qMax;
      const pa = s.at(ld.s1), pb = s.at(ld.s2);
      const tA = [pa[0] - d[0] * lift, pa[1] - d[1] * lift], tB = [pb[0] - d[0] * lift, pb[1] - d[1] * lift];
      const uA = [tA[0] - d[0] * hA, tA[1] - d[1] * hA], uB = [tB[0] - d[0] * hB, tB[1] - d[1] * hB];
      g += `<polygon points="${[tA, tB, uB, uA].map((q) => r1(q[0]) + ',' + r1(q[1])).join(' ')}" class="sv-qfill"/>`;
      g += line(uA[0], uA[1], uB[0], uB[1], 'sv-load-line');
      lab.seg(uA[0], uA[1], uB[0], uB[1]); lab.seg(tA[0], tA[1], uA[0], uA[1]); lab.seg(tB[0], tB[1], uB[0], uB[1]);
      const lenPx = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
      const na = Math.max(3, Math.round(lenPx / (compact ? 16 : 22)) + 1);
      for (let k = 0; k < na; k++) {
        const t = k / (na - 1), tip = [tA[0] + (tB[0] - tA[0]) * t, tA[1] + (tB[1] - tA[1]) * t], hh = hA + (hB - hA) * t;
        if (hh > (compact ? 9 : 13)) g += arrowL(lab, tip[0] - d[0] * hh, tip[1] - d[1] * hh, tip[0], tip[1], 'sv-load', head * 0.72, 1.2);
        else lab.seg(tip[0] - d[0] * hh, tip[1] - d[1] * hh, tip[0], tip[1]);
      }
      if (!opts.noLabels) {
        const qm = Math.max(Math.abs(ld.q1), Math.abs(ld.q2));
        const nm = Math.abs(ld.q1 - ld.q2) > 1e-9 ? 'q_0' : 'q';
        const str = sym ? nm : compact ? `${fmtN(qm)}` : `${nm} = ${fmtN(qm)} kN/m`;
        const far = hA >= hB ? uA : uB, mid = [(uA[0] + uB[0]) / 2, (uA[1] + uB[1]) / 2];
        const o = 8, anc = (v) => (v[0] > 0.3 ? 'start' : v[0] < -0.3 ? 'end' : 'middle');
        const off = [-d[0], -d[1]];
        lab.req([
          { x: mid[0] + off[0] * o, y: mid[1] + off[1] * o + (off[1] > 0.3 ? fs : 0), anchor: anc(off) },
          { x: far[0] + off[0] * o, y: far[1] + off[1] * o + (off[1] > 0.3 ? fs : 0), anchor: anc(off) },
          { x: mid[0], y: Math.min(uA[1], uB[1]) - 7, anchor: 'middle' }
        ], str, fs, 'sv-load-text');
      }
    }
    const ptOf = (ld) => {
      if (ld.m !== undefined) return scr(fr, ld.m, L).at(ld.s);
      const n = fr.nodes[ld.n]; return L.P(n.x, n.y);
    };
    for (const ld of fr.loads.filter((l) => l.type === 'F')) {
      const p = ptOf(ld), Fm = Math.hypot(ld.Fx || 0, ld.Fy || 0);
      if (Fm < 1e-12) continue;
      const u = [(ld.Fx || 0) / Fm, -(ld.Fy || 0) / Fm];
      let len = aLen;
      // greift an derselben Stelle eine Streckenlast an, den Pfeil über den Lastblock hinaus verlängern
      const touch = qs.some((lq) => {
        if (ld.m !== undefined) return lq.m === ld.m && ld.s >= lq.s1 - 1e-9 && ld.s <= lq.s2 + 1e-9;
        const m = fr.members[lq.m], l = F.geom(fr, lq.m).l;
        return (m.a === ld.n && lq.s1 < 1e-9) || (m.b === ld.n && lq.s2 > l - 1e-9);
      });
      if (touch) len += qMax + 10;
      // liegt der Pfeil auf einem Stab (z. B. waagerechte Kraft am waagerechten Stab), daneben zeichnen
      const along = [];
      if (ld.m !== undefined) { const e = scr(fr, ld.m, L).e; along.push(e, [-e[0], -e[1]]); }
      else along.push(...nodeDirs(fr, ld.n, L));
      const onBar = along.some((d) => d[0] * -u[0] + d[1] * -u[1] > 0.97);
      let sh = [0, 0];
      if (onBar) {
        let nrm = [-u[1], u[0]];
        if (Math.abs(nrm[1]) > 0.3 ? nrm[1] > 0 : nrm[0] > 0) nrm = [-nrm[0], -nrm[1]];   // nach oben bzw. links
        sh = [nrm[0] * 12, nrm[1] * 12];
      }
      const tip = [p[0] - u[0] * 3 + sh[0], p[1] - u[1] * 3 + sh[1]], tail = [tip[0] - u[0] * len, tip[1] - u[1] * len];
      g += arrowL(lab, tail[0], tail[1], tip[0], tip[1], 'sv-load', head, compact ? 1.8 : 2.4);
      if (!opts.noLabels) {
        const str = sym ? 'F' : compact ? fmtN(Fm) : `F = ${fmtN(Fm)} kN`;
        lab.req([{ x: tail[0], y: tail[1] - 6, anchor: 'middle' }, { x: tail[0] + 7, y: tail[1] + 5, anchor: 'start' }, { x: tail[0] - 7, y: tail[1] + 5, anchor: 'end' },
          { x: tail[0], y: tail[1] + fs + 4, anchor: 'middle', dir: -1 }], str, fs, 'sv-load-text');
      }
    }
    for (const ld of fr.loads.filter((l) => l.type === 'M')) {
      const p = ptOf(ld);
      g += momentArc(p[0], p[1], rM, ld.M > 0, 'sv-load', head * 0.85);
      lab.box(p[0] - rM - 2, p[1] - rM - 2, p[0] + rM + 2, p[1] + rM + 2);
      if (!opts.noLabels) {
        const str = sym ? 'M' : compact ? fmtN(Math.abs(ld.M)) : `M = ${fmtN(Math.abs(ld.M))} kNm`;
        lab.req([{ x: p[0] + rM + 4, y: p[1] - rM, anchor: 'start' }, { x: p[0] - rM - 4, y: p[1] - rM, anchor: 'end' }, { x: p[0], y: p[1] - rM - 7, anchor: 'middle' },
          { x: p[0], y: p[1] + rM + fs + 2, anchor: 'middle', dir: -1 }], str, fs, 'sv-load-text');
      }
    }
    return g;
  }

  function membersSvg(fr, L, compact, lab, thin) {
    let g = '';
    fr.members.forEach((m, i) => {
      const s = scr(fr, i, L);
      if (thin) g += line(s.A[0], s.A[1], s.B[0], s.B[1], 'sv-frame-thin');
      else if (m.truss) g += line(s.A[0], s.A[1], s.B[0], s.B[1], 'sv-beam');
      else g += beamSvg(s.A[0], s.A[1], s.B[0], s.B[1], compact);
      if (lab) { lab.seg(s.A[0], s.A[1], s.B[0], s.B[1]); if (!m.truss && !thin) { const o = FIB(compact); lab.seg(s.A[0] + s.z[0] * o, s.A[1] + s.z[1] * o, s.B[0] + s.z[0] * o, s.B[1] + s.z[1] * o); } }
    });
    return g;
  }

  // Bemaßung: x-Kette unten, y-Kette rechts
  function dimsSvg(fr, L, W, H, fs) {
    let g = '';
    const xs = uniq(fr.nodes.map((n) => Math.round(n.x * 1000) / 1000)), ys = uniq(fr.nodes.map((n) => Math.round(n.y * 1000) / 1000));
    const yd = H - 18;
    if (xs.length > 1) {
      const a = L.P(xs[0], 0)[0], b = L.P(xs[xs.length - 1], 0)[0];
      g += line(a, yd, b, yd, 'sv-dim');
      for (const x of xs) g += dimTick(L.P(x, 0)[0], yd);
      for (let i = 0; i < xs.length - 1; i++) {
        const p = L.P(xs[i], 0)[0], q = L.P(xs[i + 1], 0)[0];
        if (q - p > 18) g += text((p + q) / 2, yd - 6, fmtL(xs[i + 1] - xs[i]), 'sv-dim-text', fs - 2);
      }
    }
    if (ys.length > 1) {
      const xd = W - 30;
      const a = L.P(0, ys[0])[1], b = L.P(0, ys[ys.length - 1])[1];
      g += line(xd, a, xd, b, 'sv-dim');
      for (const y of ys) { const yy = L.P(0, y)[1]; g += line(xd - 4, yy + 4, xd + 4, yy - 4, 'sv-dim-tick'); }
      for (let i = 0; i < ys.length - 1; i++) {
        const p = L.P(0, ys[i])[1], q = L.P(0, ys[i + 1])[1];
        if (p - q > 16) g += text(xd - 6, (p + q) / 2 + 5, fmtL(ys[i + 1] - ys[i]), 'sv-dim-text', fs - 2, 'end');
      }
    }
    return g;
  }

  // ------------------------------------------------------------ System
  function system(fr, opts = {}) {
    const compact = opts.mode === 'compact', narrow = !compact && !!opts.narrow;
    const W = compact ? 400 : narrow ? 520 : 800;
    const m = compact ? { l: 34, r: 34, t: 44, b: 38 } : { l: 70, r: 100, t: 80, b: 92 };
    const L = layout(fr, W, opts.Hmin || (compact ? 200 : 250), compact ? 300 : 560, m);
    const H = L.H, fs = narrow ? 17 : 15;
    const lab = makeLabeler(fs + 3, W, H);
    let g = '', front = '';
    g += membersSvg(fr, L, compact, lab, false);
    g += loadsSvg(fr, L, { compact, symbolic: opts.symbolic }, lab);
    g += supportsSvg(fr, L, compact, lab);
    g += hingeMarks(fr, L, compact);
    g += releaseMarks(fr, L, compact);
    if (!compact) {
      g += dimsSvg(fr, L, W, H, fs);
      lab.box(0, H - 36, W, H);
      lab.box(W - 50, 0, W, H);
      if (fr.name) { front += text(14, 24, fr.name, 'sv-title', fs - 1, 'start'); lab.text(14, 24, fr.name, fs - 1, 'start'); }
    }
    front += lab.resolve();
    return { svg: `<svg viewBox="0 0 ${W} ${r1(H)}" class="sv sv-system sv-frame" role="img" aria-label="${esc(fr.name || 'Stabwerk')}">${g}${front}</svg>`, map: { L, W, H } };
  }

  // ------------------------------------------------------------ Verlauf
  //   qty: 'N' | 'V' | 'M';  cv: F.curves(...) (optional);  opts.values: Werte anschreiben
  function diagram(fr, sol, qty, opts = {}) {
    const compact = !!opts.compact;
    const cv = opts.cv || F.curves(fr, sol);
    const q = qty.toLowerCase();
    const W = opts.W || (compact ? 400 : 800);
    let A = compact ? 28 : 52;                          // größter Ausschlag in px
    const pad = compact ? A + 8 : A + 40;
    const m = { l: pad, r: pad, t: pad, b: pad };
    const L = layout(fr, W, opts.Hmin || (compact ? 170 : 260), compact ? 280 : 520, m);
    const H = L.H;
    // flache Systeme (gerader Träger): den freien Platz für einen größeren Ausschlag nutzen
    const hs = (L.y1 - L.y0) * L.k;
    A = Math.max(A, Math.min(compact ? 58 : 80, (H - hs) / 2 - (compact ? 14 : 30)));
    const tum = NVM.draw.plotMode() === 'tum';
    const dir = tum || qty === 'M' ? 1 : -1;
    const smax = Math.max(1e-12, ...cv.map((c) => Math.max(...c[qty].map(Math.abs))));
    let g = '', front = '';
    const lab = makeLabeler(16, W, H);
    g += membersSvg(fr, L, compact, lab, true);
    if (smax < 1e-9) {
      front += text(W / 2, 22, `${qty} = 0 im ganzen System`, 'sv-note', compact ? 13 : 15);
      return `<svg viewBox="0 0 ${W} ${r1(H)}" class="sv sv-diagram sv-frame">${g}${front}</svg>`;
    }
    const vals = [];
    cv.forEach((c, i) => {
      const s = scr(fr, i, L), f = c[qty];
      const pt = (k, v) => { const p = s.at(c.s[k]); const o = dir * v / smax * A; return [p[0] + s.z[0] * o, p[1] + s.z[1] * o]; };
      if (Math.max(...f.map(Math.abs)) < 1e-9 * smax) return;
      // Flächen getrennt nach Vorzeichen
      for (const sg of [1, -1]) {
        const pts = [s.at(c.s[0])];
        for (let k = 0; k < c.s.length; k++) pts.push(pt(k, sg > 0 ? Math.max(f[k], 0) : Math.min(f[k], 0)));
        pts.push(s.at(c.s[c.s.length - 1]));
        g += `<polygon points="${pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ')}" class="sv-fill sv-f-${q}"/>`;
      }
      // Schraffur senkrecht zum Stab
      let hp = '';
      const nh = Math.max(4, Math.round(s.len / (compact ? 7 : 9)));
      for (let k = 1; k < nh; k++) {
        const ss = c.s[c.s.length - 1] * k / nh;
        let j = c.s.findIndex((v) => v >= ss); if (j < 1) j = 1;
        const t = (ss - c.s[j - 1]) / Math.max(c.s[j] - c.s[j - 1], 1e-12), v = f[j - 1] + (f[j] - f[j - 1]) * t;
        const p0 = s.at(ss), o = dir * v / smax * A;
        if (Math.abs(o) > 1.5) hp += `M${r1(p0[0])} ${r1(p0[1])}L${r1(p0[0] + s.z[0] * o)} ${r1(p0[1] + s.z[1] * o)}`;
      }
      if (hp) g += `<path d="${hp}" class="sv-hatchline sv-c-${q}"/>`;
      let d = `M${r1(s.A[0])} ${r1(s.A[1])}`;
      for (let k = 0; k < c.s.length; k++) { const p = pt(k, f[k]); d += `L${r1(p[0])} ${r1(p[1])}`; }
      d += `L${r1(s.B[0])} ${r1(s.B[1])}`;
      g += `<path d="${d}" class="sv-curve sv-c-${q}${opts.animate ? ' sv-draw' : ''}" pathLength="1"/>`;
      for (let k = 1; k < c.s.length; k++) { const a = pt(k - 1, f[k - 1]), b = pt(k, f[k]); lab.seg(a[0], a[1], b[0], b[1]); }

      // Vorzeichen
      const n = f.length;
      const sgn = f.map((v) => (v > 0.03 * smax ? 1 : v < -0.03 * smax ? -1 : 0));
      let k = 0;
      while (k < n) {
        if (!sgn[k]) { k++; continue; }
        let k2 = k;
        while (k2 < n - 1 && sgn[k2 + 1] === sgn[k]) k2++;
        let mx = 0;
        for (let t = k; t <= k2; t++) if (Math.abs(f[t]) > mx) mx = Math.abs(f[t]);
        const lenPx = (c.s[k2] - c.s[k]) * L.k;
        if (lenPx > (compact ? 26 : 36) && mx / smax > 0.3) {
          const mid = Math.round((k + k2) / 2), p0 = s.at(c.s[mid]), o = dir * f[mid] / smax * A * 0.5;
          const oo = Math.abs(o) < 11 ? Math.sign(o || 1) * 11 : o, rr = compact ? 8 : 10;
          front += `<g class="sv-sign sv-c-${q}"><circle cx="${r1(p0[0] + s.z[0] * oo)}" cy="${r1(p0[1] + s.z[1] * oo)}" r="${rr}"/>` +
            `<text x="${r1(p0[0] + s.z[0] * oo)}" y="${r1(p0[1] + s.z[1] * oo + 4.5)}" text-anchor="middle" font-size="${compact ? 13 : 16}">${sgn[k] > 0 ? '+' : '−'}</text></g>`;
          lab.box(p0[0] + s.z[0] * oo - rr, p0[1] + s.z[1] * oo - rr, p0[0] + s.z[0] * oo + rr, p0[1] + s.z[1] * oo + rr);
        }
        k = k2 + 1;
      }
      if (opts.values) {
        // Werte an Stabenden, an Lastgrenzen und an Extremstellen
        let cand = [0, n - 1];
        c.s.forEach((sv, t) => { if (c.crit.some((cc) => Math.abs(sv - cc) < 2e-6 * m.l + 1e-6)) cand.push(t); });
        for (let t = 1; t < n - 1; t++) { const d1 = f[t] - f[t - 1], d2 = f[t + 1] - f[t]; if (d1 * d2 < 0 && Math.abs(c.s[t + 1] - c.s[t]) > 1e-5) cand.push(t); }
        for (const t of new Set(cand)) if (Math.abs(f[t]) > 0.02 * smax) vals.push({ p: pt(t, f[t]), base: s.at(c.s[t]), z: [s.z[0] * dir * Math.sign(f[t]), s.z[1] * dir * Math.sign(f[t])], v: f[t], i });
      }
    });
    if (opts.values) {
      vals.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
      const shown = [];
      for (const o of vals) {
        if (shown.some((s) => Math.abs(s.v - o.v) < 0.005 * smax + 0.005 && Math.hypot(s.p[0] - o.p[0], s.p[1] - o.p[1]) < 40)) continue;
        if (shown.length >= 14) break;
        shown.push(o);
        const str = fmt(o.v), fsz = compact ? 11 : 13;
        const anc = o.z[0] > 0.35 ? 'start' : o.z[0] < -0.35 ? 'end' : 'middle';
        const yo = o.z[1] > 0.35 ? fsz : o.z[1] < -0.35 ? -3 : 4;
        lab.req([{ x: o.p[0] + o.z[0] * 6, y: o.p[1] + o.z[1] * 6 + yo, anchor: anc, dir: o.z[1] > 0.35 ? -1 : 1 },
          { x: o.p[0] + 6, y: o.p[1] + 4, anchor: 'start' }, { x: o.p[0] - 6, y: o.p[1] + 4, anchor: 'end' }], str, fsz, 'sv-value');
      }
      front += text(W - 8, 16, qty === 'M' ? 'kNm' : 'kN', 'sv-unit', 12, 'end');
    }
    if (!compact || opts.label) front += text(compact ? 10 : 18, compact ? 22 : 30, qty, `sv-qty sv-c-${q}`, compact ? 18 : 24, 'start');
    front += lab.resolve();
    return `<svg viewBox="0 0 ${W} ${r1(H)}" class="sv sv-diagram sv-frame">${g}${front}</svg>`;
  }

  NVM.drawFrame = { system, diagram };
})(typeof window !== 'undefined' ? window : globalThis);
