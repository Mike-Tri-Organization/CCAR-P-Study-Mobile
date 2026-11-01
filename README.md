# CCAR-P Study — Mobile (PWA)

Android/phone version of the CCAR-P Study desktop app. A static, offline-capable web app: no build step, no dependencies. It uses the same `data/*.json` content as the WPF app.

Screens: Dashboard · Study plan · Domains · Practice · Mock exam (timed) · 10 Labs (7 run against the real Claude API) · Case study · Settings. Four themes plus Auto (follows the phone's dark mode).

## Run locally

```bash
python -m http.server 8080
```
Open http://localhost:8080. (Service workers need `http://localhost` or HTTPS.)

## Install on your Android phone

1. Host the folder over HTTPS (GitHub Pages, Netlify, Cloudflare Pages — any static host).
2. Open the URL in Chrome on the phone.
3. Chrome menu → **Install app** / **Add to Home screen**.
4. Open it once online; after that it works offline (labs still need a connection).

To update: change files, bump `VERSION` in `sw.js`, redeploy. The service worker is network-first, so new files load as soon as you are online.

## Claude API key (for the labs)

Settings → paste your key → **Save & test connection**. The key is stored in this browser only (localStorage) and sent only to `api.anthropic.com`, directly from the phone. Use a key with a low spend limit.

## Your data

Progress, plan ticks, case notes and settings live in the browser's localStorage on that device. **Settings → Export** saves a JSON backup; **Import** restores it (also works to move progress between browsers). Clearing site data erases progress — export first.

Content updates: edit `data/questions.json` etc. (same format as the desktop app; `answer` holds zero-based option indexes).

## Files

| Path | Purpose |
|---|---|
| `index.html`, `styles.css` | Shell and themes |
| `js/app.js` | Router, bottom navigation, theme |
| `js/store.js` | Data loading, progress, statistics |
| `js/quiz.js` | Practice and mock exam |
| `js/views.js` | Dashboard, plan, domains, labs, case, settings |
| `js/labs.js`, `js/claude.js` | Lab runner and Claude API client (ports of `LabRunner.cs`, `ClaudeClient.cs`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline + installability |
| `data/` | Questions, plan, domains, labs, case study, Python lab files |
