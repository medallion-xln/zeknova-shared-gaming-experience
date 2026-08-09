import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, resolve } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { meshopt, prune, resample } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const MODEL_ROOT = resolve(ROOT, "assets/models");
const requested = new Set(process.argv.slice(2));

// These are the models that materially affect GPU time. Enemy and companion
// meshes already near 10k triangles use gentler ratios than the 312k coral.
const TARGETS = [
  ["environment/alien-coral-ground.glb", 0.08, 0.025],
  ["environment/alien-palm-tree.glb", 0.68, 0.28],
  ["environment/alien-spiky-plant.glb", 0.68, 0.3],
  ["environment/giant-canopy-tree.glb", 0.64, 0.26],
  ["environment/tiered-stone-pillar.glb", 0.58, 0.24],
  ["environment/zeknovan-village-council-arctic.glb", 0.62, 0.28],
  ["environment/zeknovan-village-shrine-arctic.glb", 0.62, 0.28],
  ["environment/zeknovan-village-habitat-arctic.glb", 0.62, 0.28],
  ["ensign-support-scout.glb", 0.22, 0.075],
  ["lieutenant-astronaut.glb", 0.72, 0.42],
  ["lieutenant-mech-walk.glb", 0.72, 0.42],
  ["captain-mech-walk.glb", 0.72, 0.42],
  ["zeknovan-juggernaut-walk.glb", 0.72, 0.42],
  ["zeknovan-stalker-walk.glb", 0.72, 0.42],
  ["zeknovan-saboteur-walk.glb", 0.72, 0.42],
  ["zeknovan-spitter-walk.glb", 0.72, 0.42],
  ["zeknovan-skyray-walk.glb", 0.72, 0.42],
  ["boss-sunscar-colossus.glb", 0.48, 0.2],
  ["weapon-voidsting.glb", 0.5, 0.24],
  ["weapon-singularity.glb", 0.5, 0.24],
  ["weapon-thunderclaw.glb", 0.5, 0.24],
];

const RUN_ANIMATIONS = [
  "lieutenant-astronaut-run.glb",
  "lieutenant-mech-run.glb",
  "captain-mech-run.glb",
  "zeknovan-juggernaut-run.glb",
  "zeknovan-stalker-run.glb",
  "zeknovan-saboteur-run.glb",
  "zeknovan-spitter-run.glb",
  "zeknovan-skyray-run.glb",
];

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const textureCache = new Map();

function createIO() {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
}

function tierPath(sourcePath, tier) {
  return sourcePath.replace(/\.glb$/i, `.${tier}.glb`);
}

async function compressTextures(document, label) {
  const textures = document.getRoot().listTextures();
  if (!textures.length) return;
  document.createExtension(KHRTextureBasisu).setRequired(true);
  const temporary = mkdtempSync(`${tmpdir()}/zeknova-ktx2-`);
  try {
    for (let index = 0; index < textures.length; index += 1) {
      const texture = textures[index];
      const image = texture.getImage();
      if (!image || texture.getMimeType() === "image/ktx2") continue;
      const decoded = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const input = resolve(temporary, `${index}.png`);
      const output = resolve(temporary, `${index}.ktx2`);
      const name = `${texture.getName()} ${texture.getURI()}`.toLowerCase();
      const linear = /normal|metal|rough|occlusion/.test(name);
      const cacheKey = createHash("sha256")
        .update(decoded.data)
        .update(`${decoded.info.width}x${decoded.info.height}:${linear ? "linear" : "srgb"}`)
        .digest("hex");
      if (textureCache.has(cacheKey)) {
        texture
          .setExtension("EXT_texture_webp", null)
          .setImage(textureCache.get(cacheKey))
          .setMimeType("image/ktx2");
        continue;
      }
      await sharp(decoded.data, { raw: decoded.info }).png().toFile(input);
      const args = [
        "-file", input,
        "-output_file", output,
        "-ktx2", "-mipmap", "-quiet",
        linear ? "-linear" : "-srgb",
        linear ? "-uastc" : "-etc1s",
        "-quality", linear ? "76" : "82",
        "-effort", "3",
      ];
      execFileSync("basisu", args, { stdio: "inherit" });
      const compressed = readFileSync(output);
      textureCache.set(cacheKey, compressed);
      texture
        .setExtension("EXT_texture_webp", null)
        .setImage(compressed)
        .setMimeType("image/ktx2");
    }
    // Imported Meshy files declare EXT_texture_webp as required. Once every
    // texture has a Basis payload the empty declaration must be removed too,
    // otherwise browsers still treat WebP as a runtime requirement.
    document.getRoot().listExtensionsUsed()
      .find((extension) => extension.extensionName === "EXT_texture_webp")
      ?.dispose();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  console.log(`${label}: ${textures.length} texture${textures.length === 1 ? "" : "s"} converted to KTX2.`);
}

function geometryCounts(document) {
  let vertices = 0;
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      vertices += primitive.getAttribute("POSITION")?.getCount() || 0;
      triangles += Math.floor((primitive.getIndices()?.getCount() || 0) / 3);
    }
  }
  return { vertices, triangles };
}

async function optimizeBase(document) {
  await document.transform(
    resample(),
    prune({ keepAttributes: true, keepIndices: true }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );
}

async function buildTarget(relativePath, mediumRatio, lowRatio) {
  const input = resolve(MODEL_ROOT, relativePath);
  const io = createIO();
  const base = await io.read(input);
  const sourceCounts = geometryCounts(base);
  await compressTextures(base, relativePath);
  await optimizeBase(base);
  const highPath = tierPath(input, "high");
  await io.write(highPath, base);

  const tiers = [["medium", mediumRatio], ["low", lowRatio]];
  const reports = [];
  for (const [tier, ratio] of tiers) {
    const temporary = mkdtempSync(`${tmpdir()}/zeknova-lod-`);
    const decimatedPath = resolve(temporary, `${basename(input, extname(input))}.${tier}.glb`);
    execFileSync("blender", [
      "--background",
      "--python", resolve(ROOT, "scripts/create-blender-lod.py"),
      "--",
      "--input", input,
      "--output", decimatedPath,
      "--ratio", String(ratio),
    ], { stdio: "inherit" });
    const document = await createIO().read(decimatedPath);
    await compressTextures(document, `${relativePath}:${tier}`);
    await document.transform(
      resample(),
      prune({ keepAttributes: true, keepIndices: true }),
      meshopt({ encoder: MeshoptEncoder, level: "high" }),
    );
    const output = tierPath(input, tier);
    await createIO().write(output, document);
    reports.push({ tier, path: output, ...geometryCounts(document) });
    rmSync(temporary, { recursive: true, force: true });
  }
  const highBytes = readFileSync(highPath).byteLength;
  console.log(JSON.stringify({
    model: relativePath,
    source: sourceCounts,
    highBytes,
    lods: reports.map((report) => ({
      tier: report.tier,
      triangles: report.triangles,
      vertices: report.vertices,
      bytes: readFileSync(report.path).byteLength,
    })),
  }));
}

mkdirSync(MODEL_ROOT, { recursive: true });
for (const [relativePath, mediumRatio, lowRatio] of TARGETS) {
  if (requested.size && !requested.has(relativePath)) continue;
  await buildTarget(relativePath, mediumRatio, lowRatio);
}

if (!requested.size || requested.has("animations")) {
  for (const relativePath of RUN_ANIMATIONS) {
    const source = resolve(MODEL_ROOT, relativePath);
    const output = source.replace(/-run\.glb$/i, "-run.anim.glb");
    execFileSync(process.execPath, [resolve(ROOT, "scripts/extract-animation-glb.mjs"), source, output], { stdio: "inherit" });
  }
}

console.log(`ZekNova model LOD build complete (${TARGETS.length} configured sources).`);
