/**
 * ReferenceIngestBridge — CPU-compatible, source-owned ingestion boundary between
 * ZekNova's clean reference frames and the Matrix-Game 4 inference boundary.
 *
 * Responsibilities (and nothing else):
 *   - Validate every inbound reference frame (pixel format, dimensions, payload
 *     size, monotonic order, session identity, stale generations, corrupt frames,
 *     unsupported camera settings).
 *   - Apply bounded backpressure (a fixed-capacity queue with drop/reject policy)
 *     so a slow receiver never causes unbounded memory growth.
 *   - Frame reference frames into Matrix-Game-4-compatible chunks (first chunk = 1
 *     frame, later chunks = 4 frames) *only* as a description of chunk boundaries;
 *     the bridge does not run inference, so it does not consume model tensors.
 *
 * It holds no simulation state, no gameplay authority, and no world data. It is
 * presentation-adjacent transport: it can emit an accepted frame or a rejection,
 * and it records enough timing to measure transport latency.
 *
 * The loopback mode is explicitly labelled:
 *   REFERENCE TRANSPORT TEST — NOT NEURAL INFERENCE
 */
import { BoundedQueue } from "../../neural-rendering/src/index.js";
import { validateReferenceFrame, validateOrder, INGEST_ERROR, BRIDGE_LIMITS, TRANSPORT_TEST_LABEL } from "./protocol.js";

export class ReferenceIngestBridge {
  constructor({ queueCapacity = BRIDGE_LIMITS.defaultQueueCapacity, queuePolicy = "drop-oldest", expectedWidth = BRIDGE_LIMITS.captureWidth, expectedHeight = BRIDGE_LIMITS.captureHeight, chunkSize = 4, firstChunkSize = 1, now = () => (globalThis.performance?.now?.() ?? Date.now()) } = {}) {
    this.queue = new BoundedQueue({ capacity: queueCapacity, policy: queuePolicy, name: "bridge-ingest" });
    this.expectedWidth = expectedWidth; this.expectedHeight = expectedHeight;
    this.chunkSize = chunkSize; this.firstChunkSize = firstChunkSize;
    this.now = now;
    this.state = { sessionId: undefined, generation: undefined, activeGeneration: undefined, nextIndex: 0, accepted: 0, rejected: 0, received: 0 };
    this.rejections = Object.fromEntries(Object.values(INGEST_ERROR).map((k) => [k, 0]));
    this.lastAcceptedAt = null; this.disposed = false;
  }

  get label() { return TRANSPORT_TEST_LABEL; }
  get isNeuralInference() { return false; }

  /** Open a new session generation (e.g. on session start or reset). */
  openSession({ sessionId, generation = 0 } = {}) {
    if (this.disposed) throw new Error("bridge disposed");
    if (!sessionId || typeof sessionId !== "string") throw new TypeError("sessionId must be a non-empty string");
    this.state.sessionId = sessionId; this.state.generation = generation; this.state.activeGeneration = generation; this.state.nextIndex = 0;
    this.queue.clear();
  }

  /**
   * Accept or reject one reference frame. Pure validation + sequential checks are
   * applied before any enqueue. Returns a result object suitable for the transport
   * layer to translate into an HTTP/WS response.
   */
  ingest(frame) {
    if (this.disposed) return { accepted: false, code: INGEST_ERROR.CORRUPT_FRAME, message: "bridge disposed" };
    this.state.received += 1;
    const validated = validateReferenceFrame(frame, { expectedWidth: this.expectedWidth, expectedHeight: this.expectedHeight });
    if (!validated.ok) { this._reject(validated.code); return { accepted: false, ...validated }; }
    const order = validateOrder(frame.metadata.frameIndex, frame.metadata.sessionId, this.state);
    if (!order.ok) { this._reject(order.code); return { accepted: false, ...order }; }
    const enqueued = this.queue.push({ ...frame, receivedAt: this.now() });
    if (!enqueued.accepted) { this._reject(INGEST_ERROR.QUEUE_OVERFLOW); return { accepted: false, code: INGEST_ERROR.QUEUE_OVERFLOW, message: `queue full (capacity ${this.queue.capacity}, policy ${this.queue.policy})` }; }
    this.state.accepted += 1; this.state.nextIndex = frame.metadata.frameIndex + 1; this.lastAcceptedAt = this.now();
    return { accepted: true, frameIndex: frame.metadata.frameIndex, dropped: enqueued.dropped ? enqueued.dropped.metadata?.frameIndex ?? null : null };
  }

  /**
   * Chunk boundary description only. Matrix-Game 4 conditions on the first frame of a
   * session as a 1-frame chunk and every later chunk as 4 frames. This returns the
   * NOTIONAL chunk index for a frame index; it does not buffer model tensors.
   */
  chunkForFrameIndex(frameIndex) {
    if (frameIndex <= 0) return 0;
    return Math.floor((frameIndex - this.firstChunkSize) / this.chunkSize) + 1;
  }

  /** Drain accepted frames for the transport (e.g. the loopback echo). */
  takeAccepted() { const out = []; let item; while ((item = this.queue.shift())) out.push(item); return out; }

  /** Reject-and-count shorthand. */
  _reject(code) { this.state.rejected += 1; this.rejections[code] += 1; }

  stats() { return Object.freeze({ ...this.state, rejections: { ...this.rejections }, queue: this.queue.stats(), label: this.label, isNeuralInference: false }); }

  dispose() { this.disposed = true; this.queue.clear(); }
}
