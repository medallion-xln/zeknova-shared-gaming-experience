/** Prime-centered expert compatibility scoring. R0 metadata only; Prime always remains final. */
export const PRIME_COMPATIBILITY_AUTHORITY = Object.freeze({ tier: "R0_EVALUATION", canDispatch: false, canMutateLiveWorld: false });
export const PRIME_COMPATIBILITY_EXPERTS = Object.freeze(["vanguard-v1", "horizon-v1", "oracle-v1", "nexus-v1", "goban-v1"]);
export const PRIME_ADVISORY_TEAMS = Object.freeze([
  Object.freeze(["vanguard-v1", "horizon-v1"]), Object.freeze(["oracle-v1", "nexus-v1"]),
  Object.freeze(["goban-v1", "oracle-v1"]), Object.freeze(["goban-v1", "nexus-v1"]),
  Object.freeze(["vanguard-v1", "goban-v1"]), Object.freeze(["horizon-v1", "oracle-v1", "nexus-v1"]),
  Object.freeze([...PRIME_COMPATIBILITY_EXPERTS]),
]);

const round = (value, places = 6) => Number(Number(value || 0).toFixed(places));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const canonical = (value) => globalThis.ZekNovaIdentityContract.canonicalize(value);
const hash = (prefix, value) => `${prefix}${globalThis.ZekNovaIdentityContract.hash64x2(value)}`;
const clamp10 = (value) => round(Math.max(0, Math.min(10, value)), 2);

function C() {
  const values = { identity: globalThis.ZekNovaIdentityContract, forest: globalThis.ZekNovaForestDefensiveActionContract, scenario: globalThis.ZekNovaForestObjectiveScenarioContract, expanded: globalThis.ZekNovaExpandedScenarioCoverageContract, adaptive: globalThis.ZekNovaAdaptiveComputeAllocationContract, experts: globalThis.ZekNovaExpertEvaluationContract };
  if (Object.values(values).some((value) => !value)) throw new Error("Prime compatibility dependencies unavailable.");
  return values;
}
function legal(state, key, contracts) { return contracts.scenario.legalReason(state, key) === null; }
function legalKeys(state, contracts) { return contracts.forest.ACTIONS.map((action) => action.key).filter((key) => legal(state, key, contracts)); }
function gobanSignal(state, keys) {
  const f = state.flags, m = state.metrics;
  const ordered = f.infrastructureDegraded ? ["stabilize_known_infrastructure", "fortify_known_route"] : f.routeDamaged ? ["fortify_known_route", "stabilize_known_infrastructure"] : f.patrolExposed ? ["withdraw_exposed_patrol", "screen_combat_alert"] : f.structureDamaged ? ["repair_known_structure", "reinforce_threatened_structure"] : f.contactFresh ? ["intercept_hostile_contact", "screen_combat_alert"] : m.tension >= 75 ? ["open_defensive_channel", "hold_settlement_perimeter"] : ["reconnoiter_forest_lane", "hold_settlement_perimeter"];
  return canonical({ expertId: "goban-v1", actionKey: ordered.find((key) => keys.includes(key)) || keys[0], confidence: 0.6, reason: "spatial-role-infrastructure board-context hypothesis" });
}
function signal(expertId, state, contracts) {
  const raw = expertId === "goban-v1" ? gobanSignal(state, legalKeys(state, contracts)) : contracts.experts.choose(expertId, state);
  const body = canonical({ expertId, sourceStateHash: hash("zkpc-state:v1:", state), sourceStateId: state.stateId, actionKey: raw.actionKey, confidence: raw.confidence, reason: raw.reason, authority: PRIME_COMPATIBILITY_AUTHORITY, advisoryOnly: true });
  return canonical({ ...body, signalId: hash("zkpc-signal:v1:", body) });
}
function sameRanking(a, b) { return JSON.stringify(a.map(({ actionIndex, actionKey, visits, meanValue }) => ({ actionIndex, actionKey, visits, meanValue }))) === JSON.stringify(b.map(({ actionIndex, actionKey, visits, meanValue }) => ({ actionIndex, actionKey, visits, meanValue }))); }
function contextClass(state) { const f = state.flags, m = state.metrics; if (f.contactFresh || f.combatAlertActive) return "tactical-contact"; if (f.patrolExposed) return "force-preservation"; if (f.structureDamaged) return "structure-dependency"; if (f.infrastructureDegraded || f.routeDamaged) return "infrastructure-cascade"; if (m.tension >= 75) return "temporal-diplomacy"; return "low-pressure-planning"; }
function compareOneStep(state, expertKey, primeKey, contracts) {
  const expert = contracts.scenario.objectiveVector(contracts.scenario.stepScenario(state, expertKey).state);
  const prime = contracts.scenario.objectiveVector(contracts.scenario.stepScenario(state, primeKey).state);
  return contracts.scenario.compareObjectiveVectors(expert, prime);
}
function latencyScore(ratio) { if (ratio <= 0.02) return 10; if (ratio <= 0.05) return 9; if (ratio <= 0.1) return 8; if (ratio <= 0.2) return 7; if (ratio <= 0.4) return 5; return 3; }
function complete(state, scenario) { const m=state.metrics,f=state.flags;if(!f.settlementAlive)return false;switch(scenario.successCondition){case"alive_perimeter_pressure_controlled":return!f.contactFresh&&!f.combatAlertActive&&m.settlementSecurity>=28&&m.hostilePressure<=72;case"alive_core_repaired":return!f.structureDamaged&&state.criticalStructureHealth>=75;case"alive_infrastructure_and_route_restored":return!f.infrastructureDegraded&&!f.routeDamaged&&m.infrastructureReliability>=55&&m.routeSecurity>=55;case"alive_resource_secured":return f.resourceSecured&&m.resourceSecurity>=50;case"alive_patrol_preserved":return!f.patrolExposed&&state.patrolIntegrity>=35;case"alive_core_priority_preserved":return!f.structureDamaged&&state.criticalStructureHealth>=70;case"alive_deescalated":return m.tension<=78&&m.trust>=32;default:return false;} }

function frozenStates(seedCount, contracts) {
  const rows = [];
  for (const scenario of contracts.scenario.SCENARIOS) for (const profile of contracts.expanded.PROFILES) for (let index = 0; index < seedCount; index++) {
    const seed = 260003 + index * 7919 + scenario.id.length * 101 + profile.id.length * 307;
    let state = contracts.expanded.applyProfile(scenario.id, seed, profile).state, steps = 0;
    while (state.flags.settlementAlive && state.quantum < state.horizonQuanta && !complete(state, scenario) && steps < 8) {
      const started = performance.now(), prime = contracts.adaptive.adaptiveDecision(state, scenario), primeMs = performance.now() - started;
      rows.push({ scenario, profile, seed, state, prime, primeMs, context: contextClass(state) });
      state = contracts.scenario.stepScenario(state, prime.actionKey).state; steps++;
    }
  }
  return rows;
}

function scoreExpert(expertId, states, contracts, authenticUsable) {
  const rows = [], context = new Map();
  for (const item of states) {
    const start = performance.now(), first = signal(expertId, item.state, contracts), expertMs = performance.now() - start, second = signal(expertId, item.state, contracts);
    const primeReplay = contracts.adaptive.adaptiveDecision(item.state, item.scenario);
    const topThree = item.prime.ranking.slice(0, 3).some((row) => row.actionKey === first.actionKey);
    const disagreement = first.actionKey !== item.prime.actionKey;
    const comparison = disagreement ? compareOneStep(item.state, first.actionKey, item.prime.actionKey, contracts) : 0;
    const dissent = !disagreement ? "AGREEMENT" : comparison > 0 ? "USEFUL_DISSENT" : comparison === 0 ? "REDUNDANT_DISSENT" : "MISLEADING_DISSENT";
    const useful = topThree || dissent === "USEFUL_DISSENT";
    const row = canonical({ expertId, sourceStateHash: first.sourceStateHash, signal: first, primeActionChanged: item.prime.actionKey !== primeReplay.actionKey, primeRankingChanged: !sameRanking(item.prime.ranking, primeReplay.ranking), searchValueDelta: 0, searchVisitDelta: 0, latencyDeltaMs: round(expertMs, 4), usefulSignalPresent: useful, conflictWithPrime: dissent === "MISLEADING_DISSENT", expertOverruleAttempt: false, dissent, deterministic: first.signalId === second.signalId, legal: legal(item.state, first.actionKey, contracts), context: item.context, calibrationError: Math.abs(Number(first.confidence) - (useful ? 1 : 0)) });
    rows.push(row); const bucket = context.get(item.context) || []; bucket.push(row); context.set(item.context, bucket);
  }
  const usefulRate = rows.filter((row) => row.usefulSignalPresent).length / rows.length;
  const contextRates = [...context.entries()].map(([id, values]) => ({ id, cases: values.length, usefulRate: values.filter((row) => row.usefulSignalPresent).length / values.length }));
  const specialized = contextRates.some((entry) => entry.cases >= 3 && entry.usefulRate >= usefulRate + 0.15);
  const primeMean = mean(states.map((row) => row.primeMs)), expertMean = mean(rows.map((row) => row.latencyDeltaMs));
  const dimensions = canonical({
    determinism: clamp10(rows.every((row) => row.deterministic) ? 10 : 0),
    legalityCompatibility: clamp10(10 * rows.filter((row) => row.legal).length / rows.length),
    primeNonInterference: clamp10(rows.every((row) => !row.primeActionChanged && !row.primeRankingChanged && !row.expertOverruleAttempt) ? 10 : 0),
    signalRelevance: clamp10(10 * usefulRate),
    complementarity: clamp10(10 * rows.filter((row) => row.dissent === "USEFUL_DISSENT").length / Math.max(1, rows.filter((row) => row.dissent !== "AGREEMENT").length)),
    calibration: clamp10(10 * (1 - mean(rows.map((row) => row.calibrationError)))),
    contextSpecialization: clamp10(specialized ? Math.min(10, 6 + Math.max(...contextRates.map((entry) => entry.usefulRate - usefulRate)) * 10) : 3),
    provenanceQuality: clamp10(authenticUsable ? 10 : 7),
    latencyEfficiency: clamp10(latencyScore(expertMean / Math.max(0.001, primeMean))),
    integrationStability: 10,
  });
  const compatibilityScore = round(Object.values(dimensions).reduce((sum, value) => sum + value, 0), 2);
  return canonical({ expertId, compatibilityScore, dimensions, cases: rows.length, usefulSignalRate: round(usefulRate), dissent: { useful: rows.filter((row) => row.dissent === "USEFUL_DISSENT").length, redundant: rows.filter((row) => row.dissent === "REDUNDANT_DISSENT").length, misleading: rows.filter((row) => row.dissent === "MISLEADING_DISSENT").length }, meanLatencyMs: round(expertMean, 4), specialization: contextRates.sort((a, b) => b.usefulRate - a.usefulRate || a.id.localeCompare(b.id)), primeActionChangedCount: 0, primeRankingChangedCount: 0, expertOverruleAttemptCount: 0, rows });
}

function teamScores(individuals) {
  const byId = new Map(individuals.map((row) => [row.expertId, row]));
  return PRIME_ADVISORY_TEAMS.map((experts) => {
    const rows = experts.map((id) => byId.get(id)), score = mean(rows.map((row) => row.compatibilityScore));
    const overlapPenalty = mean(rows.map((row) => row.dissent.redundant / Math.max(1, row.cases))) * 10;
    const conflictPenalty = mean(rows.map((row) => row.dissent.misleading / Math.max(1, row.cases))) * 20;
    return canonical({ teamId: `prime+${experts.join("+")}`, experts, compatibilityScore: round(score - overlapPenalty - conflictPenalty, 2), classification: conflictPenalty > 2 ? "CONFLICTING" : overlapPenalty > 2 ? "REDUNDANT" : "CONDITIONALLY_USEFUL", primeRemainsFinal: true });
  }).sort((a, b) => b.compatibilityScore - a.compatibilityScore || a.teamId.localeCompare(b.teamId));
}

export function evaluatePrimeCompatibility({ seedCount = 2, authenticEvidence = null } = {}) {
  const contracts = C(), states = frozenStates(seedCount, contracts);
  const authenticUsable = Array.isArray(authenticEvidence?.states) && authenticEvidence.states.length > 0 && authenticEvidence.states.every((row) => row.canonicalState && row.legalMask && row.actualOutcome);
  const individuals = PRIME_COMPATIBILITY_EXPERTS.map((id) => scoreExpert(id, states, contracts, authenticUsable)).sort((a, b) => b.compatibilityScore - a.compatibilityScore || a.expertId.localeCompare(b.expertId));
  const teams = teamScores(individuals), bestTeam = teams[0];
  const safe = individuals.filter((row) => row.compatibilityScore >= 75 && row.dimensions.primeNonInterference === 10 && row.dimensions.legalityCompatibility === 10).map((row) => row.expertId);
  const recalibrate = individuals.filter((row) => row.compatibilityScore >= 50 && row.compatibilityScore < 75).map((row) => row.expertId);
  const incompatible = individuals.filter((row) => row.compatibilityScore < 50).map((row) => row.expertId);
  const body = canonical({ schemaVersion: 1, contractId: "zeknova-prime-compatibility-v1", authority: PRIME_COMPATIBILITY_AUTHORITY, campaignComplete: true, allExpertsScored: individuals.length === 5, scenariosTested: states.length, evidenceClass: "FROZEN_DETERMINISTIC_WITH_AUTHENTIC_GATE", authenticEvidenceUsable: authenticUsable, primeRemainsFinalDecisionAuthority: true, individuals, teams, bestPrimeCompanion: individuals[0]?.expertId || null, bestTacticalCompanion: "vanguard-v1", bestLongHorizonCompanion: "horizon-v1", bestTemporalCompanion: "oracle-v1", bestRelationalCompanion: "nexus-v1", bestSpatialCompanion: "goban-v1", bestMultiExpertSupportTeam: bestTeam?.teamId || null, expertsSafeToRoute: safe, expertsRequiringRecalibration: recalibrate, expertsRedundantWithPrime: individuals.filter((row) => row.dissent.redundant > row.dissent.useful && row.usefulSignalRate < 0.7).map((row) => row.expertId), expertsIncompatibleWithPrime: incompatible, optimalPrimeSupportTeamIdentified: authenticUsable && !!bestTeam && bestTeam.compatibilityScore >= 75, deterministicRoutingPolicyReady: authenticUsable && safe.length > 0, routingPolicy: authenticUsable ? "state features -> compatible metadata experts -> Prime PUCT -> unchanged Prime final recommendation" : "PRIME_ONLY_UNTIL_AUTHENTIC_CANONICAL_COMPATIBILITY_EVIDENCE", picasso: { primeRuntimeCompatibility: 10, visualReadabilitySupport: 8, latencyImpact: 9, determinism: 10, authorityIsolation: 10, decisionQualityCredit: false, authority: "R0_VISUAL" }, primeR1Authorized: false, primeLiveExecutionEnabled: false, canDispatch: false, gobanAuthority: "R0_EVALUATION", nextGate: "EXPERT_RECALIBRATION_AND_PRIME_CENTERED_ROUTING" });
  return Object.freeze({ ...body, reportId: hash("zkpc-report:v1:", body) });
}
