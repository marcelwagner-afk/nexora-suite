/* NEXORA Business Engine v0.3 – reine Geschäftslogik, kein DOM.
   Läuft im Browser (window.NexoraEngine) und in Node (require) für automatisierte Tests.
   Grundsätze: doppelte Buchführung, Buchung nur aus Geschäftsvorfällen, Perioden, Idempotenz,
   reproduzierbarer Seed je Mandant, unternehmensübergreifende Vorgänge nur über Nachrichten. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.NexoraEngine = factory(); })(this, function () {
"use strict";
const VERSION = "0.4.0";
const START_DATE = "2026-11-02";
const HIST = ["2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10"];
const VAT = 0.19;
const TENANT_IDS = ["elevon", "novamart", "aventra"];

/* ---------- Hilfen ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const pad = (n, l) => String(n).padStart(l, "0");
const periodOf = d => d.slice(0, 7);
function addDays(d, n) { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function nextPeriod(p) { let [y, m] = p.split("-").map(Number); m++; if (m > 12) { m = 1; y++; } return y + "-" + pad(m, 2); }
class BizError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (code, msg) => { throw new BizError(code, msg); };
const clone = o => JSON.parse(JSON.stringify(o));
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function between(rng, a, b) { return a + rng() * (b - a); }
function int(rng, a, b) { return Math.floor(between(rng, a, b + 1)); }

/* ---------- Kontenplan (vereinfacht, an HGB-Gliederung angelehnt) ---------- */
const COA = {
  "0700": ["Technische Anlagen und Maschinen", "A"], "1100": ["Bank", "A"], "1200": ["Forderungen aus Lieferungen und Leistungen", "A"],
  "1300": ["Roh-, Hilfs- und Betriebsstoffe", "A"], "1310": ["Handelswaren", "A"], "1320": ["Unfertige Erzeugnisse", "A"], "1330": ["Fertige Erzeugnisse", "A"],
  "1500": ["Abziehbare Vorsteuer", "A"], "1590": ["Forderungen Zahlungsdienstleister", "A"],
  "1600": ["Verbindlichkeiten aus Lieferungen und Leistungen", "L"], "1700": ["Wareneingangs-/Rechnungseingangs-Verrechnung", "L"], "1776": ["Umsatzsteuer 19 %", "L"],
  "2000": ["Eigenkapital", "Q"], "4000": ["Umsatzerlöse Waren und Anlagen", "R"], "4400": ["Umsatzerlöse Dienstleistungen", "R"],
  "5000": ["Materialaufwand / Wareneinsatz", "X"], "6000": ["Personalaufwand", "X"], "6300": ["Sonstige betriebliche Aufwendungen", "X"],
  "6650": ["Reisekosten", "X"], "6800": ["Fremdleistungen", "X"], "6855": ["Gebühren Zahlungsverkehr", "X"], "6990": ["Verrechnete Fertigungsleistung", "X"]
};

/* ---------- Namensbausteine (alle fiktiv) ---------- */
const FIRST = ["Anna","Lukas","Mia","Jonas","Lea","Felix","Sophie","Paul","Laura","Elias","Marie","Noah","Emma","Leon","Hannah","Ben","Clara","Finn","Lena","Tim","Sara","Jan","Nora","David","Julia","Moritz","Ida","Simon","Eva","Tobias"];
const LAST = ["Becker","Wolf","Krüger","Hahn","Lang","Vogel","Seidel","Brandt","Kuhn","Graf","Roth","Busch","Frank","Berger","Arnold","Lorenz","Horn","Sauer","Pohl","Haas","Kraft","Winter","Ernst","Keller","Jäger","Otto","Böhm","Lindner","Thiel","Engel"];
const CITY = ["Stuttgart","Köln","Hamburg","München","Leipzig","Frankfurt","Düsseldorf","Bremen","Dresden","Hannover","Nürnberg","Mannheim","Bonn","Freiburg","Karlsruhe"];
const ORG1 = ["Rhein","Isar","Elb","Main","Neckar","Nord","Süd","Alpen","Hansa","Spree","Weser","Donau","Bergland","Lahn","Mosel"];
const ORG2 = ["park","werk","quartier","haus","tor","bogen","hof","forum","plaza","campus"];
const ORG3 = ["Immobilien GmbH","Projektentwicklung GmbH","Bau AG","Real Estate GmbH","Wohnbau GmbH","Gewerbebau GmbH"];
const person = rng => pick(rng, FIRST) + " " + pick(rng, LAST);

/* ---------- Konten- und Belegfunktionen ---------- */
function nextNo(t, prefix, period) { const k = prefix + (period || ""); t.seq[k] = (t.seq[k] || 0) + 1; return prefix + "-" + (period ? period.replace("-", "") + "-" : "") + pad(t.seq[k], 4); }
function post(t, { date, text, ref, lines, user }) {
  const per = periodOf(date);
  if (t.periods[per] !== "open") fail("PERIOD_CLOSED", `Periode ${per} ist nicht offen.`);
  let dr = 0, cr = 0;
  for (const l of lines) {
    if (!COA[l.acct]) fail("ACCOUNT", `Konto ${l.acct} existiert nicht.`);
    l.dr = r2(l.dr || 0); l.cr = r2(l.cr || 0);
    if (l.dr < 0 || l.cr < 0) fail("NEGATIVE", "Negative Beträge sind nicht zulässig.");
    dr += l.dr; cr += l.cr;
  }
  if (Math.abs(r2(dr) - r2(cr)) > 0.001) fail("UNBALANCED", `Beleg nicht ausgeglichen: Soll ${r2(dr)} / Haben ${r2(cr)}.`);
  if (r2(dr) === 0) fail("EMPTY", "Beleg ohne Betrag.");
  const doc = { no: nextNo(t, "FI", per), date, period: per, text, ref: ref || null, user: user || "System", lines: lines.filter(l => l.dr || l.cr) };
  t.docs.push(doc);
  return doc;
}
function postHist(t, o) { const p = periodOf(o.date); const s = t.periods[p]; t.periods[p] = "open"; try { return post(t, o); } finally { t.periods[p] = s; } }
function balance(t, acct, filter) { let b = 0; for (const d of t.docs) { if (filter && !filter(d)) continue; for (const l of d.lines) if (l.acct === acct) b += l.dr - l.cr; } return r2(b); }
function trialBalance(t) { const tb = {}; for (const d of t.docs) for (const l of d.lines) { tb[l.acct] = r2((tb[l.acct] || 0) + l.dr - l.cr); } return tb; }
function plOf(t, per) {
  const f = d => d.period === per; const sum = a => -balance(t, a, f);
  const rev = r2(sum("4000") + sum("4400")), cogs = r2(-sum("5000")), pers = r2(-sum("6000") - sum("6990")), other = r2(-sum("6300") - sum("6650") - sum("6800") - sum("6855"));
  return { period: per, revenue: rev, cogs, grossMargin: r2(rev - cogs), personnel: pers, other, ebit: r2(rev - cogs - pers - other) };
}

/* ---------- Bestand ---------- */
function stockKey(mat, wh) { return mat + "@" + wh; }
function stk(t, mat, wh) { const k = stockKey(mat, wh); if (!t.stock[k]) t.stock[k] = { mat, wh, qty: 0, res: 0, value: 0 }; return t.stock[k]; }
function avgCost(s) { return s.qty > 0 ? s.value / s.qty : 0; }
function moveIn(t, mat, wh, qty, value) { const s = stk(t, mat, wh); s.qty = Math.round((s.qty + qty) * 1000) / 1000; s.value = r2(s.value + value); t.moves.push({ date: t.date, mat, wh, qty, value: r2(value), type: "Zugang" }); }
function moveOut(t, mat, wh, qty, fromReserved) {
  const s = stk(t, mat, wh);
  if (s.qty + 1e-9 < qty) fail("STOCK", `Bestand ${mat} reicht nicht: ${s.qty} vorhanden, ${qty} benötigt.`);
  const v = r2(avgCost(s) * qty); s.qty = Math.round((s.qty - qty) * 1000) / 1000; s.value = r2(s.value - v); if (fromReserved) s.res = Math.max(0, s.res - qty);
  if (s.qty === 0) s.value = 0;
  t.moves.push({ date: t.date, mat, wh, qty: -qty, value: -v, type: "Abgang" }); return v;
}
const avail = (t, mat, wh) => { const s = t.stock[stockKey(mat, wh)]; return s ? s.qty - s.res : 0; };

/* ---------- Nachrichten zwischen Mandanten ---------- */
function send(w, from, to, msg) { const t = w.tenants[to]; if (!t) return; t.inbox.push(Object.assign({ id: nextNo(t, "IN"), from, date: w.tenants[from].date, status: "offen" }, msg)); }

/* ---------- Gemeinsame, deterministische Querbeziehungen ----------
   Beide beteiligten Mandanten berechnen dieselben Zahlen aus demselben Seed,
   damit ein Reset eines Mandanten dessen Sicht reproduzierbar wiederherstellt. */
function crossHistory(seed) {
  const rng = mulberry32(seed ^ hashStr("cross"));
  const p1001 = HIST.map((p, i) => { const on = i >= 5; const hours = on ? Math.round(between(rng, 420, 640)) : 0; return { period: p, hours, net: r2(hours * 158) }; });
  const p1002 = HIST.map((p, i) => { const on = i >= 7; const hours = on ? Math.round(between(rng, 160, 260)) : 0; return { period: p, hours, net: r2(hours * 149) }; });
  const service = HIST.map(p => ({ period: p, net: 3600 }));
  return { p1001, p1002, service };
}
function crossInvoiceNo(prefix, per, key) { return prefix + "-" + per.replace("-", "") + "-" + key; }

/* ---------- Seed: allgemeine Struktur ---------- */
const SIZES = {
  S: { elevon: { cust: 30, sup: 20, mat: 120, emp: 60, assets: 40, cc: 12, pc: 5 }, novamart: { art: 300, sup: 30, cust: 500, stores: 5, emp: 80 }, aventra: { emp: 40, cust: 12, proj: 8, cc: 6, pc: 3 } },
  M: { elevon: { cust: 120, sup: 60, mat: 400, emp: 200, assets: 120, cc: 40, pc: 10 }, novamart: { art: 1500, sup: 120, cust: 3000, stores: 12, emp: 300 }, aventra: { emp: 120, cust: 40, proj: 25, cc: 12, pc: 6 } },
  L: { elevon: { cust: 250, sup: 150, mat: 1000, emp: 500, assets: 300, cc: 80, pc: 20 }, novamart: { art: 5000, sup: 300, cust: 10000, stores: 25, emp: 800 }, aventra: { emp: 300, cust: 80, proj: 60, cc: 25, pc: 10 } }
};
function baseTenant(id, name, seed, size) {
  const periods = {}; for (const p of HIST) periods[p] = "closed"; periods["2026-11"] = "open";
  return { id, name, seed, size, version: VERSION, date: START_DATE, periods, seq: {}, docs: [], stock: {}, moves: [], inbox: [], audit: [], events: [], idem: {},
    master: {}, custInvoices: [], supInvoices: [], purchaseOrders: [], salesOrders: [], quotes: [], prodOrders: [], webOrders: [], projects: [], timeEntries: [], expenses: [], co: {} };
}
function addAR(t, { partnerId, date, net, text, ref, revAcct, link, extNo }) {
  const tax = r2(net * VAT), gross = r2(net + tax), no = extNo || nextNo(t, "AR", periodOf(date));
  const d = postHist(t, { date, text: text + " " + no, ref: { type: "custInvoice", id: no }, lines: [{ acct: "1200", dr: gross }, { acct: revAcct, cr: net }, { acct: "1776", cr: tax }] });
  const inv = { no, partnerId, date, period: periodOf(date), net, tax, gross, open: gross, status: "offen", ref: ref || null, docNo: d.no, link: link || null, text };
  t.custInvoices.push(inv); return inv;
}
function payAR(t, inv, date) { const d = postHist(t, { date, text: "Zahlungseingang " + inv.no, ref: { type: "custInvoice", id: inv.no }, lines: [{ acct: "1100", dr: inv.open }, { acct: "1200", cr: inv.open }] }); inv.open = 0; inv.status = "bezahlt"; inv.paidDoc = d.no; }
function addAP(t, { partnerId, date, net, text, expAcct, link, extNo, poNo }) {
  const tax = r2(net * VAT), gross = r2(net + tax), no = nextNo(t, "AP", periodOf(date));
  const d = postHist(t, { date, text: text + " " + (extNo || no), ref: { type: "supInvoice", id: no }, lines: [{ acct: expAcct, dr: net }, { acct: "1500", dr: tax }, { acct: "1600", cr: gross }] });
  const inv = { no, extNo: extNo || null, partnerId, date, period: periodOf(date), net, tax, gross, open: gross, status: "offen", docNo: d.no, link: link || null, poNo: poNo || null, text };
  t.supInvoices.push(inv); return inv;
}
function payAP(t, inv, date) { const d = postHist(t, { date, text: "Zahlung " + (inv.extNo || inv.no), ref: { type: "supInvoice", id: inv.no }, lines: [{ acct: "1600", dr: inv.open }, { acct: "1100", cr: inv.open }] }); inv.open = 0; inv.status = "bezahlt"; inv.paidDoc = d.no; }
function vatSettle(t, per) {
  const f = d => d.period <= per; const out = -balance(t, "1776", f), inp = balance(t, "1500", f); const pay = r2(out - inp);
  if (Math.abs(pay) < 0.01) return;
  const date = nextPeriod(per) + "-10";
  postHist(t, { date, text: "Umsatzsteuer-Voranmeldung " + per, lines: [{ acct: "1776", dr: out }, { acct: "1500", cr: inp }, pay > 0 ? { acct: "1100", cr: pay } : { acct: "1100", dr: -pay }] });
}
const isLast = p => p === HIST[HIST.length - 1];
const payDate = p => nextPeriod(p) + "-08";

/* ---------- Seed: Elevon Industries ---------- */
const E5_BOM = [["M-1001", 1], ["M-1002", 1], ["M-1003", 1], ["M-1004", 8], ["M-1005", 6], ["M-1006", 1], ["M-1007", 1], ["M-1008", 1]];
const E5 = { id: "P-E5", name: "Aufzug Elevon E5, 8 Haltestellen", listPrice: 62000, assemblyHours: 48, laborRate: 78, installHours: 96, installRate: 72 };
function seedElevon(seed, size) {
  const rng = mulberry32(seed ^ hashStr("elevon")); const n = SIZES[size].elevon; const t = baseTenant("elevon", "Elevon Industries Group", seed, size);
  t.companies = [["DE01", "Elevon Germany GmbH", "EUR"], ["CH01", "Elevon Switzerland AG", "CHF"], ["PL01", "Elevon Poland Sp. z o.o.", "PLN"], ["US01", "Elevon USA Inc.", "USD"], ["SG01", "Elevon Singapore Pte. Ltd.", "SGD"]].map(([id, name, cur]) => ({ id, name, currency: cur }));
  t.rates = { EUR: 1, CHF: 0.94, PLN: 4.31, USD: 1.08, SGD: 1.45 };
  t.plants = [{ id: "DE10", name: "Werk Stuttgart", company: "DE01" }, { id: "PL10", name: "Werk Krakau", company: "PL01" }];
  t.warehouses = ["Stuttgart Rohstoffe", "Stuttgart Fertigware", "Krakau Rohstoffe", "Krakau Fertigware", "Service Köln", "Service Zürich", "Service Chicago", "Service Singapur"].map((nm, i) => ({ id: "WH" + (i + 1), name: nm }));
  const core = [
    ["M-1001", "Kabine E5", 9800, "S-1001", 15], ["M-1002", "Antriebseinheit 7,5 kW", 6400, "S-1002", 12], ["M-1003", "Steuerung NX", 3900, "S-1003", 10], ["M-1004", "Schachttürsatz", 650, "S-1001", 8],
    ["M-1005", "Tragseil 12 mm", 180, "S-1004", 5], ["M-1006", "Führungsschienensatz", 2100, "S-1004", 9], ["M-1007", "Gegengewicht", 1300, "S-1004", 7], ["M-1008", "Fangvorrichtung", 890, "S-1003", 6]
  ];
  const startStock = { "M-1001": 6, "M-1002": 3, "M-1003": 5, "M-1004": 40, "M-1005": 60, "M-1006": 5, "M-1007": 6, "M-1008": 7 };
  t.master.suppliers = [
    { id: "S-1001", name: "Kabinenbau Hollmann GmbH", city: "Esslingen" }, { id: "S-1002", name: "Kessler Antriebstechnik GmbH", city: "Bielefeld" },
    { id: "S-1003", name: "NordSteuer Elektronik GmbH", city: "Kiel" }, { id: "S-1004", name: "Stahlprofile Wenzel KG", city: "Siegen" },
    { id: "S-AVENTRA", name: "Aventra Consulting Germany GmbH", city: "Frankfurt", link: { tenant: "aventra", partnerId: "C-ELEVON" } }
  ];
  for (let i = t.master.suppliers.length; i < n.sup; i++) t.master.suppliers.push({ id: "S-" + (1000 + i), name: pick(rng, ORG1) + pick(rng, ["metall", "technik", "elektro", "logistik", "service"]) + " " + pick(rng, ["GmbH", "KG", "AG"]), city: pick(rng, CITY) });
  t.master.materials = core.map(([id, name, price, sup, lead]) => ({ id, name, price, supplier: sup, leadDays: lead, type: "Rohstoff" }));
  const fill = ["Schraubensatz", "Kabelbaum", "Display", "Notrufmodul", "Lichtgitter", "Dämpfer", "Rolle", "Bremsbelag", "Sensor", "Tastenfeld"];
  for (let i = core.length; i < n.mat; i++) t.master.materials.push({ id: "M-" + (1001 + i), name: pick(rng, fill) + " " + pick(rng, ["A", "B", "C", "S", "X"]) + int(rng, 1, 9), price: r2(between(rng, 4, 420)), supplier: pick(rng, t.master.suppliers.slice(0, 4)).id, leadDays: int(rng, 3, 20), type: "Rohstoff" });
  t.master.products = [Object.assign({ bom: E5_BOM }, E5)];
  t.master.customers = [
    { id: "C-RHEIN", name: "Rheinpark Immobilien GmbH", city: "Köln", segment: "Projektentwickler" },
    { id: "C-NOVAMART", name: "NovaMart Retail Group", city: "Düsseldorf", segment: "Handel", link: { tenant: "novamart", partnerId: "S-ELEVON" } }
  ];
  for (let i = t.master.customers.length; i < n.cust; i++) t.master.customers.push({ id: "C-" + (1000 + i), name: pick(rng, ORG1) + pick(rng, ORG2) + " " + pick(rng, ORG3), city: pick(rng, CITY), segment: pick(rng, ["Projektentwickler", "Bestandshalter", "Öffentliche Hand", "Hotel"]) });
  t.master.employees = []; for (let i = 0; i < n.emp; i++) t.master.employees.push({ id: "E-" + (100 + i), name: person(rng), role: i < 8 ? "Monteur" : i < 20 ? "Servicetechniker" : pick(rng, ["Fertigung", "Fertigung", "Vertrieb", "Verwaltung", "Einkauf"]), costRate: r2(between(rng, 48, 72)) });
  t.master.costCenters = Array.from({ length: n.cc }, (_, i) => ({ id: "KS" + (4100 + i * 10), name: pick(rng, ["Montage", "Fertigung", "Service", "Vertrieb", "Verwaltung", "Einkauf", "Qualität", "Logistik"]) + " " + (i + 1) }));
  t.master.profitCenters = Array.from({ length: n.pc }, (_, i) => ({ id: "PC" + (10 + i), name: ["Neuanlagen DE", "Service DE", "Modernisierung", "Neuanlagen CH", "Service US", "Ersatzteile", "Neuanlagen SG", "Service SG", "Komponenten PL", "Service CH"][i % 10] }));
  t.master.assets = Array.from({ length: n.assets }, (_, i) => ({ id: "A-" + (5000 + i), name: "Aufzug " + pick(rng, ["E3", "E5", "E7"]) + " " + pick(rng, CITY), customer: pick(rng, t.master.customers).id, since: (2012 + int(rng, 0, 13)) + "" }));
  t.roles = [{ id: "ceo", name: "CEO", perms: ["view", "approve"] }, { id: "cfo", name: "CFO", perms: ["view", "post", "pay", "approve", "close"] }, { id: "sales", name: "Sales Manager", perms: ["view", "sell"] }, { id: "prod", name: "Production Manager", perms: ["view", "produce"] }, { id: "buy", name: "Procurement Manager", perms: ["view", "buy", "post"] }, { id: "wh", name: "Warehouse Manager", perms: ["view", "ship", "receive"] }, { id: "service", name: "Service Manager", perms: ["view", "install"] }];
  t.users = [{ id: "u1", name: "Katrin Vogel", role: "ceo" }, { id: "u2", name: "Martin Seidel", role: "cfo" }, { id: "u3", name: "Jana Roth", role: "sales" }, { id: "u4", name: "Piotr Nowak", role: "prod" }, { id: "u5", name: "Sven Kuhn", role: "buy" }, { id: "u6", name: "Ali Demir", role: "wh" }, { id: "u7", name: "Nina Brandt", role: "service" }];

  // Eröffnungsbilanz: Bank, Rohstoffbestand (Nebenbuch = Hauptbuch)
  for (const [mat, q] of Object.entries(startStock)) { const m = t.master.materials.find(x => x.id === mat); moveIn(t, mat, "WH1", q, q * m.price); }
  for (const m of t.master.materials.slice(core.length, core.length + Math.min(40, n.mat))) moveIn(t, m.id, "WH1", int(rng, 20, 200), 0), stk(t, m.id, "WH1").value = r2(stk(t, m.id, "WH1").qty * m.price);
  { const r2g = mulberry32(seed ^ hashStr("elevon-service-stock")); for (const [m, q] of [["M-1008", 3], ["M-1005", 30], ["M-1004", 6]]) moveIn(t, m, "WH5", q, q * t.master.materials.find(x => x.id === m).price); for (const m of t.master.materials.slice(8, 14)) moveIn(t, m.id, "WH5", int(r2g, 4, 20), 0), stk(t, m.id, "WH5").value = r2(stk(t, m.id, "WH5").qty * m.price); }
  t.moves = [];
  const invValue = r2(Object.values(t.stock).reduce((a, s) => a + s.value, 0));
  postHist(t, { date: "2025-11-01", text: "Eröffnungsbilanz", lines: [{ acct: "1100", dr: 3000000 }, { acct: "1300", dr: invValue }, { acct: "2000", cr: r2(3000000 + invValue) }] });

  // Historie: Anlagenverkauf, Service, Wareneinsatz, Einkauf, Personal, Sonstiges, Querbeziehungen
  const cross = crossHistory(seed);
  const devs = t.master.customers.filter(c => c.segment === "Projektentwickler" && c.id !== "C-RHEIN");
  const f = n.emp / 60;
  HIST.forEach((p, i) => {
    const units = Math.round((p >= "2026-09" ? 12 : int(rng, 10, 14)) * f); const costFactor = p === "2026-10" ? 1.15 : 1; // Oktober: Materialpreiserhöhung
    const matCost = r2(30670 * costFactor * units), labor = r2(E5.assemblyHours * E5.laborRate * units);
    const price = p >= "2026-09" ? 60500 : r2(E5.listPrice * between(rng, 0.94, 1.0));
    let rest = units; while (rest > 0) { const u = Math.min(rest, int(rng, 1, 3)); rest -= u; const inv = addAR(t, { partnerId: pick(rng, devs).id, date: p + "-" + pad(int(rng, 12, 24), 2), net: r2(price * u), text: "Rechnung Aufzugsanlagen", revAcct: "4000" }); if (!isLast(p) || rng() < 0.3) payAR(t, inv, payDate(p)); }
    postHist(t, { date: p + "-25", text: "Wareneinsatz ausgelieferte Anlagen " + p, lines: [{ acct: "5000", dr: r2(matCost + labor) }, { acct: "1300", cr: matCost }, { acct: "6990", cr: labor }] });
    const svc = addAR(t, { partnerId: pick(rng, t.master.customers.slice(2)).id, date: p + "-05", net: r2(between(rng, 70000, 80000) * f), text: "Wartungsverträge Monat", revAcct: "4400" }); if (!isLast(p)) payAR(t, svc, payDate(p));
    const nm = cross.service[i]; const nmInv = addAR(t, { partnerId: "C-NOVAMART", date: p + "-05", net: nm.net, text: "Wartung Fahrtreppen und Aufzüge Filialen", revAcct: "4400", extNo: crossInvoiceNo("EL-RE", p, "NM"), link: { tenant: "novamart" } }); if (!isLast(p)) payAR(t, nmInv, payDate(p));
    // Einkauf in Höhe des Materialverbrauchs: Bestand bleibt konstant (Nebenbuch = Hauptbuch)
    const ap = addAP(t, { partnerId: pick(rng, t.master.suppliers.slice(0, 4)).id, date: p + "-10", net: matCost, text: "Materialeinkauf", expAcct: "1300" }); if (!isLast(p)) payAP(t, ap, payDate(p));
    postHist(t, { date: p + "-28", text: "Gehälter " + p, lines: [{ acct: "6000", dr: r2(n.emp * 3400) }, { acct: "1100", cr: r2(n.emp * 3400) }] });
    postHist(t, { date: p + "-28", text: "Miete, Energie, Sonstiges " + p, lines: [{ acct: "6300", dr: r2(between(rng, 70000, 82000) * f) }, { acct: "1100", cr: 0 }].map((l, k, a) => k === 1 ? { acct: "1100", cr: a[0].dr } : l) });
    const av = cross.p1001[i]; if (av.net) { const inv = addAP(t, { partnerId: "S-AVENTRA", date: p + "-30".replace("-30", p.endsWith("02") ? "-28" : "-30"), net: av.net, text: "Beratung S/4HANA-Transformation", expAcct: "6800", extNo: crossInvoiceNo("AV-RE", p, "P1001"), link: { tenant: "aventra" } }); if (!isLast(p)) payAP(t, inv, payDate(p)); }
    vatSettle(t, p);
  });
  t.salesOrders = []; t.co = {};
  return t;
}

/* ---------- Seed: NovaMart Retail ---------- */
const CATS = [["TV", "Fernseher", 380, 1400], ["AUD", "Audio", 40, 600], ["HH", "Haushaltsgerät", 60, 900], ["MOB", "Smartphone", 180, 1100], ["ACC", "Zubehör", 8, 90], ["GAM", "Gaming", 40, 600]];
const BRANDS = ["Visiona", "Klangwerk", "Nordhaus", "Lumio", "Pixelon", "Arkadia"];
function seedNovaMart(seed, size) {
  const rng = mulberry32(seed ^ hashStr("novamart")); const n = SIZES[size].novamart; const t = baseTenant("novamart", "NovaMart Retail Group", seed, size);
  t.companies = [["DE01", "NovaMart Germany GmbH", "EUR"], ["AT01", "NovaMart Austria GmbH", "EUR"], ["NL01", "NovaMart Netherlands B.V.", "EUR"]].map(([id, name, cur]) => ({ id, name, currency: cur }));
  t.rates = { EUR: 1 };
  t.warehouses = [{ id: "ZL1", name: "Zentrallager Kassel" }, { id: "ZL2", name: "Zentrallager Linz" }, { id: "RL1", name: "Regionallager Köln" }, { id: "RL2", name: "Regionallager München" }, { id: "RL3", name: "Regionallager Utrecht" }];
  t.stores = Array.from({ length: n.stores }, (_, i) => ({ id: "F" + pad(i + 1, 2), name: "Filiale " + CITY[i % CITY.length] + (i >= CITY.length ? " " + (Math.floor(i / CITY.length) + 1) : ""), company: i % 5 === 3 ? "AT01" : i % 5 === 4 ? "NL01" : "DE01" }));
  t.master.suppliers = [{ id: "S-ELEVON", name: "Elevon Germany GmbH", city: "Stuttgart", link: { tenant: "elevon", partnerId: "C-NOVAMART" } }, { id: "S-AVENTRA", name: "Aventra Consulting Germany GmbH", city: "Frankfurt", link: { tenant: "aventra", partnerId: "C-NOVAMART" } }];
  for (let i = 2; i < n.sup; i++) t.master.suppliers.push({ id: "S-" + (2000 + i), name: pick(rng, BRANDS) + " " + pick(rng, ["Distribution", "Europe", "Vertrieb", "Trading"]) + " GmbH", city: pick(rng, CITY), leadDays: int(rng, 3, 14), otd: r2(between(rng, 0.78, 0.99)) });
  const goods = t.master.suppliers.slice(2);
  t.master.articles = [];
  t.master.articles.push({ id: "A-10001", name: "Visiona 55\" 4K-Fernseher", cat: "TV", price: 699, cost: 455, supplier: goods[0].id, leadDays: 5, rop: 20, weekly: [] });
  for (let i = 1; i < n.art; i++) { const c = pick(rng, CATS); const price = Math.round(between(rng, c[2], c[3])) - 0.01; t.master.articles.push({ id: "A-" + (10001 + i), name: pick(rng, BRANDS) + " " + c[1] + " " + pick(rng, ["Pro", "Max", "Lite", "One", "Neo", "S"]) + int(rng, 2, 9), cat: c[0], price, cost: r2(price * between(rng, 0.58, 0.72)), supplier: pick(rng, goods).id, leadDays: int(rng, 3, 14), rop: 0, weekly: [] }); }
  // 52 Wochen Absatz je Artikel -> Grundlage für Prognose UND Monatsumsatz im Hauptbuch
  for (const a of t.master.articles) { const base = a.id === "A-10001" ? 9 : between(rng, 0.5, 14); for (let w = 0; w < 52; w++) a.weekly.push(Math.max(0, Math.round(base * (1 + 0.25 * Math.sin((w + 8) / 52 * 2 * Math.PI)) * between(rng, 0.7, 1.3)))); }
  for (const a of t.master.articles) { const daily = a.weekly.slice(-8).reduce((x, y) => x + y, 0) / 56; a.rop = Math.max(2, Math.ceil(daily * a.leadDays + daily * 3)); }
  t.master.articles[0].rop = 20;
  t.master.customers = [{ id: "C-ONLINE", name: "Onlinekunde (Sammelkonto)", city: "–" }];
  for (let i = 1; i < n.cust; i++) t.master.customers.push({ id: "K-" + (300000 + i), name: person(rng), city: pick(rng, CITY), loyalty: rng() < 0.4 ? "NovaClub" : null });
  t.master.employees = Array.from({ length: n.emp }, (_, i) => ({ id: "E-" + (100 + i), name: person(rng), role: i < n.stores * 2 ? "Filiale" : pick(rng, ["Lager", "Lager", "E-Commerce", "Einkauf", "Verwaltung"]) }));
  t.roles = [{ id: "ceo", name: "CEO", perms: ["view", "approve"] }, { id: "cfo", name: "CFO", perms: ["view", "post", "pay", "approve", "close"] }, { id: "sales", name: "E-Commerce Manager", perms: ["view", "sell"] }, { id: "wh", name: "Warehouse Manager", perms: ["view", "ship", "receive"] }, { id: "buy", name: "Procurement Manager", perms: ["view", "buy", "post"] }];
  t.users = [{ id: "u1", name: "Lena Hartmann", role: "ceo" }, { id: "u2", name: "Felix Brandt", role: "cfo" }, { id: "u3", name: "Mia Winter", role: "sales" }, { id: "u4", name: "Tim Böhm", role: "wh" }, { id: "u5", name: "Sara Pohl", role: "buy" }];

  // Endbestand je Artikel; Einkauf = Absatz über die Historie, damit Nebenbuch = Hauptbuch
  for (const a of t.master.articles) { let q = a.id === "A-10001" ? 21 : Math.round(a.rop * between(rng, 0.7, 3)); moveIn(t, a.id, "ZL1", q, r2(q * a.cost)); }
  { const rs = mulberry32(seed ^ hashStr("novamart-store-stock")); for (const s of t.stores.slice(0, 3)) for (const a of t.master.articles.slice(0, 40)) { const q = a.id === "A-10001" ? 3 : int(rs, 1, 4); moveIn(t, a.id, s.id, q, r2(q * a.cost)); } }
  t.moves = [];
  const inv0 = r2(Object.values(t.stock).reduce((x, s) => x + s.value, 0));
  postHist(t, { date: "2025-11-01", text: "Eröffnungsbilanz", lines: [{ acct: "1100", dr: 1800000 }, { acct: "1310", dr: inv0 }, { acct: "2000", cr: r2(1800000 + inv0) }] });
  const cross = crossHistory(seed);
  HIST.forEach((p, i) => {
    const disc = p === "2026-10" ? 0.11 : 0.04; // Oktober: Rabattaktion
    let units = 0, rev = 0, cost = 0; const wk = [i * 52 / 12, (i + 1) * 52 / 12].map(Math.round);
    for (const a of t.master.articles) { let u = 0; for (let w = wk[0]; w < wk[1]; w++) u += a.weekly[w]; units += u; rev += u * a.price * (1 - disc); cost += u * a.cost; }
    rev = r2(rev / (1 + VAT)); cost = r2(cost);
    const online = r2(rev * 0.38), store = r2(rev - online);
    postHist(t, { date: p + "-26", text: "Onlineumsatz " + p, lines: [{ acct: "1590", dr: r2(online * (1 + VAT)) }, { acct: "4000", cr: online }, { acct: "1776", cr: r2(online * (1 + VAT)) - online }] });
    postHist(t, { date: p + "-27", text: "Auszahlung Zahlungsdienstleister " + p, lines: [{ acct: "1100", dr: r2(online * (1 + VAT) * 0.985) }, { acct: "6855", dr: r2(online * (1 + VAT)) - r2(online * (1 + VAT) * 0.985) }, { acct: "1590", cr: r2(online * (1 + VAT)) }] });
    postHist(t, { date: p + "-27", text: "Filialumsatz " + p, lines: [{ acct: "1100", dr: r2(store * (1 + VAT)) }, { acct: "4000", cr: store }, { acct: "1776", cr: r2(store * (1 + VAT)) - store }] });
    postHist(t, { date: p + "-27", text: "Wareneinsatz " + p, lines: [{ acct: "5000", dr: cost }, { acct: "1310", cr: cost }] });
    const parts = 3; for (let k = 0; k < parts; k++) { const ap = addAP(t, { partnerId: pick(rng, goods).id, date: p + "-" + pad(5 + k * 7, 2), net: r2(cost / parts), text: "Wareneinkauf", expAcct: "1310" }); if (!isLast(p) || k === 0) payAP(t, ap, isLast(p) ? p + "-29" : payDate(p)); }
    const rounding = r2(cost - r2(cost / parts) * parts); if (rounding) postHist(t, { date: p + "-28", text: "Rundung Bestandsabgleich", lines: rounding > 0 ? [{ acct: "1310", dr: rounding }, { acct: "6300", cr: rounding }] : [{ acct: "6300", dr: -rounding }, { acct: "1310", cr: -rounding }] });
    postHist(t, { date: p + "-28", text: "Gehälter " + p, lines: [{ acct: "6000", dr: r2(n.emp * 3100) }, { acct: "1100", cr: r2(n.emp * 3100) }] });
    const rent = r2(n.stores * between(rng, 14000, 16000)); postHist(t, { date: p + "-28", text: "Mieten Filialen und Lager " + p, lines: [{ acct: "6300", dr: rent }, { acct: "1100", cr: rent }] });
    const sv = cross.service[i]; const s = addAP(t, { partnerId: "S-ELEVON", date: p + "-05", net: sv.net, text: "Wartung Fahrtreppen und Aufzüge Filialen", expAcct: "6300", extNo: crossInvoiceNo("EL-RE", p, "NM"), link: { tenant: "elevon" } }); if (!isLast(p)) payAP(t, s, payDate(p));
    const av = cross.p1002[i]; if (av.net) { const s2 = addAP(t, { partnerId: "S-AVENTRA", date: p + "-28", net: av.net, text: "Beratung Omnichannel-Kasse", expAcct: "6800", extNo: crossInvoiceNo("AV-RE", p, "P1002"), link: { tenant: "aventra" } }); if (!isLast(p)) payAP(t, s2, payDate(p)); }
    vatSettle(t, p);
  });
  return t;
}

/* ---------- Seed: Aventra Consulting ---------- */
const SKILLS = ["SAP FI/CO", "SAP MM", "SAP SD", "SAP PP", "Projektleitung", "Datenmigration", "Integration", "Architektur", "Change Management"];
function seedAventra(seed, size) {
  const rng = mulberry32(seed ^ hashStr("aventra")); const n = SIZES[size].aventra; const t = baseTenant("aventra", "Aventra Consulting Group", seed, size);
  t.companies = [["DE01", "Aventra Consulting Germany GmbH", "EUR"], ["CH01", "Aventra Consulting Switzerland AG", "CHF"], ["PL01", "Aventra Consulting Poland Sp. z o.o.", "PLN"]].map(([id, name, cur]) => ({ id, name, currency: cur }));
  t.rates = { EUR: 1, CHF: 0.94, PLN: 4.31 };
  t.master.employees = Array.from({ length: n.emp }, (_, i) => { const lvl = pick(rng, ["Consultant", "Senior Consultant", "Manager"]); const f = lvl === "Manager" ? 1.35 : lvl === "Senior Consultant" ? 1.15 : 1; return { id: "E-" + (100 + i), name: person(rng), level: lvl, skills: [SKILLS[i % SKILLS.length], pick(rng, SKILLS)].filter((v, k, a) => a.indexOf(v) === k), costRate: r2(62 * f), billRate: r2(135 * f), capacity: 160, company: i % 7 === 5 ? "CH01" : i % 7 === 6 ? "PL01" : "DE01" }; });
  t.master.customers = [{ id: "C-ELEVON", name: "Elevon Industries Group", city: "Stuttgart", link: { tenant: "elevon", partnerId: "S-AVENTRA" } }, { id: "C-NOVAMART", name: "NovaMart Retail Group", city: "Düsseldorf", link: { tenant: "novamart", partnerId: "S-AVENTRA" } }];
  for (let i = 2; i < n.cust; i++) t.master.customers.push({ id: "C-" + (3000 + i), name: pick(rng, ORG1) + pick(rng, ["chem", "pharm", "tech", "log", "food", "energie"]) + " " + pick(rng, ["AG", "GmbH", "SE"]), city: pick(rng, CITY) });
  t.master.costCenters = Array.from({ length: n.cc }, (_, i) => ({ id: "KS" + (200 + i * 10), name: ["Beratung DE", "Beratung CH", "Beratung PL", "Managed Services", "Vertrieb", "Verwaltung"][i % 6] + (i >= 6 ? " " + (Math.floor(i / 6) + 1) : "") }));
  t.master.profitCenters = Array.from({ length: n.pc }, (_, i) => ({ id: "PC" + (10 + i), name: ["ERP-Transformation", "Managed Services", "Softwareentwicklung", "Schulungen", "Projektmanagement"][i % 5] + (i >= 5 ? " 2" : "") }));
  t.roles = [{ id: "ceo", name: "CEO", perms: ["view", "approve"] }, { id: "cfo", name: "CFO", perms: ["view", "post", "pay", "approve", "close"] }, { id: "pm", name: "Project Manager", perms: ["view", "staff", "approve", "bill"] }, { id: "consultant", name: "Berater", perms: ["view", "time"] }];
  t.users = [{ id: "u1", name: "Daniel Graf", role: "ceo" }, { id: "u2", name: "Sabine Lorenz", role: "cfo" }, { id: "u3", name: "Marc Keller", role: "pm" }, { id: "u4", name: t.master.employees[0].name, role: "consultant", employee: t.master.employees[0].id }];
  postHist(t, { date: "2025-11-01", text: "Eröffnungsbilanz", lines: [{ acct: "1100", dr: 950000 }, { acct: "2000", cr: 950000 }] });
  const cross = crossHistory(seed); const emps = t.master.employees;
  const projects = [
    { id: "P-1001", name: "S/4HANA-Transformation Elevon", customer: "C-ELEVON", budget: 500000, planRevenue: 900000, rate: 158, start: "2026-04", etcHours: 3200, cross: "p1001" },
    { id: "P-1002", name: "Omnichannel-Kasse NovaMart", customer: "C-NOVAMART", budget: 180000, planRevenue: 245000, rate: 149, start: "2026-06", etcHours: 520, cross: "p1002" }
  ];
  const others = t.master.customers.slice(2);
  for (let i = 2; i < n.proj; i++) { const rate = Math.round(between(rng, 130, 175)); const budget = Math.round(between(rng, 80, 420)) * 1000; projects.push({ id: "P-" + (1001 + i), name: pick(rng, ["SAP-Rollout", "Finance-Optimierung", "Datenmigration", "Integration", "Managed Services", "Lizenzanalyse", "BW-Ablösung"]) + " " + pick(rng, others).name.split(" ")[0], customer: pick(rng, others).id, budget, planRevenue: Math.round(budget * between(rng, 1.3, 1.5)), rate, start: HIST[int(rng, 0, 3)], etcHours: Math.round(between(rng, 200, 1600)) }); }
  let ei = 0;
  for (const p of projects) {
    p.status = "freigegeben"; p.team = []; const size_ = p.id === "P-1001" ? 6 : p.id === "P-1002" ? 3 : int(rng, 3, 6);
    for (let k = 0; k < size_; k++) { const e = emps[ei++ % emps.length]; p.team.push({ employee: e.id, role: e.skills[0], hoursPerMonth: int(rng, 110, 150) }); }
    t.co[p.id] = { cost: 0, revenue: 0, hours: 0, expenses: 0 };
    if (!p.cross) { const months = HIST.filter(x => x >= p.start).length; const teamH = p.team.reduce((a, m) => a + m.hoursPerMonth, 0); const avgC = p.team.reduce((a, m) => a + emps.find(e => e.id === m.employee).costRate, 0) / p.team.length;
      const plannedH = months * teamH + p.etcHours; const factor = rng() < 0.2 ? between(rng, 0.88, 0.97) : between(rng, 1.05, 1.25); p.budget = Math.round(plannedH * (avgC + 6) * factor / 1000) * 1000; p.planRevenue = Math.round(plannedH * p.rate / 1000) * 1000; }
  }
  t.projects = projects;
  // Historie Zeit und Rechnungen; P-1001/P-1002 aus gemeinsamer Querbeziehung, damit Elevon/NovaMart dieselben Beträge sehen
  HIST.forEach((per, i) => {
    let payroll = 0;
    for (const p of projects) {
      if (per < p.start) continue;
      let hours = 0, cost = 0;
      if (p.cross) { const c = cross[p.cross][i]; hours = c.hours; let rest = hours; p.team.forEach((m, k) => { const h = k === p.team.length - 1 ? rest : Math.round(hours / p.team.length); rest -= h; const e = emps.find(x => x.id === m.employee); cost += h * e.costRate; t.timeEntries.push({ id: nextNo(t, "TE"), employee: e.id, project: p.id, date: per + "-28", hours: h, billable: true, status: "abgerechnet", period: per, costRate: e.costRate, billRate: p.rate }); }); }
      else { for (const m of p.team) { const e = emps.find(x => x.id === m.employee); const h = Math.round(m.hoursPerMonth * between(rng, 0.8, 1.1) * (per === "2026-10" ? 0.85 : 1)); hours += h; cost += h * e.costRate; t.timeEntries.push({ id: nextNo(t, "TE"), employee: e.id, project: p.id, date: per + "-28", hours: h, billable: true, status: "abgerechnet", period: per, costRate: e.costRate, billRate: p.rate }); } }
      t.co[p.id].hours += hours; t.co[p.id].cost = r2(t.co[p.id].cost + cost);
      const net = p.cross ? cross[p.cross][i].net : r2(hours * p.rate);
      if (net > 0) { const extNo = p.cross ? crossInvoiceNo("AV-RE", per, p.id.replace("-", "")) : null; const inv = addAR(t, { partnerId: p.customer, date: per + (per.endsWith("02") ? "-28" : "-30"), net, text: "Leistungen " + p.name + " " + per, revAcct: "4400", ref: { type: "project", id: p.id }, extNo, link: p.cross ? { tenant: p.customer === "C-ELEVON" ? "elevon" : "novamart" } : null }); t.co[p.id].revenue = r2(t.co[p.id].revenue + net); if (!isLast(per)) payAR(t, inv, payDate(per)); else if (!p.cross && rng() < 0.4) payAR(t, inv, per + "-30"); }
      const trav = r2(hours * between(rng, 4, 9)); if (trav > 0) { postHist(t, { date: per + "-20", text: "Reisekosten " + p.id, ref: { type: "project", id: p.id }, lines: [{ acct: "6650", dr: trav }, { acct: "1100", cr: trav }] }); t.co[p.id].expenses = r2(t.co[p.id].expenses + trav); t.co[p.id].cost = r2(t.co[p.id].cost + trav); }
    }
    payroll = r2(emps.reduce((a, e) => a + e.costRate * 160, 0));
    postHist(t, { date: per + "-28", text: "Gehälter " + per, lines: [{ acct: "6000", dr: payroll }, { acct: "1100", cr: payroll }] });
    const oth = r2(emps.length * between(rng, 900, 1100)); postHist(t, { date: per + "-28", text: "Büro, IT, Sonstiges " + per, lines: [{ acct: "6300", dr: oth }, { acct: "1100", cr: oth }] });
    vatSettle(t, per);
  });
  // Laufende Woche: erfasste, noch nicht freigegebene Zeiten für P-1001
  for (const m of projects[0].team.slice(0, 3)) { const e = emps.find(x => x.id === m.employee); t.timeEntries.push({ id: nextNo(t, "TE"), employee: e.id, project: "P-1001", date: "2026-11-02", hours: 8, billable: true, status: "erfasst", period: "2026-11", costRate: e.costRate, billRate: 158 }); }
  return t;
}

/* ---------- Welt, Reset, Reproduzierbarkeit ---------- */
/* --- Rollenkonzept: zusätzliche Unternehmensrollen und Demo-Personen --- */
const ROLE_DESC = {
  ceo: "Geschäftsführung: sieht alles, gibt Angebote, Migrationen und Go-live frei",
  cfo: "Finanzvorstand: bucht, zahlt, schließt Perioden ab und gibt frei",
  controller: "Controlling: bucht, schließt Perioden ab, analysiert Ergebnis und Kosten – keine Zahlungen, keine Freigaben",
  sales: "Vertrieb: Angebote, Kundenaufträge, Onlinebestellungen, Retouren",
  prod: "Fertigung: Bedarfsermittlung, Fertigungsaufträge, Rückmeldungen",
  buy: "Einkauf: Bestellungen, Rechnungsprüfung",
  wh: "Lager: Wareneingang, Kommissionierung, Versand, Retourenprüfung",
  service: "Service: Tickets, Technikerplanung, Ersatzteile, Montage, Abrechnung",
  store: "Filialleitung: Click & Collect bereitstellen und übergeben",
  pm: "Projektleitung: Staffing, Zeitfreigabe, Projektabrechnung",
  consultant: "Beratung: Zeiten und Reisekosten erfassen",
  resource: "Ressourcenplanung: passende Berater finden und einplanen",
  hr: "Personal: Einstellungen, Abwesenheiten, Personalkosten; genehmigt Abwesenheiten",
  migration: "Migration Manager: Testmigrationen, Freigabe anfordern, Produktivlauf je Objekt",
  auditor: "Prüfer: liest alles, darf nichts verändern",
  engineer: "Konstruktion: Zeichnungen importieren, Stücklisten und Arbeitspläne ableiten, Konstruktion freigeben (Vier-Augen)"
};
const EXTRA_ROLES = {
  common: [{ id: "controller", name: "Controller", perms: ["view", "post", "close"] }, { id: "auditor", name: "Prüfer (nur Lesen)", perms: ["view"] }],
  elevon: [{ id: "migration", name: "Migration Manager", perms: ["view", "post"] }],
  novamart: [], aventra: [{ id: "resource", name: "Resource Manager", perms: ["view", "staff"] }]
};
const EXTRA_USERS = {
  elevon: [["Lars Ehrlich", "controller"], ["Mira Thalberg", "migration"], ["Johanna Vierling", "auditor"]],
  novamart: [["Paul Rieger", "controller"], ["Kerstin Adler", "auditor"]],
  aventra: [["Nora Weidner", "controller"], ["Tobias Kern", "resource"], ["Henrik Saalfeld", "auditor"]]
};
function seedRoles(t) {
  t.roles.push(...EXTRA_ROLES.common.concat(EXTRA_ROLES[t.id]).map(r => Object.assign({}, r, { perms: r.perms.slice() })));
  let n = t.users.length; for (const [name, role] of EXTRA_USERS[t.id]) t.users.push({ id: "u" + (++n), name, role });
  seedProcurementHR(t); if (t.id === "elevon") seedEngineering(t);
  for (const r of t.roles) r.desc = ROLE_DESC[r.id] || "";
  return t;
}
const SEEDERS = { elevon: seedElevon, novamart: seedNovaMart, aventra: seedAventra };
const EXT = { elevon: seedExtElevon, novamart: seedExtNovaMart, aventra: seedExtAventra };
function seedTenant(id, seed, size) { const t = seedRoles(EXT[id](SEEDERS[id](seed, size))); t.events = []; t.audit = [{ seq: 1, date: t.date, user: "System", cmd: "seed", text: `Ausgangszustand erzeugt (Seed ${seed}, Größe ${size})` }]; return t; }
function createWorld(opts) { opts = opts || {}; const w = { version: VERSION, seed: opts.seed == null ? 20261102 : opts.seed, size: opts.size || "S", tenants: {} }; for (const id of TENANT_IDS) w.tenants[id] = seedTenant(id, w.seed, w.size); return w; }
function resetTenant(w, id) { if (!SEEDERS[id]) fail("TENANT", "Unbekannter Mandant."); w.tenants[id] = seedTenant(id, w.seed, w.size); }
function resetAll(w) { for (const id of TENANT_IDS) resetTenant(w, id); }
function stableHash(obj) { return hashStr(JSON.stringify(obj)).toString(16).padStart(8, "0"); }
function tenantHash(t) { return stableHash({ users: t.users, docs: t.docs, stock: t.stock, inbox: t.inbox, so: t.salesOrders, po: t.purchaseOrders, prod: t.prodOrders, web: t.webOrders, te: t.timeEntries, ar: t.custInvoices, ap: t.supInvoices, co: t.co, date: t.date, periods: t.periods, sv: t.serviceOrders || null, ret: t.returns || null, abs: t.absences || null, mig: t.migration || null, emp: t.master.employees.length, cust: t.master.customers.length, assets: (t.master.assets || []).length }); }

/* ---------- Kennzahlen (immer aus Belegen und Nebenbüchern berechnet) ---------- */
function kpis(t) {
  const cur = periodOf(t.date); const last = HIST.filter(p => t.periods[p] === "closed").slice(-1)[0];
  const curPL = plOf(t, cur), lastPL = plOf(t, last), prevPL = plOf(t, HIST[HIST.indexOf(last) - 1]);
  const k = {
    period: cur, lastClosed: last, cash: balance(t, "1100"), arOpen: r2(t.custInvoices.reduce((a, i) => a + i.open, 0)), apOpen: r2(t.supInvoices.reduce((a, i) => a + i.open, 0)),
    revenueCur: curPL.revenue, grossMarginCur: curPL.grossMargin, revenueLast: lastPL.revenue, marginLastPct: lastPL.revenue ? r2(lastPL.ebit / lastPL.revenue * 100) : 0, marginPrevPct: prevPL.revenue ? r2(prevPL.ebit / prevPL.revenue * 100) : 0,
    inventory: r2(balance(t, "1300") + balance(t, "1310") + balance(t, "1320") + balance(t, "1330")),
    trend: HIST.concat([cur]).filter((p, i, a) => a.indexOf(p) === i).map(p => { const x = plOf(t, p); return { period: p, revenue: x.revenue, ebit: x.ebit }; })
  };
  if (t.id === "elevon") { k.openService = (t.serviceOrders || []).filter(s => !["abgerechnet", "abgeschlossen"].includes(s.status)).length; k.dueMaint = dueMaintenance(t).length; }
  if (t.id === "novamart") { k.returnRate = returnRate(t); k.openReturns = (t.returns || []).filter(r => r.status !== "erstattet").length; }
  k.openAbsences = (t.absences || []).filter(a => a.status === "beantragt").length;
  if (t.id === "elevon") { k.backlog = r2(t.salesOrders.filter(s => !["fakturiert", "erledigt"].includes(s.status)).reduce((a, s) => a + s.net, 0)); k.wip = balance(t, "1320"); k.openProd = t.prodOrders.filter(p => p.status !== "abgeschlossen").length; }
  if (t.id === "novamart") { k.onlineOrders = t.webOrders.length; k.reserved = Object.values(t.stock).reduce((a, s) => a + s.res, 0); k.belowRop = replenishmentProposals(t).length; }
  if (t.id === "aventra") { const ps = projectMetrics(t); k.unbilled = r2(ps.reduce((a, p) => a + p.unbilled, 0)); k.overBudget = ps.filter(p => p.eac > p.budget).length; const cap = t.master.employees.length * 160; const h = t.timeEntries.filter(e => e.period === last).reduce((a, e) => a + e.hours, 0); k.utilizationLast = r2(h / cap * 100); }
  return k;
}
function projectMetrics(t) {
  return t.projects.map(p => {
    const co = t.co[p.id] || { cost: 0, revenue: 0, hours: 0 }; const team = p.team.map(m => t.master.employees.find(e => e.id === m.employee)).filter(Boolean);
    const avgCost = team.length ? team.reduce((a, e) => a + e.costRate, 0) / team.length : 70;
    const unbilledEntries = t.timeEntries.filter(e => e.project === p.id && e.status === "freigegeben" && e.billable);
    const unbilled = r2(unbilledEntries.reduce((a, e) => a + e.hours * e.billRate, 0));
    const eac = r2(co.cost + p.etcHours * avgCost);
    const fcRevenue = r2(co.revenue + unbilled + p.etcHours * p.rate);
    return { id: p.id, name: p.name, customer: p.customer, budget: p.budget, planRevenue: p.planRevenue, actualCost: co.cost, actualRevenue: co.revenue, unbilled, hours: co.hours, etcHours: p.etcHours, eac, fcRevenue, marginPct: fcRevenue ? r2((fcRevenue - eac) / fcRevenue * 100) : 0, burn: r2(co.cost / p.budget * 100), status: p.status };
  });
}
function replenishmentProposals(t) {
  if (t.id !== "novamart") return [];
  const openPO = {}; for (const po of t.purchaseOrders) if (po.status !== "erledigt") for (const l of po.lines) openPO[l.mat] = (openPO[l.mat] || 0) + l.qty - (l.received || 0);
  const out = [];
  for (const a of t.master.articles) {
    const av = avail(t, a.id, "ZL1") + (openPO[a.id] || 0); if (av > a.rop) continue;
    const last8 = a.weekly.slice(-8), avg = last8.reduce((x, y) => x + y, 0) / 8, trend = (last8.slice(-4).reduce((x, y) => x + y, 0) - last8.slice(0, 4).reduce((x, y) => x + y, 0)) / 16;
    const fcWeek = Math.max(0, avg + trend * 2); const need = Math.ceil(fcWeek * (a.leadDays / 7 + 2)) + a.rop - av;
    out.push({ article: a.id, name: a.name, available: av, rop: a.rop, forecastWeek: r2(fcWeek), leadDays: a.leadDays, qty: Math.max(need, 1), supplier: a.supplier, basis: `Ø letzte 8 Wochen ${r2(avg)} Stk., Trend ${r2(trend)} Stk./Woche, Lieferzeit ${a.leadDays} Tage, Reichweite 2 Wochen` });
  }
  return out.sort((x, y) => (x.available - x.rop) - (y.available - y.rop));
}

/* ---------- Prozessinstanzen (Process Explorer) – abgeleitet aus Belegen ---------- */
function stepOf(name, role, state, docs, hint) { return { name, role, state, docs: docs || [], hint: hint || null }; }
function processInstancesBase(t) {
  const out = [];
  if (t.id === "elevon") for (const so of t.salesOrders) {
    const prod = t.prodOrders.find(p => p.so === so.no), pos = t.purchaseOrders.filter(p => p.so === so.no), inv = t.custInvoices.find(i => i.ref && i.ref.id === so.no);
    const st = (cond, prev) => cond ? "done" : prev ? "active" : "open";
    const s = [];
    s.push(stepOf("Angebot", "Sales Manager", so.quote ? "done" : "skipped", so.quote ? [so.quote] : [], so.quote ? null : so.link ? "Auftrag aus Partnerbestellung " + so.extPo : "Direktauftrag ohne Angebot"));
    s.push(stepOf("Kundenauftrag", "Sales Manager", "done", [so.no]));
    s.push(stepOf("Bedarfsermittlung", "Production Manager", st(!!so.mrp, true), so.mrp ? ["MRP " + so.no] : []));
    const needBuy = so.mrp && so.mrp.shortages.length > 0;
    s.push(stepOf("Einkauf", "Procurement Manager", !so.mrp ? "open" : !needBuy ? "skipped" : pos.length ? "done" : "active", pos.map(p => p.no), needBuy && !pos.length ? `${so.mrp.shortages.length} Fehlteile, Bestellung anlegen` : null));
    const allGr = pos.length > 0 && pos.every(p => p.status !== "bestellt");
    s.push(stepOf("Wareneingang", "Warehouse Manager", !needBuy ? (so.mrp ? "skipped" : "open") : allGr ? "done" : pos.length ? "active" : "open", pos.filter(p => p.grDoc).map(p => p.grDoc)));
    s.push(stepOf("Fertigung", "Production Manager", prod ? (prod.status === "abgeschlossen" ? "done" : "active") : "open", prod ? [prod.no].concat(prod.docs) : [], prod && prod.status === "freigegeben" ? "Materialverbrauch buchen" : null));
    s.push(stepOf("Lieferung", "Warehouse Manager", so.giDoc ? "done" : prod && prod.status === "abgeschlossen" ? "active" : "open", so.giDoc ? [so.giDoc] : []));
    s.push(stepOf("Montage", "Service Manager", so.installHours >= so.qty * E5.installHours ? "done" : so.giDoc ? "active" : "open", [], so.giDoc && so.installHours < so.qty * E5.installHours ? `Montagestunden ${so.installHours} von ${so.qty * E5.installHours}` : null));
    s.push(stepOf("Abnahme", "Service Manager", so.accepted ? "done" : so.installHours >= so.qty * E5.installHours ? "active" : "open", so.accepted ? ["Abnahmeprotokoll " + so.no] : []));
    s.push(stepOf("Rechnung", "CFO", inv ? "done" : so.accepted ? "active" : "open", inv ? [inv.no, inv.docNo] : []));
    s.push(stepOf("Zahlung", "CFO", inv && inv.status === "bezahlt" ? "done" : inv ? "active" : "open", inv && inv.paidDoc ? [inv.paidDoc] : []));
    s.push(stepOf("Ergebnis", "Controller", inv && inv.status === "bezahlt" ? "done" : "open", []));
    out.push({ id: so.no, chain: "Lead-to-Cash mit Fertigung und Installation", title: `${so.no} · ${so.qty} × ${E5.name.split(",")[0]} · ${customerName(t, so.customer)}`, steps: s, object: so });
  }
  if (t.id === "novamart") for (const o of t.webOrders) {
    const d = x => x ? "done" : "open"; const s = [];
    s.push(stepOf("Bestellung", "E-Commerce Manager", "done", [o.no]));
    s.push(stepOf("Verfügbarkeit", "System", "done", [`${o.availableAtOrder} verfügbar`]));
    s.push(stepOf("Preis und Rabatt", "System", "done", [`${o.qty} × ${o.unitPrice} € − ${o.discountPct} %`]));
    s.push(stepOf("Zahlung autorisiert", "Zahlungsdienstleister", "done", [o.authId]));
    s.push(stepOf("Reservierung", "System", o.status === "storniert" ? "error" : "done", [`${o.qty} Stk. ZL1`]));
    s.push(stepOf("Kommissionierung", "Warehouse Manager", o.picked ? "done" : "active", o.task ? [o.task] : []));
    s.push(stepOf("Versand", "Warehouse Manager", o.giDoc ? "done" : o.picked ? "active" : "open", o.giDoc ? [o.giDoc] : []));
    s.push(stepOf("Zustellung", "Logistikpartner", o.delivered ? "done" : o.giDoc ? "active" : "open", []));
    s.push(stepOf("Rechnung", "System", o.invoice ? "done" : o.delivered ? "active" : "open", o.invoice ? [o.invoice, o.invDoc] : []));
    s.push(stepOf("Zahlungsabgleich", "CFO", o.settled ? "done" : o.invoice ? "active" : "open", o.settleDoc ? [o.settleDoc] : []));
    s.push(stepOf("Umsatz und Marge", "Controller", d(o.settled), []));
    out.push({ id: o.no, chain: "Retail Order-to-Cash", title: `${o.no} · ${o.qty} × ${articleName(t, o.article)}`, steps: s, object: o });
  }
  if (t.id === "aventra") for (const pm of projectMetrics(t).filter(p => p.id === "P-1001" || t.projects.find(x => x.id === p.id).live)) {
    const p = t.projects.find(x => x.id === pm.id); const te = t.timeEntries.filter(e => e.project === p.id && e.period === periodOf(t.date));
    const rec = te.length > 0, appr = te.some(e => e.status !== "erfasst"), billed = te.some(e => e.status === "abgerechnet");
    const inv = t.custInvoices.filter(i => i.ref && i.ref.id === p.id && i.period === periodOf(t.date)).slice(-1)[0];
    const s = [stepOf("Projekt", "Project Manager", "done", [p.id]), stepOf("Staffing", "Project Manager", "done", p.team.map(m => m.employee)),
      stepOf("Zeiten erfasst", "Berater", rec ? "done" : "active", te.map(e => e.id)), stepOf("Zeiten freigegeben", "Project Manager", te.length && te.every(e => e.status !== "erfasst") ? "done" : rec ? "active" : "open", te.filter(e => e.status !== "erfasst").map(e => e.id), te.some(e => e.status === "erfasst") ? `${te.filter(e => e.status === "erfasst").length} Zeiten warten auf Freigabe` : null),
      stepOf("Projektkosten", "Controller", appr ? "done" : "open", []), stepOf("Abrechnung", "Project Manager", billed ? "done" : appr ? "active" : "open", []),
      stepOf("Rechnung", "CFO", inv ? "done" : "open", inv ? [inv.no, inv.docNo] : []), stepOf("Zahlung", "CFO", inv && inv.status === "bezahlt" ? "done" : inv ? "active" : "open", inv && inv.paidDoc ? [inv.paidDoc] : []),
      stepOf("Projektmarge", "Controller", pm.eac > pm.budget ? "error" : "done", [], pm.eac > pm.budget ? `Prognose ${Math.round(pm.eac)} € über Budget ${p.budget} €` : null)];
    out.push({ id: p.id, chain: "Project-to-Cash", title: `${p.id} · ${p.name}`, steps: s, object: pm });
  }
  return out;
}
function processInstances(t) {
  const out = processInstancesBase(t).filter(i => !(i.object && i.object.channel === "Click & Collect"));
  if (t.id === "novamart") {
    for (const o of t.webOrders.filter(x => x.channel === "Click & Collect")) { const s = [stepOf("Onlinebestellung", "E-Commerce Manager", "done", [o.no]), stepOf("Filialbestand geprüft", "System", "done", [o.availableAtOrder + " Stk. in " + o.store]), stepOf("Reservierung", "System", "done", []), stepOf("Bereitstellung", "Filialleitung", o.picked ? "done" : "active", []), stepOf("Abholbenachrichtigung", "System", o.notified ? "done" : "open", o.notified ? ["SMS/E-Mail " + o.notified] : []), stepOf("Übergabe", "Filialleitung", o.giDoc ? "done" : o.picked ? "active" : "open", o.giDoc ? [o.giDoc] : []), stepOf("Rechnung", "System", o.invoice ? "done" : o.delivered ? "active" : "open", o.invoice ? [o.invoice, o.invDoc] : []), stepOf("Zahlungsabgleich", "CFO", o.settled ? "done" : o.invoice ? "active" : "open", o.settleDoc ? [o.settleDoc] : [])];
      out.push({ id: o.no, chain: "Click & Collect", title: `${o.no} · ${o.qty} × ${articleName(t, o.article)} · Abholung ${o.store}`, steps: s, object: o }); }
    for (const r of t.returns || []) { const s = [stepOf("Retoure angemeldet", "Kunde", "done", [r.no]), stepOf("Prüfung", "Warehouse Manager", r.decision ? "done" : "active", r.decision ? [r.decision] : []), stepOf("Bestandsentscheidung", "Warehouse Manager", r.decision ? "done" : "open", []), stepOf("Gutschrift", "CFO", r.credit ? "done" : r.decision ? "active" : "open", r.credit ? [r.credit] : []), stepOf("Rückzahlung", "CFO", r.status === "erstattet" ? "done" : r.credit ? "active" : "open", []), stepOf("Finanzbuchung", "Controller", r.status === "erstattet" ? "done" : "open", [])];
      out.push({ id: r.no, chain: "Returns", title: `${r.no} · ${r.qty} × ${articleName(t, r.article)} · ${r.reason}`, steps: s, object: r }); }
  }
  if (t.id === "elevon") {
    for (const so of t.serviceOrders || []) { const a = t.master.assets.find(x => x.id === so.asset) || {}; const st = so.status; const s = [stepOf(so.type === "Wartung" ? "Wartungsplan fällig" : "Störung gemeldet", so.type === "Wartung" ? "System" : "Kunde", "done", [so.no]), stepOf("Anlage identifiziert", "Service Manager", "done", [a.id || so.asset]), stepOf("Vertrag geprüft", "Service Manager", "done", [so.contract]), stepOf("Techniker eingeplant", "Service Manager", so.tech ? "done" : "active", so.tech ? [so.tech] : []), stepOf("Ersatzteile reserviert", "Service Manager", so.parts.length ? "done" : so.status === "offen" || so.status === "eingeplant" ? "skipped" : "skipped", so.parts.map(p => p.qty + " × " + p.mat)), stepOf("Ausführung", "Servicetechniker", ["ausgeführt", "abgerechnet", "abgeschlossen"].includes(st) ? "done" : so.tech ? "active" : "open", []), stepOf("Servicebericht", "Servicetechniker", so.report ? "done" : "open", so.report ? ["Bericht " + so.no] : []), stepOf("Abrechnung", "CFO", ["abgerechnet", "abgeschlossen"].includes(st) ? "done" : st === "ausgeführt" ? "active" : "open", so.invoice ? [so.invoice] : so.billing ? [so.billing] : []), stepOf("Kosten und Erlöse", "Controller", ["abgerechnet", "abgeschlossen"].includes(st) ? "done" : "open", [])];
      out.push({ id: so.no, chain: so.type === "Wartung" ? "Maintain-to-Operate" : "Service-to-Cash", title: `${so.no} · ${a.name || so.asset} · ${so.contract}`, steps: s, object: so }); }
    if (t.migration) { const M = t.migration; const s = [stepOf("Testmigration", "Migration Manager", M.tested ? (MIG_OBJECTS.every(o => M.tests[o] && M.tests[o].errors === 0) ? "done" : "error") : "active", [], M.tested && !MIG_OBJECTS.every(o => M.tests[o].errors === 0) ? "Fehler im Testlauf: Regeln anpassen und erneut testen" : null), stepOf("Freigabe", "CEO", M.approval ? (M.approval.status === "freigegeben" ? "done" : "active") : "open", [])].concat(MIG_OBJECTS.map(o => stepOf(MIG_LABEL[o], "CFO", M.done[o] ? "done" : M.approval && M.approval.status === "freigegeben" ? "active" : "open", M.done[o] ? [M.done[o].loaded + " Sätze"] : []))).concat([stepOf("Go/No-Go", "CEO", M.goLive === "Go" ? "done" : M.goLive === "No-Go" ? "error" : "open", [])]);
      out.push({ id: "MIG-LN", chain: "Datenmigration und Cutover", title: "Übernahme Liftservice Nord GmbH", steps: s, object: M }); }
  }
  return out;
}
const customerName = (t, id) => (t.master.customers.find(c => c.id === id) || { name: id }).name;
const supplierName = (t, id) => (t.master.suppliers.find(c => c.id === id) || { name: id }).name;
const articleName = (t, id) => (t.master.articles.find(c => c.id === id) || { name: id }).name;
const materialOf = (t, id) => t.master.materials ? t.master.materials.find(m => m.id === id) : null;

/* ---------- Befehle ---------- */
const roleOf = (t, u) => t.roles.find(r => r.id === u.role);
function need(t, ctx, perm) {
  const u = (t.users || []).find(x => x.id === ctx.user) || t.users[0]; const r = roleOf(t, u);
  if (u.active === false && !ctx.auto) fail("INACTIVE", `Der Account ${u.name} ist geschlossen.`);
  if (u.active !== false && r.perms.includes(perm)) return u;
  if (ctx.auto) { const alt = t.users.find(x => roleOf(t, x).perms.includes(perm)); if (alt) { ctx.user = alt.id; ctx.userName = alt.name; return alt; } }
  fail("FORBIDDEN", `${u.name} (${r.name}) hat keine Berechtigung für diese Aktion (${PERM_TXT[perm] || perm}).`);
}
const PERM_TXT = { post: "Buchen", pay: "Zahlen", approve: "Freigeben", close: "Periodenabschluss", sell: "Verkaufen", buy: "Einkaufen", produce: "Fertigen", ship: "Versenden", receive: "Wareneingang", install: "Montage", staff: "Staffing", time: "Zeiterfassung", bill: "Fakturieren", view: "Ansehen" };
const find = (arr, key, val, what) => { const x = arr.find(o => o[key] === val); if (!x) fail("NOT_FOUND", `${what} ${val} nicht gefunden.`); return x; };

const CMD = {
  /* --- allgemein --- */
  advanceDate(w, t, p) { const d = Math.max(1, Math.min(31, p.days || 1)); let nd = addDays(t.date, d); if (t.periods[periodOf(nd)] !== "open") fail("PERIOD_CLOSED", `Periode ${periodOf(nd)} ist nicht offen. Zuerst Monatsabschluss durchführen.`); t.date = nd; return { text: `Geschäftsdatum ${nd}` }; },
  closePeriod(w, t, p, ctx) {
    need(t, ctx, "close"); const per = periodOf(t.date);
    const payroll = t.id === "aventra" ? r2(t.master.employees.reduce((a, e) => a + e.costRate * 160, 0)) : t.id === "elevon" ? r2(SIZES[t.size].elevon.emp * 3400) : r2(SIZES[t.size].novamart.emp * 3100);
    const already = t.docs.some(d => d.period === per && d.text === "Gehälter " + per);
    const docs = [];
    if (!already) docs.push(post(t, { date: per + "-28", text: "Gehälter " + per, user: ctx.userName, lines: [{ acct: "6000", dr: payroll }, { acct: "1100", cr: payroll }] }).no);
    t.periods[per] = "closed"; const np = nextPeriod(per); t.periods[np] = "open"; t.date = np + "-01";
    return { text: `Periode ${per} abgeschlossen, Geschäftsdatum ${t.date}`, docs };
  },
  receivePayment(w, t, p, ctx) {
    need(t, ctx, "post"); const inv = find(t.custInvoices, "no", p.invoiceNo, "Rechnung"); if (inv.open <= 0) fail("CLEARED", `Rechnung ${inv.no} ist bereits ausgeglichen.`);
    const amt = r2(p.amount == null ? inv.open : p.amount); if (amt <= 0 || amt > inv.open + 0.001) fail("AMOUNT", `Betrag muss zwischen 0 und ${inv.open} liegen.`);
    const d = post(t, { date: t.date, text: "Zahlungseingang " + inv.no, user: ctx.userName, ref: { type: "custInvoice", id: inv.no }, lines: [{ acct: "1100", dr: amt }, { acct: "1200", cr: amt }] });
    inv.open = r2(inv.open - amt); if (inv.open === 0) { inv.status = "bezahlt"; inv.paidDoc = d.no; }
    const wo = t.webOrders && t.webOrders.find(o => o.invoice === inv.no); void wo;
    return { text: `Zahlungseingang ${amt} € zu ${inv.no}`, docs: [d.no] };
  },
  createPO(w, t, p, ctx) {
    need(t, ctx, "buy"); const sup = find(t.master.suppliers, "id", p.supplierId, "Lieferant");
    if (!p.lines || !p.lines.length) fail("LINES", "Bestellung ohne Positionen.");
    const lines = p.lines.map(l => ({ mat: l.mat, qty: l.qty, price: r2(l.price), received: 0, invoiced: 0, kind: l.kind || "Material" }));
    if (lines.some(l => !(l.qty > 0) || !(l.price >= 0))) fail("LINES", "Menge und Preis müssen positiv sein.");
    const po = { no: nextNo(t, "PO"), supplier: sup.id, date: t.date, lines, status: "bestellt", so: p.so || null, net: r2(lines.reduce((a, l) => a + l.qty * l.price, 0)), link: null, wh: p.wh || (t.id === "novamart" ? "ZL1" : "WH1") };
    t.purchaseOrders.push(po);
    if (sup.link) { po.link = { tenant: sup.link.tenant }; send(w, t.id, sup.link.tenant, { type: "customerOrder", poNo: po.no, partnerId: sup.link.partnerId, lines: po.lines.map(l => ({ mat: l.mat, qty: l.qty, price: l.price })), text: `Bestellung ${po.no} von ${t.name}` }); }
    return { text: `Bestellung ${po.no} an ${sup.name} (${po.net} €), keine Buchung`, objects: [po.no] };
  },
  postGoodsReceipt(w, t, p, ctx) {
    need(t, ctx, "receive"); const po = find(t.purchaseOrders, "no", p.poNo, "Bestellung"); if (po.status !== "bestellt" && po.status !== "teilgeliefert") fail("STATUS", `Bestellung ${po.no} hat Status „${po.status}“.`);
    const lines = []; let value = 0;
    for (const l of po.lines) { const q = l.qty - l.received; if (q <= 0) continue; const v = r2(q * l.price); value += v; l.received += q;
      if (l.kind === "Anlage") lines.push({ acct: "0700", dr: v });
      else if (l.kind === "Sachkosten") lines.push({ acct: l.acct || "6800", dr: v, cc: l.costCenter || null });
      else if (l.kind === "Lohnbearbeitung") { const pa = t.prodOrders.find(x => x.no === l.prod); const op = pa && pa.ops.find(o => o.no === l.op);
        if (!op || op.status !== "beim Lohnbearbeiter") fail("STATUS", "Wareneingang Lohnbearbeitung erst, wenn die Baugruppen an den Lohnbearbeiter versandt wurden.");
        lines.push({ acct: "1320", dr: v }); pa.wip = r2(pa.wip + v); pa.ext = r2(pa.ext + v); op.status = "erledigt"; op.cost = v; }
      else { moveIn(t, l.mat, po.wh, q, v); lines.push({ acct: t.id === "novamart" ? "1310" : "1300", dr: v }); } }
    lines.push({ acct: "1700", cr: r2(value) });
    const d = post(t, { date: t.date, text: "Wareneingang " + po.no, user: ctx.userName, ref: { type: "purchaseOrder", id: po.no }, lines });
    po.status = "geliefert"; po.grDoc = d.no; return { text: `Wareneingang zu ${po.no}: Bestand und WE/RE-Verrechnung ${r2(value)} €`, docs: [d.no] };
  },
  postSupplierInvoice(w, t, p, ctx) {
    need(t, ctx, "post");
    if (p.poNo) {
      const po = find(t.purchaseOrders, "no", p.poNo, "Bestellung"); const net = r2(p.net == null ? po.lines.reduce((a, l) => a + (l.received - l.invoiced) * l.price, 0) : p.net);
      const grValue = r2(po.lines.reduce((a, l) => a + (l.received - l.invoiced) * l.price, 0));
      if (grValue <= 0) fail("THREE_WAY", `Keine berechenbare Wareneingangsmenge zu ${po.no}: Rechnung erst nach Wareneingang buchbar.`);
      if (Math.abs(net - grValue) > 0.01) fail("THREE_WAY", `Drei-Wege-Abgleich: Rechnung ${net} € ≠ Wareneingang × Bestellpreis ${grValue} €.`);
      const tax = r2(net * VAT), gross = r2(net + tax), no = nextNo(t, "AP", periodOf(t.date));
      const d = post(t, { date: t.date, text: "Eingangsrechnung " + (p.extNo || no) + " zu " + po.no, user: ctx.userName, ref: { type: "supInvoice", id: no }, lines: [{ acct: "1700", dr: net }, { acct: "1500", dr: tax }, { acct: "1600", cr: gross }] });
      po.lines.forEach(l => l.invoiced = l.received); if (po.lines.every(l => l.invoiced >= l.qty)) po.status = "erledigt";
      const inv = { no, extNo: p.extNo || null, partnerId: po.supplier, date: t.date, period: periodOf(t.date), net, tax, gross, open: gross, status: "offen", docNo: d.no, poNo: po.no, link: p.link || null, text: "Eingangsrechnung zu " + po.no };
      t.supInvoices.push(inv); return { text: `Eingangsrechnung ${no} gebucht (Drei-Wege-Abgleich ok)`, docs: [d.no] };
    }
    const net = r2(p.net); if (!(net > 0)) fail("AMOUNT", "Nettobetrag fehlt.");
    const tax = r2(net * VAT), gross = r2(net + tax), no = nextNo(t, "AP", periodOf(t.date));
    const d = post(t, { date: t.date, text: (p.text || "Eingangsrechnung") + " " + (p.extNo || no), user: ctx.userName, ref: { type: "supInvoice", id: no }, lines: [{ acct: p.expAcct || "6800", dr: net }, { acct: "1500", dr: tax }, { acct: "1600", cr: gross }] });
    const inv = { no, extNo: p.extNo || null, partnerId: p.partnerId, date: t.date, period: periodOf(t.date), net, tax, gross, open: gross, status: "offen", docNo: d.no, link: p.link || null, text: p.text || "" };
    t.supInvoices.push(inv); return { text: `Eingangsrechnung ${no} über ${gross} € gebucht`, docs: [d.no] };
  },
  payVendor(w, t, p, ctx) {
    need(t, ctx, "pay"); const inv = find(t.supInvoices, "no", p.invoiceNo, "Eingangsrechnung"); if (inv.open <= 0) fail("CLEARED", `${inv.no} ist bereits bezahlt.`);
    const d = post(t, { date: t.date, text: "Zahlung " + (inv.extNo || inv.no), user: ctx.userName, ref: { type: "supInvoice", id: inv.no }, lines: [{ acct: "1600", dr: inv.open }, { acct: "1100", cr: inv.open }] });
    const amt = inv.open; inv.open = 0; inv.status = "bezahlt"; inv.paidDoc = d.no;
    if (inv.link && inv.extNo) send(w, t.id, inv.link.tenant, { type: "paymentAdvice", invoiceNo: inv.extNo, amount: amt, text: `Zahlungsavis ${t.name}: ${amt} € zu ${inv.extNo}` });
    return { text: `Zahlung ${amt} € an ${supplierName(t, inv.partnerId)}`, docs: [d.no] };
  },
  processInbox(w, t, p, ctx) {
    need(t, ctx, "view"); const m = find(t.inbox, "id", p.id, "Eingang"); if (m.status !== "offen") fail("DONE", "Eingang ist bereits erledigt.");
    let r;
    if (m.type === "supplierInvoice") { const po = m.poNo ? t.purchaseOrders.find(x => x.link && x.no === m.poNo) : null; const sup = t.master.suppliers.find(s => s.link && s.link.tenant === m.from);
      r = po ? CMD.postSupplierInvoice(w, t, { poNo: po.no, net: m.net, extNo: m.invoiceNo, link: { tenant: m.from } }, ctx) : CMD.postSupplierInvoice(w, t, { partnerId: sup.id, net: m.net, extNo: m.invoiceNo, text: m.text, expAcct: m.expAcct || "6800", link: { tenant: m.from } }, ctx); }
    else if (m.type === "paymentAdvice") { const inv = t.custInvoices.find(i => i.no === m.invoiceNo); if (!inv) fail("NOT_FOUND", `Rechnung ${m.invoiceNo} existiert nicht (mehr) – Zahlungsavis nicht zuordenbar.`); r = CMD.receivePayment(w, t, { invoiceNo: inv.no, amount: m.amount }, ctx); }
    else if (m.type === "customerOrder") r = CMD.createSalesOrder(w, t, { customerId: m.partnerId, qty: m.lines[0].qty, unitPrice: m.lines[0].price, extPo: m.poNo, link: { tenant: m.from, poNo: m.poNo } }, ctx);
    else if (m.type === "delivery") { const po = find(t.purchaseOrders, "no", m.poNo, "Bestellung"); r = CMD.postGoodsReceipt(w, t, { poNo: po.no }, ctx); }
    else fail("TYPE", "Unbekannter Eingangstyp.");
    m.status = "erledigt"; m.doneBy = ctx.userName; return r;
  },

  /* --- Elevon: Lead-to-Cash mit Fertigung --- */
  createQuote(w, t, p, ctx) {
    need(t, ctx, "sell"); const c = find(t.master.customers, "id", p.customerId, "Kunde"); const qty = p.qty | 0; if (qty < 1) fail("QTY", "Menge muss mindestens 1 sein.");
    const disc = Math.max(0, Math.min(25, p.discountPct || 0)); const unit = r2(E5.listPrice * (1 - disc / 100));
    const cost = costing(t, qty); const q = { no: nextNo(t, "QT"), customer: c.id, date: t.date, product: "P-E5", qty, discountPct: disc, unitPrice: unit, net: r2(unit * qty), cost, status: disc > 5 ? "zur Freigabe" : "freigegeben", requirements: p.requirements || "" };
    t.quotes.push(q); return { text: `Angebot ${q.no}: ${qty} × ${unit} € = ${q.net} €, kalkulierte Marge ${r2((q.net - cost.total) / q.net * 100)} %${q.status === "zur Freigabe" ? ", Freigabe nötig (Rabatt > 5 %)" : ""}`, objects: [q.no] };
  },
  approveQuote(w, t, p, ctx) { need(t, ctx, "approve"); const q = find(t.quotes, "no", p.quoteNo, "Angebot"); if (q.status !== "zur Freigabe") fail("STATUS", `Angebot ${q.no} hat Status „${q.status}“.`); q.status = "freigegeben"; q.approvedBy = ctx.userName; return { text: `Angebot ${q.no} freigegeben` }; },
  createSalesOrder(w, t, p, ctx) {
    let qty, unit, customer, quote = null;
    if (p.quoteNo) { need(t, ctx, "sell"); const q = find(t.quotes, "no", p.quoteNo, "Angebot"); if (q.status !== "freigegeben") fail("STATUS", `Angebot ${q.no} ist nicht freigegeben.`); qty = q.qty; unit = q.unitPrice; customer = q.customer; quote = q.no; q.status = "beauftragt"; }
    else { customer = p.customerId; qty = p.qty; unit = r2(p.unitPrice); find(t.master.customers, "id", customer, "Kunde"); }
    const so = { no: nextNo(t, "SO"), customer, date: t.date, product: "P-E5", qty, unitPrice: unit, net: r2(unit * qty), status: "bestätigt", quote, mrp: null, installHours: 0, accepted: false, giDoc: null, link: p.link || null, extPo: p.extPo || null };
    t.salesOrders.push(so); t.co[so.no] = { cost: 0, revenue: 0, install: 0 };
    return { text: `Kundenauftrag ${so.no} über ${so.net} € bestätigt – keine Buchung, kein Zahlungseingang`, objects: [so.no] };
  },
  runMRP(w, t, p, ctx) {
    need(t, ctx, "produce"); const so = find(t.salesOrders, "no", p.soNo, "Kundenauftrag"); if (so.mrp) fail("DONE", "Bedarfsermittlung wurde bereits durchgeführt.");
    const needs = E5_BOM.map(([mat, per]) => { const req = per * so.qty, av = avail(t, mat, "WH1"); return { mat, name: materialOf(t, mat).name, required: req, available: av, shortage: Math.max(0, req - av) }; });
    const prod = { no: nextNo(t, "PA"), so: so.no, product: "P-E5", qty: so.qty, status: "eröffnet", components: needs.map(n => ({ mat: n.mat, qty: n.required, issued: 0 })), labor: 0, docs: [], wip: 0 };
    t.prodOrders.push(prod); so.mrp = { date: t.date, needs, shortages: needs.filter(n => n.shortage > 0) }; so.status = "in Planung";
    return { text: `Bedarf ermittelt: ${so.mrp.shortages.length} Fehlteile, Fertigungsauftrag ${prod.no} eröffnet`, objects: [prod.no] };
  },
  createPOsFromMRP(w, t, p, ctx) {
    const so = find(t.salesOrders, "no", p.soNo, "Kundenauftrag"); if (!so.mrp) fail("ORDER", "Zuerst Bedarf ermitteln."); if (t.purchaseOrders.some(x => x.so === so.no)) fail("DONE", "Bestellungen existieren bereits.");
    const bySup = {}; for (const s of so.mrp.shortages) { const m = materialOf(t, s.mat); (bySup[m.supplier] = bySup[m.supplier] || []).push({ mat: s.mat, qty: s.shortage, price: m.price }); }
    const nos = []; for (const [sup, lines] of Object.entries(bySup)) nos.push(CMD.createPO(w, t, { supplierId: sup, lines, so: so.no }, ctx).objects[0]);
    return { text: `${nos.length} Bestellung(en) angelegt: ${nos.join(", ")}`, objects: nos };
  },
  releaseProdOrder(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.status !== "eröffnet") fail("STATUS", `Status „${pa.status}“.`);
    const missing = pa.components.filter(c => avail(t, c.mat, "WH1") < c.qty);
    if (missing.length) fail("AVAILABILITY", `Verfügbarkeitsprüfung: ${missing.map(c => materialOf(t, c.mat).name + " fehlt " + (c.qty - avail(t, c.mat, "WH1"))).join(", ")}.`);
    for (const c of pa.components) stk(t, c.mat, "WH1").res += c.qty;
    pa.status = "freigegeben"; return { text: `Fertigungsauftrag ${pa.no} freigegeben, Komponenten reserviert` };
  },
  postConsumption(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.status !== "freigegeben") fail("STATUS", "Fertigungsauftrag muss freigegeben sein.");
    let v = 0; for (const c of pa.components) { const q = c.qty - c.issued; if (q > 0) { v += moveOut(t, c.mat, "WH1", q, true); c.issued += q; } }
    const d = post(t, { date: t.date, text: "Materialverbrauch " + pa.no, user: ctx.userName, ref: { type: "prodOrder", id: pa.no }, lines: [{ acct: "1320", dr: r2(v) }, { acct: "1300", cr: r2(v) }] });
    pa.wip = r2(pa.wip + v); pa.docs.push(d.no); pa.status = "in Fertigung"; return { text: `Materialverbrauch ${r2(v)} € auf unfertige Erzeugnisse`, docs: [d.no] };
  },
  confirmProduction(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.status !== "in Fertigung") fail("STATUS", "Zuerst Material verbrauchen.");
    const h = p.hours || E5.assemblyHours * pa.qty; const v = r2(h * E5.laborRate);
    const d = post(t, { date: t.date, text: `Rückmeldung ${pa.no}: ${h} h Montage`, user: ctx.userName, ref: { type: "prodOrder", id: pa.no }, lines: [{ acct: "1320", dr: v }, { acct: "6990", cr: v }] });
    pa.labor = r2(pa.labor + v); pa.wip = r2(pa.wip + v); pa.docs.push(d.no); pa.status = "rückgemeldet"; return { text: `Fertigungsleistung ${v} € (${h} h × ${E5.laborRate} €)`, docs: [d.no] };
  },
  completeProduction(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.status !== "rückgemeldet") fail("STATUS", "Zuerst Fertigung rückmelden.");
    const v = pa.wip; moveIn(t, "P-E5", "WH2", pa.qty, v);
    const d = post(t, { date: t.date, text: `Ablieferung ${pa.no}: ${pa.qty} Anlagen`, user: ctx.userName, ref: { type: "prodOrder", id: pa.no }, lines: [{ acct: "1330", dr: v }, { acct: "1320", cr: v }] });
    pa.docs.push(d.no); pa.status = "abgeschlossen"; pa.wip = 0; pa.unitCost = r2(v / pa.qty);
    const so = t.salesOrders.find(s => s.no === pa.so); if (so) { so.status = "produziert"; stk(t, "P-E5", "WH2").res += pa.qty; }
    return { text: `${pa.qty} Anlagen zu Herstellkosten ${v} € ins Fertigwarenlager`, docs: [d.no] };
  },
  postGoodsIssue(w, t, p, ctx) {
    need(t, ctx, "ship"); const so = find(t.salesOrders, "no", p.soNo, "Kundenauftrag"); if (so.status !== "produziert") fail("STATUS", "Auftrag ist noch nicht produziert.");
    const v = moveOut(t, "P-E5", "WH2", so.qty, true);
    const d = post(t, { date: t.date, text: `Warenausgang ${so.no}`, user: ctx.userName, ref: { type: "salesOrder", id: so.no }, lines: [{ acct: "5000", dr: v }, { acct: "1330", cr: v }] });
    so.giDoc = d.no; so.status = "geliefert"; t.co[so.no].cost = r2(t.co[so.no].cost + v);
    if (so.link) send(w, t.id, so.link.tenant, { type: "delivery", poNo: so.link.poNo, qty: so.qty, text: `Lieferung ${so.qty} Anlagen zu Bestellung ${so.link.poNo}` });
    return { text: `Warenausgang: Wareneinsatz ${v} €, Fertigwarenbestand reduziert`, docs: [d.no] };
  },
  recordInstallation(w, t, p, ctx) {
    need(t, ctx, "install"); const so = find(t.salesOrders, "no", p.soNo, "Kundenauftrag"); if (so.status !== "geliefert") fail("STATUS", "Montage erst nach Lieferung.");
    const h = p.hours || so.qty * E5.installHours; const c = r2(h * E5.installRate); so.installHours += h; t.co[so.no].install = r2(t.co[so.no].install + c); t.co[so.no].cost = r2(t.co[so.no].cost + c);
    return { text: `Montage ${h} h erfasst: Projektkosten +${c} € (Kostenrechnung, keine Finanzbuchung)` };
  },
  confirmAcceptance(w, t, p, ctx) { need(t, ctx, "install"); const so = find(t.salesOrders, "no", p.soNo, "Kundenauftrag"); if (so.installHours < so.qty * E5.installHours) fail("STATUS", "Montage noch nicht vollständig."); so.accepted = true; so.acceptDate = t.date; so.status = "abgenommen"; return { text: `Abnahme ${so.no} dokumentiert – Umsatz jetzt realisierbar` }; },
  invoiceSalesOrder(w, t, p, ctx) {
    need(t, ctx, "post"); const so = find(t.salesOrders, "no", p.soNo, "Kundenauftrag"); if (!so.accepted) fail("STATUS", "Rechnung erst nach Abnahme."); if (so.status === "fakturiert") fail("DONE", "Bereits fakturiert.");
    const tax = r2(so.net * VAT), gross = r2(so.net + tax), no = nextNo(t, "AR", periodOf(t.date));
    const d = post(t, { date: t.date, text: "Rechnung " + no + " zu " + so.no, user: ctx.userName, ref: { type: "custInvoice", id: no }, lines: [{ acct: "1200", dr: gross }, { acct: "4000", cr: so.net }, { acct: "1776", cr: tax }] });
    t.custInvoices.push({ no, partnerId: so.customer, date: t.date, period: periodOf(t.date), net: so.net, tax, gross, open: gross, status: "offen", ref: { type: "salesOrder", id: so.no }, docNo: d.no, link: so.link ? { tenant: so.link.tenant } : null, text: "Rechnung " + so.no });
    so.status = "fakturiert"; t.co[so.no].revenue = so.net;
    if (so.link) send(w, t.id, so.link.tenant, { type: "supplierInvoice", invoiceNo: no, poNo: so.link.poNo, net: so.net, text: `Rechnung ${no} von ${t.name}` });
    return { text: `Rechnung ${no}: Forderung ${gross} €, Umsatz ${so.net} €`, docs: [d.no] };
  },

  /* --- NovaMart: Retail Order-to-Cash --- */
  placeWebOrder(w, t, p, ctx) {
    need(t, ctx, "sell"); const a = find(t.master.articles, "id", p.articleId, "Artikel"); const c = find(t.master.customers, "id", p.customerId || "C-ONLINE", "Kunde"); const qty = p.qty | 0; if (qty < 1) fail("QTY", "Menge muss mindestens 1 sein.");
    const av = avail(t, a.id, "ZL1"); if (av < qty) fail("AVAILABILITY", `Nicht verfügbar: ${av} Stk. frei, ${qty} bestellt.`);
    const disc = Math.max(0, Math.min(30, (p.couponPct || 0) + (c.loyalty ? 3 : 0)));
    const gross = r2(a.price * qty * (1 - disc / 100)); const net = r2(gross / (1 + VAT));
    stk(t, a.id, "ZL1").res += qty;
    const o = { no: nextNo(t, "WO"), channel: "Online", wh: "ZL1", customer: c.id, article: a.id, qty, unitPrice: a.price, discountPct: disc, gross, net, tax: r2(gross - net), date: t.date, authId: "AUTH-" + nextNo(t, "AU").slice(3), status: "reserviert", availableAtOrder: av, picked: false, giDoc: null, delivered: false, invoice: null, settled: false };
    t.webOrders.push(o); return { text: `Onlinebestellung ${o.no}: ${qty} × ${a.name}, ${gross} € brutto, Zahlung autorisiert, Bestand reserviert – keine Buchung`, objects: [o.no] };
  },
  pickOrder(w, t, p, ctx) { need(t, ctx, "ship"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (o.picked) fail("DONE", "Bereits kommissioniert."); o.task = nextNo(t, "LA"); o.picked = true; o.status = "kommissioniert"; return { text: `Lagerauftrag ${o.task} kommissioniert` }; },
  shipOrder(w, t, p, ctx) {
    need(t, ctx, "ship"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (!o.picked) fail("STATUS", "Zuerst kommissionieren."); if (o.giDoc) fail("DONE", "Bereits versandt.");
    if (o.channel === "Click & Collect") fail("STATUS", "Click & Collect wird in der Filiale übergeben."); const v = moveOut(t, o.article, o.wh || "ZL1", o.qty, true); const d = post(t, { date: t.date, text: "Warenausgang " + o.no, user: ctx.userName, ref: { type: "webOrder", id: o.no }, lines: [{ acct: "5000", dr: v }, { acct: "1310", cr: v }] });
    o.giDoc = d.no; o.cogs = v; o.status = "versandt"; return { text: `Versand: Bestand −${o.qty}, Wareneinsatz ${v} €`, docs: [d.no] };
  },
  confirmDelivery(w, t, p, ctx) { const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (!o.giDoc) fail("STATUS", "Noch nicht versandt."); o.delivered = true; o.status = "zugestellt"; return { text: `Zustellung ${o.no} bestätigt` }; },
  invoiceWebOrder(w, t, p, ctx) {
    need(t, ctx, "sell"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (!o.delivered) fail("STATUS", "Rechnung nach Zustellung."); if (o.invoice) fail("DONE", "Bereits fakturiert.");
    const no = nextNo(t, "AR", periodOf(t.date)); const d = post(t, { date: t.date, text: "Rechnung " + no + " zu " + o.no, user: ctx.userName, ref: { type: "webOrder", id: o.no }, lines: [{ acct: "1590", dr: o.gross }, { acct: "4000", cr: o.net }, { acct: "1776", cr: o.tax }] });
    o.invoice = no; o.invDoc = d.no; o.status = "fakturiert"; return { text: `Rechnung ${no}: Umsatz ${o.net} €, Forderung gegen Zahlungsdienstleister ${o.gross} €`, docs: [d.no] };
  },
  settlePSP(w, t, p, ctx) {
    need(t, ctx, "post"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (!o.invoice) fail("STATUS", "Zuerst fakturieren."); if (o.settled) fail("DONE", "Bereits abgeglichen.");
    const fee = r2(o.gross * 0.015); const d = post(t, { date: t.date, text: "Auszahlung Zahlungsdienstleister " + o.no, user: ctx.userName, ref: { type: "webOrder", id: o.no }, lines: [{ acct: "1100", dr: r2(o.gross - fee) }, { acct: "6855", dr: fee }, { acct: "1590", cr: o.gross }] });
    o.settled = true; o.settleDoc = d.no; o.status = "abgeschlossen"; o.margin = r2(o.net - o.cogs - fee); return { text: `Zahlung abgeglichen: Bank +${r2(o.gross - fee)} €, Gebühr ${fee} €, Marge ${o.margin} €`, docs: [d.no] };
  },
  createReplenishment(w, t, p, ctx) {
    const pr = replenishmentProposals(t).find(x => x.article === p.articleId); if (!pr) fail("NONE", "Für diesen Artikel gibt es keinen Bestellvorschlag.");
    const a = find(t.master.articles, "id", p.articleId, "Artikel"); return CMD.createPO(w, t, { supplierId: pr.supplier, lines: [{ mat: a.id, qty: p.qty || pr.qty, price: a.cost }] }, ctx);
  },
  orderLiftsFromElevon(w, t, p, ctx) { const qty = p.qty || 2; return CMD.createPO(w, t, { supplierId: "S-ELEVON", lines: [{ mat: "P-E5", qty, price: r2(E5.listPrice * 0.97), kind: "Anlage" }] }, ctx); },

  /* --- Aventra: Project-to-Cash --- */
  findStaff(w, t, p) {
    const per = periodOf(t.date); const load = {}; for (const pr of t.projects) for (const m of pr.team) load[m.employee] = (load[m.employee] || 0) + m.hoursPerMonth;
    const list = t.master.employees.filter(e => e.skills.includes(p.skill)).map(e => ({ id: e.id, name: e.name, level: e.level, skills: e.skills, costRate: e.costRate, billRate: e.billRate, booked: load[e.id] || 0, absent: absHoursInPeriod(t, e.id, per), free: Math.max(0, e.capacity - (load[e.id] || 0) - absHoursInPeriod(t, e.id, per)) })).sort((a, b) => b.free - a.free);
    return { text: `${list.length} Mitarbeitende mit Skill ${p.skill}`, result: list, period: per };
  },
  createProject(w, t, p, ctx) {
    need(t, ctx, "staff"); const c = find(t.master.customers, "id", p.customerId, "Kunde"); const id = "P-" + (1001 + t.projects.length);
    const pr = { id, name: p.name, customer: c.id, budget: r2(p.budget), planRevenue: r2(p.planRevenue), rate: p.rate || 150, start: periodOf(t.date), etcHours: p.hours || 1000, status: "freigegeben", team: [], live: true };
    t.projects.push(pr); t.co[id] = { cost: 0, revenue: 0, hours: 0, expenses: 0 }; return { text: `Projekt ${id} angelegt, Budget ${pr.budget} €`, objects: [id] };
  },
  assignStaff(w, t, p, ctx) {
    need(t, ctx, "staff"); const pr = find(t.projects, "id", p.projectId, "Projekt"); const load = {}; for (const x of t.projects) for (const m of x.team) load[m.employee] = (load[m.employee] || 0) + m.hoursPerMonth;
    const conflicts = []; for (const eid of p.employeeIds) { const e = find(t.master.employees, "id", eid, "Mitarbeiter"); const cap = e.capacity - absHoursInPeriod(t, eid, periodOf(t.date)); const after = (load[eid] || 0) + p.hoursPerMonth; if (after > cap) conflicts.push(`${e.name}: ${after} h > ${cap} h verfügbar`); }
    if (conflicts.length && !p.force) fail("CAPACITY", "Kapazitätskonflikt: " + conflicts.join("; "));
    for (const eid of p.employeeIds) { const e = t.master.employees.find(x => x.id === eid); pr.team.push({ employee: eid, role: e.skills[0], hoursPerMonth: p.hoursPerMonth }); }
    const cost = r2(p.employeeIds.reduce((a, id) => a + t.master.employees.find(e => e.id === id).costRate * p.hoursPerMonth, 0));
    return { text: `${p.employeeIds.length} Mitarbeitende zugeordnet, geplante Kosten ${cost} € pro Monat` };
  },
  recordTime(w, t, p, ctx) {
    need(t, ctx, "time"); const pr = find(t.projects, "id", p.projectId, "Projekt"); const e = find(t.master.employees, "id", p.employeeId, "Mitarbeiter");
    if (!pr.team.some(m => m.employee === e.id)) fail("NOT_STAFFED", `${e.name} ist dem Projekt ${pr.id} nicht zugeordnet.`);
    const h = Number(p.hours); if (!(h > 0 && h <= 12)) fail("HOURS", "Stunden müssen zwischen 0 und 12 liegen.");
    const te = { id: nextNo(t, "TE"), employee: e.id, project: pr.id, date: t.date, hours: h, billable: p.billable !== false, status: "erfasst", period: periodOf(t.date), costRate: e.costRate, billRate: pr.rate };
    t.timeEntries.push(te); return { text: `${h} h erfasst (Status erfasst) – noch keine Kosten`, objects: [te.id] };
  },
  approveTime(w, t, p, ctx) {
    need(t, ctx, "approve"); const ids = p.ids || t.timeEntries.filter(e => e.status === "erfasst" && (!p.projectId || e.project === p.projectId)).map(e => e.id); if (!ids.length) fail("NONE", "Keine offenen Zeiten.");
    let cost = 0, rev = 0; for (const id of ids) { const e = find(t.timeEntries, "id", id, "Zeitbuchung"); if (e.status !== "erfasst") continue; e.status = "freigegeben"; e.approvedBy = ctx.userName; const c = r2(e.hours * e.costRate); cost += c; if (e.billable) rev += e.hours * e.billRate; const co = t.co[e.project]; co.cost = r2(co.cost + c); co.hours += e.hours; }
    return { text: `${ids.length} Zeitbuchungen freigegeben: Projektkosten +${r2(cost)} €, abrechenbar ${r2(rev)} € (Kostenrechnung)` };
  },
  recordExpense(w, t, p, ctx) {
    need(t, ctx, "time"); const pr = find(t.projects, "id", p.projectId, "Projekt"); const amt = r2(p.amount); if (!(amt > 0)) fail("AMOUNT", "Betrag fehlt.");
    const d = post(t, { date: t.date, text: "Reisekosten " + pr.id + " " + (p.text || ""), user: ctx.userName, ref: { type: "project", id: pr.id }, lines: [{ acct: "6650", dr: amt }, { acct: "1100", cr: amt }] });
    const x = { id: nextNo(t, "RK"), project: pr.id, amount: amt, billable: p.billable !== false, status: "erfasst", docNo: d.no }; t.expenses.push(x); t.co[pr.id].cost = r2(t.co[pr.id].cost + amt); t.co[pr.id].expenses = r2((t.co[pr.id].expenses || 0) + amt);
    return { text: `Reisekosten ${amt} € gebucht und dem Projekt belastet`, docs: [d.no] };
  },
  invoiceProject(w, t, p, ctx) {
    need(t, ctx, "bill"); const pr = find(t.projects, "id", p.projectId, "Projekt"); const te = t.timeEntries.filter(e => e.project === pr.id && e.status === "freigegeben" && e.billable); const ex = t.expenses.filter(e => e.project === pr.id && e.status === "erfasst" && e.billable);
    const net = r2(te.reduce((a, e) => a + e.hours * e.billRate, 0) + ex.reduce((a, e) => a + e.amount, 0)); if (!(net > 0)) fail("NONE", "Keine abrechenbaren, freigegebenen Leistungen.");
    const tax = r2(net * VAT), gross = r2(net + tax), no = "AV-RE-" + periodOf(t.date).replace("-", "") + "-" + pr.id.replace("-", "") + "-" + pad((t.seq["INV" + pr.id] = (t.seq["INV" + pr.id] || 0) + 1), 2);
    const d = post(t, { date: t.date, text: "Rechnung " + no + " " + pr.name, user: ctx.userName, ref: { type: "project", id: pr.id }, lines: [{ acct: "1200", dr: gross }, { acct: "4400", cr: net }, { acct: "1776", cr: tax }] });
    te.forEach(e => e.status = "abgerechnet"); ex.forEach(e => e.status = "abgerechnet"); t.co[pr.id].revenue = r2(t.co[pr.id].revenue + net);
    const c = t.master.customers.find(x => x.id === pr.customer);
    t.custInvoices.push({ no, partnerId: pr.customer, date: t.date, period: periodOf(t.date), net, tax, gross, open: gross, status: "offen", ref: { type: "project", id: pr.id }, docNo: d.no, link: c.link ? { tenant: c.link.tenant } : null, text: "Leistungen " + pr.name });
    if (c.link) send(w, t.id, c.link.tenant, { type: "supplierInvoice", invoiceNo: no, net, expAcct: "6800", text: `Rechnung ${no} von ${t.name}: ${pr.name}` });
    return { text: `Rechnung ${no}: ${te.length} Zeiten + ${ex.length} Reisekosten, Umsatz ${net} €`, docs: [d.no] };
  }
};
function costing(t, qty) { const mat = E5_BOM.reduce((a, [m, q]) => a + materialOf(t, m).price * q, 0) * qty; const lab = E5.assemblyHours * E5.laborRate * qty, ins = E5.installHours * E5.installRate * qty; return { material: r2(mat), labor: r2(lab), install: r2(ins), total: r2(mat + lab + ins) }; }

/* ===== Erweiterungen v0.4: Service, Wartung, Retouren, Click & Collect, HR, Migration, Cutover ===== */
COA["9000"] = ["Saldenvorträge / Migrationsverrechnung", "Q"];
const SERVICE_RATE = 95, CALLOUT = 89, PART_MARKUP = 1.3;
const absHoursInPeriod = (t, emp, per) => (t.absences || []).filter(a => a.employee === emp && a.status === "genehmigt" && periodOf(a.from) === per).reduce((x, a) => x + a.days * 8, 0);
const isAbsent = (t, emp, date) => (t.absences || []).some(a => a.employee === emp && a.status === "genehmigt" && date >= a.from && date <= addDays(a.from, a.days - 1));

/* --- Seed-Ergänzungen (deterministisch, eigener Zufallsstrom) --- */
function seedExtElevon(t) {
  const rng = mulberry32(t.seed ^ hashStr("elevon-ext"));
  const contracts = ["Vollwartung", "Teilwartung", "Ohne Vertrag"];
  t.master.assets.forEach((a, i) => { a.contract = i === 0 ? "Teilwartung" : contracts[Math.floor(rng() * 3)]; a.interval = rng() < 0.5 ? 6 : 12; a.lastMaint = addDays(START_DATE, -int(rng, 20, 380)); a.history = []; a.location = a.name.replace(/^Aufzug \S+ /, ""); });
  const a0 = t.master.assets[0]; a0.name = "Aufzug E5 Rheinpark Tower Köln"; a0.customer = "C-RHEIN"; a0.location = "Köln"; a0.lastMaint = addDays(START_DATE, -170); a0.interval = 6;
  for (let k = 1; k <= 3; k++) { const a = t.master.assets[k]; a.customer = "C-NOVAMART"; a.name = "Aufzug E5 NovaMart Filiale " + CITY[k]; a.contract = "Vollwartung"; }
  t.serviceOrders = []; t.migration = null; t.absences = [];
  t.roles.push({ id: "hr", name: "HR Manager", perms: ["view", "hr", "approve"] }); t.users.push({ id: "u8", name: "Eva Sauer", role: "hr" });
  t.roles.find(r => r.id === "service").perms.push("post");
  return t;
}
function seedExtStock(t, entries) { for (const [mat, wh, q, val] of entries) moveIn(t, mat, wh, q, val); t.moves = []; }
function seedExtNovaMart(t) {
  t.returns = []; t.absences = [];
  t.roles.push({ id: "hr", name: "HR Manager", perms: ["view", "hr", "approve"] }); t.users.push({ id: "u6", name: "Ida Ernst", role: "hr" });
  t.roles.push({ id: "store", name: "Filialleitung", perms: ["view", "ship", "sell"] }); t.users.push({ id: "u7", name: "Jonas Keller", role: "store" });
  t.warehouses.push(...t.stores.map(s => ({ id: s.id, name: s.name })));
  return t;
}
function seedExtAventra(t) {
  t.absences = [];
  t.roles.push({ id: "hr", name: "HR Manager", perms: ["view", "hr", "approve"] }); t.users.push({ id: "u5", name: "Clara Busch", role: "hr" });
  const rng = mulberry32(t.seed ^ hashStr("aventra-ext"));
  // Genehmigte Abwesenheiten im laufenden Monat (beeinflussen Staffing)
  for (let i = 0; i < Math.min(6, t.master.employees.length); i++) { const e = t.master.employees[int(rng, 0, t.master.employees.length - 1)]; t.absences.push({ id: nextNo(t, "AB"), employee: e.id, from: addDays(START_DATE, int(rng, 3, 20)), days: int(rng, 2, 5), type: pick(rng, ["Urlaub", "Fortbildung"]), status: "genehmigt" }); }
  return t;
}

/* --- Altsystem für die Migration (Übernahme der Liftservice Nord GmbH durch Elevon) --- */
function legacyData(seed) {
  const rng = mulberry32(seed ^ hashStr("legacy-liftservice-nord"));
  const cities = ["Hamburg", "Bremen", "Kiel", "Lübeck", "Hannover", "Rostock"];
  const customers = [];
  for (let i = 0; i < 40; i++) customers.push({ KUNNR: "LN" + (5000 + i), NAME1: pick(rng, ORG1) + pick(rng, ORG2) + " " + pick(rng, ["Hausverwaltung GmbH", "Wohnungsbau eG", "Immobilien KG", "Klinikum gGmbH"]), ORT: pick(rng, cities), PLZ: rng() < 0.08 ? "" : String(int(rng, 20000, 29999)), LAND: rng() < 0.1 ? "Deutschland" : "DE", USTID: rng() < 0.15 ? "" : "DE" + int(rng, 100000000, 999999999) });
  customers.push(Object.assign({}, customers[3], { KUNNR: "LN5040" })); customers.push(Object.assign({}, customers[11], { KUNNR: "LN5041" })); // Dubletten
  const assets = []; for (let i = 0; i < 60; i++) assets.push({ ANLNR: "LNA" + (700 + i), KUNNR: customers[int(rng, 0, 41)].KUNNR, TYP: pick(rng, ["Seilaufzug", "Hydraulikaufzug", "Fahrtreppe"]), BAUJAHR: String(int(rng, 1994, 2021)), VERTRAG: pick(rng, ["VW", "TW", "TW", "OV"]) });
  assets.push({ ANLNR: "LNA799", KUNNR: "LN9999", TYP: "Seilaufzug", BAUJAHR: "2003", VERTRAG: "VW" }); // verwaiste Anlage
  const openItems = []; for (let i = 0; i < 25; i++) openItems.push({ BELNR: "LN-RE-" + (8100 + i), KUNNR: customers[int(rng, 0, 39)].KUNNR, BETRAG: r2(between(rng, 380, 14800)), FAELLIG: addDays(START_DATE, int(rng, -60, 25)) });
  openItems.push({ BELNR: "LN-RE-8199", KUNNR: "LN9998", BETRAG: 2210.5, FAELLIG: addDays(START_DATE, -10) }); // Kunde fehlt
  const stock = [["M-1008", 6, 890], ["M-1005", 24, 180], ["M-1004", 10, 650]].map(([m, q, p]) => ({ MATNR: m, MENGE: q, WERT: r2(q * p) }));
  stock.push({ MATNR: "LN-ALT-77", MENGE: 4, WERT: 120 }); // Material ohne Zuordnung
  return { company: "Liftservice Nord GmbH", customers, assets, openItems, stock };
}
const MIG_OBJECTS = ["customers", "assets", "openItems", "stock"];
const MIG_LABEL = { customers: "Kunden", assets: "Anlagen", openItems: "Offene Posten", stock: "Ersatzteilbestand" };
function migValidate(t, obj, src, rules, mapped) {
  const ok = [], errs = [], warns = [];
  const known = new Set(mapped.customers || []);
  if (obj === "customers") { const seen = {}; for (const r of src.customers) { const key = r.NAME1 + "|" + r.ORT; if (seen[key]) { if (rules.dedupe) { warns.push([r.KUNNR, "Dublette von " + seen[key] + ", zusammengeführt"]); continue; } errs.push([r.KUNNR, "Dublette von " + seen[key]]); continue; } seen[key] = r.KUNNR; if (!r.PLZ) { if (rules.fillZip) warns.push([r.KUNNR, "PLZ aus Ort ergänzt"]); else { errs.push([r.KUNNR, "Postleitzahl fehlt"]); continue; } } if (r.LAND !== "DE") { if (rules.mapCountry) warns.push([r.KUNNR, `Land „${r.LAND}“ → DE`]); else { errs.push([r.KUNNR, `Land „${r.LAND}“ kein ISO-Code`]); continue; } } if (!r.USTID) warns.push([r.KUNNR, "USt-ID fehlt"]); ok.push(r); } }
  const orphan = (id, msg) => rules.excludeUnmapped ? warns.push([id, "ausgeschlossen, Klärungsliste: " + msg]) : errs.push([id, msg]);
  const custOk = k => known.has(k) || !!(t.migration && t.migration.idMap[k]);
  if (obj === "assets") for (const r of src.assets) { if (!custOk(r.KUNNR)) { orphan(r.ANLNR, `Kunde ${r.KUNNR} nicht migriert`); continue; } ok.push(r); }
  if (obj === "openItems") for (const r of src.openItems) { if (!custOk(r.KUNNR)) { orphan(r.BELNR, `Kunde ${r.KUNNR} nicht vorhanden`); continue; } ok.push(r); }
  if (obj === "stock") for (const r of src.stock) { if (!materialOf(t, r.MATNR)) { orphan(r.MATNR, "Material im Ziel unbekannt"); continue; } ok.push(r); }
  return { ok, errs, warns };
}
function isKnownAfter(t, c, rules) { return !!(t.migration && t.migration.idMap[c.KUNNR]); }
function migApply(t, obj, valid, src, rules, user) {
  const M = t.migration; const docs = [];
  if (obj === "customers") for (const r of valid) { const id = "C-LN" + r.KUNNR.slice(2); if (t.master.customers.some(c => c.id === id)) continue; t.master.customers.push({ id, name: r.NAME1, city: r.ORT, segment: "Bestandshalter", legacy: r.KUNNR, vat: r.USTID || null }); M.idMap[r.KUNNR] = id; }
  if (rules.dedupe && obj === "customers") { const seen = {}; for (const r of src.customers) { const key = r.NAME1 + "|" + r.ORT; if (seen[key] && M.idMap[seen[key]]) M.idMap[r.KUNNR] = M.idMap[seen[key]]; else if (!seen[key]) seen[key] = r.KUNNR; } }
  if (obj === "assets") { const map = { VW: "Vollwartung", TW: "Teilwartung", OV: "Ohne Vertrag" }; for (const r of valid) t.master.assets.push({ id: "A-" + r.ANLNR, name: r.TYP + " " + (t.master.customers.find(c => c.id === M.idMap[r.KUNNR]) || {}).city, customer: M.idMap[r.KUNNR], since: r.BAUJAHR, contract: map[r.VERTRAG], interval: 12, lastMaint: addDays(START_DATE, -200), history: [], legacy: r.ANLNR }); }
  if (obj === "openItems") { let sum = 0; for (const r of valid) { const tax = r2(r.BETRAG - r.BETRAG / (1 + VAT)); t.custInvoices.push({ no: r.BELNR, partnerId: M.idMap[r.KUNNR], date: t.date, period: periodOf(t.date), net: r2(r.BETRAG - tax), tax, gross: r.BETRAG, open: r.BETRAG, status: "offen", ref: { type: "migration", id: "openItems" }, docNo: null, link: null, text: "Migrierter offener Posten", due: r.FAELLIG }); sum += r.BETRAG; }
    const d = post(t, { date: t.date, text: "Saldenvortrag offene Posten Liftservice Nord", user, ref: { type: "migration", id: "openItems" }, lines: [{ acct: "1200", dr: r2(sum) }, { acct: "9000", cr: r2(sum) }] }); valid.forEach(r => (t.custInvoices.find(i => i.no === r.BELNR).docNo = d.no)); docs.push(d.no); }
  if (obj === "stock") { let sum = 0; for (const r of valid) { moveIn(t, r.MATNR, "WH5", r.MENGE, r.WERT); sum += r.WERT; } const d = post(t, { date: t.date, text: "Saldenvortrag Ersatzteilbestand Liftservice Nord", user, ref: { type: "migration", id: "stock" }, lines: [{ acct: "1300", dr: r2(sum) }, { acct: "9000", cr: r2(sum) }] }); docs.push(d.no); }
  return docs;
}
function migReconcile(obj, src, res) {
  const srcCount = src[obj].length; const tgt = res.ok.length; const sum = a => r2(a.reduce((x, r) => x + (r.BETRAG || r.WERT || 0), 0));
  const excl = res.warns.filter(w => /ausgeschlossen/.test(w[1])).map(w => w[0]); const exRows = src[obj].filter(r => excl.includes(r.ANLNR || r.BELNR || r.MATNR || r.KUNNR));
  const money = ["openItems", "stock"].includes(obj);
  return { object: obj, source: srcCount, loaded: tgt, merged: res.warns.filter(w => /Dublette/.test(w[1])).length, excluded: excl.length, errors: res.errs.length, sourceSum: money ? sum(src[obj]) : null, loadedSum: money ? sum(res.ok) : null, excludedSum: money ? sum(exRows) : null };
}

/* --- Cutover-Plan Integration Liftservice Nord (Status aus Engine-Zustand abgeleitet) --- */
const CUT_ACTS = [
  { id: "k1", name: "Oktober abgeschlossen", dur: 2, deps: [], check: t => t.periods["2026-10"] === "closed" },
  { id: "k2", name: "Testmigration ohne Fehler", dur: 6, deps: ["k1"], check: t => !!t.migration && MIG_OBJECTS.every(o => t.migration.tests[o] && t.migration.tests[o].errors === 0) },
  { id: "k3", name: "Freigabe Produktivmigration", dur: 1, deps: ["k2"], check: t => !!t.migration && t.migration.approval && t.migration.approval.status === "freigegeben" },
  { id: "k4", name: "Kunden migrieren", dur: 3, deps: ["k3"], check: t => !!t.migration && !!t.migration.done.customers },
  { id: "k5", name: "Anlagen migrieren", dur: 3, deps: ["k4"], check: t => !!t.migration && !!t.migration.done.assets },
  { id: "k6", name: "Offene Posten migrieren", dur: 2, deps: ["k4"], check: t => !!t.migration && !!t.migration.done.openItems },
  { id: "k7", name: "Ersatzteilbestand migrieren", dur: 2, deps: ["k3"], check: t => !!t.migration && !!t.migration.done.stock },
  { id: "k8", name: "Abstimmung Migrationsverrechnung", dur: 2, deps: ["k6", "k7"], check: t => !!t.migration && t.migration.done.openItems && t.migration.done.stock && Math.abs(-balance(t, "9000") - t.migration.expected9000) < 0.01 },
  { id: "k9", name: "Go/No-Go", dur: 1, deps: ["k5", "k8"], check: t => !!t.migration && t.migration.goLive === "Go" }
];
function cutoverStatus(t, delay) {
  if (t.id !== "elevon") return null;
  const res = {}; for (const a of CUT_ACTS) { const st = Math.max(0, ...a.deps.map(d => res[d].end)); const dur = a.dur + (a.id === "k4" ? (delay || 0) : 0); res[a.id] = { st, end: st + dur, dur, done: !!a.check(t) }; }
  const total = Math.max(...Object.values(res).map(r => r.end)); const crit = new Set(); let cur = CUT_ACTS.find(a => res[a.id].end === total);
  while (cur) { crit.add(cur.id); if (!cur.deps.length) break; const st = res[cur.id].st; cur = CUT_ACTS.find(a => cur.deps.includes(a.id) && res[a.id].end === st); }
  const acts = CUT_ACTS.map(a => Object.assign({ id: a.id, name: a.name, deps: a.deps, crit: crit.has(a.id) }, res[a.id], { state: res[a.id].done ? "done" : a.deps.every(d => res[d].done) ? "active" : "open" }));
  return { acts, total, window: 24, buffer: 24 - total, ready: CUT_ACTS.slice(0, 8).every(a => res[a.id].done) };
}

/* --- Neue Befehle --- */
Object.assign(CMD, {
  /* Service-to-Cash und Maintain-to-Operate (Elevon) */
  createServiceTicket(w, t, p, ctx) {
    need(t, ctx, "install"); const a = find(t.master.assets, "id", p.assetId, "Anlage"); const type = p.type === "Wartung" ? "Wartung" : "Störung";
    if (t.serviceOrders.some(s => s.asset === a.id && s.status !== "abgeschlossen" && s.type === type)) fail("DUPLICATE", `Für ${a.name} ist bereits ein offener ${type}sauftrag vorhanden.`);
    const so = { no: nextNo(t, "SV"), asset: a.id, customer: a.customer, contract: a.contract, type, text: p.text || (type === "Wartung" ? "Vorbeugende Wartung gemäß Wartungsplan" : "Störung gemeldet"), date: t.date, status: "offen", tech: null, parts: [], hours: 0, cost: 0, report: null, invoice: null };
    t.serviceOrders.push(so); t.co[so.no] = { cost: 0, revenue: 0 };
    return { text: `${type === "Wartung" ? "Wartungsauftrag" : "Serviceticket"} ${so.no} für ${a.name} (${a.contract}) – keine Buchung`, objects: [so.no] };
  },
  createMaintenanceOrders(w, t, p, ctx) { const due = dueMaintenance(t).slice(0, p.max || 5); if (!due.length) fail("NONE", "Keine Wartung in den nächsten 30 Tagen fällig."); const nos = due.map(a => CMD.createServiceTicket(w, t, { assetId: a.id, type: "Wartung" }, ctx).objects[0]); return { text: `${nos.length} Wartungsaufträge aus dem Wartungsplan angelegt`, objects: nos }; },
  scheduleTechnician(w, t, p, ctx) {
    need(t, ctx, "install"); const so = find(t.serviceOrders, "no", p.svNo, "Serviceauftrag"); if (so.status !== "offen") fail("STATUS", `Status „${so.status}“.`);
    const date = addDays(t.date, so.type === "Störung" ? 0 : 3); const techs = t.master.employees.filter(e => e.role === "Servicetechniker" && !isAbsent(t, e.id, date));
    const busy = {}; for (const s of t.serviceOrders) if (s.tech && s.status === "eingeplant") busy[s.tech] = (busy[s.tech] || 0) + 1;
    const tech = p.employeeId ? find(techs, "id", p.employeeId, "verfügbarer Techniker") : techs.sort((a, b) => (busy[a.id] || 0) - (busy[b.id] || 0))[0];
    if (!tech) fail("CAPACITY", "Kein Servicetechniker verfügbar (Abwesenheiten berücksichtigt).");
    so.tech = tech.id; so.planned = date; so.status = "eingeplant"; return { text: `${tech.name} eingeplant für ${date}${t.master.employees.filter(e => e.role === "Servicetechniker" && isAbsent(t, e.id, date)).length ? " (abwesende Techniker übersprungen)" : ""}` };
  },
  reserveParts(w, t, p, ctx) {
    need(t, ctx, "install"); const so = find(t.serviceOrders, "no", p.svNo, "Serviceauftrag"); if (!["offen", "eingeplant"].includes(so.status)) fail("STATUS", "Teile nur vor der Ausführung reservierbar.");
    const m = materialOf(t, p.mat); if (!m) fail("NOT_FOUND", "Ersatzteil unbekannt."); const qty = p.qty || 1; const wh = avail(t, m.id, "WH5") >= qty ? "WH5" : "WH1";
    if (avail(t, m.id, wh) < qty) fail("AVAILABILITY", `${m.name}: nur ${avail(t, m.id, wh)} verfügbar.`);
    stk(t, m.id, wh).res += qty; so.parts.push({ mat: m.id, qty, wh, price: m.price }); return { text: `${qty} × ${m.name} reserviert (${wh === "WH5" ? "Servicelager Köln" : "Zentrallager Stuttgart"})` };
  },
  executeService(w, t, p, ctx) {
    need(t, ctx, "install"); const so = find(t.serviceOrders, "no", p.svNo, "Serviceauftrag"); if (so.status !== "eingeplant") fail("STATUS", "Zuerst Techniker einplanen.");
    const h = Number(p.hours || (so.type === "Wartung" ? 2 : 3)); const tech = t.master.employees.find(e => e.id === so.tech);
    let mat = 0; for (const x of so.parts) mat += moveOut(t, x.mat, x.wh, x.qty, true);
    const docs = []; if (mat > 0) docs.push(post(t, { date: t.date, text: "Materialverbrauch Service " + so.no, user: ctx.userName, ref: { type: "serviceOrder", id: so.no }, lines: [{ acct: "5000", dr: r2(mat) }, { acct: "1300", cr: r2(mat) }] }).no);
    so.hours = h; so.cost = r2(mat + h * tech.costRate); t.co[so.no].cost = so.cost; so.status = "ausgeführt"; so.done = t.date;
    so.report = `${so.type === "Wartung" ? "Wartung" : "Störungsbehebung"} durch ${tech.name}, ${h} h${so.parts.length ? ", Teile: " + so.parts.map(x => x.qty + " × " + materialOf(t, x.mat).name).join(", ") : ""}.`;
    const a = t.master.assets.find(x => x.id === so.asset); a.history.push({ date: t.date, order: so.no, type: so.type, text: so.report }); if (so.type === "Wartung") a.lastMaint = t.date;
    return { text: `Auftrag ausgeführt: Materialkosten ${r2(mat)} €, Arbeitszeit ${h} h, Kosten gesamt ${so.cost} €`, docs };
  },
  invoiceService(w, t, p, ctx) {
    need(t, ctx, "post"); const so = find(t.serviceOrders, "no", p.svNo, "Serviceauftrag"); if (so.status !== "ausgeführt") fail("STATUS", "Abrechnung nach Ausführung.");
    const parts = r2(so.parts.reduce((x, y) => x + y.qty * y.price * PART_MARKUP, 0)); const covered = so.contract === "Vollwartung" || (so.type === "Wartung" && so.contract !== "Ohne Vertrag");
    const net = covered ? 0 : so.contract === "Teilwartung" ? parts : r2(so.hours * SERVICE_RATE + parts + CALLOUT);
    so.billing = covered ? "durch Wartungsvertrag abgedeckt" : so.contract === "Teilwartung" ? "Teilwartung: Teile berechnet, Arbeitszeit inklusive" : "ohne Vertrag: Arbeitszeit, Teile und Anfahrt berechnet";
    if (net <= 0) { so.status = "abgeschlossen"; return { text: `Keine Rechnung – ${so.billing}. Kosten ${so.cost} € gehen zulasten des Vertrags.` }; }
    const tax = r2(net * VAT), gross = r2(net + tax), no = nextNo(t, "AR", periodOf(t.date)); const c = t.master.customers.find(x => x.id === so.customer);
    const d = post(t, { date: t.date, text: "Servicerechnung " + no + " zu " + so.no, user: ctx.userName, ref: { type: "serviceOrder", id: so.no }, lines: [{ acct: "1200", dr: gross }, { acct: "4400", cr: net }, { acct: "1776", cr: tax }] });
    t.custInvoices.push({ no, partnerId: so.customer, date: t.date, period: periodOf(t.date), net, tax, gross, open: gross, status: "offen", ref: { type: "serviceOrder", id: so.no }, docNo: d.no, link: c && c.link ? { tenant: c.link.tenant } : null, text: "Service " + so.no });
    so.invoice = no; so.status = "abgerechnet"; t.co[so.no].revenue = net;
    if (c && c.link) send(w, t.id, c.link.tenant, { type: "supplierInvoice", invoiceNo: no, net, expAcct: "6300", text: `Servicerechnung ${no} von ${t.name}` });
    return { text: `Servicerechnung ${no}: ${net} € netto (${so.billing})`, docs: [d.no] };
  },

  /* Retouren und Click & Collect (NovaMart) */
  createReturn(w, t, p, ctx) {
    need(t, ctx, "sell"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (!o.invoice) fail("STATUS", "Retoure erst nach Rechnung.");
    const already = t.returns.filter(r => r.order === o.no).reduce((x, r) => x + r.qty, 0); const qty = p.qty || 1; if (already + qty > o.qty) fail("QTY", `Nur ${o.qty - already} Stück retournierbar.`);
    const r = { no: nextNo(t, "RT"), order: o.no, article: o.article, qty, reason: p.reason || "Gefällt nicht", date: t.date, status: "angemeldet", decision: null }; t.returns.push(r);
    return { text: `Retoure ${r.no} angemeldet (${qty} × ${articleName(t, o.article)}) – noch keine Buchung`, objects: [r.no] };
  },
  inspectReturn(w, t, p, ctx) {
    need(t, ctx, "ship"); const r = find(t.returns, "no", p.retNo, "Retoure"); if (r.status !== "angemeldet") fail("STATUS", `Status „${r.status}“.`);
    const o = t.webOrders.find(x => x.no === r.order); const unit = r2(o.cogs / o.qty); const dec = p.decision === "verschrotten" ? "verschrotten" : "wiederverkaufbar"; const docs = [];
    if (dec === "wiederverkaufbar") { moveIn(t, r.article, "ZL1", r.qty, r2(unit * r.qty)); docs.push(post(t, { date: t.date, text: "Retoure " + r.no + " zurück in den Bestand", user: ctx.userName, ref: { type: "return", id: r.no }, lines: [{ acct: "1310", dr: r2(unit * r.qty) }, { acct: "5000", cr: r2(unit * r.qty) }] }).no); }
    r.decision = dec; r.status = "geprüft"; return { text: dec === "wiederverkaufbar" ? `Ware einwandfrei: Bestand +${r.qty}, Wareneinsatz storniert` : "Ware beschädigt: verschrottet, Wareneinsatz bleibt", docs };
  },
  creditReturn(w, t, p, ctx) {
    need(t, ctx, "post"); const r = find(t.returns, "no", p.retNo, "Retoure"); if (r.status !== "geprüft") fail("STATUS", "Gutschrift nach Prüfung."); const o = t.webOrders.find(x => x.no === r.order);
    const gross = r2(o.gross / o.qty * r.qty), net = r2(gross / (1 + VAT)), tax = r2(gross - net); const no = nextNo(t, "GS", periodOf(t.date));
    const d = post(t, { date: t.date, text: "Gutschrift " + no + " zu " + r.no, user: ctx.userName, ref: { type: "return", id: r.no }, lines: [{ acct: "4000", dr: net }, { acct: "1776", dr: tax }, { acct: "1590", cr: gross }] });
    r.credit = no; r.gross = gross; r.status = "gutgeschrieben"; return { text: `Gutschrift ${no}: Umsatz −${net} €, Erstattung ${gross} € über Zahlungsdienstleister angewiesen`, docs: [d.no] };
  },
  refundReturn(w, t, p, ctx) {
    need(t, ctx, "post"); const r = find(t.returns, "no", p.retNo, "Retoure"); if (r.status !== "gutgeschrieben") fail("STATUS", "Erst Gutschrift erstellen.");
    const d = post(t, { date: t.date, text: "Rückzahlung " + r.no, user: ctx.userName, ref: { type: "return", id: r.no }, lines: [{ acct: "1590", dr: r.gross }, { acct: "1100", cr: r.gross }] }); r.status = "erstattet"; return { text: `Rückzahlung ${r.gross} € an den Kunden abgeschlossen`, docs: [d.no] };
  },
  placeClickCollect(w, t, p, ctx) {
    need(t, ctx, "sell"); const st = find(t.stores, "id", p.storeId, "Filiale"); const a = find(t.master.articles, "id", p.articleId, "Artikel"); const c = find(t.master.customers, "id", p.customerId || "C-ONLINE", "Kunde"); const qty = p.qty || 1;
    const av = avail(t, a.id, st.id); if (av < qty) fail("AVAILABILITY", `${st.name}: ${av} Stück verfügbar.`);
    const disc = c.loyalty ? 3 : 0; const gross = r2(a.price * qty * (1 - disc / 100)), net = r2(gross / (1 + VAT)); stk(t, a.id, st.id).res += qty;
    const o = { no: nextNo(t, "WO"), channel: "Click & Collect", wh: st.id, store: st.id, customer: c.id, article: a.id, qty, unitPrice: a.price, discountPct: disc, gross, net, tax: r2(gross - net), date: t.date, authId: "AUTH-" + nextNo(t, "AU").slice(3), status: "reserviert", availableAtOrder: av, picked: false, giDoc: null, delivered: false, invoice: null, settled: false };
    t.webOrders.push(o); return { text: `Click & Collect ${o.no}: in ${st.name} reserviert, Zahlung autorisiert – keine Buchung`, objects: [o.no] };
  },
  prepareCollect(w, t, p, ctx) { need(t, ctx, "ship"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (o.channel !== "Click & Collect" || o.picked) fail("STATUS", "Nicht bereitstellbar."); o.picked = true; o.notified = t.date; o.status = "abholbereit"; return { text: `Ware in ${t.stores.find(s => s.id === o.store).name} bereitgestellt, Kunde benachrichtigt` }; },
  handoverCollect(w, t, p, ctx) {
    need(t, ctx, "ship"); const o = find(t.webOrders, "no", p.orderNo, "Bestellung"); if (o.status !== "abholbereit") fail("STATUS", "Ware ist nicht abholbereit.");
    const v = moveOut(t, o.article, o.wh, o.qty, true); const d = post(t, { date: t.date, text: "Übergabe Filiale " + o.no, user: ctx.userName, ref: { type: "webOrder", id: o.no }, lines: [{ acct: "5000", dr: v }, { acct: "1310", cr: v }] });
    o.giDoc = d.no; o.cogs = v; o.delivered = true; o.status = "übergeben"; return { text: `Übergabe an den Kunden: Filialbestand −${o.qty}, Wareneinsatz ${v} €`, docs: [d.no] };
  },

  /* HR */
  hireEmployee(w, t, p, ctx) {
    need(t, ctx, "hr"); if (!p.name || !String(p.name).trim()) fail("NAME", "Name fehlt."); const e = { id: "E-" + (100 + t.master.employees.length + 900), name: String(p.name).trim(), role: p.role || "Mitarbeiter", costRate: r2(p.costRate || 60), since: t.date };
    if (t.id === "aventra") Object.assign(e, { level: p.level || "Consultant", skills: [p.skill || "SAP FI/CO"], billRate: r2((p.costRate || 62) * 2.18), capacity: 160, company: "DE01" });
    t.master.employees.push(e); return { text: `${e.name} eingestellt (${e.role}${e.skills ? ", " + e.skills[0] : ""}), Kostensatz ${e.costRate} €/h`, objects: [e.id] };
  },
  requestAbsence(w, t, p, ctx) { need(t, ctx, "view"); const e = find(t.master.employees, "id", p.employeeId, "Mitarbeiter"); const days = Math.max(1, Math.min(30, p.days | 0)); const a = { id: nextNo(t, "AB"), employee: e.id, from: p.from || addDays(t.date, 1), days, type: p.type || "Urlaub", status: "beantragt" }; t.absences.push(a); return { text: `${a.type} für ${e.name} beantragt: ${days} Tage ab ${a.from}`, objects: [a.id] }; },
  approveAbsence(w, t, p, ctx) { need(t, ctx, "approve"); const a = find(t.absences, "id", p.id, "Abwesenheit"); if (a.status !== "beantragt") fail("STATUS", "Bereits entschieden."); a.status = p.reject ? "abgelehnt" : "genehmigt"; a.by = ctx.userName; const e = t.master.employees.find(x => x.id === a.employee); return { text: `${a.type} ${e.name} ${a.status}${a.status === "genehmigt" && t.id === "aventra" ? " – Kapazität im Staffing reduziert" : a.status === "genehmigt" && e.role === "Servicetechniker" ? " – Technikereinsatzplanung berücksichtigt das" : ""}` }; },

  /* Migration in die Engine (Elevon übernimmt Liftservice Nord) */
  migrationTest(w, t, p, ctx) {
    need(t, ctx, "view"); if (t.id !== "elevon") fail("TENANT", "Migrationsszenario ist bei Elevon hinterlegt.");
    if (!t.migration) t.migration = { idMap: {}, tests: {}, done: {}, rules: { dedupe: false, mapCountry: false, fillZip: false, excludeUnmapped: false }, approval: null, goLive: null, expected9000: 0, log: [] };
    const M = t.migration; Object.assign(M.rules, p.rules || {}); const src = legacyData(t.seed);
    // Testlauf auf Kopie: nichts am Mandanten verändern
    const copy = JSON.parse(JSON.stringify(t)); copy.migration.idMap = Object.assign({}, M.idMap);
    for (const o of MIG_OBJECTS) { const res = migValidate(copy, o, src, M.rules, { customers: Object.keys(copy.migration.idMap) }); M.tests[o] = migReconcile(o, src, res); M.tests[o].issues = res.errs.slice(0, 12).concat(res.warns.slice(0, 6).map(x => [x[0], "Hinweis: " + x[1]])); copy.periods[periodOf(copy.date)] = "open"; if (o === "customers") migApply(copy, o, res.ok, src, M.rules, "Testlauf"); }
    M.tested = t.date; const err = MIG_OBJECTS.reduce((x, o) => x + M.tests[o].errors, 0);
    return { text: `Testmigration auf Kopie: ${err} Fehler, ${MIG_OBJECTS.map(o => MIG_LABEL[o] + " " + M.tests[o].loaded + "/" + M.tests[o].source).join(", ")} – Produktivdaten unverändert` };
  },
  migrationRequestApproval(w, t, p, ctx) { need(t, ctx, "view"); const M = t.migration; if (!M || !M.tested) fail("ORDER", "Zuerst Testmigration durchführen."); const err = MIG_OBJECTS.reduce((x, o) => x + M.tests[o].errors, 0); if (err) fail("ERRORS", `Freigabe erst bei fehlerfreiem Testlauf (${err} Fehler offen).`); M.approval = { status: "offen", requester: ctx.user, requesterName: ctx.userName, date: t.date }; return { text: "Freigabe der Produktivmigration angefordert (Vier-Augen-Prinzip)" }; },
  migrationApprove(w, t, p, ctx) { need(t, ctx, "approve"); const M = t.migration; if (!M || !M.approval || M.approval.status !== "offen") fail("ORDER", "Keine offene Freigabe."); if (M.approval.requester === ctx.user) fail("FOUR_EYES", "Vier-Augen-Prinzip: Die anfordernde Person darf nicht freigeben."); M.approval.status = "freigegeben"; M.approval.by = ctx.userName; return { text: `Produktivmigration freigegeben durch ${ctx.userName}` }; },
  migrationRun(w, t, p, ctx) {
    need(t, ctx, "post"); const M = t.migration; if (!M || !M.approval || M.approval.status !== "freigegeben") fail("APPROVAL", "Produktivmigration nur mit erteilter Freigabe."); const o = p.object; if (!MIG_OBJECTS.includes(o)) fail("OBJECT", "Unbekanntes Migrationsobjekt.");
    if (M.done[o]) fail("DONE", `${MIG_LABEL[o]} bereits migriert.`); if ((o === "assets" || o === "openItems") && !M.done.customers) fail("ORDER", "Zuerst Kunden migrieren.");
    const src = legacyData(t.seed); const res = migValidate(t, o, src, M.rules, { customers: Object.keys(M.idMap) }); if (res.errs.length) fail("ERRORS", `${res.errs.length} Fehler: ${res.errs[0][1]} …`);
    const docs = migApply(t, o, res.ok, src, M.rules, ctx.userName); const rec = migReconcile(o, src, res); M.done[o] = Object.assign(rec, { date: t.date, by: ctx.userName });
    if (o === "openItems" || o === "stock") M.expected9000 = r2(M.expected9000 + rec.loadedSum);
    return { text: `${MIG_LABEL[o]} produktiv migriert: ${rec.loaded} von ${rec.source}${rec.merged ? `, ${rec.merged} Dubletten zusammengeführt` : ""}${rec.loadedSum != null ? `, Summe ${rec.loadedSum} € = Quelle ${rec.sourceSum} €` : ""}`, docs };
  },
  cutoverDecision(w, t, p, ctx) { need(t, ctx, "approve"); const cs = cutoverStatus(t); if (p.decision === "Go" && !cs.ready) fail("NOT_READY", "Go nicht möglich: " + cs.acts.filter(a => !a.done && a.id !== "k9").map(a => a.name).join(", ") + " offen."); t.migration.goLive = p.decision === "Go" ? "Go" : "No-Go"; return { text: `Go/No-Go-Entscheidung: ${t.migration.goLive} (${ctx.userName})` }; }
});
function dueMaintenance(t) { if (t.id !== "elevon") return []; return t.master.assets.filter(a => addDays(a.lastMaint, a.interval * 30) <= addDays(t.date, 30) && !t.serviceOrders.some(s => s.asset === a.id && s.type === "Wartung" && s.status !== "abgeschlossen" && s.status !== "abgerechnet")).sort((a, b) => a.lastMaint < b.lastMaint ? -1 : 1); }
function returnRate(t) { if (t.id !== "novamart") return 0; const sold = t.webOrders.filter(o => o.giDoc).reduce((x, o) => x + o.qty, 0); const ret = (t.returns || []).reduce((x, r) => x + r.qty, 0); return sold ? r2(ret / sold * 100) : 0; }
function personnelCost(t) { const by = {}; for (const e of t.master.employees) { const k = e.role || e.level || "Mitarbeiter"; by[k] = by[k] || { role: k, count: 0, monthly: 0 }; by[k].count++; by[k].monthly = r2(by[k].monthly + (e.costRate || (t.id === "novamart" ? 19.4 : 21.3)) * 160); } return Object.values(by).sort((a, b) => b.monthly - a.monthly); }

/* ---------- Dispatcher: Berechtigung, Idempotenz, Atomarität, Audit ---------- */
function dispatch(w, tenantId, cmd, payload, ctx) {
  const t = w.tenants[tenantId]; if (!t) fail("TENANT", "Unbekannter Mandant."); const fn = Object.prototype.hasOwnProperty.call(CMD, cmd) && !String(cmd).startsWith("_") ? CMD[cmd] : null; if (!fn) fail("CMD", "Unbekannter Befehl " + cmd);
  ctx = Object.assign({}, ctx || {}); const u = (t.users.find(x => x.id === ctx.user) || t.users[0]); ctx.user = u.id; ctx.userName = u.name;
  if (ctx.idem && t.idem[ctx.idem]) return Object.assign({ replay: true }, t.idem[ctx.idem]);
  const snap = JSON.stringify(w.tenants); // Atomarität: bei Fehler alles zurück (auch Nachrichten an andere Mandanten)
  const docsBefore = t.docs.length;
  try {
    const res = fn(w, t, payload || {}, ctx) || {};
    const newDocs = t.docs.slice(docsBefore).map(d => d.no);
    const out = { ok: true, cmd, text: res.text || cmd, docs: newDocs, objects: res.objects || [], result: res.result };
    out.user = ctx.userName;
    if (!QUERY_ONLY[cmd]) { t.audit.push({ seq: t.audit.length + 1, date: t.date, user: ctx.userName, cmd, text: out.text, docs: newDocs }); t.events.push({ seq: t.events.length + 1, date: t.date, type: cmd, docs: newDocs }); }
    if (ctx.idem) t.idem[ctx.idem] = out;
    return out;
  } catch (e) {
    const restored = JSON.parse(snap); for (const k of Object.keys(restored)) { const cur = w.tenants[k]; for (const key of Object.keys(cur)) delete cur[key]; Object.assign(cur, restored[k]); }
    if (e instanceof BizError) return { ok: false, cmd, code: e.code, text: e.message };
    throw e;
  }
}
/* =====================================================================
   v0.6 Konstruktion → Stückliste → Arbeitsplan → Bezugsquellen → Einkauf
   (direkt und indirekt) → Fertigung mit Vorgängen und Lohnbearbeitung,
   HR-Recruiting mit Onboarding. Alle Stammdaten synthetisch.
   ===================================================================== */
Object.assign(COA, {
  "6470": ["Instandhaltung und Werkzeuge", "X"], "6815": ["Bürobedarf und Arbeitsschutz", "X"],
  "6830": ["IT-Ausstattung (GWG) und Software", "X"], "6835": ["Gebäudereinigung und Facility", "X"]
});
const DENSITY = { "S235JR": 7.85, "1.4301": 7.9, "AlMg3": 2.66 };
const LASER_SPEED = { "S235JR": { 3: 4.5, 5: 3.0, 8: 1.8, 10: 1.4 }, "1.4301": { 2: 5.0 }, "AlMg3": { 3: 6.0 } }; // m/min
const WORK_CENTERS = [
  { id: "LAS", name: "Laserschneiden", rate: 145 }, { id: "KANT", name: "Abkanten", rate: 92 }, { id: "SAEG", name: "Sägen", rate: 70 },
  { id: "SCHW", name: "Schweißen (MAG)", rate: 88 }, { id: "MONT", name: "Baugruppenmontage", rate: 78 }, { id: "QS", name: "Endprüfung", rate: 82 }
];
const SCRAP = 0.15; // Verschnitt beim Schachteln von Blechteilen
const APPROVAL_LIMITS = [[1000, null], [25000, "approve"], [Infinity, "ceo"]]; // bis 1.000 € automatisch, bis 25.000 € Freigabeberechtigte, darüber CEO
const INDIRECT_SUPPLIERS = [{ id: "S-I01", name: "Ott Arbeitsschutz & Büro KG", city: "Heilbronn" }, { id: "S-I02", name: "Lindner IT-Systemhaus GmbH", city: "Mannheim" }, { id: "S-I03", name: "Haas Gebäudeservice GmbH", city: "Karlsruhe" }];
const CATALOG = [
  { id: "K-01", name: "Arbeitsschutz-Set (Helm, Brille, Handschuhe)", price: 48.5, supplier: "S-I01", category: "Arbeitsschutz", acct: "6815" },
  { id: "K-02", name: "Sicherheitsschuhe S3", price: 89, supplier: "S-I01", category: "Arbeitsschutz", acct: "6815" },
  { id: "K-03", name: "Kopierpapier A4, Karton 2.500 Blatt", price: 21.9, supplier: "S-I01", category: "Büromaterial", acct: "6815" },
  { id: "K-04", name: "Tonerkartusche Laserdrucker", price: 64, supplier: "S-I01", category: "Büromaterial", acct: "6815" },
  { id: "K-05", name: "Notebook Standard (GWG bis 800 €)", price: 779, supplier: "S-I02", category: "IT", acct: "6830" },
  { id: "K-06", name: "Monitor 27 Zoll", price: 219, supplier: "S-I02", category: "IT", acct: "6830" },
  { id: "K-07", name: "Drehmomentschlüssel 40–200 Nm", price: 189, supplier: "S-I01", category: "Werkzeug", acct: "6470" },
  { id: "K-08", name: "Unterhaltsreinigung, Monatspauschale", price: 2450, supplier: "S-I03", category: "Facility", acct: "6835" },
  { id: "K-09", name: "Wartung Druckluftkompressor (Dienstleistung)", price: 1380, supplier: "S-I03", category: "Instandhaltung", acct: "6470" }
];
const CATEGORY_DEFAULT = { "Arbeitsschutz": ["S-I01", "6815"], "Büromaterial": ["S-I01", "6815"], "IT": ["S-I02", "6830"], "Werkzeug": ["S-I01", "6470"], "Facility": ["S-I03", "6835"], "Instandhaltung": ["S-I03", "6470"], "Beratung/Dienstleistung": ["S-I03", "6800"] };

function seedProcurementHR(t) {
  t.master.suppliers = t.master.suppliers || []; t.master.suppliers.push(...INDIRECT_SUPPLIERS.map(s => Object.assign({ indirect: true }, s)));
  if (!t.master.costCenters) t.master.costCenters = [{ id: "KS100", name: "Zentrale" }, { id: "KS110", name: "Logistik Zentrallager" }, { id: "KS120", name: "Filialen" }, { id: "KS130", name: "E-Commerce" }];
  t.catalog = CATALOG.map(c => Object.assign({}, c)); t.reqs = [];
  const rng = mulberry32(t.seed ^ hashStr(t.id + "-hr"));
  const pos = { elevon: [["Servicetechniker/in Aufzugstechnik", "Servicetechniker", 58], ["Konstrukteur/in Stahlbau", "Konstruktion", 64]], novamart: [["Filialmitarbeiter/in Köln", "Filiale", 22], ["Category Manager/in Elektronik", "Einkauf", 41]], aventra: [["SAP-Berater/in FI/CO", "Berater", 66], ["Projektleiter/in S/4HANA", "Berater", 78]] }[t.id];
  t.hr = { positions: pos.map(([title, role, rate], i) => ({ id: "ST-" + (i + 1), title, role, costRate: rate, status: "offen", opened: addDays(START_DATE, -int(rng, 10, 40)) })), applicants: [], onboarding: [] };
  let k = 0; for (const p of t.hr.positions) for (let j = 0; j < 3; j++) t.hr.applicants.push({ id: "BW-" + (++k), name: person(rng), position: p.id, status: j === 0 ? "Interview" : "neu", fit: int(rng, 55, 95), since: addDays(START_DATE, -int(rng, 2, 20)) });
  return t;
}
function seedEngineering(t) {
  t.master.suppliers.push({ id: "S-2001", name: "Brandl Normteile GmbH", city: "Heilbronn" }, { id: "S-2002", name: "Feuerverzinkerei Kocher GmbH", city: "Schwäbisch Hall" }, { id: "S-2003", name: "Blechcenter Neckar GmbH", city: "Neckarsulm" });
  const M = (id, name, price, supplier, leadDays, type, extra) => t.master.materials.push(Object.assign({ id, name, price, supplier, leadDays, type, unit: "Stk", moq: 1 }, extra || {}));
  for (const [id, th, grade, price] of [["M-2001", 3, "S235JR", 1.38], ["M-2002", 5, "S235JR", 1.32], ["M-2003", 8, "S235JR", 1.29], ["M-2004", 10, "S235JR", 1.29], ["M-2005", 2, "1.4301", 4.85], ["M-2006", 3, "AlMg3", 5.4]])
    M(id, `Blech ${grade} ${th} mm`, price, "S-2003", 5, "Halbzeug", { unit: "kg", moq: 100, form: "Blech", grade, thickness: th });
  M("M-2007", "Flachstahl S235JR 40×8", 1.45, "S-1004", 7, "Halbzeug", { unit: "kg", moq: 50, form: "Flach", grade: "S235JR", section: "40x8", kgPerM: 2.51 });
  M("M-2008", "Quadratrohr S235JR 40×40×3", 1.62, "S-1004", 7, "Halbzeug", { unit: "kg", moq: 50, form: "Rohr", grade: "S235JR", section: "40x40x3", kgPerM: 3.30 });
  for (const [id, name, price, norm] of [["M-2101", "Sechskantschraube DIN 933 M12×40 8.8 verzinkt", 0.21, "DIN 933 M12x40"], ["M-2102", "Sechskantschraube DIN 933 M10×30 8.8 verzinkt", 0.12, "DIN 933 M10x30"], ["M-2103", "Sechskantmutter DIN 934 M12 verzinkt", 0.06, "DIN 934 M12"], ["M-2104", "Sechskantmutter DIN 934 M10 verzinkt", 0.04, "DIN 934 M10"], ["M-2105", "Scheibe DIN 125 A13 verzinkt", 0.03, "DIN 125 A13"], ["M-2106", "Scheibe DIN 125 A10,5 verzinkt", 0.02, "DIN 125 A10.5"], ["M-2107", "Bolzenanker M12×110", 1.85, "ANKER M12x110"]])
    M(id, name, price, "S-2001", 3, "Normteil", { moq: 100, norm });
  M("M-2201", "Schienenklammer SK-16", 6.8, "S-1004", 10, "Zukaufteil", { moq: 20, partNo: "SK-16" });
  M("M-2301", "Feuerverzinken nach DIN EN ISO 1461 (je kg)", 0.95, "S-2002", 5, "Lohnbearbeitung", { unit: "kg", moq: 0, minCharge: 45 });
  // Anfangsbestand Halbzeuge und Normteile, als Bestandsübernahme gebucht (Bilanz, keine GuV-Wirkung)
  const open = [["M-2002", 120], ["M-2003", 60], ["M-2101", 200], ["M-2103", 150], ["M-2105", 40], ["M-2201", 10]]; let v = 0;
  for (const [m, q] of open) { const val = r2(q * materialOf(t, m).price); moveIn(t, m, "WH1", q, val); v = r2(v + val); }
  t.moves = []; postHist(t, { date: "2026-10-31", text: "Bestandsübernahme Halbzeuge und Normteile Werk Stuttgart", lines: [{ acct: "1300", dr: v }, { acct: "1100", cr: v }] });
  t.workCenters = WORK_CENTERS.map(w => Object.assign({}, w));
  t.eng = { drawings: [] };
  t.roles.push({ id: "engineer", name: "Konstruktion", perms: ["view", "engineer"] });
  let n = t.users.length; t.users.push({ id: "u" + (++n), name: "Felix Amann", role: "engineer" }, { id: "u" + (++n), name: "Selin Kaya", role: "engineer" });
  return t;
}

/* --- Ableitung aus einer normalisierten Zeichnung: Stückliste, Arbeitsplan, Bezugsquellen, Kalkulation --- */
const KINDS = ["Blechteil", "Profil", "Normteil", "Zukaufteil"];
function deriveDrawing(t, d) {
  const issues = [], bom = [], ops = [], parts = []; let weight = 0;
  const findSheet = (grade, th) => t.master.materials.find(m => m.form === "Blech" && m.grade === grade && m.thickness === th);
  const findSection = (grade, sec) => t.master.materials.find(m => (m.form === "Flach" || m.form === "Rohr") && m.grade === grade && m.section === sec);
  const normKey = s => String(s || "").toUpperCase().replace(/[×X]/g, "X").replace(/,/g, ".").replace(/\s+/g, " ").trim();
  const addBom = (mat, qty, src) => { const b = bom.find(x => x.mat === mat); if (b) { b.qty = r2(b.qty + qty); b.from.push(src); } else bom.push({ mat, qty: r2(qty), from: [src] }); };
  let laserH = 0, kantH = 0, saegH = 0, montMin = 0, lasParts = 0, kantParts = 0, saegParts = 0;
  for (const it of d.items) {
    const tag = "Pos. " + it.pos;
    if (!KINDS.includes(it.kind)) { issues.push([tag, `Teileart „${it.kind}“ unbekannt`, "error"]); continue; }
    if (!(it.qty > 0) || Math.round(it.qty) !== it.qty) { issues.push([tag, "Menge muss eine ganze Zahl > 0 sein", "error"]); continue; }
    if (it.kind === "Blechteil") {
      const m = findSheet(it.grade, +it.thickness); if (!m) { issues.push([tag, `Kein Materialstamm für Blech ${it.grade} ${it.thickness} mm`, "error"]); continue; }
      if (!(it.length > 0 && it.width > 0)) { issues.push([tag, "Abmessungen fehlen", "error"]); continue; }
      const kg = r2(it.length / 100 * it.width / 100 * it.thickness / 100 * (DENSITY[it.grade] || 7.85)); weight = r2(weight + kg * it.qty);
      const cut = it.cutLength > 0 ? it.cutLength : 2 * (it.length + it.width) + (it.holes || 0) * Math.PI * (it.holeDia || 13);
      const speed = (LASER_SPEED[it.grade] || {})[+it.thickness] || 2;
      const perPiece = cut / 1000 / speed / 60 + ((it.holes || 0) + 1) * 2 / 3600;
      laserH += perPiece * it.qty; lasParts++;
      if (it.bends > 0) { kantH += it.bends * 0.6 / 60 * it.qty; kantParts++; }
      addBom(m.id, r2(kg * it.qty * (1 + SCRAP)), tag);
      parts.push({ pos: it.pos, name: it.name, kind: it.kind, qty: it.qty, mat: m.id, kg, cutLength: Math.round(cut), bends: it.bends || 0, source: "Eigenfertigung" });
    } else if (it.kind === "Profil") {
      const m = findSection(it.grade, it.section); if (!m) { issues.push([tag, `Kein Materialstamm für Profil ${it.grade} ${it.section}`, "error"]); continue; }
      const kg = r2(it.length / 1000 * m.kgPerM); weight = r2(weight + kg * it.qty); saegH += 2 / 60 * it.qty; saegParts++;
      addBom(m.id, r2(kg * it.qty * 1.05), tag); parts.push({ pos: it.pos, name: it.name, kind: it.kind, qty: it.qty, mat: m.id, kg, source: "Eigenfertigung" });
    } else if (it.kind === "Normteil") {
      const m = t.master.materials.find(x => x.type === "Normteil" && normKey(x.norm) === normKey(it.norm)); if (!m) { issues.push([tag, `Normteil „${it.norm}“ nicht im Materialstamm`, "error"]); continue; }
      montMin += 0.5 * it.qty; addBom(m.id, it.qty, tag); parts.push({ pos: it.pos, name: m.name, kind: it.kind, qty: it.qty, mat: m.id, source: "Katalog " + supplierName(t, m.supplier) });
    } else {
      const m = it.mat ? materialOf(t, it.mat) : t.master.materials.find(x => (it.partNo && x.partNo === it.partNo) || x.name.toLowerCase() === String(it.name).toLowerCase());
      if (!m) { issues.push([tag, `Zukaufteil „${it.name}${it.partNo ? " " + it.partNo : ""}“ ohne Materialstamm und Bezugsquelle – Einkauf muss eine Quelle zuordnen`, "error"]); parts.push({ pos: it.pos, name: it.name, kind: it.kind, qty: it.qty, mat: null, source: "offen" }); continue; }
      montMin += 3 * it.qty; addBom(m.id, it.qty, tag); parts.push({ pos: it.pos, name: m.name, kind: it.kind, qty: it.qty, mat: m.id, source: supplierName(t, m.supplier) });
    }
  }
  const pcs = 1; // Zeiten je Baugruppe; Rüstzeiten getrennt
  const op = (wc, text, setup, perUnit, instr) => { if (perUnit <= 0 && !setup) return; const w = t.workCenters.find(x => x.id === wc); ops.push({ no: String((ops.length + 1) * 10).padStart(4, "0"), wc, wcName: w.name, rate: w.rate, text, setup: r2(setup), perUnit: Math.round(perUnit * 1000) / 1000, instr }); };
  if (lasParts) op("LAS", "Blechteile schneiden", 0.25, laserH, `Zuschnitt aller Blechteile nach Zeichnung ${d.drawingNo} Rev. ${d.revision}. Teile entgraten und mit Positionsnummer kennzeichnen. Schnittlänge gesamt je Baugruppe: ${Math.round(parts.filter(p => p.kind === "Blechteil").reduce((a, p) => a + p.cutLength * p.qty, 0))} mm.`);
  if (kantParts) op("KANT", "Blechteile abkanten", 0.3, kantH, `Biegungen gemäß Zeichnung, Innenradius = Blechdicke, Winkeltoleranz ±1°. Erstteil messen und dokumentieren.`);
  if (saegParts) op("SAEG", "Profile sägen", 0.15, saegH, `Profile auf Länge sägen, Toleranz ±1 mm, entgraten.`);
  if (d.weldLength > 0) op("SCHW", "Baugruppe heften und schweißen", 0.3, d.weldLength / 1000 * 0.35, `Teile in Vorrichtung ausrichten, heften, Maßkontrolle. Kehlnähte a=${d.weldSize || 4} mm umlaufend nach Zeichnung (MAG, ISO 5817 C). Nahtlänge je Baugruppe ${d.weldLength} mm.`);
  if (d.finish === "Feuerverzinkt") ops.push({ no: String((ops.length + 1) * 10).padStart(4, "0"), wc: "EXT", wcName: "Fremdbearbeitung", text: "Feuerverzinken (Lohnbearbeitung)", external: true, mat: "M-2301", supplier: "S-2002", instr: `Baugruppen zur Feuerverzinkerei senden. Verzinkung nach DIN EN ISO 1461, Gewinde vor Verzinkung schützen. Rückmeldung über Wareneingang.` });
  if (montMin > 0) op("MONT", "Normteile und Zukaufteile montieren", 0.2, montMin / 60, `Normteile und Zukaufteile nach Stückliste beilegen bzw. montieren. Schrauben M12 mit 79 Nm anziehen (8.8, verzinkt, μ=0,14).`);
  op("QS", "Endprüfung und Kennzeichnung", 0.1, 0.1, `Hauptmaße, Schweißnähte (Sichtprüfung) und Oberfläche prüfen. Typenschild mit Zeichnungsnummer und Auftragsnummer anbringen.`);
  const matCost = r2(bom.reduce((a, b) => a + b.qty * materialOf(t, b.mat).price, 0));
  const labor = r2(ops.filter(o => !o.external).reduce((a, o) => a + (o.perUnit + o.setup / 10) * o.rate, 0)); // Rüstzeit auf Losgröße 10 umgelegt
  const ext = d.finish === "Feuerverzinkt" ? r2(weight * materialOf(t, "M-2301").price) : 0;
  return { bom, ops, parts, issues, weight, costing: { material: matCost, labor, external: ext, total: r2(matCost + labor + ext), basis: "Losgröße 10 für Rüstzeiten" } };
}
function newReq(t, r, ctx, auto) {
    const net = r2(r.qty * r.price); const lvl = auto ? null : reqApprovalLevel(net);
    const q = Object.assign({ no: nextNo(t, "BANF"), date: t.date, requester: ctx.user, requesterName: ctx.userName, net, status: lvl ? "zur Freigabe" : "freigegeben", level: lvl, approvedBy: auto ? "Bedarfsplanung (Fertigungsauftrag)" : (lvl ? null : "automatisch bis 1.000 €"), po: null }, r);
    t.reqs.push(q); return q;
}
function prodOfDrawing(t, no) { return t.master.products.find(p => p.drawing === no); }
function reqApprovalLevel(net) { for (const [lim, lvl] of APPROVAL_LIMITS) if (net <= lim) return lvl; return "ceo"; }

Object.assign(CMD, {
  /* Konstruktion */
  importDrawing(w, t, p, ctx) {
    need(t, ctx, "engineer"); if (t.id !== "elevon") fail("TENANT", "Konstruktion gibt es in dieser Demo bei Elevon.");
    const d = p.drawing || {}; const no = String(d.drawingNo || "").trim(); if (!no) fail("DRAWING", "Zeichnungsnummer fehlt im Schriftfeld.");
    if (!Array.isArray(d.items) || !d.items.length) fail("DRAWING", "Keine Stücklistenpositionen in der Zeichnung gefunden.");
    const rev = String(d.revision || "A"); const ex = t.eng.drawings.find(x => x.no === no && x.rev === rev); if (ex) fail("DUPLICATE", `Zeichnung ${no} Rev. ${rev} ist bereits importiert.`);
    const items = d.items.map(i => ({ pos: String(i.pos), name: String(i.name || "").slice(0, 80), qty: +i.qty, kind: i.kind, grade: i.grade || null, thickness: i.thickness != null ? +i.thickness : null, length: +i.length || 0, width: +i.width || 0, section: i.section || null, norm: i.norm || null, partNo: i.partNo || null, bends: +i.bends || 0, holes: +i.holes || 0, holeDia: +i.holeDia || 0, cutLength: +i.cutLength || 0, mat: i.mat || null }));
    const dr = { no, rev, title: String(d.title || no).slice(0, 80), source: d.source || "DXF", file: d.file || null, finish: d.finish || "ohne", weldLength: +d.weldLength || 0, weldSize: +d.weldSize || 4, scale: d.scale || null, author: d.author || null, items, aiAssisted: !!d.aiAssisted, importedBy: ctx.user, importedByName: ctx.userName, date: t.date, status: "importiert", geometry: d.geometry || null };
    Object.assign(dr, deriveDrawing(t, Object.assign({ drawingNo: no, revision: rev }, dr))); t.eng.drawings.push(dr);
    const err = dr.issues.filter(i => i[2] === "error").length;
    return { text: `Zeichnung ${no} Rev. ${rev} importiert: ${items.length} Positionen, ${dr.bom.length} Stücklistenmaterialien, ${dr.ops.length} Arbeitsgänge, Gewicht ${dr.weight} kg${err ? ` – ${err} Klärungspunkt(e)` : ""} – keine Buchung`, objects: [no] };
  },
  createPurchasedPart(w, t, p, ctx) {
    need(t, ctx, "buy"); const sup = find(t.master.suppliers, "id", p.supplierId, "Lieferant"); const name = String(p.name || "").trim(); if (name.length < 3) fail("NAME", "Bezeichnung fehlt.");
    if (!(p.price > 0)) fail("PRICE", "Preis aus dem Lieferantenangebot fehlt."); const dup = t.master.materials.find(m => m.name.toLowerCase() === name.toLowerCase() || (p.partNo && m.partNo === p.partNo)); if (dup) fail("DUPLICATE", `Material existiert bereits: ${dup.id} ${dup.name}.`);
    const id = "M-" + (2400 + t.master.materials.filter(m => m.id.startsWith("M-24")).length + 1);
    t.master.materials.push({ id, name, price: r2(p.price), supplier: sup.id, leadDays: +p.leadDays || 10, type: "Zukaufteil", unit: "Stk", moq: +p.moq || 1, partNo: p.partNo || null, quote: p.quoteRef || null });
    for (const dr of t.eng.drawings.filter(x => x.status === "importiert")) { for (const it of dr.items) if (it.kind === "Zukaufteil" && !it.mat && (it.name.toLowerCase() === name.toLowerCase() || (p.partNo && it.partNo === p.partNo))) it.mat = id; Object.assign(dr, deriveDrawing(t, Object.assign({ drawingNo: dr.no, revision: dr.rev }, dr))); }
    return { text: `Zukaufteil ${id} „${name}“ angelegt: ${sup.name}, ${r2(p.price)} €/Stk, ${+p.leadDays || 10} Tage Lieferzeit`, objects: [id] };
  },
  releaseDesign(w, t, p, ctx) {
    need(t, ctx, "engineer"); const dr = find(t.eng.drawings, "no", p.drawingNo, "Zeichnung"); if (dr.status !== "importiert") fail("STATUS", `Zeichnung hat Status „${dr.status}“.`);
    if (dr.importedBy === ctx.user) fail("FOUR_EYES", "Vier-Augen-Prinzip: Die Konstruktionsfreigabe muss eine andere Person erteilen als die, die importiert hat.");
    const err = dr.issues.filter(i => i[2] === "error"); if (err.length) fail("ISSUES", `Freigabe nicht möglich: ${err.length} offene Klärungspunkte (${err.map(e => e[0]).join(", ")}).`);
    const id = "B-" + dr.no.replace(/[^A-Za-z0-9]/g, ""); const prod = { id, name: dr.title, drawing: dr.no, rev: dr.rev, type: "Baugruppe", bom: dr.bom.map(b => [b.mat, b.qty]), ops: dr.ops.map(o => Object.assign({}, o)), weight: dr.weight, stdCost: dr.costing.total, released: t.date, releasedBy: ctx.userName };
    const i = t.master.products.findIndex(x => x.id === id); if (i >= 0) t.master.products[i] = prod; else t.master.products.push(prod);
    dr.status = "freigegeben"; dr.releasedBy = ctx.userName; dr.product = id;
    return { text: `Konstruktionsfreigabe ${dr.no} Rev. ${dr.rev} durch ${ctx.userName}: Material ${id} mit Stückliste (${prod.bom.length} Positionen) und Arbeitsplan (${prod.ops.length} Vorgänge), Plan-Herstellkosten ${prod.stdCost} €/Stk`, objects: [id] };
  },

  /* Fertigung Baugruppen */
  createAssemblyOrder(w, t, p, ctx) {
    need(t, ctx, "produce"); const pr = find(t.master.products, "id", p.productId, "Baugruppe"); if (pr.type !== "Baugruppe") fail("TYPE", "Nur freigegebene Baugruppen.");
    const qty = +p.qty; if (!(qty > 0) || Math.round(qty) !== qty) fail("QTY", "Menge muss eine ganze Zahl > 0 sein.");
    const comps = pr.bom.map(([mat, per]) => ({ mat, qty: Math.round(per * qty * 10) / 10, issued: 0 }));
    const ops = pr.ops.map(o => Object.assign({}, o, { hours: o.external ? 0 : r2(o.setup + o.perUnit * qty), status: "offen", extQty: o.external ? Math.ceil(pr.weight * qty) : 0 }));
    const pa = { no: nextNo(t, "PA"), kind: "Baugruppe", product: pr.id, qty, status: "eröffnet", components: comps, ops, labor: 0, ext: 0, docs: [], wip: 0, so: null, date: t.date, mrp: null };
    t.prodOrders.push(pa); return { text: `Fertigungsauftrag ${pa.no}: ${qty} × ${pr.name}, ${ops.length} Vorgänge, ${r2(ops.reduce((a, o) => a + o.hours, 0))} h geplant – keine Buchung`, objects: [pa.no] };
  },
  planAssemblyOrder(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.kind !== "Baugruppe") fail("TYPE", "Nur Baugruppenaufträge."); if (pa.mrp) fail("DONE", "Bedarfsplanung bereits erfolgt.");
    const reqs = [];
    for (const c of pa.components) { const m = materialOf(t, c.mat); const short = r2(c.qty - avail(t, c.mat, "WH1")); if (short <= 0) continue;
      const qty = m.unit === "kg" ? Math.max(Math.ceil(short), m.moq || 0) : Math.max(Math.ceil(short), m.moq || 1);
      reqs.push(newReq(t, { type: "direkt", mat: m.id, text: m.name, qty, unit: m.unit, price: m.price, supplier: m.supplier, prod: pa.no, acct: "1300" }, ctx, true)); }
    for (const o of pa.ops.filter(x => x.external)) { const m = materialOf(t, o.mat); const net = Math.max(r2(o.extQty * m.price), m.minCharge || 0); const price = r2(net / o.extQty);
      reqs.push(newReq(t, { type: "Lohnbearbeitung", mat: m.id, text: `${o.text} ${pa.no}`, qty: o.extQty, unit: "kg", price, supplier: o.supplier, prod: pa.no, op: o.no, acct: "1320" }, ctx, true)); }
    pa.mrp = { date: t.date, reqs: reqs.map(r => r.no) };
    return { text: `Bedarfsplanung ${pa.no}: ${reqs.length} Bedarfsanforderung(en) – ${reqs.map(r => `${r.text} ${r.qty} ${r.unit} bei ${supplierName(t, r.supplier)}`).join("; ") || "alles am Lager"}`, objects: reqs.map(r => r.no) };
  },
  confirmOperation(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.kind !== "Baugruppe") fail("TYPE", "Nur Baugruppenaufträge.");
    if (!["freigegeben", "in Fertigung"].includes(pa.status)) fail("STATUS", "Fertigungsauftrag muss freigegeben sein.");
    const op = pa.ops.find(o => o.status !== "erledigt"); if (!op) fail("DONE", "Alle Vorgänge sind rückgemeldet."); if (op.external) fail("EXTERNAL", `Vorgang ${op.no} ist Fremdbearbeitung: Rückmeldung über den Wareneingang der Lohnbearbeitung.`);
    const docs = [];
    if (pa.status === "freigegeben") { let v = 0; for (const c of pa.components) { const q = r2(c.qty - c.issued); if (q > 0) { v += moveOut(t, c.mat, "WH1", q, true); c.issued = r2(c.issued + q); } }
      const d = post(t, { date: t.date, text: "Materialentnahme " + pa.no, user: ctx.userName, ref: { type: "prodOrder", id: pa.no }, lines: [{ acct: "1320", dr: r2(v) }, { acct: "1300", cr: r2(v) }] }); pa.wip = r2(pa.wip + v); pa.docs.push(d.no); docs.push(d.no); pa.status = "in Fertigung"; }
    const h = p.hours > 0 ? +p.hours : op.hours; const v = r2(h * op.rate);
    const d = post(t, { date: t.date, text: `Rückmeldung ${pa.no} Vorgang ${op.no} ${op.wcName}: ${h} h`, user: ctx.userName, ref: { type: "prodOrder", id: pa.no }, lines: [{ acct: "1320", dr: v }, { acct: "6990", cr: v }] });
    op.status = "erledigt"; op.actual = h; pa.labor = r2(pa.labor + v); pa.wip = r2(pa.wip + v); pa.docs.push(d.no); docs.push(d.no);
    const next = pa.ops.find(o => o.status !== "erledigt"); if (next && next.external) next.status = "bereit zum Versand";
    return { text: `Vorgang ${op.no} ${op.wcName} rückgemeldet: ${h} h × ${op.rate} € = ${v} €${next ? " · nächster Vorgang: " + next.text : " · alle Vorgänge erledigt"}`, docs };
  },
  completeAssemblyOrder(w, t, p, ctx) {
    need(t, ctx, "produce"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); if (pa.kind !== "Baugruppe") fail("TYPE", "Nur Baugruppenaufträge.");
    if (pa.ops.some(o => o.status !== "erledigt")) fail("STATUS", "Erst alle Vorgänge rückmelden (inkl. Fremdbearbeitung).");
    const v = pa.wip; moveIn(t, pa.product, "WH2", pa.qty, v);
    const d = post(t, { date: t.date, text: `Ablieferung ${pa.no}: ${pa.qty} × ${pa.product}`, user: ctx.userName, ref: { type: "prodOrder", id: pa.no }, lines: [{ acct: "1330", dr: v }, { acct: "1320", cr: v }] });
    pa.docs.push(d.no); pa.status = "abgeschlossen"; pa.wip = 0; pa.unitCost = r2(v / pa.qty); const pr = t.master.products.find(x => x.id === pa.product);
    return { text: `${pa.qty} × ${pr.name} ins Fertigwarenlager, Ist-Herstellkosten ${pa.unitCost} €/Stk (Plan ${pr.stdCost} €)`, docs: [d.no] };
  },

  /* Einkauf: Bedarfsanforderungen direkt und indirekt */
  createRequisition(w, t, p, ctx) {
    need(t, ctx, "view"); let r;
    if (p.catalogId) { const c = find(t.catalog, "id", p.catalogId, "Katalogartikel"); const qty = +p.qty || 1; if (!(qty > 0) || Math.round(qty) !== qty) fail("QTY", "Menge muss eine ganze Zahl sein.");
      r = { type: "indirekt", text: c.name, catalog: c.id, qty, unit: "Stk", price: c.price, supplier: c.supplier, acct: c.acct, category: c.category }; }
    else { const cat = CATEGORY_DEFAULT[p.category]; if (!cat) fail("CATEGORY", "Warengruppe wählen."); const text = String(p.text || "").trim(); if (text.length < 3) fail("TEXT", "Beschreibung fehlt.");
      if (!(p.price > 0)) fail("PRICE", "Geschätzter Preis fehlt."); r = { type: "indirekt", text, qty: +p.qty || 1, unit: p.unit || "Stk", price: r2(p.price), supplier: p.supplierId || cat[0], acct: cat[1], category: p.category, freeText: true }; }
    const cc = p.costCenter || (t.master.costCenters[0] || {}).id; if (!t.master.costCenters.find(c => c.id === cc)) fail("CC", "Kostenstelle unbekannt."); r.costCenter = cc; if (p.forEmployee) r.forEmployee = p.forEmployee;
    const q = newReq(t, r, ctx, false);
    return { text: `Bedarfsanforderung ${q.no}: ${q.qty} × ${q.text}, ${q.net} € netto, Kostenstelle ${cc} – ${q.status === "freigegeben" ? "automatisch freigegeben (bis 1.000 €)" : q.level === "ceo" ? "Freigabe durch Geschäftsführung nötig (über 25.000 €)" : "Freigabe nötig (über 1.000 €)"}`, objects: [q.no] };
  },
  approveRequisition(w, t, p, ctx) {
    const q = find(t.reqs, "no", p.reqNo, "Bedarfsanforderung"); if (q.status !== "zur Freigabe") fail("STATUS", `Status „${q.status}“.`);
    const u = need(t, ctx, "approve"); if (q.level === "ceo" && u.role !== "ceo") fail("FORBIDDEN", "Über 25.000 € gibt nur die Geschäftsführung frei.");
    if (q.requester === ctx.user) fail("FOUR_EYES", "Vier-Augen-Prinzip: Eigene Anforderungen kann man nicht selbst freigeben.");
    if (p.reject) { q.status = "abgelehnt"; q.approvedBy = ctx.userName; return { text: `Bedarfsanforderung ${q.no} abgelehnt (${ctx.userName})` }; }
    q.status = "freigegeben"; q.approvedBy = ctx.userName; return { text: `Bedarfsanforderung ${q.no} über ${q.net} € freigegeben (${ctx.userName})` };
  },
  convertRequisitions(w, t, p, ctx) {
    need(t, ctx, "buy"); const open = t.reqs.filter(q => q.status === "freigegeben" && !q.po && (!p.reqNos || p.reqNos.includes(q.no))); if (!open.length) fail("NONE", "Keine freigegebenen Bedarfsanforderungen.");
    const by = {}; for (const q of open) (by[q.supplier] = by[q.supplier] || []).push(q);
    const nos = []; for (const [sup, qs] of Object.entries(by)) {
      const lines = qs.map(q => ({ mat: q.mat || q.catalog || q.no, qty: q.qty, price: q.price, kind: q.type === "indirekt" ? "Sachkosten" : q.type === "Lohnbearbeitung" ? "Lohnbearbeitung" : "Material" }));
      const r = CMD.createPO(w, t, { supplierId: sup, lines }, ctx); const po = t.purchaseOrders.find(x => x.no === r.objects[0]);
      po.lines.forEach((l, i) => { const q = qs[i]; l.req = q.no; l.acct = q.acct; l.costCenter = q.costCenter || null; l.prod = q.prod || null; l.op = q.op || null; l.text = q.text; q.po = po.no; q.status = "bestellt"; });
      po.kind = qs.every(q => q.type === "indirekt") ? "indirekt" : qs.some(q => q.type === "Lohnbearbeitung") ? "Lohnbearbeitung" : "direkt"; nos.push(po.no); }
    return { text: `${nos.length} Bestellung(en) aus ${open.length} Bedarfsanforderungen: ${nos.join(", ")} – keine Buchung`, objects: nos };
  },
  shipToSubcontractor(w, t, p, ctx) {
    need(t, ctx, "ship"); const pa = find(t.prodOrders, "no", p.prodNo, "Fertigungsauftrag"); const op = pa.ops.find(o => o.external && o.status === "bereit zum Versand");
    if (!op) fail("STATUS", "Kein Vorgang bereit zur Fremdbearbeitung (vorherige Vorgänge zuerst rückmelden)."); const q = t.reqs.find(r => r.prod === pa.no && r.op === op.no);
    if (!q || !q.po) fail("ORDER", "Für die Lohnbearbeitung gibt es noch keine Bestellung."); op.status = "beim Lohnbearbeiter"; op.shipped = t.date;
    return { text: `${pa.qty} Baugruppen (${op.extQty} kg) an ${supplierName(t, op.supplier)} versandt – Lieferschein zu ${q.po}, keine Buchung` };
  },

  /* HR: Recruiting und Onboarding */
  openPosition(w, t, p, ctx) { need(t, ctx, "hr"); const title = String(p.title || "").trim(); if (title.length < 3) fail("TITLE", "Stellenbezeichnung fehlt."); if (!(p.costRate > 0)) fail("RATE", "Kostensatz fehlt.");
    const s = { id: "ST-" + (t.hr.positions.length + 1), title, role: p.role || "Mitarbeiter", costRate: r2(p.costRate), status: "offen", opened: t.date }; t.hr.positions.push(s); return { text: `Stelle ${s.id} „${title}“ ausgeschrieben`, objects: [s.id] }; },
  moveApplicant(w, t, p, ctx) { need(t, ctx, "hr"); const a = find(t.hr.applicants, "id", p.id, "Bewerbung"); const flow = ["neu", "Interview", "Angebot"]; if (p.to === "abgesagt") { a.status = "abgesagt"; return { text: `${a.name}: Absage versandt` }; }
    if (!flow.includes(a.status) || flow.indexOf(p.to) !== flow.indexOf(a.status) + 1) fail("STATUS", `Von „${a.status}“ nicht nach „${p.to}“.`); a.status = p.to; return { text: `${a.name}: ${p.to === "Interview" ? "zum Interview eingeladen" : "Vertragsangebot versandt"}` }; },
  hireApplicant(w, t, p, ctx) {
    need(t, ctx, "hr"); const a = find(t.hr.applicants, "id", p.id, "Bewerbung"); if (a.status !== "Angebot") fail("STATUS", "Einstellung erst nach angenommenem Angebot."); const s = find(t.hr.positions, "id", a.position, "Stelle");
    const r = CMD.hireEmployee(w, t, { name: a.name, role: s.role, skill: s.role, costRate: s.costRate }, ctx); const empId = r.objects[0]; a.status = "eingestellt"; s.status = "besetzt";
    const start = addDays(t.date, 14); const cc = (t.master.costCenters[0] || {}).id; const reqs = [];
    reqs.push(newReq(t, { type: "indirekt", text: "Notebook Standard (GWG bis 800 €) für " + a.name, catalog: "K-05", qty: 1, unit: "Stk", price: 779, supplier: "S-I02", acct: "6830", category: "IT", costCenter: cc, forEmployee: empId }, ctx, false));
    if (/techniker|konstruktion|filiale|monteur/i.test(s.role)) reqs.push(newReq(t, { type: "indirekt", text: "Arbeitsschutz-Set für " + a.name, catalog: "K-01", qty: 1, unit: "Stk", price: 48.5, supplier: "S-I01", acct: "6815", category: "Arbeitsschutz", costCenter: cc, forEmployee: empId }, ctx, false));
    t.hr.onboarding.push({ employee: empId, name: a.name, start, tasks: [["Arbeitsvertrag erstellt", true], ["Personalstamm angelegt", true], ...reqs.map(q => ["Ausstattung angefordert: " + q.text.split(" für ")[0] + " (" + q.no + ")", true]), ["Erster Arbeitstag " + start, false], ["Einweisung Arbeitssicherheit", false]] });
    return { text: `${a.name} eingestellt (${s.title}), Start ${start}; Onboarding mit ${reqs.length} Bedarfsanforderung(en) für die Ausstattung angelegt`, objects: [empId] };
  }
});

/* Prozessinstanzen: Konstruktion bis Fertigware und Procure-to-Pay indirekt */
const _piV05 = processInstances;
processInstances = function (t) {
  const out = _piV05(t).filter(i => !(i.object && i.object.kind === "Baugruppe"));
  if (t.eng) for (const dr of t.eng.drawings) {
    const pas = t.prodOrders.filter(p => p.product === dr.product); const pa = pas[pas.length - 1];
    const reqs = pa ? t.reqs.filter(r => r.prod === pa.no) : []; const pos = [...new Set(reqs.map(r => r.po).filter(Boolean))].map(no => t.purchaseOrders.find(x => x.no === no));
    const ext = pa && pa.ops.find(o => o.external); const intDone = pa ? pa.ops.filter(o => !o.external && o.status === "erledigt").length : 0, intAll = pa ? pa.ops.filter(o => !o.external).length : 0;
    const err = dr.issues.filter(i => i[2] === "error");
    const s = [stepOf("Zeichnung importiert", "Konstruktion", "done", [dr.no + " Rev. " + dr.rev]), stepOf("Stückliste und Arbeitsplan abgeleitet", "System", "done", [dr.bom.length + " Materialien", dr.ops.length + " Vorgänge"]),
      stepOf("Bezugsquellen geklärt", "Einkauf", err.length ? "error" : "done", [], err.length ? err.map(e => e[1]).join("; ") : null), stepOf("Konstruktionsfreigabe", "Konstruktion (Vier-Augen)", dr.status === "freigegeben" ? "done" : err.length ? "open" : "active", dr.product ? [dr.product] : []),
      stepOf("Fertigungsauftrag", "Arbeitsvorbereitung", pa ? "done" : dr.status === "freigegeben" ? "active" : "open", pa ? [pa.no] : []), stepOf("Bedarfsplanung", "Arbeitsvorbereitung", pa && pa.mrp ? "done" : pa ? "active" : "open", reqs.map(r => r.no)),
      stepOf("Bestellungen", "Einkauf", reqs.length && reqs.every(r => r.po) ? "done" : pa && pa.mrp ? "active" : "open", pos.map(p => p.no)), stepOf("Wareneingang", "Lager", pos.length && pos.filter(p => p.kind !== "Lohnbearbeitung").every(p => p.grDoc) ? "done" : reqs.length && reqs.every(r => r.po) ? "active" : "open", pos.filter(p => p.grDoc && p.kind !== "Lohnbearbeitung").map(p => p.grDoc)),
      stepOf("Fertigung (Vorgänge)", "Fertigung", pa && intDone === intAll ? "done" : pa && ["freigegeben", "in Fertigung"].includes(pa.status) ? "active" : pa && pa.status === "eröffnet" && pa.mrp && pos.filter(p => p.kind !== "Lohnbearbeitung").every(p => p.grDoc) ? "active" : "open", pa ? [intDone + "/" + intAll + " Vorgänge"] : []),
      stepOf("Lohnbearbeitung", "Lager / Einkauf", !ext ? "skipped" : ext.status === "erledigt" ? "done" : ["bereit zum Versand", "beim Lohnbearbeiter"].includes(ext.status) ? "active" : "open", ext && ext.status !== "offen" ? [ext.status] : []),
      stepOf("Ablieferung ins Lager", "Fertigung", pa && pa.status === "abgeschlossen" ? "done" : "open", pa && pa.unitCost ? [pa.unitCost + " €/Stk"] : [])];
    out.push({ id: dr.no, chain: "Design-to-Make", title: `${dr.no} · ${dr.title}${pa ? " · " + pa.qty + " Stk" : ""}`, steps: s, object: { drawing: dr, pa } });
  }
  for (const q of (t.reqs || []).filter(r => r.type === "indirekt")) { const po = q.po && t.purchaseOrders.find(x => x.no === q.po); const inv = po && t.supInvoices.find(i => i.poNo === po.no);
    const s = [stepOf("Bedarfsanforderung", q.requesterName, "done", [q.no]), stepOf("Freigabe", q.level === "ceo" ? "CEO" : q.level ? "Freigabeberechtigte" : "automatisch", q.status === "abgelehnt" ? "error" : q.status === "zur Freigabe" ? "active" : "done", q.approvedBy ? [q.approvedBy] : []),
      stepOf("Bestellung", "Einkauf", po ? "done" : q.status === "freigegeben" ? "active" : "open", po ? [po.no] : []), stepOf("Wareneingang / Leistung", "Anforderer / Lager", po && po.grDoc ? "done" : po ? "active" : "open", po && po.grDoc ? [po.grDoc] : []),
      stepOf("Rechnung", "Kreditoren", inv ? "done" : po && po.grDoc ? "active" : "open", inv ? [inv.no] : []), stepOf("Zahlung", "CFO", inv && inv.open === 0 ? "done" : inv ? "active" : "open", [])];
    out.push({ id: q.no, chain: "Procure-to-Pay indirekt", title: `${q.no} · ${q.qty} × ${q.text} · ${q.net} €`, steps: s, object: q }); }
  return out;
};
const QUERY_ONLY = { findStaff: true };
/* --- Accounts: jede Person kann sich je Unternehmen einen Account mit Rolle anlegen --- */
Object.assign(CMD, {
  registerAccount(w, t, p, ctx) {
    const name = String(p.name || "").trim().replace(/\s+/g, " "); if (name.length < 2 || name.length > 40) fail("NAME", "Name: 2 bis 40 Zeichen.");
    const owner = String(p.owner || ""); if (!owner || owner.length > 80) fail("OWNER", "Account ohne Inhaber.");
    const role = t.roles.find(r => r.id === p.role); if (!role) fail("ROLE", "Unbekannte Rolle.");
    const mine = t.users.find(u => u.owner === owner && u.active !== false); if (mine) fail("DUPLICATE", `Du hast bei diesem Unternehmen bereits den Account ${mine.name}.`);
    const u = { id: "acc" + (t.users.filter(x => x.account).length + 1), name, role: role.id, owner, account: true, since: t.date, active: true }; t.users.push(u);
    ctx.userName = name; return { text: `Account ${name} angelegt – Rolle ${role.name}`, objects: [u.id] };
  },
  changeAccountRole(w, t, p, ctx) {
    const u = find(t.users.filter(x => x.account), "id", p.accountId, "Account"); if (u.owner !== p.owner) fail("FORBIDDEN", "Nur der Inhaber kann seinen Account ändern.");
    const role = t.roles.find(r => r.id === p.role); if (!role) fail("ROLE", "Unbekannte Rolle."); if (u.active === false) fail("INACTIVE", "Account ist geschlossen.");
    const old = roleOf(t, u).name; u.role = role.id; ctx.userName = u.name; return { text: `${u.name}: Rolle ${old} → ${role.name}` };
  },
  closeAccount(w, t, p, ctx) {
    const u = find(t.users.filter(x => x.account), "id", p.accountId, "Account"); if (u.owner !== p.owner) fail("FORBIDDEN", "Nur der Inhaber kann seinen Account schließen.");
    u.active = false; ctx.userName = u.name; return { text: `Account ${u.name} geschlossen` };
  }
});

return { WORK_CENTERS, CATALOG, CATEGORY_DEFAULT, deriveDrawing, ROLE_DESC, dueMaintenance, returnRate, personnelCost, cutoverStatus, legacyData, MIG_OBJECTS, MIG_LABEL, isAbsent, absHoursInPeriod, SERVICE_RATE, VERSION, START_DATE, TENANT_IDS, COA, SIZES, E5, createWorld, resetTenant, resetAll, dispatch, kpis, plOf, trialBalance, balance, projectMetrics, replenishmentProposals, processInstances, tenantHash, costing, avail, periodOf, customerName, supplierName, articleName, materialOf, QUERY_ONLY, _internal: { HIST, crossHistory } };
});
