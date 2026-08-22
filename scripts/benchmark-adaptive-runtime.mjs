import { performance } from "node:perf_hooks";
import { AdaptiveSimulationDirector } from "../src/game/AdaptiveSimulationDirector.js";

function seeded(seed) { let value = seed >>> 0; return () => ((value = Math.imul(value, 1664525) + 1013904223 >>> 0) / 4294967296); }
function actor(id, x, type = "resident", critical = false) { return { uuid: id, position: { x, y: 0, z: 0 }, userData: { enemyType: type, hostile: type !== "resident", isMissionBoss: critical, attackCooldown: 30 } }; }
function workload(item, delta) { let value = item.position.x; for (let i = 0; i < 60; i += 1) value = Math.sin(value + i * .013) + Math.cos(value * .31); item.userData.attackCooldown -= delta; return value; }

const random = seeded(8842);
const scenes = [
  { id: "empty-biome", actors: [] },
  { id: "populated-settlement", actors: Array.from({ length: 54 }, (_, i) => actor(`resident-${i}`, (random() - .5) * 90)) },
  { id: "ten-juggernauts", actors: Array.from({ length: 10 }, (_, i) => actor(`jug-${i}`, -82 + i * 18, "juggernaut")) },
  { id: "ten-off-biome-juggernauts", actors: Array.from({ length: 10 }, (_, i) => actor(`off-jug-${i}`, 78 + i * .25, "juggernaut")) },
  { id: "dense-boss-bullet-hell", actors: [actor("boss", 18, "boss", true), ...Array.from({ length: 12 }, (_, i) => actor(`add-${i}`, 20 + i, "spitter"))] },
  { id: "mission-2-highlands", actors: [actor("commission-1", 8, "juggernaut"), actor("commission-2", 10, "spitter"), actor("commission-3", 12, "spitter")] },
];

const results = [];
for (const scene of scenes) {
  const frames = 3600;
  let legacyExecutions = 0;
  let adaptiveExecutions = 0;
  const legacyStart = performance.now();
  for (let frame = 0; frame < frames; frame += 1) for (const item of scene.actors) { workload(item, 1 / 60); legacyExecutions += 1; }
  const legacyMs = performance.now() - legacyStart;

  const game = { player: { group: { position: { x: 0, y: 0, z: 0 } } }, enemies: scene.actors, residentNPCs: [] };
  const director = new AdaptiveSimulationDirector({ game });
  const adaptiveStart = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    director.tierPopulation = { T0: 0, T1: 0, T2: 0, T3: 0, T4: 0 };
    for (const item of scene.actors) {
      const scheduled = director.scheduleActor(item, 1 / 60);
      if (scheduled.execute) { workload(item, Math.min(scheduled.elapsed, .125)); adaptiveExecutions += 1; }
    }
  }
  const adaptiveMs = performance.now() - adaptiveStart;
  results.push({
    scene: scene.id,
    actors: scene.actors.length,
    legacyExecutions,
    adaptiveExecutions,
    updateReductionFactor: +(legacyExecutions / Math.max(1, adaptiveExecutions)).toFixed(2),
    legacyCpuMs: +legacyMs.toFixed(2),
    adaptiveCpuMs: +adaptiveMs.toFixed(2),
    cpuImprovementFactor: +(legacyMs / Math.max(.001, adaptiveMs)).toFixed(2),
  });
}

const records = Array.from({ length: 500 }, (_, index) => ({ type: ["power", "water", "habitat", "research"][index % 4] }));
const scan = () => { const counts = {}; for (const row of records) counts[row.type] = (counts[row.type] || 0) + 1; return counts; };
let result;
let began = performance.now(); for (let i = 0; i < 3600; i += 1) result = scan(); const uncachedMs = performance.now() - began;
began = performance.now(); const cache = scan(); for (let i = 0; i < 3600; i += 1) result = cache; const cachedMs = performance.now() - began;
results.push({ scene: "maximum-infrastructure-count-scan", records: records.length, legacyScans: 3600, adaptiveScans: 1, scanReductionFactor: 3600, legacyCpuMs: +uncachedMs.toFixed(2), adaptiveCpuMs: +cachedMs.toFixed(2), cpuImprovementFactor: +(uncachedMs / Math.max(.001, cachedMs)).toFixed(2), checksum: result.power });

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), framesPerScene: 3600, disclaimer: "Deterministic CPU microbenchmark; browser FPS is measured separately.", results }, null, 2));
