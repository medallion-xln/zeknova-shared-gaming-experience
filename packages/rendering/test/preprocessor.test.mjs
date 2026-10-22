import { test } from "node:test";
import assert from "node:assert/strict";
import { gpuCropRect, syntheticFrame, rgbaToRgb, cropAndResizeGeometry, cropAndResize, toModelTensor, fromModelTensor, encodeFrameEnvelope, decodeFrameEnvelope, prepareReferenceFrame, assertFrame, createCaptureMetadata, CaptureFilter, MATRIX_GAME_4_SHOOTER } from "../src/index.js";

test("geometry matches upstream crop_and_resize for the shooter path (1280x720 -> 480x864)", () => {
  const g = cropAndResizeGeometry(1280, 720, 480, 864);
  assert.equal(g.scale, Math.max(864 / 1280, 480 / 720)); assert.equal(g.resizedWidth, 864); assert.equal(g.resizedHeight, 486); assert.equal(g.left, 0); assert.equal(g.top, 3);
  const r = cropAndResizeGeometry(1920, 1080, 480, 864);
  assert.equal(r.resizedWidth, 864); assert.equal(r.resizedHeight, 486); assert.equal(r.top, 3);
  const tall = cropAndResizeGeometry(1200, 897, 480, 864);
  assert.equal(tall.resizedWidth, 864); assert.equal(tall.resizedHeight, 646); assert.equal(tall.left, 0); assert.equal(tall.top, 83);
});

test("rgba→rgb drops alpha, crop/resize yields exact model dimensions, pipeline is deterministic", () => {
  const src = syntheticFrame(1280, 720);
  const rgb = rgbaToRgb(src); assert.equal(rgb.format, "rgb8"); assert.equal(rgb.data.length, 1280 * 720 * 3); assert.equal(rgb.data[0], src.data[0]); assert.equal(rgb.data[2], src.data[2]);
  const a = cropAndResize(rgb, 480, 864), b = cropAndResize(rgb, 480, 864);
  assert.equal(a.width, 864); assert.equal(a.height, 480); assert.deepEqual(a.data, b.data);
  const prepared = prepareReferenceFrame(src);
  assert.equal(prepared.frame.width, MATRIX_GAME_4_SHOOTER.modelWidth); assert.equal(prepared.frame.height, MATRIX_GAME_4_SHOOTER.modelHeight); assert.equal(prepared.colorSpace, "srgb");
  assert.ok(prepared.frame.data[0] <= 2, "left edge of gradient stays dark"); assert.ok(prepared.frame.data[(864 - 1) * 3] >= 253, "right edge stays bright");
});

test("tensor normalisation matches x*2/255-1 in CHW layout and round-trips", () => {
  const frame = syntheticFrame(8, 4, { format: "rgb8" });
  const t = toModelTensor(frame); assert.equal(t.layout, "CHW"); assert.equal(t.data.length, 3 * 32);
  assert.ok(Math.abs(t.data[0] - (frame.data[0] * 2 / 255 - 1)) < 1e-6); assert.ok(t.data.every((v) => v >= -1 && v <= 1));
  const back = fromModelTensor(t); assert.deepEqual(back.data, frame.data);
});

test("pixel-format validation rejects malformed frames with exact messages", () => {
  assert.throws(() => assertFrame({ width: 2, height: 2, format: "rgb8", data: new Uint8Array(11) }), /length 11 != 2x2x3/);
  assert.throws(() => assertFrame({ width: 0, height: 2, format: "rgb8", data: new Uint8Array(0) }), /positive integers/);
  assert.throws(() => assertFrame({ width: 1, height: 1, format: "yuv", data: new Uint8Array(3) }), /unsupported pixel format/);
});

test("length-prefixed envelope round-trips and enforces upstream-style bounds", () => {
  const frame = syntheticFrame(16, 9, { format: "rgb8" });
  const meta = createCaptureMetadata({ sessionId: "s1", sceneId: "zeknova", frameIndex: 7, simulationTime: 1.25, width: 16, height: 9, camera: { id: "cam" }, sceneRevision: 3 });
  const bytes = encodeFrameEnvelope(frame, meta);
  const view = new DataView(bytes.buffer); assert.equal(view.getUint32(4, false), 16 * 9 * 3);
  const decoded = decodeFrameEnvelope(bytes); assert.equal(decoded.metadata.frameIndex, 7); assert.equal(decoded.metadata.schema, "zge.capture-metadata.v1"); assert.deepEqual(decoded.frame.data, frame.data);
  assert.throws(() => encodeFrameEnvelope(frame, meta, { maxPixelBytes: 10 }), /exceeds/);
  assert.throws(() => decodeFrameEnvelope(bytes.subarray(0, bytes.length - 1)), /envelope length/);
});

test("capture metadata requires identity fields and versions extensions", () => {
  assert.throws(() => createCaptureMetadata({ sessionId: "", sceneId: "x", frameIndex: 0, simulationTime: 0, width: 1, height: 1, camera: { id: "c" } }), /sessionId/);
  assert.throws(() => createCaptureMetadata({ sessionId: "s", sceneId: "x", frameIndex: -1, simulationTime: 0, width: 1, height: 1, camera: { id: "c" } }), /frameIndex/);
  assert.throws(() => createCaptureMetadata({ sessionId: "s", sceneId: "x", frameIndex: 0, simulationTime: 0, width: 1, height: 1, camera: { id: "c" }, extensions: { foo: 1 } }), /extensions.schema/);
  const m = createCaptureMetadata({ sessionId: "s", sceneId: "x", frameIndex: 0, simulationTime: 0, width: 1, height: 1, camera: { id: "c" }, discontinuity: { reset: true, reasons: ["teleport"] }, extensions: { schema: "zge.ext.test.v1", foo: 1 } });
  assert.deepEqual(m.discontinuity, { reset: true, reasons: ["teleport"] }); assert.equal(m.extensions.foo, 1);
});

test("capture filter hides overlays and restores exactly what it hid", () => {
  const node = (name, extra = {}) => ({ name, visible: true, children: [], ...extra });
  const root = node("root", { children: [node("tree"), node("hud-label", { isSprite: true }), node("group", { children: [node("telegraph-text"), node("enemy", { userData: {} })] }), node("hidden-already", { isSprite: true, visible: false })] });
  const filter = new CaptureFilter();
  assert.equal(filter.apply(root), 2); assert.equal(root.children[1].visible, false); assert.equal(root.children[2].children[0].visible, false); assert.equal(root.children[0].visible, true);
  assert.equal(filter.restore(), 2); assert.equal(root.children[1].visible, true); assert.equal(root.children[3].visible, false, "pre-hidden objects stay hidden");
});

test("gpuCropRect: cropping the source then resizing equals upstream resize-then-crop geometry", () => {
  const r = gpuCropRect(1280, 720, 480, 864);
  assert.equal(r.sx, 0); assert.ok(Math.abs(r.sy - 3 / r.geometry.scale) < 1e-9); assert.ok(Math.abs(r.sw - 1280) < 1e-9); assert.ok(Math.abs(r.sh - 480 / r.geometry.scale) < 1e-9);
  assert.ok(Math.abs(r.sh * r.geometry.scale - 480) < 1e-9 && Math.abs(r.sw * r.geometry.scale - 864) < 1e-9, "crop rect scales exactly to the model size");
  const tall = gpuCropRect(1200, 897, 480, 864); assert.ok(tall.sy > 0 && tall.sx === 0 && tall.sh < 897);
  const wide = gpuCropRect(2400, 1794, 480, 864); assert.ok(wide.sw <= 2400 && wide.sh <= 1794);
});
