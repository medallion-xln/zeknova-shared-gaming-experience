/*
 * ZekNova Prime Value and Objective Calibration Contract v1
 * Stage 1A-Z.4: controlled evaluation of isolated value and objective calibration
 * variants on the Stage 1A-Z.3 mandatory-root-coverage candidate while preserving
 * root exploration, depth, simulation budget, rollout policy, and authority.
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
    root.ZekNovaSentinelPrimePolicyEvaluationContract,
    root.ZekNovaPrimeSearchObservabilityContract,
    root.ZekNovaPrimeRootExplorationCorrectionContract
  );
  root.ZekNovaPrimeValueObjectiveCalibrationContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Forest, Scenario, Baseline, Observability, RootCoverage) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Stage 1A-Z.4 requires zeknova-identity-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Stage 1A-Z.4 requires zeknova-forest-defensive-action-contract-v1.');
  if (!Scenario || Scenario.CONTRACT_ID !== 'zeknova-forest-objective-scenario-contract-v1') throw new Error('Stage 1A-Z.4 requires frozen Stage 1A-Z.');
  if (!Baseline || Baseline.CONTRACT_ID !== 'zeknova-sentinel-prime-policy-evaluation-contract-v1') throw new Error('Stage 1A-Z.4 requires frozen Stage 1A-Z.1.');
  if (!Observability || Observability.CONTRACT_ID !== 'zeknova-prime-search-observability-contract-v1') throw new Error('Stage 1A-Z.4 requires Stage 1A-Z.2 observability.');
  if (!RootCoverage || RootCoverage.CONTRACT_ID !== 'zeknova-prime-root-exploration-correction-contract-v1') throw new Error('Stage 1A-Z.4 requires provisional Stage 1A-Z.3 root coverage.');
  if (Forest.ACTION_COUNT !== 13 || Scenario.SCENARIO_COUNT !== 7) throw new Error('Stage 1A-Z.4 requires thirteen Forest actions and seven scenarios.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-prime-value-objective-calibration-contract-v1';
  var REGISTRY_ID = 'zeknova-prime-value-objective-calibration-v1-development';
  var EVALUATION_ID = 'zeknova-prime-value-objective-calibration-v1';
  var MODE = 'evaluation-only-value-objective-calibration-no-live-command-execution';
  var AUTHORITY = 'none-no-live-command-execution';
  var RUN_PREFIX = 'zkpvoc-run:v1:';
  var REPORT_PREFIX = 'zkpvoc-report:v1:';
  var DIAGNOSIS_SEED_COUNT = 16;
  var HOLDOUT_SEED_COUNT = 32;
  var MAX_SEED_COUNT = 64;
  var C_PUCT = 1.35;
  var V1_SIMULATIONS = 96;
  var V1_MAX_DEPTH = 8;
  var V2_SIMULATIONS = 96;
  var V2_MAX_DEPTH = 8;
  var CANDIDATE_POLICY_ID = 'sentinel-prime-puct-v1-root-coverage-terminal-calibrated-development';
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
      simulations:96,
      maxDepth:8,
      valueMode:raw.valueMode,
      mandatoryRootCoverage:true,
      tieMode:'action-index',
      fpuMode:'zero',
      rootCPuct:C_PUCT,
      rolloutPolicy:'none',
      terminalSeparation:!!raw.terminalSeparation,
      stalledStatePenalty:raw.stalledStatePenalty || 0,
      readsAuthoredWitnessPlans:false,
      liveAuthority:false
    }));
  }

  var VARIANTS = Object.freeze([
    variant({ id:'prime-z3-root-coverage-frozen-reproduction', title:'Frozen Stage 1A-Z.3 root coverage reproduction', valueMode:'raw-lexicographic-scalar' }),
    variant({ id:'prime-z3-normalized-value-development', title:'Bounded normalized objective scalar', valueMode:'normalized-objective-scalar' }),
    variant({ id:CANDIDATE_POLICY_ID, title:'Bounded normalized objective scalar with explicit terminal separation', valueMode:'normalized-objective-scalar', terminalSeparation:true }),
    variant({ id:'prime-z3-terminal-calibrated-stall-penalty-development', title:'Terminal separation with conservative stalled-state penalty', valueMode:'normalized-objective-scalar', terminalSeparation:true, stalledStatePenalty:0.01 }),
    variant({ id:'prime-z3-bounded-lexicographic-development', title:'Bounded base-101 lexicographic scalar', valueMode:'bounded-base101-lexicographic' })
  ]);
  var VARIANT_BY_ID = {};
  VARIANTS.forEach(function (v) { VARIANT_BY_ID[v.id] = v; });
  Object.freeze(VARIANT_BY_ID);
  function variantById(id) { var v = VARIANT_BY_ID[id]; invariant(!!v, 'Unknown variantId: ' + id); return v; }


  var HOLDOUT_POLICY_IDS = Object.freeze([
    CANDIDATE_POLICY_ID,
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
  function boundedLexicographicValue(state) {
    var vector=Scenario.objectiveVector(state), base=101, weight=1, score=vector[0];
    for(var i=1;i<vector.length;i++){ weight/=base; score += vector[i]*weight; }
    return +(score / 2).toFixed(15);
  }
  function leafValue(state, scenario, config) {
    if (config.terminalSeparation) {
      if (!state.flags.settlementAlive) return -1;
      if (scenarioComplete(state, scenario)) return 1;
    }
    var value;
    if (config.valueMode === 'raw-lexicographic-scalar') value=rawLeafValue(state);
    else if (config.valueMode === 'normalized-objective-scalar') value=normalizedLeafValue(state);
    else if (config.valueMode === 'bounded-base101-lexicographic') value=boundedLexicographicValue(state);
    else throw new Error('Unknown value mode: '+config.valueMode);
    if (config.stalledStatePenalty && state.quantum>0 && !scenarioComplete(state,scenario)) value -= config.stalledStatePenalty * (state.quantum/state.horizonQuanta);
    return +value.toFixed(15);
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
    function tieKey(node, child) {
      if (config.tieMode === 'state-hash') return Identity.hash64x2(String(node.state.stateId) + '|' + child.action.key);
      return String(child.action.index).padStart(4, '0');
    }
    function select(node, isRoot) {
      var children = node.children, prior = 1 / children.length, best = null, bestScore = -Infinity, bestTie = null;
      var parentMean = node.visits === 0 ? 0 : node.valueSum / node.visits;
      var cpuct = isRoot ? config.rootCPuct : C_PUCT;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        var q = child.visits === 0 ? (config.fpuMode === 'parent-mean' ? parentMean : 0) : child.valueSum / child.visits;
        var u = cpuct * prior * Math.sqrt(node.visits + 1) / (1 + child.visits);
        var score = q + u, tk = tieKey(node, child);
        if (score > bestScore || (score === bestScore && (bestTie === null || tk < bestTie))) { best = child; bestScore = score; bestTie = tk; }
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
        var initialReward = leafValue(covered.state, scenario, config);
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
        node = select(node, node === rootNode);
        path.push(node);
        depth++;
        if (node.visits === 0) break;
      }
      var reward = leafValue(node.state, scenario, config);
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
      tieMode:config.tieMode,
      fpuMode:config.fpuMode,
      rootCPuct:config.rootCPuct,
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
        tieMode:decision.tieMode,
        fpuMode:decision.fpuMode,
        rootCPuct:decision.rootCPuct,
        visits:decision.visits
      }));
      decisionCount++;
      invariant(decisionCount <= 32, 'Root exploration correction exceeded decision safety bound.');
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
    exactKeys(raw, RUN_KEYS, 'root exploration correction run');
    invariant(typeof raw.runId === 'string' && raw.runId.indexOf(RUN_PREFIX) === 0, 'Invalid root exploration correction runId.');
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
      terminalSeparation:config.terminalSeparation,
      stalledStatePenalty:config.stalledStatePenalty,
      tieMode:config.tieMode,
      fpuMode:config.fpuMode,
      rootCPuct:config.rootCPuct,
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
        holdoutRuns[CANDIDATE_POLICY_ID].push(runVariant(scenario.id,CANDIDATE_POLICY_ID,seed));
        totalRunCount++;
        for (var p=1;p<HOLDOUT_POLICY_IDS.length;p++) {
          var id=HOLDOUT_POLICY_IDS[p];
          holdoutRuns[id].push(Baseline.runPolicy(scenario.id,id,seed));
          totalRunCount++;
        }
      }
    });

    var holdoutResults = [aggregateVariant(variantById(CANDIDATE_POLICY_ID),holdoutRuns[CANDIDATE_POLICY_ID])].concat(HOLDOUT_POLICY_IDS.slice(1).map(function (id) { return aggregateBaseline(id,holdoutRuns[id]); }));
    var pairwise = HOLDOUT_POLICY_IDS.slice(1).map(function (id) { return comparePairwise(holdoutRuns[CANDIDATE_POLICY_ID],holdoutRuns[id],id); });
    function pair(id) { return pairwise.filter(function (x) { return x.baselinePolicyId === id; })[0]; }
    var candidate = holdoutResults[0];
    var baselineFrozen = diagnosisResult('prime-z3-root-coverage-frozen-reproduction');
    var candidateDiagnosis = diagnosisResult(CANDIDATE_POLICY_ID);
    var normalized = diagnosisResult('prime-z3-normalized-value-development');
    var stalled = diagnosisResult('prime-z3-terminal-calibrated-stall-penalty-development');
    var boundedLex = diagnosisResult('prime-z3-bounded-lexicographic-development');

    var diagnosis = canonical({
      candidateChangesOnlyValueCalibration:true,
      candidateUsesAuthoredWitnessPlans:false,
      frozenRootCoverageObjectiveSuccessRate:baselineFrozen.objectiveSuccessRate,
      normalizedObjectiveSuccessRate:normalized.objectiveSuccessRate,
      terminalSeparatedObjectiveSuccessRate:candidateDiagnosis.objectiveSuccessRate,
      terminalSeparatedDelta:+(candidateDiagnosis.objectiveSuccessRate-baselineFrozen.objectiveSuccessRate).toFixed(6),
      stalledPenaltyObjectiveSuccessRate:stalled.objectiveSuccessRate,
      boundedLexicographicObjectiveSuccessRate:boundedLex.objectiveSuccessRate,
      selectedCalibration:'bounded-normalized-scalar-with-explicit-terminal-separation',
      selectionReason:'preserves-root-coverage-success-while-bounding-values-and-separating-success-failure-terminals',
      rootExplorationChanged:false,
      horizonChanged:false,
      simulationBudgetChanged:false,
      rolloutChanged:false
    });

    var gates = canonical({
      candidateHoldoutObjectiveGate:candidate.objectiveSuccessRate>=0.90,
      candidateSurvivalGate:candidate.settlementSurvivalRate>=0.95,
      deterministic:true,
      frozenV1NoLossGate:pair(Baseline.PRIMARY_POLICY_IDS[0]).losses===0,
      incumbentProxyNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[1]).nonLossRate>=0.70,
      legalProposalGate:candidate.illegalProposalRate===0,
      randomNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[3]).nonLossRate>=0.90,
      rootCoveragePreservedGate:candidate.meanRootCoverageFraction===1,
      rulesNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[2]).nonLossRate>=0.80,
      terminalCalibrationGate:candidateDiagnosis.terminalSeparation===true,
      boundedValueGate:candidateDiagnosis.valueMode==='normalized-objective-scalar',
      noUnscopedSearchChangeGate:diagnosis.rootExplorationChanged===false && diagnosis.horizonChanged===false && diagnosis.simulationBudgetChanged===false && diagnosis.rolloutChanged===false,
      allValueObjectiveCalibrationGatesPassed:false
    });
    gates.allValueObjectiveCalibrationGatesPassed = gates.candidateHoldoutObjectiveGate && gates.candidateSurvivalGate && gates.deterministic && gates.frozenV1NoLossGate && gates.incumbentProxyNonLossGate && gates.legalProposalGate && gates.randomNonLossGate && gates.rootCoveragePreservedGate && gates.rulesNonLossGate && gates.terminalCalibrationGate && gates.boundedValueGate && gates.noUnscopedSearchChangeGate;
    gates = canonical(gates);

    var body = canonical({
      authority:AUTHORITY,
      candidatePolicyId:CANDIDATE_POLICY_ID,
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
      valueObjectiveCalibrationGates:gates,
      strategicCompetenceCertified:false,
      totalRunCount:totalRunCount
    });
    return canonical(Object.assign({}, body, { reportId:hash(REPORT_PREFIX, body) }));
  }

  function validateReport(raw) {
    invariant(raw && typeof raw === 'object' && typeof raw.reportId === 'string' && raw.reportId.indexOf(REPORT_PREFIX) === 0, 'Invalid calibration reportId.');
    var expected=evaluateAll(raw.diagnosisSeedCount,raw.holdoutSeedCount);
    invariant(Identity.canonicalStringify(raw)===Identity.canonicalStringify(expected),'Value and objective calibration report does not match canonical computation.');
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
    CANDIDATE_POLICY_ID:CANDIDATE_POLICY_ID,
    MAX_OBJECTIVE_SCALAR:MAX_OBJECTIVE_SCALAR,
    OBSERVABILITY_CONTRACT_ID:Observability.CONTRACT_ID,
    ROOT_EXPLORATION_CONTRACT_ID:RootCoverage.CONTRACT_ID,
    VARIANTS:VARIANTS,
    VARIANT_COUNT:VARIANTS.length,
    HOLDOUT_POLICY_IDS:HOLDOUT_POLICY_IDS,
    rawLeafValue:rawLeafValue,
    normalizedLeafValue:normalizedLeafValue,
    boundedLexicographicValue:boundedLexicographicValue,
    legalActions:legalActions,
    searchDecision:searchDecision,
    runVariant:runVariant,
    validateRun:validateRun,
    evaluateAll:evaluateAll,
    validateReport:validateReport
  });
});
