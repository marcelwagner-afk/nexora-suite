import json
import pathlib
d=pathlib.Path(__file__).parent/'src'; out=pathlib.Path(__file__).parent/'dist'
css=(d/'base.css').read_text()+'\n'+(d/'extra.css').read_text()+'\n'+(d/'layer.css').read_text()
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
{(d/'connectors.js').read_text()}
</script>
<script>
{(d/'icons.js').read_text()}
{(d/"app.js").read_text()}
{(d/"app_ext.js").read_text()}
const SAMPLES = {json.dumps({k: (d.parent/'samples'/(k + '.dxf')).read_text() for k in ('MR-1200', 'SK-200')})};
{(d/"app_v6.js").read_text()}
{(d/"app_v7.js").read_text()}
{(d/"app_v8.js").read_text()}
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

# TRUESCALE-Vertriebsseite im NEXORA-Design, Demos aus den echten Suite-Storys
import re
src = "".join((d/f).read_text() for f in ("app.js", "app_ext.js", "app_v6.js"))
stories = []
for m in re.finditer(r'\{ id: "([a-z0-9]+)", tenant: "([a-z]+)", cross: \[([^\]]*)\], short: "([^"]*)", title: "([^"]*)", situation: "([^"]*)"', src):
    body = src[m.end():]; body = body[:body.index("], outro")]
    stories.append({"id": m[1], "tenant": m[2], "cross": re.findall(r'"([a-z]+)"', m[3]), "short": m[4], "title": m[5], "situation": m[6], "steps": len(re.findall(r'\{ t: "', body))})
ts = (d/'truescale.html').read_text().replace("/*CSS*/", (d/'base.css').read_text()).replace("/*ICONS*/", (d/'icons.js').read_text()).replace("/*STORIES*/", "const STORY_LIST = " + json.dumps(stories, ensure_ascii=False) + ";")
for target in (out, root):
    (target/'truescale.html').write_text(skel + ts + '</body></html>')
print(len(stories), "Storys auf der TRUESCALE-Seite")
