/**
 * FrameSequencer — consecutive capture indices, capture↔display association,
 * latency measurement, stale detection and camera/scene discontinuity detection.
 */
const deg = (rad) => rad * 180 / Math.PI;
function quaternionAngle(a, b) { if (!a || !b) return 0; const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return deg(2 * Math.acos(Math.min(1, dot))); }
function distance(a, b) { if (!a || !b) return 0; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

export class FrameSequencer {
  constructor({ sessionId = "local", teleportMeters = 15, cameraCutDegrees = 60, maxIntervalMs = 250, history = 256 } = {}) {
    Object.assign(this, { sessionId, teleportMeters, cameraCutDegrees, maxIntervalMs, historyLimit: history }); this.reset(sessionId);
  }
  reset(sessionId = this.sessionId) { this.sessionId = sessionId; this.nextIndex = 0; this.captures = new Map(); this.lastPresentedIndex = -1; this.lastCamera = null; this.lastCameraAt = null; this.lastSceneRevision = null; this.stale = 0; this.gaps = 0; this.associated = 0; this.unknown = 0; this.discontinuities = 0; this.latencies = []; }
  nextCaptureIndex() { return this.nextIndex++; }
  /** Compare the incoming camera pose/scene revision with the previous one. */
  observe({ camera, sceneRevision = null, at }) {
    const reasons = [];
    if (this.lastCamera && camera) {
      const dt = this.lastCameraAt === null ? 0 : at - this.lastCameraAt;
      if (dt <= this.maxIntervalMs) { if (distance(this.lastCamera.position, camera.position) >= this.teleportMeters) reasons.push("teleport"); if (quaternionAngle(this.lastCamera.quaternion, camera.quaternion) >= this.cameraCutDegrees) reasons.push("camera-cut"); }
      else reasons.push("capture-gap");
      if (this.lastCamera.id && camera.id && this.lastCamera.id !== camera.id) reasons.push("camera-switch");
    }
    if (this.lastSceneRevision !== null && sceneRevision !== null && sceneRevision !== this.lastSceneRevision) reasons.push("scene-change");
    this.lastCamera = camera ?? this.lastCamera; this.lastCameraAt = at; this.lastSceneRevision = sceneRevision ?? this.lastSceneRevision;
    if (reasons.length) this.discontinuities += 1;
    return Object.freeze({ reset: reasons.length > 0, reasons });
  }
  registerCapture(frame, now = frame.metadata.capturedAt ?? Date.now()) {
    const { frameIndex, simulationTime } = frame.metadata;
    this.captures.set(frameIndex, { simulationTime, capturedAt: now, submittedAt: now });
    if (this.captures.size > this.historyLimit) this.captures.delete(this.captures.keys().next().value);
    return frameIndex;
  }
  /** Match a generated display frame to its capture. */
  associate(displayFrame, now = Date.now()) {
    const index = displayFrame.sourceFrameIndex;
    if (displayFrame.sessionId !== this.sessionId) { this.unknown += 1; return Object.freeze({ ok: false, reason: "session-mismatch", stale: true }); }
    const capture = this.captures.get(index);
    if (!capture) { this.unknown += 1; return Object.freeze({ ok: false, reason: "unknown-capture", stale: true }); }
    if (index <= this.lastPresentedIndex) { this.stale += 1; return Object.freeze({ ok: false, reason: "stale", stale: true, latencyMs: now - capture.capturedAt }); }
    if (index !== this.lastPresentedIndex + 1 && this.lastPresentedIndex >= 0) this.gaps += 1;
    const latencyMs = now - capture.capturedAt; this.latencies.push(latencyMs); if (this.latencies.length > this.historyLimit) this.latencies.shift();
    this.associated += 1;
    return Object.freeze({ ok: true, stale: false, latencyMs, simulationTime: capture.simulationTime, gap: index - this.lastPresentedIndex - 1 });
  }
  markPresented(index) { this.lastPresentedIndex = Math.max(this.lastPresentedIndex, index); }
  stats() { const s = [...this.latencies].sort((a, b) => a - b); const q = (p) => s.length ? s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))] : null; return Object.freeze({ sessionId: this.sessionId, nextIndex: this.nextIndex, lastPresentedIndex: this.lastPresentedIndex, associated: this.associated, stale: this.stale, gaps: this.gaps, unknown: this.unknown, discontinuities: this.discontinuities, latencyMs: { p50: q(0.5), p95: q(0.95), max: s.length ? s[s.length - 1] : null } }); }
}
