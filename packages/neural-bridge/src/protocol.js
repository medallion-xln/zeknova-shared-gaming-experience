/**
 * Reference-ingestion protocol contract (zge-reference-bridge/0) for the ZekNova
 * → Matrix-Game 4 bridge. This is a SOURCE-OWNED surface: it defines the shape a
 * ZekNova clean reference frame must satisfy to be accepted for conditioning, and
 * what the bridge emits (error codes, accepted frames, chunk boundaries). It is
 * transport-agnostic — the same validation runs over an in-process loopback, an
 * HTTP endpoint, or a WebSocket/WebRTC data channel.
 *
 * HONESTY: this is a reference-frame TRANSPORT/validation contract, not a neural
 * inference contract. A passing frame is "valid conditioning input", never
 * "model output". The loopback certification mode is labelled
 *   REFERENCE TRANSPORT TEST — NOT NEURAL INFERENCE
 * and reference frames are never presented as generated video.
 */
import { PIXEL_FORMATS, CAPTURE_METADATA_SCHEMA } from "../../rendering/src/index.js";

export const BRIDGE_PROTOCOL = "zge-reference-bridge/0";
export const TRANSPORT_TEST_LABEL = "REFERENCE TRANSPORT TEST — NOT NEURAL INFERENCE";

export const BRIDGE_VERSION = Object.freeze({ protocol: BRIDGE_PROTOCOL, major: 0, transportTest: true });

// Bounds mirror the upstream game-IPC / model-input envelope (1280x720 RGBA capture,
// 864x480 RGB model input) and the upstream 16 KB control-packet cap.
export const BRIDGE_LIMITS = Object.freeze({
  captureWidth: 1280,
  captureHeight: 720,
  captureFormat: "rgba8",
  maxCaptureBytes: 4 * 1280 * 720 * 4, // upstream game IPC pixel cap
  modelWidth: 864,
  modelHeight: 480,
  maxJsonBytes: 65536,
  maxControlsBytes: 16384,
  defaultQueueCapacity: 4, // upstream display queue capacity
});

// Stable error codes so a receiver can branch programmatically without string matching.
export const INGEST_ERROR = Object.freeze({
  PIXEL_FORMAT: "PIXEL_FORMAT",
  DIMENSIONS: "DIMENSIONS",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  NON_MONOTONIC: "NON_MONOTONIC",
  SESSION_MISMATCH: "SESSION_MISMATCH",
  STALE_GENERATION: "STALE_GENERATION",
  CORRUPT_FRAME: "CORRUPT_FRAME",
  UNSUPPORTED_CAMERA: "UNSUPPORTED_CAMERA",
  QUEUE_OVERFLOW: "QUEUE_OVERFLOW",
  SCHEMA: "SCHEMA",
});
export const INGEST_ERROR_KEYS = Object.freeze(Object.values(INGEST_ERROR));

/** Validate the capture metadata schema tag and required ids. */
export function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return { ok: false, code: INGEST_ERROR.SCHEMA, message: "metadata must be an object" };
  if (metadata.schema !== CAPTURE_METADATA_SCHEMA) return { ok: false, code: INGEST_ERROR.SCHEMA, message: `unsupported metadata schema "${metadata.schema}" (expected ${CAPTURE_METADATA_SCHEMA})` };
  if (typeof metadata.sessionId !== "string" || !metadata.sessionId) return { ok: false, code: INGEST_ERROR.SESSION_MISMATCH, message: "metadata.sessionId must be a non-empty string" };
  if (typeof metadata.sceneId !== "string" || !metadata.sceneId) return { ok: false, code: INGEST_ERROR.SCHEMA, message: "metadata.sceneId must be a non-empty string" };
  if (!Number.isInteger(metadata.frameIndex) || metadata.frameIndex < 0) return { ok: false, code: INGEST_ERROR.NON_MONOTONIC, message: "metadata.frameIndex must be a non-negative integer" };
  if (typeof metadata.simulationTime !== "number" || !Number.isFinite(metadata.simulationTime)) return { ok: false, code: INGEST_ERROR.SCHEMA, message: "metadata.simulationTime must be finite" };
  return { ok: true };
}

/**
 * Validate the camera settings are ones the conditioning path can represent.
 * Matrix-Game 4 conditions on pixels + a fixed scene prompt; it has no notion of
 * ZekNova's per-frame camera rig/projection beyond the pose the frame already
 * encodes. We reject frames that carry no identifiable camera id (unrepresentable)
 * but accept the pose fields verbatim; any projection beyond perspective is a
 * documented, versioned extension only.
 */
export function validateCameraSettings(metadata) {
  const camera = metadata?.camera;
  if (!camera || typeof camera.id !== "string" || !camera.id) {
    return { ok: false, code: INGEST_ERROR.UNSUPPORTED_CAMERA, message: "metadata.camera.id is required" };
  }
  const position = camera.position, quaternion = camera.quaternion;
  const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
  const finite4 = (v) => Array.isArray(v) && v.length === 4 && v.every((n) => Number.isFinite(n));
  if (position != null && !finite3(position)) return { ok: false, code: INGEST_ERROR.UNSUPPORTED_CAMERA, message: "camera.position must be null or [x,y,z]" };
  if (quaternion != null && !finite4(quaternion)) return { ok: false, code: INGEST_ERROR.UNSUPPORTED_CAMERA, message: "camera.quaternion must be null or [x,y,z,w]" };
  return { ok: true };
}

/**
 * Validate a single reference frame against the bridge contract. Pure: mutates nothing.
 * Returns { ok:true, frame } or { ok:false, code, message }. `constraints` lets the
 * loopback test tighten the expected capture dimensions.
 */
export function validateReferenceFrame(frame, { expectedWidth = BRIDGE_LIMITS.captureWidth, expectedHeight = BRIDGE_LIMITS.captureHeight, maxBytes = BRIDGE_LIMITS.maxCaptureBytes, allowFormats = PIXEL_FORMATS } = {}) {
  if (!frame || typeof frame !== "object") return { ok: false, code: INGEST_ERROR.CORRUPT_FRAME, message: "frame must be an object" };
  const meta = validateMetadata(frame.metadata);
  if (!meta.ok) return meta;
  const cam = validateCameraSettings(frame.metadata);
  if (!cam.ok) return cam;

  // Pixel format.
  if (!frame.format || !allowFormats.includes(frame.format)) {
    return { ok: false, code: INGEST_ERROR.PIXEL_FORMAT, message: `unsupported pixel format "${frame.format}" (expected ${allowFormats.join("|")})` };
  }
  // Dimensions.
  if (!Number.isInteger(frame.width) || frame.width <= 0 || !Number.isInteger(frame.height) || frame.height <= 0) {
    return { ok: false, code: INGEST_ERROR.DIMENSIONS, message: `frame dimensions must be positive integers (got ${frame.width}x${frame.height})` };
  }
  if (frame.width !== expectedWidth || frame.height !== expectedHeight) {
    return { ok: false, code: INGEST_ERROR.DIMENSIONS, message: `frame ${frame.width}x${frame.height} != expected capture ${expectedWidth}x${expectedHeight}` };
  }
  // Payload presence + size + integrity.
  if (!(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray)) {
    return { ok: false, code: INGEST_ERROR.CORRUPT_FRAME, message: "frame.data must be a Uint8Array or Uint8ClampedArray" };
  }
  const channels = frame.format === "rgba8" ? 4 : 3;
  if (frame.data.length !== frame.width * frame.height * channels) {
    return { ok: false, code: INGEST_ERROR.CORRUPT_FRAME, message: `frame.data length ${frame.data.length} != ${frame.width}x${frame.height}x${channels}` };
  }
  if (frame.data.length > maxBytes) {
    return { ok: false, code: INGEST_ERROR.PAYLOAD_TOO_LARGE, message: `frame payload ${frame.data.length} bytes exceeds ${maxBytes}` };
  }
  return { ok: true, frame };
}

/**
 * Order/identity/session validation that depends on sequential state (not pure).
 * Tracks the expected next index and the active session generation; rejects
 * non-monotonic frames, session switches, and stale generations.
 */
export function validateOrder(frameIndex, sessionId, state) {
  if (state.sessionId !== undefined && sessionId !== state.sessionId) {
    return { ok: false, code: INGEST_ERROR.SESSION_MISMATCH, message: `session "${sessionId}" != active "${state.sessionId}"` };
  }
  if (state.generation !== undefined && state.generation !== state.activeGeneration) {
    return { ok: false, code: INGEST_ERROR.STALE_GENERATION, message: `frame carries stale generation ${state.generation}` };
  }
  if (state.nextIndex !== undefined && frameIndex < state.nextIndex) {
    return { ok: false, code: INGEST_ERROR.NON_MONOTONIC, message: `frameIndex ${frameIndex} < expected ${state.nextIndex}` };
  }
  return { ok: true };
}

/** Endpoint paths the HTTP ingress exposes (loopback). */
export const BRIDGE_ROUTES = Object.freeze({
  health: "/health",
  reference: "/reference",
  session: (id) => `/session/${encodeURIComponent(id)}`,
});
