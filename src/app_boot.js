/* ---------- Start ---------- */
boot(); adoptAccounts(); render(); startBackend();
(function () { try { const sid = new URLSearchParams(location.search).get("story"); if (sid && STORIES.some(s => s.id === sid)) ACT.startStory({ id: sid, reset: 1 }); } catch (e) {} })();
if (!(window.claude && window.claude.use)) resolveOwner().then(() => { adoptAccounts(); render(); });
