import { CaptureFilter } from "./CaptureFilter.js";
import { createCaptureMetadata, SCENE_FRAME_SCHEMA } from "./contracts.js";
import { gpuCropRect } from "./FramePreprocessor.js";

export const CAPTURE_PREPROCESS_SCHEMA = "zge.capture-preprocess.v1";
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))].toFixed(2); };

/**
 * ReferenceRenderer — SceneCaptureBackend producing clean RGBA frames from the
 * shared native renderer. Browser-only (needs createImageBitmap/OffscreenCanvas);
 * everything downstream of the pixel readback is CPU-testable in FramePreprocessor.
 *
 * Readback strategy: the legacy renderer owns the canvas; a capture performs one
 * extra `renderer.render(scene, camera)` with overlays hidden, then snapshots the
 * canvas via createImageBitmap (with GPU-side resize) into an OffscreenCanvas 2D
 * context. The native-only path never runs this code, so it adds no readback cost
 * when capture is disabled.
 */
export class ReferenceRenderer {
  /**
   * @param {object} options
   * @param {'native'|'model-input'} [options.profile]  native: capture at width x height; model-input: GPU crop+resize straight to modelWidth x modelHeight (upstream geometry)
   * @param {'auto'|'always'|'never'} [options.rerender] always (default): render the scene into the canvas immediately before the snapshot.
   *   ZGE-02 measurement: on WebGPU (and WebGL without preserveDrawingBuffer) a canvas snapshot taken outside the
   *   frame that drew it is BLACK, so 'auto' only skips the re-render when the drawing buffer is known to be preserved;
   *   'never' is for tests/diagnostics only and is reported through `blankFrames`.
   * @param {'eager'|'lazy'|'videoframe'} [options.readback] eager: 2D-canvas getImageData now; lazy: keep the ImageBitmap GPU-resident and read on demand via frame.pixels(); videoframe: asynchronous WebCodecs readback (VideoFrame.copyTo) when available, else eager
   */
  constructor({ getRenderer, getScene, getCamera, sessionId = "local", sceneId = "zeknova", width = 1280, height = 720, filter = new CaptureFilter(), now = () => (globalThis.performance?.now?.() ?? Date.now()), sceneRevision = null, getSimulationTime = () => 0, getInputProvenance = () => null, profile = "native", rerender = "always", readback = "eager", modelWidth = 864, modelHeight = 480 }) {
    for (const [k, v] of Object.entries({ getRenderer, getScene, getCamera })) if (typeof v !== "function") throw new TypeError(`ReferenceRenderer needs ${k}()`);
    if (!["native", "model-input"].includes(profile)) throw new RangeError(`unknown capture profile "${profile}"`);
    if (!["auto", "always", "never"].includes(rerender)) throw new RangeError(`unknown rerender policy "${rerender}"`);
    Object.assign(this, { getRenderer, getScene, getCamera, sessionId, sceneId, width, height, filter, now, getSimulationTime, getInputProvenance, profile, rerender, readback, modelWidth, modelHeight });
    this.stages = { render: [], bitmap: [], readback: [], total: [] }; this.rerenders = 0; this.skippedRerenders = 0; this.blankFrames = 0;
    // Scene revision must be an explicit authoring signal; child count churns on every spawn/despawn and would reset the model constantly.
    this.sceneRevisionFn = sceneRevision ?? ((scene) => scene?.userData?.sceneRevision ?? null);
    this.frameIndex = 0; this.captures = 0; this.lastCaptureMs = 0; this.lastDiscontinuity = null; this.offscreen = null; this.lastCamera = null;
  }
  available() { return typeof globalThis.createImageBitmap === "function" && typeof globalThis.OffscreenCanvas === "function"; }
  _context(width, height) {
    if (!this.offscreen || this.offscreen.width !== width || this.offscreen.height !== height) { this.offscreen = new OffscreenCanvas(width, height); this.ctx2d = this.offscreen.getContext("2d", { willReadFrequently: true }); }
    return this.ctx2d;
  }
  cameraPose(camera) { return camera ? { id: camera.uuid ?? "camera", position: camera.position ? [camera.position.x, camera.position.y, camera.position.z] : null, quaternion: camera.quaternion ? [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w] : null, fov: camera.fov ?? null, aspect: camera.aspect ?? null, near: camera.near ?? null, far: camera.far ?? null } : { id: "none" }; }
  /** @param {{ width?: number, height?: number, discontinuity?: { reset: boolean, reasons: string[] }, reason?: string }} [request] */
  _record(stage, ms) { const list = this.stages[stage]; list.push(ms); if (list.length > 300) list.shift(); }
  async capture(request = {}) {
    if (!this.available()) throw new Error("reference capture needs createImageBitmap + OffscreenCanvas");
    const renderer = this.getRenderer(), scene = this.getScene(), camera = this.getCamera();
    if (!renderer || !scene || !camera) throw new Error("reference capture: renderer/scene/camera unavailable");
    const profile = request.profile ?? this.profile, readback = request.readback ?? this.readback, rerender = request.rerender ?? this.rerender;
    const canvas = renderer.domElement; const sourceWidth = canvas.width, sourceHeight = canvas.height;
    const modelInput = profile === "model-input";
    const width = modelInput ? this.modelWidth : (request.width ?? this.width), height = modelInput ? this.modelHeight : (request.height ?? this.height);
    const began = this.now();
    // Freeze the authority association before async bitmap/readback can overlap
    // a newer confirmed replica. Presentation never feeds this back to gameplay.
    const association = { camera: this.cameraPose(camera), sceneRevision: this.sceneRevisionFn(scene), simulationTime: Number(this.getSimulationTime()) || 0, inputProvenance: structuredClone(this.getInputProvenance()) };
    // 1) Re-render only when the overlay filter would change the image (or when forced).
    const hidden = rerender === "never" ? 0 : this.filter.apply(scene);
    let renderMs = 0, bitmap = null, preprocessed = null;
    try {
      const preserved = !!(renderer.isWebGLRenderer && renderer.getContextAttributes?.()?.preserveDrawingBuffer);
      const mustRender = rerender === "always" || (rerender === "auto" && (hidden > 0 || !preserved));
      if (mustRender) { const t = this.now(); renderer.render(scene, camera); renderMs = this.now() - t; this.rerenders += 1; } else this.skippedRerenders += 1;
      // 2) GPU-side snapshot (+ resize, + crop for model-input) → ImageBitmap; no CPU readback yet.
      const t = this.now();
      if (modelInput) { const rect = gpuCropRect(sourceWidth, sourceHeight, height, width); bitmap = await createImageBitmap(canvas, rect.sx, rect.sy, rect.sw, rect.sh, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" }); preprocessed = { schema: CAPTURE_PREPROCESS_SCHEMA, method: "gpu-crop-resize", rect: { sx: +rect.sx.toFixed(2), sy: +rect.sy.toFixed(2), sw: +rect.sw.toFixed(2), sh: +rect.sh.toFixed(2) }, geometry: rect.geometry, modelWidth: width, modelHeight: height }; }
      else bitmap = await createImageBitmap(canvas, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" });
      this._record("bitmap", this.now() - t);
    } finally { if (hidden) this.filter.restore(); }
    this._record("render", renderMs);
    // 3) CPU readback: eager (data filled now) or lazy (frame.pixels() on demand; bitmap stays GPU-resident).
    const readPixels = () => { const t = this.now(); const ctx = this._context(width, height); ctx.drawImage(bitmap, 0, 0, width, height); const image = ctx.getImageData(0, 0, width, height); this._record("readback", this.now() - t); if (this._isBlank(image.data)) this.blankFrames += 1; return image.data; };
    const readPixelsAsync = async () => { if (typeof VideoFrame !== "function") return readPixels(); const t = this.now(); const vf = new VideoFrame(bitmap, { timestamp: 0 }); try { const size = vf.allocationSize({ format: "RGBA" }); const buffer = new Uint8ClampedArray(size); await vf.copyTo(buffer, { format: "RGBA" }); this._record("readback", this.now() - t); if (this._isBlank(buffer)) this.blankFrames += 1; return buffer; } catch { return readPixels(); } finally { vf.close(); } };
    let data = null;
    if (readback === "eager") { data = readPixels(); bitmap.close?.(); bitmap = null; }
    else if (readback === "videoframe") { data = await readPixelsAsync(); bitmap.close?.(); bitmap = null; }
    const frameIndex = this.frameIndex++; this.captures += 1; this.lastCaptureMs = this.now() - began; this._record("total", this.lastCaptureMs);
    const pose = association.camera;
    const metadata = createCaptureMetadata({ sessionId: this.sessionId, sceneId: this.sceneId, frameIndex, simulationTime: association.simulationTime, width, height, sourceWidth, sourceHeight, camera: pose, sceneRevision: association.sceneRevision, discontinuity: request.discontinuity ?? null, inputProvenance: association.inputProvenance, capturedAt: began, extensions: preprocessed ? { schema: CAPTURE_PREPROCESS_SCHEMA, preprocess: preprocessed } : null });
    this.lastCamera = pose;
    const frame = { schema: SCENE_FRAME_SCHEMA, kind: "capture", width, height, format: "rgba8", data, bitmap, preprocessed, metadata, overlaysHidden: hidden, rerendered: renderMs > 0, captureMs: this.lastCaptureMs };
    if (!data) { let cached = null; frame.pixels = () => { if (!cached) { cached = readPixels(); frame.data = cached; bitmap.close?.(); frame.bitmap = null; } return cached; }; } else frame.pixels = () => data;
    return frame;
  }
  /** Sparse blank-frame check (every ~400th pixel): guards against silently capturing a cleared drawing buffer. */
  _isBlank(data) { let lit = 0; for (let i = 0; i < data.length; i += 4 * 401) { if (data[i] + data[i + 1] + data[i + 2] > 30) { lit += 1; if (lit > 3) return false; } } return true; }
  profileReport() { const r = {}; for (const [k, v] of Object.entries(this.stages)) r[k] = { count: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95), max: v.length ? +Math.max(...v).toFixed(2) : null }; return Object.freeze({ stages: r, rerenders: this.rerenders, skippedRerenders: this.skippedRerenders, blankFrames: this.blankFrames, profile: this.profile, rerenderPolicy: this.rerender, readbackPolicy: this.readback }); }
  resetSequence(sessionId = this.sessionId) { this.sessionId = sessionId; this.frameIndex = 0; this.lastCamera = null; }
  status() { return Object.freeze({ id: "reference-capture", available: this.available(), width: this.width, height: this.height, captures: this.captures, nextFrameIndex: this.frameIndex, lastCaptureMs: this.lastCaptureMs, overlaysHiddenLast: this.filter.lastHiddenCount, sessionId: this.sessionId, sceneId: this.sceneId, profile: this.profile, rerender: this.rerender, readback: this.readback, stages: this.profileReport() }); }
  async dispose() { this.offscreen = null; this.ctx2d = null; }
}
