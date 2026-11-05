/* Stresstest des PE-Rechenkerns und der Engine-Anbindung. Ausführen: node --expose-gc test/pe.stress.js [maxFaktor] [fuzzSchritte]
   A) Skalierung: alle Lesefunktionen bei 25 · 250 · 1.000 · 2.500 Unternehmen (Zeit, Speicher, Plausibilität)
   B) Engine-Last: viele Buchungen in der Engine, danach Feed + PE-Welt neu aufbauen, Abgleich mit den Engine-Salden
   C) Zufallsfolgen (Fuzz): zufällige Befehle von zufälligen Rollen – nur fachliche Fehler, Invarianten bleiben erhalten
   Gemessen wird der Rechenkern in einem Node-Prozess dieser Maschine – kein Server, keine Datenbank. */
const PE = require("../src/pe.js"); const EN = require("../src/engine.js");
const MAXF = +(process.argv[2] || 100), STEPS = +(process.argv[3] || 3000);
const ms = t => Number(process.hrtime.bigint() - t) / 1e6; const now = () => process.hrtime.bigint(); const mb = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const fmt = x => x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString("de-DE"); let failures = 0; const bad = (msg) => { failures++; console.log("  ✗ " + msg); };
const finite = (o, path) => { for (const [k, v] of Object.entries(o || {})) { if (typeof v === "number" && Number.isNaN(v)) return path + "." + k; } return null; };

/* ---------- A) Skalierung ---------- */
console.log("A) Skalierung – Laufzeit je Funktion in ms (Prinzipal: PE Group Administrator, alle Fonds)\n");
const FNS = [
  ["portfolioKpis", (W, p) => PE.portfolioKpis(W, p, {})], ["companies", (W, p) => PE.companies(W, p, {})], ["fundMetrics F1", (W, p) => PE.fundMetrics(W, p, "F1")],
  ["insights", (W, p) => PE.insights(W, p, {})], ["anomalies", (W, p) => PE.anomalies(W, p, {})], ["forecast (Portfolio)", (W, p) => PE.forecast(W, p, {})],
  ["wcPotential", (W, p) => PE.wcPotential(W, p, {})], ["planVariance", (W, p) => PE.planVariance(W, p, {})], ["adjustments", (W, p) => PE.adjustments(W, p, {})],
  ["riskRegister", (W, p) => PE.riskRegister(W, p, {})], ["investments", (W, p) => PE.investments(W, p, {})], ["vcSummary", (W, p) => PE.vcSummary(W, p, {})],
  ["hubMonitor", (W, p) => PE.hubMonitor(W, p, {})], ["onboardingList", (W, p) => PE.onboardingList(W, p, {})], ["transformation", (W, p) => PE.transformation(W, p, {})],
  ["consolidate HOLD-1", (W, p) => PE.consolidate(W, p, "HOLD-1")], ["company PC01", (W, p) => PE.company(W, p, "PC01")], ["advise (Frage)", (W, p) => PE.advise(W, p, "Welche Unternehmen haben ein Liquiditätsrisiko?")]
];
const factors = [1, 10, 40, 100].filter(f => f <= MAXF); const table = {}; const meta = [];
for (const f of factors) {
  if (global.gc) global.gc(); const m0 = mb(); let t = now(); const W = PE.createWorld({ multiplier: f }); const tCreate = ms(t); const p = PE.principal(W, "p1");
  const n = W.companies.filter(c => c.orgId === "ngep").length; meta.push({ f, n, create: tCreate, heap: mb() - m0 });
  for (const [name, fn] of FNS) { t = now(); let r; try { r = fn(W, p); } catch (e) { bad(`${name} bei ${n} Unternehmen: ${e.code || ""} ${e.message}`); continue; } (table[name] = table[name] || {})[n] = ms(t);
    if (name === "portfolioKpis") { const nan = finite(r, "portfolioKpis"); if (nan) bad(`NaN in ${nan} bei ${n}`); if (r.companies !== n - f) bad(`portfolioKpis: ${r.companies} statt ${n - f} aktive Unternehmen`); }
    if (name === "transformation" && r.rows.length !== n) bad(`transformation: ${r.rows.length} statt ${n} Zeilen`); }
  // Mandantentrennung unter Last
  const p10 = PE.principal(W, "p10"); if (PE.companies(W, p10, {}).some(c => !String(c.id).endsWith("-rtc"))) bad("Mandantentrennung verletzt bei " + n);
}
const ns = meta.map(m => m.n); console.log("Funktion".padEnd(24) + ns.map(n => (n + " U.").padStart(11)).join("") + "   Faktor 25→" + ns[ns.length - 1]);
console.log("Welt erzeugen".padEnd(24) + meta.map(m => fmt(m.create).padStart(11)).join("") + "   " + (meta[meta.length - 1].create / meta[0].create).toFixed(0) + "x");
for (const [name] of FNS) { const row = table[name] || {}; const a = row[ns[0]], z = row[ns[ns.length - 1]]; console.log(name.padEnd(24) + ns.map(n => (row[n] == null ? "–" : fmt(row[n])).padStart(11)).join("") + "   " + (a && z ? (z / Math.max(a, 0.1)).toFixed(0) + "x" : "")); }
console.log("Heap nach Aufbau (MB)".padEnd(24) + meta.map(m => String(m.heap).padStart(11)).join(""));

/* ---------- B) Engine-Last ---------- */
console.log(`\nB) Engine-Last – Mandantengrößen S · M · L, je ein vollständiger Service-Ablauf (Ticket → Teile → Einsatz → Rechnung) für jede Teilwartungs-Anlage in der offenen Periode`);
for (const size of ["S", "M", "L"]) { let t = now(); const ew = EN.createWorld({ size }); const tE = ms(t); const go = (tid, cmd, x) => { const r = EN.dispatch(ew, tid, cmd, x, { auto: true }); if (!r.ok) throw new Error(`${cmd}: ${r.text}`); return r; };
  const ten = () => EN.TENANT_IDS.map(id => ew.tenants[id]); const feed0 = JSON.stringify(PE.engineFeed(ten()).map(x => x.months)); const d0 = ten().reduce((a, x) => a + x.docs.length, 0);
  const T = ew.tenants.elevon; const assets = T.master.assets.filter(a => a.contract !== "Vollwartung").map(a => a.id); const mats = Object.keys(T.stock).filter(k => k.endsWith("@WH5")).map(k => k.split("@")[0]);
  t = now(); let flows = 0, rej = 0; for (let i = 0; i < assets.length; i++) { try { const sv = go("elevon", "createServiceTicket", { assetId: assets[i], text: "Last " + i }).objects[0]; go("elevon", "scheduleTechnician", { svNo: sv }); go("elevon", "reserveParts", { svNo: sv, mat: mats[i % mats.length], qty: 1 }); go("elevon", "executeService", { svNo: sv, hours: 1 + (i % 4) }); go("elevon", "invoiceService", { svNo: sv }); flows++; } catch (e) { rej++; } }
  const tFlows = ms(t); const d1 = ten().reduce((a, x) => a + x.docs.length, 0);
  t = now(); const feed = PE.engineFeed(ten()); const tFeed = ms(t); t = now(); const WE = PE.createWorld({ engine: feed }); const tW = ms(t);
  console.log(`  ${size}: Engine aufbauen ${fmt(tE)} ms, ${d0} Belege · ${flows} Abläufe in ${fmt(tFlows)} ms (+${d1 - d0} Belege, ${rej} fachlich abgelehnt) · Feed ${fmt(tFeed)} ms · PE-Welt mit Engine ${fmt(tW)} ms`);
  if (JSON.stringify(feed.map(x => x.months)) !== feed0) bad(size + ": Buchungen der offenen Periode haben das abgeschlossene Reporting verändert");
  const I = PE._internal; for (const c of WE.companies.filter(x => x.engine)) { if (I.checkConsistency(WE, c).length) bad(`${size}: Bilanzidentität ${c.id}`);
    const engRev = WE.periods.filter(x => x >= "2025-11").reduce((a, per) => a + EN.plOf(ew.tenants[c.engine.tenant], per).revenue, 0); const k = I.companyKpis(WE, c, "LTM"); if (Math.abs(k.revenue - engRev) > 1) bad(`${size}: ${c.id} LTM-Umsatz ${k.revenue} ≠ Engine ${engRev}`); }
  for (const x of ten()) { const s = Object.values(EN.trialBalance(x)).reduce((a, v) => a + v, 0); if (Math.abs(s) > 0.05) bad(`${size}: Summenbilanz ${x.id} nicht ausgeglichen`); } }
console.log("  Prüfungen je Größe: Reporting bis Okt 2026 unverändert, LTM-Umsatz = Engine-Buchungen, Bilanzidentität 36 Monate, Summenbilanz der Engine ausgeglichen");

/* ---------- C) Zufallsfolgen ---------- */
console.log(`\nC) Zufallsfolgen – ${STEPS} zufällige Befehle von zufälligen Rollen`);
{ const ew = EN.createWorld(); const W = PE.createWorld({ engine: PE.engineFeed(EN.TENANT_IDS.map(id => ew.tenants[id])) }); let seed = 4242; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const pick = a => a[Math.floor(rnd() * a.length)];
  const KNOWN = new Set(["FORBIDDEN", "INPUT", "NOT_FOUND", "EXISTS", "NOT_READY", "FOUR_EYES", "DATA_GAP", "STATE", "ORDER", "CMD"]); const stats = Object.create(null); const crashes = Object.create(null);
  const ids = () => W.companies.map(c => c.id).concat(["XX-unbekannt"]); const accounts = ["4730", "6640", "6805", "4000", "9999"]; const cats = ["REV", "COGS", "OPEX_OTHER", "CASH", "CAPEX", "FOO"];
  const CMDS = [
    () => ["createOrg", { name: pick(["Alpha Capital", "x", "Beta Partners " + Math.floor(rnd() * 99)]) }], () => ["addFund", { name: "Fonds " + Math.floor(rnd() * 999), size: pick([0, 1e8, -5, "abc"]) }],
    () => ["addCompany", { name: pick(["Neue GmbH " + Math.floor(rnd() * 9999), "ab", "<script>alert(1)</script> GmbH"]), fundId: pick(W.funds.map(f => f.id).concat(["F9"])), erp: pick(["SAP ECC", "NEXORA AI Suite", "Unbekannt"]), ownership: pick([0.5, 2, -1, "x"]) }],
    () => [pick(["approveAdjustment", "rejectAdjustment"]), { companyId: pick(ids()) }], () => ["syncRun", { companyId: pick(ids()), mode: pick(["voll", "inkrementell", "kaputt"]) }],
    () => ["mapAccount", { companyId: pick(ids()), account: pick(accounts), category: pick(cats) }], () => ["renewCredential", { companyId: pick(ids()) }], () => ["icResolve", { groupId: pick(["HOLD-1", "HOLD-9"]) }],
    () => ["vcAdd", { companyId: pick(ids()), category: pick(["kosten", "wc", "umsatz", "x"]), name: "Initiative", ebitdaImpact: pick([1e6, -1, "x"]) }], () => ["vcUpdate", { id: pick(W.vc.items.map(i => i.id).concat(["VC-999"])), companyId: pick(ids()), status: pick(["laufend", "abgeschlossen", "erfunden"]), actualEbitda: pick([5e5, null, "x"]) }],
    () => ["onbConfirmDsa", { companyId: pick(ids()), level: pick(["kpi", "statements", "transactions", "alles"]) }], () => ["onbRequest", { companyId: pick(ids()) }], () => ["onbActivate", { companyId: pick(ids()) }],
    () => [pick(["unbekannterBefehl", "__proto__", "constructor"]), {}]
  ];
  let t = now();
  for (let i = 0; i < STEPS; i++) { const p = pick(W.principals); const [cmd, x] = pick(CMDS)(); const key = cmd;
    const rq0 = cmd === "onbActivate" ? Object.assign({}, W.onb.req[x.companyId] || {}) : null;
    try { PE.apply(W, p, cmd, x); if (rq0 && (!rq0.by || rq0.by === p.id)) bad("Aktivierung ohne Vier-Augen: " + x.companyId); (stats[key] = stats[key] || { ok: 0, rej: 0 }).ok++; } catch (e) { if (e.code && KNOWN.has(e.code)) (stats[key] = stats[key] || { ok: 0, rej: 0 }).rej++; else { const k = cmd + ": " + (e.code || e.constructor.name) + " " + e.message; crashes[k] = (crashes[k] || 0) + 1; } }
    if (i % 250 === 249) { // Invarianten
      for (const q of W.principals) { let r; try { r = PE.portfolioKpis(W, q, {}); } catch (e) { if (!KNOWN.has(e.code)) { const k = "portfolioKpis(" + q.role + "): " + e.message; crashes[k] = (crashes[k] || 0) + 1; } continue; }
        const nan = finite(r, "portfolioKpis"); if (nan) bad(`NaN nach Schritt ${i + 1} für ${q.id}: ${nan}`);
        try { const cs = PE.companies(W, q, {}); if (q.orgId && cs.some(c => (W.companies.find(z => z.id === c.id) || {}).orgId !== q.orgId)) bad(`Mandantentrennung verletzt nach Schritt ${i + 1} für ${q.id}`); } catch (e) { if (!KNOWN.has(e.code)) bad("companies: " + e.message); } }
      for (const c of W.companies.filter(c => !c.noData)) { const e = PE._internal.checkConsistency(W, c); if (e.length) bad(`Bilanzidentität ${c.id} nach Schritt ${i + 1}`); }
    } }
  const tF = ms(t); const ok = Object.values(stats).reduce((a, s) => a + s.ok, 0), rej = Object.values(stats).reduce((a, s) => a + s.rej, 0);
  console.log(`  ${fmt(tF)} ms · ausgeführt ${ok} · fachlich abgelehnt ${rej} · Abstürze ${Object.values(crashes).reduce((a, b) => a + b, 0)}`);
  for (const [k, n] of Object.entries(crashes)) bad(`Absturz (${n}×) ${k}`);
  // Ausgabe sicher? Namen mit Markup werden als Daten gespeichert, nicht ausgewertet – die Oberfläche escaped (esc)
}
console.log(failures ? `\n${failures} Befund(e)` : "\nKeine Befunde"); if (failures) process.exit(1);
