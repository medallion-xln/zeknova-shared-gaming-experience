/**
 * ZekNova — WorldClaw generative 3D provider interface
 * Location: /src/worldclaw/Generative3DProvider.js
 *
 * The seam where an external generation service can be attached — and the
 * guarantee that ZekNova never needs one.
 *
 * ── THE HARD RULE ────────────────────────────────────────────────────────
 * Gameplay may NEVER depend on a third-party inference endpoint remaining
 * online. Not "should not". A player mid-campaign with no network, or with the
 * provider's API returning 503, must see the same world they saw yesterday.
 *
 * That is enforced structurally rather than by discipline:
 *   - the default provider is `NullProvider`, which generates nothing
 *   - every provider call is wrapped so a throw, a timeout or a malformed
 *     response degrades to the authored-asset path instead of propagating
 *   - `WorldAssetRegistry.resolve()` only consults a provider at tier 5, after
 *     four authored/parametric tiers have already failed
 *   - and generation is never awaited on the critical path: a provider result
 *     that has not arrived is simply absent, and the world ships without it
 *
 * ── WHY THE INTERFACE IS SHAPED LIKE THIS ────────────────────────────────
 * `resolveCached()` is synchronous and `generateAsset()` is asynchronous, on
 * purpose. Generation happens offline, in a tool run, and lands in a cache;
 * play-time resolution only ever reads that cache. A provider that could block
 * the resolver would put a network round-trip inside the frame that spawns a
 * settlement, which is exactly the dependency this file exists to prevent.
 *
 * ── NO FABRICATED APIS ───────────────────────────────────────────────────
 * No concrete provider for Hunyuan3D, Meshy, Tripo or WorldClaw is implemented
 * here, because at the time of writing none of them ships a verified,
 * production-usable client this repository could call. The official
 * `Tencent-Hunyuan/Hunyuan3D-WorldClaw` repository contains a README and
 * teaser images — no code, no weights, no license. Inventing an SDK call for it
 * would be fabricating an API.
 *
 * What is provided instead is the interface those systems would implement, and
 * a working `CachedFileProvider` that reads meshes a human or an offline tool
 * has already produced and placed on disk. That path is real today.
 */

import { validateGeneratedAsset, validateGeneratedRegion, SECURITY_LIMITS } from "./SecurityValidation.js";

/**
 * The contract. Subclass and override whichever methods a provider supports;
 * the base implementation of each is a safe no-op, so a partial provider is a
 * legitimate provider.
 */
export class Generative3DProvider {
  /** Stable identifier, surfaced in the spec so a world records its origin. */
  get id() { return "abstract"; }

  /** Whether this provider can do anything right now (network, keys, cache). */
  isAvailable() { return false; }

  /**
   * Synchronous cache read used by the asset resolver at tier 5.
   * MUST NOT perform I/O or block. Return null when nothing is cached.
   */
  resolveCached(_request) { return null; }

  /** Offline: produce one asset. Returns null when it cannot. */
  async generateAsset(_spec) { return null; }

  /** Offline: produce one material description. */
  async generateMaterial(_spec) { return null; }

  /** Offline: produce a whole region's worth of geometry. */
  async generateRegion(_spec) { return null; }
}

/**
 * The default. Generates nothing, is always available, never fails.
 *
 * This being the default is the whole fallback architecture: a ZekNova build
 * with no configuration at all runs the authored + procedural pipeline and
 * never reaches for a network.
 */
export class NullProvider extends Generative3DProvider {
  get id() { return "null"; }
  isAvailable() { return true; }
  resolveCached() { return null; }
}

/**
 * Reads generated assets that already exist on disk or in a served directory.
 *
 * This is the real, working provider: an artist or an offline tool run (Blender,
 * a local Hunyuan3D checkpoint, a Meshy export) drops GLBs into a directory
 * with a manifest, and WorldClaw picks them up as tier-5 assets. No inference
 * happens at play time, and no endpoint has to be up.
 *
 * The manifest is UNTRUSTED input — it may have been produced by an external
 * tool — so every entry passes `validateGeneratedAsset` before it can be
 * resolved. An entry that fails is dropped with a warning, not repaired.
 */
export class CachedFileProvider extends Generative3DProvider {
  #entries = new Map();
  #rejected = [];

  constructor({ manifest = [], baseDir = "./assets/models/generated" } = {}) {
    super();
    this.baseDir = baseDir;
    for (const entry of manifest) {
      const verdict = validateGeneratedAsset(entry, { baseDir });
      if (!verdict.valid) {
        this.#rejected.push({ entry: entry?.id ?? "(unnamed)", reasons: verdict.errors });
        continue;
      }
      /* Index under every biome the asset declares. A validated asset carries
         `biomeTags` (a list), not a single `biome`, so keying it by
         `asset.biome` produced the key "*|role|*" and every lookup missed. */
      for (const biome of verdict.asset.biomeTags.length ? verdict.asset.biomeTags : ["*"]) {
        for (const footprint of [verdict.asset.dimensions.footprint, "*"]) {
          const key = cacheKey({ biome, role: verdict.asset.role, footprint });
          if (!this.#entries.has(key)) this.#entries.set(key, []);
          this.#entries.get(key).push(verdict.asset);
        }
      }
    }
  }

  get id() { return "cached-file"; }
  isAvailable() { return this.#entries.size > 0; }

  /** Assets rejected by validation, for the editor and the discovery report. */
  get rejected() { return [...this.#rejected]; }

  resolveCached(request) {
    const candidates = this.#entries.get(cacheKey(request))
      ?? this.#entries.get(cacheKey({ biome: request?.biome, role: request?.role }))
      ?? null;
    if (!candidates?.length) return null;
    // Deterministic: always the first, sorted at construction. A caller that
    // wants variety supplies a different request, not a different draw.
    return candidates[0];
  }
}

function cacheKey(request) {
  return `${request?.biome ?? "*"}|${request?.role ?? "*"}|${request?.footprint ?? "*"}`;
}

/**
 * Wraps any provider so it can never take the world down.
 *
 * Every method is guarded: a throw becomes null, an async call that exceeds
 * `timeoutMs` becomes null, and a response that fails validation becomes null.
 * The wrapper counts failures so the editor can show "provider degraded" rather
 * than leaving a silently empty world.
 */
export class SafeProvider extends Generative3DProvider {
  #inner;
  #failures = 0;
  #calls = 0;

  constructor(inner, { timeoutMs = 20000, maxFailures = 3 } = {}) {
    super();
    this.#inner = inner ?? new NullProvider();
    this.timeoutMs = timeoutMs;
    this.maxFailures = maxFailures;
  }

  get id() { return `safe(${this.#inner.id})`; }

  /** A provider that has failed repeatedly is treated as absent from then on. */
  isAvailable() {
    if (this.#failures >= this.maxFailures) return false;
    try { return Boolean(this.#inner.isAvailable()); } catch { return false; }
  }

  get health() {
    return Object.freeze({
      provider: this.#inner.id,
      calls: this.#calls,
      failures: this.#failures,
      degraded: this.#failures >= this.maxFailures,
    });
  }

  resolveCached(request) {
    if (!this.isAvailable()) return null;
    this.#calls += 1;
    try {
      const result = this.#inner.resolveCached(request);
      if (!result) return null;
      const verdict = validateGeneratedAsset(result, { baseDir: this.#inner.baseDir });
      if (!verdict.valid) { this.#failures += 1; return null; }
      return verdict.asset;
    } catch {
      this.#failures += 1;
      return null;
    }
  }

  async generateAsset(spec) {
    return this.#guard(() => this.#inner.generateAsset(spec), (value) => {
      const verdict = validateGeneratedAsset(value, { baseDir: this.#inner.baseDir });
      return verdict.valid ? verdict.asset : null;
    });
  }

  async generateMaterial(spec) {
    return this.#guard(() => this.#inner.generateMaterial(spec), (value) => value ?? null);
  }

  async generateRegion(spec) {
    return this.#guard(() => this.#inner.generateRegion(spec), (value) => {
      const verdict = validateGeneratedRegion(value);
      return verdict.valid ? verdict.region : null;
    });
  }

  async #guard(call, validate) {
    if (!this.isAvailable()) return null;
    this.#calls += 1;
    let timer = null;
    try {
      const result = await Promise.race([
        Promise.resolve().then(call),
        new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), this.timeoutMs); }),
      ]);
      if (result === TIMEOUT) { this.#failures += 1; return null; }
      const validated = validate(result);
      if (!validated) this.#failures += 1;
      return validated;
    } catch {
      this.#failures += 1;
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

const TIMEOUT = Symbol("worldclaw.provider.timeout");

/**
 * Build the provider for a run.
 *
 * External generation is OPT-IN and off by default. `enabled: false` — the
 * default — returns a NullProvider regardless of what else is passed, so a
 * misconfiguration cannot accidentally introduce a network dependency.
 */
export function createProvider({ enabled = false, provider = null, timeoutMs = SECURITY_LIMITS.providerTimeoutMs } = {}) {
  if (!enabled || !provider) return new NullProvider();
  return new SafeProvider(provider, { timeoutMs });
}
