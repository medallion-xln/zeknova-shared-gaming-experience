/**
 * EngineMetrics — structured observability: counters, gauges, timers with
 * percentiles, lifecycle transitions, plugin phases, errors and recovery.
 * Everything is inspectable through `snapshot()`; nothing is written to the DOM.
 */
export class EngineMetrics {
  constructor({ now = () => (globalThis.performance?.now?.() ?? Date.now()), sampleWindow = 600, maxErrors = 50 } = {}) {
    this.now = now; this.sampleWindow = sampleWindow; this.maxErrors = maxErrors;
    this.counters = new Map(); this.gauges = new Map(); this.timers = new Map();
    this.errors = []; this.recoveries = []; this.transitions = []; this.createdAt = now();
  }

  counter(name, delta = 1) { this.counters.set(name, (this.counters.get(name) || 0) + delta); return this.counters.get(name); }
  gauge(name, value) { this.gauges.set(name, value); return value; }

  /** Record a duration sample (ms) under `name`. */
  record(name, ms) {
    let timer = this.timers.get(name);
    if (!timer) { timer = { count: 0, total: 0, min: Infinity, max: -Infinity, last: 0, samples: [] }; this.timers.set(name, timer); }
    timer.count += 1; timer.total += ms; timer.min = Math.min(timer.min, ms); timer.max = Math.max(timer.max, ms); timer.last = ms;
    timer.samples.push(ms); if (timer.samples.length > this.sampleWindow) timer.samples.shift();
    return timer;
  }

  /** Start a timer; call `.end()` to record. Returns the elapsed ms from end(). */
  time(name) { const began = this.now(); return { end: () => { const ms = this.now() - began; this.record(name, ms); return ms; } }; }

  /** Wrap a sync or async function, recording its duration. */
  async measure(name, fn) { const t = this.time(name); try { return await fn(); } finally { t.end(); } }

  percentile(name, p) {
    const timer = this.timers.get(name); if (!timer || timer.samples.length === 0) return null;
    const sorted = [...timer.samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))];
  }

  recordError(scope, error, detail = null) {
    const entry = Object.freeze({ at: this.now(), scope, message: String(error?.message ?? error), name: error?.name ?? "Error", detail });
    this.errors.push(entry); if (this.errors.length > this.maxErrors) this.errors.shift();
    this.counter("errors.total"); this.counter(`errors.${scope.split(":")[0]}`);
    return entry;
  }

  recordRecovery(scope, detail = null) {
    const entry = Object.freeze({ at: this.now(), scope, detail }); this.recoveries.push(entry); if (this.recoveries.length > this.maxErrors) this.recoveries.shift();
    this.counter("recoveries.total"); return entry;
  }

  recordTransition(from, to, transition) {
    this.transitions.push(Object.freeze({ at: this.now(), from, to, transition })); if (this.transitions.length > 200) this.transitions.shift();
    this.counter(`lifecycle.${transition}`);
  }

  timerSummary(name) {
    const timer = this.timers.get(name); if (!timer) return null;
    return Object.freeze({ count: timer.count, mean: timer.count ? timer.total / timer.count : 0, min: timer.min, max: timer.max, last: timer.last, p50: this.percentile(name, 0.5), p95: this.percentile(name, 0.95), p99: this.percentile(name, 0.99) });
  }

  snapshot() {
    const timers = {}; for (const name of this.timers.keys()) timers[name] = this.timerSummary(name);
    return Object.freeze({ uptimeMs: this.now() - this.createdAt, counters: Object.fromEntries(this.counters), gauges: Object.fromEntries(this.gauges), timers, errors: [...this.errors], recoveries: [...this.recoveries], transitions: [...this.transitions] });
  }

  reset() { this.counters.clear(); this.gauges.clear(); this.timers.clear(); this.errors.length = 0; this.recoveries.length = 0; this.transitions.length = 0; this.createdAt = this.now(); }
}
