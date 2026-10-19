/* NVM – Zeichnen
 * Statische Systeme und Schnittgrößenverläufe als SVG.
 * Farben kommen über CSS-Klassen (.sv-*), damit Hell- und Dunkel-Theme greifen.
 */
(function (root) {
  'use strict';
  const NVM = root.NVM;
  const { fmt, fmtL, fmtN, critPts, supNames, momentAtSupport, interp1 } = NVM;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const r1 = (v) => Math.round(v * 10) / 10;

  // "A_v", "M_{Einsp}", "q_0" -> Text mit tiefgestellten Teilen
  function texParts(s) {
    const parts = [];
    const re = /_\{([^}]*)\}|_([A-Za-z0-9⊥])/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push({ t: s.slice(last, m.index), sub: false });
      parts.push({ t: m[1] !== undefined ? m[1] : m[2], sub: true });
      last = re.lastIndex;
    }
    if (last < s.length) parts.push({ t: s.slice(last), sub: false });
    return parts;
  }
  // Beschriftungen mit Formeln (Lasten, Lagerkräfte, Winkel, Symbole) in Formelschrift
  const MATH_CLS = new Set(['sv-load-text', 'sv-react', 'sv-angle-text', 'sv-dim-sym', 'sv-note']);
  function svgTex(s, cls) {
    const M = root.NVM && root.NVM.math;
    if (M && cls && MATH_CLS.has(cls)) return M.svg(s, plainSvgTex, { symbols: true });
    return plainSvgTex(s);
  }
  function plainSvgTex(s) {
    let out = '', inSub = false;
    for (const p of texParts(s)) {
      if (p.sub) { out += `<tspan dy="0.28em" font-size="0.72em">${esc(p.t)}</tspan>`; inSub = true; }
      else { out += inSub ? `<tspan dy="-0.28em">${esc(p.t)}</tspan>` : esc(p.t); inSub = false; }
    }
    return out;
  }
  function plainHtmlTex(s) {
    return texParts(s).map((p) => (p.sub ? `<sub>${esc(p.t)}</sub>` : esc(p.t))).join('');
  }
  // Text mit Formeln: Formeln über KaTeX (echte Brüche), Rest wie gehabt
  function htmlTex(s) {
    const M = root.NVM && root.NVM.math;
    return M ? M.html(s, plainHtmlTex) : plainHtmlTex(s);
  }

  function text(x, y, s, cls, size, anchor = 'middle', extra = '') {
    return `<text x="${r1(x)}" y="${r1(y)}" class="${cls}" font-size="${size}" text-anchor="${anchor}" ${extra}>${svgTex(s, cls)}</text>`;
  }
  function line(x1, y1, x2, y2, cls, extra = '') {
    return `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" class="${cls}" ${extra}/>`;
  }
  // Pfeil von (x0,y0) nach (x1,y1), Spitze am Ziel
  function arrow(x0, y0, x1, y1, cls, head = 10, width = 2) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 1e-6) return '';
    const ux = dx / L, uy = dy / L, hw = head * 0.62;
    const bx = x1 - ux * head, by = y1 - uy * head;
    const p = [[x1, y1], [bx - uy * hw / 2, by + ux * hw / 2], [bx + uy * hw / 2, by - ux * hw / 2]];
    return `<g class="${cls}"><line x1="${r1(x0)}" y1="${r1(y0)}" x2="${r1(bx)}" y2="${r1(by)}" stroke-width="${width}"/>` +
      `<polygon points="${p.map((q) => r1(q[0]) + ',' + r1(q[1])).join(' ')}"/></g>`;
  }

  // Beschriftungen gegen Überlappung nach oben schieben
  function makeLabeler(dy) {
    const boxes = [];
    return function place(x, y, s, size, anchor) {
      const w = s.length * size * 0.56;
      const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      let yy = y;
      for (let g = 0; g < 8; g++) {
        const hit = boxes.some((b) => x0 < b.x1 + 6 && x0 + w > b.x0 - 6 && yy > b.y - size - 2 && yy - size < b.y + 2);
        if (!hit) break;
        yy -= dy;
      }
      boxes.push({ x0, x1: x0 + w, y: yy });
      return yy;
    };
  }

  // Lagersymbole in lokalen Koordinaten (y nach unten), gedreht um rot (Grad, Uhrzeigersinn)
  function support(X, Y, type, rot, outw, compact) {
    const w = compact ? 8 : 11, h = compact ? 12 : 16;
    let g = `<g transform="translate(${r1(X)},${r1(Y)}) rotate(${r1(rot)})">`;
    if (type === 'einsp') {
      const hh = h * 1.45;
      g += `<line x1="0" y1="${-hh}" x2="0" y2="${hh}" class="sv-sup-wall"/>`;
      for (let i = 0; i < 7; i++) {
        const y = -hh + (i + 0.5) * (2 * hh / 7);
        g += `<line x1="0" y1="${r1(y)}" x2="${outw * 8}" y2="${r1(y + 8)}" class="sv-hatch"/>`;
      }
    } else {
      g += `<polygon points="0,0 ${-w},${h} ${w},${h}" class="sv-sup"/>`;
      const yg = type === 'fest' ? h : h + 5;
      g += `<line x1="${-1.7 * w}" y1="${yg}" x2="${1.7 * w}" y2="${yg}" class="sv-ground"/>`;
      for (let i = 0; i < 6; i++) {
        const x = -1.7 * w + (i + 0.5) * (3.4 * w / 6);
        g += `<line x1="${r1(x)}" y1="${yg}" x2="${r1(x - 5)}" y2="${yg + 6}" class="sv-hatch"/>`;
      }
    }
    return g + '</g>';
  }

  function momentArc(X, Y, r, cw, cls, head) {
    const pts = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = cw ? (150 - 270 * i / n) : (30 + 270 * i / n);
      pts.push([X + r * Math.cos(t * Math.PI / 180), Y - r * Math.sin(t * Math.PI / 180)]);
    }
    const body = pts.slice(0, -2).map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ');
    const a = pts[n - 4], b = pts[n];
    return `<polyline points="${body}" class="${cls} sv-noFill" stroke-width="2"/>` + arrow(a[0], a[1], b[0], b[1], cls, head, 0.01);
  }

  function reactionLines(sys, sol, i, names) {
    const out = [];
    sol.unk.forEach((u, j) => {
      if (u.s !== i) return;
      const r = sol.R[j];
      if (u.c === 'V') out.push(`${names[i]}_v = ${fmt(r)} kN`);
      else if (u.c === 'H') { if (Math.abs(r) > 1e-9) out.push(`${names[i]}_h = ${fmt(r)} kN`); }
      else if (u.c === 'N') out.push(`${names[i]}_⊥ = ${fmt(r)} kN`);
      else out.push(`M_${names[i]} = ${fmt(momentAtSupport(sol, sys.sup[i].x, sys.L))} kNm`);
    });
    return out;
  }

  // ------------------------------------------------------------ System
  function system(sys, opts = {}) {
    if (NVM.isIncl(sys)) return systemIncl(sys, opts);
    const compact = opts.mode === 'compact';
    const sym = !!opts.symbolic;
    const sol = opts.sol || null;
    const L = sys.L;
    const narrow = !compact && !!opts.narrow;
    const W = compact ? 400 : narrow ? 520 : 800, H = compact ? 200 : narrow ? 300 : 290;
    const X0 = compact ? 36 : narrow ? 54 : 80, X1 = compact ? 364 : narrow ? 466 : 720, yb = compact ? 128 : 160;
    const kx = (X1 - X0) / L;
    const X = (s) => X0 + s * kx;
    const fs = narrow ? 17 : 15, fsS = sym ? fs + 3 : fs;
    const aLen = compact ? 44 : 60, head = compact ? 9 : 11, qMax = compact ? 46 : 58, rM = compact ? 14 : 18;
    const place = makeLabeler(fs + 3);
    let g = '', front = '';
    const loads = sys.loads;
    const qs = loads.filter((l) => l.type === 'q');
    const qmax = qs.length ? Math.max(...qs.map((l) => Math.max(Math.abs(l.v), Math.abs(l.v2)))) : 1;
    const y0 = yb - 4;

    for (const ld of qs) {
      const h1 = Math.abs(ld.v) / qmax * qMax, h2 = Math.abs(ld.v2) / qmax * qMax;
      const xa = X(ld.x), xb = X(ld.x2);
      g += `<polygon points="${r1(xa)},${r1(y0)} ${r1(xb)},${r1(y0)} ${r1(xb)},${r1(y0 - h2)} ${r1(xa)},${r1(y0 - h1)}" class="sv-qfill"/>`;
      g += line(xa, y0 - h1, xb, y0 - h2, 'sv-load-line');
      const na = Math.max(3, Math.round((ld.x2 - ld.x) / L * 16) + 1);
      for (let i = 0; i < na; i++) {
        const t = i / (na - 1), xx = xa + (xb - xa) * t, hh = h1 + (h2 - h1) * t;
        if (hh > 14) g += arrow(xx, y0 - hh, xx, y0, 'sv-load', head * 0.75, 1.3);
      }
      const qm = Math.max(Math.abs(ld.v), Math.abs(ld.v2));
      const nm = ld.sub === 'tri' ? 'q_0' : 'q';
      const s = sym ? nm : `${nm} = ${fmtN(qm)} kN/m`;
      let xl = (xa + xb) / 2, anc = 'middle';
      if (ld.sub === 'tri') { if (Math.abs(ld.v2) >= Math.abs(ld.v)) { xl = xb; anc = 'end'; } else { xl = xa; anc = 'start'; } }
      const yl = place(xl, y0 - Math.max(h1, h2) - 7, s, fsS, anc);
      front += text(xl, yl, s, 'sv-load-text', fsS, anc);
    }
    g += line(X0, yb, X1, yb, 'sv-beam');

    for (const ld of loads.filter((l) => l.type === 'F')) {
      const xp = X(ld.x);
      if (Math.abs(ld.v) < 1e-12) {
        const dir = Math.sign(ld.Fx), yH = yb - 11, tail = xp - dir * (aLen - 4);
        g += arrow(tail, yH, xp, yH, 'sv-load', head, 2.2);
        const s = sym ? 'H' : `H = ${fmtN(Math.abs(ld.Fx))} kN`;
        const yl = place((tail + xp) / 2, yH - 7, s, fs, 'middle');
        front += text((tail + xp) / 2, yl, s, 'sv-load-text', fs);
      } else {
        const n = Math.hypot(ld.Fx, ld.v), ux = ld.Fx / n, uy = ld.v / n;
        let len = aLen;
        for (const lq of qs) {
          if (ld.x >= lq.x - 1e-9 && ld.x <= lq.x2 + 1e-9) {
            const hq = (Math.abs(lq.v) + (Math.abs(lq.v2) - Math.abs(lq.v)) * (ld.x - lq.x) / (lq.x2 - lq.x)) / qmax * qMax;
            len = Math.max(len, (hq + 16) / Math.max(Math.abs(uy), 0.35));
          }
        }
        const tx = xp - ux * len, ty = y0 - uy * len;
        g += arrow(tx, ty, xp, y0, 'sv-load', head, 2.4);
        const s = sym ? 'F' : ld.sub === 'Fs' ? `F = ${fmtN(ld.mag)} kN, ${Math.round(ld.ang)}°` : `F = ${fmtN(ld.v)} kN`;
        const yl = place(tx, ty - 6, s, fsS, 'middle');
        front += text(tx, yl, s, 'sv-load-text', fsS);
      }
    }
    for (const ld of loads.filter((l) => l.type === 'M')) {
      const xp = X(ld.x);
      g += momentArc(xp, yb, rM, ld.v > 0, 'sv-load', head * 0.85);
      const s = sym ? 'M_0' : `M = ${fmtN(Math.abs(ld.v))} kNm`;
      const yl = place(xp, yb - rM - 7, s, fsS, 'middle');
      front += text(xp, yl, s, 'sv-load-text', fsS);
    }
    sys.sup.forEach((sp) => { g += support(X(sp.x), yb, sp.type, 0, sp.x <= L / 2 ? -1 : 1, compact); });
    for (const h of sys.hinges) g += `<circle cx="${r1(X(h))}" cy="${yb}" r="${compact ? 4.5 : 6}" class="sv-hinge"/>`;

    if (!compact) {
      const names = supNames(sys);
      sys.sup.forEach((sp, i) => { front += text(X(sp.x), yb + 44, names[i], 'sv-name', fs); });
      sys.hinges.forEach((h) => { front += text(X(h), yb + 26, 'G', 'sv-name-soft', 13); });
      if (sym && sys.symDims && sys.symDims.length) {
        for (const d of sys.symDims) {
          const yd = 236 + (d.row - 1) * 28, a = X(d.x1), b = X(d.x2);
          g += line(a, yd, b, yd, 'sv-dim') + line(a, yd - 5, a, yd + 5, 'sv-dim') + line(b, yd - 5, b, yd + 5, 'sv-dim');
          front += text((a + b) / 2, yd - 6, d.label, 'sv-dim-sym', fs + 3);
        }
      } else {
        const yd = 240, kp = critPts(sys);
        g += line(X0, yd, X1, yd, 'sv-dim');
        for (const k of kp) g += line(X(k), yd - 5, X(k), yd + 5, 'sv-dim');
        for (let i = 0; i < kp.length - 1; i++) {
          const len = kp[i + 1] - kp[i];
          if (len > 1e-6) front += text((X(kp[i]) + X(kp[i + 1])) / 2, yd - 6, fmtL(len), 'sv-dim-text', fs - 2);
        }
        front += text(X1 + 8, yd + 4, '[m]', 'sv-dim-text', fs - 3, 'start');
      }
      front += text(14, 24, sys.name, 'sv-title', fs - 1, 'start');
      if (sol) {
        sys.sup.forEach((sp, i) => {
          const lines = reactionLines(sys, sol, i, names);
          const right = sp.x > 0.75 * L;
          const xt = X(sp.x) + (right ? -22 : 22);
          lines.forEach((s, k) => { front += text(xt, yb + 18 + k * (fs + 1), s, 'sv-react', fs - 2, right ? 'end' : 'start'); });
        });
      }
    }
    return {
      svg: `<svg viewBox="0 0 ${W} ${H}" class="sv sv-system" role="img" aria-label="${esc(sys.name)}">${g}${front}</svg>`,
      map: { ox: X0, k: kx, L, W, H }
    };
  }

  function systemIncl(sys, opts) {
    const compact = opts.mode === 'compact';
    const sym = !!opts.symbolic;
    const sol = opts.sol || null;
    const L = sys.L, ca = sys.ca, sa = sys.sa;
    const lh = L * ca, hh = L * sa;
    const narrow = !compact && !!opts.narrow;
    const W = compact ? 400 : narrow ? 520 : 800, H = compact ? 200 : narrow ? 300 : 290;
    const mL = compact ? 34 : narrow ? 104 : 130, mR = mL, mT = compact ? 52 : 74, mB = compact ? 26 : 74;
    let ux = (W - mL - mR) / lh, uy = (H - mT - mB) / Math.abs(hh);
    if (uy >= ux) uy = ux; else ux = Math.min(ux, uy * 1.6);
    const wDraw = lh * ux, hDraw = Math.abs(hh) * uy;
    const ox = mL + (W - mL - mR - wDraw) / 2;
    const yTop = mT + (H - mT - mB - hDraw) / 2;
    const oy = hh > 0 ? yTop + hDraw : yTop;            // Bildschirm-y von s = 0
    const P = (s) => [ox + s * ca * ux, oy - s * sa * uy];
    const fs = 15, fsS = sym ? 18 : 15;
    const aLen = compact ? 40 : 54, head = compact ? 9 : 11, qMax = compact ? 30 : 42, rM = compact ? 13 : 17;
    const place = makeLabeler(fs + 3);
    let g = '', front = '';
    const loads = sys.loads, qs = loads.filter((l) => l.type === 'q');
    const qmax = qs.length ? Math.max(...qs.map((l) => Math.max(Math.abs(l.v), Math.abs(l.v2)))) : 1;
    const lift = 4;

    for (const ld of qs) {
      const h1 = Math.abs(ld.v) / qmax * qMax, h2 = Math.abs(ld.v2) / qmax * qMax;
      const A = P(ld.x), B = P(ld.x2);
      g += `<polygon points="${r1(A[0])},${r1(A[1] - lift)} ${r1(B[0])},${r1(B[1] - lift)} ${r1(B[0])},${r1(B[1] - lift - h2)} ${r1(A[0])},${r1(A[1] - lift - h1)}" class="sv-qfill"/>`;
      g += line(A[0], A[1] - lift - h1, B[0], B[1] - lift - h2, 'sv-load-line');
      const na = Math.max(3, Math.round((ld.x2 - ld.x) / L * 12) + 1);
      for (let i = 0; i < na; i++) {
        const t = i / (na - 1), s = ld.x + (ld.x2 - ld.x) * t, p = P(s), hv = h1 + (h2 - h1) * t;
        if (hv > 14) g += arrow(p[0], p[1] - lift - hv, p[0], p[1] - lift, 'sv-load', head * 0.75, 1.3);
      }
      const qm = Math.max(Math.abs(ld.v), Math.abs(ld.v2));
      let nm = ld.basis === 'proj' ? 'q' : 'g';
      if (ld.sub === 'tri') nm += '_0';
      const suf = ld.basis === 'proj' ? ' (Grundriss)' : ' (je m Stab)';
      const s = sym ? nm : compact ? `${nm} = ${fmtN(qm)}` : `${nm} = ${fmtN(qm)} kN/m${suf}`;
      const pm = P(hh >= 0 ? ld.x2 : ld.x);
      const yl = place(pm[0], pm[1] - lift - Math.max(h1, h2) - 8, s, fsS, 'middle');
      front += text(pm[0], yl, s, 'sv-load-text', fsS);
    }
    const p0 = P(0), p1 = P(L);
    g += line(p0[0], p0[1], p1[0], p1[1], 'sv-beam');

    for (const ld of loads.filter((l) => l.type === 'F')) {
      const pp = P(ld.x);
      if (Math.abs(ld.v) < 1e-12) {
        const dir = Math.sign(ld.Fx), yH = pp[1] - 11, tail = pp[0] - dir * (aLen - 4);
        g += arrow(tail, yH, pp[0], yH, 'sv-load', head, 2.2);
        const s = sym ? 'H' : `H = ${fmtN(Math.abs(ld.Fx))} kN`;
        const yl = place((tail + pp[0]) / 2, yH - 7, s, fs, 'middle');
        front += text((tail + pp[0]) / 2, yl, s, 'sv-load-text', fs);
      } else {
        const n = Math.hypot(ld.Fx, ld.v), uxv = ld.Fx / n, uyv = ld.v / n;
        let len = aLen;
        for (const lq of qs) {
          if (ld.x >= lq.x - 1e-9 && ld.x <= lq.x2 + 1e-9) {
            const hq = (Math.abs(lq.v) + (Math.abs(lq.v2) - Math.abs(lq.v)) * (ld.x - lq.x) / (lq.x2 - lq.x)) / qmax * qMax;
            len = Math.max(len, (hq + 16) / Math.max(Math.abs(uyv), 0.35));
          }
        }
        const tip = [pp[0], pp[1] - lift];
        let tl = [tip[0] - uxv * len, tip[1] - uyv * len];
        // Schwanz nicht im Streckenlastblock enden lassen
        for (let it = 0; it < 14; it++) {
          const st = (tl[0] - ox) / (ca * ux);
          let yq = Infinity;
          for (const lq of qs) {
            if (st >= lq.x - 1e-9 && st <= lq.x2 + 1e-9) {
              const hq = (Math.abs(lq.v) + (Math.abs(lq.v2) - Math.abs(lq.v)) * (st - lq.x) / Math.max(lq.x2 - lq.x, 1e-9)) / qmax * qMax;
              yq = Math.min(yq, P(st)[1] - lift - hq);
            }
          }
          if (tl[1] < yq - 12) break;
          len += 14; tl = [tip[0] - uxv * len, tip[1] - uyv * len];
        }
        g += arrow(tl[0], tl[1], tip[0], tip[1], 'sv-load', head, 2.4);
        const s = sym ? 'F' : ld.sub === 'Fs' ? `F = ${fmtN(ld.mag)} kN, ${Math.round(ld.ang)}°` : `F = ${fmtN(ld.v)} kN`;
        const yl = place(tl[0], tl[1] - 6, s, fsS, 'middle');
        front += text(tl[0], yl, s, 'sv-load-text', fsS);
      }
    }
    for (const ld of loads.filter((l) => l.type === 'M')) {
      const pp = P(ld.x);
      g += momentArc(pp[0], pp[1], rM, ld.v > 0, 'sv-load', head * 0.85);
      const s = sym ? 'M_0' : `M = ${fmtN(Math.abs(ld.v))} kNm`;
      const yl = place(pp[0], pp[1] - rM - 7, s, fsS, 'middle');
      front += text(pp[0], yl, s, 'sv-load-text', fsS);
    }
    const aApp = Math.atan2(hh * uy, lh * ux) * 180 / Math.PI;   // sichtbarer Winkel
    sys.sup.forEach((sp) => {
      const p = P(sp.x);
      const rot = sp.type === 'losN' || sp.type === 'einsp' ? -aApp : 0;
      g += support(p[0], p[1], sp.type, rot, sp.x <= L / 2 ? -1 : 1, compact);
    });

    if (!compact) {
      const names = supNames(sys);
      sys.sup.forEach((sp, i) => {
        const p = P(sp.x), ow = sp.x <= L / 2 ? -1 : 1;
        const anc = ow < 0 ? 'end' : 'start';
        if (sol) {
          const dimSide = hh > 0 ? 1 : -1;
          if (ow === dimSide) {
            // am hohen Ende steht die Höhenbemaßung: Werte unter das Lager
            reactionLines(sys, sol, i, names).forEach((s, k) => { front += text(p[0] - ow * 6, p[1] + 38 + k * 16, s, 'sv-react', 13, anc); });
          } else {
            reactionLines(sys, sol, i, names).forEach((s, k) => { front += text(p[0] + ow * 26, p[1] + 8 + k * 16, s, 'sv-react', 13, anc); });
          }
        } else front += text(p[0] + ow * 26, p[1] + 10, names[i], 'sv-name', 15, anc);
      });
      // Grundriss-Bemaßung
      const yd = Math.max(p0[1], p1[1]) + 50;
      if (sym) {
        g += line(p0[0], yd, p1[0], yd, 'sv-dim') + line(p0[0], yd - 5, p0[0], yd + 5, 'sv-dim') + line(p1[0], yd - 5, p1[0], yd + 5, 'sv-dim');
        front += text((p0[0] + p1[0]) / 2, yd - 6, 'l', 'sv-dim-sym', 18);
      } else {
        const kp = critPts(sys);
        g += line(p0[0], yd, p1[0], yd, 'sv-dim');
        for (const k of kp) g += line(P(k)[0], yd - 5, P(k)[0], yd + 5, 'sv-dim');
        for (let i = 0; i < kp.length - 1; i++) {
          const len = (kp[i + 1] - kp[i]) * ca;
          if (len > 1e-6) front += text((P(kp[i])[0] + P(kp[i + 1])[0]) / 2, yd - 6, fmtL(len), 'sv-dim-text', 13);
        }
        front += text(p1[0] + 10, yd + 4, '[m]', 'sv-dim-text', 12, 'start');
      }
      // Höhe am hohen Ende, weit außen
      const yLow = Math.max(p0[1], p1[1]), yHigh = Math.min(p0[1], p1[1]);
      const dOff = sol ? (narrow ? 76 : 102) : (narrow ? 70 : 92);
      const xv = hh > 0 ? p1[0] + dOff : p0[0] - dOff;
      g += line(xv, yLow, xv, yHigh, 'sv-dim') + line(xv - 5, yLow, xv + 5, yLow, 'sv-dim') + line(xv - 5, yHigh, xv + 5, yHigh, 'sv-dim');
      front += text(xv + (hh > 0 ? 8 : -8), (yLow + yHigh) / 2 + 5, sym ? 'h' : fmtL(Math.abs(hh)), sym ? 'sv-dim-sym' : 'sv-dim-text', sym ? 18 : 13, hh > 0 ? 'start' : 'end');
      // Neigungswinkel am unteren Ende
      const rA = 40, po = hh > 0 ? p0 : p1, dir = hh > 0 ? 1 : -1;
      const aAbs = Math.abs(aApp);
      const ex = po[0] + dir * rA * Math.cos(aAbs * Math.PI / 180), ey = po[1] - rA * Math.sin(aAbs * Math.PI / 180);
      g += line(po[0], po[1], po[0] + dir * 62, po[1], 'sv-dim', 'stroke-dasharray="3 3"');
      g += `<path d="M ${r1(po[0] + dir * rA)} ${r1(po[1])} A ${rA} ${rA} 0 0 ${dir > 0 ? 0 : 1} ${r1(ex)} ${r1(ey)}" class="sv-angle"/>`;
      const tm = aAbs / 2 * Math.PI / 180;
      const aTxt = sym ? 'α' : `α = ${fmt(Math.abs(sys.alpha))}°`;
      if (!sym && aAbs < 22) front += text(po[0] + dir * 68, po[1] + 4, aTxt, 'sv-angle-text', 13, dir > 0 ? 'start' : 'end');
      else front += text(po[0] + dir * (rA + 8) * Math.cos(tm), po[1] - (rA + 8) * Math.sin(tm) + 4, aTxt, 'sv-angle-text', 13, dir > 0 ? 'start' : 'end');
      // Titel dort, wo das hohe Stabende nicht ist
      front += hh >= 0 ? text(14, 24, sys.name, 'sv-title', 14, 'start') : text(W - 14, 24, sys.name, 'sv-title', 14, 'end');
    }
    return {
      svg: `<svg viewBox="0 0 ${W} ${H}" class="sv sv-system" role="img" aria-label="${esc(sys.name)}">${g}${front}</svg>`,
      map: { ox, k: ca * ux, L, W, H }
    };
  }

  // ------------------------------------------------------------ Verlauf
  function diagram(xs, f, qty, Lp, opts = {}) {
    const compact = !!opts.compact;
    const W = opts.W || (compact ? 400 : 800), H = opts.H || (compact ? 210 : 150);
    const padL = compact ? 40 : 58, padR = compact ? 16 : 30;
    const yc = H / 2, A = H * (compact ? 0.33 : 0.31);
    const X = (x) => padL + x / Lp * (W - padL - padR);
    const q = qty.toLowerCase();
    let g = '', front = '';
    front += text(padL / 2 - 2, yc + 8, qty, `sv-qty sv-c-${q}`, compact ? 22 : 24);
    const s = Math.max(...f.map(Math.abs));
    if (s < 1e-9) {
      g += line(X(0), yc, X(Lp), yc, `sv-curve sv-c-${q}`);
      front += text((X(0) + X(Lp)) / 2, yc - 14, `${qty} = 0 im ganzen Träger`, 'sv-note', 14);
      return `<svg viewBox="0 0 ${W} ${H}" class="sv sv-diagram">${g}${front}</svg>`;
    }
    const dir = qty === 'M' ? 1 : -1;               // M positiv nach unten, N und V nach oben
    const Y = (v) => yc + dir * v / s * A;
    const n = xs.length;
    const poly = (vals) => {
      let pts = `${r1(X(xs[0]))},${r1(yc)} `;
      for (let i = 0; i < n; i++) pts += `${r1(X(xs[i]))},${r1(Y(vals[i]))} `;
      return pts + `${r1(X(xs[n - 1]))},${r1(yc)}`;
    };
    g += `<polygon points="${poly(f.map((v) => Math.max(v, 0)))}" class="sv-fill sv-f-${q}"/>`;
    g += `<polygon points="${poly(f.map((v) => Math.min(v, 0)))}" class="sv-fill sv-f-${q}"/>`;
    // Schraffur
    let hp = '';
    for (let i = 1; i < 48; i++) {
      const x = Lp * i / 48, y = Y(interp1(xs, f, x));
      if (Math.abs(y - yc) > 1.5) hp += `M${r1(X(x))} ${r1(yc)}V${r1(y)}`;
    }
    if (hp) g += `<path d="${hp}" class="sv-hatchline sv-c-${q}"/>`;
    g += line(X(0), yc, X(Lp), yc, 'sv-axis');
    let d = `M${r1(X(xs[0]))} ${r1(yc)}`;
    for (let i = 0; i < n; i++) d += `L${r1(X(xs[i]))} ${r1(Y(f[i]))}`;
    d += `L${r1(X(xs[n - 1]))} ${r1(yc)}`;
    g += `<path d="${d}" class="sv-curve sv-c-${q}${opts.animate ? ' sv-draw' : ''}" pathLength="1"/>`;

    // Vorzeichen in den Flächen
    const sg = f.map((v) => (v > 0.03 * s ? 1 : v < -0.03 * s ? -1 : 0));
    let k = 0;
    while (k < n) {
      if (sg[k] === 0) { k++; continue; }
      let k2 = k;
      while (k2 < n - 1 && sg[k2 + 1] === sg[k]) k2++;
      let mx = 0;
      for (let i = k; i <= k2; i++) mx = Math.max(mx, Math.abs(f[i]) / s);
      if (xs[k2] - xs[k] > 0.05 * Lp && mx > 0.28) {
        let sw = 0, sx = 0;
        for (let i = k; i <= k2; i++) { sw += Math.abs(f[i]); sx += xs[i] * Math.abs(f[i]); }
        const xw = sx / sw, yv = Y(interp1(xs, f, xw));
        let yy = yc + (yv - yc) * 0.5;
        if (Math.abs(yy - yc) < 12) yy = yc + Math.sign(yv - yc) * 12;
        const rr = compact ? 9 : 10;
        front += `<g class="sv-sign sv-c-${q}"><circle cx="${r1(X(xw))}" cy="${r1(yy)}" r="${rr}"/>` +
          `<text x="${r1(X(xw))}" y="${r1(yy + 4.5)}" text-anchor="middle" font-size="${compact ? 15 : 16}">${sg[k] > 0 ? '+' : '−'}</text></g>`;
      }
      k = k2 + 1;
    }

    // Werte
    if (opts.values) {
      const crit = opts.crit || [];
      let cand = [0, n - 1];
      xs.forEach((x, i) => { if (crit.some((c) => Math.abs(x - c) < 2.5e-6 * Lp)) cand.push(i); });
      for (let i = 1; i < n - 1; i++) {
        const d1 = f[i] - f[i - 1], d2 = f[i + 1] - f[i];
        if (d1 * d2 < 0 && xs[i + 1] - xs[i] > 1e-5 * Lp && xs[i] - xs[i - 1] > 1e-5 * Lp) cand.push(i);
      }
      cand = [...new Set(cand)].filter((i) => Math.abs(f[i]) > 0.03 * s).sort((a, b) => Math.abs(f[b]) - Math.abs(f[a]));
      const acc = [];
      for (const i of cand) {
        let ok = true;
        for (const j of acc) {
          const sameX = Math.abs(xs[i] - xs[j]) < 1e-4 * Lp;
          if (Math.abs(xs[i] - xs[j]) < 0.07 * Lp && Math.abs(f[i] - f[j]) < 0.04 * s) { ok = false; break; }
          if (!sameX && Math.abs(X(xs[i]) - X(xs[j])) < 46 && Math.abs(Y(f[i]) - Y(f[j])) < 16 && Math.sign(f[i]) === Math.sign(f[j])) { ok = false; break; }
        }
        if (ok) acc.push(i);
        if (acc.length >= 9) break;
      }
      for (const i of acc) {
        let anc = 'middle';
        if (i < n - 1 && xs[i + 1] - xs[i] < 1e-5 * Lp && Math.abs(f[i + 1] - f[i]) > 0.02 * s) anc = 'end';
        if (i > 0 && xs[i] - xs[i - 1] < 1e-5 * Lp && Math.abs(f[i] - f[i - 1]) > 0.02 * s) anc = 'start';
        if (xs[i] < 0.04 * Lp) anc = 'start'; else if (xs[i] > 0.96 * Lp) anc = 'end';
        const yv = Y(f[i]);
        const below = yv > yc || (yv === yc && dir > 0);
        const xo = anc === 'end' ? -3 : anc === 'start' ? 3 : 0;
        front += text(X(xs[i]) + xo, below ? yv + 16 : yv - 6, fmt(f[i]), 'sv-value', compact ? 12 : 13, anc);
      }
      front += text(W - 8, 16, qty === 'M' ? 'kNm' : 'kN', 'sv-unit', 12, 'end');
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="sv sv-diagram">${g}${front}</svg>`;
  }

  root.NVM.draw = { system, diagram, htmlTex, svgTex, esc };
})(typeof window !== 'undefined' ? window : globalThis);
