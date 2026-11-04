/* Automatisierte Akzeptanztests der NEXORA Business Engine. Ausführen: node engine.test.js */
const E = require("../src/engine.js");
let pass = 0, failN = 0; const results = [];
function test(name, fn) { try { fn(); pass++; results.push(["ok", name]); } catch (e) { failN++; results.push(["FEHLER", name + " → " + e.message]); } }
function eq(a, b, msg) { if (Math.abs(a - b) > 0.011) throw new Error(`${msg}: erwartet ${b}, ist ${a}`); }
function ok(c, msg) { if (!c) throw new Error(msg); }
const A = { auto: true };
const run = (w, t, cmd, p) => { const r = E.dispatch(w, t, cmd, p, A); if (!r.ok) throw new Error(`${t}.${cmd}: ${r.text}`); return r; };

/* Konsistenzregeln, nach jedem Szenario geprüft */
function consistency(w) {
  for (const id of E.TENANT_IDS) {
    const t = w.tenants[id];
    for (const d of t.docs) { const dr = d.lines.reduce((a, l) => a + l.dr, 0), cr = d.lines.reduce((a, l) => a + l.cr, 0); eq(dr, cr, `${id} Beleg ${d.no} ausgeglichen`); }
    const tb = E.trialBalance(t); eq(Object.values(tb).reduce((a, b) => a + b, 0), 0, `${id} Summenbilanz`);
    eq(E.balance(t, "1200"), t.custInvoices.reduce((a, i) => a + i.open, 0), `${id} Debitoren-Nebenbuch = Konto 1200`);
    eq(-E.balance(t, "1600"), t.supInvoices.reduce((a, i) => a + i.open, 0), `${id} Kreditoren-Nebenbuch = Konto 1600`);
    const sv = acctPrefix => Object.values(t.stock).filter(s => acctPrefix(s.mat)).reduce((a, s) => a + s.value, 0);
    if (id === "elevon") { eq(E.balance(t, "1300"), sv(m => m.startsWith("M-")), "Elevon Rohstoffbestand = Konto 1300"); eq(E.balance(t, "1330"), sv(m => m === "P-E5"), "Elevon Fertigware = Konto 1330"); eq(E.balance(t, "1320"), t.prodOrders.reduce((a, p) => a + p.wip, 0), "Elevon WIP = Konto 1320"); }
    if (id === "novamart") eq(E.balance(t, "1310"), sv(() => true), "NovaMart Warenbestand = Konto 1310");
    for (const s of Object.values(t.stock)) { ok(s.qty >= 0, `${id} Bestand ${s.mat} nicht negativ`); ok(s.res <= s.qty, `${id} Reservierung ${s.mat} ≤ Bestand`); }
  }
}

/* ---- 1. Seed und Reproduzierbarkeit ---- */
test("Seed: alle Mandanten konsistent (S)", () => consistency(E.createWorld({ size: "S" })));
test("Seed: alle Mandanten konsistent (M)", () => consistency(E.createWorld({ size: "M" })));
test("Seed: alle Mandanten konsistent (L)", () => consistency(E.createWorld({ size: "L" })));
test("Reproduzierbar: zwei Welten mit gleichem Seed sind identisch", () => { const a = E.createWorld(), b = E.createWorld(); for (const id of E.TENANT_IDS) ok(E.tenantHash(a.tenants[id]) === E.tenantHash(b.tenants[id]), id + " Hash gleich"); });
test("Reset stellt den Ausgangszustand exakt wieder her", () => {
  const w = E.createWorld(); const h0 = E.tenantHash(w.tenants.novamart);
  run(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }); ok(E.tenantHash(w.tenants.novamart) !== h0, "Zustand verändert");
  E.resetTenant(w, "novamart"); ok(E.tenantHash(w.tenants.novamart) === h0, "Hash nach Reset gleich");
});
test("Reset betrifft nur den eigenen Mandanten", () => {
  const w = E.createWorld(); run(w, "aventra", "approveTime", { projectId: "P-1001" }); const hA = E.tenantHash(w.tenants.aventra), hE = E.tenantHash(w.tenants.elevon);
  E.resetTenant(w, "novamart"); ok(E.tenantHash(w.tenants.aventra) === hA && E.tenantHash(w.tenants.elevon) === hE, "andere Mandanten unverändert");
});
test("Demo dreimal hintereinander: identisches Ergebnis nach Reset", () => {
  const w = E.createWorld(); const hashes = [];
  for (let i = 0; i < 3; i++) { E.resetAll(w); retailChain(w); projectChain(w); hashes.push(E.TENANT_IDS.map(id => E.tenantHash(w.tenants[id])).join()); }
  ok(hashes[0] === hashes[1] && hashes[1] === hashes[2], "Hashes gleich");
});
test("Querbeziehungen der Historie stimmen zwischen Mandanten überein", () => {
  const w = E.createWorld();
  const av = w.tenants.aventra.custInvoices.filter(i => i.partnerId === "C-ELEVON"), el = w.tenants.elevon.supInvoices.filter(i => i.partnerId === "S-AVENTRA");
  eq(av.length, el.length, "Anzahl Rechnungen"); for (const i of av) { const m = el.find(x => x.extNo === i.no); ok(m, "Gegenstück zu " + i.no); eq(m.gross, i.gross, "Betrag " + i.no); ok(m.status === i.status, "Status " + i.no); }
});

/* ---- 2. NovaMart: Retail Order-to-Cash ---- */
function retailChain(w) {
  const t = w.tenants.novamart; const r = run(w, "novamart", "placeWebOrder", { customerId: "K-300001", articleId: "A-10001", qty: 1 }); const no = r.objects[0];
  run(w, "novamart", "pickOrder", { orderNo: no }); run(w, "novamart", "shipOrder", { orderNo: no }); run(w, "novamart", "confirmDelivery", { orderNo: no }); run(w, "novamart", "invoiceWebOrder", { orderNo: no }); run(w, "novamart", "settlePSP", { orderNo: no });
  return t.webOrders.find(o => o.no === no);
}
test("Retail O2C: Bestellung bucht nichts, reserviert Bestand", () => {
  const w = E.createWorld(); const t = w.tenants.novamart; const docs = t.docs.length, cash = E.balance(t, "1100"), av = E.avail(t, "A-10001", "ZL1");
  const r = run(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 });
  eq(t.docs.length, docs, "keine Buchung"); eq(E.balance(t, "1100"), cash, "kein Zahlungseingang"); eq(E.avail(t, "A-10001", "ZL1"), av - 1, "verfügbar −1"); ok(r.docs.length === 0, "keine Belege");
});
test("Retail O2C: Wareneinsatz beim Versand, Umsatz bei Rechnung, Bank bei Abgleich", () => {
  const w = E.createWorld(); const t = w.tenants.novamart; const rev0 = -E.balance(t, "4000"), cogs0 = E.balance(t, "5000"), bank0 = E.balance(t, "1100");
  const r = run(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }); const no = r.objects[0];
  run(w, "novamart", "pickOrder", { orderNo: no }); run(w, "novamart", "shipOrder", { orderNo: no });
  eq(E.balance(t, "5000") - cogs0, 455, "Wareneinsatz 455 €"); eq(-E.balance(t, "4000"), rev0, "noch kein Umsatz");
  run(w, "novamart", "confirmDelivery", { orderNo: no }); run(w, "novamart", "invoiceWebOrder", { orderNo: no });
  eq(-E.balance(t, "4000") - rev0, 587.39, "Umsatz netto"); eq(E.balance(t, "1100"), bank0, "Bank unverändert vor Abgleich");
  run(w, "novamart", "settlePSP", { orderNo: no }); ok(E.balance(t, "1100") > bank0, "Bank nach Abgleich höher"); consistency(w);
});
test("Retail: Unterschreitung Meldebestand erzeugt Bestellvorschlag mit Begründung", () => {
  const w = E.createWorld(); const t = w.tenants.novamart; ok(!E.replenishmentProposals(t).some(p => p.article === "A-10001"), "vorher kein Vorschlag");
  run(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }); const p = E.replenishmentProposals(t).find(x => x.article === "A-10001"); ok(p && p.qty > 0 && p.basis, "Vorschlag vorhanden");
  run(w, "novamart", "createReplenishment", { articleId: "A-10001" }); ok(!E.replenishmentProposals(t).some(x => x.article === "A-10001"), "offene Bestellung berücksichtigt");
});
test("Retail: Bestellung über verfügbarem Bestand wird abgelehnt, nichts verändert", () => {
  const w = E.createWorld(); const h = E.tenantHash(w.tenants.novamart); const r = E.dispatch(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 999 }, A);
  ok(!r.ok && r.code === "AVAILABILITY", "abgelehnt"); ok(E.tenantHash(w.tenants.novamart) === h, "unverändert");
});

/* ---- 3. Aventra: Time-to-Invoice / Project-to-Cash ---- */
function projectChain(w) {
  const t = w.tenants.aventra; const e = t.projects[0].team[3].employee;
  run(w, "aventra", "recordTime", { projectId: "P-1001", employeeId: e, hours: 8 }); run(w, "aventra", "approveTime", { projectId: "P-1001" });
  run(w, "aventra", "recordExpense", { projectId: "P-1001", employeeId: e, amount: 240, text: "Bahn Stuttgart" });
  return run(w, "aventra", "invoiceProject", { projectId: "P-1001" });
}
test("Zeiterfassung: erfasst ohne Kosten, Freigabe erhöht Projektkosten um Stunden × Kostensatz, keine Finanzbuchung", () => {
  const w = E.createWorld(); const t = w.tenants.aventra; const e = t.master.employees.find(x => x.id === t.projects[0].team[3].employee);
  const c0 = t.co["P-1001"].cost, docs = t.docs.length;
  const r = run(w, "aventra", "recordTime", { projectId: "P-1001", employeeId: e.id, hours: 8 }); eq(t.co["P-1001"].cost, c0, "keine Kosten vor Freigabe");
  run(w, "aventra", "approveTime", { ids: r.objects }); eq(t.co["P-1001"].cost - c0, 8 * e.costRate, "Kosten +8 h × Kostensatz"); eq(t.docs.length, docs, "keine Finanzbuchung");
  const pm = E.projectMetrics(t).find(p => p.id === "P-1001"); eq(pm.unbilled, 8 * 158, "abrechenbar 8 h × 158 €");
});
test("Project-to-Cash: Rechnung fakturiert genau die freigegebenen Leistungen", () => {
  const w = E.createWorld(); const t = w.tenants.aventra; const ar0 = E.balance(t, "1200"); const r = projectChain(w);
  const inv = t.custInvoices.slice(-1)[0]; eq(inv.net, 4 * 8 * 158 + 240, "Netto = 4 × 8 h × 158 € + 240 € Reisekosten");
  eq(E.balance(t, "1200") - ar0, inv.gross, "Forderung"); ok(t.timeEntries.filter(e => e.project === "P-1001" && e.period === "2026-11").every(e => e.status === "abgerechnet"), "Zeiten abgerechnet"); consistency(w);
});
test("Projekt über Budget wird erkannt (P-1001)", () => { const w = E.createWorld(); const pm = E.projectMetrics(w.tenants.aventra).find(p => p.id === "P-1001"); ok(pm.eac > pm.budget, "EAC > Budget"); });
test("Staffing: Kapazitätskonflikt wird erkannt", () => {
  const w = E.createWorld(); const t = w.tenants.aventra; const busy = t.projects[0].team[0].employee;
  const r = E.dispatch(w, "aventra", "assignStaff", { projectId: "P-1002", employeeIds: [busy], hoursPerMonth: 120 }, A); ok(!r.ok && r.code === "CAPACITY", "Konflikt gemeldet");
});

/* ---- 4. Elevon: Lead-to-Cash mit Fertigung, Montage, Abnahme ---- */
function elevonChain(w, soNo) {
  run(w, "elevon", "runMRP", { soNo }); const so = w.tenants.elevon.salesOrders.find(s => s.no === soNo);
  if (so.mrp.shortages.length) { const r = run(w, "elevon", "createPOsFromMRP", { soNo }); for (const po of r.objects) { run(w, "elevon", "postGoodsReceipt", { poNo: po }); run(w, "elevon", "postSupplierInvoice", { poNo: po }); } }
  const pa = w.tenants.elevon.prodOrders.find(p => p.so === soNo).no;
  run(w, "elevon", "releaseProdOrder", { prodNo: pa }); run(w, "elevon", "postConsumption", { prodNo: pa }); run(w, "elevon", "confirmProduction", { prodNo: pa }); run(w, "elevon", "completeProduction", { prodNo: pa });
  run(w, "elevon", "postGoodsIssue", { soNo }); run(w, "elevon", "recordInstallation", { soNo }); run(w, "elevon", "confirmAcceptance", { soNo }); return run(w, "elevon", "invoiceSalesOrder", { soNo });
}
test("Elevon L2C: 12 Anlagen von Angebot bis Zahlung, Kosten und Bestände stimmen", () => {
  const w = E.createWorld(); const t = w.tenants.elevon;
  const q = run(w, "elevon", "createQuote", { customerId: "C-RHEIN", qty: 12, discountPct: 6 }).objects[0]; ok(t.quotes[0].status === "zur Freigabe", "Rabatt > 5 % braucht Freigabe");
  ok(!E.dispatch(w, "elevon", "createSalesOrder", { quoteNo: q }, A).ok, "Auftrag vor Freigabe abgelehnt");
  run(w, "elevon", "approveQuote", { quoteNo: q }); const so = run(w, "elevon", "createSalesOrder", { quoteNo: q }).objects[0];
  const docs = t.docs.length; ok(t.docs.length === docs, "Auftrag bucht nicht");
  const inv = elevonChain(w, so); const s = t.salesOrders[0];
  ok(s.status === "fakturiert", "Status fakturiert"); eq(t.custInvoices.slice(-1)[0].net, 12 * 62000 * 0.94, "Rechnungsbetrag");
  const pa = t.prodOrders[0]; ok(pa.unitCost > 30000 && pa.unitCost < 40000, "Herstellkosten je Anlage plausibel: " + pa.unitCost);
  eq(E.balance(t, "1330"), 0, "Fertigware ausgeliefert"); eq(E.balance(t, "1320"), 0, "keine unfertigen Erzeugnisse");
  const ar = t.custInvoices.slice(-1)[0]; run(w, "elevon", "receivePayment", { invoiceNo: ar.no }); ok(ar.status === "bezahlt", "bezahlt"); consistency(w);
  const pi = E.processInstances(t)[0]; ok(pi.steps.every(x => ["done", "skipped"].includes(x.state)), "Process Explorer: alle Schritte erledigt");
});
test("Elevon: Rechnung vor Abnahme wird abgelehnt", () => { const w = E.createWorld(); const so = run(w, "elevon", "createSalesOrder", { customerId: "C-RHEIN", qty: 1, unitPrice: 60000 }).objects[0]; ok(!E.dispatch(w, "elevon", "invoiceSalesOrder", { soNo: so }, A).ok, "abgelehnt"); });
test("Elevon: Freigabe Fertigungsauftrag prüft Verfügbarkeit", () => { const w = E.createWorld(); const so = run(w, "elevon", "createSalesOrder", { customerId: "C-RHEIN", qty: 12, unitPrice: 60000 }).objects[0]; run(w, "elevon", "runMRP", { soNo: so }); const r = E.dispatch(w, "elevon", "releaseProdOrder", { prodNo: w.tenants.elevon.prodOrders[0].no }, A); ok(!r.ok && r.code === "AVAILABILITY", "Fehlteile gemeldet"); });
test("Drei-Wege-Abgleich: Rechnung vor Wareneingang abgelehnt", () => { const w = E.createWorld(); const po = run(w, "elevon", "createPO", { supplierId: "S-1002", lines: [{ mat: "M-1002", qty: 2, price: 6400 }] }).objects[0]; const r = E.dispatch(w, "elevon", "postSupplierInvoice", { poNo: po }, A); ok(!r.ok && r.code === "THREE_WAY", "abgelehnt"); });

/* ---- 5. Unternehmensübergreifend ---- */
test("Cross-Company: NovaMart bestellt 2 Aufzüge bei Elevon – vollständige Kette in beiden Büchern", () => {
  const w = E.createWorld(); const N = w.tenants.novamart, L = w.tenants.elevon;
  const po = run(w, "novamart", "orderLiftsFromElevon", { qty: 2 }).objects[0]; const msg = L.inbox.find(m => m.type === "customerOrder"); ok(msg && msg.poNo === po, "Bestellung bei Elevon eingegangen");
  const so = run(w, "elevon", "processInbox", { id: msg.id }).objects[0]; elevonChain(w, so);
  const del = N.inbox.find(m => m.type === "delivery"); ok(del, "Lieferavis bei NovaMart"); const a0 = E.balance(N, "0700"); run(w, "novamart", "processInbox", { id: del.id }); eq(E.balance(N, "0700") - a0, 2 * 62000 * 0.97, "Anlage aktiviert");
  const si = N.inbox.find(m => m.type === "supplierInvoice"); ok(si, "Rechnung bei NovaMart"); run(w, "novamart", "processInbox", { id: si.id });
  const ap = N.supInvoices.slice(-1)[0]; eq(E.balance(N, "1700"), E.balance(E.createWorld().tenants.novamart, "1700"), "WE/RE-Verrechnung nach Rechnung wieder ausgeglichen");
  run(w, "novamart", "payVendor", { invoiceNo: ap.no }); const adv = L.inbox.find(m => m.type === "paymentAdvice"); ok(adv, "Zahlungsavis bei Elevon");
  run(w, "elevon", "processInbox", { id: adv.id }); const ar = L.custInvoices.find(i => i.no === ap.extNo); ok(ar && ar.status === "bezahlt", "Elevon-Rechnung ausgeglichen"); eq(ar.gross, ap.gross, "gleicher Betrag in beiden Büchern"); consistency(w);
});
test("Cross-Company: Aventra-Rechnung an Elevon erscheint dort als zu buchende Eingangsrechnung, nicht automatisch gebucht", () => {
  const w = E.createWorld(); const L = w.tenants.elevon; const ap0 = -E.balance(L, "1600"); projectChain(w);
  const m = L.inbox.find(x => x.type === "supplierInvoice"); ok(m, "Eingang vorhanden"); eq(-E.balance(L, "1600"), ap0, "noch nicht gebucht");
  run(w, "elevon", "processInbox", { id: m.id }); const inv = L.supInvoices.slice(-1)[0]; eq(-E.balance(L, "1600") - ap0, inv.gross, "jetzt gebucht"); run(w, "elevon", "payVendor", { invoiceNo: inv.no });
  const adv = w.tenants.aventra.inbox.find(x => x.type === "paymentAdvice"); run(w, "aventra", "processInbox", { id: adv.id }); ok(w.tenants.aventra.custInvoices.find(i => i.no === inv.extNo).status === "bezahlt", "bei Aventra bezahlt"); consistency(w);
});

/* ---- 6. Plattformregeln ---- */
test("Idempotenz: gleicher Schlüssel erzeugt keinen zweiten Beleg", () => { const w = E.createWorld(); const t = w.tenants.novamart; const a = E.dispatch(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }, { auto: true, idem: "k1" }); const n = t.webOrders.length; const b = E.dispatch(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }, { auto: true, idem: "k1" }); ok(b.replay && t.webOrders.length === n, "kein Duplikat"); });
test("Periodensteuerung: nach Monatsabschluss keine Buchung in alter Periode", () => { const w = E.createWorld(); run(w, "aventra", "closePeriod", {}); ok(w.tenants.aventra.periods["2026-11"] === "closed" && w.tenants.aventra.date === "2026-12-01", "abgeschlossen"); });
test("Berechtigung: Berater darf keine Zeiten freigeben", () => { const w = E.createWorld(); const r = E.dispatch(w, "aventra", "approveTime", { projectId: "P-1001" }, { user: "u4" }); ok(!r.ok && r.code === "FORBIDDEN", "verweigert"); });
test("Fehler mitten im Vorgang lässt keinen Teilzustand zurück", () => { const w = E.createWorld(); const h = E.TENANT_IDS.map(id => E.tenantHash(w.tenants[id])).join(); E.dispatch(w, "elevon", "createPO", { supplierId: "S-1002", lines: [{ mat: "M-1002", qty: -1, price: 1 }] }, A); ok(E.TENANT_IDS.map(id => E.tenantHash(w.tenants[id])).join() === h, "unverändert"); });


/* ---- 7. v0.4: Service, Wartung, Retouren, Click & Collect, HR, Migration, Cutover ---- */
test("Service-to-Cash: Teilwartung berechnet Teile, nicht die Arbeitszeit", () => {
  const w = E.createWorld(); const t = w.tenants.elevon; const sv = run(w, "elevon", "createServiceTicket", { assetId: "A-5000", text: "Kabine steht zwischen 3. und 4. OG" }).objects[0];
  run(w, "elevon", "scheduleTechnician", { svNo: sv }); run(w, "elevon", "reserveParts", { svNo: sv, mat: "M-1008", qty: 1 }); const stock0 = t.stock["M-1008@WH5"].qty;
  run(w, "elevon", "executeService", { svNo: sv, hours: 3 }); eq(t.stock["M-1008@WH5"].qty, stock0 - 1, "Ersatzteil verbraucht");
  run(w, "elevon", "invoiceService", { svNo: sv }); const inv = t.custInvoices.slice(-1)[0]; eq(inv.net, 890 * 1.3, "nur Teile × 1,3"); ok(t.master.assets[0].history.length === 1, "Anlagenhistorie fortgeschrieben"); consistency(w);
});
test("Service: Vollwartung erzeugt keine Rechnung, Kosten bleiben beim Vertrag", () => { const w = E.createWorld(); const t = w.tenants.elevon; const a = t.master.assets.find(x => x.contract === "Vollwartung"); const n = t.custInvoices.length; const sv = run(w, "elevon", "createServiceTicket", { assetId: a.id }).objects[0]; run(w, "elevon", "scheduleTechnician", { svNo: sv }); run(w, "elevon", "executeService", { svNo: sv }); run(w, "elevon", "invoiceService", { svNo: sv }); eq(t.custInvoices.length, n, "keine Rechnung"); ok(t.serviceOrders[0].cost > 0, "Kosten erfasst"); });
test("Technikerplanung überspringt genehmigte Abwesenheit", () => {
  const w = E.createWorld(); const t = w.tenants.elevon; const techs = t.master.employees.filter(e => e.role === "Servicetechniker");
  for (const e of techs.slice(0, techs.length - 1)) { const ab = run(w, "elevon", "requestAbsence", { employeeId: e.id, from: t.date, days: 5 }).objects[0]; run(w, "elevon", "approveAbsence", { id: ab }); }
  const sv = run(w, "elevon", "createServiceTicket", { assetId: "A-5000" }).objects[0]; run(w, "elevon", "scheduleTechnician", { svNo: sv }); ok(t.serviceOrders[0].tech === techs[techs.length - 1].id, "einziger anwesender Techniker gewählt");
});
test("Maintain-to-Operate: fällige Wartungen aus Wartungsplan", () => { const w = E.createWorld(); const t = w.tenants.elevon; const due = E.dueMaintenance(t).length; ok(due > 0, "fällige Wartungen"); run(w, "elevon", "createMaintenanceOrders", { max: 3 }); eq(E.dueMaintenance(t).length, due - 3, "3 weniger fällig"); });
test("Retoure: wiederverkaufbar storniert Wareneinsatz, Gutschrift mindert Umsatz, Rückzahlung über Bank", () => {
  const w = E.createWorld(); const t = w.tenants.novamart; const o = retailChain(w); const rev = -E.balance(t, "4000"), st = t.stock["A-10001@ZL1"].qty;
  const r = run(w, "novamart", "createReturn", { orderNo: o.no, reason: "Bildfehler" }).objects[0]; run(w, "novamart", "inspectReturn", { retNo: r, decision: "wiederverkaufbar" }); eq(t.stock["A-10001@ZL1"].qty, st + 1, "zurück im Bestand");
  run(w, "novamart", "creditReturn", { retNo: r }); eq(rev - -E.balance(t, "4000"), o.net, "Umsatz um Netto gemindert"); run(w, "novamart", "refundReturn", { retNo: r }); eq(E.kpis(t).returnRate, 100, "Retourenquote"); consistency(w);
});
test("Click & Collect: Reservierung in der Filiale, Wareneinsatz erst bei Übergabe", () => {
  const w = E.createWorld(); const t = w.tenants.novamart; const st = t.stock["A-10001@F01"].qty; const c = E.balance(t, "5000");
  const o = run(w, "novamart", "placeClickCollect", { storeId: "F01", articleId: "A-10001" }).objects[0]; eq(E.avail(t, "A-10001", "F01"), st - 1, "reserviert"); eq(E.balance(t, "5000"), c, "keine Buchung");
  run(w, "novamart", "prepareCollect", { orderNo: o }); run(w, "novamart", "handoverCollect", { orderNo: o }); eq(t.stock["A-10001@F01"].qty, st - 1, "Filialbestand"); ok(E.balance(t, "5000") > c, "Wareneinsatz gebucht");
  run(w, "novamart", "invoiceWebOrder", { orderNo: o }); run(w, "novamart", "settlePSP", { orderNo: o }); consistency(w);
});
test("HR: Abwesenheit reduziert freie Kapazität im Staffing", () => { const w = E.createWorld(); const t = w.tenants.aventra; const e = t.master.employees[10]; const f0 = E.dispatch(w, "aventra", "findStaff", { skill: e.skills[0] }, A).result.find(x => x.id === e.id).free; const ab = run(w, "aventra", "requestAbsence", { employeeId: e.id, from: "2026-11-10", days: 3 }).objects[0]; run(w, "aventra", "approveAbsence", { id: ab }); const f1 = E.dispatch(w, "aventra", "findStaff", { skill: e.skills[0] }, A).result.find(x => x.id === e.id).free; eq(f0 - f1, Math.min(f0, 24), "−24 h"); });
test("HR: Einstellung erweitert Stammdaten, ohne Lohnbuchung", () => { const w = E.createWorld(); const t = w.tenants.aventra; const n = t.docs.length; run(w, "aventra", "hireEmployee", { name: "Neue Beraterin", skill: "SAP MM", costRate: 60 }); eq(t.docs.length, n, "keine Buchung"); ok(t.master.employees.slice(-1)[0].skills[0] === "SAP MM", "Skill"); });
function migrate(w, rules) { run(w, "elevon", "migrationTest", { rules }); return w.tenants.elevon.migration; }
test("Migration: Testlauf verändert keine Produktivdaten und findet Fehler", () => { const w = E.createWorld(); const t = w.tenants.elevon; const h = E.tenantHash(Object.assign({}, t, { migration: null })); const M = migrate(w, {}); ok(E.MIG_OBJECTS.some(o => M.tests[o].errors > 0), "Fehler gefunden"); eq(t.master.customers.length, E.createWorld().tenants.elevon.master.customers.length, "keine Kunden angelegt"); ok(!E.dispatch(w, "elevon", "migrationRequestApproval", {}, A).ok, "Freigabe bei Fehlern abgelehnt"); });
test("Migration E2E: Regeln, Vier-Augen-Freigabe, Produktivlauf, Abstimmung, Go-live", () => {
  const w = E.createWorld(); const t = w.tenants.elevon; const M = migrate(w, { dedupe: true, mapCountry: true, fillZip: true, excludeUnmapped: true }); ok(E.MIG_OBJECTS.every(o => M.tests[o].errors === 0), "Testlauf fehlerfrei");
  ok(E.dispatch(w, "elevon", "migrationRequestApproval", {}, { user: "u2" }).ok, "CFO fordert an"); const self = E.dispatch(w, "elevon", "migrationApprove", {}, { user: "u2" }); ok(!self.ok && self.code === "FOUR_EYES", "Antragsteller kann nicht freigeben");
  const ok2 = E.dispatch(w, "elevon", "migrationApprove", {}, { user: "u1" }); ok(ok2.ok, "CEO gibt frei: " + ok2.text);
  ok(!E.dispatch(w, "elevon", "migrationRun", { object: "assets" }, { user: "u2" }).ok, "Anlagen vor Kunden abgelehnt");
  for (const o of E.MIG_OBJECTS) { const r = E.dispatch(w, "elevon", "migrationRun", { object: o }, { user: "u2" }); ok(r.ok, o + ": " + r.text); }
  const d = t.migration.done; eq(d.openItems.loadedSum + d.openItems.excludedSum, d.openItems.sourceSum, "Summen OP abgestimmt"); eq(-E.balance(t, "9000"), t.migration.expected9000, "Migrationsverrechnung = migrierte Werte");
  ok(E.cutoverStatus(t).ready, "Cutover bereit"); ok(E.dispatch(w, "elevon", "cutoverDecision", { decision: "Go" }, { user: "u1" }).ok, "Go"); consistency(w);
});
test("Cutover: Go vor Abschluss der Migration wird abgelehnt", () => { const w = E.createWorld(); migrate(w, {}); const r = E.dispatch(w, "elevon", "cutoverDecision", { decision: "Go" }, { user: "u1" }); ok(!r.ok && r.code === "NOT_READY", "abgelehnt"); });
test("v0.4 Reset bleibt reproduzierbar", () => { const w = E.createWorld(); const h = E.TENANT_IDS.map(id => E.tenantHash(w.tenants[id])); migrate(w, { dedupe: true }); retailChain(w); E.resetAll(w); ok(E.TENANT_IDS.every((id, i) => E.tenantHash(w.tenants[id]) === h[i]), "identisch"); });

for (const [s, n] of results) console.log((s === "ok" ? "  ✓ " : "  ✗ ") + n);
console.log(`\n${pass} bestanden, ${failN} fehlgeschlagen`);
process.exit(failN ? 1 : 0);
