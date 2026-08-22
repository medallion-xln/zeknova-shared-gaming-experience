/**
 * Read-only relevance advice for AdaptiveSimulationDirector.
 *
 * Prime never receives actor references and cannot dispatch or mutate anything.
 * The director remains the sole scheduler and treats this signal as optional.
 */

export const SENTINEL_PRIME_ADAPTIVE_AUTHORITY = Object.freeze({
  tier: "R0_RECOMMENDATION_ONLY",
  canDispatch: false,
  canMutateLiveWorld: false,
  canControlActors: false,
  canChangeGameplayOutcome: false,
  canModifyMissionState: false,
  canModifyPhysics: false,
  canModifySaveState: false,
  canModifyMultiplayerSync: false,
});

const PRIORITY = Object.freeze({
  immediate_combat_threat: "T0",
  boss_critical: "T0",
  mission_critical_actor: "T0",
  infrastructure_critical: "T1",
  likely_future_interaction: "T2",
  civilian_activity: "T3",
  irrelevant_background: "T4",
});

export class SentinelPrimeAdaptiveSignal {
  authority = SENTINEL_PRIME_ADAPTIVE_AUTHORITY;

  constructor({ now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
    this.now = now;
    this.samples = 0;
    this.totalCostMs = 0;
  }

  recommend(observation = {}) {
    const began = this.now();
    const recommendations = [];
    for (const actor of observation.actors || []) {
      let relevance = "irrelevant_background";
      if (actor.boss || actor.immediateThreat || actor.projectile) relevance = actor.boss ? "boss_critical" : "immediate_combat_threat";
      else if (actor.missionCritical) relevance = "mission_critical_actor";
      else if (actor.infrastructureCritical) relevance = "infrastructure_critical";
      else if (actor.distance <= 44) relevance = "likely_future_interaction";
      else if (actor.civilian && actor.sameBiome) relevance = "civilian_activity";
      recommendations.push(Object.freeze({ id: actor.id, relevance, suggestedTier: PRIORITY[relevance] }));
    }
    this.samples += 1;
    this.totalCostMs += Math.max(0, this.now() - began);
    return Object.freeze({
      authority: this.authority,
      generatedAt: Date.now(),
      recommendations: Object.freeze(recommendations),
    });
  }

  report() {
    return Object.freeze({
      authority: this.authority,
      samples: this.samples,
      averageCostMs: this.samples ? +(this.totalCostMs / this.samples).toFixed(4) : 0,
      asynchronous: true,
      blocksFrame: false,
    });
  }
}

export default SentinelPrimeAdaptiveSignal;
