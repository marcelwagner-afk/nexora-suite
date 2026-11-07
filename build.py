import json
import pathlib
import re
import sys
d=pathlib.Path(__file__).parent/'src'; out=pathlib.Path(__file__).parent/'dist'
sys.path.insert(0, str(d.parent / 'tools')); import i18n  # Übersetzung zur Build-Zeit (DE → EN/ES/PT/PL)
LANGS = ["de"] + list(i18n.LANGS); LANG_NAMES = {"de": "Deutsch", **i18n.LANGS}
# Filme: aus, bis die STEGARC-Fassungen in media/ liegen (Dateinamen siehe VIDEOS in src/app_media.js)
FILMS = True
import re as _re
def films(t): return t.replace('/*FILMS_ON*/false', 'true' if FILMS else 'false') if FILMS else _re.sub(r'<!--FILM:START-->.*?<!--FILM:END-->', '', t, flags=_re.S).replace('/*FILMS_ON*/false', 'false')
FILM_IDS = ("stegarc-imagespot", "stegarc-experience-layer", "stegarc-pe-command-center", "stegarc-it-infrastruktur")
css=(d/'base.css').read_text()+'\n'+(d/'extra.css').read_text()+'\n'+(d/'layer.css').read_text()+'\n'+(d/'pe.css').read_text()+'\n'+(d/'infra.css').read_text()+'\n'+(d/'media.css').read_text()
HEAD = ('<title>STEGARC Suite</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">\n'
        '<style>\n' + css + '\n</style>\n<div id="root"></div>\n<div id="layer"></div>\n')
VTT = {p.name[:-4]: p.read_text(encoding='utf-8') for p in sorted((d.parent/'media').glob('*.vtt'))}
HEAD += '<script>window.STEGARC_VTT = ' + json.dumps(VTT, ensure_ascii=False).replace('</', '<\\/') + ';</script>\n'
SAMPLES = "const SAMPLES = " + json.dumps({k: (d.parent/'samples'/(k + '.dxf')).read_text() for k in ('MR-1200', 'SK-200')}) + ";"
PART1 = ("engine.js", "dxf.js", "connectors.js", "pe.js", "infra.js")
PART2 = ("icons.js", "app.js", "app_ext.js", None, "app_v6.js", "app_v7.js", "app_v8.js", "app_pe.js", "app_pe3.js", "app_pe4.js", "app_pe5.js", "app_pe6.js", "app_infra.js", "app_lang.js", "app_media.js", "app_boot.js")
STATS = {}

links = i18n.links

def local_films(lang): return {f: 1 for f in FILM_IDS if (d.parent/'media'/f"{f}.{lang}.mp4").exists()}

def loc(name, lang):
    t = (d/name).read_text()
    if name == "app_media.js": t = films(t)
    if name == "app_lang.js": t = t.replace('/*LANG*/"de"', json.dumps(lang)).replace("/*VID_LOCAL*/{}", json.dumps(local_films(lang)))
    if lang == "de": return t
    return links(i18n.localize(t, lang, "js", STATS.setdefault(lang, [0, 0])), lang)

def back_map(lang):
    """Der regelbasierte Assistent versteht Deutsch: übersetzte Beispielfragen werden vor der Auswertung zurückübersetzt."""
    m = {v: k for k, v in i18n.table(lang).items() if v and v != k and "{" not in k and len(k) <= 120 and (k.endswith("?") or len(k) <= 70)}
    return ("\n/* Sprache: Beispielfragen zurück ins Deutsche */\nconst I18N_BACK = " + json.dumps(m, ensure_ascii=False) +
            ";\nconst _answerL = answer; answer = function (q) { const k = I18N_BACK[String(q || '').trim()]; return _answerL(k || q); };\n")

def suite_js(lang):
    p1 = "\n".join(loc(f, lang) for f in PART1)
    p2 = "\n".join(SAMPLES if f is None else loc(f, lang) for f in PART2[:-1]) + (back_map(lang) if lang != "de" else "") + "\n" + loc(PART2[-1], lang)
    return p1, p2

SUITE = {l: suite_js(l) for l in LANGS}
def single(lang): p1, p2 = SUITE[lang]; return HEAD + "<script>\n" + p1 + "\n</script>\n<script>\n" + p2 + "\n</script>\n"
html = single("de")
(out/'stegarc-suite.html').write_text(html)
for l in LANGS[1:]: (out/f'stegarc-suite.{l}.html').write_text(single(l))
# Mehrsprachige Fassung (Pages index.html und Artifact): alle Sprachen in einem Dokument, ausgeführt wird nur die gewählte.
# Wahl: ?lang=… > zuletzt gewählt (window.name, localStorage) > Deutsch
LOADER = ('<script>\n(function () { var L = null, ok = function (x) { return x && document.getElementById("stegarc-l-" + x) ? x : null; };\n'
          '  try { L = ok(new URLSearchParams(location.search).get("lang")); } catch (e) {}\n'
          '  if (!L) L = ok((/stegarc\\.lang=(\\w+)/.exec(window.name || "") || [])[1]);\n'
          '  if (!L) try { L = ok(localStorage.getItem("stegarc.lang")); } catch (e) {}\n'
          '  L = L || "de"; var s = document.createElement("script"); s.textContent = document.getElementById("stegarc-l-" + L).textContent; document.body.appendChild(s); })();\n</script>\n')
multi = HEAD + "".join(f'<script type="text/plain" id="stegarc-l-{l}">\n' + SUITE[l][0] + "\n" + SUITE[l][1] + "\n</script>\n" for l in LANGS) + LOADER
(out/'stegarc-suite.multi.html').write_text(multi)
print(len(html), "Bytes Suite (de),", len(multi), "Bytes mehrsprachig")

# GitHub Pages: vollständige Dokumente
def skel(lang): return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">'
root = d.parent  # GitHub Pages (Branch main, Ordner /) liefert index.html und prototyp.html aus dem Repo-Stamm
def proto_switch(l):
    a = lambda k: (f'<a href="prototyp{"" if k == "de" else "." + k}.html" hreflang="{k}" lang="{k}" title="{LANG_NAMES[k]}"' + (' aria-current="true"' if k == l else "") +
                   f' style="color:{"#fff" if k == l else "#b6b3d8"};text-decoration:none;padding:4px 7px;border-radius:7px{";background:rgba(255,255,255,.14)" if k == l else ""}">{k.upper()}</a>')
    return '<nav aria-label="Language" style="position:fixed;left:12px;bottom:12px;z-index:99;display:flex;gap:2px;background:rgba(23,21,58,.9);border-radius:10px;padding:4px;font:600 11.5px ui-monospace,monospace">' + "".join(a(k) for k in LANGS) + '</nav>'
for l in LANGS:
    sfx = "" if l == "de" else "." + l
    pt = (d/'prototyp.html').read_text()
    if l != "de": pt = links(i18n.localize(pt, l, "doc", STATS.setdefault(l, [0, 0])), l)
    for target in (out, root):
        if l == "de": (target/'index.html').write_text(skel("de") + multi + '</body></html>')
        (target/f'prototyp{sfx}.html').write_text(skel(l) + pt + proto_switch(l) + '</body></html>')

# STEGARC-Produktseite (Business Case, Marktposition, Filme), Demos aus den echten Suite-Storys
src = "".join((d/f).read_text() for f in ("app.js", "app_ext.js", "app_v6.js", "app_v8.js"))
stories = []
for m in re.finditer(r'\{ id: "([a-z0-9]+)", tenant: "([a-z]+)", cross: \[([^\]]*)\], short: "([^"]*)", title: "([^"]*)", situation: "([^"]*)"', src):
    body = src[m.end():]; body = body[:body.index("], outro")]
    stories.append({"id": m[1], "tenant": m[2], "cross": re.findall(r'"([a-z]+)"', m[3]), "short": m[4], "title": m[5], "situation": m[6], "steps": len(re.findall(r'\{ t: "', body))})
ts0 = films((d/'stegarc.html').read_text()).replace("/*CSS*/", (d/'base.css').read_text()).replace("/*ICONS*/", (d/'icons.js').read_text()).replace("/*STORIES*/", "const STORY_LIST = " + json.dumps(stories, ensure_ascii=False) + ";").replace("/*MARKET*/", (d/'market.js').read_text())
PAGE = "https://marcelwagner-afk.github.io/stegarc-suite/"
for l in LANGS:
    sfx = "" if l == "de" else "." + l
    ts = ts0.replace("/*LANGNAV*/", "<!--LANGNAV-->")
    if l != "de":
        ts = links(i18n.localize(ts, l, "doc", STATS.setdefault(l, [0, 0])), l)
        for f in FILM_IDS:  # Film in Landessprache, sonst englischer Film mit Untertiteln in der Seitensprache
            if local_films(l).get(f): ts = ts.replace(f'media/{f}.mp4"', f'media/{f}.{l}.mp4"')
            elif l != "en": ts = ts.replace(f'<source src="media/{f}.mp4" type="video/mp4">', f'<source src="media/{f}.mp4" type="video/mp4"><track kind="subtitles" srclang="{l}" label="{LANG_NAMES[l]}" src="media/{f}.{l}.vtt" default>')
    nav = ('<label class="ts-lang"><span class="sr-only">Language</span><select aria-label="Language" onchange="location.href=this.value">' +
           "".join(f'<option value="stegarc{"" if k == "de" else "." + k}.html" lang="{k}" title="{LANG_NAMES[k]}"{" selected" if k == l else ""}>{k.upper()}</option>' for k in LANGS) + '</select></label>')
    alt = "".join(f'<link rel="alternate" hreflang="{k}" href="{PAGE}stegarc{"" if k == "de" else "." + k}.html">' for k in LANGS) + f'<link rel="alternate" hreflang="x-default" href="{PAGE}stegarc.en.html">'
    ts = ts.replace("<!--LANGNAV-->", nav).replace("<title>", alt + "\n<title>", 1)
    for target in (out, root):
        (target/f'stegarc{sfx}.html').write_text(skel(l) + ts + '</body></html>')
print(len(stories), "Storys auf der STEGARC-Produktseite")
for l, (h, m) in STATS.items(): print(f"Übersetzung {l}: {h} Texte ersetzt, {m} ohne Übersetzung")

# Offene Standards (statische Vorführdateien, kein laufender Server):
# dist/mcp-tools.json – Werkzeugliste des Assistenten (aus AI_TOOLS: Name, Beschreibung, inputSchema)
# dist/agent-card.json – A2A-artige Agentenkarte des STEGARC-Agenten
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
mcp = {"$comment": "Statische Vorführdatei der STEGARC Suite (Demo). Kein laufender MCP-Server. Alle Werkzeuge lesen nur; Aktionen führt ausschließlich ein Mensch nach Bestätigung aus.",
       "name": "stegarc-suite-demo", "version": "0.8.0", "tools": tools}
(out/'mcp-tools.json').write_text(json.dumps(mcp, ensure_ascii=False, indent=2) + "\n")
try:
    meta = json.loads(subprocess.run(["node", "-e", "const C=require('./src/connectors.js');console.log(JSON.stringify({v:C.VERSION,a:C.AGENTS,c:C.CONNECTORS,note:C.COST_NOTE,sap:C.SAP_POLICY_NOTE}))"], cwd=d.parent, capture_output=True, text=True, check=True).stdout)
    nx = meta["a"][0]; layer_tools = [t for t in tools if t["annotations"]["layer"]]
    card = {
        "$comment": "Statische Vorführdatei im Stil einer A2A-Agentenkarte. Kein laufender Agent; alle Fremdsysteme der Demo sind simuliert.",
        "name": "STEGARC Experience Layer (Demo)",
        "description": "Herstellerneutraler Assistent über STEGARC-Engine und simulierte Demo-Konnektoren (SAP S/4HANA, Microsoft 365, ServiceNow, Workday). Liest Aufgaben, sucht systemübergreifend, erklärt Kosten und schlägt Aktionen vor. Bucht nichts selbst.",
        "url": "https://marcelwagner-afk.github.io/stegarc-suite/",
        "version": meta["v"],
        "provider": {"organization": "Marcel Wagner", "url": "https://github.com/marcelwagner-afk/stegarc-suite"}, "brand": "STEGARC",
        "capabilities": {"streaming": False, "pushNotifications": False, "stateTransitionHistory": True},
        "defaultInputModes": ["text/plain"], "defaultOutputModes": ["text/plain", "application/json"],
        "skills": [{"id": t["name"], "name": t["name"].replace("_", " "), "description": t["description"], "tags": ["experience-layer", "read-only"], "examples": ex}
                   for t, ex in zip(layer_tools, [["Was muss ich heute freigeben?"], ["Suche Monitor"], ["Zeig mir sap:pr:10004711"], ["Was haben die Zugriffe diesen Monat gekostet?"], ["Über welchen Weg läuft eine SAP-Frage?"]])]
                  + [{"id": "engine-analysen", "name": "Engine-Analysen", "description": "Kennzahlen, GuV, Projekte, Nachschub, offene Posten, Prozesse, Fertigung, Migration, Einkauf und Konstruktion aus der STEGARC-Engine.", "tags": ["stegarc-engine", "read-only"], "examples": ["Warum ist unsere operative Marge gesunken?"]}],
        "x-stegarc": {"simulated": True, "costNote": meta["note"], "sapNote": meta["sap"], "actions": "nur nach Klick und Bestätigung eines Menschen, mit Rechteprüfung",
                     "delegates": [{"id": a["id"], "name": a["name"], "system": meta["c"][a["system"]]["name"], "route": a["route"], "simulated": a["simulated"], "skills": a["skills"]} for a in meta["a"]]}
    }
    (out/'agent-card.json').write_text(json.dumps(card, ensure_ascii=False, indent=2) + "\n")
    print(len(tools), "Werkzeuge in mcp-tools.json,", len(card["skills"]), "Fähigkeiten in agent-card.json")
except (OSError, subprocess.CalledProcessError) as e:
    print("Hinweis: agent-card.json nicht erzeugt (Node nicht verfügbar):", e)
