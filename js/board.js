/* NVM – Online-Bestenliste
 * Speichert Arcade-Ergebnisse in einer Supabase-Tabelle „scores“ (REST, ohne Zusatzbibliothek).
 * Zugangsdaten stehen in js/config.js. Der „anon“-Schlüssel ist für den Browser gedacht und darf öffentlich sein;
 * was erlaubt ist, regeln die Richtlinien in der Datenbank (nur lesen und neue Einträge anlegen).
 */
(function (root) {
  'use strict';
  const NVM = root.NVM = root.NVM || {};

  // ------------------------------------------------------------ Namensprüfung
  // Dieselbe Liste steht in supabase.sql, damit die Datenbank auch selbst prüft.
  const BLOCK = [
    'arschloch', 'fick', 'fotze', 'hure', 'nute', 'wichser', 'schwuchtel', 'spast', 'misgeburt', 'kanake',
    'neger', 'niger', 'niga', 'hitler', 'nazi', 'siegheil', 'fuck', 'shit', 'cunt', 'bitch',
    'penis', 'vagina', 'porn', 'titen', 'muschi', 'schlampe', 'bastard', 'whore', 'slut', 'vergewalt'
  ];
  const NAME_RE = /^[A-Za-zÄÖÜäöüß0-9 ._-]{2,16}$/;

  function normalize(n) {
    return String(n).toLowerCase()
      .replace(/[0134578@$]/g, (c) => ({ 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' }[c]))
      .replace(/[^a-zäöüß]/g, '')
      .replace(/(.)\1+/g, '$1');
  }
  // Liefert '' wenn der Name passt, sonst eine Meldung
  function checkName(raw) {
    const n = String(raw || '').trim().replace(/\s+/g, ' ');
    if (n.length < 2) return 'Bitte mindestens 2 Zeichen.';
    if (n.length > 16) return 'Höchstens 16 Zeichen.';
    if (!NAME_RE.test(n)) return 'Erlaubt sind Buchstaben, Ziffern, Leerzeichen und . _ -';
    const x = normalize(n);
    if (BLOCK.some((w) => x.includes(w))) return 'Bitte einen anderen Namen wählen.';
    return '';
  }

  // ------------------------------------------------------------ Datenbank
  const cfg = () => root.NVM_CONFIG || {};
  const enabled = () => !!(cfg().supabaseUrl && cfg().supabaseKey);
  const base = () => cfg().supabaseUrl.replace(/\/+$/, '') + '/rest/v1/scores';
  function headers(extra) {
    const k = cfg().supabaseKey;
    const h = { apikey: k, 'Content-Type': 'application/json' };
    if (!k.startsWith('sb_')) h.Authorization = `Bearer ${k}`;   // nur alte anon-Schlüssel (JWT) brauchen den Bearer-Kopf
    return Object.assign(h, extra || {});
  }
  async function req(url, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(url, Object.assign({ signal: ctl.signal }, opts));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } finally { clearTimeout(t); }
  }
  // Anzahl der Einträge für einen Filter (über den Content-Range-Kopf)
  async function count(filter) {
    const r = await req(`${base()}?select=id${filter ? '&' + filter : ''}`, { headers: headers({ Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }) });
    const cr = r.headers.get('content-range') || '';
    const n = Number(cr.split('/')[1]);
    return Number.isFinite(n) ? n : 0;
  }
  const COLS = 'select=id,name,score,level,created_at';
  async function top(n = 10) {
    const r = await req(`${base()}?${COLS}&order=score.desc,created_at.asc&limit=${n}`, { headers: headers() });
    return r.json();
  }
  async function around(rank, n = 5) {
    const off = Math.max(0, rank - 1 - Math.floor(n / 2));
    const r = await req(`${base()}?${COLS}&order=score.desc,created_at.asc&offset=${off}&limit=${n}`, { headers: headers() });
    return { offset: off, rows: await r.json() };
  }
  async function submit(e) {
    const msg = checkName(e.name);
    if (msg) throw new Error(msg);
    const body = { name: e.name.trim().replace(/\s+/g, ' '), score: Math.round(e.score), level: e.level, correct: e.correct, asked: Math.max(1, e.asked) };
    const r = await req(base(), { method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(body) });
    const rows = await r.json();
    return rows[0];
  }
  // Platz eines Ergebnisses: alle mit mehr Punkten, bei Gleichstand die früheren
  async function rankOf(row) {
    const higher = await count(`score=gt.${row.score}`);
    const tie = await count(`score=eq.${row.score}&created_at=lt.${encodeURIComponent(row.created_at)}`);
    return higher + tie + 1;
  }

  // Bester eigener Eintrag (IDs merkt sich das Gerät)
  async function bestOf(ids) {
    const list = ids.filter((x) => Number.isInteger(x)).slice(-100);
    if (!list.length) return null;
    const r = await req(`${base()}?${COLS}&id=in.(${list.join(',')})&order=score.desc,created_at.asc&limit=1`, { headers: headers() });
    const rows = await r.json();
    return rows[0] || null;
  }

  NVM.board = { enabled, checkName, normalize, submit, top, around, rankOf, bestOf, total: () => count('') };
})(typeof window !== 'undefined' ? window : globalThis);
