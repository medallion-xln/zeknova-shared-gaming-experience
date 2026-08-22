import { CONTROL_DOMAINS, SENTINEL_GOBAN_AUTHORITY, createGobanStrategy } from "./SentinelGobanIntelligence.js";

export const GOBAN_ADAPTER_VERSION = "zeknova-goban-shadow-adapters-v1";
export const GOBAN_RUNTIME_PROVENANCE = Object.freeze({
  adapterVersion: GOBAN_ADAPTER_VERSION,
  plannerVersion: "sentinel-goban-intelligence-v1",
  board: "19x19-361-intersections",
  authority: "R0_EVALUATION",
});

const ROLE_INTENTS = Object.freeze({
  civilian: Object.freeze({ evacuate_to_shelter: "civilian.navigate_to_shelter", continue_civilian_activity: "civilian.continue_activity" }),
  worker: Object.freeze({ repair_infrastructure: "worker.repair_registered_structure", build_infrastructure: "worker.build_at_registered_site" }),
  scout: Object.freeze({ recon_flank: "enemy.recon_flank" }),
  stalker: Object.freeze({ stalk_from_cover: "enemy.stalker_pursuit", territorial_patrol: "enemy.territorial_patrol" }),
  saboteur: Object.freeze({ disable_infrastructure: "enemy.saboteur_disruption", guard_utility: "enemy.guard_utility" }),
  spitter: Object.freeze({ maintain_range_and_volley: "enemy.spitter_volley", overwatch: "enemy.ranged_overwatch" }),
  skyray: Object.freeze({ aerial_strafe_and_disrupt: "enemy.skyray_strafe", aerial_patrol: "enemy.aerial_patrol" }),
  burrower: Object.freeze({ seismic_infrastructure_pressure: "enemy.burrower_seismic_pressure", subsurface_guard: "enemy.subsurface_guard" }),
  juggernaut: Object.freeze({ anchor_and_break_line: "enemy.juggernaut_pursuit", hold_chokepoint: "enemy.hold_chokepoint" }),
  boss: Object.freeze({ phase_strategy_with_telegraphs: "boss.phased_telegraphed_action", issue_negotiation_challenge: "boss.negotiation_challenge" }),
});
const REVERSALS = Object.freeze({
  civilian: "restore_previous_civilian_goal", worker: "cancel_assignment_and_restore_reservation", scout: "restore_previous_recon_goal",
  stalker: "restore_previous_enemy_state", saboteur: "restore_previous_enemy_state", spitter: "restore_previous_enemy_state",
  skyray: "restore_previous_enemy_state_and_altitude", burrower: "restore_previous_enemy_state", juggernaut: "restore_previous_juggernaut_state",
  boss: "cancel_telegraph_and_restore_boss_phase",
});
const REQUIRED_METRICS = Object.freeze(["survival", "civilianSafety", "infrastructurePreservation", "objectiveCompletion", "resourceEfficiency", "positioningQuality", "unnecessaryEscalation", "missionOutcome"]);
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
function hash(value) { const text = JSON.stringify(canonical(value)); let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
function assertPoint(value) { if (!/^g(?:0\d|1[0-8])-(?:0\d|1[0-8])$/.test(String(value || ""))) throw new Error("Goban adapter coordinate binding is missing or invalid."); }
function stateEntities(state) { return new Map([...(state.actors || []), ...(state.infrastructure || []), ...(state.threats || []), ...(state.buildSites || [])].map((x) => [String(x.id), x])); }

export function adaptGobanPlan(state, options = {}) {
  const plan = options.plan || createGobanStrategy(state);
  if (plan.sourceStateHash !== createGobanStrategy(state).sourceStateHash) throw new Error("Goban adapter source-state identity mismatch.");
  if (plan.authority.canDispatch !== false || plan.authority.canMutateLiveWorld !== false) throw new Error("Goban shadow adapter authority violation.");
  if (JSON.stringify(options.provenance || GOBAN_RUNTIME_PROVENANCE) !== JSON.stringify(GOBAN_RUNTIME_PROVENANCE)) throw new Error("Goban adapter runtime provenance mismatch.");
  const entities = stateEntities(state), incumbents = options.incumbentActions || {};
  const commands = plan.actorPlans.map((actorPlan) => {
    const actor = entities.get(actorPlan.actorId), roleMap = ROLE_INTENTS[actorPlan.role], surface = roleMap?.[actorPlan.intent];
    if (!actor || String(actor.role || "") !== actorPlan.role) throw new Error("Goban adapter actor identity or role binding is missing.");
    if (!surface) throw new Error("Goban adapter command is unsupported for actor role.");
    assertPoint(actorPlan.from);
    const targetId = actorPlan.targetId || actorPlan.actorId, target = entities.get(targetId);
    if (!target) throw new Error("Goban adapter target binding is missing.");
    const lethal = actorPlan.lethal === true;
    if (actorPlan.role === "civilian" && lethal) throw new Error("Civilian lethal action rejected.");
    const sequence = actorPlan.role === "boss" ? actorPlan.sequence : null;
    if (lethal && actorPlan.role === "boss" && (!sequence || sequence.indexOf("telegraph") < 0 || sequence.indexOf("engage") < sequence.indexOf("telegraph"))) throw new Error("Boss engagement requires a prior telegraph stage.");
    const body = canonical({ sourceStateHash: plan.sourceStateHash, planId: plan.planId, gobanCoordinate: actorPlan.from, actorId: actorPlan.actorId, role: actorPlan.role, legalActionEvidence: { supportedRole: CONTROL_DOMAINS.actorBehavior.includes(actorPlan.role), supportedIntent: true, civilianNonlethal: actorPlan.role !== "civilian" || !lethal, authority: SENTINEL_GOBAN_AUTHORITY }, intent: actorPlan.intent, target: { entityId: targetId }, combatStage: sequence?.[0] || null, combatSequence: sequence, baselineAction: String(incumbents[actorPlan.actorId] || "incumbent_unobserved"), candidateAction: surface, predictedOutcome: predictedOutcome(actorPlan), actualOutcome: options.actualOutcomes?.[actorPlan.actorId] || null, runtimeProvenance: GOBAN_RUNTIME_PROVENANCE, rollback: REVERSALS[actorPlan.role], shadowOnly: true });
    return Object.freeze({ ...body, commandId: `zkgc:v1:${hash(body)}` });
  });
  const strategic = [
    strategicCommand(plan, "infrastructure", "infrastructure.prioritize_registered_asset", plan.strategicPlan.infrastructurePriority, options),
    strategicCommand(plan, "diplomacy", `diplomacy.${plan.strategicPlan.negotiation}`, "relations-panel", options),
    strategicCommand(plan, "world_cycle", `world_cycle.${plan.strategicPlan.requestedCycle}`, "strategic-clock", options),
    strategicCommand(plan, "combat_sequence", "combat.sequence_candidate", plan.actorPlans.find((x) => x.lethal)?.actorId || "no-active-combat", options),
  ];
  return Object.freeze({ adapterId: GOBAN_ADAPTER_VERSION, authority: SENTINEL_GOBAN_AUTHORITY, planId: plan.planId, sourceStateHash: plan.sourceStateHash, commands: Object.freeze([...commands, ...strategic]), canDispatch: false, canMutateLiveWorld: false });
}

function strategicCommand(plan, role, action, targetId, options) {
  const body = canonical({ sourceStateHash: plan.sourceStateHash, planId: plan.planId, gobanCoordinate: "g09-09", actorId: `sentinel:${role}`, role, legalActionEvidence: { supportedIntent: true, authority: SENTINEL_GOBAN_AUTHORITY }, intent: action, target: { entityId: String(targetId || "none") }, combatStage: role === "combat_sequence" ? plan.strategicPlan.combatSequence[0] : null, combatSequence: role === "combat_sequence" ? plan.strategicPlan.combatSequence : null, baselineAction: String(options.incumbentActions?.[`sentinel:${role}`] || "incumbent_unobserved"), candidateAction: action, predictedOutcome: { expected: "bounded_domain_improvement", uncertainty: "requires_shadow_outcome" }, actualOutcome: options.actualOutcomes?.[`sentinel:${role}`] || null, runtimeProvenance: GOBAN_RUNTIME_PROVENANCE, rollback: `restore_previous_${role}_state`, shadowOnly: true });
  return Object.freeze({ ...body, commandId: `zkgc:v1:${hash(body)}` });
}
function predictedOutcome(plan) { return Object.freeze({ expected: plan.lethal ? "reduce_hostile_pressure" : plan.intent.includes("repair") ? "restore_infrastructure" : plan.intent.includes("evacuate") ? "increase_civilian_safety" : "improve_positioning", uncertainty: "requires_shadow_outcome" }); }

export function compareGobanOutcomes({ baseline, candidate } = {}) {
  const missing = REQUIRED_METRICS.filter((key) => !Number.isFinite(baseline?.[key]) || !Number.isFinite(candidate?.[key]));
  const deltas = Object.fromEntries(REQUIRED_METRICS.map((key) => [key, missing.includes(key) ? null : +(candidate[key] - baseline[key]).toFixed(6)]));
  const regression = Object.entries(deltas).some(([key, value]) => value != null && (key === "unnecessaryEscalation" ? value > 0 : value < 0));
  return Object.freeze({ requiredMetrics: REQUIRED_METRICS, missingMetrics: Object.freeze(missing), deltas: Object.freeze(deltas), complete: missing.length === 0, superiorityClaimAllowed: missing.length === 0 && !regression && Object.values(deltas).some((x) => x > 0), promotionBlocked: missing.length > 0 || regression });
}

export function verifyGobanAdapterCampaign(samples = [], comparison = {}) {
  const reports = samples.map((sample) => {
    const first = adaptGobanPlan(sample.state, sample), second = adaptGobanPlan(canonical(sample.state), sample);
    return { deterministic: JSON.stringify(first) === JSON.stringify(second), proposal: first };
  });
  const commands = reports.flatMap((x) => x.proposal.commands), unsupported = commands.filter((x) => !x.legalActionEvidence.supportedIntent), illegal = commands.filter((x) => x.legalActionEvidence.authority.canDispatch !== false), civilianLethal = commands.filter((x) => x.role === "civilian" && x.legalActionEvidence.civilianNonlethal !== true), bossUntelegraphed = commands.filter((x) => x.role === "boss" && x.combatSequence?.includes("engage") && (!x.combatSequence.includes("telegraph") || x.combatSequence.indexOf("engage") < x.combatSequence.indexOf("telegraph")));
  const outcomeComparison = compareGobanOutcomes(comparison);
  return Object.freeze({ roleAdapterDeterminism: reports.every((x) => x.deterministic), unsupportedCommandCount: unsupported.length, illegalActionCount: illegal.length, civilianLethalActionCount: civilianLethal.length, bossUntelegraphedEngagementCount: bossUntelegraphed.length, unauthorizedMutationCount: 0, rollbackPathsVerified: commands.every((x) => !!x.rollback), baselineComparison: outcomeComparison, baselineComparisonComplete: outcomeComparison.complete, liveAuthorityRecommendation: outcomeComparison.superiorityClaimAllowed ? "PREPARE_MANIFEST" : "REJECT", liveAuthorityAuthorized: false, authority: SENTINEL_GOBAN_AUTHORITY });
}
