/* ===== v0.9.10 Filme (16:9) – Spieler als eigene Ebene außerhalb von #root, damit Neuzeichnen die Wiedergabe nicht abbricht ===== */
const VIDEOS = {
  imagespot: { title: "STEGARC in 60 Sekunden", file: "stegarc-imagespot", dur: "1:00" },
  "experience-layer": { title: "Experience Layer: eine Oberfläche für alle Systeme", file: "stegarc-experience-layer", dur: "0:58" },
  "pe-command-center": { title: "PE Command Center: jedes Unternehmen, eine Sicht", file: "stegarc-pe-command-center", dur: "0:53" },
  "it-infrastruktur": { title: "IT-Infrastruktur und Sizing", file: "stegarc-it-infrastruktur", dur: "0:36" }
};
// Filme sind ausgeblendet, bis die STEGARC-Fassungen produziert sind; build.py setzt den Schalter (FILMS)
let FILMS_ON = /*FILMS_ON*/false;
const VID_NOTE = "Demo mit synthetischen Daten · Film auf Englisch mit Untertiteln";
// Pfad: GitHub Pages und Artifact liefern media/ neben der Seite, die gebaute Datei unter dist/ liegt eine Ebene tiefer
const VID_BASE = /\/dist\/[^/]*$/.test(location.pathname) ? "../media/" : "media/";
const vidChip = id => { const v = FILMS_ON && VIDEOS[id]; return v ? `<button class="vid-chip" data-act="vidPlay" data-v="${id}" aria-label="Film abspielen: ${esc(v.title)}"><span class="vid-thumb" style="background-image:url('${VID_BASE}${v.file}.jpg')"><i>▶</i></span><span><b>Film ansehen</b><small>${esc(v.title)} · ${v.dur}</small></span></button>` : ""; };
function vidClose() { const o = document.getElementById("vidOverlay"); if (!o) return; const vd = o.querySelector("video"); if (vd) { try { vd.pause(); } catch (e) {} } o.remove(); document.removeEventListener("keydown", vidKey); if (vidClose.back && vidClose.back.focus) vidClose.back.focus(); }
function vidKey(e) { if (e.key === "Escape") vidClose(); }
ACT.vidPlay = (d, el) => { vidClose(); const v = FILMS_ON && VIDEOS[d.v]; if (!v) return; vidClose.back = el || null;
  const o = document.createElement("div"); o.id = "vidOverlay"; o.className = "vid-overlay"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", v.title);
  o.innerHTML = `<div class="vid-box"><div class="vid-head"><b>${esc(v.title)}</b><button class="icon-btn" data-vid-close aria-label="Film schließen">✕</button></div><video controls autoplay playsinline preload="metadata" poster="${VID_BASE}${v.file}.jpg"><source src="${VID_BASE}${VID_LOCAL[v.file] ? v.file + "." + LANG : v.file}.mp4" type="video/mp4">${vidTracks(v.file)}</video><p class="small faint">${esc(VID_NOTE)}</p></div>`;
  o.addEventListener("click", e => { if (e.target === o || e.target.closest("[data-vid-close]")) vidClose(); }); document.body.appendChild(o); document.addEventListener("keydown", vidKey); o.querySelector("[data-vid-close]").focus(); };
// Untertitel je Sprache (WebVTT neben den Filmen; Englisch ist eingebrannt). In der Seitensprache vorausgewählt (außer Deutsch, wie bisher), außer der Film liegt schon in dieser Sprache vor
const vidTracks = f => LANG_LIST.filter(([k]) => k !== "en").map(([k, n]) => `<track kind="subtitles" srclang="${k}" label="${n}" src="${VID_BASE}${f}.${k}.vtt"${k === LANG && k !== "de" && !VID_LOCAL[f] ? " default" : ""}>`).join("");
/* Einbau: Film-Knopf direkt unter der Seitenüberschrift */
const vidAfterH1 = (html, id) => { const i = html.indexOf("</h1>"); return i < 0 ? vidChip(id) + html : html.slice(0, i + 5) + vidChip(id) + html.slice(i + 5); };
for (const [route, pick] of [["home", () => S.layer === "layer" ? "experience-layer" : "imagespot"], ["systems", () => "experience-layer"], ["pe", () => "pe-command-center"], ["infra", () => "it-infrastruktur"], ["pe-infra", () => "it-infrastruktur"]]) {
  const orig = VIEWS[route]; if (orig) VIEWS[route] = () => vidAfterH1(orig(), pick());
}
