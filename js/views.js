// Dashboard, study plan, domains, labs, case study and settings.
import {
  store, save, settings, DEFAULT_SETTINGS, domainById, domainStats, domainAccuracy, readiness,
  getApiKey, setApiKey, exportProgress, importProgress, resetProgress, setCaseNote,
} from './store.js';
import { h, mount, pct, ring, bars, bullets, chips, toast, download } from './ui.js';
import * as C from './claude.js';
import { LANGS, locale, t as T } from './i18n.js';
import { runLab } from './labs.js';

export const FONT_SIZES = [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large'], ['xlarge', 'Extra large']];
export const THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark'], ['sepia-light', 'Sepia'], ['sepia-dark', 'Sepia dark']];

const today = () => new Date().toLocaleDateString('en-CA');
const daysUntil = (iso) => Math.ceil((new Date(iso + 'T23:59:59') - new Date()) / 86400000);

export function linkToHash(link) {
  if (!link) return null;
  const [k, arg] = link.split(':');
  const route = k === 'lab' ? 'labs' : k;
  return '#/' + route + (arg ? '/' + arg : '');
}

const dot = (id) => {
  const i = store.domains.findIndex((d) => d.id === id);
  return h('span', { class: 'dot', style: `background:var(--hue${i >= 0 ? i % 8 : 6})` });
};

// ======================================================================== dashboard

export function dashboard(root) {
  const p = store.progress;
  const left = daysUntil(store.plan.examTarget);
  const r = readiness();
  const tasks = store.plan.weeks.flatMap((w) => w.tasks);
  const due = tasks.filter((t) => !p.planDone.includes(t.id) && t.date <= today());
  const next = due.length ? due : tasks.filter((t) => !p.planDone.includes(t.id)).slice(0, 3);
  const doneN = tasks.filter((t) => p.planDone.includes(t.id)).length;

  const focus = store.domains
    .map((d) => ({ d, acc: domainAccuracy(d.id) }))
    .sort((a, b) => ((a.acc ?? -1) - (b.acc ?? -1)) || (b.d.weight - a.d.weight))[0];

  mount(root,
    h('h1', null, 'Dashboard'),
    h('p', { class: 'lede' }, new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
    h('div', { class: 'card accent' },
      h('div', { class: 'eyebrow' }, 'Exam sprint'),
      h('div', { class: 'big' }, left > 0 ? T('{n} days', { n: left }) : left === 0 ? 'Today' : 'Past target'),
      h('p', { class: 'small' }, T('Target {date} · plan {done}/{total} tasks done', { date: store.plan.examTarget, done: doneN, total: tasks.length }))),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Readiness'),
      h('div', { class: 'ringrow' },
        ring(r, pct(r), r == null ? 'no data' : 'weighted'),
        h('p', { class: 'small' }, r == null ? 'Answer some practice questions to see how ready you are.' : 'Weighted by exam domain weight. Target: 80%.'))),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Quick start'),
      h('div', { class: 'actions row wrap' },
        h('a', { class: 'btn', href: '#/practice' }, 'Practice'),
        h('a', { class: 'btn ghost', href: '#/mock' }, 'Mock exam'),
        h('a', { class: 'btn ghost', href: '#/labs' }, 'Labs'))),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, due.length ? 'Due today & overdue' : 'Up next'),
      next.length === 0 ? h('p', { class: 'small' }, 'All plan tasks done.') : next.slice(0, 6).map(taskRow),
      h('a', { class: 'link', href: '#/plan' }, 'Open full plan')),
    focus && h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Focus next'),
      h('p', null, dot(focus.d.id), h('b', null, focus.d.name), T(' · {w}% of the exam', { w: focus.d.weight })),
      h('p', { class: 'small' }, focus.acc == null ? 'Not started.' : T('Accuracy {p}', { p: pct(focus.acc) })),
      h('a', { class: 'btn', href: '#/practice/' + focus.d.id }, 'Practice this domain')),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Domain accuracy'),
      store.domains.map((d) => {
        const a = domainAccuracy(d.id), s = domainStats(d.id);
        return h('div', { class: 'meter' },
          h('div', { class: 'meter-top' }, h('span', null, dot(d.id), d.name, h('span', { class: 'small' }, ` ${d.weight}%`)), h('span', null, pct(a))),
          h('div', { class: 'meter-bar' }, h('div', { class: a >= 0.8 ? 'good' : '', style: `width:${(a || 0) * 100}%` })),
          h('div', { class: 'small' }, T('{a}/{b} seen', { a: s.seen, b: s.total })));
      })),
    p.mocks.length > 0 && h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Mock exams'),
      bars(p.mocks.slice(-10).map((m) => (m.total ? m.correct / m.total : 0)), p.mocks.slice(-10).map((m) => (m.date || '').slice(5, 10)), 0.8),
      h('p', { class: 'small' }, 'Line = 80% target.')),
    !C.hasKey() && h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Lab setup'),
      h('p', { class: 'small' }, 'Labs call the real Claude API. Add your API key in Settings to run them.'),
      h('a', { class: 'link', href: '#/settings' }, 'Open Settings')));
}

function taskRow(t) {
  const done = store.progress.planDone.includes(t.id);
  const box = h('input', {
    type: 'checkbox', class: 'check', id: 'task-' + t.id, checked: done,
    onChange: (e) => {
      const s = new Set(store.progress.planDone);
      e.target.checked ? s.add(t.id) : s.delete(t.id);
      store.progress.planDone = [...s]; save();
      row.classList.toggle('done', e.target.checked);
    },
  });
  const href = linkToHash(t.link);
  const row = h('div', { class: 'task' + (done ? ' done' : '') },
    box,
    h('label', { for: 'task-' + t.id },
      h('span', { class: 'small task-meta' }, t.date.slice(5) + ' · ' + T(t.kind), t.domain && [' ', dot(t.domain)]), t.text),
    href && h('a', { class: 'link', href }, 'Open'));
  return row;
}

// ======================================================================== plan

export function plan(root) {
  const tasks = store.plan.weeks.flatMap((w) => w.tasks);
  const open = new Set([store.plan.weeks.find((w) => w.tasks.some((t) => !store.progress.planDone.includes(t.id)))?.number ?? 1]);
  mount(root,
    h('h1', null, 'Study plan'),
    h('p', { class: 'lede' }, store.plan.summary),
    store.plan.weeks.map((w) => {
      const done = w.tasks.filter((t) => store.progress.planDone.includes(t.id)).length;
      return h('details', { class: 'card week', open: open.has(w.number) },
        h('summary', null, h('b', null, T('Week {n}: {title}', { n: w.number, title: w.title })),
          h('span', { class: 'small' }, ` ${w.dates} · ${done}/${w.tasks.length}`)),
        h('p', { class: 'small' }, w.goal),
        w.tasks.map(taskRow));
    }),
    h('p', { class: 'small' }, T('{a}/{b} tasks done', { a: tasks.filter((x) => store.progress.planDone.includes(x.id)).length, b: tasks.length })));
}

// ======================================================================== domains

export function domains(root) {
  mount(root,
    h('h1', null, 'Domains'),
    h('p', { class: 'lede' }, 'Seven domains from the July 2026 guide, ordered by number.'),
    store.domains.map((d) => {
      const a = domainAccuracy(d.id);
      return h('details', { class: 'card' },
        h('summary', null, dot(d.id), h('b', null, `${d.number}. ${d.name}`), h('span', { class: 'small' }, ` ${d.weight}% · ${pct(a)}`)),
        h('p', null, d.summary),
        h('div', { class: 'eyebrow' }, 'Key ideas'), bullets(d.keyIdeas),
        h('div', { class: 'eyebrow bad' }, 'Traps'), bullets(d.traps, 'bad'),
        h('a', { class: 'btn', href: '#/practice/' + d.id }, 'Practice this domain'));
    }));
}

// ======================================================================== case study

export function caseStudy(root) {
  const c = store.caseStudy;
  const notes = store.progress.caseNotes;
  mount(root,
    h('h1', null, T('Case study — {company}', { company: c.company })),
    h('p', { class: 'lede' }, c.tagline),
    h('div', { class: 'card accent' }, h('div', { class: 'eyebrow' }, 'Background'), h('p', null, c.background)),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Facts'), bullets(c.facts)),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow bad' }, 'Constraints'), bullets(c.constraints, 'bad')),
    c.decisions.map((dec) => {
      const slot = h('div');
      const ta = h('textarea', {
        class: 'input', rows: 5, placeholder: 'Your answer…',
        onInput: (e) => setCaseNote(dec.id, e.target.value),
      });
      ta.value = notes[dec.id] || '';
      return h('div', { class: 'card' },
        h('div', { class: 'eyebrow' }, dot(dec.domain), dec.title),
        h('p', null, dec.situation),
        h('p', { class: 'ask' }, dec.prompt),
        ta,
        h('div', { class: 'actions row wrap' },
          h('button', {
            class: 'btn ghost', type: 'button',
            onClick: (e) => {
              if (slot.firstChild) { slot.replaceChildren(); e.target.textContent = T('Show model answer'); return; }
              slot.replaceChildren(h('div', { class: 'card good-soft' }, h('div', { class: 'eyebrow good' }, 'Model answer'), h('p', null, dec.modelAnswer)));
              e.target.textContent = T('Hide model answer');
            },
          }, 'Show model answer'),
          ...(dec.labs || []).map((l) => h('a', { class: 'link', href: '#/labs/' + l }, T('Lab {id}', { id: l })))),
        slot);
    }));
}

// ======================================================================== labs

const codeCache = {};

export function labs(root, arg) {
  const lab = store.labs.find((l) => l.id === arg);
  if (!lab) {
    mount(root,
      h('h1', null, 'Hands-on labs'),
      h('p', { class: 'lede' }, '10 labs; those marked "runs here" call the real Claude API from this phone.'),
      !C.hasKey() && h('div', { class: 'card' }, h('p', { class: 'small' }, 'No API key yet — add one in Settings to run labs.'), h('a', { class: 'link', href: '#/settings' }, 'Open Settings')),
      store.labs.map((l) => h('a', { class: 'card tap', href: '#/labs/' + l.id },
        h('div', { class: 'eyebrow' }, dot(l.domain), l.id, l.runMode !== 'none' && h('span', { class: 'pill good' }, 'runs here'),
          store.progress.labsRun.includes(l.id) && h('span', { class: 'pill' }, 'done')),
        h('b', null, l.title),
        h('p', { class: 'small' }, l.goal))));
    return;
  }

  const out = h('pre', { class: 'out', 'aria-live': 'polite' });
  let ctl = null;
  const log = (text, kind) => {
    out.append(h('span', { class: kind || '' }, text + '\n'));
    out.scrollTop = out.scrollHeight;
  };
  const sys = h('textarea', { class: 'input', rows: 4 }); sys.value = lab.system || '';
  const prm = h('textarea', { class: 'input', rows: 5 }); prm.value = lab.prompt || '';
  const run = h('button', { class: 'btn', type: 'button' }, 'Run lab');
  const stop = h('button', { class: 'btn ghost', type: 'button', hidden: true }, 'Stop');
  const codeBox = h('pre', { class: 'code', hidden: true });

  run.addEventListener('click', async () => {
    if (!C.hasKey()) { toast('Add your API key in Settings first'); return; }
    out.replaceChildren();
    ctl = new AbortController();
    run.disabled = true; stop.hidden = false;
    try {
      await runLab(lab, sys.value, prm.value, log, ctl.signal);
      if (!store.progress.labsRun.includes(lab.id)) { store.progress.labsRun.push(lab.id); save(); }
    } catch (e) {
      log(e.name === 'AbortError' ? 'Stopped.' : e.message, 'err');
    } finally { run.disabled = false; stop.hidden = true; ctl = null; }
  });
  stop.addEventListener('click', () => ctl?.abort());

  const fileBtn = h('button', {
    class: 'btn ghost', type: 'button',
    onClick: async () => {
      if (!codeBox.hidden) { codeBox.hidden = true; return; }
      codeBox.hidden = false;
      if (!codeCache[lab.file]) {
        try { codeCache[lab.file] = await (await fetch('data/labs/' + lab.file)).text(); }
        catch { codeCache[lab.file] = '(could not load ' + lab.file + ' — open once online to cache it)'; }
      }
      codeBox.textContent = codeCache[lab.file];
    },
  }, T('View {file}', { file: lab.file }));

  mount(root,
    h('a', { class: 'link', href: '#/labs' }, '← All labs'),
    h('h1', null, `${lab.id} · ${lab.title}`),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Goal'), h('p', null, lab.goal), h('div', { class: 'eyebrow' }, 'Concept'), h('p', null, lab.concept)),
    lab.runMode !== 'none' && h('div', { class: 'card' },
      lab.system !== undefined && [h('label', { class: 'eyebrow' }, 'System prompt'), sys],
      h('label', { class: 'eyebrow' }, 'Prompt'), prm,
      h('div', { class: 'actions row' }, run, stop), out),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Takeaways'), bullets(lab.takeaways || [])),
    lab.file && h('div', { class: 'card' }, h('p', { class: 'small' }, 'Python twin of this lab:'), fileBtn, codeBox));
}

// ======================================================================== settings

export function settingsView(root, hooks) {
  const { applyTheme, applyLang, applyFontSize } = hooks;
  const S = settings();
  const keyIn = h('input', { class: 'input', type: 'password', autocomplete: 'off', placeholder: 'sk-ant-…', 'aria-label': 'Claude API key' });
  keyIn.value = getApiKey();

  const field = (label, key, num) => {
    const i = h('input', { class: 'input', type: num ? 'number' : 'text', step: 'any', 'aria-label': label });
    i.value = S[key];
    i.addEventListener('change', () => { S[key] = num ? Number(i.value) || 0 : i.value.trim(); save(); });
    return h('label', { class: 'field' }, h('span', { class: 'small' }, label), i);
  };

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    try { importProgress(await fileIn.files[0].text()); toast('Progress imported'); settingsView(root, hooks); }
    catch (e) { toast(T('Import failed: {m}', { m: e.message })); }
  });

  const test = h('button', {
    class: 'btn ghost', type: 'button',
    onClick: async () => {
      setApiKey(keyIn.value);
      test.disabled = true;
      try { const r = await C.send(C.body(S.modelFast, '', 'Reply with the single word: ok', 10)); toast(T('Connected: {m}', { m: r.model })); }
      catch (e) { toast(e.message); }
      finally { test.disabled = false; }
    },
  }, 'Save & test connection');

  mount(root,
    h('h1', null, 'Settings'),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Language'),
      chips(LANGS, S.lang, (v) => { S.lang = v; save(); applyLang(); settingsView(root, hooks); }),
      h('label', { class: 'check-row' },
        h('input', { type: 'checkbox', class: 'check', checked: !!S.questionsEnglish, onChange: (e) => { S.questionsEnglish = e.target.checked; save(); applyLang(); } }),
        h('span', null, 'Show practice and mock questions in English (the exam language)'))),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Theme'),
      chips(THEMES, S.theme, (v) => { S.theme = v; save(); applyTheme(); })),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Text size'),
      chips(FONT_SIZES, S.fontSize, (v) => { S.fontSize = v; save(); applyFontSize(); })),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Claude API key'),
      h('p', { class: 'small' }, 'Stored only in this browser on this device and sent only to api.anthropic.com. Use a key with a low spend limit; anyone with access to this phone profile can read it.'),
      keyIn,
      h('div', { class: 'actions row' }, test, h('button', { class: 'btn ghost', type: 'button', onClick: () => { keyIn.value = ''; setApiKey(''); toast('Key removed'); } }, 'Remove key'))),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Models & prices (USD per million tokens)'),
      field('Fast model', 'modelFast'), field('Balanced model', 'modelBalanced'), field('Top model', 'modelTop'),
      h('div', { class: 'grid2' },
        field('Fast in', 'priceFastIn', true), field('Fast out', 'priceFastOut', true),
        field('Balanced in', 'priceBalancedIn', true), field('Balanced out', 'priceBalancedOut', true),
        field('Top in', 'priceTopIn', true), field('Top out', 'priceTopOut', true)),
      h('p', { class: 'small' }, 'Prices are placeholders — check current pricing.'),
      h('button', {
        class: 'btn ghost', type: 'button',
        onClick: () => { Object.assign(S, { ...DEFAULT_SETTINGS, theme: S.theme }); save(); applyTheme(); applyFontSize(); applyLang(); settingsView(root, hooks); },
      }, 'Restore defaults')),
    h('div', { class: 'card' }, h('div', { class: 'eyebrow' }, 'Your data'),
      h('p', { class: 'small' }, 'Progress lives on this device. Export a backup file, or import one made on this phone or from another browser.'),
      h('div', { class: 'actions row wrap' },
        h('button', { class: 'btn ghost', type: 'button', onClick: () => download('ccarp-progress.json', exportProgress()) }, 'Export'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => fileIn.click() }, 'Import'),
        h('button', {
          class: 'btn danger', type: 'button',
          onClick: () => { if (confirm(T('Erase all progress on this device?'))) { resetProgress(); toast('Progress reset'); applyTheme(); applyFontSize(); applyLang(); settingsView(root, hooks); } },
        }, 'Reset progress')),
      fileIn),
    h('p', { class: 'small center' }, T('{q} questions · {l} labs · v{v}', { q: store.questions.length, l: store.labs.length, v: '1.1.0' })));
}
