import { assertFrame, channelsOf } from "./contracts.js";

/**
 * CPU frame preprocessing modelled on Matrix-Game 4's training-side path
 * (`matrix_game/inference/preprocessing.py`, Apache-2.0, upstream c7a88bfc):
 *   scale = max(targetW / w, targetH / h); size = (round(w*scale), round(h*scale));
 *   bilinear resize; left = round((size.w - targetW)/2); top = round((size.h - targetH)/2); crop.
 *   tensor = x * 2/255 - 1 laid out [C, H, W].
 *
 * HONESTY NOTE: PIL's BILINEAR resize uses a support-scaled (antialiased) filter when
 * downscaling; the implementation below is a plain 2x2 bilinear sample. Geometry
 * (sizes, crop offsets, ordering, normalisation) matches upstream exactly; pixel
 * values are NOT guaranteed bit-exact against PIL/torchvision for downscales.
 * Pixel-exact parity needs upstream fixtures and is tracked in NEURAL_MODEL_READINESS.md.
 */

export const MATRIX_GAME_4_SHOOTER = Object.freeze({ captureWidth: 1280, captureHeight: 720, modelWidth: 864, modelHeight: 480, colorSpace: "srgb", pixelFormat: "rgb8" });

export function rgbaToRgb(frame) {
  assertFrame(frame, { allowFormats: ["rgba8"] });
  const { width, height, data } = frame; const out = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { out[j] = data[i]; out[j + 1] = data[i + 1]; out[j + 2] = data[i + 2]; }
  return { width, height, format: "rgb8", data: out };
}

/** Geometry of the upstream crop-and-resize, exposed so tests and the protocol doc can reason about it. */
export function cropAndResizeGeometry(width, height, targetHeight, targetWidth) {
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
  const left = Math.round((resizedWidth - targetWidth) / 2), top = Math.round((resizedHeight - targetHeight) / 2);
  return Object.freeze({ scale, resizedWidth, resizedHeight, left, top, targetWidth, targetHeight });
}

/**
 * Source-space crop rectangle whose resize to (targetWidth x targetHeight) is equivalent to upstream's
 * "resize then centre crop" (up to rounding). Lets a GPU resizer (createImageBitmap) do the whole
 * preprocessing in one pass instead of a 1280x720 readback followed by CPU resize + crop.
 */
export function gpuCropRect(width, height, targetHeight, targetWidth) {
  const g = cropAndResizeGeometry(width, height, targetHeight, targetWidth);
  const sx = g.left / g.scale, sy = g.top / g.scale, sw = targetWidth / g.scale, sh = targetHeight / g.scale;
  return Object.freeze({ sx: Math.max(0, Math.min(width, sx)), sy: Math.max(0, Math.min(height, sy)), sw: Math.min(width, sw), sh: Math.min(height, sh), targetWidth, targetHeight, geometry: g });
}

/** Plain bilinear resample (2x2 taps, half-pixel centres). */
export function resizeBilinear(frame, targetWidth, targetHeight) {
  assertFrame(frame);
  const ch = channelsOf(frame.format); const { width: sw, height: sh, data: src } = frame;
  const out = new Uint8ClampedArray(targetWidth * targetHeight * ch);
  const xRatio = sw / targetWidth, yRatio = sh / targetHeight;
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * yRatio - 0.5)); const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * xRatio - 0.5)); const x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0;
      const i00 = (y0 * sw + x0) * ch, i10 = (y0 * sw + x1) * ch, i01 = (y1 * sw + x0) * ch, i11 = (y1 * sw + x1) * ch, o = (y * targetWidth + x) * ch;
      for (let c = 0; c < ch; c += 1) out[o + c] = Math.round(src[i00 + c] * (1 - fx) * (1 - fy) + src[i10 + c] * fx * (1 - fy) + src[i01 + c] * (1 - fx) * fy + src[i11 + c] * fx * fy);
    }
  }
  return { width: targetWidth, height: targetHeight, format: frame.format, data: out };
}

export function crop(frame, left, top, width, height) {
  assertFrame(frame);
  if (left < 0 || top < 0 || left + width > frame.width || top + height > frame.height) throw new RangeError(`crop ${left},${top} ${width}x${height} exceeds ${frame.width}x${frame.height}`);
  const ch = channelsOf(frame.format); const out = new Uint8ClampedArray(width * height * ch);
  for (let y = 0; y < height; y += 1) out.set(frame.data.subarray(((top + y) * frame.width + left) * ch, ((top + y) * frame.width + left + width) * ch), y * width * ch);
  return { width, height, format: frame.format, data: out };
}

/** Upstream `crop_and_resize(image, target_height, target_width)`. */
export function cropAndResize(frame, targetHeight, targetWidth) {
  const g = cropAndResizeGeometry(frame.width, frame.height, targetHeight, targetWidth);
  const resized = resizeBilinear(frame, g.resizedWidth, g.resizedHeight);
  return crop(resized, g.left, g.top, targetWidth, targetHeight);
}

/** Upstream `frames_to_tensor`: uint8 [H,W,3] → float32 [3,H,W] in [-1, 1]. */
export function toModelTensor(frame) {
  assertFrame(frame, { allowFormats: ["rgb8"] });
  const { width, height, data } = frame; const plane = width * height; const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) { out[i] = data[i * 3] * (2 / 255) - 1; out[plane + i] = data[i * 3 + 1] * (2 / 255) - 1; out[2 * plane + i] = data[i * 3 + 2] * (2 / 255) - 1; }
  return { layout: "CHW", channels: 3, width, height, data: out };
}

/** Inverse of toModelTensor (upstream `tensor_to_uint8`). */
export function fromModelTensor(tensor) {
  const { width, height, data } = tensor; const plane = width * height; const out = new Uint8ClampedArray(plane * 3);
  for (let i = 0; i < plane; i += 1) for (let c = 0; c < 3; c += 1) out[i * 3 + c] = Math.round((Math.min(1, Math.max(-1, data[c * plane + i])) + 1) * 127.5);
  return { width, height, format: "rgb8", data: out };
}

/** Length-prefixed envelope: 4-byte BE json length + 4-byte BE pixel length + json + pixels (mirrors upstream IPC `!II`). */
export function encodeFrameEnvelope(frame, metadata, { maxJsonBytes = 65536, maxPixelBytes = 4 * 1280 * 720 * 4 } = {}) {
  assertFrame(frame);
  const json = new TextEncoder().encode(JSON.stringify({ ...metadata, width: frame.width, height: frame.height, format: frame.format }));
  if (json.length === 0 || json.length > maxJsonBytes) throw new RangeError(`envelope json ${json.length} bytes exceeds ${maxJsonBytes}`);
  if (frame.data.length > maxPixelBytes) throw new RangeError(`envelope pixels ${frame.data.length} bytes exceeds ${maxPixelBytes}`);
  const out = new Uint8Array(8 + json.length + frame.data.length); const view = new DataView(out.buffer);
  view.setUint32(0, json.length, false); view.setUint32(4, frame.data.length, false); out.set(json, 8); out.set(frame.data, 8 + json.length);
  return out;
}

export function decodeFrameEnvelope(bytes, { maxJsonBytes = 65536, maxPixelBytes = 4 * 1280 * 720 * 4 } = {}) {
  if (bytes.length < 8) throw new RangeError("envelope shorter than header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(0, false), pixelLength = view.getUint32(4, false);
  if (jsonLength === 0 || jsonLength > maxJsonBytes || pixelLength > maxPixelBytes) throw new RangeError("invalid envelope sizes");
  if (bytes.length !== 8 + jsonLength + pixelLength) throw new RangeError(`envelope length ${bytes.length} != ${8 + jsonLength + pixelLength}`);
  const metadata = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jsonLength)));
  const data = new Uint8ClampedArray(bytes.subarray(8 + jsonLength, 8 + jsonLength + pixelLength));
  const frame = { width: metadata.width, height: metadata.height, format: metadata.format, data };
  assertFrame(frame);
  return { frame, metadata };
}

/** Full conditioning pipeline for one frame: rgba→rgb, crop/resize to model size, validate. */
export function prepareReferenceFrame(frame, { modelWidth = MATRIX_GAME_4_SHOOTER.modelWidth, modelHeight = MATRIX_GAME_4_SHOOTER.modelHeight } = {}) {
  const rgb = frame.format === "rgba8" ? rgbaToRgb(frame) : assertFrame(frame, { allowFormats: ["rgb8"] });
  const prepared = cropAndResize(rgb, modelHeight, modelWidth);
  return Object.freeze({ frame: prepared, geometry: cropAndResizeGeometry(frame.width, frame.height, modelHeight, modelWidth), colorSpace: "srgb" });
}

/** Deterministic synthetic fixture (gradient + checker) for CPU tests. */
export function syntheticFrame(width, height, { format = "rgba8", seed = 1 } = {}) {
  const ch = channelsOf(format); const data = new Uint8ClampedArray(width * height * ch);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const o = (y * width + x) * ch; const checker = ((x >> 4) + (y >> 4)) & 1;
    data[o] = Math.round(255 * x / Math.max(1, width - 1)); data[o + 1] = Math.round(255 * y / Math.max(1, height - 1)); data[o + 2] = checker ? 200 : (seed * 37) % 255; if (ch === 4) data[o + 3] = 255;
  }
  return { width, height, format, data };
}
