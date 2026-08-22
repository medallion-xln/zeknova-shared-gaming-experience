let nextBodyId = 1;

export class PhysicsBody {
  constructor(options = {}) {
    this.id = String(options.id ?? `body-${nextBodyId++}`);
    this.type = options.type ?? "dynamic";
    this.shape = Object.freeze({ kind: "sphere", radius: .5, ...(options.shape || {}) });
    this.position = { x: 0, y: 0, z: 0, ...(options.position || {}) };
    this.previous = { ...this.position };
    this.velocity = { x: 0, y: 0, z: 0, ...(options.velocity || {}) };
    this.angularVelocity = { x: 0, y: 0, z: 0, ...(options.angularVelocity || {}) };
    this.mass = this.type === "static" ? Infinity : Math.max(.001, Number(options.mass ?? 1));
    this.inverseMass = Number.isFinite(this.mass) ? 1 / this.mass : 0;
    this.friction = Math.max(0, Number(options.friction ?? .6));
    this.restitution = Math.max(0, Math.min(1, Number(options.restitution ?? .05)));
    this.gravityScale = Number(options.gravityScale ?? 1);
    this.force = { x: 0, y: 0, z: 0 };
    this.sleeping = false;
    this.sleepTime = 0;
    this.tier = options.tier ?? "T1";
    this.userData = options.userData || {};
  }
  applyForce(force) { if (this.inverseMass) { this.force.x += force.x || 0; this.force.y += force.y || 0; this.force.z += force.z || 0; this.wake(); } }
  applyImpulse(impulse) { if (this.inverseMass) { this.velocity.x += (impulse.x || 0) * this.inverseMass; this.velocity.y += (impulse.y || 0) * this.inverseMass; this.velocity.z += (impulse.z || 0) * this.inverseMass; this.wake(); } }
  wake() { this.sleeping = false; this.sleepTime = 0; }
  integrate(dt, gravity) {
    if (!this.inverseMass || this.sleeping || this.type === "kinematic") return;
    this.previous = { ...this.position };
    this.velocity.x += (gravity.x * this.gravityScale + this.force.x * this.inverseMass) * dt;
    this.velocity.y += (gravity.y * this.gravityScale + this.force.y * this.inverseMass) * dt;
    this.velocity.z += (gravity.z * this.gravityScale + this.force.z * this.inverseMass) * dt;
    this.position.x += this.velocity.x * dt; this.position.y += this.velocity.y * dt; this.position.z += this.velocity.z * dt;
    this.force.x = this.force.y = this.force.z = 0;
    const speed2 = this.velocity.x ** 2 + this.velocity.y ** 2 + this.velocity.z ** 2;
    this.sleepTime = speed2 < 1e-4 ? this.sleepTime + dt : 0;
    if (this.sleepTime > .75) this.sleeping = true;
  }
  interpolated(alpha) { return { x: this.previous.x + (this.position.x - this.previous.x) * alpha, y: this.previous.y + (this.position.y - this.previous.y) * alpha, z: this.previous.z + (this.position.z - this.previous.z) * alpha }; }
}

