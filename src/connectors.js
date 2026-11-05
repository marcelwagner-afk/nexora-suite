/* NEXORA Experience Layer – Konnektor-Schicht (v0.8). Reine Logik, kein DOM, in Node testbar.
   Die NEXORA-Engine ist ein Konnektor unter mehreren. Alle anderen Konnektoren sind SIMULIERT:
   deterministisch aus dem Seed erzeugt, ohne Netzwerkzugriff, ohne echte Daten.
   Zustand je Unternehmen, an das Engine-Mandantenobjekt gebunden: Wird ein Mandant zurückgesetzt
   (neues Mandantenobjekt), beginnen auch seine Konnektoren wieder im Ausgangszustand. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.NexoraConnectors = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const VERSION = "0.8.0";
  /* ---------- Konfiguration: Kosten (Beispielwerte, keine Herstellerpreise) ---------- */
  const COST_NOTE = "Beispielwerte, keine Herstellerpreise";
  const ROUTES = {
    nexora: [{ id: "engine", label: "NEXORA-Engine (intern)", viaAgent: "nexora", costPerCall: 0, note: "Eigene Engine, kein Fremdsystem" }],
    sap: [
      { id: "joule-a2a", label: "Joule (A2A)", viaAgent: "joule", costPerCall: 0.04, note: "Agent-zu-Agent über den SAP-Assistenten" },
      { id: "mcp-gateway", label: "MCP Gateway (kostenpflichtig)", viaAgent: "nexora", costPerCall: 0.12, note: "Werkzeugzugriff über ein lizenziertes Gateway" },
      { id: "released-api", label: "Freigegebene Schnittstelle", viaAgent: "nexora", costPerCall: 0.01, note: "Von SAP freigegebene Schnittstelle (z. B. OData), Systembenutzer" }
    ],
    m365: [{ id: "copilot-a2a", label: "Copilot (A2A)", viaAgent: "copilot", costPerCall: 0.03, note: "Agent-zu-Agent über den Microsoft-Assistenten" }, { id: "graph", label: "Graph-Schnittstelle", viaAgent: "nexora", costPerCall: 0.002, note: "Freigegebene Schnittstelle" }],
    servicenow: [{ id: "nowassist-a2a", label: "Now Assist (A2A)", viaAgent: "nowassist", costPerCall: 0.03, note: "Agent-zu-Agent über den ServiceNow-Assistenten" }, { id: "rest", label: "REST-Schnittstelle", viaAgent: "nexora", costPerCall: 0.005, note: "Freigegebene Schnittstelle" }],
    workday: [{ id: "workday-agent-a2a", label: "Workday-Agent (A2A)", viaAgent: "workday-agent", costPerCall: 0.03, note: "Agent-zu-Agent über den Workday-Assistenten" }, { id: "integration", label: "Integrationsschnittstelle", viaAgent: "nexora", costPerCall: 0.005, note: "Freigegebene Schnittstelle" }],
    layer: [{ id: "config", label: "NEXORA-Konfiguration", viaAgent: "nexora", costPerCall: 0, note: "Einstellungen des Experience Layers" }]
  };
  const SAP_POLICY_NOTE = "Direkter Zugriff eines Agenten auf SAP-Schnittstellen ist in dieser Demo nicht vorgesehen. Die Zugriffswege orientieren sich am Hinweis auf die SAP API Policy (v4/2026) – ausdrücklich ohne Rechtsbewertung.";
  const FOUR_EYES_LIMIT = 10000; // Beispielwert: systemübergreifende Freigaben darüber brauchen zwei Personen
  const CONNECTORS = {
    nexora: { id: "nexora", name: "NEXORA-Engine", kind: "erp", simulated: false, capabilities: { tasks: true, search: true, actions: true, kpis: true } },
    sap: { id: "sap", name: "SAP S/4HANA (simuliert)", kind: "erp", simulated: true, capabilities: { tasks: true, search: true, actions: true, kpis: true }, originalUi: "SAP Fiori" },
    m365: { id: "m365", name: "Microsoft 365 (simuliert)", kind: "collaboration", simulated: true, capabilities: { tasks: true, search: true, actions: true, kpis: false }, originalUi: "Outlook" },
    servicenow: { id: "servicenow", name: "ServiceNow (simuliert)", kind: "itsm", simulated: true, capabilities: { tasks: true, search: true, actions: true, kpis: true }, originalUi: "ServiceNow Service Portal" },
    workday: { id: "workday", name: "Workday (simuliert)", kind: "hcm", simulated: true, capabilities: { tasks: true, search: true, actions: true, kpis: false }, originalUi: "Workday" }
  };
  for (const id in CONNECTORS) CONNECTORS[id].routes = ROUTES[id];
  /* Erlaubte Wege je Befehl. Nicht aufgeführte Wege (insbesondere "direct-api") werden abgelehnt. */
  const ALLOWED = {
    sap: { approveInvoice: ["joule-a2a", "released-api"], rejectInvoice: ["joule-a2a", "released-api"], approvePR: ["joule-a2a", "released-api"], rejectPR: ["joule-a2a", "released-api"], createPR: ["joule-a2a", "mcp-gateway"], mirrorPR: ["released-api"], query: ["joule-a2a", "mcp-gateway", "released-api"] },
    m365: { replyApproval: ["copilot-a2a", "graph"], archiveMail: ["graph"], query: ["copilot-a2a", "graph"] },
    servicenow: { approveRITM: ["nowassist-a2a", "rest"], rejectRITM: ["nowassist-a2a", "rest"], createRITM: ["rest", "nowassist-a2a"], query: ["nowassist-a2a", "rest"] },
    workday: { approveAbsence: ["workday-agent-a2a", "integration"], rejectAbsence: ["workday-agent-a2a", "integration"], completeOnboardingTask: ["integration", "workday-agent-a2a"], query: ["workday-agent-a2a", "integration"] },
    layer: { setOwner: ["config"], setDash: ["config"], transition: ["config"] }
  };
  /* Prozesse und System of Record (Standard). Karten, Inbox, Suche und Dashboard lesen über diese Zuordnung. */
  const PROCESSES = {
    bestellanforderung: { label: "Bestellanforderung", systems: ["sap", "nexora"], owner: "sap" },
    rechnungsfreigabe: { label: "Rechnungsfreigabe", systems: ["sap", "nexora"], owner: "sap" },
    ticket_einkauf: { label: "IT- und Einkaufsanfrage", systems: ["servicenow"], owner: "servicenow" },
    abwesenheit: { label: "Abwesenheit", systems: ["workday", "nexora"], owner: "workday" },
    freigabebitte: { label: "Freigabebitte per Mail", systems: ["m365"], owner: "m365" },
    onboarding: { label: "Onboarding", systems: ["workday", "nexora"], owner: "workday" },
    auftrag: { label: "Aufträge, Fertigung, Finanzen", systems: ["nexora"], owner: "nexora" }
  };

  /* ---------- Hilfen ---------- */
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const r2 = x => Math.round(x * 100) / 100; const pick = (rng, a) => a[Math.floor(rng() * a.length)]; const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function fail(code, text) { const e = new Error(text); e.code = code; throw e; }
  const STATE = new WeakMap(); // Mandantenobjekt → Konnektor-Zustand
  const PROVIDERS = { nexoraTasks: null };

  /* ---------- Deterministische Seed-Daten der simulierten Systeme ---------- */
  function seedState(w, tid) {
    const t = w.tenants[tid]; const rng = mulberry32((w.seed ^ hashStr("conn-" + tid)) >>> 0); const d0 = t.date;
    const emp = (i) => (t.master.employees[i % t.master.employees.length] || { name: "Mitarbeitende" }).name;
    const cc = t.master.costCenters && t.master.costCenters.length ? t.master.costCenters : [{ id: "KS100", name: "Zentrale" }];
    const sups = (t.master.suppliers || []).filter(s => !s.link && !s.indirect).slice(0, 6); const supName = i => (sups[i % Math.max(1, sups.length)] || { name: "Lieferant " + (i + 1) }).name;
    const items = { elevon: [["Schweißdraht SG2 1,0 mm, 15 kg", 89], ["Schleifscheiben 125 mm, 50 Stk", 64], ["Prüfmittel Messschieber digital", 129], ["Kranwartung Halle 2", 2400]], novamart: [["Regalsystem Filiale Bonn", 6800], ["Kassenrollen, 100 Stk", 42], ["Reinigungsmittel Filialen", 310], ["Beschilderung Aktion Winter", 1450]], aventra: [["Fachbuch S/4HANA Finance", 79], ["Workshop-Raum Frankfurt, 2 Tage", 1600], ["Software-Lizenz Prozessmodellierung", 2900], ["Schulung Projektleitung", 1850]] }[tid];
    const sap = { prs: [], invoices: [], materials: [] }, m365 = { mails: [], events: [], docs: [] }, sn = { tickets: [] }, wd = { absences: [], onboarding: [] };
    for (let i = 0; i < 3; i++) { const [txt, price] = items[i + (i === 2 ? 1 : 0)]; const qty = price > 1000 ? 1 : int(rng, 2, 6); sap.prs.push({ no: String(10004711 + i), text: txt, qty, unit: "Stk", price, value: r2(qty * price), requester: emp(20 + i * 3), costCenter: cc[i % cc.length].id, created: addDays(d0, -int(rng, 1, 6)), due: addDays(d0, int(rng, 0, 4)), status: "zur Freigabe", approvals: [], history: [["angelegt", addDays(d0, -2)]] }); }
    const amts = [r2(1800 + rng() * 2500), r2(4200 + rng() * 3000), r2(12800 + rng() * 6000)];
    amts.forEach((a, i) => sap.invoices.push({ no: String(5105600120 + i * 7), supplier: supName(i), amount: a, net: r2(a / 1.19), po: "45000" + (17250 + i * 13), received: addDays(d0, -int(rng, 2, 9)), due: addDays(d0, int(rng, 1, 12)), status: "zur Freigabe", approvals: [], reason: i === 1 ? "Preisabweichung 2,4 % zur Bestellung" : "Drei-Wege-Abgleich in Ordnung", history: [["eingegangen", addDays(d0, -3)]] }));
    const mats = (t.master.materials || t.master.articles || []).slice(0, 5); mats.forEach((m, i) => sap.materials.push({ no: "MAT-" + (i + 1), name: m.name, plant: tid === "novamart" ? "ZL1" : "1000", available: int(rng, 0, 80), reserved: int(rng, 0, 20) }));
    const mailSubj = [["Bitte Freigabe: Reisekosten Messe Hannover", 1240], ["Freigabe Sonderrabatt Großkunde", 0], ["Rückfrage zur Budgetverschiebung Q4", 0]];
    mailSubj.forEach(([s, a], i) => m365.mails.push({ no: "MSG-" + (3101 + i), from: emp(5 + i * 4), subject: s, amount: a || null, received: addDays(d0, -i), due: addDays(d0, i === 0 ? 0 : 2), needsApproval: i < 2, status: i < 2 ? "Antwort erwartet" : "gelesen", history: [] }));
    m365.events.push({ no: "EVT-1", title: "Lenkungskreis Digitalisierung", date: d0, time: "10:00" }, { no: "EVT-2", title: "Lieferantengespräch Quartalsziele", date: d0, time: "14:30" });
    m365.docs.push({ no: "DOC-1", title: "Budgetplanung 2027.xlsx", owner: emp(2) }, { no: "DOC-2", title: "Lieferantenbewertung Q3.pptx", owner: emp(9) }, { no: "DOC-3", title: "Richtlinie Reisekosten.docx", owner: emp(1) });
    sn.tickets.push({ no: "RITM00" + (14021 + 0), kind: "Einkauf", text: "Monitor 27 Zoll für Arbeitsplatz", requestedFor: emp(11), cost: 219, status: "zur Freigabe", approvals: [], created: addDays(d0, -1), due: addDays(d0, 1), history: [] },
      { no: "RITM00" + (14021 + 1), kind: "Software", text: "Lizenz Visualisierungssoftware, 12 Monate", requestedFor: emp(14), cost: 1380, status: "zur Freigabe", approvals: [], created: addDays(d0, -2), due: addDays(d0, 0), history: [] },
      { no: "INC00" + 88213, kind: "Störung", text: "VPN-Verbindung bricht ab", requestedFor: emp(3), cost: 0, status: "in Bearbeitung", approvals: [], created: addDays(d0, -1), due: addDays(d0, 2), history: [] });
    wd.absences.push({ no: "ABS-" + 501, worker: emp(7), type: "Urlaub", from: addDays(d0, 10), days: 5, status: "beantragt", history: [] }, { no: "ABS-" + 502, worker: emp(12), type: "Fortbildung", from: addDays(d0, 4), days: 2, status: "beantragt", history: [] });
    wd.onboarding.push({ no: "ONB-" + 77, worker: ["Lea Hartwig", "Jonas Petri", "Mara Lindqvist"][["elevon", "novamart", "aventra"].indexOf(tid)], start: addDays(d0, 12), tasks: [{ id: "laptop", text: "Laptop bereitstellen", done: false, cost: 779 }, { id: "access", text: "Zugänge einrichten", done: false, cost: 0 }], status: "offen", history: [] });
    const owners = {}; for (const k in PROCESSES) owners[k] = PROCESSES[k].owner;
    return { sap, m365, servicenow: sn, workday: wd, ledger: [], seq: 0, owners, dash: {}, transition: {} };
  }
  function state(w, tid) { const t = w.tenants[tid]; if (!t) fail("TENANT", "Unbekannter Mandant."); let s = STATE.get(t); if (!s) { s = seedState(w, tid); STATE.set(t, s); } return s; }
  function stableHash(o) { return hashStr(JSON.stringify(o)).toString(16).padStart(8, "0"); }
  function hash(w, tid) { return stableHash(state(w, tid)); }

  /* ---------- Rechte (gleiche Rollen wie die Engine) ---------- */
  function who(w, tid, ctx) { const t = w.tenants[tid]; const u = t.users.find(x => x.id === (ctx && ctx.user)) || t.users[0]; const role = t.roles.find(r => r.id === u.role) || { id: "?", name: "?", perms: [] }; return { u, role }; }
  function need(w, tid, ctx, perms) { const { u, role } = who(w, tid, ctx); if (u.active === false) fail("INACTIVE", `Der Account ${u.name} ist geschlossen.`); const list = [].concat(perms); if (!list.some(p => role.perms.includes(p))) fail("FORBIDDEN", `${u.name} (${role.name}) hat keine Berechtigung für diese Aktion.`); return { u, role }; }
  const can = (w, tid, ctx, perms) => { try { need(w, tid, ctx, perms); return true; } catch (e) { return false; } };

  /* ---------- Zugriffsweg und Kosten ---------- */
  function resolveRoute(sys, cmd, routeId) {
    if (routeId === "direct-api") fail("ROUTE_NOT_ALLOWED", `Kein zulässiger Zugriffsweg: direkter Schnittstellenzugriff durch einen Agenten ist nicht erlaubt. ${sys === "sap" ? SAP_POLICY_NOTE : ""}`.trim());
    const allowed = (ALLOWED[sys] || {})[cmd]; if (!allowed) fail("CMD", `Befehl ${cmd} gibt es für ${sys} nicht.`);
    const id = routeId || allowed[0]; if (!allowed.includes(id)) fail("ROUTE_NOT_ALLOWED", `Weg „${(ROUTES[sys].find(r => r.id === id) || { label: id }).label}“ ist für diese Aktion nicht zulässig. Zulässig: ${allowed.map(a => ROUTES[sys].find(r => r.id === a).label).join(", ")}.${sys === "sap" ? " " + SAP_POLICY_NOTE : ""}`);
    return ROUTES[sys].find(r => r.id === id);
  }

  /* ---------- Normalisierte Aufgaben (Aktionskarten-Daten) ---------- */
  const eur = v => Number(v || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  function prCard(sys, ref, o, tid) { return { process: "bestellanforderung", sys, ref, title: `Bestellanforderung ${o.no}`, fields: [["Bedarf", o.text], ["Menge", o.qty + " " + (o.unit || "Stk")], ["Wert", eur(o.value)], ["Anforderer", o.requester], ["Kostenstelle", o.costCenter]], amount: o.value, due: o.due, status: o.status, actions: [{ label: "Freigeben", cmd: sys === "sap" ? "conn.sap.approvePR" : "approveRequisition", p: sys === "sap" ? { ref } : { reqNo: o.no }, perm: "approve", primary: true, fourEyes: o.value > FOUR_EYES_LIMIT }, { label: "Ablehnen", cmd: sys === "sap" ? "conn.sap.rejectPR" : "approveRequisition", p: sys === "sap" ? { ref } : { reqNo: o.no, reject: true }, perm: "approve", confirm: true }] }; }
  function tasksOf(w, tid, sys, ctx) {
    const s = state(w, tid); const out = []; const own = p => s.owners[p] === sys; const allow = perms => can(w, tid, ctx, perms);
    if (sys === "sap") {
      if (own("bestellanforderung") && allow("approve")) for (const o of s.sap.prs.filter(x => x.status === "zur Freigabe")) out.push(prCard("sap", "sap:pr:" + o.no, o, tid));
      if (own("rechnungsfreigabe") && allow("approve")) for (const o of s.sap.invoices.filter(x => x.status !== "freigegeben" && x.status !== "abgelehnt")) out.push({ process: "rechnungsfreigabe", sys, ref: "sap:inv:" + o.no, title: `Kreditorenrechnung ${o.no}`, fields: [["Lieferant", o.supplier], ["Betrag", eur(o.amount)], ["Bestellung", o.po], ["Prüfung", o.reason], ["Fällig", o.due]].concat(o.approvals.length ? [["1. Freigabe", o.approvals[0].name]] : []), amount: o.amount, due: o.due, status: o.status, actions: [{ label: o.approvals.length ? "2. Freigabe erteilen" : "Freigeben", cmd: "conn.sap.approveInvoice", p: { ref: "sap:inv:" + o.no }, perm: "approve", primary: true, fourEyes: o.amount > FOUR_EYES_LIMIT }, { label: "Ablehnen", cmd: "conn.sap.rejectInvoice", p: { ref: "sap:inv:" + o.no }, perm: "approve", confirm: true }] });
    }
    if (sys === "m365" && allow("view")) for (const o of s.m365.mails.filter(x => x.needsApproval && x.status === "Antwort erwartet")) out.push({ process: "freigabebitte", sys, ref: "m365:mail:" + o.no, title: o.subject, fields: [["Von", o.from], ["Eingang", o.received]].concat(o.amount ? [["Betrag", eur(o.amount)]] : []), amount: o.amount || 0, due: o.due, status: o.status, actions: [{ label: "Zustimmen", cmd: "conn.m365.replyApproval", p: { ref: "m365:mail:" + o.no, decision: "zugestimmt" }, perm: "view", primary: true }, { label: "Ablehnen", cmd: "conn.m365.replyApproval", p: { ref: "m365:mail:" + o.no, decision: "abgelehnt" }, perm: "view", confirm: true }] });
    if (sys === "servicenow" && own("ticket_einkauf") && allow("approve")) for (const o of s.servicenow.tickets.filter(x => x.status === "zur Freigabe")) out.push({ process: "ticket_einkauf", sys, ref: "servicenow:ritm:" + o.no, title: `${o.kind}-Anfrage ${o.no}`, fields: [["Anfrage", o.text], ["Für", o.requestedFor], ["Kosten", eur(o.cost)]].concat(o.approvals.length ? [["1. Freigabe", o.approvals[0].name]] : []), amount: o.cost, due: o.due, status: o.status, actions: [{ label: o.approvals.length ? "2. Freigabe erteilen" : "Freigeben", cmd: "conn.servicenow.approveRITM", p: { ref: "servicenow:ritm:" + o.no }, perm: "approve", primary: true, fourEyes: o.cost > FOUR_EYES_LIMIT }, { label: "Ablehnen", cmd: "conn.servicenow.rejectRITM", p: { ref: "servicenow:ritm:" + o.no }, perm: "approve", confirm: true }] });
    if (sys === "workday") {
      if (own("abwesenheit") && allow(["hr", "approve"])) for (const o of s.workday.absences.filter(x => x.status === "beantragt")) out.push({ process: "abwesenheit", sys, ref: "workday:abs:" + o.no, title: `${o.type}: ${o.worker}`, fields: [["Zeitraum", `${o.days} Tage ab ${o.from}`], ["Art", o.type]], amount: 0, due: o.from, status: o.status, actions: [{ label: "Genehmigen", cmd: "conn.workday.approveAbsence", p: { ref: "workday:abs:" + o.no }, perm: "hr", primary: true }, { label: "Ablehnen", cmd: "conn.workday.rejectAbsence", p: { ref: "workday:abs:" + o.no }, perm: "hr", confirm: true }] });
      if (own("onboarding") && allow("hr")) for (const o of s.workday.onboarding) for (const k of o.tasks.filter(x => !x.done)) out.push({ process: "onboarding", sys, ref: `workday:onb:${o.no}:${k.id}`, title: `Onboarding ${o.worker}: ${k.text}`, fields: [["Start", o.start], ["Aufgabe", k.text]].concat(k.cost ? [["Folge", "IT-Anfrage in ServiceNow"]] : []), amount: k.cost || 0, due: addDays(o.start, -5), status: "offen", actions: [{ label: "Erledigen", cmd: "conn.workday.completeOnboardingTask", p: { ref: `workday:onb:${o.no}:${k.id}` }, perm: "hr", primary: true }] });
    }
    if (sys === "nexora") {
      const t = w.tenants[tid];
      if (own("bestellanforderung") && allow("approve")) { const { u } = who(w, tid, ctx); for (const q of (t.reqs || []).filter(x => x.status === "zur Freigabe" && x.requester !== u.id && (x.level !== "ceo" || u.role === "ceo"))) out.push(prCard("nexora", "nexora:req:" + q.no, { no: q.no, text: q.text, qty: q.qty, unit: q.unit, value: q.net, requester: q.requesterName, costCenter: q.costCenter || "–", due: q.date, status: q.status }, tid)); }
      if (PROVIDERS.nexoraTasks) for (const k of PROVIDERS.nexoraTasks(tid, ctx && ctx.user)) { if (k.cmd === "approveRequisition") continue; out.push({ process: k.cmd === "approveAbsence" ? "abwesenheit" : "auftrag", sys: "nexora", ref: "nexora:task:" + k.id, title: k.title, fields: [["Details", k.sub || ""]], amount: 0, due: t.date, status: "offen", actions: [{ label: k.label, cmd: k.cmd, p: k.p, perm: null, primary: true }].concat(k.reject ? [{ label: "Ablehnen", cmd: k.cmd, p: k.reject, perm: null, confirm: true }] : []) }); }
      else for (const m of t.inbox.filter(x => x.status === "offen")) out.push({ process: "auftrag", sys: "nexora", ref: "nexora:inbox:" + m.id, title: m.text, fields: [], amount: 0, due: t.date, status: "offen", actions: [{ label: "Prüfen und buchen", cmd: "processInbox", p: { id: m.id }, perm: "view", primary: true }] });
    }
    return out.map(k => Object.assign(k, { source: CONNECTORS[sys].name, simulated: CONNECTORS[sys].simulated, route: defaultRouteLabel(sys, k), deepLink: k.ref }));
  }
  function defaultRouteLabel(sys, k) { if (sys === "nexora") return ROUTES.nexora[0].label; const a = k.actions.find(x => x.cmd && x.cmd.startsWith("conn.")); if (!a) return ROUTES[sys][0].label; const cmd = a.cmd.split(".")[2]; return ROUTES[sys].find(r => r.id === ALLOWED[sys][cmd][0]).label; }
  function listTasks(w, tid, ctx) { const out = []; for (const sys of ["nexora", "sap", "m365", "servicenow", "workday"]) out.push(...tasksOf(w, tid, sys, ctx)); return out.sort((a, b) => (a.due || "").localeCompare(b.due || "") || b.amount - a.amount); }

  /* ---------- Suche und Objekte ---------- */
  function search(w, tid, q, ctx) {
    const s = state(w, tid), t = w.tenants[tid]; const needle = String(q || "").toLowerCase().trim(); if (needle.length < 2) return [];
    const hit = (sys, ref, kind, title, sub) => ({ sys, source: CONNECTORS[sys].name, simulated: CONNECTORS[sys].simulated, ref, kind, title, sub });
    const m = (...xs) => xs.some(x => String(x || "").toLowerCase().includes(needle)); const out = [];
    for (const o of s.sap.prs) if (m(o.no, o.text, o.requester)) out.push(hit("sap", "sap:pr:" + o.no, "Bestellanforderung", `${o.no} ${o.text}`, `${o.status} · ${eur(o.value)}`));
    for (const o of s.sap.invoices) if (m(o.no, o.supplier, o.po)) out.push(hit("sap", "sap:inv:" + o.no, "Kreditorenrechnung", `${o.no} ${o.supplier}`, `${o.status} · ${eur(o.amount)}`));
    for (const o of s.sap.materials) if (m(o.no, o.name)) out.push(hit("sap", "sap:mat:" + o.no, "Material", o.name, `Werk ${o.plant} · verfügbar ${o.available - o.reserved}`));
    for (const o of s.m365.mails) if (m(o.no, o.subject, o.from)) out.push(hit("m365", "m365:mail:" + o.no, "Mail", o.subject, `von ${o.from} · ${o.status}`));
    for (const o of s.m365.docs) if (m(o.title, o.owner)) out.push(hit("m365", "m365:doc:" + o.no, "Dokument", o.title, "von " + o.owner));
    for (const o of s.m365.events) if (m(o.title)) out.push(hit("m365", "m365:evt:" + o.no, "Termin", o.title, `${o.date} ${o.time}`));
    for (const o of s.servicenow.tickets) if (m(o.no, o.text, o.requestedFor)) out.push(hit("servicenow", "servicenow:ritm:" + o.no, o.kind + "-Ticket", `${o.no} ${o.text}`, `${o.status}${o.cost ? " · " + eur(o.cost) : ""}`));
    for (const o of s.workday.absences) if (m(o.worker, o.type)) out.push(hit("workday", "workday:abs:" + o.no, "Abwesenheit", `${o.type}: ${o.worker}`, `${o.days} Tage · ${o.status}`));
    for (const o of s.workday.onboarding) if (m(o.worker, "onboarding")) out.push(hit("workday", "workday:onb:" + o.no, "Onboarding", o.worker, `Start ${o.start}`));
    for (const d of t.docs.slice(-400)) if (m(d.no, d.text)) out.push(hit("nexora", "nexora:doc:" + d.no, "Beleg", `${d.no} ${d.text}`, d.date));
    for (const so of t.salesOrders || []) if (m(so.no, so.customer)) out.push(hit("nexora", "nexora:so:" + so.no, "Kundenauftrag", so.no, `${so.status} · ${eur(so.net)}`));
    for (const po of t.purchaseOrders || []) if (m(po.no, po.supplier)) out.push(hit("nexora", "nexora:po:" + po.no, "Bestellung", po.no, `${po.status} · ${eur(po.net)}`));
    for (const q2 of t.reqs || []) if (m(q2.no, q2.text)) out.push(hit("nexora", "nexora:req:" + q2.no, "Bestellanforderung", `${q2.no} ${q2.text}`, `${q2.status} · ${eur(q2.net)}`));
    for (const c of (t.master.customers || []).slice(0, 300)) if (m(c.id, c.name)) out.push(hit("nexora", "nexora:cust:" + c.id, "Kunde", c.name, c.city || ""));
    for (const x of (t.master.materials || t.master.articles || []).slice(0, 300)) if (m(x.id, x.name)) out.push(hit("nexora", "nexora:mat:" + x.id, t.master.materials ? "Material" : "Artikel", x.name, x.id));
    return out.slice(0, 60);
  }
  function parseRef(ref) { const [sys, kind, ...rest] = String(ref).split(":"); return { sys, kind, id: rest.join(":") }; }
  function getObject(w, tid, ref) {
    const s = state(w, tid), t = w.tenants[tid]; const { sys, kind, id } = parseRef(ref); const f = (title, fields, history, o) => ({ sys, source: CONNECTORS[sys] ? CONNECTORS[sys].name : sys, simulated: !!(CONNECTORS[sys] && CONNECTORS[sys].simulated), originalUi: CONNECTORS[sys] && CONNECTORS[sys].originalUi, ref, kind, title, fields, history: history || [], raw: o });
    if (sys === "sap" && kind === "pr") { const o = s.sap.prs.find(x => x.no === id); if (o) return f(`Bestellanforderung ${o.no}`, [["Bedarf", o.text], ["Menge", o.qty + " " + o.unit], ["Preis", eur(o.price)], ["Wert", eur(o.value)], ["Anforderer", o.requester], ["Kostenstelle", o.costCenter], ["Status", o.status], ["Quelle", o.source || "SAP"]], o.history, o); }
    if (sys === "sap" && kind === "inv") { const o = s.sap.invoices.find(x => x.no === id); if (o) return f(`Kreditorenrechnung ${o.no}`, [["Lieferant", o.supplier], ["Brutto", eur(o.amount)], ["Netto", eur(o.net)], ["Bestellung", o.po], ["Eingang", o.received], ["Fällig", o.due], ["Prüfung", o.reason], ["Status", o.status], ["Freigaben", o.approvals.map(a => a.name).join(", ") || "–"]], o.history, o); }
    if (sys === "sap" && kind === "mat") { const o = s.sap.materials.find(x => x.no === id); if (o) return f(o.name, [["Werk", o.plant], ["Bestand", o.available], ["Reserviert", o.reserved], ["Verfügbar", o.available - o.reserved]], [], o); }
    if (sys === "m365" && kind === "mail") { const o = s.m365.mails.find(x => x.no === id); if (o) return f(o.subject, [["Von", o.from], ["Eingang", o.received], ["Status", o.status]].concat(o.amount ? [["Betrag", eur(o.amount)]] : []), o.history, o); }
    if (sys === "m365" && kind === "doc") { const o = s.m365.docs.find(x => x.no === id); if (o) return f(o.title, [["Besitzer", o.owner]], [], o); }
    if (sys === "m365" && kind === "evt") { const o = s.m365.events.find(x => x.no === id); if (o) return f(o.title, [["Datum", o.date], ["Uhrzeit", o.time]], [], o); }
    if (sys === "servicenow" && kind === "ritm") { const o = s.servicenow.tickets.find(x => x.no === id); if (o) return f(`${o.kind}-Ticket ${o.no}`, [["Anfrage", o.text], ["Für", o.requestedFor], ["Kosten", eur(o.cost)], ["Status", o.status], ["Freigaben", o.approvals.map(a => a.name).join(", ") || "–"]].concat(o.source ? [["Ursprung", o.source]] : []), o.history, o); }
    if (sys === "workday" && kind === "abs") { const o = s.workday.absences.find(x => x.no === id); if (o) return f(`${o.type}: ${o.worker}`, [["Ab", o.from], ["Tage", o.days], ["Status", o.status]], o.history, o); }
    if (sys === "workday" && kind === "onb") { const o = s.workday.onboarding.find(x => x.no === id.split(":")[0]); if (o) return f(`Onboarding ${o.worker}`, [["Start", o.start]].concat(o.tasks.map(k => [k.text, k.done ? "erledigt" : "offen"])), o.history, o); }
    if (sys === "nexora") { const tt = { so: () => t.salesOrders.find(x => x.no === id), po: () => t.purchaseOrders.find(x => x.no === id), req: () => (t.reqs || []).find(x => x.no === id), doc: () => t.docs.find(x => x.no === id), cust: () => t.master.customers.find(x => x.id === id), mat: () => (t.master.materials || t.master.articles || []).find(x => x.id === id) }[kind]; const o = tt && tt(); if (o) return f(`${kind.toUpperCase()} ${id}`, Object.entries(o).filter(([k, v]) => ["string", "number"].includes(typeof v)).slice(0, 10), [], o); }
    return null;
  }

  /* ---------- Befehle der simulierten Systeme ---------- */
  function findBy(list, no, what) { const o = list.find(x => x.no === no); if (!o) fail("NOT_FOUND", `${what} ${no} nicht gefunden.`); return o; }
  function approve4(w, tid, ctx, o, amount, label) { // Vier-Augen über Schwellenwert
    const { u } = who(w, tid, ctx); if (o.approvals.some(a => a.user === u.id)) fail("FOUR_EYES", `Vier-Augen-Prinzip: ${u.name} hat ${label} bereits freigegeben – die zweite Freigabe muss eine andere Person erteilen.`);
    o.approvals.push({ user: u.id, name: u.name }); if (amount > FOUR_EYES_LIMIT && o.approvals.length < 2) { o.status = "1. Freigabe erteilt"; return false; } return true;
  }
  const CMD = {
    sap: {
      approvePR(w, tid, p, ctx, s, route) { need(w, tid, ctx, "approve"); if (s.owners.bestellanforderung !== "sap") fail("READ_ONLY", "Bestellanforderungen werden nicht mehr in SAP geführt – das Altsystem ist für diesen Prozess nur noch lesend."); const o = findBy(s.sap.prs, parseRef(p.ref).id, "Bestellanforderung"); if (o.status !== "zur Freigabe") fail("STATUS", `Status „${o.status}“.`);
        const done = approve4(w, tid, ctx, o, o.value, o.no); if (!done) return { text: `1. Freigabe für Bestellanforderung ${o.no} erteilt – zweite Person nötig (über ${eur(FOUR_EYES_LIMIT)})` };
        o.status = "freigegeben"; o.history.push(["freigegeben", w.tenants[tid].date]); return { text: `Bestellanforderung ${o.no} in SAP freigegeben (${route.label})`, follow: o.catalog ? [{ cmd: "createRequisition", p: Object.assign({ catalogId: o.catalog, qty: o.qty }, o.costCenter && o.costCenter !== "–" ? { costCenter: o.costCenter } : {}), why: `Bestellung und Wareneingang laufen in der NEXORA-Engine (Bezug SAP ${o.no})` }] : [] }; },
      rejectPR(w, tid, p, ctx, s) { need(w, tid, ctx, "approve"); const o = findBy(s.sap.prs, parseRef(p.ref).id, "Bestellanforderung"); if (o.status !== "zur Freigabe" && o.status !== "1. Freigabe erteilt") fail("STATUS", `Status „${o.status}“.`); o.status = "abgelehnt"; o.history.push(["abgelehnt", w.tenants[tid].date]); return { text: `Bestellanforderung ${o.no} abgelehnt` }; },
      approveInvoice(w, tid, p, ctx, s, route) { need(w, tid, ctx, "approve"); const o = findBy(s.sap.invoices, parseRef(p.ref).id, "Rechnung"); if (!["zur Freigabe", "1. Freigabe erteilt"].includes(o.status)) fail("STATUS", `Status „${o.status}“.`);
        const done = approve4(w, tid, ctx, o, o.amount, "die Rechnung " + o.no); if (!done) return { text: `1. Freigabe für Rechnung ${o.no} (${eur(o.amount)}) erteilt – Vier-Augen-Prinzip, zweite Person nötig` };
        o.status = "freigegeben"; o.history.push(["zur Zahlung freigegeben", w.tenants[tid].date]); return { text: `Rechnung ${o.no} über ${eur(o.amount)} in SAP zur Zahlung freigegeben (${route.label})` }; },
      rejectInvoice(w, tid, p, ctx, s) { need(w, tid, ctx, "approve"); const o = findBy(s.sap.invoices, parseRef(p.ref).id, "Rechnung"); if (o.status === "freigegeben") fail("STATUS", "Bereits freigegeben."); o.status = "abgelehnt"; o.history.push(["abgelehnt", w.tenants[tid].date]); return { text: `Rechnung ${o.no} abgelehnt und an den Lieferanten zurück` }; },
      createPR(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); if (s.owners.bestellanforderung !== "sap") fail("READ_ONLY", "Bestellanforderungen werden in der NEXORA-Engine geführt."); const text = String(p.text || "").trim(); if (text.length < 3 || !(p.price > 0)) fail("INPUT", "Bedarf und Preis fehlen.");
        const no = String(10004711 + s.sap.prs.length); const qty = p.qty > 0 ? p.qty : 1; const { u } = who(w, tid, ctx); const o = { no, text, qty, unit: "Stk", price: p.price, value: r2(qty * p.price), requester: p.requester || u.name, costCenter: p.costCenter || "–", created: w.tenants[tid].date, due: addDays(w.tenants[tid].date, 2), status: "zur Freigabe", approvals: [], catalog: p.catalogId || null, source: p.sourceRef || null, history: [["angelegt über " + route.label, w.tenants[tid].date]] }; s.sap.prs.push(o);
        return { text: `Bestellanforderung ${no} in SAP angelegt (${route.label})${p.sourceRef ? " aus " + p.sourceRef : ""}`, objects: ["sap:pr:" + no] }; },
      mirrorPR(w, tid, p, ctx, s) { need(w, tid, ctx, "view"); if (!s.transition.bestellanforderung || s.transition.bestellanforderung.phase !== "parallel") fail("STATUS", "Spiegeln nur im Parallelbetrieb."); const no = String(10004711 + s.sap.prs.length); s.sap.prs.push({ no, text: p.text, qty: p.qty, unit: "Stk", price: p.price, value: r2(p.qty * p.price), requester: p.requester, costCenter: p.costCenter || "–", created: w.tenants[tid].date, due: w.tenants[tid].date, status: "gespiegelt", approvals: [], mirrorOf: p.reqNo, history: [["gespiegelt aus NEXORA " + p.reqNo, w.tenants[tid].date]] }); return { text: `Parallelbetrieb: ${p.reqNo} nach SAP gespiegelt (${no})` }; },
      query(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); const what = p.what || "materials"; const data = what === "invoices" ? s.sap.invoices.map(o => ({ no: o.no, lieferant: o.supplier, betrag: o.amount, status: o.status })) : what === "prs" ? s.sap.prs.map(o => ({ no: o.no, bedarf: o.text, wert: o.value, status: o.status })) : s.sap.materials.map(o => ({ material: o.name, werk: o.plant, verfuegbar: o.available - o.reserved })); return { text: `SAP-Abfrage ${what} über ${route.label}`, result: data, read: true }; }
    },
    m365: {
      replyApproval(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); const o = findBy(s.m365.mails, parseRef(p.ref).id, "Mail"); if (o.status !== "Antwort erwartet") fail("STATUS", "Bereits beantwortet."); const dec = p.decision === "abgelehnt" ? "abgelehnt" : "zugestimmt"; o.status = "beantwortet: " + dec; o.history.push(["Antwort " + dec, w.tenants[tid].date]); return { text: `Antwort an ${o.from}: ${dec} („${o.subject}“, ${route.label})` }; },
      archiveMail(w, tid, p, ctx, s) { need(w, tid, ctx, "view"); const o = findBy(s.m365.mails, parseRef(p.ref).id, "Mail"); o.status = "archiviert"; return { text: `Mail „${o.subject}“ archiviert` }; },
      query(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); return { text: `Microsoft-365-Abfrage über ${route.label}`, result: { mails: s.m365.mails.map(o => ({ betreff: o.subject, von: o.from, status: o.status })), termine: s.m365.events }, read: true }; }
    },
    servicenow: {
      approveRITM(w, tid, p, ctx, s, route) { need(w, tid, ctx, "approve"); const o = findBy(s.servicenow.tickets, parseRef(p.ref).id, "Ticket"); if (!["zur Freigabe", "1. Freigabe erteilt"].includes(o.status)) fail("STATUS", `Status „${o.status}“.`);
        const done = approve4(w, tid, ctx, o, o.cost, "das Ticket " + o.no); if (!done) return { text: `1. Freigabe für ${o.no} erteilt – zweite Person nötig` };
        o.status = "freigegeben"; o.history.push(["freigegeben", w.tenants[tid].date]); const owner = s.owners.bestellanforderung; const qty = 1;
        const follow = o.cost > 0 ? [owner === "sap" ? { cmd: "conn.sap.createPR", p: { text: o.text, qty, price: o.cost, costCenter: o.costCenter || null, catalogId: o.catalog || null, requester: o.requestedFor, sourceRef: "ServiceNow " + o.no, route: "joule-a2a" }, why: "Bestellanforderung im System of Record (SAP, über Joule)" } : { cmd: "createRequisition", p: o.catalog ? { catalogId: o.catalog, qty, costCenter: o.costCenter || undefined } : { category: o.kind === "Software" ? "IT" : "IT", text: o.text, price: o.cost, costCenter: o.costCenter || undefined }, why: "Bestellanforderung im System of Record (NEXORA-Engine)" }] : [];
        return { text: `${o.no} in ServiceNow freigegeben (${route.label})`, follow }; },
      rejectRITM(w, tid, p, ctx, s) { need(w, tid, ctx, "approve"); const o = findBy(s.servicenow.tickets, parseRef(p.ref).id, "Ticket"); o.status = "abgelehnt"; o.history.push(["abgelehnt", w.tenants[tid].date]); return { text: `${o.no} abgelehnt` }; },
      createRITM(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); const no = "RITM00" + (14021 + s.servicenow.tickets.filter(x => x.no.startsWith("RITM")).length); const o = { no, kind: p.kind || "Einkauf", text: p.text, requestedFor: p.requestedFor, cost: r2(p.cost || 0), catalog: p.catalogId || null, costCenter: p.costCenter || null, status: "zur Freigabe", approvals: [], created: w.tenants[tid].date, due: addDays(w.tenants[tid].date, 1), source: p.sourceRef || null, history: [["angelegt über " + route.label, w.tenants[tid].date]] }; s.servicenow.tickets.push(o); return { text: `ServiceNow-Ticket ${no} angelegt: ${o.text}`, objects: ["servicenow:ritm:" + no] }; },
      query(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); return { text: `ServiceNow-Abfrage über ${route.label}`, result: s.servicenow.tickets.map(o => ({ no: o.no, art: o.kind, text: o.text, kosten: o.cost, status: o.status })), read: true }; }
    },
    workday: {
      approveAbsence(w, tid, p, ctx, s, route) { need(w, tid, ctx, ["hr", "approve"]); const o = findBy(s.workday.absences, parseRef(p.ref).id, "Antrag"); if (o.status !== "beantragt") fail("STATUS", "Bereits entschieden."); o.status = "genehmigt"; o.history.push(["genehmigt", w.tenants[tid].date]); return { text: `${o.type} von ${o.worker} genehmigt (${route.label})` }; },
      rejectAbsence(w, tid, p, ctx, s) { need(w, tid, ctx, ["hr", "approve"]); const o = findBy(s.workday.absences, parseRef(p.ref).id, "Antrag"); o.status = "abgelehnt"; return { text: `${o.type} von ${o.worker} abgelehnt` }; },
      completeOnboardingTask(w, tid, p, ctx, s, route) { need(w, tid, ctx, "hr"); const [no, task] = parseRef(p.ref).id.split(":"); const o = findBy(s.workday.onboarding, no, "Onboarding"); const k = o.tasks.find(x => x.id === task); if (!k) fail("NOT_FOUND", "Aufgabe nicht gefunden."); if (k.done) fail("STATUS", "Bereits erledigt.");
        k.done = true; o.history.push([k.text + " angestoßen", w.tenants[tid].date]); if (o.tasks.every(x => x.done)) o.status = "abgeschlossen";
        return { text: `Onboarding ${o.worker}: „${k.text}“ angestoßen (${route.label})`, follow: k.cost ? [{ cmd: "conn.servicenow.createRITM", p: { kind: "Einkauf", text: "Notebook Standard (GWG bis 800 €) für " + o.worker, requestedFor: o.worker, cost: k.cost, catalogId: "K-05", sourceRef: "Workday " + o.no }, why: "IT-Anfrage in ServiceNow" }] : [] }; },
      query(w, tid, p, ctx, s, route) { need(w, tid, ctx, "view"); return { text: `Workday-Abfrage über ${route.label}`, result: { abwesenheiten: s.workday.absences, onboarding: s.workday.onboarding.map(o => ({ mitarbeiter: o.worker, start: o.start, offen: o.tasks.filter(k => !k.done).map(k => k.text) })) }, read: true }; }
    },
    layer: {
      setOwner(w, tid, p, ctx, s) { need(w, tid, ctx, "approve"); const pr = PROCESSES[p.process]; if (!pr) fail("PROCESS", "Unbekannter Prozess."); if (!pr.systems.includes(p.owner)) fail("OWNER", `${CONNECTORS[p.owner] ? CONNECTORS[p.owner].name : p.owner} kann ${pr.label} nicht führen.`); const old = s.owners[p.process]; s.owners[p.process] = p.owner; return { text: `System of Record für ${pr.label}: ${CONNECTORS[old].name} → ${CONNECTORS[p.owner].name}` }; },
      setDash(w, tid, p, ctx, s) { need(w, tid, ctx, "view"); const { u } = who(w, tid, ctx); const key = p.scope === "role" ? "role:" + u.role : "user:" + u.id; if (!Array.isArray(p.tiles)) fail("INPUT", "Kacheln fehlen."); s.dash[key] = p.tiles.slice(0, 16).map(x => String(x)); return { text: `Dashboard gespeichert (${p.tiles.length} Kacheln)` }; },
      transition(w, tid, p, ctx, s) { need(w, tid, ctx, "approve"); const pr = PROCESSES[p.process]; if (!pr) fail("PROCESS", "Unbekannter Prozess."); const st = s.transition[p.process] || (s.transition[p.process] = { phase: "überlagert", log: [] }); const date = w.tenants[tid].date; const { u } = who(w, tid, ctx);
        const go = (phase, text) => { st.log.push({ phase, date, by: u.name, text }); st.phase = phase; return { text }; };
        if (p.step === "parallel") { if (st.phase !== "überlagert" && st.phase !== "zurückgestellt") fail("STATUS", `Phase „${st.phase}“.`); st.until = addDays(date, p.days || 14); s.owners[p.process] = "nexora"; return go("parallel", `${pr.label}: Parallelbetrieb bis ${st.until} – neue Vorgänge in der NEXORA-Engine, Spiegelung ins Altsystem`); }
        if (p.step === "cutover") { if (st.phase !== "parallel") fail("STATUS", "Umschalten nur aus dem Parallelbetrieb."); if (p.reconDiff !== 0) fail("RECON", "Abstimmung zeigt Differenzen – Umschalten nicht möglich."); return go("abgelöst", `${pr.label} abgelöst: System of Record ist die NEXORA-Engine, das Altsystem bleibt lesend (Historie)`); }
        if (p.step === "rollback") { if (st.phase !== "parallel") fail("STATUS", "Ein Rückweg ist nur bis zum Abschluss des Parallelbetriebs möglich."); s.owners[p.process] = PROCESSES[p.process].owner; return go("zurückgestellt", `${pr.label}: Rückweg – System of Record wieder ${CONNECTORS[PROCESSES[p.process].owner].name}`); }
        fail("STEP", "Unbekannter Schritt."); }
    }
  };

  /* ---------- Dispatch: ein Aufruf = ein protokolliertes Ereignis mit Weg und Kosten ---------- */
  function dispatch(w, tid, sys, cmd, params, ctx) {
    const t = w.tenants[tid]; if (!t) return { ok: false, code: "TENANT", text: "Unbekannter Mandant." };
    const s = state(w, tid); const snap = JSON.stringify(s); params = params || {};
    try {
      const fn = CMD[sys] && Object.prototype.hasOwnProperty.call(CMD[sys], cmd) ? CMD[sys][cmd] : null; if (!fn) fail("CMD", `Befehl ${sys}.${cmd} unbekannt.`);
      const route = resolveRoute(sys, cmd, params.route); const { u, role } = who(w, tid, ctx);
      const res = fn(w, tid, params, ctx || {}, s, route) || {};
      const entry = { seq: ++s.seq, date: t.date, period: t.date.slice(0, 7), user: u.id, userName: u.name, role: role.name, sys, system: CONNECTORS[sys] ? CONNECTORS[sys].name : "NEXORA-Konfiguration", route: route.label, routeId: route.id, agent: route.viaAgent, cmd, ref: params.ref || null, cost: route.costPerCall, ok: true, text: res.text, via: ctx && ctx.via ? ctx.via : "Mensch" };
      s.ledger.push(entry);
      return { ok: true, cmd: "conn." + sys + "." + cmd, sys, text: res.text, cost: route.costPerCall, route: route.label, agent: route.viaAgent, objects: res.objects || [], follow: res.follow || [], result: res.result, user: u.name, docs: [] };
    } catch (e) {
      const restored = JSON.parse(snap); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, restored);
      return { ok: false, code: e.code || "ERROR", text: e.message };
    }
  }
  /* Ein Befehl für alles: "conn.<system>.<befehl>" geht an die Konnektoren, alles andere an die Engine. */
  function dispatchAny(E, w, tid, cmd, params, ctx) { if (String(cmd).startsWith("conn.")) { const [, sys, c] = String(cmd).split("."); return dispatch(w, tid, sys, c, params, ctx); } return E.dispatch(w, tid, cmd, params, ctx); }
  function ledger(w, tid) { return state(w, tid).ledger; }
  function costs(w, tid, opts) { const L = ledger(w, tid).filter(x => !opts || ((!opts.date || x.date === opts.date) && (!opts.period || x.period === opts.period))); const by = {}; let total = 0; for (const x of L) { const k = x.system + " · " + x.route; by[k] = by[k] || { system: x.system, route: x.route, calls: 0, cost: 0 }; by[k].calls++; by[k].cost = r2(by[k].cost + x.cost); total = r2(total + x.cost); } return { total, rows: Object.values(by), note: COST_NOTE }; }
  function owners(w, tid) { return Object.assign({}, state(w, tid).owners); }
  function setProvider(name, fn) { PROVIDERS[name] = fn; }

  return { VERSION, ROUTES, ALLOWED, CONNECTORS, PROCESSES, FOUR_EYES_LIMIT, COST_NOTE, SAP_POLICY_NOTE, state, hash, listTasks, tasksOf, search, getObject, dispatch, dispatchAny, ledger, costs, owners, setProvider, parseRef, resolveRoute };
});
