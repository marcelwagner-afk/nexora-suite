# Stresstest – STEGARC Suite und PE Command Center

Stand: 05.11.2026 · gemessen im Cloud-Container der Entwicklung (2 Kerne, Node 22, Chromium headless). Kein Server, keine Datenbank: gemessen wird der Rechenkern im Browser- bzw. Node-Prozess. Alle Daten sind synthetisch. Die Werte gelten für diese Maschine und sind keine Zusage für einen Produktivbetrieb.

## Aufruf

| Test | Befehl | Dauer |
|---|---|---|
| Rechenkern, Engine, Zufallsfolgen | `node --expose-gc test/pe.stress.js 100 3000` | ca. 13 s |
| verkleinert (läuft in CI) | `node test/pe.stress.js 10 1000` | ca. 7 s |
| Oberfläche im Browser | `python test/ui.stress.py 10 300` | ca. 30 s |

## Befunde und Behebung

| Befund | Ursache | Behebung | Wirkung |
|---|---|---|---|
| Absturz bei „Initiative aktualisieren“ mit unbekannter Initiative (TypeError) | fehlende Prüfung in `vcUpdate` | fachlicher Fehler `NOT_FOUND`; Initiative muss zum Unternehmen gehören | Zufallsfolgen: 0 Abstürze |
| Engine-Befehle werden mit wachsender Datenmenge langsam (Größe L: ca. 30 ms je Befehl) | Atomarität: vor jedem Befehl wurde die ganze Welt (alle drei Mandanten, ca. 4,6 MB) als JSON gesichert | Sicherung nur des eigenen Mandanten plus Eingangskorb und Nummernkreis der anderen – andere Mandanten ändert ein Befehl nur über `send()`; ein neuer Test sichert das ab | Größe L: ca. 5,8 ms je Befehl (rund 5-mal schneller) |
| PE-Auswertungen wachsen stark mit der Unternehmenszahl (Risk Intelligence bei 2.500 Unternehmen: 5,9 s) | Harmonisierung und EUR-Umrechnung jedes Monats wurden bei jeder Auswertung neu gerechnet | Ergebnis je Monatsdatensatz zwischengespeichert (Monatswerte sind nach dem Aufbau unveränderlich, Objekte eingefroren); Rechenkern läuft jetzt im Strict Mode, damit versehentliche Änderungen auffallen | Risk Intelligence 2.500 Unternehmen: 0,5 s; Portfolio-Kennzahlen 1,1 s → 0,2 s |

Vorher (2.500 Unternehmen, ms): Welt erzeugen 2.078 · portfolioKpis 1.123 · riskRegister 5.933 · investments 1.294 · advise 1.425 · transformation 1.129.

## Ergebnisse nach der Behebung

```
A) Skalierung – Laufzeit je Funktion in ms (Prinzipal: PE Group Administrator, alle Fonds)

Funktion                      25 U.     250 U.    1000 U.    2500 U.   Faktor 25→2500
Welt erzeugen                    51        180        534      1.289   25x
portfolioKpis                   4.6         24         60        199   44x
companies                       1.9         21         53        161   86x
fundMetrics F1                  3.6         17         57        189   53x
insights                        2.1         14         53        160   77x
anomalies                       4.7         25        105        266   56x
forecast (Portfolio)            1.8         12         53        147   80x
wcPotential                     0.6        7.9         26         60   108x
planVariance                    2.4         11         48         97   40x
adjustments                     1.1        3.3         24         40   35x
riskRegister                    8.4         47        182        513   61x
investments                     2.3         32         90        230   100x
vcSummary                       0.5        0.6        0.4        1.0   2x
hubMonitor                      0.3        0.6        1.8        4.8   16x
onboardingList                  0.2        0.5        0.8        6.7   37x
transformation                  2.7         24         69        321   121x
consolidate HOLD-1              1.6        1.0        1.0        1.5   1x
company PC01                    0.7        0.4        0.2        0.6   1x
advise (Frage)                  2.1         17         58        232   111x
Heap nach Aufbau (MB)             5         22         69        165

B) Engine-Last – Mandantengrößen S · M · L, je ein vollständiger Service-Ablauf (Ticket → Teile → Einsatz → Rechnung) für jede Teilwartungs-Anlage in der offenen Periode
  S: Engine aufbauen 27 ms, 732 Belege · 25 Abläufe in 150 ms (+50 Belege, 0 fachlich abgelehnt) · Feed 1.8 ms · PE-Welt mit Engine 11 ms
  M: Engine aufbauen 42 ms, 1562 Belege · 75 Abläufe in 929 ms (+150 Belege, 0 fachlich abgelehnt) · Feed 5.4 ms · PE-Welt mit Engine 22 ms
  L: Engine aufbauen 71 ms, 3416 Belege · 170 Abläufe in 4.920 ms (+340 Belege, 11 fachlich abgelehnt) · Feed 6.1 ms · PE-Welt mit Engine 16 ms
  Prüfungen je Größe: Reporting bis Okt 2026 unverändert, LTM-Umsatz = Engine-Buchungen, Bilanzidentität 36 Monate, Summenbilanz der Engine ausgeglichen

C) Zufallsfolgen – 3000 zufällige Befehle von zufälligen Rollen
  265 ms · ausgeführt 180 · fachlich abgelehnt 2820 · Abstürze 0

Keine Befunde
```

Hinweis zu A: Die Funktionen laufen nacheinander auf derselben Welt; ab der zweiten nutzen sie die bereits umgerechneten Monatswerte (warmer Zwischenspeicher, wie bei der Bedienung). Der Speicherbedarf steigt dadurch bei 2.500 Unternehmen auf rund 170 MB.

Hinweis zu C: Die meisten Zufallsbefehle sind absichtlich ungültig (falsche Rolle, unbekannte IDs, kaputte Eingaben). Geprüft wird, dass sie fachlich abgelehnt werden und nie abstürzen. Alle 250 Schritte prüft der Test: keine NaN-Kennzahlen, Mandantentrennung für jede Rolle, Bilanzidentität aller Unternehmen; bei jeder Aktivierung das Vier-Augen-Prinzip.

## Oberfläche (Chromium, `test/ui.stress.py 10 300`)

| PE-Seite | Demo (ms) | 255 Unternehmen (ms) |
|---|---|---|
| PE Command Center | 26,7 | 138,7 |
| Portfolio Companies | 11,9 | 75,1 |
| Financial Intelligence | 10,8 | 43,0 |
| Konsolidierung | 7,2 | 9,7 |
| Cash & Liquidity | 10,5 | 102,6 |
| Investment Performance | 17,7 | 126,5 |
| Value Creation | 6,9 | 31,3 |
| Risk Intelligence | 14,8 | 74,4 |
| AI Financial Advisor | 5,7 | 9,8 |
| ERP Integration Hub | 7,1 | 23,8 |
| Portfolio Onboarding | 5,9 | 6,0 |
| ERP Transformation | 10,6 | 46,5 |
| Administration | 6,7 | 17,5 |
| Unternehmensseite | 5,2 | 8,3 |

- Keine Seitenfehler; keine Seite breiter als 400 px.
- Dauerlast: 300 Geschäftsvorfälle über den Dispatcher (wie Klicks), 75 davon fachlich abgelehnt (z. B. bereits offener Störungsauftrag, Ware nicht verfügbar). Je Befehl Median 1,2 ms, 95 % ≤ 2,4 ms, höchstens 6,7 ms.
- Danach zeigt die Live-Karte der Elevon-Unternehmensseite alle 53 Belege der offenen Periode.

## Grenzen

- Kein Lasttest mit gleichzeitigen Nutzern: Die Auslieferung ist eine einzelne Seite ohne Server. Gleichzeitigkeit, Datenbank, Netz und Berechtigung auf dem Server sind Teil der Zielarchitektur und dort zu messen.
- Die Engine-Mandanten haben fachliche Grenzen (ein offener Störungsauftrag je Anlage, Bestand). Die Last in B ist deshalb auf die Anlagen begrenzt, nicht künstlich vervielfacht.
