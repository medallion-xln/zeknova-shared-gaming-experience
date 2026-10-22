import { test } from "node:test";
import assert from "node:assert/strict";
import { createEngine, ManualTimeSource, PluginError, LifecycleError } from "../src/index.js";

const plugin = (id, extra = {}) => ({ id, install: () => ({ id, installedAt: Date.now() }), ...extra });

test("engine starts without any game content and initialises an empty world", async () => {
  const engine = createEngine({ scheduler: "manual" });
  assert.equal(engine.lifecycle.state, "created");
  await engine.initialize();
  assert.equal(engine.lifecycle.state, "initialized");
  assert.equal(engine.world.entityCount, 0);
  assert.equal(engine.world.getResource("engine.id"), "zge");
  await engine.start();
  assert.equal(engine.lifecycle.state, "running");
  const r = engine.frame(0); engine.frame(100);
  assert.ok(r);
  assert.equal(engine.clock.stepNumber, 5, "100 ms at 60 Hz with max 5 substeps -> exactly 5 steps, remainder dropped");
  await engine.dispose();
  assert.equal(engine.lifecycle.state, "disposed");
});

test("fixed-step clock: 60 Hz vs 30 Hz cadence yields identical simulation state (test clock)", () => {
  const run = (frameMs, frames) => {
    const engine = createEngine({ scheduler: "manual", clock: { timeSource: new ManualTimeSource(0) } });
    let x = 0;
    engine.addSystem({ id: "mover", phase: "simulate", run: (_w, dt) => { x += 3 * dt; } });
    engine.lifecycle.state = "running";
    for (let i = 0; i < frames; i += 1) engine.frame(i * frameMs);
    return { x, steps: engine.clock.stepNumber };
  };
  const a = run(1000 / 60, 61), b = run(1000 / 30, 31);
  assert.equal(a.steps, 60); assert.equal(b.steps, 60);
  assert.ok(Math.abs(a.x - b.x) < 1e-9, `render cadence must not change simulation outcome (${a.x} vs ${b.x})`);
});

test("test clocks produce reproducible results and max catch-up is bounded", () => {
  const make = () => { const e = createEngine({ scheduler: "manual", clock: { maxSubsteps: 5, timeSource: new ManualTimeSource(0) } }); e.lifecycle.state = "running"; return e; };
  const e1 = make(), e2 = make();
  for (const e of [e1, e2]) { e.frame(0); e.frame(500); }
  assert.deepEqual(e1.clock.snapshot(), e2.clock.snapshot());
  assert.equal(e1.clock.stepNumber, 5, "a 500 ms stall produces at most maxSubsteps steps");
  assert.equal(e1.clock.clampedFrames, 1);
  assert.ok(e1.clock.droppedTime > 0);
});

test("delegated clock mode never steps systems (no second simulation authority)", () => {
  const engine = createEngine({ scheduler: "manual", clock: { mode: "delegated", timeSource: new ManualTimeSource(0) } });
  let steps = 0, renders = 0;
  engine.addSystem({ id: "sim", phase: "simulate", run: () => { steps += 1; } });
  engine.addSystem({ id: "observer", phase: "render", run: () => { renders += 1; } });
  engine.lifecycle.state = "running";
  engine.frame(0); engine.frame(16); engine.frame(32);
  assert.equal(steps, 0); assert.equal(renders, 3); assert.equal(engine.clock.stepNumber, 0);
  assert.throws(() => engine.step(), /owned mode/);
});

test("plugins run in dependency order, optional deps order only when present", async () => {
  const engine = createEngine({ scheduler: "manual" });
  const order = [];
  engine.use({ id: "c", requires: ["b"], install: () => order.push("c") });
  engine.use({ id: "a", install: () => order.push("a") });
  engine.use({ id: "b", requires: ["a"], optional: ["zzz-absent"], install: () => order.push("b") });
  engine.use({ id: "d", optional: ["c"], install: () => order.push("d") });
  await engine.initialize();
  assert.deepEqual(order, ["a", "b", "c", "d"]);
  assert.deepEqual(engine.plugins.resolveOrder(), ["a", "b", "c", "d"]);
});

test("invalid plugin dependencies are rejected with actionable errors", async () => {
  const missing = createEngine({ scheduler: "manual" });
  missing.use({ id: "x", requires: ["nope"], install: () => {} });
  await assert.rejects(() => missing.initialize(), (e) => e instanceof PluginError && /requires "nope"/.test(e.message));
  const cyclic = createEngine({ scheduler: "manual" });
  cyclic.use({ id: "p", requires: ["q"], install: () => {} }); cyclic.use({ id: "q", requires: ["r"], install: () => {} }); cyclic.use({ id: "r", requires: ["p"], install: () => {} });
  await assert.rejects(() => cyclic.initialize(), (e) => e instanceof PluginError && /cycle: p -> q -> r -> p|cycle: q -> r -> p -> q|cycle: r -> p -> q -> r/.test(e.message) && Array.isArray(e.cycle));
  const dup = createEngine({ scheduler: "manual" });
  dup.use(plugin("same"));
  assert.throws(() => dup.use(plugin("same")), (e) => e instanceof PluginError && e.duplicate === true);
  assert.throws(() => dup.use({ id: "bad", requires: "notarray", install: () => {} }), PluginError);
});

test("plugin failure is isolated: dependents skipped, others continue, fatal policy rethrows", async () => {
  const engine = createEngine({ scheduler: "manual" });
  const ran = [];
  engine.use({ id: "ok", install: () => ran.push("ok") });
  engine.use({ id: "boom", install: () => { throw new Error("kaboom"); } });
  engine.use({ id: "needs-boom", requires: ["boom"], install: () => ran.push("needs-boom") });
  engine.use({ id: "independent", install: () => ran.push("independent") });
  await engine.initialize();
  assert.deepEqual(ran.sort(), ["independent", "ok"]);
  const diag = engine.plugins.diagnostics();
  assert.equal(diag.plugins.find((p) => p.id === "boom").status, "failed");
  assert.equal(diag.plugins.find((p) => p.id === "needs-boom").status, "skipped");
  assert.match(diag.plugins.find((p) => p.id === "needs-boom").reason, /boom/);
  assert.equal(engine.metrics.snapshot().errors.length, 1);
  const fatal = createEngine({ scheduler: "manual" });
  fatal.use({ id: "fatal", failurePolicy: "fatal", install: () => { throw new Error("must stop"); } });
  await assert.rejects(() => fatal.initialize(), /must stop/);
  assert.equal(fatal.lifecycle.state, "created", "state is unchanged when initialize throws");
});

test("duplicate initialization and start do not duplicate work", async () => {
  const engine = createEngine({ scheduler: "manual" });
  let installs = 0, starts = 0;
  engine.use({ id: "once", install: () => { installs += 1; }, start: () => { starts += 1; } });
  assert.equal(await engine.initialize(), true);
  assert.equal(await engine.initialize(), false);
  assert.equal(await engine.start(), true);
  assert.equal(await engine.start(), false);
  assert.equal(installs, 1); assert.equal(starts, 1);
  assert.equal(engine.pause(), true); assert.equal(engine.pause(), false);
  assert.equal(engine.resume(), true); assert.equal(engine.resume(), false);
  assert.throws(() => createEngine({ scheduler: "manual" }).lifecycle.plan("pause"), LifecycleError, "pause before start is illegal");
});

test("shutdown disposes owned resources: subscriptions, systems, guards, plugin handles", async () => {
  const engine = createEngine({ scheduler: "manual" });
  let disposed = false;
  engine.use({ id: "owner", install: (ctx) => { const own = ctx.own("owner"); own.on("tick", () => {}); own.on("tock", () => {}); ctx.addSystem({ id: "s", run: () => {} }); return own; }, dispose: (_ctx, own) => { own.dispose(); disposed = true; } });
  await engine.start();
  await engine.guard("optional-thing", () => new Promise((_, rej) => setTimeout(() => rej(new Error("nope")), 5)), { timeoutMs: 50, fallback: 1 });
  assert.equal(engine.events.listenerCount("tick"), 1);
  assert.equal(engine.guards.get("optional-thing").state, "degraded");
  await engine.dispose();
  assert.equal(disposed, true);
  assert.equal(engine.events.diagnostics().total, 0);
  assert.equal(engine.systems.length, 0);
  assert.equal(engine.guards.size, 0);
  assert.equal(engine.plugins.status("owner"), "disposed");
  assert.equal(engine.lifecycle.state, "disposed");
  assert.equal(await engine.dispose(), false);
});

test("restart works for kernel-owned systems: stop -> start re-runs start hooks, counts stay balanced", async () => {
  const engine = createEngine({ scheduler: "manual" });
  const log = [];
  engine.use({ id: "svc", install: (ctx) => { const own = ctx.own("svc"); own.on("ping", () => log.push("pong")); return own; }, start: () => log.push("start"), stop: () => log.push("stop"), dispose: (_c, own) => own.dispose() });
  await engine.start(); engine.events.emit("ping", {});
  await engine.stop(); assert.equal(engine.lifecycle.state, "stopped");
  await engine.start(); engine.events.emit("ping", {});
  assert.deepEqual(log, ["start", "pong", "stop", "start", "pong"]);
  assert.equal(engine.events.listenerCount("ping"), 1, "no duplicate subscriptions after restart");
  assert.equal(engine.lifecycle.snapshot().transitions, 4, "initialize, start, stop, start");
  await engine.dispose();
});

test("guard: timeout and failure degrade with fallback; required failure throws", async () => {
  const engine = createEngine({ scheduler: "manual" });
  const slow = await engine.guard("slow", () => new Promise((r) => setTimeout(() => r("late"), 40)), { timeoutMs: 5, fallback: "fallback" });
  assert.equal(slow, "fallback"); assert.equal(engine.guards.get("slow").state, "degraded");
  const ok = await engine.guard("fast", () => "value", { timeoutMs: 50 });
  assert.equal(ok, "value"); assert.equal(engine.guards.get("fast").state, "ready");
  await assert.rejects(() => engine.guard("must", () => Promise.reject(new Error("down")), { required: true }), /down/);
  assert.equal(engine.guards.get("must").state, "failed");
});

test("event handler errors are isolated and recorded; subscriptions by owner can be released", () => {
  const engine = createEngine({ scheduler: "manual" });
  let good = 0;
  engine.events.on("e", () => { throw new Error("bad handler"); }, { owner: "x" });
  engine.events.on("e", () => { good += 1; }, { owner: "y" });
  assert.equal(engine.events.emit("e", {}), 1); assert.equal(good, 1);
  assert.equal(engine.metrics.snapshot().errors[0].scope, "event:e");
  assert.equal(engine.events.offOwner("x"), 1);
  assert.equal(engine.events.listenerCount("e"), 1);
});

test("world snapshot/restore round-trips entities, components and resources", () => {
  const engine = createEngine({ scheduler: "manual" });
  const id = engine.world.createEntity("probe"); engine.world.addComponent(id, "transform", { x: 1, y: 2 }); engine.world.setResource("seed", 42);
  const snap = engine.snapshot();
  const other = createEngine({ scheduler: "manual" }); other.restore(snap);
  assert.deepEqual(other.world.getComponent(id, "transform"), { x: 1, y: 2 }); assert.equal(other.world.getResource("seed"), 42);
  assert.deepEqual([...other.world.query("transform")], [id]);
});

test("metrics expose per-system timings, frame percentiles and lifecycle transitions", async () => {
  const engine = createEngine({ scheduler: "manual", clock: { timeSource: new ManualTimeSource(0) } });
  engine.addSystem({ id: "work", run: () => {} });
  await engine.start();
  for (let i = 1; i <= 30; i += 1) engine.frame(i * 16.67);
  const snap = engine.metrics.snapshot();
  assert.ok(snap.timers["system.work"].count >= 29); assert.ok(snap.timers["frame.total"].p99 !== null);
  assert.ok(snap.transitions.some((t) => t.transition === "start"));
  const diag = engine.diagnostics();
  assert.equal(diag.lifecycle.state, "running"); assert.equal(diag.systems[0].id, "work"); assert.equal(diag.clock.mode, "owned");
  await engine.dispose();
});
