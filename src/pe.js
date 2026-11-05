/* NEXORA PE Command Center – Rechenkern (v0.9 MVP). Reine Logik, kein DOM, in Node testbar.
   NEXORA AI – A brand of TRUESCALE.
   Alle Organisationen, Fonds, Unternehmen und Zahlen sind SYNTHETISCH: deterministisch aus dem Seed erzeugt.
   Jede Lesefunktion verlangt einen Principal und prüft die Berechtigung selbst (Organisation, Fonds, Unternehmen,
   Freigabestufe). In dieser Auslieferung läuft die Prüfung im selben Programm wie die Oberfläche – kein Server. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.NexoraPE = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const VERSION = "0.9.0";
  const SEED = 20261102;
  const VALUATION_DATE = "2026-10-31";
  const LAST = "2026-10"; const MONTHS = 36;
  const PERIODS = (() => { const out = []; let y = 2023, m = 11; for (let i = 0; i < MONTHS; i++) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } } return out; })();
  const DEMO_NOTE = "Synthetische Demodaten – fiktive Unternehmen, keine realen Finanzzahlen";

  /* ---------- Hilfen ---------- */
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const r2 = x => Math.round(x * 100) / 100; const between = (rng, a, b) => a + (b - a) * rng(); const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const sum = a => a.reduce((x, y) => x + y, 0);
  function fail(code, text) { const e = new Error(text); e.code = code; throw e; }
  const daysBetween = (a, b) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000;
  const monthEnd = p => { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m, 0)); return d.toISOString().slice(0, 10); };
  const addMonths = (p, n) => { let [y, m] = p.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };

  /* ---------- IRR auf datierten Cashflows (ACT/365, wie XIRR) ---------- */
  function xirr(flows) {
    const cf = flows.filter(f => f.amount !== 0).slice().sort((a, b) => a.date < b.date ? -1 : 1); if (!cf.length || !cf.some(f => f.amount < 0) || !cf.some(f => f.amount > 0)) return null;
    const d0 = cf[0].date; const t = cf.map(f => daysBetween(d0, f.date) / 365);
    const npv = r => sum(cf.map((f, i) => f.amount / Math.pow(1 + r, t[i])));
    let lo = -0.9999, hi = 10; let flo = npv(lo), fhi = npv(hi); if (flo * fhi > 0) return null;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; const fm = npv(mid); if (Math.abs(fm) < 1e-7) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  }

  /* ---------- Konzernkontenplan und lokale Kontenpläne je ERP-Familie ---------- */
  const GROUP_COA = {
    REV: ["Umsatzerlöse", "GuV"], COGS: ["Materialaufwand / Wareneinsatz", "GuV"], OPEX_PERS: ["Personalaufwand", "GuV"], OPEX_OTHER: ["Sonstige betriebliche Aufwendungen", "GuV"],
    DA: ["Abschreibungen", "GuV"], INT: ["Zinsaufwand", "GuV"], TAX: ["Ertragsteuern", "GuV"],
    CASH: ["Liquide Mittel", "Bilanz"], AR: ["Forderungen aus Lieferungen und Leistungen", "Bilanz"], INV: ["Vorräte", "Bilanz"], FA: ["Anlagevermögen", "Bilanz"],
    AP: ["Verbindlichkeiten aus Lieferungen und Leistungen", "Bilanz"], DEBT: ["Finanzverbindlichkeiten", "Bilanz"], EQ: ["Eigenkapital", "Bilanz"],
    CAPEX: ["Investitionen in Anlagevermögen", "Cashflow"], DIV: ["Ausschüttungen", "Cashflow"], EQIN: ["Eigenkapitalzuführung", "Cashflow"]
  };
  const COA_FAMILY = {
    sap: { REV: [["400000", "Umsatzerlöse Inland"], ["410000", "Umsatzerlöse Ausland"]], COGS: [["500000", "Materialaufwand"]], OPEX_PERS: [["600000", "Löhne und Gehälter"]], OPEX_OTHER: [["690000", "Sonstige betriebliche Aufwendungen"]], DA: [["700000", "Abschreibungen Sachanlagen"]], INT: [["750000", "Zinsaufwand"]], TAX: [["770000", "Steuern vom Einkommen"]], CASH: [["113100", "Bank"]], AR: [["140000", "Forderungen LuL"]], INV: [["300000", "Vorräte"]], FA: [["021000", "Sachanlagen"]], AP: [["160000", "Verbindlichkeiten LuL"]], DEBT: [["170000", "Bankdarlehen"]], EQ: [["090000", "Eigenkapital"]], CAPEX: [["CF-INV", "Zugänge Anlagevermögen"]], DIV: [["CF-DIV", "Ausschüttung"]], EQIN: [["CF-EK", "Kapitalerhöhung"]] },
    datev: { REV: [["4400", "Erlöse 19 % USt"], ["4120", "Steuerfreie Umsätze"]], COGS: [["5400", "Wareneingang"]], OPEX_PERS: [["6000", "Löhne und Gehälter"]], OPEX_OTHER: [["6300", "Sonstige betriebliche Aufwendungen"]], DA: [["6220", "Abschreibungen auf Sachanlagen"]], INT: [["7300", "Zinsen und ähnliche Aufwendungen"]], TAX: [["7600", "Körperschaftsteuer"]], CASH: [["1800", "Bank"]], AR: [["1200", "Forderungen aus LuL"]], INV: [["1140", "Warenbestand"]], FA: [["0400", "Technische Anlagen"]], AP: [["3300", "Verbindlichkeiten aus LuL"]], DEBT: [["3150", "Verbindlichkeiten gegenüber Kreditinstituten"]], EQ: [["2900", "Gezeichnetes Kapital und Rücklagen"]], CAPEX: [["CF-INV", "Investitionen"]], DIV: [["CF-DIV", "Gewinnausschüttung"]], EQIN: [["CF-EK", "Einlagen"]] },
    dynamics: { REV: [["4000-REV", "Revenue – Products"], ["4100-REV", "Revenue – Services"]], COGS: [["5000-COGS", "Cost of goods sold"]], OPEX_PERS: [["6000-PAY", "Payroll"]], OPEX_OTHER: [["6900-OPX", "Other operating expenses"]], DA: [["7000-DEP", "Depreciation"]], INT: [["7500-INT", "Interest expense"]], TAX: [["7700-TAX", "Income tax"]], CASH: [["1100-CSH", "Cash at bank"]], AR: [["1200-AR", "Accounts receivable"]], INV: [["1300-INV", "Inventory"]], FA: [["1600-PPE", "Property, plant and equipment"]], AP: [["2100-AP", "Accounts payable"]], DEBT: [["2500-LTD", "Long-term debt"]], EQ: [["3000-EQ", "Shareholders' equity"]], CAPEX: [["CF-CAPEX", "Capital expenditure"]], DIV: [["CF-DIV", "Dividends paid"]], EQIN: [["CF-EQ", "Equity contribution"]] },
    netsuite: { REV: [["Revenue:Product", "Product revenue"], ["Revenue:Subscription", "Subscription revenue"]], COGS: [["COGS:Direct", "Direct cost"]], OPEX_PERS: [["Expense:Payroll", "Payroll"]], OPEX_OTHER: [["Expense:Other", "Other operating expense"]], DA: [["Expense:Depreciation", "Depreciation and amortisation"]], INT: [["Other:Interest", "Interest expense"]], TAX: [["Other:Tax", "Income tax"]], CASH: [["Bank:Operating", "Operating account"]], AR: [["AR:Trade", "Trade receivables"]], INV: [["Asset:Inventory", "Inventory"]], FA: [["Asset:Fixed", "Fixed assets"]], AP: [["AP:Trade", "Trade payables"]], DEBT: [["Liability:Loan", "Term loan"]], EQ: [["Equity:Total", "Equity"]], CAPEX: [["CF:Capex", "Capex"]], DIV: [["CF:Dividend", "Dividend"]], EQIN: [["CF:Equity", "Equity injection"]] },
    oracle: { REV: [["4100.000", "Sales revenue"], ["4200.000", "Service revenue"]], COGS: [["5100.000", "Cost of sales"]], OPEX_PERS: [["6100.000", "Salaries"]], OPEX_OTHER: [["6800.000", "Other opex"]], DA: [["6900.000", "Depreciation"]], INT: [["7100.000", "Interest"]], TAX: [["7900.000", "Tax"]], CASH: [["1010.000", "Cash"]], AR: [["1200.000", "Receivables"]], INV: [["1400.000", "Inventories"]], FA: [["1700.000", "Fixed assets"]], AP: [["2000.000", "Payables"]], DEBT: [["2600.000", "Borrowings"]], EQ: [["3000.000", "Equity"]], CAPEX: [["CF.CAPEX", "Capex"]], DIV: [["CF.DIV", "Dividend"]], EQIN: [["CF.EQ", "Equity"]] },
    sage: { REV: [["4000", "Sales Type A"], ["4010", "Sales Type B"]], COGS: [["5000", "Materials purchased"]], OPEX_PERS: [["7000", "Gross wages"]], OPEX_OTHER: [["7500", "Overheads"]], DA: [["8000", "Depreciation"]], INT: [["7900", "Bank interest"]], TAX: [["9000", "Corporation tax"]], CASH: [["1200", "Bank current account"]], AR: [["1100", "Debtors control"]], INV: [["1001", "Stock"]], FA: [["0030", "Plant and machinery"]], AP: [["2100", "Creditors control"]], DEBT: [["2300", "Loans"]], EQ: [["3000", "Capital and reserves"]], CAPEX: [["CF-CAPEX", "Capex"]], DIV: [["CF-DIV", "Dividend"]], EQIN: [["CF-EQ", "Equity"]] },
    infor: { REV: [["R-4000", "Revenue"], ["R-4050", "Other revenue"]], COGS: [["C-5000", "Cost of goods"]], OPEX_PERS: [["E-6000", "Personnel"]], OPEX_OTHER: [["E-6500", "Operating expense"]], DA: [["E-6900", "Depreciation"]], INT: [["F-7000", "Interest"]], TAX: [["T-7500", "Tax"]], CASH: [["A-1000", "Cash"]], AR: [["A-1200", "Receivables"]], INV: [["A-1300", "Inventory"]], FA: [["A-1600", "Fixed assets"]], AP: [["L-2000", "Payables"]], DEBT: [["L-2500", "Debt"]], EQ: [["Q-3000", "Equity"]], CAPEX: [["CF-1", "Capex"]], DIV: [["CF-2", "Dividend"]], EQIN: [["CF-3", "Equity"]] },
    custom: { REV: [["U100", "Erlöse"], ["U110", "Erlöse sonstige"]], COGS: [["K200", "Material"]], OPEX_PERS: [["K300", "Personal"]], OPEX_OTHER: [["K400", "Sachkosten"]], DA: [["K500", "AfA"]], INT: [["K600", "Zinsen"]], TAX: [["K700", "Steuern"]], CASH: [["B010", "Bankguthaben"]], AR: [["B020", "Debitoren"]], INV: [["B030", "Lager"]], FA: [["B040", "Anlagen"]], AP: [["B050", "Kreditoren"]], DEBT: [["B060", "Darlehen"]], EQ: [["B070", "Eigenkapital"]], CAPEX: [["Z1", "Investitionen"]], DIV: [["Z2", "Ausschüttung"]], EQIN: [["Z3", "Einlage"]] },
    nexora: { REV: [["4000", "Umsatzerlöse"], ["4400", "Umsatzerlöse Service"]], COGS: [["5000", "Materialaufwand"]], OPEX_PERS: [["6000", "Personalaufwand"]], OPEX_OTHER: [["6800", "Sonstige Aufwendungen"]], DA: [["6200", "Abschreibungen"]], INT: [["7300", "Zinsaufwand"]], TAX: [["7600", "Ertragsteuern"]], CASH: [["1100", "Bank"]], AR: [["1200", "Forderungen"]], INV: [["1300", "Vorräte"]], FA: [["0400", "Anlagen"]], AP: [["1600", "Verbindlichkeiten LuL"]], DEBT: [["1700", "Darlehen"]], EQ: [["2000", "Eigenkapital"]], CAPEX: [["CF-INV", "Investitionen"]], DIV: [["CF-DIV", "Ausschüttung"]], EQIN: [["CF-EK", "Einlage"]] }
  };
  /* ERP-Systeme: Familie des Kontenplans, Einzelposten über den (künftigen) Konnektor verfügbar? Alles simuliert. */
  const ERP = {
    "SAP ECC": { family: "sap", lineItems: false, method: "Datei-Export (simuliert)" }, "SAP S/4HANA": { family: "sap", lineItems: true, method: "OData (simuliert)" }, "SAP Business One": { family: "sap", lineItems: true, method: "Service Layer (simuliert)" },
    "Microsoft Dynamics 365": { family: "dynamics", lineItems: true, method: "REST (simuliert)" }, "Oracle ERP Cloud": { family: "oracle", lineItems: true, method: "REST (simuliert)" }, "Oracle NetSuite": { family: "netsuite", lineItems: true, method: "SuiteTalk (simuliert)" },
    "DATEV": { family: "datev", lineItems: false, method: "DATEV-Export (simuliert)" }, "Sage": { family: "sage", lineItems: false, method: "CSV-Import (simuliert)" }, "Infor": { family: "infor", lineItems: true, method: "ION API (simuliert)" },
    "Eigenentwicklung": { family: "custom", lineItems: false, method: "SFTP-Datei (simuliert)" }, "NEXORA AI Suite": { family: "nexora", lineItems: true, method: "NEXORA-Engine (live in der Suite)" }
  };
  const FX_BASE = { EUR: 1, CHF: 0.94, GBP: 0.85, USD: 1.08, PLN: 4.32, SEK: 11.4, DKK: 7.46 }; // Einheiten Landeswährung je EUR (Beispielwerte)
  const SECTOR_MULT = { Industrie: 8.5, Maschinenbau: 8, Logistik: 7.5, Software: 13, "IT-Services": 10, Medizintechnik: 12.5, Pharma: 11.5, Konsumgüter: 9.5, Lebensmittel: 9, Handel: 8 };

  /* ---------- Demo-Welt ---------- */
  const NGEP_FUNDS = [
    { id: "F1", name: "Fund I – Industrial Transformation", vintage: "2019-03-01", size: 1200e6, years: [2019, 2022], n: 10, sectors: ["Industrie", "Maschinenbau", "Logistik"] },
    { id: "F2", name: "Fund II – Technology & Services", vintage: "2021-01-15", size: 900e6, years: [2021, 2024], n: 8, sectors: ["Software", "IT-Services"] },
    { id: "F3", name: "Fund III – Healthcare & Consumer", vintage: "2022-06-01", size: 750e6, years: [2022, 2026], n: 7, sectors: ["Medizintechnik", "Pharma", "Konsumgüter", "Lebensmittel", "Handel"] }
  ];
  const NAMES = ["Albris Antriebstechnik", "Kestrel Präzisionsteile", "Nordmark Fördertechnik", "Velatis Logistik", "Brennerwerk Gusstechnik", "Halvard Hydraulik", "Ostara Verpackung", "Trevor Steel Components", "Lumera Sensorik", "Castell Schaltanlagen",
    "Quorra Software", "Nimbus Data Services", "Paladin Cloud Security", "Synthos Analytics", "Vireo IT Consulting", "Cobalt Payments Tech", "Arkadia Learning Systems", "Meridian Managed Services",
    "Solvia Medtech", "Aurelis Pharma Services", "Bellafiore Foods", "Nordlicht Naturkosmetik", "Vitalis Diagnostics", "Hearth & Home Retail", "Clearpath Orthopädie"];
  const COUNTRIES = [["Deutschland", "EUR"], ["Deutschland", "EUR"], ["Deutschland", "EUR"], ["Österreich", "EUR"], ["Schweiz", "CHF"], ["Vereinigtes Königreich", "GBP"], ["USA", "USD"], ["Polen", "PLN"], ["Schweden", "SEK"], ["Niederlande", "EUR"], ["Frankreich", "EUR"], ["Dänemark", "DKK"]];
  const ERP_LIST = Object.keys(ERP);
  // Szenarien (fest zugeordnet, damit Storys und Tests stabil sind)
  const SCEN = { 0: "margin", 3: "liquidity", 5: "wc", 24: "acquisition", 9: "erp" };

  function genCompany(rng, idx, fund, orgId, scale) {
    const scen = SCEN[idx] || null;
    const [country, currency] = idx === 0 ? ["Deutschland", "EUR"] : idx === 5 ? ["Vereinigtes Königreich", "GBP"] : pick(rng, COUNTRIES);
    const industry = pick(rng, fund.sectors);
    let erp = scen === "erp" ? "SAP ECC" : scen === "acquisition" ? "DATEV" : idx === 7 ? "NEXORA AI Suite" : pick(rng, ERP_LIST.filter(e => e !== "NEXORA AI Suite"));
    const fam = ERP[erp].family;
    const yr = Math.floor(between(rng, fund.years[0], fund.years[1] + 0.999));
    const acq0 = `${yr}-${String(1 + Math.floor(rng() * 12)).padStart(2, "0")}-15`; const acquired = scen === "acquisition" ? "2026-08-15" : acq0 > "2026-06-15" ? "2026-03-15" : acq0;
    const ownership = scen === "acquisition" ? 1 : r2(pick(rng, [1, 1, 0.9, 0.8, 0.75, 0.68, 0.6, 0.55, 0.51]));
    const size = Math.exp(between(rng, Math.log(45e6), Math.log(320e6))) * scale; // Jahresumsatz in EUR (vor Skalierung)
    const sectorMargin = { Software: 0.24, "IT-Services": 0.14, Medizintechnik: 0.21, Pharma: 0.19, Konsumgüter: 0.13, Lebensmittel: 0.11, Handel: 0.08, Industrie: 0.14, Maschinenbau: 0.13, Logistik: 0.1 }[industry];
    const margin = scen === "liquidity" ? 0.03 : Math.max(0.05, sectorMargin + between(rng, -0.04, 0.04));
    const growth = scen === "liquidity" ? -0.04 : between(rng, -0.02, industry === "Software" ? 0.22 : 0.1);
    const gm = Math.min(0.85, margin + between(rng, 0.3, 0.45) + (industry === "Software" ? 0.2 : 0));
    const ps = Math.min(gm - margin - 0.05, between(rng, 0.15, 0.3));
    const fyStart = currency === "GBP" ? 4 : rng() < 0.15 ? 7 : 1;
    const standard = currency === "USD" ? "US GAAP" : country === "Deutschland" && rng() < 0.6 ? "HGB" : "IFRS";
    const id = "PC" + String(idx + 1).padStart(2, "0") + (orgId === "ngep" ? "" : "-" + orgId);
    const nLE = 1 + Math.floor(rng() * 3); const leW = Array.from({ length: nLE }, () => 0.5 + rng()); const leS = sum(leW);
    const entities = leW.map((w, i) => ({ id: id + "-LE" + (i + 1), name: i === 0 ? "Holding und Inland" : i === 1 ? "Vertriebsgesellschaft" : "Produktionsgesellschaft", weight: w / leS }));
    const units = [{ id: id + "-BU1", name: industry === "Software" ? "Lizenzen und Abos" : "Kerngeschäft", weight: 0.7 }, { id: id + "-BU2", name: "Service", weight: 0.3 }];
    return { id, orgId, fundId: fund.id, portfolioId: fund.id + "-P", name: NAMES[idx] || "Portfolio " + (idx + 1), industry, country, currency, erp, erpFamily: fam, model: erp === "NEXORA AI Suite" ? "B" : "A",
      standard, fyStart, acquired, ownership, scenario: scen, size, margin, growth, gm, ps,
      status: scen === "acquisition" ? "Onboarding" : idx === 12 ? "Exit-Vorbereitung" : "Halten",
      onboarding: scen === "acquisition" ? "Finanz-Mapping" : "Aktiv", integration: scen === "acquisition" ? "Mapping offen" : scen === "erp" ? "Verzögert" : "Synchron",
      dsa: { level: idx % 4 === 1 ? "kpi" : idx % 4 === 2 ? "statements" : "transactions" }, entities, units,
      costCenters: ["Vertrieb", "Produktion", "Verwaltung", "IT"].map((n, i) => ({ id: id + "-CC" + (i + 1), name: n })) };
  }

  /* Monatswerte in Landeswährung über lokale Konten – Bilanzidentität wird durch Konstruktion erzwungen und getestet */
  function genMonthly(rng, c) {
    const fx = FX_BASE[c.currency]; const rev0 = c.size * fx / 12; const coa = COA_FAMILY[c.erpFamily]; const liq = c.scenario === "liquidity";
    const dso = c.scenario === "wc" ? 96 : between(rng, 38, 62), dio = c.scenario === "wc" ? 128 : between(rng, 30, 70), dpo = between(rng, 28, 48);
    const capexPct = between(rng, 0.025, 0.05) * (liq ? 1.6 : 1); const rate = between(rng, 0.045, 0.075);
    const lev = liq ? 5.0 : between(rng, 3.8, 5.6); const debt0 = rev0 * 12 * c.margin * lev; const amort = liq ? 0.0025 : 0.004;
    const cashCap = rev0 * between(rng, 2.0, 3.2), cashFloor = rev0 * 0.35; // Cash Sweep über Obergrenze, Revolver unter Untergrenze
    const run = cash0 => {
      let fa = rev0 * 12 * between(mulberry32(hashStr(c.id + "fa")), 0.25, 0.5), debt = debt0, ar = 0, inv = 0, ap = 0, cash = cash0, eq = null; const rows = [];
      for (let i = 0; i < MONTHS; i++) {
        const p = PERIODS[i]; const mo = +p.slice(5); const r = mulberry32(hashStr(c.id + p));
        const seas = 1 + 0.06 * Math.sin((mo - 3) / 12 * 2 * Math.PI); const noise = 1 + between(r, -0.025, 0.025);
        const rev = rev0 * Math.pow(1 + c.growth, i / 12) * seas * noise;
        let m = c.margin; if (c.scenario === "margin") m = i < MONTHS - 14 ? c.margin : Math.max(0.045, c.margin - (i - (MONTHS - 14)) * 0.006); // Margenverfall in den letzten 14 Monaten
        if (liq) m = c.margin - Math.max(0, i - 18) * 0.004;
        const ebitda = rev * m; const cogs = rev * (1 - c.gm) + (c.margin - m) * rev; const pers = rev * c.ps; const other = rev - cogs - pers - ebitda;
        const da = fa * 0.009; const intr = debt * rate / 12; const tax = Math.max(0, ebitda - da - intr) * 0.28; const ni = ebitda - da - intr - tax;
        const ar1 = rev * dso / 30.4, inv1 = cogs * dio / 30.4, ap1 = cogs * dpo / 30.4; const capex = rev * capexPct;
        let ddebt = -Math.min(debt, debt0 * amort);
        const div = (mo === 5 && i > 12 && !liq && c.scenario !== "margin" && c.margin > 0.12) ? Math.max(0, ni * 12 * 0.35) : 0;
        const eqin = liq && p === "2026-07" ? rev0 * 0.25 : 0; // Eigenkapitalzuführung des Fonds (Follow-on)
        cash += ni + da - (i ? ar1 - ar : 0) - (i ? inv1 - inv : 0) + (i ? ap1 - ap : 0) - capex + ddebt - div + eqin;
        if (!liq && cash > cashCap) { const x = Math.min(debt + ddebt, cash - cashCap); ddebt -= x; cash -= x; }       // Cash Sweep tilgt Darlehen
        if (!liq && cash < cashFloor) { const x = cashFloor - cash; ddebt += x; cash += x; }                            // Revolver-Ziehung
        fa = fa + capex - da; debt = debt + ddebt; ar = ar1; inv = inv1; ap = ap1;
        const assets = cash + ar + inv + fa, liab = ap + debt; eq = eq === null ? assets - liab : eq + ni - div + eqin;
        rows.push({ p, rev, cogs, pers, other, da, intr, tax, cash, ar, inv, fa, ap, debt, eq, capex, div, eqin, fcfLike: ni + da - capex });
      }
      return rows;
    };
    const startCash = rev0 * between(rng, 0.9, 1.5); let rows = run(startCash);
    if (liq) { // Startkasse so, dass am Ende rund vier Monate Reichweite bleiben (Kassenverlauf ist linear im Startwert)
      const burn = -(rows[MONTHS - 1].cash - rows[MONTHS - 7].cash - rows.slice(-6).reduce((x, y) => x + y.eqin, 0)) / 6; const target = Math.max(burn, rev0 * 0.04) * 4.2;
      let fix = target - rows[MONTHS - 1].cash; const minAfter = Math.min(...rows.map(x => x.cash)) + fix; if (minAfter < rev0 * 0.02) fix += rev0 * 0.02 - minAfter; rows = run(startCash + fix); }
    const out = rows.map(s => { const accounts = {}; const put = (cat, v, split) => { const list = coa[cat]; if (list.length > 1 && split) { accounts[list[0][0]] = r2(v * split); accounts[list[1][0]] = r2(v - r2(v * split)); } else accounts[list[0][0]] = r2(v); };
      put("REV", s.rev, 0.62); put("COGS", s.cogs); put("OPEX_PERS", s.pers); put("OPEX_OTHER", s.other); put("DA", s.da); put("INT", s.intr); put("TAX", s.tax);
      put("CASH", s.cash); put("AR", s.ar); put("INV", s.inv); put("FA", s.fa); put("AP", s.ap); put("DEBT", s.debt); put("EQ", s.eq); put("CAPEX", s.capex); put("DIV", s.div); put("EQIN", s.eqin);
      return { period: s.p, accounts }; });
    const debtInfo = { rate, maturity: addMonths("2027-06", Math.floor(rng() * 48)) + "-30", covenantMaxLeverage: liq ? 5.5 : r2(lev + between(rng, 0.8, 1.6)), dso, dio, dpo, initialLeverage: lev };
    if (liq) debtInfo.maturity = "2027-03-31";
    return { months: out, debt: debtInfo };
  }
  function genFx(rng) { const out = {}; for (const [cur, base] of Object.entries(FX_BASE)) { let x = base; out[cur] = {}; for (const p of PERIODS) { const open = x; x = cur === "EUR" ? 1 : x * (1 + between(rng, -0.012, 0.012)); out[cur][p] = { avg: cur === "EUR" ? 1 : (open + x) / 2, close: x }; } } return out; }

  function createWorld(opt) {
    opt = opt || {}; const seed = opt.seed || SEED; const rng = mulberry32(seed ^ hashStr("pe-command-center")); const scale = opt.scale || 1;
    const fx = genFx(rng);
    const orgs = [{ id: "ngep", name: "Nexora Global Equity Partners", currency: "EUR", demo: true }, { id: "rtc", name: "Rheintal Capital (zweiter Demo-Investor)", currency: "EUR", demo: true }];
    const funds = NGEP_FUNDS.map(f => ({ id: f.id, orgId: "ngep", name: f.name, vintage: f.vintage, size: f.size, commitments: f.size, fees: { mgmtPct: 0.02, carryPct: 0.2, hurdlePct: 0.08 } }))
      .concat([{ id: "R1", orgId: "rtc", name: "Rheintal Mittelstand I", vintage: "2020-05-01", size: 250e6, commitments: 250e6, fees: { mgmtPct: 0.02, carryPct: 0.2, hurdlePct: 0.08 } }]);
    const portfolios = funds.map(f => ({ id: f.id + "-P", fundId: f.id, orgId: f.orgId, name: "Kernportfolio " + f.name.split(" – ")[0] }));
    const companies = []; let idx = 0; const mult = opt.multiplier || 1;
    for (let k = 0; k < mult; k++) for (const f of NGEP_FUNDS) for (let j = 0; j < f.n; j++) { const c = genCompany(rng, idx % 25, f, "ngep", scale); if (k) { c.id += "-x" + k; c.name += " " + (k + 1); } companies.push(c); idx++; }
    const rtcFund = { id: "R1", years: [2020, 2022], n: 2, sectors: ["Industrie", "Handel"] };
    for (let j = 0; j < 2; j++) { const c = genCompany(rng, 30 + j, rtcFund, "rtc", 0.4); c.name = ["Rheinauen Metallbau", "Kaiserstuhl Handelshaus"][j]; c.status = "Halten"; c.onboarding = "Aktiv"; companies.push(c); }
    // Umsatz auf rund 3,2 Mrd. € (NGEP, 25 Unternehmen) normieren – vor der Erzeugung der Monatswerte
    const ngep = companies.filter(c => c.orgId === "ngep"); const target = 3.08e9 * mult; const f0 = target / sum(ngep.map(c => c.size)); for (const c of ngep) c.size *= f0;
    const data = {}; for (const c of companies) { const g = genMonthly(mulberry32(hashStr(c.id) ^ seed), c); data[c.id] = g.months; c.debtInfo = g.debt; }
    const W = { version: VERSION, seed, valuationDate: VALUATION_DATE, periods: PERIODS.slice(), orgs, funds, portfolios, companies, data, fx, note: DEMO_NOTE };
    for (const c of companies) c.investment = genInvestment(mulberry32(hashStr(c.id + "inv") ^ seed), W, c);
    W.principals = demoPrincipals(W);
    return W;
  }

  /* ---------- Harmonisierung: lokale Konten → Konzernkategorien, Umrechnung in EUR ---------- */
  const catOfAccount = fam => { const m = {}; for (const [cat, list] of Object.entries(COA_FAMILY[fam])) for (const [no] of list) m[no] = cat; return m; };
  const CAT_CACHE = {};
  function harmonizedMonth(W, c, i) {
    const m = W.data[c.id][i]; const map = CAT_CACHE[c.erpFamily] || (CAT_CACHE[c.erpFamily] = catOfAccount(c.erpFamily)); const out = {}; for (const k of Object.keys(GROUP_COA)) out[k] = 0;
    for (const [no, v] of Object.entries(m.accounts)) out[map[no]] += v; return out;
  }
  const rateOf = (W, cur, p) => W.fx[cur][p];
  /* Flüsse zum Monatsdurchschnittskurs, Bestände zum Stichtagskurs (Monatsende) */
  function eurMonth(W, c, i) { const h = harmonizedMonth(W, c, i); const p = W.periods[i]; const r = rateOf(W, c.currency, p); const o = {};
    for (const [k, [, kind]] of Object.entries(GROUP_COA)) o[k] = h[k] / (kind === "Bilanz" ? r.close : r.avg); return o; }

  /* ---------- Zeiträume ---------- */
  const PERIOD_SETS = { LTM: { label: "LTM Nov 2025 – Okt 2026", from: "2025-11", to: "2026-10" }, "FY2026YTD": { label: "GJ 2026 bis Oktober", from: "2026-01", to: "2026-10" }, FY2025: { label: "GJ 2025", from: "2025-01", to: "2025-12" }, FY2024: { label: "GJ 2024", from: "2024-01", to: "2024-12" } };
  function rangeIdx(W, key) { const s = PERIOD_SETS[key] || PERIOD_SETS.LTM; const a = W.periods.indexOf(s.from), b = W.periods.indexOf(s.to); return { a, b, label: s.label, key: PERIOD_SETS[key] ? key : "LTM" }; }
  function priorRange(W, r) { const a = r.a - 12, b = r.b - 12; return a >= 0 ? { a, b } : null; }

  /* ---------- Kennzahlen eines Unternehmens (EUR) – deterministisch, mit Formel in KPI_DEFS ---------- */
  function flowsSum(W, c, a, b) { const o = { REV: 0, COGS: 0, OPEX_PERS: 0, OPEX_OTHER: 0, DA: 0, INT: 0, TAX: 0, CAPEX: 0, DIV: 0, EQIN: 0, dNWC: 0 };
    for (let i = a; i <= b; i++) { const e = eurMonth(W, c, i); for (const k of Object.keys(o)) if (k !== "dNWC") o[k] += e[k];
      if (i > 0) { const h1 = harmonizedMonth(W, c, i), h0 = harmonizedMonth(W, c, i - 1); const r = rateOf(W, c.currency, W.periods[i]).avg; o.dNWC += ((h1.AR + h1.INV - h1.AP) - (h0.AR + h0.INV - h0.AP)) / r; } }
    return o; }
  function companyKpis(W, c, key) {
    const r = rangeIdx(W, key); const f = flowsSum(W, c, r.a, r.b); const end = eurMonth(W, c, r.b); const pr = priorRange(W, r); const fp = pr ? flowsSum(W, c, pr.a, pr.b) : null;
    const ltm = flowsSum(W, c, W.periods.length - 12, W.periods.length - 1); const ltmEbitda = ltm.REV - ltm.COGS - ltm.OPEX_PERS - ltm.OPEX_OTHER;
    const ebitda = f.REV - f.COGS - f.OPEX_PERS - f.OPEX_OTHER; const gp = f.REV - f.COGS; const ebit = ebitda - f.DA; const ni = ebit - f.INT - f.TAX;
    const ocf = ebitda - f.TAX - f.dNWC; const fcf = ocf - f.CAPEX; const wc = end.AR + end.INV - end.AP; const netDebt = end.DEBT - end.CASH;
    const ebitdaP = fp ? fp.REV - fp.COGS - fp.OPEX_PERS - fp.OPEX_OTHER : null;
    const l6 = flowsSum(W, c, W.periods.length - 6, W.periods.length - 1); const fcf6 = (l6.REV - l6.COGS - l6.OPEX_PERS - l6.OPEX_OTHER - l6.TAX - l6.dNWC - l6.CAPEX - l6.INT) / 6;
    const runway = fcf6 < 0 ? eurMonth(W, c, W.periods.length - 1).CASH / -fcf6 : null;
    const leverage = ltmEbitda > 0 ? netDebt / ltmEbitda : null; const cov = c.debtInfo.covenantMaxLeverage; const ltmInt = ltm.INT;
    const mult = SECTOR_MULT[c.industry]; const ev = Math.max(0, ltmEbitda) * mult; const equity = ev - (eurMonth(W, c, W.periods.length - 1).DEBT - eurMonth(W, c, W.periods.length - 1).CASH);
    const k = { period: r.label, periodKey: r.key, revenue: f.REV, ebitda, margin: f.REV ? ebitda / f.REV : null, revenueGrowth: fp && fp.REV ? f.REV / fp.REV - 1 : null, ebitdaGrowth: fp && ebitdaP > 0 ? ebitda / ebitdaP - 1 : null,
      grossProfit: gp, ebit, netIncome: ni, cash: end.CASH, ocf, capex: f.CAPEX, fcf, cashConversion: ebitda > 0 ? fcf / ebitda : null, workingCapital: wc, runwayMonths: runway,
      grossDebt: end.DEBT, netDebt, leverage, interestCoverage: ltmInt > 0 ? ltmEbitda / ltmInt : null, maturity: c.debtInfo.maturity, covenantMax: cov, covenantHeadroom: leverage != null ? (cov - leverage) / cov : null,
      ltmEbitda, ev, equityValue: equity, multiple: mult, marginPrior: fp && fp.REV ? ebitdaP / fp.REV : null };
    k.health = healthScore(k); k.risks = riskFlags(k); return k;
  }
  function healthScore(k) { let s = 100; if (k.leverage != null) s -= Math.max(0, k.leverage - 3) * 12; else if (k.netDebt > 0) s -= 30; if (k.runwayMonths != null && k.runwayMonths < 6) s -= 25; if (k.margin != null && k.marginPrior != null && k.margin - k.marginPrior < -0.03) s -= 15; if (k.revenueGrowth != null && k.revenueGrowth < 0) s -= 10; if (k.covenantHeadroom != null && k.covenantHeadroom < 0.15) s -= 10; if (k.cashConversion != null && k.cashConversion < 0.3) s -= 8; return Math.max(0, Math.min(100, Math.round(s))); }
  const HEALTH_FORMULA = "100 − 12 × max(0, Net Debt/EBITDA − 3) (bzw. − 30 bei EBITDA ≤ 0 und Nettoverschuldung) − 25 (Reichweite < 6 Monate) − 15 (Margenrückgang > 3 Pp.) − 10 (Umsatzrückgang) − 10 (Covenant-Spielraum < 15 %) − 8 (Cash Conversion < 30 %), begrenzt auf 0–100";
  function riskFlags(k) { const out = [];
    const lvl = (v, warn, crit, lowBad) => v == null ? "na" : (lowBad ? (v < crit ? "crit" : v < warn ? "warn" : "ok") : (v > crit ? "crit" : v > warn ? "warn" : "ok"));
    out.push({ dim: "Liquidität", level: k.runwayMonths == null ? "ok" : k.runwayMonths < 6 ? "crit" : k.runwayMonths < 12 ? "warn" : "ok", value: k.runwayMonths, text: k.runwayMonths == null ? "kein Mittelabfluss (FCF ≥ 0)" : `Reichweite ${k.runwayMonths.toFixed(1)} Monate` });
    out.push({ dim: "Verschuldung", level: k.leverage == null ? (k.netDebt > 0 ? "crit" : "ok") : lvl(k.leverage, 3.5, 4.5), value: k.leverage, text: k.leverage == null ? (k.netDebt > 0 ? "EBITDA LTM ≤ 0 bei Nettoverschuldung" : "keine Nettoverschuldung") : `Net Debt/EBITDA ${k.leverage.toFixed(1)}x` });
    out.push({ dim: "Covenant", level: k.covenantHeadroom == null ? (k.netDebt > 0 ? "crit" : "ok") : lvl(k.covenantHeadroom, 0.25, 0.1, true), value: k.covenantHeadroom, text: k.covenantHeadroom == null ? (k.netDebt > 0 ? "Covenant nicht erfüllbar (EBITDA ≤ 0)" : "–") : `Spielraum ${(k.covenantHeadroom * 100).toFixed(0)} %` });
    out.push({ dim: "Marge", level: k.margin == null || k.marginPrior == null ? "na" : k.margin - k.marginPrior < -0.03 ? "crit" : k.margin - k.marginPrior < -0.01 ? "warn" : "ok", value: k.margin, text: k.marginPrior == null ? "Vorjahr fehlt" : `${(k.margin * 100).toFixed(1)} % (Vorjahr ${(k.marginPrior * 100).toFixed(1)} %)` });
    out.push({ dim: "Wachstum", level: lvl(k.revenueGrowth, 0.02, -0.02, true), value: k.revenueGrowth, text: k.revenueGrowth == null ? "Vorjahr fehlt" : `Umsatz ${(k.revenueGrowth * 100).toFixed(1)} % zum Vorjahr` });
    out.push({ dim: "Working Capital", level: k.revenue ? (k.workingCapital / k.revenue * (12 / ((PERIOD_SETS[k.periodKey] ? monthsIn(k.periodKey) : 12))) > 0.35 ? "crit" : k.workingCapital / k.revenue * (12 / monthsIn(k.periodKey)) > 0.25 ? "warn" : "ok") : "na", value: k.workingCapital, text: k.revenue ? `NWC ${((k.workingCapital / (k.revenue * 12 / monthsIn(k.periodKey))) * 100).toFixed(0)} % vom Jahresumsatz` : "–" });
    return out; }
  const monthsIn = key => { const s = PERIOD_SETS[key] || PERIOD_SETS.LTM; const [y1, m1] = s.from.split("-").map(Number), [y2, m2] = s.to.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1) + 1; };

  const KPI_DEFS = {
    revenue: { label: "Umsatz", unit: "eur", level: "Unternehmen / Management-Aggregation", formula: "Σ Konzernkategorie REV der Monate im Zeitraum, je Monat zum Durchschnittskurs in EUR" },
    ebitda: { label: "EBITDA", unit: "eur", level: "Unternehmen / Management-Aggregation", formula: "REV − COGS − OPEX_PERS − OPEX_OTHER (lokaler Standard, ohne GAAP-Anpassungen)" },
    margin: { label: "EBITDA-Marge", unit: "pct", level: "Unternehmen / Aggregation", formula: "EBITDA / Umsatz; Portfolio: Σ EBITDA / Σ Umsatz (nicht Durchschnitt der Margen)" },
    revenueGrowth: { label: "Umsatzwachstum", unit: "pct", level: "Unternehmen / Aggregation", formula: "Umsatz Zeitraum / Umsatz gleicher Zeitraum Vorjahr − 1; Datenlücke, wenn das Vorjahr nicht vollständig vorliegt" },
    ebitdaGrowth: { label: "EBITDA-Wachstum", unit: "pct", level: "Unternehmen / Aggregation", formula: "EBITDA Zeitraum / EBITDA Vorjahreszeitraum − 1 (nur bei positivem Vorjahres-EBITDA)" },
    grossProfit: { label: "Rohertrag", unit: "eur", level: "Unternehmen / Aggregation", formula: "REV − COGS" },
    ebit: { label: "Operatives Ergebnis (EBIT)", unit: "eur", level: "Unternehmen / Aggregation", formula: "EBITDA − DA" },
    netIncome: { label: "Jahresergebnis", unit: "eur", level: "Unternehmen / Aggregation", formula: "EBIT − INT − TAX" },
    cash: { label: "Liquide Mittel", unit: "eur", level: "Unternehmen / Aggregation", formula: "CASH am Periodenende zum Stichtagskurs" },
    ocf: { label: "Operativer Cashflow", unit: "eur", level: "Unternehmen / Aggregation", formula: "EBITDA − TAX − ΔNWC (NWC = AR + INV − AP), vor Zinsen" },
    fcf: { label: "Free Cashflow", unit: "eur", level: "Unternehmen / Aggregation", formula: "Operativer Cashflow − CAPEX" },
    cashConversion: { label: "Cash Conversion", unit: "pct", level: "Unternehmen / Aggregation", formula: "FCF / EBITDA" },
    workingCapital: { label: "Working Capital", unit: "eur", level: "Unternehmen / Aggregation", formula: "AR + INV − AP am Periodenende, Stichtagskurs" },
    runwayMonths: { label: "Cash Runway", unit: "months", level: "Unternehmen", formula: "Liquide Mittel / durchschnittlicher monatlicher Mittelabfluss der letzten 6 Monate (FCF nach Zinsen); nur bei Mittelabfluss" },
    grossDebt: { label: "Bruttoverschuldung", unit: "eur", level: "Unternehmen / Aggregation", formula: "DEBT am Periodenende" },
    netDebt: { label: "Nettoverschuldung", unit: "eur", level: "Unternehmen / Aggregation", formula: "DEBT − CASH am Periodenende" },
    leverage: { label: "Net Debt / EBITDA", unit: "x", level: "Unternehmen / Aggregation", formula: "Nettoverschuldung / EBITDA LTM" },
    interestCoverage: { label: "Zinsdeckung", unit: "x", level: "Unternehmen", formula: "EBITDA LTM / Zinsaufwand LTM" },
    covenantHeadroom: { label: "Covenant-Spielraum", unit: "pct", level: "Unternehmen", formula: "(Covenant max. Leverage − Net Debt/EBITDA) / Covenant max. Leverage" },
    ev: { label: "Enterprise Value", unit: "eur", level: "Unternehmen", formula: "EBITDA LTM × Branchenmultiplikator (Bewertungsannahme, Beispielwert)" },
    equityValue: { label: "Eigenkapitalwert", unit: "eur", level: "Unternehmen", formula: "Enterprise Value − Nettoverschuldung (Bewertungsstichtag)" },
    health: { label: "Financial Health Score", unit: "score", level: "Unternehmen", formula: HEALTH_FORMULA },
    invested: { label: "Investiertes Kapital", unit: "eur", level: "Investment / Fonds", formula: "Σ Investments und Follow-ons des Fonds (datiert)" },
    moic: { label: "MOIC (brutto)", unit: "x", level: "Investment / Fonds", formula: "(realisierte Ausschüttungen + anteiliger Eigenkapitalwert) / investiertes Kapital" },
    grossIrr: { label: "Gross IRR", unit: "pct", level: "Investment / Fonds", formula: "XIRR (ACT/365) über Investments (−), Ausschüttungen (+) und anteiligen Eigenkapitalwert zum Bewertungsstichtag (+)" },
    netIrr: { label: "Net IRR", unit: "pct", level: "nur Fonds (LP-Sicht)", formula: "XIRR der LP-Cashflows: Kapitalabrufe (Investments + Management Fee) und Ausschüttungen nach Carry, NAV nach aufgelaufenem Carry" },
    dpi: { label: "DPI", unit: "x", level: "nur Fonds", formula: "Ausschüttungen an LPs / eingezahltes Kapital (Paid-in)" },
    rvpi: { label: "RVPI", unit: "x", level: "nur Fonds", formula: "NAV (netto) / eingezahltes Kapital" },
    tvpi: { label: "TVPI", unit: "x", level: "nur Fonds", formula: "DPI + RVPI" }
  };
  const SOURCE = c => `${c.erp} (${ERP[c.erp].method}) → Harmonisierung (Kontenplan ${c.erpFamily.toUpperCase()} → Konzernkontenplan, ${c.currency} → EUR) · ${DEMO_NOTE}`;

  /* ---------- Investments: datierte Cashflows des Fonds ---------- */
  function genInvestment(rng, W, c) {
    const k = companyKpis(W, c, "LTM"); const yrs = Math.max(0.2, daysBetween(c.acquired, VALUATION_DATE) / 365);
    const entryEbitda = Math.max(k.ltmEbitda, c.size * 0.05) / Math.pow(1 + Math.max(-0.05, c.growth) + 0.02, yrs) * (c.scenario === "margin" ? 1.45 : c.scenario === "liquidity" ? 2.8 : 1);
    const entryMult = SECTOR_MULT[c.industry] * between(rng, 0.92, 1.06); const entryEV = entryEbitda * entryMult; const entryNetDebt = entryEbitda * c.debtInfo.initialLeverage;
    const entryEquity = entryEV - entryNetDebt; const invest = entryEquity * c.ownership;
    const flows = [{ date: c.acquired, amount: -invest, type: "Investment" }];
    const fx = W.fx[c.currency]; const coaDiv = COA_FAMILY[c.erpFamily].DIV[0][0], coaEq = COA_FAMILY[c.erpFamily].EQIN[0][0];
    W.data[c.id].forEach(m => { const r = fx[m.period].close; if (m.accounts[coaDiv] > 0 && monthEnd(m.period) > c.acquired) flows.push({ date: monthEnd(m.period), amount: r2(m.accounts[coaDiv] / r * c.ownership), type: "Ausschüttung" }); if (m.accounts[coaEq] > 0) flows.push({ date: monthEnd(m.period), amount: -r2(m.accounts[coaEq] / r * c.ownership), type: "Follow-on" }); });
    if (c.id === "PC13") flows.push({ date: "2025-06-30", amount: r2(invest * 0.45), type: "Teilverkauf (Rekapitalisierung)" });
    return { acquiredEV: entryEV, acquiredNetDebt: entryNetDebt, acquiredEquity: entryEquity, entryMultiple: entryMult, invested: invest, flows, financing: `Senior Term Loan, Zins ${(c.debtInfo.rate * 100).toFixed(1)} %, Fälligkeit ${c.debtInfo.maturity}`, exitAssumption: { year: 2029, multiple: SECTOR_MULT[c.industry] } };
  }
  function dealMetrics(W, c) {
    const k = companyKpis(W, c, "LTM"); const inv = c.investment; const nav = Math.max(0, k.equityValue) * c.ownership;
    const invested = -sum(inv.flows.filter(f => f.amount < 0).map(f => f.amount)); const realized = sum(inv.flows.filter(f => f.amount > 0).map(f => f.amount));
    const irr = xirr(inv.flows.concat([{ date: VALUATION_DATE, amount: nav, type: "Restwert" }]));
    return { invested, realized, unrealized: nav, moic: invested ? (realized + nav) / invested : null, grossIrr: irr, ev: k.ev, equityValue: k.equityValue, ownership: c.ownership };
  }
  function fundCalc(W, fund) {
    const cs = W.companies.filter(c => c.fundId === fund.id && !c.noData); const deals = cs.map(c => ({ c, m: dealMetrics(W, c) }));
    const flows = [].concat(...cs.map(c => c.investment.flows)); const nav = sum(deals.map(d => d.m.unrealized));
    // Management Fee: 2 % p. a. auf Zusagen, quartalsweise ab Vintage bis Bewertungsstichtag
    const fees = []; let d = fund.vintage; while (d <= VALUATION_DATE) { fees.push({ date: d, amount: -fund.commitments * fund.fees.mgmtPct / 4, type: "Management Fee" }); const dt = new Date(d + "T00:00:00Z"); dt.setUTCMonth(dt.getUTCMonth() + 3); d = dt.toISOString().slice(0, 10); }
    const calls = flows.filter(f => f.amount < 0).concat(fees); const paidIn = -sum(calls.map(f => f.amount)); const distGross = sum(flows.filter(f => f.amount > 0).map(f => f.amount));
    // vereinfachter European Waterfall: Carry 20 % auf Gewinn, nur wenn der Gesamtwert das mit 8 % p. a. verzinste Paid-in übersteigt; ohne Catch-up
    const hurdleBase = sum(calls.map(f => -f.amount * Math.pow(1 + fund.fees.hurdlePct, daysBetween(f.date, VALUATION_DATE) / 365)));
    const totalGross = distGross + nav; const carry = totalGross > hurdleBase ? fund.fees.carryPct * (totalGross - paidIn) : 0;
    const navNet = Math.max(0, nav - carry); const dist = distGross; // Ausschüttungen bisher < Paid-in → noch kein realisierter Carry
    const lp = calls.concat(flows.filter(f => f.amount > 0)).concat([{ date: VALUATION_DATE, amount: navNet, type: "NAV netto" }]);
    const gross = flows.concat([{ date: VALUATION_DATE, amount: nav, type: "Restwert" }]);
    return { fundId: fund.id, name: fund.name, vintage: fund.vintage, commitments: fund.commitments, companies: cs.length, invested: -sum(flows.filter(f => f.amount < 0).map(f => f.amount)), fees: -sum(fees.map(f => f.amount)), paidIn, distributions: dist, navGross: nav, carryAccrued: carry, nav: navNet,
      dpi: paidIn ? dist / paidIn : null, rvpi: paidIn ? navNet / paidIn : null, tvpi: paidIn ? (dist + navNet) / paidIn : null, moic: (distGross + nav) / (-sum(flows.filter(f => f.amount < 0).map(f => f.amount))), grossIrr: xirr(gross), netIrr: xirr(lp), deals: deals.map(x => Object.assign({ id: x.c.id, name: x.c.name }, x.m)), lpFlows: lp };
  }

  /* ---------- Berechtigung ---------- */
  const ROLES = {
    platform_admin: { label: "Plattform-Betrieb", scope: "none", cap: "kpi", fund: false, admin: true },
    pe_admin: { label: "PE Group Administrator", scope: "org", cap: "transactions", fund: true, admin: true },
    fund_manager: { label: "Fund Manager", scope: "funds", cap: "statements", fund: true },
    operating_partner: { label: "Operating Partner", scope: "companies", cap: "statements", fund: false },
    investment_analyst: { label: "Investment Analyst", scope: "funds", cap: "kpi", fund: true },
    portfolio_cfo: { label: "Portfolio CFO", scope: "own", cap: "transactions", fund: false },
    portfolio_controller: { label: "Portfolio Controller", scope: "own", cap: "transactions", fund: false },
    company_admin: { label: "Company Administrator", scope: "own", cap: "kpi", fund: false, admin: true },
    auditor: { label: "Auditor (nur Lesen)", scope: "funds", cap: "statements", fund: true, readOnly: true }
  };
  const LEVEL = { kpi: 1, statements: 2, transactions: 3 };
  function demoPrincipals(W) {
    const byScen = s => W.companies.find(c => c.scenario === s && c.orgId === "ngep").id;
    return [
      { id: "p0", name: "Plattform-Betrieb (Demo)", role: "platform_admin" },
      { id: "p1", name: "Dr. Katharina Brandt", role: "pe_admin", orgId: "ngep" },
      { id: "p2", name: "Michael Roth", role: "fund_manager", orgId: "ngep", funds: ["F1"] },
      { id: "p3", name: "Sophie Lindner", role: "fund_manager", orgId: "ngep", funds: ["F2"] },
      { id: "p4", name: "Jonas Weber", role: "operating_partner", orgId: "ngep", companies: [byScen("margin"), byScen("wc"), byScen("liquidity")] },
      { id: "p5", name: "Lea Hoffmann", role: "investment_analyst", orgId: "ngep", funds: ["F1", "F2", "F3"] },
      { id: "p6", name: "Thomas Keller", role: "portfolio_cfo", companyId: byScen("margin") },
      { id: "p7", name: "Anja Vogt", role: "portfolio_controller", companyId: byScen("liquidity") },
      { id: "p8", name: "Ben Schuster", role: "company_admin", companyId: byScen("wc") },
      { id: "p9", name: "Prüfgesellschaft (Demo)", role: "auditor", orgId: "ngep", funds: ["F1"] },
      { id: "p10", name: "Max Rheinberger", role: "pe_admin", orgId: "rtc" }
    ].map(p => Object.assign({ label: ROLES[p.role].label }, p));
  }
  /* Darf der Principal das Unternehmen auf dieser Stufe sehen? Organisation, Geltungsbereich, Rollen-Obergrenze, Datenfreigabe (DSA). */
  function access(W, p, c, level) {
    if (!p || !ROLES[p.role] || !c) return false; const R = ROLES[p.role]; const need = LEVEL[level || "kpi"];
    if (R.scope === "none") return false; // Plattform-Betrieb verwaltet Organisationen, sieht aber keine Finanzdaten
    if (R.scope === "own") return p.companyId === c.id && need <= LEVEL[R.cap];
    if (p.orgId !== c.orgId) return false;
    if (R.scope === "funds" && !(p.funds || []).includes(c.fundId)) return false;
    if (R.scope === "companies" && !(p.companies || []).includes(c.id)) return false;
    return need <= Math.min(LEVEL[R.cap], LEVEL[c.dsa.level]);
  }
  const principal = (W, id) => W.principals.find(x => x.id === id) || null;
  function guard(W, p, c, level) { if (!c) fail("NOT_FOUND", "Unternehmen nicht gefunden."); if (!access(W, p, c, level)) fail("FORBIDDEN", `Kein Zugriff auf ${level === "transactions" ? "Buchungen" : level === "statements" ? "Abschlüsse" : "Daten"} dieses Unternehmens für ${p ? p.label : "unbekannt"}.`); return c; }
  const reportingActive = c => c.onboarding === "Aktiv";

  /* ---------- Lesefunktionen (Service-Verträge) – alle mit Principal ---------- */
  function visibleCompanies(W, p, filter) {
    filter = filter || {}; return W.companies.filter(c => access(W, p, c, "kpi")).filter(c => (!filter.fund || c.fundId === filter.fund) && (!filter.country || c.country === filter.country) && (!filter.industry || c.industry === filter.industry) && (!filter.status || c.status === filter.status) && (!filter.company || c.id === filter.company) && (!filter.currency || c.currency === filter.currency));
  }
  function companies(W, p, filter) {
    const key = (filter || {}).period || "LTM";
    return visibleCompanies(W, p, filter).map(c => { if (c.noData) return { id: c.id, name: c.name, fundId: c.fundId, industry: c.industry, country: c.country, currency: c.currency, acquired: c.acquired, ownership: c.ownership, status: c.status, erp: c.erp, model: c.model, integration: c.integration, onboarding: c.onboarding, reporting: false, noData: true, risks: [] };
      const k = companyKpis(W, c, key); return { id: c.id, name: c.name, fundId: c.fundId, industry: c.industry, country: c.country, currency: c.currency, acquired: c.acquired, ownership: c.ownership, status: c.status, erp: c.erp, model: c.model, integration: c.integration, onboarding: c.onboarding, reporting: reportingActive(c), scenario: c.scenario,
      revenue: k.revenue, ebitda: k.ebitda, margin: k.margin, revenueGrowth: k.revenueGrowth, cash: k.cash, netDebt: k.netDebt, leverage: k.leverage, ev: k.ev, health: k.health, risks: k.risks, runwayMonths: k.runwayMonths }; });
  }
  function company(W, p, id, key) {
    const c = guard(W, p, W.companies.find(x => x.id === id), "kpi");
    if (c.noData) return { profile: { id: c.id, name: c.name, industry: c.industry, country: c.country, currency: c.currency, standard: c.standard, erp: c.erp, erpMethod: ERP[c.erp].method, model: c.model, acquired: c.acquired, ownership: c.ownership, status: c.status, integration: c.integration, onboarding: c.onboarding, fund: (W.funds.find(f => f.id === c.fundId) || {}).name, entities: c.entities, units: c.units, costCenters: c.costCenters, dsa: c.dsa.level }, kpis: null, noData: true, gap: "Noch keine Finanzdaten: ERP-Anbindung und Mapping im Onboarding (Phase 5) ausstehend." }; const k = companyKpis(W, c, key || "LTM"); const st = access(W, p, c, "statements"); const tx = access(W, p, c, "transactions") && ERP[c.erp].lineItems;
    const R = ROLES[p.role]; const showInvest = R.fund && p.orgId === c.orgId;
    return { profile: { id: c.id, name: c.name, industry: c.industry, country: c.country, currency: c.currency, standard: c.standard, fyStart: c.fyStart, erp: c.erp, erpMethod: ERP[c.erp].method, lineItems: ERP[c.erp].lineItems, model: c.model, acquired: c.acquired, ownership: c.ownership, status: c.status, integration: c.integration, onboarding: c.onboarding, fund: (W.funds.find(f => f.id === c.fundId) || {}).name, entities: c.entities, units: c.units, costCenters: c.costCenters, dsa: c.dsa.level, scenario: c.scenario },
      kpis: k, source: SOURCE(c), access: { statements: st, transactions: tx, transactionsReason: tx ? null : !ERP[c.erp].lineItems ? `${c.erp}: Quellsystem liefert keine Einzelposten (${ERP[c.erp].method})` : "Datenfreigabe oder Rolle erlaubt keine Buchungen" },
      statements: st ? statements(W, c, key) : null, investment: showInvest ? Object.assign({ entry: { date: c.acquired, ev: c.investment.acquiredEV, equity: c.investment.acquiredEquity, multiple: c.investment.entryMultiple, netDebt: c.investment.acquiredNetDebt }, flows: c.investment.flows, financing: c.investment.financing, exitAssumption: c.investment.exitAssumption }, dealMetrics(W, c)) : null,
      budget: budgetVsActual(W, c), debt: c.debtInfo };
  }
  function statements(W, c, key) { const r = rangeIdx(W, key); const f = flowsSum(W, c, r.a, r.b); const e = eurMonth(W, c, r.b); const b = r.a > 0 ? eurMonth(W, c, r.a - 1) : null;
    return { pl: { REV: f.REV, COGS: f.COGS, OPEX_PERS: f.OPEX_PERS, OPEX_OTHER: f.OPEX_OTHER, EBITDA: f.REV - f.COGS - f.OPEX_PERS - f.OPEX_OTHER, DA: f.DA, INT: f.INT, TAX: f.TAX }, bs: { CASH: e.CASH, AR: e.AR, INV: e.INV, FA: e.FA, AP: e.AP, DEBT: e.DEBT, EQ: e.EQ }, bsOpen: b, cf: { CAPEX: f.CAPEX, DIV: f.DIV, EQIN: f.EQIN, dNWC: f.dNWC }, period: r.label }; }
  /* Plan/Ist GJ 2026: Budget aus Vorjahr × Planwachstum; Forecast = Ist Jan–Okt + Run-Rate Nov–Dez (Ø der letzten 3 Monate) */
  function budgetVsActual(W, c) {
    const rng = mulberry32(hashStr(c.id + "budget")); const planG = c.scenario === "margin" ? 0.09 : c.scenario === "liquidity" ? 0.06 : c.growth + between(rng, 0.0, 0.05);
    const months = []; let ytdA = 0, ytdB = 0, ytdEA = 0, ytdEB = 0; const i25 = W.periods.indexOf("2025-01");
    for (let m = 0; m < 12; m++) { const pi = i25 + 12 + m; const prev = eurMonth(W, c, i25 + m); const prevE = prev.REV - prev.COGS - prev.OPEX_PERS - prev.OPEX_OTHER;
      const bRev = prev.REV * (1 + planG), bE = prevE * (1 + planG) * (c.scenario === "margin" ? 1.06 : 1); let a = null, aE = null;
      if (pi < W.periods.length) { const e = eurMonth(W, c, pi); a = e.REV; aE = e.REV - e.COGS - e.OPEX_PERS - e.OPEX_OTHER; ytdA += a; ytdB += bRev; ytdEA += aE; ytdEB += bE; }
      months.push({ period: "2026-" + String(m + 1).padStart(2, "0"), budgetRevenue: bRev, budgetEbitda: bE, actualRevenue: a, actualEbitda: aE }); }
    const last3 = months.filter(x => x.actualRevenue != null).slice(-3); const rr = sum(last3.map(x => x.actualRevenue)) / 3, rrE = sum(last3.map(x => x.actualEbitda)) / 3;
    for (const x of months) if (x.actualRevenue == null) { x.forecastRevenue = rr; x.forecastEbitda = rrE; } else { x.forecastRevenue = x.actualRevenue; x.forecastEbitda = x.actualEbitda; }
    return { months, ytd: { actualRevenue: ytdA, budgetRevenue: ytdB, actualEbitda: ytdEA, budgetEbitda: ytdEB }, fy: { budgetRevenue: sum(months.map(x => x.budgetRevenue)), forecastRevenue: sum(months.map(x => x.forecastRevenue)), budgetEbitda: sum(months.map(x => x.budgetEbitda)), forecastEbitda: sum(months.map(x => x.forecastEbitda)) }, method: "Budget: GJ 2025 Ist × (1 + Planwachstum); Forecast: Ist Jan–Okt + Ø der letzten drei Monate für Nov–Dez (Run-Rate, keine KI)" };
  }
  /* Management-Aggregation zu 100 % – keine Konsolidierung, keine Anteilsgewichtung */
  function portfolioKpis(W, p, filter) {
    filter = filter || {}; const key = filter.period || "LTM"; const vis = visibleCompanies(W, p, filter); const inRep = vis.filter(c => reportingActive(c) && !c.noData); const excluded = vis.filter(c => !reportingActive(c)).map(c => ({ id: c.id, name: c.name, reason: `Onboarding „${c.onboarding}“ – noch nicht freigegeben für das Portfolio-Reporting` }));
    const ks = inRep.map(c => ({ c, k: companyKpis(W, c, key) })); const S = f => sum(ks.map(x => x.k[f] || 0));
    const rev = S("revenue"), ebitda = S("ebitda"); const growthOk = ks.every(x => x.k.revenueGrowth != null);
    const prevRev = growthOk ? sum(ks.map(x => x.k.revenue / (1 + x.k.revenueGrowth))) : null; const ebitdaGrowthOk = ks.every(x => x.k.ebitdaGrowth != null);
    const prevE = ebitdaGrowthOk ? sum(ks.map(x => x.k.ebitda / (1 + x.k.ebitdaGrowth))) : null; const ltmE = S("ltmEbitda"); const nd = S("netDebt");
    const out = { period: rangeIdx(W, key).label, companies: inRep.length, excluded, basis: "Management-Aggregation zu 100 % der freigegebenen, aktiven Portfoliounternehmen – nicht anteilig, nicht konsolidiert",
      revenue: rev, ebitda, margin: rev ? ebitda / rev : null, revenueGrowth: prevRev ? rev / prevRev - 1 : null, ebitdaGrowth: prevE ? ebitda / prevE - 1 : null, grossProfit: S("grossProfit"), ebit: S("ebit"), netIncome: S("netIncome"),
      cash: S("cash"), ocf: S("ocf"), fcf: S("fcf"), cashConversion: ebitda > 0 ? S("fcf") / ebitda : null, workingCapital: S("workingCapital"), grossDebt: S("grossDebt"), netDebt: nd, leverage: ltmE > 0 ? nd / ltmE : null,
      ev: S("ev"), equityValue: S("equityValue"), atRisk: ks.filter(x => x.k.risks.some(r => r.level === "crit")).length,
      gaps: [].concat(growthOk ? [] : ["Wachstum: Vorjahreszeitraum nicht vollständig (Daten ab Nov 2023)"], ["Liquiditätsprognose: folgt in Phase 3 (Forecast-Engine)"]) };
    return out;
  }
  function series(W, p, ids, metric) {
    const cs = (ids || []).map(id => W.companies.find(c => c.id === id)).filter(c => c && access(W, p, c, "kpi") && reportingActive(c));
    return W.periods.map((per, i) => { let v = 0; for (const c of cs) { const e = eurMonth(W, c, i); v += metric === "ebitda" ? e.REV - e.COGS - e.OPEX_PERS - e.OPEX_OTHER : metric === "fcf" ? (e.REV - e.COGS - e.OPEX_PERS - e.OPEX_OTHER - e.TAX - e.CAPEX - (i ? (harmonizedNwc(W, c, i) - harmonizedNwc(W, c, i - 1)) / rateOf(W, c.currency, per).avg : 0)) : metric === "cash" ? e.CASH : e.REV; } return { period: per, value: v }; });
  }
  const harmonizedNwc = (W, c, i) => { const h = harmonizedMonth(W, c, i); return h.AR + h.INV - h.AP; };
  function fundMetrics(W, p, fundId) {
    const f = W.funds.find(x => x.id === fundId); if (!f) fail("NOT_FOUND", "Fonds nicht gefunden."); const R = ROLES[p.role];
    if (!R || !R.fund || p.orgId !== f.orgId || (R.scope === "funds" && !(p.funds || []).includes(f.id))) fail("FORBIDDEN", `Keine Berechtigung für Fondskennzahlen von ${f.name}.`);
    const m = fundCalc(W, f); if (R.scope === "funds" && ROLES[p.role].cap === "kpi") m.lpFlows = null; return m;
  }
  function funds(W, p) { return W.funds.filter(f => { try { fundMetrics(W, p, f.id); return true; } catch (e) { return false; } }); }
  /* Drill-down: Portfolio → Unternehmen → Gesellschaft → Konto → Buchungen (nur mit Freigabe und Einzelposten im Quellsystem) */
  function drill(W, p, path) {
    const c = guard(W, p, W.companies.find(x => x.id === path.company), "statements"); const i = W.periods.indexOf(path.period || LAST); if (i < 0) fail("NOT_FOUND", "Periode unbekannt.");
    const m = W.data[c.id][i]; const map = catOfAccount(c.erpFamily); const r = rateOf(W, c.currency, W.periods[i]);
    const le = path.entity ? c.entities.find(e => e.id === path.entity) : null; if (path.entity && !le) fail("NOT_FOUND", "Gesellschaft unbekannt.");
    const w = le ? le.weight : 1; const accounts = Object.entries(m.accounts).filter(([no]) => GROUP_COA[map[no]][1] !== "Cashflow").map(([no, v]) => { const cat = map[no]; const name = COA_FAMILY[c.erpFamily][cat].find(x => x[0] === no)[1]; return { no, name, category: cat, categoryName: GROUP_COA[cat][0], local: r2(v * w), eur: r2(v * w / (GROUP_COA[cat][1] === "Bilanz" ? r.close : r.avg)) }; });
    if (!path.account) return { company: c.name, entity: le ? le.name : "alle Gesellschaften", period: W.periods[i], currency: c.currency, accounts, entities: c.entities };
    const a = accounts.find(x => x.no === path.account); if (!a) fail("NOT_FOUND", "Konto unbekannt.");
    if (!ERP[c.erp].lineItems) fail("DATA_GAP", `${c.erp} liefert über ${ERP[c.erp].method} nur Salden, keine Einzelposten.`);
    guard(W, p, c, "transactions");
    if (GROUP_COA[a.category][1] === "Bilanz") fail("DATA_GAP", "Bestandskonten: Drill-down auf Bewegungen folgt mit dem Integration Hub (Phase 4).");
    const rng = mulberry32(hashStr(c.id + a.no + W.periods[i] + (le ? le.id : ""))); const n = 4 + Math.floor(rng() * 7); const wts = Array.from({ length: n }, () => 0.3 + rng()); const ws = sum(wts); let rest = a.local;
    const tx = wts.map((x, j) => { const amt = j === n - 1 ? r2(rest) : r2(a.local * x / ws); rest = r2(rest - amt); return { doc: `${c.id}-${W.periods[i].replace("-", "")}-${String(j + 1).padStart(4, "0")}`, date: `${W.periods[i]}-${String(1 + Math.floor(rng() * 27)).padStart(2, "0")}`, text: a.category === "REV" ? "Ausgangsrechnung Kunde " + (100 + Math.floor(rng() * 800)) : a.category === "COGS" ? "Eingangsrechnung Lieferant " + (500 + Math.floor(rng() * 400)) : a.category === "OPEX_PERS" ? "Lohnlauf / Personalkosten" : "Buchung " + a.name, amount: amt }; });
    return { company: c.name, entity: le ? le.name : "alle Gesellschaften", period: W.periods[i], account: a, transactions: tx, note: "Synthetische Einzelposten, deterministisch erzeugt; Summe = Kontosaldo" };
  }
  /* Regelbasierte Hinweise (keine KI): jede Aussage mit Beleg, Kennzahl, Zeitraum, Quelle, Methode, Empfehlung */
  function insights(W, p, filter) {
    const vis = visibleCompanies(W, p, filter).filter(c => reportingActive(c) && !c.noData); const out = [];
    for (const c of vis) { const k = companyKpis(W, c, "LTM");
      if (k.runwayMonths != null && k.runwayMonths < 6) out.push({ severity: "crit", company: c.name, id: c.id, title: "Liquiditätsengpass absehbar", evidence: `Liquide Mittel ${Math.round(k.cash / 1e6 * 10) / 10} Mio. €, Ø Mittelabfluss der letzten 6 Monate; Reichweite ${k.runwayMonths.toFixed(1)} Monate`, kpis: { runwayMonths: k.runwayMonths, cash: k.cash, leverage: k.leverage }, period: "Mai–Okt 2026", method: KPI_DEFS.runwayMonths.formula, action: "13-Wochen-Liquiditätsplanung anfordern, Kreditlinie und Covenant-Gespräch mit der Bank vorbereiten", confidence: "hoch (Ist-Daten), Prognose linear" });
      if (k.margin != null && k.marginPrior != null && k.margin - k.marginPrior < -0.03) out.push({ severity: "warn", company: c.name, id: c.id, title: "EBITDA-Marge rückläufig", evidence: `EBITDA-Marge ${(k.margin * 100).toFixed(1)} % nach ${(k.marginPrior * 100).toFixed(1)} % im Vorjahreszeitraum; Treiber Materialaufwand`, kpis: { margin: k.margin, marginPrior: k.marginPrior }, period: k.period, method: KPI_DEFS.margin.formula, action: "Preis- und Einkaufsanalyse; Materialkostenquote je Produktgruppe prüfen", confidence: "hoch (Ist-Daten)" });
      if (k.revenue && k.workingCapital / k.revenue > 0.35) out.push({ severity: "warn", company: c.name, id: c.id, title: "Hohes Working Capital", evidence: `NWC ${(k.workingCapital / k.revenue * 100).toFixed(0)} % vom LTM-Umsatz (DSO ${Math.round(c.debtInfo.dso)} Tage, DIO ${Math.round(c.debtInfo.dio)} Tage)`, kpis: { workingCapital: k.workingCapital }, period: k.period, method: KPI_DEFS.workingCapital.formula, action: "Forderungsmanagement und Bestandsreduktion: Potenzial bei Branchen-DSO 45 Tage berechnen", confidence: "mittel (Branchenwert ist Annahme)" });
      if (k.leverage == null && k.netDebt > 0) out.push({ severity: "crit", company: c.name, id: c.id, title: "EBITDA negativ – Covenant nicht erfüllbar", evidence: `EBITDA LTM ${Math.round(k.ltmEbitda / 1e5) / 10} Mio. € bei Nettoverschuldung ${Math.round(k.netDebt / 1e5) / 10} Mio. € (Covenant max. ${k.covenantMax.toFixed(1)}x)`, kpis: { ltmEbitda: k.ltmEbitda, netDebt: k.netDebt }, period: "LTM Nov 2025 – Okt 2026", method: KPI_DEFS.leverage.formula, action: "Waiver-Gespräch mit den Banken vorbereiten, Restrukturierungsoptionen prüfen", confidence: "hoch (Ist-Daten)" });
      if (k.covenantHeadroom != null && k.covenantHeadroom < 0.15) out.push({ severity: "crit", company: c.name, id: c.id, title: "Covenant-Spielraum knapp", evidence: `Net Debt/EBITDA ${k.leverage.toFixed(2)}x bei Covenant ${k.covenantMax.toFixed(2)}x`, kpis: { leverage: k.leverage, covenantHeadroom: k.covenantHeadroom }, period: "Stichtag Okt 2026", method: KPI_DEFS.covenantHeadroom.formula, action: "Covenant-Test-Prognose für das nächste Quartal erstellen", confidence: "hoch (Ist-Daten)" }); }
    return out.sort((a, b) => (a.severity === "crit" ? 0 : 1) - (b.severity === "crit" ? 0 : 1));
  }
  /* ---------- Verwaltung: Organisation, Fonds, Unternehmen anlegen (Befehle mit Rechteprüfung, wiederholbar aus einem Protokoll) ---------- */
  const slug = s => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "").slice(0, 10);
  function apply(W, p, cmd, x) {
    x = x || {}; const R = p && ROLES[p.role]; if (!R) fail("FORBIDDEN", "Unbekannter Principal.");
    const name = String(x.name || "").trim(); if (["createOrg", "addFund", "addCompany"].includes(cmd) && (name.length < 3 || name.length > 60)) fail("INPUT", "Name: 3 bis 60 Zeichen.");
    if (cmd === "createOrg") { if (p.role !== "platform_admin") fail("FORBIDDEN", "Organisationen legt nur der Plattform-Betrieb an.");
      const id = "org-" + slug(name); if (W.orgs.some(o => o.id === id)) fail("EXISTS", "Organisation existiert bereits."); W.orgs.push({ id, name, currency: x.currency || "EUR", demo: true, created: true });
      const adminId = "p-" + id; W.principals.push({ id: adminId, name: String(x.adminName || "Administrator " + name), role: "pe_admin", orgId: id, label: ROLES.pe_admin.label });
      return { text: `Organisation „${name}“ angelegt; Administrator ${adminId}`, id, adminId }; }
    if (!R.admin || R.scope !== "org") fail("FORBIDDEN", "Nur der PE Group Administrator der Organisation darf Fonds und Unternehmen anlegen.");
    if (cmd === "addFund") { const id = p.orgId.toUpperCase().slice(0, 3) + "-F" + (W.funds.filter(f => f.orgId === p.orgId).length + 1); const size = +x.size || 0; if (!(size > 0)) fail("INPUT", "Fondsgröße fehlt.");
      W.funds.push({ id, orgId: p.orgId, name, vintage: x.vintage || VALUATION_DATE, size, commitments: size, fees: { mgmtPct: 0.02, carryPct: 0.2, hurdlePct: 0.08 }, created: true }); W.portfolios.push({ id: id + "-P", fundId: id, orgId: p.orgId, name: "Kernportfolio " + name });
      return { text: `Fonds „${name}“ angelegt`, id }; }
    if (cmd === "addCompany") { const f = W.funds.find(z => z.id === x.fundId); if (!f || f.orgId !== p.orgId) fail("FORBIDDEN", "Fonds gehört nicht zur eigenen Organisation.");
      const own = Math.min(1, Math.max(0.01, +x.ownership || 1)); const id = "NEW-" + slug(name) + "-" + (W.companies.length + 1);
      const c = { id, orgId: p.orgId, fundId: f.id, portfolioId: f.id + "-P", name, industry: x.industry || "Industrie", country: x.country || "Deutschland", currency: x.currency || "EUR", erp: ERP[x.erp] ? x.erp : "Eigenentwicklung", erpFamily: (ERP[x.erp] || ERP.Eigenentwicklung).family, model: x.erp === "NEXORA AI Suite" ? "B" : "A", standard: x.standard || "HGB", fyStart: 1, acquired: x.acquired || VALUATION_DATE, ownership: own,
        status: "Onboarding", onboarding: "Nicht gestartet", integration: "Nicht verbunden", dsa: { level: "kpi" }, entities: [{ id: id + "-LE1", name: "Hauptgesellschaft", weight: 1 }], units: [{ id: id + "-BU1", name: "Kerngeschäft", weight: 1 }], costCenters: [], debtInfo: { rate: 0, maturity: "–", covenantMaxLeverage: 0, dso: 0, dio: 0, dpo: 0 }, noData: true, created: true };
      W.companies.push(c); return { text: `Portfoliounternehmen „${name}“ in ${f.name} angelegt – Onboarding „Nicht gestartet“, noch keine Finanzdaten`, id }; }
    fail("CMD", "Unbekannter Befehl.");
  }
  /* Konsistenzprüfung der Demodaten (für Tests und Anzeige) */
  function checkConsistency(W, c) { const errs = []; for (let i = 0; i < W.periods.length; i++) { const h = harmonizedMonth(W, c, i); const d = h.CASH + h.AR + h.INV + h.FA - h.AP - h.DEBT - h.EQ; if (Math.abs(d) > 1) errs.push(`${W.periods[i]}: Bilanzdifferenz ${d.toFixed(2)}`); } return errs; }

  return { VERSION, SEED, VALUATION_DATE, PERIODS, PERIOD_SETS, DEMO_NOTE, GROUP_COA, COA_FAMILY, ERP, FX_BASE, SECTOR_MULT, KPI_DEFS, HEALTH_FORMULA, ROLES, LEVEL,
    createWorld, apply, xirr, access, principal, companies, company, portfolioKpis, fundMetrics, funds, series, drill, insights, visibleCompanies,
    _internal: { harmonizedMonth, eurMonth, companyKpis, dealMetrics, fundCalc, checkConsistency, flowsSum, statements, budgetVsActual } };
});
