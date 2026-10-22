/**
 * NativeRenderer — RenderBackend over an EXISTING Three.js renderer (the legacy
 * bundle's WebGPURenderer). It does not import Three.js and never creates a
 * second renderer or context: it observes and reports.
 */
export class NativeRenderer {
  constructor({ getRenderer, getScene = () => null, getCamera = () => null, id = "native-three" }) {
    if (typeof getRenderer !== "function") throw new TypeError("NativeRenderer needs getRenderer()");
    this.id = id; this.getRenderer = getRenderer; this.getScene = getScene; this.getCamera = getCamera;
    this.initialized = false; this.backend = null; this.presented = 0; this.lastPresentedAt = null;
  }
  async initialize() {
    const renderer = this.getRenderer();
    if (!renderer) throw new Error("native renderer unavailable (legacy runtime not ready)");
    this.backend = renderer.backend?.isWebGPUBackend ? "webgpu" : (renderer.isWebGPURenderer || renderer.isWebGLRenderer ? "webgl2" : "unknown");
    this.initialized = true; return { backend: this.backend };
  }
  /** Native mode: the legacy loop already presented the frame; we only account for it. */
  async present(frame) { this.presented += 1; this.lastPresentedAt = frame?.presentedAt ?? Date.now(); }
  status() {
    const renderer = this.getRenderer(); const info = renderer?.info;
    return Object.freeze({ id: this.id, initialized: this.initialized, backend: this.backend, available: !!renderer, presented: this.presented, drawCalls: info?.render?.drawCalls ?? info?.render?.calls ?? null, triangles: info?.render?.triangles ?? null, geometries: info?.memory?.geometries ?? null, textures: info?.memory?.textures ?? null, canvas: renderer?.domElement ? { width: renderer.domElement.width, height: renderer.domElement.height } : null, sharedInstance: true, ownsContext: false });
  }
  async dispose() { this.initialized = false; }
}
