// Study plan integrity. Run with: node --test tests/*.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL('../data/' + p, import.meta.url), 'utf8'));
const plan = read('ccarp/plan.json');
const viPlan = read('ccarp/vi/plan.json');
const domains = new Set(read('ccarp/domains.json').map((d) => d.id));
const labs = new Set(read('ccarp/labs.json').map((l) => l.id));
const questions = read('ccarp/questions.json');
const tasks = plan.weeks.flatMap((w) => w.tasks);

test('ccarp plan: unique task ids and valid domains, kinds and links', () => {
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length);
  const kinds = new Set(['admin', 'mock', 'read', 'lab', 'practice', 'case', 'review', 'exam']);
  for (const t of tasks) {
    assert.ok(t.text, t.id);
    assert.ok(kinds.has(t.kind), `${t.id}: unknown kind ${t.kind}`);
    assert.ok(t.domain === '' || domains.has(t.domain), `${t.id}: unknown domain ${t.domain}`);
    const [k, arg] = t.link.split(':');
    if (k === 'lab') assert.ok(labs.has(arg), `${t.id}: unknown lab ${arg}`);
    if (k === 'practice') assert.ok(arg === 'all' || domains.has(arg), `${t.id}: unknown practice domain ${arg}`);
    assert.ok(['', 'mock', 'domains', 'case', 'lab', 'practice'].includes(k), `${t.id}: unknown link ${t.link}`);
  }
});

test('ccarp plan: dates are ordered, fall inside their week and end at the exam target', () => {
  const dates = tasks.map((t) => t.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(dates.at(-1), plan.examTarget);
  assert.ok(plan.examTarget <= '2026-12-04', 'exam must be before the Dec 7 content change');
  assert.equal(plan.weeks.length, 2, 'two-week plan');
});

test('ccarp plan: every lab is scheduled and every domain is practised', () => {
  for (const l of labs) assert.ok(tasks.some((t) => t.link === 'lab:' + l), 'lab not scheduled: ' + l);
  for (const d of domains) assert.ok(tasks.some((t) => t.kind === 'practice' && t.link === 'practice:' + d), 'domain not practised: ' + d);
});

test('ccarp plan: the Vietnamese overlay covers every task and week', () => {
  assert.ok(viPlan.summary);
  for (const t of tasks) assert.ok(viPlan.tasks[t.id], 'missing vi task ' + t.id);
  for (const w of plan.weeks) {
    const v = viPlan.weeks[w.number];
    assert.ok(v && v.title && v.dates && v.goal, 'missing vi week ' + w.number);
  }
  assert.deepEqual(Object.keys(viPlan.tasks).sort(), tasks.map((t) => t.id).sort(), 'no stale vi tasks');
});

test('ccarp questions: ids match their domain and domains are balanced', () => {
  const counts = {};
  for (const q of questions) {
    assert.ok(q.id.startsWith(q.domain + '-'), q.id);
    counts[q.domain] = (counts[q.domain] || 0) + 1;
  }
  for (const d of domains) assert.ok(counts[d] >= 8, `${d} has too few questions`);
});
