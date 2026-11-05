/* NEXORA AI Suite – Oberfläche. Alle Zahlen kommen aus der Engine (Belege, Nebenbücher), nichts ist fest eingetragen. */
const E = window.NexoraEngine;
const LS_KEY = "nexora-suite-v08", LS_KEY_OLD = "nexora-suite-v03";
const T_NAMES = { elevon: "Elevon Industries", novamart: "NovaMart Retail", aventra: "Aventra Consulting" };
const ON_PAGES = /github\.io$/.test(location.hostname); const PROTO_URL = ON_PAGES ? "prototyp.html" : "https://claude.ai/artifact/6p7imWPiPw1T5V3ABFq2Di";

/* ---------- Zustand: Welt = Seed + Befehlsprotokoll (reproduzierbar) ---------- */
let W, LOG = [], BASE = {};
const S = { tenant: "elevon", users: { elevon: "u1", novamart: "u1", aventra: "u1" }, mode: "free", live: true, last: null, story: null, admin: false, chat: { elevon: [], novamart: [], aventra: [] }, sel: {}, tab: {}, modal: null, toast: null, pending: null, size: "S" };
function saveLog() { try { localStorage.setItem(LS_KEY, JSON.stringify({ size: S.size, log: LOG, tenant: S.tenant, users: S.users, mode: S.mode })); } catch (e) {} }
function boot() {
  let saved = null; try { if (!localStorage.getItem(LS_KEY) && localStorage.getItem(LS_KEY_OLD)) localStorage.setItem(LS_KEY, localStorage.getItem(LS_KEY_OLD)); saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) {}
  if (saved) { S.size = saved.size || "S"; S.tenant = saved.tenant || "elevon"; S.users = saved.users || S.users; S.mode = saved.mode || "free"; }
  W = E.createWorld({ size: S.size }); captureBase();
  if (saved && saved.log) { for (const x of saved.log) { try { applyLog(x); LOG.push(x); } catch (e) { LOG = []; W = E.createWorld({ size: S.size }); break; } } }
}
function logEntry(x) { if (typeof persist === "function" && persist(x)) return; LOG.push(x); saveLog(); }
function modSt(m) { return MODS[m][2]; }
function captureBase() { BASE = {}; const ref = E.createWorld({ size: S.size }); for (const id of E.TENANT_IDS) BASE[id] = E.tenantHash(ref.tenants[id]); }
function applyLog(x) { if (x.reset) E.resetTenant(W, x.reset); else if (x.resetAll) E.resetAll(W); else E.dispatch(W, x.t, x.cmd, x.p, x.ctx); }
const T = () => W.tenants[S.tenant];
const U = () => { const t = T(); return t.users.find(u => u.id === S.users[S.tenant]) || t.users[0]; };
const R = () => T().roles.find(r => r.id === U().role);

/* ---------- Format ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (v, d) => Number(v || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d == null ? 0 : d });
const num = v => Number(v || 0).toLocaleString("de-DE");
const pct = v => Number(v || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 }) + " %";
const dDe = iso => iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "";
const perDe = p => { const m = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]; return m[+p.slice(5, 7) - 1] + " " + p.slice(2, 4); };
const pill = (cls, t) => `<span class="pill ${cls}">${esc(t)}</span>`;
const stPill = s => { const g = ["bezahlt", "abgeschlossen", "erledigt", "fakturiert", "freigegeben", "abgerechnet", "geliefert", "zugestellt", "abgenommen", "produziert"]; const w = ["offen", "zur Freigabe", "erfasst", "in Planung", "bestellt", "eröffnet", "in Fertigung", "rückgemeldet", "reserviert", "kommissioniert", "versandt"]; return pill(g.includes(s) ? "p-good" : w.includes(s) ? "p-warn" : "p-neu", s); };

/* ---------- Aktionen ausführen: Live-Änderungen ermitteln ---------- */
const KPI_DEF = {
  common: [["cash", "Bank", "eur"], ["revenueCur", "Umsatz lfd. Monat", "eur"], ["grossMarginCur", "Rohertrag lfd. Monat", "eur"], ["arOpen", "Offene Forderungen", "eur"], ["apOpen", "Offene Verbindlichkeiten", "eur"], ["inventory", "Bestandswert", "eur"]],
  elevon: [["backlog", "Auftragsbestand", "eur"], ["wip", "Unfertige Erzeugnisse", "eur"], ["openProd", "Offene Fertigungsaufträge", "n"]],
  novamart: [["reserved", "Reservierte Stück", "n"], ["belowRop", "Artikel unter Meldebestand", "n"], ["onlineOrders", "Onlinebestellungen (live)", "n"]],
  aventra: [["unbilled", "Abrechenbar, nicht fakturiert", "eur"], ["overBudget", "Projekte über Budget", "n"]]
};
function snapshot() { const o = {}; for (const id of E.TENANT_IDS) { const t = W.tenants[id]; o[id] = { k: E.kpis(t), inbox: t.inbox.filter(m => m.status === "offen").length, docs: t.docs.length, stockQty: Object.fromEntries(Object.values(t.stock).map(s => [s.mat + "@" + s.wh, [s.qty, s.res]])) }; } return o; }
function act(cmd, payload, opt) {
  opt = opt || {}; const tid = opt.tenant || S.tenant; const t = W.tenants[tid];
  const uid = opt.user || S.users[tid]; const isAcc = !!(t.users.find(x => x.id === uid) || {}).account;
  const ctx = { user: uid, auto: !!opt.auto || (S.mode === "guided" && !isAcc) };
  const before = snapshot(); const r = E.dispatch(W, tid, cmd, payload, ctx);
  if (r.ok && !E.QUERY_ONLY[cmd]) logEntry({ t: tid, cmd, p: payload, ctx: { user: ctx.user, auto: ctx.auto } });
  if (E.QUERY_ONLY[cmd]) return r;
  const after = snapshot();
  const docs = r.ok ? r.docs.map(no => t.docs.find(d => d.no === no)).filter(Boolean) : [];
  const deltas = []; for (const [key, label, f] of KPI_DEF.common.concat(KPI_DEF[tid] || [])) { const a = before[tid].k[key], b = after[tid].k[key]; if (a != null && b != null && Math.abs(b - a) > 0.004) deltas.push({ label, a, b, f }); }
  const stockCh = []; for (const [k, [q, res]] of Object.entries(after[tid].stockQty)) { const [q0, r0] = before[tid].stockQty[k] || [0, 0]; if (q !== q0 || res !== r0) stockCh.push({ k, q0, q, r0, res }); }
  const cross = E.TENANT_IDS.filter(x => x !== tid && after[x].inbox > before[x].inbox).map(x => ({ tenant: x, n: after[x].inbox - before[x].inbox, msg: W.tenants[x].inbox.slice(-1)[0] }));
  S.last = { tenant: tid, cmd, ok: r.ok, text: r.text, user: r.user || "", code: r.code, docs, deltas, stockCh, cross, payload, retry: !r.ok && r.code === "FORBIDDEN" && !isAcc ? { cmd, payload, tenant: tid } : null };
  if (!r.ok) toast(r.text, true);
  render(); return r;
}
function toast(t, err) { S.toast = { t, err }; renderLayer(); clearTimeout(toast._h); toast._h = setTimeout(() => { S.toast = null; renderLayer(); }, 4200); }

/* ---------- Nächste Aktion je Prozessinstanz ---------- */
function nextAction(tid, inst) {
  const t = W.tenants[tid]; const o = inst.object; const act = inst.steps.find(s => s.state === "active");
  if (!act) return null;
  if (tid === "elevon") {
    const so = o, pa = t.prodOrders.find(p => p.so === so.no);
    switch (act.name) {
      case "Bedarfsermittlung": return { label: "Bedarf ermitteln", cmd: "runMRP", p: { soNo: so.no } };
      case "Einkauf": return { label: "Fehlteile bestellen", cmd: "createPOsFromMRP", p: { soNo: so.no } };
      case "Wareneingang": { const po = t.purchaseOrders.find(x => x.so === so.no && x.status === "bestellt"); return po ? { label: "Wareneingang " + po.no, cmd: "postGoodsReceipt", p: { poNo: po.no } } : null; }
      case "Fertigung": if (!pa) return null; return pa.status === "eröffnet" ? { label: "Fertigungsauftrag freigeben", cmd: "releaseProdOrder", p: { prodNo: pa.no } } : pa.status === "freigegeben" ? { label: "Materialverbrauch buchen", cmd: "postConsumption", p: { prodNo: pa.no } } : pa.status === "in Fertigung" ? { label: "Fertigung rückmelden", cmd: "confirmProduction", p: { prodNo: pa.no } } : { label: "Fertigung abschließen", cmd: "completeProduction", p: { prodNo: pa.no } };
      case "Lieferung": return { label: "Warenausgang buchen", cmd: "postGoodsIssue", p: { soNo: so.no } };
      case "Montage": return { label: "Montage erfassen", cmd: "recordInstallation", p: { soNo: so.no } };
      case "Abnahme": return { label: "Abnahme dokumentieren", cmd: "confirmAcceptance", p: { soNo: so.no } };
      case "Rechnung": return { label: "Rechnung erstellen", cmd: "invoiceSalesOrder", p: { soNo: so.no } };
      case "Zahlung": { const inv = t.custInvoices.find(i => i.ref && i.ref.id === so.no); return inv && !inv.link ? { label: "Zahlungseingang buchen", cmd: "receivePayment", p: { invoiceNo: inv.no } } : null; }
    }
  }
  if (tid === "novamart") { const m = { "Kommissionierung": ["Kommissionieren", "pickOrder"], "Versand": ["Versenden", "shipOrder"], "Zustellung": ["Zustellung bestätigen", "confirmDelivery"], "Rechnung": ["Rechnung erstellen", "invoiceWebOrder"], "Zahlungsabgleich": ["Zahlung abgleichen", "settlePSP"] }[act.name]; return m ? { label: m[0], cmd: m[1], p: { orderNo: o.no || inst.id } } : null; }
  if (tid === "aventra") {
    if (act.name === "Zeiten freigegeben") return { label: "Zeiten freigeben", cmd: "approveTime", p: { projectId: inst.id } };
    if (act.name === "Abrechnung") return { label: "Rechnung erstellen", cmd: "invoiceProject", p: { projectId: inst.id } };
    if (act.name === "Zahlung") { const inv = t.custInvoices.filter(i => i.ref && i.ref.id === inst.id && i.status === "offen").slice(-1)[0]; return inv && !inv.link ? { label: "Zahlungseingang buchen", cmd: "receivePayment", p: { invoiceNo: inv.no } } : null; }
  }
  return null;
}

/* ---------- Navigation je Mandant und Rolle ---------- */
const MODS = {
  home: ["Home", "start", "live"], workspace: ["My Workspace", "proj", "live"], processes: ["Business Processes", "proc", "live"], inbox: ["Posteingang", "bell", "live"],
  sales: ["Sales", "bars", "live"], production: ["Manufacturing", "cube", "live"], supply: ["Supply Chain", "db", "live"], projects: ["Projects & Services", "layers", "live"],
  finance: ["Finance", "an", "live"], analytics: ["Analytics", "pie", "live"], ai: ["AI Assistant", "ai", "live"],
  hr: ["Human Resources", "checkc", "plan"], assets: ["Asset Management", "set", "plan"], migrations: ["Migrations", "mig", "proto"], transformation: ["Transformation", "flag", "proto"], admin: ["Demo Control Center", "shield", "live"]
};
const TENANT_MODS = { elevon: ["sales", "production", "supply"], novamart: ["sales", "supply"], aventra: ["projects"] };
const ROLE_MODS = { ceo: "all", cfo: "all", sales: ["sales", "processes"], prod: ["production", "supply", "processes"], buy: ["supply", "finance", "processes"], wh: ["supply", "sales", "processes"], service: ["sales", "processes"], pm: ["projects", "processes", "finance"], consultant: ["projects"] };
function visibleMods() {
  const base = ["home", "processes", "inbox"].concat(TENANT_MODS[S.tenant], ["finance", "analytics", "ai"]);
  const allowed = ROLE_MODS[U().role]; let mods = allowed === "all" ? base : base.filter(m => ["home", "ai", "inbox"].includes(m) || allowed.includes(m));
  return mods.concat(["hr", "assets", "migrations", "transformation", "admin"]);
}
const ROUTES = Object.keys(MODS);
const route = () => { const h = location.hash.slice(1); return ROUTES.includes(h) ? h : "home"; };
const go = r => { if (location.hash.slice(1) === r) render(); else location.hash = r; };

/* ---------- Rendering ---------- */
function render() {
  const rt = route(); const t = T(); const u = U(); const inb = t.inbox.filter(m => m.status === "offen").length;
  const mods = visibleMods();
  const navA = m => { const [lab, icn] = MODS[m]; const st = modSt(m); return `<a href="#${m}" class="${rt === m ? "on" : ""} ${st !== "live" ? "dim" : ""}" ${rt === m ? 'aria-current="page"' : ""}>${ic(icn, 19)}<span>${lab}</span>${m === "inbox" && inb ? `<span class="cnt">${inb}</span>` : m === "tasks" && typeof taskCount === "function" && taskCount() ? `<span class="cnt">${taskCount()}</span>` : st === "plan" ? '<span class="badge b-plan">Geplant</span>' : st === "proto" ? '<span class="badge b-proto">Prototyp</span>' : ""}</a>`; };
  const live = S.live && rt !== "admin";
  document.getElementById("root").innerHTML = `<div class="app ${live ? "live" : ""}">
   <nav class="side nav" aria-label="Hauptnavigation">
    <a class="brand" href="#home" aria-label="NEXORA AI">${LOGO(32)}<span><b>NEXORA AI</b><small>Enterprise Suite · Demo</small></span></a>
    ${mods.filter(m => modSt(m) === "live" && m !== "admin").map(navA).join("")}
    <div class="nav-sep"></div><div class="nav-label">Weitere Module</div>
    ${mods.filter(m => modSt(m) !== "live" && m !== "admin").map(navA).join("")}
    <a href="${ON_PAGES ? "truescale.html" : "https://marcelwagner-afk.github.io/nexora-suite/truescale.html"}" target="${ON_PAGES ? "_self" : "_blank"}" rel="noopener">${ic("an", 19)}<span>Business Case · TRUESCALE</span></a>
    <div class="nav-sep"></div>${navA("admin")}
    <button class="tenant" data-act="goAdmin"><span class="av">${ic("building", 18)}</span><span style="flex:1;min-width:0"><b style="font-weight:600">${esc(T_NAMES[S.tenant])}</b><small>${esc(t.companies.length)} Gesellschaften · Größe ${S.size}</small></span></button>
   </nav>
   <div class="main">
    <header class="top2">
     <div class="tenant-sw" role="group" aria-label="Demo-Unternehmen">${E.TENANT_IDS.map(id => `<button class="${S.tenant === id ? "on" : ""}" data-act="tenant" data-id="${id}" aria-pressed="${S.tenant === id}"><span class="dotc c-${id}"></span><span class="nm">${T_NAMES[id].split(" ")[0]}</span>${W.tenants[id].inbox.filter(m => m.status === "offen").length ? `<span class="cnt" style="font-size:10.5px;background:var(--accent);color:#fff;border-radius:8px;padding:0 6px">${W.tenants[id].inbox.filter(m => m.status === "offen").length}</span>` : ""}</button>`).join("")}</div>
     <button class="search" data-act="palette">${ic("ai", 17)}<span>Was möchtest du heute erreichen?</span><kbd>⌘ K</kbd></button>
     <span class="sp"></span>
     ${typeof topExtras === "function" ? topExtras() : ""}<span class="datechip" title="Simuliertes Geschäftsdatum">${ic("cal", 15)}${dDe(t.date)}</span>
     <button class="modechip ${S.mode === "guided" ? "p-acc" : "p-neu"}" style="border:none;cursor:pointer" data-act="toggleMode" title="Guided Demo / Free Exploration">${S.mode === "guided" ? "Guided Demo" : "Free Exploration"}</button>
     <button class="round" data-act="toggleLive" title="Live-Ansicht ein/aus" aria-label="Live-Ansicht ein- oder ausblenden">${ic("bars", 19)}</button>
     <button class="avatar" data-act="userMenu" aria-label="Rolle wechseln: ${esc(u.name)}"><span class="face u${t.users.indexOf(u) % 3}">${esc(u.name.split(" ").map(x => x[0]).join("").slice(0, 2))}</span><span class="small" style="text-align:left;line-height:1.2"><b>${esc(u.name)}</b><br><span class="muted">${esc(R().name)}</span></span>${ic("chev", 15)}</button>
    </header>
    <main class="page" id="page">${S.story ? storyPanel() : ""}<div class="inline-live" style="flex-direction:column;gap:12px">${S.last ? liveCard(true) : ""}</div>${(VIEWS[rt] || VIEWS.home)()}</main>
   </div>
   ${live ? `<aside class="livecol" aria-label="Live-Änderungen"><div class="lh"><h3>${ic("bars", 17)} Live-Änderungen</h3><button class="icon-btn" data-act="toggleLive" aria-label="Schließen">${ic("x", 15)}</button></div><div class="lb">${S.last ? liveCard(false) : `<p class="muted small">Sobald du eine Aktion ausführst, siehst du hier, welche Belege entstehen und wie sich Bestände, Kosten, Umsatz und Kennzahlen verändern – zum fachlich richtigen Zeitpunkt.</p>`}${liveKpis()}</div></aside>` : ""}
  </div>`;
  const f = document.getElementById(S.focus || "_"); if (f) { f.focus(); S.focus = null; }
}
function liveKpis() { const k = E.kpis(T()); return `<div><p class="eyebrow" style="margin-bottom:6px">${esc(T_NAMES[S.tenant])} · jetzt</p><div class="delta">${KPI_DEF.common.concat(KPI_DEF[S.tenant]).map(([key, lab, f]) => `<span>${lab}</span><span></span><span class="num">${f === "eur" ? eur(k[key]) : num(k[key])}</span>`).join("")}</div><p class="small faint" style="margin-top:6px">Alle Werte aus Belegen und Nebenbüchern berechnet.</p></div>`; }
function liveCard(inline) {
  const L = S.last; const fmt = (f, v) => f === "eur" ? eur(v) : num(v);
  return `<section class="${inline ? "card card-pad" : ""}" style="display:flex;flex-direction:column;gap:12px">
   <div class="result ${L.ok ? "ok" : "err"}">${L.ok ? "✓" : "✗"} ${esc(L.text)}${L.user ? `<div class="small muted" style="font-weight:500;margin-top:2px">${esc(T_NAMES[L.tenant])} · ausgeführt als ${esc(L.user)}</div>` : ""}</div>
   ${L.retry ? `<button class="btn sm" data-act="retryAuto">Mit berechtigter Rolle ausführen</button>` : ""}
   ${L.ok && !L.docs.length ? `<p class="small muted">Keine Finanzbuchung – fachlich korrekt für diesen Schritt.</p>` : ""}
   ${L.docs.map(d => `<div class="docbox"><div class="dh"><span>${esc(d.no)} · ${esc(d.text)}</span><span class="num">${dDe(d.date)}</span></div><table><tbody>${d.lines.map(l => `<tr><td class="num">${l.acct}</td><td style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(E.COA[l.acct][0])}">${esc(E.COA[l.acct][0])}</td><td class="r num" style="white-space:nowrap">${l.dr ? eur(l.dr, 2) : ""}</td><td class="r num" style="white-space:nowrap">${l.cr ? eur(l.cr, 2) : ""}</td></tr>`).join("")}</tbody></table></div>`).join("")}
   ${L.stockCh.length ? `<div><p class="eyebrow" style="margin-bottom:4px">Bestand</p><div class="delta">${L.stockCh.slice(0, 8).map(s => `<span>${esc(matName(L.tenant, s.k.split("@")[0]))}</span><span class="num faint">${s.q0}${s.r0 ? " (res. " + s.r0 + ")" : ""}</span><span class="num">→ ${s.q}${s.res ? " (res. " + s.res + ")" : ""}</span>`).join("")}</div></div>` : ""}
   ${L.deltas.length ? `<div><p class="eyebrow" style="margin-bottom:4px">Kennzahlen</p><div class="delta">${L.deltas.map(d => `<span>${d.label}</span><span class="num faint">${fmt(d.f, d.a)}</span><span class="num ${d.b > d.a ? "up" : "down"}">→ ${fmt(d.f, d.b)}</span>`).join("")}</div></div>` : ""}
   ${L.cross.map(c => `<div class="msgx"><b>Unternehmensübergreifend:</b> neuer Eingang bei ${esc(T_NAMES[c.tenant])} – ${esc(c.msg.text)}. Dort muss er geprüft und gebucht werden.<div style="margin-top:6px"><button class="btn sm" data-act="tenant" data-id="${c.tenant}" data-go="inbox">Zu ${esc(T_NAMES[c.tenant])}</button></div></div>`).join("")}
  </section>`;
}
const matName = (tid, id) => { const t = W.tenants[tid]; if (id === "P-E5") return "Aufzug E5 (Fertigware)"; const m = (t.master.materials || []).find(x => x.id === id) || (t.master.articles || []).find(x => x.id === id); return m ? m.name : id; };
function renderLayer() {
  const L = document.getElementById("layer"); let h = "";
  if (S.menu) { const t = T(); h += `<div style="position:fixed;inset:0;z-index:44" data-act="closeMenu"></div><div class="menu-pop" role="menu"><div class="eyebrow" style="padding:6px 10px">Rolle wechseln · ${esc(T_NAMES[S.tenant])}</div>${t.users.map(x => { const r = t.roles.find(y => y.id === x.role); return `<button class="pal-item" role="menuitem" data-act="setUser" data-id="${x.id}"><span style="flex:1"><b style="display:block">${esc(x.name)}</b><span class="small muted">${esc(r.name)}</span></span>${x.id === U().id ? ic("check", 16) : ""}</button>`; }).join("")}<div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><button class="pal-item" data-act="goUsers">${ic("users", 16)}${typeof myAccount === "function" && myAccount(S.tenant) ? "Mein Account" : "Eigenen Account anlegen"}</button><button class="pal-item" data-act="theme">${ic("moon", 16)}Hell / Dunkel</button></div></div>`; }
  if (S.modal) h += `<div class="scrim" data-act="closeModal"><div class="dlg" role="dialog" aria-modal="true" onclick="event.stopPropagation()">${S.modal()}</div></div>`;
  if (S.toast) h += `<div class="toast" role="status" style="${S.toast.err ? "background:var(--crit)" : ""}">${esc(S.toast.t)}</div>`;
  L.innerHTML = h; const f = L.querySelector("[autofocus]"); if (f) f.focus();
}

/* ---------- Ansichten ---------- */
const VIEWS = {};
const head = (eyebrow, title, right) => `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></div>${right || ""}</div>`;
const statusNote = (st, txt) => `<div class="note sn ${st === "live" ? "good" : st === "proto" ? "acc" : "warn"} small">${st === "live" ? "<b>Live-Engine:</b> " : st === "proto" ? "<b>Prototyp:</b> " : "<b>Geplant:</b> "}${txt}</div>`;
function kpiCard(label, value, sub, color) { return `<div class="card kpi"><span class="eyebrow">${label}</span><span class="v" ${color ? `style="color:${color}"` : ""}>${value}</span>${sub ? `<span class="small muted">${sub}</span>` : ""}</div>`; }
function tasksFor(t) {
  const role = U().role; const out = [];
  for (const inst of E.processInstances(t)) { const a = inst.steps.find(s => s.state === "active" || s.state === "error"); if (!a) continue; const na = nextAction(t.id, inst); out.push({ title: `${a.name}: ${inst.title}`, hint: a.hint, role: a.role, na, crit: a.state === "error" }); }
  for (const m of t.inbox.filter(x => x.status === "offen")) out.unshift({ title: m.text, hint: "Von " + T_NAMES[m.from], role: "CFO", inbox: m.id });
  if (t.id === "aventra") { const n = t.timeEntries.filter(e => e.status === "erfasst").length; if (n) out.unshift({ title: `${n} Zeitbuchungen warten auf Freigabe`, role: "Project Manager", na: { label: "Alle freigeben", cmd: "approveTime", p: {} } }); }
  return out.filter(x => role === "ceo" || role === "cfo" || !x.role || x.role.includes(R().name.split(" ")[0]) || x.inbox);
}
function events(t) {
  const ev = []; const k = E.kpis(t);
  if (k.marginLastPct < k.marginPrevPct - 2) ev.push(["warn", `EBIT-Marge ${perDe(k.lastClosed)} ${pct(k.marginLastPct)} nach ${pct(k.marginPrevPct)} im Vormonat`, "ask:Warum ist unsere operative Marge im letzten Monat gesunken?"]);
  const od = t.custInvoices.filter(i => i.open > 0 && i.date < E._internal.HIST[10] + "-31"); if (od.length) ev.push(["crit", `${od.length} Rechnungen älter als 30 Tage offen (${eur(od.reduce((a, i) => a + i.open, 0))})`, "go:finance"]);
  if (t.id === "aventra") for (const p of E.projectMetrics(t).filter(p => p.eac > p.budget)) ev.push(["crit", `${p.id} ${p.name}: Prognose ${eur(p.eac)} über Budget ${eur(p.budget)}`, "ask:Welche Projekte werden voraussichtlich ihre Budgets überschreiten?"]);
  if (t.id === "novamart") { const r = E.replenishmentProposals(t); if (r.length) ev.push(["warn", `${r.length} Artikel unter Meldebestand`, "ask:Welche Produkte sollten wir nächste Woche nachbestellen?"]); }
  if (t.id === "elevon") { const g = t.prodOrders.filter(p => p.status === "eröffnet"); if (g.length) ev.push(["warn", `${g.length} Fertigungsaufträge warten auf Material`, "ask:Welche Produktionsaufträge sind gefährdet?"]); }
  return ev;
}
VIEWS.home = () => {
  const t = T(), k = E.kpis(t), u = U(); const role = u.role;
  const cards = { elevon: [["Umsatz " + perDe(k.lastClosed), eur(k.revenueLast)], ["Auftragsbestand", eur(k.backlog)], ["Bestandswert", eur(k.inventory)], ["Offene Forderungen", eur(k.arOpen)]], novamart: [["Umsatz " + perDe(k.lastClosed), eur(k.revenueLast)], ["Unter Meldebestand", num(k.belowRop)], ["Bestandswert", eur(k.inventory)], ["Bank", eur(k.cash)]], aventra: [["Auslastung " + perDe(k.lastClosed), pct(k.utilizationLast)], ["Abrechenbar offen", eur(k.unbilled)], ["Projekte über Budget", num(k.overBudget)], ["Offene Forderungen", eur(k.arOpen)]] }[t.id];
  if (role === "cfo") cards.splice(0, 2, ["Bank", eur(k.cash)], ["EBIT-Marge " + perDe(k.lastClosed), pct(k.marginLastPct)]);
  const tasks = tasksFor(t).slice(0, 7), ev = events(t);
  return `<section class="hero" style="padding-top:8px"><div><h1 style="font-size:30px">Hallo ${esc(u.name.split(" ")[0])}! <span class="muted" style="font-weight:600;font-size:18px">${esc(R().name)} · ${esc(T_NAMES[t.id])}</span></h1><p class="sub">Dein Arbeitsbereich mit Kennzahlen, Aufgaben und Ereignissen aus den aktuellen Geschäftsvorfällen.</p></div>
   <form class="ask big" data-form="ask" style="max-width:none">${ic("ai", 22)}<input id="askIn" placeholder="Was möchtest du heute erreichen?" aria-label="Was möchtest du heute erreichen?"><button class="send" type="submit" aria-label="Senden">${ic("send", 18)}</button></form>
   <div class="quick" style="justify-content:flex-start">${STORIES.filter(s => s.tenant === t.id || s.cross.includes(t.id)).map(s => `<button data-act="startStory" data-id="${s.id}">${ic("rocket", 16)}Demo: ${esc(s.short)}</button>`).join("")}<button data-act="ask" data-q="Warum ist unsere operative Marge im letzten Monat gesunken?">${ic("gauge", 16)}Marge analysieren</button></div></section>
   <div class="grid g4">${cards.map(c => kpiCard(c[0], c[1])).join("")}</div>
   <div class="grid g2">
    <section class="card"><div class="card-h"><h2>Offene Aufgaben</h2><span class="small faint">${tasks.length} für deine Rolle</span></div><div class="list">${tasks.length ? tasks.map(x => `<div class="li"><span class="sev" style="background:var(--${x.crit ? "crit" : "accent"})"></span><div class="grow"><div>${esc(x.title)}</div><div class="small faint">${esc(x.hint || x.role || "")}</div></div>${x.inbox ? `<button class="btn sm" data-act="inbox" data-id="${x.inbox}">Prüfen und buchen</button>` : x.na ? `<button class="btn sm" data-act="run" data-cmd="${x.na.cmd}" data-p='${esc(JSON.stringify(x.na.p))}'>${esc(x.na.label)}</button>` : ""}</div>`).join("") : `<div class="empty">Keine offenen Aufgaben. Starte eine Demo oder lege einen Vorgang an.</div>`}</div></section>
    <section class="card"><div class="card-h"><h2>Kritische Ereignisse</h2></div><div class="list">${ev.length ? ev.map(e => `<div class="li"><span class="sev" style="background:var(--${e[0]})"></span><div class="grow">${esc(e[1])}</div><button class="btn sm" data-act="evt" data-v="${esc(e[2])}">${e[2].startsWith("ask") ? "KI-Analyse" : "Ansehen"}</button></div>`).join("") : `<div class="empty">Keine kritischen Ereignisse.</div>`}</div></section>
   </div>
   <section class="card card-pad">${trendChart(k)}</section>`;
};
VIEWS.workspace = VIEWS.home;
function trendChart(k) {
  const d = k.trend.filter(x => T().periods[x.period] === "closed"), W_ = 720, H = 220, L = 64, Rr = 16, Tt = 16, B = 30; const vals = d.flatMap(x => [x.revenue, x.ebit]); const mx = Math.max(...vals) * 1.1, mn = Math.min(0, ...vals) * 1.1;
  const X = i => L + i * (W_ - L - Rr) / (d.length - 1), Y = v => Tt + (1 - (v - mn) / (mx - mn)) * (H - Tt - B);
  const step = Math.pow(10, Math.floor(Math.log10((mx - mn) / 4))); const st = Math.ceil((mx - mn) / 4 / step) * step; const ticks = []; for (let v = Math.ceil(mn / st) * st; v <= mx; v += st) ticks.push(v);
  const path = key => d.map((x, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(x[key]).toFixed(1)}`).join("");
  return `<div class="row between"><h3>Umsatz und EBIT je Monat · ${esc(T_NAMES[S.tenant])}</h3><span class="small faint">aus dem Hauptbuch, ${d.length} abgeschlossene Perioden</span></div><div class="tbl-wrap chart"><svg viewBox="0 0 ${W_} ${H}" width="100%" style="min-width:520px" role="img" aria-label="Umsatz und EBIT je Monat">
   ${ticks.map(v => `<line x1="${L}" x2="${W_ - Rr}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--fg-3)">${Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString("de-DE") + " Mio" : (Math.round(v / 1000) || 0).toLocaleString("de-DE") + " T"}</text>`).join("")}
   ${d.map((x, i) => i % 2 === 0 || i === d.length - 1 ? `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--fg-3)">${perDe(x.period)}</text>` : "").join("")}
   <path d="${path("revenue")}L${X(d.length - 1)} ${Y(mn)}L${X(0)} ${Y(mn)}Z" fill="var(--accent)" fill-opacity=".08"/><path d="${path("revenue")}" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="${path("ebit")}" fill="none" stroke="var(--good)" stroke-width="2"/>
   <circle cx="${X(d.length - 1)}" cy="${Y(d[d.length - 1].ebit)}" r="4" fill="var(--good)"/>
  </svg></div><div class="row small"><span class="row" style="gap:6px"><i style="width:14px;height:3px;background:var(--accent);display:inline-block"></i>Umsatz</span><span class="row" style="gap:6px"><i style="width:14px;height:3px;background:var(--good);display:inline-block"></i>EBIT</span><span class="faint">Laufender Monat siehe Live-Kennzahlen</span></div>`;
}

VIEWS.processes = () => {
  const t = T(); const list = E.processInstances(t); const sel = list.find(i => i.id === S.sel.inst) || list[0];
  const idx = sel ? Math.min(S.sel.step == null ? sel.steps.findIndex(s => s.state === "active") : S.sel.step, sel.steps.length - 1) : -1; const step = sel && idx >= 0 ? sel.steps[idx] : sel && sel.steps[0];
  return head("NEXORA Process Explorer · " + esc(T_NAMES[t.id]), "Business Processes", `<div class="row">${t.id === "elevon" ? `<button class="btn" data-act="newSO">Neuer Kundenauftrag</button>` : t.id === "novamart" ? `<a class="btn" href="#sales">Neue Onlinebestellung</a>` : ""}</div>`)
   + statusNote("live", "Jede Instanz und jeder Status wird aus Belegen und Vorgängen der Engine abgeleitet, nicht gesetzt.")
   + (list.length ? `<section class="card"><div class="card-h"><h3>Prozessinstanzen</h3><span class="small faint">${list.length}</span></div><div class="tbl-wrap"><table><thead><tr><th>Instanz</th><th>Prozess</th><th>Fortschritt</th><th>Aktueller Schritt</th></tr></thead><tbody>${list.map(i => { const done = i.steps.filter(s => s.state === "done" || s.state === "skipped").length; const a = i.steps.find(s => s.state === "active" || s.state === "error"); return `<tr class="click" data-act="selInst" data-id="${esc(i.id)}" ${sel && sel.id === i.id ? 'style="background:var(--accent-soft)"' : ""}><td><b>${esc(i.title)}</b></td><td class="small">${esc(i.chain)}</td><td style="min-width:140px"><div class="row" style="flex-wrap:nowrap"><div class="bar acc" style="flex:1"><i style="width:${done / i.steps.length * 100}%"></i></div><span class="num small">${done}/${i.steps.length}</span></div></td><td>${a ? pill(a.state === "error" ? "p-crit" : "p-acc", a.name) : pill("p-good", "abgeschlossen")}</td></tr>`; }).join("")}</tbody></table></div></section>`
   + (sel ? `<section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><div class="row between"><h2>${esc(sel.title)}</h2><span class="small muted">${esc(sel.chain)}</span></div>
     <div class="flow" role="list">${sel.steps.map((s, i) => `${i ? `<span class="link ${s.state === "done" ? "done" : ""}"></span>` : ""}<button class="node ${s.state} ${i === idx ? "sel" : ""}" role="listitem" data-act="selStep" data-i="${i}" aria-label="${esc(s.name)}: ${esc(s.state)}"><span class="c">${s.state === "done" ? "✓" : s.state === "error" ? "!" : i + 1}</span><span class="n">${esc(s.name)}</span></button>`).join("")}</div>
     ${step ? `<div class="grid g2"><div class="kv"><span>Schritt</span><b>${esc(step.name)}</b><span>Status</span><span>${pill(step.state === "done" ? "p-good" : step.state === "active" ? "p-acc" : step.state === "error" ? "p-crit" : "p-neu", { done: "erledigt", active: "offen – nächster Schritt", open: "noch nicht erreicht", error: "Abweichung", skipped: "nicht erforderlich" }[step.state])}</span><span>Verantwortlich</span><span>${esc(step.role)}</span><span>Belege</span><span>${step.docs.length ? step.docs.map(d => d.startsWith("FI-") ? `<button class="chip" data-act="doc" data-no="${esc(d)}">${esc(d)}</button>` : `<span class="chip">${esc(d)}</span>`).join(" ") : '<span class="faint">–</span>'}</span>${step.hint ? `<span>KI-Hinweis</span><span>${esc(step.hint)}</span>` : ""}</div>
     <div>${(() => { const na = nextAction(t.id, sel); return na && step.state === "active" ? `<button class="btn pri" data-act="run" data-cmd="${na.cmd}" data-p='${esc(JSON.stringify(na.p))}'>${esc(na.label)}</button><p class="small faint" style="margin-top:8px">Führt den Schritt über die Geschäftsregeln aus. Ist deine Rolle nicht berechtigt, wird die Aktion abgelehnt.</p>` : step.state === "active" && sel.steps[idx].name === "Zahlung" ? `<p class="small muted">Zahlung kommt vom Partnerunternehmen. Wechsle dort in den Posteingang.</p>` : ""; })()}</div></div>` : ""}
    </section>` : "") : `<section class="card"><div class="empty">Noch keine Prozessinstanzen in diesem Unternehmen. Starte eine Demo oder lege einen Vorgang an.<div style="margin-top:12px">${STORIES.filter(s => s.tenant === t.id).map(s => `<button class="btn pri" data-act="startStory" data-id="${s.id}">Demo starten: ${esc(s.short)}</button>`).join(" ")}</div></div></section>`);
};

VIEWS.inbox = () => {
  const t = T(); const open = t.inbox.filter(m => m.status === "offen"), done = t.inbox.filter(m => m.status !== "offen");
  const lab = { supplierInvoice: "Eingangsrechnung", paymentAdvice: "Zahlungsavis", customerOrder: "Kundenbestellung", delivery: "Lieferavis" };
  return head("Unternehmensübergreifend · " + esc(T_NAMES[t.id]), "Posteingang") + statusNote("live", "Vorgänge von Partnerunternehmen werden nie automatisch gebucht. Erst die Prüfung hier löst die Buchung im eigenen Buchungskreis aus.")
   + `<section class="card tbl-wrap"><table><thead><tr><th>Eingang</th><th>Art</th><th>Von</th><th>Datum</th><th></th></tr></thead><tbody>${open.length ? open.map(m => `<tr><td>${esc(m.text)}</td><td>${pill("p-acc", lab[m.type] || m.type)}</td><td>${esc(T_NAMES[m.from])}</td><td class="num">${dDe(m.date)}</td><td class="r"><button class="btn sm pri" data-act="inbox" data-id="${m.id}">Prüfen und buchen</button></td></tr>`).join("") : `<tr><td colspan="5" class="empty">Kein offener Eingang.</td></tr>`}</tbody></table></section>`
   + (done.length ? `<section class="card tbl-wrap"><div class="card-h"><h3>Erledigt</h3></div><table><tbody>${done.slice(-10).reverse().map(m => `<tr><td>${esc(m.text)}</td><td>${esc(T_NAMES[m.from])}</td><td class="small muted">${esc(m.doneBy || "")}</td></tr>`).join("")}</tbody></table></section>` : "");
};

/* --- Sales --- */
VIEWS.sales = () => {
  const t = T();
  if (t.id === "elevon") {
    const sc = S.sel.quote || { customerId: "C-RHEIN", qty: 12, discountPct: 6 }; const c = E.costing(t, sc.qty || 1); const net = 62000 * (1 - (sc.discountPct || 0) / 100) * (sc.qty || 1);
    return head("Sales · Elevon", "Angebote und Kundenaufträge") + statusNote("live", "Angebot mit Kalkulation aus Stückliste, Fertigungs- und Montagestunden. Ein Kundenauftrag bucht nichts; Umsatz entsteht erst mit der Rechnung nach Abnahme.")
     + `<section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><h3>Neues Angebot · ${esc(E.E5.name)}</h3>
       <div class="grid g3"><label class="f">Kunde<select class="input" id="qCust" data-on="qf" data-k="customerId">${t.master.customers.slice(0, 40).map(x => `<option value="${x.id}" ${x.id === sc.customerId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label><label class="f">Anzahl Anlagen<input class="input" id="qQty" type="number" min="1" max="40" value="${sc.qty}" data-on="qf" data-k="qty"></label><label class="f">Rabatt %<input class="input" id="qDisc" type="number" min="0" max="25" value="${sc.discountPct}" data-on="qf" data-k="discountPct"></label></div>
       <div class="kv"><span>Listenpreis</span><span class="num">${eur(62000)} je Anlage</span><span>Material (Stückliste)</span><span class="num">${eur(c.material)}</span><span>Fertigung</span><span class="num">${eur(c.labor)}</span><span>Montage</span><span class="num">${eur(c.install)}</span><span>Angebotswert</span><b class="num">${eur(net)}</b><span>Kalkulierte Marge</span><b>${pct((net - c.total) / net * 100)}</b></div>
       <div class="row"><button class="btn pri" data-act="createQuote">Angebot anlegen</button><span class="small faint">Ab 5 % Rabatt ist eine Freigabe durch CEO oder CFO nötig.</span></div></section>`
     + `<section class="card tbl-wrap"><div class="card-h"><h3>Angebote</h3></div><table><thead><tr><th>Angebot</th><th>Kunde</th><th class="r">Menge</th><th class="r">Wert</th><th>Status</th><th></th></tr></thead><tbody>${t.quotes.length ? t.quotes.slice().reverse().map(q => `<tr><td class="mono small">${q.no}</td><td>${esc(E.customerName(t, q.customer))}</td><td class="r num">${q.qty}</td><td class="r num">${eur(q.net)}</td><td>${stPill(q.status)}</td><td class="r">${q.status === "zur Freigabe" ? `<button class="btn sm" data-act="run" data-cmd="approveQuote" data-p='${esc(JSON.stringify({ quoteNo: q.no }))}'>Freigeben</button>` : q.status === "freigegeben" ? `<button class="btn sm pri" data-act="run" data-cmd="createSalesOrder" data-p='${esc(JSON.stringify({ quoteNo: q.no }))}'>Auftrag anlegen</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="6" class="empty">Noch keine Angebote.</td></tr>`}</tbody></table></section>`
     + soTable(t);
  }
  // NovaMart Onlineshop
  const arts = [t.master.articles[0]].concat(t.master.articles.slice(1).filter(a => E.avail(t, a.id, "ZL1") > 0).slice(0, 11)); const sc = S.sel.shop || { articleId: "A-10001", qty: 1, couponPct: 0, customerId: "K-300001" }; const a = t.master.articles.find(x => x.id === sc.articleId) || arts[0];
  const cust = t.master.customers.find(c => c.id === sc.customerId); const disc = (sc.couponPct || 0) + (cust && cust.loyalty ? 3 : 0);
  return head("Sales · NovaMart Onlineshop", "Onlinebestellungen") + statusNote("live", "Die Bestellung prüft Verfügbarkeit, berechnet Preis und Rabatt, autorisiert die Zahlung und reserviert Bestand. Gebucht wird erst beim Versand (Wareneinsatz) und bei der Rechnung (Umsatz).")
   + `<section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><h3>Kunde bestellt im Onlineshop</h3><div class="grid g4">
      <label class="f">Artikel<select class="input" id="sArt" data-on="sf" data-k="articleId">${arts.map(x => `<option value="${x.id}" ${x.id === a.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      <label class="f">Menge<input class="input" id="sQty" type="number" min="1" value="${sc.qty}" data-on="sf" data-k="qty"></label>
      <label class="f">Gutschein %<input class="input" id="sCoup" type="number" min="0" max="20" value="${sc.couponPct}" data-on="sf" data-k="couponPct"></label>
      <label class="f">Kunde<select class="input" id="sCust" data-on="sf" data-k="customerId">${t.master.customers.slice(1, 13).map(c => `<option value="${c.id}" ${c.id === sc.customerId ? "selected" : ""}>${esc(c.name)}${c.loyalty ? " · NovaClub" : ""}</option>`).join("")}</select></label></div>
     <div class="kv"><span>Verfügbar ZL1</span><span class="num">${E.avail(t, a.id, "ZL1")} Stk. (Meldebestand ${a.rop})</span><span>Preis</span><span class="num">${eur(a.price, 2)}${disc ? ` − ${disc} % (${cust && cust.loyalty ? "inkl. 3 % NovaClub" : "Gutschein"})` : ""}</span><span>Zu zahlen</span><b class="num">${eur(a.price * (sc.qty || 1) * (1 - disc / 100), 2)}</b></div>
     <div class="row"><button class="btn pri" data-act="placeOrder">Bestellung auslösen</button></div></section>`
   + `<section class="card tbl-wrap"><div class="card-h"><h3>Bestellungen</h3></div><table><thead><tr><th>Bestellung</th><th>Artikel</th><th class="r">Brutto</th><th>Status</th><th></th></tr></thead><tbody>${t.webOrders.length ? t.webOrders.slice().reverse().map(o => { const inst = E.processInstances(t).find(i => i.id === o.no); const na = inst && nextAction(t.id, inst); return `<tr><td class="mono small">${o.no}</td><td>${o.qty} × ${esc(E.articleName(t, o.article))}</td><td class="r num">${eur(o.gross, 2)}</td><td>${stPill(o.status)}</td><td class="r">${na ? `<button class="btn sm pri" data-act="run" data-cmd="${na.cmd}" data-p='${esc(JSON.stringify(na.p))}'>${esc(na.label)}</button>` : ""}</td></tr>`; }).join("") : `<tr><td colspan="5" class="empty">Noch keine Onlinebestellungen in dieser Sitzung.</td></tr>`}</tbody></table></section>`;
};
function soTable(t) { return `<section class="card tbl-wrap"><div class="card-h"><h3>Kundenaufträge</h3><button class="btn sm" data-act="newSO">Direktauftrag</button></div><table><thead><tr><th>Auftrag</th><th>Kunde</th><th class="r">Menge</th><th class="r">Wert</th><th>Status</th><th></th></tr></thead><tbody>${t.salesOrders.length ? t.salesOrders.slice().reverse().map(so => { const inst = E.processInstances(t).find(i => i.id === so.no); const na = inst && nextAction(t.id, inst); return `<tr><td class="mono small">${so.no}${so.link ? ` ${pill("p-acc", "Partner")}` : ""}</td><td>${esc(E.customerName(t, so.customer))}</td><td class="r num">${so.qty}</td><td class="r num">${eur(so.net)}</td><td>${stPill(so.status)}</td><td class="r">${na ? `<button class="btn sm pri" data-act="run" data-cmd="${na.cmd}" data-p='${esc(JSON.stringify(na.p))}'>${esc(na.label)}</button>` : ""} <button class="btn sm ghost" data-act="selInstGo" data-id="${so.no}">Prozess</button></td></tr>`; }).join("") : `<tr><td colspan="6" class="empty">Noch keine Kundenaufträge.</td></tr>`}</tbody></table></section>`; }

/* --- Manufacturing --- */
VIEWS.production = () => {
  const t = T(); if (t.id !== "elevon") return VIEWS.home();
  const comp = E.E5 && t.master.products[0].bom;
  return head("Manufacturing · Werk Stuttgart", "Fertigung") + statusNote("live", "Freigabe prüft Verfügbarkeit und reserviert Komponenten; Verbrauch bucht auf unfertige Erzeugnisse; Ablieferung bewertet die Fertigware zu Ist-Herstellkosten.")
   + `<section class="card tbl-wrap"><div class="card-h"><h3>Stückliste ${esc(E.E5.name)}</h3><span class="small faint">Arbeitsplan: ${E.E5.assemblyHours} h Montage × ${eur(E.E5.laborRate)} je Anlage</span></div><table><thead><tr><th>Komponente</th><th class="r">Menge je Anlage</th><th class="r">Bestand</th><th class="r">reserviert</th><th class="r">Preis</th></tr></thead><tbody>${comp.map(([m, q]) => { const s = t.stock[m + "@WH1"] || { qty: 0, res: 0 }; const mm = E.materialOf(t, m); return `<tr><td>${esc(mm.name)} <span class="mono small faint">${m}</span></td><td class="r num">${q}</td><td class="r num">${s.qty}</td><td class="r num">${s.res}</td><td class="r num">${eur(mm.price)}</td></tr>`; }).join("")}</tbody></table></section>`
   + `<section class="card tbl-wrap"><div class="card-h"><h3>Fertigungsaufträge</h3></div><table><thead><tr><th>Auftrag</th><th>Kundenauftrag</th><th class="r">Menge</th><th class="r">WIP</th><th>Status</th><th></th></tr></thead><tbody>${t.prodOrders.length ? t.prodOrders.slice().reverse().map(p => { const inst = E.processInstances(t).find(i => i.id === p.so); const na = inst && nextAction(t.id, inst); return `<tr><td class="mono small">${p.no}</td><td class="mono small">${p.so}</td><td class="r num">${p.qty}</td><td class="r num">${eur(p.wip)}</td><td>${stPill(p.status)}</td><td class="r">${na ? `<button class="btn sm pri" data-act="run" data-cmd="${na.cmd}" data-p='${esc(JSON.stringify(na.p))}'>${esc(na.label)}</button>` : ""}</td></tr>`; }).join("") : `<tr><td colspan="6" class="empty">Keine Fertigungsaufträge. Sie entstehen aus der Bedarfsermittlung eines Kundenauftrags.</td></tr>`}</tbody></table></section>`;
};

/* --- Supply Chain --- */
VIEWS.supply = () => {
  const t = T(); const wh = t.id === "novamart" ? "ZL1" : "WH1"; const q = (S.sel.stockQ || "").toLowerCase();
  const items = Object.values(t.stock).filter(s => s.wh === wh || s.mat === "P-E5").filter(s => !q || matName(t.id, s.mat).toLowerCase().includes(q) || s.mat.toLowerCase().includes(q)).slice(0, 25);
  const props = E.replenishmentProposals(t).slice(0, 12);
  return head("Supply Chain · " + esc(T_NAMES[t.id]), "Bestand und Beschaffung") + statusNote("live", "Wareneingang bucht Bestand gegen WE/RE-Verrechnung; die Eingangsrechnung wird per Drei-Wege-Abgleich (Bestellung, Wareneingang, Rechnung) geprüft.")
   + (t.id === "novamart" ? `<section class="card tbl-wrap"><div class="card-h"><h3>Nachschubvorschläge</h3><span class="small faint">aus 8 Wochen Absatz, Trend und Lieferzeit</span></div><table><thead><tr><th>Artikel</th><th class="r">verfügbar</th><th class="r">Meldebestand</th><th class="r">Prognose/Woche</th><th class="r">Vorschlag</th><th></th></tr></thead><tbody>${props.length ? props.map(p => `<tr><td>${esc(p.name)}<div class="small faint">${esc(p.basis)}</div></td><td class="r num">${p.available}</td><td class="r num">${p.rop}</td><td class="r num">${p.forecastWeek}</td><td class="r num">${p.qty}</td><td class="r"><button class="btn sm pri" data-act="run" data-cmd="createReplenishment" data-p='${esc(JSON.stringify({ articleId: p.article }))}'>Bestellen</button></td></tr>`).join("") : `<tr><td colspan="6" class="empty">Kein Artikel unter Meldebestand.</td></tr>`}</tbody></table></section>
     <section class="card card-pad row between"><div><h3>Filialausbau: Aufzüge bei Elevon bestellen</h3><p class="small muted">Erzeugt eine Bestellung an den Partner Elevon. Dort entsteht ein Eingang, aus dem ein Kundenauftrag mit Fertigung wird.</p></div><button class="btn" data-act="run" data-cmd="orderLiftsFromElevon" data-p='{"qty":2}'>2 Aufzüge bestellen</button></section>` : "")
   + `<section class="card tbl-wrap"><div class="card-h"><h3>Bestellungen</h3></div><table><thead><tr><th>Bestellung</th><th>Lieferant</th><th class="r">Wert</th><th>Status</th><th></th></tr></thead><tbody>${t.purchaseOrders.length ? t.purchaseOrders.slice().reverse().map(po => { const inv = t.supInvoices.find(i => i.poNo === po.no); return `<tr><td class="mono small">${po.no}${po.link ? " " + pill("p-acc", "Partner") : ""}</td><td>${esc(E.supplierName(t, po.supplier))}</td><td class="r num">${eur(po.net)}</td><td>${stPill(po.status)}${inv ? " " + stPill(inv.status === "bezahlt" ? "bezahlt" : "Rechnung offen") : ""}</td><td class="r">${po.status === "bestellt" && !po.link ? `<button class="btn sm pri" data-act="run" data-cmd="postGoodsReceipt" data-p='${esc(JSON.stringify({ poNo: po.no }))}'>Wareneingang</button>` : po.status === "geliefert" && !po.link && !inv ? `<button class="btn sm pri" data-act="run" data-cmd="postSupplierInvoice" data-p='${esc(JSON.stringify({ poNo: po.no }))}'>Rechnung prüfen</button>` : inv && inv.status === "offen" ? `<button class="btn sm" data-act="run" data-cmd="payVendor" data-p='${esc(JSON.stringify({ invoiceNo: inv.no }))}'>Bezahlen</button>` : po.link && po.status === "bestellt" ? '<span class="small faint">wartet auf Lieferung des Partners</span>' : ""}</td></tr>`; }).join("") : `<tr><td colspan="5" class="empty">Noch keine Bestellungen in dieser Sitzung.</td></tr>`}</tbody></table></section>`
   + `<section class="card tbl-wrap"><div class="card-h"><h3>Bestand ${esc(wh)}</h3><input class="input" style="max-width:220px" id="stockQ" placeholder="Material suchen" value="${esc(S.sel.stockQ || "")}" data-on="stockQ"></div><table><thead><tr><th>Material</th><th class="r">Bestand</th><th class="r">reserviert</th><th class="r">verfügbar</th><th class="r">Wert</th></tr></thead><tbody>${items.map(s => `<tr><td>${esc(matName(t.id, s.mat))} <span class="mono small faint">${s.mat}</span></td><td class="r num">${num(s.qty)}</td><td class="r num">${num(s.res)}</td><td class="r num">${num(s.qty - s.res)}</td><td class="r num">${eur(s.value)}</td></tr>`).join("")}</tbody></table></section>`;
};

/* --- Projects & Services --- */
VIEWS.projects = () => {
  const t = T(); if (t.id !== "aventra") return VIEWS.home(); const pms = E.projectMetrics(t); const pid = S.sel.proj || "P-1001"; const p = t.projects.find(x => x.id === pid); const pm = pms.find(x => x.id === pid);
  const isCons = U().role === "consultant"; const myEmp = U().employee;
  const te = t.timeEntries.filter(e => e.project === pid && e.period === E.periodOf(t.date));
  const skill = S.sel.skill || "SAP FI/CO"; const staff = S.sel.staff;
  return head("Projects & Services · Aventra", "Projekte") + statusNote("live", "Zeiten kosten erst nach Freigabe (Stunden × Kostensatz, Kostenrechnung). Abgerechnet werden nur freigegebene, abrechenbare Leistungen; die Rechnung erzeugt Forderung und Umsatz.")
   + `<section class="card tbl-wrap"><table><thead><tr><th>Projekt</th><th class="r">Budget</th><th class="r">Ist-Kosten</th><th class="r">Prognose (EAC)</th><th class="r">Ist-Erlös</th><th class="r">nicht fakturiert</th><th class="r">Marge Prognose</th></tr></thead><tbody>${pms.map(x => `<tr class="click" data-act="selProj" data-id="${x.id}" ${x.id === pid ? 'style="background:var(--accent-soft)"' : ""}><td><b>${esc(x.id)}</b> ${esc(x.name)}<div class="small faint">${esc(E.customerName(t, x.customer))}</div></td><td class="r num">${eur(x.budget)}</td><td class="r num">${eur(x.actualCost)}</td><td class="r num" style="color:${x.eac > x.budget ? "var(--crit)" : "inherit"}">${eur(x.eac)}</td><td class="r num">${eur(x.actualRevenue)}</td><td class="r num">${eur(x.unbilled)}</td><td class="r num">${pct(x.marginPct)}</td></tr>`).join("")}</tbody></table></section>`
   + `<div class="grid g2"><section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><div class="row between"><h3>${esc(p.id)} · Zeiten ${perDe(E.periodOf(t.date))}</h3>${te.some(e => e.status === "erfasst") ? `<button class="btn sm pri" data-act="run" data-cmd="approveTime" data-p='${esc(JSON.stringify({ projectId: p.id }))}'>Alle freigeben</button>` : ""}</div>
      <div class="tbl-wrap"><table><tbody>${te.length ? te.map(e => `<tr><td class="mono small">${e.id}</td><td>${esc(t.master.employees.find(x => x.id === e.employee).name)}</td><td class="r num">${e.hours} h</td><td>${stPill(e.status)}</td></tr>`).join("") : `<tr><td class="empty">Noch keine Zeiten im laufenden Monat.</td></tr>`}</tbody></table></div>
      <form class="row" data-form="time" style="align-items:flex-end"><label class="f" style="flex:1;min-width:160px">Mitarbeiter<select class="input" id="tEmp">${p.team.map(m => { const e = t.master.employees.find(x => x.id === m.employee); return `<option value="${e.id}" ${e.id === myEmp ? "selected" : ""}>${esc(e.name)}</option>`; }).join("")}</select></label><label class="f" style="width:90px">Stunden<input class="input" id="tH" type="number" min="0.5" max="12" step="0.5" value="8"></label><button class="btn pri" type="submit">Zeit erfassen</button></form>
      <form class="row" data-form="exp" style="align-items:flex-end"><label class="f" style="flex:1">Reisekosten<input class="input" id="xText" value="Bahn und Hotel Stuttgart"></label><label class="f" style="width:110px">Betrag €<input class="input" id="xAmt" type="number" min="1" value="240"></label><button class="btn" type="submit">Erfassen</button></form>
      <div class="row between"><span class="small muted">Abrechenbar, nicht fakturiert: <b>${eur(pm.unbilled)}</b></span><button class="btn" data-act="run" data-cmd="invoiceProject" data-p='${esc(JSON.stringify({ projectId: p.id }))}' ${isCons ? "disabled" : ""}>Rechnung erstellen</button></div></section>
     <section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><h3>Resource-to-Project: Berater finden</h3><div class="row"><select class="input" id="skSel" style="max-width:220px" data-on="skill">${["SAP FI/CO", "SAP MM", "SAP SD", "SAP PP", "Projektleitung", "Datenmigration", "Integration", "Architektur"].map(s => `<option ${s === skill ? "selected" : ""}>${s}</option>`).join("")}</select><button class="btn" data-act="findStaff">Verfügbarkeit prüfen</button></div>
      ${staff ? `<div class="tbl-wrap"><table><thead><tr><th></th><th>Name</th><th class="r">gebucht</th><th class="r">frei</th><th class="r">Kostensatz</th></tr></thead><tbody>${staff.slice(0, 8).map(e => `<tr><td><input type="checkbox" class="stc" value="${e.id}" id="st-${e.id}" aria-label="${esc(e.name)} auswählen"></td><td>${esc(e.name)}<div class="small faint">${esc(e.level)} · ${esc(e.skills.join(", "))}</div></td><td class="r num">${e.booked} h</td><td class="r num" style="color:${e.free < 40 ? "var(--crit)" : "inherit"}">${e.free} h</td><td class="r num">${eur(e.costRate)}</td></tr>`).join("")}</tbody></table></div><div class="row"><span class="small">je 40 h/Monat zuordnen zu ${esc(p.id)}</span><button class="btn pri sm" data-act="assign">Zuordnen</button></div>` : `<p class="small muted">Die Suche zeigt freie Kapazität je Mitarbeiter aus allen Projektzuordnungen; eine Überbuchung wird als Konflikt abgelehnt.</p>`}</section></div>`;
};

/* --- Finance --- */
VIEWS.finance = () => {
  const t = T(); const tab = S.tab.fin || "journal"; const tabs = [["journal", "Journal"], ["tb", "Saldenliste"], ["ar", "Debitoren"], ["ap", "Kreditoren"], ["pl", "GuV je Periode"], ["periods", "Perioden"]];
  let body = "";
  if (tab === "journal") { const docs = t.docs.slice().reverse().slice(0, 40); body = `<section class="card tbl-wrap"><table><thead><tr><th>Beleg</th><th>Datum</th><th>Text</th><th class="r">Betrag</th><th>Benutzer</th></tr></thead><tbody>${docs.map(d => `<tr class="click" data-act="doc" data-no="${d.no}"><td class="mono small">${d.no}</td><td class="num">${dDe(d.date)}</td><td>${esc(d.text)}</td><td class="r num">${eur(d.lines.reduce((a, l) => a + l.dr, 0), 2)}</td><td class="small muted">${esc(d.user)}</td></tr>`).join("")}</tbody></table><p class="small faint" style="padding:10px 14px">${num(t.docs.length)} Belege gesamt, neueste zuerst. Jeder Beleg ist ausgeglichen (Soll = Haben).</p></section>`; }
  if (tab === "tb") { const tb = E.trialBalance(t); const rows = Object.keys(E.COA).filter(a => tb[a]); const sum = rows.reduce((a, x) => a + tb[x], 0); body = `<section class="card tbl-wrap"><table><thead><tr><th>Konto</th><th>Bezeichnung</th><th class="r">Soll-Saldo</th><th class="r">Haben-Saldo</th></tr></thead><tbody>${rows.map(a => `<tr><td class="mono">${a}</td><td>${esc(E.COA[a][0])}</td><td class="r num">${tb[a] > 0 ? eur(tb[a], 2) : ""}</td><td class="r num">${tb[a] < 0 ? eur(-tb[a], 2) : ""}</td></tr>`).join("")}<tr><td></td><td><b>Summe Soll − Haben</b></td><td class="r num" colspan="2"><b>${eur(sum, 2)}</b></td></tr></tbody></table></section>`; }
  if (tab === "ar" || tab === "ap") { const list = (tab === "ar" ? t.custInvoices : t.supInvoices).filter(i => i.open > 0).slice().reverse(); body = `<section class="card tbl-wrap"><table><thead><tr><th>Rechnung</th><th>Partner</th><th>Datum</th><th class="r">Offen</th><th></th></tr></thead><tbody>${list.length ? list.slice(0, 40).map(i => `<tr><td class="mono small">${esc(i.extNo || i.no)}${i.link ? " " + pill("p-acc", "Partner") : ""}</td><td>${esc(tab === "ar" ? E.customerName(t, i.partnerId) : E.supplierName(t, i.partnerId))}</td><td class="num">${dDe(i.date)}</td><td class="r num">${eur(i.open, 2)}</td><td class="r">${tab === "ap" ? `<button class="btn sm" data-act="run" data-cmd="payVendor" data-p='${esc(JSON.stringify({ invoiceNo: i.no }))}'>Bezahlen</button>` : i.link ? '<span class="small faint">Zahlung über Partner-Avis</span>' : `<button class="btn sm" data-act="run" data-cmd="receivePayment" data-p='${esc(JSON.stringify({ invoiceNo: i.no }))}'>Zahlungseingang</button>`}</td></tr>`).join("") : `<tr><td colspan="5" class="empty">Keine offenen Posten.</td></tr>`}</tbody></table><p class="small faint" style="padding:10px 14px">Summe offen ${eur(list.reduce((a, i) => a + i.open, 0), 2)} = Saldo Konto ${tab === "ar" ? "1200" : "1600"} ${eur(Math.abs(E.balance(t, tab === "ar" ? "1200" : "1600")), 2)}</p></section>`; }
  if (tab === "pl") { const ps = E._internal.HIST.concat([E.periodOf(t.date)]).filter((p, i, a) => a.indexOf(p) === i).slice(-7); const pls = ps.map(p => E.plOf(t, p)); body = `<section class="card tbl-wrap"><table><thead><tr><th></th>${ps.map(p => `<th class="r">${perDe(p)}</th>`).join("")}</tr></thead><tbody>${[["revenue", "Umsatz"], ["cogs", "Materialaufwand"], ["grossMargin", "Rohertrag"], ["personnel", "Personal (netto)"], ["other", "Sonstige Kosten"], ["ebit", "EBIT"]].map(([k, l]) => `<tr><td>${k === "ebit" || k === "grossMargin" ? `<b>${l}</b>` : l}</td>${pls.map(x => `<td class="r num">${eur(x[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`; }
  if (tab === "periods") body = `<section class="card tbl-wrap"><table><tbody>${Object.entries(t.periods).slice(-6).map(([p, s]) => `<tr><td>${perDe(p)}</td><td>${pill(s === "open" ? "p-good" : "p-neu", s === "open" ? "offen" : "abgeschlossen")}</td></tr>`).join("")}</tbody></table><div class="row" style="padding:12px 14px;border-top:1px solid var(--line)"><button class="btn" data-act="run" data-cmd="advanceDate" data-p='{"days":7}'>Geschäftsdatum +7 Tage</button><button class="btn pri" data-act="run" data-cmd="closePeriod" data-p='{}'>Monatsabschluss ${perDe(E.periodOf(t.date))}</button><span class="small faint">Abschluss bucht Gehälter, sperrt die Periode und öffnet die nächste.</span></div></section>`;
  return head("Finance · " + esc(T_NAMES[t.id]), "Finanzbuchhaltung") + statusNote("live", "Doppelte Buchführung mit Perioden, Belegnummern und Audit. Buchungen entstehen nur aus Geschäftsvorfällen; Nebenbücher stimmen mit dem Hauptbuch überein.")
   + `<div class="tabs" role="tablist">${tabs.map(x => `<button class="tab ${tab === x[0] ? "on" : ""}" role="tab" data-act="finTab" data-t="${x[0]}">${x[1]}</button>`).join("")}</div>` + body;
};

/* --- Analytics --- */
VIEWS.analytics = () => {
  const t = T(), k = E.kpis(t); const last = E.plOf(t, k.lastClosed), prev = E.plOf(t, E._internal.HIST[E._internal.HIST.indexOf(k.lastClosed) - 1]);
  const br = [["Umsatz", last.revenue - prev.revenue], ["Materialaufwand", -(last.cogs - prev.cogs)], ["Personal", -(last.personnel - prev.personnel)], ["Sonstige", -(last.other - prev.other)]];
  const mx = Math.max(...br.map(b => Math.abs(b[1])), 1);
  let extra = "";
  if (t.id === "aventra") extra = `<section class="card tbl-wrap"><div class="card-h"><h3>Projekte: Budget gegen Prognose</h3></div><table><tbody>${E.projectMetrics(t).map(p => `<tr><td>${esc(p.id)} ${esc(p.name)}</td><td style="width:45%"><div class="bar" style="height:10px"><i style="width:${Math.min(100, p.eac / Math.max(p.eac, p.budget) * 100)}%;background:${p.eac > p.budget ? "var(--crit)" : "var(--accent)"}"></i></div></td><td class="r num small">${pct(p.eac / p.budget * 100)} des Budgets</td></tr>`).join("")}</tbody></table></section>`;
  if (t.id === "novamart") { const top = t.master.articles.map(a => ({ a, rev: a.weekly.slice(-4).reduce((x, y) => x + y, 0) * a.price })).sort((x, y) => y.rev - x.rev).slice(0, 8); extra = `<section class="card tbl-wrap"><div class="card-h"><h3>Top-Artikel letzte 4 Wochen</h3><span class="small faint">Absatz × Preis</span></div><table><tbody>${top.map(x => `<tr><td>${esc(x.a.name)}</td><td class="r num">${eur(x.rev)}</td><td class="r num small">Reichweite ${Math.round(E.avail(t, x.a.id, "ZL1") / Math.max(0.1, x.a.weekly.slice(-4).reduce((p, q) => p + q, 0) / 28))} Tage</td></tr>`).join("")}</tbody></table></section>`; }
  if (t.id === "elevon") extra = `<section class="card card-pad"><h3>Produktion und Auftragsbestand</h3><div class="kv" style="margin-top:8px"><span>Auftragsbestand</span><span class="num">${eur(k.backlog)}</span><span>Offene Fertigungsaufträge</span><span class="num">${k.openProd}</span><span>Unfertige Erzeugnisse</span><span class="num">${eur(k.wip)}</span><span>Materialaufwand ${perDe(k.lastClosed)}</span><span class="num">${eur(last.cogs)} (${pct(last.cogs / last.revenue * 100)} vom Umsatz)</span></div></section>`;
  return head("Analytics · " + esc(T_NAMES[t.id]), "Kennzahlen") + statusNote("live", "Alle Kennzahlen werden bei jedem Aufruf aus Belegen und Nebenbüchern berechnet – keine eingetragenen Dashboard-Zahlen.")
   + `<div class="grid g4">${kpiCard("Umsatz " + perDe(k.lastClosed), eur(k.revenueLast))}${kpiCard("EBIT-Marge " + perDe(k.lastClosed), pct(k.marginLastPct), "Vormonat " + pct(k.marginPrevPct), k.marginLastPct < k.marginPrevPct ? "var(--crit)" : "")}${kpiCard("Offene Forderungen", eur(k.arOpen))}${kpiCard("Bestandswert", eur(k.inventory))}</div>`
   + `<section class="card card-pad">${trendChart(k)}</section>`
   + `<section class="card card-pad"><div class="row between"><h3>EBIT-Brücke ${perDe(prev.period)} → ${perDe(last.period)}</h3><span class="small faint">${eur(prev.ebit)} → ${eur(last.ebit)}</span></div><div class="list" style="margin-top:8px">${br.map(b => `<div class="row" style="flex-wrap:nowrap;padding:5px 0"><span style="width:140px;flex:none" class="small">${b[0]}</span><div style="flex:1;display:grid;grid-template-columns:1fr 1fr;border-left:0"><div style="display:flex;justify-content:flex-end;border-right:1px solid var(--line-strong)">${b[1] < 0 ? `<i style="display:block;height:14px;border-radius:4px 0 0 4px;width:${Math.abs(b[1]) / mx * 100}%;background:var(--crit)"></i>` : ""}</div><div>${b[1] > 0 ? `<i style="display:block;height:14px;border-radius:0 4px 4px 0;width:${b[1] / mx * 100}%;background:var(--good)"></i>` : ""}</div></div><span class="num small" style="width:110px;flex:none;text-align:right">${b[1] >= 0 ? "+" : ""}${eur(b[1])}</span></div>`).join("")}</div><p class="small faint" style="margin-top:6px">Rechts grün = verbessert das EBIT, links rot = verschlechtert es.</p></section>` + extra;
};

/* --- KI-Assistent: regelbasiert, mit Datenbasis und Rechenweg --- */
VIEWS.ai = () => { const ch = S.chat[S.tenant]; return head("AI Assistant · " + esc(T_NAMES[S.tenant]), "KI-Assistent") + statusNote("proto", "Die Antworten werden regelbasiert aus den aktuellen Daten dieses Mandanten berechnet und zeigen Datenbasis, Zeitraum und Rechenweg. Ein Sprachmodell ist in dieser Demo nicht angebunden.")
  + `<section class="card" style="display:flex;flex-direction:column"><div class="ai-body" id="aiBody" style="min-height:320px">${ch.length ? ch.map(m => m.u ? `<div class="msg u">${esc(m.u)}</div>` : `<div class="msg a">${m.a}</div>`).join("") : `<div style="display:flex;flex-direction:column;gap:8px">${AI_SUGG.map(q => `<button class="qcard" data-act="ask" data-q="${esc(q)}">${ic("ai", 18)}<span>${esc(q)}</span></button>`).join("")}</div>`}</div><form class="ai-f" data-form="chat"><div class="composer"><input id="chatIn" placeholder="Frage stellen oder Aufgabe beschreiben …" aria-label="Frage an den KI-Assistenten"><div class="tools"><button class="send" type="submit" aria-label="Senden">${ic("send", 17)}</button></div></div></form></section>`; };
const AI_SUGG = ["Warum ist unsere operative Marge im letzten Monat gesunken?", "Welche Projekte werden voraussichtlich ihre Budgets überschreiten?", "Welche Produkte sollten wir nächste Woche nachbestellen?", "Welche Produktionsaufträge sind gefährdet?", "Welche Lieferanten haben die schlechteste Liefertreue?", "Zeige die offenen Rechnungen von Elevon.", "Erstelle einen Kundenauftrag."];
const basis = (src, per, how) => `<div class="note acc small" style="flex-direction:column;gap:2px"><span><b>Datenbasis:</b> ${src}</span><span><b>Zeitraum:</b> ${per}</span><span><b>Berechnung:</b> ${how}</span></div>`;
function answer(q) {
  const ql = q.toLowerCase(); let tid = S.tenant; let switched = "";
  for (const id of E.TENANT_IDS) if (ql.includes(id) || ql.includes(T_NAMES[id].split(" ")[0].toLowerCase())) { if (id !== tid) { tid = id; S.tenant = id; switched = `<p class="small muted">Kontext gewechselt zu <b>${T_NAMES[id]}</b>.</p>`; } break; }
  const t = W.tenants[tid];
  if (/marge|gewinn|ebit/.test(ql) && /(gesunken|warum|rückgang|gefallen)/.test(ql)) {
    const k = E.kpis(t), a = E.plOf(t, k.lastClosed), b = E.plOf(t, E._internal.HIST[E._internal.HIST.indexOf(k.lastClosed) - 1]);
    const ch = [["Materialaufwand / Wareneinsatz", -(a.cogs - b.cogs), `${pct(b.cogs / b.revenue * 100)} → ${pct(a.cogs / a.revenue * 100)} vom Umsatz`], ["Umsatz", a.revenue - b.revenue, `${eur(b.revenue)} → ${eur(a.revenue)}`], ["Personal (netto)", -(a.personnel - b.personnel), `${eur(b.personnel)} → ${eur(a.personnel)}`], ["Sonstige Kosten", -(a.other - b.other), `${eur(b.other)} → ${eur(a.other)}`]].sort((x, y) => x[1] - y[1]);
    const drv = ch[0]; let why = "";
    if (t.id === "elevon" && drv[0].startsWith("Material")) why = " Die Herstellkosten je Anlage sind gestiegen: Materialaufwand je ausgelieferter Anlage höher als im Vormonat (Preiserhöhung der Komponenten).";
    if (t.id === "novamart") why = " Der Bruttoumsatz je verkauftem Stück sank durch höhere Rabatte, der Wareneinsatz blieb gleich – die Rohertragsquote fiel.";
    if (t.id === "aventra") why = " Weniger abrechenbare Stunden bei gleichen Gehältern: die Auslastung sank, die Personalkosten blieben.";
    return switched + `<p>Die EBIT-Marge fiel von <b>${pct(b.revenue ? b.ebit / b.revenue * 100 : 0)}</b> (${perDe(b.period)}) auf <b>${pct(a.revenue ? a.ebit / a.revenue * 100 : 0)}</b> (${perDe(a.period)}). Größter Treiber: <b>${drv[0]}</b> mit ${eur(drv[1])} EBIT-Wirkung.${why}</p><table><tbody>${ch.map(c => `<tr><td>${c[0]}</td><td class="r num" style="color:${c[1] < 0 ? "var(--crit)" : "var(--good)"}">${c[1] >= 0 ? "+" : ""}${eur(c[1])}</td><td class="small muted">${c[2]}</td></tr>`).join("")}</tbody></table>`
      + basis(`Hauptbuch ${T_NAMES[tid]}, Konten 4000/4400, 5000, 6000/6990, 6300–6855`, `${perDe(b.period)} gegen ${perDe(a.period)} (abgeschlossene Perioden)`, "EBIT = Umsatz − Materialaufwand − Personal (abzüglich verrechneter Fertigungsleistung) − Sonstige; Wirkung je Position = Veränderung mit Vorzeichen fürs EBIT");
  }
  if (/budget/.test(ql)) { if (t.id !== "aventra") return switched + `<p>Projektbudgets werden in dieser Demo bei <b>Aventra Consulting</b> geführt. Frag mit „… von Aventra“, um den Kontext zu wechseln.</p>`;
    const ps = E.projectMetrics(t).sort((a, b) => b.eac / b.budget - a.eac / a.budget); const over = ps.filter(p => p.eac > p.budget);
    return switched + `<p>${over.length ? `<b>${over.length} Projekt${over.length > 1 ? "e" : ""}</b> überschreiten voraussichtlich ihr Budget:` : "Kein Projekt überschreitet voraussichtlich sein Budget. Die engsten:"}</p><table><thead><tr><th>Projekt</th><th class="r">Budget</th><th class="r">Prognose</th><th class="r">Ist</th></tr></thead><tbody>${(over.length ? over : ps.slice(0, 3)).map(p => `<tr><td>${esc(p.id)} ${esc(p.name)}</td><td class="r num">${eur(p.budget)}</td><td class="r num" style="color:${p.eac > p.budget ? "var(--crit)" : "inherit"}">${eur(p.eac)}</td><td class="r num">${eur(p.actualCost)}</td></tr>`).join("")}</tbody></table>`
      + basis("Freigegebene und abgerechnete Zeitbuchungen, Reisekosten, Restaufwand der Projektleitung", "Projektbeginn bis heute plus Restaufwand", "Prognose (EAC) = Ist-Kosten + Reststunden × durchschnittlicher Kostensatz des Teams");
  }
  if (/nachbestell|nachschub|bestellen sollten|meldebestand/.test(ql)) { if (t.id !== "novamart") return switched + `<p>Nachschubvorschläge rechnet die Demo für <b>NovaMart Retail</b>. Frag mit „… bei NovaMart“.</p>`;
    const pr = E.replenishmentProposals(t).slice(0, 8); return switched + `<p>${pr.length} Artikel liegen unter oder am Meldebestand. Vorschlag für die Bestellung:</p><table><thead><tr><th>Artikel</th><th class="r">verfügbar</th><th class="r">Prognose/Woche</th><th class="r">Menge</th></tr></thead><tbody>${pr.map(p => `<tr><td>${esc(p.name)}</td><td class="r num">${p.available}</td><td class="r num">${p.forecastWeek}</td><td class="r num">${p.qty}</td></tr>`).join("")}</tbody></table><div><a class="btn sm" href="#supply">Zu den Vorschlägen</a></div>`
      + basis("Wöchentlicher Absatz je Artikel, Bestand und Reservierungen Zentrallager, offene Bestellungen", "letzte 8 Wochen", "Prognose = Ø 8 Wochen + 2 × Trend; Menge = Prognose × (Lieferzeit + 2 Wochen Reichweite) + Meldebestand − verfügbar");
  }
  if (/produktionsauftr|fertigungsauftr|gefährdet/.test(ql) && !/go-?live/.test(ql)) { if (t.id !== "elevon") return switched + `<p>Fertigung gibt es in dieser Demo bei <b>Elevon Industries</b>.</p>`;
    const open = t.prodOrders.filter(p => p.status !== "abgeschlossen"); if (!open.length) return switched + `<p>Aktuell gibt es keine offenen Fertigungsaufträge. Lege einen Kundenauftrag an und ermittle den Bedarf, dann prüfe ich die Materialverfügbarkeit.</p>`;
    const rows = open.map(p => { const miss = p.components.filter(c => c.issued < c.qty && E.avail(W.tenants.elevon, c.mat, "WH1") + (p.status === "freigegeben" ? c.qty : 0) < c.qty - c.issued); return { p, miss }; });
    return switched + `<table><thead><tr><th>Auftrag</th><th>Status</th><th>Risiko</th></tr></thead><tbody>${rows.map(x => `<tr><td class="mono small">${x.p.no}</td><td>${stPill(x.p.status)}</td><td>${x.miss.length ? `<span style="color:var(--crit)">Fehlteile: ${x.miss.map(c => esc(E.materialOf(t, c.mat).name)).join(", ")}</span>` : "Material verfügbar"}</td></tr>`).join("")}</tbody></table>` + basis("Fertigungsaufträge, Komponentenbedarf aus Stückliste, frei verfügbarer Bestand WH1", "aktueller Stand", "Gefährdet = benötigte Menge größer als verfügbarer Bestand ohne fremde Reservierungen");
  }
  if (/liefertreue|lieferanten/.test(ql)) { if (t.id !== "novamart") return switched + `<p>Liefertreue-Daten liegen in dieser Demo nur bei <b>NovaMart</b> vor. Bei ${T_NAMES[t.id]} ist die Lieferantenbewertung geplant (Welle 2).</p>`;
    const s = t.master.suppliers.filter(x => x.otd).sort((a, b) => a.otd - b.otd).slice(0, 5); return switched + `<table><thead><tr><th>Lieferant</th><th class="r">Liefertreue</th></tr></thead><tbody>${s.map(x => `<tr><td>${esc(x.name)}</td><td class="r num">${pct(x.otd * 100)}</td></tr>`).join("")}</tbody></table>` + basis("Lieferantenstamm, Kennzahl termingerechte Lieferungen", "Seed-Historie 12 Monate", "Anteil termingerechter Wareneingänge; aus Seed übernommen, noch nicht aus Live-Wareneingängen fortgeschrieben (teilweise implementiert)");
  }
  if (/offene rechnung|offene posten|forderung/.test(ql)) { const l = t.custInvoices.filter(i => i.open > 0); return switched + `<p><b>${l.length}</b> offene Ausgangsrechnungen bei ${T_NAMES[tid]}, Summe <b>${eur(l.reduce((a, i) => a + i.open, 0), 2)}</b>.</p><table><tbody>${l.slice(-8).reverse().map(i => `<tr><td class="mono small">${esc(i.no)}</td><td>${esc(E.customerName(t, i.partnerId))}</td><td class="r num">${eur(i.open, 2)}</td></tr>`).join("")}</tbody></table>` + basis("Debitoren-Nebenbuch, abgestimmt mit Konto 1200", "Stand " + dDe(t.date), "Summe offener Beträge je Rechnung"); }
  if (/projektmarge|marge.*projekt/.test(ql)) { if (t.id !== "aventra") return switched + `<p>Projektmargen gibt es bei <b>Aventra</b>.</p>`; const ps = E.projectMetrics(t); return switched + `<table><tbody>${ps.map(p => `<tr><td>${esc(p.id)} ${esc(p.name)}</td><td class="r num">${pct(p.marginPct)}</td></tr>`).join("")}</tbody></table>` + basis("Ist-Kosten und -Erlöse je Projekt, abrechenbare Leistungen, Restaufwand", "Projektlaufzeit", "Marge = (Erlösprognose − Kostenprognose) / Erlösprognose"); }
  if (/kundenauftrag|bestellung (anlegen|erstellen)|auftrag (anlegen|erstellen)/.test(ql)) {
    if (!switched && !/novamart|elevon/.test(ql)) { S.pending = { q }; return `<p>Für welches Unternehmen soll ich den Kundenauftrag anlegen?</p><div class="row"><button class="btn sm" data-act="ask" data-q="Erstelle einen Kundenauftrag für Elevon.">Elevon: Aufzugsanlagen</button><button class="btn sm" data-act="ask" data-q="Erstelle einen Kundenauftrag für NovaMart.">NovaMart: Onlinebestellung</button></div>`; }
    setTimeout(() => go("sales"), 0); return switched + `<p>Ich öffne ${tid === "elevon" ? "Angebote und Kundenaufträge bei Elevon. Ein Auftrag entsteht dort aus einem freigegebenen Angebot" : "den Onlineshop von NovaMart. Wähle Artikel und Menge, dann löse die Bestellung aus"}. Angelegt wird erst, wenn du bestätigst.</p>`;
  }
  if (/migration|migrier|go-?live|cutover|transformation/.test(ql)) return `<p>Migration, Test und Cutover sind als <b>Prototyp</b> verfügbar (Prototyp v0.2, nicht an diese Engine angebunden). <a href="${PROTO_URL}" target="_blank" rel="noopener">Prototyp öffnen</a>. Geplant: die drei Unternehmen hier als Zielsystem für Testmigrationen.</p>`;
  return switched + `<p>Dazu habe ich noch keine Auswertung. Ich kann Margenrückgänge erklären, Budgetüberschreitungen, Nachbestellungen, gefährdete Fertigungsaufträge, Liefertreue, offene Rechnungen und Projektmargen auswerten oder einen Kundenauftrag vorbereiten.</p>`;
}
function ask(q) { if (!q || !q.trim()) return; const a = answer(q); S.chat[S.tenant].push({ u: q }, { a }); if (route() !== "ai") go("ai"); else render(); }

/* ---------- Geführte Demo-Storys ---------- */
const lastObj = (c, k) => c[k];
const STORIES = [
  { id: "industrial", tenant: "elevon", cross: [], short: "Auftrag bis Montage", title: "From Customer Order to Manufacturing, Installation and Service", situation: "Rheinpark Immobilien plant ein Bürogebäude und möchte 12 Aufzugsanlagen. Lager und Werk Stuttgart sind normal ausgelastet.", problem: "Antriebe und Steuerungen reichen nicht für 12 Anlagen. Der Vertrieb braucht eine belastbare Kalkulation, Einkauf und Fertigung müssen rechtzeitig reagieren.", value: "Ein Vorgang durchläuft Vertrieb, Disposition, Einkauf, Fertigung, Montage und Finanzen ohne Medienbruch. Umsatz und Kosten entstehen zum richtigen Zeitpunkt, die Marge ist jederzeit nachvollziehbar.", steps: [
    { t: "Angebot kalkulieren", d: "12 Anlagen, 6 % Rabatt. Kalkulation aus Stückliste, Fertigungs- und Montagestunden.", user: "u3", cmd: "createQuote", p: () => ({ customerId: "C-RHEIN", qty: 12, discountPct: 6 }), save: "quote" },
    { t: "Angebot freigeben", d: "Rabatt über 5 % braucht die Freigabe des CFO.", user: "u2", cmd: "approveQuote", p: c => ({ quoteNo: c.quote }) },
    { t: "Kundenauftrag anlegen", d: "Achte rechts darauf: keine Buchung, kein Zahlungseingang.", user: "u3", cmd: "createSalesOrder", p: c => ({ quoteNo: c.quote }), save: "so" },
    { t: "Materialbedarf ermitteln", d: "Stückliste × 12 gegen frei verfügbaren Bestand.", user: "u4", cmd: "runMRP", p: c => ({ soNo: c.so }) },
    { t: "Fehlteile bestellen", d: "Bestellungen je Lieferant, ohne Buchung.", user: "u5", cmd: "createPOsFromMRP", p: c => ({ soNo: c.so }), save: "pos" },
    { t: "Wareneingang buchen", d: "Bestand steigt, Buchung gegen WE/RE-Verrechnung.", user: "u6", multi: c => W.tenants.elevon.purchaseOrders.filter(p => p.so === c.so && p.status === "bestellt").map(p => ["postGoodsReceipt", { poNo: p.no }]) },
    { t: "Eingangsrechnungen prüfen", d: "Drei-Wege-Abgleich Bestellung, Wareneingang, Rechnung.", user: "u5", multi: c => W.tenants.elevon.purchaseOrders.filter(p => p.so === c.so && p.status === "geliefert").map(p => ["postSupplierInvoice", { poNo: p.no }]) },
    { t: "Fertigungsauftrag freigeben", d: "Verfügbarkeitsprüfung und Reservierung der Komponenten.", user: "u4", cmd: "releaseProdOrder", p: c => ({ prodNo: W.tenants.elevon.prodOrders.find(p => p.so === c.so).no }) },
    { t: "Materialverbrauch buchen", d: "Komponenten verlassen das Lager, Wert geht auf unfertige Erzeugnisse.", user: "u4", cmd: "postConsumption", p: c => ({ prodNo: W.tenants.elevon.prodOrders.find(p => p.so === c.so).no }) },
    { t: "Fertigung rückmelden", d: "576 Montagestunden werden als Fertigungsleistung verrechnet.", user: "u4", cmd: "confirmProduction", p: c => ({ prodNo: W.tenants.elevon.prodOrders.find(p => p.so === c.so).no }) },
    { t: "Produktion abschließen", d: "Fertigware zu Ist-Herstellkosten ins Lager.", user: "u4", cmd: "completeProduction", p: c => ({ prodNo: W.tenants.elevon.prodOrders.find(p => p.so === c.so).no }) },
    { t: "Lieferung", d: "Warenausgang: jetzt entsteht der Wareneinsatz.", user: "u6", cmd: "postGoodsIssue", p: c => ({ soNo: c.so }) },
    { t: "Montage erfassen", d: "1.152 Montagestunden als Projektkosten (Kostenrechnung).", user: "u7", cmd: "recordInstallation", p: c => ({ soNo: c.so }) },
    { t: "Abnahme dokumentieren", d: "Erst jetzt ist der Umsatz realisierbar.", user: "u7", cmd: "confirmAcceptance", p: c => ({ soNo: c.so }) },
    { t: "Rechnung erstellen", d: "Forderung, Umsatz und Umsatzsteuer.", user: "u2", cmd: "invoiceSalesOrder", p: c => ({ soNo: c.so }) },
    { t: "14 Tage später: Zahlungseingang", d: "Geschäftsdatum vorspulen und Zahlung buchen.", user: "u2", multi: c => [["advanceDate", { days: 14 }], ["receivePayment", { invoiceNo: W.tenants.elevon.custInvoices.find(i => i.ref && i.ref.id === c.so).no }]] },
    { t: "Ergebnis prüfen", d: "Frag den Assistenten nach der Marge oder öffne Analytics.", ask: "Warum ist unsere operative Marge im letzten Monat gesunken?" }
  ], outro: "Service-to-Cash (Störung, Ersatzteil, Techniker) ist geplant für Welle 2 und in dieser Demo noch nicht ausführbar." },
  { id: "retail", tenant: "novamart", cross: [], short: "Bestellung bis Nachschub", title: "From Customer Demand to Intelligent Fulfillment", situation: "Ein NovaClub-Kunde bestellt online einen 55-Zoll-Fernseher. Im Zentrallager liegen 21 Stück, Meldebestand 20.", problem: "Der Verkauf muss Bestand, Zahlung und Finanzen korrekt bewegen, und der Bestand darf nicht unbemerkt unter den Meldebestand fallen.", value: "Verkauf, Lager, Beschaffung und Finanzen arbeiten auf denselben Daten. Der Nachschub entsteht aus der Prognose, nicht aus einem Bauchgefühl.", steps: [
    { t: "Kunde bestellt online", d: "Verfügbarkeit, Preis, NovaClub-Rabatt, Zahlungsautorisierung, Reservierung – keine Buchung.", user: "u3", cmd: "placeWebOrder", p: () => ({ customerId: W.tenants.novamart.master.customers.find(c => c.loyalty).id, articleId: "A-10001", qty: 1 }), save: "wo" },
    { t: "Kommissionieren", d: "Lagerauftrag im Zentrallager.", user: "u4", cmd: "pickOrder", p: c => ({ orderNo: c.wo }) },
    { t: "Versenden", d: "Bestand und Reservierung sinken, Wareneinsatz wird gebucht.", user: "u4", cmd: "shipOrder", p: c => ({ orderNo: c.wo }) },
    { t: "Zustellung bestätigen", d: "Status vom Logistikpartner.", user: "u4", cmd: "confirmDelivery", p: c => ({ orderNo: c.wo }) },
    { t: "Rechnung erstellen", d: "Umsatz und Forderung gegen den Zahlungsdienstleister.", user: "u3", cmd: "invoiceWebOrder", p: c => ({ orderNo: c.wo }) },
    { t: "Zahlung abgleichen", d: "Auszahlung abzüglich Gebühr – jetzt erst Geld auf der Bank. Marge wird berechnet.", user: "u2", cmd: "settlePSP", p: c => ({ orderNo: c.wo }) },
    { t: "KI: Was nachbestellen?", d: "Der Fernseher liegt jetzt am Meldebestand.", ask: "Welche Produkte sollten wir nächste Woche nachbestellen?" },
    { t: "Nachschub bestellen", d: "Bestellvorschlag aus Prognose und Lieferzeit übernehmen.", user: "u5", cmd: "createReplenishment", p: () => ({ articleId: "A-10001" }), save: "po" },
    { t: "Wareneingang", d: "Bestand steigt, WE/RE-Verrechnung.", user: "u4", cmd: "postGoodsReceipt", p: c => ({ poNo: c.po }) },
    { t: "Rechnungsprüfung", d: "Drei-Wege-Abgleich.", user: "u5", cmd: "postSupplierInvoice", p: c => ({ poNo: c.po }) },
    { t: "Lieferant bezahlen", d: "Verbindlichkeit wird ausgeglichen.", user: "u2", cmd: "payVendor", p: c => ({ invoiceNo: W.tenants.novamart.supInvoices.find(i => i.poNo === c.po).no }) }
  ], outro: "Retouren und Click & Collect folgen in Welle 2 auf derselben Engine." },
  { id: "services", tenant: "aventra", cross: ["elevon"], short: "Zeit bis Zahlung", title: "From Opportunity to Profitable Project Delivery", situation: "Aventra führt die S/4HANA-Transformation bei Elevon durch (P-1001, Budget 500.000 €). Drei Berater haben diese Woche Zeiten erfasst.", problem: "Die Projektleitung muss Zeiten freigeben, korrekt abrechnen und sieht, dass die Prognose das Budget übersteigt.", value: "Zeit, Kosten, Abrechnung und Zahlung hängen zusammen – über Unternehmensgrenzen hinweg. Abweichungen sind sichtbar, bevor das Budget aufgebraucht ist.", steps: [
    { t: "Ausgangslage analysieren", d: "Welche Projekte laufen aus dem Budget?", ask: "Welche Projekte werden voraussichtlich ihre Budgets überschreiten?" },
    { t: "Berater erfasst 8 Stunden", d: "Status erfasst – noch keine Kosten.", user: "u4", cmd: "recordTime", p: () => ({ projectId: "P-1001", employeeId: W.tenants.aventra.projects[0].team[3].employee, hours: 8 }) },
    { t: "Projektleitung gibt frei", d: "Jetzt steigen die Projektkosten (Stunden × Kostensatz).", user: "u3", cmd: "approveTime", p: () => ({ projectId: "P-1001" }) },
    { t: "Reisekosten erfassen", d: "Gebucht und dem Projekt belastet.", user: "u4", cmd: "recordExpense", p: () => ({ projectId: "P-1001", employeeId: W.tenants.aventra.projects[0].team[3].employee, amount: 240, text: "Bahn und Hotel Stuttgart" }) },
    { t: "Rechnung an Elevon", d: "Forderung und Umsatz bei Aventra; bei Elevon entsteht ein Eingang.", user: "u3", cmd: "invoiceProject", p: () => ({ projectId: "P-1001" }) },
    { t: "Elevon prüft und bucht die Rechnung", d: "Wechsel zu Elevon: erst die Prüfung bucht die Verbindlichkeit.", tenant: "elevon", user: "u2", multi: () => W.tenants.elevon.inbox.filter(m => m.status === "offen" && m.type === "supplierInvoice" && m.from === "aventra").map(m => ["processInbox", { id: m.id }]) },
    { t: "Elevon bezahlt", d: "Zahlungsavis geht an Aventra.", tenant: "elevon", user: "u2", multi: () => W.tenants.elevon.supInvoices.filter(i => i.open > 0 && i.partnerId === "S-AVENTRA" && i.period === E.periodOf(W.tenants.elevon.date)).map(i => ["payVendor", { invoiceNo: i.no }]) },
    { t: "Aventra bucht den Zahlungseingang", d: "Forderung wird ausgeglichen.", tenant: "aventra", user: "u2", multi: () => W.tenants.aventra.inbox.filter(m => m.status === "offen" && m.type === "paymentAdvice").map(m => ["processInbox", { id: m.id }]) },
    { t: "Projektmarge analysieren", d: "Prognose, Marge und nächste Schritte.", ask: "Analysiere die Projektmarge von Aventra." }
  ], outro: "Lead und Opportunity sowie Managed-Services-Tickets folgen in Welle 2." },
  { id: "crosslift", tenant: "novamart", cross: ["elevon"], short: "Filiale kauft Aufzüge", title: "Unternehmensübergreifend: NovaMart kauft Aufzüge bei Elevon", situation: "NovaMart baut eine Filiale um und braucht zwei Aufzüge. Lieferant ist Elevon.", problem: "Zwei Unternehmen, zwei Buchungskreise: Bestellung, Fertigung, Lieferung, Aktivierung, Rechnung und Zahlung müssen in beiden Büchern zusammenpassen.", value: "Jede Seite bucht nur, was sie geprüft hat. Am Ende stimmen Anlage, Verbindlichkeit, Forderung und Zahlung in beiden Unternehmen überein.", steps: [
    { t: "NovaMart bestellt 2 Aufzüge", d: "Bestellung ohne Buchung; Eingang bei Elevon.", tenant: "novamart", user: "u5", cmd: "orderLiftsFromElevon", p: () => ({ qty: 2 }), save: "po" },
    { t: "Elevon legt den Kundenauftrag an", d: "Aus dem Eingang wird ein Kundenauftrag.", tenant: "elevon", user: "u3", multi: () => W.tenants.elevon.inbox.filter(m => m.status === "offen" && m.type === "customerOrder").map(m => ["processInbox", { id: m.id }]) },
    { t: "Elevon: Bedarf, Einkauf, Wareneingang", d: "Fehlteile bestellen und Wareneingang buchen.", tenant: "elevon", user: "u4", multi: () => { const so = W.tenants.elevon.salesOrders.filter(s => s.link).slice(-1)[0]; return [["runMRP", { soNo: so.no }]]; }, then: () => { const t = W.tenants.elevon; const so = t.salesOrders.filter(s => s.link).slice(-1)[0]; if (so.mrp.shortages.length) { act("createPOsFromMRP", { soNo: so.no }, { tenant: "elevon", auto: true }); for (const po of t.purchaseOrders.filter(p => p.so === so.no && p.status === "bestellt")) act("postGoodsReceipt", { poNo: po.no }, { tenant: "elevon", auto: true }); } } },
    { t: "Elevon fertigt", d: "Freigabe, Verbrauch, Rückmeldung, Abschluss.", tenant: "elevon", user: "u4", multi: () => { const t = W.tenants.elevon; const so = t.salesOrders.filter(s => s.link).slice(-1)[0]; const pa = t.prodOrders.find(p => p.so === so.no).no; return [["releaseProdOrder", { prodNo: pa }], ["postConsumption", { prodNo: pa }], ["confirmProduction", { prodNo: pa }], ["completeProduction", { prodNo: pa }]]; } },
    { t: "Elevon liefert", d: "Warenausgang bei Elevon, Lieferavis an NovaMart.", tenant: "elevon", user: "u6", multi: () => [["postGoodsIssue", { soNo: W.tenants.elevon.salesOrders.filter(s => s.link).slice(-1)[0].no }]] },
    { t: "NovaMart bucht den Wareneingang", d: "Die Aufzüge werden als Anlage aktiviert.", tenant: "novamart", user: "u4", multi: () => W.tenants.novamart.inbox.filter(m => m.status === "offen" && m.type === "delivery").map(m => ["processInbox", { id: m.id }]) },
    { t: "Elevon montiert und lässt abnehmen", d: "Montagekosten, Abnahme, dann Rechnung an NovaMart.", tenant: "elevon", user: "u7", multi: () => { const so = W.tenants.elevon.salesOrders.filter(s => s.link).slice(-1)[0].no; return [["recordInstallation", { soNo: so }], ["confirmAcceptance", { soNo: so }], ["invoiceSalesOrder", { soNo: so }]]; } },
    { t: "NovaMart prüft die Rechnung", d: "Drei-Wege-Abgleich gegen Bestellung und Wareneingang.", tenant: "novamart", user: "u5", multi: () => W.tenants.novamart.inbox.filter(m => m.status === "offen" && m.type === "supplierInvoice" && m.from === "elevon").map(m => ["processInbox", { id: m.id }]) },
    { t: "NovaMart bezahlt", d: "Zahlungsavis an Elevon.", tenant: "novamart", user: "u2", multi: c => W.tenants.novamart.supInvoices.filter(i => i.poNo === c.po && i.open > 0).map(i => ["payVendor", { invoiceNo: i.no }]) },
    { t: "Elevon bucht den Zahlungseingang", d: "Beide Bücher sind ausgeglichen.", tenant: "elevon", user: "u2", multi: () => W.tenants.elevon.inbox.filter(m => m.status === "offen" && m.type === "paymentAdvice").map(m => ["processInbox", { id: m.id }]) }
  ], outro: "Prüfe in Finance beider Unternehmen: Anlage 0700 bei NovaMart, Umsatz 4000 bei Elevon – gleicher Betrag, gleiche Rechnungsnummer." }
];
function storyPanel() {
  const st = STORIES.find(s => s.id === S.story.id); const i = S.story.i;
  return `<section class="card card-pad story" style="display:flex;flex-direction:column;gap:12px"><div class="row between"><div><p class="eyebrow">Guided Demo · ${i}/${st.steps.length} Schritte</p><h2>${esc(st.title)}</h2></div><button class="btn sm" data-act="endStory">Beenden</button></div>
   ${i === 0 ? `<div class="kv"><span>Ausgangslage</span><span>${esc(st.situation)}</span><span>Problem</span><span>${esc(st.problem)}</span></div>` : ""}
   <div class="stepl">${st.steps.map((s, k) => k < i - 2 || k > i + 2 ? "" : `<div class="si ${k < i ? "done" : k === i ? "cur" : ""}"><span class="no">${k < i ? "✓" : k + 1}</span><div style="flex:1"><b>${esc(s.t)}</b>${s.tenant ? ` ${pill("p-acc", T_NAMES[s.tenant])}` : ""}<div class="small muted">${esc(s.d)}</div></div>${k === i ? `<button class="btn pri sm" data-act="storyStep">${s.ask ? "KI fragen" : "Ausführen"}</button>` : ""}</div>`).join("")}</div>
   ${i >= st.steps.length ? `<div class="note good"><div><b>Geschäftliches Ergebnis:</b> ${esc(st.value)}<br><span class="small">${esc(st.outro)}</span></div></div><div class="row"><button class="btn" data-act="resetStory">Zurücksetzen und erneut vorführen</button></div>` : ""}</section>`;
}
function storyStep() {
  const st = STORIES.find(s => s.id === S.story.id); const s = st.steps[S.story.i]; if (!s) return;
  const tid = s.tenant || st.tenant; if (S.tenant !== tid) S.tenant = tid;
  if (s.user) S.users[tid] = s.user;
  if (s.ask) { S.story.i++; ask(s.ask); return; }
  const c = S.story.ctx; let ok = true;
  if (s.multi) { const list = s.multi(c); if (!list.length && !s.then) { toast("Für diesen Schritt gibt es nichts zu tun – weiter.", false); } for (const [cmd, p] of list) { const r = act(cmd, p, { tenant: tid, user: s.user, auto: true }); if (!r.ok) { ok = false; break; } } if (ok && s.then) s.then(c); }
  else { const r = act(s.cmd, s.p(c), { tenant: tid, user: s.user, auto: true }); ok = r.ok; if (ok && s.save) c[s.save] = r.objects[0]; }
  if (ok) { S.story.i++; saveLog(); }
  render();
}

/* ---------- Demo Control Center ---------- */
VIEWS.admin = () => {
  if (!S.admin) return `<div class="lock card card-pad">${ic("shield", 34)}<h2>Demo Control Center</h2><p class="muted">Geschützter Administrationsbereich. Demo-PIN: <span class="hash">2026</span></p><form class="pin" data-form="pin"><input class="input" id="pinIn" inputmode="numeric" autocomplete="off" placeholder="PIN" aria-label="PIN"><button class="btn pri" type="submit">Entsperren</button></form><p class="small faint">Hinweis: In der Browser-Demo ist das ein Bedienschutz gegen versehentliches Zurücksetzen, keine echte Zugriffskontrolle.</p></div>`;
  const rows = E.TENANT_IDS.map(id => { const t = W.tenants[id]; const h = E.tenantHash(t); return `<tr><td><span class="dotc c-${id}" style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px"></span><b>${T_NAMES[id]}</b><div class="small faint">${t.companies.length} Gesellschaften · ${num(t.docs.length)} Belege · Datum ${dDe(t.date)}</div></td><td><span class="hash">${BASE[id]}</span></td><td><span class="hash">${h}</span> ${h === BASE[id] ? pill("p-good", "Ausgangszustand") : pill("p-warn", "verändert")}</td><td class="r"><button class="btn sm" data-act="resetT" data-id="${id}">Zurücksetzen</button></td></tr>`; }).join("");
  return head("Administration", "Demo Control Center", `<button class="btn" data-act="lockAdmin">Sperren</button>`)
   + `<section class="card"><div class="card-h"><h3>Demo-Unternehmen und Reproduzierbarkeit</h3><button class="btn danger sm" data-act="resetAllBtn">Alle zurücksetzen</button></div><div class="tbl-wrap"><table><thead><tr><th>Unternehmen</th><th>Fingerabdruck Ausgangszustand</th><th>Aktueller Zustand</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><p class="small faint" style="padding:10px 16px">Qualitätsziel: Nach dem Zurücksetzen stimmt der Fingerabdruck exakt mit dem Ausgangszustand überein. Der Reset betrifft nur den gewählten Mandanten.</p></section>`
   + `<div class="grid g2"><section class="card card-pad" style="display:flex;flex-direction:column;gap:10px"><h3>Seed und Datenmenge</h3><p class="small muted">Reproduzierbarer Seed 20261102. Größe ändert Stammdaten und Historie aller drei Unternehmen.</p><div class="seg">${["S", "M", "L"].map(z => `<button class="${S.size === z ? "on" : ""}" data-act="size" data-z="${z}">${z}</button>`).join("")}</div><div class="small muted">Elevon: ${num(W.tenants.elevon.master.customers.length)} Kunden, ${num(W.tenants.elevon.master.materials.length)} Materialien · NovaMart: ${num(W.tenants.novamart.master.articles.length)} Artikel, ${num(W.tenants.novamart.master.customers.length)} Kunden · Aventra: ${num(W.tenants.aventra.master.employees.length)} Mitarbeitende, ${W.tenants.aventra.projects.length} Projekte</div></section>
     <section class="card card-pad" style="display:flex;flex-direction:column;gap:10px"><h3>Geschäftszeit · ${esc(T_NAMES[S.tenant])}</h3><p class="small muted">Simuliertes Datum ${dDe(T().date)}, offene Periode ${perDe(E.periodOf(T().date))}.</p><div class="row"><button class="btn" data-act="run" data-cmd="advanceDate" data-p='{"days":1}'>+1 Tag</button><button class="btn" data-act="run" data-cmd="advanceDate" data-p='{"days":7}'>+7 Tage</button><button class="btn pri" data-act="runAuto" data-cmd="closePeriod" data-p='{}'>Monatsabschluss</button></div></section></div>`
   + `<section class="card"><div class="card-h"><h3>Geführte Szenarien</h3><div class="seg"><button class="${S.mode === "guided" ? "on" : ""}" data-act="setMode" data-m="guided">Guided Demo</button><button class="${S.mode === "free" ? "on" : ""}" data-act="setMode" data-m="free">Free Exploration</button></div></div><div class="list">${STORIES.map(s => `<div class="li"><div class="grow"><b>${esc(s.title)}</b><div class="small faint">${esc(T_NAMES[s.tenant])}${s.cross.length ? " ↔ " + s.cross.map(x => T_NAMES[x]).join(", ") : ""} · ${s.steps.length} Schritte · ca. ${Math.round(s.steps.length * 0.9)} Minuten</div></div><button class="btn sm" data-act="startStory" data-id="${s.id}" data-reset="1">Zurücksetzen und starten</button></div>`).join("")}</div></section>`
   + `<section class="card"><div class="card-h"><h3>Selbsttest im Browser</h3><button class="btn sm pri" data-act="selfTest">Jetzt prüfen</button></div><div class="card-pad">${S.selfTest ? `<div class="list">${S.selfTest.map(r => `<div class="li" style="padding:6px 0">${r[0] ? pill("p-good", "ok") : pill("p-crit", "Fehler")}<span class="grow small">${esc(r[1])}</span></div>`).join("")}</div>` : `<p class="small muted">Prüft auf einer separaten Kopie: Belege ausgeglichen, Nebenbücher = Hauptbuch, Reset reproduzierbar, Reset nur je Mandant. Die 38 vollständigen Akzeptanztests laufen automatisiert außerhalb des Browsers.</p>`}</div></section>`
   + `<section class="card tbl-wrap"><div class="card-h"><h3>Audit-Log · ${esc(T_NAMES[S.tenant])}</h3><span class="small faint">${LOG.length} Aktionen in dieser Sitzung</span></div><table><tbody>${T().audit.slice(-12).reverse().map(a => `<tr><td class="num small">${dDe(a.date)}</td><td class="small">${esc(a.user)}</td><td>${esc(a.text)}</td><td class="mono small">${esc((a.docs || []).join(", "))}</td></tr>`).join("")}</tbody></table></section>`;
};
function selfTest() {
  const out = []; const w = E.createWorld({ size: S.size });
  for (const id of E.TENANT_IDS) { const t = w.tenants[id]; const bad = t.docs.filter(d => Math.abs(d.lines.reduce((a, l) => a + l.dr - l.cr, 0)) > 0.01).length; out.push([bad === 0, `${T_NAMES[id]}: ${t.docs.length} Belege, ${bad} unausgeglichen`]); out.push([Math.abs(E.balance(t, "1200") - t.custInvoices.reduce((a, i) => a + i.open, 0)) < 0.02, `${T_NAMES[id]}: Debitoren = Konto 1200`]); }
  const h0 = E.tenantHash(w.tenants.novamart); E.dispatch(w, "novamart", "placeWebOrder", { articleId: "A-10001", qty: 1 }, { auto: true }); const hE = E.tenantHash(w.tenants.elevon); E.resetTenant(w, "novamart");
  out.push([E.tenantHash(w.tenants.novamart) === h0, "Reset NovaMart stellt Ausgangszustand exakt her"]); out.push([E.tenantHash(w.tenants.elevon) === hE, "Reset NovaMart lässt Elevon unverändert"]);
  out.push([E.TENANT_IDS.every(id => BASE[id] === E.tenantHash(w.tenants[id])), "Fingerabdrücke entsprechen dem Ausgangszustand"]);
  S.selfTest = out; render();
}

/* ---------- Geplante und Prototyp-Module ---------- */
const PLANNED = {
  hr: ["Human Resources", "plan", "Mitarbeiterstamm, Organisation, Zeiten, Abwesenheiten und Self-Service sind für Welle 2 geplant. Heute nutzt die Engine Mitarbeiter nur als Ressource mit Kostensatz (Aventra, Elevon-Montage). Payroll bleibt bewusst Platzhalter."],
  assets: ["Asset Management", "plan", "Technische Objekte, Wartungspläne, Stör- und Wartungsaufträge sowie Ersatzteile sind für Welle 2 geplant (Service-to-Cash und Maintain-to-Operate bei Elevon). Der Anlagenbestand ist bereits als Stammdaten vorhanden."],
  migrations: ["Migrations", "proto", "Der geführte Migrations-Assistent mit Vier-Augen-Freigabe existiert als Prototyp v0.2 mit Test-Engine. Geplant: die drei Unternehmen als Zielsystem für Testmigrationen."],
  transformation: ["Transformation", "proto", "Projekt-, Test- und Cutover-Management existieren als Prototyp v0.2, noch nicht auf dieser Engine."]
};
for (const [k, [title, st, txt]] of Object.entries(PLANNED)) VIEWS[k] = () => head(st === "plan" ? "Geplant" : "Prototyp", title) + statusNote(st, txt) + (st === "proto" ? `<section class="card card-pad"><a class="btn pri" href="${PROTO_URL}" target="_blank" rel="noopener">Prototyp v0.2 öffnen</a></section>` : "");

/* ---------- Ereignisse ---------- */
const ACT = {
  tenant(d) { S.tenant = d.id; S.sel = {}; if (d.go) go(d.go); else render(); saveLog(); },
  userMenu() { S.menu = !S.menu; renderLayer(); }, closeMenu() { S.menu = false; renderLayer(); },
  setUser(d) { S.users[S.tenant] = d.id; S.menu = false; renderLayer(); render(); saveLog(); },
  theme() { const r = document.documentElement, c = r.getAttribute("data-theme"), dark = c ? c === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.setAttribute("data-theme", dark ? "light" : "dark"); },
  toggleLive() { S.live = !S.live; render(); }, toggleMode() { S.mode = S.mode === "guided" ? "free" : "guided"; render(); saveLog(); }, setMode(d) { S.mode = d.m; render(); saveLog(); },
  goAdmin() { go("admin"); },
  run(d) { act(d.cmd, JSON.parse(d.p || "{}")); }, runAuto(d) { act(d.cmd, JSON.parse(d.p || "{}"), { auto: true }); },
  retryAuto() { const r = S.last.retry; act(r.cmd, r.payload, { tenant: r.tenant, auto: true }); },
  inbox(d) { act("processInbox", { id: d.id }); },
  evt(d) { const [k, ...v] = d.v.split(":"); if (k === "ask") ask(v.join(":")); else go(v.join(":")); },
  ask(d) { ask(d.q); },
  doc(d) { const t = T(); const doc = t.docs.find(x => x.no === d.no); if (!doc) return; S.modal = () => `<div style="padding:20px;display:flex;flex-direction:column;gap:12px"><div class="row between"><h2>${esc(doc.no)}</h2><button class="icon-btn" data-act="closeModal" aria-label="Schließen">${ic("x", 15)}</button></div><div class="kv"><span>Text</span><span>${esc(doc.text)}</span><span>Datum</span><span>${dDe(doc.date)} · Periode ${perDe(doc.period)}</span><span>Benutzer</span><span>${esc(doc.user)}</span>${doc.ref ? `<span>Bezug</span><span>${esc(doc.ref.type)} ${esc(doc.ref.id)}</span>` : ""}</div><div class="docbox"><table><thead><tr><th>Konto</th><th>Bezeichnung</th><th class="r">Soll</th><th class="r">Haben</th></tr></thead><tbody>${doc.lines.map(l => `<tr><td class="mono">${l.acct}</td><td>${esc(E.COA[l.acct][0])}</td><td class="r num">${l.dr ? eur(l.dr, 2) : ""}</td><td class="r num">${l.cr ? eur(l.cr, 2) : ""}</td></tr>`).join("")}</tbody></table></div></div>`; renderLayer(); },
  closeModal() { S.modal = null; renderLayer(); },
  selInst(d) { S.sel.inst = d.id; S.sel.step = null; render(); }, selInstGo(d) { S.sel.inst = d.id; S.sel.step = null; go("processes"); }, selStep(d) { S.sel.step = +d.i; render(); },
  selProj(d) { S.sel.proj = d.id; render(); }, finTab(d) { S.tab.fin = d.t; render(); },
  createQuote() { const q = S.sel.quote || { customerId: "C-RHEIN", qty: 12, discountPct: 6 }; act("createQuote", { customerId: q.customerId, qty: +q.qty, discountPct: +q.discountPct }); },
  placeOrder() { const s = S.sel.shop || { articleId: "A-10001", qty: 1, couponPct: 0, customerId: "K-300001" }; act("placeWebOrder", { articleId: s.articleId, qty: +s.qty, couponPct: +s.couponPct, customerId: s.customerId }); },
  newSO() { if (S.tenant !== "elevon") { S.tenant = "elevon"; } S.modal = () => `<form data-form="so" style="padding:20px;display:flex;flex-direction:column;gap:12px"><h2>Direktauftrag Elevon</h2><label class="f">Kunde<select class="input" id="soCust" autofocus>${W.tenants.elevon.master.customers.slice(0, 30).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><div class="grid g2"><label class="f">Anlagen<input class="input" id="soQty" type="number" min="1" value="2"></label><label class="f">Preis je Anlage €<input class="input" id="soPrice" type="number" value="60000"></label></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="closeModal">Abbrechen</button><button class="btn pri" type="submit">Auftrag anlegen</button></div></form>`; renderLayer(); },
  findStaff() { const r = E.dispatch(W, "aventra", "findStaff", { skill: S.sel.skill || "SAP FI/CO" }, { user: S.users.aventra }); S.sel.staff = r.result; render(); },
  assign() { const ids = [...document.querySelectorAll(".stc:checked")].map(x => x.value); if (!ids.length) return toast("Bitte mindestens eine Person auswählen.", true); act("assignStaff", { projectId: S.sel.proj || "P-1001", employeeIds: ids, hoursPerMonth: 40 }); S.sel.staff = null; render(); },
  startStory(d) { if (d.reset) { const st = STORIES.find(s => s.id === d.id); for (const id of [st.tenant].concat(st.cross)) { E.resetTenant(W, id); logEntry({ reset: id }); } S.last = null; } S.story = { id: d.id, i: 0, ctx: {} }; S.mode = "guided"; const st = STORIES.find(s => s.id === d.id); S.tenant = st.tenant; go("processes"); },
  storyStep() { storyStep(); }, endStory() { S.story = null; render(); },
  resetStory() { const id = S.story.id; ACT.startStory({ id, reset: 1 }); },
  resetT(d) { E.resetTenant(W, d.id); logEntry({ reset: d.id }); S.last = null; toast(T_NAMES[d.id] + " auf Ausgangszustand zurückgesetzt"); render(); },
  resetAllBtn() { E.resetAll(W); if (!(typeof persist === "function" && persist({ resetAll: true }))) { LOG = []; saveLog(); } S.last = null; S.story = null; S.chat = { elevon: [], novamart: [], aventra: [] }; toast("Alle drei Unternehmen zurückgesetzt"); render(); },
  size(d) { S.size = d.z; W = E.createWorld({ size: S.size }); captureBase(); if (!(typeof persist === "function" && persist({ size: d.z }))) { LOG = []; saveLog(); } S.last = null; S.story = null; S.selfTest = null; render(); },
  selfTest() { selfTest(); }, lockAdmin() { S.admin = false; render(); },
  palette() { openPalette(); }, palRun(d) { const [k, ...v] = d.v.split(":"); S.modal = null; renderLayer(); if (k === "go") go(v.join(":")); else if (k === "story") ACT.startStory({ id: v[0], reset: 1 }); else ask(v.join(":")); }
};
const ON = {
  qf(v, el) { S.sel.quote = Object.assign(S.sel.quote || { customerId: "C-RHEIN", qty: 12, discountPct: 6 }, { [el.dataset.k]: el.dataset.k === "customerId" ? v : +v }); S.focus = el.id; render(); },
  sf(v, el) { S.sel.shop = Object.assign(S.sel.shop || { articleId: "A-10001", qty: 1, couponPct: 0, customerId: "K-300001" }, { [el.dataset.k]: ["articleId", "customerId"].includes(el.dataset.k) ? v : +v }); S.focus = el.id; render(); },
  skill(v) { S.sel.skill = v; S.sel.staff = null; render(); },
  stockQ(v, el) { S.sel.stockQ = v; S.focus = el.id; render(); const f = document.getElementById("stockQ"); if (f) f.setSelectionRange(v.length, v.length); },
  pal(v) { S.pal = v; renderLayer(); const el = document.getElementById("palIn"); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }
};
const FORMS = {
  ask() { ask(document.getElementById("askIn").value); }, chat() { ask(document.getElementById("chatIn").value); },
  pin() { if (document.getElementById("pinIn").value === "2026") { S.admin = true; render(); } else toast("PIN falsch.", true); },
  time() { act("recordTime", { projectId: S.sel.proj || "P-1001", employeeId: document.getElementById("tEmp").value, hours: +document.getElementById("tH").value }); },
  exp() { act("recordExpense", { projectId: S.sel.proj || "P-1001", amount: +document.getElementById("xAmt").value, text: document.getElementById("xText").value }); },
  so() { const p = { customerId: document.getElementById("soCust").value, qty: +document.getElementById("soQty").value, unitPrice: +document.getElementById("soPrice").value }; S.modal = null; renderLayer(); S.tenant = "elevon"; act("createSalesOrder", p, { auto: S.mode === "guided" }); },
  pal() { const v = (S.pal || "").trim(); S.modal = null; renderLayer(); if (v) ask(v); }
};
function openPalette() {
  S.pal = ""; S.modal = () => { const q = (S.pal || "").toLowerCase(); const items = visibleMods().map(m => [MODS[m][0], "go:" + m]).concat(STORIES.map(s => ["Demo: " + s.title, "story:" + s.id]), AI_SUGG.map(a => [a, "ask:" + a])).filter(x => !q || x[0].toLowerCase().includes(q)).slice(0, 12);
    return `<form data-form="pal" style="padding:10px;border-bottom:1px solid var(--line)"><input class="input" id="palIn" autofocus placeholder="Seite, Demo oder Frage – Enter fragt den Assistenten" value="${esc(S.pal)}" data-on="pal" aria-label="Suche"></form><div>${items.map(i => `<button class="pal-item" data-act="palRun" data-v="${esc(i[1])}">${ic(i[1].startsWith("ask") ? "ai" : i[1].startsWith("story") ? "rocket" : "search", 16)}${esc(i[0])}</button>`).join("")}</div>`; };
  renderLayer();
}
document.addEventListener("click", e => { const a = e.target.closest("[data-act]"); if (!a || a.disabled) return; if (a.tagName === "A") return; e.preventDefault(); const f = ACT[a.dataset.act]; if (f) f(a.dataset, a); });
document.addEventListener("change", e => { const el = e.target.closest("[data-on]"); if (!el || ["pal", "stockQ", "empQ"].includes(el.dataset.on)) return; ON[el.dataset.on] && ON[el.dataset.on](el.value, el); });
document.addEventListener("input", e => { const el = e.target.closest("[data-on]"); if (!el) return; if (["pal", "stockQ", "empQ"].includes(el.dataset.on)) ON[el.dataset.on](el.value, el); });
document.addEventListener("submit", e => { const f = e.target.closest("[data-form]"); if (!f) return; e.preventDefault(); FORMS[f.dataset.form] && FORMS[f.dataset.form](); });
document.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); } if (e.key === "Escape" && (S.modal || S.menu)) { S.modal = null; S.menu = false; renderLayer(); } });
window.addEventListener("hashchange", () => { render(); const m = document.querySelector(".main"); if (m) m.scrollTop = 0; });

