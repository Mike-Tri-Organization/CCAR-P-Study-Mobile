// In-app lab runner: a port of LabRunner.cs. Each mode mirrors the matching Python file in data/labs.
import { settings } from './store.js';
import * as C from './claude.js';
import { t as T } from './i18n.js';

const CATEGORIES = ['tracking', 'customs', 'delivery_change', 'billing', 'claim', 'complaint', 'other'];

const PLAYBOOKS = {
  tracking: "You answer shipment-tracking questions. Ask for the shipment ID if missing. Never guess a location or ETA.",
  customs: "You handle customs-hold questions. Explain that releases usually take 2-5 working days after documents are complete, offer to have a broker check missing documents, and never promise a release date.",
  delivery_change: "You handle delivery changes. Free up to 24 hours before the window, otherwise 150,000 VND. Confirm the shipment ID and new date; say a dispatcher will confirm.",
  billing: "You handle billing questions. Never quote amounts you don't have; offer to connect billing.",
  claim: "You handle damage/loss claims. Claims within 14 days of delivery with photos, signed delivery note and invoice. Claims above 10 million VND need manager review.",
  complaint: "Acknowledge the problem sincerely, summarize it, and say a human supervisor will contact them today.",
  other: "Answer briefly and offer to connect the customer with a person.",
};

const CAT_NAMES = ['general cargo', 'cold chain', 'hazardous goods', 'high-value electronics', 'textiles', 'furniture'];
const ROUTES = ['HCMC-Da Nang', 'HCMC-Hai Phong', 'Da Nang-Hai Phong', 'HCMC-Can Tho', 'Hai Phong-Lao Cai'];

export function handbook(clauses = 90) {
  let s = 'MEKONGFREIGHT CARRIER LIABILITY HANDBOOK (v2026.1)\n';
  for (let i = 1; i <= clauses; i++) {
    s += `Clause ${i}. Carrier liability for ${CAT_NAMES[i % CAT_NAMES.length]} shipments on route ` +
      `${ROUTES[i % ROUTES.length]} is limited to ${(i * 37) % 900 + 100} USD per consignment unless declared ` +
      `value cover is purchased; claims must be filed within ${(i % 5 + 1) * 7} days with photographic evidence, ` +
      'a signed proof of delivery and the original commercial invoice. Exceptions apply to force majeure events, ' +
      'including typhoon warnings issued by the national hydro-meteorological agency.\n';
  }
  return s;
}

const PII = [
  ['NATIONAL_ID', /\b\d{12}\b/g],
  ['EMAIL', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['PHONE', /(?:\+84|\b0)(?:[\s.-]?\d){9}\b/g],
];

export function redact(text) {
  const counts = {};
  for (const [label, rx] of PII) {
    let n = 0;
    text = text.replace(rx, () => `[${label}_${++n}]`);
    counts[label] = n;
  }
  return { text, counts };
}

function parseJsonObject(text) {
  if (!text) return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

const words = (t) => new Set((t.toLowerCase().match(/\w+/g) || []).filter((w) => w.length > 2));

const TOOLS = [
  {
    name: 'get_shipment_status',
    description: 'Look up the current status, location and ETA of a MekongFreight shipment. Read-only.',
    input_schema: {
      type: 'object',
      properties: { shipment_id: { type: 'string', description: 'Format MF-1234, e.g. MF-1001' } },
      required: ['shipment_id'],
    },
  },
  {
    name: 'reschedule_delivery',
    description: 'Request a new delivery date. Requires human approval before it takes effect.',
    input_schema: {
      type: 'object',
      properties: {
        shipment_id: { type: 'string', description: 'Format MF-1234' },
        new_date: { type: 'string', description: 'ISO date YYYY-MM-DD, e.g. 2026-11-14' },
        reason: { type: 'string' },
      },
      required: ['shipment_id', 'new_date', 'reason'],
    },
  },
];

const fakeTms = () => ({
  'MF-1001': { status: 'in_transit', location: 'Da Nang hub', eta: '2026-11-12', window: '08:00-12:00' },
  'MF-1002': { status: 'delivered', location: 'Customer warehouse, Thu Duc', delivered_at: '2026-11-08 10:42' },
  'MF-1003': { status: 'customs_hold', location: 'Cat Lai port', note: 'Missing certificate of origin' },
});

const RUBRIC = 'Score the support reply from 1 to 5:\n' +
  '5 = correct per policy, directly answers, friendly, right language, concise\n' +
  '3 = mostly correct but vague, wordy, or slightly off-tone\n' +
  '1 = wrong policy facts, wrong language, or does not answer\n' +
  'Return JSON only: {"score": <1-5>, "reason": "<one sentence>"}';

async function sha256Hex16(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/**
 * @param {object} lab
 * @param {string} system
 * @param {string} prompt
 * @param {(text:string, kind?:'head'|'info'|'ok'|'err'|'warn') => void} log
 * @param {AbortSignal} signal
 */
export async function runLab(lab, system, prompt, log, signal) {
  const S = settings();
  const cost = (tier, r) => {
    const [pin, pout] = tier === 'fast' ? [S.priceFastIn, S.priceFastOut]
      : tier === 'top' ? [S.priceTopIn, S.priceTopOut] : [S.priceBalancedIn, S.priceBalancedOut];
    return r.inTok / 1e6 * pin + r.outTok / 1e6 * pout + r.cacheWrite / 1e6 * pin * 1.25 + r.cacheRead / 1e6 * pin * 0.1;
  };
  const send = (b) => C.send(b, signal);

  switch (lab.runMode) {
    case 'workflow': return workflow();
    case 'compare_models': return compare();
    case 'caching': return caching();
    case 'tool_use': return toolUse();
    case 'rag': return rag();
    case 'eval_judge': return evalJudge();
    case 'redaction': return redaction();
    default: log('This lab has no in-app run. Read the material and the file below.', 'info');
  }

  async function workflow() {
    log(T('STEP 1 — classify with the fast model ({m})', { m: S.modelFast }), 'head');
    const sys = 'Classify the customer message. Reply with JSON only, no prose: ' +
      `{"category": one of ${JSON.stringify(CATEGORIES)}, "urgency": "low|medium|high", "language": "vi|en"}`;
    const r1 = await send(C.body(S.modelFast, sys, prompt, 200));
    log(r1.text);
    log(r1.usageLine + ` · ~$${cost('fast', r1).toFixed(5)}`, 'info');

    const route = parseJsonObject(r1.text);
    let cat = route?.category ?? '';
    if (!CATEGORIES.includes(cat)) {
      log(T("Category '{c}' failed validation in code → falling back to 'other'.", { c: cat }), 'err');
      cat = 'other';
    }
    let lang = route?.language;
    if (lang !== 'vi' && lang !== 'en') lang = "the customer's language";
    log(T('Routed to playbook: {c} · urgency={u} · language={l}', { c: cat, u: route?.urgency ?? '', l: lang }), 'ok');

    log('\n' + T("STEP 2 — answer with the '{c}' playbook on the balanced model ({m})", { c: cat, m: S.modelBalanced }), 'head');
    log('Playbook: ' + PLAYBOOKS[cat], 'info');
    const r2 = await send(C.body(S.modelBalanced, `${PLAYBOOKS[cat]} Reply in the customer's language (${lang}). 3-4 sentences.`, prompt, 500));
    log(r2.text);
    log(r2.usageLine + ` · ~$${cost('balanced', r2).toFixed(5)}`, 'info');
    log('\n' + T('Total ~${c}. Only the second step needed the bigger model.', { c: (cost('fast', r1) + cost('balanced', r2)).toFixed(5) }), 'ok');
  }

  async function compare() {
    const tiers = [['fast', S.modelFast], ['balanced', S.modelBalanced], ['top', S.modelTop]];
    const known = prompt.includes('1,850,000');
    const summary = [];
    for (const [tier, model] of tiers) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      log(`\n=== ${tier.toUpperCase()} — ${model}`, 'head');
      try {
        const r = await send(C.body(model, system, prompt, 700));
        log(r.text);
        const c = cost(tier, r);
        log(r.usageLine + ` · ~$${c.toFixed(5)}`, 'info');
        let verdict = '';
        if (known) {
          const ok = ['2,012,000', '2.012.000', '2012000', '2 012 000'].some((s) => r.text.includes(s));
          verdict = ok ? ' · ' + T('correct') : ' · ' + T('check answer');
          log(ok ? 'Final number matches 2,012,000 VND' : 'Expected 2,012,000 VND — check the reasoning above', ok ? 'ok' : 'err');
        }
        summary.push(`${tier.padEnd(9)} ${String(Math.round(r.latency)).padStart(6)} ms  out=${String(r.outTok).padStart(4)}  ~$${c.toFixed(5)}${verdict}`);
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        log(e.message + '  ' + T('(Check the model ID in Settings.)'), 'err');
        summary.push(`${tier.padEnd(9)} error`);
      }
    }
    log('\nSUMMARY', 'head');
    summary.forEach((l) => log(l));
    log('Business argument: pick the cheapest tier that meets the quality bar on your eval set; route hard cases up.', 'info');
  }

  async function caching() {
    const sys = system && system.trim() ? system : "You are MekongFreight's claims assistant.";
    const hb = handbook();
    log(T('Stable prefix: system instructions + handbook ({c} characters, roughly {k} tokens).', { c: hb.length.toLocaleString(), k: Math.round(hb.length / 4).toLocaleString() }), 'info');
    const questions = [prompt, 'Summarize clause 7 in one sentence.'];
    for (let i = 0; i < questions.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const b = {
        model: S.modelBalanced,
        max_tokens: 300,
        system: [{ type: 'text', text: sys }, { type: 'text', text: hb, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: questions[i] }],
      };
      log('\n' + T('CALL {n}:', { n: i + 1 }) + ' ' + questions[i], 'head');
      const r = await send(b);
      log(r.text);
      log(r.usageLine + ` · ~$${cost('balanced', r).toFixed(5)}`, 'info');
      if (r.cacheWrite > 0) log(T('cache WRITE: {n} tokens stored (billed a bit above normal input).', { n: r.cacheWrite.toLocaleString() }), 'ok');
      if (r.cacheRead > 0) log(T('cache READ: {n} tokens served from cache (billed at a fraction of normal input).', { n: r.cacheRead.toLocaleString() }), 'ok');
      if (!r.cacheWrite && !r.cacheRead) log("No cache activity. Causes: prefix below the model's minimum cacheable length, or the prefix changed.", 'err');
    }
    log('\nTry it: change one word in the system prompt and run again — call 1 becomes a cache write again (miss).', 'info');
  }

  function runTool(tms, name, input) {
    const sid = String(input.shipment_id ?? '').trim();
    if (!/^MF-\d+$/.test(sid)) return ['shipment_id must look like MF-1234.', true];
    if (!tms[sid]) return [`Shipment ${sid} not found.`, true];
    if (name === 'get_shipment_status') return [JSON.stringify(tms[sid]), false];
    if (name === 'reschedule_delivery') {
      const date = String(input.new_date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return ['new_date must be an ISO date YYYY-MM-DD.', true];
      if (tms[sid].status === 'delivered') return ['Shipment already delivered; cannot reschedule.', true];
      const ok = confirm(T('Claude wants to reschedule {sid} to {date}.\n\nReason: {reason}\n\nApprove this write action?\n(Human approval, enforced in the tool layer)', { sid, date, reason: input.reason ?? '' }));
      if (!ok) return ['Denied by human reviewer. Tell the customer a dispatcher will follow up today.', true];
      tms[sid].eta = date;
      return [JSON.stringify({ ok: true, shipment_id: sid, new_eta: date }), false];
    }
    return [`Unknown tool ${name}`, true];
  }

  async function toolUse() {
    const tms = fakeTms();
    const messages = [{ role: 'user', content: prompt }];
    log('Fake TMS has MF-1001 (in transit), MF-1002 (delivered), MF-1003 (customs hold). Anything else → not found.', 'info');
    for (let turn = 1; turn <= 6; turn++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const b = { model: S.modelBalanced, max_tokens: 800, tools: TOOLS, messages: structuredClone(messages) };
      if (system && system.trim()) b.system = system;
      const r = await send(b);
      log(`turn ${turn} · ${r.usageLine}`, 'info');
      messages.push({ role: 'assistant', content: structuredClone(r.content) });
      if (r.text.trim()) log('CLAUDE: ' + r.text);
      if (r.stop !== 'tool_use') { log('\nDone — the model stopped calling tools.', 'ok'); return; }
      const results = [];
      for (const blk of r.toolUses) {
        log(`[tool_use] ${blk.name} ${JSON.stringify(blk.input)}`, 'head');
        const [content, isError] = runTool(tms, blk.name, blk.input || {});
        log(isError ? `[tool_result is_error=true] ${content}` : `[tool_result] ${content}`, isError ? 'err' : 'ok');
        results.push({ type: 'tool_result', tool_use_id: blk.id, content, is_error: isError });
      }
      messages.push({ role: 'user', content: results });
    }
    log('Turn budget reached (6). In production this is where you stop and escalate.', 'err');
  }

  async function rag() {
    const q = words(prompt);
    const ranked = (lab.docs || [])
      .map((d) => ({ d, score: [...words(d.text)].filter((w) => q.has(w)).length }))
      .sort((a, b) => b.score - a.score);
    log('RETRIEVAL (naive keyword overlap, top 2)', 'head');
    ranked.forEach((x, i) => log(`  ${x.d.id}  score=${String(x.score).padStart(2)}  ${x.d.title}`, i < 2 ? undefined : 'info'));
    const hits = ranked.slice(0, 2).map((x) => x.d);
    if (hits.some((h) => /SUPERSEDED/i.test(h.title)))
      log("A SUPERSEDED document was retrieved. That's a retrieval problem — fix it with metadata/filtering, not a bigger model.", 'err');

    const ctx = hits.map((h) => `<document id="${h.id}">${h.text}</document>`).join('\n');
    const user = `<documents>\n${ctx}\n</documents>\n\nQuestion: ${prompt}\n\n` +
      'Answer only from the documents. Cite document ids like [D2]. ' +
      'If the documents conflict, prefer the most recent effective policy and say so. ' +
      'If the answer is not in the documents, reply exactly: Not in the provided documents.';
    log('\n' + T('GENERATION ({m})', { m: S.modelBalanced }), 'head');
    const r = await send(C.body(S.modelBalanced, system, user, 400));
    log(r.text);
    log(r.usageLine, 'info');

    log('\nCITATION CHECK (in code)', 'head');
    const cited = new Set([...r.text.matchAll(/\[(D\d+)\]/g)].map((m) => m[1]));
    const retrieved = new Set(hits.map((h) => h.id));
    const bad = [...cited].filter((c) => !retrieved.has(c));
    if (!cited.size) log("No citations (ok only if the answer is 'Not in the provided documents').", 'info');
    else if (!bad.length) log(T('All citations [{c}] point to retrieved documents.', { c: [...cited].join(', ') }), 'ok');
    else log(T('Cited but not retrieved: {c} → fabricated citation.', { c: bad.join(', ') }), 'err');
    log("\nTry: 'refund within how many days' vs 'current 2026 refund policy damaged lost claim days'.", 'info');
  }

  async function evalJudge() {
    let pass = 0, judged = 0, judgeSum = 0;
    const table = [];
    for (const c of lab.cases || []) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      log('\n' + T('CASE:') + ' ' + c.input, 'head');
      const a = await send(C.body(S.modelFast, system, c.input, 300));
      log('A: ' + a.text);
      const missing = (c.mustInclude || []).filter((m) => !a.text.toLowerCase().includes(m.toLowerCase()));
      if (!missing.length) { pass++; log('code grader: PASS', 'ok'); }
      else log(T('code grader: FAIL — missing {m}', { m: missing.join(', ') }), 'err');

      const j = await send(C.body(S.modelBalanced, 'You are a strict, fair grader.',
        `${RUBRIC}\n\nPolicy: ${system}\n\nCustomer: ${c.input}\n\nReply: ${a.text}`, 200));
      const v = parseJsonObject(j.text);
      const score = Number.isInteger(v?.score) ? v.score : -1;
      if (score > 0) { judged++; judgeSum += score; }
      log(`judge: ${score > 0 ? score : T('unparseable')} — ${v?.reason ?? ''}`, score >= 4 ? 'ok' : score > 0 ? 'warn' : 'err');
      if ((missing.length === 0) !== (score >= 4))
        log('Graders DISAGREE on this case → read the answer yourself. This is how you calibrate a judge.', 'err');
      table.push(`${missing.length === 0 ? 'PASS' : 'FAIL'} judge=${score > 0 ? score : '?'}  ${c.input}`);
    }
    log('\nRESULTS BY CASE', 'head');
    table.forEach((t) => log(t));
    log('\n' + T('Code pass rate {p}/{n} · average judge {a}', { p: pass, n: (lab.cases || []).length, a: (judged ? judgeSum / judged : 0).toFixed(2) }), 'ok');
    log('Report per case/category — an average can hide a critical regression.', 'info');
  }

  async function redaction() {
    const { text: safe, counts } = redact(prompt);
    log('ORIGINAL (stays on your device)', 'head');
    log(prompt, 'info');
    log('\nSENT TO THE MODEL (after redaction in code)', 'head');
    log(safe);
    log(T('Redactions:') + ' ' + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', '), 'ok');

    const r = await send(C.body(S.modelFast, system, safe, 200));
    log('\nMODEL OUTPUT', 'head');
    log(r.text);
    log(r.usageLine, 'info');

    const audit = {
      ts: new Date().toISOString(), lab: 'L8', model: r.model,
      original_sha256: await sha256Hex16(prompt),
      redactions: counts, input_tokens: r.inTok, output_tokens: r.outTok,
    };
    try {
      const k = 'ccarp.audit';
      const prev = localStorage.getItem(k) || '';
      localStorage.setItem(k, prev + JSON.stringify(audit) + '\n');
    } catch { /* storage unavailable */ }
    log('\nAUDIT RECORD (hash of the original, never the text)', 'head');
    log(JSON.stringify(audit, null, 2));
    log('Appended to the on-device audit log.', 'info');
  }
}
