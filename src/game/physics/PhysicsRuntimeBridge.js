import { PhysicsBody } from "./PhysicsBody.js";
import { PhysicsDebug } from "./PhysicsDebug.js";
import { PhysicsWorld } from "./PhysicsWorld.js";

export class PhysicsRuntimeBridge {
  constructor({ game } = {}) { this.game = game; this.world = new PhysicsWorld(); this.actorBodies = new Map(); this.lastTime = 0; }
  install() { if (!this.game || this.installed) return false; this.installed = true; this.debug = new PhysicsDebug(this.world); this.debug.install(); this.mountDiagnostics(); this.installSweptProjectileCompatibility(); this.frame = requestAnimationFrame((time) => this.tick(time)); globalThis.ZekNovaPhysics = Object.freeze({ world: this.world, report: () => this.report(), sweep: (...args) => this.world.collision.sweep(...args), beam: (...args) => this.world.projectiles.beam(...args), cone: (...args) => this.world.projectiles.cone(...args), disc: (...args) => this.world.projectiles.disc(...args), applyKnockback: (actor, impulse) => this.applyKnockback(actor, impulse) }); return this; }
  syncActor(actor, id, shape, tier = "T1") { const object = actor?.group || actor; if (!object?.position || object.userData?.zkVisualOnly) return null; let body = this.actorBodies.get(object); if (!body) { body = new PhysicsBody({ id, type: "kinematic", shape, position: object.position, tier, userData: { actor: object } }); this.actorBodies.set(object, body); this.world.addBody(body); } body.tier = object.userData?.zkSimulationTier || tier; Object.assign(body.previous, body.position); Object.assign(body.position, object.position); return body; }
  sync() { const live = new Set(); const playerObject = this.game.player?.group; if (playerObject) { live.add(playerObject); this.syncActor(playerObject, "player", { kind: "capsule", radius: .55, halfHeight: 1.1 }, "T0"); } for (const [index, actor] of (this.game.enemies || []).entries()) { live.add(actor); this.syncActor(actor, String(actor.userData?.bossId || actor.userData?.worldJuggernautId || actor.uuid || `enemy-${index}`), { kind: "capsule", radius: Number(actor.userData?.collisionRadius ?? .7), halfHeight: actor.userData?.isMissionBoss ? 2.4 : 1.1 }, actor.userData?.isMissionBoss ? "T0" : "T1"); } for (const [actor, body] of this.actorBodies) if (!live.has(actor)) { this.world.removeBody(body); this.actorBodies.delete(actor); } }
  tick(time) { if (!this.installed || this.game.disposed) return; this.sync(); if (this.lastTime) this.world.step((time - this.lastTime) / 1000); this.lastTime = time; this.frame = requestAnimationFrame((next) => this.tick(next)); }
  installSweptProjectileCompatibility() {
    const game = this.game;
    if (typeof game.updateEnemyProjectiles === "function") {
      const original = game.updateEnemyProjectiles.bind(game);
      game.updateEnemyProjectiles = (delta) => {
        this.sync(); const starts = new Map((game.enemyProjectiles || []).map((projectile) => [projectile, { ...projectile.mesh.position }])); const result = original(delta);
        for (let index = (game.enemyProjectiles || []).length - 1; index >= 0; index--) { const projectile = game.enemyProjectiles[index], start = starts.get(projectile); if (!start) continue; const hit = this.world.collision.sweep(start, projectile.mesh.position, .35, (body) => body.id === "player")[0]; if (!hit) continue; game.player.health = Math.max(0, Number(game.player.health) - Number(projectile.damage || 0)); game.spawnImpactPulse?.(projectile.mesh.position.clone(), 0xff7a40); game.removeEnemyProjectile?.(index); }
        return result;
      };
    }
    if (typeof game.updateProjectiles === "function") {
      const original = game.updateProjectiles.bind(game);
      game.updateProjectiles = (delta) => {
        this.sync(); const starts = new Map((game.projectiles || []).map((projectile) => [projectile, { ...projectile.mesh.position }])); const result = original(delta);
        for (let index = (game.projectiles || []).length - 1; index >= 0; index--) { const projectile = game.projectiles[index], start = starts.get(projectile); if (!start) continue; const hit = this.world.collision.sweep(start, projectile.mesh.position, projectile.kind === "missile" ? .45 : .25, (body) => body.id !== "player" && Number(body.userData?.actor?.userData?.health) > 0)[0]; if (!hit) continue; game.damageWeaponTarget?.(hit.body.userData.actor, Number(projectile.damage || 0), projectile.color, projectile.kind); game.removeProjectile?.(index); }
        return result;
      };
    }
    const pool = game.bossManager?.pool;
    if (pool && typeof pool.update === "function") {
      const original = pool.update.bind(pool);
      pool.update = (delta, manager) => {
        this.sync(); const starts = new Map(pool.active.map((projectile) => [projectile, { ...projectile.mesh.position }])); const result = original(delta, manager);
        for (const projectile of [...pool.active]) { const start = starts.get(projectile); if (!start) continue; const hit = this.world.collision.sweep(start, projectile.mesh.position, Number(projectile.radius ?? .5), (body) => body.id === "player")[0]; if (!hit) continue; manager.damagePlayer?.(projectile.damage, projectile.patternId, projectile.id); pool.release(projectile); }
        return result;
      };
    }
  }
  applyKnockback(actor, impulse) { const object = actor?.group || actor, body = this.actorBodies.get(object); if (!body) return false; Object.assign(body.position, object.position); Object.assign(body.previous, object.position); const previousType = body.type; body.type = "dynamic"; body.applyImpulse(impulse); body.integrate(this.world.fixedDt, { x: 0, y: 0, z: 0 }); body.type = previousType; object.position?.set?.(body.position.x, body.position.y, body.position.z); return true; }
  mountDiagnostics() { if (typeof document === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return; const node = document.getElementById("zeknova-physics-runtime-qa") || document.body.appendChild(document.createElement("span")); node.id = "zeknova-physics-runtime-qa"; node.setAttribute("aria-hidden", "true"); node.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1"; this.qaTimer = setInterval(() => { node.textContent = JSON.stringify(this.report()); }, 500); }
  report() { return Object.freeze({ ...this.world.report(), integration: "compatibility-safe authoritative actor bridge", picassoCollisionExcluded: true, primeMayAdviseTierOnly: true, gameplayAuthority: "canonical game runtime" }); }
  dispose() { this.installed = false; cancelAnimationFrame(this.frame); clearInterval(this.qaTimer); this.debug?.dispose(); }
}
