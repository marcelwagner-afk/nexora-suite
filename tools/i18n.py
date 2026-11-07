"""Übersetzung zur Build-Zeit (DE → EN/ES/PT/PL), ohne externe Abhängigkeiten.

Idee: Der Quelltext bleibt deutsch. Beim Build werden alle sichtbaren Texte in
JS-Strings, Template-Literalen und HTML-Textknoten über ein Wörterbuch
(i18n/<sprache>.json, Schlüssel = deutscher Text) ersetzt. Platzhalter {0},{1}…
stehen für ${…}-Ausdrücke in Template-Literalen. Fehlt eine Übersetzung, bleibt
der deutsche Text stehen (der Build meldet die Abdeckung).
"""
import json, re, pathlib

LANGS = {"en": "English", "es": "Español", "pt": "Português", "pl": "Polski"}
LOCALE = {"de": "de-DE", "en": "en-GB", "es": "es-ES", "pt": "pt-PT", "pl": "pl-PL"}
MONTHS_DE = '["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]'
MONTHS = {"de": ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
          "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
          "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
          "pt": ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"],
          "pl": ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]}
ROOT = pathlib.Path(__file__).resolve().parent.parent
I18N = ROOT / "i18n"

# ---------------------------------------------------------------- JS-Lexer
KW_BEFORE_REGEX = {"return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"}

def lex(src, i=0, stop_brace=False):
    """Zerlegt JS in Teile: ("c", code) | ("s", quote, raw) | ("t", [raw, expr, raw, expr, …]).
    Bei stop_brace endet das Lexen an der schließenden } auf Tiefe 0 (für ${…}). Gibt (teile, ende) zurück."""
    out = []; buf = []; n = len(src); depth = 0; last = ""  # last: letztes signifikantes Zeichen/Wort
    def flush():
        if buf: out.append(("c", "".join(buf))); buf.clear()
    while i < n:
        c = src[i]
        if c in "\"'":
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == "\\": j += 1
                elif src[j] == "\n": break
                j += 1
            flush(); out.append(("s", c, src[i + 1:j])); i = j + 1; last = "x"; continue
        if c == "`":
            parts = []; j = i + 1; seg = []
            while j < n and src[j] != "`":
                if src[j] == "\\": seg.append(src[j:j + 2]); j += 2; continue
                if src[j] == "$" and j + 1 < n and src[j + 1] == "{":
                    parts.append("".join(seg)); seg = []
                    sub, k = lex(src, j + 2, stop_brace=True)
                    parts.append(sub); j = k + 1; continue
                seg.append(src[j]); j += 1
            parts.append("".join(seg)); flush(); out.append(("t", parts)); i = j + 1; last = "x"; continue
        if c == "/" and i + 1 < n and src[i + 1] == "/":
            j = src.find("\n", i); j = n if j < 0 else j
            buf.append(src[i:j]); i = j; continue
        if c == "/" and i + 1 < n and src[i + 1] == "*":
            j = src.find("*/", i + 2); j = n if j < 0 else j + 2
            buf.append(src[i:j]); i = j; continue
        if c == "/":
            word = re.search(r"([A-Za-z_$][\w$]*)\s*$", "".join(buf[-40:]))
            is_re = last in ("", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^") or (last == "w" and word and word.group(1) in KW_BEFORE_REGEX)
            if is_re:
                j = i + 1; cls = False
                while j < n:
                    if src[j] == "\\": j += 2; continue
                    if src[j] == "[": cls = True
                    elif src[j] == "]": cls = False
                    elif src[j] == "/" and not cls: break
                    elif src[j] == "\n": break
                    j += 1
                j += 1
                while j < n and (src[j].isalpha()): j += 1
                buf.append(src[i:j]); i = j; last = "x"; continue
            buf.append(c); i += 1; last = "/"; continue
        if stop_brace:
            if c == "{": depth += 1
            elif c == "}":
                if depth == 0: flush(); return out, i
                depth -= 1
        buf.append(c)
        if not c.isspace():
            if c.isalnum() or c in "_$": last = "w" if not c.isdigit() or last == "w" else "x"
            elif c in ")]": last = "x"
            else: last = c
        i += 1
    flush(); return out, i

# ---------------------------------------------------------------- Texterkennung
CONNECTORS = {"aus", "von", "für", "am", "bis", "und", "oder", "mit", "bei", "nach", "seit", "je", "pro"}
CODEY = re.compile(r"^[\w$.\-/#:>\[\]=*+,()%!?@^~|&\"' ]*$")
def is_text(s):
    t = s.strip()
    if len(t) < 2 or not re.search(r"[A-Za-zÄÖÜäöüß]{2}", t): return False
    if re.match(r"^(https?:|mailto:|data:|#|\.|/|var\(|rgba?\(|M\d)", t): return False
    if re.search(r"[äöüÄÖÜß€–·…„“]", t): return True
    if re.fullmatch(r"[a-z0-9_$\-.:/]+", t): return False           # ids, Klassen, Pfade
    if re.fullmatch(r"[A-Z0-9_\-./]+", t): return False             # Kürzel, Konstanten
    if re.fullmatch(r"[a-z]+[A-Z]\w*", t): return False             # camelCase
    if re.search(r"[a-z-]+\s*:\s*[^;]+;", t) and not re.search(r"[A-Za-z]{3,} [a-z]{3,} [a-z]{3,}", t): return False  # CSS
    if re.fullmatch(r"[\w\-]+(\s+[\w\-]+)*", t) and all(re.fullmatch(r"[a-z0-9\-_]+", w) for w in t.split()) and len(t.split()) <= 3: return False  # "btn sm pri"
    if " " in t or re.fullmatch(r"[A-ZÄÖÜ][a-zäöüß]{2,}\w*[.:!?]?", t): return True
    if re.fullmatch(r"[A-ZÄÖÜ][A-Za-z0-9ÄÖÜäöüß/&.]*(-[A-Za-zÄÖÜäöüß0-9]+)+[.:!?]?", t) and re.search(r"[a-zäöüß]{3}", t): return True  # "IT-Infrastruktur", "Go-live"
    return False

# ---------------------------------------------------------------- HTML-Fragmente
TAG = re.compile(r"(<!--.*?-->|<[A-Za-z/!][^<>]*>)", re.S)
ATTR = re.compile(r'(\b(?:title|placeholder|aria-label|alt|label|data-tip|content)=)("([^"]*)"|\'([^\']*)\')')
PH = re.compile(r"\x00(\d+)\x00")

class Tr:
    def __init__(self, lang, table=None, collect=None):
        self.lang = lang; self.table = table or {}; self.collect = collect; self.hit = 0; self.miss = 0
    def unit(self, s):
        """Übersetzt eine Texteinheit (mit \x00n\x00-Platzhaltern), Rand-Leerraum bleibt."""
        m = re.match(r"^(\s*)(.*?)(\s*)$", s, re.S); pre, core, post = m.groups()
        frag = core in CONNECTORS and (pre or post)  # Satzbausteine wie " aus ", "von " (nur mit Leerzeichen, sonst oft Statuswerte)
        if not frag and not is_text(PH.sub("x", core)) and not (PH.search(core) and is_text(PH.sub("", core))): return s
        ids = PH.findall(core); key = core
        for k, v in enumerate(ids): key = key.replace(f"\x00{v}\x00", "{" + str(k) + "}", 1)
        if self.collect is not None: self.collect.setdefault(key, None)
        val = self.table.get(key)
        if not val: self.miss += 1; return s
        self.hit += 1
        for k, v in enumerate(ids): val = val.replace("{" + str(k) + "}", f"\x00{v}\x00")
        return pre + val + post
    def html(self, s):
        if "<" not in s or not TAG.search(s): return self.unit(s)
        parts = TAG.split(s); res = []
        for k, p in enumerate(parts):
            if k % 2:
                if p.startswith("<!--"): res.append(p); continue
                res.append(ATTR.sub(lambda m: m.group(1) + '"' + self.unit(m.group(3) if m.group(3) is not None else m.group(4)).replace('"', "&quot;") + '"', p))
            else: res.append(self.unit(p))
        return "".join(res)
    # ------------------------------------------------ JS
    def js(self, src):
        parts, _ = lex(src); return self.emit(parts)
    def emit(self, parts):
        o = []
        for p in parts:
            if p[0] == "c": o.append(p[1])
            elif p[0] == "s": o.append(p[1] + self.jsstr(p[2], p[1]) + p[1])
            else: o.append("`" + self.tpl(p[1]) + "`")
        return "".join(o)
    def jsstr(self, raw, q):
        if "\\" in raw and re.search(r"\\[^\\\"'n]", raw): return raw   # exotische Escapes: unverändert
        val = raw.replace("\\n", "\n").replace("\\" + q, q).replace("\\\\", "\\")
        new = self.html(val)
        if new == val: return raw
        return new.replace("\\", "\\\\").replace(q, "\\" + q).replace("\n", "\\n")
    def tpl(self, parts):
        exprs = [self.emit(p) for p in parts[1::2]]
        marked = "".join(parts[0::2][k] + (f"\x00{k}\x00" if k < len(exprs) else "") for k in range(len(parts[0::2])))
        new = self.html(marked)
        return PH.sub(lambda m: "${" + exprs[int(m.group(1))] + "}", new)
    # ------------------------------------------------ HTML-Dokument
    def doc(self, src):
        out = []; pos = 0
        for m in re.finditer(r"(<script\b[^>]*>)(.*?)(</script>)|(<style\b[^>]*>.*?</style>)", src, re.S):
            out.append(self.html(src[pos:m.start()]))
            if m.group(4): out.append(m.group(4))
            else:
                body = m.group(2)
                if 'type="application/ld+json"' in m.group(1): body = self.ld(body)
                elif "/*NOI18N*/" not in body: body = self.js(body)
                out.append(m.group(1) + body + m.group(3))
            pos = m.end()
        out.append(self.html(src[pos:])); return "".join(out)
    def ld(self, body):
        try: data = json.loads(body)
        except ValueError: return body
        def walk(x):
            if isinstance(x, dict): return {k: (walk(v) if k not in ("@type", "@context", "url", "contentUrl", "thumbnailUrl", "embedUrl", "uploadDate", "duration", "inLanguage") else v) for k, v in x.items()}
            if isinstance(x, list): return [walk(v) for v in x]
            if isinstance(x, str): return self.unit(x)
            return x
        new = walk(data)
        return body if new == data else json.dumps(new, ensure_ascii=False, indent=1)

def table(lang):
    f = I18N / f"{lang}.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}

def localize(text, lang, kind="js", stats=None):
    """kind: js | doc | html. Ersetzt außerdem de-DE durch das Gebietsschema der Sprache."""
    tr = Tr(lang, table(lang))
    res = {"js": tr.js, "doc": tr.doc, "html": tr.html}[kind](text)
    res = res.replace(MONTHS_DE, json.dumps(MONTHS[lang], ensure_ascii=False).replace('","', '", "'))
    res = res.replace('"de-DE"', '"' + LOCALE[lang] + '"').replace("'de-DE'", "'" + LOCALE[lang] + "'")
    if stats is not None: stats[0] += tr.hit; stats[1] += tr.miss
    return res

def collect(text, kind="js"):
    keys = {}; tr = Tr("de", {}, keys); {"js": tr.js, "doc": tr.doc, "html": tr.html}[kind](text); return list(keys)

def links(t, lang):
    """Seitenübergreifende Links zeigen in der Übersetzung auf dieselbe Sprache (stegarc.html → stegarc.en.html, index.html → index.html?lang=en)."""
    if lang == "de": return t
    t = re.sub(r'(?<=[/"\'])(stegarc|prototyp)\.html', r'\1.' + lang + '.html', t)
    t = re.sub(r'(?<=[/"\'])index\.html\?', 'index.html?lang=' + lang + '&', t)
    return re.sub(r'(?<=[/"\'])index\.html(?=["\'#])', 'index.html?lang=' + lang, t)
