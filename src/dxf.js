/* NEXORA DXF-Leser: liest ASCII-DXF (R12 bis aktuelle Versionen), Schriftfeld- und Positionsattribute
   sowie Geometrie (LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE/VERTEX, TEXT, MTEXT).
   Ergebnis: normalisierte Zeichnung für die Engine + Geometrie für die Anzeige. Keine Abhängigkeiten. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.NexoraDXF = factory(); })(typeof self !== "undefined" ? self : this, function () {
  function pairs(text) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n"); const out = [];
    for (let i = 0; i + 1 < lines.length; i += 2) { const c = parseInt(lines[i].trim(), 10); if (isNaN(c)) { i--; continue; } out.push([c, lines[i + 1].replace(/\s+$/, "")]); }
    return out;
  }
  function parse(text) {
    const P = pairs(text); if (!P.length || !P.some(p => p[0] === 0 && p[1] === "SECTION")) throw new Error("Keine gültige ASCII-DXF-Datei (Binär-DXF und DWG werden nicht unterstützt – bitte als ASCII-DXF exportieren).");
    let i = 0, section = null; const ents = [], header = {};
    while (i < P.length) {
      const [c, v] = P[i];
      if (c === 0 && v === "SECTION") { section = P[i + 1] && P[i + 1][1]; i += 2; continue; }
      if (c === 0 && v === "ENDSEC") { section = null; i++; continue; }
      if (section === "HEADER" && c === 9) { header[v] = P[i + 1] && P[i + 1][1]; i += 2; continue; }
      if (section === "ENTITIES" && c === 0) { const e = { type: v, g: [] }; i++; while (i < P.length && P[i][0] !== 0) { e.g.push(P[i]); i++; } ents.push(e); continue; }
      i++;
    }
    const num = (e, code, k = 0) => { const f = e.g.filter(p => p[0] === code); return f[k] ? parseFloat(f[k][1]) : undefined; };
    const str = (e, code) => { const f = e.g.find(p => p[0] === code); return f ? f[1] : undefined; };
    const geom = [], texts = [], inserts = []; let poly = null, cur = null;
    for (const e of ents) {
      const layer = str(e, 8) || "0";
      if (e.type === "LINE") geom.push({ t: "line", layer, x1: num(e, 10), y1: num(e, 20), x2: num(e, 11), y2: num(e, 21) });
      else if (e.type === "CIRCLE") geom.push({ t: "circle", layer, x: num(e, 10), y: num(e, 20), r: num(e, 40) });
      else if (e.type === "ARC") geom.push({ t: "arc", layer, x: num(e, 10), y: num(e, 20), r: num(e, 40), a1: num(e, 50), a2: num(e, 51) });
      else if (e.type === "LWPOLYLINE") { const xs = e.g.filter(p => p[0] === 10).map(p => +p[1]), ys = e.g.filter(p => p[0] === 20).map(p => +p[1]); geom.push({ t: "poly", layer, pts: xs.map((x, k) => [x, ys[k]]), closed: ((num(e, 70) || 0) & 1) === 1 }); }
      else if (e.type === "POLYLINE") { poly = { t: "poly", layer, pts: [], closed: ((num(e, 70) || 0) & 1) === 1 }; }
      else if (e.type === "VERTEX" && poly) poly.pts.push([num(e, 10), num(e, 20)]);
      else if (e.type === "SEQEND") { if (poly) { geom.push(poly); poly = null; } if (cur) { inserts.push(cur); cur = null; } }
      else if (e.type === "TEXT" || e.type === "MTEXT") texts.push({ layer, x: num(e, 10), y: num(e, 20), h: num(e, 40) || 2.5, s: (str(e, 1) || "").replace(/\\P/g, " ").replace(/\{\\[^;]*;|\}/g, "") });
      else if (e.type === "INSERT") { const it = { block: str(e, 2), layer, x: num(e, 10), y: num(e, 20), attrs: {} }; if (str(e, 66) === "1") cur = it; else inserts.push(it); }
      else if (e.type === "ATTRIB" && cur) cur.attrs[String(str(e, 2) || "").toUpperCase()] = str(e, 1) || "";
    }
    return { header, geom, texts, inserts };
  }
  const len = g => g.t === "line" ? Math.hypot(g.x2 - g.x1, g.y2 - g.y1) : g.t === "circle" ? 2 * Math.PI * g.r : g.t === "arc" ? g.r * (((g.a2 - g.a1) % 360 + 360) % 360 || 360) * Math.PI / 180 : g.pts.reduce((a, p, k) => k ? a + Math.hypot(p[0] - g.pts[k - 1][0], p[1] - g.pts[k - 1][1]) : 0, 0) + (g.closed && g.pts.length > 2 ? Math.hypot(g.pts[0][0] - g.pts[g.pts.length - 1][0], g.pts[0][1] - g.pts[g.pts.length - 1][1]) : 0);
  const KIND = { BLECHTEIL: "Blechteil", BLECH: "Blechteil", PROFIL: "Profil", NORMTEIL: "Normteil", NORM: "Normteil", ZUKAUFTEIL: "Zukaufteil", KAUFTEIL: "Zukaufteil" };
  /* Normalisierung: Schriftfeld = Block mit Attribut ZEICHNUNGSNR (oder DWGNO/DRAWING_NO); Positionen = Blöcke mit Attribut POS */
  function toDrawing(text, fileName) {
    const d = parse(text); const tb = d.inserts.find(x => x.attrs.ZEICHNUNGSNR || x.attrs.DWGNO || x.attrs.DRAWING_NO) || { attrs: {} }; const a = tb.attrs;
    const warnings = []; const items = [];
    for (const ins of d.inserts.filter(x => x.attrs.POS)) {
      const t = ins.attrs; const kind = KIND[String(t.ART || t.TYPE || "").toUpperCase()] || (t.NORM ? "Normteil" : t.DICKE ? "Blechteil" : "Zukaufteil");
      const layerGeom = d.geom.filter(g => g.layer.toUpperCase() === "POS-" + t.POS);
      const cut = layerGeom.length ? Math.round(layerGeom.reduce((s, g) => s + len(g), 0)) : 0;
      if (kind === "Blechteil" && !layerGeom.length) warnings.push(`Pos. ${t.POS}: keine Abwicklung auf Layer POS-${t.POS} – Schnittlänge wird aus Umfang und Bohrungen geschätzt.`);
      items.push({ pos: t.POS, name: t.BENENNUNG || t.NAME || "", qty: parseFloat(String(t.MENGE || t.QTY || "1").replace(",", ".")), kind, grade: t.WERKSTOFF || t.MATERIAL || null, thickness: t.DICKE ? parseFloat(t.DICKE.replace(",", ".")) : null, length: parseFloat(t.LAENGE || 0) || 0, width: parseFloat(t.BREITE || 0) || 0, section: t.PROFIL || null, norm: t.NORM || null, partNo: t.TEILENR || t.PARTNO || null, bends: parseInt(t.BIEGUNGEN || 0, 10) || 0, holes: parseInt(t.BOHRUNGEN || 0, 10) || 0, holeDia: parseFloat(t.BOHR_D || 0) || 0, threads: parseInt(t.GEWINDE || 0, 10) || 0, miter: parseInt(t.GEHRUNG || 0, 10) || 0, cutLength: cut });
    }
    items.sort((x, y) => parseFloat(x.pos) - parseFloat(y.pos));
    if (!a.ZEICHNUNGSNR && !a.DWGNO && !a.DRAWING_NO) warnings.push("Kein Schriftfeld mit Attribut ZEICHNUNGSNR gefunden.");
    if (!items.length) warnings.push("Keine Positionsnummern mit Stücklistenattributen (Attribut POS) gefunden.");
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; const ext = (x, y) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
    for (const g of d.geom) { if (g.t === "line") { ext(g.x1, g.y1); ext(g.x2, g.y2); } else if (g.t === "poly") g.pts.forEach(p => ext(p[0], p[1])); else { ext(g.x - g.r, g.y - g.r); ext(g.x + g.r, g.y + g.r); } }
    return { drawing: { drawingNo: a.ZEICHNUNGSNR || a.DWGNO || a.DRAWING_NO || "", title: a.BENENNUNG || a.TITLE || "", revision: a.REVISION || a.REV || "A", scale: a.MASSSTAB || null, author: a.ERSTELLT || null, finish: a.OBERFLAECHE || "ohne", weldLength: parseFloat(a.NAHTLAENGE || 0) || 0, weldSize: parseFloat(a.NAHTDICKE || 0) || 4, items, source: "DXF", file: fileName || null }, geometry: { geom: d.geom, texts: d.texts, bbox: [minX, minY, maxX, maxY] }, warnings, units: d.header.$INSUNITS === "4" || !d.header.$INSUNITS ? "mm" : "Einheit " + d.header.$INSUNITS };
  }
  return { parse, toDrawing, length: len };
});
