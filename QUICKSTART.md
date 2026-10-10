# JobPilot quick start

The source includes the v0.20.4 release candidate. Read STATE.md for what is actually live.

1. Run `npm test`, then `node scripts/build.mjs dist`.
2. Upload `dist/jobpilot-dist-v0.20.4.zip` to the existing **jobpilotgcc** Netlify site. Keep the same origin so existing browser data stays available.
3. Sign in with the existing authorized account and password. There is no public sign-up. Email-link login is disabled pending setup.
4. Discover: swipe right to **Selected**, left to **Archived**. Undo is available. Choices sync after confirmation; swiping does not tailor a CV.
5. On desktop, open Selected → Review & tailor CV. Import a Master CV if this device has none. Keep factual claims unchanged.
6. Use Settings → Export backup regularly. CVs and application history remain in the browser; discovery choices are the synced part.

If no new jobs appear, check the latest daily run and actual API receipt. A connection test is not a researched shortlist. The local daily task requires the computer and Codex to be available at 9 am Dubai. Accenture and Halian are excluded going forward.

See README.md for development, deployment, recovery and security details.
