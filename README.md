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
- **Analyse** – Einnahmen/Ausgaben/Überschuss pro Jahr, Sparquote, kumulierter Überschuss, Ausgaben nach Kategorie
  (Donut) und eine Kategorie im Zeitverlauf mit Budget. Es zählen nur verbuchte Monate.
- **Abgleich** – Kontostände laut Bankauszug pro Monat eintragen; die Veränderung wird dem Überschuss der Buchhaltung
  gegenübergestellt, die Differenz zeigt fehlende Buchungen.
- **Fixbuchungen** – monatlich wiederkehrende Buchungen, z. B. Abschreibungen mit Gesamtbetrag; werden automatisch bis
  zum laufenden Monat erzeugt, einzelne Monate lassen sich auslassen.
- **Kategorien** – Ausgaben- und Einnahmen-Kategorien mit Farbe, Reihenfolge und Archiv.
- **Admin** – Datenverzeichnis und Git-Versionierung (fine-grained GitHub Token, nur im Browser gespeichert).

## Daten

```
categories.json      Kategorien (id, name, kind, color, archived)
settings.json        Konten (Abgleich) und Fixbuchungen
budget-2025.json     pro Jahr: budget (Kategorie → CHF/Monat), bookings, months (Divisor für Ø), balances (Kontostände)
backup/              automatische Sicherungen (höchstens stündlich, 30 pro Datei)
```

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:3001/z9nai-bookkeeping/
npm run build      # tsc + vite build → dist/
```

Einmaliger Import des Google Sheets «Family Budget» (als .xlsx exportiert): Kategorien, Budgets und jede Monatszelle;
Formeln wie `=400+40+98` werden zu drei Buchungen.

```bash
npm run import-xlsx -- "Family Budget.xlsx" /pfad/zum/datenverzeichnis
npm run import-xlsx -- "Family Budget.xlsx" --dry-run   # nur prüfen
```

Deployment nach GitHub Pages erfolgt per Workflow bei jedem Push auf `main`.
