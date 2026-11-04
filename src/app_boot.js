/* ---------- Start ---------- */
boot(); adoptAccounts(); render(); startBackend();
if (!(window.claude && window.claude.use)) resolveOwner().then(() => { adoptAccounts(); render(); });
