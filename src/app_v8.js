/* ===== v0.8 Experience Layer: herstellerneutrale Oberfläche über NEXORA-Engine und simulierte Fremdsysteme =====
   Additiv: alle Erweiterungen über das Wrapper-Muster; die Suite-Ansicht bleibt unverändert. */
const APP_VERSION = "v0.8";
const UI_KEY = "nexora-suite-v08-ui";
S.layer = (() => { try { return (JSON.parse(localStorage.getItem(UI_KEY) || "{}").layer) || "suite"; } catch (e) { return "suite"; } })();
function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ layer: S.layer })); } catch (e) {} }

/* ---------- Ansichts-Umschalter in der Kopfzeile ---------- */
const _topExtras8 = topExtras;
topExtras = function () {
  return `<div class="seg layer-sw" role="group" aria-label="Ansicht"><button class="${S.layer === "suite" ? "on" : ""}" data-act="setLayer" data-v="suite" aria-pressed="${S.layer === "suite"}">Suite</button><button class="${S.layer === "layer" ? "on" : ""}" data-act="setLayer" data-v="layer" aria-pressed="${S.layer === "layer"}">Experience Layer</button></div>` + _topExtras8();
};
ACT.setLayer = d => { S.layer = d.v === "layer" ? "layer" : "suite"; saveUi(); if (S.layer === "layer" && !LAYER_ROUTES.includes(route())) go("tasks"); else render(); };

/* ---------- Navigation im Layer-Modus ---------- */
const LAYER_ROUTES = ["tasks", "ai", "documents", "admin"];
const _vm8 = visibleMods;
visibleMods = function () { return S.layer === "layer" ? LAYER_ROUTES.slice() : _vm8(); };
const _home8 = VIEWS.home;
VIEWS.home = () => S.layer === "layer" ? VIEWS.tasks() : _home8();
const _tasks8 = VIEWS.tasks;
VIEWS.tasks = () => S.layer === "layer" && !(typeof LAYER_READY !== "undefined" && LAYER_READY) ? statusNote("proto", "Experience Layer " + APP_VERSION + " im Aufbau: Hier entsteht die gemeinsame Inbox über NEXORA und die simulierten Fremdsysteme. Die Suite-Ansicht bleibt über den Umschalter oben erreichbar.") + _tasks8() : _tasks8();

/* ---------- Phase 1: Konnektor-Schicht anbinden ---------- */
const C = window.NexoraConnectors;
C.setProvider("nexoraTasks", (tid, uid) => roleTasks(tid, uid));
// Ein Befehlsweg für alles: "conn.<system>.<befehl>" geht an die Konnektoren, der Rest unverändert an die Engine.
// Damit laufen Konnektor-Ereignisse durch dasselbe Protokoll (act → logEntry/persist, Wiedergabe, Reset).
const _engineDispatch = E.dispatch;
E.dispatch = function (w, tid, cmd, p, ctx) { return String(cmd).startsWith("conn.") ? C.dispatchAny({ dispatch: _engineDispatch }, w, tid, cmd, p, ctx) : _engineDispatch(w, tid, cmd, p, ctx); };
// Systemübergreifende Folgen: jede Folge ist ein eigenes protokolliertes Ereignis desselben Menschen.
const _act8 = act;
act = function (cmd, payload, opt) {
  const r = _act8(cmd, payload, opt);
  if (r && r.ok && r.follow && r.follow.length) for (const f of r.follow) { const fr = _act8(f.cmd, f.p, Object.assign({}, opt || {}, { auto: false })); if (fr && fr.ok) toast("Folgeschritt: " + fr.text); }
  return r;
};

/* ---------- Phase 2: ein Kartenformat, eine Inbox, eine Suche, Deep Links ---------- */
var LAYER_READY = true;
LAYER_ROUTES.splice(0, LAYER_ROUTES.length, "tasks", "ai", "systems", "documents", "admin");
MODS.systems = ["Systeme", "db", "live"]; MODS.obj = ["Objekt", "doc", "live"]; ROUTES.push("systems", "obj");
const SYS_ORDER = ["nexora", "sap", "m365", "servicenow", "workday"];
const sysName = id => (C.CONNECTORS[id] || { name: id }).name;
const simBadge = sys => C.CONNECTORS[sys] && C.CONNECTORS[sys].simulated ? `<span class="ly-sim" title="Keine echte Integration – Daten aus dem Seed erzeugt">Demo-Konnektor · simuliert</span>` : `<span class="ly-sim live">Live-Engine</span>`;
function routeCost(cmd) { if (!String(cmd).startsWith("conn.")) return { label: C.ROUTES.nexora[0].label, cost: 0 }; const [, sys, c] = cmd.split("."); try { const r = C.resolveRoute(sys, c); return { label: r.label, cost: r.costPerCall }; } catch (e) { return { label: "–", cost: 0 }; } }
const eur4 = v => Number(v || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + " €";
/* Aktionskarte: { source, route, ref, title, fields[], status, actions[{ label, cmd, perm, confirm, fourEyes }], deepLink } – ein Renderer für alle Systeme */
function cardHtml(k, o) {
  o = o || {}; const pr = C.PROCESSES[k.process];
  return `<article class="ly-card card" data-ref="${esc(k.ref)}" data-sys="${k.sys}">
    <div class="ly-src"><span class="ly-chip s-${k.sys}">${esc(k.source)}</span><span class="ly-route" title="Zugriffsweg">${esc(k.route)}</span>${simBadge(k.sys)}</div>
    <div class="row between" style="gap:8px;align-items:flex-start"><h3>${esc(k.title)}</h3>${k.status ? stPill(k.status) : ""}</div>
    ${pr ? `<span class="small faint">${esc(pr.label)}${k.due ? " · fällig " + dDe(k.due) : ""}</span>` : ""}
    ${k.fields && k.fields.length ? `<dl class="ly-fields">${k.fields.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(fmtVal(b))}</dd>`).join("")}</dl>` : ""}
    ${o.preview ? "" : `<div class="row ly-acts">${(k.actions || []).map((a, i) => `<button class="btn sm ${a.primary ? "pri" : ""}" data-act="cardAct" data-ref="${esc(k.ref)}" data-i="${i}"${o.ai ? ' data-ai="1"' : ""}>${esc(a.label)}${a.fourEyes ? " · 4 Augen" : ""}</button>`).join("")}<button class="btn sm ghost" data-act="openObj" data-ref="${esc(k.deepLink || k.ref)}">Öffnen →</button></div>`}
  </article>`;
}
let CARD_CACHE = {};
const fmtVal = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dDe(v) : v;
function layerTasks() { const l = C.listTasks(W, S.tenant, { user: S.users[S.tenant] }); CARD_CACHE = {}; for (const k of l) CARD_CACHE[k.ref] = k; return l; }
function confirmCard(k, a, onOk) {
  const rc = routeCost(a.cmd); const pr = C.PROCESSES[k.process];
  S.modal = () => `<div style="padding:20px;display:flex;flex-direction:column;gap:12px"><div class="row between"><h2>${esc(a.label)}?</h2><button class="icon-btn" data-act="closeModal" aria-label="Schließen">${ic("x", 15)}</button></div>
    <p class="muted">${esc(k.title)}${pr ? " · " + esc(pr.label) : ""}</p>
    <div class="kv"><span>System</span><span>${esc(k.source)} ${simBadge(k.sys)}</span><span>Zugriffsweg</span><span>${esc(rc.label)}</span><span>Kosten</span><span>${eur4(rc.cost)} <span class="faint small">(${C.COST_NOTE})</span></span><span>Ausführende Person</span><span>${esc(U().name)} · ${esc((R() || {}).name || "")}</span></div>
    ${a.fourEyes ? `<div class="note warn small">Vier-Augen-Prinzip: Betrag über ${eur(C.FOUR_EYES_LIMIT)} (Beispielwert) – eine zweite Person muss ebenfalls freigeben.</div>` : ""}
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="closeModal">Abbrechen</button><button class="btn pri" data-act="confirmOk">${esc(a.label)}</button></div></div>`;
  S.pendingConfirm = onOk; renderLayer();
}
function runCardAction(k, a) { const r = act(a.cmd, a.p || {}); if (r && r.ok) toast(r.text); return r; }
Object.assign(ACT, {
  cardAct(d) { const k = layerTasks().find(x => x.ref === d.ref); if (!k) return toast("Aufgabe nicht mehr vorhanden.", true); const a = k.actions[+d.i]; if (!a) return;
    if (d.ai || a.confirm || a.fourEyes || S.layerConfirmAll) confirmCard(k, a, () => runCardAction(k, a)); else runCardAction(k, a); },
  confirmOk() { const f = S.pendingConfirm; S.pendingConfirm = null; S.modal = null; renderLayer(); if (f) f(); },
  openObj(d) { S.sel.obj = d.ref; S.modal = null; renderLayer(); go("obj"); },
  sysFilter(d) { S.sel.sysF = d.v || null; render(); }
});
const _tasksLayer = VIEWS.tasks;
VIEWS.tasks = () => {
  if (S.layer !== "layer") return _tasksLayer();
  const t = T(), u = U(); const all = layerTasks(); const f = S.sel.sysF; const list = f ? all.filter(k => k.sys === f) : all;
  const counts = {}; for (const k of all) counts[k.sys] = (counts[k.sys] || 0) + 1;
  const orig = _tasksLayer(); const qrPart = orig.slice(orig.indexOf('<section class="card card-pad row" style="gap:16px;align-items:center"><div id="qrBox"'));
  return head("Experience Layer · " + esc(T_NAMES[t.id]), "Meine Aufgaben aus allen Systemen", `<div class="row"><a class="btn" href="#remote">Fernbedienung</a><button class="btn" data-act="userMenu">${esc(u.name)} · ${esc((R() || {}).name || "")}</button></div>`)
   + `<div class="note acc small sn"><div>Eine Inbox über NEXORA-Engine, SAP S/4HANA, Microsoft 365, ServiceNow und Workday. Alle Systeme außer der NEXORA-Engine sind <b>Demo-Konnektoren (simuliert)</b>: Daten aus dem Seed, keine echte Integration. Jede Aktion läuft über einen sichtbaren Zugriffsweg mit Beispielkosten.</div></div>`
   + `<div class="seg" role="tablist" aria-label="Nach System filtern"><button class="${!f ? "on" : ""}" data-act="sysFilter" data-v="">Alle <b>${all.length}</b></button>${SYS_ORDER.map(s => `<button class="${f === s ? "on" : ""}" data-act="sysFilter" data-v="${s}">${esc(sysName(s).replace(" (simuliert)", ""))} <b>${counts[s] || 0}</b></button>`).join("")}</div>`
   + (list.length ? `<div class="ly-grid">${list.map(k => cardHtml(k)).join("")}</div>` : `<section class="card card-pad"><p class="muted">Keine offenen Aufgaben für ${esc(u.name)}${f ? " in " + esc(sysName(f)) : ""}. Wechsle die Rolle (z. B. CFO oder HR), um Freigaben zu sehen.</p></section>`)
   + qrPart;
};
VIEWS.systems = () => {
  const t = T(); const own = C.owners(W, t.id);
  return head("Experience Layer", "Angebundene Systeme") + `<div class="note acc small sn">Alle Systeme außer der NEXORA-Engine sind simuliert. Kosten sind ${C.COST_NOTE}.</div>`
   + `<div class="ly-grid">${SYS_ORDER.map(id => { const c = C.CONNECTORS[id]; const procs = Object.entries(own).filter(([p, o]) => o === id).map(([p]) => C.PROCESSES[p].label);
     return `<section class="card card-pad" style="display:flex;flex-direction:column;gap:10px"><div class="row between"><h3>${esc(c.name)}</h3>${simBadge(id)}</div><div class="small muted">Führt: ${procs.length ? esc(procs.join(", ")) : "keinen Prozess"}${c.originalUi ? " · Original-Oberfläche: " + esc(c.originalUi) : ""}</div>
     <table class="small"><thead><tr><th>Zugriffsweg</th><th>Agent</th><th class="r">je Aufruf</th></tr></thead><tbody>${c.routes.map(r => `<tr><td>${esc(r.label)}<div class="faint">${esc(r.note)}</div></td><td>${esc(r.viaAgent)}</td><td class="r num">${eur4(r.costPerCall)}</td></tr>`).join("")}</tbody></table>${id === "sap" ? `<p class="small faint">${esc(C.SAP_POLICY_NOTE)}</p>` : ""}</section>`; }).join("")}</div>`;
};
const NEXORA_MASK = { so: "sales", po: "supply", req: "supply", doc: "finance", cust: "sales", mat: "supply", inbox: "inbox", task: "tasks" };
VIEWS.obj = () => {
  const ref = S.sel.obj; const o = ref && C.getObject(W, S.tenant, ref); const back = `<button class="btn" data-act="goBack">← Zurück</button>`;
  if (!o) return head("Objekt", "Nicht gefunden", back) + `<section class="card card-pad"><p class="muted">${esc(ref || "")} ist in diesem Unternehmen nicht (mehr) vorhanden.</p></section>`;
  const mask = o.sys === "nexora" ? NEXORA_MASK[o.kind] : null; const k = Object.values(CARD_CACHE).find(x => x.ref === ref);
  return head(esc(o.source) + " · " + esc(o.kind), esc(o.title), back)
   + (o.simulated ? `<div class="note warn small">Im Original würde hier ${esc(o.originalUi || o.source)} öffnen. Diese Detailansicht zeigt die Daten des Demo-Konnektors im NEXORA-Design – simuliert, keine echte Integration.</div>` : `<div class="note good small sn">Objekt der NEXORA-Engine.${mask ? ` <a href="#${mask}" data-act="goMask" data-r="${mask}">Volle Maske öffnen</a>` : ""}</div>`)
   + `<section class="card card-pad"><dl class="ly-fields wide">${o.fields.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(String(fmtVal(b)))}</dd>`).join("")}</dl></section>`
   + (k ? `<section class="card card-pad"><h3 style="margin-bottom:10px">Aktionen</h3>${cardHtml(k)}</section>` : "")
   + (o.history && o.history.length ? `<section class="card card-pad"><h3>Verlauf</h3><div class="list">${o.history.map(h => `<div class="li" style="padding:6px 0"><span class="num small" style="width:90px">${esc(dDe(h[1]))}</span><span class="grow small">${esc(h[0])}</span></div>`).join("")}</div></section>` : "");
};
ACT.goBack = () => history.back(); ACT.goMask = d => { if (d.r === "supply") S.tab.sup = "req"; go(d.r); };
// Suche (⌘K) im Layer-Modus: alle Konnektoren, Treffer als Kartenvorschau, gruppiert nach System
const _openPalette = openPalette;
openPalette = function () {
  if (S.layer !== "layer") return _openPalette();
  S.pal = ""; S.modal = () => { const q = (S.pal || "").trim(); const hits = q.length >= 2 ? C.search(W, S.tenant, q, { user: S.users[S.tenant] }) : []; const by = {}; for (const h of hits) (by[h.sys] = by[h.sys] || []).push(h);
    return `<form data-form="pal" style="padding:10px;border-bottom:1px solid var(--line)"><input class="input" id="palIn" autofocus placeholder="Suche über alle Systeme – z. B. Monitor, Rechnung, Kabine, Urlaub" value="${esc(S.pal)}" data-on="pal" aria-label="Suche über alle Systeme"></form>
      <div style="padding:8px 10px;display:flex;flex-direction:column;gap:10px;max-height:62vh;overflow:auto">${q.length < 2 ? `<p class="small muted" style="padding:6px">Mindestens zwei Zeichen. Gesucht wird in NEXORA-Engine und den simulierten Systemen; Enter fragt den Assistenten.</p>` : !hits.length ? `<p class="small muted" style="padding:6px">Keine Treffer.</p>`
        : SYS_ORDER.filter(s => by[s]).map(s => `<div><div class="row between" style="padding:2px 4px"><span class="eyebrow">${esc(sysName(s))}</span>${simBadge(s)}</div>${by[s].slice(0, 6).map(h => `<button class="pal-item" data-act="openObj" data-ref="${esc(h.ref)}"><span style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.title)}</b><span class="small muted">${esc(h.kind)} · ${esc(h.sub || "")}</span></span>${ic("chev", 14)}</button>`).join("")}</div>`).join("")}</div>`; };
  renderLayer();
};
// Fehlerbehebung: Schaltflächen in Dialogen (Suche, Bestätigung, Demo vorbereiten) erreichten den Klick-Handler nicht,
// weil der Dialog Klicks per stopPropagation abfängt. Daher hier in der Capture-Phase behandeln.
document.addEventListener("click", e => { const a = e.target.closest("#layer .dlg [data-act]"); if (!a || a.disabled || a.tagName === "A") return; e.preventDefault(); e.stopPropagation(); const f = ACT[a.dataset.act]; if (f) f(a.dataset, a); }, true);

// Layer-Modus: Zähler in der Navigation zeigt alle Systeme, Kopfzeile kompakter
const _taskCount8 = taskCount; taskCount = () => S.layer === "layer" ? C.listTasks(W, S.tenant, { user: S.users[S.tenant] }).length : _taskCount8();
const _render8 = render; render = function () { document.body.classList.toggle("layer", S.layer === "layer"); _render8(); };

/* ---------- Phase 3: Aktionskarten im Assistenten ----------
   Claude und der Regel-Rückfall liefern dieselben Karten. Beide schlagen nur vor: Ausgeführt wird erst nach Klick
   und Bestätigungsdialog, über act() → connector.dispatch() mit Rechteprüfung. */
const AI_CARD_MAX = 8;
const cardDesc = k => ({ ref: k.ref, system: k.source, simuliert: !!(C.CONNECTORS[k.sys] && C.CONNECTORS[k.sys].simulated), zugriffsweg: k.route, prozess: (C.PROCESSES[k.process] || {}).label || null, titel: k.title, status: k.status || null, faellig: k.due || null, felder: Object.fromEntries((k.fields || []).map(([a, b]) => [a, b])), aktionen: (k.actions || []).map(a => a.label + (a.fourEyes ? " (Vier-Augen)" : "")) });
const aiNote = refs => { S.aiRefs = S.aiRefs || []; for (const r of refs) if (!S.aiRefs.includes(r)) S.aiRefs.push(r); };
function aiTasks(sys) { const l = layerTasks().filter(k => !sys || k.sys === sys || (C.CONNECTORS[k.sys] || {}).name.toLowerCase().includes(String(sys).toLowerCase())); return l; }
function aiSearch(q) { const hits = C.search(W, S.tenant, q, { user: S.users[S.tenant] }); const open = new Map(layerTasks().map(k => [k.ref, k])); return hits.map(h => ({ hit: h, task: open.get(h.ref) || null })); }
function aiCosts() { const d = T().date; const today = C.costs(W, S.tenant, { date: d }), month = C.costs(W, S.tenant, { period: d.slice(0, 7) }); return { heute: today, monat: month, datum: d }; }
const _aiTools8 = AI_TOOLS;
AI_TOOLS = () => S.layer !== "layer" ? _aiTools8() : _aiTools8().concat([
  { name: "aufgaben_alle", description: "Offene Aufgaben der angemeldeten Person aus allen Systemen (NEXORA-Engine live; SAP S/4HANA, Microsoft 365, ServiceNow, Workday als simulierte Demo-Konnektoren). Liefert je Aufgabe eine Kartenbeschreibung mit ref, System, Zugriffsweg, Feldern und möglichen Aktionen. Optional nach System filtern (nexora, sap, m365, servicenow, workday).", inputSchema: { type: "object", properties: { system: { type: "string" } } },
    execute: i => { const l = aiTasks(i && i.system); aiNote(l.slice(0, AI_CARD_MAX).map(k => k.ref)); return { datum: T().date, person: U().name, anzahl: l.length, karten: l.slice(0, 20).map(cardDesc) }; } },
  { name: "suche_alle", description: "Volltextsuche über alle Systeme (Bestellanforderungen, Rechnungen, Mails, Tickets, Abwesenheiten, Belege, Aufträge, Kunden, Material). Liefert Treffer mit ref; offene Aufgaben zusätzlich als Kartenbeschreibung.", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
    execute: i => { const r = aiSearch(String(i.q || "")); aiNote(r.filter(x => x.task).slice(0, AI_CARD_MAX).map(x => x.task.ref)); return r.slice(0, 25).map(x => x.task ? cardDesc(x.task) : { ref: x.hit.ref, system: x.hit.source, simuliert: x.hit.simulated, art: x.hit.kind, titel: x.hit.title, info: x.hit.sub }); } },
  { name: "objekt", description: "Details eines Objekts per ref (z. B. sap:pr:10004711, servicenow:ritm:RITM0014021): Felder, Verlauf und – falls offen – die Kartenbeschreibung mit Aktionen.", inputSchema: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] },
    execute: i => { const o = C.getObject(W, S.tenant, String(i.ref)); if (!o) throw new Error("Objekt nicht gefunden"); const k = layerTasks().find(x => x.ref === o.ref || x.ref === String(i.ref)); if (k) aiNote([k.ref]); return { ref: String(i.ref), system: o.source, simuliert: o.simulated, titel: o.title, felder: Object.fromEntries(o.fields), verlauf: o.history || [], karte: k ? cardDesc(k) : null }; } },
  { name: "kosten", description: "Kosten der protokollierten Zugriffe (Aktionen und Agentenabfragen) je System und Zugriffsweg, für heute und den laufenden Monat. Beispielwerte, keine Herstellerpreise.", execute: () => aiCosts() }
]);
const AI_RULES_LAYER = () => `
Experience Layer: Du siehst Aufgaben aus allen Systemen über die Werkzeuge aufgaben_alle, suche_alle, objekt und kosten. Alle Systeme außer der NEXORA-Engine sind simulierte Demo-Konnektoren ohne echte Integration – sage das, wenn du sie nennst. Du führst nichts aus: Unter deiner Antwort zeigt die Oberfläche automatisch Aktionskarten zu den Aufgaben, die deine Werkzeuge geliefert haben; die Person bestätigt jede Aktion selbst. Nenne bei jeder Aufgabe System, Referenz und deine Empfehlung (freigeben, ablehnen, klären) mit kurzer Begründung. Kosten sind Beispielwerte, keine Herstellerpreise.`;
const _askClaude8 = askClaude;
askClaude = async function (q) {
  if (S.layer !== "layer") return _askClaude8(q);
  // AI_RULES ist eine Konstante: Layer-Regeln werden an die erste Nachricht des Aufrufs angehängt
  const smp = BK.sample; S.aiRefs = [];
  if (smp) BK.sample = (turns, o) => smp([Object.assign({}, turns[0], { content: turns[0].content + AI_RULES_LAYER() })].concat(turns.slice(1)), o);
  try { await _askClaude8(q); } finally { if (smp) BK.sample = smp; } const ch = S.chat[S.tenant]; const slot = ch[ch.length - 1];
  if (slot && S.aiRefs.length) { slot.cards = S.aiRefs.slice(0, AI_CARD_MAX); render(); } S.aiRefs = [];
};
// Regel-Rückfall: dieselben Karten, ohne Sprachmodell
const AI_CARD_MARK = /<!--cards:([^>]*)-->/;
const cardsMark = refs => refs.length ? `<!--cards:${refs.slice(0, AI_CARD_MAX).join(",")}-->` : "";
const _answer8 = answer;
answer = function (q) {
  if (S.layer !== "layer") return _answer8(q);
  const ql = q.toLowerCase(); const t = T(), d = t.date;
  if (/(freigeben|freigabe|genehmig|aufgaben|zu tun|inbox|erledigen)/.test(ql) && !/(marge|budget|nachbestell|projekt)/.test(ql)) {
    const l = layerTasks(); const due = l.filter(k => !k.due || k.due <= d); const by = {}; for (const k of l) by[k.source] = (by[k.source] || 0) + 1;
    if (!l.length) return `<p>Für <b>${esc(U().name)}</b> liegen in keinem System offene Aufgaben vor.</p>` + basis("Alle angebundenen Systeme (NEXORA live, übrige simuliert)", "Stand " + dDe(d), "Offene Aufgaben mit Aktion für die Rolle " + esc((R() || {}).name || ""));
    return `<p><b>${l.length} offene Aufgaben</b> für ${esc(U().name)}, davon <b>${due.length}</b> heute fällig oder überfällig. ${Object.entries(by).map(([s, n]) => `${esc(s)}: ${n}`).join(" · ")}.</p><p class="small muted">Ich schlage nur vor – jede Aktion bestätigst du selbst im Dialog. Systeme außer der NEXORA-Engine sind simulierte Demo-Konnektoren.</p>`
      + cardsMark(l.map(k => k.ref)) + basis("Inbox des Experience Layers über alle Konnektoren", "Stand " + dDe(d), "Aufgaben mit offener Aktion für die Rolle " + esc((R() || {}).name || "") + ", sortiert nach Fälligkeit und Betrag");
  }
  if (/(zugriffskosten|ki-kosten|agentenkosten|kosten (heute|diesen monat|im monat|des layers)|was (hat|haben) .*gekostet|kosten der (zugriffe|agenten|aufrufe))/.test(ql)) {
    const c = aiCosts(); const rows = c.monat.rows;
    return `<p>Protokollierte Zugriffe kosten heute <b>${eur4(c.heute.total)}</b>, im laufenden Monat <b>${eur4(c.monat.total)}</b>.</p>` + (rows.length ? `<table><thead><tr><th>System · Zugriffsweg</th><th class="r">Aufrufe</th><th class="r">Kosten</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.system)} · ${esc(r.route)}</td><td class="r num">${r.calls}</td><td class="r num">${eur4(r.cost)}</td></tr>`).join("")}</tbody></table>` : `<p class="small muted">Noch keine protokollierten Zugriffe in diesem Monat.</p>`)
      + basis("Protokoll der Konnektor-Aufrufe", "Heute (" + dDe(c.datum) + ") und " + perDe(c.datum.slice(0, 7)), "Summe der Beispielkosten je Aufruf; Lesen der Inbox ist kostenfrei. " + C.COST_NOTE);
  }
  const sm = ql.match(/^(?:suche|finde|such|zeig(?:e)? mir)\s+(?:nach\s+)?(.{2,})$/);
  if (sm) { const r = aiSearch(sm[1].replace(/[?.!]+$/, "").trim());
    if (!r.length) return `<p>Keine Treffer für „${esc(sm[1])}“ in den angebundenen Systemen.</p>`;
    return `<p>${r.length} Treffer für „${esc(sm[1])}“.</p><div class="list">${r.filter(x => !x.task).slice(0, 8).map(x => `<div class="li" style="padding:6px 0"><span class="grow small"><b>${esc(x.hit.title)}</b> <span class="faint">${esc(x.hit.source)} · ${esc(x.hit.kind)}</span></span><button class="btn sm ghost" data-act="openObj" data-ref="${esc(x.hit.ref)}">Öffnen →</button></div>`).join("")}</div>`
      + cardsMark(r.filter(x => x.task).map(x => x.task.ref)) + basis("Suche über alle Konnektoren", "Stand " + dDe(d), "Textsuche in Nummer, Bezeichnung und Person");
  }
  return _answer8(q);
};
function aiCardsHtml(refs) {
  const open = new Map(layerTasks().map(k => [k.ref, k]));
  return `<div class="ly-grid ai-cards">${refs.map(r => { const k = open.get(r); if (k) return cardHtml(k, { ai: true }); const o = C.getObject(W, S.tenant, r);
    return `<article class="ly-card card done"><div class="ly-src"><span class="ly-chip s-${esc(C.parseRef(r).sys)}">${esc(o ? o.source : r)}</span></div><h3>${esc(o ? o.title : r)}</h3><span class="small muted">Nicht mehr offen – bereits bearbeitet.</span><div class="row ly-acts"><button class="btn sm ghost" data-act="openObj" data-ref="${esc(r)}">Öffnen →</button></div></article>`; }).join("")}</div>`;
}
const _aiView8 = VIEWS.ai;
VIEWS.ai = () => {
  if (S.layer !== "layer") return _aiView8();
  const ch = S.chat[S.tenant]; const saved = ch.map(m => m.a);
  for (const m of ch) { if (m.u) continue; let refs = m.cards || null; const mk = !refs && m.a && m.a.match(AI_CARD_MARK); if (mk) refs = mk[1].split(",").filter(Boolean);
    if (refs && refs.length) m.a = mk ? m.a.replace(AI_CARD_MARK, aiCardsHtml(refs)) : m.a + aiCardsHtml(refs); }
  const sugg = AI_SUGG.slice(); AI_SUGG.unshift("Was muss ich heute freigeben?", "Suche Monitor", "Was haben die Zugriffe diesen Monat gekostet?");
  try { return _aiView8(); } finally { ch.forEach((m, i) => { m.a = saved[i]; }); AI_SUGG.splice(0, AI_SUGG.length, ...sugg); }
};
