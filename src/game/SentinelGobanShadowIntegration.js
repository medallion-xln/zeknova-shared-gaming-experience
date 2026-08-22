import { createGobanStrategy } from "../world/SentinelGobanIntelligence.js";
import { adaptGobanPlan } from "../world/SentinelGobanShadowAdapters.js";
import { compareGobanOutcomes } from "../world/SentinelGobanShadowAdapters.js";

const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const stable = (value) => JSON.stringify(canonical(value));
function positionOf(value) { const p = value?.position || value?.group?.position; return { x: Number(p?.x || 0), z: Number(p?.z || 0) }; }

/** Read-only live capture. It deliberately has no execute/dispatch method. */
export class SentinelGobanShadowIntegration {
  constructor({ game, authenticatedSession = false } = {}) { if (!game) throw new Error("Goban shadow integration requires ZekNova game."); this.game = game; this.authenticatedSession = authenticatedSession === true; this.evidence = []; }
  captureState() {
    const enemies = (this.game.enemies || []).filter(Boolean).map((enemy, index) => ({ id: String(enemy.userData?.entityId || enemy.uuid || `enemy-${index}`), role: String(enemy.userData?.role || enemy.userData?.enemyType || "stalker"), faction: "zeknovan", position: positionOf(enemy) }));
    const boss = this.game.bossManager?.active ? [{ id: String(this.game.bossManager.config?.id || "active-boss"), role: "boss", faction: "zeknovan", position: positionOf(this.game.bossManager.active) }] : [];
    const infrastructure = [...(this.game.buildings?.items || this.game.buildings?.buildings || this.game.buildings?.records || [])].filter(Boolean).map((item, index) => ({ id: String(item.userData?.entityId || item.id || `structure-${index}`), type: String(item.userData?.type || item.type || "defense"), status: String(item.userData?.status || item.status || "operational"), position: positionOf(item) }));
    const uiState = this.game.ui?.lastState || {};
    return { quantum: Math.max(0, Math.trunc(this.game.perceptionQuantum || 0)), missionContext: String(this.game.missions?.active?.id || this.game.activeMission?.id || uiState.phase || "unknown"), dayNightPhase: String(this.game.timeOfDay || this.game.dayNightPhase || "unknown"), combatStage: String(this.game.bossManager?.active?.userData?.combatStage || this.game.bossManager?.phase?.id || "observe"), tension: Number(this.game.diplomacyTension ?? 50), ceasefire: Boolean(globalThis.ZekNovaRelationsPanel?.ceasefire), actors: [...enemies, ...boss], infrastructure, threats: this.game.player?.group ? [{ id: String(this.game.player.group.userData?.entityId || "local-player"), type: "player", position: positionOf(this.game.player.group) }] : [] };
  }
  incumbentActions() {
    const rows = {};
    for (const enemy of this.game.enemies || []) {
      const id = String(enemy?.userData?.entityId || enemy?.uuid || ""); if (!id) continue;
      rows[id] = String(enemy.userData?.juggernautState || enemy.userData?.aiState || enemy.userData?.state || enemy.userData?.behavior || `incumbent_${enemy.userData?.enemyType || enemy.userData?.role || "enemy"}_default_behavior`);
    }
    if (this.game.bossManager?.active) rows[String(this.game.bossManager.config?.id || "active-boss")] = String(this.game.bossManager.phase?.id || this.game.bossManager.active.userData?.combatStage || "incumbent_boss_active");
    rows["sentinel:infrastructure"] = "incumbent_maintain_current_infrastructure";
    rows["sentinel:diplomacy"] = globalThis.ZekNovaRelationsPanel?.ceasefire ? "incumbent_honor_ceasefire" : "incumbent_no_active_terms";
    rows["sentinel:world_cycle"] = `incumbent_${String(this.game.timeOfDay || this.game.dayNightPhase || "cycle_unobserved")}`;
    rows["sentinel:combat_sequence"] = this.game.bossManager?.active ? String(this.game.bossManager.phase?.id || "incumbent_boss_active") : "incumbent_no_active_boss_sequence";
    return rows;
  }
  observedMetrics() {
    const playerHealth = Number(this.game.player?.health ?? this.game.player?.group?.userData?.health);
    const structures = [...(this.game.buildings?.items || this.game.buildings?.buildings || this.game.buildings?.records || [])].filter(Boolean);
    const operational = structures.filter((x) => String(x.userData?.status || x.status || "operational") === "operational").length;
    const resources = this.game.simulation?.resources;
    return Object.freeze({
      survival: Number.isFinite(playerHealth) ? (playerHealth > 0 ? 1 : 0) : null,
      civilianSafety: Number.isFinite(this.game.civilianSafety) ? Number(this.game.civilianSafety) : null,
      infrastructurePreservation: structures.length ? operational / structures.length : null,
      objectiveCompletion: Number.isFinite(this.game.missionProgress) ? Number(this.game.missionProgress) : null,
      resourceEfficiency: resources && Number.isFinite(resources.minerals) ? Number(resources.minerals) : null,
      positioningQuality: Number.isFinite(this.game.positioningQuality) ? Number(this.game.positioningQuality) : null,
      unnecessaryEscalation: Number.isFinite(this.game.diplomacyTension) ? Number(this.game.diplomacyTension) / 100 : null,
      missionOutcome: this.game.missionOutcome == null ? null : Number(this.game.missionOutcome),
    });
  }
  runShadow(options = {}) {
    const stateBefore = this.captureState(), before = stable(stateBefore), plan = createGobanStrategy(stateBefore), incumbentActions = { ...this.incumbentActions(), ...(options.incumbentActions || {}) }, actualOutcomes = options.actualOutcomes || {};
    const proposal = adaptGobanPlan(stateBefore, { ...options, plan, incumbentActions, actualOutcomes });
    const replayPlan = createGobanStrategy(canonical(stateBefore)), replay = adaptGobanPlan(canonical(stateBefore), { ...options, plan: replayPlan, incumbentActions, actualOutcomes });
    const stateAfter = this.captureState(), after = stable(stateAfter);
    if (before !== after) throw new Error("Goban R0 shadow capture mutated live state.");
    const record = Object.freeze({ capturedAtQuantum: stateBefore.quantum, authenticSession: this.authenticatedSession, parityWindowComplete: false, sourceContext: Object.freeze({ tension: stateBefore.tension, threatCount: stateBefore.threats.length, actorRoles: Object.freeze(stateBefore.actors.map((x) => x.role).sort()), infrastructureConditions: Object.freeze(stateBefore.infrastructure.map((x) => `${x.id}:${x.status}`).sort()), missionContext: stateBefore.missionContext, dayNightPhase: stateBefore.dayNightPhase, combatStage: stateBefore.combatStage }), planId: plan.planId, sourceStateHash: plan.sourceStateHash, stateBefore: canonical(stateBefore), stateAfter: canonical(stateAfter), proposal, incumbentActions: Object.freeze(incumbentActions), observedOutcome: this.observedMetrics(), deterministicReplayPass: plan.planId === replayPlan.planId && stable(proposal) === stable(replay), incumbentActionBindingPass: proposal.commands.every((x) => x.baselineAction !== "incumbent_unobserved"), actualOutcomeBindingPass: proposal.commands.every((x) => x.actualOutcome != null), unauthorizedMutationCount: 0 }); this.evidence.push(record); return record;
  }
  async runParityWindow({ windowMs = 1500, ...options } = {}) {
    const preview = this.runShadow(options); this.evidence.pop();
    const beforeMetrics = this.observedMetrics();
    await new Promise((resolve) => setTimeout(resolve, Math.max(250, Math.min(10000, Number(windowMs) || 1500))));
    const stateAfter = this.captureState(), afterMetrics = this.observedMetrics();
    const afterEntities = new Map([...(stateAfter.actors || []), ...(stateAfter.infrastructure || []), ...(stateAfter.threats || [])].map((x) => [String(x.id), x]));
    const actualOutcomes = Object.fromEntries(preview.proposal.commands.map((command) => [command.actorId, Object.freeze({ observed: true, targetPresentAfter: command.target.entityId === "none" || afterEntities.has(command.target.entityId), actorPresentAfter: command.actorId.startsWith("sentinel:") || afterEntities.has(command.actorId), metricsBefore: beforeMetrics, metricsAfter: afterMetrics })]));
    const plan = createGobanStrategy(preview.stateBefore), incumbentActions = preview.incumbentActions;
    const proposal = adaptGobanPlan(preview.stateBefore, { ...options, plan, incumbentActions, actualOutcomes });
    const replay = adaptGobanPlan(canonical(preview.stateBefore), { ...options, plan: createGobanStrategy(canonical(preview.stateBefore)), incumbentActions, actualOutcomes });
    const record = Object.freeze({ ...preview, parityWindowComplete: true, stateAfter: canonical(stateAfter), proposal, observedOutcome: afterMetrics, deterministicReplayPass: stable(proposal) === stable(replay), actualOutcomeBindingPass: proposal.commands.every((x) => x.actualOutcome?.observed === true) });
    this.evidence.push(record); return record;
  }
  captureEvidence() { return Object.freeze([...this.evidence]); }
  coverageCapabilities() {
    const game = this.game, buildings = game.buildings?.items || game.buildings?.buildings || game.buildings?.records || [];
    return Object.freeze({
      civilianSafety: Object.freeze({ available: Number.isFinite(game.civilianSafety), source: Number.isFinite(game.civilianSafety) ? "game.civilianSafety" : null, reason: Number.isFinite(game.civilianSafety) ? null : "No canonical civilian population/safety outcome is exposed." }),
      infrastructurePreservation: Object.freeze({ available: Array.isArray(buildings) && buildings.length > 0, source: Array.isArray(buildings) && buildings.length ? "game.buildings records" : null, reason: Array.isArray(buildings) && buildings.length ? null : "Authenticated session contains no registered infrastructure outcome population." }),
      objectiveCompletion: Object.freeze({ available: Number.isFinite(game.missionProgress), source: Number.isFinite(game.missionProgress) ? "game.missionProgress" : null, reason: Number.isFinite(game.missionProgress) ? null : "Mission context is descriptive; no canonical scalar completion outcome is exposed." }),
      positioningQuality: Object.freeze({ available: Number.isFinite(game.positioningQuality), source: Number.isFinite(game.positioningQuality) ? "game.positioningQuality" : null, reason: Number.isFinite(game.positioningQuality) ? null : "No approved positioning-quality evaluator exists." }),
      missionOutcome: Object.freeze({ available: game.missionOutcome != null && Number.isFinite(Number(game.missionOutcome)), source: game.missionOutcome != null ? "game.missionOutcome" : null, reason: game.missionOutcome != null ? null : "No completed mission outcome exists in the observed window." }),
      dayNight: Object.freeze({ available: game.timeOfDay != null || game.dayNightPhase != null, source: game.timeOfDay != null ? "game.timeOfDay" : game.dayNightPhase != null ? "game.dayNightPhase" : null, reason: game.timeOfDay != null || game.dayNightPhase != null ? null : "The live runtime exposes no day/night state." }),
      bossCombatStage: Object.freeze({ available: Boolean(game.bossManager?.active), source: game.bossManager?.active ? "game.bossManager active phase" : null, reason: game.bossManager?.active ? null : "No authentic boss encounter was active." }),
      counterfactualEvaluator: Object.freeze({ available: false, source: null, reason: "No approved deterministic Goban actor/outcome simulator is installed; the existing Prime forward model does not model these role commands." }),
      dispatchSurfaceAbsent: typeof this.execute === "undefined" && typeof this.dispatch === "undefined",
    });
  }
  certifyCoverage({ inheritedEvidenceCount = 0, baseline, candidate } = {}) {
    const parity = this.certify({ baseline, candidate }), capabilities = this.coverageCapabilities(), authentic = this.evidence.filter((x) => x.authenticSession && x.parityWindowComplete), contexts = authentic.map((x) => x.sourceContext);
    const distinct = (key) => new Set(contexts.map((x) => stable(x[key]))).size > 1;
    const counterfactualOutcomeBinding = capabilities.counterfactualEvaluator.available && authentic.every((x) => x.proposal.commands.every((c) => c.actualOutcome != null));
    return Object.freeze({ authenticEvidenceCount: inheritedEvidenceCount + authentic.length, civilianSafetyMeasured: capabilities.civilianSafety.available, infrastructurePreservationMeasured: capabilities.infrastructurePreservation.available, objectiveCompletionMeasured: capabilities.objectiveCompletion.available, positioningQualityMeasured: capabilities.positioningQuality.available, missionOutcomeMeasured: capabilities.missionOutcome.available, counterfactualOutcomeBinding, infrastructureVariation: distinct("infrastructureConditions"), dayNightVariation: distinct("dayNightPhase") && capabilities.dayNight.available, missionContextVariation: distinct("missionContext"), bossCombatStageVariation: distinct("combatStage") && capabilities.bossCombatStage.available, counterfactualCoverageComplete: false, baselineComparisonComplete: parity.baselineComparisonComplete && counterfactualOutcomeBinding, candidateOutperformsFrozenBaseline: parity.candidateOutperformsFrozenBaseline && counterfactualOutcomeBinding, liveAuthorityRecommendation: "REJECT", liveAuthorityAuthorized: false, capabilities, safety: Object.freeze({ unsupportedCommandCount: parity.unsupportedCommandCount, illegalActionCount: parity.illegalActionCount, civilianLethalActionCount: parity.civilianLethalActionCount, bossUntelegraphedEngagementCount: parity.bossUntelegraphedEngagementCount, unauthorizedMutationCount: parity.unauthorizedMutationCount }) });
  }
  certify({ baseline, candidate } = {}) {
    const authentic = this.evidence.filter((x) => x.authenticSession && x.parityWindowComplete), commands = authentic.flatMap((x) => x.proposal.commands), comparison = compareGobanOutcomes({ baseline, candidate });
    return Object.freeze({ authenticSessionParityTested: authentic.length > 0, authenticEvidenceCount: authentic.length, deterministicReplayPass: authentic.length > 0 && authentic.every((x) => x.deterministicReplayPass), incumbentActionBindingPass: authentic.length > 0 && authentic.every((x) => x.incumbentActionBindingPass), actualOutcomeBindingPass: authentic.length > 0 && authentic.every((x) => x.actualOutcomeBindingPass), unsupportedCommandCount: commands.filter((x) => !x.legalActionEvidence.supportedIntent).length, illegalActionCount: commands.filter((x) => x.legalActionEvidence.authority.canDispatch !== false).length, civilianLethalActionCount: commands.filter((x) => x.role === "civilian" && x.legalActionEvidence.civilianNonlethal !== true).length, bossUntelegraphedEngagementCount: commands.filter((x) => x.role === "boss" && x.combatSequence?.includes("engage") && x.combatSequence.indexOf("telegraph") > x.combatSequence.indexOf("engage")).length, unauthorizedMutationCount: authentic.reduce((n, x) => n + x.unauthorizedMutationCount, 0), rollbackPathsVerified: commands.length > 0 && commands.every((x) => !!x.rollback), baselineComparison: comparison, baselineComparisonComplete: comparison.complete, candidateOutperformsFrozenBaseline: comparison.superiorityClaimAllowed, liveAuthorityRecommendation: comparison.superiorityClaimAllowed && authentic.every((x) => x.deterministicReplayPass && x.incumbentActionBindingPass && x.actualOutcomeBindingPass) ? "APPROVE" : "REJECT", liveAuthorityAuthorized: false });
  }
}
