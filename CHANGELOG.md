# Changelog

## v0.8 – Experience Layer (2026-11)

Die Suite wird zu einer herstellerneutralen Oberfläche über mehrere Systeme. Die NEXORA-Engine bleibt vollständig erhalten und ist ein Konnektor unter mehreren. Die Suite-Ansicht funktioniert unverändert wie v0.7 und ist über den Umschalter erreichbar.

**Neu**

- **Konnektor-Schicht** (`src/connectors.js`):
  - NEXORA-Engine (live) sowie SAP S/4HANA, Microsoft 365, ServiceNow und Workday. Alle Fremdsysteme sind **simuliert**: aus dem Seed erzeugt, ohne Netzwerkzugriff und überall gekennzeichnet.
  - Ein Befehlsweg `conn.<system>.<befehl>`, atomar und mit Rechteprüfung.
  - Ledger mit Person, Rolle, Zugriffsweg, Agent und Beispielkosten.
- **Eine Inbox, eine Suche, ein Kartenformat:** Deep Links in alle Systeme und ein Bestätigungsdialog mit Kosten und Vier-Augen-Hinweis.
- **Aktionskarten im Assistenten:** Werkzeuge `aufgaben_alle`, `suche_alle`, `objekt`, `kosten`, `route`. Claude und der Regel-Rückfall zeigen dieselben Karten. Die KI schlägt nur vor.
- **Agenten-Register und Router** im A2A-Stil:
  - Jede Antwort zeigt einen Chip mit Weg und Kosten.
  - Ohne zulässigen Weg wird verständlich abgelehnt, etwa bei direktem SAP-Zugriff oder bei einem nicht angebundenen System.
- **Kosten und Protokoll:**
  - Kostenzähler in der Kopfzeile und Kosten je Karte.
  - Route `audit` mit Filtern und CSV-Export.
  - Seite „Mitbestimmung & Datenschutz“, die nur die Demo beschreibt und keine Rechtsaussage trifft.
- **Einbettung:** `#embed` bzw. `?embed=1` als Vorschau für etwa 400 px. Dazu kommen `dist/mcp-tools.json` und `dist/agent-card.json` als statische Vorführdateien.
- **Individuelles Dashboard:** systemneutrale Kacheln und Vorlagen je Rolle. Die Konfiguration steht im Ereignisprotokoll.
- **Ablöse-Cockpit** (Route `transition`): Der Prozess „Bestellanforderung“ wechselt von SAP (simuliert) auf die NEXORA-Engine:
  - Datenübernahme über das Migrationsmodul (neu: Migrationsprojekte),
  - Parallelbetrieb mit Spiegelung und Abstimmung,
  - Umschalten,
  - Rückweg.
- **Drei neue Storys:** `crosssys`, `oneday`, `replace`. Damit gibt es 13 Storys, auch auf der TRUESCALE-Seite.
- **TRUESCALE-Seite:**
  - Abschnitt „Eine Oberfläche für alle Systeme, dann Ihr eigenes ERP“.
  - Marktposition mit öffentlicher und interner Fassung.
- **Standardansicht** ist jetzt der Experience Layer. `?layer=0` öffnet die Suite-Ansicht.

**Behoben**

- Schaltflächen in Dialogen reagierten nicht, darunter Befehlspalette und „Demo vorbereiten“. Der Fehler bestand seit v0.7.
- Vier-Augen-Prinzip: Wer die erste Freigabe erteilt hat, bekommt die zweite nicht mehr angeboten.

**Tests**

- `test/engine.test.js`: 47 Tests, unverändert.
- `test/connectors.test.js`: 40 Tests, in CI.
- `test/e2e.py`: 13 Storys sowie Prüfungen zu Experience Layer, Ablösung, Einbettung und Marktposition.
- `test/visual.py`: Die Suite-Ansicht ist pixelgleich zu v0.7, verglichen ohne Kopfzeile.

**Grenzen**

- Keine echte Integration in Fremdsysteme.
- Kosten und Lizenzwirkungen sind Beispielwerte, keine Herstellerpreise.
- Die SAP-Wege orientieren sich am Hinweis auf die SAP API Policy (v4/2026), ausdrücklich ohne Rechtsbewertung.

## v0.7 – Live-Demo

Aufgaben je Rolle, Präsentationsmodus, Fernbedienung, Belege als PDF, Demo vorbereiten.

## v0.4 bis v0.6

Service, Wartung, HR, Migration und Cutover, Design-to-Make mit DXF-Import, Einkauf direkt und indirekt, Rollen und Accounts, TRUESCALE-Seite.
