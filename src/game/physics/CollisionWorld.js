import { SpatialHashBroadphase } from "./Broadphase.js";
import { intersectBodies, sweepSphere } from "./Narrowphase.js";

export class CollisionWorld {
  constructor({ cellSize = 8 } = {}) { this.bodies = new Map(); this.broadphase = new SpatialHashBroadphase(cellSize); this.contacts = []; }
  add(body) { this.bodies.set(body.id, body); return body; }
  remove(bodyOrId) { this.bodies.delete(typeof bodyOrId === "string" ? bodyOrId : bodyOrId.id); }
  rebuild() { this.broadphase.rebuild(this.bodies.values()); }
  detect() { this.rebuild(); this.contacts = this.broadphase.pairs().map(([a, b]) => intersectBodies(a, b)).filter(Boolean); return this.contacts; }
  sweep(start, end, radius = 0, filter = () => true) {
    this.rebuild();
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 };
    const search = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) / 2 + radius + 4;
    return this.broadphase.queryPoint(midpoint, search).filter(filter).map((body) => sweepSphere(start, end, radius, body)).filter(Boolean).sort((a, b) => a.fraction - b.fraction || a.body.id.localeCompare(b.body.id));
  }
  raycast(start, end, filter) { return this.sweep(start, end, 0, filter)[0] ?? null; }
  querySphere(center, radius, filter = () => true) { this.rebuild(); return this.broadphase.queryPoint(center, radius).filter(filter).filter((body) => Math.hypot(body.position.x - center.x, body.position.y - center.y, body.position.z - center.z) <= radius); }
}

