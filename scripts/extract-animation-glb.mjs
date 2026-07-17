import fs from 'node:fs';
import path from 'node:path';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  throw new Error('Usage: node extract-animation-glb.mjs input.glb output.glb');
}

const source = fs.readFileSync(inputPath);
if (source.toString('utf8', 0, 4) !== 'glTF') throw new Error('Input is not a binary glTF file.');

const jsonLength = source.readUInt32LE(12);
const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/, ''));
const binaryHeader = 20 + jsonLength;
const binaryLength = source.readUInt32LE(binaryHeader);
const binary = source.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength);
const animation = json.animations?.[0];
if (!animation) throw new Error('Input does not contain an animation.');

const accessorIndexes = new Set();
for (const sampler of animation.samplers) {
  accessorIndexes.add(sampler.input);
  accessorIndexes.add(sampler.output);
}

const accessorMap = new Map();
const viewIndexes = new Set();
const accessors = [...accessorIndexes].map((oldIndex, newIndex) => {
  accessorMap.set(oldIndex, newIndex);
  const accessor = structuredClone(json.accessors[oldIndex]);
  viewIndexes.add(accessor.bufferView);
  return accessor;
});

const viewMap = new Map();
const chunks = [];
let byteOffset = 0;
const bufferViews = [...viewIndexes].map((oldIndex, newIndex) => {
  viewMap.set(oldIndex, newIndex);
  const oldView = json.bufferViews[oldIndex];
  const bytes = binary.subarray(oldView.byteOffset ?? 0, (oldView.byteOffset ?? 0) + oldView.byteLength);
  const padding = (4 - (byteOffset % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    byteOffset += padding;
  }
  const view = { buffer: 0, byteOffset, byteLength: bytes.length };
  if (oldView.byteStride) view.byteStride = oldView.byteStride;
  chunks.push(bytes);
  byteOffset += bytes.length;
  return view;
});

for (const accessor of accessors) accessor.bufferView = viewMap.get(accessor.bufferView);
const compactAnimation = structuredClone(animation);
for (const sampler of compactAnimation.samplers) {
  sampler.input = accessorMap.get(sampler.input);
  sampler.output = accessorMap.get(sampler.output);
}

const nodes = (json.nodes ?? []).map((node) => {
  const clean = {};
  for (const key of ['name', 'children', 'translation', 'rotation', 'scale', 'matrix', 'extras']) {
    if (node[key] !== undefined) clean[key] = structuredClone(node[key]);
  }
  return clean;
});
const compactBinary = Buffer.concat(chunks);
const outputJson = {
  asset: json.asset,
  scene: json.scene ?? 0,
  scenes: structuredClone(json.scenes ?? [{ nodes: [0] }]),
  nodes,
  animations: [compactAnimation],
  accessors,
  bufferViews,
  buffers: [{ byteLength: compactBinary.length }],
  extras: {
    source: path.basename(inputPath),
    animationOnly: true,
  },
};

let jsonBytes = Buffer.from(JSON.stringify(outputJson));
jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
let binaryBytes = compactBinary;
binaryBytes = Buffer.concat([binaryBytes, Buffer.alloc((4 - (binaryBytes.length % 4)) % 4)]);

const header = Buffer.alloc(12);
header.write('glTF', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binaryBytes.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBytes.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binaryChunkHeader = Buffer.alloc(8);
binaryChunkHeader.writeUInt32LE(binaryBytes.length, 0);
binaryChunkHeader.writeUInt32LE(0x004e4942, 4);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, Buffer.concat([header, jsonHeader, jsonBytes, binaryChunkHeader, binaryBytes]));
console.log(`${path.basename(outputPath)}: ${source.length} -> ${fs.statSync(outputPath).size} bytes`);
