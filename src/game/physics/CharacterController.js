export class CharacterController {
  constructor({ body, collisionWorld, terrain, slopeLimit = .75, stepHeight = .55, groundSnap = .35 } = {}) { Object.assign(this, { body, collisionWorld, terrain, slopeLimit, stepHeight, groundSnap }); this.grounded = false; }
  move(intent, dt) {
    const start = { ...this.body.position }, speed = Number(intent.speed ?? 0);
    const length = Math.hypot(intent.x || 0, intent.z || 0) || 1;
    const end = { x: start.x + (intent.x || 0) / length * speed * dt, y: start.y, z: start.z + (intent.z || 0) / length * speed * dt };
    const hit = this.collisionWorld.sweep(start, end, Number(this.body.shape.radius ?? .45), (other) => other !== this.body && other.userData?.visualOnly !== true)[0];
    if (hit) { const dot = (end.x - start.x) * hit.normal.x + (end.z - start.z) * hit.normal.z; end.x -= hit.normal.x * dot; end.z -= hit.normal.z * dot; }
    if (this.terrain?.walkHeightAt) { const ground = this.terrain.walkHeightAt(end.x, end.z, false); const delta = ground - end.y; if (delta <= this.stepHeight && delta >= -this.groundSnap) { end.y = ground; this.grounded = true; this.body.velocity.y = Math.max(0, this.body.velocity.y); } else this.grounded = false; }
    this.body.previous = { ...start }; Object.assign(this.body.position, end); return { position: end, grounded: this.grounded, hit };
  }
}

