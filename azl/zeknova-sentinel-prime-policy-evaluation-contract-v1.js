/*
 * ZekNova Sentinel Prime Policy Evaluation Contract v1
 * Stage 1A-Z.1: deterministic comparison of a 13-action, uniform-prior,
 * root-PUCT Sentinel Prime candidate against non-learning baselines inside the
 * frozen Stage 1A-Z failure-possible Forest scenarios.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * Evaluation only: no live-world reads, command execution, DOM, network,
 * storage, wall clock, production authority, or strategic competence claim.
 */
(function (root, factory) {
  var api = factory(
    root.ZekNovaIdentityContract,
    root.ZekNovaForestDefensiveActionContract,
    root.ZekNovaForestObjectiveScenarioContract
  );
  root.ZekNovaSentinelPrimePolicyEvaluationContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Forest, Scenario) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') throw new Error('Stage 1A-Z.1 requires zeknova-identity-contract-v1.');
  if (!Forest || Forest.CONTRACT_ID !== 'zeknova-forest-defensive-action-contract-v1') throw new Error('Stage 1A-Z.1 requires zeknova-forest-defensive-action-contract-v1.');
  if (!Scenario || Scenario.CONTRACT_ID !== 'zeknova-forest-objective-scenario-contract-v1') throw new Error('Stage 1A-Z.1 requires frozen Stage 1A-Z.');
  if (Forest.ACTION_COUNT !== 13 || Scenario.SCENARIO_COUNT !== 7) throw new Error('Stage 1A-Z.1 requires thirteen Forest actions and seven scenarios.');

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-sentinel-prime-policy-evaluation-contract-v1';
  var REGISTRY_ID = 'zeknova-sentinel-prime-policy-evaluation-v1-development';
  var EVALUATION_ID = 'zeknova-sentinel-prime-policy-evaluation-v1';
  var MODE = 'evaluation-only-policy-comparison-no-live-command-execution';
  var AUTHORITY = 'none-no-live-command-execution';
  var RUN_PREFIX = 'zkpe-run:v1:';
  var REPORT_PREFIX = 'zkpe-report:v1:';
  var DEFAULT_SEED_COUNT = 16;
  var MAX_SEED_COUNT = 64;
  var PRIME_SIMULATIONS = 96;
  var PRIME_C_PUCT = 1.35;
  var PRIME_MAX_ROLLOUT_DECISIONS = 8;

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
  function actionByKey(key) {
    for (var i = 0; i < Forest.ACTIONS.length; i++) if (Forest.ACTIONS[i].key === key) return Forest.ACTIONS[i];
    throw new Error('Unknown Forest action key: ' + key);
  }
  function scenarioById(id) {
    for (var i = 0; i < Scenario.SCENARIOS.length; i++) if (Scenario.SCENARIOS[i].id === id) return Scenario.SCENARIOS[i];
    throw new Error('Unknown scenarioId: ' + id);
  }

  var PRIMARY_POLICY_IDS = Object.freeze([
    'sentinel-prime-puct-v1-development',
    'incumbent-scripted-proxy-v1-development',
    'deterministic-defensive-rules-v1',
    'random-legal-v1',
    'always-hold-v1'
  ]);
  var SPAM_POLICY_IDS = Object.freeze(Forest.ACTIONS.map(function (a) { return 'spam-' + a.key + '-v1'; }));
  var POLICY_IDS = Object.freeze(PRIMARY_POLICY_IDS.concat(SPAM_POLICY_IDS));

  function policyDef(id, title, kind, role, extra) {
    var body = { id:id, title:title, kind:kind, role:role, readsAuthoredWitnessPlans:false, liveAuthority:false };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return Object.freeze(canonical(body));
  }
  var POLICIES = Object.freeze([
    policyDef(PRIMARY_POLICY_IDS[0], 'Sentinel Prime — Uniform-Prior Root PUCT', 'puct-tree', 'candidate', {
      simulations:PRIME_SIMULATIONS, cPuct:PRIME_C_PUCT, rolloutPolicy:'deterministic-seeded-uniform-legal', maxRolloutDecisions:PRIME_MAX_ROLLOUT_DECISIONS,
      engineStatus:'development-scenario-model-candidate-not-live-authority'
    }),
    policyDef(PRIMARY_POLICY_IDS[1], 'Incumbent Scripted Proxy', 'reactive-proxy', 'baseline', {
      proxyStatus:'development-proxy-no-canonical-live-incumbent-policy-interface', actualLivePlannerBound:false
    }),
    policyDef(PRIMARY_POLICY_IDS[2], 'Deterministic Defensive Rules', 'deterministic-rules', 'baseline', {}),
    policyDef(PRIMARY_POLICY_IDS[3], 'Random Legal', 'seeded-random-legal', 'control', {}),
    policyDef(PRIMARY_POLICY_IDS[4], 'Always Hold', 'fixed-action', 'control', { actionKey:'hold_settlement_perimeter' })
  ].concat(Forest.ACTIONS.map(function (a) {
    return policyDef('spam-' + a.key + '-v1', 'Spam ' + a.key, 'single-action-spam', 'control', { actionKey:a.key });
  })));
  var POLICY_BY_ID = {};
  POLICIES.forEach(function (p) { POLICY_BY_ID[p.id] = p; });
  Object.freeze(POLICY_BY_ID);

  function policyAt(id) {
    var p = POLICY_BY_ID[id];
    invariant(!!p, 'Unknown policyId: ' + id);
    return p;
  }

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
    invariant(out.length > 0, 'Nonterminal evaluation state has no legal action.');
    return out;
  }

  function objectiveScalar(vector) {
    invariant(Array.isArray(vector) && vector.length === 9, 'Objective vector must contain nine values.');
    var base = 128, weight = 1, score = vector[0];
    for (var i = 1; i < vector.length; i++) { weight /= base; score += vector[i] * weight; }
    return score;
  }

  function seed32(parts) {
    var h = Identity.hash64x2(parts);
    var n = parseInt(h.slice(0, 8), 16) >>> 0;
    return n === 0 ? 0x9e3779b9 : n;
  }
  function nextRng(state) {
    var x = state >>> 0;
    x ^= (x << 13) >>> 0; x ^= x >>> 17; x ^= (x << 5) >>> 0;
    return x >>> 0;
  }

  function rollout(startState, scenario, rngState) {
    var state = startState, decisions = 0, rng = rngState >>> 0;
    while (state.flags.settlementAlive && state.quantum < state.horizonQuanta && !scenarioComplete(state, scenario) && decisions < PRIME_MAX_ROLLOUT_DECISIONS) {
      var legal = legalActions(state);
      rng = nextRng(rng);
      var action = legal[rng % legal.length];
      state = Scenario.stepScenario(state, action.key).state;
      decisions++;
    }
    return { state:state, vector:Scenario.objectiveVector(state), score:objectiveScalar(Scenario.objectiveVector(state)), rng:rng };
  }

  function primeDecision(state, scenario, seed, decisionIndex, simulations) {
    simulations = simulations == null ? PRIME_SIMULATIONS : integer(simulations, 'simulations', 8, 1024);
    function terminal(s) { return !s.flags.settlementAlive || s.quantum >= s.horizonQuanta || scenarioComplete(s, scenario); }
    function nodeFor(s, action) { return { state:s, action:action || null, visits:0, valueSum:0, children:null }; }
    function expand(node) {
      if (node.children !== null || terminal(node.state)) return;
      var legal = legalActions(node.state);
      node.children = legal.map(function (a) {
        return nodeFor(Scenario.stepScenario(node.state, a.key).state, a);
      });
    }
    function select(node) {
      var children=node.children, prior=1/children.length, best=null, bestScore=-Infinity;
      for (var i=0;i<children.length;i++) {
        var child=children[i];
        var q=child.visits===0?0:child.valueSum/child.visits;
        var u=PRIME_C_PUCT*prior*Math.sqrt(node.visits+1)/(1+child.visits);
        var score=q+u;
        if(score>bestScore || score===bestScore && child.action.index<best.action.index){best=child;bestScore=score;}
      }
      return best;
    }
    var rootNode=nodeFor(state,null);
    expand(rootNode);
    for(var sim=0;sim<simulations;sim++){
      var node=rootNode, path=[rootNode], depth=0;
      while(!terminal(node.state) && depth<PRIME_MAX_ROLLOUT_DECISIONS){
        expand(node);
        if(!node.children || node.children.length===0)break;
        node=select(node); path.push(node); depth++;
        if(node.visits===0)break;
      }
      var reward=objectiveScalar(Scenario.objectiveVector(node.state));
      for(var p=0;p<path.length;p++){path[p].visits++;path[p].valueSum+=reward;}
    }
    var stats=rootNode.children.map(function(child){return{
      action:child.action, visits:child.visits, valueSum:child.valueSum, prior:1/rootNode.children.length
    };});
    stats.sort(function (a,b) {
      if (b.visits !== a.visits) return b.visits - a.visits;
      var qa = a.visits ? a.valueSum/a.visits : -Infinity, qb = b.visits ? b.valueSum/b.visits : -Infinity;
      if (qb !== qa) return qb - qa;
      return a.action.index - b.action.index;
    });
    var selected = stats[0];
    return canonical({
      actionIndex:selected.action.index, actionKey:selected.action.key,
      simulations:simulations, visits:selected.visits,
      confidence:+(selected.visits/simulations).toFixed(6),
      ranking:stats.map(function (s) { return { actionIndex:s.action.index, actionKey:s.action.key, visits:s.visits, meanValue:s.visits ? +(s.valueSum/s.visits).toFixed(12) : null }; })
    });
  }

  function firstLegal(state, keys) {
    for (var i = 0; i < keys.length; i++) if (Scenario.legalReason(state, keys[i]) === null) return keys[i];
    return 'hold_settlement_perimeter';
  }

  function incumbentProxyDecision(state) {
    var f = state.flags, m = state.metrics;
    if (f.contactFresh) return firstLegal(state, ['intercept_hostile_contact','screen_combat_alert','hold_settlement_perimeter']);
    if (f.combatAlertActive) return firstLegal(state, ['screen_combat_alert','reinforce_threatened_structure','hold_settlement_perimeter']);
    if (f.patrolExposed) return firstLegal(state, ['withdraw_exposed_patrol','hold_settlement_perimeter']);
    if (f.structureDamaged) return firstLegal(state, ['reinforce_threatened_structure','repair_known_structure','hold_settlement_perimeter']);
    if (f.routeDamaged) return firstLegal(state, ['patrol_known_route','fortify_known_route','hold_settlement_perimeter']);
    if (f.infrastructureDegraded) return firstLegal(state, ['hold_settlement_perimeter','stabilize_known_infrastructure']);
    if (f.resourceKnown && !f.resourceSecured) return firstLegal(state, ['patrol_known_route','secure_known_resource','hold_settlement_perimeter']);
    if (m.tension >= 82) return firstLegal(state, ['open_defensive_channel','hold_settlement_perimeter']);
    return 'hold_settlement_perimeter';
  }

  function deterministicRulesDecision(state) {
    var f = state.flags, m = state.metrics;
    if (f.structureDamaged && state.criticalStructureHealth < 75) return firstLegal(state, ['repair_known_structure','reinforce_threatened_structure','hold_settlement_perimeter']);
    if (f.patrolExposed) return firstLegal(state, ['withdraw_exposed_patrol','hold_settlement_perimeter']);
    if (f.infrastructureDegraded) return firstLegal(state, ['stabilize_known_infrastructure','hold_settlement_perimeter']);
    if (f.routeDamaged) return firstLegal(state, ['fortify_known_route','patrol_known_route','hold_settlement_perimeter']);
    if (f.contactFresh && m.hostilePressure >= 45) return firstLegal(state, ['intercept_hostile_contact','screen_combat_alert','hold_settlement_perimeter']);
    if (f.combatAlertActive) return firstLegal(state, ['screen_combat_alert','reinforce_threatened_structure','hold_settlement_perimeter']);
    if (f.resourceKnown && !f.resourceSecured) return firstLegal(state, ['secure_known_resource','hold_settlement_perimeter']);
    if (m.tension >= 75) return firstLegal(state, ['open_defensive_channel','hold_settlement_perimeter']);
    return firstLegal(state, ['hold_settlement_perimeter','patrol_known_route']);
  }

  function chooseAction(policyId, state, scenario, seed, decisionIndex) {
    var policy = policyAt(policyId);
    if (policy.kind === 'puct-tree') return primeDecision(state, scenario, seed, decisionIndex, policy.simulations);
    if (policy.kind === 'reactive-proxy') return canonical({ actionKey:incumbentProxyDecision(state), actionIndex:actionByKey(incumbentProxyDecision(state)).index, simulations:0, visits:0, confidence:1, ranking:[] });
    if (policy.kind === 'deterministic-rules') return canonical({ actionKey:deterministicRulesDecision(state), actionIndex:actionByKey(deterministicRulesDecision(state)).index, simulations:0, visits:0, confidence:1, ranking:[] });
    if (policy.kind === 'seeded-random-legal') {
      var legal = legalActions(state), rng = seed32({ seed:seed, policyId:policyId, stateId:state.stateId, decisionIndex:decisionIndex });
      var action = legal[rng % legal.length];
      return canonical({ actionKey:action.key, actionIndex:action.index, simulations:0, visits:0, confidence:+(1/legal.length).toFixed(6), ranking:[] });
    }
    var key = policy.actionKey;
    return canonical({ actionKey:key, actionIndex:actionByKey(key).index, simulations:0, visits:0, confidence:1, ranking:[] });
  }

  var RUN_KEYS = ['authority','contractId','decisionCount','evaluationId','fallbackCount','finalObjectiveVector','finalState','illegalProposalCount','mode','objectiveComplete','policyId','runId','scenarioId','schemaVersion','seed','settlementSurvived','trace'];
  function runBody(raw) {
    return canonical({
      authority:AUTHORITY, contractId:CONTRACT_ID, decisionCount:raw.decisionCount,
      evaluationId:EVALUATION_ID, fallbackCount:raw.fallbackCount,
      finalObjectiveVector:raw.finalObjectiveVector, finalState:raw.finalState,
      illegalProposalCount:raw.illegalProposalCount, mode:MODE,
      objectiveComplete:raw.objectiveComplete, policyId:raw.policyId,
      scenarioId:raw.scenarioId, schemaVersion:SCHEMA_VERSION, seed:raw.seed,
      settlementSurvived:raw.settlementSurvived, trace:raw.trace
    });
  }

  function runPolicy(scenarioId, policyId, seed) {
    var scenario = scenarioById(scenarioId), policy = policyAt(policyId);
    integer(seed, 'seed', 1, 2147483647);
    var state = Scenario.createScenarioState(scenarioId, seed);
    var trace = [], decisionCount = 0, illegal = 0, fallbackCount = 0;
    while (state.flags.settlementAlive && state.quantum < state.horizonQuanta && !scenarioComplete(state, scenario)) {
      var decision = chooseAction(policy.id, state, scenario, seed, decisionCount);
      var proposed = decision.actionKey;
      var reason = Scenario.legalReason(state, proposed);
      var applied = proposed;
      if (reason !== null) {
        illegal++; fallbackCount++;
        applied = 'hold_settlement_perimeter';
        invariant(Scenario.legalReason(state, applied) === null, 'Safe fallback is not legal.');
      }
      var beforeId = state.stateId;
      var step = Scenario.stepScenario(state, applied);
      state = step.state;
      trace.push(canonical({
        appliedActionKey:applied, confidence:decision.confidence,
        decisionIndex:decisionCount, endQuantum:step.endQuantum,
        fallbackReason:reason, proposedActionKey:proposed,
        simulations:decision.simulations, startQuantum:step.startQuantum,
        stateIdBefore:beforeId, stateIdAfter:state.stateId, visits:decision.visits
      }));
      decisionCount++;
      invariant(decisionCount <= 32, 'Policy evaluation exceeded decision safety bound.');
    }
    var body = runBody({
      decisionCount:decisionCount, fallbackCount:fallbackCount,
      finalObjectiveVector:Scenario.objectiveVector(state), finalState:state,
      illegalProposalCount:illegal, objectiveComplete:scenarioComplete(state, scenario),
      policyId:policy.id, scenarioId:scenario.id, seed:seed,
      settlementSurvived:state.flags.settlementAlive, trace:trace
    });
    return canonical(Object.assign({}, body, { runId:hash(RUN_PREFIX, body) }));
  }

  function validateRun(raw) {
    exactKeys(raw, RUN_KEYS, 'policy run');
    invariant(typeof raw.runId === 'string' && raw.runId.indexOf(RUN_PREFIX) === 0, 'Invalid policy runId.');
    Scenario.validateState(raw.finalState);
    policyAt(raw.policyId); scenarioById(raw.scenarioId);
    integer(raw.seed, 'seed', 1, 2147483647);
    invariant(raw.runId === hash(RUN_PREFIX, runBody(raw)), 'Policy runId mismatch.');
    return canonical(raw);
  }

  function caseSeed(scenario, index) { return 26003 + index * 10007 + scenario.id.length * 53; }
  function average(values) { return values.length ? values.reduce(function (a,b) { return a+b; },0) / values.length : 0; }
  function aggregatePolicy(policy, runs) {
    var scenarioResults = Scenario.SCENARIOS.map(function (s) {
      var subset = runs.filter(function (r) { return r.scenarioId === s.id; });
      var vector = new Array(9).fill(0);
      subset.forEach(function (r) { r.finalObjectiveVector.forEach(function (v,i) { vector[i] += v; }); });
      vector = vector.map(function (v) { return +(v/subset.length).toFixed(6); });
      return canonical({
        scenarioId:s.id, runCount:subset.length,
        objectiveSuccessRate:+(subset.filter(function (r) { return r.objectiveComplete; }).length/subset.length).toFixed(6),
        settlementSurvivalRate:+(subset.filter(function (r) { return r.settlementSurvived; }).length/subset.length).toFixed(6),
        meanObjectiveVector:vector
      });
    });
    return canonical({
      policyId:policy.id, role:policy.role, runCount:runs.length,
      objectiveSuccessRate:+(runs.filter(function (r) { return r.objectiveComplete; }).length/runs.length).toFixed(6),
      settlementSurvivalRate:+(runs.filter(function (r) { return r.settlementSurvived; }).length/runs.length).toFixed(6),
      illegalProposalRate:+(runs.reduce(function (n,r) { return n+r.illegalProposalCount; },0)/Math.max(1,runs.reduce(function (n,r) { return n+r.decisionCount; },0))).toFixed(6),
      meanDecisionCount:+average(runs.map(function (r) { return r.decisionCount; })).toFixed(6),
      deterministic:true, scenarioResults:scenarioResults
    });
  }

  function comparePairwise(candidateRuns, baselineRuns, baselineId) {
    var wins=0,ties=0,losses=0;
    for (var i=0;i<candidateRuns.length;i++) {
      var cmp=Scenario.compareObjectiveVectors(candidateRuns[i].finalObjectiveVector,baselineRuns[i].finalObjectiveVector);
      if(cmp>0)wins++; else if(cmp<0)losses++; else ties++;
    }
    var n=candidateRuns.length;
    return canonical({ baselinePolicyId:baselineId, cases:n, wins:wins, ties:ties, losses:losses, winRate:+(wins/n).toFixed(6), nonLossRate:+((wins+ties)/n).toFixed(6) });
  }

  function reportBody(raw) {
    return canonical({
      authority:AUTHORITY, contractId:CONTRACT_ID, evaluationId:EVALUATION_ID,
      incumbentComparisonStatus:'proxy-only-no-canonical-live-incumbent-policy-interface',
      mode:MODE, policyCount:POLICIES.length, policyResults:raw.policyResults,
      primeGates:raw.primeGates, primePairwise:raw.primePairwise,
      productionAuthorityClaim:false, registryId:REGISTRY_ID,
      scenarioCount:Scenario.SCENARIO_COUNT, schemaVersion:SCHEMA_VERSION,
      seedCount:raw.seedCount, strategicCompetenceCertified:false,
      primeOutperformsActualIncumbentClaim:false,
      totalRunCount:raw.totalRunCount
    });
  }

  function evaluateAll(seedCount) {
    seedCount = seedCount == null ? DEFAULT_SEED_COUNT : integer(seedCount, 'seedCount', 1, MAX_SEED_COUNT);
    var runsByPolicy = {}, total=0;
    POLICIES.forEach(function (p) { runsByPolicy[p.id]=[]; });
    Scenario.SCENARIOS.forEach(function (scenario) {
      for(var i=0;i<seedCount;i++) {
        var seed=caseSeed(scenario,i);
        POLICIES.forEach(function (p) { runsByPolicy[p.id].push(runPolicy(scenario.id,p.id,seed)); total++; });
      }
    });
    var policyResults=POLICIES.map(function (p) { return aggregatePolicy(p,runsByPolicy[p.id]); });
    var primeRuns=runsByPolicy[PRIMARY_POLICY_IDS[0]];
    var primeResult=policyResults.filter(function(r){return r.policyId===PRIMARY_POLICY_IDS[0];})[0];
    var pairwiseResults=PRIMARY_POLICY_IDS.slice(1).map(function(id){return pairwiseAgainst(id);});
    function pairwiseAgainst(id){return comparePairwise(primeRuns,runsByPolicy[id],id);}
    var randomPair=pairwiseResults.filter(function(p){return p.baselinePolicyId===PRIMARY_POLICY_IDS[3];})[0];
    var holdPair=pairwiseResults.filter(function(p){return p.baselinePolicyId===PRIMARY_POLICY_IDS[4];})[0];
    var proxyPair=pairwiseResults.filter(function(p){return p.baselinePolicyId===PRIMARY_POLICY_IDS[1];})[0];
    var rulesPair=pairwiseResults.filter(function(p){return p.baselinePolicyId===PRIMARY_POLICY_IDS[2];})[0];
    var gates=canonical({
      deterministic:true,
      legalProposalGate:primeResult.illegalProposalRate===0,
      randomObjectiveGate:randomPair.winRate>=0.60,
      alwaysHoldObjectiveGate:holdPair.winRate>=0.60,
      proxyNonLossGate:proxyPair.nonLossRate>=0.60,
      rulesNonLossGate:rulesPair.nonLossRate>=0.40,
      scenarioCoverageGate:primeResult.scenarioResults.every(function(r){return r.settlementSurvivalRate>=0.80;}),
      allDevelopmentGatesPassed:false
    });
    gates.allDevelopmentGatesPassed=gates.deterministic&&gates.legalProposalGate&&gates.randomObjectiveGate&&gates.alwaysHoldObjectiveGate&&gates.proxyNonLossGate&&gates.rulesNonLossGate&&gates.scenarioCoverageGate;
    gates=canonical(gates);
    var body=reportBody({seedCount:seedCount,policyResults:policyResults,primePairwise:pairwiseResults,primeGates:gates,totalRunCount:total});
    return canonical(Object.assign({},body,{reportId:hash(REPORT_PREFIX,body)}));
  }

  function validateReport(raw) {
    invariant(raw && typeof raw==='object' && typeof raw.reportId==='string' && raw.reportId.indexOf(REPORT_PREFIX)===0,'Invalid policy evaluation reportId.');
    var expected=evaluateAll(raw.seedCount);
    invariant(Identity.canonicalStringify(raw)===Identity.canonicalStringify(expected),'Policy evaluation report does not match canonical computation.');
    return expected;
  }

  return Object.freeze({
    SCHEMA_VERSION:SCHEMA_VERSION, CONTRACT_ID:CONTRACT_ID, REGISTRY_ID:REGISTRY_ID,
    EVALUATION_ID:EVALUATION_ID, MODE:MODE, AUTHORITY:AUTHORITY,
    DEFAULT_SEED_COUNT:DEFAULT_SEED_COUNT, MAX_SEED_COUNT:MAX_SEED_COUNT,
    PRIME_SIMULATIONS:PRIME_SIMULATIONS, PRIME_C_PUCT:PRIME_C_PUCT,
    PRIME_MAX_ROLLOUT_DECISIONS:PRIME_MAX_ROLLOUT_DECISIONS,
    PRIMARY_POLICY_IDS:PRIMARY_POLICY_IDS, SPAM_POLICY_IDS:SPAM_POLICY_IDS,
    POLICY_IDS:POLICY_IDS, POLICIES:POLICIES, POLICY_COUNT:POLICIES.length,
    objectiveScalar:objectiveScalar, legalActions:legalActions,
    primeDecision:primeDecision, chooseAction:chooseAction,
    runPolicy:runPolicy, validateRun:validateRun,
    evaluateAll:evaluateAll, validateReport:validateReport
  });
});
