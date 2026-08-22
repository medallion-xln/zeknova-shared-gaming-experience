export const ANIMATION_CAPABILITIES = Object.freeze({
  ordinaryEnemies: Object.freeze({ directionalHit: false, genericHit: false, stagger: false, death: true, fallback: "bounded-procedural-yaw" }),
  ancientThornwarden: Object.freeze({ attack: ["idle", "run", "slam"], stagger: "slam", phase: "slam", death: true }),
  sporeCantor: Object.freeze({ attack: ["walk", "run"], stagger: null, phase: null, death: true, fallback: "boss-emissive-pulse" }),
  whiteScreecher: Object.freeze({ attack: ["run", "judgment", "combo", "dive"], stagger: "judgment", phase: "dive", death: true }),
});

export const REACTION_AUTHORITY = Object.freeze({ tier: "R0_ANIMATION_PRESENTATION", canMutateHealth: false, canMutateAI: false, canExtendStagger: false, allocatesMixers: false });
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

const bossProfile = (id = "") => id === "forest_ancient_thornwarden" ? { stagger: "root_ground_wave", phase: "targeted_root_eruptions" }
  : id === "arctic_white_screecher" ? { stagger: "screecher_judgment", phase: "screecher_dive" }
    : id === "forest_spore_cantor" ? { stagger: null, phase: "spore_spiral_bloom" } : { stagger: null, phase: null };

export class CombatReactionDirector {
  constructor({ windowRef = globalThis, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) { this.window = windowRef; this.now = now; this.active = new WeakMap(); this.requests = []; }
  request(result, target, event) {
    if (!result?.damageApplied || !target) return false;
    const model = target?.userData?.bossHqModel || target?.userData?.hqModel;
    if (result.killed && model?.playDeath) { model.playDeath(); return this.record("death", result); }
    if (result.bossStaggered) {
      const pattern = bossProfile(target?.userData?.bossId).stagger;
      if (pattern && model?.playAttack) model.playAttack(pattern);
      this.pulseBoss(target, 120);
      return this.record(pattern ? "boss-stagger-clip" : "boss-stagger-pulse", result);
    }
    if (result.targetType === "boss") { this.pulseBoss(target, 55); return this.record("boss-impact-pulse", result); }
    return this.procedural(target, event?.direction || result.attackDirection, event?.heavy);
  }
  phase(target, phaseId) {
    if (!target || !phaseId) return false;
    const key = `${target?.userData?.bossId}:${phaseId}`;
    if (this.lastPhaseKey === key) return false; this.lastPhaseKey = key;
    const pattern = bossProfile(target?.userData?.bossId).phase;
    if (pattern) target?.userData?.bossHqModel?.playAttack?.(pattern);
    this.pulseBoss(target, 240); this.record("boss-phase", { id: key }); return true;
  }
  procedural(target, direction = "front", heavy = false) {
    const node = target?.group || target?.mesh || target;
    if (!node?.rotation) return false;
    const prior = this.active.get(node); if (prior) this.window?.clearTimeout?.(prior.timer);
    const base = prior?.base ?? finite(node.rotation.y), sign = direction === "left" || direction === "back" ? -1 : 1, offset = sign * (heavy ? .055 : .025);
    node.rotation.y = base + offset;
    const token = {}; token.base = base;
    token.timer = this.window?.setTimeout?.(() => { if (this.active.get(node) !== token) return; if (Math.abs(finite(node.rotation.y) - (base + offset)) < .0001) node.rotation.y = base; this.active.delete(node); }, heavy ? 95 : 58);
    this.active.set(node, token); this.record(`procedural-${direction}`, { id: `reaction-${this.now()}` }); return true;
  }
  pulseBoss(target, duration) {
    const node = target?.userData?.bossHqModel?.root || target;
    if (!node?.scale?.setScalar) return;
    const base = finite(node.scale.x, 1); node.scale.setScalar(base * 1.018);
    this.window?.setTimeout?.(() => { if (Math.abs(finite(node.scale.x) - base * 1.018) < .001) node.scale.setScalar(base); }, duration);
  }
  record(kind, result) { this.requests.push(Object.freeze({ kind, resultId: result?.id })); if (this.requests.length > 64) this.requests.shift(); return true; }
  snapshot() { return Object.freeze({ requests: this.requests.length, last: this.requests.at(-1) || null, allocatesMixers: false, authority: REACTION_AUTHORITY, capabilities: ANIMATION_CAPABILITIES }); }
}

export default CombatReactionDirector;
