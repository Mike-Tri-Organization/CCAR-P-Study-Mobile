// Pure merge of two progress objects (this device + another device or a cloud copy).
// No DOM or storage access, so it runs in the browser and in node tests (tests/merge.test.mjs).
// The Windows app implements the same rules in ProgressMerge.cs; tests/merge-cases.json is shared by both.
//
// Rules (see README "Syncing progress"):
//  - questions: per question id, the record with MORE attempts wins (counters only grow, so this never throws
//    away a long history for a fresh device); tie -> later lastSeen; tie -> more correct; tie -> lastCorrect true.
//  - planDone, labsRun: union.
//  - mocks: union, de-duplicated by date + total + correct + minutesUsed, sorted.
//  - caseNotes: per decision id, the note with the later caseNotesAt wins (an emptied note with a later time
//    deletes it); equal or missing times -> longer text, then larger text.
//  - settings are device-specific and are NOT merged: the local settings are kept.
//  - updatedAt: the later of the two.

const str = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (Number.isFinite(v) ? v : 0);
const clone = (v) => JSON.parse(JSON.stringify(v));
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);

/** True when question stat `a` should win over `b`. */
function betterQuestion(a, b) {
  if (num(a.attempts) !== num(b.attempts)) return num(a.attempts) > num(b.attempts);
  if (str(a.lastSeen) !== str(b.lastSeen)) return str(a.lastSeen) > str(b.lastSeen);
  if (num(a.correct) !== num(b.correct)) return num(a.correct) > num(b.correct);
  return !!a.lastCorrect && !b.lastCorrect;
}

const union = (a, b) => [...new Set([...arr(a), ...arr(b)].filter((x) => typeof x === 'string'))].sort(cmp);
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);

const mockKey = (m) => [str(m.date), num(m.total), num(m.correct), num(m.minutesUsed)].join('|');

export function mergeProgress(local, remote) {
  const a = obj(local), b = obj(remote);
  const out = clone(a);

  // questions
  const qa = obj(a.questions), qb = obj(b.questions), questions = {};
  for (const id of new Set([...Object.keys(qa), ...Object.keys(qb)])) {
    if (!qa[id]) questions[id] = clone(qb[id]);
    else if (!qb[id]) questions[id] = clone(qa[id]);
    else questions[id] = clone(betterQuestion(qa[id], qb[id]) ? qa[id] : qb[id]);
  }
  out.questions = questions;

  out.planDone = union(a.planDone, b.planDone);
  out.labsRun = union(a.labsRun, b.labsRun);

  // mocks
  const byKey = new Map();
  for (const m of [...arr(a.mocks), ...arr(b.mocks)]) if (m && typeof m === 'object' && !byKey.has(mockKey(m))) byKey.set(mockKey(m), clone(m));
  out.mocks = [...byKey.entries()].sort((x, y) => cmp(x[0], y[0])).map(([, m]) => m);

  // case notes
  const na = obj(a.caseNotes), nb = obj(b.caseNotes), ta = obj(a.caseNotesAt), tb = obj(b.caseNotesAt);
  const notes = {}, notesAt = {};
  const ids = new Set([...Object.keys(na), ...Object.keys(nb), ...Object.keys(ta), ...Object.keys(tb)]);
  for (const id of ids) {
    const [xa, xb, sa, sb] = [str(na[id]), str(nb[id]), str(ta[id]), str(tb[id])];
    let text, at;
    if (sa !== sb) { at = sa > sb ? sa : sb; text = sa > sb ? xa : xb; }
    else {
      at = sa;
      text = xa === xb ? xa : xa.length !== xb.length ? (xa.length > xb.length ? xa : xb) : (xa > xb ? xa : xb);
    }
    if (text !== '' || at !== '') notes[id] = text;
    if (at !== '') notesAt[id] = at;
  }
  out.caseNotes = notes;
  out.caseNotesAt = notesAt;

  const ua = str(a.updatedAt), ub = str(b.updatedAt);
  out.updatedAt = ua > ub ? ua : ub;
  return out;
}

/** The fields that sync (everything except device-specific settings). Handy for comparing in tests. */
export function syncedView(p) {
  const o = obj(p);
  return {
    questions: clone(obj(o.questions)), planDone: arr(o.planDone).slice().sort(cmp), mocks: clone(arr(o.mocks)),
    caseNotes: clone(obj(o.caseNotes)), caseNotesAt: clone(obj(o.caseNotesAt)), labsRun: arr(o.labsRun).slice().sort(cmp),
    updatedAt: str(o.updatedAt),
  };
}
