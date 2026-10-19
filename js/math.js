/*
 * NVM – Formelsatz
 * Erkennt Formeln in den Texten (z. B. "max M = qL²/8 = 20,0 kNm") und setzt sie mit KaTeX:
 * echte Brüche, kursive Variablen, aufrechte Einheiten, Indizes.
 * Für SVG-Beschriftungen gibt es eine leichte Variante mit KaTeX-Schriften (ohne Brüche).
 */
(function (root) {
  'use strict';
  const NVM = root.NVM = root.NVM || {};

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ Erkennen
  const UNITS = new Set(['kN', 'kNm', 'kN/m', 'kNm/m', 'm', 'cm', 'mm', 'kN/m²', 'kNm²']);
  const FUNCS = { max: '\\max', min: '\\min', sin: '\\sin', cos: '\\cos', tan: '\\tan' };
  const GREEK = { 'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'Δ': '\\Delta', 'Σ': '\\Sigma', '∑': '\\Sigma', 'φ': '\\varphi', 'π': '\\pi' };
  const SUBDIG = '₀₁₂₃₄₅₆₇₈₉';
  const OPS = new Set(['=', '≠', '+', '−', '-', '≈', '·', '<', '>', '≤', '≥', '/', '→']);

  const reNum = /^[−+-]?\d+(?:[.,]\d+)?(?:°|%)?$/;
  const reVar = /^(?:[A-Za-z]|[A-Za-z][₀-₉]|[αβγδφ])$/;
  const reFormulaChar = /[·²³/√₀-₉_Σ∑⊥|]|[αβγδΔφ]/;
  const reProseSlash = /^[A-Za-zÄÖÜäöüß]{3,}\/[A-Za-zÄÖÜäöüß]{3,}$/;

  function classify(w) {
    if (!w) return 'x';
    if (reNum.test(w) || /^\([−+-]?\d+(?:,\d+)?\)$/.test(w)) return 'num';
    if (UNITS.has(w)) return 'unit';
    if (/^[a-z]+[A-Z][A-Za-z]?$/.test(w) && w.length <= 3) return 'var';     // qL …
    if (/^[−-][A-Za-z]{1,3}$/.test(w) || /^[A-Z]{2}$/.test(w)) return 'var';  // −FL, FL, EI
    if (/^[−-]?[A-Za-z]\(x\)$/.test(w)) return 'formula';                       // N(x), −q(x) …
    if (OPS.has(w)) return 'op';
    if (FUNCS[w]) return 'func';
    if (reVar.test(w)) return 'var';
    if (reProseSlash.test(w)) return 'x';
    if (reFormulaChar.test(w) && /[A-Za-z0-9αβγδΔΣφ√]/.test(w) && !/[äöüßÄÖÜ]/.test(w)) {
      // Wörter mit langen Buchstabenfolgen sind Text (Ausnahme: Funktionen und Indizes)
      const letters = w.replace(/_\{[^}]*\}|_(?:[A-Za-z⊥]+|\d+)/g, '').replace(/max|min|sin|cos|tan/g, '');
      if (/[A-Za-z]{4,}/.test(letters)) return 'x';
      return 'formula';
    }
    return 'x';
  }

  const balance = (s, o, c) => s.split(o).length - s.split(c).length;

  // Zerlegt einen Text in Stücke {math:boolean, s:string}
  // Abkürzungen wie „z. B.“ zusammenhalten, damit das B nicht als Variable gilt
  const ABBR = /\b(z|d|u|s|v|o)\. ?(B|h|a|o|g|ä)\./g;
  const JOIN = '\u2060';

  function segments(text) {
    const parts = String(text).replace(ABBR, `$1.${JOIN}$2.`).split(/(\s+)/);
    const ents = [];
    for (let i = 0; i < parts.length; i++) {
      const raw = parts[i];
      if (i % 2 === 1) { ents.push({ ws: raw }); continue; }
      if (!raw) continue;
      let core = raw, pre = '', post = '';
      while (core.length > 1 && /^[(„"'“]/.test(core) && balance(core, '(', ')') > 0) { pre += core[0]; core = core.slice(1); }
      while (core.length && /[,;:.!?)“"']$/.test(core)) {
        const ch = core[core.length - 1];
        if (ch === ')' && balance(core, '(', ')') >= 0) break;
        post = ch + post; core = core.slice(0, -1);
      }
      ents.push({ pre, core, post, k: classify(core) });
    }
    // „m“ ist eine Einheit nach einer Zahl oder in „je m“, sonst die Größe m (Linienmoment)
    let prevWord = null;
    for (const e of ents) {
      if (e.ws !== undefined) continue;
      if (e.core === 'm' && !(prevWord && (prevWord.k === 'num' || /^(je|pro)$/i.test(prevWord.core)))) e.k = 'var';
      prevWord = e;
    }
    // Läufe bilden
    const out = [];
    let i = 0;
    const pushText = (s) => {
      if (!s) return;
      s = s.split(JOIN).join('\u00a0');
      if (out.length && !out[out.length - 1].math) out[out.length - 1].s += s; else out.push({ math: false, s }); };
    while (i < ents.length) {
      const e = ents[i];
      if (e.ws !== undefined) { pushText(e.ws); i++; continue; }
      const eqStart = e.k === 'op' && /^[=≈]$/.test(e.core) && !e.post && i + 2 < ents.length && ['formula', 'var', 'num'].includes(ents[i + 2].k) && !ents[i + 2].pre;
      if (e.k === 'x' || e.k === 'unit' || (e.k === 'op' && !eqStart)) { pushText(e.pre + e.core + e.post); i++; continue; }
      // Lauf beginnt
      const run = [e];
      let j = i + 1;
      if (!e.post) {
        while (j + 1 < ents.length && ents[j].ws !== undefined) {
          const n = ents[j + 1];
          if (n.core === 'um' && /^Σ/.test(run[run.length - 1].core)) n.k = 'op';     // „ΣM um A = 0“
          if (n.pre || n.k === 'x') break;
          if (n.k === 'unit' && run[run.length - 1].k !== 'num') break;
          run.push(n);
          j += 2;
          if (n.post) break;
        }
      }
      // Operatoren am Ende abschneiden
      while (run.length > 1 && run[run.length - 1].k === 'op' && !run[run.length - 1].post) { run.pop(); j -= 2; }
      const hasF = run.some((r) => r.k === 'formula');
      const hasEq = run.some((r) => r.k === 'op' && /^[=≠≈<>≤≥]$/.test(r.core));
      const numUnit = run.length === 2 && run[0].k === 'num' && run[1].k === 'unit';
      const funcVar = run.length >= 2 && run[0].k === 'func';
      const single = run.length === 1 && run[0].k === 'var';            // einzelne Größe im Text: F, M, q₀ …
      if (hasF || (hasEq && run.length >= (eqStart ? 2 : 3)) || numUnit || funcVar || single) {
        const first = run[0], last = run[run.length - 1];
        pushText(first.pre);
        out.push({ math: true, s: run.map((r) => r.core).join(' ') });
        pushText(last.post);
        // Leerzeichen zwischen den Lauf-Elementen sind verbraucht
        i = i + (run.length - 1) * 2 + 1;
      } else {
        pushText(e.pre + e.core + e.post);
        i++;
      }
    }
    return out;
  }

  // ------------------------------------------------------------ Umsetzen nach LaTeX
  function lex(s) {
    const L = [];
    let i = 0;
    const subOf = (t) => {
      if (/^\d+$/.test(t)) return t;
      if (t === '⊥') return '\\perp';
      return '\\mathrm{' + t + '}';
    };
    const lastAtom = () => L[L.length - 1];
    while (i < s.length) {
      const c = s[i], rest = s.slice(i);
      let m;
      if (c === ' ') { i++; continue; }
      if ((m = rest.match(/^um(?![A-Za-z])/))) { L.push({ t: 'op', c: 'um', v: '\\ \\text{um}\\ ' }); i += 2; continue; }
      if ((m = rest.match(/^\|([A-Za-z])\|(max|min)/))) { L.push({ t: 'atom', v: `|${m[1]}|_{\\${m[2]}}` }); i += m[0].length; continue; }
      if ((m = rest.match(/^(kNm\/m|kN\/m²|kN\/m|kNm²|kNm|kN|cm|mm|m)(?![A-Za-z])/)) && L.length && lastAtom().t === 'num') {
        L.push({ t: 'unit', v: '\\,\\mathrm{' + m[1].replace('²', '^2') + '}' }); i += m[0].length; continue;
      }
      if ((m = rest.match(/^d(²?)([VMNqx])(²?)(?![A-Za-z])/))) {          // Ableitungen: dV, dx, d²M, dx²
        L.push({ t: 'atom', v: `\\mathrm{d}${m[1] ? '^2' : ''}${m[2]}${m[3] ? '^2' : ''}` }); i += m[0].length; continue;
      }
      if ((m = rest.match(/^(max|min|sin|cos|tan)/))) { L.push({ t: 'func', v: FUNCS[m[1]] + ' ' }); i += m[0].length; continue; }
      if ((m = rest.match(/^\d+(?:,\d+)?/))) { L.push({ t: 'num', v: m[0].replace(',', '{,}') }); i += m[0].length; continue; }
      if ((m = rest.match(/^_\{([^}]*)\}/)) || (m = rest.match(/^_([A-Za-z⊥]+|\d+)/))) {
        const a = lastAtom(); if (a) a.sub = subOf(m[1]); i += m[0].length; continue;
      }
      if (SUBDIG.includes(c)) {
        let d = ''; while (i < s.length && SUBDIG.includes(s[i])) { d += SUBDIG.indexOf(s[i]); i++; }
        const a = lastAtom(); if (a) a.sub = d; continue;
      }
      if (c === '²' || c === '³') { const a = lastAtom(); if (a) a.sup = c === '²' ? '2' : '3'; i++; continue; }
      if (c === '°') { const a = lastAtom(); if (a) a.sup = '\\circ'; i++; continue; }
      if (c === '%') { L.push({ t: 'atom', v: '\\%' }); i++; continue; }
      if (GREEK[c]) { L.push({ t: 'atom', v: GREEK[c] + ' ' }); i++; continue; }
      if (/[A-Za-z]/.test(c)) { L.push({ t: 'atom', v: c }); i++; continue; }
      if (c === '√') { L.push({ t: 'sqrt' }); i++; continue; }
      if (c === '(' || c === ')') { L.push({ t: c }); i++; continue; }
      if (c === '/') { L.push({ t: '/' }); i++; continue; }
      const opMap = { '·': '\\cdot ', '−': '-', '-': '-', '+': '+', '=': '=', '≈': '\\approx ', '≠': '\\neq ', '<': '<', '>': '>', '≤': '\\le ', '≥': '\\ge ', ':': '{:}\\;', '→': '\\to ', ',': ',\\;', '|': '|', '⊥': '\\perp ' };
      if (opMap[c] !== undefined) { L.push({ t: 'op', c, v: opMap[c] }); i++; continue; }
      L.push({ t: 'atom', v: '\\text{' + c + '}' }); i++;
    }
    return L;
  }

  // Klammern zu Gruppen, Wurzeln an ihr Argument
  function tree(L) {
    const stack = [[]];
    for (const x of L) {
      if (x.t === '(') stack.push([]);
      else if (x.t === ')') {
        if (stack.length > 1) { const g = stack.pop(); stack[stack.length - 1].push({ t: 'group', items: g }); }
      } else stack[stack.length - 1].push(x);
    }
    while (stack.length > 1) { const g = stack.pop(); stack[stack.length - 1].push({ t: 'group', items: g, open: true }); }
    return stack[0];
  }

  const BOUND = new Set(['um', '+', '-', '−', '=', '≠', '≈', '<', '>', '≤', '≥', ':', ',', '→']);
  function render(items) {
    // Wurzeln binden
    const a = [];
    for (let k = 0; k < items.length; k++) {
      const x = items[k];
      if (x.t === 'sqrt' && k + 1 < items.length) { a.push({ t: 'sqrtOf', arg: items[k + 1] }); k++; }
      else a.push(x);
    }
    // Brüche bilden
    const out = [];
    for (let k = 0; k < a.length; k++) {
      const x = a[k];
      if (x.t === '/' && out.length && k + 1 < a.length) {
        const num = [];
        while (out.length) {
          const p = out[out.length - 1];
          if (p.t === 'op' && BOUND.has(p.c)) break;
          if (p.t === 'frac') break;
          if (p.t === 'op' && p.c === '·' && out.length >= 2 && out[out.length - 2].t === 'frac') break;
          num.unshift(out.pop());
        }
        if (!num.length) { out.push({ t: 'op', c: '/', v: '/' }); continue; }
        const den = a[k + 1]; k++;
        out.push({ t: 'frac', num, den });
      } else out.push(x);
    }
    return out.map(item).join('');
  }
  function stripGroup(list) {
    return list.length === 1 && list[0].t === 'group' ? list[0].items : list;
  }
  function item(x) {
    let s;
    switch (x.t) {
      case 'frac': s = `\\dfrac{${render(stripGroup(x.num))}}{${render(stripGroup([x.den]))}}`; break;
      case 'group': s = `\\left(${render(x.items)}\\right${x.open ? '.' : ')'}`; break;
      case 'sqrtOf': s = `\\sqrt{${render(stripGroup([x.arg]))}}`; break;
      case '/': s = '/'; break;
      default: s = x.v;
    }
    if (x.sub) s = `{${s}}_{${x.sub}}`;
    if (x.sup) s = `{${s}}^{${x.sup}}`;
    return s;
  }

  function toLatex(formula) {
    return render(tree(lex(formula)));
  }

  // ------------------------------------------------------------ HTML
  const cache = new Map();
  function katexOf(formula) {
    if (cache.has(formula)) return cache.get(formula);
    let h;
    const K = root.katex;
    try {
      h = K ? K.renderToString(toLatex(formula), { throwOnError: true, output: 'html', strict: 'ignore' }) : null;
    } catch (e) { h = null; }
    if (h == null) h = esc(formula);
    if (cache.size > 4000) cache.clear();
    cache.set(formula, h);
    return h;
  }
  // Text mit Formeln als HTML
  function html(text, fallback) {
    if (!root.katex) return fallback(text);
    const seg = segments(text);
    let h = '';
    for (let k = 0; k < seg.length; k++) {
      const p = seg[k];
      if (!p.math) { h += fallback(p.s); continue; }
      // Satzzeichen direkt hinter der Formel nicht allein in die nächste Zeile rutschen lassen
      let tail = '';
      const nx = seg[k + 1];
      if (nx && !nx.math) {
        const m = nx.s.match(/^[,.;:!?)]+/);
        if (m) { tail = m[0]; nx.s = nx.s.slice(m[0].length); }
      }
      h += tail ? `<span class="mnw">${katexOf(p.s)}${esc(tail)}</span>` : katexOf(p.s);
    }
    return h;
  }

  // ------------------------------------------------------------ SVG (ohne Brüche)
  function svgMath(formula) {
    let o = '';
    let lift = 0;     // aktuelle Grundlinien-Verschiebung
    const back = () => { if (lift) { o += `<tspan dy="${-lift}em"></tspan>`; lift = 0; } };
    const L = lex(formula);
    const word = (cls, s) => { o += `<tspan class="${cls}">${esc(s)}</tspan>`; };
    let prev = null;
    for (const x of L) {
      const unary = (x.t === 'op' && (x.c === '−' || x.c === '-' || x.c === '+')) && (!prev || prev.t === 'op');
      prev = x;
      if (unary) { back(); word('m-r', x.c === '+' ? '+' : '−'); continue; }
      back();
      if (x.t === 'atom') {
        const m = x.v.match(/^\\([a-zA-Z]+) $/);
        const g = m ? { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', Sigma: 'Σ', varphi: 'φ', pi: 'π' }[m[1]] : null;
        if (g) word(/[ΔΣ]/.test(g) ? 'm-r' : 'm-i', g);
        else if (/^[A-Za-z]$/.test(x.v)) word('m-i', x.v);
        else word('m-r', x.v.replace(/\\[a-z]+\{(.*)\}/, '$1').replace(/[{}\\]/g, '').replace(/_max/, 'max'));
      } else if (x.t === 'num') word('m-r', x.v.replace('{,}', ','));
      else if (x.t === 'unit') word('m-r', ' ' + x.v.replace(/\\,\\mathrm\{(.*)\}/, '$1').replace('^2', '²'));
      else if (x.t === 'func') word('m-r', x.v.trim().slice(1) + ' ');
      else if (x.t === 'op') word('m-r', { '·': '·', '=': ' = ', '≈': ' ≈ ', '+': ' + ', '−': ' − ', '-': ' − ', ':': ': ', ',': ', ' }[x.c] || x.c);
      else if (x.t === '/') word('m-r', '/');
      else if (x.t === '(' || x.t === ')') word('m-r', x.t);
      else if (x.t === 'sqrt') word('m-r', '√');
      if (x.sub) {
        const t = x.sub.replace(/\\mathrm\{(.*)\}/, '$1').replace('\\perp', '⊥');
        o += `<tspan class="m-r" dy="0.3em" font-size="0.7em">${esc(t)}</tspan>`; lift = 0.3 * 0.7 / 0.7;
        // dy in em bezieht sich auf die verkleinerte Schrift, daher zurück mit der normalen Größe
        lift = 0.21;
      }
      if (x.sup) {
        back();
        const t = x.sup === '\\circ' ? '°' : x.sup === '2' ? '²' : x.sup === '3' ? '³' : x.sup;
        o += `<tspan class="m-r">${t}</tspan>`;
      }
    }
    back();
    return o;
  }
  function svg(text, fallback, opts) {
    opts = opts || {};
    const t = String(text);
    // einzelne Symbole (q, F, l, M_0, α …) immer als Formel
    if (opts.symbols && /^(?:[A-Za-z]|[A-Za-z]_\{?[A-Za-z0-9]{1,5}\}?|[A-Za-z][₀-₉]|[αβγδφ])$/.test(t)) return svgMath(t);
    return segments(t).map((p) => (p.math ? svgMath(p.s) : fallback(p.s))).join('');
  }

  NVM.math = { segments, toLatex, html, svg, classify };
})(typeof window !== 'undefined' ? window : globalThis);
