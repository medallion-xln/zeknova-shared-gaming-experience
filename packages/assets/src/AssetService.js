/** Parsed asset ownership. A lease pins cached data; detached instances own their clone. */
export class AssetService {
  constructor({ baseURL = 'http://localhost/', budgetBytes = 64 * 1024 * 1024, timeoutMs = 45000 } = {}) {
    if (!Number.isFinite(budgetBytes) || budgetBytes < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('invalid asset limits');
    this.baseURL = baseURL; this.budgetBytes = budgetBytes; this.timeoutMs = timeoutMs;
    this.loaders = new Map(); this.entries = new Map(); this.pending = new Map(); this.disposed = false; this.clock = 0;
    this.metrics = { loads: 0, hits: 0, joined: 0, failures: 0, retries: 0, evictions: 0, cancelled: 0 };
  }
  key(path, variant = '') { const url = new URL(path, this.baseURL); url.hash = ''; return `${url.href}|${variant}`; }
  register(type, loader) {
    if (this.loaders.has(type) || typeof loader.load !== 'function' || typeof loader.clone !== 'function') throw new TypeError('unique loader with load and clone required');
    this.loaders.set(type, loader);
  }
  async acquire(path, { type, variant = '', owner = 'anonymous', signal, retries = 0, dependencies = [] } = {}) {
    if (this.disposed) throw new Error('asset service disposed');
    if (!Number.isSafeInteger(retries) || retries < 0 || retries > 10) throw new RangeError('retries must be 0..10');
    if (signal?.aborted) throw new Error('asset request cancelled');
    const loader = this.loaders.get(type); if (!loader) throw new Error(`unknown asset loader ${type}`);
    const key = `${type}:${this.key(path, variant)}`; let entry = this.entries.get(key), pending;
    if (entry) this.metrics.hits++;
    else {
      pending = this.pending.get(key);
      if (pending) this.metrics.joined++;
      else {
        const controller = new AbortController();
        pending = { controller, consumers: 0 };
        const load = async () => {
          for (let attempt = 0; ; attempt++) {
            let timer, abortWork, expired = false;
            try {
              if (controller.signal.aborted || this.disposed) throw new Error('asset load cancelled');
              this.metrics.loads++;
              const work = Promise.resolve().then(() => loader.load(new URL(path, this.baseURL).href, { signal: controller.signal, variant }));
              // A late success owns resources too; release it after timeout/disposal.
              work.then(value => { if (expired || controller.signal.aborted || this.disposed) loader.dispose?.(value); }, () => {});
              const cancelled = new Promise((_, reject) => { abortWork = () => reject(new Error('asset load cancelled')); controller.signal.addEventListener('abort', abortWork, { once: true }); });
              const value = await Promise.race([work, cancelled, new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error(`asset timeout: ${key}`)); }, this.timeoutMs); })]);
              if (this.disposed || controller.signal.aborted) throw new Error('asset load cancelled');
              const bytes = loader.size?.(value) ?? 0;
              if (!Number.isFinite(bytes) || bytes < 0) { loader.dispose?.(value); throw new Error('invalid asset size'); }
              const next = { key, value, loader, bytes, owners: new Map(), refs: 0, used: ++this.clock, dependencies: dependencies.map(p => `${type}:${this.key(p)}`), pins: 0 };
              for (const dep of next.dependencies) { const d = this.entries.get(dep); if (!d) { loader.dispose?.(value); throw new Error(`dependency not loaded: ${dep}`); } }
              for (const dep of next.dependencies) this.entries.get(dep).pins++;
              this.entries.set(key, next); return next;
            } catch (error) {
              this.metrics.failures++;
              if (attempt >= retries || controller.signal.aborted || this.disposed) throw error;
              this.metrics.retries++;
            } finally { clearTimeout(timer); if (abortWork) controller.signal.removeEventListener('abort', abortWork); }
          }
        };
        pending.promise = load().finally(() => { if (this.pending.get(key) === pending) this.pending.delete(key); }); this.pending.set(key, pending);
      }
      pending.consumers++;
      try {
        entry = await new Promise((resolve, reject) => {
          const abort = () => { this.metrics.cancelled++; cleanup(); reject(new Error('asset request cancelled')); };
          const cleanup = () => signal?.removeEventListener('abort', abort);
          signal?.addEventListener('abort', abort, { once: true });
          pending.promise.then(v => { cleanup(); resolve(v); }, e => { cleanup(); reject(e); });
        });
      } finally {
        pending.consumers--;
        if (!pending.consumers && signal?.aborted) { pending.controller.abort(); if (this.pending.get(key) === pending) this.pending.delete(key); }
      }
    }
    if (signal?.aborted || this.disposed) { this._evict(); throw new Error('asset request cancelled'); }
    entry.refs++; entry.used = ++this.clock; entry.owners.set(owner, (entry.owners.get(owner) ?? 0)+1);
    let released = false;
    this._evict();
    return { id: key, value: entry.value, instantiate: () => { if (released || this.disposed) throw new Error('lease released'); return loader.clone(entry.value); }, release: () => {
      if (released) return; released = true; entry.refs--; const count = entry.owners.get(owner)-1; if (count) entry.owners.set(owner,count); else entry.owners.delete(owner); this._evict();
    } };
  }
  async loadDetached(path, options) { const lease = await this.acquire(path, options); try { return lease.instantiate(); } finally { lease.release(); } }
  invalidate(path, variant = '', type = null) { const pathKey = this.key(path,variant), entries = [...this.entries.values()].filter(e => type ? e.key === `${type}:${pathKey}` : e.key.endsWith(`:${pathKey}`)); if (entries.some(e => e.refs || e.pins)) return false; for (const e of entries) this._remove(e); return true; }
  _remove(entry) { this.entries.delete(entry.key); for (const dep of entry.dependencies) { const d = this.entries.get(dep); if (d) d.pins--; } entry.loader.dispose?.(entry.value); this.metrics.evictions++; }
  _evict() {
    let bytes = [...this.entries.values()].reduce((n,e) => n+e.bytes,0);
    while (bytes > this.budgetBytes) {
      const candidate = [...this.entries.values()].filter(e => !e.refs && !e.pins).sort((a,b) => a.used-b.used)[0];
      if (!candidate) break; bytes -= candidate.bytes; this._remove(candidate);
    }
  }
  status() { return { ...this.metrics, entries: this.entries.size, pending: this.pending.size, bytes: [...this.entries.values()].reduce((n,e) => n+e.bytes,0), references: [...this.entries.values()].reduce((n,e) => n+e.refs,0), budgetBytes: this.budgetBytes }; }
  dispose() { if (this.disposed) return; this.disposed = true; for (const p of this.pending.values()) p.controller.abort(); for (const e of [...this.entries.values()]) this._remove(e); this.loaders.clear(); }
}
