/* NEXORA IT-Infrastruktur und Sizing (v0.9.9). Reine Logik, kein DOM, in Node testbar.
   Architekturprofile je System, Sizing aus offenen Annahmen (Beispielwerte), Live-Auslastung aus Ereignissen.
   Keine echte Infrastruktur, keine Herstellerangaben und kein Sizing-Werkzeug eines Herstellers: Herstellernamen nur als Text.
   Für ein verbindliches Sizing gelten die Werkzeuge und Vorgaben des jeweiligen Herstellers. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.NexoraInfra = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const VERSION = "0.9.9";
  const NOTE = "Architektur und Sizing sind Beispielwerte aus offenen Annahmen – keine Herstellerangaben, kein Sizing-Werkzeug eines Herstellers und keine echte Infrastruktur. Herstellernamen nur als Text.";
  const SAP_NOTE = "Für SAP-Systeme gilt verbindlich das Sizing mit den Werkzeugen und Vorgaben von SAP; die Werte hier sind Beispielwerte zur Orientierung.";
  const KIND = { user: "Nutzer", net: "Netz und Zugang", idm: "Identität", web: "Oberfläche", app: "Anwendung", ai: "KI-Dienst", db: "Datenbank", int: "Integration", bi: "Reporting", ext: "Angebundenes System", backup: "Sicherung", mon: "Betrieb" };
  const TIERS = [["access", "Zugang"], ["app", "Anwendung"], ["data", "Daten"], ["int", "Integration"], ["ops", "Betrieb"]];
  /* Annahmen (Beispielwerte) – in der Oberfläche sichtbar, Teile änderbar */
  const ASSUME = { docMult: 6, targetUtil: 0.45, concurrentPct: 0.3, actionsPerUserMin: 0.5, peakFactor: 3, workDays: 21, workHours: 9, txPerVcpuMin: 40, intCallsPerMin: 120, kbitPerUser: 60, mbitPerInterface: 0.5, backupFactor: 2.5, attachKbPerDoc: 120, ioPerLine: 8, migrateMonths: 24, years: 5, growth: 0.06, minAppVcpu: 2, minDbVcpu: 2, minRam: 8 };
  /* Profile: Hosting, Komponenten, Sizing-Faktoren. self = selbst zu betreiben (Sizing in vCPU/RAM); saas = beim Anbieter */
  const C = (id, kind, tier, name, tech, o) => Object.assign({ id, kind, tier, name, tech }, o || {});
  const PROFILES = {
    "NEXORA AI Suite": { label: "NEXORA AI Suite", family: "NEXORA", hosting: "Cloud (Zielarchitektur)", self: true, usersPerVcpu: 25, ramPerAppVcpu: 2, bytesPerLine: 2000, inMemory: false, historyMonths: 12, appNodes: 2,
      note: "Zielarchitektur-Annahme. In dieser Demo laufen Engine und Oberfläche vollständig im Browser.",
      comps: [C("sso", "idm", "access", "Single Sign-on", "OIDC/SAML (Annahme)"), C("web", "web", "access", "Web-Oberfläche", "Browser, Experience Layer"), C("app", "app", "app", "Anwendungsdienst", "Container, horizontal skalierend", { sized: "app" }), C("ai", "ai", "app", "KI-Dienst", "Claude über API, Regel-Rückfall", { sized: "ai" }),
        C("db", "db", "data", "Ereignis- und Belegspeicher", "relationale Datenbank (Annahme)", { sized: "db" }), C("files", "db", "data", "Dokumentablage", "Objektspeicher (Annahme)", { sized: "files" }), C("int", "int", "int", "Integrationsdienst", "Konnektoren, MCP/A2A, Ereignisse", { sized: "int" }),
        C("bk", "backup", "ops", "Sicherung", "tägliche Sicherung, Point-in-Time (Annahme)", { sized: "backup" }), C("mon", "mon", "ops", "Monitoring", "Protokoll, Kosten, Prüfpfad")] },
    "SAP ECC": { label: "SAP ECC", family: "SAP", hosting: "On-Premise", self: true, usersPerVcpu: 8, ramPerAppVcpu: 8, bytesPerLine: 12000, inMemory: false, historyMonths: 120, appNodes: 2, note: SAP_NOTE,
      comps: [C("net", "net", "access", "Firmennetz / VPN", "Firewall, VPN"), C("gui", "web", "access", "SAP GUI / Portal", "Desktop-Client"), C("app", "app", "app", "ABAP-Anwendungsserver", "Anwendungsserver + Central Services", { sized: "app" }),
        C("db", "db", "data", "Datenbank", "klassische Datenbank (Annahme)", { sized: "db" }), C("int", "int", "int", "Middleware", "PI/PO (Annahme)", { sized: "int" }), C("bi", "bi", "data", "Data Warehouse", "BW (Annahme)"), C("bk", "backup", "ops", "Sicherung", "Band/Disk (Annahme)", { sized: "backup" }), C("mon", "mon", "ops", "Systembetrieb", "Solution Manager (Annahme)")] },
    "SAP S/4HANA": { label: "SAP S/4HANA", family: "SAP", hosting: "Private Cloud", self: true, usersPerVcpu: 6, ramPerAppVcpu: 8, bytesPerLine: 3500, inMemory: true, historyMonths: 36, appNodes: 2, note: SAP_NOTE,
      comps: [C("idp", "idm", "access", "Identity Provider", "SSO (Annahme)"), C("flp", "web", "access", "Fiori Launchpad", "Browser"), C("app", "app", "app", "ABAP-Anwendungsserver", "Anwendungsserver + Central Services", { sized: "app" }),
        C("db", "db", "data", "In-Memory-Datenbank", "HANA", { sized: "db" }), C("int", "int", "int", "Integrationsplattform", "Integration Suite (Annahme)", { sized: "int" }), C("bi", "bi", "data", "Analytics", "Embedded Analytics"), C("bk", "backup", "ops", "Sicherung", "Snapshots + Log-Backup (Annahme)", { sized: "backup" }), C("mon", "mon", "ops", "Betrieb", "Cloud ALM (Annahme)")] },
    "SAP Business One": { label: "SAP Business One", family: "SAP", hosting: "On-Premise", self: true, usersPerVcpu: 10, ramPerAppVcpu: 4, bytesPerLine: 4000, inMemory: false, historyMonths: 72, appNodes: 1, note: SAP_NOTE,
      comps: [C("net", "net", "access", "Firmennetz / VPN", "Firewall"), C("cl", "web", "access", "Client", "Desktop/Web-Client"), C("app", "app", "app", "Anwendungsserver", "Server mit Diensten", { sized: "app" }), C("db", "db", "data", "Datenbank", "SQL Server oder HANA (Annahme)", { sized: "db" }),
        C("int", "int", "int", "Schnittstellen", "Service Layer / DI-API (Annahme)", { sized: "int" }), C("bk", "backup", "ops", "Sicherung", "nächtlich (Annahme)", { sized: "backup" })] },
    "Microsoft Dynamics 365": { label: "Microsoft Dynamics 365", family: "Microsoft", hosting: "SaaS", self: false, bytesPerLine: 5000, historyMonths: 48, appNodes: 0,
      comps: [C("idp", "idm", "access", "Identität", "Entra ID (Annahme)"), C("web", "web", "access", "Web-Client", "Browser"), C("saas", "app", "app", "Anwendung beim Anbieter", "SaaS – Kapazität beim Anbieter", { saas: true }), C("db", "db", "data", "Datenbank beim Anbieter", "SaaS – Datenvolumen nach Vertrag", { sized: "dbSaas", saas: true }),
        C("int", "int", "int", "Integration", "Power Automate / Integrationsdienst (Annahme)", { sized: "int" }), C("bi", "bi", "data", "Reporting", "Power BI (Annahme)")] },
    "Oracle ERP Cloud": { label: "Oracle ERP Cloud", family: "Oracle", hosting: "SaaS", self: false, bytesPerLine: 5000, historyMonths: 48, appNodes: 0,
      comps: [C("idp", "idm", "access", "Identität", "IDCS (Annahme)"), C("web", "web", "access", "Web-Client", "Browser"), C("saas", "app", "app", "Anwendung beim Anbieter", "SaaS", { saas: true }), C("db", "db", "data", "Datenbank beim Anbieter", "SaaS", { sized: "dbSaas", saas: true }), C("int", "int", "int", "Integration", "Integration Cloud (Annahme)", { sized: "int" }), C("bi", "bi", "data", "Reporting", "OTBI (Annahme)")] },
    "Oracle NetSuite": { label: "Oracle NetSuite", family: "Oracle", hosting: "SaaS", self: false, bytesPerLine: 4000, historyMonths: 48, appNodes: 0,
      comps: [C("web", "web", "access", "Web-Client", "Browser"), C("saas", "app", "app", "Anwendung beim Anbieter", "SaaS", { saas: true }), C("db", "db", "data", "Datenbank beim Anbieter", "SaaS", { sized: "dbSaas", saas: true }), C("int", "int", "int", "Integration", "SuiteTalk / REST (Annahme)", { sized: "int" })] },
    "DATEV": { label: "DATEV", family: "DATEV", hosting: "Rechenzentrum Dienstleister", self: false, bytesPerLine: 1500, historyMonths: 60, appNodes: 0,
      comps: [C("cl", "web", "access", "Arbeitsplatz / Steuerberater", "Client beim Steuerberater"), C("rz", "app", "app", "Rechenzentrum des Dienstleisters", "Dienstleistung – keine eigene Kapazität", { saas: true }), C("db", "db", "data", "Buchungsbestand beim Dienstleister", "nach Vertrag", { sized: "dbSaas", saas: true }), C("int", "int", "int", "Datenaustausch", "Export-Format, Datei (Annahme)", { sized: "int" })] },
    "Sage": { label: "Sage", family: "Sage", hosting: "On-Premise", self: true, usersPerVcpu: 12, ramPerAppVcpu: 4, bytesPerLine: 3000, inMemory: false, historyMonths: 96, appNodes: 1,
      comps: [C("net", "net", "access", "Firmennetz", "Firewall"), C("cl", "web", "access", "Client", "Desktop"), C("app", "app", "app", "Anwendungsserver", "Windows-Server (Annahme)", { sized: "app" }), C("db", "db", "data", "Datenbank", "SQL Server (Annahme)", { sized: "db" }), C("int", "int", "int", "Schnittstellen", "CSV-Export (Annahme)", { sized: "int" }), C("bk", "backup", "ops", "Sicherung", "nächtlich (Annahme)", { sized: "backup" })] },
    "Infor": { label: "Infor", family: "Infor", hosting: "Hosted (Annahme)", self: true, usersPerVcpu: 8, ramPerAppVcpu: 6, bytesPerLine: 8000, inMemory: false, historyMonths: 84, appNodes: 2,
      comps: [C("net", "net", "access", "VPN", "Standortanbindung"), C("web", "web", "access", "Web-Client", "Browser"), C("app", "app", "app", "Anwendungsserver", "Anwendungsserver (Annahme)", { sized: "app" }), C("db", "db", "data", "Datenbank", "SQL Server (Annahme)", { sized: "db" }), C("int", "int", "int", "Integration", "ION (Annahme)", { sized: "int" }), C("bk", "backup", "ops", "Sicherung", "Hoster (Annahme)", { sized: "backup" })] },
    "Eigenentwicklung": { label: "Eigenentwicklung", family: "Eigenentwicklung", hosting: "On-Premise", self: true, usersPerVcpu: 12, ramPerAppVcpu: 4, bytesPerLine: 6000, inMemory: false, historyMonths: 144, appNodes: 1,
      comps: [C("net", "net", "access", "Firmennetz", "Firewall"), C("cl", "web", "access", "Client", "Eigene Oberfläche"), C("app", "app", "app", "Anwendungsserver", "Einzelserver, keine Redundanz", { sized: "app" }), C("db", "db", "data", "Datenbank", "Datenbank (Annahme)", { sized: "db" }), C("sftp", "int", "int", "SFTP-Server", "Dateiaustausch", { sized: "int" }), C("bk", "backup", "ops", "Sicherung", "Skript (Annahme)", { sized: "backup" })] }
  };
  /* Externe Systeme der Suite (Experience Layer) – alle SaaS, alle simuliert */
  const EXTERNAL = { sap: { name: "SAP S/4HANA", hosting: "Private Cloud", tech: "simuliert", bytesPerRecord: 2000 }, m365: { name: "Microsoft 365", hosting: "SaaS", tech: "simuliert", bytesPerRecord: 40000 }, servicenow: { name: "ServiceNow", hosting: "SaaS", tech: "simuliert", bytesPerRecord: 8000 }, workday: { name: "Workday", hosting: "SaaS", tech: "simuliert", bytesPerRecord: 6000 } };
  /* Branchenannahmen für Portfoliounternehmen ohne Belegdaten (Beispielwerte) */
  const DOC_VALUE = { Industrie: 9000, Maschinenbau: 12000, Logistik: 1800, Software: 4000, "IT-Services": 6000, Medizintechnik: 5000, Pharma: 15000, Konsumgüter: 1500, Lebensmittel: 1200, Handel: 250 };
  const LINES_PER_DOC = { Industrie: 6, Maschinenbau: 8, Logistik: 4, Software: 3, "IT-Services": 4, Medizintechnik: 6, Pharma: 7, Konsumgüter: 5, Lebensmittel: 6, Handel: 4 };

  const r1 = x => Math.round(x * 10) / 10; const ceil = Math.ceil;
  const de = v => (Math.round(v * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 }); const gb = v => v >= 1000 ? de(v / 1000) + " TB" : de(v) + " GB";
  function profile(sys) { return PROFILES[sys] || PROFILES.Eigenentwicklung; }

  /* Sizing: alle Größen mit Formel. input: users, docsPerMonth, linesPerDoc, interfaces, historyMonths, entities, growth */
  function sizing(sys, input, A) {
    A = Object.assign({}, ASSUME, A || {}); const P = profile(sys); const i = Object.assign({ entities: 1, interfaces: 4, growth: A.growth }, input); const hist = i.historyMonths != null ? i.historyMonths : P.historyMonths;
    const concurrent = Math.max(1, i.users * A.concurrentPct); const lines = i.docsPerMonth * i.linesPerDoc; const avgTxMin = i.docsPerMonth / (A.workDays * A.workHours * 60); const peakTxMin = avgTxMin * A.peakFactor;
    const loadMin = concurrent * A.actionsPerUserMin + peakTxMin; // Bedienaktionen + Belege je Minute in der Spitze
    const appVcpu = P.self ? Math.max(A.minAppVcpu, ceil(concurrent / P.usersPerVcpu + peakTxMin / A.txPerVcpuMin)) : 0; const appNodes = P.self ? Math.max(1, P.appNodes || 1) : 0; const appRam = P.self ? Math.max(A.minRam, appVcpu * P.ramPerAppVcpu) : 0;
    const dbNow = (lines * hist * P.bytesPerLine + i.entities * 2e8) / 1e9; let dbFut = dbNow; let vol = lines * 12; for (let y = 0; y < A.years; y++) { vol *= 1 + (i.growth || 0); dbFut += vol * P.bytesPerLine / 1e9; }
    const dbVcpu = P.self ? Math.max(A.minDbVcpu, ceil(appVcpu * 0.5)) : 0; const dbRam = P.self ? (P.inMemory ? Math.max(32, ceil(dbFut * 1.2 + 32)) : Math.max(A.minRam, ceil(dbFut * 0.15 + 8))) : 0;
    const files = i.docsPerMonth * hist * A.attachKbPerDoc / 1e6; const storage = P.self ? (dbFut + files) * (1 + A.backupFactor) : 0; const network = concurrent * A.kbitPerUser / 1000 + i.interfaces * A.mbitPerInterface; const iops = ceil(peakTxMin / 60 * i.linesPerDoc * A.ioPerLine + concurrent * 2);
    const capacityMin = P.self ? r1(appVcpu * P.usersPerVcpu * A.actionsPerUserMin / A.targetUtil) : null; const baseUtil = P.self ? Math.min(0.95, (concurrent * A.actionsPerUserMin + avgTxMin) / capacityMin) : null;
    return { system: sys, label: P.label, hosting: P.hosting, self: P.self, inMemory: !!P.inMemory, input: Object.assign({}, i, { historyMonths: hist }),
      concurrent: r1(concurrent), avgTxMin: r1(avgTxMin), peakTxMin: r1(peakTxMin), loadMin: r1(loadMin), app: { vcpu: appVcpu, ram: appRam, nodes: appNodes }, db: { vcpu: dbVcpu, ram: dbRam, sizeNow: r1(dbNow), sizeFuture: r1(dbFut) },
      files: r1(files), storage: r1(storage), network: r1(network), iops, capacityMin, baseUtil, note: P.note || null,
      formulas: { concurrent: `Nutzer × ${Math.round(A.concurrentPct * 100)} % gleichzeitig`, peak: `Belege/Monat ÷ (${A.workDays} Tage × ${A.workHours} h × 60) × Spitzenfaktor ${A.peakFactor}`,
        app: P.self ? `max(${A.minAppVcpu}; gleichzeitige Nutzer ÷ ${P.usersPerVcpu} + Spitzenbelege/min ÷ ${A.txPerVcpuMin}) vCPU; RAM = vCPU × ${P.ramPerAppVcpu} GB (mind. ${A.minRam} GB)` : "beim Anbieter – Kapazität nach Vertrag, nicht selbst zu dimensionieren",
        db: `Positionen/Monat × Historie ${hist} Monate × ${P.bytesPerLine} Byte je Position (inkl. Nebentabellen, Indizes, Protokolle) + 0,2 GB je Gesellschaft; Zukunft: + ${A.years} Jahre Zuwachs bei ${Math.round((i.growth || 0) * 100)} % p. a.` + (P.self ? (P.inMemory ? "; In-Memory: RAM = Datenbestand × 1,2 + 32 GB" : "; RAM = 15 % des Datenbestands + 8 GB") : ""),
        storage: P.self ? `(Datenbank in ${A.years} Jahren + Dokumente ${A.attachKbPerDoc} KB/Beleg) × (1 + Sicherungsfaktor ${A.backupFactor})` : "beim Anbieter", network: `gleichzeitige Nutzer × ${A.kbitPerUser} kbit/s + Schnittstellen × ${A.mbitPerInterface} Mbit/s`, iops: `Spitzenbelege/s × Positionen × ${A.ioPerLine} + gleichzeitige Nutzer × 2`, util: P.self ? `Grundlast = (gleichzeitige Nutzer × ${A.actionsPerUserMin} Aktionen/min + Belege/min) ÷ Kapazität; Kapazität = vCPU × ${P.usersPerVcpu} Nutzer/vCPU × ${A.actionsPerUserMin} ÷ Zielauslastung ${Math.round(A.targetUtil * 100)} % = ${r1(appVcpu * P.usersPerVcpu * A.actionsPerUserMin / A.targetUtil)} Aktionen/min; live: + Ereignisse der letzten Minute ÷ Kapazität` : "beim Anbieter" } };
  }
  /* Ziel-Sizing auf NEXORA (Szenario D): gleiche Nutzer und Volumen, Altdaten nur teilweise übernommen */
  function target(input, A) { A = Object.assign({}, ASSUME, A || {}); const hist = Math.min(input.historyMonths != null ? input.historyMonths : 999, A.migrateMonths); return sizing("NEXORA AI Suite", Object.assign({}, input, { historyMonths: hist, interfaces: Math.max(2, Math.round((input.interfaces || 4) / 2)) }), A); }
  /* Was-wäre-wenn: Faktoren auf Nutzer und Volumen, Zukauf mit eigenen Nutzern/Belegen */
  function whatIf(input, w) { w = w || {}; const acq = w.acquisition || null; return Object.assign({}, input, { users: Math.round(input.users * (w.usersX || 1) + (acq ? acq.users : 0)), docsPerMonth: Math.round(input.docsPerMonth * (w.volumeX || 1) + (acq ? acq.docsPerMonth : 0)), entities: (input.entities || 1) + (acq ? acq.entities || 1 : 0), interfaces: (input.interfaces || 4) + (acq ? 2 : 0) }); }
  /* Auslastung: Grundlast aus dem Sizing + Ereignisse der letzten Minute im Verhältnis zur Kapazität */
  function util(base, eventsPerMin, capacityPerMin) { if (base == null || !capacityPerMin) return null; return Math.min(0.99, Math.max(0, base + eventsPerMin / capacityPerMin)); }
  const statusOf = (u, err, saas) => err ? "error" : u == null ? (saas ? "saas" : "na") : u >= 0.9 ? "crit" : u >= 0.7 ? "warn" : "ok";

  /* Topologie: Komponenten mit Größe, Auslastung und Status. live: { eventsPerMin, intPerMin, aiPerMin, intError, intWarn, external: [{ sys, name, hosting, calls, perMin, processes, readOnly }] } */
  function topology(sz, live, A) {
    A = Object.assign({}, ASSUME, A || {}); live = live || {}; const P = profile(sz.system); const ev = live.eventsPerMin || 0;
    const appU = util(sz.baseUtil, ev, sz.capacityMin); const dbU = appU == null ? null : Math.min(0.99, appU * 0.7 + (sz.inMemory ? 0.1 : 0)); const intU = Math.min(0.99, 0.08 + (live.intPerMin || 0) / A.intCallsPerMin);
    const comps = P.comps.map(c0 => { const c = Object.assign({}, c0); let u = null;
      if (c.sized === "app") { c.size = `${sz.app.nodes} × ${Math.ceil(sz.app.vcpu / sz.app.nodes)} vCPU · ${de(sz.app.ram)} GB RAM`; u = appU; }
      else if (c.sized === "db") { c.size = `${sz.db.vcpu} vCPU · ${de(sz.db.ram)} GB RAM · Daten ${gb(sz.db.sizeNow)} → ${gb(sz.db.sizeFuture)}`; u = dbU; }
      else if (c.sized === "dbSaas") c.size = `Datenvolumen ${gb(sz.db.sizeNow)} → ${gb(sz.db.sizeFuture)}`;
      else if (c.sized === "files") c.size = `${gb(sz.files)} Dokumente`;
      else if (c.sized === "backup") c.size = `${gb(sz.storage)} Speicher gesamt`;
      else if (c.sized === "int") { c.size = `${sz.input.interfaces} Schnittstellen · ${de(sz.network)} Mbit/s`; u = intU; }
      else if (c.sized === "ai") { c.size = "nach Aufrufen (Beispielkosten im Protokoll)"; u = Math.min(0.99, (live.aiPerMin || 0) / 20); }
      c.util = u; c.status = statusOf(u, c.kind === "int" && live.intError, c.saas); if (c.kind === "int" && live.intWarn && c.status === "ok") c.status = "warn"; if (c.kind === "int" && live.intText) c.note = live.intText; return c; });
    for (const x of live.external || []) comps.push({ id: "ext-" + x.sys, kind: "ext", tier: "int", name: x.name, tech: (EXTERNAL[x.sys] || {}).tech || x.tech || "", hosting: x.hosting, size: `${x.processes.length ? x.processes.join(", ") : "keine Prozesse mehr"}${x.records != null ? " · " + x.records + " Datensätze" : ""}`, util: Math.min(0.99, 0.05 + (x.perMin || 0) / 30), status: x.readOnly ? "ro" : statusOf(Math.min(0.99, 0.05 + (x.perMin || 0) / 30)), calls: x.calls, readOnly: !!x.readOnly });
    return { system: sz.system, label: P.label, hosting: P.hosting, tiers: TIERS.map(([id, name]) => ({ id, name, comps: comps.filter(c => c.tier === id) })), comps };
  }

  /* ---------- Eingaben ableiten ---------- */
  /* Aus einem Engine-Mandanten (Datenstruktur, ohne Engine-Modul): gemessen aus Stammdaten und Belegen */
  function inputFromEngine(t, opt) {
    opt = opt || {}; const per = {}; for (const d of t.docs) per[d.period] = per[d.period] || { n: 0, l: 0 }; for (const d of t.docs) { per[d.period].n++; per[d.period].l += d.lines.length; }
    const open = Object.keys(t.periods).filter(p => t.periods[p] === "open"); const closed = Object.keys(per).filter(p => !open.includes(p)).sort().slice(-12); const n = closed.reduce((a, p) => a + per[p].n, 0), l = closed.reduce((a, p) => a + per[p].l, 0);
    const employees = (t.master.employees || []).length; const users = Math.max(5, Math.round(employees * (opt.userShare || 0.7)));
    let bytes = 0; try { bytes = JSON.stringify(t).length; } catch (e) { bytes = 0; }
    return { users, docsPerMonth: Math.max(1, Math.round(n / Math.max(1, closed.length))), linesPerDoc: n ? r1(l / n) : 3, interfaces: opt.interfaces != null ? opt.interfaces : 2, historyMonths: closed.length, entities: opt.entities || 1, growth: opt.growth != null ? opt.growth : ASSUME.growth,
      measured: { employees, docs: t.docs.length, months: closed.length, demoBytes: bytes, openDocs: t.docs.filter(d => open.includes(d.period)).length } };
  }
  /* Aus Portfolio-Kennzahlen: Umsatz und Branche → Belege; Nutzer wie in der ERP-Transformation */
  function inputFromCompany(c) {
    const docs = Math.max(50, Math.round(c.revenue / (DOC_VALUE[c.industry] || 5000) / 12 * ASSUME.docMult)); return { users: c.users, docsPerMonth: docs, linesPerDoc: LINES_PER_DOC[c.industry] || 5, interfaces: c.interfaces || 4, entities: c.entities || 1, growth: c.growth != null ? Math.max(-0.05, Math.min(0.25, c.growth)) : ASSUME.growth, historyMonths: c.historyMonths,
      derived: `Belege/Monat = Umsatz ÷ ${DOC_VALUE[c.industry] || 5000} € je Ausgangsrechnung (Branche ${c.industry}, Annahme) ÷ 12 × ${ASSUME.docMult} (Eingangsrechnungen, Warenbewegungen, Zahlungen); Positionen je Beleg ${LINES_PER_DOC[c.industry] || 5} (Annahme)` };
  }
  /* Portfolio-Summe: nur selbst betriebene Systeme haben vCPU/RAM */
  function summarize(rows) { const s = { companies: rows.length, selfHosted: 0, saas: 0, vcpu: 0, ram: 0, storage: 0, dbNow: 0, dbFuture: 0, users: 0, byHosting: {}, nexora: { vcpu: 0, ram: 0, storage: 0 } };
    for (const r of rows) { const z = r.sizing; s.users += z.input.users; s.dbNow += z.db.sizeNow; s.dbFuture += z.db.sizeFuture; s.byHosting[z.hosting] = (s.byHosting[z.hosting] || 0) + 1; if (z.self) { s.selfHosted++; s.vcpu += z.app.vcpu + z.db.vcpu; s.ram += z.app.ram + z.db.ram; s.storage += z.storage; } else s.saas++;
      if (r.target) { s.nexora.vcpu += r.target.app.vcpu + r.target.db.vcpu; s.nexora.ram += r.target.app.ram + r.target.db.ram; s.nexora.storage += r.target.storage; } }
    for (const k of ["storage", "dbNow", "dbFuture"]) s[k] = r1(s[k]); s.nexora.storage = r1(s.nexora.storage); return s; }

  return { VERSION, NOTE, SAP_NOTE, KIND, TIERS, ASSUME, PROFILES, EXTERNAL, DOC_VALUE, LINES_PER_DOC, profile, sizing, target, whatIf, util, topology, inputFromEngine, inputFromCompany, summarize };
});
