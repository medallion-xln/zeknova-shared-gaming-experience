/** Presentation-only combat feedback. Authoritative combat methods remain the sole damage owners. */
export const COMBAT_FEEDBACK_AUTHORITY = Object.freeze({
  tier: "R0_PRESENTATION",
  canChangeDamage: false,
  canChangeHealth: false,
  canPauseSimulation: false,
  canChangeProgression: false,
  canDispatchNetworkState: false,
});

const HEAVY_WEAPONS = /rocket|thunderclaw|minigun|singularity|beam/i;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const positionOf = (entity) => entity?.group?.position || entity?.mesh?.position || entity?.position || null;

export function classifyImpactDirection(source, target) {
  const a = positionOf(source);
  const b = positionOf(target);
  if (!a || !b) return "front";
  const dx = finite(a.x) - finite(b.x);
  const dz = finite(a.z) - finite(b.z);
  const yaw = finite(target?.group?.rotation?.y ?? target?.mesh?.rotation?.y ?? target?.rotation?.y);
  const localX = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  const localZ = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  if (Math.abs(localZ) >= Math.abs(localX)) return localZ >= 0 ? "front" : "back";
  return localX >= 0 ? "right" : "left";
}

export function impactDescriptor({ source, target, damage, weaponId, before, after, now = 0, playerDamage = false }) {
  const boss = Boolean(target?.isBoss || target?.bossId || target?.userData?.isBoss);
  const killed = finite(after, 1) <= 0 && finite(before, 0) > 0;
  const heavy = HEAVY_WEAPONS.test(String(weaponId || "")) || finite(damage) >= 24;
  const hitStopMs = killed ? 42 : boss ? 8 : heavy ? 22 : 0;
  return Object.freeze({
    id: `${playerDamage ? "player" : "enemy"}:${Math.round(now)}:${String(weaponId || "contact")}`,
    kind: killed ? "kill" : boss ? "boss" : heavy ? "heavy" : "normal",
    source: playerDamage ? "enemy" : "player",
    target: playerDamage ? "player" : boss ? "boss" : "enemy",
    weaponId: String(weaponId || "contact"),
    damage: Math.max(0, finite(damage)),
    direction: classifyImpactDirection(source, target),
    boss, killed, heavy, hitStopMs, confirmed: true,
    authority: COMBAT_FEEDBACK_AUTHORITY,
  });
}

export class CombatFeedbackDirector {
  constructor({ game, resultSource = null, reactionDirector = null, audioDirector = null, documentRef = globalThis.document, windowRef = globalThis, now = () => globalThis.performance?.now?.() ?? Date.now(), requestFrame, cancelFrame } = {}) {
    this.game = game;
    this.document = documentRef;
    this.window = windowRef;
    this.resultSource = resultSource;
    this.reactionDirector = reactionDirector;
    this.audioDirector = audioDirector;
    this.now = now;
    this.requestFrame = requestFrame || windowRef?.requestAnimationFrame?.bind(windowRef) || (() => 0);
    this.cancelFrame = cancelFrame || windowRef?.cancelAnimationFrame?.bind(windowRef) || (() => {});
    this.events = [];
    this.impulses = [];
    this.restores = [];
    this.installed = false;
    this.sparkCursor = 0;
    this.lastBossPhase = null;
    this.presentedResultIds = new Set();
    this.activeAudioNodes = new Set();
  }

  install() {
    if (this.installed || !this.game) return this;
    this.installed = true;
    this.mount();
    if (this.resultSource?.subscribe) {
      this.unsubscribe = this.resultSource.subscribe((result, target) => this.consume(result, target));
    } else this.wrap("damageWeaponTarget", (original, target, damage, color, weaponId) => {
      const before = finite(target?.health);
      const result = original(target, damage, color, weaponId);
      const after = finite(target?.health, before);
      if (result === true && after < before) {
        const event = impactDescriptor({ source: this.game.player, target, damage: before - after, weaponId, before, after, now: this.now() });
        this.emit(event);
        this.reactTarget(target, event);
      }
      return result;
    });
    if (!this.resultSource?.subscribe) {
      this.wrapPlayerDamage(this.game?.bossManager, "damagePlayer", "boss-pattern", () => this.game?.bossManager?.boss || this.game?.bossManager?.activeBoss);
      this.wrapPlayerDamage(this.game, "updateEnemyProjectiles", "enemy-projectile", () => this.nearestSource(this.game?.enemyProjectiles));
      this.wrapPlayerDamage(this.game, "updateEnemyUnit", "enemy-melee", (args) => args[0]);
    }
    this.frame = this.requestFrame((time) => this.tick(time));
    return this;
  }

  consume(result, target) {
    if (!result?.connected || !result.damageApplied || this.presentedResultIds.has(result.id)) return false;
    this.presentedResultIds.add(result.id);
    if (this.presentedResultIds.size > 128) this.presentedResultIds.delete(this.presentedResultIds.values().next().value);
    const heavy = HEAVY_WEAPONS.test(result.weaponId);
    const kind = result.killed ? "kill" : result.bossStaggered ? "boss-stagger" : result.defenseMitigated ? "defense" : result.targetType === "boss" ? "boss" : heavy ? "heavy" : "normal";
    const event = Object.freeze({ id: result.id, kind, source: result.targetType === "player" ? "enemy" : "player", target: result.targetType, weaponId: result.weaponId, damage: result.damageAmount, direction: result.attackDirection || "front", boss: result.targetType === "boss", killed: result.killed, heavy, bossStaggered: result.bossStaggered, defenseMitigated: result.defenseMitigated, hitStopMs: result.killed ? 42 : result.bossStaggered ? 36 : heavy ? 22 : result.targetType === "boss" ? 8 : 0, confirmed: true, combatResult: result, authority: COMBAT_FEEDBACK_AUTHORITY });
    this.emit(event);
    if (!this.reactionDirector?.request(result, target, event)) this.reactTarget(target, event);
    return true;
  }

  wrap(ownerKey, around) {
    const owner = this.game;
    const original = owner?.[ownerKey];
    if (typeof original !== "function") return;
    const bound = original.bind(owner);
    owner[ownerKey] = (...args) => around(bound, ...args);
    this.restores.push(() => { owner[ownerKey] = original; });
  }

  wrapPlayerDamage(owner, key, weaponId, sourceFor) {
    const original = owner?.[key];
    if (typeof original !== "function") return;
    const bound = original.bind(owner);
    owner[key] = (...args) => {
      const player = this.game?.player;
      const before = finite(player?.health);
      const source = sourceFor?.(args);
      const result = bound(...args);
      const after = finite(player?.health, before);
      if (after < before) this.emit(impactDescriptor({ source, target: player, damage: before - after, weaponId, before, after, now: this.now(), playerDamage: true }));
      return result;
    };
    this.restores.push(() => { owner[key] = original; });
  }

  nearestSource(candidates) {
    const playerPosition = positionOf(this.game?.player);
    if (!playerPosition || !Array.isArray(candidates)) return null;
    let closest = null, best = Infinity;
    for (const candidate of candidates) {
      const point = positionOf(candidate);
      if (!point) continue;
      const distance = (finite(point.x) - finite(playerPosition.x)) ** 2 + (finite(point.z) - finite(playerPosition.z)) ** 2;
      if (distance < best) { best = distance; closest = candidate; }
    }
    return closest;
  }

  mount() {
    if (!this.document?.createElement || !this.document.body) return;
    const layer = this.document.createElement("div");
    layer.id = "combat-feedback-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = '<i class="combat-hit-marker"></i><i class="combat-damage-direction"></i><i class="combat-low-health"></i><div class="combat-sparks"></div>';
    this.document.body.append(layer);
    this.layer = layer;
    this.marker = layer.querySelector?.(".combat-hit-marker");
    this.direction = layer.querySelector?.(".combat-damage-direction");
    this.sparkHost = layer.querySelector?.(".combat-sparks");
    this.sparks = Array.from({ length: 16 }, () => {
      const spark = this.document.createElement("i");
      spark.className = "combat-spark";
      this.sparkHost?.append(spark);
      return spark;
    });
  }

  emit(event) {
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
    const reduced = Boolean(this.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const power = (event.killed ? 1 : event.boss || event.heavy ? .72 : .42) * (reduced ? .25 : 1);
    this.impulses.push({ started: this.now(), power, playerDamage: event.target === "player" });
    if (this.impulses.length > 12) this.impulses.shift();
    if (this.layer) this.layer.dataset.impact = event.kind;
    // Hit-stop is deliberately presentation-domain only: the marker/impulse holds
    // briefly while simulation, networking, persistence, and timers keep running.
    this.presentationHoldUntil = Math.max(this.presentationHoldUntil || 0, this.now() + event.hitStopMs);
    this.flash(this.marker, event.kind, (event.killed ? 180 : 105) + event.hitStopMs);
    if (event.target === "player") {
      if (this.direction?.style) this.direction.style.setProperty("--impact-angle", ({ front: 0, right: 90, back: 180, left: 270 })[event.direction] + "deg");
      this.flash(this.direction, "active", 260);
    }
    this.spawnSparks(event);
    this.haptic(power);
    if (!this.audioDirector?.play(event)) this.sound(event, power);
    try { this.window?.dispatchEvent?.(new CustomEvent("zeknova:combat-impact", { detail: event })); } catch {}
    return event;
  }

  reactTarget(target, event) {
    const node = target?.group || target?.mesh;
    if (!node?.rotation || event.boss) return; // bosses retain certified animation authority
    const original = finite(node.rotation.y);
    const sign = event.direction === "left" ? -1 : 1;
    const offset = sign * (event.heavy || event.killed ? .055 : .025);
    node.rotation.y = original + offset;
    this.window?.setTimeout?.(() => {
      if (Math.abs(finite(node.rotation.y) - (original + offset)) < .0001) node.rotation.y = original;
    }, event.heavy ? 95 : 58);
  }

  flash(node, className, duration) {
    if (!node?.classList) return;
    node.className = node.className.split(" ")[0];
    void node.offsetWidth;
    node.classList.add(className, "active");
    this.window?.setTimeout?.(() => node.classList.remove(className, "active"), duration);
  }

  spawnSparks(event) {
    const count = event.killed ? 8 : event.heavy || event.boss ? 6 : 3;
    for (let i = 0; i < count; i += 1) {
      const spark = this.sparks?.[this.sparkCursor++ % this.sparks.length];
      if (!spark?.style) continue;
      spark.style.setProperty("--spark-angle", `${(i / count) * 360 + (this.sparkCursor * 47) % 31}deg`);
      spark.classList.remove("active"); void spark.offsetWidth; spark.classList.add("active");
    }
  }

  tick(time = this.now()) {
    if (!this.installed) return;
    this.impulses = this.impulses.filter((item) => time - item.started < 150);
    let x = 0, y = 0, rotation = 0;
    for (const impulse of this.impulses) {
      const effectiveTime = time < (this.presentationHoldUntil || 0) ? impulse.started : time;
      const remaining = 1 - (effectiveTime - impulse.started) / 150;
      const wave = Math.sin((time - impulse.started) * .19);
      x += wave * impulse.power * 5 * remaining;
      y += Math.cos((time - impulse.started) * .23) * impulse.power * 3 * remaining;
      rotation += wave * impulse.power * .18 * remaining;
    }
    const canvas = this.game?.renderer?.domElement;
    if (canvas?.style) canvas.style.transform = this.impulses.length ? `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rotation.toFixed(2)}deg)` : "";
    const health = finite(this.game?.player?.health, 100);
    const maxHealth = Math.max(1, finite(this.game?.player?.maxHealth, 100));
    this.layer?.classList?.toggle("low-health", health / maxHealth <= .28);
    const phase = this.game?.bossManager?.phase?.id ?? this.game?.bossManager?.currentPhase;
    if (phase != null && this.lastBossPhase != null && phase !== this.lastBossPhase) {
      this.flash(this.marker, "phase", 420);
      const phaseId = `boss-phase:${phase}`;
      this.reactionDirector?.phase(this.game?.bossManager?.boss, phase);
      this.audioDirector?.phase(phaseId);
      this.impulses.push({ started: this.now(), power: .9, playerDamage: false });
      if (this.impulses.length > 12) this.impulses.shift();
    }
    this.lastBossPhase = phase ?? this.lastBossPhase;
    this.frame = this.requestFrame((next) => this.tick(next));
  }

  sound(event, power) {
    const AudioContext = this.window?.AudioContext || this.window?.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.audio ||= new AudioContext();
      if (this.audio.state !== "running") return;
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = event.target === "player" ? "sawtooth" : event.killed ? "triangle" : "square";
      oscillator.frequency.setValueAtTime(event.target === "player" ? 92 : event.killed ? 170 : 310, this.audio.currentTime);
      gain.gain.setValueAtTime(Math.min(.045, .018 * power), this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, this.audio.currentTime + .055);
      oscillator.connect(gain).connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + .06);
      this.activeAudioNodes.add(oscillator);
      oscillator.onended = () => { this.activeAudioNodes.delete(oscillator); oscillator.disconnect?.(); gain.disconnect?.(); };
    } catch {}
  }

  haptic(power) {
    try { this.window?.navigator?.getGamepads?.()?.[0]?.vibrationActuator?.playEffect?.("dual-rumble", { duration: 35, weakMagnitude: power * .35, strongMagnitude: power * .55 }); } catch {}
  }

  snapshot() { return Object.freeze({ installed: this.installed, eventCount: this.events.length, impulseCount: this.impulses.length, sparkPoolSize: this.sparks?.length || 0, activeAudioNodes: this.activeAudioNodes.size, authority: COMBAT_FEEDBACK_AUTHORITY }); }
  dispose() {
    this.installed = false;
    this.cancelFrame(this.frame);
    this.unsubscribe?.();
    for (const restore of this.restores.splice(0).reverse()) restore();
    if (this.game?.renderer?.domElement?.style) this.game.renderer.domElement.style.transform = "";
    this.layer?.remove?.();
    this.audio?.close?.();
    this.audioDirector?.dispose?.();
  }
}

export default CombatFeedbackDirector;
