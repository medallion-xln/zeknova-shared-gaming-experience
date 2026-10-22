/**
 * LoaderWatchdog — instruments a GLTFLoader class (the shared vendor module instance) so every load is
 * tracked from start to settle. It turns a silent hang into a report: which URL, how long, whether the
 * loader has a KTX2 loader attached, and how many transcoder workers are alive. It never changes outcomes.
 */
export class LoaderWatchdog {
  constructor({ now = () => (globalThis.performance?.now?.() ?? Date.now()), stallMs = 15000, onEvent = null, workerObserver = null, history = 400 } = {}) {
    Object.assign(this, { now, stallMs, onEvent, workerObserver, historyLimit: history });
    this.pending = new Map(); this.completed = []; this.nextId = 1; this.stalls = 0; this.failures = 0; this.patched = null; this.timer = null;
  }
  patch(GLTFLoaderClass, { setIntervalImpl = (fn, ms) => setInterval(fn, ms), clearIntervalImpl = (h) => clearInterval(h) } = {}) {
    if (!GLTFLoaderClass?.prototype || GLTFLoaderClass.prototype.__zgeWatchdog) return false;
    const proto = GLTFLoaderClass.prototype; const original = proto.load; const self = this;
    proto.load = function zgeWatchedLoad(url, onLoad, onProgress, onError) {
      const id = self.nextId++; const entry = { id, url: String(url), startedAt: self.now(), ktx2: !!this.ktx2Loader, meshopt: !!this.meshoptDecoder, settled: false };
      self.pending.set(id, entry);
      const settle = (status, detail) => { if (entry.settled) return; entry.settled = true; entry.status = status; entry.ms = self.now() - entry.startedAt; if (detail) entry.detail = detail; self.pending.delete(id); self.completed.push(entry); if (self.completed.length > self.historyLimit) self.completed.shift(); if (status === "error") self.failures += 1; self.onEvent?.("asset:load-settled", { id, url: entry.url, status, ms: Math.round(entry.ms) }); };
      return original.call(this, url, (gltf) => { settle("ok"); onLoad?.(gltf); }, onProgress, (error) => { settle("error", String(error?.message ?? error)); onError?.(error); });
    };
    proto.__zgeWatchdog = true; this.patched = { proto, original };
    this.timer = setIntervalImpl(() => this.sweep(), Math.min(this.stallMs, 5000)); this.timer?.unref?.(); this.clearIntervalImpl = clearIntervalImpl;
    return true;
  }
  sweep(now = this.now()) {
    const stalled = [];
    for (const entry of this.pending.values()) { const age = now - entry.startedAt; if (age >= this.stallMs && !entry.reported) { entry.reported = true; this.stalls += 1; stalled.push(entry); this.onEvent?.("asset:load-stalled", { id: entry.id, url: entry.url, ms: Math.round(age), ktx2Attached: entry.ktx2, meshoptAttached: entry.meshopt, workers: this.workerObserver?.status() ?? null }); } }
    return stalled;
  }
  status() { const ms = this.completed.filter((e) => e.status === "ok").map((e) => e.ms).sort((a, b) => a - b); const q = (p) => ms.length ? +ms[Math.min(ms.length - 1, Math.floor((ms.length - 1) * p))].toFixed(1) : null; return Object.freeze({ patched: !!this.patched, pending: [...this.pending.values()].map((e) => ({ url: e.url.split("/").slice(-2).join("/"), ms: Math.round(this.now() - e.startedAt), ktx2: e.ktx2 })), completed: this.completed.length, failures: this.failures, stalls: this.stalls, loadMs: { p50: q(0.5), p95: q(0.95), max: ms.length ? +ms[ms.length - 1].toFixed(1) : null }, stallMs: this.stallMs }); }
  dispose() { if (this.timer !== null) { this.clearIntervalImpl?.(this.timer); this.timer = null; } if (this.patched) { this.patched.proto.load = this.patched.original; delete this.patched.proto.__zgeWatchdog; this.patched = null; } }
}
