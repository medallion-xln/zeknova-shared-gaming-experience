/**
 * Presentation contracts (ZGE-01D). See index.d.ts for the TypeScript shapes.
 *
 * RenderBackend         – presents frames (native Three.js, or a neural presenter).
 * SceneCaptureBackend   – produces clean SceneFrames (no HUD/overlay) + metadata.
 * NeuralRenderBackend   – consumes SceneFrames, emits generated RenderFrames.
 *
 * Frame kinds are kept distinct on purpose (Matrix-Game 4 doctrine): a capture
 * frame conditions a model; a display frame is what the player sees.
 */
export const PIXEL_FORMATS = Object.freeze(["rgba8", "rgb8"]);
export const FRAME_KINDS = Object.freeze({ CAPTURE: "capture", DISPLAY: "display" });
export const SCENE_FRAME_SCHEMA = "zge.scene-frame.v1";
export const CAPTURE_METADATA_SCHEMA = "zge.capture-metadata.v1";

/** Validate a frame buffer shape. Returns the frame or throws a TypeError with the exact violation. */
export function assertFrame(frame, { allowFormats = PIXEL_FORMATS } = {}) {
  if (!frame || typeof frame !== "object") throw new TypeError("frame must be an object");
  const { width, height, format, data } = frame;
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new TypeError(`frame dimensions must be positive integers (got ${width}x${height})`);
  if (!allowFormats.includes(format)) throw new TypeError(`unsupported pixel format "${format}" (expected ${allowFormats.join("|")})`);
  const channels = format === "rgba8" ? 4 : 3;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) throw new TypeError("frame.data must be a Uint8Array or Uint8ClampedArray");
  if (data.length !== width * height * channels) throw new TypeError(`frame.data length ${data.length} != ${width}x${height}x${channels}`);
  return frame;
}

export function channelsOf(format) { return format === "rgba8" ? 4 : 3; }

/** Build capture metadata with every field the protocol requires; unknown extras go under `extensions` (versioned). */
export function createCaptureMetadata({ sessionId, sceneId, frameIndex, simulationTime, width, height, sourceWidth = width, sourceHeight = height, camera, sceneRevision, discontinuity = null, inputProvenance = null, capturedAt = null, extensions = null }) {
  for (const [k, v] of Object.entries({ sessionId, sceneId })) if (typeof v !== "string" || !v) throw new TypeError(`metadata.${k} must be a non-empty string`);
  if (!Number.isInteger(frameIndex) || frameIndex < 0) throw new TypeError("metadata.frameIndex must be a non-negative integer");
  if (typeof simulationTime !== "number" || !Number.isFinite(simulationTime)) throw new TypeError("metadata.simulationTime must be a finite number");
  if (!camera || typeof camera.id !== "string") throw new TypeError("metadata.camera.id is required");
  const meta = { schema: CAPTURE_METADATA_SCHEMA, sessionId, sceneId, frameIndex, simulationTime, width, height, sourceWidth, sourceHeight, camera: { id: camera.id, position: camera.position ?? null, quaternion: camera.quaternion ?? null, fov: camera.fov ?? null, aspect: camera.aspect ?? null, near: camera.near ?? null, far: camera.far ?? null }, sceneRevision: sceneRevision ?? null, discontinuity: discontinuity ? { reset: !!discontinuity.reset, reasons: [...(discontinuity.reasons ?? [])] } : { reset: false, reasons: [] }, inputProvenance, capturedAt };
  if (extensions) { if (typeof extensions.schema !== "string") throw new TypeError("metadata.extensions.schema must name a versioned schema"); meta.extensions = extensions; }
  return Object.freeze(meta);
}
