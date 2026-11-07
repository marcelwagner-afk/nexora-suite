import asyncio, json
from playwright.async_api import async_playwright
import os, pathlib, re
ROOT=pathlib.Path(__file__).resolve().parent.parent
SP=str(ROOT/"test-results")+"/"; os.makedirs(SP, exist_ok=True)
# Filmschalter aus build.py: an → Filme müssen erscheinen, aus → müssen ausgeblendet sein
FILMS = bool(re.search(r"^FILMS = True$", (ROOT/"build.py").read_text(encoding="utf-8"), re.M))

async def markt(p):
  """Marktposition auf der STEGARC-Produktseite: öffentliche und interne Fassung, Interaktion, Mobil, Hell/Dunkel."""
  import threading, http.server, functools, socketserver
  H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "dist"))
  class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
  srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT / "dist"))); port = srv.server_address[1]
  threading.Thread(target=srv.serve_forever, daemon=True).start(); base = f"http://127.0.0.1:{port}/stegarc.html"
  b = await p.chromium.launch(); errs = []
  try:
    pg = await b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(base + "#markt"); await pg.wait_for_timeout(400)
    pts = await pg.evaluate("document.querySelectorAll('#mkChart .pt').length"); rows = await pg.evaluate("document.querySelectorAll('#mkMatBody tr').length")
    txt = await pg.inner_text("#markt"); print("Markt öffentlich:", pts, "Punkte,", rows, "Zeilen")
    assert pts == 14 and rows == 9, (pts, rows); assert "STEGARC heute" not in txt; assert "Roadmap" in txt; assert "Prompt" not in txt and "Umbau" not in txt and "Phase" not in txt
    assert not await pg.evaluate("!!document.getElementById('mkArrow')")
    await pg.click("#mkChart .pt[aria-label='Gemini Enterprise']"); await pg.wait_for_timeout(200)
    assert await pg.evaluate("document.querySelector('#mkMatBody tr[data-id=google]').classList.contains('hl')"), "Google-Zeile markiert"
    await pg.focus("#mkChart .pt[aria-label='Glean']"); await pg.keyboard.press("Enter"); assert await pg.evaluate("document.querySelector('#mkMatBody tr[data-id=glean]').classList.contains('hl')"), "Tastatur"
    await pg.add_style_tag(content=".ts-top{position:static!important}"); el = await pg.query_selector("#markt"); await el.screenshot(path=SP + "ts_markt_hell.png")
    await pg.goto(base + "#markt-intern"); await pg.wait_for_timeout(400)
    pts = await pg.evaluate("document.querySelectorAll('#mkChart .pt').length"); rows = await pg.evaluate("document.querySelectorAll('#mkMatBody tr').length")
    print("Markt intern:", pts, "Punkte,", rows, "Zeilen"); assert pts == 15 and rows == 10, (pts, rows); assert await pg.evaluate("!!document.getElementById('mkArrow')"), "Umbau-Pfeil"
    d = await b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark"); d.on("pageerror", lambda e: errs.append(str(e)))
    await d.goto(base + "#markt"); await d.wait_for_timeout(400); await d.add_style_tag(content=".ts-top{position:static!important}"); el = await d.query_selector("#markt"); await el.screenshot(path=SP + "ts_markt_dunkel.png")
    m = await b.new_page(viewport={"width": 400, "height": 860}); m.on("pageerror", lambda e: errs.append(str(e)))
    await m.goto(base + "#markt"); await m.wait_for_timeout(400); sw = await m.evaluate("document.documentElement.scrollWidth"); print("Markt mobil scrollWidth", sw); assert sw == 400, sw
    st = await m.evaluate("document.querySelectorAll('#stories .story').length"); assert st > 0, "Storys auf der STEGARC-Produktseite"; assert await m.evaluate("document.querySelectorAll('video').length === 4 && !!document.getElementById('filme')" if FILMS else "document.querySelectorAll('video').length === 0 && !document.getElementById('filme')"), "Filme auf der Produktseite " + ("sichtbar" if FILMS else "ausgeblendet")
    su = await b.new_page(viewport={"width": 1440, "height": 900}); su.on("pageerror", lambda e: errs.append(str(e))); await su.goto(f"http://127.0.0.1:{port}/index.html"); await su.wait_for_timeout(400)
    href = await su.evaluate("[...document.querySelectorAll('nav.side a')].filter(a=>a.textContent.trim() === 'Marktposition').map(a=>a.getAttribute('href'))[0]"); print("Suite-Link Marktposition:", href); assert href and href.endswith("stegarc.html#markt"), href
  finally:
    await b.close(); srv.shutdown()
  assert not errs, errs


async def layer(p):
  """Experience Layer: Inbox in drei Rollen, Aufgaben aus mindestens vier Systemen, je System eine Freigabe."""
  b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1440, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
  html = "<!doctype html><html><head><meta charset='utf-8'></head><body>" + open(ROOT / "dist" / "stegarc-suite.html").read() + "</body></html>"
  await pg.set_content(html); await pg.wait_for_timeout(400)
  await pg.evaluate("ACT.resetAllBtn(); S.mode='free'; ACT.tenant({id:'elevon'}); S.users.elevon='u3'; act('createQuote',{customerId:'C-RHEIN',qty:4,discountPct:7}); ACT.setLayer({v:'layer'})"); await pg.wait_for_timeout(200)
  seen = set()
  for uid in ("u2", "u8", "u1"):
    await pg.evaluate(f"ACT.setUser({{id:'{uid}'}}); location.hash='tasks'"); await pg.wait_for_timeout(150)
    sy = await pg.evaluate("[...document.querySelectorAll('.ly-card')].map(c=>c.dataset.sys)"); seen |= set(sy); print("Inbox", uid, sorted(set(sy)), len(sy), "Karten")
  assert len(seen) >= 4, seen
  await pg.screenshot(path=SP + "layer_inbox.png")
  async def approve(uid, sys):
    await pg.evaluate(f"ACT.setUser({{id:'{uid}'}}); S.sel.sysF='{sys}'; location.hash='tasks'; render()"); await pg.wait_for_timeout(120)
    n0 = await pg.evaluate("document.querySelectorAll('.ly-card').length")
    await pg.click(f".ly-card[data-sys='{sys}'] button.btn.pri"); await pg.wait_for_timeout(120)
    if await pg.evaluate("!!document.querySelector('[data-act=confirmOk]')"): await pg.click("[data-act=confirmOk]"); await pg.wait_for_timeout(120)
    ok = await pg.evaluate("S.last && S.last.ok"); n1 = await pg.evaluate("document.querySelectorAll('.ly-card').length"); print("Freigabe", sys, "als", uid, ok, n0, "→", n1); assert ok, (sys, await pg.evaluate("S.last && S.last.text"))
  for uid, sys in (("u2", "sap"), ("u2", "servicenow"), ("u2", "m365"), ("u8", "workday"), ("u2", "stegarc")): await approve(uid, sys)
  led = await pg.evaluate("C.ledger(W,'elevon').map(x=>x.sys+':'+x.route)"); print("Protokoll:", led); assert len(led) >= 4
  await pg.evaluate("S.sel.sysF=null; ACT.setUser({id:'u2'}); openPalette(); S.pal='Monitor'; renderLayer()"); await pg.wait_for_timeout(100)
  assert await pg.evaluate("document.querySelectorAll('#layer .pal-item').length") > 0, "Suche"; await pg.screenshot(path=SP + "layer_search.png")
  await pg.click("#layer .pal-item"); await pg.wait_for_timeout(150); assert await pg.evaluate("location.hash") == "#obj"; await pg.screenshot(path=SP + "layer_obj.png")
  # Phase 3: Assistent liefert Aktionskarten – Regel-Rückfall und (simuliertes) Claude identisch, Ausführung nur nach Bestätigung
  await pg.evaluate("S.aiMode='rules'; S.chat.elevon=[]; ACT.setUser({id:'u2'}); location.hash='ai'"); await pg.wait_for_timeout(120)
  await pg.evaluate("ask('Was muss ich heute freigeben?')"); await pg.wait_for_timeout(150)
  nc = await pg.evaluate("document.querySelectorAll('#aiBody .ai-cards .ly-card').length"); print("Assistent (Regeln):", nc, "Karten"); assert nc >= 1
  l0 = await pg.evaluate("C.ledger(W,'elevon').length")
  await pg.click("#aiBody .ai-cards button.btn.pri"); await pg.wait_for_timeout(120)
  assert await pg.evaluate("!!document.querySelector('[data-act=confirmOk]')"), "Bestätigungsdialog fehlt"
  assert await pg.evaluate("C.ledger(W,'elevon').length") == l0, "vor Bestätigung ausgeführt"
  await pg.screenshot(path=SP + "layer_ai_confirm.png")
  await pg.click("[data-act=confirmOk]"); await pg.wait_for_timeout(150)
  l1 = await pg.evaluate("C.ledger(W,'elevon').length"); nexo = await pg.evaluate("S.last && S.last.ok"); print("Nach Bestätigung:", l0, "→", l1, nexo); assert l1 > l0 or nexo
  await pg.evaluate("ask('Was haben die Zugriffe diesen Monat gekostet?')"); await pg.wait_for_timeout(100)
  assert await pg.evaluate("document.querySelector('#aiBody').innerText.includes('Beispielwerte')"), "Kostenantwort"
  # Claude-Pfad mit Testdouble: Werkzeug aufgaben_alle wird aufgerufen, Karten erscheinen unter der Antwort
  nrules = await pg.evaluate("layerTasks().length")
  await pg.evaluate("""BK.sample = async (turns, o) => { const t = o.tools.find(x => x.name === 'aufgaben_alle'); const r = t.execute({}); const k = o.tools.find(x => x.name === 'kosten').execute(); return { text: 'Offen: ' + r.anzahl + ' Aufgaben.' }; }; S.aiMode='llm'; S.chat.elevon=[]""")
  await pg.evaluate("ask('Was muss ich heute freigeben?')"); await pg.wait_for_timeout(250)
  ncl = await pg.evaluate("document.querySelectorAll('#aiBody .ai-cards .ly-card').length"); print("Assistent (Claude-Double):", ncl, "Karten, Regeln:", min(nrules, 8)); assert ncl == min(nrules, 8)
  await pg.screenshot(path=SP + "layer_ai.png")
  await pg.evaluate("BK.sample = null; S.aiMode='rules'; S.chat.elevon=[]")
  # Phase 4: Router – SAP-Frage über Joule (A2A) mit Chip und Kosten, Ablehnung ohne zulässigen Weg ohne Kosten
  l0 = await pg.evaluate("C.ledger(W,'elevon').length")
  await pg.evaluate("ask('Welche Kreditorenrechnungen sind in SAP offen?')"); await pg.wait_for_timeout(120)
  chip = await pg.evaluate("[...document.querySelectorAll('#aiBody .ai-via')].pop().innerText"); last = await pg.evaluate("C.ledger(W,'elevon').slice(-1)[0]")
  print("Router SAP:", chip.replace("\n", " "), "|", last["agent"], last["route"], last["cost"], last["via"]); assert "Joule (A2A)" in chip and "0,04" in chip and last["agent"] == "joule" and last["via"] == "Assistent"
  l1 = await pg.evaluate("C.ledger(W,'elevon').length"); assert l1 == l0 + 1
  await pg.evaluate("ask('Lies die SAP-Tabelle ACDOCA direkt über die API')"); await pg.wait_for_timeout(120)
  txt = await pg.evaluate("document.querySelector('#aiBody').lastElementChild.innerText"); print("Router abgelehnt:", txt[:90].replace("\n", " "))
  assert "SAP API Policy" in txt and "Abgelehnt" in txt and await pg.evaluate("C.ledger(W,'elevon').length") == l1
  await pg.screenshot(path=SP + "layer_router.png")
  await pg.evaluate("location.hash='agents'"); await pg.wait_for_timeout(120)
  assert await pg.evaluate("document.querySelectorAll('.ag-card').length") == 5; await pg.screenshot(path=SP + "layer_agents.png", full_page=True)
  # Phase 5: Protokoll – Summe = Kostenzähler, CSV mit allen Spalten, Filter, Seite Mitbestimmung & Datenschutz
  await pg.evaluate("location.hash='audit'"); await pg.wait_for_timeout(150)
  au = await pg.evaluate("""(() => { const rows = auditRows(); const sum = Math.round(rows.reduce((a, r) => a + (r.cost || 0), 0) * 1000) / 1000; const c = document.querySelector('.cost-ctr'); return { n: rows.length, sum, month: +c.dataset.month, day: +c.dataset.day, ledger: C.ledger(W, 'elevon').length, eng: rows.filter(r => r.system === 'STEGARC-Engine').length, rej: rows.filter(r => !r.ok).length }; })()""")
  print("Protokoll:", au); assert au["n"] >= au["ledger"] and abs(au["sum"] - au["month"]) < 1e-9 and au["eng"] >= 1 and au["rej"] >= 1
  csv = await pg.evaluate("auditCsv(auditRows())"); head = csv.lstrip("\ufeff").split("\r\n")[0].split(";")
  print("CSV-Spalten:", head); assert len(head) == 13 and all(h in head for h in ["Datum", "Nutzer", "Rolle", "System", "Zugriffsweg", "Agent", "Kosten (EUR, Beispielwert)", "Ergebnis"]) and len(csv.strip().split("\r\n")) == au["n"] + 1
  await pg.select_option("[data-on=auSys]", "SAP S/4HANA (simuliert)"); await pg.wait_for_timeout(120)
  fs = await pg.evaluate("auditFiltered().every(r => r.system === 'SAP S/4HANA (simuliert)') && auditFiltered().length > 0"); assert fs, "Filter"
  await pg.screenshot(path=SP + "layer_audit.png"); await pg.evaluate("ACT.auditReset()")
  await pg.evaluate("location.hash='privacy'"); await pg.wait_for_timeout(120)
  assert await pg.evaluate("document.querySelectorAll('.priv-mx tbody tr').length") >= 5; await pg.screenshot(path=SP + "layer_privacy.png", full_page=True)
  # Phase 7: Ablöse-Cockpit – Bestellanforderung SAP → STEGARC über die Oberfläche, CFO-Inbox vorher = nachher
  shape = "JSON.stringify(layerTasks().filter(k => k.process === 'bestellanforderung').map(k => JSON.stringify([k.fields, k.status, k.actions.map(a => a.label)])).sort())"
  await pg.evaluate("ACT.setUser({id:'u2'}); location.hash='tasks'"); await pg.wait_for_timeout(100); before = await pg.evaluate(shape); srcb = await pg.evaluate("[...new Set(layerTasks().filter(k => k.process === 'bestellanforderung').map(k => k.sys))]")
  await pg.evaluate("location.hash='transition'"); await pg.wait_for_timeout(120); await pg.screenshot(path=SP + "layer_transition_0.png", full_page=True)
  async def click(actn, uid):
    await pg.evaluate(f"ACT.setUser({{id:'{uid}'}})"); await pg.wait_for_timeout(60); await pg.click(f"[data-act={actn}]"); await pg.wait_for_timeout(120)
    okk = await pg.evaluate("S.last && S.last.ok"); assert okk, (actn, await pg.evaluate("S.last && S.last.text"))
  await click("trTest", "u10"); e1 = await pg.evaluate("T().migProjects['sap-pr'].tests.requisitions.errors"); print("Testlauf Fehler:", e1, await pg.evaluate("T().migProjects['sap-pr'].tests.requisitions.issues"))
  if e1:
    await pg.screenshot(path=SP + "layer_transition_errors.png", full_page=True); await pg.check("[data-on=trRule][data-k=fillCostCenter]"); await pg.wait_for_timeout(80); await click("trTest", "u10")
    assert await pg.evaluate("T().migProjects['sap-pr'].tests.requisitions.errors") == 0
  for actn, uid in (("trReq", "u10"), ("trAppr", "u2"), ("trRun", "u10"), ("trParallel", "u2")): await click(actn, uid)
  await click("trSample", "u3"); rc = await pg.evaluate("C.reconcile(W,'elevon','bestellanforderung')"); print("Abstimmung:", rc["stegarc"], rc["legacy"], rc["diffCount"], rc["diffSum"]); assert rc["diffCount"] == 0 and rc["diffSum"] == 0 and rc["stegarc"]["count"] == 1
  await pg.evaluate("ACT.setUser({id:'u2'})"); await pg.wait_for_timeout(60); await pg.screenshot(path=SP + "layer_transition_parallel.png", full_page=True)
  await click("trCutover", "u2")
  await pg.evaluate("ACT.setUser({id:'u2'}); location.hash='tasks'"); await pg.wait_for_timeout(100); after = await pg.evaluate(shape + ".replace(/x/g,'x')")
  srca = await pg.evaluate("[...new Set(layerTasks().filter(k => k.process === 'bestellanforderung' && k.fields[0][1] !== T().catalog[0].name).map(k => k.sys))]")
  aft_nosample = await pg.evaluate("JSON.stringify(layerTasks().filter(k => k.process === 'bestellanforderung' && k.fields[0][1] !== T().catalog[0].name).map(k => JSON.stringify([k.fields, k.status, k.actions.map(a => a.label)])).sort())")
  import json as _j
  fixcc = lambda arr: sorted(x.replace('["Kostenstelle","–"]', '["Kostenstelle","KS4130"]') for x in _j.loads(arr))  # per Regel ergänzte Kostenstelle
  print("CFO-Inbox Bestellanforderungen:", srcb, "→", srca, "gleich:", fixcc(before) == fixcc(aft_nosample))
  if fixcc(before) != fixcc(aft_nosample): print(_j.loads(before), _j.loads(aft_nosample))
  assert srcb == ["sap"] and srca == ["stegarc"] and fixcc(before) == fixcc(aft_nosample)
  steps = await pg.evaluate("auditRows().filter(r => /migration|transition|markMigrated|mirrorPR/.test(r.cmd)).map(r => r.cmd)"); print("Protokoll der Ablösung:", steps); assert len(steps) >= 7
  await pg.evaluate("location.hash='transition'"); await pg.wait_for_timeout(120); await pg.screenshot(path=SP + "layer_transition_done.png", full_page=True)
  assert await pg.evaluate("document.querySelector('[data-proc=bestellanforderung]').innerText.includes('abgelöst')")
  # Dashboard: Vorlage je Rolle, Kachel hinzufügen (Ereignis), Reset stellt die Vorlage wieder her
  await pg.evaluate("location.hash='home'"); await pg.wait_for_timeout(120); t0 = await pg.evaluate("[...document.querySelectorAll('.dash-tile')].map(x=>x.dataset.tile)"); print("Dashboard CFO:", t0); assert t0 == await pg.evaluate("dashTemplate('cfo')")
  await pg.screenshot(path=SP + "layer_dashboard.png", full_page=True)
  await pg.evaluate("location.hash='home'"); await pg.wait_for_function("document.querySelector('h1') && document.querySelector('h1').innerText === 'Mein Dashboard'"); await pg.wait_for_timeout(150)
  await pg.evaluate("S.dashEdit = true; render()"); await pg.wait_for_selector("[data-on=dashAdd]", timeout=5000); await pg.select_option("[data-on=dashAdd]", "process"); await pg.wait_for_timeout(120); await pg.click(".dash-tile[data-tile=process] [data-dir='-1']"); await pg.wait_for_timeout(120)
  t1 = await pg.evaluate("[...document.querySelectorAll('.dash-tile')].map(x=>x.dataset.tile)"); print("nach Anpassung:", t1); assert t1[-2] == "process" and len(t1) == len(t0) + 1
  await pg.evaluate("S.dashEdit = false; render()")
  # Reload: Welt aus Seed und Protokoll neu aufbauen ergibt dasselbe Dashboard und dieselbe Ablösung
  rl = await pg.evaluate("(() => { const w = E.createWorld({ size: S.size }); for (const x of LOG) { try { if (x.reset) E.resetTenant(w, x.reset); else if (x.resetAll) E.resetAll(w); else if (x.cmd) E.dispatch(w, x.t, x.cmd, x.p, x.ctx); } catch (e) {} } return { dash: JSON.stringify(C.state(w,'elevon').dash) === JSON.stringify(C.state(W,'elevon').dash), conn: C.hash(w,'elevon') === C.hash(W,'elevon'), eng: E.tenantHash(w.tenants.elevon) === E.tenantHash(W.tenants.elevon) }; })()")
  print("Reload aus dem Protokoll:", rl); assert all(rl.values())
  await pg.evaluate("ACT.resetAllBtn(); S.mode='free'; ACT.tenant({id:'elevon'}); ACT.setUser({id:'u2'}); location.hash='home'"); await pg.wait_for_timeout(150)
  assert await pg.evaluate("[...document.querySelectorAll('.dash-tile')].map(x=>x.dataset.tile).join()") == ",".join(t0), "Reset → Vorlage"
  assert await pg.evaluate("C.owners(W,'elevon').bestellanforderung") == "sap", "Reset → SAP führt wieder"
  # Phase 6: Einbettungsmodus bei 400 px – nur Inbox und Assistent, ohne Seitennavigation
  await pg.set_viewport_size({"width": 400, "height": 820}); await pg.evaluate("enterEmbed()"); await pg.wait_for_timeout(150)
  emb = await pg.evaluate("""({ side: getComputedStyle(document.querySelector('.side')).display, bar: !!document.querySelector('.emb-bar'), note: document.querySelector('.emb-note').innerText, cards: document.querySelectorAll('.ly-card').length, sw: document.documentElement.scrollWidth })""")
  print("Einbettung:", emb); assert emb["side"] == "none" and emb["bar"] and "Vorschau einer Einbettung" in emb["note"] and emb["cards"] > 0 and emb["sw"] <= 400
  await pg.screenshot(path=SP + "layer_embed_inbox.png")
  await pg.evaluate("S.chat.elevon=[]; ask('Was muss ich heute freigeben?')"); await pg.wait_for_timeout(150)
  assert await pg.evaluate("S.embed && location.hash === '#ai' && !!document.querySelector('.emb-bar') && document.querySelectorAll('#aiBody .ly-card').length > 0"), "Assistent in der Einbettung"
  await pg.screenshot(path=SP + "layer_embed_ai.png"); await pg.evaluate("ACT.leaveEmbed()"); await pg.set_viewport_size({"width": 1440, "height": 900})
  await pg.evaluate("ACT.setLayer({v:'suite'})"); await pg.wait_for_timeout(100); assert await pg.evaluate("S.layer") == "suite"
  await b.close(); assert not errs, errs

async def pe(p):
  """PE Command Center: Kennzahlen, Filter, Drill-down, Mandantentrennung über die Oberfläche, Verwaltung, schmale Breite."""
  b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1440, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
  html = "<!doctype html><html><head><meta charset='utf-8'></head><body>" + open(ROOT / "dist" / "stegarc-suite.html").read() + "</body></html>"
  await pg.set_content(html); await pg.wait_for_timeout(400)
  await pg.evaluate("S.live=false; S.pe.principal='p1'; S.pe.log=[]; PEW=null; location.hash='pe'"); await pg.wait_for_timeout(300)
  st = await pg.evaluate("({ kpis: document.querySelectorAll('.pe-kpi').length, funds: document.querySelectorAll('.pe-tbl tbody tr').length, hm: document.querySelectorAll('.pe-hm tbody tr').length, ins: document.querySelectorAll('.pe-in').length, nav: document.querySelectorAll('.pe-nav a').length, demo: !!document.querySelector('.pe-demo'), rev: document.querySelector('[data-kpi=revenue] b').innerText })")
  print("PE Command Center:", st); assert st["kpis"] >= 20 and st["hm"] == 24 and st["ins"] >= 3 and st["nav"] == 14 and st["demo"] and "Mrd" in st["rev"]
  await pg.screenshot(path=SP + "pe_command_center.png", full_page=True)
  await pg.click(".pe-db >> nth=0"); await pg.wait_for_timeout(150); f = await pg.evaluate("({ c: S.pe.filter.country, n: document.querySelectorAll('.pe-hm tbody tr').length })"); print("Filter per Klick:", f); assert f["c"] and f["n"] < 24
  await pg.evaluate("ACT.peReset()"); await pg.select_option("[data-on=peF][data-k=fund]", "F2"); await pg.wait_for_timeout(150); assert await pg.evaluate("document.querySelectorAll('.pe-hm tbody tr').length") == 8
  await pg.evaluate("ACT.peReset(); location.hash='pecos'"); await pg.wait_for_timeout(150); assert await pg.evaluate("document.querySelectorAll('.pe-cos tbody tr').length") == 25; await pg.screenshot(path=SP + "pe_companies.png")
  await pg.click(".pe-cos tbody tr >> nth=8"); await pg.wait_for_timeout(150); assert await pg.evaluate("location.hash") == "#peco"
  await pg.evaluate("ACT.peOpen({id:'PC09', tab:'fin'})"); await pg.wait_for_timeout(120); await pg.evaluate("ACT.peDrill({})"); await pg.wait_for_timeout(100); await pg.click("tr.click[data-a] >> nth=0"); await pg.wait_for_timeout(150)
  ok = await pg.evaluate("(() => { const rows = [...document.querySelectorAll('.pe-tbl tbody tr')]; return rows.length > 3 && /Summe = Kontosaldo/.test(rows[rows.length - 1].innerText); })()"); assert ok, "Drill bis Buchung"; await pg.screenshot(path=SP + "pe_drilldown.png", full_page=True)
  # Mandantentrennung über die Oberfläche
  await pg.select_option("[data-on=pePrin]", "p6"); await pg.wait_for_timeout(150); await pg.evaluate("location.hash='pecos'"); await pg.wait_for_timeout(120); n6 = await pg.evaluate("document.querySelectorAll('.pe-cos tbody tr').length")
  await pg.evaluate("ACT.peOpen({id:'PC09'})"); await pg.wait_for_timeout(120); fb = await pg.evaluate("document.querySelector('#page').innerText.includes('FORBIDDEN')"); print("Portfolio-CFO:", n6, "Unternehmen, fremdes Detail gesperrt:", fb); assert n6 == 1 and fb
  await pg.evaluate("S.pe.principal='p10'; location.hash='pecos'; render()"); await pg.wait_for_timeout(150); n10 = await pg.evaluate("[...document.querySelectorAll('.pe-cos tbody tr')].map(r => r.innerText.split('\\n')[0])"); print("Zweiter Investor sieht:", n10); assert len(n10) == 2 and not any("Albris" in x for x in n10)
  # Verwaltung: Plattform legt Organisation an, Administrator legt Fonds und Unternehmen an
  await pg.evaluate("S.pe.principal='p0'; location.hash='peadmin'; render()"); await pg.wait_for_timeout(120); await pg.fill("#peOrgName", "Alpenblick Partners"); await pg.click("[data-act=peCreateOrg]"); await pg.wait_for_timeout(150)
  await pg.fill("#peFundName", "Alpenblick Fund I"); await pg.click("[data-act=peAddFund]"); await pg.wait_for_timeout(120); await pg.fill("#peCoName", "Gipfelwerk GmbH"); await pg.click("[data-act=peAddCo]"); await pg.wait_for_timeout(150)
  ad = await pg.evaluate("({ p: S.pe.principal, cos: StegarcPE.companies(peWorld(), peP(), {}).map(c => c.name + ':' + c.onboarding), log: S.pe.log.length })"); print("Verwaltung:", ad); assert ad["cos"] == ["Gipfelwerk GmbH:Nicht gestartet"] and ad["log"] == 3
  await pg.screenshot(path=SP + "pe_admin.png", full_page=True); await pg.evaluate("ACT.peResetAdmin(); S.pe.principal='p1'; peSave()")
  # PE-Phase 3: Financial Intelligence, Cash & Liquidity, AI Financial Advisor
  await pg.set_viewport_size({"width": 1440, "height": 900}); await pg.evaluate("S.pe.principal='p1'; S.pe.filter={period:'LTM'}; location.hash='pe-fin'; render()"); await pg.wait_for_timeout(200)
  e0 = await pg.evaluate("StegarcPE.portfolioKpis(peWorld(), peP(), {basis:'ifrs'}).ebitda")
  await pg.click("[data-act=peAdj][data-ok='1'] >> nth=0"); await pg.wait_for_timeout(150); e1 = await pg.evaluate("StegarcPE.portfolioKpis(peWorld(), peP(), {basis:'ifrs'}).ebitda"); print("IFRS-16-Freigabe: EBITDA Konzernsicht", round(e0/1e6,1), "→", round(e1/1e6,1)); assert e1 > e0
  for t in ("cmp", "ana", "fc"): await pg.evaluate(f"ACT.peFinTab({{t:'{t}'}})"); await pg.wait_for_timeout(120)
  assert await pg.evaluate("document.querySelectorAll('.pe-chart').length") == 2; await pg.screenshot(path=SP + "pe_forecast.png", full_page=True)
  await pg.evaluate("location.hash='pe-cash'"); await pg.wait_for_timeout(200); lq = await pg.evaluate("[...document.querySelectorAll('.pe-tbl tbody tr')][0].innerText"); print("Liquidität, erste Zeile:", lq.replace("\n", " ")[:90]); assert "Velatis" in lq; await pg.screenshot(path=SP + "pe_cash.png", full_page=True)
  await pg.evaluate("S.pe.chat=[]; S.pe.aiMode='rules'; location.hash='pe-ai'"); await pg.wait_for_timeout(120)
  for q in await pg.evaluate("StegarcPE.EXAMPLES"): await pg.evaluate(f"peAsk({repr(q)})"); await pg.wait_for_timeout(60)
  na = await pg.evaluate("({ n: document.querySelectorAll('.pe-ans').length, ev: document.querySelectorAll('.pe-ans .pe-ev').length, unmatched: [...document.querySelectorAll('.pe-ans b')].filter(b => b.innerText === 'Frage nicht zugeordnet').length })"); print("Advisor (Regeln):", na); assert na["n"] == 8 and na["ev"] == 8 and na["unmatched"] == 0
  await pg.screenshot(path=SP + "pe_advisor.png", full_page=True)
  await pg.evaluate("""BK.sample = async (turns, o) => { const t = o.tools.find(x => x.name === 'pe_analyse'); const r = t.execute({ frage: 'Welche Unternehmen bekommen in den nächsten sechs Monaten Liquiditätsprobleme?' }); const d = o.tools.find(x => x.name === 'pe_fonds').execute({ fund: 'F1' }); return { text: r.title + ': ' + r.rows.map(x => x.Unternehmen).join(', ') + ' · Belege: Kasse ' + r.rows[0]['Kasse heute'] + ' · Zeitraum: ' + r.period }; }; S.pe.aiMode='llm'; S.pe.chat=[]""")
  await pg.evaluate("peAsk('Wer bekommt Liquiditätsprobleme?')"); await pg.wait_for_timeout(250)
  cl = await pg.evaluate("document.querySelector('#peAiBody .ai-via') && document.querySelector('#peAiBody .ai-via').innerText"); print("Advisor (Claude-Double):", cl); assert cl and "pe_analyse" in cl and "pe_fonds" in cl
  await pg.evaluate("S.pe.principal='p6'; S.pe.chat=[]"); fx = await pg.evaluate("peAiTools(peP()).find(t => t.name === 'pe_fonds').execute({ fund: 'F1' })"); print("Werkzeug mit CFO-Rechten:", fx); assert fx.get("fehler") == "FORBIDDEN"
  await pg.evaluate("BK.sample = null; S.pe.aiMode=null; S.pe.principal='p1'; S.pe.log=[]; PEW=null; peSave()")
  # PE-Phase 4: ERP Integration Hub – Mapping-Fehler beheben und neu synchronisieren
  await pg.evaluate("S.pe.principal='p1'; S.pe.log=[]; PEW=null; location.hash='pe-hub'; render()"); await pg.wait_for_timeout(200)
  h0 = await pg.evaluate("StegarcPE.hubMonitor(peWorld(), peP(), {}).error"); await pg.click("tr[data-id=PC25]"); await pg.wait_for_timeout(150)
  for acc, cat in (("4730", "REV"), ("6640", "OPEX_OTHER"), ("6805", "OPEX_OTHER")):
    await pg.select_option(f"#map-{acc}", cat); await pg.click(f"[data-act=peMap][data-acc='{acc}']"); await pg.wait_for_timeout(120)
  await pg.click("[data-act=peSync][data-mode=voll]"); await pg.wait_for_timeout(200)
  hs = await pg.evaluate("(() => { const d = StegarcPE.hubDetail(peWorld(), peP(), 'PC25'); return { health: d.health, diff: d.reconDiff, last: d.runs[0].status, by: d.runs[0].by, err: StegarcPE.hubMonitor(peWorld(), peP(), {}).error }; })()"); print("Integration Hub:", h0, "Fehler →", hs); assert hs["health"] == "ok" and hs["diff"] == 0 and hs["err"] == h0 - 1 and hs["by"] == "Dr. Katharina Brandt"
  await pg.screenshot(path=SP + "pe_hub.png", full_page=True)
  await pg.evaluate("S.pe.principal='p2'; render()"); await pg.click("tr[data-id=PC01]"); await pg.wait_for_timeout(120); assert await pg.evaluate("document.querySelectorAll('[data-act=peSync]').length") == 0, "Fund Manager ohne Lauf-Schaltflächen"
  await pg.evaluate("S.pe.principal='p1'; S.pe.log=[]; PEW=null; S.pe.hub=null; peSave()")
  # PE-Phase 5: Konsolidierung (IC-Klärung), Exit-Simulation, Value Creation, Risiko, Onboarding bis zur Aktivierung
  await pg.evaluate("S.pe.principal='p1'; S.pe.log=[]; PEW=null; location.hash='pe-cons'; render()"); await pg.wait_for_timeout(200)
  await pg.click("[data-act=peIcResolve]"); await pg.wait_for_timeout(150); ic = await pg.evaluate("StegarcPE.consolidate(peWorld(), peP(), 'HOLD-1').ic.diffPL"); print("Konsolidierung IC-Differenz nach Klärung:", ic); assert ic == 0
  await pg.screenshot(path=SP + "pe_consolidation.png", full_page=True)
  await pg.evaluate("location.hash='pe-inv'"); await pg.wait_for_timeout(200); await pg.click("[data-act=peExitPreset][data-k=up]"); await pg.wait_for_timeout(150)
  ex = await pg.evaluate("[...document.querySelectorAll('.pe-exit .pe-kpi b')].map(b => b.innerText)"); print("Exit-Simulation (Aufwärts):", ex); assert len(ex) == 6; await pg.screenshot(path=SP + "pe_investment.png", full_page=True)
  await pg.evaluate("location.hash='pe-vc'"); await pg.wait_for_timeout(200); assert await pg.evaluate("document.querySelectorAll('tr.dup').length") == 1, "Überschneidung markiert"; await pg.screenshot(path=SP + "pe_value_creation.png", full_page=True)
  await pg.evaluate("location.hash='pe-risk'"); await pg.wait_for_timeout(200); assert "Bruch erwartet" in await pg.evaluate("document.querySelector('.pe-tbl tbody tr').innerText")
  # Onboarding Clearpath: Mapping im Hub, Vollabzug, Datenfreigabe, Vorlage, Aktivierung durch zweiten Administrator
  await pg.evaluate("""(() => { const A = peP(); for (const [a, c] of [["4730","REV"],["6640","OPEX_OTHER"],["6805","OPEX_OTHER"]]) peCmd("mapAccount", { companyId: "PC25", account: a, category: c }); peCmd("syncRun", { companyId: "PC25", mode: "voll" }); })()""")
  await pg.evaluate("location.hash='pe-onb'"); await pg.wait_for_timeout(200); await pg.click("[data-act=peOnbDsa]"); await pg.wait_for_timeout(120); await pg.click("[data-act=peOnbReq]"); await pg.wait_for_timeout(120)
  await pg.select_option("[data-on=pePrin]", "p11"); await pg.wait_for_timeout(100)
  n0 = await pg.evaluate("StegarcPE.portfolioKpis(peWorld(), peP(), {}).companies"); await pg.click("[data-act=peOnbAct]"); await pg.wait_for_timeout(150); n1 = await pg.evaluate("StegarcPE.portfolioKpis(peWorld(), peP(), {}).companies"); print("Onboarding aktiviert: Unternehmen im Reporting", n0, "→", n1); assert n1 == n0 + 1
  await pg.screenshot(path=SP + "pe_onboarding.png", full_page=True)
  await pg.evaluate("S.pe.principal='p1'; S.pe.log=[]; PEW=null; peSave()")
  # Modell B: Engine-Mandanten im PE-Portfolio, offene Periode live aus der Engine
  await pg.evaluate("S.pe.principal='p12'; location.hash='pecos'; render()"); await pg.wait_for_timeout(200)
  nx = await pg.evaluate("[...document.querySelectorAll('.pe-cos tbody tr')].map(r => r.innerText.split('\\t')[0])"); print("Nordlicht-Portfolio:", nx); assert len(nx) == 3 and any("Elevon" in x for x in nx), nx
  await pg.evaluate("ACT.peOpen({id:'NX1'})"); await pg.wait_for_selector("[data-engine=elevon]", timeout=3000)
  b0 = await pg.evaluate("W.tenants.elevon.docs.filter(d => d.period === '2026-11').length"); rev0 = await pg.evaluate("PE.company(peWorld(), peP(), 'NX1').kpis.revenue")
  await pg.evaluate("""(() => { const go = (c, x) => { const r = E.dispatch(W, 'elevon', c, x, { auto: true }); if (!r.ok) throw new Error(c + ': ' + r.text); return r; }; const sv = go('createServiceTicket', { assetId: 'A-5000', text: 'E2E' }).objects[0]; go('scheduleTechnician', { svNo: sv }); go('reserveParts', { svNo: sv, mat: 'M-1008', qty: 1 }); go('executeService', { svNo: sv, hours: 3 }); go('invoiceService', { svNo: sv }); render(); })()""")
  await pg.wait_for_timeout(150); card = await pg.evaluate("document.querySelector('[data-engine=elevon]').innerText"); b1 = await pg.evaluate("W.tenants.elevon.docs.filter(d => d.period === '2026-11').length"); rev1 = await pg.evaluate("PE.company(peWorld(), peP(), 'NX1').kpis.revenue")
  print("Engine live: Belege offene Periode", b0, "→", b1, "· LTM-Umsatz unverändert", round(rev0) == round(rev1)); assert b1 > b0 and str(b1) in card and round(rev0) == round(rev1)
  await pg.screenshot(path=SP + "pe_engine.png", full_page=True)
  await pg.evaluate("S.pe.principal='p1'; S.pe.log=[]; PEW=null; peSave(); location.hash='pe'; render()")
  # PE-Phase 6: ERP-Transformation – Kandidat öffnen, Annahme ändern, Rechnung folgt
  await pg.evaluate("location.hash='pe-trans'; render()"); await pg.wait_for_timeout(200)
  tt = await pg.evaluate("document.querySelector('#page').innerText"); assert "Beispielwerte, keine Herstellerpreise" in tt and "Roadmap" in tt and "Castell" in tt, tt[:300]
  top = await pg.evaluate("StegarcPE.transformation(peWorld(), peP(), S.pe.filter, S.pe.ta).candidates[0].id"); await pg.click(f"tr[data-act=peTaOpen][data-id={top}]"); await pg.wait_for_selector(f"[data-ta={top}]", timeout=3000)
  d0 = await pg.evaluate(f"StegarcPE.transformation(peWorld(), peP(), S.pe.filter, S.pe.ta).rows.find(r => r.id === '{top}').scenarios.D.oneTime")
  await pg.evaluate("const el=document.querySelector('[data-on=peTaIn][data-k=parallelMonths]'); el.value='12'; el.dispatchEvent(new Event('change', {bubbles:true}))"); await pg.wait_for_timeout(150)
  d1 = await pg.evaluate(f"StegarcPE.transformation(peWorld(), peP(), S.pe.filter, S.pe.ta).rows.find(r => r.id === '{top}').scenarios.D.oneTime"); print("ERP-Transformation", top, "Einmalkosten D", round(d0), "→", round(d1), "bei 12 Monaten Parallelbetrieb"); assert d1 > d0
  await pg.screenshot(path=SP + "pe_transformation.png", full_page=True); await pg.click("[data-act=peTaReset]"); await pg.wait_for_timeout(100)
  await pg.set_viewport_size({"width": 400, "height": 820}); await pg.evaluate("location.hash='pe'; render()"); await pg.wait_for_timeout(200); sw = await pg.evaluate("document.documentElement.scrollWidth"); print("PE bei 400 px, Seitenbreite:", sw); assert sw <= 400
  await pg.evaluate("location.hash='pe-trans'; render()"); await pg.wait_for_timeout(200); sw = await pg.evaluate("document.documentElement.scrollWidth"); print("ERP-Transformation bei 400 px:", sw); assert sw <= 400
  # IT-Infrastruktur: Suite live (Lastspitze, echte Buchung, Ablösung), PE-Portfolio und Integrationsfehler aus dem Hub
  for r in ["infra", "pe-infra"]:
    await pg.evaluate(f"location.hash='{r}'; render()"); await pg.wait_for_timeout(150); sw = await pg.evaluate("document.documentElement.scrollWidth"); print(r, "bei 400 px:", sw); assert sw <= 400
  await pg.set_viewport_size({"width": 1440, "height": 900}); await pg.evaluate("S.tenant='elevon'; location.hash='infra'; render()"); await pg.wait_for_selector(".ix-node[data-ix=app]", timeout=3000)
  u = lambda: pg.evaluate("parseInt((document.querySelector('.ix-node[data-ix=app]').innerText.match(/Auslastung (\\d+)/) || [0, -1])[1])")
  u0 = await u(); await pg.click("[data-act=ixBurst]"); await pg.wait_for_timeout(200); u1 = await u(); cls = await pg.evaluate("document.querySelector('.ix-node[data-ix=app]').className"); print("Infrastruktur Auslastung Anwendung", u0, "→", u1, "% nach simulierter Lastspitze,", cls); assert u1 > u0 and ("ix-warn" in cls or "ix-crit" in cls)
  e0 = await pg.evaluate("IX_EV.elevon.engine.length"); await pg.evaluate("(() => { for (const a of W.tenants.elevon.master.assets) { if (E.dispatch(W, 'elevon', 'createServiceTicket', { assetId: a.id, text: 'Infra' }, { auto: true }).ok) break; } render(); })()"); await pg.wait_for_timeout(150); e1 = await pg.evaluate("IX_EV.elevon.engine.length"); assert e1 == e0 + 1, (e0, e1)
  for pr in ["abwesenheit", "onboarding"]: await pg.evaluate(f"(() => {{ const r = C.dispatch(W, 'elevon', 'layer', 'setOwner', {{ process: '{pr}', owner: 'stegarc' }}); if (!r.ok) throw new Error(r.text); render(); }})()")
  await pg.wait_for_timeout(150); wd = await pg.evaluate("(() => { const n = document.querySelector('.ix-node[data-ix=ext-workday]'); return [n.className, n.innerText]; })()"); print("Workday nach Ablösung:", wd[0], "|", wd[1].replace("\n", " ")[:80]); assert "ix-na" in wd[0] and "nur lesend" in wd[1]
  await pg.screenshot(path=SP + "infra_suite.png", full_page=True); await pg.evaluate("E.resetTenant(W, 'elevon'); render()")
  await pg.evaluate("S.pe.principal='p1'; location.hash='pe-infra'; render()"); await pg.wait_for_timeout(200); n = await pg.evaluate("document.querySelectorAll('tr[data-act=peOpenInfra]').length"); assert n == 25, n
  await pg.click("tr[data-act=peOpenInfra][data-id=PC20]"); await pg.wait_for_selector("[data-ix-co=PC20]", timeout=3000); sf = await pg.evaluate("(() => { const n = document.querySelector('.ix-node[data-ix=sftp]'); return [n.className, n.innerText]; })()"); print("PE Aurelis SFTP:", sf[0], "|", sf[1].replace("\n", " ")[:90]); assert "ix-crit" in sf[0] and "Zugang abgelaufen" in sf[1]
  await pg.screenshot(path=SP + "infra_pe.png", full_page=True)
  # Filme: Knopf unter der Überschrift, Spieler als eigene Ebene – übersteht Neuzeichnen, Esc schließt
  # Filmschalter: aus → kein Knopf, kein Spieler; an → Schalter in der Suite gesetzt (Knöpfe prüft der Block darunter)
  assert await pg.evaluate("FILMS_ON") == FILMS, "Filmschalter der Suite passt nicht zu build.py"
  if not FILMS:
    for r in ["home", "pe", "infra", "pe-infra", "systems"]:
      await pg.evaluate(f"location.hash='{r}'; render()"); await pg.wait_for_timeout(80); assert await pg.evaluate("!document.querySelector('.vid-chip')"), "Film sichtbar auf " + r
  # Mechanik bleibt geprüft: Schalter an
  await pg.evaluate("FILMS_ON = true")
  vids = {}
  for r in ["pe", "infra", "pe-infra", "systems"]:
    await pg.evaluate(f"location.hash='{r}'; render()"); await pg.wait_for_timeout(120); vids[r] = await pg.evaluate("(document.querySelector('.page-head .vid-chip') || {dataset: {}}).dataset.v")
  print("Filme je Seite:", vids); assert vids == {"pe": "pe-command-center", "infra": "it-infrastruktur", "pe-infra": "it-infrastruktur", "systems": "experience-layer"}
  await pg.evaluate("location.hash='pe'; render()"); await pg.wait_for_timeout(100); await pg.click(".vid-chip"); await pg.wait_for_selector("#vidOverlay video", timeout=3000)
  await pg.evaluate("render()"); await pg.wait_for_timeout(100); assert await pg.evaluate("!!document.querySelector('#vidOverlay video') && document.querySelector('#vidOverlay source').getAttribute('src').endsWith('stegarc-pe-command-center.mp4')")
  await pg.keyboard.press("Escape"); assert await pg.evaluate("!document.querySelector('#vidOverlay')")
  await pg.set_viewport_size({"width": 400, "height": 820})
  await pg.screenshot(path=SP + "pe_mobile.png"); await b.close(); assert not errs, errs; print("PE Command Center ok")

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={"width":1600,"height":950})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    html="<!doctype html><html><head><meta charset='utf-8'></head><body>"+open(ROOT/"dist"/"stegarc-suite.html").read()+"</body></html>"
    await pg.set_content(html); await pg.wait_for_timeout(400)
    assert await pg.evaluate("S.layer") == "layer", "Standard ab v0.8: Experience Layer"; await pg.screenshot(path=SP+"layer_start.png")
    await pg.evaluate("ACT.setLayer({v:'suite'})"); await pg.wait_for_timeout(150)  # bisherige Prüfungen in der Suite-Ansicht wie v0.7
    await pg.screenshot(path=SP+"s_home.png")
    report=[]
    for sid in ["industrial","retail","services","crosslift","service","omni","migration","design","p2p","hire","crosssys","oneday","replace"]:
      await pg.evaluate(f"ACT.startStory({{id:'{sid}',reset:1}})"); await pg.wait_for_timeout(100)
      n=await pg.evaluate(f"STORIES.find(s=>s.id==='{sid}').steps.length")
      for i in range(n):
        await pg.click("[data-act=storyStep]"); await pg.wait_for_timeout(60)
      st=await pg.evaluate("S.story && S.story.i"); last=await pg.evaluate("S.last && S.last.ok")
      report.append((sid,n,st,last))
      if sid == "crosssys":
        cs = await pg.evaluate("({ led: C.ledger(W,'elevon').map(x => x.sys + '.' + x.cmd), gr: W.tenants.elevon.purchaseOrders.filter(p => p.kind === 'indirekt' && p.grDoc).length, route: location.hash })"); print("crosssys:", cs); assert all(x in cs["led"] for x in ["workday.completeOnboardingTask", "servicenow.createRITM", "servicenow.approveRITM", "sap.createPR", "sap.approvePR"]) and cs["gr"] >= 1
      if sid == "oneday":
        od = await pg.evaluate("({ led: C.ledger(W,'elevon').map(x => x.sys).filter(x => x !== 'layer'), dash: C.state(W,'elevon').dash['user:u2'], cards: document.querySelectorAll('#aiBody .ly-card').length })"); print("oneday:", od); assert {"sap", "m365", "servicenow", "workday"} <= set(od["led"]) and od["dash"] and od["cards"] > 0
      if sid == "replace":
        rp = await pg.evaluate("({ own: C.owners(W,'elevon').bestellanforderung, phase: C.state(W,'elevon').transition.bestellanforderung.phase, recon: C.state(W,'elevon').transition.bestellanforderung.recon })"); print("replace:", rp); assert rp["own"] == "stegarc" and rp["phase"] == "abgelöst" and rp["recon"]["diffCount"] == 0 and rp["recon"]["stegarc"]["count"] == 1
      if sid in ("crosssys", "oneday", "replace"): await pg.evaluate("S.layer = 'suite'; render()")
      if sid in ("service","omni","migration","design","p2p","hire","crosssys","oneday","replace"): await pg.screenshot(path=SP+"s_"+sid+".png")
      if sid=="industrial": await pg.screenshot(path=SP+"s_ind.png")
    print(report)
    # Konsistenzprüfung nach allen Storys
    chk=await pg.evaluate("""(()=>{const out={};for(const id of E.TENANT_IDS){const t=W.tenants[id];const tb=E.trialBalance(t);out[id]={tb:Object.values(tb).reduce((a,b)=>a+b,0).toFixed(2),ar:(E.balance(t,'1200')-t.custInvoices.reduce((a,i)=>a+i.open,0)).toFixed(2),ap:(-E.balance(t,'1600')-t.supInvoices.reduce((a,i)=>a+i.open,0)).toFixed(2),inbox:t.inbox.filter(m=>m.status==='offen').length,inst:E.processInstances(t).map(i=>i.steps.filter(s=>s.state==='active'||s.state==='error').map(s=>s.name).join('|')).join(';')}};return out})()""")
    print(json.dumps(chk,ensure_ascii=False))
    for r in ["processes","finance","analytics","sales","supply","production","inbox","admin","ai","hr","service","assets","migrations","cutover"]:
      await pg.evaluate(f"location.hash='{r}'"); await pg.wait_for_timeout(80)
    for tn,rs in [("elevon",["service","assets","migrations","cutover","hr","engineering","production","supply"]),("novamart",["sales","hr","assets","migrations"]),("aventra",["hr","migrations","supply"])]:
      await pg.evaluate(f"ACT.tenant({{id:'{tn}'}})")
      for r in rs:
        await pg.evaluate(f"location.hash='{r}'"); await pg.wait_for_timeout(80); await pg.screenshot(path=SP+f"v_{tn}_{r}.png")
    await pg.evaluate("ACT.tenant({id:'novamart'})"); await pg.evaluate("location.hash='sales'"); await pg.click("[data-t=cc]"); await pg.wait_for_timeout(80); await pg.screenshot(path=SP+"v_nm_cc.png"); await pg.click("[data-t=ret]"); await pg.wait_for_timeout(80); await pg.screenshot(path=SP+"v_nm_ret.png")
    # Accounts und Rollen
    await pg.evaluate("ACT.tenant({id:'novamart'})"); await pg.evaluate("location.hash='users'"); await pg.wait_for_timeout(150)
    await pg.fill("#regName","Test Person"); await pg.select_option("#regRole","sales"); await pg.click("text=Account anlegen"); await pg.wait_for_timeout(150)
    print("last:", await pg.evaluate("JSON.stringify(S.last && {ok:S.last.ok,text:S.last.text,cmd:S.last.cmd})"), await pg.evaluate("BK.owner"))
    acc=await pg.evaluate("U().id+'|'+U().name+'|'+U().role"); print("Account aktiv:",acc); assert acc.startswith("acc1|Test Person|sales"), acc
    await pg.screenshot(path=SP+"v_users.png", full_page=True)
    await pg.evaluate("act('placeWebOrder',{articleId:'A-10001',qty:1})"); r=await pg.evaluate("S.last.ok && S.last.user"); assert r=="Test Person", r
    await pg.evaluate("act('closePeriod',{})"); r=await pg.evaluate("S.last.code"); assert r=="FORBIDDEN", r
    await pg.select_option("#accRole","cfo"); await pg.click("text=Übernehmen"); await pg.wait_for_timeout(100)
    r=await pg.evaluate("U().role"); assert r=="cfo", r
    await pg.evaluate("ACT.tenant({id:'elevon'})"); await pg.evaluate("ACT.setUser({id:'u11'})"); await pg.evaluate("location.hash='home'"); await pg.wait_for_timeout(100)
    nav=await pg.evaluate("[...document.querySelectorAll('nav.side a')].map(a=>a.textContent.trim()).join('|')"); print("Prüfer sieht:",nav)
    await pg.evaluate("ACT.tenant({id:'elevon'})"); await pg.evaluate("location.hash='processes'"); await pg.wait_for_timeout(120)
    await pg.screenshot(path=SP+"s_proc.png")
    await pg.evaluate("location.hash='analytics'"); await pg.wait_for_timeout(120); await pg.screenshot(path=SP+"s_an.png")
    await pg.evaluate("location.hash='admin'"); await pg.fill("#pinIn","2026"); await pg.click("text=Entsperren"); await pg.click("text=Jetzt prüfen"); await pg.wait_for_timeout(300)
    await pg.click("text=Alle zurücksetzen"); await pg.wait_for_timeout(200)
    st=await pg.evaluate("E.TENANT_IDS.map(id=>E.tenantHash(W.tenants[id])===BASE[id])"); print("nach Reset = Ausgangszustand:",st)
    await pg.screenshot(path=SP+"s_admin.png",full_page=False)
    await pg.evaluate("location.hash='home'"); await pg.evaluate("ACT.tenant({id:'aventra'})"); await pg.wait_for_timeout(100)
    await pg.fill("#askIn","Warum ist unsere operative Marge im letzten Monat gesunken?"); await pg.press("#askIn","Enter"); await pg.wait_for_timeout(150); await pg.screenshot(path=SP+"s_ai.png")
    await pg.set_viewport_size({"width":400,"height":860}); await pg.evaluate("location.hash='home'"); await pg.wait_for_timeout(150)
    print("mobile scrollWidth", await pg.evaluate("document.documentElement.scrollWidth"))
    await pg.screenshot(path=SP+"s_mobile.png")
    print("errors",errs)
    assert not errs, errs
    assert all(r[1]==r[2] and r[3] for r in report), report
    assert all(st), "Reset nicht reproduzierbar"
    await b.close()
asyncio.run(main())
async def _markt():
  async with async_playwright() as p:
    await markt(p)
asyncio.run(_markt())
async def _layer():
  async with async_playwright() as p:
    await layer(p)
asyncio.run(_layer())
print('Experience Layer ok')
print('Marktposition ok')
async def _pe():
  async with async_playwright() as p:
    await pe(p)
asyncio.run(_pe())
