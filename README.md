# Z9nAI Budget

Haushaltsbuchhaltung im Stil von [Z9nAI Hours](https://z9nai.github.io/z9nai-hours/): eine reine Browser-App
(React, Vite, Tailwind), die ihre Daten als JSON-Dateien in einem lokalen Verzeichnis ablegt (File System Access API)
und optional in ein GitHub-Repository committet.

## Ansichten

- **Jahr** – Kategorien × Monate wie im bisherigen Google Sheet, dazu Total, Ø pro Monat, Budget pro Monat (direkt editierbar),
  Budget pro Jahr, Rest, Hochrechnung bis Ende Jahr und Abweichung in %. Klick auf eine Monatszelle öffnet die Buchungen.
  Excel-Export des Jahres im Layout des Sheets.
- **Buchungen** – einzelne Buchungen pro Monat erfassen (Datum, Kategorie, Betrag, Text), filtern, suchen, duplizieren.
- **Übersicht** – Ausgaben pro Monat nach Kategorie (gestapelt, Einnahmen als Strich, Budget gestrichelt), Jahrestabelle
  und Kategorien pro Jahr.
- **Kategorien** – Ausgaben- und Einnahmen-Kategorien mit Farbe, Reihenfolge und Archiv.
- **Import** – übernimmt das Google Sheet «Family Budget» (als .xlsx exportiert): Kategorien, Budgets und jede
  Monatszelle; Formeln wie `=400+40+98` werden zu drei Buchungen.
- **Admin** – Datenverzeichnis und Git-Versionierung (fine-grained GitHub Token, nur im Browser gespeichert).

## Daten

```
categories.json      Kategorien (id, name, kind, color, archived)
budget-2025.json     pro Jahr: budget (Kategorie → CHF/Monat), bookings, months (optional: Divisor für Ø)
backup/              automatische Sicherungen (höchstens stündlich, 30 pro Datei)
```

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:3001/z9nai-bookkeeping/
npm run build      # tsc + vite build → dist/
```

Import des Sheets auch ohne Browser (gleicher Code wie die Import-Ansicht):

```bash
npm run import-xlsx -- "Family Budget.xlsx" /pfad/zum/datenverzeichnis
npm run import-xlsx -- "Family Budget.xlsx" --dry-run   # nur prüfen
```

Deployment nach GitHub Pages erfolgt per Workflow bei jedem Push auf `main`.
