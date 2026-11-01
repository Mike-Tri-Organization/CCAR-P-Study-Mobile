// Minimal Claude Messages API client. Raw JSON so the labs show exactly what goes over the wire.
import { getApiKey } from './store.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class ClaudeApiError extends Error {
  constructor(status, message) {
    super(status > 0 ? `HTTP ${status}: ${message}` : message);
    this.status = status;
  }
}

export const hasKey = () => !!getApiKey();

export function body(model, system, user, maxTokens = 800) {
  const b = { model, max_tokens: maxTokens, messages: [{ role: 'user', content: user }] };
  if (system && system.trim()) b.system = system;
  return b;
}

export async function send(payload, signal) {
  const key = getApiKey();
  if (!key) throw new ClaudeApiError(0, 'No API key. Paste one in Settings.');
  const t0 = performance.now();
  let resp;
  try {
    resp = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ClaudeApiError(0, 'Network error: ' + e.message);
  }
  const text = await resp.text();
  const latency = performance.now() - t0;
  if (!resp.ok) {
    let msg = text;
    try { msg = JSON.parse(text)?.error?.message || text; } catch { /* keep raw */ }
    throw new ClaudeApiError(resp.status, msg);
  }
  return new Result(JSON.parse(text), latency);
}

export class Result {
  constructor(raw, latencyMs) { this.raw = raw; this.latency = latencyMs; }
  get content() { return this.raw.content || []; }
  get text() { return this.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'); }
  get stop() { return this.raw.stop_reason || ''; }
  get model() { return this.raw.model || ''; }
  get inTok() { return this.raw.usage?.input_tokens || 0; }
  get outTok() { return this.raw.usage?.output_tokens || 0; }
  get cacheWrite() { return this.raw.usage?.cache_creation_input_tokens || 0; }
  get cacheRead() { return this.raw.usage?.cache_read_input_tokens || 0; }
  get toolUses() { return this.content.filter((b) => b.type === 'tool_use'); }
  get usageLine() {
    return `${Math.round(this.latency)} ms · in=${this.inTok} out=${this.outTok}` +
      (this.cacheWrite || this.cacheRead ? ` · cache_write=${this.cacheWrite} cache_read=${this.cacheRead}` : '') +
      ` · stop=${this.stop}`;
  }
}
