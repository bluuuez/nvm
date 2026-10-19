# NVM – Never mind, ich kann Schnittgrößen

Trainingsspiel für Normalkraft-, Querkraft- und Momentenverläufe.

## Starten

`index.html` doppelklicken – NVM läuft direkt im Browser, ohne Installation und ohne Internet
(online lädt es zusätzlich die Schrift Barlow).

Fürs Handy: Den Ordner auf einen beliebigen Webspace legen (z. B. GitHub Pages, Netlify Drop)
und die Seite im Browser über „Zum Home-Bildschirm“ als App speichern.

## Modi

- **Arcade:** drei Leben, Zeitlimit, steigende Level, Highscore
- **Lernen:** Thema, Tragwerk und Stufe frei wählbar, Erklärung nach jeder Antwort
- **Klausur:** zehn Aufgaben, am Ende eine Note
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
- `styles.css`, `index.html`, `icon.svg`, `manifest.webmanifest`
