"""Stresstest der Oberfläche im Browser (Chromium, ohne Server). Ausführen: python test/ui.stress.py [Faktor] [Klicks]
   1) Jede PE-Seite mit der Demo-Welt und mit einer hochskalierten Welt (Faktor × 25 Unternehmen): Renderzeit, Seitenfehler, Breite bei 400 px
   2) Dauerlast in der Suite: viele Geschäftsvorfälle hintereinander über den Dispatcher wie bei Klicks, Zeit je Befehl, danach PE-Seite neu
   Messwerte dieses Rechners; Chromium headless."""
import asyncio, sys, time, pathlib, statistics
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; F = int(sys.argv[1]) if len(sys.argv) > 1 else 10; CLICKS = int(sys.argv[2]) if len(sys.argv) > 2 else 150
ROUTES = ["pe", "pecos", "pe-fin", "pe-cons", "pe-cash", "pe-inv", "pe-vc", "pe-risk", "pe-ai", "pe-hub", "pe-onb", "pe-trans", "peadmin", "peco"]

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1440, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content("<!doctype html><html><head><meta charset='utf-8'></head><body>" + (ROOT / "dist" / "stegarc-suite.html").read_text() + "</body></html>"); await pg.wait_for_timeout(400)
    await pg.evaluate("S.pe.principal='p1'; S.pe.company='PC01'")
    async def sweep(label):
      out = {}
      for r in ROUTES:
        ms = await pg.evaluate(f"(() => {{ location.hash = '{r}'; const t = performance.now(); render(); return performance.now() - t; }})()"); out[r] = ms
      return out
    await sweep("warm")  # erster Durchlauf wärmt auf (Aufbau der PE-Welt)
    small = await sweep("demo")
    n = await pg.evaluate(f"(() => {{ const t = performance.now(); PEW = PE.createWorld({{ multiplier: {F}, engine: PE.engineFeed(E.TENANT_IDS.map(id => W.tenants[id])) }}); PEW_SIG = peEngineSig(); return [PEW.companies.length, performance.now() - t]; }})()")
    await sweep("warm-big"); big = await sweep("big")
    await pg.set_viewport_size({"width": 400, "height": 860}); wide = []
    for r in ROUTES:
      await pg.evaluate(f"location.hash='{r}'; render()"); sw = await pg.evaluate("document.documentElement.scrollWidth")
      if sw > 400: wide.append((r, sw))
    await pg.set_viewport_size({"width": 1440, "height": 900})
    print(f"1) PE-Seiten · Renderzeit in ms (Demo 25+5 Unternehmen | hochskaliert {n[0]} Unternehmen, Aufbau {n[1]:.0f} ms)")
    for r in ROUTES: print(f"   {r:10} {small[r]:8.1f} {big[r]:9.1f}")
    print("   langsamste Seite hochskaliert:", max(big, key=big.get), f"{max(big.values()):.0f} ms"); print("   Seiten breiter als 400 px:", wide or "keine")
    # 2) Dauerlast: Service-Abläufe und Web-Bestellungen über den Dispatcher (wie Klicks), danach PE-Seite
    await pg.evaluate("PEW = null; S.pe.principal = 'p12'")
    times = await pg.evaluate(f"""(() => {{ const T = W.tenants.elevon; const assets = T.master.assets.filter(a => a.contract !== 'Vollwartung').map(a => a.id); const mats = Object.keys(T.stock).filter(k => k.endsWith('@WH5')).map(k => k.split('@')[0]); const arts = W.tenants.novamart.master.articles.map(a => a.id);
      const ts = []; let rej = 0; const go = (tid, c, x) => {{ const t = performance.now(); const r = E.dispatch(W, tid, c, x, {{ auto: true }}); ts.push(performance.now() - t); if (!r.ok) {{ rej++; throw 0; }} return r; }};
      for (let i = 0; ts.length < {CLICKS}; i++) {{ try {{ const sv = go('elevon', 'createServiceTicket', {{ assetId: assets[i % assets.length], text: 'UI-Last ' + i }}).objects[0]; go('elevon', 'scheduleTechnician', {{ svNo: sv }}); go('elevon', 'reserveParts', {{ svNo: sv, mat: mats[i % mats.length], qty: 1 }}); go('elevon', 'executeService', {{ svNo: sv, hours: 2 }}); go('elevon', 'invoiceService', {{ svNo: sv }}); }} catch (e) {{}} try {{ go('novamart', 'placeWebOrder', {{ articleId: arts[i % arts.length], qty: 1 }}); }} catch (e) {{}} }}
      const t0 = performance.now(); location.hash = 'peco'; S.pe.company = 'NX1'; render(); const tPe = performance.now() - t0; return {{ ts, rej, tPe, docs: T.docs.filter(d => d.period === '2026-11').length, card: (document.querySelector('[data-engine=elevon]') || {{}}).innerText || '' }}; }})()""")
    ts = sorted(times["ts"]); print(f"2) Dauerlast: {len(ts)} Befehle, {times['rej']} fachlich abgelehnt · je Befehl Median {statistics.median(ts):.1f} ms, 95 % ≤ {ts[int(len(ts) * .95)]:.1f} ms, max {ts[-1]:.1f} ms")
    print(f"   PE-Unternehmensseite danach (inkl. Neuaufbau der PE-Welt): {times['tPe']:.0f} ms · Elevon offene Periode: {times['docs']} Belege, Live-Karte zeigt sie: {str(times['docs']) in times['card']}")
    await b.close()
    print("Seitenfehler:", errs or "keine")
    if errs or wide or str(times['docs']) not in times['card']: sys.exit(1)
asyncio.run(main())
