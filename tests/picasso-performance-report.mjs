import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "../assets/vendor/three.module.min.js";
import { Picasso } from "../src/game/Picasso.js";
import { VisualThemeManager } from "../src/game/VisualThemeManager.js";

const scene = new Group();
for (let index = 0; index < 250; index += 1) {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  mesh.name = index % 5 === 0 ? "settlement-building" : `scenery-${index}`;
  scene.add(mesh);
}
const renderer = { isWebGLRenderer: true, toneMapping: 0, toneMappingExposure: 1, info: { memory: { geometries: 250, textures: 0 } } };
const manager = new VisualThemeManager({ scene, renderer }).init();
const heapBefore = process.memoryUsage().heapUsed;
const start = performance.now();
const switches = 300;
for (let index = 0; index < switches; index += 1) {
  manager.applyTheme(["zeknova", "anime", "cinematic"][index % 3]);
}
const elapsedMs = performance.now() - start;
const heapAfter = process.memoryUsage().heapUsed;
const report = {
  sceneMaterials: 250,
  switches,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  averageSwitchMs: Number((elapsedMs / switches).toFixed(3)),
  heapDeltaBytes: heapAfter - heapBefore,
  cachedProfiles: Picasso.cacheStats().profiles,
  diffusionPerFrame: false,
  particleCaps: {
    zeknova: Picasso.generateTheme("zeknova").particles.cap,
    anime: Picasso.generateTheme("anime").particles.cap,
    cinematic: Picasso.generateTheme("cinematic").particles.cap,
  },
};
assert.ok(report.averageSwitchMs < 5, `cached switch budget exceeded: ${report.averageSwitchMs}ms`);
assert.ok(report.heapDeltaBytes < 32 * 1024 * 1024, `heap growth exceeded smoke-test budget: ${report.heapDeltaBytes}`);
console.log(JSON.stringify(report, null, 2));
