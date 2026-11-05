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
