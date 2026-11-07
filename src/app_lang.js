/* ===== v0.11 Sprachen – Umschalter oben rechts; die Übersetzung selbst entsteht beim Build (tools/i18n.py) ===== */
const LANG_LIST = [["de", "Deutsch"], ["en", "English"], ["es", "Español"], ["pt", "Português"], ["pl", "Polski"]];
const LANG = /*LANG*/"de";
// Filme in Landessprache, sobald es sie gibt (build.py trägt vorhandene media/<film>.<sprache>.mp4 ein)
const VID_LOCAL = /*VID_LOCAL*/{};
function setLang(l) {
  if (!LANG_LIST.some(x => x[0] === l) || l === LANG) return;
  try { localStorage.setItem("stegarc.lang", l); } catch (e) {}
  try { window.name = "stegarc.lang=" + l; } catch (e) {}
  try { const u = new URL(location.href); u.searchParams.set("lang", l); history.replaceState(null, "", u.toString()); } catch (e) {}
  location.reload();
}
const _topExtrasL = topExtras;
topExtras = function () {
  return `<label class="lang-sw" title="Sprache"><span class="sr-only">Sprache</span><select aria-label="Sprache">${LANG_LIST.map(([k, n]) => `<option value="${k}"${k === LANG ? " selected" : ""}>${k.toUpperCase()} · ${n}</option>`).join("")}</select></label>` + _topExtrasL();
};
document.addEventListener("change", e => { const s = e.target.closest && e.target.closest(".lang-sw select"); if (s) setLang(s.value); });
try { document.documentElement.lang = LANG; } catch (e) {}
