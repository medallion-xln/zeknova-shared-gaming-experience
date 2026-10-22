import { rgbaToRgb, cropAndResize, assertFrame } from "../../rendering/src/index.js";

/**
 * MockNeuralBackend — a FUNCTIONAL test backend, not a screenshot: it consumes
 * real SceneFrames in order, applies a deterministic transform with genuine
 * temporal state (an EMA over previous outputs, cleared by resetSession) after a
 * configurable latency, and can inject drops, stalls and failures. It is always
 * labelled mock. It proves sequencing, backpressure, reset and fallback logic
 * without any model, GPU or network.
 */
export function mockTransform(sceneFrame, previous, { modelWidth, modelHeight, ema = 0.35, frameIndex = 0 }) {
  const rgb = sceneFrame.format === "rgba8" ? rgbaToRgb(sceneFrame) : sceneFrame;
  const small = (sceneFrame.preprocessed && rgb.width === modelWidth && rgb.height === modelHeight) ? rgb : cropAndResize(rgb, modelHeight, modelWidth);
  const out = new Uint8ClampedArray(modelWidth * modelHeight * 4);
  for (let i = 0, j = 0; i < small.data.length; i += 3, j += 4) {
    let r = small.data[i], g = small.data[i + 1], b = small.data[i + 2];
    r = (r >> 4) << 4; g = (g >> 4) << 4; b = (b >> 4) << 4; // posterise: visibly "generated", deterministic
    if (previous) { r = Math.round(previous[j] * ema + r * (1 - ema)); g = Math.round(previous[j + 1] * ema + g * (1 - ema)); b = Math.round(previous[j + 2] * ema + b * (1 - ema)); }
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255;
  }
  const stripe = (frameIndex % 2) ? 255 : 32; // frame-parity stripe (top 4 rows) makes ordering visible in tests and on screen
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < modelWidth; x += 1) { const o = (y * modelWidth + x) * 4; out[o] = stripe; out[o + 1] = 32; out[o + 2] = 255 - stripe; }
  return { width: modelWidth, height: modelHeight, format: "rgba8", data: out };
}

export class MockNeuralBackend {
  constructor({ latencyMs = 60, jitterMs = 0, failAfterFrames = null, dropEvery = null, stallAfterFrames = null, now = () => Date.now(), setTimeoutImpl = (fn, ms) => setTimeout(fn, ms) } = {}) {
    Object.assign(this, { latencyMs, jitterMs, failAfterFrames, dropEvery, stallAfterFrames, now, setTimeoutImpl });
    this.id = "mock-neural"; this.mock = true; this.modelIdentity = Object.freeze({ id: "zge-mock-temporal-ema", version: "0.1.0", mock: true, scene: "any", note: "NOT a neural model; deterministic transform with temporal state" });
    this.callbacks = new Set(); this.config = null; this.previous = null; this.submitted = 0; this.generated = 0; this.dropped = 0; this.inFlight = 0; this.failed = false; this.stalled = false; this.resets = 0; this.disposed = false; this.timers = new Set();
  }
  async initialize(config) { this.config = { modelWidth: 864, modelHeight: 480, ...config }; this.previous = null; return { backend: this.id, mock: true, model: this.modelIdentity }; }
  onFrame(callback) { this.callbacks.add(callback); return () => this.callbacks.delete(callback); }
  async health() { return Object.freeze({ ok: !this.failed && !this.disposed, mock: true, inFlight: this.inFlight, submitted: this.submitted, generated: this.generated, dropped: this.dropped, stalled: this.stalled, latencyMs: this.latencyMs, model: this.modelIdentity }); }
  async submit(frame) {
    if (this.disposed) throw new Error("mock backend disposed");
    assertFrame(frame); this.submitted += 1;
    if (this.failAfterFrames !== null && this.submitted > this.failAfterFrames) { this.failed = true; throw new Error("mock backend injected failure"); }
    if (this.stallAfterFrames !== null && this.submitted > this.stallAfterFrames) { this.stalled = true; return; }
    if (this.dropEvery && this.submitted % this.dropEvery === 0) { this.dropped += 1; return; }
    this.inFlight += 1;
    const delay = this.latencyMs + (this.jitterMs ? Math.random() * this.jitterMs : 0);
    const timer = this.setTimeoutImpl(() => {
      this.timers.delete(timer); this.inFlight -= 1; if (this.disposed) return;
      const out = mockTransform(frame, this.previous, { modelWidth: this.config.modelWidth, modelHeight: this.config.modelHeight, frameIndex: frame.metadata.frameIndex });
      this.previous = out.data; this.generated += 1;
      const display = Object.freeze({ kind: "display", ...out, sourceFrameIndex: frame.metadata.frameIndex, sessionId: frame.metadata.sessionId, simulationTime: frame.metadata.simulationTime, generatedAt: this.now(), mock: true, model: this.modelIdentity });
      for (const cb of this.callbacks) { try { cb(display); } catch {} }
    }, delay);
    this.timers.add(timer);
  }
  async resetSession(reason) { this.previous = null; this.stalled = false; this.failed = false; this.resets += 1; this.lastReset = reason; }
  async dispose() { this.disposed = true; for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.callbacks.clear(); }
}
