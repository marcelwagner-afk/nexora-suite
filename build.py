import json
import pathlib
d=pathlib.Path(__file__).parent/'src'; out=pathlib.Path(__file__).parent/'dist'
css=(d/'base.css').read_text()+'\n'+(d/'extra.css').read_text()+'\n'+(d/'layer.css').read_text()+'\n'+(d/'pe.css').read_text()+'\n'+(d/'infra.css').read_text()+'\n'+(d/'media.css').read_text()
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
{(d/'pe.js').read_text()}
{(d/'infra.js').read_text()}
</script>
<script>
{(d/'icons.js').read_text()}
{(d/"app.js").read_text()}
{(d/"app_ext.js").read_text()}
const SAMPLES = {json.dumps({k: (d.parent/'samples'/(k + '.dxf')).read_text() for k in ('MR-1200', 'SK-200')})};
{(d/"app_v6.js").read_text()}
{(d/"app_v7.js").read_text()}
{(d/"app_v8.js").read_text()}
{(d/"app_pe.js").read_text()}
{(d/"app_pe3.js").read_text()}
{(d/"app_pe4.js").read_text()}
{(d/"app_pe5.js").read_text()}
{(d/"app_pe6.js").read_text()}
{(d/"app_infra.js").read_text()}
{(d/"app_media.js").read_text()}
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
src = "".join((d/f).read_text() for f in ("app.js", "app_ext.js", "app_v6.js", "app_v8.js"))
stories = []
for m in re.finditer(r'\{ id: "([a-z0-9]+)", tenant: "([a-z]+)", cross: \[([^\]]*)\], short: "([^"]*)", title: "([^"]*)", situation: "([^"]*)"', src):
    body = src[m.end():]; body = body[:body.index("], outro")]
    stories.append({"id": m[1], "tenant": m[2], "cross": re.findall(r'"([a-z]+)"', m[3]), "short": m[4], "title": m[5], "situation": m[6], "steps": len(re.findall(r'\{ t: "', body))})
ts = (d/'truescale.html').read_text().replace("/*CSS*/", (d/'base.css').read_text()).replace("/*ICONS*/", (d/'icons.js').read_text()).replace("/*STORIES*/", "const STORY_LIST = " + json.dumps(stories, ensure_ascii=False) + ";").replace("/*MARKET*/", (d/'market.js').read_text())
for target in (out, root):
    (target/'truescale.html').write_text(skel + ts + '</body></html>')
print(len(stories), "Storys auf der TRUESCALE-Seite")

# Offene Standards (statische Vorführdateien, kein laufender Server):
# dist/mcp-tools.json – Werkzeugliste des Assistenten (aus AI_TOOLS: Name, Beschreibung, inputSchema)
# dist/agent-card.json – A2A-artige Agentenkarte des NEXORA-Agenten
import subprocess
def js_obj(s):
    """Einfaches JS-Objektliteral (nur Schlüssel ohne Anführungszeichen, Strings, Arrays) → Python."""
    return json.loads(re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', s))
def balanced(s, i):
    depth = 0; q = None
    for j in range(i, len(s)):
        c = s[j]
        if q:
            if c == '\\': continue
            if c == q and s[j-1] != '\\': q = None
        elif c in '"\'`': q = c
        elif c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return s[i:j+1]
    raise ValueError("Klammer offen")
tools = []
for f in ("app_ext.js", "app_v6.js", "app_v8.js", "app_pe3.js"):
    s = (d/f).read_text()
    for m in re.finditer(r'\{ name: "([a-z_]+)", description: "((?:[^"\\]|\\.)*)"', s):
        rest = s[m.end():m.end()+20]
        schema = {"type": "object", "properties": {}}
        if rest.startswith(', inputSchema: '):
            schema = js_obj(balanced(s, m.end() + len(', inputSchema: ')))
        tools.append({"name": m[1], "description": m[2].replace('\\"', '"'), "inputSchema": schema,
                      "annotations": {"readOnlyHint": True, "layer": f == "app_v8.js"}})
mcp = {"$comment": "Statische Vorführdatei der NEXORA AI Suite (Demo). Kein laufender MCP-Server. Alle Werkzeuge lesen nur; Aktionen führt ausschließlich ein Mensch nach Bestätigung aus.",
       "name": "nexora-suite-demo", "version": "0.8.0", "tools": tools}
(out/'mcp-tools.json').write_text(json.dumps(mcp, ensure_ascii=False, indent=2) + "\n")
try:
    meta = json.loads(subprocess.run(["node", "-e", "const C=require('./src/connectors.js');console.log(JSON.stringify({v:C.VERSION,a:C.AGENTS,c:C.CONNECTORS,note:C.COST_NOTE,sap:C.SAP_POLICY_NOTE}))"], cwd=d.parent, capture_output=True, text=True, check=True).stdout)
    nx = meta["a"][0]; layer_tools = [t for t in tools if t["annotations"]["layer"]]
    card = {
        "$comment": "Statische Vorführdatei im Stil einer A2A-Agentenkarte. Kein laufender Agent; alle Fremdsysteme der Demo sind simuliert.",
        "name": "NEXORA Experience Layer (Demo)",
        "description": "Herstellerneutraler Assistent über NEXORA-Engine und simulierte Demo-Konnektoren (SAP S/4HANA, Microsoft 365, ServiceNow, Workday). Liest Aufgaben, sucht systemübergreifend, erklärt Kosten und schlägt Aktionen vor. Bucht nichts selbst.",
        "url": "https://marcelwagner-afk.github.io/nexora-suite/",
        "version": meta["v"],
        "provider": {"organization": "TRUESCALE", "url": "https://github.com/marcelwagner-afk/nexora-suite"}, "brand": "NEXORA AI – A brand of TRUESCALE",
        "capabilities": {"streaming": False, "pushNotifications": False, "stateTransitionHistory": True},
        "defaultInputModes": ["text/plain"], "defaultOutputModes": ["text/plain", "application/json"],
        "skills": [{"id": t["name"], "name": t["name"].replace("_", " "), "description": t["description"], "tags": ["experience-layer", "read-only"], "examples": ex}
                   for t, ex in zip(layer_tools, [["Was muss ich heute freigeben?"], ["Suche Monitor"], ["Zeig mir sap:pr:10004711"], ["Was haben die Zugriffe diesen Monat gekostet?"], ["Über welchen Weg läuft eine SAP-Frage?"]])]
                  + [{"id": "engine-analysen", "name": "Engine-Analysen", "description": "Kennzahlen, GuV, Projekte, Nachschub, offene Posten, Prozesse, Fertigung, Migration, Einkauf und Konstruktion aus der NEXORA-Engine.", "tags": ["nexora-engine", "read-only"], "examples": ["Warum ist unsere operative Marge gesunken?"]}],
        "x-nexora": {"simulated": True, "costNote": meta["note"], "sapNote": meta["sap"], "actions": "nur nach Klick und Bestätigung eines Menschen, mit Rechteprüfung",
                     "delegates": [{"id": a["id"], "name": a["name"], "system": meta["c"][a["system"]]["name"], "route": a["route"], "simulated": a["simulated"], "skills": a["skills"]} for a in meta["a"]]}
    }
    (out/'agent-card.json').write_text(json.dumps(card, ensure_ascii=False, indent=2) + "\n")
    print(len(tools), "Werkzeuge in mcp-tools.json,", len(card["skills"]), "Fähigkeiten in agent-card.json")
except (OSError, subprocess.CalledProcessError) as e:
    print("Hinweis: agent-card.json nicht erzeugt (Node nicht verfügbar):", e)
