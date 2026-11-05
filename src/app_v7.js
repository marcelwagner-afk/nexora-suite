/* ===== v0.7 Live-Demo: Aufgaben je Rolle auf mehreren Geräten, Anwesenheit, Präsentationsmodus,
   Fernbedienung und Sprechertext, Sprung zu Schritt, Demo vorbereiten, Belege als PDF ===== */
const SUITE_PUBLIC = "https://claude.ai/artifact/Q47g6waQPsEyxXtKd6JgBe";
const PHONE_URL = () => ON_PAGES ? location.origin + location.pathname + "#tasks" : SUITE_PUBLIC;
MODS.tasks = ["Meine Aufgaben", "checkc", "live"]; MODS.documents = ["Belege & Dokumente", "proj", "live"]; MODS.remote = ["Fernbedienung", "rocket", "live"]; ROUTES.push("tasks", "documents", "remote");
const _vm7 = visibleMods;
visibleMods = function () { const m = _vm7().filter(x => !["tasks", "documents"].includes(x)); const i = m.indexOf("processes"); m.splice(i + 1, 0, "tasks"); const j = m.indexOf("users"); m.splice(j, 0, "documents"); return m; };
S.present = false; S.notes = false; S.taskSeen = null;
const loadLib = (() => { const c = {}; return url => c[url] || (c[url] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = url; s.onload = res; s.onerror = () => { delete c[url]; rej(new Error("Bibliothek nicht ladbar")); }; document.head.appendChild(s); })); })();
const LIB_PDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", LIB_QR = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";

/* ---------- Aufgaben je Rolle (aus dem Zustand der Engine abgeleitet) ---------- */
function roleTasks(tid, uid) {
  const t = W.tenants[tid]; const u = t.users.find(x => x.id === uid) || t.users[0]; const role = t.roles.find(r => r.id === u.role) || { perms: [] }; const can = p => role.perms.includes(p); const out = [];
  const add = (perm, id, title, sub, cmd, p, label, extra) => { if (perm && !can(perm)) return; out.push(Object.assign({ id, title, sub, cmd, p, label }, extra || {})); };
  for (const q of t.quotes || []) if (q.status === "zur Freigabe") add("approve", "q-" + q.no, `Angebot ${q.no} freigeben`, `${q.qty} × Aufzug E5 für ${E.customerName(t, q.customer)}, ${q.discountPct} % Rabatt, ${eur(q.net)} – Marge ${pct((q.net - q.cost.total) / q.net * 100)}`, "approveQuote", { quoteNo: q.no }, "Freigeben", { kind: "Freigabe" });
  for (const q of t.reqs || []) if (q.status === "zur Freigabe" && q.requester !== uid && (q.level !== "ceo" || u.role === "ceo")) add("approve", "r-" + q.no, `Bedarfsanforderung ${q.no}`, `${q.qty} × ${q.text} · ${eur(q.net, 2)} · ${q.requesterName} · Kostenstelle ${q.costCenter || "–"}`, "approveRequisition", { reqNo: q.no }, "Freigeben", { kind: "Freigabe", reject: { reqNo: q.no, reject: true } });
  if (t.migration && t.migration.approval && t.migration.approval.status === "offen" && t.migration.approval.requester !== uid) add("approve", "mig", "Produktivmigration Liftservice Nord freigeben", `angefordert von ${t.migration.approval.requesterName} · Testlauf fehlerfrei`, "migrationApprove", {}, "Freigeben", { kind: "Freigabe" });
  for (const a of t.absences || []) if (a.status === "beantragt") { const e = t.master.employees.find(x => x.id === a.employee); add("approve", "a-" + a.id, `${a.type}: ${e ? e.name : a.employee}`, `${a.days} Tage ab ${dDe(a.from)}`, "approveAbsence", { id: a.id }, "Genehmigen", { kind: "Freigabe" }); }
  if (t.eng) for (const d of t.eng.drawings) if (d.status === "importiert" && d.importedBy !== uid && !d.issues.some(i => i[2] === "error")) add("engineer", "d-" + d.no, `Konstruktionsfreigabe ${d.no} Rev. ${d.rev}`, `${d.title} · ${d.items.length} Positionen · Plan ${eur(d.costing.total, 2)}/Stk`, "releaseDesign", { drawingNo: d.no }, "Freigeben", { kind: "Freigabe" });
  for (const m of t.inbox.filter(x => x.status === "offen")) add("view", "i-" + m.id, m.text, "Eingang von " + T_NAMES[m.from], "processInbox", { id: m.id }, "Prüfen und buchen", { kind: "Posteingang" });
  for (const so of t.serviceOrders || []) if (so.status === "offen" && !so.tech) add("install", "s-" + so.no, `Techniker für ${so.no} einplanen`, so.text, "scheduleTechnician", { svNo: so.no }, "Einplanen", { kind: "Service" });
  if (t.id === "aventra" && can("approve")) for (const pr of t.projects) { const n = t.timeEntries.filter(e => e.project === pr.id && e.status === "erfasst").length; if (n) add("approve", "t-" + pr.id, `${n} Zeiteinträge ${pr.id} freigeben`, pr.name, "approveTime", { projectId: pr.id }, "Freigeben", { kind: "Freigabe" }); }
  return out;
}
let taskCount = () => roleTasks(S.tenant, S.users[S.tenant]).length;
function checkNewTasks() { const all = {}; for (const id of E.TENANT_IDS) for (const k of roleTasks(id, S.users[id])) all[id + ":" + k.id] = k; if (S.taskSeen) { const fresh = Object.keys(all).filter(k => !S.taskSeen[k]); if (fresh.length) { const k = all[fresh[0]]; toast(`Neue Aufgabe${fresh.length > 1 ? "n (" + fresh.length + ")" : ""}: ${k.title}`); try { navigator.vibrate && navigator.vibrate(120); } catch (e) {} } } S.taskSeen = all; }

/* ---------- Anwesenheit und Fernbedienung über den Raum ---------- */
BK.room = null; BK.peers = [];
function startRoom() {
  if (!window.claude || !window.claude.use) return;
  claude.use("room").then(room => { if (!room) return; BK.room = room;
    room.onPeers(ch => { BK.peers = ch.peers; if (ch.joined.length && S.present && S.story) emitStory(); renderTop(); }, () => {});
    room.on("story", m => { if (!m.isMe || !m.sameTab) { S.remoteStory = m.data; if (route() === "remote") render(); } }, () => {});
    room.on("next", m => { if (S.present && S.story && m.isMe && !m.sameTab) { storyStep(); toast("Weiter per Fernbedienung"); } }, () => {});
    sendPresence();
  }).catch(() => {});
}
function sendPresence() { if (!BK.room) return; const u = U(); const key = [u.name, S.tenant, route(), S.present].join("|"); if (BK.presKey === key) return; BK.presKey = key; BK.room.presence({ name: u.name, role: (R() || {}).name || "", tenant: S.tenant, route: route(), present: S.present }).catch(() => {}); }
function emitStory() { if (!BK.room || !S.story) return; BK.room.emit("story", { id: S.story.id, i: S.story.i, tenant: S.tenant }).catch(() => {}); }
function topExtras() {
  const others = (BK.peers || []).filter(p => !p.isMe);
  const chip = others.length ? `<span class="datechip" title="${esc(others.map(p => (p.presence.name || "Gast") + " · " + (p.presence.role || "") + " · " + (T_NAMES[p.presence.tenant] || "")).join("\n"))}">${ic("users", 15)}${others.length + 1} online</span>` : "";
  return chip + `<button class="modechip ${S.present ? "p-acc" : "p-neu"}" style="border:none;cursor:pointer" data-act="togglePresent" title="Präsentationsmodus (Taste P)">${S.present ? "Präsentation" : "Präsentieren"}</button>`;
}
function renderTop() { if (document.querySelector(".top2")) render(); }

/* ---------- Aufgaben-Ansicht (auch für das Handy) ---------- */
VIEWS.tasks = () => {
  const t = T(); const u = U(); const list = roleTasks(t.id, u.id); const others = E.TENANT_IDS.filter(id => id !== t.id).map(id => [id, roleTasks(id, S.users[id]).length]).filter(x => x[1]);
  return head("Meine Aufgaben · " + esc(T_NAMES[t.id]), esc(u.name) + " · " + esc((R() || {}).name || ""), `<div class="row"><a class="btn" href="#remote">Fernbedienung</a><button class="btn" data-act="userMenu">Rolle wechseln</button></div>`)
   + statusNote("live", "Aufgaben entstehen aus dem Zustand der Engine: Freigaben, Posteingang, Einplanungen. Was ein anderes Gerät anstößt, erscheint hier sofort – ideal, um im Termin am Handy freizugeben.")
   + (list.length ? `<div class="grid g2">${list.map(k => `<section class="card card-pad" style="display:flex;flex-direction:column;gap:10px"><div class="row between"><span class="eyebrow">${esc(k.kind || "Aufgabe")}</span></div><h3 style="font-size:17px">${esc(k.title)}</h3><p class="small muted">${esc(k.sub || "")}</p><div class="row"><button class="btn pri" style="flex:1;justify-content:center;padding:12px" data-act="run" data-cmd="${k.cmd}" data-p='${esc(JSON.stringify(k.p))}'>${esc(k.label)}</button>${k.reject ? `<button class="btn" style="padding:12px" data-act="run" data-cmd="${k.cmd}" data-p='${esc(JSON.stringify(k.reject))}'>Ablehnen</button>` : ""}</div></section>`).join("")}</div>`
     : `<section class="card card-pad"><p class="muted">Keine offenen Aufgaben für ${esc(u.name)}. ${others.length ? "Offen bei: " + others.map(([id, n]) => `<a href="#tasks" data-act="tenant" data-id="${id}">${esc(T_NAMES[id])} (${n})</a>`).join(", ") : ""}</p></section>`)
   + `<section class="card card-pad row" style="gap:16px;align-items:center"><div id="qrBox" style="width:132px;height:132px;flex:none;display:grid;place-items:center;background:#fff;border-radius:10px" aria-label="QR-Code"></div><div style="flex:1;min-width:200px"><h3>Auf dem Handy freigeben</h3><p class="small muted">QR-Code scannen, ${ON_PAGES ? "Seite öffnet sich direkt" : "Seite in der Claude-App oder im Browser öffnen (mit claude.ai-Konto; die Seite muss mit dem Konto geteilt sein)"}, Unternehmen und Rolle wählen – z. B. CFO. Freigaben vom Laptop erscheinen dort sofort.</p><p class="small faint mono" style="word-break:break-all">${esc(PHONE_URL())}</p></div></section>`;
};
async function drawQr(el, text, px) { try { await loadLib(LIB_QR); const q = qrcode(0, "M"); q.addData(text); q.make(); el.innerHTML = q.createSvgTag({ cellSize: Math.max(2, Math.floor((px || 128) / (q.getModuleCount() + 8))), margin: 4, scalable: true }); const s = el.querySelector("svg"); if (s) { s.style.width = "100%"; s.style.height = "100%"; } } catch (e) { el.innerHTML = `<span class="small faint" style="padding:8px;text-align:center">QR nicht verfügbar</span>`; } }

/* ---------- Fernbedienung und Sprechertext (zweites Gerät) ---------- */
function sayFor(st, i) {
  const s = st.steps[i]; if (!s) return `Abschluss: ${st.value} ${st.outro || ""}`;
  return (i === 0 ? `Ausgangslage: ${st.situation} Problem: ${st.problem} ` : "") + (s.say || s.d) + (s.ask ? " Jetzt fragen wir den KI-Assistenten." : " Zeig rechts: welche Belege entstehen, wie sich Bestand und Kennzahlen ändern – oder dass bewusst nichts gebucht wird.");
}
VIEWS.remote = () => {
  const rs = S.remoteStory; const st = rs && STORIES.find(s => s.id === rs.id);
  return head("Fernbedienung", "Sprechertext und Weiter") + statusNote("live", "Auf dem Präsentationsgerät „Präsentieren“ einschalten und eine geführte Demo starten. Dieses Gerät zeigt den Sprechertext und schaltet mit „Weiter“ – nur Geräte desselben Kontos dürfen weiterschalten.")
   + (!BK.room ? `<section class="card card-pad"><p class="muted">Die Fernbedienung braucht die Live-Verbindung der claude.ai-Seite. Hier ohne Verbindung: am Präsentationsgerät mit der Pfeiltaste → weiterschalten, Taste N zeigt den Sprechertext.</p></section>`
     : !st ? `<section class="card card-pad"><p class="muted">Warte auf eine laufende Demo am Präsentationsgerät …</p></section>`
     : `<section class="card card-pad" style="display:flex;flex-direction:column;gap:12px"><span class="eyebrow">${esc(st.title)} · Schritt ${Math.min(rs.i + 1, st.steps.length)} von ${st.steps.length}</span><h2>${esc(st.steps[rs.i] ? st.steps[rs.i].t : "Abschluss")}</h2><p style="font-size:17px;line-height:1.55">${esc(sayFor(st, rs.i))}</p>${st.steps[rs.i + 1] ? `<p class="small faint">Danach: ${esc(st.steps[rs.i + 1].t)}</p>` : ""}<button class="btn pri" style="justify-content:center;padding:16px;font-size:17px" data-act="remoteNext" ${st.steps[rs.i] ? "" : "disabled"}>Weiter →</button></section>`);
};

/* ---------- Präsentationsmodus, Sprechertext, Sprung zu Schritt ---------- */
const _render7 = render;
render = function () {
  _render7(); document.body.classList.toggle("present", !!S.present);
  if (route() === "tasks") { const el = document.getElementById("qrBox"); if (el) drawQr(el, PHONE_URL(), 128); }
  let ov = document.getElementById("notesOv"); if (S.notes && S.story) { const st = STORIES.find(s => s.id === S.story.id); if (!ov) { ov = document.createElement("div"); ov.id = "notesOv"; document.body.appendChild(ov); } ov.className = "card card-pad"; ov.setAttribute("style", "position:fixed;left:16px;bottom:16px;max-width:520px;z-index:30;display:flex;flex-direction:column;gap:6px;border-color:var(--accent-line)"); ov.innerHTML = `<span class="eyebrow">Sprechertext · Taste N blendet aus</span><p>${esc(sayFor(st, S.story.i))}</p>`; } else if (ov) ov.remove();
  checkNewTasks(); sendPresence();
};
const _storyPanel = storyPanel;
storyPanel = function () {
  const st = STORIES.find(s => s.id === S.story.id);
  return _storyPanel().replace(/<\/section>$/, `<div class="row small" style="gap:8px;border-top:1px solid var(--line);padding-top:10px"><label for="jumpTo" class="muted">Springen zu</label><select class="input" id="jumpTo" style="width:auto" data-on="jumpTo">${st.steps.map((s, i) => `<option value="${i}" ${i === S.story.i ? "selected" : ""}>${i + 1}. ${esc(s.t)}</option>`).join("")}</select><span class="faint">→ / Leertaste: weiter · N: Sprechertext · P: Präsentation</span></div></section>`);
};
const _storyStep7 = storyStep;
storyStep = function () { _storyStep7(); emitStory(); };
function jumpTo(n) {
  const id = S.story.id; ACT.startStory({ id, reset: 1 }); const st = STORIES.find(s => s.id === id); S.jumping = true;
  try { for (let i = 0; i < n; i++) { const s = st.steps[S.story.i]; if (!s) break; if (s.ask) { S.story.i++; continue; } const before = S.story.i; _storyStep7(); if (S.story.i === before) break; } } finally { S.jumping = false; }
  emitStory(); render(); toast(`Zu Schritt ${S.story.i + 1} gesprungen – alle vorherigen Schritte wurden echt ausgeführt.`);
}
async function prepareDemo() {
  if (BK.mode === "db" && BK.canEdit !== true) return toast("Nur Editoren dürfen die Demo zurücksetzen.", true);
  ACT.resetAllBtn(); S.mode = "guided"; S.present = true; S.users = { elevon: "u1", novamart: "u1", aventra: "u1" }; S.taskSeen = null; selfTest();
  const checks = [[S.selfTest.every(r => r[0]), "Bücher ausgeglichen, Nebenbücher = Hauptbuch, Reset reproduzierbar"], [E.TENANT_IDS.every(id => E.tenantHash(W.tenants[id]) === BASE[id]), "Alle drei Unternehmen im Ausgangszustand"], [BK.mode === "db", BK.mode === "db" ? "Gemeinsame Datenbank verbunden – zweites Gerät sieht alles live" : "Ohne gemeinsame Datenbank – nur dieses Gerät"], [!!BK.room, BK.room ? "Live-Raum aktiv: Anwesenheit und Fernbedienung" : "Kein Live-Raum – Fernbedienung nicht verfügbar"], [!!BK.sample, BK.sample ? "Claude verfügbar (Assistent, Zeichnung aus Bild)" : "Claude nicht verfügbar – Assistent regelbasiert"], [!!BK.mcp, BK.mcp ? "Google Drive verfügbar (Belege ablegen)" : "Google Drive nicht verfügbar"]];
  S.modal = () => `<div style="padding:20px;display:flex;flex-direction:column;gap:12px"><div class="row between"><h2>Demo bereit</h2><button class="icon-btn" data-act="closeModal" aria-label="Schließen">${ic("x", 15)}</button></div><div class="list">${checks.map(c => `<div class="li" style="padding:6px 0">${pill(c[0] ? "p-good" : "p-warn", c[0] ? "ok" : "Hinweis")}<span class="grow small">${esc(c[1])}</span></div>`).join("")}</div><div class="row" style="gap:14px;align-items:center"><div id="qrPrep" style="width:120px;height:120px;background:#fff;border-radius:10px;flex:none"></div><p class="small muted">Handy für Freigaben oder als Fernbedienung: QR scannen, dort Rolle wählen (z. B. CFO) bzw. „Fernbedienung“ öffnen.</p></div><div class="row"><button class="btn pri" data-act="closeModal">Los geht's</button></div></div>`;
  renderLayer(); const el = document.getElementById("qrPrep"); if (el) drawQr(el, PHONE_URL(), 120); render();
}

/* ---------- Belege als PDF ---------- */
const LETTER = { elevon: ["Elevon Industries GmbH", "Werkstraße 12 · 70565 Stuttgart"], novamart: ["NovaMart Retail GmbH", "Handelsallee 5 · 40213 Düsseldorf"], aventra: ["Aventra Consulting GmbH", "Mainufer 30 · 60311 Frankfurt am Main"] };
function docList(t) {
  const L = [];
  for (const q of t.quotes || []) L.push({ kind: "Angebot", no: q.no, date: q.date, partner: E.customerName(t, q.customer), amount: q.net, ref: q });
  for (const so of t.salesOrders || []) { L.push({ kind: "Auftragsbestätigung", no: so.no, date: so.date, partner: E.customerName(t, so.customer), amount: so.net, ref: so }); if (so.giDoc) L.push({ kind: "Lieferschein", no: "LS-" + so.no.slice(3), date: so.date, partner: E.customerName(t, so.customer), amount: null, ref: so }); }
  for (const po of t.purchaseOrders || []) L.push({ kind: "Bestellung", no: po.no, date: po.date, partner: E.supplierName(t, po.supplier), amount: po.net, ref: po });
  for (const pa of t.prodOrders || []) L.push({ kind: "Fertigungsauftrag", no: pa.no, date: pa.date || t.date, partner: pa.kind === "Baugruppe" ? (t.master.products.find(p => p.id === pa.product) || {}).name : "Aufzug E5 zu " + pa.so, amount: null, ref: pa });
  for (const inv of (t.custInvoices || []).filter(i => i.date >= "2026-11-01")) L.push({ kind: "Rechnung", no: inv.no, date: inv.date, partner: E.customerName(t, inv.partnerId), amount: inv.gross, ref: inv });
  return L.reverse();
}
VIEWS.documents = () => {
  const t = T(); const L = docList(t); const kinds = ["Alle"].concat([...new Set(L.map(d => d.kind))]); const f = S.sel.docKind || "Alle";
  return head("Belege & Dokumente · " + esc(T_NAMES[t.id]), "Belege als PDF") + statusNote("live", "Angebote, Auftragsbestätigungen, Lieferscheine, Bestellungen, Rechnungen und Fertigungsaufträge werden aus den Daten der Engine als PDF erzeugt – mit Positionen, Steuern, Lieferterminen und beim Fertigungsauftrag mit Arbeitsanweisungen und QR-Code. Alle Firmendaten sind fiktiv.")
   + `<div class="seg">${kinds.map(k => `<button class="${k === f ? "on" : ""}" data-act="docKind" data-k="${esc(k)}">${esc(k)}</button>`).join("")}</div>`
   + `<section class="card tbl-wrap"><table><thead><tr><th>Beleg</th><th>Nummer</th><th>Partner / Gegenstand</th><th>Datum</th><th class="r">Betrag</th><th></th></tr></thead><tbody>${L.filter(d => f === "Alle" || d.kind === f).slice(0, 60).map(d => `<tr><td>${esc(d.kind)}</td><td class="mono small">${esc(d.no)}</td><td>${esc(d.partner || "")}</td><td class="num small">${dDe(d.date)}</td><td class="r num">${d.amount != null ? eur(d.amount, 2) : ""}</td><td class="r" style="white-space:nowrap"><button class="btn sm pri" data-act="pdf" data-k="${esc(d.kind)}" data-no="${esc(d.no)}">PDF</button>${BK.mcp ? ` <button class="btn sm" data-act="pdfDrive" data-k="${esc(d.kind)}" data-no="${esc(d.no)}">In Drive</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Noch keine Belege – führe eine Demo aus.</td></tr>`}</tbody></table></section>`
   + (S.gd && route() === "documents" ? (S.gd.busy ? `<p class="small muted">${esc(S.gd.busy)}</p>` : S.gd.ok ? `<div class="note good small">${esc(S.gd.ok)}${S.gd.link ? ` <a href="${esc(S.gd.link)}" target="_blank" rel="noopener">Öffnen</a>` : ""}</div>` : S.gd.err ? `<div class="note warn small">${esc(S.gd.err)}</div>` : "") : "");
};
function findDoc(kind, no) { return docList(T()).find(d => d.kind === kind && d.no === no); }
async function makePdf(d) {
  await loadLib(LIB_PDF); const t = T(); const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: "mm", format: "a4" }); const [firm, addr] = LETTER[t.id];
  const VIO = [106, 69, 240], NAV = [23, 21, 58], INK = [22, 20, 43], MUT = [110, 106, 140]; const num2 = v => Number(v || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); const euro = v => num2(v) + " EUR";
  const wr = (txt, x, y, o) => pdf.text(Array.isArray(txt) ? txt : String(txt), x, y, o || {});
  pdf.setFillColor(...NAV); pdf.rect(0, 0, 210, 26, "F"); pdf.setDrawColor(139, 108, 255); pdf.setLineWidth(1.6); pdf.setLineCap("round"); pdf.setLineJoin("round"); pdf.line(14, 19, 14, 8); pdf.line(14, 8, 21, 19); pdf.line(21, 19, 21, 8); pdf.setLineWidth(0.2); pdf.setLineCap("butt");
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); wr(firm, 28, 13); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); wr(addr + " · Demo-Unternehmen, alle Daten fiktiv", 28, 19);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); wr(d.kind.toUpperCase(), d.kind === "Fertigungsauftrag" ? 172 : 194, 15, { align: "right" });
  pdf.setTextColor(...MUT); pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal"); wr(firm + " · " + addr, 20, 40);
  const r = d.ref; let partnerName = d.partner || "", partnerCity = "";
  const cust = (t.master.customers || []).find(c => c.name === d.partner); const sup = (t.master.suppliers || []).find(s => s.name === d.partner); if (cust) partnerCity = cust.city || ""; if (sup) partnerCity = sup.city || "";
  pdf.setTextColor(...INK); pdf.setFontSize(10.5); if (d.kind === "Fertigungsauftrag") { wr("Werk Stuttgart · Fertigung", 20, 47); } else { pdf.setFont("helvetica", "bold"); wr(partnerName, 20, 47); pdf.setFont("helvetica", "normal"); wr(partnerCity ? partnerCity + ", Deutschland" : "Deutschland", 20, 52.5); }
  const info = [["Nummer", d.no], ["Datum", dDe(d.date)], ["Bearbeiter", U().name]]; if (r.so) info.push(["Kundenauftrag", r.so]); if (r.ref && r.ref.id) info.push(["Bezug", r.ref.id]); if (d.kind === "Angebot") info.push(["Gültig bis", dDe(addDaysIso(d.date, 30))]);
  pdf.setFontSize(8.5); info.forEach(([k, v], i) => { pdf.setTextColor(...MUT); wr(k, 132, 44 + i * 5.2); pdf.setTextColor(...INK); wr(String(v), 160, 44 + i * 5.2); });
  let y = 72; pdf.setFontSize(11); pdf.setFont("helvetica", "bold"); wr(docHeadline(d), 20, y); pdf.setFont("helvetica", "normal"); y += 8;
  const rows = docRows(t, d); const priced = rows.some(x => x.price != null) && d.kind !== "Lieferschein" && d.kind !== "Fertigungsauftrag";
  const cols = priced ? [[20, "Pos."], [32, "Bezeichnung"], [130, "Menge", "right"], [158, "Preis", "right"], [190, "Betrag", "right"]] : [[20, "Pos."], [32, "Bezeichnung"], [190, "Menge", "right"]];
  pdf.setFillColor(239, 234, 254); pdf.rect(18, y - 4.5, 174, 7, "F"); pdf.setFontSize(8.5); pdf.setTextColor(...VIO); pdf.setFont("helvetica", "bold"); cols.forEach(([x, h, a]) => wr(h, x, y, a ? { align: a } : {})); pdf.setFont("helvetica", "normal"); pdf.setTextColor(...INK); y += 7;
  let net = 0;
  rows.forEach((row, i) => { const lines = pdf.splitTextToSize(row.text, priced ? 90 : 140); if (y + lines.length * 4.4 > 262) { pdf.addPage(); y = 24; }
    wr(String(i + 1), 20, y); wr(lines, 32, y); wr(row.qty, priced ? 130 : 190, y, { align: "right" }); if (priced) { wr(row.price != null ? num2(row.price) : "", 158, y, { align: "right" }); const amt = row.amount != null ? row.amount : (row.price || 0) * (row.q || 0); net += amt; wr(num2(amt), 190, y, { align: "right" }); }
    if (row.sub) { pdf.setTextColor(...MUT); pdf.setFontSize(7.5); const sl = pdf.splitTextToSize(row.sub, priced ? 90 : 150); wr(sl, 32, y + lines.length * 4.2); pdf.setFontSize(8.5); pdf.setTextColor(...INK); y += sl.length * 3.6; }
    y += lines.length * 4.4 + 2; pdf.setDrawColor(231, 228, 242); pdf.line(18, y - 3, 192, y - 3); });
  if (priced) { if (r.net != null && Math.abs(r.net - net) > 0.05 && d.kind !== "Rechnung") net = r.net; const netv = d.kind === "Rechnung" ? r.net : net; const tax = d.kind === "Rechnung" ? r.tax : Math.round(netv * 19) / 100;
    y += 2; [["Summe netto", netv], ["Umsatzsteuer 19 %", tax], [d.kind === "Bestellung" ? "Bestellwert brutto" : "Gesamtbetrag", netv + tax]].forEach(([k, v], i) => { if (i === 2) { pdf.setFont("helvetica", "bold"); pdf.setDrawColor(...VIO); pdf.line(120, y - 3.8, 192, y - 3.8); } wr(k, 120, y); wr(euro(v), 190, y, { align: "right" }); y += 5.5; }); pdf.setFont("helvetica", "normal"); }
  y += 6; pdf.setFontSize(8.5); pdf.setTextColor(...INK); for (const line of docFooterText(t, d)) { const l = pdf.splitTextToSize(line, 172); if (y + l.length * 4 > 270) { pdf.addPage(); y = 24; } wr(l, 20, y); y += l.length * 4 + 1.5; }
  if (d.kind === "Fertigungsauftrag") { try { await loadLib(LIB_QR); const q = qrcode(0, "M"); q.addData("NEXORA-FA:" + d.no); q.make(); const n = q.getModuleCount(), s = 20 / n, x0 = 179, y0 = 3; pdf.setPage(1); pdf.setFillColor(255, 255, 255); pdf.rect(x0 - 1.5, y0 - 1.5, 23, 23, "F"); pdf.setFillColor(0, 0, 0); for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (q.isDark(rr, cc)) pdf.rect(x0 + cc * s, y0 + rr * s, s, s, "F"); } catch (e) {} }
  const pages = pdf.getNumberOfPages(); for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setDrawColor(231, 228, 242); pdf.line(20, 280, 190, 280); pdf.setFontSize(7); pdf.setTextColor(...MUT); wr(`${firm} · ${addr} · Demo-Bank, IBAN DE00 0000 0000 0000 0000 00 (fiktiv)`, 20, 285); wr(`Erzeugt mit NEXORA AI · Seite ${i} von ${pages}`, 190, 289, { align: "right" }); }
  return pdf;
}
const addDaysIso = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function docHeadline(d) { return { "Angebot": "Angebot über Aufzugsanlagen", "Auftragsbestätigung": "Wir bestätigen Ihren Auftrag", "Lieferschein": "Lieferschein", "Bestellung": "Bestellung", "Fertigungsauftrag": "Fertigungsauftrag " + d.no + " · " + (d.partner || ""), "Rechnung": "Rechnung " + d.no }[d.kind] || d.kind; }
function docRows(t, d) {
  const r = d.ref; const mat = id => (E.materialOf(t, id) || (t.catalog || []).find(c => c.id === id) || { name: id, unit: "Stk" });
  if (d.kind === "Angebot") return [{ text: `Aufzugsanlage ${E.E5.name}`, sub: `Listenpreis ${eur(E.E5.listPrice)} je Anlage, Rabatt ${r.discountPct} %. Inklusive Fertigung, Lieferung und Montage vor Ort, Abnahme nach DIN EN 81-20.`, qty: r.qty + " Stk", q: r.qty, price: r.unitPrice }];
  if (d.kind === "Auftragsbestätigung") return [{ text: `Aufzugsanlage ${E.E5.name}`, sub: `${r.quote ? "Gemäß Angebot " + r.quote + ". " : ""}Lieferung und Montage nach Fertigstellung; Rechnung nach Abnahme.`, qty: r.qty + " Stk", q: r.qty, price: r.unitPrice }];
  if (d.kind === "Lieferschein") return [{ text: `Aufzugsanlage ${E.E5.name}`, sub: "Komplettanlage, Montage durch Elevon-Montageteam", qty: r.qty + " Stk" }];
  if (d.kind === "Bestellung") return r.lines.map(l => { const m = mat(l.mat); return { text: l.text || m.name, sub: `${l.mat}${m.leadDays ? " · Liefertermin " + dDe(addDaysIso(r.date, m.leadDays)) : ""}${l.costCenter ? " · Kostenstelle " + l.costCenter : ""}${l.kind === "Lohnbearbeitung" ? " · Lohnbearbeitung zu " + l.prod : ""}`, qty: num(l.qty) + " " + (m.unit || "Stk"), q: l.qty, price: l.price }; });
  if (d.kind === "Fertigungsauftrag") { if (r.kind === "Baugruppe") return r.ops.map(o => ({ text: `${o.no} ${o.text} · ${o.wcName}`, sub: o.instr, qty: o.external ? num(o.extQty) + " " + (o.extUnit || "kg") : o.hours + " h" })).concat(r.components.map(c => ({ text: "Material: " + mat(c.mat).name, qty: num(c.qty) + " " + (mat(c.mat).unit || "Stk") })));
    return [{ text: `Montage ${r.qty} × Aufzug E5`, sub: `${E.E5.assemblyHours} h je Anlage`, qty: r.qty * E.E5.assemblyHours + " h" }].concat(r.components.map(c => ({ text: "Material: " + mat(c.mat).name, qty: num(c.qty) + " Stk" }))); }
  if (d.kind === "Rechnung") { const ref = r.ref || {}; if (ref.type === "salesOrder") { const so = t.salesOrders.find(s => s.no === ref.id); return [{ text: `Aufzugsanlage ${E.E5.name}`, sub: `Kundenauftrag ${so.no}, geliefert, montiert und abgenommen`, qty: so.qty + " Stk", q: so.qty, price: so.unitPrice }]; }
    if (ref.type === "serviceOrder") { const so = t.serviceOrders.find(s => s.no === ref.id); return [{ text: `Serviceeinsatz ${so.no}: ${so.text}`, sub: `Vertrag ${so.contract}${so.billing ? " · " + so.billing : ""}`, qty: "1", q: 1, price: r.net }]; }
    if (ref.type === "project") { const pr = t.projects.find(p => p.id === ref.id); return [{ text: `Beratungsleistungen ${pr.id} ${pr.name}`, sub: "Gemäß freigegebenem Leistungsnachweis", qty: "1", q: 1, price: r.net }]; }
    return [{ text: r.text || "Leistung", qty: "1", q: 1, price: r.net }]; }
  return [];
}
function docFooterText(t, d) {
  if (d.kind === "Angebot") return ["Lieferzeit: Fertigung und Montage nach Auftragseingang gemäß Terminplan. Zahlungsbedingungen: 30 Tage netto nach Abnahme.", "Dieses Angebot ist 30 Tage gültig. Es gelten unsere Allgemeinen Geschäftsbedingungen (Demo)."];
  if (d.kind === "Auftragsbestätigung") return ["Vielen Dank für Ihren Auftrag. Die Rechnungsstellung erfolgt nach Abnahme der Anlagen. Zahlungsziel 30 Tage netto."];
  if (d.kind === "Lieferschein") return ["Ware vollständig und unbeschädigt erhalten:", "", "______________________________     Datum, Unterschrift Empfänger"];
  if (d.kind === "Bestellung") return ["Bitte bestätigen Sie Liefertermin und Preis innerhalb von zwei Werktagen unter Angabe der Bestellnummer. Lieferanschrift: " + (t.id === "novamart" ? "NovaMart Zentrallager ZL1" : "Elevon Werk Stuttgart, Wareneingang Tor 3") + ".", "Rechnungen bitte mit Bestellnummer; Prüfung per Drei-Wege-Abgleich (Bestellung, Wareneingang, Rechnung)."];
  if (d.kind === "Fertigungsauftrag") return ["Rückmeldung je Vorgang mit Ist-Stunden. Abweichungen und Ausschuss sofort melden. Arbeitsschutz: Schweißen nur mit Absaugung und Schutzausrüstung."];
  if (d.kind === "Rechnung") return [`Zahlbar innerhalb von 30 Tagen ohne Abzug. Bitte bei Zahlung die Rechnungsnummer ${d.no} angeben.`, "Leistungsdatum entspricht dem Rechnungsdatum, sofern nicht anders angegeben."];
  return [];
}
async function pdfAction(kind, no, target) {
  const d = findDoc(kind, no); if (!d) return toast("Beleg nicht gefunden.", true); let pdf;
  try { pdf = await makePdf(d); } catch (e) { return toast("PDF konnte nicht erzeugt werden: " + e.message, true); }
  const name = `${kind}_${no}.pdf`.replace(/[^\w.\-äöüÄÖÜß]/g, "_"); const blob = pdf.output("blob");
  if (target === "drive") { if (!BK.mcp) return toast("Google Drive ist nicht verfügbar.", true); S.gd = { busy: "PDF wird in Google Drive abgelegt …" }; render();
    try { const b64 = pdf.output("datauristring").split(",")[1]; const r = await BK.mcp.callTool("Google Drive", "create_file", { title: name, base64Content: b64, contentMimeType: "application/pdf", disableConversionToGoogleType: true }); const f = r.payload || {}; S.gd = { ok: `${kind} ${no} als PDF in Google Drive abgelegt.`, link: f.alternateLink || f.webViewLink || null }; } catch (e) { S.gd = { err: gdErr(e) }; } render(); return; }
  if (window.claude && window.claude.use) { const dl = await claude.use("downloads").catch(() => null); if (dl) { try { await dl.save({ filename: name, data: blob }); } catch (e) { if (e && e.code !== "declined" && e.code !== "cancelled") toast("Download nicht möglich (" + (e.code || e.message) + ").", true); } return; } }
  const url = URL.createObjectURL(blob); const w = window.open(url, "_blank"); if (!w) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } setTimeout(() => URL.revokeObjectURL(url), 60000);
}
// PDF-Schaltflächen in Bestellungen und Fertigungsaufträgen
const _poTable = poTable; poTable = function (t) { return _poTable(t).replace(/<td class="mono small">(PO-\d+)<\/td>/g, (m, no) => `<td class="mono small">${no} <button class="btn sm" data-act="pdf" data-k="Bestellung" data-no="${no}" title="Bestellung als PDF">PDF</button></td>`); };
const _prodV7 = VIEWS.production; VIEWS.production = () => _prodV7().replace(/<h3>(PA-\d+) · /g, (m, no) => `<h3><button class="btn sm" data-act="pdf" data-k="Fertigungsauftrag" data-no="${no}" title="Fertigungspapiere als PDF" style="margin-right:6px">PDF</button>${no} · `);

/* ---------- Ereignisse und Tasten ---------- */
Object.assign(ACT, {
  togglePresent() { S.present = !S.present; if (S.present) emitStory(); render(); }, prepareDemo() { prepareDemo(); },
  pdf(d) { pdfAction(d.k, d.no); }, pdfDrive(d) { pdfAction(d.k, d.no, "drive"); }, docKind(d) { S.sel.docKind = d.k; render(); },
  remoteNext() { if (!BK.room) return; BK.room.emit("next", {}).then(() => toast("Weiter gesendet")).catch(e => toast(e.code === "not_permitted" ? "Weiterschalten ist für dieses Konto nicht erlaubt." : "Senden fehlgeschlagen.", true)); }
});
ON.jumpTo = v => jumpTo(+v);
document.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase(); if (["input", "textarea", "select"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey || S.modal) return;
  if (S.story && (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && S.present))) { e.preventDefault(); storyStep(); }
  else if (e.key === "n" || e.key === "N") { if (S.story) { S.notes = !S.notes; render(); } }
  else if (e.key === "p" || e.key === "P") ACT.togglePresent();
});
window.addEventListener("resize", () => { if (window.innerWidth < 700 && route() === "home" && !S.story) go("tasks"); });
// Demo Control Center: „Demo vorbereiten“ und Hinweise zum Präsentieren
const _adminV7 = VIEWS.admin;
VIEWS.admin = () => { const h = _adminV7(); if (!/Demo-Unternehmen und Reproduzierbarkeit/.test(h)) return h;
  return h.replace(/(<\/div>)(<section class="card"><div class="card-h"><h3>Demo-Unternehmen und Reproduzierbarkeit)/, `$1<section class="card card-pad row between" style="gap:14px"><div><h3>Live-Demo vorbereiten</h3><p class="small muted">Setzt alle Unternehmen zurück, prüft Bücher und Reproduzierbarkeit, schaltet Guided Demo und Präsentationsmodus ein und zeigt den QR-Code für das zweite Gerät. Ohne Netz: <a href="https://marcelwagner-afk.github.io/nexora-suite/" target="_blank" rel="noopener">Offline-Version auf GitHub</a>.</p></div><button class="btn pri" data-act="prepareDemo">Demo vorbereiten</button></section>$2`); };
