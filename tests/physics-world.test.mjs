import assert from "node:assert/strict";
import { PhysicsBody } from "../src/game/physics/PhysicsBody.js";
import { PhysicsWorld } from "../src/game/physics/PhysicsWorld.js";

function run(frameDeltas) {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
  const body = new PhysicsBody({ id: "mover", position: { x: 0, y: 0, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, shape: { kind: "sphere", radius: .5 } });
  world.addBody(body); for (const dt of frameDeltas) world.step(dt); return { x: body.position.x, steps: world.metrics.steps };
}

const sixty = run(Array.from({ length: 60 }, () => 1 / 60));
const thirty = run(Array.from({ length: 30 }, () => 1 / 30));
assert.equal(sixty.steps, 60); assert.equal(thirty.steps, 60); assert.ok(Math.abs(sixty.x - thirty.x) < 1e-10, "render cadence must not change physics outcome");

const world = new PhysicsWorld({ gravity: { x: 0, y: 0, z: 0 } });
const target = new PhysicsBody({ id: "target", type: "static", position: { x: 10, y: 0, z: 0 }, shape: { kind: "sphere", radius: 1 } });
world.addBody(target);
let hit = null;
world.projectiles.spawn({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 1200, y: 0, z: 0 }, radius: .1, onHit: (value) => { hit = value; } });
world.fixedStep(1 / 60);
assert.equal(hit?.body.id, "target", "swept projectile must not tunnel through target");

const near = new PhysicsBody({ id: "near", type: "static", position: { x: 4, y: 0, z: 0 }, shape: { kind: "sphere", radius: .5 } });
world.addBody(near);
assert.equal(world.projectiles.beam({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 })?.body.id, "near", "beam must resolve nearest deterministic hit");
assert.deepEqual(world.projectiles.cone({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 12, .2).map((body) => body.id), ["near", "target"]);

console.log("physics world: fixed-step determinism, sweep, beam, and cone checks passed");

