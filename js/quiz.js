// Practice and mock exam, plus the shared question card.
import { store, save, record, domainById, isMissed, isUnseen, shuffle, shuffled, sameSet } from './store.js';
import { h, mount, chips, pct, bars } from './ui.js';
import { t as T } from './i18n.js';

const isMulti = (q) => q.answer.length > 1;

/** Renders a question with shuffled options. Returns {el, selected(), reveal()}. */
function questionCard(q, order, preselected, onChange) {
  const sel = new Set(preselected || []);
  let locked = false;
  const rows = [];
  const el = h('div', { class: 'qcard' },
    h('p', { class: 'stem' }, q.stem),
    isMulti(q) && h('span', { class: 'pill warn' }, T('Select {n} — no partial credit', { n: q.answer.length })));

  order.forEach((orig, pos) => {
    const row = h('button', {
      type: 'button', class: 'opt', role: isMulti(q) ? 'checkbox' : 'radio',
      'aria-checked': sel.has(orig) ? 'true' : 'false',
      onClick: () => {
        if (locked) return;
        if (isMulti(q)) { sel.has(orig) ? sel.delete(orig) : sel.add(orig); }
        else { sel.clear(); sel.add(orig); }
        paint();
        onChange && onChange(new Set(sel));
      },
    }, h('span', { class: 'letter' }, String.fromCharCode(65 + pos)), h('span', { class: 'opt-text' }, q.options[orig]));
    rows.push([orig, row]);
    el.append(row);
  });

  function paint() {
    rows.forEach(([orig, row]) => {
      row.classList.toggle('picked', sel.has(orig));
      row.setAttribute('aria-checked', sel.has(orig) ? 'true' : 'false');
    });
  }
  paint();

  return {
    el,
    selected: () => new Set(sel),
    reveal() {
      locked = true;
      rows.forEach(([orig, row]) => {
        row.classList.remove('picked');
        row.disabled = true;
        if (q.answer.includes(orig)) row.classList.add('right');
        else if (sel.has(orig)) row.classList.add('wrong');
      });
    },
  };
}

function feedback(q, correct) {
  return h('div', { class: 'card feedback ' + (correct ? 'good' : 'bad') },
    h('div', { class: 'fb-title' }, correct ? 'Correct' : 'Not quite'),
    h('p', null, q.explanation),
    q.trap && h('p', { class: 'trap' }, T('Trap: {t}', { t: q.trap })));
}

// ======================================================================== practice

export function practice(root, arg) {
  const dom = arg && domainById(arg) ? arg : 'all';
  setup(dom, 'all');

  function setup(domain, mode) {
    const pool = () => store.questions.filter((q) =>
      (domain === 'all' || q.domain === domain) &&
      (mode === 'all' || (mode === 'unseen' ? isUnseen(q) : isMissed(q))));
    const count = h('p', { class: 'small' });
    const start = h('button', { class: 'btn', type: 'button' }, 'Start');
    const upd = () => {
      const n = pool().length;
      count.textContent = n === 1 ? T('1 question matches') : T('{n} questions match', { n });
      start.disabled = n === 0;
    };
    start.addEventListener('click', () => run(shuffled(pool())));

    mount(root,
      h('h1', null, 'Practice'),
      h('p', { class: 'lede' }, 'Untimed, instant feedback, options shuffled.'),
      h('div', { class: 'card' },
        h('div', { class: 'eyebrow' }, 'Domain'),
        chips([['all', 'All'], ...store.domains.map((d) => [d.id, d.name])], domain, (v) => { domain = v; upd(); }),
        h('div', { class: 'eyebrow', style: 'margin-top:16px' }, 'Which questions'),
        chips([['all', 'All'], ['unseen', 'Unseen'], ['missed', 'Missed']], mode, (v) => { mode = v; upd(); }),
        count, start));
    upd();
  }

  function run(qs) {
    let i = 0, correctCount = 0;
    const step = () => {
      if (i >= qs.length) return done();
      const q = qs[i];
      const order = shuffle(q.options.length);
      const d = domainById(q.domain);
      const card = questionCard(q, order, [], () => check.disabled = false);
      const check = h('button', { class: 'btn', type: 'button', disabled: true, onClick: onCheck }, 'Check answer');
      const fbSlot = h('div');
      function onCheck() {
        const ok = sameSet(card.selected(), new Set(q.answer));
        record(q, ok); save();
        if (ok) correctCount++;
        card.reveal();
        fbSlot.replaceChildren(feedback(q, ok));
        check.replaceWith(h('button', { class: 'btn', type: 'button', onClick: () => { i++; step(); } },
          i + 1 >= qs.length ? 'Finish' : 'Next question'));
        fbSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      mount(root,
        h('div', { class: 'topline' },
          h('span', { class: 'small' }, T('Question {i} of {n}', { i: i + 1, n: qs.length }) + (d ? ' · ' + d.name : '')),
          h('button', { class: 'link', type: 'button', onClick: () => practice(root) }, 'End')),
        h('div', { class: 'progress' }, h('div', { style: `width:${(i / qs.length) * 100}%` })),
        card.el, fbSlot, h('div', { class: 'actions' }, check));
      window.scrollTo(0, 0);
    };
    const done = () => mount(root,
      h('h1', null, 'Session complete'),
      h('div', { class: 'card' },
        h('div', { class: 'big' }, `${correctCount} / ${qs.length}`),
        h('p', { class: 'small' }, T('{p} correct', { p: pct(correctCount / qs.length) })),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onClick: () => practice(root) }, 'Practice again'),
          h('button', { class: 'btn ghost', type: 'button', onClick: () => { location.hash = '#/'; } }, 'Dashboard'))));
    step();
  }
}

// ======================================================================== mock exam

const minutesFor = (n) => Math.ceil(n * store.cert.exam.minutes / store.cert.exam.questions);

function pickMock(count) {
  const pool = shuffled(store.questions);
  let result = [];
  for (const d of store.domains) {
    const n = Math.round(count * d.weight / 100);
    result.push(...pool.filter((q) => q.domain === d.id).slice(0, n));
  }
  if (result.length > count) result = shuffled(result).slice(0, count);
  for (const q of pool) {
    if (result.length >= count) break;
    if (!result.includes(q)) result.push(q);
  }
  return shuffled(result);
}

let activeTimer = null;
export function leaveMock() { if (activeTimer) { clearInterval(activeTimer); activeTimer = null; } }

export function mock(root) {
  leaveMock();
  const all = store.questions.length;
  let size = '20';
  const mocks = store.progress.mocks.slice(-10);

  mount(root,
    h('h1', null, 'Mock exam'),
    h('p', { class: 'lede' }, store.cert.exam.official
      ? T('Timed at the real pace — {q} questions in {m} minutes. Sampled by domain weight. No feedback until you finish.', { q: store.cert.exam.questions, m: store.cert.exam.minutes })
      : T('Timed at a practice pace — {q} questions in {m} minutes (check the official exam guide for the real format). Sampled by domain weight. No feedback until you finish.', { q: store.cert.exam.questions, m: store.cert.exam.minutes })),
    h('div', { class: 'card accent' },
      h('div', { class: 'eyebrow' }, 'Pick a length'),
      chips([['20', T('{q} · {m} min', { q: 20, m: minutesFor(20) })], ['40', T('{q} · {m} min', { q: 40, m: minutesFor(40) })], [String(all), T('All {q} · {m} min', { q: all, m: minutesFor(all) })]], size, (v) => { size = v; }),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: () => start(Math.min(+size, all)) }, 'Start mock exam'))),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Exam technique'),
      h('ul', { class: 'bullets' },
        h('li', null, 'Read the last sentence of the stem first — it says what is asked (best, first, most cost-effective…).'),
        h('li', null, 'Eliminate answers that put controls in prompts, skip discovery, or pick a bigger model to fix a retrieval problem.'),
        h('li', null, "'Select TWO' has no partial credit: both picks must be right."),
        h('li', null, 'Flag and move on after ~2 minutes; come back via the navigator.'))),
    mocks.length > 0 && h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'Your mock history'),
      bars(mocks.map((m) => (m.total ? m.correct / m.total : 0)), mocks.map((m) => (m.date || '').slice(5, 10)), 0.8),
      h('p', { class: 'small' }, 'Line = 80% target.')));

  function start(count) {
    const qs = pickMock(count);
    const orders = qs.map((q) => shuffle(q.options.length));
    const answers = qs.map(() => new Set());
    const flags = new Set();
    const startedAt = Date.now();
    const endAt = startedAt + minutesFor(qs.length) * 60000;
    let idx = 0, finished = false;
    const clock = h('span', { class: 'clock' });

    const tick = () => {
      if (finished) return;
      const left = endAt - Date.now();
      if (left <= 0) { finish(true); return; }
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      clock.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      clock.classList.toggle('bad', left < 5 * 60000);
    };
    activeTimer = setInterval(tick, 1000);

    function show() {
      if (finished) return;
      const q = qs[idx];
      const card = questionCard(q, orders[idx], answers[idx], (s) => { answers[idx] = s; });
      mount(root,
        h('div', { class: 'topline sticky' },
          h('span', { class: 'small' }, T('Q {i} / {n}', { i: idx + 1, n: qs.length })), clock,
          h('button', { class: 'link', type: 'button', onClick: navigator_ }, 'Navigator')),
        card.el,
        h('div', { class: 'actions row' },
          h('button', { class: 'btn ghost', type: 'button', disabled: idx === 0, onClick: () => { idx--; show(); } }, 'Back'),
          h('button', {
            class: 'btn ghost' + (flags.has(idx) ? ' flagged' : ''), type: 'button',
            onClick: () => { flags.has(idx) ? flags.delete(idx) : flags.add(idx); show(); },
          }, flags.has(idx) ? 'Unflag' : 'Flag'),
          idx < qs.length - 1
            ? h('button', { class: 'btn', type: 'button', onClick: () => { idx++; show(); } }, 'Next')
            : h('button', { class: 'btn', type: 'button', onClick: review }, 'Review')));
      tick();
      window.scrollTo(0, 0);
    }

    function grid() {
      return h('div', { class: 'navgrid' }, qs.map((_, i) =>
        h('button', {
          type: 'button',
          class: 'navcell' + (answers[i].size ? ' done' : '') + (flags.has(i) ? ' flag' : '') + (i === idx ? ' cur' : ''),
          onClick: () => { idx = i; show(); },
        }, i + 1)));
    }

    function navigator_() {
      mount(root,
        h('div', { class: 'topline sticky' }, h('span', { class: 'small' }, 'Navigator'), clock, h('button', { class: 'link', type: 'button', onClick: show }, 'Back')),
        h('div', { class: 'card' }, grid(),
          h('p', { class: 'small' }, 'Filled = answered · orange corner = flagged')),
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: review }, 'Review & finish')));
      tick();
    }

    function review() {
      const unanswered = answers.filter((a) => !a.size).length;
      mount(root,
        h('div', { class: 'topline sticky' }, h('span', { class: 'small' }, 'Review'), clock, h('button', { class: 'link', type: 'button', onClick: show }, 'Back')),
        h('div', { class: 'card' },
          h('p', null, T('{a} answered · {u} unanswered · {f} flagged', { a: qs.length - unanswered, u: unanswered, f: flags.size })),
          grid(),
          h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onClick: () => finish(false) }, 'Finish exam'))));
      tick();
    }

    function finish(auto) {
      if (finished) return;
      finished = true;
      leaveMock();
      const byDomain = {};
      let correct = 0;
      qs.forEach((q, i) => {
        const ok = sameSet(answers[i], new Set(q.answer));
        record(q, ok);
        if (ok) correct++;
        const e = byDomain[q.domain] || (byDomain[q.domain] = [0, 0]);
        e[1]++; if (ok) e[0]++;
      });
      const used = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
      store.progress.mocks.push({ date: new Date().toISOString().slice(0, 10), total: qs.length, correct, minutesUsed: used, byDomain });
      save();
      report(qs, answers, orders, correct, used, byDomain, auto);
    }
    show();
  }
}

function report(qs, answers, orders, correct, used, byDomain, auto) {
  const root = document.getElementById('view');
  const frac = correct / qs.length;
  const wrong = qs.map((q, i) => ({ q, i })).filter(({ q, i }) => !sameSet(answers[i], new Set(q.answer)));
  mount(root,
    h('h1', null, auto ? "Time's up" : 'Mock complete'),
    h('div', { class: 'card accent' },
      h('div', { class: 'big' }, `${correct} / ${qs.length}`),
      h('p', null, T('{p} · {m} min used · target 80%', { p: pct(frac), m: used })),
      h('div', { class: 'pill ' + (frac >= 0.8 ? 'good' : 'warn') }, frac >= 0.8 ? 'At or above target' : 'Below target — review the misses')),
    h('div', { class: 'card' },
      h('div', { class: 'eyebrow' }, 'By domain'),
      Object.entries(byDomain).map(([id, [c, t]]) => h('div', { class: 'meter' },
        h('div', { class: 'meter-top' }, h('span', null, domainById(id)?.name || id), h('span', null, `${c}/${t}`)),
        h('div', { class: 'meter-bar' }, h('div', { class: c / t >= 0.8 ? 'good' : '', style: `width:${(c / t) * 100}%` }))))),
    h('h2', null, T('Missed ({n})', { n: wrong.length })),
    wrong.map(({ q, i }) => {
      const card = questionCard(q, orders[i], answers[i]);
      card.reveal();
      return h('div', { class: 'card' }, card.el, feedback(q, false));
    }),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => mock(root) }, 'Another mock'),
      h('button', { class: 'btn ghost', type: 'button', onClick: () => { location.hash = '#/'; } }, 'Dashboard')));
  window.scrollTo(0, 0);
}
