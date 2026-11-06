"""Visueller Vergleich der Suite-Ansicht: speichert Referenz-Screenshots oder vergleicht dagegen.
Aufruf: python test/visual.py save <ordner>   |   python test/visual.py compare <ordner> [--inhalt]
Verglichen wird der Seiteninhalt ohne Kopfzeile (dort sitzt ab v0.8 der Ansichts-Umschalter)."""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
ROUTES = ["home", "processes", "sales", "engineering", "production", "supply", "finance", "hr", "tasks", "documents", "users", "admin"]
HEADER = 80  # Pixel der Kopfzeile, die nicht verglichen werden
SIDEBAR = 260  # mit --inhalt: Seitennavigation ausklammern (ab v0.9 enthält sie den Bereich Private Equity)
CONTENT_ONLY = "--inhalt" in sys.argv

async def shots(folder):
  folder.mkdir(parents=True, exist_ok=True)
  async with async_playwright() as p:
    b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1440, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    html = "<!doctype html><html><head><meta charset='utf-8'></head><body>" + (ROOT / "dist" / "stegarc-suite.html").read_text() + "</body></html>"
    await pg.set_content(html); await pg.wait_for_timeout(400)
    await pg.evaluate("S.live=false; S.layer='suite'; render()")
    for r in ROUTES:
      await pg.evaluate(f"location.hash='{r}'"); await pg.wait_for_timeout(150)
      await pg.screenshot(path=str(folder / f"{r}.png"), clip={"x": 0, "y": HEADER, "width": 1440, "height": 900 - HEADER})
    await b.close(); return errs

def compare(ref, cur):
  from PIL import Image, ImageChops
  bad = []
  for r in ROUTES:
    a = Image.open(ref / f"{r}.png").convert("RGB"); c = Image.open(cur / f"{r}.png").convert("RGB")
    if CONTENT_ONLY: a = a.crop((SIDEBAR, 0, a.width, a.height)); c = c.crop((SIDEBAR, 0, c.width, c.height))
    diff = ImageChops.difference(a, c); bbox = diff.getbbox()
    n = sum(1 for px in diff.getdata() if px != (0, 0, 0)) if bbox else 0
    print(f"{r:12s} {'gleich' if not bbox else f'{n} Pixel abweichend, Bereich {bbox}'}")
    if bbox: bad.append(r)
  return bad

if __name__ == "__main__":
  mode, folder = sys.argv[1], pathlib.Path(sys.argv[2])
  if mode == "save":
    e = asyncio.run(shots(folder)); print("Referenz gespeichert", folder, "Fehler:", e); sys.exit(1 if e else 0)
  cur = folder.parent / (folder.name + "_aktuell"); e = asyncio.run(shots(cur)); bad = compare(folder, cur)
  print("Seitenfehler:", e); sys.exit(1 if (bad or e) else 0)
