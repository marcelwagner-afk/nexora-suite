# Changelog

## v0.9.8 – Stresstest (2026-11)

- **Neue Stresstests:** `test/pe.stress.js` (Skalierung bis 2.500 Unternehmen, Engine-Last S/M/L, 3.000 Zufallsbefehle mit Invarianten) und `test/ui.stress.py` (alle PE-Seiten im Browser, auch mit 255 Unternehmen, und 300 Geschäftsvorfälle Dauerlast). Eine verkleinerte Fassung läuft in CI. Ergebnisse: `docs/stresstest.md`.
- **Behoben:** Absturz bei „Initiative aktualisieren“ mit unbekannter Initiative; jetzt fachlicher Fehler.
- **Schneller:** Die Engine sichert für die Atomarität nur noch den betroffenen Mandanten (plus Eingangskorb der anderen) statt der ganzen Welt: Größe L rund 5-mal schneller je Befehl. Der PE-Rechenkern speichert umgerechnete Monatswerte zwischen: Risk Intelligence bei 2.500 Unternehmen von 5,9 s auf 0,5 s.
- **Robuster:** PE-Rechenkern im Strict Mode, zwischengespeicherte Monatswerte sind eingefroren. Neuer Engine-Test zur Atomarität über alle drei Mandanten.

## v0.9.7 – Modell B mit Engine-Daten (2026-11)

- **Elevon, NovaMart und Aventra im PE-Portfolio:** neuer Demo-Investor „Nordlicht Beteiligungen“ mit Fonds „Nordlicht Plattform I“ und Zugang Nora Lindqvist. Ab Nov 2025 kommen alle Monatswerte aus den Buchungen der NEXORA-Engine (Kontenplan der Engine, kein Mapping). Davor steht eine gekennzeichnete synthetische Fortschreibung ohne Belege.
- **Drill-down bis zum Engine-Beleg** (Belegnummer, Datum, Text; Summe = Kontosaldo). Für die Fortschreibung meldet der Drill-down eine Datenlücke.
- **Live-Karte** auf der Unternehmensseite: offene Periode (Nov 2026) direkt aus der Engine, mit Sprung in den Mandanten. Das abgeschlossene Reporting bis Okt 2026 ändert sich durch neue Buchungen nicht.
- **Ehrlichkeit:** Für Engine-Mandanten gibt es keinen Vorjahresvergleich und keine Anomalieprüfung gegen die Fortschreibung. Finanzierung: ohne Fremdkapital.
- **Aufgeräumt:** Die Reiter der Unternehmensseite verweisen nicht mehr auf „folgt in Phase …“, sondern auf die umgesetzten Module. Der Reiter Value Creation zeigt die Initiativen des Unternehmens.
- **Tests:** `test/pe.test.js` hat jetzt 60 Tests (Abgleich mit den Engine-Buchungen je Monat, Belege, Mandantentrennung, offene Periode). Der e2e-Block bucht eine Servicerechnung in der Suite und prüft die Live-Karte.

## v0.9.6 – PE ERP-Transformation (2026-11)

- **ERP-Transformation** (`PE.transformation`): Bewertung je Unternehmen mit Nutzerzahl, Lizenz/Abo, Wartung, Hosting, Schnittstellen, Individualentwicklung, funktionaler Abdeckung, technischer Schuld, Migrationskomplexität und geschätzter Implementierung.
- **Szenarien A–D** über einen wählbaren Zeitraum: A unverändert, B nur Finanzintegration, C teilweise NEXORA (Finanzen), D vollständige Transformation. TCO = Einmalkosten + Jahre × laufende Kosten; Einsparung = TCO A − TCO Szenario. Negative Werte bleiben sichtbar.
- **Kandidaten und Roadmap:** Bewertung aus technischer Schuld, Abdeckung und Einsparquote; Unternehmen mit Liquiditätsrisiko oder laufendem Onboarding werden zurückgestellt. Die Roadmap ist ein Vorschlag in drei Wellen.
- **Annahmen** sind offen, in der Ansicht änderbar und als „Beispielwerte, keine Herstellerpreise“ gekennzeichnet. Herstellernamen nur als Text, keine echte Integration. Verweis auf das Ablöse-Cockpit.
- **Tests:** `test/pe.test.js` hat jetzt 55 Tests; der e2e-Block öffnet einen Kandidaten, ändert den Parallelbetrieb und prüft die Rechnung sowie die Darstellung bei 400 px.

## v0.9.5 – PE Advanced Capabilities (2026-11)

- **Financial Consolidation:**
  - Die „Industrial Platform Holding“ (Fund I) wird mit vier Beteiligungen konsolidiert: zwei voll (eine davon mit 25 % Minderheiten), eine quotal (gemeinschaftliche Tätigkeit 50 %), eine at equity (30 %).
  - Dazu gehören Intercompany-Abstimmung und -Eliminierung mit offener Differenz („Ware unterwegs“) und Klärung per Freigabe, Währungsumrechnung mit Umrechnungsdifferenz sowie Konzern-GuV, Konzernbilanz und Konsolidierungsprotokoll.
  - Eine Überleitung zeigt den Unterschied zwischen Management-Aggregation und Konsolidierung.
  - Hinweis: Fonds als Investmentgesellschaften konsolidieren nach IFRS 10 nicht.
- **Investment Performance:** Lebenszyklus, Fonds- und Deal-Kennzahlen, Exit-Simulation (Jahr, Multiple, Wachstum, Kosten) mit Abwärts-, Basis- und Aufwärts-Szenario. Für Haltedauern unter 12 Monaten wird keine annualisierte IRR ausgewiesen.
- **Value Creation:**
  - Initiativen mit Baseline, Wirkung, Kosten, Termin, Ist und Beleg sowie Statusfluss.
  - Doppelzählung je Hebel wird verhindert; Working Capital wirkt auf Cash, nicht auf EBITDA.
- **Risk Intelligence:** Covenant-Prognose zum 31.01.2027, Liquiditätslücken, kritische Indikatoren, Anomalien und Datenqualität aus dem Integration Hub.
- **Portfolio Onboarding:**
  - Zehn Schritte, deren Status aus Daten und Hub abgeleitet wird.
  - Aktivierung erst nach Validierung, mit Vier-Augen-Freigabe durch einen zweiten PE-Administrator (neuer Demo-Zugang Dr. Jan Berger).
- **Tests:** `test/pe.test.js` hat jetzt 52 Tests. Der e2e-Block durchläuft IC-Klärung, Exit-Szenario, Doppelzählung, Covenant-Bruch und das Onboarding bis zur Aktivierung.

## v0.9.4 – PE ERP Integration Hub (2026-11)

- **Connector-Framework:** Jede ERP-Familie ist mit Methoden, Authentifizierung, Finanzdomänen, Einzelposten und Delta-Fähigkeit beschrieben, inklusive Hinweis. SAP S/4HANA, ECC und Business One haben bewusst unterschiedliche Wege. Alle Verbindungen sind simuliert.
- **Synchronisationslauf:** Authentifizierung → Extraktion → Validierung → Mapping → Abstimmung (Quelle → Harmonisiert → Bericht) → Laden. Bei Fehlern wird nicht geladen; der Bericht behält den letzten abgestimmten Stand.
- **Monitoring:** angebundene Unternehmen und Systeme, letzte erfolgreiche Synchronisation, Vollständigkeit, Mapping-Fehler, Abstimmungsdifferenzen, Fehlläufe, Zustand.
- **Fehlerbilder im Startzustand:**
  - verspäteter Delta-Export mit fehlender Gesellschaft (SAP ECC),
  - abgelaufener SFTP-Zugang (Eigenentwicklung),
  - offenes Mapping beim Neuerwerb (DATEV).
- **Mapping-Editor** mit Abstimmung je Kategorie: Eine falsche Zuordnung bleibt als Kategorie-Differenz sichtbar.
- **Rechte:** Läufe und Mapping steuern nur der PE-Administrator sowie Controller, CFO bzw. Admin des eigenen Unternehmens. Jeder Lauf wird mit Auslöser protokolliert.
- **Tests:** `test/pe.test.js` hat jetzt 42 Tests; der e2e-Block behebt ein Mapping über die Oberfläche.

## v0.9.3 – PE Financial Intelligence (2026-11)

- **Financial Intelligence:**
  - Abstimmung lokaler Standard → IFRS-Konzernsicht mit expliziten Anpassungen. Bei HGB-Unternehmen ist das IFRS 16; jede Anpassung muss freigegeben werden. US GAAP gilt als Datenlücke statt Schätzung.
  - Vergleich mit Median.
  - EBITDA-Brücke: Volumen- und Kostenquoteneffekte, deren Summe die Veränderung genau ergibt.
  - Anomalien gegen die saisonale Erwartung.
  - Prognose mit Bandbreite aus der Rückrechnung und erwartetes GJ-2026-EBITDA.
- **Cash & Liquidity:** Liquiditätsprognose über 6 Monate je Unternehmen (erwarteter und pessimistischer Fall), Working Capital gegen Branchen-Richtwerte, die als Annahmen gekennzeichnet sind.
- **AI Financial Advisor:**
  - Claude mit 10 Werkzeugen auf den Rechenkern, mit den Rechten des angemeldeten Nutzers.
  - Ein Regel-Rückfall beantwortet alle acht Beispielfragen.
  - Jede Antwort nennt Belege, Zeitraum, Quelle, Methode, Sicherheit und Empfehlung. Nicht zuordenbare Fragen bekommen keine erfundene Antwort.
- **Command Center:**
  - Filter „Rechnungslegung“.
  - Die Liquiditätsprognose ersetzt die bisherige Datenlücke.
- **Tests:** `test/pe.test.js` hat jetzt 34 Tests. Der e2e-Block prüft IFRS-Freigabe, Prognose, Liquidität und den Advisor (Regeln und Claude-Testdouble, Rechte im Werkzeug).

## v0.9 – PE Command Center, MVP (2026-11)

**Neu**
- **Bereich „Private Equity“ in der Navigation:**
  - Umgesetzt: PE Command Center, Portfolio Companies mit Unternehmensdetail, Administration.
  - Zehn weitere Module sind sichtbar als „geplant“ markiert, mit Umfang und Phase.
- **Rechenkern `src/pe.js`:**
  - 25 synthetische Portfoliounternehmen in drei Fonds mit 36 Monaten Historie, dazu ein zweiter Investor.
  - Harmonisierung lokaler Kontenpläne und Währungsumrechnung.
  - Kennzahlen mit Formeln; Fondskennzahlen per XIRR.
  - Rechteprüfung je Lesefunktion.
  - Drill-down bis zur Buchung, nur mit Freigabe und Einzelposten im Quellsystem.
  - Verwaltung: Organisation, Fonds und Unternehmen anlegen.
- **Marke:** „NEXORA AI – A brand of TRUESCALE“ in Suite, Prototyp, TRUESCALE-Seite, Agentenkarte und README.
- **Plan:** `docs/pe-command-center.md`.

**Tests**
- `test/pe.test.js`: 24 Tests (Bilanzidentität, Formeln, XIRR-Referenz, Fondskennzahlen, Mandantentrennung, Freigabestufen, Datenlücken, Verwaltung), in CI.
- e2e-Block „PE Command Center“, auch bei 400 px Breite.
- `test/pe.bench.js` misst den Rechenkern mit 2.500 Unternehmen.

**Grenzen**
- Keine Server-Absicherung, Verschlüsselung, SSO/MFA oder Lasttests einer Serverarchitektur. Die Rechteprüfung läuft im Browser.
- Hinweise sind regelbasiert, keine KI. Claude als AI Financial Advisor folgt in PE-Phase 3.

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
