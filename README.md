# NVM – Never mind, ich kann Schnittgrößen

Trainingsspiel für Normalkraft-, Querkraft- und Momentenverläufe.

## Starten

Online: **https://bluuuez.github.io/nvm/**

Am iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Nach dem ersten Öffnen läuft NVM
auch offline; neue Versionen kommen beim nächsten Start mit Netz automatisch an.

Lokal: `index.html` doppelklicken – läuft direkt im Browser, ohne Installation und ohne Internet.
NVM lädt nichts von fremden Servern, setzt keine Cookies und speichert Highscore und
Einstellungen nur im eigenen Browser.

## Modi

- **Arcade:** drei Leben, Zeitlimit, steigende Level, Highscore
- **Lernen:** gezielt üben – Größe (N, V, M), Aufgabe (Verlauf zum System, System zum Verlauf,
  Maximum antippen, Nullstelle antippen, Werte), Tragwerk und Stufe frei wählbar,
  Erklärung nach jeder Antwort
- **Spickzettel:** Vorzeichen, Beziehungen, Standardfälle

Einstellungen: Zeit pro Aufgabe, Werte-Aufgaben als Formeln, mit glatten Zahlen oder mit
Taschenrechner, schiefe Stäbe gemischt/aus/nur schief, Hell oder Dunkel.

## Tasten

`1`–`4` antworten · `Leertaste` weiter · `L` Lösung · `H` Spickzettel · `T` Hell/Dunkel ·
`S` Ton · `B` Boss-Taste · `Esc` Menü

## Dateien

- `js/core.js` – Löser, Aufgaben, Fehlerkatalog, Erklärungen
- `js/draw.js` – Systeme und Verläufe als SVG
- `js/app.js` – Oberfläche und Spielablauf
- `sw.js` – Offline-Modus
- `fonts/` – Barlow und Barlow Semi Condensed (SIL Open Font License, `fonts/OFL.txt`)
- `icons/` – App-Icons für Home-Bildschirm
- `styles.css`, `fonts.css`, `index.html`, `icon.svg`, `manifest.webmanifest`
