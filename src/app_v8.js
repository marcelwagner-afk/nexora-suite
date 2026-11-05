/* ===== v0.8 Experience Layer: herstellerneutrale Oberfläche über NEXORA-Engine und simulierte Fremdsysteme =====
   Additiv: alle Erweiterungen über das Wrapper-Muster; die Suite-Ansicht bleibt unverändert. */
const APP_VERSION = "v0.8";
const UI_KEY = "nexora-suite-v08-ui";
// Ab v0.8 ist der Experience Layer Standard; die Suite-Ansicht bleibt per Umschalter erreichbar (Wahl wird gespeichert).
S.layer = (() => { try { const q = new URLSearchParams(location.search).get("layer"); if (q === "1") return "layer"; if (q === "0") return "suite"; } catch (e) {} try { return (JSON.parse(localStorage.getItem(UI_KEY) || "{}").layer) || "layer"; } catch (e) { return "layer"; } })();
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
const AUDIT_ORDER = new WeakMap(); // Mandantenobjekt → Reihenfolge der Einträge aus Engine-Audit und Konnektor-Ledger
E.dispatch = function (w, tid, cmd, p, ctx) {
  const conn = String(cmd).startsWith("conn."); const r = conn ? C.dispatchAny({ dispatch: _engineDispatch }, w, tid, cmd, p, ctx) : _engineDispatch(w, tid, cmd, p, ctx);
  const t = w && w.tenants && w.tenants[tid];
  if (r && r.ok && t) { const o = AUDIT_ORDER.get(t) || []; if (conn) { const L = C.ledger(w, tid); if (L.length) o.push(["c", L[L.length - 1].seq]); } else if (t.audit && t.audit.length && (!o.length || !o.some(x => x[0] === "e" && x[1] === t.audit.length))) o.push(["e", t.audit.length]); AUDIT_ORDER.set(t, o); }
  return r;
};
// Systemübergreifende Folgen: jede Folge ist ein eigenes protokolliertes Ereignis desselben Menschen.
const _act8 = act;
act = function (cmd, payload, opt) {
  const r = _act8(cmd, payload, opt);
  // Folgeschritte (und Spiegelungen im Parallelbetrieb) als eigene protokollierte Ereignisse
  const more = (c, p, res) => (res && res.ok ? (res.follow || []) : []).concat(typeof mirrorFor === "function" ? mirrorFor(c, p, res) : []);
  const queue = more(cmd, payload, r).slice(); let guard = 0;
  while (queue.length && guard++ < 20) { const f = queue.shift(); const fr = _act8(f.cmd, f.p, Object.assign({}, opt || {}, { auto: false })); if (fr && fr.ok) { toast("Folgeschritt: " + fr.text); queue.push(...more(f.cmd, f.p, fr)); } }
  return r;
};

/* ---------- Phase 2: ein Kartenformat, eine Inbox, eine Suche, Deep Links ---------- */
var LAYER_READY = true;
LAYER_ROUTES.splice(0, LAYER_ROUTES.length, "home", "tasks", "ai", "systems", "agents", "transition", "audit", "documents", "admin");
MODS.systems = ["Systeme", "db", "live"]; MODS.agents = ["Agenten", "users", "live"]; MODS.audit = ["Protokoll", "check", "live"]; MODS.transition = ["Ablöse-Cockpit", "flag", "live"]; MODS.privacy = ["Mitbestimmung & Datenschutz", "shield", "live"]; MODS.obj = ["Objekt", "doc", "live"]; ROUTES.push("systems", "agents", "audit", "privacy", "obj", "transition");
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
  // Router zuerst: ohne zulässigen Weg keine Anfrage an Claude, keine Kosten
  const rq = routeAsk(q);
  if (!rq.d.ok) { S.chat[S.tenant].push({ u: q }, { a: rejectHtml(rq.d), via: viaOf(rq) }); if (route() !== "ai") go("ai"); else render(); return; }
  // AI_RULES ist eine Konstante: Layer-Regeln (und das Ergebnis des gerouteten Agenten) werden an die erste Nachricht angehängt
  const smp = BK.sample; S.aiRefs = []; const extra = AI_RULES_LAYER() + (rq.r && rq.r.ok ? `\nDer Router hat diese Frage an ${rq.d.agent.name} über ${rq.d.route.label} geleitet (simulierter Demo-Konnektor). Ergebnis dieser Abfrage: ${JSON.stringify(rq.r.result).slice(0, 6000)}` : "");
  if (smp) BK.sample = (turns, o) => smp([Object.assign({}, turns[0], { content: turns[0].content + extra })].concat(turns.slice(1)), o);
  try { await _askClaude8(q); } finally { if (smp) BK.sample = smp; } const ch = S.chat[S.tenant]; const slot = ch[ch.length - 1];
  if (slot) { slot.via = viaOf(rq); if (S.aiRefs.length) slot.cards = S.aiRefs.slice(0, AI_CARD_MAX); render(); } S.aiRefs = [];
};
// Regel-Rückfall: dieselben Karten, ohne Sprachmodell
const AI_CARD_MARK = /<!--cards:([^>]*)-->/;
const cardsMark = refs => refs.length ? `<!--cards:${refs.slice(0, AI_CARD_MAX).join(",")}-->` : "";
const _answer8 = answer;
answer = function (q) {
  if (S.layer !== "layer") return _answer8(q);
  const rq = routeAsk(q); const mk = viaMark(viaOf(rq));
  if (!rq.d.ok) return rejectHtml(rq.d) + mk;
  if (rq.d.system !== "nexora") return agentAnswer(rq) + mk;
  return answerLayer(q) + mk;
};
function answerLayer(q) {
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
}
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
    if (refs && refs.length) m.a = mk ? m.a.replace(AI_CARD_MARK, aiCardsHtml(refs)) : m.a + aiCardsHtml(refs);
    let via = m.via || null; const vm = !via && m.a && m.a.match(VIA_MARK); if (vm) { try { via = JSON.parse(decodeURIComponent(vm[1])); } catch (e) {} }
    if (via) m.a += viaChip(via); }
  const sugg = AI_SUGG.slice(); AI_SUGG.unshift("Was muss ich heute freigeben?", "Suche Monitor", "Was haben die Zugriffe diesen Monat gekostet?");
  try { return _aiView8(); } finally { ch.forEach((m, i) => { m.a = saved[i]; }); AI_SUGG.splice(0, AI_SUGG.length, ...sugg); }
};

/* ---------- Phase 4: Orchestrierung – Agenten-Register, Router, Chip unter jeder Antwort ---------- */
const AGENT_BY = Object.fromEntries(C.AGENTS.map(a => [a.id, a]));
S.agentErr = S.agentErr || {};
// Router entscheidet; ein simulierter Agent wird als protokollierte Abfrage über seinen A2A-Weg aufgerufen (kostet den Beispielsatz)
function routeAsk(q) {
  const d = C.routeQuery(q); let r = null;
  if (!d.ok) { const k = d.agent ? d.agent.id : "kein Agent"; S.agentErr[k] = (S.agentErr[k] || 0) + 1; return { d, r }; }
  if (d.cmd) { r = act(d.cmd, { what: d.what, route: d.route.id, via: "Assistent" }); if (!r || !r.ok) { S.agentErr[d.agent.id] = (S.agentErr[d.agent.id] || 0) + 1; } }
  return { d, r };
}
const viaOf = rq => rq.d.ok ? { agent: rq.d.agent.name, route: rq.d.route.label, cost: rq.r && rq.r.ok ? rq.r.cost : 0, sim: rq.d.agent.simulated, err: rq.r && !rq.r.ok ? rq.r.text : null } : { agent: rq.d.agent ? rq.d.agent.name : "Router", route: null, cost: 0, rejected: true };
const VIA_MARK = /<!--via:([^>]*)-->/;
const viaMark = v => `<!--via:${encodeURIComponent(JSON.stringify(v))}-->`;
const viaChip = v => `<div class="ai-via${v.rejected ? " rej" : ""}">${v.rejected ? `${ic("shield", 13)} Abgelehnt · kein zulässiger Weg · keine Kosten` : `${ic("ai", 13)} beantwortet über ${esc(v.route && v.route.includes("A2A") ? v.route : v.agent + (v.route ? " · " + v.route : ""))} · ${eur4(v.cost)} (Beispielwert)${v.sim ? ` <span class="ly-sim">simuliert</span>` : ""}`}</div>`;
const rejectHtml = d => `<p><b>Nicht ausgeführt.</b> ${esc(d.text)}</p>` + basis("Router des Experience Layers", "–", "Regelprüfung der zulässigen Zugriffswege je System; abgelehnte Anfragen kosten nichts und erreichen kein System");
function agentAnswer(rq) {
  const { d, r } = rq; if (!r || !r.ok) return `<p>${esc(d.agent.name)} konnte die Anfrage nicht beantworten: ${esc(r ? r.text : "unbekannter Fehler")}</p>`;
  const res = r.result; const rows = Array.isArray(res) ? res : res && (res.mails || res.abwesenheiten) ? (res.mails || res.abwesenheiten) : [];
  const cols = rows.length ? Object.keys(rows[0]).filter(k => typeof rows[0][k] !== "object").slice(0, 5) : [];
  return `<p>${esc(d.agent.name)} liefert ${rows.length} Einträge aus ${esc(sysName(d.system))}.</p>` + (rows.length ? `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 10).map(x => `<tr>${cols.map(c => `<td>${esc(typeof x[c] === "number" && c.match(/betrag|wert|kosten|preis/) ? eur(x[c]) : String(fmtVal(x[c]) ?? ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "")
    + basis(`${esc(sysName(d.system))} – simulierter Demo-Konnektor, Daten aus dem Seed`, "Stand " + dDe(T().date), `Abfrage über ${esc(d.route.label)}, protokolliert mit ${eur4(r.cost)} (${C.COST_NOTE})`);
}
// Claude-Werkzeug „route“: zeigt die Entscheidung des Routers ohne Ausführung
const _aiTools8b = AI_TOOLS;
AI_TOOLS = () => S.layer !== "layer" ? _aiTools8b() : _aiTools8b().concat([{ name: "route", description: "Zeigt, über welchen Agenten und Zugriffsweg eine Anfrage laufen würde (Router des Experience Layers), inklusive Beispielkosten oder Ablehnungsgrund. Führt nichts aus.", inputSchema: { type: "object", properties: { frage: { type: "string" } }, required: ["frage"] }, execute: i => { const d = C.routeQuery(String(i.frage || "")); return d.ok ? { agent: d.agent.name, system: sysName(d.system), weg: d.route.label, kosten_je_aufruf: d.cost, hinweis: C.COST_NOTE } : { abgelehnt: true, grund: d.text }; } }]);
VIEWS.agents = () => {
  const L = C.ledger(W, S.tenant); const by = {}; for (const x of L) { const b = by[x.agent] = by[x.agent] || { calls: 0, cost: 0, queries: 0 }; b.calls++; b.cost = Math.round((b.cost + x.cost) * 1000) / 1000; if (/\.query$/.test("." + x.cmd)) b.queries++; }
  const examples = ["Welche Kreditorenrechnungen sind in SAP offen?", "Welche Mails warten im Postfach auf Antwort?", "Zeig mir offene Tickets in ServiceNow", "Wer hat nächste Woche Urlaub?", "Wie hoch ist der Umsatz im Oktober?", "Lies die SAP-Tabelle ACDOCA direkt über die API", "Hole die Opportunities aus Salesforce"];
  return head("Experience Layer · " + esc(T_NAMES[S.tenant]), "Agenten-Register") + `<div class="note acc small sn"><div>Agentenkarten im A2A-Stil. Alle Agenten außer der NEXORA-Engine sind <b>simuliert</b> – keine echte Integration. Der Router wählt je Frage oder Aktion den Agenten; ohne zulässigen Weg wird abgelehnt. Kosten sind ${C.COST_NOTE}.</div></div>`
   + `<div class="ly-grid">${C.AGENTS.map(a => { const r = C.ROUTES[a.system].find(x => x.id === a.route); const b = by[a.id] || { calls: 0, cost: 0, queries: 0 };
     return `<section class="card card-pad ag-card" data-agent="${a.id}" style="display:flex;flex-direction:column;gap:10px"><div class="row between"><h3>${esc(a.name)}</h3>${simBadge(a.system)}</div>
       <div class="kv small"><span>System</span><span>${esc(sysName(a.system))}</span><span>Zugriffsweg</span><span>${esc(r.label)}</span><span>je Aufruf</span><span class="num">${eur4(r.costPerCall)}</span><span>Fähigkeiten</span><span>${esc(a.skills.join(", "))}</span></div>
       <div class="row" style="gap:16px"><div><div class="eyebrow">Aufrufe</div><b class="num">${b.calls}</b><span class="small faint"> davon ${b.queries} Abfragen</span></div><div><div class="eyebrow">Fehler</div><b class="num">${S.agentErr[a.id] || 0}</b></div><div><div class="eyebrow">Kosten</div><b class="num">${eur4(b.cost)}</b></div></div>${a.id === "nexora" ? `<p class="small faint">Gezählt werden Aufrufe über freigegebene Schnittstellen. Befehle in der eigenen Engine stehen im Ereignisprotokoll und kosten nichts.</p>` : ""}</section>`; }).join("")}</div>`
   + `<section class="card card-pad"><h3>Router</h3><p class="small muted" style="margin:4px 0 10px">So würde der Router diese Fragen leiten. Die Vorschau kostet nichts; erst eine gestellte Frage ruft den Agenten auf.</p><table class="small"><thead><tr><th>Frage</th><th>Agent</th><th>Weg</th><th class="r">je Aufruf</th></tr></thead><tbody>${examples.map(q => { const d = C.routeQuery(q);
       return `<tr><td><button class="link-btn" data-act="ask" data-q="${esc(q)}">${esc(q)}</button></td>${d.ok ? `<td>${esc(d.agent.name)}</td><td>${esc(d.route.label)}</td><td class="r num">${eur4(d.cost)}</td>` : `<td colspan="3"><span class="pill p-crit">abgelehnt</span> <span class="faint">${esc(d.code === "NO_ROUTE" ? "System nicht angebunden" : "kein zulässiger Weg")}</span></td>`}</tr>`; }).join("")}</tbody></table>
       <p class="small faint" style="margin-top:8px">Fehler werden in dieser Sitzung gezählt (abgelehnte Anfragen und fehlgeschlagene Aufrufe); sie erreichen kein System und erzeugen keine Kosten.</p></section>`;
};

/* ---------- Phase 5: Kosten, Protokoll, Vier-Augen, Mitbestimmung & Datenschutz ---------- */
S.auditRej = S.auditRej || []; // abgelehnte Aktionen dieser Sitzung (erreichen kein System, nicht im gemeinsamen Protokoll)
S.auditF = S.auditF || { sys: "", user: "", res: "", q: "" };
const _act8b = act;
act = function (cmd, payload, opt) { const r = _act8b(cmd, payload, opt); if (r && !r.ok && S.layer === "layer") { const t = T(); const u = U(); const sys = String(cmd).startsWith("conn.") ? cmd.split(".")[1] : "nexora"; const rc = routeCost(cmd);
  S.auditRej.push({ session: true, date: t.date, userName: u.name, role: (R() || {}).name || "", system: sysName(sys), route: rc.label, agent: "–", cmd, ref: (payload && payload.ref) || null, cost: 0, ok: false, text: r.text, code: r.code, via: (payload && payload.via) || "Mensch", tenant: t.id }); }
  return r; };
// Routerablehnungen ebenfalls in die Sitzungsliste
const _routeAsk5 = routeAsk;
routeAsk = function (q) { const rq = _routeAsk5(q); if (!rq.d.ok) { const t = T(); S.auditRej.push({ session: true, date: t.date, userName: U().name, role: (R() || {}).name || "", system: rq.d.system ? sysName(rq.d.system) : "–", route: "kein zulässiger Weg", agent: rq.d.agent ? rq.d.agent.id : "Router", cmd: "frage", ref: null, cost: 0, ok: false, text: rq.d.text, code: rq.d.code, via: "Assistent", tenant: t.id }); } return rq; };
function auditRows(tid) {
  tid = tid || S.tenant; const t = W.tenants[tid]; const L = C.ledger(W, tid); const byC = new Map(L.map(x => [x.seq, x])); const order = AUDIT_ORDER.get(t) || []; const rows = []; const seen = new Set();
  const uOf = name => t.users.find(u => u.name === name); const roleOf = u => u ? ((t.roles.find(r => r.id === u.role) || {}).name || "") : "";
  const eRow = a => { const u = uOf(a.user); return { date: a.date, userName: a.user || "Demo-Automatik", role: roleOf(u), system: "NEXORA-Engine", route: C.ROUTES.nexora[0].label, agent: "nexora", cmd: a.cmd, ref: (a.docs || []).join(" ") || null, cost: 0, ok: true, text: a.text, via: a.user ? "Mensch" : "Demo-Automatik" }; };
  for (const [k, n] of order) { if (k === "c" && byC.has(n)) { rows.push(byC.get(n)); seen.add("c" + n); } if (k === "e" && t.audit[n - 1]) { rows.push(eRow(t.audit[n - 1])); seen.add("e" + n); } }
  for (const x of L) if (!seen.has("c" + x.seq)) rows.push(x); // Sicherheitsnetz: nichts geht verloren (z. B. Einträge aus Querverbindungen)
  t.audit.forEach((a, i) => { if (a.cmd !== "seed" && !seen.has("e" + (i + 1))) rows.push(eRow(a)); });
  for (const x of S.auditRej.filter(r => r.tenant === tid)) rows.push(x);
  return rows.map((r, i) => Object.assign({ n: i + 1 }, r));
}
const AUDIT_COLS = [["n", "Lfd. Nr."], ["date", "Datum"], ["userName", "Nutzer"], ["role", "Rolle"], ["system", "System"], ["route", "Zugriffsweg"], ["agent", "Agent"], ["cmd", "Befehl"], ["ref", "Referenz"], ["cost", "Kosten (EUR, Beispielwert)"], ["ok", "Ergebnis"], ["via", "Ausgelöst über"], ["text", "Text"]];
const resTxt = r => r.ok ? "ausgeführt" : "abgelehnt" + (r.code ? " (" + r.code + ")" : "") + (r.session ? " · nur diese Sitzung" : "");
function auditFiltered() { const f = S.auditF; const q = (f.q || "").toLowerCase(); return auditRows().filter(r => (!f.sys || r.system === f.sys) && (!f.user || r.userName === f.user) && (!f.res || (f.res === "ok") === !!r.ok) && (!q || [r.cmd, r.ref, r.text, r.route, r.agent].some(x => String(x || "").toLowerCase().includes(q)))); }
function auditCsv(rows) {
  const cell = v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const val = (r, k) => k === "cost" ? Number(r.cost || 0).toFixed(3).replace(".", ",") : k === "ok" ? resTxt(r) : k === "date" ? dDe(r.date) : r[k];
  return "﻿" + [AUDIT_COLS.map(c => c[1]).join(";")].concat(rows.map(r => AUDIT_COLS.map(([k]) => cell(val(r, k))).join(";"))).join("\r\n") + "\r\n";
}
ACT.auditCsv = () => { const rows = auditFiltered(); saveBlob(`protokoll_${S.tenant}_${T().date}.csv`, new Blob([auditCsv(rows)], { type: "text/csv;charset=utf-8" }), { noTab: true }); toast(`${rows.length} Zeilen als CSV exportiert`); };
ACT.auditReset = () => { S.auditF = { sys: "", user: "", res: "", q: "" }; render(); };
Object.assign(ON, { auSys(v) { S.auditF.sys = v; render(); }, auUser(v) { S.auditF.user = v; render(); }, auRes(v) { S.auditF.res = v; render(); }, auQ(v) { S.auditF.q = v; render(); } });
const costNow = () => { const d = T().date; return { day: C.costs(W, S.tenant, { date: d }).total, month: C.costs(W, S.tenant, { period: d.slice(0, 7) }).total }; };
VIEWS.audit = () => {
  const all = auditRows(); const rows = auditFiltered(); const f = S.auditF; const c = costNow(); const sum = Math.round(rows.reduce((a, r) => a + (r.cost || 0), 0) * 1000) / 1000;
  const opts = (vals, cur) => `<option value="">Alle</option>` + [...new Set(vals)].filter(Boolean).sort().map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
  return head("Experience Layer · " + esc(T_NAMES[S.tenant]), "Protokoll", `<button class="btn pri" data-act="auditCsv">CSV exportieren</button>`)
   + `<div class="note acc small sn"><div>Jede Aktion und jede Agentenabfrage mit Datum, Person, Rolle, System, Zugriffsweg, Agent, Kosten und Ergebnis. Die Einträge entstehen aus dem gemeinsamen Ereignisprotokoll und sind reproduzierbar; abgelehnte Aktionen erreichen kein System und erscheinen nur in dieser Sitzung. Kosten sind ${C.COST_NOTE}.</div></div>`
   + `<div class="grid g3"><section class="card card-pad"><div class="eyebrow">Kosten heute</div><b class="num big" id="auDay">${eur4(c.day)}</b></section><section class="card card-pad"><div class="eyebrow">Kosten ${esc(perDe(T().date.slice(0, 7)))}</div><b class="num big" id="auMonth">${eur4(c.month)}</b></section><section class="card card-pad"><div class="eyebrow">Summe der Auswahl</div><b class="num big" id="auSum">${eur4(sum)}</b><span class="small faint"> ${rows.length} von ${all.length} Einträgen</span></section></div>`
   + `<section class="card card-pad"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
      <label class="f">System<select class="input" data-on="auSys">${opts(all.map(r => r.system), f.sys)}</select></label>
      <label class="f">Nutzer<select class="input" data-on="auUser">${opts(all.map(r => r.userName), f.user)}</select></label>
      <label class="f">Ergebnis<select class="input" data-on="auRes"><option value="">Alle</option><option value="ok" ${f.res === "ok" ? "selected" : ""}>ausgeführt</option><option value="rej" ${f.res === "rej" ? "selected" : ""}>abgelehnt</option></select></label>
      <label class="f" style="flex:1;min-width:180px">Suche<input class="input" data-on="auQ" value="${esc(f.q)}" placeholder="Befehl, Referenz, Text …"></label>
      ${f.sys || f.user || f.res || f.q ? `<button class="btn sm" data-act="auditReset">Filter zurücksetzen</button>` : ""}</div></section>`
   + `<section class="card" style="overflow:auto"><table class="small au-tbl"><thead><tr>${AUDIT_COLS.filter(c => c[0] !== "text").map(([k, l]) => `<th class="${k === "cost" ? "r" : ""}">${esc(l.replace(" (EUR, Beispielwert)", ""))}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.slice().reverse().slice(0, 300).map(r => `<tr class="${r.ok ? "" : "rej"}" title="${esc(r.text || "")}"><td class="num">${r.n}</td><td class="num">${esc(dDe(r.date))}</td><td>${esc(r.userName)}</td><td>${esc(r.role)}</td><td>${esc(r.system)}</td><td>${esc(r.route)}</td><td>${esc(r.agent)}</td><td class="mono">${esc(r.cmd)}</td><td class="mono">${esc(r.ref || "")}</td><td class="r num">${eur4(r.cost)}</td><td>${r.ok ? pill("p-good", "ausgeführt") : pill("p-crit", "abgelehnt")}${r.session ? `<span class="faint"> Sitzung</span>` : ""}</td><td>${esc(r.via)}</td></tr>`).join("") : `<tr><td colspan="12" class="muted">Keine Einträge${f.sys || f.user || f.res || f.q ? " für diesen Filter" : ""}.</td></tr>`}</tbody></table>${rows.length > 300 ? `<p class="small faint" style="padding:8px 12px">Angezeigt die letzten 300; der Export enthält alle ${rows.length}.</p>` : ""}</section>`;
};
// Kostenzähler in der Kopfzeile (nur im Layer-Modus; Suite-Ansicht unverändert)
const _topExtras5 = topExtras;
topExtras = function () { if (S.layer !== "layer") return _topExtras5(); const c = costNow(); return `<a class="cost-ctr" href="#audit" title="Kosten der protokollierten Zugriffe – ${esc(C.COST_NOTE)}" data-day="${c.day}" data-month="${c.month}"><span><i>heute</i> <b class="num">${eur4(c.day)}</b></span><span><i>Monat</i> <b class="num">${eur4(c.month)}</b></span></a>` + _topExtras5(); };
// Kosten je Aufgabe auf der Karte (Satz der Hauptaktion)
const _cardHtml5 = cardHtml;
cardHtml = function (k, o) { const a = (k.actions || [])[0]; const h = _cardHtml5(k, o); if (!a) return h; const rc = routeCost(a.cmd); return h.replace(`<span class="ly-route" title="Zugriffsweg">${esc(k.route)}</span>`, `<span class="ly-route" title="Zugriffsweg und Beispielkosten je Aktion">${esc(k.route)} · ${eur4(rc.cost)}</span>`); };
// Seite „Mitbestimmung & Datenschutz“ im Demo Control Center
VIEWS.privacy = () => {
  const t = T(); const sysIds = SYS_ORDER; const matrix = t.users.filter(u => !u.account).map(u => { const ks = C.listTasks(W, t.id, { user: u.id }); const set = new Set(ks.map(k => k.sys)); return { u, role: (t.roles.find(r => r.id === u.role) || {}).name || "", set, n: ks.length }; });
  const flows = [
    ["Simulierte Systeme (SAP, Microsoft 365, ServiceNow, Workday)", "Experience Layer im Browser", "Aufgaben, Belegdaten, Namen von Anfordernden und Mitarbeitenden – alles synthetisch aus dem Seed", "Inbox, Suche, Karten"],
    ["Experience Layer", "Gemeinsames Ereignisprotokoll (Datenbank dieser Seite) oder lokaler Browserspeicher", "Befehl, Parameter, ausführende Person (Demo-Rolle), Geschäftsdatum", "Reproduzierbarkeit, Live-Demo auf mehreren Geräten, Protokoll"],
    ["Experience Layer", "Claude (nur im Modus „Claude“)", "Die gestellte Frage, Ergebnisse der lesenden Werkzeuge und des gerouteten Agenten", "Antworten in natürlicher Sprache; Claude bucht nichts"],
    ["Experience Layer", "Google Drive (nur auf Klick, eigenes Konto)", "Sicherung des Ereignisprotokolls, Belegjournal, PDFs", "Sicherung und Export"],
    ["Router", "–", "Abgelehnte Anfragen", "Werden nicht weitergegeben, nur in dieser Sitzung gezählt"]
  ];
  return head("Demo Control Center", "Mitbestimmung & Datenschutz", `<a class="btn" href="#admin">← Demo Control Center</a>`)
   + `<div class="note warn small">Diese Seite beschreibt ausschließlich, wie die Demo funktioniert. Sie enthält keine Rechtsaussagen und ersetzt keine Prüfung durch Datenschutz, Betriebsrat oder Rechtsberatung.</div>`
   + `<section class="card card-pad"><h3>Welche Daten fließen wohin</h3><table class="small" style="margin-top:8px"><thead><tr><th>Von</th><th>Nach</th><th>Daten</th><th>Zweck</th></tr></thead><tbody>${flows.map(f => `<tr>${f.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <p class="small faint" style="margin-top:8px">Alle Daten der Demo sind synthetisch. Es bestehen keine Verbindungen zu echten Fremdsystemen; die Konnektoren arbeiten ohne Netzwerkzugriff.</p></section>`
   + `<section class="card card-pad" style="overflow-x:auto"><h3>Welche Rolle sieht was</h3><p class="small muted" style="margin:4px 0 8px">Aufgaben in der Inbox je Person und System, berechnet aus den Berechtigungen der Rolle (${esc(T_NAMES[t.id])}).</p><table class="small priv-mx"><thead><tr><th>Person</th><th>Rolle</th>${sysIds.map(s => `<th class="c">${esc(sysName(s).replace(" (simuliert)", ""))}</th>`).join("")}<th class="r">Aufgaben</th></tr></thead><tbody>${matrix.map(m => `<tr><td>${esc(m.u.name)}</td><td>${esc(m.role)}</td>${sysIds.map(s => `<td class="c">${m.set.has(s) ? "●" : "<span class='faint'>–</span>"}</td>`).join("")}<td class="r num">${m.n}</td></tr>`).join("")}</tbody></table></section>`
   + `<div class="grid g2"><section class="card card-pad"><h3>Protokoll und Auswertung</h3><ul class="small" style="padding-left:18px;margin-top:6px;display:flex;flex-direction:column;gap:4px"><li>Das Protokoll enthält je Aktion die ausführende Person und Rolle. Einsicht haben alle Betrachter der Demo.</li><li>Kosten werden je Zugriff, nicht je Person ausgewertet; die Ansicht „Agenten“ zeigt Summen je Agent.</li><li>Freigaben über ${esc(eur(C.FOUR_EYES_LIMIT))} (Beispielwert) brauchen zwei verschiedene Personen.</li><li>„Alle zurücksetzen“ entfernt Protokoll, Konnektorzustand und angelegte Accounts.</li></ul></section>
      <section class="card card-pad"><h3>Grenzen der KI</h3><ul class="small" style="padding-left:18px;margin-top:6px;display:flex;flex-direction:column;gap:4px"><li>Claude und der Regel-Rückfall schlagen Aktionen nur vor.</li><li>Ausgeführt wird erst nach Klick und Bestätigung einer Person, mit Rechteprüfung der Rolle.</li><li>${esc(C.SAP_POLICY_NOTE)}</li></ul></section></div>`;
};
const _adminV8 = VIEWS.admin;
VIEWS.admin = () => { const h = _adminV8(); if (S.layer !== "layer") return h; return h + `<section class="card card-pad row between" style="gap:12px"><div><h3>Mitbestimmung & Datenschutz</h3><p class="small muted">Welche Daten fließen wohin, welche Rolle sieht was – Beschreibung der Demo, keine Rechtsaussage.</p></div><a class="btn" href="#privacy">Öffnen →</a></section>`; };

/* ---------- Phase 6: Einbettungsmodus (#embed bzw. ?embed=1) ----------
   Kompakte Ansicht ohne Seitennavigation, nur Inbox und Assistent, für ca. 400 px Breite.
   Zeigt, wie NEXORA in Teams oder Copilot laufen würde – als Vorschau, keine echte Einbettung. */
S.embed = false;
function enterEmbed() { S.embed = true; S.layer = "layer"; S.live = false; if (!["tasks", "ai", "obj"].includes(route())) location.hash = "tasks"; render(); }
ACT.leaveEmbed = () => { S.embed = false; try { const u = new URL(location.href); u.searchParams.delete("embed"); history.replaceState(null, "", u.pathname + u.search + location.hash); } catch (e) {} render(); };
const embedBar = () => { const rt = route(); return `<div class="emb-bar"><div class="row between" style="gap:8px"><span class="emb-brand">${LOGO(20)}<b>NEXORA</b></span><button class="btn sm" data-act="userMenu">${esc(U().name)} · ${esc((R() || {}).name || "")}</button></div>
  <div class="seg emb-tabs" role="tablist"><a role="tab" class="${rt !== "ai" ? "on" : ""}" href="#tasks" aria-selected="${rt !== "ai"}">Inbox <b>${C.listTasks(W, S.tenant, { user: S.users[S.tenant] }).length}</b></a><a role="tab" class="${rt === "ai" ? "on" : ""}" href="#ai" aria-selected="${rt === "ai"}">Assistent</a></div>
  <div class="emb-note">Vorschau einer Einbettung (z. B. in Teams oder Copilot) · Fremdsysteme simuliert · <button class="link-btn" data-act="leaveEmbed">Vollansicht</button></div></div>`; };
const _render6 = render;
render = function () { document.body.classList.toggle("embed", !!S.embed); if (S.embed) S.live = false; _render6(); if (S.embed) { const m = document.querySelector("#root .main"); if (m) m.insertAdjacentHTML("afterbegin", embedBar()); } };
try { if (/^#embed\b/.test(location.hash) || new URLSearchParams(location.search).get("embed") === "1") { S.embed = true; S.layer = "layer"; if (/^#embed\b/.test(location.hash)) { try { history.replaceState(null, "", "#tasks"); } catch (e) { location.hash = "tasks"; } } } } catch (e) {}

/* ---------- Phase 7: Individuelles Dashboard, System of Record je Prozess, Ablöse-Cockpit ---------- */
const TR_PROJECT = C.SUPPORTED_TRANSITION.bestellanforderung; // "sap-pr"
const trState = (proc, tid) => (C.state(W, tid || S.tenant).transition[proc] || { phase: "überlagert", log: [] });
const PHASE_LABEL = { "überlagert": "überlagert", parallel: "im Parallelbetrieb", "abgelöst": "abgelöst", "zurückgestellt": "zurückgestellt" };
const phaseOf = p => { const own = C.owners(W, S.tenant)[p]; const st = trState(p); if (C.PROCESSES[p].owner === "nexora") return "nativ"; return st.phase === "überlagert" && own === "nexora" ? "abgelöst" : st.phase; };
const phasePill = ph => ph === "nativ" ? pill("p-good", "NEXORA nativ") : ph === "abgelöst" ? pill("p-good", "abgelöst") : ph === "parallel" ? pill("p-warn", "im Parallelbetrieb") : ph === "zurückgestellt" ? pill("p-neu", "zurückgestellt") : pill("p-acc", "überlagert");
// Parallelbetrieb: neue Bestellanforderungen der Engine ins Altsystem spiegeln (eigenes protokolliertes Ereignis)
function mirrorFor(cmd, p, res) {
  if (cmd !== "createRequisition" || !res || !res.ok || !res.objects || !res.objects.length) return [];
  if (trState("bestellanforderung").phase !== "parallel") return [];
  const q = T().reqs.find(x => x.no === res.objects[0]); if (!q || q.type !== "indirekt") return [];
  return [{ cmd: "conn.sap.mirrorPR", p: { reqNo: q.no, text: q.text, qty: q.qty, price: q.price, requester: q.requesterName, costCenter: q.costCenter, via: "Parallelbetrieb" } }];
}
/* Dashboard-Kacheln: systemneutral, lesen über das System of Record */
function kpiDefs() { return KPI_DEF.common.concat(KPI_DEF[S.tenant] || []); }
const DASH_TEMPLATES = { ceo: ["kpi:cash", "kpi:revenueCur", "trend", "approvals", "process", "costs"], cfo: ["kpi:cash", "kpi:arOpen", "kpi:apOpen", "approvals", "costs", "trend"], buy: ["approvals", "tasks", "kpi:apOpen", "kpi:inventory", "process"], sales: ["tasks", "kpi:revenueCur", "kpi:backlog", "trend"], prod: ["tasks", "kpi:openProd", "kpi:wip", "process"], hr: ["tasks", "approvals", "process"] };
const TEMPLATE_LABEL = { ceo: "CEO", cfo: "CFO", buy: "Einkauf", sales: "Vertrieb", prod: "Fertigung", hr: "HR" };
function tileCatalog() { const k = E.kpis(T()); return [["approvals", "Offene Freigaben (alle Systeme)"], ["tasks", "Meine Aufgaben"], ["trend", "Umsatz und EBIT (12 Monate)"], ["process", "Prozessstatus und System of Record"], ["costs", "Zugriffskosten"]].concat(kpiDefs().filter(d => k[d[0]] != null).map(d => ["kpi:" + d[0], "Kennzahl: " + d[1]])); }
function dashTemplate(roleId) { const valid = new Set(tileCatalog().map(x => x[0])); return (DASH_TEMPLATES[roleId] || ["tasks", "approvals", "kpi:cash", "trend"]).filter(x => valid.has(x)); }
function dashTiles() { const s = C.state(W, S.tenant); const u = U(); return { tiles: s.dash["user:" + u.id] || s.dash["role:" + u.role] || dashTemplate(u.role), own: !!s.dash["user:" + u.id] }; }
const tileLabel = id => (tileCatalog().find(x => x[0] === id) || [id, id])[1];
function tileBody(id) {
  const t = T();
  if (id.startsWith("kpi:")) { const key = id.slice(4); const d = kpiDefs().find(x => x[0] === key); const v = E.kpis(t)[key]; return `<div class="dt-kpi num">${d && d[2] === "n" ? num(v || 0) : eur(v || 0)}</div><span class="small faint">aus Belegen und Nebenbüchern der NEXORA-Engine</span>`; }
  if (id === "approvals" || id === "tasks") { const all = layerTasks(); const l = id === "approvals" ? all.filter(k => (k.actions || []).some(a => /Freigabe|Freigeben|Zustimmen|Genehmig/i.test(a.label))) : all; const by = {}; for (const k of l) by[k.source] = (by[k.source] || 0) + 1;
    return `<div class="row between"><b class="dt-kpi num">${l.length}</b><span class="small faint">${Object.entries(by).map(([a, n]) => `${esc(a.replace(" (simuliert)", ""))} ${n}`).join(" · ")}</span></div><div class="list">${l.slice(0, 4).map(k => `<button class="dt-row" data-act="openObj" data-ref="${esc(k.ref)}"><span class="ly-chip s-${k.sys}">${esc(sysName(k.sys).replace(" (simuliert)", ""))}</span><span class="grow">${esc(k.title)}</span>${k.amount ? `<span class="num small">${eur(k.amount)}</span>` : ""}</button>`).join("")}</div>${l.length > 4 ? `<a class="small" href="#tasks">alle ${l.length} anzeigen →</a>` : ""}`; }
  if (id === "trend") { const tr = (E.kpis(t).trend || []).slice(-12); const mx = Math.max(1, ...tr.map(x => x.revenue)); const W2 = 300, H = 90, bw = W2 / Math.max(1, tr.length);
    return `<svg viewBox="0 0 ${W2} ${H + 14}" class="dt-trend" role="img" aria-label="Umsatz und EBIT der letzten 12 Monate">${tr.map((x, i) => `<rect x="${i * bw + 2}" y="${H - x.revenue / mx * H}" width="${bw - 4}" height="${x.revenue / mx * H}" rx="2" class="b"><title>${perDe(x.period)}: Umsatz ${eur(x.revenue)}, EBIT ${eur(x.ebit)}</title></rect>`).join("")}<polyline class="l" points="${tr.map((x, i) => `${i * bw + bw / 2},${H - Math.max(0, x.ebit) / mx * H}`).join(" ")}"/>${tr.length ? `<text x="0" y="${H + 12}" class="tx">${esc(perDe(tr[0].period))}</text><text x="${W2}" y="${H + 12}" text-anchor="end" class="tx">${esc(perDe(tr[tr.length - 1].period))}</text>` : ""}</svg><span class="small faint">Balken Umsatz, Linie EBIT · abgeschlossene Perioden</span>`; }
  if (id === "process") { const own = C.owners(W, t.id); return `<div class="list">${Object.keys(C.PROCESSES).map(p => `<div class="dt-row static"><span class="grow small">${esc(C.PROCESSES[p].label)}</span><span class="ly-chip s-${own[p]}">${esc(sysName(own[p]).replace(" (simuliert)", ""))}</span>${phasePill(phaseOf(p))}</div>`).join("")}</div><a class="small" href="#transition">Ablöse-Cockpit →</a>`; }
  if (id === "costs") { const c = costNow(); return `<div class="row" style="gap:18px"><div><div class="eyebrow">heute</div><b class="dt-kpi num">${eur4(c.day)}</b></div><div><div class="eyebrow">Monat</div><b class="dt-kpi num">${eur4(c.month)}</b></div></div><span class="small faint">${esc(C.COST_NOTE)} · <a href="#audit">Protokoll</a></span>`; }
  return `<p class="small muted">Unbekannte Kachel.</p>`;
}
const DASH_SRC = { approvals: "alle Systeme", tasks: "alle Systeme", process: "Experience Layer", costs: "Protokoll", trend: "NEXORA-Engine" };
function saveDash(tiles) { act("conn.layer.setDash", { tiles }); }
Object.assign(ACT, {
  dashEdit() { S.dashEdit = !S.dashEdit; render(); },
  dashMove(d) { const l = dashTiles().tiles.slice(); const i = +d.i, j = i + (+d.dir); if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; saveDash(l); },
  dashDel(d) { const l = dashTiles().tiles.slice(); l.splice(+d.i, 1); saveDash(l); },
  dashTpl(d) { saveDash(dashTemplate(d.r || U().role)); }
});
ON.dashAdd = v => { if (!v) return; const l = dashTiles().tiles.slice(); if (!l.includes(v)) l.push(v); saveDash(l); };
VIEWS.dashboard = () => {
  const u = U(); const { tiles, own } = dashTiles(); const ed = !!S.dashEdit; const rest = tileCatalog().filter(x => !tiles.includes(x[0]));
  return head("Experience Layer · " + esc(T_NAMES[S.tenant]), "Mein Dashboard", `<div class="row"><button class="btn ${ed ? "pri" : ""}" data-act="dashEdit">${ed ? "Fertig" : "Anpassen"}</button><button class="btn" data-act="userMenu">${esc(u.name)} · ${esc((R() || {}).name || "")}</button></div>`)
   + `<div class="note acc small sn"><div>Kacheln im Aktionskarten-Format, systemneutral: „Offene Freigaben“ zeigt Vorgänge aus SAP, ServiceNow oder der NEXORA-Engine – je nachdem, welches System den Prozess gerade führt. ${own ? "Eigene Zusammenstellung" : `Vorlage ${esc(TEMPLATE_LABEL[u.role] || "Standard")}`}; Änderungen stehen im Ereignisprotokoll (Typ dash) und sind damit reproduzierbar, teilbar und per Reset rücksetzbar.</div></div>`
   + (ed ? `<section class="card card-pad row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="f">Kachel hinzufügen<select class="input" data-on="dashAdd"><option value="">Kachel wählen …</option>${rest.map(x => `<option value="${esc(x[0])}">${esc(x[1])}</option>`).join("")}</select></label><span class="small muted">Vorlage laden:</span>${Object.keys(DASH_TEMPLATES).map(r => `<button class="btn sm" data-act="dashTpl" data-r="${r}">${TEMPLATE_LABEL[r]}</button>`).join("")}</section>` : "")
   + `<div class="dash-grid">${tiles.map((id, i) => `<article class="ly-card card dash-tile" data-tile="${esc(id)}"><div class="ly-src"><span class="ly-chip">${esc(id.startsWith("kpi:") ? "NEXORA-Engine" : DASH_SRC[id] || "")}</span>${ed ? `<span class="grow"></span><button class="icon-btn sm" data-act="dashMove" data-i="${i}" data-dir="-1" aria-label="nach vorn" ${i === 0 ? "disabled" : ""}>↑</button><button class="icon-btn sm" data-act="dashMove" data-i="${i}" data-dir="1" aria-label="nach hinten" ${i === tiles.length - 1 ? "disabled" : ""}>↓</button><button class="icon-btn sm" data-act="dashDel" data-i="${i}" aria-label="entfernen">${ic("x", 13)}</button>` : ""}</div><h3>${esc(tileLabel(id).replace("Kennzahl: ", ""))}</h3>${tileBody(id)}</article>`).join("") || `<section class="card card-pad"><p class="muted">Keine Kacheln. Über „Anpassen“ hinzufügen.</p></section>`}</div>`;
};
VIEWS.home = () => S.layer === "layer" ? VIEWS.dashboard() : _home8();
// Navigation: „Home“ heißt im Layer-Modus „Dashboard“
const _render8d = render; render = function () { const h = MODS.home[0]; if (S.layer === "layer") MODS.home[0] = "Dashboard"; try { _render8d(); } finally { MODS.home[0] = h; } };

/* Ablöse-Cockpit (Route transition). Im Layer-Modus ersetzt es den Prototyp „Transformation“; in der Suite bleibt der Prototyp. */
const PROC_CMDS = { bestellanforderung: ["approvePR", "rejectPR", "createPR", "mirrorPR", "markMigrated"], rechnungsfreigabe: ["approveInvoice", "rejectInvoice"], ticket_einkauf: ["approveRITM", "rejectRITM", "createRITM"], abwesenheit: ["approveAbsence", "rejectAbsence"], freigabebitte: ["replyApproval"], onboarding: ["completeOnboardingTask"], auftrag: [] };
const LICENSE_EX = { bestellanforderung: [12, 95, "Lizenzen für Anfordernde im Altsystem"], rechnungsfreigabe: [4, 140, "Lizenzen für Freigebende"], ticket_einkauf: [20, 30, "Lizenzen im Service-Portal"], abwesenheit: [60, 6, "Lizenzen Self-Service"], onboarding: [3, 45, "Lizenzen HR-Fachbereich"] };
function procCosts(p) { const own0 = C.PROCESSES[p].owner; const per = T().date.slice(0, 7); const L = C.ledger(W, S.tenant).filter(x => x.sys === own0 && x.period === per && PROC_CMDS[p].includes(x.cmd)); return { calls: L.length, cost: Math.round(L.reduce((a, x) => a + x.cost, 0) * 1000) / 1000 }; }
S.trRules = S.trRules || { fillCostCenter: false, excludeUnmapped: false }; S.trDays = S.trDays || 14;
Object.assign(ACT, {
  trTest() { act("migrationTest", { project: TR_PROJECT, source: C.prExtract(W, S.tenant), rules: Object.assign({}, S.trRules) }); },
  trReq() { act("migrationRequestApproval", { project: TR_PROJECT }); },
  trAppr() { act("migrationApprove", { project: TR_PROJECT }); },
  trRun() { act("migrationRun", { project: TR_PROJECT, object: "requisitions" }); },
  trParallel() { const r = act("conn.layer.transition", { process: "bestellanforderung", step: "parallel", days: S.trDays }); if (r && r.ok) { const M = T().migProjects[TR_PROJECT]; act("conn.sap.markMigrated", { map: M.map }); } },
  trSample() { const c = T().catalog[0]; act("createRequisition", { catalogId: c.id, qty: 1, costCenter: T().master.costCenters[0].id }); },
  trCutover() { act("conn.layer.transition", { process: "bestellanforderung", step: "cutover" }); },
  trRollback() { confirmCard({ title: "Ablösung Bestellanforderung", source: "Experience Layer", sys: "nexora", process: "bestellanforderung" }, { label: "Rückweg ausführen", cmd: "conn.layer.transition" }, () => act("conn.layer.transition", { process: "bestellanforderung", step: "rollback" })); }
});
Object.assign(ON, { trRule(v, el) { S.trRules[el.dataset.k] = el.checked; render(); }, trDays(v) { S.trDays = +v || 14; } });
VIEWS.transition = () => {
  const t = T(); const own = C.owners(W, t.id); const st = trState("bestellanforderung"); const M = (t.migProjects || {})[TR_PROJECT]; const x = M && M.tests.requisitions; const done = M && M.done.requisitions; const ph = st.phase; const rc = ph === "parallel" ? C.reconcile(W, t.id, "bestellanforderung") : null;
  const truescale = ON_PAGES ? "truescale.html#roi" : "https://marcelwagner-afk.github.io/nexora-suite/truescale.html#roi";
  const rows = Object.keys(C.PROCESSES).map(p => { const P = C.PROCESSES[p]; const phx = phaseOf(p); const sh = C.share(W, t.id, p); const pc = procCosts(p); const lic = LICENSE_EX[p];
    return `<tr data-proc="${p}"><td><b>${esc(P.label)}</b></td><td><span class="ly-chip s-${own[p]}">${esc(sysName(own[p]).replace(" (simuliert)", ""))}</span></td><td>${phasePill(phx)}</td><td><div class="tr-bar" title="${Math.round(sh * 100)} %"><i style="width:${Math.round(sh * 100)}%"></i></div><span class="small num">${Math.round(sh * 100)} %</span></td><td class="r num small">${P.owner === "nexora" ? "–" : `${eur4(pc.cost)}<div class="faint">${pc.calls} Aufrufe im Monat</div>`}</td><td class="r num small">${lic ? `${eur(lic[0] * lic[1])}/Monat<div class="faint">${lic[0]} × ${eur(lic[1])} ${esc(lic[2])}</div>` : "–"}</td><td class="small">${C.SUPPORTED_TRANSITION[p] ? `<a href="#tr-bestell">Ablösung steuern ↓</a>` : P.owner === "nexora" ? "läuft in NEXORA" : `<span class="faint">in dieser Demo nicht umstellbar</span>`}</td></tr>`; }).join("");
  const step = (n, title, state, body) => `<section class="card card-pad tr-step ${state}"><div class="row between"><h3><span class="tr-n">${n}</span> ${esc(title)}</h3>${state === "done" ? pill("p-good", "erledigt") : state === "active" ? pill("p-acc", "jetzt") : pill("p-neu", "später")}</div>${body}</section>`;
  const s1 = !done ? "active" : "done", s2 = ph === "parallel" ? "active" : ph === "abgelöst" ? "done" : done ? "active" : "", s3 = ph === "abgelöst" ? "done" : ph === "parallel" ? "active" : "";
  const extract = C.prExtract(W, t.id).requisitions;
  return head("Experience Layer · " + esc(T_NAMES[t.id]), "Ablöse-Cockpit", `<button class="btn" data-act="userMenu">${esc(U().name)} · ${esc((R() || {}).name || "")}</button>`)
   + `<div class="note acc small sn"><div>Prozess für Prozess vom Altsystem in die NEXORA-Engine – ohne dass Mitarbeitende die Oberfläche wechseln. Inbox, Karten, Suche und Dashboard lesen über das System of Record je Prozess. Altsysteme sind simuliert; alle Geldwerte sind <b>Beispielwerte</b>, keine Herstellerpreise. Der Prototyp „Transformation“ bleibt in der Suite-Ansicht erreichbar.</div></div>`
   + `<section class="card" style="overflow:auto"><table class="small tr-tbl"><thead><tr><th>Prozess</th><th>System of Record</th><th>Status</th><th>Anteil NEXORA</th><th class="r">entfallende Zugriffskosten</th><th class="r">Lizenzwirkung (illustrativ)</th><th></th></tr></thead><tbody>${rows}</tbody></table><p class="small faint" style="padding:8px 14px">Zugriffskosten aus dem Protokoll (laufender Monat, Beispielwerte). Lizenzwirkung illustrativ mit Beispielwerten – eigene Annahmen im <a href="${truescale}" target="${ON_PAGES ? "_self" : "_blank"}" rel="noopener">Kostenrechner auf der TRUESCALE-Seite</a>.</p></section>`
   + `<h2 id="tr-bestell" style="margin-top:6px">Bestellanforderung: SAP S/4HANA (simuliert) → NEXORA-Engine</h2>`
   + step(1, "Datenübernahme über das Migrationsmodul", s1, done ? `<p class="small">Übernommen am ${dDe(done.date)} durch ${esc(done.by)}: <b>${done.loaded} von ${done.source}</b> Bestellanforderungen, Summe ${eur(done.loadedSum)} = Quelle ${eur(done.sourceSum - (done.excludedSum || 0))}${done.excluded ? `, ${done.excluded} auf der Klärungsliste` : ""}. Neue Nummern: ${esc((done.reqs || []).join(", "))}.</p>`
      : `<p class="small muted">Extrakt der offenen Bestellanforderungen aus dem Altsystem: <b>${extract.length}</b> Vorgänge, ${eur(extract.reduce((a, r) => a + r.MENGE * r.PREIS, 0))}. Testlauf auf einer Kopie, Fehlerliste, Freigabe durch eine zweite Person mit Freigaberecht, dann Produktivübernahme – dasselbe Modul wie bei der Übernahme Liftservice Nord.</p>
        <div class="row" style="gap:14px;flex-wrap:wrap"><label class="small"><input type="checkbox" data-on="trRule" data-k="fillCostCenter" ${S.trRules.fillCostCenter ? "checked" : ""}> Fehlende Kostenstelle durch Einkauf ersetzen</label><label class="small"><input type="checkbox" data-on="trRule" data-k="excludeUnmapped" ${S.trRules.excludeUnmapped ? "checked" : ""}> Nicht zuordenbare auf Klärungsliste</label></div>
        ${x ? `<table class="small"><thead><tr><th class="r">Quelle</th><th class="r">übernehmbar</th><th class="r">ausgeschlossen</th><th class="r">Fehler</th><th class="r">Summe Quelle</th><th class="r">Summe Ziel</th></tr></thead><tbody><tr><td class="r num">${x.source}</td><td class="r num">${x.loaded}</td><td class="r num">${x.excluded}</td><td class="r num">${x.errors ? `<b style="color:var(--crit)">${x.errors}</b>` : 0}</td><td class="r num">${eur(x.sourceSum)}</td><td class="r num">${eur(x.loadedSum)}</td></tr></tbody></table>${x.issues.length ? `<div class="list">${x.issues.map(i => `<div class="li small" style="padding:4px 0"><span class="mono" style="width:90px">${esc(i[0])}</span><span class="grow">${esc(i[1])}</span></div>`).join("")}</div>` : ""}` : ""}
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn ${!x ? "pri" : ""}" data-act="trTest">Testlauf${x ? " wiederholen" : ""}</button><button class="btn ${x && !x.errors && !M.approval ? "pri" : ""}" data-act="trReq" ${x && !x.errors && !(M.approval && M.approval.status) ? "" : "disabled"}>Freigabe anfordern</button><button class="btn ${M && M.approval && M.approval.status === "offen" ? "pri" : ""}" data-act="trAppr" ${M && M.approval && M.approval.status === "offen" ? "" : "disabled"}>Freigeben (Vier-Augen)</button><button class="btn ${M && M.approval && M.approval.status === "freigegeben" ? "pri" : ""}" data-act="trRun" ${M && M.approval && M.approval.status === "freigegeben" ? "" : "disabled"}>Produktivübernahme</button></div>
        ${M && M.approval ? `<p class="small faint">Freigabe ${esc(M.approval.status)} · angefordert von ${esc(M.approval.requesterName)}${M.approval.by ? " · freigegeben von " + esc(M.approval.by) : " · freigeben muss eine andere Person mit Freigaberecht"}</p>` : ""}`)
   + step(2, "Parallelbetrieb mit Abstimmung", s2, ph === "parallel" ? `<p class="small">Bis ${dDe(st.until)}: Neue Bestellanforderungen entstehen in der NEXORA-Engine und werden ins Altsystem gespiegelt. Die übernommenen Originale sind in SAP als „übernommen“ gekennzeichnet.</p>
        <table class="small"><thead><tr><th>Abstimmung</th><th class="r">NEXORA-Engine</th><th class="r">Altsystem (Spiegel)</th><th class="r">Differenz</th></tr></thead><tbody><tr><td>Vorgänge</td><td class="r num">${rc.nexora.count}</td><td class="r num">${rc.legacy.count}</td><td class="r num">${rc.diffCount}</td></tr><tr><td>Stückzahl</td><td class="r num">${rc.qty.nexora}</td><td class="r num">${rc.qty.legacy}</td><td class="r num">${rc.qty.nexora - rc.qty.legacy}</td></tr><tr><td>Summe</td><td class="r num">${eur(rc.nexora.sum)}</td><td class="r num">${eur(rc.legacy.sum)}</td><td class="r num">${eur(rc.diffSum)}</td></tr></tbody></table>
        <p class="small">${rc.diffCount === 0 && rc.diffSum === 0 ? pill("p-good", "Differenz 0 – Umschalten möglich") : pill("p-crit", "Differenzen: " + rc.missing.join(", "))}</p><div class="row" style="gap:8px"><button class="btn sm" data-act="trSample">Test-Bedarf in NEXORA anlegen</button><a class="btn sm" href="#supply">Einkauf öffnen</a></div>`
      : ph === "abgelöst" ? `<p class="small">Abgeschlossen. Abstimmung beim Umschalten: ${st.recon ? `${st.recon.nexora.count} Vorgänge, ${eur(st.recon.nexora.sum)}, Differenz 0` : "Differenz 0"}.</p>`
      : `<div class="row" style="gap:10px;align-items:flex-end"><label class="f">Zeitraum<select class="input" data-on="trDays">${[7, 14, 30].map(d => `<option value="${d}" ${S.trDays === d ? "selected" : ""}>${d} Tage</option>`).join("")}</select></label><button class="btn ${done ? "pri" : ""}" data-act="trParallel" ${done ? "" : "disabled"}>Parallelbetrieb starten</button></div><p class="small faint">${done ? "System of Record wechselt auf die NEXORA-Engine; das Altsystem erhält jede neue Bestellanforderung als Spiegel." : "Erst nach der Datenübernahme möglich."}</p>`)
   + step(3, "Umschalten oder Rückweg", s3, ph === "abgelöst" ? `<p class="small">System of Record ist die <b>NEXORA-Engine</b>. SAP S/4HANA (simuliert) ist für Bestellanforderungen nur noch lesend (Historie). Neue Vorgänge entstehen ausschließlich in der Engine.</p>`
      : `<div class="row" style="gap:8px"><button class="btn ${ph === "parallel" && rc && rc.diffCount === 0 && rc.diffSum === 0 ? "pri" : ""}" data-act="trCutover" ${ph === "parallel" && rc && rc.diffCount === 0 && rc.diffSum === 0 ? "" : "disabled"}>Umschalten auf NEXORA</button><button class="btn" data-act="trRollback" ${ph === "parallel" ? "" : "disabled"}>Rückweg</button></div><p class="small faint">Der Rückweg ist bis zum Abschluss des Parallelbetriebs möglich: Das Altsystem führt wieder, offene Vorgänge in NEXORA werden zurückgezogen, Spiegelungen werden führende Vorgänge. Jeder Schritt steht im Protokoll.</p>`)
   + `<section class="card card-pad"><h3>Ablaufprotokoll</h3><div class="list">${[].concat((M ? M.log : []).map(l => [l.date, l.by, "Migration: " + l.text]), (st.log || []).map(l => [l.date, l.by, l.text])).map(l => `<div class="li small" style="padding:5px 0"><span class="num" style="width:90px">${esc(dDe(l[0]))}</span><span style="width:140px">${esc(l[1])}</span><span class="grow">${esc(l[2])}</span></div>`).join("") || `<p class="small muted">Noch keine Schritte.</p>`}</div><a class="small" href="#audit">Alle Ereignisse im Protokoll →</a></section>`;
};
const _transformation7 = VIEWS.transformation;
VIEWS.transformation = () => S.layer === "layer" ? VIEWS.transition() : _transformation7();

/* ---------- Phase 8: geführte Storys im Experience Layer ---------- */
const snTicketFrom = src => C.state(W, "elevon").servicenow.tickets.find(o => o.source === src && (o.status === "zur Freigabe" || o.status === "1. Freigabe erteilt"));
const sapPrFrom = re => C.state(W, "elevon").sap.prs.find(o => re.test(o.source || "") && o.status === "zur Freigabe");
STORIES.push(
  { id: "crosssys", tenant: "elevon", cross: [], short: "Freigabe über Systemgrenzen", title: "Freigabe über Systemgrenzen: Vom Onboarding zum Wareneingang", situation: "Eine neue Mitarbeiterin startet bei Elevon. Ihr Onboarding läuft in Workday, IT-Anfragen in ServiceNow, Bestellanforderungen in SAP – Bestellung und Wareneingang in der NEXORA-Engine. Alle Fremdsysteme sind simuliert.", layer: true, problem: "Heute springt jede Freigabe zwischen vier Oberflächen, und niemand sieht die Kosten der Zugriffe.", value: "Eine Inbox für alle Systeme: Jeder Schritt ist eine Karte mit Quelle, Zugriffsweg und Beispielkosten. Folgeschritte entstehen über Ereignisse, jeder ist im Protokoll einer Person und Rolle zugeordnet.", steps: [
    { t: "HR stößt im Onboarding den Laptop an", d: "Workday-Aufgabe erledigt – als Folgeschritt entsteht automatisch ein ServiceNow-Ticket.", user: "u8", cmd: "conn.workday.completeOnboardingTask", p: () => ({ ref: "workday:onb:ONB-77:laptop" }), go: "tasks" },
    { t: "CFO gibt das ServiceNow-Ticket in NEXORA frei", d: "Karte „ServiceNow (simuliert)“ über Now Assist (A2A) – Folgeschritt: SAP-Bestellanforderung über Joule.", user: "u2", multi: () => { const o = snTicketFrom("Workday ONB-77"); return o ? [["conn.servicenow.approveRITM", { ref: "servicenow:ritm:" + o.no }]] : []; }, go: "tasks" },
    { t: "CFO gibt die SAP-Bestellanforderung frei", d: "Joule-Weg (A2A, 0,04 € Beispielwert). Da der Laptop ein Katalogartikel ist, laufen Bestellung und Wareneingang in der NEXORA-Engine.", user: "u2", multi: () => { const o = sapPrFrom(/ServiceNow RITM/); return o ? [["conn.sap.approvePR", { ref: "sap:pr:" + o.no }]] : []; } },
    { t: "Einkauf bestellt in der NEXORA-Engine", d: "Bestellung beim IT-Lieferanten aus der freigegebenen Bedarfsanforderung.", user: "u5", cmd: "convertRequisitions", p: () => ({}), go: "supply" },
    { t: "Wareneingang in der NEXORA-Engine", d: "GWG-Notebook auf Konto 6830, Kostenstelle belastet.", user: "u6", multi: () => W.tenants.elevon.purchaseOrders.filter(p => p.kind === "indirekt" && !p.grDoc).map(p => ["postGoodsReceipt", { poNo: p.no }]) },
    { t: "Kosten und Protokoll prüfen", d: "Jeder Schritt mit Person, Rolle, System, Weg, Agent und Beispielkosten; Summe = Kostenzähler.", user: "u2", multi: () => [], then: () => {}, go: "audit" }
  ], outro: "Vier Systeme, eine Oberfläche: Die Kosten der Zugriffe stehen im Protokoll, jede Ausführung ist einem Menschen zugeordnet." },
  { id: "oneday", tenant: "elevon", cross: [], short: "Ein Tag im Experience Layer", title: "Ein Tag im Experience Layer: Die CFO arbeitet ihre Inbox ab", situation: "Martin Seidel, CFO bei Elevon, hat Freigaben in SAP, Microsoft 365, ServiceNow und Workday – alle simuliert – und Aufgaben in der NEXORA-Engine.", layer: true, problem: "Vier Logins, vier Oberflächen, kein gemeinsamer Überblick.", value: "Ein persönliches Dashboard und eine Inbox über alle Systeme; der Assistent schlägt vor, ausgeführt wird erst nach Klick und Bestätigung.", steps: [
    { t: "Dashboard anpassen", d: "Kacheln Offene Freigaben, Bank, Zugriffskosten und Prozessstatus – gespeichert als Ereignis im Protokoll.", user: "u2", cmd: "conn.layer.setDash", p: () => ({ tiles: ["approvals", "kpi:cash", "costs", "process", "trend"] }), go: "home" },
    { t: "SAP: Kreditorenrechnung freigeben", d: "Über Joule (A2A); Rechnungen über 10.000 € bräuchten eine zweite Person.", user: "u2", multi: () => { const o = C.state(W, "elevon").sap.invoices.find(i => i.status === "zur Freigabe" && i.amount <= C.FOUR_EYES_LIMIT); return o ? [["conn.sap.approveInvoice", { ref: "sap:inv:" + o.no }]] : []; }, go: "tasks" },
    { t: "Microsoft 365: Freigabebitte beantworten", d: "Antwort per Copilot (A2A) statt Outlook.", user: "u2", multi: () => { const o = C.state(W, "elevon").m365.mails.find(m => m.needsApproval && m.status === "Antwort erwartet"); return o ? [["conn.m365.replyApproval", { ref: "m365:mail:" + o.no, decision: "zugestimmt" }]] : []; } },
    { t: "ServiceNow: Lizenzanfrage freigeben", d: "Folgeschritt: Bestellanforderung im System of Record SAP.", user: "u2", multi: () => { const o = C.state(W, "elevon").servicenow.tickets.find(x => x.no === "RITM0014022" && x.status === "zur Freigabe"); return o ? [["conn.servicenow.approveRITM", { ref: "servicenow:ritm:" + o.no }]] : []; } },
    { t: "Workday: Urlaub genehmigen", d: "Abwesenheit über den Workday-Agenten (A2A).", user: "u2", multi: () => { const o = C.state(W, "elevon").workday.absences.find(a => a.status === "beantragt"); return o ? [["conn.workday.approveAbsence", { ref: "workday:abs:" + o.no }]] : []; } },
    { t: "Assistent fragen, was noch offen ist", d: "Antwort mit Aktionskarten – ausgeführt wird nur nach Bestätigung.", user: "u2", ask: "Was muss ich heute freigeben?" }
  ], outro: "Die CFO hat vier Systeme bedient, ohne die Oberfläche zu wechseln. Kosten und Schritte stehen im Protokoll." },
  { id: "replace", tenant: "elevon", cross: [], short: "Prozess für Prozess ablösen", title: "Prozess für Prozess ablösen: Bestellanforderungen von SAP zur NEXORA-Engine", situation: "Bestellanforderungen laufen bei Elevon heute im (simulierten) SAP. Der Einkauf arbeitet bereits im Experience Layer.", layer: true, problem: "Eine Ablösung bedeutet sonst Big Bang, neue Oberfläche und Schulung.", value: "Datenübernahme über das bestehende Migrationsmodul, Parallelbetrieb mit Abstimmung, Umschalten bei Differenz 0 – die Karten in der Inbox sehen vorher und nachher gleich aus. Das Ablöse-Cockpit zeigt Fortschritt und entfallende Zugriffskosten (Beispielwerte).", steps: [
    { t: "Testlauf der Datenübernahme", d: "Extrakt der offenen SAP-Bestellanforderungen, Prüfung auf einer Kopie; fehlende Kostenstellen werden per Regel durch den Einkauf ersetzt.", user: "u10", cmd: "migrationTest", p: () => ({ project: TR_PROJECT, source: C.prExtract(W, "elevon"), rules: { fillCostCenter: true } }), go: "transition" },
    { t: "Freigabe anfordern", d: "Vier-Augen-Prinzip wie bei jeder Migration.", user: "u10", cmd: "migrationRequestApproval", p: () => ({ project: TR_PROJECT }) },
    { t: "CFO gibt die Übernahme frei", d: "Eine zweite Person mit Freigaberecht.", user: "u2", cmd: "migrationApprove", p: () => ({ project: TR_PROJECT }) },
    { t: "Produktivübernahme", d: "Bestellanforderungen entstehen in der NEXORA-Engine; Summe Ziel = Quelle.", user: "u10", cmd: "migrationRun", p: () => ({ project: TR_PROJECT, object: "requisitions" }) },
    { t: "Parallelbetrieb starten", d: "System of Record wechselt auf NEXORA; die Originale in SAP werden als übernommen gekennzeichnet.", user: "u2", multi: () => [["conn.layer.transition", { process: "bestellanforderung", step: "parallel", days: 14 }], ["conn.sap.markMigrated", { map: (W.tenants.elevon.migProjects || {})[TR_PROJECT] ? W.tenants.elevon.migProjects[TR_PROJECT].map : {} }]] },
    { t: "Einkauf legt einen neuen Bedarf an", d: "Entsteht in der Engine und wird ins Altsystem gespiegelt – die Abstimmung bleibt bei Differenz 0.", user: "u5", cmd: "createRequisition", p: () => ({ catalogId: "K-03", qty: 2, costCenter: "KS4130" }), go: "tasks" },
    { t: "CFO gibt in derselben Inbox frei", d: "Gleiche Karte wie vorher in SAP – nur Quelle und Zugriffsweg sind anders.", user: "u2", multi: () => { const q = W.tenants.elevon.reqs.find(x => x.legacy && x.status === "zur Freigabe"); return q ? [["approveRequisition", { reqNo: q.no }]] : []; } },
    { t: "Umschalten auf die NEXORA-Engine", d: "Nur bei Differenz 0 möglich. SAP bleibt für Bestellanforderungen lesend (Historie).", user: "u2", cmd: "conn.layer.transition", p: () => ({ process: "bestellanforderung", step: "cutover" }), go: "transition" }
  ], outro: "Der Einkauf hat die ganze Zeit in derselben Oberfläche gearbeitet. Das Ablöse-Cockpit zeigt den Prozess als abgelöst und die entfallenden Zugriffskosten." }
);
// Layer-Storys öffnen den Experience Layer (ohne die gespeicherte Einstellung zu ändern)
const _startStory8 = ACT.startStory;
ACT.startStory = function (d) { const st = STORIES.find(s => s.id === d.id); if (st && st.layer) S.layer = "layer"; return _startStory8(d); };
