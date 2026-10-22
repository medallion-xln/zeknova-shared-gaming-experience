/**
 * Fetch-boundary cache for immutable binary assets (GLB/KTX2/WASM): coalesces concurrent requests for the
 * same URL and serves repeats from a byte-budgeted LRU without touching the loaders. ZGE-00 measured the
 * same enemy model downloaded 11× per session because each loader instance has its own queue and no cache.
 */
const DEFAULT_PATTERN = /\.(?:glb|gltf|ktx2|basis|wasm)(?:[?#]|$)/i;

export class AssetRequestCache {
  // Default budget: 64 MB. ZGE-02 measured a 160 MB budget holding 115 MB of ArrayBuffers after a long session (heap 483 MB vs ~380 MB);
  // the hot set (enemy/officer models re-requested per spawn) is a few MB, so LRU at 64 MB keeps the hits and bounds the cost.
  constructor({ fetchImpl, budgetBytes = 64 * 1024 * 1024, pattern = DEFAULT_PATTERN, now = () => Date.now(), onEvent = null } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("AssetRequestCache needs fetch");
    Object.assign(this, { fetchImpl, budgetBytes, pattern, now, onEvent });
    /** @type {Map<string, { bytes: ArrayBuffer, type: string, size: number, at: number, hits: number }>} */ this.entries = new Map();
    /** @type {Map<string, Promise<any>>} */ this.inFlight = new Map();
    this.bytes = 0; this.stats = { requests: 0, matched: 0, hits: 0, joined: 0, misses: 0, bytesDownloaded: 0, bytesServedFromCache: 0, evictions: 0, bypassed: 0, errors: 0 };
  }
  matches(url) { return this.pattern.test(url); }
  key(url) { return url.replace(/#.*$/, ""); }
  _evict(needed) { while (this.bytes + needed > this.budgetBytes && this.entries.size) { const [key, entry] = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at)[0]; this.entries.delete(key); this.bytes -= entry.size; this.stats.evictions += 1; } }
  _respond(entry, from) { return new Response(entry.bytes.slice(0), { status: 200, headers: { "Content-Type": entry.type, "Content-Length": String(entry.size), "X-ZGE-Asset-Cache": from } }); }
  async fetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    this.stats.requests += 1;
    if (!this.matches(url) || (init.method && init.method !== "GET")) { this.stats.bypassed += 1; return this.fetchImpl(input, init); }
    this.stats.matched += 1;
    const key = this.key(url);
    const hit = this.entries.get(key);
    if (hit) { hit.hits += 1; hit.at = this.now(); this.stats.hits += 1; this.stats.bytesServedFromCache += hit.size; this.onEvent?.("asset:cache-hit", { url: key, size: hit.size }); return this._respond(hit, "hit"); }
    if (this.inFlight.has(key)) { this.stats.joined += 1; this.onEvent?.("asset:joined", { url: key }); const entry = await this.inFlight.get(key); return entry ? this._respond(entry, "joined") : this.fetchImpl(input, init); }
    this.stats.misses += 1;
    const promise = (async () => {
      try {
        const response = await this.fetchImpl(input, { ...init, signal: undefined });
        if (!response.ok) { this.stats.errors += 1; return null; }
        const bytes = await response.arrayBuffer(); const size = bytes.byteLength; const type = response.headers.get("Content-Type") || "application/octet-stream";
        this.stats.bytesDownloaded += size;
        if (size <= this.budgetBytes) { this._evict(size); this.entries.set(key, { bytes, type, size, at: this.now(), hits: 0 }); this.bytes += size; }
        return { bytes, type, size };
      } catch (error) { this.stats.errors += 1; throw error; }
      finally { this.inFlight.delete(key); }
    })();
    this.inFlight.set(key, promise.catch(() => null));
    const entry = await promise;
    if (!entry) return this.fetchImpl(input, init); // let the loader see the real error/status
    this.onEvent?.("asset:downloaded", { url: key, size: entry.size });
    return this._respond(entry, "miss");
  }
  status() { return Object.freeze({ ...this.stats, entries: this.entries.size, bytes: this.bytes, budgetBytes: this.budgetBytes, inFlight: this.inFlight.size, top: [...this.entries.entries()].sort((a, b) => b[1].hits - a[1].hits).slice(0, 5).map(([k, v]) => ({ url: k.split("/").slice(-2).join("/"), hits: v.hits, kb: Math.round(v.size / 1024) })) }); }
  clear() { this.entries.clear(); this.bytes = 0; }
}

/** Install on a window: wraps window.fetch; returns a disposer that restores it. */
export function installAssetRequestCache(win, options = {}) {
  const originalFetch = win.fetch; const cache = new AssetRequestCache({ fetchImpl: (...a) => originalFetch.apply(win, a), ...options });
  const wrapped = function zgeAssetFetch(input, init) { return cache.fetch(input, init); }; wrapped.__zgeAssetCache = true; win.fetch = wrapped;
  return { cache, dispose() { if (win.fetch === wrapped) win.fetch = originalFetch; cache.clear(); } };
}
