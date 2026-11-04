# NEXORA AI Suite

KI-native Enterprise-Plattform als vollständig klickbare Demo mit drei verbundenen Digital Twins:

- **Elevon Industries** (Aufzugshersteller)
- **NovaMart Retail** (Handel)
- **Aventra Consulting** (Beratung)

Alle Daten sind synthetisch und werden reproduzierbar erzeugt (Seed 20261102). Es gibt keine realen Kunden-, Preis- oder Vertragsdaten.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/engine.js` | Business-Engine (UMD, ohne Abhängigkeiten). Sie umfasst: doppelte Buchführung mit Perioden und Belegnummern; Nebenbücher, die mit dem Hauptbuch abgestimmt sind; Rollen und Berechtigungen; Idempotenz; atomare Befehle; den Nachrichtenaustausch zwischen den Unternehmen; die Rücksetzung je Mandant. |
| `src/app.js`, `src/app_ext.js` | Oberfläche, geführte Demos, Live-Änderungen und Backend-Anbindung |
| `test/engine.test.js` | 38 Akzeptanztests: Buchungslogik, Reproduzierbarkeit, alle E2E-Prozesse |
| `test/e2e.py` | Playwright-Browsertest. Er spielt alle 7 Demo-Storys durch, prüft Konsistenz und Reset und erzeugt Screenshots. |
| `build.py` | Erzeugt die Einzeldatei `dist/nexora-suite.html` |

## Prozesse

| Prozess | Stand |
|---|---|
| Lead-to-Cash mit Fertigung und Montage | Live-Engine |
| Retail Order-to-Cash | Live-Engine |
| Project-to-Cash | Live-Engine |
| Unternehmensübergreifende Ketten | Live-Engine |
| Service-to-Cash | Live-Engine |
| Maintain-to-Operate | Live-Engine |
| Retouren | Live-Engine |
| Click & Collect | Live-Engine |
| HR: Stamm, Abwesenheiten, Personalkostenplanung | Live-Engine |
| Datenmigration mit Vier-Augen-Freigabe und Cutover | Live-Engine |
| Payroll | Bewusst Platzhalter |
| Transformation | Prototyp |

## Lokal ausführen

```bash
node test/engine.test.js
python build.py
pip install playwright && python -m playwright install chromium
python test/e2e.py
```

Die veröffentlichte Version nutzt eine gemeinsame Datenbank als Ereignisprotokoll. Die Welt entsteht immer aus Seed und Protokoll und ist daher reproduzierbar. Ist die Datenbank nicht verfügbar, speichert die Seite das Protokoll lokal im Browser. Google Drive dient für Sicherung, Export und Wiederherstellung. Claude dient als Assistent mit lesenden Engine-Werkzeugen und bucht nichts selbst.
