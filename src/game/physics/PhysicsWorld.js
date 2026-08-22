import { CollisionWorld } from "./CollisionWorld.js";
import { ConstraintSolver } from "./ConstraintSolver.js";
import { ProjectilePhysics } from "./ProjectilePhysics.js";

export class PhysicsWorld {
  constructor({ fixedDt = 1 / 60, maxSubsteps = 5, gravity = { x: 0, y: -18, z: 0 } } = {}) { this.fixedDt = fixedDt; this.maxSubsteps = maxSubsteps; this.gravity = gravity; this.accumulator = 0; this.stepNumber = 0; this.collision = new CollisionWorld(); this.solver = new ConstraintSolver(); this.projectiles = new ProjectilePhysics(this.collision); this.metrics = { steps: 0, clampedFrames: 0, physicsMs: 0, contacts: 0, candidates: 0 }; }
  addBody(body) { return this.collision.add(body); }
  removeBody(body) { this.collision.remove(body); }
  step(frameDt) {
    this.accumulator += Math.min(.1, Math.max(0, Number(frameDt) || 0)); let substeps = 0;
    while (this.accumulator >= this.fixedDt && substeps < this.maxSubsteps) { this.fixedStep(this.fixedDt); this.accumulator -= this.fixedDt; substeps++; }
    if (this.accumulator >= this.fixedDt) { this.accumulator %= this.fixedDt; this.metrics.clampedFrames++; }
    return { substeps, alpha: this.accumulator / this.fixedDt };
  }
  fixedStep(dt) {
    const began = performance.now(); this.stepNumber++;
    for (const body of [...this.collision.bodies.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const divisor = body.tier === "T2" ? 4 : body.tier === "T3" ? 30 : body.tier === "T4" ? Infinity : 1;
      if (this.stepNumber % divisor === 0) body.integrate(dt * divisor, this.gravity);
    }
    const contacts = this.collision.detect(); this.solver.solve(contacts, dt); this.projectiles.step(dt);
    this.metrics.steps++; this.metrics.contacts += contacts.length; this.metrics.candidates += this.collision.broadphase.candidateCount; this.metrics.physicsMs += performance.now() - began;
  }
  report() { const steps = Math.max(1, this.metrics.steps); return Object.freeze({ fixedHz: Math.round(1 / this.fixedDt), deterministicOrdering: true, bodies: this.collision.bodies.size, sleeping: [...this.collision.bodies.values()].filter((body) => body.sleeping).length, activeProjectiles: this.projectiles.active.length, averageContacts: this.metrics.contacts / steps, averageCandidates: this.metrics.candidates / steps, averagePhysicsMs: this.metrics.physicsMs / steps, clampedFrames: this.metrics.clampedFrames, constraints: this.solver.constraints.length }); }
}

