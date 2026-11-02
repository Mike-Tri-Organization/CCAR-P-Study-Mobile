// Run with: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeProgress, syncedView } from '../js/merge.js';

const { cases } = JSON.parse(readFileSync(new URL('./merge-cases.json', import.meta.url), 'utf8'));

for (const c of cases) {
  test(c.name + ' (local, remote)', () => assert.deepEqual(syncedView(mergeProgress(c.local, c.remote)), c.expected));
  test(c.name + ' (remote, local)', () => assert.deepEqual(syncedView(mergeProgress(c.remote, c.local)), c.expected));
}

test('settings are not merged: the local settings are kept', () => {
  const m = mergeProgress({ settings: { theme: 'dark', fontSize: 'large' } }, { settings: { theme: 'light', fontSize: 'small' } });
  assert.deepEqual(m.settings, { theme: 'dark', fontSize: 'large' });
});

test('merging does not mutate its inputs', () => {
  const a = { questions: { q1: { attempts: 1, correct: 1, lastCorrect: true, lastSeen: 'x' } }, planDone: ['a'] };
  const b = { questions: { q1: { attempts: 5, correct: 2, lastCorrect: false, lastSeen: 'y' } }, planDone: ['b'] };
  const [sa, sb] = [JSON.stringify(a), JSON.stringify(b)];
  mergeProgress(a, b);
  assert.equal(JSON.stringify(a), sa);
  assert.equal(JSON.stringify(b), sb);
});

test('merging is idempotent', () => {
  const a = cases[2].local, b = cases[2].remote;
  const once = mergeProgress(a, b);
  assert.deepEqual(syncedView(mergeProgress(once, b)), syncedView(once));
  assert.deepEqual(syncedView(mergeProgress(once, once)), syncedView(once));
});
