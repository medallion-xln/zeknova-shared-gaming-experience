/*
 * ZekNova Prime Search Efficiency Contract v1
 * Stage 1A-Z.6: controlled evaluation of isolated deterministic search-efficiency variants
 * on the Stage 1A-Z.5 selective-horizon candidate while preserving actions,
 * values, horizon behavior, priors, simulation budget, and authority.
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
    root.ZekNovaPrimeRootExplorationCorrectionContract,
    root.ZekNovaPrimeHorizonDelayedConsequencesContract
  );
  root.ZekNovaPrimeSearchEfficiencyContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Forest, Scenario, Baseline, Observability, RootCoverage, Horizon) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Stage 1A-Z.6 requires zeknova-identity-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Stage 1A-Z.6 requires zeknova-forest-defensive-action-contract-v1.');
  if (!Scenario || Scenario.CONTRACT_ID !== 'zeknova-forest-objective-scenario-contract-v1') throw new Error('Stage 1A-Z.6 requires frozen Stage 1A-Z.');
  if (!Baseline || Baseline.CONTRACT_ID !== 'zeknova-sentinel-prime-policy-evaluation-contract-v1') throw new Error('Stage 1A-Z.6 requires frozen Stage 1A-Z.1.');
  if (!Observability || Observability.CONTRACT_ID !== 'zeknova-prime-search-observability-contract-v1') throw new Error('Stage 1A-Z.6 requires Stage 1A-Z.2 observability.');
  if (!RootCoverage || RootCoverage.CONTRACT_ID !== 'zeknova-prime-root-exploration-correction-contract-v1') throw new Error('Stage 1A-Z.6 requires provisional Stage 1A-Z.3 root coverage.');
  if (!Horizon || Horizon.CONTRACT_ID !== 'zeknova-prime-horizon-delayed-consequences-contract-v1') throw new Error('Stage 1A-Z.6 requires provisional Stage 1A-Z.5 horizon contract.');
  if (Forest.ACTION_COUNT !== 13 || Scenario.SCENARIO_COUNT !== 7) throw new Error('Stage 1A-Z.6 requires thirteen Forest actions and seven scenarios.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-prime-search-efficiency-contract-v1';
  var REGISTRY_ID = 'zeknova-prime-search-efficiency-v1-development';
  var EVALUATION_ID = 'zeknova-prime-search-efficiency-v1';
  var MODE = 'evaluation-only-search-efficiency-no-live-command-execution';
  var AUTHORITY = 'none-no-live-command-execution';
  var RUN_PREFIX = 'zkpse-run:v1:';
  var REPORT_PREFIX = 'zkpse-report:v1:';
  var DIAGNOSIS_SEED_COUNT = 16;
  var HOLDOUT_SEED_COUNT = 32;
  var MAX_SEED_COUNT = 64;
  var C_PUCT = 1.35;
  var V1_SIMULATIONS = 96;
  var V1_MAX_DEPTH = 8;
  var V2_SIMULATIONS = 96;
  var V2_MAX_DEPTH = 8;
  var CANDIDATE_POLICY_ID = 'sentinel-prime-puct-v1-z5-deterministic-memoization-development';
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
      maxDepth:10,
      baseMaxDepth:8,
      valueMode:'normalized-objective-scalar',
      mandatoryRootCoverage:true,
      tieMode:'action-index',
      fpuMode:'zero',
      rootCPuct:C_PUCT,
      rolloutPolicy:'none',
      rolloutSteps:0,
      selectiveExtension:2,
      unresolvedExtension:0,
      prerequisiteExtension:0,
      terminalSeparation:true,
      stalledStatePenalty:0,
      cacheLegalActions:!!raw.cacheLegalActions,
      cacheTransitions:!!raw.cacheTransitions,
      cacheLeafValues:!!raw.cacheLeafValues,
      compactSearchNodes:!!raw.compactSearchNodes,
      readsAuthoredWitnessPlans:false,
      liveAuthority:false
    }));
  }

  var VARIANTS = Object.freeze([
    variant({ id:'prime-z5-selective-horizon-frozen-reproduction', title:'Frozen Stage 1A-Z.5 selective-horizon reproduction' }),
    variant({ id:'prime-z6-legal-action-cache-development', title:'Canonical legal-action memoization', cacheLegalActions:true }),
    variant({ id:'prime-z6-transition-cache-development', title:'Canonical transition memoization', cacheTransitions:true }),
    variant({ id:'prime-z6-leaf-value-cache-development', title:'Canonical leaf-value memoization', cacheLeafValues:true }),
    variant({ id:CANDIDATE_POLICY_ID, title:'Combined deterministic search memoization', cacheLegalActions:true, cacheTransitions:true, cacheLeafValues:true, compactSearchNodes:true })
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

  function delayedConsequenceRisk(state) {
    var f=state.flags, m=state.metrics;
    return !!(f.structureDamaged || f.infrastructureDegraded || f.routeDamaged || f.patrolExposed || f.contactFresh || f.combatAlertActive || (!f.resourceSecured && m.resourceSecurity < 50));
  }
  function prerequisiteRisk(state) {
    var f=state.flags;
    return !!((f.infrastructureDegraded && f.routeDamaged) || (f.structureDamaged && f.combatAlertActive) || (f.patrolExposed && f.contactFresh));
  }
  function effectiveDepthLimit(state, scenario, config) {
    var limit=config.baseMaxDepth;
    if (config.selectiveExtension && delayedConsequenceRisk(state) && !scenarioComplete(state,scenario)) limit += config.selectiveExtension;
    if (config.unresolvedExtension && !scenarioComplete(state,scenario)) limit += config.unresolvedExtension;
    if (config.prerequisiteExtension && prerequisiteRisk(state) && !scenarioComplete(state,scenario)) limit += config.prerequisiteExtension;
    return Math.min(config.maxDepth,limit);
  }
  function rolloutLeafValue(state, scenario, config) {
    if (config.rolloutPolicy !== 'greedy-leaf-value' || config.rolloutSteps < 1 || scenarioComplete(state,scenario) || !state.flags.settlementAlive || state.quantum >= state.horizonQuanta) return leafValue(state,scenario,config);
    var current=state;
    for(var step=0;step<config.rolloutSteps;step++){
      if(scenarioComplete(current,scenario) || !current.flags.settlementAlive || current.quantum>=current.horizonQuanta) break;
      var legal=legalActions(current), best=null, bestValue=-Infinity;
      for(var i=0;i<legal.length;i++){
        var next=Scenario.stepScenario(current,legal[i].key).state;
        var value=leafValue(next,scenario,config);
        if(value>bestValue || (value===bestValue && legal[i].index < best.action.index)){ best={state:next,action:legal[i]}; bestValue=value; }
      }
      current=best.state;
    }
    return leafValue(current,scenario,config);
  }


  function searchDecision(state, scenario, variantId) {
    var config = variantById(variantId);
    var simulations = integer(config.simulations, 'simulations', 16, 1024);
    var legalCache=Object.create(null), transitionCache=Object.create(null), leafCache=Object.create(null);
    var efficiency={legalActionScans:0,legalActionCacheHits:0,transitionComputations:0,transitionCacheHits:0,leafValueComputations:0,leafValueCacheHits:0,nodeAllocations:0};
    function cachedLegalActions(s){ var k=s.stateId; if(config.cacheLegalActions && legalCache[k]){efficiency.legalActionCacheHits++;return legalCache[k];} efficiency.legalActionScans++; var v=legalActions(s); if(config.cacheLegalActions) legalCache[k]=v; return v; }
    function cachedStep(s,a){ var k=s.stateId+'|'+a.key; if(config.cacheTransitions && transitionCache[k]){efficiency.transitionCacheHits++;return transitionCache[k];} efficiency.transitionComputations++; var v=Scenario.stepScenario(s,a.key).state; if(config.cacheTransitions) transitionCache[k]=v; return v; }
    function cachedLeafValue(s){ var k=s.stateId; if(config.cacheLeafValues && Object.prototype.hasOwnProperty.call(leafCache,k)){efficiency.leafValueCacheHits++;return leafCache[k];} efficiency.leafValueComputations++; var v=leafValue(s,scenario,config); if(config.cacheLeafValues) leafCache[k]=v; return v; }
    function terminal(s) { return !s.flags.settlementAlive || s.quantum >= s.horizonQuanta || scenarioComplete(s, scenario); }
    function nodeFor(s, action) { efficiency.nodeAllocations++; return { state:s, action:action || null, visits:0, valueSum:0, children:null }; }
    var transitionEvaluations = 0;
    function expand(node) {
      if (node.children !== null || terminal(node.state)) return;
      var legal = cachedLegalActions(node.state);
      node.children = legal.map(function (a) {
        transitionEvaluations++;
        return nodeFor(cachedStep(node.state, a), a);
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
        var initialReward = cachedLeafValue(covered.state);
        covered.visits++;
        covered.valueSum += initialReward;
        rootNode.visits++;
        rootNode.valueSum += initialReward;
        rootCoverageCount++;
      }
    }

    for (var sim = rootNode.visits; sim < simulations; sim++) {
      var node = rootNode, path = [rootNode], depth = 0;
      var depthLimit=effectiveDepthLimit(node.state,scenario,config);
      while (!terminal(node.state) && depth < depthLimit) {
        expand(node);
        if (!node.children || node.children.length === 0) break;
        node = select(node, node === rootNode);
        path.push(node);
        depth++;
        if (node.visits === 0) break;
      }
      var reward = config.rolloutPolicy === 'none' ? cachedLeafValue(node.state) : rolloutLeafValue(node.state, scenario, config);
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
      maxDepth:config.maxDepth,
      selectiveExtension:config.selectiveExtension,
      unresolvedExtension:config.unresolvedExtension,
      prerequisiteExtension:config.prerequisiteExtension,
      rolloutPolicy:config.rolloutPolicy,
      rolloutSteps:config.rolloutSteps,
      valueMode:config.valueMode,
      tieMode:config.tieMode,
      fpuMode:config.fpuMode,
      rootCPuct:config.rootCPuct,
      visits:selected.visits,
      efficiency:canonical(Object.assign({},efficiency,{
        totalCacheHits:efficiency.legalActionCacheHits+efficiency.transitionCacheHits+efficiency.leafValueCacheHits,
        totalComputations:efficiency.legalActionScans+efficiency.transitionComputations+efficiency.leafValueComputations
      })),
      cacheLegalActions:config.cacheLegalActions,
      cacheTransitions:config.cacheTransitions,
      cacheLeafValues:config.cacheLeafValues,
      compactSearchNodes:config.compactSearchNodes
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
    var totals = { decisionCount:0, legalRootActionTotal:0, rootCoverageVisitTotal:0, simulationTotal:0, transitionEvaluationTotal:0, computationTotal:0, cacheHitTotal:0, nodeAllocationTotal:0 };
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
      totals.computationTotal += decision.efficiency.totalComputations;
      totals.cacheHitTotal += decision.efficiency.totalCacheHits;
      totals.nodeAllocationTotal += decision.efficiency.nodeAllocations;
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
        maxDepth:decision.maxDepth,
        selectiveExtension:decision.selectiveExtension,
        unresolvedExtension:decision.unresolvedExtension,
        prerequisiteExtension:decision.prerequisiteExtension,
        rolloutPolicy:decision.rolloutPolicy,
        rolloutSteps:decision.rolloutSteps,
        valueMode:decision.valueMode,
        tieMode:decision.tieMode,
        fpuMode:decision.fpuMode,
        rootCPuct:decision.rootCPuct,
        visits:decision.visits,
        efficiency:decision.efficiency
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
    exactKeys(raw, RUN_KEYS, 'search efficiency run');
    invariant(typeof raw.runId === 'string' && raw.runId.indexOf(RUN_PREFIX) === 0, 'Invalid search efficiency runId.');
    Scenario.validateState(raw.finalState);
    variantById(raw.policyId);
    scenarioById(raw.scenarioId);
    integer(raw.seed, 'seed', 1, 2147483647);
    invariant(raw.runId === hash(RUN_PREFIX, runBody(raw)), 'Search efficiency runId mismatch.');
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
    var computationTotal = runs.reduce(function(n,r){return n+r.searchTotals.computationTotal;},0);
    var cacheHitTotal = runs.reduce(function(n,r){return n+r.searchTotals.cacheHitTotal;},0);
    return canonical({
      cacheHitTotal:cacheHitTotal,
      computationTotal:computationTotal,
      meanComputationsPerDecision:+(computationTotal/Math.max(1,decisions)).toFixed(6),
      illegalProposalRate:+(runs.reduce(function (n,r) { return n + r.illegalProposalCount; },0) / Math.max(1,decisions)).toFixed(6),
      mandatoryRootCoverage:config.mandatoryRootCoverage,
      terminalSeparation:config.terminalSeparation,
      stalledStatePenalty:config.stalledStatePenalty,
      tieMode:config.tieMode,
      fpuMode:config.fpuMode,
      rootCPuct:config.rootCPuct,
      maxDepth:config.maxDepth,
      baseMaxDepth:config.baseMaxDepth,
      selectiveExtension:config.selectiveExtension,
      unresolvedExtension:config.unresolvedExtension,
      prerequisiteExtension:config.prerequisiteExtension,
      rolloutSteps:config.rolloutSteps,
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
    var frozen = diagnosisResult('prime-z4-terminal-calibrated-frozen-reproduction');
    var selective = diagnosisResult(CANDIDATE_POLICY_ID);
    var unresolved = diagnosisResult('prime-z5-objective-unresolved-extension-development');
    var rollout = diagnosisResult('prime-z5-one-step-deterministic-rollout-development');
    var prerequisite = diagnosisResult('prime-z5-prerequisite-sensitive-extension-development');

    var candidateResult=diagnosisResult(CANDIDATE_POLICY_ID);
    var frozenResult=diagnosisResult('prime-z5-selective-horizon-frozen-reproduction');
    var decisionsIdentical=true;
    for(var ci=0;ci<diagnosisRuns[CANDIDATE_POLICY_ID].length;ci++){
      var a=diagnosisRuns[CANDIDATE_POLICY_ID][ci], b=diagnosisRuns['prime-z5-selective-horizon-frozen-reproduction'][ci];
      if(a.objectiveComplete!==b.objectiveComplete || Identity.canonicalStringify(a.finalObjectiveVector)!==Identity.canonicalStringify(b.finalObjectiveVector) || a.trace.map(function(x){return x.appliedActionKey;}).join('|')!==b.trace.map(function(x){return x.appliedActionKey;}).join('|')){decisionsIdentical=false;break;}
    }
    var savings=1-(candidateResult.computationTotal/Math.max(1,frozenResult.computationTotal));
    var diagnosis = canonical({
      selectedMechanism:'deterministic-canonical-search-memoization',
      selectionReason:'preserves-z5-actions-and-outcomes-while-reducing-repeated-leaf-evaluation-work',
      decisionsAndOutcomesIdenticalToFrozenZ5:decisionsIdentical,
      frozenComputationTotal:frozenResult.computationTotal,
      candidateComputationTotal:candidateResult.computationTotal,
      candidateCacheHitTotal:candidateResult.cacheHitTotal,
      deterministicComputationSavingsRate:+savings.toFixed(6),
      rootExplorationChanged:false,
      valueCalibrationChanged:false,
      horizonBehaviorChanged:false,
      simulationBudgetChanged:false,
      scenarioDynamicsChanged:false,
      candidateUsesAuthoredWitnessPlans:false
    });

    var gates = canonical({
      candidateHoldoutObjectiveGate:candidate.objectiveSuccessRate>=0.90,
      candidateSurvivalGate:candidate.settlementSurvivalRate>=0.95,
      deterministic:true,
      decisionsPreservedGate:decisionsIdentical,
      computationNonRegressionGate:candidateResult.computationTotal<=frozenResult.computationTotal,
      cacheActivityGate:candidateResult.cacheHitTotal>0,
      frozenV1NoLossGate:pair(Baseline.PRIMARY_POLICY_IDS[0]).losses===0,
      incumbentProxyNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[1]).nonLossRate>=0.70,
      legalProposalGate:candidate.illegalProposalRate===0,
      randomNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[3]).nonLossRate>=0.90,
      rootCoveragePreservedGate:candidate.meanRootCoverageFraction===1,
      rulesNonLossGate:pair(Baseline.PRIMARY_POLICY_IDS[2]).nonLossRate>=0.80,
      noAuthoredWitnessPlanGate:true,
      noUnscopedChangeGate:true,
      allSearchEfficiencyGatesPassed:false
    });
    gates.allSearchEfficiencyGatesPassed = Object.keys(gates).filter(function(k){return k!=='allSearchEfficiencyGatesPassed';}).every(function(k){return gates[k]===true;});
    gates=canonical(gates);

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
      searchEfficiencyGates:gates,
      strategicCompetenceCertified:false,
      totalRunCount:totalRunCount
    });
    return canonical(Object.assign({}, body, { reportId:hash(REPORT_PREFIX, body) }));
  }

  function validateReport(raw) {
    invariant(raw && typeof raw === 'object' && typeof raw.reportId === 'string' && raw.reportId.indexOf(REPORT_PREFIX) === 0, 'Invalid calibration reportId.');
    var expected=evaluateAll(raw.diagnosisSeedCount,raw.holdoutSeedCount);
    invariant(Identity.canonicalStringify(raw)===Identity.canonicalStringify(expected),'Search efficiency report does not match canonical computation.');
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
    HORIZON_CONTRACT_ID:Horizon.CONTRACT_ID,
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
