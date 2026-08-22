export class PhysicsDebug {
  constructor(world) { this.world = world; }
  install() {
    if (typeof document === "undefined" || !new URLSearchParams(location.search).has("physicsDebug")) return false;
    this.node = document.body.appendChild(document.createElement("pre")); this.node.id = "zeknova-physics-debug"; this.node.style.cssText = "position:fixed;right:12px;top:12px;z-index:9999;background:#00131ddd;color:#75f1d1;padding:10px;font:11px monospace;pointer-events:none";
    this.timer = setInterval(() => { this.node.textContent = JSON.stringify({ ...this.world.report(), cells: this.world.collision.broadphase.cells.size, contacts: this.world.collision.contacts.map((c) => ({ pair: `${c.a.id}|${c.b.id}`, normal: c.normal, point: c.point })) }, null, 2); }, 250); return true;
  }
  dispose() { clearInterval(this.timer); this.node?.remove(); }
}

