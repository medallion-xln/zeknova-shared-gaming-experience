/** Deterministic R0 expert-isolation and team-ablation evaluator. No execution surface. */
export const SENTINEL_EXPERT_ABLATION_AUTHORITY = Object.freeze({
  tier: "R0_EVALUATION",
  canDispatch: false,
  canMutateLiveWorld: false,
  canChangeAuthority: false,
});

export const DECISION_EXPERTS = Object.freeze([
  Object.freeze({ id: "vanguard-v1", label: "Scout / Vanguard" }),
  Object.freeze({ id: "horizon-v1", label: "Strategist / Horizon" }),
  Object.freeze({ id: "oracle-v1", label: "Oracle" }),
  Object.freeze({ id: "nexus-v1", label: "Nexus" }),
  Object.freeze({ id: "goban-v1", label: "Goban" }),
]);

const round = (value, places = 6) => Number(Number(value || 0).toFixed(places));
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const canonical = (value) => globalThis.ZekNovaIdentityContract.canonicalize(value);
const hash = (prefix, value) => `${prefix}${globalThis.ZekNovaIdentityContract.hash64x2(value)}`;

function contracts() {
  const values = {
    identity: globalThis.ZekNovaIdentityContract,
    forest: globalThis.ZekNovaForestDefensiveActionContract,
    scenario: globalThis.ZekNovaForestObjectiveScenarioContract,
    expanded: globalThis.ZekNovaExpandedScenarioCoverageContract,
    adaptive: globalThis.ZekNovaAdaptiveComputeAllocationContract,
    experts: globalThis.ZekNovaExpertEvaluationContract,
  };
  if (Object.values(values).some((value) => !value)) throw new Error("Sentinel expert ablation dependencies are unavailable.");
  return values;
}

function legalKeys(state, C) {
  return C.forest.ACTIONS.filter((action) => C.scenario.legalReason(state, action.key) === null).map((action) => action.key);
}

function gobanAdvisory(state, legal) {
  const flags = state.flags, metrics = state.metrics;
  const priorities = flags.infrastructureDegraded ? ["stabilize_known_infrastructure", "fortify_known_route"]
    : flags.routeDamaged ? ["fortify_known_route", "stabilize_known_infrastructure"]
      : flags.patrolExposed ? ["withdraw_exposed_patrol", "screen_combat_alert"]
        : flags.structureDamaged ? ["repair_known_structure", "reinforce_threatened_structure"]
          : flags.contactFresh ? ["intercept_hostile_contact", "screen_combat_alert"]
            : metrics.tension >= 75 ? ["open_defensive_channel", "hold_settlement_perimeter"]
              : ["reconnoiter_forest_lane", "hold_settlement_perimeter"];
  const actionKey = priorities.find((key) => legal.includes(key)) || legal[0];
  return canonical({ expertId: "goban-v1", actionKey, confidence: 0.6, reason: "R0 board-domain priority projection; spatial authenticity unavailable in fixture" });
}

function advisory(expertId, state, legal, C) {
  return expertId === "goban-v1" ? gobanAdvisory(state, legal) : C.experts.choose(expertId, state);
}

function configurations() {
  const ids = DECISION_EXPERTS.map((expert) => expert.id), result = [[]];
  for (const id of ids) result.push([id]);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) result.push([ids[i], ids[j]]);
  [
    ["vanguard-v1", "horizon-v1", "oracle-v1"],
    ["vanguard-v1", "oracle-v1", "nexus-v1"],
    ["horizon-v1", "oracle-v1", "nexus-v1"],
    ["vanguard-v1", "horizon-v1", "oracle-v1", "nexus-v1"],
    ["vanguard-v1", "horizon-v1", "oracle-v1", "goban-v1"],
    ["vanguard-v1", "horizon-v1", "nexus-v1", "goban-v1"],
    ["vanguard-v1", "oracle-v1", "nexus-v1", "goban-v1"],
    ["horizon-v1", "oracle-v1", "nexus-v1", "goban-v1"],
    ids,
  ].forEach((row) => result.push(row));
  const seen = new Set();
  return result.filter((row) => { const key = row.slice().sort().join("+") || "prime-only"; if (seen.has(key)) return false; seen.add(key); return true; })
    .map((activeExperts) => Object.freeze({ configurationId: activeExperts.length ? `prime+${activeExperts.join("+")}` : "prime-only", activeExperts: Object.freeze(activeExperts) }));
}

function primeDecision(state, scenario, activeExperts, C, baselineCache) {
  const cacheKey = `${scenario.id}|${state.stateId}`;
  let cached = baselineCache.get(cacheKey);
  if (!cached) { const searchStarted = performance.now(); const decision = C.adaptive.adaptiveDecision(state, scenario); cached = { decision, searchTimeMs: performance.now() - searchStarted }; baselineCache.set(cacheKey, cached); }
  const baseline = cached.decision, advisoryStarted = performance.now();
  const legal = legalKeys(state, C);
  const outputs = activeExperts.map((id) => advisory(id, state, legal, C));
  const ranking = baseline.ranking.map((row) => {
    const support = outputs.filter((output) => output.actionKey === row.actionKey).reduce((sum, output) => sum + output.confidence, 0);
    return { ...row, advisorySupport: round(support), fusedValue: round(row.meanValue + support * 0.025, 12) };
  }).sort((a, b) => b.fusedValue - a.fusedValue || b.visits - a.visits || a.actionIndex - b.actionIndex);
  const actionKey = ranking[0].actionKey;
  const advisoryTime = performance.now() - advisoryStarted;
  return canonical({ actionKey, baselineAction: baseline.actionKey, confidence: baseline.confidence, expertOutputs: outputs, legalMask: C.forest.ACTIONS.map((action) => legal.includes(action.key) ? 1 : 0), ranking, searchValue: ranking[0].fusedValue, searchVisits: baseline.allocatedBudget, searchTimeMs: round(cached.searchTimeMs, 3), totalLatencyMs: round(cached.searchTimeMs + advisoryTime, 3) });
}

function objectiveScore(state, C) {
  const vector = C.scenario.objectiveVector(state);
  return vector.reduce((sum, value, index) => sum + Number(value) * Math.pow(101, vector.length - index - 1), 0);
}

function scenarioComplete(state, scenario) {
  const m = state.metrics, f = state.flags;
  if (!f.settlementAlive) return false;
  switch (scenario.successCondition) {
    case "alive_perimeter_pressure_controlled": return !f.contactFresh && !f.combatAlertActive && m.settlementSecurity >= 28 && m.hostilePressure <= 72;
    case "alive_core_repaired": return !f.structureDamaged && state.criticalStructureHealth >= 75;
    case "alive_infrastructure_and_route_restored": return !f.infrastructureDegraded && !f.routeDamaged && m.infrastructureReliability >= 55 && m.routeSecurity >= 55;
    case "alive_resource_secured": return f.resourceSecured && m.resourceSecurity >= 50;
    case "alive_patrol_preserved": return !f.patrolExposed && state.patrolIntegrity >= 35;
    case "alive_core_priority_preserved": return !f.structureDamaged && state.criticalStructureHealth >= 70;
    case "alive_deescalated": return m.tension <= 78 && m.trust >= 32;
    default: return false;
  }
}

function runConfiguration(configuration, scenario, profile, seed, C, baselineCache) {
  let state = C.expanded.applyProfile(scenario.id, seed, profile).state;
  const sourceStateHash = hash("zkab-state:v1:", state), records = [];
  while (state.flags.settlementAlive && state.quantum < state.horizonQuanta && !scenarioComplete(state, scenario)) {
    const decision = primeDecision(state, scenario, configuration.activeExperts, C, baselineCache);
    const replay = primeDecision(state, scenario, configuration.activeExperts, C, baselineCache);
    const deterministic = decision.actionKey === replay.actionKey && JSON.stringify(decision.ranking) === JSON.stringify(replay.ranking) && JSON.stringify(decision.expertOutputs) === JSON.stringify(replay.expertOutputs);
    const before = state.stateId;
    state = C.scenario.stepScenario(state, decision.actionKey).state;
    records.push(canonical({ configurationId: configuration.configurationId, sourceStateHash: before, activeExperts: configuration.activeExperts, expertOutputs: decision.expertOutputs, primeAction: decision.actionKey, primeRanking: decision.ranking, legalMask: decision.legalMask, searchVisits: decision.searchVisits, searchValue: decision.searchValue, confidence: decision.confidence, searchTimeMs: decision.searchTimeMs, totalLatencyMs: decision.totalLatencyMs, deterministicReplay: deterministic, baselineAction: decision.baselineAction, outcomeScore: objectiveScore(state, C), failureClass: null }));
  }
  return canonical({ configurationId: configuration.configurationId, scenarioId: scenario.id, profileId: profile.id, seed, sourceStateHash, objectiveComplete: scenarioComplete(state, scenario), settlementSurvived: state.flags.settlementAlive, finalScore: objectiveScore(state, C), records });
}

function classify(delta, changed, beneficial, harmful) {
  if (!changed) return "REDUNDANT";
  if (harmful > beneficial || delta < 0) return "HARMFUL";
  if (beneficial > 0 && harmful === 0 && delta > 0) return "BENEFICIAL";
  return "CONDITIONAL";
}

export function evaluateSentinelExpertAblation({ seedCount = 2, authenticEvidence = null, scenarioLimit = null, profileLimit = null } = {}) {
  const C = contracts(), configs = configurations(), runs = [], baselineCache = new Map();
  const scenarios = scenarioLimit == null ? C.scenario.SCENARIOS : C.scenario.SCENARIOS.slice(0, scenarioLimit);
  const profiles = profileLimit == null ? C.expanded.PROFILES : C.expanded.PROFILES.slice(0, profileLimit);
  for (const scenario of scenarios) for (const profile of profiles) for (let index = 0; index < seedCount; index++) {
    const seed = 170003 + index * 7919 + scenario.id.length * 101 + profile.id.length * 307;
    for (const configuration of configs) runs.push(runConfiguration(configuration, scenario, profile, seed, C, baselineCache));
  }
  const baselineByCase = new Map(runs.filter((run) => run.configurationId === "prime-only").map((run) => [`${run.scenarioId}|${run.profileId}|${run.seed}`, run]));
  const summaries = configs.map((configuration) => {
    const selected = runs.filter((run) => run.configurationId === configuration.configurationId);
    let changed = 0, beneficial = 0, harmful = 0, neutral = 0;
    for (const run of selected) {
      const base = baselineByCase.get(`${run.scenarioId}|${run.profileId}|${run.seed}`);
      if (run.records.some((row, index) => row.primeAction !== base.records[index]?.primeAction)) changed++;
      if (run.finalScore > base.finalScore) beneficial++; else if (run.finalScore < base.finalScore) harmful++; else neutral++;
    }
    const baseScores = selected.map((run) => baselineByCase.get(`${run.scenarioId}|${run.profileId}|${run.seed}`).finalScore);
    const selectedRecords = selected.flatMap((run) => run.records);
    const baselineRecords = selected.flatMap((run) => baselineByCase.get(`${run.scenarioId}|${run.profileId}|${run.seed}`).records);
    const delta = mean(selected.map((run) => run.finalScore)) - mean(baseScores);
    const meanLatencyMs = round(mean(selectedRecords.map((row) => row.totalLatencyMs)), 3);
    return canonical({ configurationId: configuration.configurationId, activeExperts: configuration.activeExperts, cases: selected.length, objectiveSuccessRate: round(selected.filter((run) => run.objectiveComplete).length / selected.length), survivalRate: round(selected.filter((run) => run.settlementSurvived).length / selected.length), meanOutcomeScore: mean(selected.map((run) => run.finalScore)), deltaDecisionQuality: round((beneficial - harmful) / selected.length), deltaOutcomeScore: delta, deltaSearchValue: round(mean(selectedRecords.map((row) => row.searchValue)) - mean(baselineRecords.map((row) => row.searchValue)), 9), deltaCalibration: round(mean(selectedRecords.map((row) => row.confidence)) - mean(baselineRecords.map((row) => row.confidence)), 9), deltaLatencyMs: round(meanLatencyMs - mean(baselineRecords.map((row) => row.totalLatencyMs)), 3), actionChangedCount: changed, beneficialChangeCount: beneficial, harmfulChangeCount: harmful, neutralChangeCount: neutral, meanLatencyMs, classification: configuration.activeExperts.length === 1 ? classify(delta, changed, beneficial, harmful) : null });
  });
  const ranked = summaries.filter((row) => row.configurationId !== "prime-only").slice().sort((a, b) => b.deltaOutcomeScore - a.deltaOutcomeScore || b.objectiveSuccessRate - a.objectiveSuccessRate || a.meanLatencyMs - b.meanLatencyMs || a.configurationId.localeCompare(b.configurationId));
  const authenticUsable = Array.isArray(authenticEvidence?.states) && authenticEvidence.states.length > 0 && authenticEvidence.states.every((state) => state.canonicalState && state.legalMask && state.actualOutcome);
  const singles = ranked.filter((row) => row.activeExperts.length === 1), pairs = ranked.filter((row) => row.activeExperts.length === 2), triples = ranked.filter((row) => row.activeExperts.length === 3);
  const singleDelta = new Map(singles.map((row) => [row.activeExperts[0], row.deltaOutcomeScore]));
  const synergyGroups = pairs.filter((row) => row.deltaOutcomeScore > row.activeExperts.reduce((sum, id) => sum + (singleDelta.get(id) || 0), 0)).map((row) => row.configurationId);
  const interferenceGroups = pairs.filter((row) => row.deltaOutcomeScore < Math.max(...row.activeExperts.map((id) => singleDelta.get(id) || 0))).map((row) => row.configurationId);
  const redundantGroups = pairs.filter((row) => row.actionChangedCount === 0 || row.deltaOutcomeScore === Math.max(...row.activeExperts.map((id) => singleDelta.get(id) || 0))).map((row) => row.configurationId);
  const body = canonical({
    schemaVersion: 1, contractId: "zeknova-sentinel-expert-ablation-v1", authority: SENTINEL_EXPERT_ABLATION_AUTHORITY,
    primeOnlyBaselineComplete: true, expertsTested: DECISION_EXPERTS.map((expert) => expert.id), scenariosTested: scenarios.length * profiles.length * seedCount,
    deterministicReplayPass: runs.every((run) => run.records.every((row) => row.deterministicReplay)), configurationCount: configs.length,
    evidenceClass: "FROZEN_CERTIFIED_FIXTURE_ONLY", authenticScenarioEvidenceUsable: authenticUsable,
    summaries, bestSingleExpert: singles[0]?.configurationId || null, bestPair: pairs[0]?.configurationId || null, bestThreeExpertTeam: triples[0]?.configurationId || null, bestOverallTeam: ranked[0]?.configurationId || null,
    bestTeamOutcomeDelta: ranked[0]?.deltaOutcomeScore || 0, bestTeamLatencyDeltaMs: round((ranked[0]?.meanLatencyMs || 0) - (summaries.find((row) => row.configurationId === "prime-only")?.meanLatencyMs || 0), 3),
    synergyGroups, redundantGroups, interferenceGroups,
    routingPolicyRecommendation: authenticUsable ? "MEASURED_FEATURE_ROUTER_PENDING_VALIDATION" : "NO_PRODUCTION_ROUTING_POLICY_WITHOUT_CANONICAL_AUTHENTIC_STATES",
    primeQualityImproved: authenticUsable && (ranked[0]?.deltaOutcomeScore || 0) > 0,
    evidenceSufficient: authenticUsable,
    picassoDecisionCredit: false,
    r1CanaryFailureRootCause: "INSUFFICIENT_BOUND_FAILURE_EVIDENCE; fallback occurred after hash validation, but the consumed run did not expose its terminal failure event for certified attribution",
    r1CanaryRetryRecommendation: "REJECT",
    primeR1Authorized: false, primeLiveExecutionEnabled: false, canDispatch: false, gobanAuthority: "R0_EVALUATION",
  });
  return Object.freeze({ ...body, reportId: hash("zkab-report:v1:", body) });
}
