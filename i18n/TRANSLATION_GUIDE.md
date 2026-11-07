# Übersetzungsauftrag STEGARC

STEGARC is an AI-native enterprise transformation platform (demo software): a business suite (ERP-like engine for demo companies Elevon, NovaMart, Aventra), an "Experience Layer" (one inbox/assistant over SAP S/4HANA, Microsoft 365, ServiceNow, Workday), a "PE Command Center" for private-equity investors (portfolio companies, consolidation, KPIs), IT infrastructure sizing, a product/marketing page and a sales dashboard. Audience: CIOs, CFOs, PE investors, SAP consultants. Tone: concise, professional B2B software UI.

## Input
A JSON list of `[german_text, source_file]`. The German text is a UI string, message, label, sentence or HTML-free text fragment.

## Output
JSON object `{ german_text: translation }` — keys copied **exactly** (byte-identical, including whitespace, punctuation, typographic quotes).

## Rules
1. Keep placeholders `{0}`, `{1}` … exactly; every placeholder of the key must appear in the translation (order may change if grammar needs it). Fragments ending/starting in the middle of a sentence (e.g. "Unternehmensübergreifend ·", "{0} von {1}") are pieces of a larger UI line – translate them as fragments, keep leading/trailing symbols like "·", "→", ":", "–".
2. Do NOT translate: product/brand names (STEGARC, Experience Layer, PE Command Center, Elevon, NovaMart, Aventra, NovaClub, SAP, S/4HANA, RISE with SAP, GROW with SAP, ECC, BTP, Ariba, SuccessFactors, Workday, ServiceNow, Microsoft 365, Gemini, Glean, Joule, etc.), company names (e.g. "Blechcenter Neckar GmbH", "AURELIUS"), person names, city names (keep German spelling e.g. "Nürnberg" may become "Nuremberg" in EN only if it is a city in running text — when in doubt keep), codes/IDs, units, file names, URLs, legal form (GmbH, AG).
3. If an entry is not human-readable text (code, CSS class, id, a pure name), return it unchanged.
4. Keep numbers and their format as in German (decimal comma etc.) — number formatting is handled elsewhere; do not convert currencies.
5. Keep length similar (UI space). Keep German abbreviations' meaning: "z. B." → "e.g.", "inkl." → "incl.", "Mio." → "m" (EN), "M" etc. as natural for the language. "Stk." = pcs.
6. Accounting/legal terms: use the standard term of the target country (IFRS terminology; "GuV" = P&L / income statement; "USt" = VAT / IVA / IVA / VAT→ PL "VAT"; "Kostenstelle" = cost centre; "Hauptbuch" = general ledger; "offene Posten" = open items; "Mandant" = tenant/client; "Freigabe" = approval; "freigeben" = approve; "Beleg" = document/posting; "Buchung" = posting; "Konzern" = group; "Beteiligung" = holding/investment; "Plattform-Holding" = platform holding; "Add-on" stays).
7. German UI uses "Sie"/imperatives; use the natural formal UI register: EN neutral imperative; ES usted/imperative infinitive style typical of Spanish software (es-ES, Spain); PT-PT (Portugal, NOT Brazil: "ficheiro", "utilizador", "ecrã", "registo", "equipa"); PL formal/neutral UI style (bezokolicznik for buttons, e.g. "Zapisz", "Zatwierdź").
8. Note: some texts are **demo/synthetic** content (fictional invoices, materials, tasks) — translate them naturally too.
9. Labels like „Beispielwerte, keine Herstellerpreise“ must keep their meaning precisely (sample values, not vendor prices). "KI" = AI.
10. Keep HTML entities (&amp; &nbsp; &lt;) and markdown-ish symbols as they are. Never introduce backticks (`) or unescaped line breaks.

## Glossary (keep consistent)
| DE | EN | ES | PT-PT | PL |
|---|---|---|---|---|
| Freigabe / freigeben | approval / approve | aprobación / aprobar | aprovação / aprovar | zatwierdzenie / zatwierdź |
| Aufgabe | task | tarea | tarefa | zadanie |
| Mandant | tenant | cliente (mandante) | entidade | podmiot |
| Unternehmen | company | empresa | empresa | spółka / firma |
| Beteiligung(sgesellschaft) | portfolio company | participada | participada | spółka portfelowa |
| Kennzahl | KPI | KPI / indicador | KPI / indicador | wskaźnik |
| Auftrag | order | pedido | encomenda | zlecenie / zamówienie |
| Angebot | quote | oferta | proposta | oferta |
| Rechnung | invoice | factura | fatura | faktura |
| Bestellung | purchase order | pedido de compra | encomenda de compra | zamówienie zakupu |
| Lieferant | supplier | proveedor | fornecedor | dostawca |
| Kunde | customer | cliente | cliente | klient |
| Lager / Bestand | warehouse / stock | almacén / stock | armazém / stock | magazyn / stan |
| Fertigung | production | fabricación | produção | produkcja |
| Konstruktion | engineering / design | ingeniería / diseño | engenharia / conceção | konstrukcja |
| Ablösung (ECC-Ablösung) | replacement (ECC replacement) | sustitución (sustitución de ECC) | substituição | zastąpienie (zastąpienie ECC) |
| Ansprechpartner | contact | contacto | contacto | osoba kontaktowa |
| Vertrieb | sales | ventas | vendas | sprzedaż |
| Bereitschaft (jetzt/vorbereiten/pflegen/beobachten) | readiness (now / prepare / nurture / watch) | disposición (ahora / preparar / cultivar / observar) | prontidão (agora / preparar / acompanhar / observar) | gotowość (teraz / przygotuj / pielęgnuj / obserwuj) |
| Assistent | assistant | asistente | assistente | asystent |
| Demo-Daten (synthetisch) | demo data (synthetic) | datos de demostración (sintéticos) | dados de demonstração (sintéticos) | dane demonstracyjne (syntetyczne) |
| Konsolidierung | consolidation | consolidación | consolidação | konsolidacja |
| Cutover | cutover | cutover | cutover | cutover |
| Lizenz | licence (EN-GB) | licencia | licença | licencja |
| Rolle | role | rol | função | rola |
| Mittelstand | mid-sized companies (Mittelstand) | medianas empresas | médias empresas | średnie przedsiębiorstwa |

English variant: British English (en-GB): organisation, licence, centre, programme (but "program" for software).
