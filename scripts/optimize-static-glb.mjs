import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, resolve } from "node:path";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/optimize-static-glb.mjs input.glb output.glb");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const source = readFileSync(inputPath);
if (source.readUInt32LE(0) !== 0x46546c67 || source.readUInt32LE(4) !== 2) {
  throw new Error("Only binary glTF 2.0 files are supported.");
}

let offset = 12;
let document;
let binary;
while (offset < source.length) {
  const length = source.readUInt32LE(offset);
  const type = source.readUInt32LE(offset + 4);
  offset += 8;
  const chunk = source.subarray(offset, offset + length);
  if (type === 0x4e4f534a) document = JSON.parse(chunk.toString("utf8").replace(/\0+$/, ""));
  if (type === 0x004e4942) binary = chunk;
  offset += length;
}
if (!document || !binary || document.buffers?.length !== 1) {
  throw new Error("Expected one embedded JSON document and one embedded buffer.");
}

const imageViews = new Map((document.images || []).map((image, index) => [image.bufferView, { image, index }]));
const temporary = mkdtempSync(`${tmpdir()}/zeknova-glb-`);
const replacementViews = new Map();

try {
  for (const [viewIndex, entry] of imageViews) {
    const view = document.bufferViews[viewIndex];
    const bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const extension = entry.image.mimeType === "image/jpeg" ? ".jpg" : ".png";
    const inputImage = `${temporary}/image-${entry.index}${extension}`;
    const outputImage = `${temporary}/image-${entry.index}.webp`;
    writeFileSync(inputImage, bytes);
    const mapName = String(entry.image.name || "").toLowerCase();
    const quality = mapName.includes("metallic") || mapName.includes("roughness") ? "86" : "80";
    execFileSync("cwebp", ["-quiet", "-mt", "-q", quality, "-sharp_yuv", "-resize", "1024", "0", inputImage, "-o", outputImage]);
    replacementViews.set(viewIndex, readFileSync(outputImage));
    entry.image.mimeType = "image/webp";
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

const parts = [];
let binaryLength = 0;
for (let index = 0; index < document.bufferViews.length; index += 1) {
  const view = document.bufferViews[index];
  const original = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
  const bytes = replacementViews.get(index) || original;
  const padding = (4 - (binaryLength % 4)) % 4;
  if (padding) {
    parts.push(Buffer.alloc(padding));
    binaryLength += padding;
  }
  view.byteOffset = binaryLength;
  view.byteLength = bytes.length;
  parts.push(bytes);
  binaryLength += bytes.length;
}
const binaryPadding = (4 - (binaryLength % 4)) % 4;
if (binaryPadding) parts.push(Buffer.alloc(binaryPadding));
const packedBinary = Buffer.concat(parts);
document.buffers[0].byteLength = packedBinary.length;

for (const texture of document.textures || []) {
  if (!Number.isInteger(texture.source)) continue;
  texture.extensions ||= {};
  texture.extensions.EXT_texture_webp = { source: texture.source };
  delete texture.source;
}
document.extensionsUsed = [...new Set([...(document.extensionsUsed || []), "EXT_texture_webp"])];
document.extensionsRequired = [...new Set([...(document.extensionsRequired || []), "EXT_texture_webp"])];
document.asset.generator = `${document.asset.generator || "glTF"}; ZekNova static WebP optimizer`;

let json = Buffer.from(JSON.stringify(document));
const jsonPadding = (4 - (json.length % 4)) % 4;
if (jsonPadding) json = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + packedBinary.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(packedBinary.length, 0);
binaryHeader.writeUInt32LE(0x004e4942, 4);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.concat([header, jsonHeader, json, binaryHeader, packedBinary]));
console.log(`${inputPath} -> ${outputPath} (${(source.length / 1048576).toFixed(1)} MB -> ${(readFileSync(outputPath).length / 1048576).toFixed(1)} MB)`);
