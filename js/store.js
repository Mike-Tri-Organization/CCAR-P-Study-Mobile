// Data loading, persisted progress (localStorage) and study statistics.
import { getLang } from './i18n.js';

const API_KEY = 'ccarp.apikey';
const SETTINGS_KEY = 'ccarp.settings.v1';   // theme, language, models… shared by every certification
const CERT_KEY = 'ccarp.cert';
// CCAR-P keeps its original key so existing progress survives the move to multiple certifications.
const progressKey = (id) => (id === 'ccarp' ? 'ccarp.progress.v1' : `${id}.progress.v1`);

export const DEFAULT_SETTINGS = {
  theme: 'auto',
  fontSize: 'normal',
  lang: 'auto',
  questionsEnglish: false,
  modelFast: 'claude-haiku-5-5',
  modelBalanced: 'claude-sonnet-5-5',
  modelTop: 'claude-opus-5-5',
  priceFastIn: 1, priceFastOut: 5,
  priceBalancedIn: 3, priceBalancedOut: 15,
  priceTopIn: 5, priceTopOut: 25,
};

export const store = {
  certs: [], cert: null,
  domains: [], questions: [], plan: { weeks: [] }, labs: [], caseStudy: {},
  progress: null,
};

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

// English originals and per-language overlays. Overlays hold only translated fields, keyed by id.
const original = {};
const overlays = {};

const json = (path) => fetch('data/' + path).then((r) => {
  if (!r.ok) throw new Error('Cannot load data/' + path);
  return r.json();
});
// Translation overlays are optional: a missing file just means English is shown.
const overlay = (id, lang, f) => fetch(`data/${id}/${lang}/${f}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

export async function loadData() {
  store.certs = await json('certs.json');
  const saved = get(CERT_KEY);
  await loadCert(store.certs.some((c) => c.id === saved) ? saved : store.certs[0].id);
}

/** Load one certification's content and its own progress. */
export async function loadCert(id) {
  const cert = store.certs.find((c) => c.id === id);
  if (!cert) throw new Error('Unknown certification: ' + id);
  const F = cert.features;
  const opt = (on, f, fallback) => (on ? json(`${id}/${f}`) : Promise.resolve(fallback));
  const [d, q, p, l, c] = await Promise.all([
    json(`${id}/domains.json`), json(`${id}/questions.json`),
    opt(F.plan, 'plan.json', { weeks: [] }), opt(F.labs, 'labs.json', []), opt(F.case, 'case.json', { decisions: [] }),
  ]);
  original.domains = d.sort((a, b) => a.number - b.number);
  original.questions = q;
  original.plan = p;
  original.labs = l;
  original.caseStudy = c;
  const names = ['domains', 'questions', 'plan', 'labs', 'case'];
  const has = (lang) => (cert.overlays || []).includes(lang);
  const [vd, vq, vp, vl, vc] = await Promise.all(names.map((f) => (has('vi') ? overlay(id, 'vi', f + '.json') : {})));
  overlays.vi = { domains: vd, questions: vq, plan: vp, labs: vl, caseStudy: vc };
  store.cert = cert;
  set(CERT_KEY, id);
  store.progress = normalize(parse(get(progressKey(id))));
  applyContentLang();
}

/** Short summary of saved progress for a certification, for the picker (reads storage only). */
export function certSummary(id) {
  const p = parse(get(progressKey(id)));
  const entries = Object.values(p?.questions || {});
  const answered = entries.length;
  const right = entries.filter((e) => e.lastCorrect).length;
  return { answered, right, mocks: (p?.mocks || []).length };
}

const pick = (target, src, fields) => {
  if (!src) return target;
  for (const f of fields) if (src[f] !== undefined) target[f] = src[f];
  return target;
};

/** Rebuild store content from the English originals plus the overlay for the current language. */
export function applyContentLang() {
  if (!original.domains) return;
  const lang = getLang();
  const ov = overlays[lang] || { domains: {}, questions: {}, plan: {}, labs: {}, caseStudy: {} };
  const clone = (x) => structuredClone(x);
  const S = store.progress?.settings;

  store.domains = clone(original.domains).map((d) => pick(d, ov.domains[d.id], ['name', 'summary', 'keyIdeas', 'traps']));
  store.questions = clone(original.questions).map((q) =>
    S?.questionsEnglish ? q : pick(q, ov.questions[q.id], ['stem', 'options', 'explanation', 'trap']));
  store.labs = clone(original.labs).map((l) => pick(l, ov.labs[l.id], ['title', 'goal', 'concept', 'takeaways']));

  const p = clone(original.plan), op = ov.plan || {};
  if (op.summary) p.summary = op.summary;
  for (const w of p.weeks || []) {
    pick(w, op.weeks?.[w.number], ['title', 'dates', 'goal']);
    for (const t of w.tasks) if (op.tasks?.[t.id]) t.text = op.tasks[t.id];
  }
  store.plan = p;

  const c = clone(original.caseStudy), oc = ov.caseStudy || {};
  pick(c, oc, ['tagline', 'background', 'facts', 'constraints']);
  for (const dec of c.decisions || []) pick(dec, oc.decisions?.[dec.id], ['title', 'situation', 'prompt', 'modelAnswer']);
  store.caseStudy = c;
}

function parse(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

function normalize(p) {
  p = p && typeof p === 'object' ? p : {};
  p.questions ||= {};
  p.planDone ||= [];
  p.mocks ||= [];
  p.caseNotes ||= {};
  p.caseNotesAt ||= {};   // ISO time of the last edit of each note, used when merging devices
  p.updatedAt ||= '';
  p.labsRun ||= [];
  // Settings are shared by all certifications. The first run after an upgrade adopts the CCAR-P ones.
  const shared = parse(get(SETTINGS_KEY)) || parse(get(progressKey('ccarp')))?.settings || p.settings || {};
  p.settings = { ...DEFAULT_SETTINGS, ...shared };
  return p;
}

export const settings = () => store.progress.settings;
export const save = () => {
  store.progress.updatedAt = new Date().toISOString();
  set(SETTINGS_KEY, JSON.stringify(store.progress.settings));
  return set(progressKey(store.cert.id), JSON.stringify(store.progress));
};

/** Save a case-study note and remember when it was edited (so a newer edit on another device can win). */
export function setCaseNote(id, text) {
  const p = store.progress;
  if ((p.caseNotes[id] || '') === text) return;
  p.caseNotes[id] = text;
  p.caseNotesAt[id] = new Date().toISOString();
  save();
}

export function getApiKey() { return get(API_KEY) || ''; }
export function setApiKey(k) {
  try { k ? localStorage.setItem(API_KEY, k.trim()) : localStorage.removeItem(API_KEY); } catch { /* ignore */ }
}

export function exportProgress() { return JSON.stringify(store.progress, null, 2); }
export function importProgress(text) {
  const p = JSON.parse(text);
  if (!p || typeof p !== 'object' || !p.questions) throw new Error('Not a progress file.');
  store.progress = normalize(p);
  save();
}
export function resetProgress() {
  store.progress = normalize(null);
  save();
}

// ---------- stats ----------

export const domainById = (id) => store.domains.find((d) => d.id === id);

export function record(q, correct) {
  const qs = store.progress.questions;
  const st = qs[q.id] || (qs[q.id] = { attempts: 0, correct: 0, lastCorrect: false, lastSeen: '' });
  st.attempts++;
  if (correct) st.correct++;
  st.lastCorrect = correct;
  st.lastSeen = new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export const isMissed = (q) => { const s = store.progress.questions[q.id]; return !!s && !s.lastCorrect; };
export const isUnseen = (q) => !store.progress.questions[q.id];

export function domainStats(id) {
  let attempts = 0, correct = 0, seen = 0, total = 0;
  for (const q of store.questions) {
    if (q.domain !== id) continue;
    total++;
    const st = store.progress.questions[q.id];
    if (st && st.attempts > 0) { seen++; attempts += st.attempts; correct += st.correct; }
  }
  return { attempts, correct, seen, total };
}

export function domainAccuracy(id) {
  const seen = store.questions.filter((q) => q.domain === id && store.progress.questions[q.id]);
  if (!seen.length) return null;
  return seen.filter((q) => store.progress.questions[q.id].lastCorrect).length / seen.length;
}

export function readiness() {
  let sum = 0, w = 0;
  for (const d of store.domains) {
    const a = domainAccuracy(d.id);
    if (a == null) continue;
    sum += a * d.weight; w += d.weight;
  }
  return w ? sum / w : null;
}

export const shuffle = (n) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const shuffled = (arr) => shuffle(arr.length).map((i) => arr[i]);

export const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
