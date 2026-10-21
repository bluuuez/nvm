/* NVM – Rechenkern
 * Statisch bestimmte Stabtragwerke erzeugen, exakt lösen, falsche Antworten
 * aus typischen Denkfehlern ableiten und alles erklären.
 *
 * Vorzeichen (positives Schnittufer): N > 0 Zug, V > 0 am positiven Schnittufer
 * nach unten, M > 0 Zug unten. Bei schrägen Stäben wird in Stabachsen-
 * Koordinaten s gerechnet (quer = senkrecht zur Achse, längs = in +s).
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ Helfer
  const rnd = Math.random;
  const randi = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const randperm = (n) => shuffle([...Array(n).keys()]);
  const cosd = (d) => Math.cos(d * Math.PI / 180);
  const sind = (d) => Math.sin(d * Math.PI / 180);
  const atan2d = (y, x) => Math.atan2(y, x) * 180 / Math.PI;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const maxAbs = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  function linspace(a, b, n) {
    const r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = a + (b - a) * i / (n - 1);
    return r;
  }
  function uniqSorted(arr) {
    const s = arr.slice().sort((p, q) => p - q);
    const out = [];
    for (const v of s) if (!out.length || v !== out[out.length - 1]) out.push(v);
    return out;
  }
  function interp1(xs, ys, x) {
    // xs streng monoton steigend
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (xs[m] <= x) lo = m; else hi = m;
    }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }

  // ------------------------------------------------------------ Zahlenformat
  function fmt(v, d = 1) {
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    return v.toFixed(d).replace('.', ',').replace('-', '−');
  }
  const fmtL = (v) => (Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? fmt(v, 1) : fmt(v, 2));
  const fmtN = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? fmt(v, 0) : fmt(v, 1));

  // ------------------------------------------------------------- Bausteine
  function mkLoad(type, sub, x, x2, v, v2, Fx, mag, ang, basis = 'len') {
    return { type, sub, x, x2, v, v2, Fx, mag, ang, basis };
  }
  const mkSup = (xs, types) => xs.map((x, i) => ({ x, type: types[i] }));

  function baseSys(L, type) {
    const s = {
      L, kind: '', st: L > 6 ? 1 : 0.5, name: '', hinges: [], sup: [], loads: [],
      alpha: 0, ca: 1, sa: 0, symDims: []
    };
    switch (type) {
      case 'eft': s.kind = 'eft'; s.name = 'Einfeldträger'; s.sup = mkSup([0, L], ['fest', 'los']); break;
      case 'kragL': s.kind = 'krag'; s.name = 'Kragarm'; s.sup = mkSup([0], ['einsp']); break;
      case 'kragR': s.kind = 'krag'; s.name = 'Kragarm'; s.sup = mkSup([L], ['einsp']); break;
      case 'ueber':
        s.kind = 'ueber'; s.name = 'Einfeldträger mit Kragarm';
        s.sup = mkSup([0, Math.round(2 * L / 3)], ['fest', 'los']); break;
      case 'gerber':
        s.kind = 'gerber'; s.name = 'Gerberträger';
        s.sup = mkSup([0, L], ['einsp', 'los']); s.hinges = [L / 2]; break;
    }
    return s;
  }

  function setIncline(s, l, h) {
    const Ls = Math.hypot(l, h);
    s.L = Ls; s.alpha = atan2d(h, l); s.ca = l / Ls; s.sa = h / Ls;
    return s;
  }
  const isIncl = (sys) => Math.abs(sys.alpha) > 1e-9;

  // freie Rasterstelle; awayFrom/minDist: mindestens so weit von einer Stelle entfernt (deutlich sichtbar verschoben)
  function pickFree(sys, used, forMoment, awayFrom = null, minDist = 0) {
    const L = sys.L, st = sys.st;
    const n = Math.floor(L / st + 1e-9);
    let cand = [];
    for (let i = 0; i <= n; i++) cand.push(i * st);
    if (Math.abs(cand[cand.length - 1] - L) > 1e-6) cand.push(L);
    const bl = sys.hinges.slice();
    for (const sp of sys.sup) if (!forMoment || sp.type === 'einsp') bl.push(sp.x);
    for (const u of used) bl.push(u);
    cand = cand.filter((c) => bl.every((b) => Math.abs(c - b) > 1e-6));
    if (awayFrom !== null) cand = cand.filter((c) => Math.abs(c - awayFrom) >= minDist - 1e-9);
    return cand.length ? pick(cand) : null;
  }

  // ------------------------------------------------------- Zufallssysteme
  function genSystem(level, kindPref = 'alle', needN = false, inclP = 0) {
    let kind;
    if (kindPref === 'alle') {
      let kinds;
      if (level <= 1) kinds = ['eft', 'eft', 'krag'];
      else if (level === 2) kinds = ['eft', 'eft', 'krag', 'krag', 'ueber'];
      else if (level === 3) kinds = ['eft', 'krag', 'ueber', 'ueber', 'gerber'];
      else kinds = ['eft', 'krag', 'ueber', 'gerber', 'gerber'];
      kind = pick(kinds);
    } else kind = kindPref;
    const incl = rnd() < inclP && ['alle', 'eft', 'krag'].includes(kindPref);
    const fl = rnd() < 0.5 ? ['fest', 'los'] : ['los', 'fest'];
    let sys, L;
    if (incl) {
      if (!['eft', 'krag'].includes(kind)) kind = pick(['eft', 'eft', 'krag']);
      const tri = [[4, 3], [8, 6], [6, 4.5], [6, 2.5], [4.8, 1.4], [4, 4], [6, 2.5]];
      const r = pick(tri);
      const l = r[0]; let h = r[1];
      if (rnd() < 0.5) h = -h;
      sys = setIncline(baseSys(1, 'leer'), l, h);
      L = sys.L;
      sys.st = (l > 6 ? 1 : 0.5) / sys.ca;
      sys.kind = kind;
      if (kind === 'eft') {
        const lt = rnd() < 0.3 ? 'losN' : 'los';
        const tp = rnd() < 0.5 ? ['fest', lt] : [lt, 'fest'];
        sys.sup = mkSup([0, L], tp); sys.name = 'Schräger Einfeldträger';
      } else {
        sys.sup = mkSup([rnd() < 0.5 ? 0 : L], ['einsp']); sys.name = 'Schräger Kragarm';
      }
    } else {
      L = pick(['ueber', 'gerber'].includes(kind) ? [6, 8] : [4, 5, 6, 8]);
      sys = baseSys(L, 'leer');
      sys.kind = kind;
      const st = sys.st;
      if (kind === 'eft') {
        sys.sup = mkSup([0, L], fl); sys.name = 'Einfeldträger';
      } else if (kind === 'krag') {
        sys.sup = mkSup([rnd() < 0.5 ? 0 : L], ['einsp']); sys.name = 'Kragarm';
      } else if (kind === 'ueber') {
        const o = st * randi(2, Math.round(L / 3 / st));
        const r = rnd();
        let xv;
        if (r < 0.4) { xv = [0, L - o]; sys.name = 'Einfeldträger mit Kragarm'; }
        else if (r < 0.8) { xv = [o, L]; sys.name = 'Einfeldträger mit Kragarm'; }
        else { const o2 = st * randi(2, Math.round(L / 4 / st)); xv = [o2, L - o]; sys.name = 'Träger mit zwei Kragarmen'; }
        sys.sup = mkSup(xv, fl);
      } else {
        sys.name = 'Gerberträger';
        if (rnd() < 0.5) {
          const xg = st * randi(Math.round(0.3 * L / st), Math.round(0.6 * L / st));
          if (rnd() < 0.5) { sys.sup = mkSup([0, L], ['einsp', 'los']); sys.hinges = [xg]; }
          else { sys.sup = mkSup([0, L], ['los', 'einsp']); sys.hinges = [L - xg]; }
        } else {
          const x1 = st * randi(Math.round(0.35 * L / st), Math.round(0.55 * L / st));
          let xg = x1 + st * randi(Math.round(1 / st), Math.round((L - x1 - 1) / st));
          let tp = ['los', 'los', 'los']; tp[randi(0, 2)] = 'fest';
          let xv = [0, x1, L];
          if (rnd() < 0.5) { xv = xv.map((x) => L - x).reverse(); xg = L - xg; tp = tp.reverse(); }
          sys.sup = mkSup(xv, tp); sys.hinges = [xg];
        }
      }
    }

    // Lasten
    const st = sys.st;
    const allT = ['F', 'F', 'q', 'qvoll', 'M', 'tri', 'Fs', 'H', 'mq'];
    let nl, types;
    if (level <= 1) { nl = 1; types = ['F', 'F', 'qvoll']; }
    else if (level === 2) { nl = 1; types = ['F', 'F', 'q', 'qvoll', 'M', 'tri', 'mq']; }
    else if (level === 3) { nl = randi(1, 2); types = allT; }
    else if (level === 4) { nl = 2; types = allT; }
    else { nl = randi(2, 3); types = allT; }
    if (incl) types = types.concat(['qvoll', 'qvoll']);
    const used = [];
    let nq = 0, tries = 0;
    const n = Math.floor(L / st + 1e-9);
    while (sys.loads.length < nl && tries < 60) {
      tries++;
      let t = pick(types);
      if (!sys.loads.length && t === 'H') t = 'F';
      if (['q', 'qvoll', 'tri'].includes(t) && nq >= 1) continue;
      let ld = null;
      const basis = incl && rnd() < 0.65 ? 'proj' : 'len';
      if (t === 'F' || t === 'Fs' || t === 'H') {
        const pos = pickFree(sys, used, false);
        if (pos === null) continue;
        const Fv = 10 * randi(1, 5);
        if (t === 'F') ld = mkLoad('F', 'F', pos, 0, Fv, 0, 0, Fv, 90);
        else if (t === 'Fs') {
          const a = pick([30, 45, 60]); const sg = rnd() < 0.5 ? 1 : -1;
          ld = mkLoad('F', 'Fs', pos, 0, Fv * sind(a), 0, sg * Fv * cosd(a), Fv, a);
        } else {
          const Hv = 10 * randi(1, 3); const sg = rnd() < 0.5 ? 1 : -1;
          ld = mkLoad('F', 'H', pos, 0, 0, 0, sg * Hv, Hv, 0);
        }
        used.push(pos);
      } else if (t === 'M') {
        const pos = pickFree(sys, used, true);
        if (pos === null) continue;
        const Mv = 10 * randi(1, 4) * (rnd() < 0.5 ? 1 : -1);
        ld = mkLoad('M', 'M', pos, 0, Mv, 0, 0, Math.abs(Mv), 0);
        used.push(pos);
      } else if (t === 'qvoll') {
        const qv = 5 * randi(1, 4);
        ld = mkLoad('q', 'qvoll', 0, L, qv, qv, 0, qv, 0, basis); nq++;
      } else if (t === 'q') {
        if (n < 2) continue;
        const i1 = randi(0, n - 2), i2 = randi(i1 + 2, n);
        const qv = 5 * randi(1, 4);
        ld = mkLoad('q', 'q', i1 * st, Math.min(i2 * st, L), qv, qv, 0, qv, 0, basis); nq++;
      } else if (t === 'mq') {
        // Linienmoment (Streckenmoment), nur am waagerechten Stab
        if (incl || sys.loads.some((l) => l.type === 'm')) continue;
        const mv = 5 * randi(1, 4) * (rnd() < 0.5 ? 1 : -1);
        let x1 = 0, x2 = L;
        if (rnd() < 0.4 && n >= 2) { const i1 = randi(0, n - 2), i2 = randi(i1 + 2, n); x1 = i1 * st; x2 = Math.min(i2 * st, L); }
        ld = mkLoad('m', 'mq', x1, x2, mv, mv, 0, Math.abs(mv), 0);
      } else if (t === 'tri') {
        let x1, x2;
        if (rnd() < 0.5 || n < 2) { x1 = 0; x2 = L; }
        else { const i1 = randi(0, n - 2), i2 = randi(i1 + 2, n); x1 = i1 * st; x2 = Math.min(i2 * st, L); }
        const qv = 5 * randi(2, 4);
        const up = rnd() < 0.5;
        ld = mkLoad('q', 'tri', x1, x2, up ? 0 : qv, up ? qv : 0, 0, qv, 0, basis); nq++;
      }
      if (ld) sys.loads.push(ld);
    }
    if (!sys.loads.length) sys.loads.push(mkLoad('q', 'qvoll', 0, L, 10, 10, 0, 10, 0));
    if (needN && !isIncl(sys) && !sys.loads.some((l) => Math.abs(l.Fx) > 1e-9)) {
      const pos = pickFree(sys, used, false);
      if (pos !== null) {
        const Fv = 10 * randi(1, 5), a = pick([30, 45, 60]), sg = rnd() < 0.5 ? 1 : -1;
        sys.loads.push(mkLoad('F', 'Fs', pos, 0, Fv * sind(a), 0, sg * Fv * cosd(a), Fv, a));
      }
    }
    return sys;
  }

  // ------------------------------------------------------------- Löser
  function distRes(x1, x2, q1, q2) {
    const R = (q1 + q2) / 2 * (x2 - x1);
    const xc = Math.abs(q1 + q2) > 1e-12 ? x1 + (x2 - x1) * (q1 + 2 * q2) / (3 * (q1 + q2)) : (x1 + x2) / 2;
    return [R, xc];
  }

  // Lasten in lokale Komponenten zerlegen
  // P: [s, Ft (quer, "nach unten" +), Fa (längs, +s)],  Mp: [s, M (Uhrzeigersinn +)]
  // D: Querstreckenlast [s1, s2, q1, q2],  Da: Längsstreckenlast [s1, s2, n1, n2]
  // Md: Linienmoment [s1, s2, m (Uhrzeigersinn +, je m)]; in der TUM-Notation ist m̂ = −m (gegen den Uhrzeigersinn positiv)
  function loadArrays(loads, ca = 1, sa = 0) {
    const P = [], Mp = [], D = [], Da = [], Md = [];
    for (const ld of loads) {
      if (ld.type === 'F') {
        const Gx = ld.Fx, Gy = -ld.v;
        const Fa = Gx * ca + Gy * sa, Fn = -Gx * sa + Gy * ca;
        P.push([ld.x, -Fn, Fa]);
      } else if (ld.type === 'M') {
        Mp.push([ld.x, ld.v]);
      } else if (ld.type === 'm') {
        Md.push([ld.x, ld.x2, ld.v]);
      } else {
        const k = ld.basis === 'proj' ? ca : 1;
        const w1 = ld.v * k, w2 = ld.v2 * k;
        D.push([ld.x, ld.x2, w1 * ca, w2 * ca]);
        if (Math.abs(sa) > 1e-12) Da.push([ld.x, ld.x2, -w1 * sa, -w2 * sa]);
      }
    }
    return { P, Mp, D, Da, Md };
  }

  function unitAction(x, c, ca = 1, sa = 0) {
    switch (c) {
      case 'V': return { P: [[x, -ca, sa]], Mp: [] };   // senkrecht nach oben
      case 'H': return { P: [[x, sa, ca]], Mp: [] };    // waagerecht nach rechts
      case 'N': return { P: [[x, -1, 0]], Mp: [] };     // senkrecht zur Stabachse
      default: return { P: [], Mp: [[x, 1]] };          // Moment im Uhrzeigersinn
    }
  }

  function partRes(Di, x) {
    const [x1, x2, q1, q2] = Di;
    const u = Math.min(Math.max(x, x1), x2);
    const len = u - x1;
    const qu = q1 + (q2 - q1) * (u - x1) / (x2 - x1);
    const R = (q1 + qu) / 2 * len;
    const den = q1 + qu;
    const c = Math.abs(den) > 1e-12 ? len * (q1 + 2 * qu) / (3 * den) : len / 2;
    return [R, c];
  }

  // Schnittgrößen am linken Teilsystem an der Stelle x
  function sgPoint(P, Mp, D, Da, x, Md = []) {
    let N = 0, V = 0, M = 0;
    for (const p of P) if (p[0] < x) { N -= p[2]; V -= p[1]; M -= p[1] * (x - p[0]); }
    for (const m of Mp) if (m[0] < x) M += m[1];
    for (const d of D) { const [R, c] = partRes(d, x); V -= R; M -= R * (x - (d[0] + c)); }
    for (const d of Da) { const [R] = partRes(d, x); N -= R; }
    for (const m of Md) M += m[2] * (Math.min(Math.max(x, m[0]), m[1]) - m[0]);   // dM/dx = V − m̂ mit m̂ = −m[2]
    return { N, V, M };
  }
  const sgAt = (sol, x) => sgPoint(sol.P, sol.Mp, sol.D, sol.Da, x, sol.Md);
  function sgArr(sol, xs) {
    const N = [], V = [], M = [];
    for (const x of xs) { const r = sgAt(sol, x); N.push(r.N); V.push(r.V); M.push(r.M); }
    return { N, V, M };
  }

  function eqVec(P, Mp, D, hinges, Da, Md = []) {
    const e = new Array(3 + hinges.length).fill(0);
    let Ra = 0;
    for (const d of Da) Ra += distRes(d[0], d[1], d[2], d[3])[0];
    e[0] = sum(P.map((p) => p[2])) + Ra;
    let Rs = 0, Ms = 0;
    for (const d of D) { const [R, c] = distRes(d[0], d[1], d[2], d[3]); Rs += R; Ms += R * c; }
    e[1] = sum(P.map((p) => p[1])) + Rs;
    e[2] = sum(P.map((p) => p[0] * p[1])) + sum(Mp.map((m) => m[1])) + sum(Md.map((m) => m[2] * (m[1] - m[0]))) + Ms;
    hinges.forEach((h, k) => { e[3 + k] = sgPoint(P, Mp, D, Da, h, Md).M; });
    return e;
  }

  function gaussSolve(A, b) {
    const n = A.length;
    const M = A.map((r, i) => r.concat([b[i]]));
    const scale = Math.max(1e-300, ...A.map((r) => maxAbs(r)));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-10 * scale) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  // Auflagerreaktionen aus ΣH = 0, ΣV = 0, ΣM = 0 und M = 0 an jedem Gelenk
  function solveSys(sys) {
    const { ca, sa } = sys;
    const la = loadArrays(sys.loads, ca, sa);
    const unk = [];
    sys.sup.forEach((sp, i) => {
      const cs = sp.type === 'fest' ? 'VH' : sp.type === 'los' ? 'V' : sp.type === 'losN' ? 'N' : 'VHM';
      for (const c of cs) unk.push({ x: sp.x, c, s: i });
    });
    const nU = unk.length, nE = 3 + sys.hinges.length;
    const sol = { ok: false, R: new Array(nU).fill(0), P: la.P, Mp: la.Mp, D: la.D, Da: la.Da, Md: la.Md, unk };
    if (nU !== nE) return sol;
    const A = [...Array(nE)].map(() => new Array(nU).fill(0));
    unk.forEach((u, j) => {
      const ua = unitAction(u.x, u.c, ca, sa);
      const e = eqVec(ua.P, ua.Mp, [], sys.hinges, []);
      for (let i = 0; i < nE; i++) A[i][j] = e[i];
    });
    const b = eqVec(la.P, la.Mp, la.D, sys.hinges, la.Da, la.Md).map((v) => -v);
    const r = gaussSolve(A, b);
    if (!r) return sol;
    const R = r.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
    const P = la.P.slice(), Mp = la.Mp.slice();
    unk.forEach((u, j) => {
      const ua = unitAction(u.x, u.c, ca, sa);
      for (const p of ua.P) P.push([p[0], R[j] * p[1], R[j] * p[2]]);
      for (const m of ua.Mp) Mp.push([m[0], R[j] * m[1]]);
    });
    return { ok: true, R, P, Mp, D: la.D, Da: la.Da, Md: la.Md, unk };
  }

  function critPts(sys) {
    let c = [0, sys.L, ...sys.sup.map((s) => s.x), ...sys.hinges];
    for (const ld of sys.loads) { c.push(ld.x); if (ld.type === 'q' || ld.type === 'm') c.push(ld.x2); }
    return uniqSorted(c.map((v) => Math.round(v * 1e6) / 1e6));
  }
  function mkGrid(L, crit) {
    const e = 1e-6 * L;
    let xs = linspace(0, L, 401);
    for (const c of crit) xs.push(c - e, c + e);
    return uniqSorted(xs.filter((x) => x >= 0 && x <= L));
  }
  function curves(sys, sol) {
    const crit = critPts(sys);
    const xs = mkGrid(sys.L, crit);
    const { N, V, M } = sgArr(sol, xs);
    const sc = Math.max(maxAbs(N), maxAbs(V), maxAbs(M), 1);
    const cl = (a) => a.map((v) => (Math.abs(v) < 1e-9 * sc ? 0 : v));
    return { xs, N: cl(N), V: cl(V), M: cl(M), crit };
  }
  const pickQ = (qty, c) => (qty === 'N' ? c.N : qty === 'V' ? c.V : c.M);

  function totalVertical(sys) {
    let F = 0;
    for (const ld of sys.loads) {
      if (ld.type === 'F') F += ld.v;
      else if (ld.type === 'q') F += (ld.basis === 'proj' ? sys.ca : 1) * distRes(ld.x, ld.x2, ld.v, ld.v2)[0];
    }
    return F;
  }

  // ---------------------------------------------- typische Fehler (Systeme)
  function mirrorLoads(sys) {
    const s = clone(sys), L = sys.L;
    for (const ld of s.loads) {
      if (ld.type === 'q') {
        const x1 = L - ld.x2, x2 = L - ld.x, v1 = ld.v2, v2 = ld.v;
        ld.x = x1; ld.x2 = x2; ld.v = v1; ld.v2 = v2;
      } else if (ld.type === 'm') {
        const x1 = L - ld.x2; ld.x2 = L - ld.x; ld.x = x1; ld.v = -ld.v; ld.v2 = ld.v;
      } else {
        ld.x = L - ld.x; ld.Fx = -ld.Fx;
        if (ld.type === 'M') ld.v = -ld.v;
      }
    }
    return s;
  }
  function mirrorSupports(sys) {
    const s = clone(sys);
    for (const sp of s.sup) sp.x = sys.L - sp.x;
    s.hinges = s.hinges.map((h) => sys.L - h);
    return s;
  }
  function loadShort(ld) {
    switch (ld.sub) {
      case 'F': return `F = ${fmtN(ld.v)} kN`;
      case 'Fs': return `F = ${fmtN(ld.mag)} kN (schräg)`;
      case 'H': return `H = ${fmtN(Math.abs(ld.Fx))} kN`;
      case 'M': return `M = ${fmtN(Math.abs(ld.v))} kNm`;
      case 'tri': return `Dreieckslast ${fmtN(ld.mag)} kN/m`;
      case 'mq': return `Linienmoment m = ${fmtN(ld.mag)} kNm/m`;
      default: return `q = ${fmtN(ld.mag)} kN/m`;
    }
  }

  function systemMods(sys) {
    const mods = [];
    const L = sys.L;
    mods.push({ sys: mirrorLoads(sys), tag: 'lastGespiegelt', info: '' });
    mods.push({ sys: mirrorSupports(sys), tag: 'lagerGespiegelt', info: '' });
    if (sys.loads.some((l) => l.type === 'q')) {
      const s = clone(sys);
      s.loads = s.loads.map((ld) => {
        if (ld.type !== 'q') return ld;
        let [R, xc] = distRes(ld.x, ld.x2, ld.v, ld.v2);
        if (ld.basis === 'proj') R *= sys.ca;
        return mkLoad('F', 'F', xc, 0, R, 0, 0, R, 90);
      });
      mods.push({ sys: s, tag: 'resultierende', info: '' });
    }
    if (sys.loads.some((l) => l.type === 'F' && Math.abs(l.v) > 1e-9)) {
      const s = clone(sys);
      const extra = [];
      s.loads = s.loads.map((ld) => {
        if (!(ld.type === 'F' && Math.abs(ld.v) > 1e-9)) return ld;
        if (Math.abs(ld.Fx) > 1e-9) extra.push(mkLoad('F', 'H', ld.x, 0, 0, 0, ld.Fx, Math.abs(ld.Fx), 0));
        return mkLoad('q', 'qvoll', 0, L, ld.v / L, ld.v / L, 0, ld.v / L, 0);
      });
      s.loads = s.loads.concat(extra);
      mods.push({ sys: s, tag: 'verschmiert', info: '' });
    }
    if (sys.loads.some((l) => l.type === 'M' || l.type === 'm')) {
      const s = clone(sys);
      for (const ld of s.loads) if (ld.type === 'M' || ld.type === 'm') { ld.v = -ld.v; ld.v2 = ld.v; }
      mods.push({ sys: s, tag: 'momentDreh', info: '' });
    }
    if (sys.loads.some((l) => l.type === 'm')) {
      // Linienmoment als Einzelmoment in der Mitte des Bereichs
      const s = clone(sys);
      s.loads = s.loads.map((ld) => {
        if (ld.type !== 'm') return ld;
        const Mt = ld.v * (ld.x2 - ld.x), xm = pickFree(s, [], true);
        const xc = (ld.x + ld.x2) / 2;
        const pos = s.sup.some((sp) => sp.type === 'einsp' && Math.abs(sp.x - xc) < 1e-9) ? xm : xc;
        return mkLoad('M', 'M', pos === null ? xc : pos, 0, Mt, 0, 0, Math.abs(Mt), 0);
      });
      mods.push({ sys: s, tag: 'linienmomentKonz', info: '' });
    }
    if (sys.loads.length >= 2) {
      sys.loads.forEach((ld, i) => {
        const s = clone(sys); s.loads.splice(i, 1);
        mods.push({ sys: s, tag: 'lastFehlt', info: loadShort(ld) });
      });
    }
    const ip = sys.loads.map((l, i) => i).filter((i) => !['q', 'm'].includes(sys.loads[i].type));
    const usedX = ip.map((i) => sys.loads[i].x);
    for (const i of ip) {
      // mindestens ein Viertel der Länge versetzt, sonst sieht das kleine Bild fast gleich aus
      const pos = pickFree(sys, usedX, sys.loads[i].type === 'M', sys.loads[i].x, 0.25 * L);
      if (pos !== null) {
        const s = clone(sys); s.loads[i].x = pos;
        mods.push({ sys: s, tag: 'lastVerschoben', info: '' });
      }
    }
    const iFest = sys.sup.map((s, i) => i).filter((i) => sys.sup[i].type === 'fest');
    const iLos = sys.sup.map((s, i) => i).filter((i) => ['los', 'losN'].includes(sys.sup[i].type));
    if (iFest.length && iLos.length) {
      const s = clone(sys);
      s.sup[iFest[0]].type = 'los';
      s.sup[pick(iLos)].type = 'fest';
      mods.push({ sys: s, tag: 'festLos', info: '' });
    }
    if (sys.hinges.length) {
      let cand = [];
      for (let x = sys.st; x < L - 1e-9; x += sys.st) cand.push(Math.round(x * 1e9) / 1e9);
      cand = cand.filter((c) => Math.abs(c - sys.hinges[0]) >= 0.2 * L - 1e-9 && sys.sup.every((sp) => Math.abs(c - sp.x) > 1e-9));
      if (cand.length) {
        const s = clone(sys); s.hinges = [pick(cand)];
        mods.push({ sys: s, tag: 'gelenkVerschoben', info: '' });
      }
    }
    if (isIncl(sys)) {
      let s = clone(sys);
      s.alpha = 0; s.ca = 1; s.sa = 0;
      for (const sp of s.sup) if (sp.type === 'losN') sp.type = 'los';
      s.name = s.name.replace('Schräger ', '');
      mods.push({ sys: s, tag: 'ohneNeigung', info: '' });
      if (iLos.length) {
        s = clone(sys);
        for (const i of iLos) s.sup[i].type = s.sup[i].type === 'los' ? 'losN' : 'los';
        mods.push({ sys: s, tag: 'losGedreht', info: '' });
      }
      s = clone(sys);
      s.alpha = Math.sign(sys.alpha) * (90 - Math.abs(sys.alpha));
      s.ca = cosd(s.alpha); s.sa = sind(s.alpha);
      mods.push({ sys: s, tag: 'komponenten', info: '' });
    }
    return mods;
  }

  const mkCand = (xs, f, fc, tag, expl, sys) => ({ xs, f, fc, tag, expl, sys, label: '', val: NaN });

  function tagPrio(tag) {
    if (['resultierende', 'linear', 'festLos', 'gelenkVerschoben', 'ohneNeigung', 'losGedreht', 'komponenten'].includes(tag)) return 0.8;
    if (['vorzeichen', 'lagerGespiegelt', 'momentDreh', 'verschmiert'].includes(tag)) return 0.55;
    if (['verwechselt', 'lastGespiegelt'].includes(tag)) return 0.45;
    return 0.25;
  }

  // Verläufe werden in den Antworten einzeln skaliert gezeichnet: verglichen wird die Form.
  // Formfehler (Knick statt Krümmung) sind auch bei kleinem Abstand gut zu sehen, alles andere muss deutlicher abweichen.
  const SHAPE_TAGS = ['resultierende', 'verschmiert', 'linear', 'linienmomentKonz'];
  function acceptCand(c, ref, keep, tag = '') {
    if (!c || !c.length) return false;
    const m = maxAbs(c);
    if (m < 1e-9 || c.some((v) => !isFinite(v))) return false;
    const cn = c.map((v) => v / m);
    const rms = (a, b) => Math.sqrt(sum(a.map((v, i) => (v - b[i]) ** 2)) / a.length);
    const lim = SHAPE_TAGS.includes(tag) ? 0.07 : 0.1;
    if (rms(cn, ref) < lim) return false;
    for (const k of keep) if (rms(cn, k) < 0.07) return false;
    keep.push(cn);
    return true;
  }

  // Sehen zwei Systeme im kleinen Bild (ohne Maße) praktisch gleich aus?
  function visSig(sys) {
    const L = sys.L, dir = (l) => Math.sign(l.type === 'F' ? (Math.abs(l.v) > 1e-9 ? l.v : l.Fx) : (l.v || l.v2));
    return {
      a: Math.round(sys.alpha),
      sup: sys.sup.map((sp) => ({ t: sp.type, x: sp.x / L })).sort((p, q) => p.x - q.x),
      hin: sys.hinges.map((h) => h / L).sort((p, q) => p - q),
      lds: sys.loads.map((l) => ({ t: l.sub, d: dir(l), x: l.x / L, x2: (l.type === 'q' || l.type === 'm' ? l.x2 : l.x) / L, up: l.sub === 'tri' ? Math.sign(Math.abs(l.v2) - Math.abs(l.v)) : 0 }))
        .sort((p, q) => p.x - q.x || p.t.localeCompare(q.t))
    };
  }
  function looksSame(s1, s2, tol = 0.13) {
    const A = visSig(s1), B = visSig(s2);
    if (A.a !== B.a || A.sup.length !== B.sup.length || A.hin.length !== B.hin.length || A.lds.length !== B.lds.length) return false;
    const near = (p, q) => Math.abs(p - q) <= tol;
    return A.sup.every((p, i) => p.t === B.sup[i].t && near(p.x, B.sup[i].x)) &&
      A.hin.every((h, i) => near(h, B.hin[i])) &&
      A.lds.every((p, i) => { const q = B.lds[i]; return p.t === q.t && p.d === q.d && p.up === q.up && near(p.x, q.x) && near(p.x2, q.x2); });
  }

  function sortByPrio(pool) {
    return pool.map((p) => ({ p, k: rnd() + tagPrio(p.tag) })).sort((a, b) => b.k - a.k).map((o) => o.p);
  }

  function makeDiagOptions(sys, sol, qty, cv, level) {
    const L = sys.L, xc = linspace(0, L, 301);
    const cc = sgArr(sol, xc);
    const fc = pickQ(qty, cc);
    const f = pickQ(qty, cv);
    const xs = cv.xs;
    let pool = [];
    pool.push(mkCand(xs, f.map((v) => -v), fc.map((v) => -v), 'vorzeichen', tagExpl('vorzeichen', qty), sys));
    if (qty !== 'N') {
      if (qty === 'M') pool.push(mkCand(xs, cv.V, cc.V, 'verwechselt', tagExpl('verwechselt', qty), sys));
      else pool.push(mkCand(xs, cv.M, cc.M, 'verwechselt', tagExpl('verwechselt', qty), sys));
    }
    if (qty === 'M' && sol.D.length) {
      const kx = [], ky = [];
      xs.forEach((x, i) => {
        if (i === 0 || i === xs.length - 1 || cv.crit.some((c) => Math.abs(x - c) < 2.5e-6 * L)) { kx.push(x); ky.push(f[i]); }
      });
      if (kx.length >= 2) {
        pool.push(mkCand(xs, xs.map((x) => interp1(kx, ky, x)), xc.map((x) => interp1(kx, ky, x)), 'linear', tagExpl('linear', qty), sys));
      }
    }
    for (const md of systemMods(sys)) {
      const so = solveSys(md.sys);
      if (!so.ok) continue;
      const c2 = curves(md.sys, so);
      const cc2 = sgArr(so, xc);
      pool.push(mkCand(c2.xs, pickQ(qty, c2), pickQ(qty, cc2), md.tag, tagExpl(md.tag, qty, md.info), md.sys));
    }
    pool = sortByPrio(pool);
    const ref = fc.map((v) => v / maxAbs(fc));
    const keep = [], sel = [];
    for (const p of pool) {
      if (acceptCand(p.fc, ref, keep, p.tag)) sel.push(p);
      if (sel.length >= 3) break;
    }
    const inc = isIncl(sys) ? 1 : 0;
    for (let t = 0; t < 30 && sel.length < 3; t++) {
      const s2 = genSystem(level, sys.kind, qty === 'N', inc);
      const so2 = solveSys(s2);
      if (!so2.ok) continue;
      const c2 = curves(s2, so2);
      const fc2 = pickQ(qty, sgArr(so2, linspace(0, s2.L, 301)));
      if (acceptCand(fc2, ref, keep)) {
        sel.push(mkCand(c2.xs.map((x) => x * L / s2.L), pickQ(qty, c2), fc2, 'anderesSystem', tagExpl('anderesSystem', qty), s2));
      }
    }
    if (sel.length < 3) return null;
    const all = [mkCand(xs, f, fc, 'richtig', '', sys), ...sel.slice(0, 3)];
    const perm = randperm(4);
    return { opts: perm.map((i) => all[i]), correct: perm.indexOf(0) };
  }

  function makeSysOptions(sys, sol, level, qq = 'M') {
    const L = sys.L, xc = linspace(0, L, 301);
    const Mc = sgArr(sol, xc)[qq];
    if (maxAbs(Mc) < 1e-9) return null;
    const ref = Mc.map((v) => v / maxAbs(Mc));
    let pool = [];
    for (const md of systemMods(sys)) {
      if (md.tag === 'komponenten') continue;
      const so = solveSys(md.sys);
      if (!so.ok) continue;
      pool.push(mkCand([], [], sgArr(so, xc)[qq], md.tag, sysTagExpl(md.tag, md.info, qq), md.sys));
    }
    pool = sortByPrio(pool);
    const keep = [], sel = [];
    const distinct = (s2) => !looksSame(s2, sys) && sel.every((o) => !looksSame(s2, o.sys));
    for (const p of pool) {
      if (distinct(p.sys) && acceptCand(p.fc, ref, keep, p.tag)) sel.push(p);
      if (sel.length >= 3) break;
    }
    const inc = isIncl(sys) ? 1 : 0;
    for (let t = 0; t < 30 && sel.length < 3; t++) {
      const s2 = genSystem(level, sys.kind, qq === 'N', inc);
      const so2 = solveSys(s2);
      if (!so2.ok) continue;
      const Mc2 = sgArr(so2, linspace(0, s2.L, 301))[qq];
      if (maxAbs(Mc2) < 1e-9) continue;
      if (distinct(s2) && acceptCand(Mc2, ref, keep)) sel.push(mkCand([], [], Mc2, 'anderesSystem', sysTagExpl('anderesSystem', '', qq), s2));
    }
    if (sel.length < 3) return null;
    const all = [mkCand([], [], Mc, 'richtig', '', sys), ...sel.slice(0, 3)];
    const perm = randperm(4);
    return { opts: perm.map((i) => all[i]), correct: perm.indexOf(0) };
  }

  function pickValues(sys, vT, items, unit, ctx) {
    const ord = items.map((it) => ({ it, k: it.pr })).sort((a, b) => b.k - a.k).map((o) => o.it);
    const opts = [], got = [vT];
    const tolA = Math.max(0.07 * Math.abs(vT), 0.3);
    for (const it of ord) {
      const v = it.v;
      if (!isFinite(v)) continue;
      if (ctx === 'M' && v < 0.05) continue;
      if (got.some((g) => Math.abs(v - g) < tolA)) continue;
      const c = mkCand([], [], [], it.tag, valTagExpl(it.tag, it.info, ctx), sys);
      c.label = fmt(v) + unit; c.val = v;
      opts.push(c); got.push(v);
      if (opts.length >= 3) break;
    }
    if (opts.length < 3) return null;
    const tc = mkCand([], [], [], 'richtig', '', sys);
    tc.label = fmt(vT) + unit; tc.val = vT;
    const all = [tc, ...opts];
    const perm = randperm(4);
    return { opts: perm.map((i) => all[i]), correct: perm.indexOf(0) };
  }

  function makeValMax(sys, sol, cv) {
    let vT = 0, im = 0;
    cv.M.forEach((v, i) => { if (Math.abs(v) > vT) { vT = Math.abs(v); im = i; } });
    const xm = cv.xs[im];
    const items = [];
    for (const md of systemMods(sys)) {
      const so = solveSys(md.sys);
      if (!so.ok) continue;
      items.push({ v: maxAbs(curves(md.sys, so).M), tag: md.tag, info: md.info, pr: rnd() + 0.35 });
    }
    items.push({ v: 2 * vT, tag: 'faktor2', info: '', pr: rnd() }, { v: vT / 2, tag: 'halb', info: '', pr: rnd() },
      { v: 1.5 * vT, tag: 'faktor15', info: '', pr: rnd() }, { v: 0.75 * vT, tag: 'faktor34', info: '', pr: rnd() });
    const r = pickValues(sys, vT, items, ' kNm', 'M');
    if (!r) return null;
    r.solLines = [`|M|max = ${fmt(vT)} kNm bei x = ${fmt(xm * sys.ca, 2)} m.`, ...cutTerms(sys, sol, xm)];
    return r;
  }

  function makeValR(sys, sol) {
    const names = supNames(sys);
    let iv = sol.unk.map((u, i) => i).filter((i) => sol.unk[i].c === 'V' && Math.abs(sol.R[i]) > 0.05);
    if (!iv.length) return null;
    const j = pick(iv);
    const val = sol.R[j];
    const nm = names[sol.unk[j].s];
    const items = [];
    sol.unk.forEach((u, jj) => {
      if (u.c === 'V' && jj !== j) items.push({ v: sol.R[jj], tag: 'andereLager', info: '', pr: 1 + rnd() });
    });
    items.push({ v: totalVertical(sys), tag: 'summe', info: '', pr: 0.6 + rnd() },
      { v: -val, tag: 'vorzeichenWert', info: '', pr: 0.5 + rnd() },
      { v: 2 * val, tag: 'faktor2', info: '', pr: rnd() }, { v: val / 2, tag: 'halb', info: '', pr: rnd() });
    for (const md of systemMods(sys)) {
      if (!['lastGespiegelt', 'verschmiert', 'lastFehlt', 'momentDreh', 'lastVerschoben'].includes(md.tag)) continue;
      const so = solveSys(md.sys);
      if (!so.ok || so.R.length <= j) continue;
      items.push({ v: so.R[j], tag: md.tag, info: md.info, pr: 0.3 + rnd() });
    }
    const r = pickValues(sys, val, items, ' kN', 'R');
    if (!r) return null;
    r.solLines = [`Richtig: ${nm}_v = ${fmt(val)} kN ${val >= 0 ? '(nach oben)' : '– zeigt also nach unten'}. Der Rechenweg steht unten.`];
    r.name = nm;
    return r;
  }

  // ------------------------------------- Standardfälle (Formel / glatte Zahlen)
  const mkDis = (f, v, tag, um) => ({ f, v, tag, um });

  function classicCase(cs, ask) {
    const isM = ask === 'M';
    let sys, cor, dis = [], sl = [], rname = '';
    switch (cs) {
      case 'eftQ': {
        const L = pick([2, 4, 6, 8]), q = pick([2, 4, 5, 6, 8, 10]);
        sys = baseSys(L, 'eft'); sys.loads = [mkLoad('q', 'qvoll', 0, L, q, q, 0, q, 0)];
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        if (isM) {
          cor = mkDis('qL²/8', q * L * L / 8);
          dis = [mkDis('qL²/4', q * L * L / 4, 'faktor2'), mkDis('qL²/2', q * L * L / 2, 'kragFormel'),
            mkDis('qL²/12', q * L * L / 12, 'einspann'), mkDis('qL²/16', q * L * L / 16, 'halb'), mkDis('qL/2', q * L / 2, 'einheit', true)];
          sl = ['Maximum in Feldmitte (dort ist V = 0):', 'M = A·L/2 − q·L/2·L/4 = qL²/4 − qL²/8 = qL²/8'];
        } else {
          rname = pick(['A', 'B']);
          cor = mkDis('qL/2', q * L / 2);
          dis = [mkDis('qL', q * L, 'summe'), mkDis('qL/4', q * L / 4, 'halb'),
            mkDis('qL²/2', q * L * L / 2, 'einheit', true), mkDis('qL²/8', q * L * L / 8, 'einheit', true)];
          sl = ['Symmetrie: Jedes Lager trägt die Hälfte der Gesamtlast qL.', 'A = B = qL/2'];
        }
        break;
      }
      case 'eftFm': {
        const L = pick([2, 4, 6, 8]), F = pick([10, 20, 30, 40]);
        sys = baseSys(L, 'eft'); sys.loads = [mkLoad('F', 'F', L / 2, 0, F, 0, 0, F, 90)];
        sys.symDims = [{ x1: 0, x2: L / 2, label: 'L/2', row: 1 }, { x1: L / 2, x2: L, label: 'L/2', row: 1 }];
        cor = mkDis('FL/4', F * L / 4);
        dis = [mkDis('FL/2', F * L / 2, 'faktor2'), mkDis('FL/8', F * L / 8, 'halb'), mkDis('FL', F * L, 'kragFormel'),
          mkDis('FL/3', F * L / 3, 'faktorX'), mkDis('F/2', F / 2, 'einheit', true)];
        sl = ['A = B = F/2, Maximum unter der Last:', 'M = A·L/2 = F/2·L/2 = FL/4'];
        break;
      }
      case 'eftFa': {
        const L = pick([4, 5, 6, 8]), F = pick([10, 20, 30, 40, 60]);
        let a = randi(1, L - 1);
        if (2 * a === L) a += 1;
        const b = L - a;
        sys = baseSys(L, 'eft'); sys.loads = [mkLoad('F', 'F', a, 0, F, 0, 0, F, 90)];
        sys.symDims = [{ x1: 0, x2: a, label: 'a', row: 1 }, { x1: a, x2: L, label: 'b', row: 1 }, { x1: 0, x2: L, label: 'L', row: 2 }];
        if (isM) {
          cor = mkDis('F·a·b/L', F * a * b / L);
          dis = [mkDis('F·a', F * a, 'kragFormel'), mkDis('F·b', F * b, 'kragFormel'), mkDis('FL/4', F * L / 4, 'mittig'),
            mkDis('F·a·b/(2L)', F * a * b / (2 * L), 'halb'), mkDis('F·a²/L', F * a * a / L, 'hebelVertauscht')];
          sl = ['A = F·b/L, Maximum unter der Last:', 'M = A·a = F·a·b/L'];
        } else {
          rname = pick(['A', 'B']);
          if (rname === 'A') {
            cor = mkDis('F·b/L', F * b / L); dis = [mkDis('F·a/L', F * a / L, 'andereLager')];
            sl = ['ΣM um B = 0:  A·L − F·b = 0', 'A = F·b/L (je näher die Last an A, desto größer A)'];
          } else {
            cor = mkDis('F·a/L', F * a / L); dis = [mkDis('F·b/L', F * b / L, 'andereLager')];
            sl = ['ΣM um A = 0:  B·L − F·a = 0', 'B = F·a/L'];
          }
          dis.push(mkDis('F/2', F / 2, 'mittig'), mkDis('F', F, 'summe'), mkDis('F·a·b/L', F * a * b / L, 'einheit', true));
        }
        break;
      }
      case 'kragF': {
        const L = pick([1, 2, 3, 4, 5]), F = pick([10, 20, 30, 40]);
        const left = rnd() < 0.5;
        sys = baseSys(L, left ? 'kragL' : 'kragR');
        sys.loads = [mkLoad('F', 'F', left ? L : 0, 0, F, 0, 0, F, 90)];
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        cor = mkDis('F·L', F * L);
        dis = [mkDis('FL/2', F * L / 2, 'halb'), mkDis('FL/4', F * L / 4, 'eftFormel'), mkDis('2FL', 2 * F * L, 'faktor2'),
          mkDis('F', F, 'einheit', true)];
        sl = ['Schnitt direkt an der Einspannung:', 'M = −F·L (Zug oben), also |M|max = F·L'];
        break;
      }
      case 'kragQ': {
        const L = pick([1, 2, 3, 4]), q = pick([2, 4, 6, 8, 10]);
        sys = baseSys(L, rnd() < 0.5 ? 'kragL' : 'kragR');
        sys.loads = [mkLoad('q', 'qvoll', 0, L, q, q, 0, q, 0)];
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        if (isM) {
          cor = mkDis('qL²/2', q * L * L / 2);
          dis = [mkDis('qL²/8', q * L * L / 8, 'eftFormel'), mkDis('qL²', q * L * L, 'faktor2'), mkDis('qL²/4', q * L * L / 4, 'halb'),
            mkDis('qL²/6', q * L * L / 6, 'dreieck'), mkDis('qL', q * L, 'einheit', true)];
          sl = ['Resultierende R = qL greift bei L/2 an:', '|M|max = qL·L/2 = qL²/2 (an der Einspannung, Zug oben)'];
        } else {
          rname = 'A';
          cor = mkDis('qL', q * L);
          dis = [mkDis('qL/2', q * L / 2, 'halb'), mkDis('2qL', 2 * q * L, 'faktor2'), mkDis('qL/4', q * L / 4, 'faktorX'),
            mkDis('qL²/2', q * L * L / 2, 'einheit', true)];
          sl = ['ΣV = 0: Die Einspannung trägt die gesamte Last.', 'A_v = qL'];
        }
        break;
      }
      case 'kragFa': {
        const L = pick([3, 4, 5, 6]), F = pick([10, 20, 30, 40]), a = randi(1, L - 1);
        if (rnd() < 0.5) {
          sys = baseSys(L, 'kragL'); sys.loads = [mkLoad('F', 'F', a, 0, F, 0, 0, F, 90)];
          sys.symDims = [{ x1: 0, x2: a, label: 'a', row: 1 }, { x1: 0, x2: L, label: 'L', row: 2 }];
        } else {
          sys = baseSys(L, 'kragR'); sys.loads = [mkLoad('F', 'F', L - a, 0, F, 0, 0, F, 90)];
          sys.symDims = [{ x1: L - a, x2: L, label: 'a', row: 1 }, { x1: 0, x2: L, label: 'L', row: 2 }];
        }
        cor = mkDis('F·a', F * a);
        dis = [mkDis('F·L', F * L, 'hebel'), mkDis('F·(L−a)', F * (L - a), 'hebelVertauscht'), mkDis('F·a/2', F * a / 2, 'halb'),
          mkDis('F', F, 'einheit', true)];
        sl = ['Hebelarm = Abstand der Last zur Einspannung:', '|M|max = F·a (an der Einspannung)'];
        break;
      }
      case 'kragTri': {
        const L = pick([3, 6]), q0 = pick([2, 4, 6, 8]);
        sys = baseSys(L, 'kragL');
        if (rnd() < 0.5) {
          sys.loads = [mkLoad('q', 'tri', 0, L, q0, 0, 0, q0, 0)];
          cor = mkDis('q₀L²/6', q0 * L * L / 6); dis = [mkDis('q₀L²/3', q0 * L * L / 3, 'dreieckSchwerpunkt')];
          sl = ['Resultierende R = q₀L/2 im Schwerpunkt, 1/3 von der hohen Seite (= Einspannung):', '|M|max = q₀L/2 · L/3 = q₀L²/6'];
        } else {
          sys.loads = [mkLoad('q', 'tri', 0, L, 0, q0, 0, q0, 0)];
          cor = mkDis('q₀L²/3', q0 * L * L / 3); dis = [mkDis('q₀L²/6', q0 * L * L / 6, 'dreieckSchwerpunkt')];
          sl = ['Resultierende R = q₀L/2 im Schwerpunkt, 1/3 von der hohen Seite (= 2L/3 von der Einspannung):', '|M|max = q₀L/2 · 2L/3 = q₀L²/3'];
        }
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        dis.push(mkDis('q₀L²/2', q0 * L * L / 2, 'rechteck'), mkDis('q₀L²/8', q0 * L * L / 8, 'eftFormel'),
          mkDis('q₀L²/4', q0 * L * L / 4, 'faktorX'), mkDis('q₀L/2', q0 * L / 2, 'einheit', true));
        break;
      }
      case 'ueberQ': {
        const l = pick([4, 6]), a = pick([1, 2]), q = pick([2, 4, 6, 8]), L = l + a;
        sys = baseSys(L, 'leer'); sys.kind = 'ueber'; sys.name = 'Einfeldträger mit Kragarm';
        sys.sup = mkSup([0, l], ['fest', 'los']);
        sys.loads = [mkLoad('q', 'q', l, L, q, q, 0, q, 0)];
        sys.symDims = [{ x1: 0, x2: l, label: 'l', row: 1 }, { x1: l, x2: L, label: 'a', row: 1 }];
        cor = mkDis('qa²/2', q * a * a / 2);
        dis = [mkDis('qa²/8', q * a * a / 8, 'eftFormel'), mkDis('qa²', q * a * a, 'faktor2'), mkDis('q·a·l/2', q * a * l / 2, 'hebel'),
          mkDis('qa', q * a, 'einheit', true)];
        sl = ['Größtes Moment über dem Lager B (Stützmoment, Zug oben).', 'Schnitt bei B, nur der Kragarm: |M| = q·a · a/2 = qa²/2'];
        break;
      }
      case 'eftTri': {
        const L = pick([3, 6]), q0 = pick([2, 4, 6, 8, 10, 12]);
        sys = baseSys(L, 'eft'); sys.loads = [mkLoad('q', 'tri', 0, L, 0, q0, 0, q0, 0)];
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        if (isM) {
          cor = mkDis('q₀L²/(9√3)', q0 * L * L / (9 * Math.sqrt(3)));
          dis = [mkDis('q₀L²/8', q0 * L * L / 8, 'rechteck'), mkDis('q₀L²/16', q0 * L * L / 16, 'halb'),
            mkDis('q₀L²/6', q0 * L * L / 6, 'kragFormel'), mkDis('q₀L²/12', q0 * L * L / 12, 'einspann')];
          sl = ['V = 0 bei x = L/√3 ≈ 0,577·L (vom spitzen Ende aus):', 'max M = q₀L²/(9√3) ≈ 0,064·q₀L²'];
        } else {
          rname = pick(['A', 'B']);
          if (rname === 'A') { cor = mkDis('q₀L/6', q0 * L / 6); dis = [mkDis('q₀L/3', q0 * L / 3, 'dreieckSchwerpunkt')]; }
          else { cor = mkDis('q₀L/3', q0 * L / 3); dis = [mkDis('q₀L/6', q0 * L / 6, 'dreieckSchwerpunkt')]; }
          dis.push(mkDis('q₀L/4', q0 * L / 4, 'symmetrie'), mkDis('q₀L/2', q0 * L / 2, 'summe'), mkDis('q₀L²/6', q0 * L * L / 6, 'einheit', true));
          sl = ['Resultierende R = q₀L/2 bei 2L/3 (Schwerpunkt, näher an der hohen Seite B):',
            'ΣM um A: B·L = q₀L/2 · 2L/3, also B = q₀L/3 und A = q₀L/2 − B = q₀L/6'];
        }
        break;
      }
      case 'eftM': {
        const L = pick([2, 4, 5, 10]), M0 = pick([10, 20, 40]), a = randi(1, L - 1);
        const sg = rnd() < 0.5 ? 1 : -1;
        sys = baseSys(L, 'eft'); sys.loads = [mkLoad('M', 'M', a, 0, sg * M0, 0, 0, M0, 0)];
        sys.symDims = [{ x1: 0, x2: a, label: 'a', row: 1 }, { x1: a, x2: L, label: 'b', row: 1 }, { x1: 0, x2: L, label: 'L', row: 2 }];
        rname = pick(['A', 'B']);
        const vA = -sg * M0 / L;
        const vv = rname === 'A' ? vA : -vA;
        const fc = vv < 0 ? '−M₀/L' : '+M₀/L', fo = vv < 0 ? '+M₀/L' : '−M₀/L';
        cor = mkDis(fc, vv);
        dis = [mkDis(fo, -vv, 'vorzeichenWert'), mkDis('0', 0, 'null'), mkDis('M₀·a/L', M0 * a / L, 'lage'),
          mkDis('M₀/(2L)', M0 / (2 * L), 'halb'), mkDis('M₀', M0, 'einheit', true)];
        sl = ['Ein Einzelmoment wird von einem Kräftepaar der Lager aufgenommen:',
          '|A| = |B| = M₀/L; eine Kraft zeigt nach oben, die andere nach unten. Die Lage a spielt keine Rolle.'];
        break;
      }
      case 'ueberF': {
        const l = pick([2, 4, 5]), a = pick([1, 2]), F = pick([10, 20, 40]), L = l + a;
        sys = baseSys(L, 'leer'); sys.kind = 'ueber'; sys.name = 'Einfeldträger mit Kragarm';
        sys.sup = mkSup([0, l], ['fest', 'los']);
        sys.loads = [mkLoad('F', 'F', L, 0, F, 0, 0, F, 90)];
        sys.symDims = [{ x1: 0, x2: l, label: 'l', row: 1 }, { x1: l, x2: L, label: 'a', row: 1 }];
        rname = pick(['A', 'B']);
        if (rname === 'B') {
          cor = mkDis('F·(l+a)/l', F * (l + a) / l);
          dis = [mkDis('F·a/l', F * a / l, 'andereLager'), mkDis('F', F, 'summe'), mkDis('F·l/(l+a)', F * l / (l + a), 'hebelVertauscht'),
            mkDis('F·a', F * a, 'einheit', true)];
          sl = ['ΣM um A = 0:  B·l − F·(l+a) = 0', 'B = F·(l+a)/l, also größer als F selbst'];
        } else {
          cor = mkDis('−F·a/l', -F * a / l);
          dis = [mkDis('+F·a/l', F * a / l, 'vorzeichenWert'), mkDis('0', 0, 'null'), mkDis('F·(l+a)/l', F * (l + a) / l, 'andereLager'),
            mkDis('−F', -F, 'summe')];
          sl = ['ΣM um B = 0:  A·l + F·a = 0', 'A = −F·a/l; A zeigt nach unten und hält den Träger fest.'];
        }
        break;
      }
      case 'kragMq': {
        const L = pick([2, 3, 4, 5]), m = pick([5, 10, 20]), sg = rnd() < 0.5 ? 1 : -1;
        sys = baseSys(L, rnd() < 0.5 ? 'kragL' : 'kragR');
        sys.loads = [mkLoad('m', 'mq', 0, L, sg * m, sg * m, 0, m, 0)];
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        cor = mkDis('m·L', m * L);
        dis = [mkDis('m·L²/2', m * L * L / 2, 'mWieQ'), mkDis('m·L/2', m * L / 2, 'halb'), mkDis('2m·L', 2 * m * L, 'faktor2'),
          mkDis('m', m, 'einheit', true)];
        sl = ['Keine Querlast: V = 0 überall. Das Linienmoment ändert nur die Steigung: dM/dx = V − m = −m.',
          'M ist linear, am freien Ende null, an der Einspannung |M|max = m·L.'];
        break;
      }
      case 'eftMq': {
        const L = pick([2, 4, 5, 6]), m = pick([5, 10, 20]), sg = rnd() < 0.5 ? 1 : -1;
        sys = baseSys(L, 'eft'); sys.loads = [mkLoad('m', 'mq', 0, L, sg * m, sg * m, 0, m, 0)];
        sys.symDims = [{ x1: 0, x2: L, label: 'L', row: 1 }];
        rname = pick(['A', 'B']);
        const so = solveSys(sys), vv = so.R[rname === 'A' ? 0 : 2];
        cor = mkDis(vv < 0 ? '−m' : '+m', vv);
        dis = [mkDis(vv < 0 ? '+m' : '−m', -vv, 'vorzeichenWert'), mkDis('m·L', m * L, 'mMalL'), mkDis('0', 0, 'null'),
          mkDis('m·L/2', m * L / 2, 'mWieQ'), mkDis('m/2', m / 2, 'halb')];
        sl = ['Das Gesamtmoment m·L nehmen die beiden Lager als Kräftepaar auf:',
          '|A| = |B| = m·L/L = m, unabhängig von der Spannweite. Eine Kraft zeigt nach oben, die andere nach unten.'];
        break;
      }
      case 'schraegQ': {
        const r = pick([[4, 3], [8, 6], [6, 4.5], [6, 2.5]]);
        const l = r[0], h = r[1], q = pick([2, 4, 8]);
        sys = setIncline(baseSys(1, 'leer'), l, h);
        sys.kind = 'eft'; sys.name = 'Schräger Einfeldträger';
        sys.sup = mkSup([0, sys.L], ['fest', 'los']);
        sys.loads = [mkLoad('q', 'qvoll', 0, sys.L, q, q, 0, q, 0, 'proj')];
        sys.symDims = [{ x1: 0, x2: sys.L, label: 'l', row: 1 }];
        const s = sys.L;
        if (isM) {
          cor = mkDis('q·l²/8', q * l * l / 8);
          dis = [mkDis('q·s²/8', q * s * s / 8, 'stablaenge'), mkDis('q·l²/8·cos α', q * l * l / 8 * sys.ca, 'cosDoppelt'),
            mkDis('q·l²/2', q * l * l / 2, 'kragFormel'), mkDis('q·l/2', q * l / 2, 'einheit', true)];
          sl = ['Last je m Grundriss und senkrechte Lagerkräfte: M wie beim waagerechten Träger mit Spannweite l.',
            'max M = q·l²/8 (die Stablänge s spielt keine Rolle)'];
        } else {
          rname = pick(['A', 'B']);
          cor = mkDis('q·l/2', q * l / 2);
          dis = [mkDis('q·s/2', q * s / 2, 'stablaenge'), mkDis('q·l', q * l, 'summe'), mkDis('q·l/2·cos α', q * l / 2 * sys.ca, 'cosDoppelt'),
            mkDis('q·l²/8', q * l * l / 8, 'einheit', true)];
          sl = ['Gesamtlast q·l (je m Grundriss), symmetrisch auf beide Lager:', 'A_v = B_v = q·l/2'];
        }
        break;
      }
    }
    dis = dis.map((d) => ({ f: d.f, v: d.v, tag: d.tag || '', um: !!d.um }));
    return { sys, cor, dis, sl, rname };
  }

  function classicItem(ask, numMode, allowIncl) {
    let cases, unit;
    if (ask === 'M') {
      cases = ['eftQ', 'eftFm', 'eftFa', 'kragF', 'kragQ', 'kragFa', 'kragTri', 'ueberQ', 'eftTri', 'kragMq'];
      if (allowIncl) cases = cases.concat(['schraegQ', 'schraegQ']);
      unit = ' kNm';
    } else {
      cases = ['eftQ', 'eftFa', 'eftFa', 'eftM', 'eftTri', 'kragQ', 'ueberF', 'ueberF', 'eftMq'];
      if (allowIncl) cases.push('schraegQ');
      unit = ' kN';
    }
    const isF = numMode === 'formel';
    for (let t = 0; t < 300; t++) {
      const cs = pick(cases);
      if (!isF && cs === 'eftTri' && ask === 'M') continue;
      const { sys, cor, dis, sl, rname } = classicCase(cs, ask);
      if (!isF && Math.abs(cor.v * 2 - Math.round(cor.v * 2)) > 1e-9) continue;
      const sel = [], got = [cor.v], gotF = [cor.f];
      for (const d of shuffle(dis)) {
        if (Math.abs(d.v - cor.v) < 1e-9) continue;
        if (isF) { if (gotF.includes(d.f)) continue; }
        else {
          if (d.um) continue;
          if (Math.abs(d.v * 2 - Math.round(d.v * 2)) > 1e-9) continue;
          if (got.some((g) => Math.abs(d.v - g) < Math.max(0.5, 0.05 * Math.abs(cor.v)))) continue;
        }
        sel.push(d); got.push(d.v); gotF.push(d.f);
        if (sel.length >= 3) break;
      }
      if (sel.length < 3) continue;
      let text;
      if (ask === 'M') text = isF ? 'Welche Formel liefert das betragsmäßig größte Biegemoment |M|max?' : 'Wie groß ist das betragsmäßig größte Biegemoment |M|max?';
      else text = (isF ? `Welche Formel liefert die vertikale Auflagerkraft ${rname}_v?` : `Wie groß ist die vertikale Auflagerkraft ${rname}_v?`) + ' (positiv = nach oben)';
      const all = [cor, ...sel];
      const opts = all.map((d, i) => {
        const tg = i === 0 ? 'richtig' : d.tag;
        const c = mkCand([], [], [], tg, i === 0 ? '' : valTagExpl(tg, '', ask), sys);
        c.label = isF ? d.f : fmtN(d.v) + unit;
        c.val = d.v;
        return c;
      });
      const perm = randperm(4);
      return {
        sys, opts: perm.map((i) => opts[i]), correct: perm.indexOf(0), text, symbolic: isF,
        solLines: [`Richtig: ${cor.f}`, ...sl, `Mit den Zahlen aus dem Beispiel: ${cor.f} = ${Math.abs(cor.v * 10 - Math.round(cor.v * 10)) < 1e-6 ? fmtN(cor.v) : fmt(cor.v, 2)}${unit}`]
      };
    }
    return null;
  }

  // ------------------------------------------------------------ Aufgaben
  // Aufgabentypen je Übungsform und Schnittgröße
  const TASKS = {
    verlauf: { M: ['diagM'], V: ['diagV'], N: ['diagN'] },
    system: { M: ['sysFromM'], V: ['sysFromV'], N: ['sysFromN'] },
    max: { M: ['clickMmax'], V: ['clickVmax'], N: [] },
    null: { M: ['clickM0'], V: ['clickV0'], N: [] },
    werte: { M: ['valMax'], V: ['valR'], N: [] }
  };
  // Liefert die möglichen Typen; leer heißt: Kombination gibt es nicht
  function typePool(level, qty, task, kind) {
    let ts;
    // Gelenke erkennen: ab Stufe 3, bei Gerberträgern und Stabwerken
    if (task === 'gelenk') {
      if (level < 3 || !['gerber', 'rahmen', 'alle'].includes(kind) || qty === 'wert') return [];
      return ['hingeDiag', 'hingeDiag', 'hingeSys'];
    }
    // Rahmen und Stabwerke: nur Verläufe, ab Stufe 4
    if (kind === 'rahmen') {
      if (level < 4 || (task && task !== 'mix' && task !== 'verlauf') || qty === 'wert') return [];
      return qty === 'M' || qty === 'V' || qty === 'N' ? ['frame' + qty] : ['frameM', 'frameV', 'frameN'];
    }
    if (task && task !== 'mix' && TASKS[task]) {
      const t = TASKS[task];
      ts = qty === 'M' || qty === 'V' || qty === 'N' ? t[qty].slice() : [...t.M, ...t.V, ...t.N];
    } else {
      switch (qty) {
        case 'M':
          ts = ['diagM', 'diagM', 'diagM', 'valMax', 'clickMmax'];
          if (level >= 2) ts.push('sysFromM', 'sysFromM');
          if (level >= 3) ts.push('clickM0');
          break;
        case 'V': ts = ['diagV', 'diagV', 'diagV', 'valR', 'clickV0', 'clickVmax']; if (level >= 2) ts.push('sysFromV'); break;
        case 'N': ts = ['diagN', 'diagN', 'sysFromN']; break;
        case 'wert': ts = ['valMax', 'valR']; break;
        default:
          ts = ['diagM', 'diagM', 'diagM', 'diagV', 'diagV', 'valMax', 'valR', 'clickMmax'];
          if (level >= 2) ts.push('sysFromM', 'sysFromM', 'clickV0', 'sysFromV');
          if (level >= 3) ts.push('diagN', 'clickM0');
      }
    }
    // Kombinationen, die mit dem Tragwerk praktisch nie entstehen
    const drop = [];
    if (kind === 'krag') drop.push('clickV0', 'clickM0');
    if (kind === 'eft') drop.push('clickM0');
    let f = ts.filter((t) => !drop.includes(t));
    // gemischt (Arcade): ab Stufe 4 kommen Rahmen dazu, mit der Stufe immer häufiger
    if (kind === 'alle' && level >= 4 && (!task || task === 'mix' || task === 'verlauf') && qty !== 'wert') {
      const nF = level === 4 ? 3 : level === 5 ? 5 : 7;
      const fq = qty === 'M' || qty === 'V' || qty === 'N' ? ['frame' + qty] : ['frameM', 'frameM', 'frameV', 'frameN'];
      for (let i = 0; i < nF; i++) f.push(fq[i % fq.length]);
      if (level >= 5 && (!task || task === 'mix')) f.push('hingeDiag', 'hingeSys');
    }
    if (task && task !== 'mix' && TASKS[task]) return f;      // gezielt: lieber leer als etwas anderes
    return f.length ? f : ts;
  }
  function pickType(level, qty, task, kind) {
    let ts = typePool(level, qty, task, kind);
    if (!ts.length) ts = typePool(level, 'mix', task, kind);   // z. B. N + Stelle antippen
    return pick(ts);
  }
  // Lernmodus mit Mehrfachauswahl: alle passenden Kombinationen aus Schnittgröße, Aufgabe und Tragwerk
  function learnPool(qtys, tasks, kinds, level = 1) {
    const pool = [];
    for (const task of tasks) for (const qty of qtys) for (const kind of kinds) {
      for (const type of new Set(typePool(kind === 'rahmen' || task === 'gelenk' ? level : 1, qty, task, kind))) pool.push({ type, qty, task, kind });
    }
    return pool;
  }
  // Nächster Aufgabentyp: nicht zweimal derselbe hintereinander, solange es Alternativen gibt
  function nextPick(pool, lastType) {
    const other = pool.filter((p) => p.type !== lastType);
    return pick(other.length ? other : pool);
  }

  // Was die Stufen am Zufallsgenerator ändern (siehe genSystem)
  const LEVEL_INFO = [
    { name: 'Einstieg', short: 'Einfeldträger und Kragarm mit einer Last.', systems: 'Einfeldträger und Kragarm', loads: 'Genau eine Last: Einzellast oder Gleichstreckenlast über die ganze Länge.' },
    { name: 'Grundlagen', short: 'Neu: Träger mit Kragarm und alle Lastarten.', systems: 'dazu Träger mit Kragarm', loads: 'Eine Last, jetzt auch Teilstreckenlast, Dreieckslast, Einzelmoment oder Linienmoment.' },
    { name: 'Fortgeschritten', short: 'Neu: Gerberträger, zwei Lasten.', systems: 'dazu Gerberträger', loads: 'Ein bis zwei Lasten, auch schräge und waagerechte Einzelkräfte.' },
    { name: 'Erste Rahmen', short: 'Neu: Kragwinkel, Knick- und Treppenträger.', systems: 'Träger mit zwei Lasten, dazu Kragwinkel, Knick- und Treppenträger und abgespannte Träger', loads: 'Träger mit zwei Lasten. Neu: kleine Rahmen mit einer Last – Kragwinkel, Knick- und Treppenträger, abgespannte Träger.' },
    { name: 'Rahmen', short: 'Neu: Rahmen und Gelenkträger auf Pendelstützen.', systems: 'dazu Rahmen, Dreigelenkrahmen und Gelenkträger auf Pendelstützen', loads: 'Träger mit zwei bis drei Lasten. Rahmen, Dreigelenkrahmen und Gelenkträger auf Pendelstützen mit ein bis zwei Lasten.' },
    { name: 'Pendel- und Nullstäbe', short: 'Pendel- und Nullstäbe erkennen.', systems: 'dazu Fachwerkunterbau, unterspannte Träger und Stäbe auf Pendelstäben', loads: 'Stabwerke, bei denen du Pendel- und Nullstäbe erkennen musst: Fachwerkunterbau, unterspannte Träger, Stäbe auf Pendelstäben.' },
    { name: 'Klausurniveau', short: 'Größere Stabwerke wie in der Sammlung.', systems: 'dazu Gelenkträger mit Rahmenecke und Giebelrahmen mit Zugband', loads: 'Größere Stabwerke wie in der Schnittgrößensammlung, meist zwei Lasten.' },
    { name: 'Profi', short: 'Die größten Stabwerke.', systems: 'alle, die größten Systeme', loads: 'Die größten Stabwerke mit zwei bis drei Lasten.' }
  ];
  const levelInfo = (lv) => LEVEL_INFO[Math.max(1, Math.min(LEVEL_INFO.length, lv)) - 1];
  const MAX_LEVEL = LEVEL_INFO.length;

  const isClickType = (t) => ['clickMmax', 'clickVmax', 'clickV0', 'clickM0'].includes(t);
  const isValType = (t) => ['valMax', 'valR'].includes(t);

  function signChangeX(xs, f, L) {
    let tx = [];
    const s = maxAbs(f);
    if (s < 1e-9) return tx;
    const sg = f.map((v) => (Math.abs(v) < 1e-6 * s ? 0 : Math.sign(v)));
    const nz = sg.map((v, i) => i).filter((i) => sg[i] !== 0);
    for (let i = 0; i < nz.length - 1; i++) {
      const a = nz[i], b = nz[i + 1];
      if (sg[a] !== sg[b]) {
        if (b === a + 1) tx.push((xs[a] + xs[b]) / 2);
        else for (let k = a + 1; k < b; k++) tx.push(xs[k]);
      }
    }
    return tx.filter((x) => x > 0.03 * L && x < 0.97 * L);
  }
  function clusterRanges(tx, L) {
    const t = tx.slice().sort((p, q) => p - q);
    const rg = [];
    if (!t.length) return rg;
    let a = t[0], b = t[0];
    for (let i = 1; i < t.length; i++) {
      if (t[i] - b > 0.03 * L) { rg.push([a, b]); a = t[i]; }
      b = t[i];
    }
    rg.push([a, b]);
    return rg;
  }
  function clusterText(tx, L) {
    return clusterRanges(tx, L).map((r) => (r[1] - r[0] < 0.02 * L ? `x = ${fmt((r[0] + r[1]) / 2, 2)} m` : `x = ${fmt(r[0], 2)} … ${fmt(r[1], 2)} m`)).join(' oder ');
  }

  // exakte Stelle(n) eines Maximums: an Lastpunkte bzw. an V = 0 anlegen
  function exactTargets(sys, sol, tgt, Q) {
    const L = sys.L, cp = critPts(sys), e = 1e-6 * L;
    const val = (s) => Math.max(Math.abs(sgAt(sol, Math.max(s - e, 0))[Q]), Math.abs(sgAt(sol, Math.min(s + e, L))[Q]));
    return clusterRanges(tgt, L).map(([a, b]) => {
      const va = val(a), vb = val(b), vm = val((a + b) / 2), vmax = Math.max(va, vb, vm, 1e-12);
      if (b - a >= 0.02 * L && Math.abs(va - vb) < 0.005 * vmax && Math.abs(vm - va) < 0.005 * vmax) {
        const na = cp.find((p) => Math.abs(p - a) < 0.03 * L), nb = cp.filter((p) => Math.abs(p - b) < 0.03 * L).pop();
        return [na ?? a, nb ?? b];
      }
      const inR = tgt.filter((t) => t >= a - 1e-9 && t <= b + 1e-9);
      const m = inR.reduce((p, t) => (val(t) > val(p) ? t : p), inR[0]);
      const near = cp.filter((p) => Math.abs(p - m) < 0.03 * L).sort((p, r) => Math.abs(p - m) - Math.abs(r - m))[0];
      if (near !== undefined && val(near) >= 0.99 * val(m)) return [near, near];
      if (Q === 'M') {
        const f = (x) => sgAt(sol, x).V;
        let x0 = Math.max(m - 0.05 * L, 0), x1 = Math.min(m + 0.05 * L, L);
        if (f(x0) * f(x1) < 0) {
          for (let k = 0; k < 50; k++) { const xm = (x0 + x1) / 2; if (f(x0) * f(xm) <= 0) x1 = xm; else x0 = xm; }
          return [(x0 + x1) / 2, (x0 + x1) / 2];
        }
      }
      return [m, m];
    });
  }
  const rangesText = (rg, ca) => rg.map(([a, b]) => (Math.abs(b - a) < 1e-9 ? `x = ${fmtL(a * ca)} m` : `x = ${fmtL(a * ca)} … ${fmtL(b * ca)} m`)).join(' oder ');

  function buildQuestion(level, qty, kind, forceType, cfg) {
    cfg = cfg || { calc: 'rechner', incl: 0 };
    let task = cfg.task || 'mix';
    for (let attempt = 0; attempt < 160; attempt++) {
      if (attempt >= 60) forceType = '';
      if (attempt >= 150) task = 'mix';
      let typ = forceType || pickType(level, qty, task, kind);
      if (typ === 'hingeDiag' || typ === 'hingeSys') {
        const hq = root.NVM.framegen && root.NVM.framegen.buildHingeQuestion(level, typ === 'hingeSys' ? 'sys' : 'diag', qty);
        if (hq) return hq;
        continue;
      }
      if (typ.startsWith('frame')) {
        const fq = root.NVM.framegen && root.NVM.framegen.buildFrameQuestion(Math.max(4, level), typ[5]);
        if (fq) return fq;
        continue;
      }
      if (kind === 'rahmen') continue;
      let kpref = kind;
      if (typ === 'clickV0' && kind === 'krag') typ = 'diagV';
      if (typ === 'clickM0' && kind === 'alle') kpref = pick(['ueber', 'gerber']);

      if (isValType(typ) && cfg.calc !== 'rechner') {
        const it = classicItem(typ === 'valMax' ? 'M' : 'R', cfg.calc, cfg.incl > 0);
        if (!it) continue;
        const sol = solveSys(it.sys);
        const cv = curves(it.sys, sol);
        return {
          type: typ, sys: it.sys, sol, cv, qty: 'M', text: it.text, opts: it.opts, correct: it.correct,
          target: [], tol: 0, clickTag: '', solLines: it.solLines, symbolic: it.symbolic
        };
      }
      const sys = genSystem(level, kpref, typ === 'diagN' || typ === 'sysFromN', cfg.incl);
      const sol = solveSys(sys);
      if (!sol.ok) continue;
      const cv = curves(sys, sol);
      const q = { type: typ, sys, sol, cv, qty: 'M', text: '', opts: null, correct: -1, target: [], tol: 0, clickTag: '', solLines: [], symbolic: false };
      let good = true;
      if (typ.startsWith('diag')) {
        const qq = typ[4];
        if (maxAbs(pickQ(qq, cv)) < 1e-6) good = false;
        else {
          const r = makeDiagOptions(sys, sol, qq, cv, level);
          if (!r) good = false;
          else {
            q.qty = qq; q.opts = r.opts; q.correct = r.correct;
            q.text = { M: 'Welcher Momentenverlauf M(x) gehört zu diesem System?', V: 'Welcher Querkraftverlauf V(x) gehört zu diesem System?', N: 'Welcher Normalkraftverlauf N(x) gehört zu diesem System?' }[qq];
            q.solLines = [`Richtig ist Antwort ${r.correct + 1}.`];
          }
        }
      } else if (typ.startsWith('sysFrom')) {
        const qq = typ[7];
        const r = makeSysOptions(sys, sol, level, qq);
        if (!r) good = false;
        else {
          q.qty = qq; q.opts = r.opts; q.correct = r.correct;
          q.text = `Hier siehst du einen ${{ M: 'Momentenverlauf', V: 'Querkraftverlauf', N: 'Normalkraftverlauf' }[qq]}. Zu welchem System gehört er?`;
          q.solLines = [`Richtig ist System ${r.correct + 1}.`];
        }
      } else if (typ === 'valMax') {
        const r = makeValMax(sys, sol, cv);
        if (!r) good = false;
        else { q.opts = r.opts; q.correct = r.correct; q.solLines = r.solLines; q.text = 'Wie groß ist das betragsmäßig größte Biegemoment |M|max?'; }
      } else if (typ === 'valR') {
        const r = makeValR(sys, sol);
        if (!r) good = false;
        else { q.opts = r.opts; q.correct = r.correct; q.solLines = r.solLines; q.text = `Wie groß ist die vertikale Auflagerkraft ${r.name}_v? (positiv = nach oben)`; }
      } else {
        let tgt;
        if (typ === 'clickMmax') {
          const mx = maxAbs(cv.M);
          tgt = cv.xs.filter((x, i) => Math.abs(cv.M[i]) >= 0.985 * mx);
          q.text = 'Tippe auf die Stelle, an der das Biegemoment betragsmäßig am größten ist.';
        } else if (typ === 'clickVmax') {
          const mx = maxAbs(cv.V);
          tgt = cv.xs.filter((x, i) => Math.abs(cv.V[i]) >= 0.985 * mx);
          q.text = 'Tippe auf die Stelle, an der die Querkraft betragsmäßig am größten ist.';
        } else if (typ === 'clickV0') {
          tgt = signChangeX(cv.xs, cv.V, sys.L);
          q.text = 'Tippe auf eine Stelle, an der die Querkraft ihr Vorzeichen wechselt.';
        } else {
          tgt = signChangeX(cv.xs, cv.M, sys.L);
          q.text = 'Tippe auf einen Momentennullpunkt im Inneren des Trägers (Vorzeichenwechsel von M).';
        }
        if (!tgt.length || maxAbs(cv.M) < 1e-6) good = false;
        else {
          q.target = tgt; q.tol = 0.045 * sys.L; q.clickTag = 'klick' + typ.slice(5); if (typ.startsWith('clickV')) q.qty = 'V';
          if (typ === 'clickMmax' || typ === 'clickVmax') {
            const Q = typ === 'clickMmax' ? 'M' : 'V';
            q.exact = exactTargets(sys, sol, tgt, Q);
            const ee = 1e-6 * sys.L;
            const vx = (x) => Math.max(Math.abs(sgAt(sol, Math.max(x - ee, 0))[Q]), Math.abs(sgAt(sol, Math.min(x + ee, sys.L))[Q]));
            const mx = Math.max(maxAbs(Q === 'M' ? cv.M : cv.V), ...q.exact.flat().map(vx));
            q.maxVal = mx;
            q.solLines = ['Gesucht war ' + rangesText(q.exact, sys.ca) + ` (|${Q}|max = ${fmt(mx)} ${Q === 'M' ? 'kNm' : 'kN'}).`];
          } else q.solLines = ['Gesucht war ' + clusterText(tgt.map((x) => x * sys.ca), sys.L * sys.ca) + '.'];
        }
      }
      if (!good) continue;
      return q;
    }
    throw new Error('Konnte keine Aufgabe erzeugen.');
  }

  // ---------------------------------------------------------- Erklärungen
  function supNames(sys) {
    const ord = sys.sup.map((s, i) => i).sort((a, b) => sys.sup[a].x - sys.sup[b].x);
    const nm = new Array(sys.sup.length);
    ord.forEach((i, k) => { nm[i] = 'ABCD'[k]; });
    return nm;
  }
  function momentAtSupport(sol, x, L) {
    return sgAt(sol, x <= L / 2 ? x + 1e-6 * L : x - 1e-6 * L).M;
  }

  function featureRules(sys, focus) {
    const R = [];
    const subs = sys.loads.map((l) => l.sub);
    const incl = isIncl(sys);
    if (subs.includes('q') || subs.includes('qvoll')) R.push('Gleichstreckenlast: V linear, M quadratische Parabel (dV/dx = −q, dM/dx = V).');
    if (subs.includes('tri')) R.push('Dreieckslast: V quadratisch, M kubisch (Parabel 3. Grades).');
    if (subs.includes('F')) R.push('Einzellast: Sprung in V, Knick in M.');
    if (subs.includes('Fs')) R.push('Schräge Last zerlegen: der Anteil quer zur Stabachse wirkt auf V und M, der Anteil längs auf N.');
    if (subs.includes('H')) R.push('Horizontalkraft: Sprung im N-Verlauf. Nur Festlager bzw. Einspannung nehmen H auf.');
    if (subs.includes('M')) R.push('Einzelmoment: Sprung in M um M₀, V springt dort nicht.');
    if (subs.includes('mq')) R.push('Linienmoment m: V ändert sich darunter nicht (dV/dx = 0), M ändert seine Steigung, denn dM/dx = V − m (m gegen den Uhrzeigersinn positiv). Ein Sprung in M entsteht nicht.');
    if (incl) {
      R.push('Schräger Stab: jede Last in Komponenten zerlegen. Quer zur Achse wirkt sie auf V und M, längs der Achse auf N.');
      if (sys.loads.some((l) => l.type === 'q' && l.basis === 'proj')) R.push('Last je m Grundriss q: quer q·cos²α, längs q·sinα·cosα (jeweils je m Stab).');
      if (sys.loads.some((l) => l.type === 'q' && l.basis === 'len')) R.push('Last je m Stablänge g (z. B. Eigengewicht): quer g·cos α, längs g·sin α.');
      if (sys.kind === 'eft' && !sys.sup.some((s) => s.type === 'losN')) R.push('Senkrechte Lagerkräfte: Der M-Verlauf ist derselbe wie beim waagerechten Träger mit der Grundrissspannweite l.');
      R.push('Die Normalkraft hängt davon ab, welches Lager die Längskomponente aufnimmt. Eine Lagerkraft steht immer senkrecht zur Gleitebene.');
    }
    if (sys.kind === 'krag') {
      const onlyForces = sys.loads.every((l) => !['M', 'm', 'mq'].includes(l.type));
      R.push('Kragarm: Am freien Ende ist M = 0 (ohne Endmoment), an der Einspannung ist |M| am größten' +
        (onlyForces ? ' – bei Lasten von oben Zug oben, also M < 0.' : '; ob Zug oben oder unten, hängt von der Drehrichtung der Lasten ab.'));
    }
    else if (sys.kind === 'ueber') R.push('Über dem Innenlager entsteht ein Stützmoment – bei Lasten von oben negativ (Zug oben). Am freien Kragende ist M = 0 (ohne Endmoment).');
    else if (sys.kind === 'gerber') R.push('Gelenk: Dort ist M = 0. Erst den Einhängeträger lösen, seine Gelenkkraft belastet den Kragträger.');
    else R.push('Gelenkige Endlager: M = 0 an beiden Enden (außer bei einem Einzelmoment direkt am Lager).');
    if (focus === 'V') R.push('V ist die Steigung der Momentenlinie: V = dM/dx. Jedes Auflager ist eine Einzelkraft, also ein Sprung in V.');
    else if (focus === 'N') R.push('N > 0 ist Zug, N < 0 Druck. N ändert sich nur durch Kräfte längs der Stabachse.');
    else R.push(sys.loads.some((l) => l.type === 'm') ? 'Extremwerte von M liegen, wo dM/dx = V − m das Vorzeichen wechselt – oder am Rand.' : 'Extremwerte von M liegen, wo V = 0 ist bzw. das Vorzeichen wechselt – oder am Rand, etwa an einer Einspannung.');
    return R;
  }

  function classicLine(sys) {
    if (sys.loads.length !== 1) return '';
    const ld = sys.loads[0], L = sys.L;
    if (isIncl(sys)) {
      if (sys.kind === 'eft' && ld.sub === 'qvoll' && ld.basis === 'proj' && !sys.sup.some((s) => s.type === 'losN')) {
        const l = L * sys.ca;
        return `max M = q·l²/8 = ${fmtN(ld.v)}·${fmtL(l)}²/8 = ${fmt(ld.v * l * l / 8)} kNm (l = Grundriss)`;
      }
      return '';
    }
    if (sys.kind === 'eft') {
      if (ld.sub === 'qvoll') return `max M = qL²/8 = ${fmtN(ld.v)}·${fmtN(L)}²/8 = ${fmt(ld.v * L * L / 8)} kNm, A = B = qL/2 = ${fmt(ld.v * L / 2)} kN`;
      if (ld.sub === 'F') { const a = ld.x, b = L - a; return `max M = F·a·b/L = ${fmtN(ld.v)}·${fmtL(a)}·${fmtL(b)}/${fmtN(L)} = ${fmt(ld.v * a * b / L)} kNm`; }
      if (ld.sub === 'M') return `|V| = M₀/L = ${fmtN(Math.abs(ld.v))}/${fmtN(L)} = ${fmt(Math.abs(ld.v) / L)} kN, konstant über die ganze Länge`;
      if (ld.sub === 'mq' && ld.x < 1e-9 && ld.x2 > L - 1e-9) return `Linienmoment über die ganze Länge: |V| = m = ${fmtN(Math.abs(ld.v))} kN konstant, M = 0 überall (dM/dx = V − m = 0)`;
    } else if (sys.kind === 'krag') {
      const xe = sys.sup[0].x;
      if (ld.sub === 'F') { const d = Math.abs(ld.x - xe); return `M_Einsp = −F·d = −${fmtN(ld.v)}·${fmtL(d)} = ${fmt(-ld.v * d)} kNm`; }
      if (ld.sub === 'qvoll') return `M_Einsp = −qL²/2 = −${fmtN(ld.v)}·${fmtN(L)}²/2 = ${fmt(-ld.v * L * L / 2)} kNm`;
      if (ld.sub === 'mq' && ld.x < 1e-9 && ld.x2 > L - 1e-9) return `|M_Einsp| = m·L = ${fmtN(Math.abs(ld.v))}·${fmtN(L)} = ${fmt(Math.abs(ld.v) * L)} kNm, V = 0 überall, M linear`;
    }
    return '';
  }

  function cutTerms(sys, sol, x) {
    const { P, Mp, D } = sol, Md = sol.Md || [];
    const incl = isIncl(sys);
    const nL = P.filter((p) => p[0] < x).length + Mp.filter((m) => m[0] < x).length + D.filter((d) => d[0] < x).length;
    const nR = P.filter((p) => p[0] > x).length + Mp.filter((m) => m[0] > x).length + D.filter((d) => d[1] > x).length;
    let penL = 0, penR = 0;
    for (const sp of sys.sup) if (sp.type === 'einsp') { if (sp.x < x) penL = 5; else penR = 5; }
    const useLeft = nL + penL <= nR + penR;
    const terms = [], vals = [];
    const prod = (a, lev) => `${fmt(Math.abs(a))}·${fmt(lev, 2)}`;
    const add = (t, v) => { if (Math.abs(v) > 1e-9) { terms.push(t); vals.push(v); } };
    if (useLeft) {
      for (const p of P) if (p[0] < x) { const a = -p[1], lev = x - p[0]; add(prod(a, lev), a * lev); }
      for (const m of Mp) if (m[0] < x) add(fmt(Math.abs(m[1])), m[1]);
      for (const m of Md) if (x > m[0]) { const len = Math.min(x, m[1]) - m[0]; add(prod(m[2], len), m[2] * len); }
      for (const d of D) if (x > d[0]) {
        const u = Math.min(x, d[1]), qu = d[2] + (d[3] - d[2]) * (u - d[0]) / (d[1] - d[0]);
        const [R, xc] = distRes(d[0], u, d[2], qu); const lev = x - xc; add(prod(-R, lev), -R * lev);
      }
    } else {
      for (const p of P) if (p[0] > x) { const a = -p[1], lev = p[0] - x; add(prod(a, lev), a * lev); }
      for (const m of Mp) if (m[0] > x) add(fmt(Math.abs(m[1])), -m[1]);
      for (const m of Md) if (x < m[1]) { const len = m[1] - Math.max(x, m[0]); add(prod(m[2], len), -m[2] * len); }
      for (const d of D) if (x < d[1]) {
        const s0 = Math.max(x, d[0]), qa = d[2] + (d[3] - d[2]) * (s0 - d[0]) / (d[1] - d[0]);
        const [R, xc] = distRes(s0, d[1], qa, d[3]); const lev = xc - x; add(prod(-R, lev), -R * lev);
      }
    }
    const side = useLeft ? 'linkes' : 'rechtes';
    const head = incl ? `Schnitt bei s = ${fmt(x, 2)} m (entlang der Stabachse), ${side} Teilsystem:` : `Schnitt bei x = ${fmt(x, 2)} m, ${side} Teilsystem:`;
    let eq = 'M = ';
    terms.forEach((t, i) => {
      if (vals[i] < 0) eq += i === 0 ? '−' + t : ' − ' + t;
      else eq += i === 0 ? t : ' + ' + t;
    });
    eq += ` = ${fmt(sum(vals))} kNm`;
    const out = [head, eq];
    if (incl) out.push('Kraftkomponenten quer zur Stabachse mal Abstand entlang der Achse.');
    else if (D.length) out.push('Streckenlasten als Resultierende mal Hebelarm zum Schwerpunkt.');
    return out;
  }

  function tagExpl(tag, qty, info = '') {
    switch (tag) {
      case 'vorzeichen':
        if (qty === 'M') return 'Vorzeichenfehler: Das ist der richtige Verlauf, nur an der Stabachse gespiegelt. M wird auf der Zugseite angetragen – positives M (Zug unten) zeigt nach unten.';
        if (qty === 'V') return 'Vorzeichenfehler: richtige Form, falsches Vorzeichen. Positive Querkraft zeigt am positiven Schnittufer (rechtes Ende des linken Teils) nach unten.';
        return 'Zug und Druck vertauscht: N > 0 heißt Zug. Prüf, ob die Last vom Festlager wegzieht oder zu ihm hin drückt.';
      case 'verwechselt':
        return qty === 'M' ? 'Das ist der Querkraftverlauf, nicht der Momentenverlauf. Merke: dM/dx = V – die Querkraft ist die Steigung der M-Linie.'
          : 'Das ist der Momentenverlauf. Die Querkraft ist seine Ableitung: V = dM/dx.';
      case 'linear': if (qty === 'V') return 'Die Werte an den Knickstellen passen, aber unter einer Dreieckslast verläuft V nicht geradlinig, sondern quadratisch (dV/dx = −q).';
        return 'Die Werte an den Knickstellen passen, aber unter einer Streckenlast verläuft M nicht geradlinig, sondern als Parabel (d²M/dx² = −q).';
      case 'lastGespiegelt': return 'Dieser Verlauf gehört zur gespiegelten Laststellung. Schau genau, wo die Lasten sitzen und wohin sie zeigen.';
      case 'lagerGespiegelt': return qty === 'N' ? 'So sähe es mit gespiegelter Lagerung aus – das Festlager säße am anderen Ende, und die Längskraft flösse dorthin.'
        : 'So sähe es bei gespiegelter Lagerung aus, zum Beispiel mit der Einspannung bzw. dem Kragarm auf der anderen Seite.';
      case 'resultierende': return 'Hier wurde die Streckenlast durch ihre Resultierende ersetzt. Für die Auflagerkräfte ist das erlaubt, für den Verlauf nicht: ' +
        (qty === 'V' ? 'V springt dann, statt unter der Last stetig abzunehmen.' : qty === 'N' ? 'N springt dann, statt sich stetig zu ändern.' : 'M bekommt einen Knick, statt unter der Last gekrümmt zu verlaufen.');
      case 'verschmiert': return 'Das wäre der Verlauf unter einer Streckenlast. ' +
        (qty === 'V' ? 'Eine Einzellast lässt V springen, dazwischen ist V konstant.' : qty === 'N' ? 'Eine Kraft längs der Achse lässt N springen, dazwischen ist N konstant.' : 'Eine Einzellast erzeugt einen Knick in M, dazwischen ist M eine Gerade.');
      case 'momentDreh': return 'Drehsinn des Moments vertauscht: Beim Einzelmoment springt M in die falsche Richtung, beim Linienmoment kippt die Steigung von M andersherum.';
      case 'linienmomentKonz': return 'Hier wurde das Linienmoment durch ein Einzelmoment ersetzt. Das ergibt einen Sprung in M. Ein Linienmoment m ändert dagegen nur die Steigung: dM/dx = V − m, M bleibt stetig.';
      case 'lastFehlt': return `Hier fehlt der Anteil einer Last (${info}). Jede Last trägt zum Verlauf bei – Superposition.`;
      case 'lastVerschoben': return 'Die Last sitzt hier an der falschen Stelle. ' +
        (qty === 'V' ? 'Sprünge in V liegen genau unter Einzellasten.' : qty === 'N' ? 'Sprünge in N liegen genau dort, wo eine Kraft längs der Achse angreift.' : 'Knicke in M liegen genau unter Einzellasten.');
      case 'festLos': return 'Hier hat das falsche Lager die Kraft längs des Stabs übernommen. Nur das Festlager nimmt Kräfte in beide Richtungen auf – das entscheidet, wo N wirkt.';
      case 'gelenkVerschoben': return qty === 'V' ? 'Das Gelenk liegt hier woanders. Dadurch verteilen sich die Lasten anders auf die Lager, und die Querkraft ändert sich.'
        : 'Das Gelenk liegt hier woanders. Am Gelenk muss M = 0 sein – prüf, wo der Verlauf durch null geht.';
      case 'ohneNeigung':
        return qty === 'N' ? 'Das wäre der waagerechte Träger. Beim schrägen Stab erzeugen auch senkrechte Lasten eine Normalkraft – ihre Komponente längs der Stabachse.'
          : 'So sähe es ohne Neigung aus. Beim schrägen Stab wirkt quer zur Achse nur die Komponente F·cos α, und die Abstände entlang der Achse sind länger.';
      case 'losGedreht': return 'Gleitebene des Loslagers falsch angesetzt. Die Lagerkraft steht immer senkrecht zur Gleitebene: waagerecht verschieblich heißt Lagerkraft senkrecht, parallel zum Stab verschieblich heißt Lagerkraft ⊥ Stab. Das ändert N.';
      case 'komponenten': return 'Sinus und Kosinus vertauscht: Quer zur Stabachse wirkt F·cos α, längs der Achse F·sin α (α ist die Neigung gegen die Waagerechte).';
      case 'anderesSystem': return 'Dieser Verlauf gehört zu einer ganz anderen Belastung oder Lagerung.';
      case 'klickMmax': return '|M| ist dort am größten, wo die Querkraft null wird bzw. ihr Vorzeichen wechselt – oder an einer Einspannung bzw. einem Innenlager.';
      case 'klickVmax': return '|V| ist meist direkt an einem Auflager am größten – dort wird die Auflagerkraft eingeleitet. Neben großen Einzellasten oder an einer Einspannung lohnt sich ein zweiter Blick.';
      case 'klickV0': return 'V wechselt dort das Vorzeichen, wo M ein Extremum hat: unter Einzellasten, über Innenlagern oder unter Streckenlasten bei V = 0.';
      case 'klickM0': return 'Momentennullpunkte liegen beim Träger mit Kragarm zwischen Feld- und Stützmoment, beim Gerberträger unter anderem genau am Gelenk.';
      case 'zeit': return 'Die Zeit ist abgelaufen.';
      default: return 'Das passt nicht zum System.';
    }
  }
  function sysTagExpl(tag, info, qq = 'M') {
    if (qq === 'V') {
      switch (tag) {
        case 'resultierende': return 'Dieses System hat eine Einzellast statt der Streckenlast – dann wäre V abschnittsweise konstant mit einem Sprung. Der gegebene Verlauf ist aber schräg.';
        case 'verschmiert': return 'Dieses System hat eine Streckenlast – dann fiele V dort linear ab. Der gegebene Verlauf hat einen Sprung, also eine Einzellast.';
        case 'momentDreh': return 'Bei diesem System dreht das Moment andersherum – das ändert die Auflagerkräfte und damit das Niveau von V.';
        case 'linienmomentKonz': return 'Hier steht ein Einzelmoment statt des Linienmoments. Für V macht das keinen Unterschied, wohl aber für M.';
        case 'gelenkVerschoben': return 'Bei diesem System liegt das Gelenk woanders – Auflagerkräfte und damit die Sprünge in V wären anders.';
        case 'lagerGespiegelt': return 'Bei diesem System liegt die Lagerung gespiegelt – die Sprünge durch die Auflagerkräfte lägen woanders.';
        case 'lastVerschoben': return 'Bei diesem System greift die Last woanders an – der Sprung bzw. Knick im V-Verlauf läge an einer anderen Stelle.';
        case 'losGedreht': return 'Bei diesem System ist das Loslager anders orientiert – die Querkomponente der Lagerkraft und damit V wären anders.';
        case 'anderesSystem': return 'Dieses System erzeugt einen anderen Querkraftverlauf.';
      }
    } else if (qq === 'N') {
      switch (tag) {
        case 'resultierende': return 'Dieses System hat eine Einzellast statt der Streckenlast – dann wäre N abschnittsweise konstant. Der gegebene Verlauf ändert sich aber linear.';
        case 'verschmiert': return 'Dieses System hat eine Streckenlast – dann änderte sich N linear. Der gegebene Verlauf springt aber.';
        case 'lagerGespiegelt': return 'Bei diesem System sitzt das Festlager auf der anderen Seite – dann trüge der andere Trägerteil die Normalkraft.';
        case 'lastVerschoben': return 'Bei diesem System greift die Last woanders an – der Sprung in N läge an einer anderen Stelle.';
        case 'losGedreht': return 'Bei diesem System ist das Loslager anders orientiert – damit verteilt sich die Kraft längs des Stabs anders auf die Lager.';
        case 'anderesSystem': return 'Dieses System erzeugt einen anderen Normalkraftverlauf.';
        case 'momentDreh': case 'gelenkVerschoben': return 'Dieses System erzeugt einen anderen Normalkraftverlauf.';
      }
    }
    switch (tag) {
      case 'resultierende': return 'Dieses System hat eine Einzellast statt der Streckenlast – dann wäre M abschnittsweise geradlinig. Der gegebene Verlauf ist aber gekrümmt.';
      case 'verschmiert': return 'Dieses System hat eine Streckenlast – dann wäre M überall gekrümmt. Der gegebene Verlauf hat einen Knick, also eine Einzellast.';
      case 'lagerGespiegelt': return 'Bei diesem System liegt die Lagerung gespiegelt – Einspannung bzw. Innenlager und damit das Stützmoment wären auf der anderen Seite.';
      case 'lastGespiegelt': return 'Bei diesem System sitzen die Lasten gespiegelt – Knicke bzw. das Maximum lägen auf der anderen Seite.';
      case 'momentDreh': return 'Bei diesem System dreht das Moment andersherum – der M-Verlauf kippt in die andere Richtung.';
      case 'linienmomentKonz': return 'Dieses System hat ein Einzelmoment statt des Linienmoments – dann hätte M einen Sprung. Der gegebene Verlauf ist stetig und ändert nur seine Steigung.';
      case 'lastFehlt': return `Diesem System fehlt eine Last (${info}) – ihr Anteil ist im gegebenen Verlauf aber sichtbar.`;
      case 'lastVerschoben': return 'Bei diesem System greift die Last woanders an – der Knick bzw. Sprung im Verlauf läge an einer anderen Stelle.';
      case 'gelenkVerschoben': return 'Bei diesem System liegt das Gelenk woanders – dort müsste der Momentenverlauf durch null gehen.';
      case 'ohneNeigung': return 'Das waagerechte System hätte andere Querkomponenten – der Verlauf passt nicht.';
      case 'losGedreht': return 'Bei diesem System ist das Loslager anders orientiert – die Querkomponente der Lagerkraft und damit M wären anders.';
      default: return 'Dieses System erzeugt einen anderen Momentenverlauf.';
    }
  }
  function valTagExpl(tag, info, ctx) {
    switch (tag) {
      case 'lastGespiegelt': return 'Das wäre der Wert bei gespiegelter Laststellung.';
      case 'lagerGespiegelt': return 'Das wäre der Wert bei gespiegelter Lagerung.';
      case 'resultierende': return 'So groß wäre |M|max, wenn die Streckenlast als Einzellast im Schwerpunkt wirken würde – für Momente im Feld ist das falsch.';
      case 'verschmiert': return 'Das wäre der Wert, wenn die Einzellast als Gleichstreckenlast verteilt wäre.';
      case 'momentDreh': return 'Das wäre der Wert mit umgekehrtem Drehsinn des Moments.';
      case 'lastFehlt': return `Hier fehlt der Anteil von ${info} – Superposition.`;
      case 'lastVerschoben': return 'Das wäre der Wert für eine andere Laststellung.';
      case 'gelenkVerschoben': return 'Das wäre der Wert mit anders liegendem Gelenk.';
      case 'festLos': return 'Fest- und Loslager vertauscht.';
      case 'faktor2': return ctx === 'M' ? 'Doppelt so groß wie richtig – typisch, wenn zum Beispiel qL²/4 statt qL²/8 gerechnet oder der Hebelarm verdoppelt wird.'
        : 'Doppelt so groß wie richtig – Hebelarm verdoppelt oder die Last nicht auf beide Lager aufgeteilt?';
      case 'halb': return 'Nur halb so groß wie richtig – Hebelarm oder Lastanteil halbiert?';
      case 'faktor15': return 'Um den Faktor 1,5 daneben – Schwerpunkt der Streckenlast oder Hebelarm falsch angesetzt?';
      case 'faktor34': return 'Zu klein – vermutlich Lastanteil oder Hebelarm falsch angesetzt.';
      case 'andereLager': return 'Das ist die Kraft im anderen Lager – Hebelarme vertauscht? Das Momentengleichgewicht um ein Lager liefert direkt die Kraft im anderen.';
      case 'summe': return 'Das ist die Summe aller Vertikallasten – die teilt sich aber auf die Lager auf.';
      case 'vorzeichenWert': return 'Betrag stimmt, Richtung nicht: Prüf das Vorzeichen im Momentengleichgewicht (positiv = nach oben).';
      case 'kragFormel': return 'Das ist die Formel für den Kragarm. Beim Einfeldträger teilt sich die Last auf zwei Lager auf – das Moment ist kleiner.';
      case 'eftFormel': return 'Das ist die Formel für den Einfeldträger. Beim Kragarm gibt es nur die Einspannung – dort wird das Moment deutlich größer.';
      case 'einspann': return 'Das ist ein Einspannmoment des beidseitig eingespannten Trägers – hier sind die Enden aber gelenkig gelagert.';
      case 'einheit': return ctx === 'M' ? 'Einheit prüfen: Das ist eine Kraft (kN), gesucht ist aber ein Moment (kNm).' : 'Einheit prüfen: Das ist ein Moment (kNm), gesucht ist aber eine Kraft (kN).';
      case 'mittig': return 'Diese Formel gilt nur, wenn die Last genau in der Mitte steht.';
      case 'hebel': return 'Falscher Hebelarm: Maßgebend ist der Abstand der Last zum betrachteten Punkt, nicht eine andere Länge.';
      case 'hebelVertauscht': return ctx === 'M' ? 'Hebelarm vertauscht: Für das Moment zählt der Abstand der Last zum Schnitt bzw. zur Einspannung, nicht die Restlänge.'
        : 'Hebelarme vertauscht: Die Kraft in einem Lager hängt vom Abstand der Last zum anderen Lager ab (Momentengleichgewicht um das andere Lager).';
      case 'dreieck': return 'qL²/6 gehört zur Dreieckslast – hier ist die Last gleichmäßig verteilt.';
      case 'dreieckSchwerpunkt': return 'Schwerpunkt der Dreieckslast verwechselt: Die Resultierende q₀L/2 liegt 1/3 der Länge von der hohen Seite entfernt.';
      case 'rechteck': return 'So wäre es bei einer Gleichstreckenlast – die Dreieckslast hat nur die halbe Resultierende.';
      case 'stablaenge': return 'Mit der Stablänge s gerechnet. Bei Last je m Grundriss und senkrechten Lagerkräften zählt die Grundrissspannweite l.';
      case 'cosDoppelt': return 'cos α ist hier zu viel: Die Grundrisslast q·l wirkt komplett senkrecht, Moment und Lagerkräfte sind wie beim waagerechten Träger mit l.';
      case 'null': return 'Null ist falsch – das Lager muss eine Kraft aufnehmen, sonst wäre der Träger nicht im Gleichgewicht.';
      case 'lage': return 'Die Lage des Einzelmoments spielt für die Auflagerkräfte keine Rolle – nur M₀ und die Stützweite L.';
      case 'faktorX': return 'Falscher Vorfaktor – leite die Formel über das Gleichgewicht am Teilsystem her.';
      case 'mWieQ': return 'Wie bei einer Streckenlast gerechnet. Ein Linienmoment hat keinen Hebelarm: Es trägt mit m·Länge direkt zum Moment bei.';
      case 'mMalL': return 'm·L ist das Gesamtmoment. Die Lager nehmen es als Kräftepaar mit dem Hebelarm L auf, jede Kraft ist also m·L/L = m.';
      case 'symmetrie': return 'q₀L/4 hieße: Last gleichmäßig auf beide Lager verteilt. Bei der Dreieckslast liegt der Schwerpunkt aber bei 2/3 – die hohe Seite bekommt mehr.';
      default: return ctx === 'M' ? tagExpl(tag, 'M', info) : 'Dieser Wert passt nicht.';
    }
  }
  const TAG_LABELS = {
    vorzeichen: 'Vorzeichen', verwechselt: 'M und V verwechselt', linear: 'Gerade statt Kurve',
    lastGespiegelt: 'Laststellung gespiegelt', lagerGespiegelt: 'Lagerung verwechselt', resultierende: 'Streckenlast als Einzellast',
    verschmiert: 'Einzellast als Streckenlast', momentDreh: 'Drehsinn des Moments', linienmomentKonz: 'Linienmoment als Einzelmoment', lastFehlt: 'Last vergessen',
    lastVerschoben: 'Laststellung', festLos: 'Fest- und Loslager', gelenkVerschoben: 'Gelenk (M = 0)', ohneNeigung: 'Neigung ignoriert',
    losGedreht: 'Gleitebene des Loslagers', komponenten: 'sin und cos vertauscht', anderesSystem: 'Völlig anderes System',
    faktor2: 'Faktor 2', halb: 'Faktor 1/2', faktor15: 'Faktor 1,5', faktor34: 'Lastanteil oder Hebelarm', andereLager: 'Lager vertauscht',
    summe: 'Summe statt Lageranteil', vorzeichenWert: 'Richtung der Auflagerkraft', kragFormel: 'Kragarm-Formel beim Einfeldträger',
    eftFormel: 'Einfeldträger-Formel beim Kragarm', einspann: 'Einspann-Formel', einheit: 'Kraft und Moment verwechselt',
    mittig: 'Formel für Last in der Mitte', mWieQ: 'Linienmoment wie Streckenlast', mMalL: 'Gesamtmoment statt Lagerkraft', hebel: 'Hebelarm', hebelVertauscht: 'Hebelarme vertauscht', dreieck: 'Dreieck und Rechteck verwechselt',
    dreieckSchwerpunkt: 'Schwerpunkt der Dreieckslast', rechteck: 'Dreieck als Rechteck', stablaenge: 'Stablänge statt Grundriss',
    cosDoppelt: 'cos α zu viel', null: 'Lagerkraft vergessen', lage: 'Lage des Moments', faktorX: 'Vorfaktor', symmetrie: 'Lastverteilung beim Dreieck',
    klickMmax: 'Ort von |M|max', klickVmax: 'Ort von |V|max', klickV0: 'Vorzeichenwechsel von V', klickM0: 'Momentennullpunkt', zeit: 'Zeit abgelaufen'
  };
  const tagLabel = (t) => TAG_LABELS[t] || t;

  const praise = () => pick(['Sauber.', 'Stark.', 'Genau so.', 'Volltreffer.', 'Wie im Lehrbuch.', 'Das sitzt.', 'Prüfingenieur-Niveau.', 'Statisch bestimmt richtig.']);
  const randomTip = () => pick([
    'Unter einer Gleichstreckenlast ist M eine Parabel und V eine Gerade.',
    'Wo V das Vorzeichen wechselt, hat M sein Extremum.',
    'Ein Einzelmoment macht einen Sprung in M – V springt dort nicht.',
    'Am freien Kragarmende sind M und V null, solange dort keine Last angreift.',
    'Am Gelenk ist M immer null.',
    'Nur das Festlager nimmt Horizontalkräfte auf.',
    'M wird auf der Zugseite angetragen: Zug unten heißt positiv und nach unten gezeichnet.',
    'Einzellast: Sprung in V, Knick in M.',
    'Dreieckslast: V quadratisch, M kubisch.',
    'Über dem Innenlager eines Trägers mit Kragarm ist das Moment bei Lasten von oben negativ.',
    'Einfeldträger mit Gleichstreckenlast: max M = qL²/8.',
    'Kragarm mit Einzellast am Ende: M an der Einspannung = −F·L.',
    'Schräger Stab: Lasten in Komponenten längs und quer zur Stabachse zerlegen.',
    'Schräger Einfeldträger mit Grundrisslast und senkrechten Lagerkräften: max M = q·l²/8 mit l = Grundriss.',
    'Loslager: Die Lagerkraft steht senkrecht zur Gleitebene.',
    'Linienmoment: V ändert sich darunter nicht, M ändert nur seine Steigung (dM/dx = V − m).',
    'Einfeldträger mit konstantem Linienmoment: M = 0 im ganzen Träger.',
    'Kragarm mit Linienmoment: V = 0, M linear bis m·L an der Einspannung.'
  ]);
  function rankName(s) {
    const th = [0, 1000, 2500, 5000, 8000, 12000, 18000];
    const nm = ['Erstsemester', 'Übungsgruppen-Stammgast', 'Tutor', 'Wissenschaftliche Hilfskraft', 'Tragwerksplaner', 'Prüfingenieur', 'Statik-Legende'];
    let r = nm[0];
    th.forEach((t, i) => { if (s >= t) r = nm[i]; });
    return r;
  }
  // Regeln nach Statik 1 (TUM, Folien „Statische Gleichungen“) und Schneider Bautabellen
  const RULES = [
    { title: 'Vorzeichen', lines: ['x zeigt nach rechts, z nach unten, die gestrichelte Faser liegt auf der +z-Seite.', 'N > 0 ist Zug, N < 0 Druck.', 'V > 0 zeigt am positiven Schnittufer in +z-Richtung, also nach unten.', 'M > 0 heißt Zug an der gestrichelten Faser (unten).', 'Alle Schnittgrößen werden positiv zur gestrichelten Faser hin angetragen.'] },
    { title: 'Differentialbeziehungen', lines: ['dN/dx = −n, dV/dx = −q, dM/dx = V − m', 'n, q: Streckenlasten längs und quer; m: Linienmoment (gegen den Uhrzeigersinn positiv)', 'q = 0: V konstant, M linear', 'q konstant: V linear, M quadratische Parabel', 'q linear (Dreieck): V quadratische, M kubische Parabel', 'n konstant: N linear', 'm konstant: V unverändert, M ändert seine Steigung um −m', 'M ist extremal, wo dM/dx = V − m = 0 ist.'] },
    { title: 'Sprünge und Knicke', lines: ['Einzellast quer: Sprung in V um die Last, Knick in M', 'Einzellast längs: Sprung in N', 'Einzelmoment M₀: Sprung in M um M₀, kein Sprung in V', 'Linienmoment: kein Sprung, nur andere Steigung in M', 'Auflager = Einzelkraft: Sprung in V', 'Gelenk: M = 0; Knick in M nur, wenn am Gelenk eine Einzellast angreift'] },
    { title: 'Randbedingungen', lines: ['Freies Ende ohne Last: N = V = M = 0', 'Gelenkiges Endlager: M = 0', 'Einspannung: M ≠ 0, meist der Extremwert', 'Gelenk im Träger: M = 0', 'Festlager nimmt H auf, Loslager nicht'] },
    { title: 'Schräge Stäbe', lines: ['Lasten zerlegen: quer zur Achse wirken sie auf V und M, längs der Achse auf N.', 'Punktlast F senkrecht: quer F·cos α, längs F·sin α', 'Last je m Grundriss q: quer q·cos²α, längs q·sinα·cosα (je m Stab)', 'Eigengewicht g je m Stab: quer g·cos α, längs g·sin α', 'Senkrechte Lagerkräfte: max M = q·l²/8 mit l = Grundriss', 'Eigenlast, Festlager unten: N am unteren Ende = −A_v·sin α, am oberen Ende = +B_v·sin α', 'Loslager: Lagerkraft ⊥ Gleitebene – sie entscheidet, wo N wirkt.'] },
    { title: 'Standardfälle', lines: ['Einfeldträger, q: A = B = qL/2, max M = qL²/8', 'Einfeldträger, F mittig: max M = FL/4', 'Einfeldträger, F bei a: A = F·b/L, max M = F·a·b/L', 'Einfeldträger, Einzelmoment: |A| = |B| = M₀/L', 'Einfeldträger, Dreieck 0 bis q₀: A = q₀L/6, B = q₀L/3, max M = q₀L²/(9√3) bei x = 0,577·L', 'Einfeldträger, Linienmoment m: |A| = |B| = m, M = 0', 'Kragarm, F am Ende: M = −F·L', 'Kragarm, q: M = −qL²/2', 'Kragarm, Dreieck hoch an der Einspannung: M = −q₀L²/6', 'Kragarm, Dreieck hoch am freien Ende: M = −q₀L²/3', 'Kragarm, Linienmoment m: |M| = m·L, V = 0', 'Kragarm-Überstand a mit q: Stützmoment −qa²/2'] },
    { title: 'Gelenke', lines: ['Momentengelenk (Kreis): M = 0, überträgt N und V', 'Querkraftgelenk (zwei Querstriche): V = 0, überträgt N und M – ohne Last daneben hat M dort eine waagerechte Tangente', 'Normalkraftgelenk (Hülse): N = 0, überträgt V und M', 'Jedes Gelenk liefert eine zusätzliche Gleichung: die freigegebene Schnittgröße ist dort null'] },
    { title: 'Rahmen und Stabwerke', lines: ['Pendelstab: beidseitig gelenkig, keine Last dazwischen – nur N, konstant, Kraft in Stabrichtung', 'Nullstab 1: unbelasteter Knoten mit zwei Stäben, die nicht auf einer Linie liegen – beide N = 0', 'Nullstab 2: unbelasteter Knoten mit drei Stäben, zwei auf einer Linie – der dritte N = 0', 'Biegesteife Ecke mit zwei Stäben: M läuft ohne Sprung um die Ecke, V des einen Stabs wird N des anderen', 'Gelenk: M = 0, dort schneiden für die fehlende Gleichung', 'Verläufe werden je Stab zur gestrichelten Faser angetragen'] },
    { title: 'Vorgehen', lines: ['Auflagerkräfte aus ΣH = 0, ΣV = 0, ΣM = 0 (und M = 0 am Gelenk)', 'Bereiche zwischen Lasten und Lagern festlegen', 'Im Bereich schneiden, Gleichgewicht am Teilsystem', 'Werte an den Bereichsgrenzen und Extremwerte eintragen', 'Kontrolle: Sprünge, Knicke, Randbedingungen'] }
  ];

  function cheatCases() {
    const cs = [];
    const L = 6;
    let s = baseSys(L, 'eft'); s.loads = [mkLoad('q', 'qvoll', 0, L, 10, 10, 0, 10, 0)];
    cs.push({ sys: s, title: 'Einfeldträger mit Gleichstreckenlast', formula: 'A = B = qL/2, max M = qL²/8', q2: 'V' });
    s = baseSys(L, 'eft'); s.loads = [mkLoad('F', 'F', 3, 0, 20, 0, 0, 20, 90)];
    cs.push({ sys: s, title: 'Einfeldträger mit Einzellast in der Mitte', formula: 'A = B = F/2, max M = FL/4', q2: 'V' });
    s = baseSys(L, 'eft'); s.loads = [mkLoad('M', 'M', 3, 0, 30, 0, 0, 30, 0)];
    cs.push({ sys: s, title: 'Einfeldträger mit Einzelmoment', formula: '|A| = |B| = M₀/L', q2: 'V' });
    s = setIncline(baseSys(1, 'eft'), 4, 3); s.sup = mkSup([0, s.L], ['fest', 'los']); s.name = 'Schräger Einfeldträger';
    s.loads = [mkLoad('q', 'qvoll', 0, s.L, 10, 10, 0, 10, 0, 'proj')];
    cs.push({ sys: s, title: 'Schräger Träger mit Grundrisslast', formula: 'max M = ql²/8 mit l = Grundriss', q2: 'N' });
    s = baseSys(L, 'kragL'); s.loads = [mkLoad('F', 'F', L, 0, 20, 0, 0, 20, 90)];
    cs.push({ sys: s, title: 'Kragarm mit Einzellast am Ende', formula: 'V = F, M an der Einspannung = −FL', q2: 'V' });
    s = baseSys(L, 'kragL'); s.loads = [mkLoad('q', 'qvoll', 0, L, 10, 10, 0, 10, 0)];
    cs.push({ sys: s, title: 'Kragarm mit Gleichstreckenlast', formula: 'V = qL, M an der Einspannung = −qL²/2', q2: 'V' });
    s = baseSys(L, 'kragL'); s.loads = [mkLoad('q', 'tri', 0, L, 10, 0, 0, 10, 0)];
    cs.push({ sys: s, title: 'Kragarm mit Dreieckslast', formula: 'M an der Einspannung = −q₀L²/6', q2: 'V' });
    s = baseSys(L, 'ueber'); s.loads = [mkLoad('q', 'qvoll', 0, L, 10, 10, 0, 10, 0)];
    cs.push({ sys: s, title: 'Träger mit Kragarm und Gleichstreckenlast', formula: 'Stützmoment M_B = −qa²/2', q2: 'V' });
    s = baseSys(L, 'eft'); s.loads = [mkLoad('m', 'mq', 0, L, -10, -10, 0, 10, 0)];
    cs.push({ sys: s, title: 'Einfeldträger mit Linienmoment', formula: '|A| = |B| = m, M = 0 im ganzen Träger', q2: 'V' });
    s = baseSys(L, 'kragL'); s.loads = [mkLoad('m', 'mq', 0, L, -10, -10, 0, 10, 0)];
    cs.push({ sys: s, title: 'Kragarm mit Linienmoment', formula: 'V = 0, M linear, |M| = m·L an der Einspannung', q2: 'V' });
    return cs;
  }

  const NVM = {
    randi, pick, shuffle, linspace, interp1, maxAbs, sum, clone,
    fmt, fmtL, fmtN,
    mkLoad, mkSup, baseSys, setIncline, isIncl, genSystem,
    loadArrays, solveSys, sgAt, sgArr, eqVec, curves, critPts, distRes, pickQ,
    systemMods, classicCase, classicItem, buildQuestion, pickType, typePool, learnPool, nextPick, LEVEL_INFO, levelInfo, MAX_LEVEL, isClickType, isValType,
    clusterRanges, supNames, momentAtSupport, looksSame, featureRules, classicLine,
    tagExpl, tagLabel, praise, randomTip, rankName, RULES, cheatCases
  };
  root.NVM = Object.assign(root.NVM || {}, NVM);
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NVM;
})(typeof window !== 'undefined' ? window : globalThis);
