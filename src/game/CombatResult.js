/** Read-only observation of outcomes already decided by production combat rules. */
export const COMBAT_RESULT_AUTHORITY = Object.freeze({
  owner: "existing-production-combat-rules",
  publisher: "CombatResultPublisher",
  readOnly: true,
  canMutateCombat: false,
});

export const COMBAT_RESULT_SUPPORT = Object.freeze({
  connected: true,
  damageApplied: true,
  killed: true,
  attackDirection: true,
  bossStaggered: true,
  bossDefenseMitigation: true,
  miss: false,
  critical: false,
  weakPoint: false,
  armor: false,
  armorBreak: false,
  enemyGameplayStagger: false,
  blocked: false,
  immune: false,
});

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const position = (entity) => entity?.group?.position || entity?.mesh?.position || entity?.position || null;
const copyPoint = (point) => point ? Object.freeze({ x: number(point.x), y: number(point.y), z: number(point.z) }) : null;
const identity = (entity, fallback) => String(entity?.entityId || entity?.persistentId || entity?.userData?.entityId || entity?.userData?.bossId || entity?.bossId || fallback);

export function attackDirection(source, target) {
  const from = position(source), to = position(target);
  if (!from || !to) return null;
  const dx = number(from.x) - number(to.x), dz = number(from.z) - number(to.z);
  const yaw = number(target?.group?.rotation?.y ?? target?.mesh?.rotation?.y ?? target?.rotation?.y);
  const x = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const z = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  if (Math.abs(z) >= Math.abs(x)) return z >= 0 ? "front" : "back";
  return x >= 0 ? "right" : "left";
}

export function createCombatResult({ id, source, target, weaponId, requestedDamage, beforeHealth, afterHealth, boss = false, playerTarget = false, bossStunnedAtBefore = 0, bossStunnedAtAfter = 0, defenseMitigated = false, attribution = null } = {}) {
  const before = number(beforeHealth), after = number(afterHealth, before);
  const damageAmount = Math.max(0, before - after);
  return Object.freeze({
    id: String(id),
    connected: true,
    damageApplied: damageAmount > 0,
    damageAmount,
    requestedDamage: Math.max(0, number(requestedDamage, damageAmount)),
    targetType: playerTarget ? "player" : boss ? "boss" : "enemy",
    critical: false,
    weakPoint: false,
    armorHit: false,
    armorBroken: false,
    staggered: false,
    bossStaggered: boss && number(bossStunnedAtAfter) > number(bossStunnedAtBefore),
    blocked: false,
    immune: false,
    defenseMitigated: Boolean(defenseMitigated),
    killed: before > 0 && after <= 0,
    impactPoint: copyPoint(position(target)),
    impactNormal: null,
    attackDirection: attackDirection(source, target),
    sourceId: identity(source, playerTarget ? attribution?.bossId || "enemy-source-unavailable" : "local-player"),
    targetId: identity(target, playerTarget ? "local-player" : boss ? "active-boss" : "enemy"),
    weaponId: String(weaponId || attribution?.patternId || "contact"),
    attribution: attribution ? Object.freeze({ ...attribution }) : null,
    supported: COMBAT_RESULT_SUPPORT,
    authority: COMBAT_RESULT_AUTHORITY,
  });
}

export class CombatResultPublisher {
  constructor({ game } = {}) { this.game = game; this.sequence = 0; this.listeners = new Set(); this.restores = []; this.results = []; }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(fields) {
    const result = createCombatResult({ ...fields, id: `combat-result-${++this.sequence}` });
    this.results.push(result); if (this.results.length > 64) this.results.shift();
    for (const listener of [...this.listeners]) listener(result, fields.target);
    return result;
  }
  install() {
    if (this.installed || !this.game) return this; this.installed = true;
    this.wrap(this.game, "damageWeaponTarget", (original, [target, damage, color, weaponId]) => {
      const beforeHealth = number(target?.health ?? target?.userData?.health);
      const boss = Boolean(target?.isBoss || target?.bossId || target?.userData?.isBoss || target?.userData?.isMissionBoss);
      const manager = this.game.bossManager;
      const bossStunnedAtBefore = number(target?.userData?.bossStunnedAt);
      const result = original(target, damage, color, weaponId);
      const afterHealth = number(target?.health ?? target?.userData?.health, beforeHealth);
      if (result === true && afterHealth < beforeHealth) this.publish({ source: this.game.player, target, weaponId, requestedDamage: damage, beforeHealth, afterHealth, boss, bossStunnedAtBefore, bossStunnedAtAfter: target?.userData?.bossStunnedAt, defenseMitigated: boss && afterHealth > beforeHealth - Math.max(0, number(damage)) && Boolean(manager?.defense) });
      return result;
    });
    this.wrapPlayer(this.game?.bossManager, "damagePlayer", "boss-pattern", () => this.game?.bossManager?.boss);
    this.wrapPlayer(this.game, "updateEnemyProjectiles", "enemy-projectile", () => this.nearestProjectile());
    this.wrapPlayer(this.game, "updateEnemyUnit", "enemy-melee", (args) => args[0]);
    return this;
  }
  wrap(owner, key, around) {
    const original = owner?.[key]; if (typeof original !== "function") return;
    const bound = original.bind(owner); owner[key] = (...args) => around(bound, args);
    this.restores.push(() => { owner[key] = original; });
  }
  wrapPlayer(owner, key, weaponId, sourceFor) {
    this.wrap(owner, key, (original, args) => {
      const player = this.game?.player, beforeHealth = number(player?.health), source = sourceFor?.(args);
      const output = original(...args), afterHealth = number(player?.health, beforeHealth);
      const attribution = key === "damagePlayer" ? owner?.lastDamageAttribution : null;
      if (afterHealth < beforeHealth) this.publish({ source, target: player, weaponId, requestedDamage: beforeHealth - afterHealth, beforeHealth, afterHealth, playerTarget: true, attribution });
      return output;
    });
  }
  nearestProjectile() {
    const player = position(this.game?.player); if (!player) return null;
    let best = null, distance = Infinity;
    for (const projectile of this.game?.enemyProjectiles || []) { const point = position(projectile); if (!point) continue; const d = (number(point.x)-number(player.x))**2 + (number(point.z)-number(player.z))**2; if (d < distance) { distance = d; best = projectile; } }
    return best;
  }
  snapshot() { return Object.freeze({ resultCount: this.results.length, sequence: this.sequence, support: COMBAT_RESULT_SUPPORT, authority: COMBAT_RESULT_AUTHORITY }); }
  dispose() { for (const restore of this.restores.splice(0).reverse()) restore(); this.listeners.clear(); this.installed = false; }
}

export default CombatResultPublisher;
