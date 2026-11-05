/* Leistungsmessung des PE-Rechenkerns mit hochskalierten synthetischen Daten. Ausführen: node test/pe.bench.js [Faktor]
   Misst nur den Rechenkern im aktuellen Prozess (kein Server, keine Datenbank). Ergebnisse sind Messwerte dieser Maschine. */
const PE = require("../src/pe.js"); const f = +(process.argv[2] || 100);
const t0 = process.hrtime.bigint(); const W = PE.createWorld({ multiplier: f }); const t1 = process.hrtime.bigint();
const p = PE.principal(W, "p1"); const k = PE.portfolioKpis(W, p, {}); const t2 = process.hrtime.bigint();
const l = PE.companies(W, p, { fund: "F1" }); const t3 = process.hrtime.bigint();
const ms = (a, b) => Number(b - a) / 1e6; const n = W.companies.filter(c => c.orgId === "ngep").length; const months = n * W.periods.length;
console.log(`Unternehmen: ${n} · Monatsdatensätze: ${months} · lokale Kontensalden: ${months * 18}`);
console.log(`Welt erzeugen: ${ms(t0, t1).toFixed(0)} ms · Portfolio-Kennzahlen (alle): ${ms(t1, t2).toFixed(0)} ms · Unternehmensliste Fonds I: ${ms(t2, t3).toFixed(0)} ms`);
console.log(`Ergebnis plausibel: ${k.companies} aktive Unternehmen, Umsatz ${(k.revenue / 1e9).toFixed(1)} Mrd. €`);
