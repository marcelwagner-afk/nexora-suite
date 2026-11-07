"""Mehrsprachigkeit (EN/ES/PT/PL): jede Sprache lädt ohne Skriptfehler, zeigt übersetzte Oberflächen,
der Umschalter wechselt die Sprache, Produktseite und Prototyp je Sprache, Wörterbücher vollständig."""
import asyncio, functools, http.server, json, pathlib, re, socketserver, sys, threading
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); import i18n
LANGS = list(i18n.LANGS)
# Stichproben: Text der deutschen Oberfläche → muss in der Übersetzung fehlen
DE_MARKERS = ["Weitere Module", "Was möchtest du heute erreichen?", "Live-Änderungen"]
ROUTES = ["home", "tasks", "inbox", "finance", "sales", "pe", "infra", "systems", "ai", "admin"]

def dictionaries():
    """Jede Sprache deckt alle Schlüssel ab, Platzhalter bleiben erhalten."""
    keys = None
    for l in LANGS:
        t = i18n.table(l)
        if keys is None: keys = set(t)
        missing = keys ^ set(t); assert not missing, (l, len(missing), list(missing)[:3])
        bad = [k for k, v in t.items() if sorted(re.findall(r"\{\d+\}", k)) != sorted(re.findall(r"\{\d+\}", v))]
        assert not bad, (l, bad[:3])
        print(f"Wörterbuch {l}: {len(t)} Einträge, Platzhalter ok")

async def main():
    dictionaries()
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = socketserver.TCPServer(("127.0.0.1", 0), functools.partial(Q, directory=str(ROOT / "dist"))); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start(); base = f"http://127.0.0.1:{port}/"
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        try:
            for l in LANGS:
                pg = await b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e, l=l: errs.append(f"{l}: {e}"))
                await pg.goto(base + f"index.html?lang={l}"); await pg.wait_for_timeout(400)
                assert await pg.evaluate("LANG") == l, l
                assert await pg.evaluate("document.documentElement.lang") == l
                seen = []
                for r in ROUTES:
                    await pg.evaluate(f"location.hash = '{r}'"); await pg.wait_for_timeout(120)
                    txt = await pg.inner_text("body"); seen.append(len(txt))
                    left = [m for m in DE_MARKERS if m in txt]; assert not left, (l, r, left)
                print(f"Suite {l}: {len(ROUTES)} Ansichten ohne Fehler, Umschalter =", await pg.evaluate("document.querySelector('.lang-sw select').value"))
                await pg.screenshot(path=str(ROOT / "test-results" / f"i18n_suite_{l}.png"))
                await pg.close()
            # Umschalter: DE → EN → wieder DE
            pg = await b.new_page(viewport={"width": 1440, "height": 900}); pg.on("pageerror", lambda e: errs.append(f"switch: {e}"))
            await pg.goto(base + "index.html"); await pg.wait_for_timeout(300); assert await pg.evaluate("LANG") == "de"
            async with pg.expect_navigation(): await pg.select_option(".lang-sw select", "en")
            await pg.wait_for_timeout(300); assert await pg.evaluate("LANG") == "en", "Umschalter auf EN"
            async with pg.expect_navigation(): await pg.select_option(".lang-sw select", "de")
            await pg.wait_for_timeout(300); assert await pg.evaluate("LANG") == "de", "Umschalter zurück auf DE"
            print("Umschalter DE → EN → DE ok")
            # Produktseite und Prototyp je Sprache
            for l in ["de"] + LANGS:
                sfx = "" if l == "de" else "." + l
                for page in ("stegarc", "prototyp"):
                    pg = await b.new_page(viewport={"width": 400, "height": 860}); pg.on("pageerror", lambda e, l=l, page=page: errs.append(f"{page} {l}: {e}"))
                    await pg.goto(base + f"{page}{sfx}.html"); await pg.wait_for_timeout(300)
                    assert await pg.evaluate("document.documentElement.lang") == l
                    sw = await pg.evaluate("document.documentElement.scrollWidth"); assert sw == 400, (page, l, sw)
                    if page == "stegarc":
                        assert await pg.evaluate("document.querySelectorAll('link[rel=alternate][hreflang]').length") == 6
                        assert await pg.evaluate("document.querySelectorAll('#stories .story').length") > 0
                        if l != "de":
                            suite = await pg.evaluate("document.getElementById('suiteTop').getAttribute('href')"); assert f"lang={l}" in suite, suite
                            assert "Kostenrechner" not in await pg.inner_text("body"), l
                    await pg.close()
                print(f"Produktseite und Prototyp {l}: ok (mobil ohne Querscrollen)")
        finally:
            await b.close(); srv.shutdown()
    assert not errs, errs[:5]
    print("Mehrsprachigkeit: alle Prüfungen bestanden")

asyncio.run(main())
