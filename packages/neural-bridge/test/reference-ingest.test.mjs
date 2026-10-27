import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { syntheticFrame, createCaptureMetadata, encodeFrameEnvelope } from "../../rendering/src/index.js";
import {
  ReferenceIngestBridge,
  validateReferenceFrame,
  validateOrder,
  INGEST_ERROR,
  TRANSPORT_TEST_LABEL,
  BRIDGE_LIMITS,
} from "../src/index.js";
import { LoopbackTransport } from "../src/node.js";

const CAP = BRIDGE_LIMITS;

function ref({ index = 0, sessionId = "s1", sceneId = "test", width = CAP.captureWidth, height = CAP.captureHeight, format = "rgba8", camera = { id: "cam", position: [0, 0, 0], quaternion: [0, 0, 0, 1] }, simulateTime = (index + 1) / 60, data = null } = {}) {
  const frame = syntheticFrame(width, height, { format, seed: index + 1 });
  frame.data = data ?? frame.data;
  const metadata = createCaptureMetadata({ sessionId, sceneId, frameIndex: index, simulationTime: simulateTime, width, height, camera, sceneRevision: 0, capturedAt: Date.now() });
  return { ...frame, kind: "capture", metadata };
}

test("validateReferenceFrame accepts a clean 1280x720 rgba8 frame with camera", () => {
  const frame = ref();
  const result = validateReferenceFrame(frame);
  assert.equal(result.ok, true);
});

test("validateReferenceFrame rejects wrong pixel format", () => {
  const frame = ref({ format: "rgb8" });
  // rgb8 at 1280x720 is valid format but not the capture format; assert on a bogus format instead
  const bogus = { ...frame, format: "bogus" };
  assert.equal(validateReferenceFrame(bogus).code, INGEST_ERROR.PIXEL_FORMAT);
});

test("validateReferenceFrame rejects wrong dimensions", () => {
  const frame = ref({ width: 320, height: 180 });
  assert.equal(validateReferenceFrame(frame).code, INGEST_ERROR.DIMENSIONS);
});

test("validateReferenceFrame rejects corrupt payload length", () => {
  const frame = ref();
  frame.data = new Uint8Array(10); // wrong length for 1280x720x4
  assert.equal(validateReferenceFrame(frame).code, INGEST_ERROR.CORRUPT_FRAME);
});

test("validateReferenceFrame rejects missing camera id (unsupported camera)", () => {
  const frame = ref({ camera: { id: "" } });
  assert.equal(validateReferenceFrame(frame).code, INGEST_ERROR.UNSUPPORTED_CAMERA);
});

test("validateReferenceFrame rejects non-finite camera position", () => {
  const frame = ref({ camera: { id: "cam", position: [0, NaN, 0], quaternion: [0, 0, 0, 1] } });
  assert.equal(validateReferenceFrame(frame).code, INGEST_ERROR.UNSUPPORTED_CAMERA);
});

test("bridge accepts ordered frames and advances the expected index", () => {
  const bridge = new ReferenceIngestBridge();
  bridge.openSession({ sessionId: "s1" });
  const a = bridge.ingest(ref({ index: 0 }));
  const b = bridge.ingest(ref({ index: 1 }));
  assert.equal(a.accepted, true); assert.equal(b.accepted, true);
  assert.equal(bridge.stats().nextIndex, 2); assert.equal(bridge.stats().accepted, 2);
});

test("bridge rejects non-monotonic frame order", () => {
  const bridge = new ReferenceIngestBridge();
  bridge.openSession({ sessionId: "s1" });
  bridge.ingest(ref({ index: 1 }));
  const stale = bridge.ingest(ref({ index: 0 }));
  assert.equal(stale.accepted, false); assert.equal(stale.code, INGEST_ERROR.NON_MONOTONIC);
});

test("bridge rejects session mismatch", () => {
  const bridge = new ReferenceIngestBridge();
  bridge.openSession({ sessionId: "s1" });
  const other = bridge.ingest(ref({ index: 0, sessionId: "s2" }));
  assert.equal(other.code, INGEST_ERROR.SESSION_MISMATCH);
});

test("bridge rejects stale generation", () => {
  const bridge = new ReferenceIngestBridge();
  bridge.openSession({ sessionId: "s1", generation: 3 });
  assert.equal(bridge.ingest(ref({ index: 0 })).accepted, true);
  // Direct unit test of the stale-generation branch:
  assert.equal(validateOrder(0, "s1", { sessionId: "s1", generation: 1, activeGeneration: 3, nextIndex: 0 }).code, INGEST_ERROR.STALE_GENERATION);
});

test("bridge applies backpressure: reject-newest on a full queue", () => {
  const bridge = new ReferenceIngestBridge({ queueCapacity: 1, queuePolicy: "reject-newest" });
  bridge.openSession({ sessionId: "s1" });
  bridge.ingest(ref({ index: 0 }));
  const overflow = bridge.ingest(ref({ index: 1 }));
  assert.equal(overflow.accepted, false); assert.equal(overflow.code, INGEST_ERROR.QUEUE_OVERFLOW);
});

test("bridge drop-oldest policy evicts the oldest accepted frame", () => {
  const bridge = new ReferenceIngestBridge({ queueCapacity: 1, queuePolicy: "drop-oldest" });
  bridge.openSession({ sessionId: "s1" });
  const first = bridge.ingest(ref({ index: 0 }));
  const second = bridge.ingest(ref({ index: 1 }));
  assert.equal(first.accepted, true); assert.equal(second.accepted, true);
  assert.equal(second.dropped, 0); // dropped frame index of the evicted frame
  assert.equal(bridge.queue.stats().dropped, 1);
});

test("chunk framing matches Matrix-Game 4: first chunk 1, then 4-frame chunks", () => {
  const bridge = new ReferenceIngestBridge();
  assert.equal(bridge.chunkForFrameIndex(0), 0);
  assert.equal(bridge.chunkForFrameIndex(1), 1);
  assert.equal(bridge.chunkForFrameIndex(4), 1);
  assert.equal(bridge.chunkForFrameIndex(5), 2);
});

test("bridge labels itself as a transport test, never neural inference", () => {
  const bridge = new ReferenceIngestBridge();
  assert.equal(bridge.label, TRANSPORT_TEST_LABEL);
  assert.equal(bridge.isNeuralInference, false);
  assert.equal(bridge.stats().isNeuralInference, false);
});

test("loopback transport echoes real frame bytes with the transport label and no neural claim", async () => {
  const bridge = new ReferenceIngestBridge();
  const transport = new LoopbackTransport({ bridge });
  const { baseUrl } = await transport.start({ port: 0 });
  try {
    bridge.openSession({ sessionId: "s1" });
    const frame = ref({ index: 0 });
    const envelope = encodeFrameEnvelope(frame, { ...frame.metadata });
    const response = await fetch(`${baseUrl}/reference`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: envelope });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.accepted, true);
    assert.equal(body.label, TRANSPORT_TEST_LABEL);
    assert.equal(body.isNeuralInference, false);
    assert.ok(body.echoedBytes > 0);
    assert.equal(response.headers.get("x-zge-bridge"), "zge-reference-bridge/0");
    assert.equal(response.headers.get("x-zge-transport-test"), "1");
    assert.equal(transport.stats().isNeuralInference, false);
  } finally {
    await transport.close();
  }
});

test("loopback transport enforces loopback-only and rejects remote hosts", async () => {
  const bridge = new ReferenceIngestBridge();
  const transport = new LoopbackTransport({ bridge });
  const { port } = await transport.start({ port: 0 });
  try {
    const envelope = encodeFrameEnvelope(ref({ index: 0 }), { sessionId: "s1", sceneId: "t", frameIndex: 0 });
    const status = await rawPost(port, envelope, "192.0.2.1:9999");
    assert.equal(status, 403);
  } finally {
    await transport.close();
  }
});

// fetch forbids a mismatched Host header, so emit a raw request to exercise the host guard.
function rawPost(port, body, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/reference", method: "POST", headers: { "Content-Type": "application/octet-stream", Host: host } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    req.on("error", reject);
    req.end(body);
  });
}

test("loopback transport health reports ready, transport-test, not neural", async () => {
  const bridge = new ReferenceIngestBridge();
  const transport = new LoopbackTransport({ bridge });
  const { baseUrl } = await transport.start({ port: 0 });
  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(body.ready, true);
    assert.equal(body.isNeuralInference, false);
    assert.equal(body.label, TRANSPORT_TEST_LABEL);
  } finally {
    await transport.close();
  }
});

test("loopback transport rejects corrupt envelopes with a stable error code", async () => {
  const bridge = new ReferenceIngestBridge();
  const transport = new LoopbackTransport({ bridge });
  const { baseUrl } = await transport.start({ port: 0 });
  try {
    const response = await fetch(`${baseUrl}/reference`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array([1, 2, 3]) });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, INGEST_ERROR.CORRUPT_FRAME);
  } finally {
    await transport.close();
  }
});

test("bridge rejections are counted by code", () => {
  const bridge = new ReferenceIngestBridge();
  bridge.openSession({ sessionId: "s1" });
  bridge.ingest(ref({ index: 0, format: "bogus" })); // PIXEL_FORMAT
  bridge.ingest(ref({ index: 0, sessionId: "s2" })); // SESSION_MISMATCH (frame 0 valid but session differs)
  const s = bridge.stats();
  assert.ok(s.rejections[INGEST_ERROR.PIXEL_FORMAT] >= 1);
});
