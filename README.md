# NVM – Never mind, ich kann Schnittgrößen

Trainingsspiel für Normalkraft-, Querkraft- und Momentenverläufe.

## Starten

Online: **https://bluuuez.github.io/nvm/**

Am iPhone in Safari öffnen → Teilen → „Zum Home-Bildschirm“. Nach dem ersten Öffnen läuft NVM
auch offline; mit Netz lädt es immer die neueste Version.

Lokal: `index.html` doppelklicken – läuft direkt im Browser, ohne Installation und ohne Internet.
NVM setzt keine Cookies und speichert Highscore und Einstellungen nur im eigenen Browser.
Einzige Ausnahme ist die freiwillige Online-Bestenliste: Wer nach einem Arcade-Spiel einen Namen
einträgt, schickt Name, Punkte, Level und Zeitpunkt an die Datenbank (Supabase).

## Modi

- **Arcade:** drei Leben, Zeitlimit, alles gemischt, nie zweimal derselbe Aufgabentyp
  hintereinander; alle fünf richtigen Antworten steigt das Level
- **Lernen:** Mehrfachauswahl von Schnittgrößen (N, V, M), Aufgaben (Verlauf zum System,
  System zum Verlauf, Maximum antippen, Nullstelle antippen, Werte bestimmen) und Tragwerken,
  dazu eine Stufe; nach jeder Antwort ein Lösungsweg aus der echten Rechnung (Auflagerkräfte,
  Verlauf bereichsweise) und bei Fehlern die konkrete Abweichung (Vorzeichen, Randwert, Sprung,
  Knick, Form)

Stufen: 1 Einstieg (Einfeldträger und Kragarm, eine Last), 2 Grundlagen (Träger mit Kragarm,
alle Lastarten), 3 Fortgeschritten (Gerberträger, ein bis zwei Lasten), 4 Erste Rahmen (Kragwinkel,
Knick- und Treppenträger, abgespannte Träger), 5 Rahmen (Rahmen, Dreigelenkrahmen, Gelenkträger auf
Pendelstützen), 6 Pendel- und Nullstäbe (Fachwerkunterbau, unterspannte Träger, Stäbe auf
Pendelstäben), 7 Klausurniveau, 8 Profi. Rahmen und Stabwerke gibt es nur als „Verlauf zum System“.
Ihre Schwierigkeit wird aus Größe, Lösungsweg und Lasten berechnet (Stäbe, Gelenke, Ecken, schräge
Stäbe, Teilsysteme, Nullstäbe, Lastarten), nicht nur aus der Zahl der Lasten.
- **Gelenke** (Lernen ab Stufe 3, Arcade ab Level 5): Momenten-, Querkraft- und Normalkraftgelenk.
  „Gelenk erkennen“ zeigt ein System mit Fragezeichen und seine drei Verläufe; bei „Verlauf zum
  System“ mit Gelenk rechnen die falschen Antworten mit einer anderen Gelenkart
- **Spickzettel:** Vorzeichen, Beziehungen, Standardfälle, Gelenkarten; im Arcade gesperrt
- **Bestenliste:** nach dem Arcade einen Namen eintragen (Filter gegen Beleidigungen in App und
  Datenbank) und sehen, auf welchem Platz man steht

Arcade läuft für alle gleich, damit die Bestenliste fair ist: Zeit wird mit dem Level kürzer,
Werte im Kopf rechnen, ab und zu schiefe Stäbe. Beim Lernen einstellbar: Zeit pro Aufgabe,
Werte-Aufgaben als Formeln, mit glatten Zahlen oder mit Taschenrechner, schiefe Stäbe
aus/ab und zu/nur schief. Für beide Modi: Verläufe positiv zur gestrichelten Faser (TUM) oder
V und N positiv oben, Hell oder Dunkel.

## Statik

Lasten: Einzellasten (auch schräg und waagerecht), Gleich- und Dreieckslasten, Einzelmomente und
Linienmomente. Vorzeichen und Differentialbeziehungen wie in Statik 1 an der TUM
(x nach rechts, z nach unten, dN/dx = −n, dV/dx = −q, dM/dx = V − m).
Der Löser ist gegen die Tabellen in Schneider, Bautabellen (Abschnitt 4 A) geprüft, der
Stabwerkslöser gegen die Lösungen der Schnittgrößensammlung (Statik 1, TUM).

## Tasten

`1`–`4` antworten · `Leertaste` weiter · `L` Lösung · `H` Spickzettel (nicht im Arcade) · `T` Hell/Dunkel ·
`S` Ton · `Esc` Menü

## Bestenliste einrichten

1. Projekt auf supabase.com anlegen (Region Frankfurt).
2. Im SQL Editor den Inhalt von `supabase.sql` ausführen.
3. Project URL und anon-Schlüssel (Project Settings → API) in `js/config.js` eintragen.

Ohne Eintrag in `js/config.js` ist die Bestenliste ausgeblendet.

## Dateien

- `js/core.js` – Löser, Aufgaben, Fehlerkatalog, Merksätze
- `js/explain.js` – Lösungsweg und Fehlerdiagnose nach jeder Antwort
- `js/draw.js` – Systeme und Verläufe als SVG
- `js/frame.js` – Löser für ebene Stabwerke (Rahmen, Gelenke, Pendel- und Nullstäbe)
- `js/framegen.js` – Stabwerk-Familien, Schwierigkeitswert, falsche Antworten, Erklärungen
- `js/drawframe.js` – Stabwerke und ihre Verläufe als SVG
- `js/app.js` – Oberfläche und Spielablauf
- `sw.js` – Offline-Modus
- `js/board.js`, `js/config.js`, `supabase.sql` – Online-Bestenliste
- `js/math.js` – Formelsatz: erkennt Formeln in den Texten und setzt sie mit KaTeX
- `katex/` – KaTeX 0.16 (MIT-Lizenz), lokal für den Offline-Betrieb
- `fonts/` – Source Sans 3, Source Serif 4, Barlow Semi Condensed (SIL Open Font License, `fonts/OFL-*.txt`)
- `icons/` – App-Icons für Home-Bildschirm
- `styles.css`, `fonts.css`, `index.html`, `icon.svg`, `manifest.webmanifest`
