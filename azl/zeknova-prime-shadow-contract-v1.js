/*
 * ZekNova Sentinel Prime Shadow Contract v1
 * W0-O.6: deterministic Prime recommendations from W0-O.3 observations and W0-O.5 legality.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * Requires W0-O.0 identity, W0-O.3 faction-observation, and W0-O.5 legality contracts.
 * Shadow only: no action execution, no world mutation, no resource spending, no wall clock.
 */
(function (root, factory) {
  var api = factory(
    root.ZekNovaIdentityContract,
    root.ZekNovaFactionObservationContract,
    root.ZekNovaObservationLegalityContract
  );
  root.ZekNovaPrimeShadowContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Observation, Legality) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') {
    throw new Error('Sentinel Prime Shadow requires zeknova-identity-contract-v1.');
  }
  if (!Observation || Observation.CONTRACT_ID !== 'zeknova-faction-observation-contract-v1') {
    throw new Error('Sentinel Prime Shadow requires zeknova-faction-observation-contract-v1.');
  }
  if (!Legality || Legality.CONTRACT_ID !== 'zeknova-observation-legality-contract-v1') {
    throw new Error('Sentinel Prime Shadow requires zeknova-observation-legality-contract-v1.');
  }

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-prime-shadow-contract-v1';
  var REGISTRY_ID = 'zeknova-prime-shadow-v1-development';
  var ENGINE_ID = 'sentinel-prime-root-puct-v1-development';
  var POLICY_VERSION = 'sentinel-prime-observation-policy-v1-development';
  var MODE = 'shadow-only';
  var AUTHORITY = 'none-no-action-execution';
  var RECOMMENDATION_PREFIX = 'zkpr:v1:';
  var COMPARISON_PREFIX = 'zkpc:v1:';
  var ENTRY_PREFIX = 'zkps:v1:';
  var DEFAULT_SIMULATIONS = 192;
  var DEFAULT_CPUCT_MILLI = 1450;
  var MIN_SIMULATIONS = 32;
  var MAX_SIMULATIONS = 1024;
  var ACTION_COUNT = Legality.ACTION_COUNT;
  var FEATURE_COUNT = Observation.FEATURE_COUNT;

  var CONTEXT_KEYS = Object.freeze([
    'actionSpaceId', 'cPuctMilli', 'engineId', 'featureCount', 'featureLayoutId',
    'mode', 'policyVersion', 'schemaVersion', 'seed', 'simulations', 'upstreamMaskSource'
  ]);
  var RANKED_KEYS = Object.freeze([
    'actionIndex', 'actionKey', 'label', 'legal', 'priorPpm', 'scoreMicros',
    'selectedSubjectId', 'selectedTargetId', 'targetCount', 'valueMicros', 'visits', 'visitSharePpm'
  ]);
  var RECOMMENDATION_KEYS = Object.freeze([
    'actionSpaceId', 'authority', 'confidencePpm', 'contextHash', 'contractId', 'engineId',
    'factionId', 'featureCount', 'featureHash', 'featureLayoutId', 'finalMaskHash',
    'legalActionCount', 'legalityId', 'mode', 'observationId', 'policyVersion', 'quantum',
    'rankedActions', 'recommendationId', 'registryId', 'schemaVersion', 'seed',
    'selectedActionIndex', 'selectedActionKey', 'selectedSubjectId', 'selectedTargetId',
    'simulations', 'targetViewId', 'worldId'
  ]);
  var COMPARISON_KEYS = Object.freeze([
    'agreement', 'comparisonId', 'contractId', 'incumbentActionIndex', 'incumbentActionKey',
    'incumbentAvailable', 'incumbentPolicyId', 'incumbentSubjectId', 'incumbentTargetId',
    'mode', 'recommendationId', 'registryId', 'schemaVersion'
  ]);
  var ENTRY_KEYS = Object.freeze(['comparison', 'entryId', 'recommendation', 'sequence']);
  var LEDGER_KEYS = Object.freeze(['contractId', 'entries', 'nextSequence', 'registryId', 'schemaVersion', 'worldId']);

  function invariant(condition, message) { if (!condition) throw new Error(message); }
  function clone(value) { return Identity.stableClone(value); }
  function exactKeys(object, keys, label) {
    invariant(object && Object.prototype.toString.call(object) === '[object Object]', label + ' must be a plain object.');
    var actual = Object.keys(object).sort();
    var expected = keys.slice().sort();
    invariant(JSON.stringify(actual) === JSON.stringify(expected), label + ' has unexpected or missing fields.');
  }
  function integer(value, label, minimum, maximum) {
    var n = Number(value);
    invariant(Number.isSafeInteger(n), label + ' must be a safe integer.');
    if (minimum != null) invariant(n >= minimum, label + ' is below minimum.');
    if (maximum != null) invariant(n <= maximum, label + ' exceeds maximum.');
    return n;
  }
  function nullableString(value, label) {
    invariant(value === null || typeof value === 'string', label + ' must be null or string.');
    return value;
  }
  function isRecommendationId(value) { return typeof value === 'string' && /^zkpr:v1:[0-9a-f]{16}$/.test(value); }
  function isComparisonId(value) { return typeof value === 'string' && /^zkpc:v1:[0-9a-f]{16}$/.test(value); }
  function isEntryId(value) { return typeof value === 'string' && /^zkps:v1:[0-9]+:[0-9a-f]{16}$/.test(value); }
  function clampInt(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || 0))); }
  function ppm(numerator, denominator) { return denominator > 0 ? clampInt((Number(numerator) * 1000000) / Number(denominator), 0, 1000000) : 0; }

  function createContext(options) {
    var opts = options || {};
    var context = Identity.canonicalize({
      actionSpaceId: Legality.ACTION_SPACE_ID,
      cPuctMilli: integer(opts.cPuctMilli == null ? DEFAULT_CPUCT_MILLI : opts.cPuctMilli, 'cPuctMilli', 100, 10000),
      engineId: ENGINE_ID,
      featureCount: FEATURE_COUNT,
      featureLayoutId: Observation.FEATURE_LAYOUT_ID,
      mode: MODE,
      policyVersion: POLICY_VERSION,
      schemaVersion: SCHEMA_VERSION,
      seed: integer(opts.seed == null ? 18427 : opts.seed, 'seed', 0, 4294967295),
      simulations: integer(opts.simulations == null ? DEFAULT_SIMULATIONS : opts.simulations, 'simulations', MIN_SIMULATIONS, MAX_SIMULATIONS),
      upstreamMaskSource: String(opts.upstreamMaskSource || 'explicit-w0o5-projection')
    });
    exactKeys(context, CONTEXT_KEYS, 'Prime shadow context');
    invariant(context.upstreamMaskSource.length > 0 && context.upstreamMaskSource.length <= 96, 'upstreamMaskSource is invalid.');
    return context;
  }

  function contextHash(context) {
    var value = createContext(context);
    return Identity.hash64x2(value);
  }

  function featureHash(packet) {
    return Identity.hash64x2({
      featureCount: packet.featureCount,
      featureLayoutId: packet.featureLayoutId,
      featureVector: packet.featureVector
    });
  }

  function coefficient(actionIndex, featureIndex) {
    var hex = Identity.hash64x2(POLICY_VERSION + '|' + actionIndex + '|' + featureIndex);
    return (parseInt(hex.slice(0, 4), 16) % 255) - 127;
  }

  function featureSignal(packet, actionIndex) {
    var sum = 0;
    for (var i = 0; i < packet.featureVector.length; i++) {
      var q = Math.round(Number(packet.featureVector[i]) * 1000000);
      sum += q * coefficient(actionIndex, i);
    }
    return clampInt(sum / (FEATURE_COUNT * 127), -1000000, 1000000);
  }

  function slotForTarget(packet, target) {
    var section = packet.sections[target.sectionIndex];
    invariant(section, 'Target section is missing from observation.');
    var slot = section.slots[target.slotIndex];
    invariant(slot && slot.recordId === target.recordId && slot.subjectId === target.subjectId, 'Target does not address its canonical observation slot.');
    return slot;
  }

  function targetSemanticScore(actionKey, slot, quantum) {
    var age = Math.max(0, quantum - slot.observedAtQuantum);
    var freshness = slot.persistent ? 64 : Math.max(0, slot.freshUntilQuantumExclusive - quantum);
    var score = Math.max(0, 80000 - age * 8000) + Math.min(64000, freshness * 4000);
    if (slot.acquisitionMode === 'direct') score += 30000;
    if (slot.acquisitionMode === 'shared') score -= 10000;
    switch (actionKey) {
      case 'scout_region':
        if (slot.facts.status === 'blocked') score += 180000;
        else if (slot.facts.status === 'damaged') score += 150000;
        else if (slot.facts.status === 'open') score += 50000;
        break;
      case 'intercept_contact':
        score += 170000;
        if (slot.facts.movementBand === 'fast') score += 70000;
        else if (slot.facts.movementBand === 'slow') score += 30000;
        break;
      case 'fortify_known_route':
        if (slot.facts.status === 'damaged') score += 220000;
        else if (slot.facts.status === 'blocked') score += 180000;
        else score += 30000;
        break;
      case 'repair_known_structure':
        if (slot.facts.statusBand === 'disabled') score += 300000;
        else if (slot.facts.statusBand === 'damaged') score += 240000;
        break;
      case 'share_intelligence':
        score += 90000;
        if (slot.topic === 'combat_alert') score += 110000;
        else if (slot.topic === 'unit_contact') score += 90000;
        else if (slot.topic === 'infrastructure_status') score += 60000;
        break;
      default:
        break;
    }
    return clampInt(score, -1000000, 1000000);
  }

  function actionBias(actionKey) {
    switch (actionKey) {
      case 'stabilize': return 120000;
      case 'scout_region': return 30000;
      case 'intercept_contact': return 50000;
      case 'fortify_known_route': return 40000;
      case 'repair_known_structure': return 60000;
      case 'share_intelligence': return 20000;
      default: return 0;
    }
  }

  function bestTarget(packet, actionView) {
    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < actionView.targets.length; i++) {
      var target = actionView.targets[i];
      var slot = slotForTarget(packet, target);
      var score = targetSemanticScore(actionView.actionKey, slot, packet.quantum);
      if (score > bestScore || (score === bestScore && target.targetId < best.target.targetId)) {
        bestScore = score;
        best = { score: score, target: target };
      }
    }
    return best;
  }

  function actionEvaluations(packet, targetView, legality) {
    var values = [];
    for (var i = 0; i < ACTION_COUNT; i++) {
      var action = Legality.ACTIONS[i];
      var actionView = targetView.actions[i];
      var target = bestTarget(packet, actionView);
      var value = featureSignal(packet, i) + actionBias(action.key) + (target ? target.score : 0);
      value = clampInt(value, -1000000, 1000000);
      values.push({
        actionIndex: i,
        actionKey: action.key,
        label: action.label,
        legal: legality.finalMask[i] === 1,
        targetCount: actionView.targetCount,
        selectedTarget: target ? target.target : null,
        valueMicros: value
      });
    }
    return values;
  }

  function allocatePriors(evaluations) {
    var weights = evaluations.map(function (entry) {
      return entry.legal ? Math.max(1, entry.valueMicros + 1000001) : 0;
    });
    var total = weights.reduce(function (sum, value) { return sum + value; }, 0);
    if (!total) return weights.map(function () { return 0; });
    var priors = weights.map(function (weight) { return Math.floor(weight * 1000000 / total); });
    var used = priors.reduce(function (sum, value) { return sum + value; }, 0);
    var order = evaluations.map(function (entry, index) { return index; }).filter(function (index) { return evaluations[index].legal; });
    order.sort(function (a, b) { return weights[b] - weights[a] || a - b; });
    for (var i = 0; i < 1000000 - used; i++) priors[order[i % order.length]]++;
    return priors;
  }

  function integerSqrtBigInt(value) {
    if (value < 0n) throw new Error('integerSqrt requires nonnegative value.');
    if (value < 2n) return value;
    var x0 = value;
    var x1 = (x0 + value / x0) >> 1n;
    while (x1 < x0) { x0 = x1; x1 = (x0 + value / x0) >> 1n; }
    return x0;
  }

  function deterministicNoise(seed, simulation, actionIndex) {
    var hex = Identity.hash64x2(seed + '|' + simulation + '|' + actionIndex);
    return (parseInt(hex.slice(0, 8), 16) % 10001) - 5000;
  }

  function runRootPuct(evaluations, priors, context) {
    var stats = evaluations.map(function () { return { visits: 0, valueSum: 0 }; });
    var legal = evaluations.map(function (entry, index) { return entry.legal ? index : -1; }).filter(function (index) { return index >= 0; });
    if (!legal.length) return stats;
    for (var simulation = 0; simulation < context.simulations; simulation++) {
      var totalVisits = simulation;
      var sqrtScaled = integerSqrtBigInt(BigInt(totalVisits + 1) * 1000000000000n);
      var bestIndex = legal[0];
      var bestScore = -Infinity;
      for (var j = 0; j < legal.length; j++) {
        var index = legal[j];
        var stat = stats[index];
        var q = stat.visits ? Math.round(stat.valueSum / stat.visits) : 0;
        var exploration = Number((BigInt(context.cPuctMilli) * BigInt(priors[index]) * sqrtScaled) /
          (BigInt(stat.visits + 1) * 1000000000n));
        var tie = ((context.seed ^ Math.imul(index + 1, 2654435761)) >>> 0) % 997;
        var score = q + exploration + tie;
        if (score > bestScore || (score === bestScore && index < bestIndex)) {
          bestScore = score;
          bestIndex = index;
        }
      }
      var rollout = clampInt(evaluations[bestIndex].valueMicros + deterministicNoise(context.seed, simulation, bestIndex), -1000000, 1000000);
      stats[bestIndex].visits++;
      stats[bestIndex].valueSum += rollout;
    }
    return stats;
  }

  function recommendationBody(fields) {
    return Identity.canonicalize({
      actionSpaceId: fields.actionSpaceId,
      authority: fields.authority,
      confidencePpm: fields.confidencePpm,
      contextHash: fields.contextHash,
      contractId: fields.contractId,
      engineId: fields.engineId,
      factionId: fields.factionId,
      featureCount: fields.featureCount,
      featureHash: fields.featureHash,
      featureLayoutId: fields.featureLayoutId,
      finalMaskHash: fields.finalMaskHash,
      legalActionCount: fields.legalActionCount,
      legalityId: fields.legalityId,
      mode: fields.mode,
      observationId: fields.observationId,
      policyVersion: fields.policyVersion,
      quantum: fields.quantum,
      rankedActions: fields.rankedActions,
      registryId: fields.registryId,
      schemaVersion: fields.schemaVersion,
      seed: fields.seed,
      selectedActionIndex: fields.selectedActionIndex,
      selectedActionKey: fields.selectedActionKey,
      selectedSubjectId: fields.selectedSubjectId,
      selectedTargetId: fields.selectedTargetId,
      simulations: fields.simulations,
      targetViewId: fields.targetViewId,
      worldId: fields.worldId
    });
  }

  function recommendationIdFor(body) { return RECOMMENDATION_PREFIX + Identity.hash64x2(body); }

  function createRecommendation(options) {
    var opts = options || {};
    var packet = Observation.validateObservation(opts.observation);
    var targetView = Legality.validateTargetView(opts.targetView, packet);
    var legality = Legality.validateLegality(opts.legality, packet);
    invariant(targetView.targetViewId === legality.targetViewId, 'Target view does not match legality record.');
    invariant(packet.observationId === legality.observationId, 'Observation does not match legality record.');
    var context = createContext(opts.context);
    var evaluations = actionEvaluations(packet, targetView, legality);
    var priors = allocatePriors(evaluations);
    var stats = runRootPuct(evaluations, priors, context);
    var ranked = evaluations.map(function (entry, index) {
      var visits = stats[index].visits;
      var value = visits ? clampInt(stats[index].valueSum / visits, -1000000, 1000000) : entry.valueMicros;
      return Identity.canonicalize({
        actionIndex: index,
        actionKey: entry.actionKey,
        label: entry.label,
        legal: entry.legal,
        priorPpm: priors[index],
        scoreMicros: entry.valueMicros,
        selectedSubjectId: entry.selectedTarget ? entry.selectedTarget.subjectId : null,
        selectedTargetId: entry.selectedTarget ? entry.selectedTarget.targetId : null,
        targetCount: entry.targetCount,
        valueMicros: value,
        visits: visits,
        visitSharePpm: ppm(visits, context.simulations)
      });
    });
    ranked.sort(function (a, b) {
      if (a.legal !== b.legal) return a.legal ? -1 : 1;
      if (a.visits !== b.visits) return b.visits - a.visits;
      if (a.valueMicros !== b.valueMicros) return b.valueMicros - a.valueMicros;
      return a.actionIndex - b.actionIndex;
    });
    var selected = legality.legalActionCount > 0 ? ranked[0] : null;
    var body = recommendationBody({
      actionSpaceId: Legality.ACTION_SPACE_ID,
      authority: AUTHORITY,
      confidencePpm: selected ? selected.visitSharePpm : 0,
      contextHash: contextHash(context),
      contractId: CONTRACT_ID,
      engineId: ENGINE_ID,
      factionId: packet.factionId,
      featureCount: packet.featureCount,
      featureHash: featureHash(packet),
      featureLayoutId: packet.featureLayoutId,
      finalMaskHash: legality.finalMaskHash,
      legalActionCount: legality.legalActionCount,
      legalityId: legality.legalityId,
      mode: MODE,
      observationId: packet.observationId,
      policyVersion: POLICY_VERSION,
      quantum: packet.quantum,
      rankedActions: ranked,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      seed: context.seed,
      selectedActionIndex: selected ? selected.actionIndex : null,
      selectedActionKey: selected ? selected.actionKey : null,
      selectedSubjectId: selected ? selected.selectedSubjectId : null,
      selectedTargetId: selected ? selected.selectedTargetId : null,
      simulations: context.simulations,
      targetViewId: targetView.targetViewId,
      worldId: packet.worldId
    });
    return Identity.canonicalize(Object.assign({}, body, { recommendationId: recommendationIdFor(body) }));
  }

  function validateRecommendation(raw, inputs) {
    exactKeys(raw, RECOMMENDATION_KEYS, 'Prime shadow recommendation');
    invariant(raw.schemaVersion === SCHEMA_VERSION && raw.contractId === CONTRACT_ID && raw.registryId === REGISTRY_ID, 'Unexpected Prime shadow contract.');
    invariant(raw.mode === MODE && raw.authority === AUTHORITY && raw.engineId === ENGINE_ID && raw.policyVersion === POLICY_VERSION, 'Unexpected Prime shadow mode or engine.');
    invariant(isRecommendationId(raw.recommendationId), 'Invalid recommendationId.');
    raw.rankedActions.forEach(function (entry) { exactKeys(entry, RANKED_KEYS, 'ranked action'); });
    var expected = createRecommendation(inputs);
    invariant(Identity.canonicalStringify(raw) === Identity.canonicalStringify(expected), 'Recommendation does not match canonical shadow computation.');
    return expected;
  }

  function normalizeIncumbent(raw) {
    var value = raw || {};
    var available = value.available === true;
    var policyId = String(value.policyId || 'unavailable-incumbent-projection');
    invariant(policyId.length > 0 && policyId.length <= 128, 'incumbent policyId is invalid.');
    if (!available) {
      return { available: false, policyId: policyId, actionIndex: null, actionKey: null, targetId: null, subjectId: null };
    }
    var actionKey = String(value.actionKey || '');
    var actionIndex = -1;
    for (var i = 0; i < Legality.ACTIONS.length; i++) if (Legality.ACTIONS[i].key === actionKey) actionIndex = i;
    invariant(actionIndex >= 0, 'Incumbent actionKey is outside the W0-O.5 action space.');
    var targetId = value.targetId == null ? null : String(value.targetId);
    var subjectId = value.subjectId == null ? null : String(value.subjectId);
    if (Legality.ACTIONS[actionIndex].requiresTarget) invariant(Legality.isTargetId(targetId), 'Incumbent targeted action requires a canonical targetId.');
    else invariant(targetId === null && subjectId === null, 'Targetless incumbent action cannot carry target fields.');
    return { available: true, policyId: policyId, actionIndex: actionIndex, actionKey: actionKey, targetId: targetId, subjectId: subjectId };
  }

  function comparisonBody(fields) {
    return Identity.canonicalize({
      agreement: fields.agreement,
      contractId: CONTRACT_ID,
      incumbentActionIndex: fields.incumbentActionIndex,
      incumbentActionKey: fields.incumbentActionKey,
      incumbentAvailable: fields.incumbentAvailable,
      incumbentPolicyId: fields.incumbentPolicyId,
      incumbentSubjectId: fields.incumbentSubjectId,
      incumbentTargetId: fields.incumbentTargetId,
      mode: MODE,
      recommendationId: fields.recommendationId,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION
    });
  }
  function comparisonIdFor(body) { return COMPARISON_PREFIX + Identity.hash64x2(body); }

  function compareWithIncumbent(rawRecommendation, rawIncumbent) {
    invariant(rawRecommendation && isRecommendationId(rawRecommendation.recommendationId), 'A canonical Prime recommendation is required.');
    var incumbent = normalizeIncumbent(rawIncumbent);
    var agreement = 'unavailable';
    if (incumbent.available) {
      agreement = incumbent.actionIndex === rawRecommendation.selectedActionIndex &&
        incumbent.targetId === rawRecommendation.selectedTargetId ? 'agree' : 'disagree';
    }
    var body = comparisonBody({
      agreement: agreement,
      incumbentActionIndex: incumbent.actionIndex,
      incumbentActionKey: incumbent.actionKey,
      incumbentAvailable: incumbent.available,
      incumbentPolicyId: incumbent.policyId,
      incumbentSubjectId: incumbent.subjectId,
      incumbentTargetId: incumbent.targetId,
      recommendationId: rawRecommendation.recommendationId
    });
    return Identity.canonicalize(Object.assign({}, body, { comparisonId: comparisonIdFor(body) }));
  }

  function validateComparison(raw, recommendation, incumbent) {
    exactKeys(raw, COMPARISON_KEYS, 'Prime shadow comparison');
    invariant(raw.schemaVersion === SCHEMA_VERSION && raw.contractId === CONTRACT_ID && raw.registryId === REGISTRY_ID && raw.mode === MODE, 'Unexpected comparison contract.');
    invariant(isComparisonId(raw.comparisonId), 'Invalid comparisonId.');
    var expected = compareWithIncumbent(recommendation, incumbent);
    invariant(Identity.canonicalStringify(raw) === Identity.canonicalStringify(expected), 'Comparison does not match canonical computation.');
    return expected;
  }

  function entryIdFor(sequence, recommendationId, comparisonId) {
    integer(sequence, 'sequence', 1);
    return ENTRY_PREFIX + sequence + ':' + Identity.hash64x2({ comparisonId: comparisonId, recommendationId: recommendationId, sequence: sequence });
  }

  function PrimeShadowLedger(options) {
    var opts = options || {};
    invariant(typeof opts.worldId === 'string' && opts.worldId.length > 0, 'PrimeShadowLedger requires worldId.');
    this.worldId = opts.worldId;
    this.entries = [];
    this.nextSequence = 1;
  }
  PrimeShadowLedger.prototype.append = function (recommendation, comparison) {
    invariant(recommendation.worldId === this.worldId, 'Recommendation world does not match shadow ledger.');
    invariant(comparison.recommendationId === recommendation.recommendationId, 'Comparison does not address recommendation.');
    var sequence = this.nextSequence++;
    var entry = Identity.canonicalize({
      comparison: clone(comparison),
      entryId: entryIdFor(sequence, recommendation.recommendationId, comparison.comparisonId),
      recommendation: clone(recommendation),
      sequence: sequence
    });
    this.entries.push(entry);
    return clone(entry);
  };
  PrimeShadowLedger.prototype.snapshot = function () {
    return Identity.canonicalize({
      contractId: CONTRACT_ID,
      entries: clone(this.entries),
      nextSequence: this.nextSequence,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      worldId: this.worldId
    });
  };
  PrimeShadowLedger.prototype.hash = function () { return Identity.hash64x2(this.snapshot()); };
  PrimeShadowLedger.prototype.clone = function () { return PrimeShadowLedger.fromSnapshot(this.snapshot()); };
  PrimeShadowLedger.fromSnapshot = function (raw) {
    exactKeys(raw, LEDGER_KEYS, 'Prime shadow ledger snapshot');
    invariant(raw.schemaVersion === SCHEMA_VERSION && raw.contractId === CONTRACT_ID && raw.registryId === REGISTRY_ID, 'Unexpected Prime shadow ledger contract.');
    integer(raw.nextSequence, 'nextSequence', 1);
    invariant(Array.isArray(raw.entries), 'entries must be an array.');
    var ledger = new PrimeShadowLedger({ worldId: raw.worldId });
    var expectedSequence = 1;
    raw.entries.forEach(function (entry) {
      exactKeys(entry, ENTRY_KEYS, 'Prime shadow entry');
      invariant(entry.sequence === expectedSequence, 'Prime shadow sequence gap or reuse.');
      invariant(isEntryId(entry.entryId), 'Invalid Prime shadow entryId.');
      invariant(entry.recommendation.worldId === raw.worldId, 'Prime shadow entry world mismatch.');
      invariant(entry.comparison.recommendationId === entry.recommendation.recommendationId, 'Prime shadow comparison mismatch.');
      invariant(entry.entryId === entryIdFor(entry.sequence, entry.recommendation.recommendationId, entry.comparison.comparisonId), 'Prime shadow entryId tamper detected.');
      ledger.entries.push(clone(entry));
      expectedSequence++;
    });
    invariant(raw.nextSequence === expectedSequence, 'Prime shadow nextSequence mismatch.');
    ledger.nextSequence = raw.nextSequence;
    return ledger;
  };

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_ID: CONTRACT_ID,
    REGISTRY_ID: REGISTRY_ID,
    ENGINE_ID: ENGINE_ID,
    POLICY_VERSION: POLICY_VERSION,
    MODE: MODE,
    AUTHORITY: AUTHORITY,
    ACTION_COUNT: ACTION_COUNT,
    FEATURE_COUNT: FEATURE_COUNT,
    DEFAULT_SIMULATIONS: DEFAULT_SIMULATIONS,
    DEFAULT_CPUCT_MILLI: DEFAULT_CPUCT_MILLI,
    isRecommendationId: isRecommendationId,
    isComparisonId: isComparisonId,
    isEntryId: isEntryId,
    createContext: createContext,
    contextHash: contextHash,
    featureHash: featureHash,
    createRecommendation: createRecommendation,
    validateRecommendation: validateRecommendation,
    compareWithIncumbent: compareWithIncumbent,
    validateComparison: validateComparison,
    PrimeShadowLedger: PrimeShadowLedger
  });
});
