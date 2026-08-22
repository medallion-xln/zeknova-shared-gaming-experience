import { performance } from "node:perf_hooks";
import { PhysicsBody } from "../src/game/physics/PhysicsBody.js";
import { CollisionWorld } from "../src/game/physics/CollisionWorld.js";

const count = Number(process.argv[2] || 500), bodies = [];
for (let i = 0; i < count; i++) bodies.push(new PhysicsBody({ id: `b-${String(i).padStart(4, "0")}`, position: { x: (i % 25) * 4, y: 0, z: Math.floor(i / 25) * 4 }, shape: { kind: "sphere", radius: .6 } }));

const bruteStart = performance.now(); let bruteChecks = 0;
for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) bruteChecks++;
const bruteMs = performance.now() - bruteStart;
const world = new CollisionWorld({ cellSize: 8 }); bodies.forEach((body) => world.add(body));
const broadStart = performance.now(); world.detect(); const broadMs = performance.now() - broadStart;
const result = { bodies: count, before: { bruteForceChecks: bruteChecks, enumerationMs: +bruteMs.toFixed(3) }, after: { broadphaseCandidates: world.broadphase.candidateCount, collisionPipelineMs: +broadMs.toFixed(3), reduction: +(bruteChecks / Math.max(1, world.broadphase.candidateCount)).toFixed(2) } };
console.log(JSON.stringify(result, null, 2));

