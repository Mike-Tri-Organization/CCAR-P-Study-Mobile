// Data loading, persisted progress (localStorage) and study statistics.
import { getLang } from './i18n.js';

const KEY = 'ccarp.progress.v1';
const API_KEY = 'ccarp.apikey';

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
  domains: [], questions: [], plan: {}, labs: [], caseStudy: {},
  progress: null,
};

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

// English originals and per-language overlays. Overlays hold only translated fields, keyed by id.
const original = {};
const overlays = {};

export async function loadData() {
  const j = (f) => fetch('data/' + f).then((r) => {
    if (!r.ok) throw new Error('Cannot load data/' + f);
    return r.json();
  });
  const [d, q, p, l, c] = await Promise.all([
    j('domains.json'), j('questions.json'), j('plan.json'), j('labs.json'), j('case.json'),
  ]);
  original.domains = d.sort((a, b) => a.number - b.number);
  original.questions = q;
  original.plan = p;
  original.labs = l;
  original.caseStudy = c;
  // Translation overlays are optional: a missing file just means English is shown.
  const o = (lang, f) => fetch(`data/${lang}/${f}`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const [vd, vq, vp, vl, vc] = await Promise.all(['domains', 'questions', 'plan', 'labs', 'case'].map((f) => o('vi', f + '.json')));
  overlays.vi = { domains: vd, questions: vq, plan: vp, labs: vl, caseStudy: vc };
  store.progress = normalize(parse(get(KEY)));
  applyContentLang();
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
  for (const w of p.weeks) {
    pick(w, op.weeks?.[w.number], ['title', 'dates', 'goal']);
    for (const t of w.tasks) if (op.tasks?.[t.id]) t.text = op.tasks[t.id];
  }
  store.plan = p;

  const c = clone(original.caseStudy), oc = ov.caseStudy || {};
  pick(c, oc, ['tagline', 'background', 'facts', 'constraints']);
  for (const dec of c.decisions) pick(dec, oc.decisions?.[dec.id], ['title', 'situation', 'prompt', 'modelAnswer']);
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
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}) };
  return p;
}

export const settings = () => store.progress.settings;
export const save = () => {
  store.progress.updatedAt = new Date().toISOString();
  return set(KEY, JSON.stringify(store.progress));
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
  if (!p || typeof p !== 'object' || !p.questions) throw new Error('Not a CCAR-P progress file.');
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
