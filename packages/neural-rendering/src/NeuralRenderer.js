import { BoundedQueue } from "./BoundedQueue.js";
import { FrameSequencer } from "./FrameSequencer.js";
import { RenderSession } from "./RenderSession.js";

/**
 * NeuralRenderer — orchestrates capture → backend → bounded display queue →
 * presenter, with backpressure, stall detection and native fallback.
 *
 * Pacing policy (documented decision): upstream slows the single-user native game
 * when inference blocks. ZekNova's legacy loop is authoritative and shared-world
 * time must not bend to one client's renderer, so when the backend cannot keep
 * up we (a) stop capturing until in-flight work drains and (b) present native
 * frames. Conditioning frames that ARE submitted stay consecutive and ordered.
 */
export class NeuralRenderer {
  constructor({ capture, backend, presenter = null, now = () => (globalThis.performance?.now?.() ?? Date.now()), events = null, config = {} }) {
    if (!capture || typeof capture.capture !== "function") throw new TypeError("NeuralRenderer needs a SceneCaptureBackend");
    if (!backend || typeof backend.submit !== "function" || typeof backend.onFrame !== "function") throw new TypeError("NeuralRenderer needs a NeuralRenderBackend");
    this.capture = capture; this.backend = backend; this.presenter = presenter; this.now = now; this.events = events;
    this.config = Object.freeze({ captureFps: 20, captureWidth: 1280, captureHeight: 720, modelWidth: 864, modelHeight: 480, displayQueue: 4, maxInFlight: 2, stallTimeoutMs: 2000, recoverAfterFrames: 2, sessionFrameBudget: 8192 * 4, ...config });
    this.session = new RenderSession({ frameBudget: this.config.sessionFrameBudget, now, onChange: (from, to, reason) => this.events?.emit?.("neural:session", { from, to, reason }) });
    this.streamId = this.session.id; this.sequencer = new FrameSequencer({ sessionId: this.streamId });
    this.display = new BoundedQueue({ capacity: this.config.displayQueue, policy: "drop-oldest", name: "display" });
    this.inFlight = 0; this.lastCaptureAt = -Infinity; this.lastGeneratedAt = null; this.captureBusy = false; this.unsubscribe = null;
    this.counters = { captured: 0, submitted: 0, generated: 0, presented: 0, staleDropped: 0, backpressureSkips: 0, errors: 0, fallbacks: 0, recoveries: 0, resets: 0 };
    this.fallbackReason = null; this.goodFramesSinceDegrade = 0; this.lastPresented = null; this.fpsWindow = { captured: [], presented: [] };
  }
  get mode() { return this.fallbackReason ? "native-fallback" : (this.session.state === "streaming" ? "neural" : this.session.state); }
  async start() {
    this.session.transition("starting", "start");
    try {
      await this.backend.initialize({ modelWidth: this.config.modelWidth, modelHeight: this.config.modelHeight, captureFps: this.config.captureFps, sessionId: this.session.id });
      this.unsubscribe = this.backend.onFrame((frame) => this.onGenerated(frame));
      this.streamId = this.session.id; this.capture.resetSequence?.(this.streamId); this.sequencer.reset(this.streamId);
      this.session.transition("ready", "backend initialised");
    } catch (error) { this.counters.errors += 1; this.session.transition("failed", `initialize: ${error.message}`); this.fallback(`backend initialise failed: ${error.message}`); throw error; }
  }
  /** Called from the engine render phase. */
  tick(nowMs = this.now(), { simulationTime = null } = {}) {
    if (!this.session.active) return;
    if (this.session.exhausted()) { this.resetSession("frame budget exhausted").catch(() => {}); return; }
    if (this.lastGeneratedAt !== null && this.session.state === "streaming" && this.inFlight > 0 && this.now() - this.lastGeneratedAt > this.config.stallTimeoutMs) this.degrade("stall: no generated frame within stallTimeoutMs");
    const interval = 1000 / this.config.captureFps;
    if (!this.captureBusy && nowMs - this.lastCaptureAt >= interval) {
      if (this.inFlight >= this.config.maxInFlight) { this.counters.backpressureSkips += 1; if (!this.fallbackReason) this.degrade("backpressure: backend behind by maxInFlight"); }
      else { this.lastCaptureAt = nowMs; this.captureAndSubmit(nowMs, simulationTime); }
    }
    this.presentNewest(nowMs);
  }
  async captureAndSubmit(nowMs, simulationTime) {
    this.captureBusy = true;
    try {
      const probe = this.capture.lastCamera ? this.sequencer.observe({ camera: this.capture.lastCamera, sceneRevision: null, at: nowMs }) : { reset: false, reasons: [] };
      const frame = await this.capture.capture({ width: this.config.captureWidth, height: this.config.captureHeight, discontinuity: probe });
      if (!frame.data && typeof frame.pixels === "function") frame.pixels();
      const disc = this.sequencer.observe({ camera: frame.metadata.camera, sceneRevision: frame.metadata.sceneRevision, at: nowMs });
      // Only visual discontinuities reset the model session (upstream never resets on pacing gaps).
      const hard = disc.reasons.filter((r) => ["teleport", "camera-cut", "camera-switch", "scene-change"].includes(r));
      if (hard.length) { await this.resetSession(`discontinuity: ${hard.join(",")}`); }
      const sequenced = Object.freeze({ ...frame, data: frame.data, bitmap: null, pixels: undefined, metadata: Object.freeze({ ...frame.metadata, frameIndex: this.sequencer.nextCaptureIndex(), sessionId: this.streamId, discontinuity: { reset: hard.length > 0, reasons: disc.reasons } }) });
      this.sequencer.registerCapture(sequenced, nowMs); this.counters.captured += 1; this.fpsWindow.captured.push(nowMs);
      this.inFlight += 1; this.counters.submitted += 1; this.session.consumeFrame();
      await this.backend.submit(sequenced);
    } catch (error) { this.counters.errors += 1; this.inFlight = Math.max(0, this.inFlight - 1); this.events?.emit?.("neural:error", { message: error.message }); if (this.session.can("failed")) { this.session.transition("failed", error.message); } this.fallback(`backend error: ${error.message}`); }
    finally { this.captureBusy = false; }
  }
  onGenerated(frame) {
    this.inFlight = Math.max(0, this.inFlight - 1); this.lastGeneratedAt = this.now(); this.counters.generated += 1;
    const assoc = this.sequencer.associate(frame, this.lastGeneratedAt);
    if (!assoc.ok) { this.counters.staleDropped += 1; return; }
    const { dropped } = this.display.push(Object.freeze({ ...frame, latencyMs: assoc.latencyMs }));
    if (dropped) this.counters.staleDropped += 1;
    if (this.session.state === "ready") this.session.transition("streaming", "first generated frame");
    if (this.fallbackReason) { this.goodFramesSinceDegrade += 1; if (this.goodFramesSinceDegrade >= this.config.recoverAfterFrames && this.inFlight < this.config.maxInFlight) this.recover(); }
  }
  presentNewest(nowMs) {
    if (this.display.size === 0) return null;
    const stale = this.display.drainToNewest(); this.counters.staleDropped += stale.length;
    const frame = this.display.shift(); const presented = Object.freeze({ ...frame, presentedAt: nowMs });
    this.sequencer.markPresented(frame.sourceFrameIndex); this.counters.presented += 1; this.fpsWindow.presented.push(nowMs); this.lastPresented = presented;
    if (!this.fallbackReason) this.presenter?.present?.(presented);
    // HUD/audio must follow the PRESENTED frame's simulation time, not message arrival.
    this.events?.emit?.("neural:presented", { sourceFrameIndex: presented.sourceFrameIndex, simulationTime: presented.simulationTime, latencyMs: presented.latencyMs, presentedAt: nowMs, mock: !!presented.mock, shown: !this.fallbackReason });
    return presented;
  }
  degrade(reason) { if (this.session.can("degraded")) this.session.transition("degraded", reason); this.fallback(reason); }
  fallback(reason) { if (!this.fallbackReason) { this.counters.fallbacks += 1; this.events?.emit?.("neural:fallback", { reason }); } this.fallbackReason = reason; this.goodFramesSinceDegrade = 0; this.presenter?.fallback?.(reason); }
  recover() { this.fallbackReason = null; this.counters.recoveries += 1; if (this.session.can("streaming")) this.session.transition("streaming", "recovered"); this.presenter?.recover?.(); this.events?.emit?.("neural:recovered", {}); }
  async resetSession(reason) {
    if (!this.session.can("resetting")) return false;
    this.session.transition("resetting", reason); this.counters.resets += 1;
    try { await this.backend.resetSession(reason); this.display.clear(); this.inFlight = 0; this.streamId = `${this.session.id}:g${this.session.generation}`; this.sequencer.reset(this.streamId); this.capture.resetSequence?.(this.streamId); this.session.transition("ready", "reset complete"); return true; }
    catch (error) { this.session.transition("failed", `reset: ${error.message}`); this.fallback(`reset failed: ${error.message}`); return false; }
  }
  rate(list, nowMs, windowMs = 2000) { while (list.length && nowMs - list[0] > windowMs) list.shift(); return +(list.length / (windowMs / 1000)).toFixed(1); }
  status(nowMs = this.now()) { return Object.freeze({ mode: this.mode, session: this.session.snapshot(), sequencer: this.sequencer.stats(), display: this.display.stats(), inFlight: this.inFlight, fallbackReason: this.fallbackReason, counters: { ...this.counters }, captureFps: this.rate(this.fpsWindow.captured, nowMs), presentedFps: this.rate(this.fpsWindow.presented, nowMs), lastLatencyMs: this.lastPresented?.latencyMs ?? null, backend: { id: this.backend.id, mock: !!this.backend.mock }, config: this.config }); }
  async stop() { this.unsubscribe?.(); this.unsubscribe = null; if (this.session.can("stopped")) this.session.transition("stopped", "stop"); this.display.clear(); this.inFlight = 0; }
  async dispose() { await this.stop(); await this.backend.dispose?.(); await this.capture.dispose?.(); }
}
