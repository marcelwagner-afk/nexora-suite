# IT-Infrastruktur und Sizing (v0.9.9)

Beispielwerte aus offenen Annahmen – keine Herstellerangaben, kein Sizing-Werkzeug eines Herstellers, keine echte Infrastruktur. Herstellernamen nur als Text. Für SAP-Systeme gilt verbindlich das Sizing mit den Werkzeugen und Vorgaben von SAP.

## Wo

| Ort | Inhalt | Live-Quelle |
|---|---|---|
| Suite → **IT-Infrastruktur** (Suite- und Experience-Layer-Navigation) | Architektur des aktuellen Mandanten (Elevon, NovaMart, Aventra): Nutzer, Zugang, Anwendung, KI-Dienst, Daten, Integration mit SAP, Microsoft 365, ServiceNow, Workday (simuliert), Betrieb | Engine-Befehle und Konnektor-Aufrufe der letzten Minute in diesem Browser; System of Record je Prozess aus dem Ablöse-Cockpit |
| PE → **IT-Infrastruktur** | Portfolio: Betriebsmodelle, Sizing je Unternehmen, Summen, Ziel STEGARC, Was-wäre-wenn | Integrationsstatus aus dem ERP Integration Hub; Engine-Mandanten (Nordlicht) aus der Suite |
| PE → Unternehmensseite → Reiter **IT-Infrastruktur** | Architektur des ERP des Unternehmens, Ist / Ziel STEGARC / Was-wäre-wenn mit Zukauf | wie oben |

## Was sich live ändert

- **Auslastung** jeder dimensionierten Komponente = Grundlast aus dem Sizing + Ereignisse der letzten Minute ÷ Kapazität (Deckel 99 %). Ab 70 % „hoch“, ab 90 % „kritisch“.
- **Echte Aktivität:** Jeder Engine-Befehl (Buchung, Auftrag, Service …) und jeder Konnektor-Aufruf zählt. Die Seite aktualisiert sich alle 1,5 Sekunden, solange sie offen ist.
- **„Lastspitze simulieren“** erzeugt nur Anfragen für diese Anzeige (keine Buchungen) und klingt nach einer Minute ab.
- **Ablösung:** Wird ein Prozess im Ablöse-Cockpit auf STEGARC umgestellt, verliert das Altsystem ihn sofort; ohne Prozesse wird es „nur lesend“.
- **Integration (PE):** Abgelaufener Zugang oder Fehllauf im Hub färbt die Integrationskomponente rot, Warnungen gelb.
- **Mandantengröße** (Demo Control Center, S/M/L) ändert Nutzer und Belegvolumen und damit das Sizing.

## Sizing

Eingaben: Nutzer, Belege je Monat, Positionen je Beleg, Schnittstellen, Gesellschaften, Historie, Wachstum.
- Suite-Mandanten: **gemessen** aus der Engine (Mitarbeitende × 70 %, Belege der abgeschlossenen Monate, Datenbestand der Demo in KB).
- Portfoliounternehmen: abgeleitet aus Umsatz und Branche (Belegwert je Ausgangsrechnung × Faktor 6 für weitere Belegarten, Annahme), Nutzer wie in der ERP-Transformation.

Ergebnisse je System mit Formel: gleichzeitige Nutzer, Spitzenlast, Anwendung (Knoten, vCPU, RAM), Datenbank (vCPU, RAM, In-Memory), Datenbestand heute und in N Jahren, Speicher inkl. Sicherung, Netz, IOPS, Grundlast. SaaS und Dienstleister: keine eigene Rechenleistung, nur Datenvolumen und Netz.

- **Ziel STEGARC (Szenario D):** gleiche Nutzer und Volumen, Altdaten der letzten 24 Monate, Schnittstellen halbiert. Die STEGARC-Werte (u. a. 25 gleichzeitige Nutzer je vCPU) sind Annahmen der Zielarchitektur, nicht gemessen.
- **Was-wäre-wenn:** Faktoren für Nutzer und Belegvolumen, Zukauf (Nutzer, Belege), Prognosezeitraum.

## Tests

- `node test/infra.test.js` – 10 Tests (Formeln nachrechenbar, Monotonie, SaaS, Ziel, Was-wäre-wenn, Live-Auslastung, Integrationsfehler, Messung aus der Engine, Portfolio-Summen, Mandantentrennung).
- `python test/e2e.py` – Lastspitze färbt die Anwendung kritisch, echte Buchung wird gezählt, Ablösung macht Workday „nur lesend“, PE-Portfolio mit 25 Unternehmen, abgelaufener SFTP-Zugang rot; beide Seiten bei 400 px.
- `node test/pe.stress.js` – Sizing aller 2.500 Unternehmen rund 0,2 s.
