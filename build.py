import json
import pathlib
d=pathlib.Path(__file__).parent/'src'; out=pathlib.Path(__file__).parent/'dist'
css=(d/'base.css').read_text()+'\n'+(d/'extra.css').read_text()
html=f'''<title>NEXORA AI Suite</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
{css}
</style>
<div id="root"></div>
<div id="layer"></div>
<script>
{(d/'engine.js').read_text()}
{(d/'dxf.js').read_text()}
</script>
<script>
{(d/'icons.js').read_text()}
{(d/"app.js").read_text()}
{(d/"app_ext.js").read_text()}
const SAMPLE_DXF = {json.dumps((d.parent/'samples'/'SK-200.dxf').read_text())};
{(d/"app_v6.js").read_text()}
{(d/"app_boot.js").read_text()}
</script>
'''
(out/'nexora-suite.html').write_text(html)
print(len(html))

# GitHub Pages: vollständige Dokumente
skel = '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">'
root = d.parent  # GitHub Pages (Branch main, Ordner /) liefert index.html und prototyp.html aus dem Repo-Stamm
for target in (out, root):
    (target/'index.html').write_text(skel + html + '</body></html>')
    (target/'prototyp.html').write_text(skel + (d/'prototyp.html').read_text() + '</body></html>')
