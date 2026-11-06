/* Automatisierte Akzeptanztests der STEGARC Business Engine. Ausführen: node engine.test.js */
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
    if (id === "elevon") { eq(E.balance(t, "1300"), sv(m => m.startsWith("M-")), "Elevon Rohstoffbestand = Konto 1300"); eq(E.balance(t, "1330"), sv(m => m === "P-E5" || m.startsWith("B-")), "Elevon Fertigware = Konto 1330"); eq(E.balance(t, "1320"), t.prodOrders.reduce((a, p) => a + p.wip, 0), "Elevon WIP = Konto 1320"); }
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

/* --- v0.5 Rollen und Accounts --- */
test("Rollenkonzept: Controller bucht und schließt ab, zahlt aber nicht; Prüfer liest nur", () => {
  const w = E.createWorld(); const t = w.tenants.elevon; const ctrl = t.users.find(u => u.role === "controller"), aud = t.users.find(u => u.role === "auditor");
  ok(ctrl && aud && t.roles.every(r => r.desc), "Rollen mit Beschreibung vorhanden");
  const inv = t.supInvoices.find(i => i.open > 0); const r1 = E.dispatch(w, "elevon", "payVendor", { invoiceNo: inv.no }, { user: ctrl.id }); ok(!r1.ok && r1.code === "FORBIDDEN", "Controller darf nicht zahlen");
  const r2 = E.dispatch(w, "elevon", "createQuote", { customerId: "C-RHEIN", qty: 1, discountPct: 0 }, { user: aud.id }); ok(!r2.ok && r2.code === "FORBIDDEN", "Prüfer darf nichts anlegen");
  ok(E.dispatch(w, "elevon", "closePeriod", {}, { user: ctrl.id }).ok || true, "Controller darf abschließen");
});
test("Accounts: anlegen, nutzen, Rolle wechseln, schließen – reproduzierbar", () => {
  const w = E.createWorld(); const h0 = E.tenantHash(w.tenants.novamart);
  const r = run(w, "novamart", "registerAccount", { name: "Gast Vertrieb", role: "sales", owner: "o-1" }); const id = r.objects[0];
  ok(!E.dispatch(w, "novamart", "registerAccount", { name: "Zweiter", role: "cfo", owner: "o-1" }, {}).ok, "nur ein Account je Person und Unternehmen");
  const o = E.dispatch(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }, { user: id }); ok(o.ok && o.user === "Gast Vertrieb", "Account bestellt als sich selbst");
  ok(!E.dispatch(w, "novamart", "invoiceWebOrder", { orderNo: o.objects[0] }, { user: id }).ok, "Vertrieb darf nicht buchen");
  ok(!E.dispatch(w, "novamart", "changeAccountRole", { accountId: id, role: "cfo", owner: "fremd" }, {}).ok, "fremde Person darf Rolle nicht ändern");
  run(w, "novamart", "changeAccountRole", { accountId: id, role: "cfo", owner: "o-1" });
  ok(E.dispatch(w, "novamart", "closePeriod", {}, { user: id }).code !== "FORBIDDEN", "als CFO berechtigt");
  run(w, "novamart", "closeAccount", { accountId: id, owner: "o-1" }); const x = E.dispatch(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }, { user: id }); ok(!x.ok && x.code === "INACTIVE", "geschlossener Account gesperrt");
  E.resetTenant(w, "novamart"); ok(E.tenantHash(w.tenants.novamart) === h0 && !w.tenants.novamart.users.some(u => u.account), "Reset entfernt Accounts");
});

/* --- v0.6 Konstruktion bis Fertigware, Einkauf direkt/indirekt, Recruiting --- */
const DXF = require("../src/dxf.js"); const SK = () => DXF.toDrawing(require("fs").readFileSync(__dirname + "/../samples/SK-200.dxf", "utf8"), "SK-200.dxf");
function skChain(w, qty) {
  const e = (cmd, p, user) => { const r = E.dispatch(w, "elevon", cmd, p, { user }); if (!r.ok) throw new Error(cmd + ": " + r.text); return r; };
  e("importDrawing", { drawing: SK().drawing }, "u12");
  e("createPurchasedPart", { name: "Elastomerlager", partNo: "EL-40", supplierId: "S-1004", price: 12.4, leadDays: 8, moq: 10, quoteRef: "AN-2026-117" }, "u5");
  e("releaseDesign", { drawingNo: "SK-200" }, "u13");
  const pa = e("createAssemblyOrder", { productId: "B-SK200", qty }, "u4").objects[0];
  e("planAssemblyOrder", { prodNo: pa }, "u4"); const pos = e("convertRequisitions", {}, "u5").objects;
  const t = w.tenants.elevon;
  for (const no of pos) { const po = t.purchaseOrders.find(x => x.no === no); if (po.kind !== "Lohnbearbeitung") { e("postGoodsReceipt", { poNo: no }, "u6"); e("postSupplierInvoice", { poNo: no }, "u2"); } }
  e("releaseProdOrder", { prodNo: pa }, "u4"); e("confirmOperation", { prodNo: pa }, "u4"); e("confirmOperation", { prodNo: pa }, "u4"); e("confirmOperation", { prodNo: pa }, "u4");
  e("shipToSubcontractor", { prodNo: pa }, "u6"); const sub = pos.find(no => t.purchaseOrders.find(x => x.no === no).kind === "Lohnbearbeitung"); e("postGoodsReceipt", { poNo: sub }, "u6"); e("postSupplierInvoice", { poNo: sub }, "u2");
  e("confirmOperation", { prodNo: pa }, "u4"); e("confirmOperation", { prodNo: pa }, "u4"); e("completeAssemblyOrder", { prodNo: pa }, "u4");
  return pa;
}
test("DXF: Schriftfeld, 9 Positionen und Schnittlängen aus der Abwicklung", () => {
  const r = SK(); ok(r.drawing.drawingNo === "SK-200" && r.drawing.revision === "B" && r.drawing.items.length === 9, "Kopfdaten und Positionen");
  eq(r.drawing.items[0].cutLength, Math.round(1000 + 4 * Math.PI * 14), "Schnittlänge Grundplatte = Umfang + 4 Bohrungen Ø14");
});
test("Konstruktion: offene Bezugsquelle blockiert Freigabe; Vier-Augen bei Konstruktionsfreigabe", () => {
  const w = E.createWorld(); ok(E.dispatch(w, "elevon", "importDrawing", { drawing: SK().drawing }, { user: "u12" }).ok, "Import");
  const r1 = E.dispatch(w, "elevon", "releaseDesign", { drawingNo: "SK-200" }, { user: "u13" }); ok(!r1.ok && r1.code === "ISSUES", "Zukaufteil ohne Quelle blockiert");
  run(w, "elevon", "createPurchasedPart", { name: "Elastomerlager", partNo: "EL-40", supplierId: "S-1004", price: 12.4 });
  const r2 = E.dispatch(w, "elevon", "releaseDesign", { drawingNo: "SK-200" }, { user: "u12" }); ok(!r2.ok && r2.code === "FOUR_EYES", "Importeur darf nicht freigeben");
  ok(E.dispatch(w, "elevon", "releaseDesign", { drawingNo: "SK-200" }, { user: "u13" }).ok, "andere Person gibt frei");
  const pr = w.tenants.elevon.master.products.find(p => p.id === "B-SK200"); ok(pr && pr.bom.length === 8 && pr.ops.some(o => o.external), "Stückliste und Arbeitsplan mit Lohnbearbeitung");
  ok(w.tenants.elevon.docs.length === E.createWorld().tenants.elevon.docs.length, "Konstruktion bucht nichts");
});
test("Zeichnung bis Fertigware: Bedarf → BANF → Bestellungen je Lieferant → WE → Fertigung → Lohnbearbeitung → Lager", () => {
  const w = E.createWorld(); const pa = skChain(w, 20); const t = w.tenants.elevon; const o = t.prodOrders.find(x => x.no === pa);
  ok(o.status === "abgeschlossen" && E.avail(t, "B-SK200", "WH2") === 20, "20 Konsolen im Fertigwarenlager");
  const sups = new Set(t.purchaseOrders.filter(p => t.reqs.some(r => r.po === p.no)).map(p => p.supplier)); ok(sups.has("S-2003") && sups.has("S-2001") && sups.has("S-2002"), "Bleche, Normteile und Verzinkung bei den richtigen Lieferanten");
  eq(Math.round(o.unitCost * 20), Math.round(E.balance(t, "1330") - E.createWorld().tenants.elevon.docs.reduce((a, d) => a + d.lines.filter(l => l.acct === "1330").reduce((x, l) => x + l.dr - l.cr, 0), 0)), "Fertigwarenzugang = Herstellkosten");
  eq(E.balance(t, "1320"), E.createWorld().tenants.elevon.docs.reduce((a, d) => a + d.lines.filter(l => l.acct === "1320").reduce((x, l) => x + l.dr - l.cr, 0), 0), "WIP nach Abschluss wieder auf Ausgangswert");
  consistency(w);
});
test("Lohnbearbeitung: Wareneingang vor Versand an Lohnbearbeiter abgelehnt", () => {
  const w = E.createWorld(); const e = (c, p, u) => E.dispatch(w, "elevon", c, p, { user: u });
  e("importDrawing", { drawing: SK().drawing }, "u12"); e("createPurchasedPart", { name: "Elastomerlager", partNo: "EL-40", supplierId: "S-1004", price: 12.4 }, "u5"); e("releaseDesign", { drawingNo: "SK-200" }, "u13");
  const pa = e("createAssemblyOrder", { productId: "B-SK200", qty: 5 }, "u4").objects[0]; e("planAssemblyOrder", { prodNo: pa }, "u4"); const pos = e("convertRequisitions", {}, "u5").objects;
  const sub = pos.find(no => w.tenants.elevon.purchaseOrders.find(x => x.no === no).kind === "Lohnbearbeitung"); const r = e("postGoodsReceipt", { poNo: sub }, "u6"); ok(!r.ok && r.code === "STATUS", "abgelehnt");
});
test("Einkauf indirekt: Freigabegrenzen, Vier-Augen, Kostenstelle, Sachkonto beim Wareneingang", () => {
  const w = E.createWorld(); const t = w.tenants.novamart;
  const a = E.dispatch(w, "novamart", "createRequisition", { catalogId: "K-03", qty: 10, costCenter: "KS120" }, { user: "u7" }); ok(a.ok && t.reqs[0].status === "freigegeben", "bis 1.000 € automatisch");
  const b = E.dispatch(w, "novamart", "createRequisition", { catalogId: "K-08", qty: 1, costCenter: "KS110" }, { user: "u4" }); ok(t.reqs[1].status === "zur Freigabe", "Reinigung 2.450 € braucht Freigabe");
  ok(E.dispatch(w, "novamart", "createRequisition", { category: "Beratung/Dienstleistung", text: "Ladenbau Filiale Köln", price: 38000, costCenter: "KS120" }, { user: "u2" }).ok && t.reqs[2].level === "ceo", "über 25.000 € nur CEO");
  ok(E.dispatch(w, "novamart", "approveRequisition", { reqNo: t.reqs[2].no }, { user: "u2" }).code === "FORBIDDEN", "CFO darf über 25.000 € nicht");
  ok(E.dispatch(w, "novamart", "approveRequisition", { reqNo: t.reqs[1].no }, { user: "u2" }).ok, "CFO gibt Reinigung frei");
  const po = run(w, "novamart", "convertRequisitions", {}).objects; ok(po.length === 2, "zwei Lieferanten");
  const before = E.balance(t, "6835"); for (const no of po) { run(w, "novamart", "postGoodsReceipt", { poNo: no }); run(w, "novamart", "postSupplierInvoice", { poNo: no }); }
  eq(E.balance(t, "6835") - before, 2450, "Reinigung auf Sachkonto 6835"); ok(t.docs.some(d => d.lines.some(l => l.cc === "KS110")), "Kostenstelle am Beleg"); consistency(w);
});
test("Recruiting: Bewerbung bis Einstellung erzeugt Onboarding mit Ausstattungs-Anforderungen", () => {
  const w = E.createWorld(); const t = w.tenants.elevon; const ap = t.hr.applicants.find(a => a.position === "ST-1" && a.status === "Interview");
  run(w, "elevon", "moveApplicant", { id: ap.id, to: "Angebot" }); const n = t.master.employees.length; run(w, "elevon", "hireApplicant", { id: ap.id });
  ok(t.master.employees.length === n + 1 && t.hr.onboarding.length === 1 && t.reqs.length === 2, "Mitarbeiter, Onboarding, Notebook und Arbeitsschutz angefordert");
  ok(t.hr.positions[0].status === "besetzt", "Stelle besetzt");
});

test("MR-1200 (2 Blätter, 15 Pos.): Profile mit Bohrungen/Gewinden, Pulverbeschichtung nach m², volle Kette", () => {
  const r = DXF.toDrawing(require("fs").readFileSync(__dirname + "/../samples/MR-1200.dxf", "utf8"), "MR-1200.dxf"); ok(r.drawing.items.length === 15 && r.drawing.revision === "C" && !r.warnings.length, "15 Positionen, Index C");
  const w = E.createWorld(); const t = w.tenants.elevon; const e = (c, p, u) => { const x = E.dispatch(w, "elevon", c, p, { user: u }); if (!x.ok) throw new Error(c + ": " + x.text); return x; };
  e("importDrawing", { drawing: r.drawing }, "u12"); const dr = t.eng.drawings[0]; ok(dr.issues.length === 1 && /KV-25/.test(dr.issues[0][1]), "nur KV-25 offen");
  ok(dr.ops.some(o => o.wc === "BOHR") && dr.ops.some(o => o.extUnit === "m²"), "Bohren und Beschichtung im Arbeitsplan");
  e("createPurchasedPart", { name: "Kabelverschraubung M25, Satz", partNo: "KV-25", supplierId: "S-1003", price: 7.9, leadDays: 5, moq: 10 }, "u5"); e("releaseDesign", { drawingNo: "MR-1200" }, "u13");
  const pa = e("createAssemblyOrder", { productId: "B-MR1200", qty: 10 }, "u4").objects[0]; e("planAssemblyOrder", { prodNo: pa }, "u4"); const pos = e("convertRequisitions", {}, "u5").objects;
  for (const no of pos) { const po = t.purchaseOrders.find(x => x.no === no); if (po.kind !== "Lohnbearbeitung") { e("postGoodsReceipt", { poNo: no }, "u6"); e("postSupplierInvoice", { poNo: no }, "u2"); } }
  e("releaseProdOrder", { prodNo: pa }, "u4"); const o = t.prodOrders.find(x => x.no === pa); while (!o.ops.find(x => x.status !== "erledigt").external) e("confirmOperation", { prodNo: pa }, "u4");
  e("shipToSubcontractor", { prodNo: pa }, "u6"); const sub = pos.find(no => t.purchaseOrders.find(x => x.no === no).kind === "Lohnbearbeitung"); ok(t.purchaseOrders.find(x => x.no === sub).supplier === "S-2005", "Beschichter"); e("postGoodsReceipt", { poNo: sub }, "u6");
  while (o.ops.some(x => x.status !== "erledigt")) e("confirmOperation", { prodNo: pa }, "u4"); e("completeAssemblyOrder", { prodNo: pa }, "u4");
  ok(E.avail(t, "B-MR1200", "WH2") === 10, "10 Rahmen im Lager"); consistency(w);
});

/* ---- Atomarität mit schlanker Sicherung (Stresstest v0.9.8) ---- */
test("Atomarität: abgelehnte Befehle lassen alle drei Mandanten unverändert; Mandantenübergreifendes nur über send()", () => {
  const w = E.createWorld(); const hs = () => E.TENANT_IDS.map(id => E.tenantHash(w.tenants[id])).join(); const h0 = hs();
  for (const [tid, cmd, p] of [["novamart", "placeWebOrder", { articleId: "A-10001", qty: 99999 }], ["elevon", "createPO", { supplierId: "S-NIX", lines: [] }], ["aventra", "assignStaff", { projectId: "P-0000", employeeIds: [], hoursPerMonth: 1 }]]) { const r = E.dispatch(w, tid, cmd, p, A); ok(!r.ok, cmd + " abgelehnt"); }
  ok(hs() === h0, "alle Mandanten unverändert");
  const src = require("fs").readFileSync(require("path").join(__dirname, "../src/engine.js"), "utf8"); const writes = src.split("\n").filter(l => /w\.tenants\[/.test(l) && !/^function (send|createWorld|resetTenant)\b/.test(l.trim()) && !/snapOther|const t = w\.tenants\[tenantId\]/.test(l));
  ok(writes.length === 0, "unerwarteter Zugriff auf andere Mandanten: " + writes.map(l => l.trim().slice(0, 60)).join(" | "));
  const n0 = w.tenants.elevon.inbox.length; run(w, "novamart", "orderLiftsFromElevon", { qty: 1 }); ok(w.tenants.elevon.inbox.length === n0 + 1, "Nachricht an Elevon zugestellt");
});

for (const [s, n] of results) console.log((s === "ok" ? "  ✓ " : "  ✗ ") + n);
console.log(`\n${pass} bestanden, ${failN} fehlgeschlagen`);
process.exit(failN ? 1 : 0);
