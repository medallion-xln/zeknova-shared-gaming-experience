import { encodeFrameEnvelope, decodeFrameEnvelope } from "../../rendering/src/FramePreprocessor.js";

/**
 * MatrixGame4Adapter — thin HTTP adapter for the upstream Matrix-Game 4 browser
 * service contract (matrix_game/server/app.py @ c7a88bfc, Apache-2.0):
 *   GET  /api/status            → { ready, fps, active, config, report }
 *   POST /api/start {mode, monitor} → { id, fps, monitor, whep }   mode ∈ model|reference
 *   POST /api/{id}/stop         → { stopped }
 *   GET  /api/{id}/ws           → controls + HUD metadata (not used here)
 * Video arrives over WHEP/WebRTC in upstream; this adapter does not implement it.
 *
 * HONESTY: upstream feeds reference frames to the model from a LOCAL NATIVE GAME over a
 * private socketpair IPC. It has no endpoint that accepts reference frames from a browser.
 * `submitReference()` therefore targets a PROPOSED bridge extension
 * (`POST /api/{id}/reference`, zge-reference-bridge/0) that only the ZGE loopback test
 * service implements today. Upstream model verification is a separate gate.
 */
export const UPSTREAM = Object.freeze({ repo: "https://github.com/SkyworkAI/Matrix-Game", commit: "c7a88bfc039cd97695082484986e95b962390676", path: "Matrix-Game-4", license: "Apache-2.0", defaultHttpPort: 8025, whepPort: 8890, scenes: ["castle", "ancient-egypt", "racing"], captureWidth: 1280, captureHeight: 720, modelWidth: 864, modelHeight: 480 });
export const BRIDGE_PROTOCOL = "zge-reference-bridge/0";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class MatrixGame4Adapter {
  constructor({ baseUrl = `http://127.0.0.1:${UPSTREAM.defaultHttpPort}`, fetchImpl = globalThis.fetch?.bind(globalThis), allowRemote = false, mode = "reference", timeoutMs = 3000, now = () => Date.now() } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("MatrixGame4Adapter needs fetch");
    const url = new URL(baseUrl);
    if (!allowRemote && !LOOPBACK.has(url.hostname)) throw new Error(`inference endpoint ${url.hostname} is not loopback; set allowRemote:true explicitly for remote inference`);
    if (!["model", "reference"].includes(mode)) throw new RangeError("mode must be model|reference");
    Object.assign(this, { baseUrl: url.origin, fetchImpl, allowRemote, mode, timeoutMs, now });
    this.id = "matrix-game-4-http"; this.mock = false; this.session = null; this.callbacks = new Set(); this.lastHealth = null; this.lastLatencyMs = null; this.sequence = 0; this.disposed = false;
  }
  async request(path, { method = "GET", json = null, body = null, headers = {} } = {}) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init = { method, headers: { ...headers }, signal: controller.signal };
      if (json !== null) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(json); } else if (body) { init.headers["Content-Type"] = "application/octet-stream"; init.body = body; }
      const began = this.now(); const response = await this.fetchImpl(this.baseUrl + path, init); this.lastLatencyMs = this.now() - began;
      if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${await response.text().catch(() => "")}`.trim());
      return response;
    } finally { clearTimeout(timer); }
  }
  async health() { const r = await this.request("/api/status"); const status = await r.json(); this.lastHealth = { ...status, latencyMs: this.lastLatencyMs, at: this.now() }; return this.lastHealth; }
  async startSession({ monitor = false } = {}) { const r = await this.request("/api/start", { method: "POST", json: { mode: this.mode, monitor } }); this.session = await r.json(); this.sequence = 0; return this.session; }
  async stopSession() { if (!this.session) return null; const id = this.session.id; this.session = null; const r = await this.request(`/api/${encodeURIComponent(id)}/stop`, { method: "POST", json: {} }); return r.json(); }
  capabilities() { return Object.freeze({ upstream: UPSTREAM, transport: "http+json (control) / whep (video, not implemented here)", acceptsExternalReferenceFrames: false, bridgeProtocol: BRIDGE_PROTOCOL, bridgeIsUpstream: false, clientGpuRequired: false, serverRequirements: { os: "Linux", gpu: "NVIDIA (A100 80GB, RTX 5090/5080/5070 Ti presets)", python: "3.12", torch: "2.12.0+cu132" }, modes: ["model", "reference"], singleSession: true, loopbackOnly: !this.allowRemote }); }
  modelCompatibility(sceneId) { const known = UPSTREAM.scenes.includes(sceneId); return Object.freeze({ sceneId, compatible: known, reason: known ? "upstream scene-specialised checkpoint exists" : `no released checkpoint is trained for "${sceneId}"; a ZekNova-specific model requires its own training/evaluation plan`, models: known ? [`Skywork/Matrix-Game-4.0:${sceneId}`] : [] }); }
  // NeuralRenderBackend surface
  async initialize(config) { this.config = config; const health = await this.health(); if (!health.ready) throw new Error("inference service not ready"); if (health.active) throw new Error("inference service already has an active session (single-user)"); const session = await this.startSession(); return { backend: this.id, mock: false, session, health, capabilities: this.capabilities() }; }
  onFrame(callback) { this.callbacks.add(callback); return () => this.callbacks.delete(callback); }
  async submit(frame) { if (!this.session) throw new Error("no active session"); const display = await this.submitReference(frame); if (display) for (const cb of this.callbacks) { try { cb(display); } catch {} } }
  /** PROPOSED bridge: envelope in, envelope out (synchronous echo of a generated frame). Not upstream. */
  async submitReference(frame) {
    const envelope = encodeFrameEnvelope(frame, { ...frame.metadata, protocol: BRIDGE_PROTOCOL, sequence: this.sequence++ });
    const r = await this.request(`/api/${encodeURIComponent(this.session.id)}/reference`, { method: "POST", body: envelope, headers: { "X-ZGE-Bridge": BRIDGE_PROTOCOL } });
    const bytes = new Uint8Array(await r.arrayBuffer()); if (bytes.length === 0) return null;
    const { frame: out, metadata } = decodeFrameEnvelope(bytes);
    return Object.freeze({ kind: "display", ...out, sourceFrameIndex: metadata.sourceFrameIndex, sessionId: metadata.sessionId, simulationTime: metadata.simulationTime, generatedAt: this.now(), mock: !!metadata.mock, model: metadata.model ?? null });
  }
  async resetSession(reason) { await this.stopSession(); await this.startSession(); this.lastReset = reason; }
  async dispose() { this.disposed = true; this.callbacks.clear(); try { await this.stopSession(); } catch {} }
  status() { return Object.freeze({ id: this.id, mock: false, baseUrl: this.baseUrl, mode: this.mode, session: this.session, lastHealth: this.lastHealth, lastLatencyMs: this.lastLatencyMs, loopbackOnly: !this.allowRemote }); }
}
