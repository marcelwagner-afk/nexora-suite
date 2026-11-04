import asyncio, json
from playwright.async_api import async_playwright
import os, pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
SP=str(ROOT/"test-results")+"/"; os.makedirs(SP, exist_ok=True)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    pg=await b.new_page(viewport={"width":1600,"height":950})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    html="<!doctype html><html><head><meta charset='utf-8'></head><body>"+open(ROOT/"dist"/"nexora-suite.html").read()+"</body></html>"
    await pg.set_content(html); await pg.wait_for_timeout(400)
    await pg.screenshot(path=SP+"s_home.png")
    report=[]
    for sid in ["industrial","retail","services","crosslift","service","omni","migration"]:
      await pg.evaluate(f"ACT.startStory({{id:'{sid}',reset:1}})"); await pg.wait_for_timeout(100)
      n=await pg.evaluate(f"STORIES.find(s=>s.id==='{sid}').steps.length")
      for i in range(n):
        await pg.click("[data-act=storyStep]"); await pg.wait_for_timeout(60)
      st=await pg.evaluate("S.story && S.story.i"); last=await pg.evaluate("S.last && S.last.ok")
      report.append((sid,n,st,last))
      if sid in ("service","omni","migration"): await pg.screenshot(path=SP+"s_"+sid+".png")
      if sid=="industrial": await pg.screenshot(path=SP+"s_ind.png")
    print(report)
    # Konsistenzprüfung nach allen Storys
    chk=await pg.evaluate("""(()=>{const out={};for(const id of E.TENANT_IDS){const t=W.tenants[id];const tb=E.trialBalance(t);out[id]={tb:Object.values(tb).reduce((a,b)=>a+b,0).toFixed(2),ar:(E.balance(t,'1200')-t.custInvoices.reduce((a,i)=>a+i.open,0)).toFixed(2),ap:(-E.balance(t,'1600')-t.supInvoices.reduce((a,i)=>a+i.open,0)).toFixed(2),inbox:t.inbox.filter(m=>m.status==='offen').length,inst:E.processInstances(t).map(i=>i.steps.filter(s=>s.state==='active'||s.state==='error').map(s=>s.name).join('|')).join(';')}};return out})()""")
    print(json.dumps(chk,ensure_ascii=False))
    for r in ["processes","finance","analytics","sales","supply","production","inbox","admin","ai","hr","service","assets","migrations","cutover"]:
      await pg.evaluate(f"location.hash='{r}'"); await pg.wait_for_timeout(80)
    for tn,rs in [("elevon",["service","assets","migrations","cutover","hr"]),("novamart",["sales","hr","assets","migrations"]),("aventra",["hr","migrations"])]:
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
