import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, resample } from "@gltf-transform/functions";

const [, , input, output] = process.argv;

if (!input || !output) {
  console.error("Usage: node scripts/extract-animation.mjs <input.glb> <output.glb>");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
const root = document.getRoot();

if (root.listAnimations().length === 0) {
  throw new Error(`${input} does not contain an animation clip.`);
}

for (const node of root.listNodes()) {
  node.setMesh(null);
  node.setSkin(null);
  node.setCamera(null);
}

for (const mesh of root.listMeshes()) mesh.dispose();
for (const skin of root.listSkins()) skin.dispose();
for (const material of root.listMaterials()) material.dispose();
for (const texture of root.listTextures()) texture.dispose();

await document.transform(resample(), prune());
await io.write(output, document);

console.log(`Extracted ${root.listAnimations().length} animation clip to ${output}`);
