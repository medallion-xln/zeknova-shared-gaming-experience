import { EngineEvents, DisposableGroup } from "./EngineEvents.js";
import { EngineClock, ManualTimeSource, defaultTimeSource } from "./EngineClock.js";
import { LifecycleManager } from "./LifecycleManager.js";
import { PluginManager } from "./PluginManager.js";
import { EngineMetrics } from "./EngineMetrics.js";
import { Authority } from "./Authority.js";
import { CommandQueue } from "./CommandQueue.js";
import { World } from "./World.js";

export const SYSTEM_PHASES = Object.freeze(["input", "simulate", "physics", "post", "render"]);
const STEP_PHASES = new Set(["simulate", "physics", "post"]);

function autoScheduler() {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return { kind: "raf", requestFrame: (cb) => globalThis.requestAnimationFrame(cb), cancelFrame: (h) => globalThis.cancelAnimationFrame(h) };
  }
  return { kind: "timeout", requestFrame: (cb) => setTimeout(() => cb(defaultTimeSource.now()), 1000 / 60), cancelFrame: (h) => clearTimeout(h) };
}

/**
 * EngineKernel — construction, configuration, lifecycle, plugin hosting,
 * frame pipeline and diagnostics. Game-agnostic: it knows nothing about
 * ZekNova. Content and runtimes arrive as plugins.
 */
export class EngineKernel {
  /**
   * @param {{ id?: string, clock?: ConstructorParameters<typeof EngineClock>[0], scheduler?: 'auto'|'manual'|{ requestFrame: Function, cancelFrame: Function }, log?: (level: string, message: string, detail?: any) => void, world?: { id?: string }, config?: Record<string, any> }} [options]
   */
  constructor({ id = "zge", clock = {}, scheduler = "auto", log = null, world = {}, config = {} } = {}) {
    this.id = id; this.config = Object.freeze({ ...config }); this.log = log ?? (() => {});
    this.metrics = new EngineMetrics();
    const onError = (scope, error, detail) => { this.metrics.recordError(scope, error, detail); this.log("warn", `[${scope}] ${error?.message ?? error}`, detail); };
    this.events = new EngineEvents({ onError });
    this.lifecycle = new LifecycleManager({ onTransition: (from, to, transition) => { this.metrics.recordTransition(from, to, transition); this.events.emit("engine:lifecycle", { from, to, transition }); } });
    this.plugins = new PluginManager({ onError, log: this.log });
    this.clock = new EngineClock(clock);
    this.clock.onStep = (dt, stepNumber) => this._runStep(dt, stepNumber);
    this.world = new World(world);
    this.authority = new Authority(config.features);
    this.commands = new CommandQueue(this.authority, this.events);
    this.scheduler = scheduler === "auto" ? autoScheduler() : scheduler === "manual" ? { kind: "manual" } : { kind: "custom", ...scheduler };
    /** @type {Array<{ id: string, phase: string, order: number, run: Function, owner: string }>} */
    this.systems = [];
    this._systemSeq = 0;
    /** @type {Map<string, { state: string, reason: string|null, ms: number|null, required: boolean, at: number }>} */
    this.guards = new Map();
    this._frameHandle = null; this._loopActive = false;
    this.frameCount = 0;
    this._onError = onError;
    this.context = this._createContext();
  }

  _createContext() {
    const engine = this;
    return Object.freeze({
      engine, get world() { return engine.world; }, get events() { return engine.events; }, get metrics() { return engine.metrics; }, get clock() { return engine.clock; }, get config() { return engine.config; },
      log: (level, message, detail) => engine.log(level, message, detail),
      guard: (name, factory, options) => engine.guard(name, factory, options),
      addSystem: (system) => engine.addSystem(system),
      setResource: (name, value) => engine.world.setResource(name, value),
      getResource: (name) => engine.world.getResource(name),
      /** Create a disposable group tied to a plugin id; events subscribed through it are owned. */
      own(owner) {
        const group = new DisposableGroup(owner);
        return Object.freeze({ group, on: (type, handler, options = {}) => group.add(engine.events.on(type, handler, { ...options, owner })), add: (dispose) => group.add(dispose), dispose: () => group.dispose(), get size() { return group.size; } });
      },
    });
  }

  // ───────────────────────── plugins & systems ─────────────────────────
  use(plugin) { this.plugins.register(plugin); return this; }

  /**
   * @param {{ id: string, phase?: string, run: (world: World, dt: number, info: any) => void, owner?: string }} system
   * @returns {() => void} remove
   */
  addSystem(system) {
    if (!system || typeof system.run !== "function" || typeof system.id !== "string") throw new TypeError("system needs { id, run(world, dt, info) }");
    const phase = system.phase ?? "simulate";
    if (!SYSTEM_PHASES.includes(phase)) throw new RangeError(`unknown system phase "${phase}" (expected ${SYSTEM_PHASES.join("|")})`);
    if (this.systems.some((s) => s.id === system.id)) throw new Error(`system "${system.id}" is already registered`);
    const entry = { id: system.id, phase, order: this._systemSeq++, run: system.run, owner: system.owner ?? "anonymous", after: [...(system.after ?? [])], dispose: system.dispose };
    this.systems.push(entry);
    try { this._scheduleSystems(); } catch (error) { this.systems.splice(this.systems.indexOf(entry), 1); throw error; }
    return () => { const i = this.systems.indexOf(entry); if (i >= 0) { this.systems.splice(i, 1); entry.dispose?.(); } };
  }

  _scheduleSystems() {
    const ordered = [], visiting = new Set(), done = new Set();
    const visit = (s) => {
      if (done.has(s.id)) return;
      if (visiting.has(s.id)) throw new Error(`system dependency cycle at ${s.id}`);
      visiting.add(s.id);
      for (const id of s.after) {
        const dep = this.systems.find(x => x.id === id);
        if (!dep) throw new Error(`system ${s.id} requires ${id}`);
        if (SYSTEM_PHASES.indexOf(dep.phase) > SYSTEM_PHASES.indexOf(s.phase)) throw new Error('system dependency crosses phases backwards');
        visit(dep);
      }
      visiting.delete(s.id); done.add(s.id); ordered.push(s);
    };
    [...this.systems].sort((a,b) => SYSTEM_PHASES.indexOf(a.phase)-SYSTEM_PHASES.indexOf(b.phase)||a.order-b.order).forEach(visit);
    this.systems = ordered;
  }

  /**
   * Failure isolation for optional work: resolves to the result, or to `fallback`
   * on timeout/error, recording a status entry. `required:true` rethrows.
   */
  async guard(name, factory, { timeoutMs = 10000, fallback = undefined, required = false } = {}) {
    const began = this.metrics.now();
    this.guards.set(name, { state: "pending", reason: null, ms: null, required, at: began });
    let timer = null;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`guard "${name}" timed out after ${timeoutMs} ms`)), timeoutMs); });
    try {
      const work = typeof factory === "function" ? factory() : factory;
      const result = await Promise.race([Promise.resolve(work), timeout]);
      this.guards.set(name, { state: "ready", reason: null, ms: this.metrics.now() - began, required, at: began });
      this.metrics.counter("guards.ready"); return result;
    } catch (error) {
      const ms = this.metrics.now() - began;
      this.guards.set(name, { state: required ? "failed" : "degraded", reason: String(error?.message ?? error), ms, required, at: began });
      this.metrics.counter(required ? "guards.failed" : "guards.degraded"); this._onError(`guard:${name}`, error, { required });
      this.events.emit("engine:guard", { name, state: required ? "failed" : "degraded", reason: String(error?.message ?? error) });
      if (required) throw error;
      return typeof fallback === "function" ? fallback(error) : fallback;
    } finally { clearTimeout(timer); }
  }

  // ───────────────────────── lifecycle ─────────────────────────
  async initialize() {
    return this.lifecycle.transition("initialize", async (from) => {
      const t = this.metrics.time("lifecycle.initialize");
      if (from === "stopped") this.plugins.rearm();
      this.world.setResource("engine.id", this.id);
      const results = await this.plugins.installAll(this.context);
      const failed = results.filter((r) => r.status === "failed" || r.status === "skipped");
      this.metrics.gauge("plugins.installed", results.filter((r) => r.status === "installed").length);
      this.metrics.gauge("plugins.failedOrSkipped", failed.length);
      t.end(); this.events.emit("engine:initialized", { plugins: results });
    });
  }

  async start() {
    if (this.lifecycle.state === "created") await this.initialize();
    return this.lifecycle.transition("start", async (from) => {
      if (from === "stopped" && this.plugins.diagnostics().counts.registered) { await this.plugins.installAll(this.context); }
      await this.plugins.startAll(this.context);
      this.clock.lastNow = null;
      this._startLoop();
      this.events.emit("engine:started", { mode: this.clock.mode });
    });
  }

  pause() { if (this.lifecycle.plan("pause") === null) return false; this.clock.pause(); this.lifecycle.state = "paused"; this.lifecycle.history.push(Object.freeze({ from: "running", to: "paused", transition: "pause", at: Date.now() })); this.metrics.recordTransition("running", "paused", "pause"); this.events.emit("engine:paused", {}); return true; }
  resume() { if (this.lifecycle.plan("resume") === null) return false; this.clock.resume(); this.lifecycle.state = "running"; this.lifecycle.history.push(Object.freeze({ from: "paused", to: "running", transition: "resume", at: Date.now() })); this.metrics.recordTransition("paused", "running", "resume"); this.events.emit("engine:resumed", {}); return true; }

  async stop() {
    return this.lifecycle.transition("stop", async () => {
      this._stopLoop();
      await this.plugins.stopAll(this.context);
      this.clock.resume(); this.clock.lastNow = null;
      this.events.emit("engine:stopped", {});
    });
  }

  async dispose() {
    if (this.lifecycle.plan("dispose") === null) return false;
    if (this.lifecycle.is("running", "paused")) await this.stop();
    return this.lifecycle.transition("dispose", async () => {
      this._stopLoop();
      await this.plugins.disposeAll(this.context);
      for (const system of this.systems.splice(0).reverse()) { try { system.dispose?.(); } catch (error) { this._onError(`dispose:${system.id}`, error); } }
      this.commands.dispose(); this.guards.clear(); this.world.clear();
      this.events.emit("engine:disposed", {});
      this.events.dispose();
    });
  }

  // ───────────────────────── frame pipeline ─────────────────────────
  _startLoop() {
    if (this.scheduler.kind === "manual" || this._loopActive) return;
    this._loopActive = true;
    const loop = (nowMs) => { if (!this._loopActive) return; this.frame(typeof nowMs === "number" ? nowMs : undefined); if (this._loopActive) this._frameHandle = this.scheduler.requestFrame(loop); };
    this._frameHandle = this.scheduler.requestFrame(loop);
  }
  _stopLoop() { this._loopActive = false; if (this._frameHandle !== null) { this.scheduler.cancelFrame(this._frameHandle); this._frameHandle = null; } }

  _runStep(dt, stepNumber) {
    this.commands.drain(this.world, stepNumber);
    const info = { stepNumber, simulationTime: this.clock.simulationTime };
    for (const system of this.systems) {
      if (!STEP_PHASES.has(system.phase)) continue;
      const t = this.metrics.time(`system.${system.id}`);
      try { system.run(this.world, dt, info); } catch (error) { this._onError(`system:${system.id}`, error, { phase: system.phase, stepNumber }); }
      t.end();
    }
  }

  /** One frame: input → fixed steps (owned mode) → render observers. Safe to call manually. */
  frame(nowMs) {
    if (!this.lifecycle.is("running", "paused")) return null;
    const total = this.metrics.time("frame.total");
    const t0 = this.metrics.now();
    for (const system of this.systems) if (system.phase === "input") { try { system.run(this.world, 0, { frame: this.frameCount }); } catch (error) { this._onError(`system:${system.id}`, error); } }
    const sim = this.metrics.time("frame.simulate");
    const result = this.clock.tick(nowMs);
    sim.end();
    const render = this.metrics.time("frame.render");
    const info = { alpha: result.alpha, frame: this.frameCount, delegated: result.delegated, paused: result.paused, frameDelta: this.clock.lastFrameDelta };
    for (const system of this.systems) if (system.phase === "render") { try { system.run(this.world, this.clock.lastFrameDelta, info); } catch (error) { this._onError(`system:${system.id}`, error); } }
    render.end();
    this.frameCount += 1;
    this.metrics.record("frame.delta", this.clock.lastFrameDelta * 1000);
    const ms = total.end();
    this.events.emit("engine:frame", { frame: this.frameCount, substeps: result.substeps, alpha: result.alpha, ms, startedAt: t0 });
    return result;
  }

  /** Deterministic stepping for tests/headless: n fixed steps, no scheduler. */
  step(n = 1) { if (!this.lifecycle.is("running", "paused", "initialized")) throw new Error(`cannot step while "${this.lifecycle.state}"`); return this.clock.step(n); }

  snapshot() { return { id: this.id, clock: this.clock.snapshot(), world: this.world.snapshot(), frameCount: this.frameCount, commands: this.commands.snapshot() }; }
  restore(snapshot) {
    if (snapshot.clock.fixedStep !== this.clock.fixedStep) throw new Error('snapshot fixed step does not match engine configuration');
    this.world.restore(structuredClone(snapshot.world));
    this.commands.restore(snapshot.commands);
    for (const key of ['stepNumber', 'simulationTime', 'accumulator', 'alpha', 'paused', 'frames', 'elapsed', 'clampedFrames', 'droppedTime', 'lastFrameDelta']) {
      if (snapshot.clock[key] !== undefined) this.clock[key] = snapshot.clock[key];
    }
    this.clock.lastNow = null; this.frameCount = snapshot.frameCount ?? 0;
    this.events.emit("engine:restored", { world: this.world.snapshot() }); return this;
  }

  diagnostics() {
    const guards = {}; for (const [name, g] of this.guards) guards[name] = { ...g };
    return Object.freeze({ id: this.id, lifecycle: this.lifecycle.snapshot(), clock: this.clock.snapshot(), scheduler: this.scheduler.kind, loopActive: this._loopActive, frameCount: this.frameCount, plugins: this.plugins.diagnostics(), systems: this.systems.map((s) => ({ id: s.id, phase: s.phase, owner: s.owner })), guards, events: this.events.diagnostics(), world: { entities: this.world.entityCount, resources: [...this.world.resources.keys()], revision: this.world.revision }, metrics: this.metrics.snapshot() });
  }
}

/** @param {ConstructorParameters<typeof EngineKernel>[0]} [options] */
export function createEngine(options = {}) { return new EngineKernel(options); }

export { ManualTimeSource };
