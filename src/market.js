/* Marktposition „Wer liefert die eine Oberfläche für alle Anwendungen?“
   Eine Datenquelle für Karte, Matrix und Quellen. Pflege: siehe README „Marktposition pflegen“.
   Texte, Daten und Quellen aus docs/positionierung-referenz.html. Qualitative Einordnung, keine Messung. */
const MARKET = {
  asOf: "2026-11",
  asOfLabel: "November 2026",
  criteria: ["Herstellerneutral", "Aktionen & Masken im Dialog", "Systemübergreifend suchen", "Offene Protokolle (MCP, A2A)", "Läuft in Teams / Copilot", "SAP lizenzkonform", "Kosten pro Aufruf sichtbar"],
  lastColumn: "Reife laut Quellen",
  points: [
    { id: "nexnow", n: "NEXORA heute (eigene Engine)", x: .08, y: .82, c: "nex0", ga: 1, a: "start", dy: -18, internal: true },
    { id: "nexgoal", n: "NEXORA × truescale · Zielbild", x: .90, y: .82, c: "nex", ga: 0, a: "end", dy: -18 },
    { id: "sap", n: "SAP Joule Work", x: .16, y: .62, c: "suite", ga: 0, a: "start" },
    { id: "oracle", n: "Oracle Fusion Agents", x: .05, y: .50, c: "suite", ga: 1, a: "start" },
    { id: "ms", n: "Microsoft 365 Copilot", x: .44, y: .66, c: "ai", ga: 1, a: "start" },
    { id: "snow", n: "ServiceNow EmployeeWorks", x: .55, y: .58, c: "work", ga: 1, a: "start" },
    { id: "sf", n: "Slack + Agentforce", x: .36, y: .53, c: "suite", ga: 1, a: "start" },
    { id: "workday", n: "Workday Everywhere", x: .26, y: .40, c: "suite", ga: 1, a: "start" },
    { id: "google", n: "Gemini Enterprise", x: .68, y: .44, c: "ai", ga: 1, a: "start" },
    { id: "openai", n: "OpenAI Workspace Agents", x: .71, y: .34, c: "ai", ga: 0, a: "start" },
    { id: "glean", n: "Glean", x: .86, y: .26, c: "ai", ga: 1, a: "start" },
    { id: "sap", n: "SAP Build Work Zone", x: .14, y: .24, c: "suite", ga: 1, a: "start" },
    { id: "ms", n: "Viva Connections", x: .38, y: .20, c: "work", ga: 1, a: "start" },
    { id: "intranet", n: "Intranet-Suiten (Staffbase, Simpplr, LumApps)", x: .80, y: .15, c: "work", ga: 1, a: "end" },
    { id: "omnissa", n: "Omnissa Intelligent Hub", x: .92, y: .11, c: "work", ga: 1, a: "end" }
  ],
  rows: [
    ["sap", "SAP", "Build Work Zone · Joule / Joule Work", "", [[1, "bevorzugt SAP"], [2, "Joule handelt in SAP"], [2, "Work Zone ohne Suche in Fremdsystemen"], [2, "A2A ja, MCP nur intern oder per Gateway"], [2, "Joule in Teams angekündigt"], [3, "eigener Hersteller"], [1, "AI Units"]], "Work Zone verfügbar · Joule Work ohne GA-Datum"],
    ["ms", "Microsoft", "M365 Copilot · Agent 365 · Viva", "", [[2, "Microsoft-zentriert"], [3, "MCP Apps im Copilot"], [2, "Graph und Konnektoren"], [3, "MCP, MCP Apps"], [3, "nativ"], [2, "über Joule-Kopplung"], [2, "0,01 $ pro Nachricht, Abfrage = 30"]], "Copilot verfügbar · Agent 365 Early Access"],
    ["google", "Google", "Gemini Enterprise", "", [[2, "„Front Door“ für alle"], [0, ""], [2, "Konnektoren"], [3, "A2A"], [0, ""], [0, ""], [2, "21–30 $ pro Seat"]], "verfügbar seit Okt. 2025"],
    ["snow", "ServiceNow", "EmployeeWorks (Moveworks)", "", [[2, "„any business system“"], [3, "Workflows und Freigaben"], [3, "100+ Such-Konnektoren"], [3, "Action Fabric mit MCP"], [0, ""], [0, ""], [1, "Now-Assist-Zusatzlizenzen"]], "Mobile in Controlled Availability"],
    ["sf", "Salesforce", "Slack + Agentforce 360", "", [[1, "Salesforce-zentriert"], [2, "Aktionen in Slack"], [2, ""], [3, "Headless 360, 60+ MCP-Tools"], [1, "Slack statt Teams"], [0, ""], [0, ""]], "Agentforce bei ca. 12.000 von 150.000 Kunden"],
    ["workday", "Workday", "Workday Everywhere", "", [[1, "Workday-Daten"], [2, "Self-Service-Agent"], [1, ""], [2, "Agent System of Record"], [3, "Copilot, Teams, Slack, Gemini"], [0, ""], [2, "Flex Credits"]], "verfügbar per Tenant-Aktivierung"],
    ["glean", "Glean", "Work AI", "", [[3, ""], [0, ""], [3, "250+ Konnektoren"], [3, "MCP Gateway"], [0, ""], [0, ""], [0, ""]], "über 300 Mio. $ ARR (Mai 2026)"],
    ["intranet", "Intranet-Suiten", "Staffbase · Simpplr · LumApps/Beekeeper", "", [[3, ""], [1, "Aktionen nur über Konnektoren"], [2, ""], [0, ""], [0, ""], [1, ""], [0, ""]], "Gartner MQ 2025: 17 Anbieter"],
    ["nexnow", "NEXORA heute", "Demo v0.7 · eigene Business-Engine", "now", [[1, "nur eigene Engine"], [2, "Claude liest, Aktionen in Masken"], [1, "nur eigene Mandanten"], [2, "Engine-Werkzeuge mit Schema"], [1, "eigene Seite"], [0, "kein SAP-Zugriff"], [1, ""]], "klickbare Demo, 47 Akzeptanztests", { internal: true }],
    ["nexgoal", "NEXORA × truescale", "Zielbild nach dem Umbau", "goal", [[3, "Konnektoren für jedes System, Ablösung je Prozess"], [3, "Aktionskarten mit Freigabe"], [3, "eine Suche, eine Inbox"], [3, "MCP-Werkzeuge, A2A-Agenten"], [3, "Einbettungsmodus"], [3, "Integrationsweg je Zugriff"], [3, "Kostenzähler je Aufruf"]], "Umbau in neun Phasen, siehe Prompt",
      { publicName: "NEXORA × truescale · Roadmap", publicSub: "geplante Fähigkeiten", publicMaturity: "Roadmap, in Umsetzung", planned: true }]
  ],
  texts: {
    matIntro: { internal: "Bewertet nach den Befunden der Recherche. Wo die Quellen nichts Belastbares hergeben, steht ein Strich statt einer Vermutung. Die Zeile „NEXORA heute“ zeigt ehrlich den Stand der Demo v0.7, die Zeile darunter das Zielbild nach dem Umbau.", public: "Bewertet nach den Befunden der Recherche. Wo die Quellen nichts Belastbares hergeben, steht ein Strich statt einer Vermutung. Die Zeile „NEXORA × truescale · Roadmap“ zeigt geplante Fähigkeiten, nicht den heutigen Stand." },
    wsIntro: { internal: "Abgeleitet aus den Befunden, nicht selbst belegt. Jede Stelle ist im Umbau-Prompt als eigene Phase umgesetzt.", public: "Abgeleitet aus den Befunden, nicht selbst belegt. Diese vier Punkte bilden die Roadmap von NEXORA × truescale." },
    pathNote: { internal: "Balken illustrativ. Grundlage in der Suite: Migrations- und Cutover-Modul mit Testlauf, Vier-Augen-Freigabe und Abstimmung gibt es bereits in der Demo v0.7. Der Umbau-Prompt setzt diesen Weg als eigene Phase um.", public: "Balken illustrativ. Grundlage in der Suite: Migrations- und Cutover-Modul mit Testlauf, Vier-Augen-Freigabe und Abstimmung gibt es bereits in der Demo v0.7. Die Ablösung erfolgt Prozess für Prozess mit Parallelbetrieb und Abstimmung." },
    arrow: "Umbau: die eigene Engine wird ein Konnektor unter vielen"
  },
  sources: [
    { label: "SAPinsider: Joule als Front Door (Sapphire 2026)", url: "https://sapinsider.org/articles/joule-is-now-the-front-door-to-your-business-what-sap-sapphire-2026-means-for-customers-vendors-and-partners/" },
    { label: "ERP Today: Joule Work ohne GA-Datum", url: "https://erp.today/at-sap-connect-sap-expands-joule-across-every-line-of-business/" },
    { label: "Vantaio: SAP Build Work Zone Standard vs. Advanced", url: "https://www.vantaio.com/en/sap-build-work-zone-comparison" },
    { label: "Techzine (Meinungsbeitrag): SAP API Policy, DSAG-Zahlen, Salesforce Headless 360, ServiceNow Action Fabric", url: "https://www.techzine.eu/blogs/applications/141323/sap-blocks-external-ai-agents-salesforce-and-servicenow-dont/" },
    { label: "Microsoft: Ignite 2025, Agent 365", url: "https://news.microsoft.com/en-hk/2025/11/19/microsoft-ignite-2025-empowering-the-frontier-firm-with-ai-agents-and-copilot/" },
    { label: "The Decoder: Abrechnung pro Nachricht", url: "https://the-decoder.com/microsoft-introduces-pay-per-message-pricing-for-ai-agents-and-a-free-copilot-chat-tier/" },
    { label: "Techzine: Gemini Enterprise als Front Door", url: "https://www.techzine.eu/news/applications/135293/google-launches-gemini-enterprise-the-front-door-for-workplace-ai" },
    { label: "Business Wire: ServiceNow übernimmt Moveworks", url: "https://www.businesswire.com/news/home/20251215128980/en/ServiceNow-completes-acquisition-of-Moveworks" },
    { label: "ServiceNow Community: EmployeeWorks", url: "https://www.servicenow.com/community/employee-center-blog/servicenow-employeeworks-introducing-employee-slate/ba-p/3537890" },
    { label: "Workday: Workday Everywhere", url: "https://www.workday.com/en-ca/products/platform-product-extensions/workday-everywhere.html" },
    { label: "Glean: über $300 Mio. ARR, MCP Gateway", url: "https://www.glean.com/fr/press/glean-surpasses-300m-arr-unrivaled-enterprise-context-fuels-ai-adoption" },
    { label: "NYU Shanghai RITS: MCP Apps im Standard", url: "https://rits.shanghai.nyu.edu/ai/mcp-apps-interactive-uis-become-an-official-part-of-mcp" },
    { label: "Staffbase: Gartner Magic Quadrant Intranet 2025", url: "https://staffbase.com/blog/gartner-magic-quadrant-intranet" },
    { label: "Gartner: 40 % der Unternehmensanwendungen mit Agenten bis 2026", url: "https://gartner.com/en/newsroom/press-releases/2025-08-26-gartner-predicts-40-percent-of-enterprise-apps-will-feature-task-specific-ai-agents-by-2026-up-from-less-than-5-percent-in-2025" },
    { label: "The Star: Gartner zu Abbrüchen agentischer Projekte", url: "https://www.thestar.com.my/tech/tech-news/2025/06/25/over-40-of-agentic-ai-projects-will-be-scrapped-by-2027-gartner-says" },
    { label: "Citrix: Microapps eingestellt", url: "https://support.citrix.com/external/article/CTX459698/notice-of-change-announcement-eol-microa.html" }
  ]
};

/* Zeichnet Karte, Matrix, variable Texte und Quellen. internal=false: öffentliche Fassung. */
function renderMarket(internal) {
  const $ = id => document.getElementById(id);
  const pts = MARKET.points.filter(p => internal || !p.internal);
  const rows = MARKET.rows.filter(r => internal || !(r[6] && r[6].internal));
  /* Karte */
  const svg = $("mkChart"); const NS = "http://www.w3.org/2000/svg";
  while (svg.lastChild && svg.lastChild.tagName !== "desc") svg.removeChild(svg.lastChild);
  const el = (t, a, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
  const COL = { suite: "var(--cat-suite)", work: "var(--cat-work)", ai: "var(--cat-ai)", nex: "var(--accent)", nex0: "var(--accent-2)" };
  const L = 90, R = 960, T = 60, B = 560, X = v => L + v * (R - L), Y = v => B - v * (B - T), mx = X(.5), my = Y(.5);
  svg.appendChild(el("rect", { x: mx, y: T, width: R - mx, height: my - T, rx: 14, fill: "var(--accent-soft)" }));
  svg.appendChild(el("rect", { x: L, y: T, width: R - L, height: B - T, fill: "none", stroke: "var(--line-strong)", "stroke-width": 1.2, rx: 14 }));
  svg.appendChild(el("line", { x1: mx, y1: T, x2: mx, y2: B, stroke: "var(--line-strong)", "stroke-dasharray": "4 6" }));
  svg.appendChild(el("line", { x1: L, y1: my, x2: R, y2: my, stroke: "var(--line-strong)", "stroke-dasharray": "4 6" }));
  const q = (x, y, a, t, c) => svg.appendChild(el("text", { x, y, "text-anchor": a, "font-size": 12.5, "font-weight": 700, "letter-spacing": "1.5", fill: c || "var(--fg-3)", "font-family": "JetBrains Mono, monospace" }, t));
  q(L + 14, T + 24, "start", "SUITE-ASSISTENTEN"); q(R - 14, T + 24, "end", "WEISSRAUM · NEUTRAL UND TIEF", "var(--accent)"); q(L + 14, B - 14, "start", "SUITE-PORTALE"); q(R - 14, B - 14, "end", "NEUTRALER EINSTIEG");
  svg.appendChild(el("text", { x: L, y: B + 30, "font-size": 14, fill: "var(--fg-2)" }, "an eine Suite gebunden"));
  svg.appendChild(el("text", { x: R, y: B + 30, "text-anchor": "end", "font-size": 14, fill: "var(--fg-2)" }, "herstellerneutral"));
  svg.appendChild(el("text", { x: (L + R) / 2, y: B + 30, "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: "var(--fg)" }, "Neutralität →"));
  svg.appendChild(el("text", { x: 0, y: 0, "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: "var(--fg)", transform: `translate(48 ${(T + B) / 2}) rotate(-90)` }, "Tiefe der Vereinheitlichung →"));
  svg.appendChild(el("text", { x: 0, y: 0, "text-anchor": "start", "font-size": 12.5, fill: "var(--fg-3)", transform: `translate(70 ${B}) rotate(-90)` }, "gemeinsamer Einstieg"));
  svg.appendChild(el("text", { x: 0, y: 0, "text-anchor": "end", "font-size": 12.5, fill: "var(--fg-3)", transform: `translate(70 ${T}) rotate(-90)` }, "einheitliche Arbeit"));
  if (internal) {
    const n0 = MARKET.points.find(p => p.id === "nexnow"), n1 = MARKET.points.find(p => p.id === "nexgoal");
    const defs = el("defs", {}); const mk = el("marker", { id: "mkArr", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" });
    mk.appendChild(el("path", { d: "M0 0 L10 5 L0 10 z", fill: "var(--accent)" })); defs.appendChild(mk); svg.appendChild(defs);
    const g = el("g", { id: "mkArrow" }); g.appendChild(el("line", { x1: X(n0.x) + 16, y1: Y(n0.y), x2: X(n1.x) - 22, y2: Y(n1.y), stroke: "var(--accent)", "stroke-width": 2.2, "stroke-dasharray": "7 6", "marker-end": "url(#mkArr)" }));
    g.appendChild(el("text", { x: (X(n0.x) + X(n1.x)) / 2, y: Y(n0.y) + 24, "text-anchor": "middle", "font-size": 13.5, "font-weight": 600, fill: "var(--accent)" }, MARKET.texts.arrow)); svg.appendChild(g);
  }
  for (const p of pts) {
    const g = el("g", { class: "pt", tabindex: 0, role: "button", "data-id": p.id, "aria-label": p.n + (p.ga ? "" : " (angekündigt, Preview oder Zielbild)") });
    const r = p.c === "nex" ? 13 : (p.c === "nex0" ? 10 : 8.5);
    if (p.c === "nex") g.appendChild(el("circle", { cx: X(p.x), cy: Y(p.y), r: 24, fill: "var(--accent)", opacity: .14 }));
    g.appendChild(el("circle", { class: "ring", cx: X(p.x), cy: Y(p.y), r, fill: p.ga ? COL[p.c] : "var(--surface)", stroke: COL[p.c], "stroke-width": p.ga ? 0 : 3 }));
    const big = p.c === "nex" || p.c === "nex0";
    g.appendChild(el("text", { x: X(p.x) + (p.dy ? 0 : (p.a === "end" ? -15 : 15)), y: Y(p.y) + (p.dy || 5), "text-anchor": p.a, "font-size": big ? 16 : 14.5, "font-weight": big ? 800 : 600, fill: big ? "var(--accent)" : "var(--fg)" }, p.n));
    g.addEventListener("click", () => mkHighlight(p.id)); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); mkHighlight(p.id); } });
    svg.appendChild(g);
  }
  /* Matrix */
  const LBL = { 3: "stark", 2: "teilweise", 1: "schwach oder nicht", 0: "keine belastbare Angabe", p: "geplant (Roadmap)" };
  const cell = (v, t, planned) => `<td><div class="r ${planned ? "rp" : "r" + v}"><span class="sym" role="img" aria-label="${planned ? LBL.p : LBL[v]}"></span>${t ? `<em>${t}</em>` : ""}</div></td>`;
  $("mkMatHead").innerHTML = `<tr><th scope="col">Angebot</th>${MARKET.criteria.map(c => `<th scope="col">${c.replace("neutral", "&shy;neutral").replace("übergreifend", "&shy;übergreifend").replace("lizenzkonform", "lizenz&shy;konform")}</th>`).join("")}<th scope="col">${MARKET.lastColumn}</th></tr>`;
  $("mkMatBody").innerHTML = rows.map(([id, n, s, cls, v, m, opt]) => { opt = opt || {}; const planned = !internal && opt.planned; const name = !internal && opt.publicName ? opt.publicName : n; const sub = !internal && opt.publicSub ? opt.publicSub : s; const mat = !internal && opt.publicMaturity ? opt.publicMaturity : m;
    return `<tr data-id="${id}" class="${cls}"><th scope="row">${name}<small>${sub}</small></th>${v.map(x => cell(x[0], x[1], planned)).join("")}<td><em class="mat">${mat}</em></td></tr>`; }).join("");
  $("mkLegendPlanned").hidden = !!internal;
  /* Variable Texte */
  const T2 = MARKET.texts; $("mkMatIntro").textContent = internal ? T2.matIntro.internal : T2.matIntro.public; $("mkWsIntro").textContent = internal ? T2.wsIntro.internal : T2.wsIntro.public; $("mkPathNote").textContent = internal ? T2.pathNote.internal : T2.pathNote.public;
  $("mkAsOf").textContent = "Wettbewerbsposition · Stand " + MARKET.asOfLabel;
  $("mkInternalBadge").hidden = !internal;
  /* Quellen */
  $("mkSources").innerHTML = MARKET.sources.map(s => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.label}</a></li>`).join("");
}
function mkHighlight(id) {
  document.querySelectorAll("#mkMatBody tr").forEach(r => r.classList.toggle("hl", r.dataset.id === id));
  const row = document.querySelector(`#mkMatBody tr[data-id="${id}"]`);
  if (row) row.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
}
