# Claude Cert Study — Mobile (PWA)

Android/phone study app for four Claude certifications. A static, offline-capable web app: no build step, no dependencies. The CCAR-P content is the same as the WPF desktop app.

| Certification | Content |
|---|---|
| **CCAR-P** Architect – Professional | 7 domains, 56 questions, 10 labs (7 run against the real Claude API), case study, five-week plan |
| **CCAR-F** Architect – Foundations | 5 domains, 51 questions |
| **CCDV-F** Developer – Foundations | 8 domains, 48 questions |
| **CCAO-F** Associate – Foundations | 7 domains, 42 questions |

Pick the certification under **More → Certification** (or the card at the top of the dashboard). Each one keeps its own progress, mock history, backups and export file; theme, language and API key are shared.

**About the Foundations question banks.** The CCAR-F, CCDV-F and CCAO-F questions are original practice questions written for this app. Their domains and topics follow the public outlines of the study sites, but the questions are not copied from them or from the real exams. Domain weights for these three are approximate study weights and the mock exam runs at a practice pace, so check each official exam guide for the real format. They are English only; the UI is still translated.

Screens: Dashboard · Domains · Practice · Mock exam (timed) · and, for CCAR-P only, Study plan · Labs · Case study · Settings. Four themes plus Auto (follows the phone's dark mode). Languages: English and Vietnamese (Tiếng Việt).

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

## Languages

Settings → Language: Auto (follows the phone), English or Tiếng Việt. Vietnamese covers the whole UI and all content (questions, explanations, domains, plan, labs, case study). Prompts sent to Claude in the labs stay in English. Because the real exam is in English, **Show practice and mock questions in English** switches the questions back while keeping the Vietnamese interface.

Adding a language: copy `js/lang/vi.js` (UI strings, English text is the key) and `data/<cert>/vi/*.json` (translated fields keyed by id; any missing entry falls back to English), then register it in `js/i18n.js` and `js/store.js`.

## Your data

Progress, plan ticks, case notes and settings live in the browser's localStorage on that device. **Settings → Export** saves a JSON backup; **Import** restores it (also works to move progress between browsers). Clearing site data erases progress — export first.

Content updates: edit `data/<cert>/questions.json` etc. (same format as the desktop app; `answer` holds zero-based option indexes).

## Files

| Path | Purpose |
|---|---|
| `index.html`, `styles.css` | Shell and themes |
| `js/app.js` | Router, bottom navigation (per-certification), theme, language |
| `js/i18n.js`, `js/lang/` | UI translations (`t()`), language detection |
| `js/store.js` | Certification loading, per-certification progress, statistics |
| `js/merge.js` | Pure rules for merging two progress copies (used for cross-device sync) |
| `js/quiz.js` | Practice and mock exam |
| `js/views.js` | Dashboard, certification picker, plan, domains, labs, case, settings |
| `js/labs.js`, `js/claude.js` | Lab runner and Claude API client (ports of `LabRunner.cs`, `ClaudeClient.cs`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline + installability |
| `data/certs.json` | Registry of certifications: names, feature flags (`plan`, `labs`, `case`), exam pacing, translation overlays |
| `data/<cert>/` | `domains.json` and `questions.json` for every certification; CCAR-P also has `plan.json`, `labs.json`, `case.json`, `labs/` (Python lab files) |
| `data/<cert>/vi/` | Vietnamese translations of the content, keyed by id (CCAR-P only so far) |
| `tests/data.test.mjs` | Checks every question, domain and feature flag |

### Adding a certification

1. Create `data/<id>/domains.json` (weights sum to 100, at most 8 domains) and `data/<id>/questions.json` (`answer` holds zero-based option indexes).
2. Add an entry to `data/certs.json`. Set `features` to `false` for screens you have no data for, and list translation folders under `overlays`.
3. Add the two files to `SHELL` in `sw.js` and bump `VERSION`.
4. Run `node --test tests/*.test.mjs`.

## Syncing progress between devices (work in progress)

Progress lives in this browser (`localStorage`) and in the Windows app (`progress.json`); both use the same JSON shape. `js/merge.js` defines how two copies are merged, and the Windows app implements the same rules in `ProgressMerge.cs`:

| Data | Rule |
|---|---|
| Questions | Per question, the record with more attempts wins; tie → later `lastSeen`, then more correct |
| Plan ticks, labs run | Union (a tick removed on one device can come back after a merge) |
| Mock results | Union, de-duplicated |
| Case notes | The note with the later `caseNotesAt` wins; an emptied note deletes it |
| Settings, API key | Never merged; stay on each device |

Run the tests with `node --test tests/*.test.mjs`. `tests/merge-cases.json` is shared with the Windows repo (keep both copies identical). Signing in with Google and storing the file in Drive is the next step and is not implemented yet.
