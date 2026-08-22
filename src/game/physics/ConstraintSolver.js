export class ConstraintSolver {
  constructor(iterations = 6) { this.iterations = iterations; this.constraints = []; }
  add(constraint) { this.constraints.push(constraint); this.constraints.sort((a, b) => String(a.id).localeCompare(String(b.id))); return constraint; }
  solve(contacts, dt) {
    const ordered = [...contacts].sort((a, b) => `${a.a.id}|${a.b.id}`.localeCompare(`${b.a.id}|${b.b.id}`));
    for (let iteration = 0; iteration < this.iterations; iteration++) for (const c of ordered) {
      const inv = c.a.inverseMass + c.b.inverseMass; if (!inv) continue;
      const rvx = c.b.velocity.x - c.a.velocity.x, rvy = c.b.velocity.y - c.a.velocity.y, rvz = c.b.velocity.z - c.a.velocity.z;
      const separating = rvx * c.normal.x + rvy * c.normal.y + rvz * c.normal.z;
      const restitution = Math.min(c.a.restitution, c.b.restitution);
      const impulse = Math.max(0, (-(1 + restitution) * separating + Math.max(0, c.penetration - .01) * .18 / Math.max(dt, 1e-4)) / inv);
      const ix = c.normal.x * impulse, iy = c.normal.y * impulse, iz = c.normal.z * impulse;
      if (c.a.inverseMass) { c.a.velocity.x -= ix * c.a.inverseMass; c.a.velocity.y -= iy * c.a.inverseMass; c.a.velocity.z -= iz * c.a.inverseMass; c.a.wake(); }
      if (c.b.inverseMass) { c.b.velocity.x += ix * c.b.inverseMass; c.b.velocity.y += iy * c.b.inverseMass; c.b.velocity.z += iz * c.b.inverseMass; c.b.wake(); }
    }
    return ordered;
  }
}

