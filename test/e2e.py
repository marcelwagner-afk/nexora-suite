import asyncio, json
from playwright.async_api import async_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
SP=str(ROOT/"test-results")+"/"; os.makedirs(SP, exist_ok=True)

async def markt(p):
  """Marktposition auf der truescale-Seite: öffentliche und interne Fassung, Interaktion, Mobil, Hell/Dunkel."""
  import threading, http.server, functools, socketserver
  H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "dist"))
  class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
  srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT / "dist"))); port = srv.server_address[1]
  threading.Thread(target=srv.serve_forever, daemon=True).start(); base = f"http://127.0.0.1:{port}/truescale.html"
  b = await p.chromium.launch(); errs = []
  try:
    pg = await b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(base + "#markt"); await pg.wait_for_timeout(400)
    pts = await pg.evaluate("document.querySelectorAll('#mkChart .pt').length"); rows = await pg.evaluate("document.querySelectorAll('#mkMatBody tr').length")
    txt = await pg.inner_text("#markt"); print("Markt öffentlich:", pts, "Punkte,", rows, "Zeilen")
    assert pts == 14 and rows == 9, (pts, rows); assert "NEXORA heute" not in txt; assert "Roadmap" in txt; assert "Prompt" not in txt and "Umbau" not in txt and "Phase" not in txt
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
    st = await m.evaluate("document.querySelectorAll('#stories .story').length"); assert st > 0, "Storys auf der truescale-Seite"
    su = await b.new_page(viewport={"width": 1440, "height": 900}); su.on("pageerror", lambda e: errs.append(str(e))); await su.goto(f"http://127.0.0.1:{port}/index.html"); await su.wait_for_timeout(400)
    href = await su.evaluate("[...document.querySelectorAll('nav.side a')].filter(a=>a.textContent.includes('Marktposition · TRUESCALE')).map(a=>a.getAttribute('href'))[0]"); print("Suite-Link Marktposition:", href); assert href and href.endswith("truescale.html#markt"), href
  finally:
    await b.close(); srv.shutdown()
  assert not errs, errs


async def layer(p):
  """Experience Layer: Inbox in drei Rollen, Aufgaben aus mindestens vier Systemen, je System eine Freigabe."""
  b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1440, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
  html = "<!doctype html><html><head><meta charset='utf-8'></head><body>" + open(ROOT / "dist" / "nexora-suite.html").read() + "</body></html>"
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
  for uid, sys in (("u2", "sap"), ("u2", "servicenow"), ("u2", "m365"), ("u8", "workday"), ("u2", "nexora")): await approve(uid, sys)
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
  au = await pg.evaluate("""(() => { const rows = auditRows(); const sum = Math.round(rows.reduce((a, r) => a + (r.cost || 0), 0) * 1000) / 1000; const c = document.querySelector('.cost-ctr'); return { n: rows.length, sum, month: +c.dataset.month, day: +c.dataset.day, ledger: C.ledger(W, 'elevon').length, eng: rows.filter(r => r.system === 'NEXORA-Engine').length, rej: rows.filter(r => !r.ok).length }; })()""")
  print("Protokoll:", au); assert au["n"] >= au["ledger"] and abs(au["sum"] - au["month"]) < 1e-9 and au["eng"] >= 1 and au["rej"] >= 1
  csv = await pg.evaluate("auditCsv(auditRows())"); head = csv.lstrip("\ufeff").split("\r\n")[0].split(";")
  print("CSV-Spalten:", head); assert len(head) == 13 and all(h in head for h in ["Datum", "Nutzer", "Rolle", "System", "Zugriffsweg", "Agent", "Kosten (EUR, Beispielwert)", "Ergebnis"]) and len(csv.strip().split("\r\n")) == au["n"] + 1
  await pg.select_option("[data-on=auSys]", "SAP S/4HANA (simuliert)"); await pg.wait_for_timeout(120)
  fs = await pg.evaluate("auditFiltered().every(r => r.system === 'SAP S/4HANA (simuliert)') && auditFiltered().length > 0"); assert fs, "Filter"
  await pg.screenshot(path=SP + "layer_audit.png"); await pg.evaluate("ACT.auditReset()")
  await pg.evaluate("location.hash='privacy'"); await pg.wait_for_timeout(120)
  assert await pg.evaluate("document.querySelectorAll('.priv-mx tbody tr').length") >= 5; await pg.screenshot(path=SP + "layer_privacy.png", full_page=True)
  await pg.evaluate("ACT.setLayer({v:'suite'})"); await pg.wait_for_timeout(100); assert await pg.evaluate("S.layer") == "suite"
  await b.close(); assert not errs, errs

async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={"width":1600,"height":950})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    html="<!doctype html><html><head><meta charset='utf-8'></head><body>"+open(ROOT/"dist"/"nexora-suite.html").read()+"</body></html>"
    await pg.set_content(html); await pg.wait_for_timeout(400)
    await pg.screenshot(path=SP+"s_home.png")
    report=[]
    for sid in ["industrial","retail","services","crosslift","service","omni","migration","design","p2p","hire"]:
      await pg.evaluate(f"ACT.startStory({{id:'{sid}',reset:1}})"); await pg.wait_for_timeout(100)
      n=await pg.evaluate(f"STORIES.find(s=>s.id==='{sid}').steps.length")
      for i in range(n):
        await pg.click("[data-act=storyStep]"); await pg.wait_for_timeout(60)
      st=await pg.evaluate("S.story && S.story.i"); last=await pg.evaluate("S.last && S.last.ok")
      report.append((sid,n,st,last))
      if sid in ("service","omni","migration","design","p2p","hire"): await pg.screenshot(path=SP+"s_"+sid+".png")
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
