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

- **Arcade:** drei Leben, Zeitlimit, alles gemischt, nie zweimal derselbe Aufgabentyp
  hintereinander; alle fünf richtigen Antworten steigt das Level
- **Lernen:** Mehrfachauswahl von Schnittgrößen (N, V, M), Aufgaben (Verlauf zum System,
  System zum Verlauf, Maximum antippen, Nullstelle antippen, Werte bestimmen) und Tragwerken,
  dazu eine Stufe; Erklärung nach jeder Antwort

Stufen: 1 Einstieg (eine Einzel- oder Gleichstreckenlast), 2 Grundlagen (auch Teil-, Dreiecks-,
Einzel- und Linienmomentlasten), 3 Fortgeschritten (ein bis zwei Lasten, auch schräge und
waagerechte Kräfte), 4 Klausurniveau (zwei Lasten), 5 Profi (zwei bis drei Lasten).
- **Spickzettel:** Vorzeichen, Beziehungen, Standardfälle

Einstellungen: Zeit pro Aufgabe, Werte-Aufgaben als Formeln, mit glatten Zahlen oder mit
Taschenrechner, schiefe Stäbe gemischt/aus/nur schief, Verläufe positiv zur gestrichelten Faser
(TUM) oder V und N positiv oben, Hell oder Dunkel.

## Statik

Lasten: Einzellasten (auch schräg und waagerecht), Gleich- und Dreieckslasten, Einzelmomente und
Linienmomente. Vorzeichen und Differentialbeziehungen wie in Statik 1 an der TUM
(x nach rechts, z nach unten, dN/dx = −n, dV/dx = −q, dM/dx = V − m).
Der Löser ist gegen die Tabellen in Schneider, Bautabellen (Abschnitt 4 A) geprüft.

## Tasten

`1`–`4` antworten · `Leertaste` weiter · `L` Lösung · `H` Spickzettel · `T` Hell/Dunkel ·
`S` Ton · `B` Boss-Taste · `Esc` Menü

## Dateien

- `js/core.js` – Löser, Aufgaben, Fehlerkatalog, Erklärungen
- `js/draw.js` – Systeme und Verläufe als SVG
- `js/app.js` – Oberfläche und Spielablauf
- `sw.js` – Offline-Modus
- `js/math.js` – Formelsatz: erkennt Formeln in den Texten und setzt sie mit KaTeX
- `katex/` – KaTeX 0.16 (MIT-Lizenz), lokal für den Offline-Betrieb
- `fonts/` – Source Sans 3, Source Serif 4, Barlow Semi Condensed (SIL Open Font License, `fonts/OFL-*.txt`)
- `icons/` – App-Icons für Home-Bildschirm
- `styles.css`, `fonts.css`, `index.html`, `icon.svg`, `manifest.webmanifest`
