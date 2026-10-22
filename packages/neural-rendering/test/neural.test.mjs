import { test } from "node:test";
import assert from "node:assert/strict";
import { BoundedQueue, FrameSequencer, RenderSession, PresentationController, MockNeuralBackend, NeuralRenderer, MatrixGame4Adapter, BRIDGE_PROTOCOL } from "../src/index.js";
import { syntheticFrame, createCaptureMetadata } from "../../rendering/src/index.js";
import { startFakeInferenceService } from "./fakeInferenceService.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeCapture({ width = 320, height = 180, sessionId = "s" } = {}) {
  let index = 0, camera = { id: "cam", position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
  const capture = {
    sessionId, lastCamera: null, captures: 0,
    async capture(request = {}) { capture.captures += 1; const frame = syntheticFrame(width, height, { seed: index }); const metadata = createCaptureMetadata({ sessionId: capture.sessionId, sceneId: "test", frameIndex: index++, simulationTime: index / 60, width, height, camera, sceneRevision: 1, discontinuity: request.discontinuity ?? null, capturedAt: Date.now() }); capture.lastCamera = camera; return { ...frame, kind: "capture", metadata }; },
    resetSequence(id) { capture.sessionId = id; index = 0; }, teleport(x) { camera = { ...camera, position: [x, 0, 0] }; }, status() { return {}; }, async dispose() {},
  };
  return capture;
}

test("bounded queue: drop-oldest and reject-newest policies with stats", () => {
  const q = new BoundedQueue({ capacity: 2, policy: "drop-oldest" }); q.push(1); q.push(2); const r = q.push(3);
  assert.equal(r.dropped, 1); assert.deepEqual(q.items, [2, 3]); assert.equal(q.stats().dropped, 1);
  assert.deepEqual(q.drainToNewest(), [2]); assert.equal(q.size, 1);
  const r2 = new BoundedQueue({ capacity: 1, policy: "reject-newest" }); r2.push("a"); assert.equal(r2.push("b").accepted, false); assert.equal(r2.stats().rejected, 1);
  assert.throws(() => new BoundedQueue({ capacity: 0 }), RangeError);
});

test("sequencer: consecutive indices, association latency, stale rejection, discontinuity detection", () => {
  const s = new FrameSequencer({ sessionId: "s", teleportMeters: 10 });
  assert.equal(s.nextCaptureIndex(), 0); assert.equal(s.nextCaptureIndex(), 1);
  const meta = (i) => ({ metadata: { frameIndex: i, simulationTime: i / 60, capturedAt: 1000 + i * 50 } });
  s.registerCapture(meta(0)); s.registerCapture(meta(1));
  const a = s.associate({ sourceFrameIndex: 1, sessionId: "s" }, 1200); assert.equal(a.ok, true); assert.equal(a.latencyMs, 150); s.markPresented(1);
  const stale = s.associate({ sourceFrameIndex: 0, sessionId: "s" }, 1300); assert.equal(stale.stale, true); assert.equal(stale.reason, "stale");
  assert.equal(s.associate({ sourceFrameIndex: 1, sessionId: "other" }, 1300).reason, "session-mismatch");
  assert.deepEqual(s.observe({ camera: { id: "c", position: [0, 0, 0], quaternion: [0, 0, 0, 1] }, sceneRevision: 1, at: 0 }).reasons, []);
  assert.deepEqual(s.observe({ camera: { id: "c", position: [50, 0, 0], quaternion: [0, 0, 0, 1] }, sceneRevision: 1, at: 50 }).reasons, ["teleport"]);
  assert.deepEqual(s.observe({ camera: { id: "c", position: [50, 0, 0], quaternion: [0, 0.7071, 0, 0.7071] }, sceneRevision: 1, at: 100 }).reasons, ["camera-cut"]);
  assert.deepEqual(s.observe({ camera: { id: "c2", position: [50, 0, 0], quaternion: [0, 0.7071, 0, 0.7071] }, sceneRevision: 2, at: 150 }).reasons, ["camera-switch", "scene-change"]);
  assert.deepEqual(s.observe({ camera: { id: "c2", position: [50, 0, 0], quaternion: [0, 0.7071, 0, 0.7071] }, sceneRevision: 2, at: 900 }).reasons, ["capture-gap"]);
  assert.equal(s.stats().discontinuities, 4);
});

test("render session: legal transitions, finite frame budget, illegal transition names allowed states", () => {
  const s = new RenderSession({ frameBudget: 3 });
  s.transition("starting"); s.transition("ready"); s.transition("streaming");
  assert.throws(() => s.transition("starting"), /cannot go streaming -> starting/);
  s.consumeFrame(); s.consumeFrame(); assert.equal(s.exhausted(), false); s.consumeFrame(); assert.equal(s.exhausted(), true);
  s.transition("resetting", "budget"); assert.equal(s.framesUsed, 0); assert.equal(s.generation, 1); s.transition("ready"); s.transition("stopped"); assert.equal(s.active, false);
});

test("presentation controller: NEURAL needs a declared backend; mock is labelled; fallback records reason", () => {
  const p = new PresentationController({ allowMock: false });
  assert.throws(() => p.setMode("NEURAL"), /requires a backend declaration/); assert.throws(() => p.setMode("NEURAL", { backendMock: true }), /mock backend is disabled/);
  const q = new PresentationController({ allowMock: true }); q.setMode("NEURAL", { backendMock: true }); assert.match(q.label(), /MOCK/); q.fallback("stall"); assert.equal(q.mode, "NATIVE"); assert.match(q.status().fallbackReason, /stall/);
});

test("mock backend is functional: ordered output derived from real input with temporal state cleared by reset", async () => {
  const backend = new MockNeuralBackend({ latencyMs: 5 }); await backend.initialize({ modelWidth: 64, modelHeight: 32 });
  const got = []; backend.onFrame((f) => got.push(f));
  const capture = fakeCapture({ width: 128, height: 64 });
  const f0 = await capture.capture(), f1 = await capture.capture();
  await backend.submit(f0); await backend.submit(f1); await sleep(40);
  assert.equal(got.length, 2); assert.deepEqual(got.map((f) => f.sourceFrameIndex), [0, 1]); assert.equal(got[0].width, 64); assert.equal(got[0].mock, true);
  assert.notDeepEqual(got[0].data, got[1].data, "second output blends with the first (temporal state)");
  const stripe0 = got[0].data[0], stripe1 = got[1].data[0]; assert.notEqual(stripe0, stripe1, "frame-parity stripe differs between consecutive frames");
  await backend.resetSession("test"); const f2 = await capture.capture(); await backend.submit(f2); await sleep(30);
  assert.equal(backend.previous !== null, true); assert.equal(backend.resets, 1);
  await backend.dispose();
});

test("neural renderer: capture→submit→display with ordered presentation, stale drops, HUD-sync event on presented frame", async () => {
  const capture = fakeCapture(); const backend = new MockNeuralBackend({ latencyMs: 5 });
  const events = []; const presenter = { frames: [], present(f) { this.frames.push(f); }, fallback() {}, recover() {} };
  const neural = new NeuralRenderer({ capture, backend, presenter, events: { emit: (t, p) => events.push([t, p]) }, config: { captureFps: 100, captureWidth: 64, captureHeight: 32, modelWidth: 32, modelHeight: 16, maxInFlight: 4 } });
  await neural.start(); assert.equal(neural.session.state, "ready");
  let t = 0; for (let i = 0; i < 12; i += 1) { neural.tick(t); t += 10; await sleep(12); }
  await sleep(40); neural.tick(t + 50);
  const s = neural.status(t + 50);
  assert.ok(s.counters.captured >= 6 && s.counters.generated >= 5, JSON.stringify(s.counters)); assert.equal(s.session.state, "streaming");
  const presentedIdx = presenter.frames.map((f) => f.sourceFrameIndex); assert.deepEqual(presentedIdx, [...presentedIdx].sort((a, b) => a - b), "presented in order");
  assert.equal(new Set(presentedIdx).size, presentedIdx.length, "never presents the same frame twice");
  const presentedEvents = events.filter(([type]) => type === "neural:presented"); assert.ok(presentedEvents.length > 0); assert.equal(typeof presentedEvents[0][1].simulationTime, "number"); assert.equal(presentedEvents[0][1].mock, true);
  await neural.dispose();
});

test("backpressure: when the backend cannot keep up, capture stops and presentation falls back to native, then recovers", async () => {
  const capture = fakeCapture(); const backend = new MockNeuralBackend({ latencyMs: 80 });
  const fallbacks = [], recoveries = []; const presenter = { present() {}, fallback(r) { fallbacks.push(r); }, recover() { recoveries.push(1); } };
  const neural = new NeuralRenderer({ capture, backend, presenter, config: { captureFps: 200, captureWidth: 32, captureHeight: 16, modelWidth: 16, modelHeight: 8, maxInFlight: 1, recoverAfterFrames: 1 } });
  await neural.start();
  let t = 0; for (let i = 0; i < 6; i += 1) { neural.tick(t); t += 5; await sleep(6); }
  assert.ok(neural.counters.backpressureSkips > 0, "skips recorded"); assert.ok(fallbacks.length >= 1, "fell back to native under backpressure"); assert.equal(neural.session.state, "degraded");
  await sleep(120); neural.tick(t + 200); await sleep(100); neural.tick(t + 400);
  assert.ok(recoveries.length >= 1, "recovered once frames flowed again"); assert.equal(neural.fallbackReason, null);
  await neural.dispose();
});

test("stall detection and backend failure both trigger native fallback without throwing into the frame loop", async () => {
  const capture = fakeCapture(); const stall = new MockNeuralBackend({ latencyMs: 5, stallAfterFrames: 2 });
  const presenter = { present() {}, fallback(r) { this.reason = r; }, recover() {} };
  const neural = new NeuralRenderer({ capture, backend: stall, presenter, config: { captureFps: 100, captureWidth: 32, captureHeight: 16, modelWidth: 16, modelHeight: 8, stallTimeoutMs: 30, maxInFlight: 4 } });
  await neural.start(); let t = 0; for (let i = 0; i < 4; i += 1) { neural.tick(t); t += 10; await sleep(12); }
  await sleep(50); neural.tick(t + 100); assert.match(presenter.reason ?? "", /stall/); await neural.dispose();
  const failing = new MockNeuralBackend({ latencyMs: 5, failAfterFrames: 1 }); const p2 = { present() {}, fallback(r) { this.reason = r; }, recover() {} };
  const n2 = new NeuralRenderer({ capture: fakeCapture(), backend: failing, presenter: p2, config: { captureFps: 100, captureWidth: 32, captureHeight: 16, modelWidth: 16, modelHeight: 8 } });
  await n2.start(); n2.tick(0); await sleep(10); n2.tick(20); await sleep(20); assert.match(p2.reason ?? "", /backend error/); assert.equal(n2.session.state, "failed"); await n2.dispose();
});

test("camera discontinuity (teleport) resets the model session and restarts the capture sequence", async () => {
  const capture = fakeCapture(); const backend = new MockNeuralBackend({ latencyMs: 2 });
  const neural = new NeuralRenderer({ capture, backend, config: { captureFps: 1000, captureWidth: 32, captureHeight: 16, modelWidth: 16, modelHeight: 8, maxInFlight: 8 } });
  await neural.start(); neural.tick(0); await sleep(5); neural.tick(10); await sleep(5);
  capture.teleport(100); neural.tick(20); await sleep(10);
  assert.ok(neural.counters.resets >= 1, "teleport triggered a session reset"); assert.equal(backend.resets >= 1, true); assert.ok(neural.session.generation >= 1);
  const presentedBefore = neural.counters.presented; const staleBefore = neural.counters.staleDropped;
  const deadline = Date.now() + 2000; let t2 = 30;
  while (neural.counters.presented <= presentedBefore && Date.now() < deadline) { neural.tick(t2); t2 += 5; await sleep(5); }
  assert.ok(neural.counters.presented > presentedBefore, "frames generated after the reset are presented under the new stream id");
  assert.equal(neural.counters.staleDropped - staleBefore, 0, "no frame is rejected as stale because of the stream rename");
  assert.ok(neural.status(t2).sequencer.latencyMs.p50 < 1000, "latency uses one time base");
  await neural.dispose();
});

test("Matrix-Game 4 adapter: loopback enforcement, upstream control contract and proposed bridge against the loopback test service (TRANSPORT_READY)", async () => {
  assert.throws(() => new MatrixGame4Adapter({ baseUrl: "http://example.com:8025" }), /not loopback/);
  const service = await startFakeInferenceService({ modelWidth: 32, modelHeight: 16 });
  try {
    const adapter = new MatrixGame4Adapter({ baseUrl: service.baseUrl, mode: "reference" });
    const health = await adapter.health(); assert.equal(health.ready, true); assert.equal(health.active, null); assert.ok(typeof health.latencyMs === "number");
    const caps = adapter.capabilities(); assert.equal(caps.acceptsExternalReferenceFrames, false); assert.equal(caps.bridgeProtocol, BRIDGE_PROTOCOL); assert.equal(caps.bridgeIsUpstream, false);
    assert.equal(adapter.modelCompatibility("zeknova").compatible, false); assert.equal(adapter.modelCompatibility("castle").compatible, true);
    const init = await adapter.initialize({ modelWidth: 32, modelHeight: 16 }); assert.match(init.session.id, /^native-/); assert.equal(init.mock, false);
    const second = new MatrixGame4Adapter({ baseUrl: service.baseUrl }); await assert.rejects(() => second.initialize({}), /active session|409/);
    const got = []; adapter.onFrame((f) => got.push(f));
    const capture = fakeCapture({ width: 64, height: 32, sessionId: init.session.id });
    for (let i = 0; i < 3; i += 1) await adapter.submit(await capture.capture());
    assert.deepEqual(got.map((f) => f.sourceFrameIndex), [0, 1, 2]); assert.equal(got[0].width, 32); assert.equal(got[0].mock, true, "test-double output is labelled mock");
    await adapter.resetSession("test"); assert.match(adapter.session.id, /^native-2/);
    const stopped = await adapter.stopSession(); assert.deepEqual(stopped, { stopped: true }); assert.equal((await adapter.health()).active, null);
    await adapter.dispose();
  } finally { await service.close(); }
});

test("adapter surfaces service failure as an error the renderer turns into native fallback", async () => {
  const service = await startFakeInferenceService({ modelWidth: 16, modelHeight: 8, failReferenceAfter: 1 });
  try {
    const adapter = new MatrixGame4Adapter({ baseUrl: service.baseUrl }); const presenter = { present() {}, fallback(r) { this.reason = r; }, recover() {} };
    const neural = new NeuralRenderer({ capture: fakeCapture({ width: 32, height: 16 }), backend: adapter, presenter, config: { captureFps: 1000, captureWidth: 32, captureHeight: 16, modelWidth: 16, modelHeight: 8, maxInFlight: 1 } });
    await neural.start(); neural.tick(0); await sleep(30); neural.tick(10); await sleep(30); neural.tick(20); await sleep(30);
    assert.match(presenter.reason ?? "", /backend error.*503|backend error/); await neural.dispose();
  } finally { await service.close(); }
});

test("mock backend skips CPU crop/resize for pre-processed (model-input) captures and produces identical dimensions", async () => {
  const backend = new MockNeuralBackend({ latencyMs: 2 }); await backend.initialize({ modelWidth: 32, modelHeight: 16 });
  const got = []; backend.onFrame((f) => got.push(f));
  const pre = { ...syntheticFrame(32, 16), kind: "capture", preprocessed: { schema: "zge.capture-preprocess.v1" }, metadata: createCaptureMetadata({ sessionId: "s", sceneId: "t", frameIndex: 0, simulationTime: 0, width: 32, height: 16, camera: { id: "c" } }) };
  await backend.submit(pre); await sleep(20); assert.equal(got.length, 1); assert.equal(got[0].width, 32); assert.equal(got[0].height, 16); await backend.dispose();
});
