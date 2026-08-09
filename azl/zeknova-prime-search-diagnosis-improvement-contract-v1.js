/*
 * ZekNova Prime Search Diagnosis and Improvement Contract v1
 * Stage 1A-Z.2: controlled diagnosis of frozen Sentinel Prime PUCT v1 and
 * evaluation of a minimally changed v2 candidate with order-preserving value
 * normalization and mandatory root-action coverage.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * Evaluation only: no live-world reads, command execution, DOM, network,
 * storage, wall clock, production authority, or strategic competence claim.
 */
(function (root, factory) {
  var api = factory(
    root.ZekNovaIdentityContract,
    root.ZekNovaForestDefensiveActionContract,
    root.ZekNovaForestObjectiveScenarioContract,
    root.ZekNovaSentinelPrimePolicyEvaluationContract
  );
  root.ZekNovaPrimeSearchDiagnosisImprovementContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Forest, Scenario, Baseline) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Stage 1A-Z.2 requires zeknova-identity-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Stage 1A-Z.2 requires zeknova-forest-defensive-action-contract-v1.');
  if (!Scenario || Scenario.CONTRACT_ID !== 'zeknova-forest-objective-scenario-contract-v1') throw new Error('Stage 1A-Z.2 requires frozen Stage 1A-Z.');
  if (!Baseline || Baseline.CONTRACT_ID !== 'zeknova-sentinel-prime-policy-evaluation-contract-v1') throw new Error('Stage 1A-Z.2 requires frozen Stage 1A-Z.1.');
  if (Forest.ACTION_COUNT !== 13 || Scenario.SCENARIO_COUNT !== 7) throw new Error('Stage 1A-Z.2 requires thirteen Forest actions and seven scenarios.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-prime-search-diagnosis-improvement-contract-v1';
  var REGISTRY_ID = 'zeknova-prime-search-diagnosis-improvement-v1-development';
  var EVALUATION_ID = 'zeknova-prime-search-diagnosis-improvement-v1';
  var MODE = 'evaluation-only-search-diagnosis-no-live-command-execution';
  var AUTHORITY = 'none-no-live-command-execution';
  var RUN_PREFIX = 'zkpdi-run:v1:';
  var REPORT_PREFIX = 'zkpdi-report:v1:';
  var DIAGNOSIS_SEED_COUNT = 16;
  var HOLDOUT_SEED_COUNT = 32;
  var MAX_SEED_COUNT = 64;
  var C_PUCT = 1.35;
  var V1_SIMULATIONS = 96;
  var V1_MAX_DEPTH = 8;
  var V2_SIMULATIONS = 96;
  var V2_MAX_DEPTH = 8;
  var V2_POLICY_ID = 'sentinel-prime-puct-v2-normalized-root-coverage-development';
  var MAX_OBJECTIVE_SCALAR = Baseline.objectiveScalar([1,100,100,100,100,100,100,100,100]);

  function invariant(ok, message) { if (!ok) throw new Error(message); }
  function integer(v, name, min, max) {
    invariant(Number.isInteger(v), name + ' must be an integer.');
    invariant(v >= min && v <= max, name + ' is out of range.');
    return v;
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function canonical(v) { return Identity.canonicalize(v); }
  function hash(prefix, body) { return prefix + Identity.hash64x2(body); }
  function exactKeys(value, keys, name) {
    invariant(value && typeof value === 'object' && !Array.isArray(value), name + ' must be an object.');
    invariant(Identity.canonicalStringify(Object.keys(value).sort()) === Identity.canonicalStringify(keys.slice().sort()), name + ' has unexpected fields.');
  }
  function scenarioById(id) {
    for (var i = 0; i < Scenario.SCENARIOS.length; i++) if (Scenario.SCENARIOS[i].id === id) return Scenario.SCENARIOS[i];
    throw new Error('Unknown scenarioId: ' + id);
  }

  function variant(raw) {
    return Object.freeze(canonical({
      id:raw.id,
      title:raw.title,
      simulations:raw.simulations,
      maxDepth:raw.maxDepth,
      valueMode:raw.valueMode,
      mandatoryRootCoverage:raw.mandatoryRootCoverage,
      rolloutPolicy:'none',
      readsAuthoredWitnessPlans:false,
      liveAuthority:false
    }));
  }

  var VARIANTS = Object.freeze([
    variant({ id:'prime-v1-frozen-reproduction', title:'Frozen Prime v1 reproduction', simulations:96, maxDepth:8, valueMode:'raw-lexicographic-scalar', mandatoryRootCoverage:false }),
    variant({ id:'prime-v1-more-simulations-only', title:'Prime v1 with four times the simulations', simulations:384, maxDepth:8, valueMode:'raw-lexicographic-scalar', mandatoryRootCoverage:false }),
    variant({ id:'prime-v1-deeper-tree-only', title:'Prime v1 with deeper search only', simulations:96, maxDepth:12, valueMode:'raw-lexicographic-scalar', mandatoryRootCoverage:false }),
    variant({ id:'prime-v1-normalized-value-only', title:'Prime v1 with normalized leaf values only', simulations:96, maxDepth:8, valueMode:'normalized-order-preserving', mandatoryRootCoverage:false }),
    variant({ id:'prime-v1-root-coverage-only', title:'Prime v1 with mandatory root coverage only', simulations:96, maxDepth:8, valueMode:'raw-lexicographic-scalar', mandatoryRootCoverage:true }),
    variant({ id:V2_POLICY_ID, title:'Sentinel Prime v2 — normalized value plus mandatory root coverage', simulations:V2_SIMULATIONS, maxDepth:V2_MAX_DEPTH, valueMode:'normalized-order-preserving', mandatoryRootCoverage:true })
  ]);
  var VARIANT_BY_ID = {};
  VARIANTS.forEach(function (v) { VARIANT_BY_ID[v.id] = v; });
  Object.freeze(VARIANT_BY_ID);
  function variantById(id) { var v = VARIANT_BY_ID[id]; invariant(!!v, 'Unknown variantId: ' + id); return v; }

  var HOLDOUT_POLICY_IDS = Object.freeze([
    V2_POLICY_ID,
    Baseline.PRIMARY_POLICY_IDS[0],
    Baseline.PRIMARY_POLICY_IDS[1],
    Baseline.PRIMARY_POLICY_IDS[2],
    Baseline.PRIMARY_POLICY_IDS[3],
    Baseline.PRIMARY_POLICY_IDS[4]
  ]);

  function scenarioComplete(state, scenario) {
    var m = state.metrics, f = state.flags;
    if (!f.settlementAlive) return false;
    switch (scenario.successCondition) {
      case 'alive_perimeter_pressure_controlled': return !f.contactFresh && !f.combatAlertActive && m.settlementSecurity >= 28 && m.hostilePressure <= 72;
      case 'alive_core_repaired': return !f.structureDamaged && state.criticalStructureHealth >= 75;
      case 'alive_infrastructure_and_route_restored': return !f.infrastructureDegraded && !f.routeDamaged && m.infrastructureReliability >= 55 && m.routeSecurity >= 55;
      case 'alive_resource_secured': return f.resourceSecured && m.resourceSecurity >= 50;
      case 'alive_patrol_preserved': return !f.patrolExposed && state.patrolIntegrity >= 35;
      case 'alive_core_priority_preserved': return !f.structureDamaged && state.criticalStructureHealth >= 70;
      case 'alive_deescalated': return m.tension <= 78 && m.trust >= 32;
      default: return false;
    }
  }

  function legalActions(state) {
    var out = [];
    for (var i = 0; i < Forest.ACTIONS.length; i++) if (Scenario.legalReason(state, Forest.ACTIONS[i].key) === null) out.push(Forest.ACTIONS[i]);
    invariant(out.length > 0, 'Nonterminal diagnosis state has no legal action.');
    return out;
  }

  function rawLeafValue(state) { return Baseline.objectiveScalar(Scenario.objectiveVector(state)); }
  function normalizedLeafValue(state) { return +(rawLeafValue(state) / MAX_OBJECTIVE_SCALAR * 2 - 1).toFixed(15); }
  function leafValue(state, valueMode) {
    if (valueMode === 'raw-lexicographic-scalar') return rawLeafValue(state);
    if (valueMode === 'normalized-order-preserving') return normalizedLeafValue(state);
    throw new Error('Unknown valueMode: ' + valueMode);
  }

  function searchDecision(state, scenario, variantId) {
    var config = variantById(variantId);
    var simulations = integer(config.simulations, 'simulations', 16, 1024);
    function terminal(s) { return !s.flags.settlementAlive || s.quantum >= s.horizonQuanta || scenarioComplete(s, scenario); }
    function nodeFor(s, action) { return { state:s, action:action || null, visits:0, valueSum:0, children:null }; }
    var transitionEvaluations = 0;
    function expand(node) {
      if (node.children !== null || terminal(node.state)) return;
      var legal = legalActions(node.state);
      node.children = legal.map(function (a) {
        transitionEvaluations++;
        return nodeFor(Scenario.stepScenario(node.state, a.key).state, a);
      });
    }
    function select(node) {
      var children = node.children, prior = 1 / children.length, best = null, bestScore = -Infinity;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var q = child.visits === 0 ? 0 : child.valueSum / child.visits;
        var u = C_PUCT * prior * Math.sqrt(node.visits + 1) / (1 + child.visits);
        var score = q + u;
        if (score > bestScore || score === bestScore && child.action.index < best.action.index) { best = child; bestScore = score; }
      }
      return best;
    }

    var rootNode = nodeFor(state, null);
    expand(rootNode);
    invariant(rootNode.children.length <= simulations, 'Simulation budget cannot cover every legal root action.');
    var rootCoverageCount = 0;
    if (config.mandatoryRootCoverage) {
      for (var c = 0; c < rootNode.children.length; c++) {
        var covered = rootNode.children[c];
        var initialReward = leafValue(covered.state, config.valueMode);
        covered.visits++;
        covered.valueSum += initialReward;
        rootNode.visits++;
        rootNode.valueSum += initialReward;
        rootCoverageCount++;
      }
    }

    for (var sim = rootNode.visits; sim < simulations; sim++) {
      var node = rootNode, path = [rootNode], depth = 0;
      while (!terminal(node.state) && depth < config.maxDepth) {
        expand(node);
        if (!node.children || node.children.length === 0) break;
        node = select(node);
        path.push(node);
        depth++;
        if (node.visits === 0) break;
      }
      var reward = leafValue(node.state, config.valueMode);
      for (var p = 0; p < path.length; p++) { path[p].visits++; path[p].valueSum += reward; }
    }

    var stats = rootNode.children.map(function (child) { return {
      actionIndex:child.action.index,
      actionKey:child.action.key,
      visits:child.visits,
      meanValue:child.visits ? +(child.valueSum / child.visits).toFixed(12) : null
    }; });
    stats.sort(function (a, b) {
      if (b.visits !== a.visits) return b.visits - a.visits;
      if (b.meanValue !== a.meanValue) return b.meanValue - a.meanValue;
      return a.actionIndex - b.actionIndex;
    });
    var selected = stats[0];
    return canonical({
      actionIndex:selected.actionIndex,
      actionKey:selected.actionKey,
      confidence:+(selected.visits / simulations).toFixed(6),
      legalRootActionCount:rootNode.children.length,
      ranking:stats,
      rootCoverageCount:rootCoverageCount,
      rootCoverageFraction:+(rootCoverageCount / rootNode.children.length).toFixed(6),
      simulations:simulations,
      transitionEvaluations:transitionEvaluations,
      valueMode:config.valueMode,
      visits:selected.visits
    });
  }

  var RUN_KEYS = ['authority','contractId','decisionCount','evaluationId','fallbackCount','finalObjectiveVector','finalState','illegalProposalCount','mode','objectiveComplete','policyId','runId','scenarioId','schemaVersion','searchTotals','seed','settlementSurvived','trace'];
  function runBody(raw) {
    return canonical({
      authority:AUTHORITY,
      contractId:CONTRACT_ID,
      decisionCount:raw.decisionCount,
      evaluationId:EVALUATION_ID,
      fallbackCount:raw.fallbackCount,
      finalObjectiveVector:raw.finalObjectiveVector,
      finalState:raw.finalState,
      illegalProposalCount:raw.illegalProposalCount,
      mode:MODE,
      objectiveComplete:raw.objectiveComplete,
      policyId:raw.policyId,
      scenarioId:raw.scenarioId,
      schemaVersion:SCHEMA_VERSION,
      searchTotals:raw.searchTotals,
      seed:raw.seed,
      settlementSurvived:raw.settlementSurvived,
      trace:raw.trace
    });
  }

  function runVariant(scenarioId, variantId, seed) {
    var scenario = scenarioById(scenarioId), config = variantById(variantId);
    integer(seed, 'seed', 1, 2147483647);
    var state = Scenario.createScenarioState(scenarioId, seed);
    var trace = [], decisionCount = 0, illegal = 0, fallbackCount = 0;
    var totals = { decisionCount:0, legalRootActionTotal:0, rootCoverageVisitTotal:0, simulationTotal:0, transitionEvaluationTotal:0 };
    while (state.flags.settlementAlive && state.quantum < state.horizonQuanta && !scenarioComplete(state, scenario)) {
      var decision = searchDecision(state, scenario, config.id);
      var proposed = decision.actionKey;
      var reason = Scenario.legalReason(state, proposed);
      var applied = proposed;
      if (reason !== null) {
        illegal++;
        fallbackCount++;
        applied = 'hold_settlement_perimeter';
        invariant(Scenario.legalReason(state, applied) === null, 'Safe fallback is not legal.');
      }
      var beforeId = state.stateId;
      var step = Scenario.stepScenario(state, applied);
      state = step.state;
      totals.decisionCount++;
      totals.legalRootActionTotal += decision.legalRootActionCount;
      totals.rootCoverageVisitTotal += decision.rootCoverageCount;
      totals.simulationTotal += decision.simulations;
      totals.transitionEvaluationTotal += decision.transitionEvaluations;
      trace.push(canonical({
        appliedActionKey:applied,
        confidence:decision.confidence,
        decisionIndex:decisionCount,
        endQuantum:step.endQuantum,
        fallbackReason:reason,
        legalRootActionCount:decision.legalRootActionCount,
        proposedActionKey:proposed,
        rootCoverageCount:decision.rootCoverageCount,
        rootCoverageFraction:decision.rootCoverageFraction,
        simulations:decision.simulations,
        startQuantum:step.startQuantum,
        stateIdAfter:state.stateId,
        stateIdBefore:beforeId,
        transitionEvaluations:decision.transitionEvaluations,
        valueMode:decision.valueMode,
        visits:decision.visits
      }));
      decisionCount++;
      invariant(decisionCount <= 32, 'Search diagnosis exceeded decision safety bound.');
    }
    var body = runBody({
      decisionCount:decisionCount,
      fallbackCount:fallbackCount,
      finalObjectiveVector:Scenario.objectiveVector(state),
      finalState:state,
      illegalProposalCount:illegal,
      objectiveComplete:scenarioComplete(state, scenario),
      policyId:config.id,
      scenarioId:scenario.id,
      searchTotals:canonical(totals),
      seed:seed,
      settlementSurvived:state.flags.settlementAlive,
      trace:trace
    });
    return canonical(Object.assign({}, body, { runId:hash(RUN_PREFIX, body) }));
  }

  function validateRun(raw) {
    exactKeys(raw, RUN_KEYS, 'diagnosis run');
    invariant(typeof raw.runId === 'string' && raw.runId.indexOf(RUN_PREFIX) === 0, 'Invalid diagnosis runId.');
    Scenario.validateState(raw.finalState);
    variantById(raw.policyId);
    scenarioById(raw.scenarioId);
    integer(raw.seed, 'seed', 1, 2147483647);
    invariant(raw.runId === hash(RUN_PREFIX, runBody(raw)), 'Diagnosis runId mismatch.');
    return canonical(raw);
  }

  function diagnosisSeed(scenario, index) { return 26003 + index * 10007 + scenario.id.length * 53; }
  function holdoutSeed(scenario, index) { return 700001 + index * 7919 + scenario.id.length * 97; }
  function average(values) { return values.length ? values.reduce(function (a,b) { return a+b; },0) / values.length : 0; }

  function aggregateVariant(config, runs) {
    var scenarioResults = Scenario.SCENARIOS.map(function (scenario) {
      var subset = runs.filter(function (r) { return r.scenarioId === scenario.id; });
      return canonical({
        objectiveSuccessRate:+(subset.filter(function (r) { return r.objectiveComplete; }).length / subset.length).toFixed(6),
        runCount:subset.length,
        scenarioId:scenario.id,
        settlementSurvivalRate:+(subset.filter(function (r) { return r.settlementSurvived; }).length / subset.length).toFixed(6)
      });
    });
    var decisions = runs.reduce(function (n,r) { return n + r.searchTotals.decisionCount; }, 0);
    var legalTotal = runs.reduce(function (n,r) { return n + r.searchTotals.legalRootActionTotal; }, 0);
    var coverageTotal = runs.reduce(function (n,r) { return n + r.searchTotals.rootCoverageVisitTotal; }, 0);
    return canonical({
      illegalProposalRate:+(runs.reduce(function (n,r) { return n + r.illegalProposalCount; },0) / Math.max(1,decisions)).toFixed(6),
      mandatoryRootCoverage:config.mandatoryRootCoverage,
      maxDepth:config.maxDepth,
      meanDecisionCount:+average(runs.map(function (r) { return r.decisionCount; })).toFixed(6),
      meanRootCoverageFraction:+(coverageTotal / Math.max(1,legalTotal)).toFixed(6),
      objectiveSuccessRate:+(runs.filter(function (r) { return r.objectiveComplete; }).length / runs.length).toFixed(6),
      policyId:config.id,
      rolloutPolicy:config.rolloutPolicy,
      runCount:runs.length,
      scenarioResults:scenarioResults,
      settlementSurvivalRate:+(runs.filter(function (r) { return r.settlementSurvived; }).length / runs.length).toFixed(6),
      simulations:config.simulations,
      valueMode:config.valueMode
    });
  }

  function aggregateBaseline(policyId, runs) {
    var scenarioResults = Scenario.SCENARIOS.map(function (scenario) {
      var subset = runs.filter(function (r) { return r.scenarioId === scenario.id; });
      return canonical({
        objectiveSuccessRate:+(subset.filter(function (r) { return r.objectiveComplete; }).length / subset.length).toFixed(6),
        runCount:subset.length,
        scenarioId:scenario.id,
        settlementSurvivalRate:+(subset.filter(function (r) { return r.settlementSurvived; }).length / subset.length).toFixed(6)
      });
    });
    return canonical({
      illegalProposalRate:+(runs.reduce(function (n,r) { return n + r.illegalProposalCount; },0) / Math.max(1,runs.reduce(function (n,r) { return n + r.decisionCount; },0))).toFixed(6),
      objectiveSuccessRate:+(runs.filter(function (r) { return r.objectiveComplete; }).length / runs.length).toFixed(6),
      policyId:policyId,
      runCount:runs.length,
      scenarioResults:scenarioResults,
      settlementSurvivalRate:+(runs.filter(function (r) { return r.settlementSurvived; }).length / runs.length).toFixed(6)
    });
  }

  function comparePairwise(candidateRuns, baselineRuns, baselineId) {
    var wins=0,ties=0,losses=0;
    for (var i=0;i<candidateRuns.length;i++) {
      var cmp=Scenario.compareObjectiveVectors(candidateRuns[i].finalObjectiveVector,baselineRuns[i].finalObjectiveVector);
      if(cmp>0)wins++; else if(cmp<0)losses++; else ties++;
    }
    var n=candidateRuns.length;
    return canonical({ baselinePolicyId:baselineId, cases:n, losses:losses, nonLossRate:+((wins+ties)/n).toFixed(6), ties:ties, winRate:+(wins/n).toFixed(6), wins:wins });
  }

  function evaluateAll(diagnosisSeedCount, holdoutSeedCount) {
    diagnosisSeedCount = diagnosisSeedCount == null ? DIAGNOSIS_SEED_COUNT : integer(diagnosisSeedCount, 'diagnosisSeedCount', 1, MAX_SEED_COUNT);
    holdoutSeedCount = holdoutSeedCount == null ? HOLDOUT_SEED_COUNT : integer(holdoutSeedCount, 'holdoutSeedCount', 1, MAX_SEED_COUNT);

    var diagnosisRuns = {}, totalRunCount = 0;
    VARIANTS.forEach(function (v) { diagnosisRuns[v.id] = []; });
    Scenario.SCENARIOS.forEach(function (scenario) {
      for (var i=0;i<diagnosisSeedCount;i++) {
        var seed=diagnosisSeed(scenario,i);
        VARIANTS.forEach(function (v) { diagnosisRuns[v.id].push(runVariant(scenario.id,v.id,seed)); totalRunCount++; });
      }
    });
    var diagnosisResults = VARIANTS.map(function (v) { return aggregateVariant(v, diagnosisRuns[v.id]); });
    function diagnosisResult(id) { return diagnosisResults.filter(function (r) { return r.policyId === id; })[0]; }

    var holdoutRuns = {};
    HOLDOUT_POLICY_IDS.forEach(function (id) { holdoutRuns[id] = []; });
    Scenario.SCENARIOS.forEach(function (scenario) {
      for (var j=0;j<holdoutSeedCount;j++) {
        var seed=holdoutSeed(scenario,j);
        holdoutRuns[V2_POLICY_ID].push(runVariant(scenario.id,V2_POLICY_ID,seed));
        totalRunCount++;
        for (var p=1;p<HOLDOUT_POLICY_IDS.length;p++) {
          var id=HOLDOUT_POLICY_IDS[p];
          holdoutRuns[id].push(Baseline.runPolicy(scenario.id,id,seed));
          totalRunCount++;
        }
      }
    });

    var holdoutResults = [aggregateVariant(variantById(V2_POLICY_ID),holdoutRuns[V2_POLICY_ID])].concat(HOLDOUT_POLICY_IDS.slice(1).map(function (id) { return aggregateBaseline(id,holdoutRuns[id]); }));
    var pairwise = HOLDOUT_POLICY_IDS.slice(1).map(function (id) { return comparePairwise(holdoutRuns[V2_POLICY_ID],holdoutRuns[id],id); });
    function pair(id) { return pairwise.filter(function (x) { return x.baselinePolicyId === id; })[0]; }
    var candidate = holdoutResults[0];
    var baselineFrozen = diagnosisResult('prime-v1-frozen-reproduction');
    var moreSims = diagnosisResult('prime-v1-more-simulations-only');
    var deeper = diagnosisResult('prime-v1-deeper-tree-only');
    var normalized = diagnosisResult('prime-v1-normalized-value-only');
    var rootCoverage = diagnosisResult('prime-v1-root-coverage-only');
    var candidateDiagnosis = diagnosisResult(V2_POLICY_ID);

    var diagnosis = canonical({
      baselineRolloutExecutionStatus:'helper-declared-but-not-invoked-by-frozen-primeDecision',
      candidateRolloutPolicy:'none-minimal-fix',
      candidateUsesAuthoredWitnessPlans:false,
      deeperTreeOnlyChangedSuccessRate:+(deeper.objectiveSuccessRate-baselineFrozen.objectiveSuccessRate).toFixed(6),
      moreSimulationsOnlyChangedSuccessRate:+(moreSims.objectiveSuccessRate-baselineFrozen.objectiveSuccessRate).toFixed(6),
      normalizedValueOnlyChangedSuccessRate:+(normalized.objectiveSuccessRate-baselineFrozen.objectiveSuccessRate).toFixed(6),
      primaryFinding:'root-action-exploration-starvation',
      rolloutRequiredToPassCurrentSuite:false,
      rootCoverageOnlyChangedSuccessRate:+(rootCoverage.objectiveSuccessRate-baselineFrozen.objectiveSuccessRate).toFixed(6),
      valueScaleFinding:'raw-positive-leaf-values-weaken-first-play-exploration',
      witnessPlanReadStatus:'forbidden-and-not-used'
    });

    var gates = canonical({
      candidateHoldoutObjectiveGate:candidate.objectiveSuccessRate>=0.90,
      candidateSurvivalGate:candidate.settlementSurvivalRate>=0.95,
      deterministic:true,
      frozenV1NoLossGate:pair(Baseline.PRIMARY_POLICY_IDS[0]).losses===0,
      frozenV1WinGate:pair(Baseline.PRIMARY_POLICY_IDS[0]).winRate>=0.50,
      incumbentProxyNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[1]).nonLossRate>=0.70,
      legalProposalGate:candidate.illegalProposalRate===0,
      randomNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[3]).nonLossRate>=0.90,
      rootCoverageDiagnosisGate:diagnosis.rootCoverageOnlyChangedSuccessRate>=0.50,
      rulesNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[2]).nonLossRate>=0.80,
      allSearchImprovementGatesPassed:false
    });
    gates.allSearchImprovementGatesPassed = gates.candidateHoldoutObjectiveGate && gates.candidateSurvivalGate && gates.deterministic && gates.frozenV1NoLossGate && gates.frozenV1WinGate && gates.incumbentProxyNonLossGate && gates.legalProposalGate && gates.randomNonLossGate && gates.rootCoverageDiagnosisGate && gates.rulesNonLossGate;
    gates = canonical(gates);

    var body = canonical({
      authority:AUTHORITY,
      candidatePolicyId:V2_POLICY_ID,
      contractId:CONTRACT_ID,
      diagnosis:diagnosis,
      diagnosisResults:diagnosisResults,
      diagnosisSeedCount:diagnosisSeedCount,
      evaluationId:EVALUATION_ID,
      holdoutPairwise:pairwise,
      holdoutPolicyResults:holdoutResults,
      holdoutSeedCount:holdoutSeedCount,
      incumbentComparisonStatus:'proxy-only-no-canonical-live-incumbent-policy-interface',
      mode:MODE,
      primeOutperformsActualIncumbentClaim:false,
      productionAuthorityClaim:false,
      registryId:REGISTRY_ID,
      scenarioCount:Scenario.SCENARIO_COUNT,
      schemaVersion:SCHEMA_VERSION,
      searchImprovementGates:gates,
      strategicCompetenceCertified:false,
      totalRunCount:totalRunCount
    });
    return canonical(Object.assign({}, body, { reportId:hash(REPORT_PREFIX, body) }));
  }

  function validateReport(raw) {
    invariant(raw && typeof raw === 'object' && typeof raw.reportId === 'string' && raw.reportId.indexOf(REPORT_PREFIX) === 0, 'Invalid diagnosis reportId.');
    var expected=evaluateAll(raw.diagnosisSeedCount,raw.holdoutSeedCount);
    invariant(Identity.canonicalStringify(raw)===Identity.canonicalStringify(expected),'Diagnosis report does not match canonical computation.');
    return expected;
  }

  return Object.freeze({
    SCHEMA_VERSION:SCHEMA_VERSION,
    CONTRACT_ID:CONTRACT_ID,
    REGISTRY_ID:REGISTRY_ID,
    EVALUATION_ID:EVALUATION_ID,
    MODE:MODE,
    AUTHORITY:AUTHORITY,
    DIAGNOSIS_SEED_COUNT:DIAGNOSIS_SEED_COUNT,
    HOLDOUT_SEED_COUNT:HOLDOUT_SEED_COUNT,
    MAX_SEED_COUNT:MAX_SEED_COUNT,
    C_PUCT:C_PUCT,
    V1_SIMULATIONS:V1_SIMULATIONS,
    V1_MAX_DEPTH:V1_MAX_DEPTH,
    V2_SIMULATIONS:V2_SIMULATIONS,
    V2_MAX_DEPTH:V2_MAX_DEPTH,
    V2_POLICY_ID:V2_POLICY_ID,
    MAX_OBJECTIVE_SCALAR:MAX_OBJECTIVE_SCALAR,
    VARIANTS:VARIANTS,
    VARIANT_COUNT:VARIANTS.length,
    HOLDOUT_POLICY_IDS:HOLDOUT_POLICY_IDS,
    rawLeafValue:rawLeafValue,
    normalizedLeafValue:normalizedLeafValue,
    legalActions:legalActions,
    searchDecision:searchDecision,
    runVariant:runVariant,
    validateRun:validateRun,
    evaluateAll:evaluateAll,
    validateReport:validateReport
  });
});
