/* NVM – Oberfläche und Spielablauf */
(function () {
  'use strict';
  const N = window.NVM, D = N.draw;
  const $ = (id) => document.getElementById(id);
  const esc = D.esc, tex = D.htmlTex;

  // ---------------------------------------------------------- Speicher
  function load(key, def) {
    try { const v = localStorage.getItem(key); return Object.assign({}, def, v ? JSON.parse(v) : {}); }
    catch (e) { return Object.assign({}, def); }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* privat / gesperrt */ } }
  const settings = load('nvm.settings', {
    time: 'auto', calc: 'formel', incl: 'mix', theme: document.documentElement.dataset.theme || 'light',
    sound: false, learnQty: 'mix', learnTask: 'mix', learnKind: 'alle', learnLevel: '2'
  });
  // Werte aus älteren Versionen übernehmen
  settings.theme = { paper: 'light', board: 'dark' }[settings.theme] || settings.theme;
  if (settings.theme !== 'light' && settings.theme !== 'dark') settings.theme = 'light';
  if (settings.learnQty === 'wert') { settings.learnQty = 'mix'; settings.learnTask = 'werte'; }
  if (settings.learnTask === 'tippen') settings.learnTask = 'max';
  const stats = load('nvm.stats', { best: 0, total: 0, correct: 0 });
  delete stats.bestExam;

  // Lernmodus: Tragwerk für den Generator („Schräg“ heißt: alle Arten, nur schief)
  const learnKind = () => (settings.learnKind === 'schraeg' ? 'alle' : settings.learnKind);
  const taskExists = (task, qty = settings.learnQty, kind = learnKind()) => task === 'mix' || N.typePool(1, qty, task, kind).length > 0;

  // ---------------------------------------------------------- Zustand
  const S = {
    mode: 'arcade', state: 'menu', q: null, level: 1, score: 0, lives: 3, streak: 0, bestStreak: 0,
    nCorrect: 0, nAsked: 0, mistakes: {}, tMax: 30, tLeft: 30, timed: false,
    solShown: false, chosen: -1, clickS: NaN, lastPts: 0, pendingEnd: false, levelUp: '',
    map: null, boss: false, cheatFrom: 'menu', fresh: true
  };
  const narrowMQ = window.matchMedia('(max-width: 640px)');
  const isNarrow = () => narrowMQ.matches;

  // ---------------------------------------------------------- Bildschirme
  const screens = ['app', 'menu', 'end', 'cheat'];
  function showScreen(name) {
    for (const s of screens) $(s).hidden = s !== name;
    window.scrollTo(0, 0);
  }
  const visible = (id) => !$(id).hidden;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------------------------------------------------------- Ton
  let audio = null;
  function beep(ok) {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const notes = ok ? [660, 990] : [300, 200];
      notes.forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.type = 'triangle';
        const t0 = audio.currentTime + i * 0.09;
        g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
        o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + 0.18);
      });
    } catch (e) { /* kein Audio */ }
  }

  // ---------------------------------------------------------- Einstellungen
  function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    $('themeColor').content = settings.theme === 'dark' ? '#131417' : '#f5f7fa';
  }
  function syncSegs() {
    document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => {
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(String(settings[key]) === b.dataset.v));
      });
    });
    // Aufgaben, die es für Größe und Tragwerk nicht gibt, ausgrauen (z. B. N + Maximum antippen)
    document.querySelectorAll('.seg[data-setting="learnTask"] button').forEach((b) => {
      const can = taskExists(b.dataset.v);
      b.disabled = !can;
      b.title = can ? '' : 'Diese Kombination gibt es nicht';
    });
    $('soundBtn').setAttribute('aria-pressed', String(!!settings.sound));
  }
  document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      settings[seg.dataset.setting] = b.dataset.v;
      // Größe/Tragwerk gewechselt und die Aufgabe passt nicht mehr: Aufgabe auf „Gemischt“
      if (!taskExists(settings.learnTask)) settings.learnTask = 'mix';
      save('nvm.settings', settings);
      if (seg.dataset.setting === 'theme') applyTheme();
      syncSegs();
    });
  });

  function cfg() {
    let incl;
    if (settings.incl === 'aus') incl = 0;
    else if (settings.incl === 'nur') incl = 1;
    else incl = S.level >= 2 ? 0.3 : 0.12;
    if (S.mode === 'learn' && settings.learnKind === 'schraeg') incl = 1;
    return { calc: settings.calc, incl, task: S.mode === 'learn' ? settings.learnTask : 'mix' };
  }
  function timeFor() {
    if (settings.time === 'inf') return Infinity;
    if (settings.time !== 'auto') return Number(settings.time);
    if (S.mode === 'arcade') return Math.max(15, 34 - 3 * S.level);
    return Infinity;
  }

  // ---------------------------------------------------------- Menü
  function renderStats() {
    const acc = stats.total ? Math.round(100 * stats.correct / stats.total) : 0;
    const parts = [];
    parts.push(stats.best ? `Highscore ${stats.best.toLocaleString('de-DE')} (${N.rankName(stats.best)})` : 'Noch kein Highscore');
    if (stats.total) parts.push(`${stats.total} Aufgaben gelöst, ${acc} % richtig`);
    $('stats').textContent = parts.join(', ') + '.';
  }
  function goMenu() {
    S.state = 'menu';
    renderStats();
    syncSegs();
    showScreen('menu');
  }
  document.querySelectorAll('.mode[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.dataset.mode;
      if (m === 'cheat') openCheat();
      else startMode(m);
    });
  });

  // ---------------------------------------------------------- Ablauf
  function startMode(m) {
    Object.assign(S, {
      mode: m, score: 0, lives: 3, streak: 0, bestStreak: 0, nCorrect: 0, nAsked: 0,
      mistakes: {}, pendingEnd: false, levelUp: ''
    });
    S.level = m === 'learn' ? Number(settings.learnLevel) : 1;
    if (m === 'learn' && !taskExists(settings.learnTask)) { settings.learnTask = 'mix'; save('nvm.settings', settings); }
    showScreen('app');
    nextQuestion();
  }

  function nextQuestion(force) {
    const learn = S.mode === 'learn';
    const qty = learn ? settings.learnQty : 'mix', kind = learn ? learnKind() : 'alle';
    S.tMax = timeFor(); S.timed = isFinite(S.tMax); S.tLeft = S.tMax;
    S.q = N.buildQuestion(S.level, qty, kind, force || '', cfg());
    S.state = 'question'; S.solShown = false; S.chosen = -1; S.clickS = NaN; S.fresh = true;
    $('timer').hidden = !S.timed;
    $('timerFill').style.transform = 'scaleX(1)';
    $('timer').dataset.level = 'ok';
    renderQuestion();
    renderIntro();
    updateHud();
    updateButtons();
    window.scrollTo(0, 0);
  }

  const isClick = () => N.isClickType(S.q.type);
  const ca = () => S.q.sys.ca;
  const Lp = () => S.q.sys.L * S.q.sys.ca;

  function renderQuestion() {
    const q = S.q, fb = S.state === 'feedback';
    $('question').innerHTML = tex(q.text);
    if (!fb) $('hint').textContent = isClick() ? 'Fahre über das System und tippe auf die gesuchte Stelle.' : 'Antwort antippen oder Taste 1 bis 4.';
    if (q.type.startsWith('sysFrom')) {
      const W = isNarrow() ? 520 : 800, H = isNarrow() ? 260 : 290;
      $('systemBox').innerHTML = D.diagram(q.cv.xs.map((x) => x * ca()), q.cv[q.qty], q.qty, Lp(), { W, H });
      S.map = null;
    } else renderSystem(false);
    $('solution').hidden = true;
    if (isClick()) {
      $('answers').hidden = true;
      $('tapinfo').hidden = false;
      $('tapinfo').innerHTML = '<strong>Tippe ins System</strong>Markiere die gesuchte Stelle direkt im Bild oben.';
    } else {
      $('tapinfo').hidden = true;
      $('answers').hidden = false;
      renderAnswers(fb);
    }
  }

  function renderSystem(withSol) {
    const q = S.q;
    const r = D.system(q.sys, { mode: 'full', symbolic: q.symbolic && !withSol, sol: withSol ? q.sol : null, narrow: isNarrow() });
    const box = $('systemBox');
    box.innerHTML = r.svg;
    S.map = r.map;
    box.classList.toggle('tappable', isClick() && S.state === 'question');
    if (isClick() && S.state === 'question') attachTap();
    if (withSol && isClick()) drawClickMarks();
  }

  function renderAnswers(fb) {
    const q = S.q, box = $('answers');
    box.innerHTML = '';
    q.opts.forEach((o, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'answer';
      b.setAttribute('aria-label', `Antwort ${k + 1}`);
      let inner = `<span class="num" aria-hidden="true">${k + 1}</span>`;
      if (q.type.startsWith('diag')) inner += D.diagram(o.xs.map((x) => x * ca()), o.f, q.qty, Lp(), { compact: true });
      else if (q.type.startsWith('sysFrom')) inner += D.system(o.sys, { mode: 'compact', symbolic: true }).svg;
      else inner += `<span class="val">${tex(o.label)}</span>`;
      if (fb) {
        b.disabled = true;
        if (k === q.correct) { b.classList.add('is-correct'); inner += '<span class="tag">Richtig</span>'; }
        else if (k === S.chosen) { b.classList.add('is-wrong'); inner += '<span class="tag">Deine Wahl</span>'; }
        else b.classList.add('is-dim');
        if (!S.fresh) b.classList.add('no-anim');
      }
      b.innerHTML = inner;
      b.addEventListener('click', () => answer(k));
      box.appendChild(b);
    });
  }

  function answer(k) {
    if (S.state !== 'question' || S.boss || !S.q || isClick() || !visible('app')) return;
    S.chosen = k;
    const ok = k === S.q.correct;
    finish(ok, ok ? '' : S.q.opts[k].tag);
  }

  // ---------------------------------------------------------- Tippen ins System
  const NS = 'http://www.w3.org/2000/svg';
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function attachTap() {
    const svg = $('systemBox').querySelector('svg');
    const m = S.map;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('class', 'sv-cross'); ln.setAttribute('y1', 0); ln.setAttribute('y2', m.H); ln.style.display = 'none';
    const tx = document.createElementNS(NS, 'text');
    tx.setAttribute('class', 'sv-cross-text'); tx.setAttribute('font-size', isNarrow() ? 17 : 14); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('y', 46);
    svg.appendChild(ln); svg.appendChild(tx);
    const toS = (p) => (p.x - m.ox) / m.k;
    svg.addEventListener('pointermove', (e) => {
      if (S.state !== 'question') return;
      const p = svgPoint(svg, e), s = toS(p);
      if (s < -0.02 * m.L || s > 1.02 * m.L) { ln.style.display = 'none'; tx.textContent = ''; return; }
      ln.style.display = '';
      ln.setAttribute('x1', p.x); ln.setAttribute('x2', p.x);
      tx.setAttribute('x', p.x);
      tx.innerHTML = N.math.svg(`x = ${N.fmt(Math.min(Math.max(s, 0), m.L) * ca(), 2)} m`, esc);
    });
    svg.addEventListener('click', (e) => {
      if (S.state !== 'question' || S.boss) return;
      handleTap(toS(svgPoint(svg, e)));
    });
  }
  function handleTap(s) {
    const q = S.q;
    s = Math.min(Math.max(s, 0), q.sys.L);
    S.clickS = s;
    const ok = Math.min(...q.target.map((t) => Math.abs(t - s))) <= q.tol;
    finish(ok, ok ? '' : q.clickTag);
  }
  function drawClickMarks() {
    const q = S.q, m = S.map;
    const svg = $('systemBox').querySelector('svg');
    let add = '';
    for (const r of N.clusterRanges(q.target, q.sys.L)) {
      const a = m.ox + (r[0] - q.tol) * m.k, b = m.ox + (r[1] + q.tol) * m.k, c = m.ox + (r[0] + r[1]) / 2 * m.k;
      add += `<rect x="${a}" y="0" width="${b - a}" height="${m.H}" class="sv-target"/>`;
      add += `<line x1="${c}" y1="0" x2="${c}" y2="${m.H}" class="sv-target-line"/>`;
    }
    if (!isNaN(S.clickS)) {
      const ok = Math.min(...q.target.map((t) => Math.abs(t - S.clickS))) <= q.tol;
      const x = m.ox + S.clickS * m.k;
      add += `<line x1="${x}" y1="0" x2="${x}" y2="${m.H}" class="${ok ? 'sv-click-ok' : 'sv-click-bad'}"/>`;
      add += `<text x="${x + 6}" y="44" font-size="14" class="sv-cross-text">dein Tipp</text>`;
    }
    svg.insertAdjacentHTML('afterbegin', add);
  }

  // ---------------------------------------------------------- Auswertung
  function finish(ok, tag) {
    S.state = 'feedback';
    S.nAsked++; S.lastPts = 0; S.levelUp = '';
    stats.total++;
    if (ok) {
      S.nCorrect++; S.streak++; S.bestStreak = Math.max(S.bestStreak, S.streak);
      stats.correct++;
      if (S.mode === 'arcade') {
        const tb = isFinite(S.tMax) ? Math.round(100 * Math.max(S.tLeft, 0) / S.tMax) : 0;
        const mult = 1 + 0.25 * Math.min(S.streak - 1, 4);
        S.lastPts = Math.round((100 * S.level + tb) * mult);
        S.score += S.lastPts;
        const nl = Math.min(6, 1 + Math.floor(S.nCorrect / 5));
        if (nl > S.level) { S.level = nl; S.levelUp = `Level ${nl}. Die Tragwerke werden kniffliger.`; }
      }
    } else {
      S.streak = 0;
      if (S.mode === 'arcade') S.lives--;
      if (tag) S.mistakes[tag] = (S.mistakes[tag] || 0) + 1;
      if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* egal */ } }
    }
    beep(ok);
    S.pendingEnd = S.mode === 'arcade' && S.lives <= 0;
    save('nvm.stats', stats);
    $('hint').textContent = ok ? (S.lastPts ? `Richtig, +${S.lastPts} Punkte.` : 'Richtig.') : (tag === 'zeit' ? 'Zeit abgelaufen.' : 'Leider falsch – die Erklärung steht unten.');
    if (isClick() || (!ok && S.mode === 'learn')) showSolution(); else renderQuestion();
    S.fresh = false;
    renderFeedback(ok, tag);
    updateHud();
    updateButtons();
    if (S.levelUp) toast(S.levelUp);
  }

  function showSolution() {
    const q = S.q;
    S.solShown = true;
    $('answers').hidden = true;
    $('tapinfo').hidden = true;
    renderSystem(true);
    const W = isNarrow() ? 420 : 800, H = isNarrow() ? 170 : 150;
    const xs = q.cv.xs.map((x) => x * ca()), crit = q.cv.crit.map((c) => c * ca());
    const o = { values: true, crit, W, H, animate: true };
    let html = '';
    for (const qty of ['N', 'V', 'M']) html += `<div class="strip">${D.diagram(xs, N.pickQ(qty, q.cv), qty, Lp(), o)}</div>`;
    if (N.isIncl(q.sys)) html += `<p class="solution-note">${tex('Verläufe über dem Grundriss x aufgetragen.')}</p>`;
    const sol = $('solution');
    sol.innerHTML = html;
    sol.hidden = false;
    updateButtons();
  }
  function toggleSolution() {
    if (S.state !== 'feedback' || !S.q || isClick()) return;
    if (S.solShown) { S.solShown = false; renderQuestion(); updateButtons(); }
    else showSolution();
  }

  function sectionsHTML(sections) {
    return sections.map((s) => `<section><h3>${esc(s.title)}</h3><ul>${s.lines.map((l) => `<li>${tex(l)}</li>`).join('')}</ul></section>`).join('');
  }

  function renderIntro() {
    const q = S.q;
    let mode;
    const tStr = S.timed ? `${Math.round(S.tMax)} Sekunden` : 'kein Zeitlimit';
    if (S.mode === 'arcade') mode = `Arcade, ${tStr}. Punkte gibt es für Level und Tempo, eine Serie richtiger Antworten verdoppelt sie.`;
    else {
      const qn = { mix: '', N: 'Normalkraft', V: 'Querkraft', M: 'Moment' }[settings.learnQty] || '';
      const tn = { mix: '', verlauf: 'Verlauf zum System', system: 'System zum Verlauf', max: 'Maximum antippen', null: 'Nullstelle antippen', werte: 'Werte' }[settings.learnTask] || '';
      const focus = [qn, tn].filter(Boolean).join(', ');
      mode = `Lernen${focus ? ` (${focus})` : ''}, ${tStr}. Nach jeder Antwort bekommst du die Erklärung.`;
    }
    let extra = '';
    if (q.symbolic) extra = '<p class="muted">Die Maße sind als Buchstaben angegeben – gesucht ist die passende Formel.</p>';
    $('explain').innerHTML = `<p class="tip"><strong>Tipp:</strong> ${tex(N.randomTip())}</p><p class="muted">${esc(mode)}</p>${extra}`;
    $('explain').scrollTop = 0;
  }

  function renderFeedback(ok, tag) {
    const q = S.q;
    let h = '';
    if (S.pendingEnd) h += '<p class="muted">Mit „Auswertung“ geht es zum Ergebnis.</p>';
    if (ok) {
      h += `<p class="verdict ok">Richtig. ${esc(N.praise())}</p>`;
      if (S.lastPts) h += `<p class="points">+${S.lastPts} Punkte, Serie ${S.streak}</p>`;
    } else {
      h += `<p class="verdict no">${tag === 'zeit' ? 'Zeit abgelaufen.' : 'Leider falsch.'}</p>`;
      let why = '';
      if (S.chosen >= 0 && !isClick()) why = q.opts[S.chosen].expl;
      else if (isClick() && tag !== 'zeit') why = N.tagExpl(tag, '');
      if (why) h += `<p class="why">${tex(why)}</p>`;
      if (S.mode === 'arcade') h += `<p class="points">${S.lives > 0 ? `Noch ${S.lives} Leben.` : 'Keine Leben mehr.'}</p>`;
    }
    let sol = '';
    if (isClick() && !isNaN(S.clickS)) sol += `<p>${tex(`Dein Tipp: x = ${N.fmt(S.clickS * ca(), 2)} m (Toleranz ± ${N.fmt(q.tol * ca(), 2)} m).`)}</p>`;
    sol += q.solLines.map((l) => `<p>${tex(l)}</p>`).join('');
    h += `<div class="sol">${sol}</div>`;
    h += sectionsHTML(q.explain);
    $('explain').innerHTML = h;
    $('explain').scrollTop = 0;
  }

  function updateHud() {
    const hud = $('hud');
    let h = '';
    if (S.mode === 'arcade') {
      // als SVG, damit iOS kein rotes Emoji daraus macht
      const heart = (lost) => `<svg class="heart${lost ? ' lost' : ''}" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21.2 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5z"/></svg>`;
      const hearts = [0, 1, 2].map((k) => heart(k >= Math.max(S.lives, 0))).join('');
      h = `<span class="hud-mode">Arcade</span><span><span class="k">Level</span>${S.level}</span>` +
        `<span><span class="k">Punkte</span>${S.score.toLocaleString('de-DE')}</span>` +
        `<span><span class="k">Serie</span>${S.streak}</span><span class="lives" aria-label="${S.lives} Leben">${hearts}</span>`;
      if (S.lastPts && S.state === 'feedback') h += `<span class="pop">+${S.lastPts}</span>`;
    } else {
      h = `<span class="hud-mode">Lernen</span><span>${S.nCorrect} von ${S.nAsked} richtig</span><span><span class="k">Serie</span>${S.streak}</span><span><span class="k">Stufe</span>${S.level}</span>`;
    }
    hud.innerHTML = h;
  }

  function updateButtons() {
    const fb = S.state === 'feedback';
    const nb = $('nextBtn'), sb = $('solBtn');
    nb.disabled = !fb;
    nb.textContent = fb && S.pendingEnd ? 'Auswertung' : 'Weiter';
    sb.disabled = !(fb && S.q && !isClick());
    sb.textContent = S.solShown ? 'Aufgabe zeigen' : 'Lösung zeigen';
  }

  function nextStep() {
    if (S.state === 'feedback') { if (S.pendingEnd) showEnd(); else nextQuestion(); }
    else if (S.state === 'end') startMode(S.mode);
  }

  // ---------------------------------------------------------- Ende
  function showEnd() {
    S.state = 'end';
    const ml = Object.keys(S.mistakes).sort((a, b) => S.mistakes[b] - S.mistakes[a]).slice(0, 5);
    const isNew = S.score > stats.best;
    if (isNew) stats.best = S.score;
    $('endKicker').textContent = 'Game over';
    $('endTitle').innerHTML = `<span class="mark">${S.score.toLocaleString('de-DE')}</span> Punkte`;
    let body = `<p>Level ${S.level}, beste Serie ${S.bestStreak}, ${S.nCorrect} von ${S.nAsked} richtig.</p>` +
      `<p>Rang: <strong>${esc(N.rankName(S.score))}</strong></p>`;
    if (isNew) body += '<p><strong>Neuer Highscore.</strong></p>';
    if (ml.length) body += `<p class="end-sub"><strong>Daran hat es gehakt:</strong></p><ul>${ml.map((t) => `<li>${esc(N.tagLabel(t))}: ${S.mistakes[t]}×</li>`).join('')}</ul>`;
    else body += '<p class="end-sub">Keine Fehler. Stark.</p>';
    $('endBody').innerHTML = body;
    save('nvm.stats', stats);
    showScreen('end');
  }
  $('againBtn').addEventListener('click', () => startMode(S.mode));
  $('homeBtn').addEventListener('click', goMenu);

  // ---------------------------------------------------------- Spickzettel
  let cheatBuilt = false;
  function buildCheat() {
    const grid = $('cheatGrid');
    let h = '';
    for (const c of N.cheatCases()) {
      const so = N.solveSys(c.sys), cv = N.curves(c.sys, so), k = c.sys.ca, Lc = c.sys.L * k;
      const xs = cv.xs.map((x) => x * k);
      h += `<article class="sheet cheat-card"><h2>${esc(c.title)}</h2>` +
        D.system(c.sys, { mode: 'compact', symbolic: true }).svg +
        D.diagram(xs, N.pickQ(c.q2, cv), c.q2, Lc, { compact: true, H: 150 }) +
        D.diagram(xs, cv.M, 'M', Lc, { compact: true, H: 150 }) +
        `<p class="formula">${tex(c.formula)}</p></article>`;
    }
    grid.innerHTML = h;
    $('cheatRules').innerHTML = N.RULES.map((r) => `<section><h3>${esc(r.title)}</h3><ul>${r.lines.map((l) => `<li>${tex(l)}</li>`).join('')}</ul></section>`).join('');
    cheatBuilt = true;
  }
  function openCheat() {
    if (!cheatBuilt) buildCheat();
    S.cheatFrom = visible('app') ? 'app' : 'menu';
    showScreen('cheat');
  }
  function closeCheat() {
    if (!visible('cheat')) return;
    if (S.cheatFrom === 'app') showScreen('app'); else goMenu();
  }
  $('cheatClose').addEventListener('click', closeCheat);
  $('cheatBtn').addEventListener('click', openCheat);

  // ---------------------------------------------------------- Boss-Taste
  const realTitle = document.title;
  function toggleBoss() {
    S.boss = !S.boss;
    $('boss').hidden = !S.boss;
    document.title = S.boss ? 'Statik II – Übungsblatt 6 (Lösung).pdf' : realTitle;
  }
  $('boss').addEventListener('click', toggleBoss);

  // ---------------------------------------------------------- Bedienung
  $('nextBtn').addEventListener('click', nextStep);
  $('solBtn').addEventListener('click', toggleSolution);
  $('menuBtn').addEventListener('click', goMenu);
  $('brandBtn').addEventListener('click', goMenu);
  $('soundBtn').addEventListener('click', () => { settings.sound = !settings.sound; save('nvm.settings', settings); syncSegs(); toast(settings.sound ? 'Ton an' : 'Ton aus'); });
  function toggleTheme() { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; save('nvm.settings', settings); applyTheme(); syncSegs(); }
  $('themeBtn').addEventListener('click', toggleTheme);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (S.boss) { if (k === 'b' || k === 'escape') { toggleBoss(); e.preventDefault(); } return; }
    if (k === 'b') { toggleBoss(); return; }
    if (k === 't') { toggleTheme(); return; }
    if (k === 'escape') { if (visible('cheat')) closeCheat(); else if (!visible('menu')) goMenu(); return; }
    if (k === 'h') { if (visible('cheat')) closeCheat(); else openCheat(); return; }
    if (k === 's' && !visible('menu')) { $('soundBtn').click(); return; }
    if (!visible('app') && !visible('end')) return;
    if (k === ' ' || k === 'enter') {
      // Enter auf einer fokussierten Antwort wählt sie aus; sonst geht es weiter
      if (k === 'enter' && document.activeElement && document.activeElement.closest('.answers') && S.state === 'question') return;
      e.preventDefault();
      nextStep();
      return;
    }
    if (k === 'l') { toggleSolution(); return; }
    if (['1', '2', '3', '4'].includes(k)) answer(Number(k) - 1);
  });

  function frame(t) {
    const dt = Math.min((t - (frame.last || t)) / 1000, 0.2);
    frame.last = t;
    if (S.state === 'question' && S.timed && !S.boss && visible('app') && !document.hidden) {
      S.tLeft -= dt;
      const fr = Math.max(S.tLeft, 0) / S.tMax;
      $('timerFill').style.transform = `scaleX(${fr})`;
      $('timer').dataset.level = fr > 0.5 ? 'ok' : fr > 0.2 ? 'warn' : 'late';
      if (S.tLeft <= 0) { S.chosen = -1; finish(false, 'zeit'); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  narrowMQ.addEventListener('change', () => {
    if (!visible('app') || !S.q) return;
    if (S.solShown) showSolution(); else renderQuestion();
  });

  // Testzugang (Browser-Konsole / automatische Tests)
  window.NVMapp = { S, startMode, nextQuestion, answer, handleTap, toggleSolution, nextStep, openCheat, closeCheat, toggleBoss, goMenu, settings };

  applyTheme();
  syncSegs();
  goMenu();

  // ---------------------------------------------------------- Offline-Modus
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* ohne Offline weiter */ }); });
  }
})();
