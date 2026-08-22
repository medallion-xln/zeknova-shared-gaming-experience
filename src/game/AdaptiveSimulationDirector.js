import { biomeAt } from "../world/Biomes.js";
import {
  SentinelPrimeAdaptiveSignal,
  SENTINEL_PRIME_ADAPTIVE_AUTHORITY,
} from "./SentinelPrimeAdaptiveSignal.js";

export const SIMULATION_TIERS = Object.freeze({
  T0: Object.freeze({ id: "T0", label: "Critical", interval: 0, hz: 60 }),
  T1: Object.freeze({ id: "T1", label: "Near", interval: 1 / 30, hz: 30 }),
  T2: Object.freeze({ id: "T2", label: "Mid", interval: 1 / 8, hz: 8 }),
  T3: Object.freeze({ id: "T3", label: "Far", interval: .5, hz: 2 }),
  T4: Object.freeze({ id: "T4", label: "Off-Biome", interval: 2, hz: .5 }),
});

export const ADAPTIVE_QUALITY_TIERS = Object.freeze({
  Ultra: Object.freeze({ pixelRatio: 1, shadows: true, outlineScale: 1, postScale: 1, splatScale: 1, particleScale: 1 }),
  High: Object.freeze({ pixelRatio: .9, shadows: true, outlineScale: .82, postScale: .85, splatScale: .8, particleScale: .82 }),
  Balanced: Object.freeze({ pixelRatio: .78, shadows: true, outlineScale: .58, postScale: .62, splatScale: .55, particleScale: .65 }),
  Performance: Object.freeze({ pixelRatio: .66, shadows: false, outlineScale: .32, postScale: .35, splatScale: .25, particleScale: .45 }),
  Emergency: Object.freeze({ pixelRatio: .5, shadows: false, outlineScale: 0, postScale: .12, splatScale: 0, particleScale: .25 }),
});

export const ADAPTIVE_FRAME_BUDGET_MS = Object.freeze({
  total: 16.67,
  render: 7.2,
  gameplay: 3.5,
  ai: 2.2,
  physicsCollision: 1.8,
  ui: .7,
  sentinel: .25,
  background: .35,
});

const QUALITY_ORDER = Object.freeze(["Ultra", "High", "Balanced", "Performance", "Emergency"]);
const TIER_ORDER = Object.freeze(["T0", "T1", "T2", "T3", "T4"]);
const nowDefault = () => globalThis.performance?.now?.() ?? Date.now();
const actorPosition = (actor) => actor?.position || actor?.group?.position || null;

export class AdaptiveSpatialIndex {
  constructor({ cellSize = 18 } = {}) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entries = new Map();
  }

  key(x, z) { return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`; }

  clear() { this.cells.clear(); this.entries.clear(); }

  insert(id, entity, position = actorPosition(entity)) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return false;
    const key = this.key(position.x, position.z);
    if (!this.cells.has(key)) this.cells.set(key, new Set());
    this.cells.get(key).add(entity);
    this.entries.set(id, { entity, key });
    return true;
  }

  rebuild(entities = []) {
    this.clear();
    entities.forEach((entity, index) => this.insert(entity?.uuid || entity?.userData?.residentId || entity?.userData?.worldJuggernautSlot || index, entity));
    return this.entries.size;
  }

  queryRadius(position, radius, output = []) {
    output.length = 0;
    if (!position) return output;
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(position.x / this.cellSize);
    const cz = Math.floor(position.z / this.cellSize);
    const radiusSq = radius * radius;
    for (let x = cx - cellRadius; x <= cx + cellRadius; x += 1) {
      for (let z = cz - cellRadius; z <= cz + cellRadius; z += 1) {
        for (const entity of this.cells.get(`${x}:${z}`) || []) {
          const p = actorPosition(entity);
          if (p && (p.x - position.x) ** 2 + (p.z - position.z) ** 2 <= radiusSq) output.push(entity);
        }
      }
    }
    return output;
  }
}

function safeAuthority(authority) {
  return Object.entries(authority).every(([key, value]) => !key.startsWith("can") || value === false);
}

export class AdaptiveSimulationDirector {
  constructor({ game, visualThemeManager = null, primeSignal = null, now = nowDefault, targetFps = 60 } = {}) {
    this.game = game || null;
    this.visualThemeManager = visualThemeManager;
    this.primeSignal = primeSignal || new SentinelPrimeAdaptiveSignal({ now });
    this.now = now;
    this.targetFps = targetFps;
    this.targetFrameMs = 1000 / targetFps;
    this.spatialIndex = new AdaptiveSpatialIndex();
    this.actorState = new WeakMap();
    this.advisoryById = new Map();
    this.backgroundQueue = [];
    this.installed = false;
    this.quality = "High";
    this.frameEwma = this.targetFrameMs;
    this.badFrameRun = 0;
    this.goodFrameRun = 0;
    this.lastFrameAt = 0;
    this.lastPrimeAt = 0;
    this.lastIndexAt = 0;
    this.restore = [];
    this.tierPopulation = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
    this.metrics = {
      frames: 0, frameTimeTotal: 0, maxFrameMs: 0, longFrames: 0,
      aiRequested: 0, aiExecuted: 0, aiDeferred: 0,
      resourceScansRequested: 0, resourceScansExecuted: 0,
      hudRequested: 0, hudExecuted: 0,
      missionContextRequested: 0, missionContextExecuted: 0,
      countScansRequested: 0, countScansExecuted: 0,
      savesRequested: 0, savesFlushed: 0,
      qualityChanges: 0, primeAdvisories: 0, primeRejected: 0,
    };
  }

  actorId(actor, index = 0) {
    return String(actor?.uuid || actor?.userData?.worldJuggernautSlot || actor?.userData?.commissioningId || actor?.userData?.residentId || actor?.userData?.bossId || actor?.userData?.enemyType || `actor-${index}`);
  }

  classify(actor) {
    const position = actorPosition(actor);
    const player = actorPosition(this.game?.player);
    if (!position || !player) return "T4";
    const data = actor.userData || {};
    const dx = position.x - player.x;
    const dz = position.z - player.z;
    const distanceSq = dx * dx + dz * dz;
    const isBoss = data.isMissionBoss || data.bossId || actor === this.game?.bossManager?.boss;
    const missionCritical = data.missionCritical || data.commissioningId || data.isCommissioningAttacker;
    const attacking = data.hostile !== false && (data.attackCooldown != null || data.enemyType || data.isEnemy);
    if (isBoss || missionCritical || (attacking && distanceSq <= 36 * 36)) return "T0";
    if (distanceSq <= 48 * 48) return "T1";
    const sameBiome = biomeAt(position.x).id === biomeAt(player.x).id;
    if (sameBiome && distanceSq <= 72 * 72) return "T2";
    if (sameBiome) return "T3";
    return "T4";
  }

  validatedTier(actor, deterministicTier) {
    const advisory = this.advisoryById.get(this.actorId(actor));
    if (!advisory || !TIER_ORDER.includes(advisory)) return deterministicTier;
    // Prime may only request *more* fidelity. It cannot sleep or demote an actor.
    return TIER_ORDER.indexOf(advisory) < TIER_ORDER.indexOf(deterministicTier) ? advisory : deterministicTier;
  }

  scheduleActor(actor, delta) {
    const deterministic = this.classify(actor);
    const tier = this.validatedTier(actor, deterministic);
    const config = SIMULATION_TIERS[tier];
    const state = this.actorState.get(actor) || { elapsed: 0, tier };
    state.elapsed += delta;
    const promoted = TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(state.tier);
    state.tier = tier;
    this.actorState.set(actor, state);
    this.tierPopulation[tier] += 1;
    if (config.interval === 0 || promoted || state.elapsed >= config.interval) {
      const elapsed = state.elapsed;
      state.elapsed = 0;
      return { execute: true, tier, elapsed };
    }
    return { execute: false, tier, elapsed: state.elapsed };
  }

  buildObservation() {
    const player = actorPosition(this.game?.player);
    if (!player) return Object.freeze({ actors: [] });
    const actors = [...(this.game?.enemies || []), ...(this.game?.residentNPCs || [])].slice(0, 160).map((actor, index) => {
      const position = actorPosition(actor) || player;
      const distance = Math.hypot(position.x - player.x, position.z - player.z);
      const data = actor.userData || {};
      return Object.freeze({
        id: this.actorId(actor, index), distance,
        sameBiome: biomeAt(position.x).id === biomeAt(player.x).id,
        boss: !!(data.isMissionBoss || data.bossId || actor === this.game?.bossManager?.boss),
        immediateThreat: data.hostile !== false && distance <= 36,
        missionCritical: !!(data.missionCritical || data.commissioningId || data.isCommissioningAttacker),
        infrastructureCritical: !!data.infrastructureCritical,
        civilian: !!data.residentId,
      });
    });
    return Object.freeze({
      frameTime: this.frameEwma,
      biome: biomeAt(player.x).id,
      mission: this.game?.missionStats?.currentMission || null,
      bossActive: !!this.game?.bossManager?.active,
      actors: Object.freeze(actors),
    });
  }

  requestPrimeAdvisory() {
    if (!this.primeSignal || !safeAuthority(this.primeSignal.authority || SENTINEL_PRIME_ADAPTIVE_AUTHORITY)) {
      this.metrics.primeRejected += 1;
      return;
    }
    const observation = this.buildObservation();
    if (this.worker) {
      this.worker.postMessage({ type: "classify", observation });
      return;
    }
    queueMicrotask(() => {
      try {
        const result = this.primeSignal.recommend(observation);
        if (!safeAuthority(result?.authority || {})) throw new Error("Prime authority contract violation");
        this.advisoryById.clear();
        for (const row of result.recommendations || []) this.advisoryById.set(String(row.id), row.suggestedTier);
        this.metrics.primeAdvisories += 1;
      } catch {
        this.metrics.primeRejected += 1;
        this.advisoryById.clear();
      }
    });
  }

  setupWorker() {
    if (typeof Worker !== "function") return false;
    try {
      this.worker = new Worker(new URL("../workers/adaptive-runtime-worker.js", import.meta.url), { type: "module", name: "zeknova-adaptive-runtime" });
      this.worker.onmessage = (event) => {
        const result = event.data;
        if (result?.type !== "recommendations" || !safeAuthority(result.authority || {})) { this.metrics.primeRejected += 1; return; }
        this.advisoryById.clear();
        for (const row of result.recommendations || []) this.advisoryById.set(String(row.id), row.suggestedTier);
        this.metrics.primeAdvisories += 1;
      };
      this.worker.onerror = () => { this.worker?.terminate?.(); this.worker = null; };
      return true;
    } catch {
      this.worker = null;
      return false;
    }
  }

  sampleFrame(now) {
    if (this.lastFrameAt) {
      const frameMs = Math.min(250, Math.max(0, now - this.lastFrameAt));
      this.metrics.frames += 1;
      this.metrics.frameTimeTotal += frameMs;
      this.metrics.maxFrameMs = Math.max(this.metrics.maxFrameMs, frameMs);
      if (frameMs > 33.3) this.metrics.longFrames += 1;
      this.frameEwma = this.frameEwma * .94 + frameMs * .06;
      if (this.frameEwma > 24) { this.badFrameRun += 1; this.goodFrameRun = 0; }
      else if (this.frameEwma < 17.8) { this.goodFrameRun += 1; this.badFrameRun = Math.max(0, this.badFrameRun - 1); }
      else { this.badFrameRun = Math.max(0, this.badFrameRun - 1); this.goodFrameRun = Math.max(0, this.goodFrameRun - 1); }
      if (this.badFrameRun >= 90) { this.changeQuality(1); this.badFrameRun = 0; }
      else if (this.goodFrameRun >= 600) { this.changeQuality(-1); this.goodFrameRun = 0; }
    }
    this.lastFrameAt = now;
    if (now - this.lastIndexAt >= 500) {
      this.spatialIndex.rebuild([...(this.game?.enemies || []), ...(this.game?.residentNPCs || [])]);
      this.lastIndexAt = now;
    }
    if (now - this.lastPrimeAt >= 500) { this.requestPrimeAdvisory(); this.lastPrimeAt = now; }
    this.drainBackgroundBudget();
  }

  changeQuality(direction) {
    const index = QUALITY_ORDER.indexOf(this.quality);
    const next = QUALITY_ORDER[Math.max(0, Math.min(QUALITY_ORDER.length - 1, index + direction))];
    if (!next || next === this.quality) return;
    this.quality = next;
    this.metrics.qualityChanges += 1;
    const profile = ADAPTIVE_QUALITY_TIERS[next];
    const renderer = this.game?.renderer;
    if (renderer?.setPixelRatio) renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2) * profile.pixelRatio);
    if (renderer?.shadowMap) renderer.shadowMap.enabled = profile.shadows;
    this.visualThemeManager?.setAdaptiveQuality?.(next, profile);
  }

  defer(task) { if (typeof task === "function") this.backgroundQueue.push(task); }

  drainBackgroundBudget() {
    const began = this.now();
    while (this.backgroundQueue.length && this.now() - began < ADAPTIVE_FRAME_BUDGET_MS.background) {
      try { this.backgroundQueue.shift()(); } catch { /* optional background work is isolated */ }
    }
  }

  wrapMethod(target, name, create) {
    if (!target || typeof target[name] !== "function") return;
    const original = target[name].bind(target);
    target[name] = create(original);
    this.restore.push(() => { target[name] = original; });
  }

  install() {
    if (this.installed || !this.game) return this;
    this.installed = true;
    this.setupWorker();
    const game = this.game;

    this.wrapMethod(game, "updateEnemyUnit", (original) => (actor, delta, ...rest) => {
      this.metrics.aiRequested += 1;
      const scheduled = this.scheduleActor(actor, delta);
      if (!scheduled.execute) { this.metrics.aiDeferred += 1; return undefined; }
      this.metrics.aiExecuted += 1;
      const applied = scheduled.tier === "T0" ? delta : Math.min(scheduled.elapsed, scheduled.tier === "T1" ? .067 : .125);
      const skipped = Math.max(0, scheduled.elapsed - applied);
      if (skipped && Number.isFinite(actor?.userData?.attackCooldown)) actor.userData.attackCooldown = Math.max(0, actor.userData.attackCooldown - skipped);
      return original(actor, applied, ...rest);
    });

    let lastResourceScanAt = -Infinity;
    this.wrapMethod(game, "updateResourceInteraction", (original) => (...args) => {
      this.metrics.resourceScansRequested += 1;
      const now = this.now();
      if (now - lastResourceScanAt < 100) return;
      lastResourceScanAt = now;
      this.metrics.resourceScansExecuted += 1;
      return original(...args);
    });

    let residentElapsed = 0;
    this.wrapMethod(game, "updateVillageResidents", (original) => (delta, ...args) => {
      residentElapsed += delta;
      if (residentElapsed < .2) return;
      const elapsed = residentElapsed;
      residentElapsed = 0;
      return original(elapsed, ...args);
    });

    let hudAt = -Infinity;
    this.wrapMethod(game, "updateHud", (original) => (force = false, ...args) => {
      this.metrics.hudRequested += 1;
      const now = this.now();
      if (!force && now - hudAt < 200) return;
      hudAt = now;
      this.metrics.hudExecuted += 1;
      return original(force, ...args);
    });

    let missionContext = null;
    let missionContextAt = -Infinity;
    const invalidateMissionContext = () => { missionContext = null; missionContextAt = -Infinity; };
    this.wrapMethod(game, "getMissionContext", (original) => (...args) => {
      this.metrics.missionContextRequested += 1;
      const now = this.now();
      if (missionContext && now - missionContextAt < 100) return missionContext;
      missionContextAt = now;
      this.metrics.missionContextExecuted += 1;
      missionContext = original(...args);
      return missionContext;
    });

    if (game.buildings) {
      let countCache = null;
      let countVersion = -1;
      const invalidate = () => { countCache = null; countVersion = -1; };
      this.wrapMethod(game.buildings, "addRecord", (original) => (...args) => {
        const result = original(...args);
        invalidate();
        invalidateMissionContext();
        game.updateHud?.(true);
        return result;
      });
      this.wrapMethod(game.buildings, "countByType", (original) => (...args) => {
        this.metrics.countScansRequested += 1;
        const version = game.buildings.records?.length || 0;
        if (countCache && countVersion === version) return countCache;
        this.metrics.countScansExecuted += 1;
        countVersion = version;
        countCache = Object.freeze({ ...original(...args) });
        return countCache;
      });
    }

    let saveTimer = null;
    let savePromise = null;
    let resolveSave = null;
    const flushSave = async () => {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (!savePromise) return;
      const resolve = resolveSave;
      const pending = savePromise;
      savePromise = null;
      resolveSave = null;
      try { await this.originalSave(); this.metrics.savesFlushed += 1; resolve?.(); } catch (error) { resolve?.(error); }
      return pending;
    };
    if (typeof game.save === "function") {
      this.originalSave = game.save.bind(game);
      game.save = () => {
        this.metrics.savesRequested += 1;
        if (!savePromise) savePromise = new Promise((resolve) => { resolveSave = resolve; });
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 800);
        return savePromise;
      };
      game.flushAdaptiveSave = flushSave;
      this.restore.push(() => { if (saveTimer) clearTimeout(saveTimer); game.save = this.originalSave; delete game.flushAdaptiveSave; });
      this.onPageHide = () => { void flushSave(); };
      globalThis.addEventListener?.("pagehide", this.onPageHide);
      globalThis.addEventListener?.("visibilitychange", this.onPageHide);
    }

    const tick = (now) => {
      if (!this.installed || game.disposed) return;
      this.tierPopulation = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
      this.sampleFrame(now);
      this.frameHandle = requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame === "function") this.frameHandle = requestAnimationFrame(tick);
    this.mountTelemetry();
    globalThis.ZekNovaAdaptiveRuntime = Object.freeze({
      report: () => this.report(),
      authority: SENTINEL_PRIME_ADAPTIVE_AUTHORITY,
      tiers: SIMULATION_TIERS,
      budgets: ADAPTIVE_FRAME_BUDGET_MS,
    });
    return this;
  }

  mountTelemetry() {
    if (typeof document === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    const node = document.getElementById("zeknova-adaptive-runtime-qa") || document.body.appendChild(document.createElement("span"));
    node.id = "zeknova-adaptive-runtime-qa";
    node.setAttribute("aria-hidden", "true");
    node.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1";
    this.telemetryTimer = setInterval(() => { node.textContent = JSON.stringify(this.report()); }, 500);
  }

  report() {
    const frames = Math.max(1, this.metrics.frames);
    const renderInfo = this.game?.renderer?.info || {};
    const tierPopulation = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
    for (const actor of [...(this.game?.enemies || []), ...(this.game?.residentNPCs || [])]) tierPopulation[this.validatedTier(actor, this.classify(actor))] += 1;
    return Object.freeze({
      implemented: true,
      authority: SENTINEL_PRIME_ADAPTIVE_AUTHORITY,
      quality: this.quality,
      frameBudgetMs: ADAPTIVE_FRAME_BUDGET_MS,
      fps: +(1000 / Math.max(.001, this.frameEwma)).toFixed(1),
      averageFrameMs: +(this.metrics.frameTimeTotal / frames).toFixed(2),
      maxFrameMs: +this.metrics.maxFrameMs.toFixed(2),
      longFrames: this.metrics.longFrames,
      tierPopulation,
      aiUpdates: { requested: this.metrics.aiRequested, executed: this.metrics.aiExecuted, deferred: this.metrics.aiDeferred, reductionFactor: +(this.metrics.aiRequested / Math.max(1, this.metrics.aiExecuted)).toFixed(2) },
      resourceScans: { requested: this.metrics.resourceScansRequested, executed: this.metrics.resourceScansExecuted, reductionFactor: +(this.metrics.resourceScansRequested / Math.max(1, this.metrics.resourceScansExecuted)).toFixed(2) },
      hudUpdates: { requested: this.metrics.hudRequested, executed: this.metrics.hudExecuted, reductionFactor: +(this.metrics.hudRequested / Math.max(1, this.metrics.hudExecuted)).toFixed(2) },
      missionContext: { requested: this.metrics.missionContextRequested, executed: this.metrics.missionContextExecuted, reductionFactor: +(this.metrics.missionContextRequested / Math.max(1, this.metrics.missionContextExecuted)).toFixed(2) },
      buildingCountScans: { requested: this.metrics.countScansRequested, executed: this.metrics.countScansExecuted, reductionFactor: +(this.metrics.countScansRequested / Math.max(1, this.metrics.countScansExecuted)).toFixed(2) },
      saves: { requested: this.metrics.savesRequested, flushed: this.metrics.savesFlushed, batchingFactor: +(this.metrics.savesRequested / Math.max(1, this.metrics.savesFlushed)).toFixed(2) },
      renderer: { calls: Number(renderInfo.render?.calls || 0), triangles: Number(renderInfo.render?.triangles || 0), geometries: Number(renderInfo.memory?.geometries || 0), textures: Number(renderInfo.memory?.textures || 0) },
      active: { enemies: this.game?.enemies?.length || 0, residents: this.game?.residentNPCs?.length || 0, projectiles: (this.game?.projectiles?.length || 0) + (this.game?.enemyProjectiles?.length || 0) + (this.game?.bossManager?.pool?.active?.length || 0) },
      heapBytes: Number(globalThis.performance?.memory?.usedJSHeapSize || 0),
      prime: { ...(this.primeSignal?.report?.() || { authority: SENTINEL_PRIME_ADAPTIVE_AUTHORITY, available: false }), offThread: !!this.worker, advisories: this.metrics.primeAdvisories, rejected: this.metrics.primeRejected },
      deterministicFallback: true,
      gameplayOutcomeMutation: false,
    });
  }

  dispose() {
    this.installed = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.worker?.terminate?.();
    this.worker = null;
    if (this.onPageHide) {
      globalThis.removeEventListener?.("pagehide", this.onPageHide);
      globalThis.removeEventListener?.("visibilitychange", this.onPageHide);
    }
    this.restore.splice(0).reverse().forEach((restore) => restore());
    if (typeof document !== "undefined") document.getElementById("zeknova-adaptive-runtime-qa")?.remove();
  }
}

export default AdaptiveSimulationDirector;
