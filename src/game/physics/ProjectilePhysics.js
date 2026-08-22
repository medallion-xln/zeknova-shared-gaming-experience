export class ProjectilePhysics {
  constructor(collisionWorld) { this.world = collisionWorld; this.pool = []; this.active = []; this.nextId = 1; this.sweepCount = 0; }
  spawn(options) { const projectile = this.pool.pop() || {}; Object.assign(projectile, { id: `projectile-${this.nextId++}`, position: { ...options.position }, previous: { ...options.position }, velocity: { ...options.velocity }, radius: Number(options.radius ?? .1), life: Number(options.life ?? 5), filter: options.filter || (() => true), onHit: options.onHit, active: true }); this.active.push(projectile); return projectile; }
  step(dt) {
    for (const projectile of [...this.active].sort((a, b) => a.id.localeCompare(b.id))) {
      projectile.previous = { ...projectile.position };
      const end = { x: projectile.position.x + projectile.velocity.x * dt, y: projectile.position.y + projectile.velocity.y * dt, z: projectile.position.z + projectile.velocity.z * dt };
      const hit = this.world.sweep(projectile.position, end, projectile.radius, projectile.filter)[0]; this.sweepCount++;
      if (hit) { Object.assign(projectile.position, hit.point); projectile.onHit?.(hit); this.release(projectile); }
      else { Object.assign(projectile.position, end); projectile.life -= dt; if (projectile.life <= 0) this.release(projectile); }
    }
  }
  beam(start, end, filter) { return this.world.raycast(start, end, filter); }
  cone(origin, direction, distance, halfAngle, filter) { const cos = Math.cos(halfAngle); return this.world.querySphere(origin, distance, filter).filter((body) => { const dx = body.position.x - origin.x, dy = body.position.y - origin.y, dz = body.position.z - origin.z, length = Math.hypot(dx, dy, dz) || 1; return (dx * direction.x + dy * direction.y + dz * direction.z) / length >= cos; }); }
  disc(center, radius, halfHeight, filter) { return this.world.querySphere(center, radius, filter).filter((body) => Math.abs(body.position.y - center.y) <= halfHeight); }
  release(projectile) { if (!projectile.active) return; projectile.active = false; const index = this.active.indexOf(projectile); if (index >= 0) this.active.splice(index, 1); this.pool.push(projectile); }
}

