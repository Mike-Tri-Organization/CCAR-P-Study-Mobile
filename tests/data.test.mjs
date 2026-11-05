// Content integrity for every certification. Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL('../data/' + p, import.meta.url), 'utf8'));
const certs = read('certs.json');

test('four certifications are registered', () => {
  assert.deepEqual(certs.map((c) => c.id).sort(), ['ccao-f', 'ccarf', 'ccarp', 'ccdv-f']);
});

for (const c of certs) {
  const domains = read(`${c.id}/domains.json`);
  const questions = read(`${c.id}/questions.json`);
  const ids = new Set(domains.map((d) => d.id));

  test(`${c.id}: domains are well formed and weights sum to 100`, () => {
    assert.equal(domains.reduce((n, d) => n + d.weight, 0), 100);
    for (const d of domains) {
      assert.ok(d.name && d.summary, d.id);
      assert.ok(Array.isArray(d.keyIdeas) && d.keyIdeas.length, d.id + ' keyIdeas');
      assert.ok(Array.isArray(d.traps) && d.traps.length, d.id + ' traps');
    }
    assert.deepEqual(domains.map((d) => d.number), domains.map((_, i) => i + 1));
    assert.ok(domains.length <= 8, 'colour palette has 8 hues');
  });

  test(`${c.id}: every question is valid`, () => {
    const seen = new Set();
    for (const q of questions) {
      assert.ok(!seen.has(q.id), 'duplicate id ' + q.id); seen.add(q.id);
      assert.ok(ids.has(q.domain), `${q.id}: unknown domain ${q.domain}`);
      assert.ok(q.stem && q.explanation, q.id);
      assert.ok(q.options.length >= 3 && new Set(q.options).size === q.options.length, q.id + ' options');
      assert.ok(q.answer.length >= 1 && q.answer.every((a) => Number.isInteger(a) && a >= 0 && a < q.options.length), q.id + ' answer');
    }
    for (const d of domains) assert.ok(questions.some((q) => q.domain === d.id), `${c.id}: no questions for ${d.id}`);
  });

  test(`${c.id}: feature flags match the files present`, () => {
    for (const [feat, file] of [['plan', 'plan.json'], ['labs', 'labs.json'], ['case', 'case.json']]) {
      assert.equal(existsSync(new URL(`../data/${c.id}/${file}`, import.meta.url)), !!c.features[feat], `${c.id} ${feat}`);
    }
    assert.ok(c.exam.questions > 0 && c.exam.minutes > 0);
  });
}
