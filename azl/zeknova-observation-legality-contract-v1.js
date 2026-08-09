/*
 * ZekNova Observation Legality Contract v1
 * W0-O.5: deterministic action/target legality derived only from W0-O.3 observations.
 *
 * Universal module. Exact same bytes install in ZekNova and Sentinel Grid.
 * Requires W0-O.0 identity and W0-O.3 faction-observation contracts.
 * No authoritative-world reads, action execution, wall clock, DOM, Three.js, or storage.
 */
(function (root, factory) {
  var api = factory(root.ZekNovaIdentityContract, root.ZekNovaFactionObservationContract);
  root.ZekNovaObservationLegalityContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Observation) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') {
    throw new Error('ZekNova Observation Legality requires zeknova-identity-contract-v1.');
  }
  if (!Observation || Observation.CONTRACT_ID !== 'zeknova-faction-observation-contract-v1') {
    throw new Error('ZekNova Observation Legality requires zeknova-faction-observation-contract-v1.');
  }

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-observation-legality-contract-v1';
  var REGISTRY_ID = 'zeknova-observation-legality-v1-development';
  var ACTION_SPACE_ID = 'zeknova-observation-action-space-v1-development';
  var MASK_VERSION = 1;
  var TARGET_PREFIX = 'zktg:v1:';
  var TARGET_VIEW_PREFIX = 'zktv:v1:';
  var LEGALITY_PREFIX = 'zkol:v1:';

  var ACTIONS = Object.freeze([
    Object.freeze({ index: 0, key: 'stabilize', label: 'Stabilize', interrupt: true, safeFallback: true, requiresTarget: false, targetTopics: Object.freeze([]) }),
    Object.freeze({ index: 1, key: 'scout_region', label: 'Scout Known Route', interrupt: false, safeFallback: false, requiresTarget: true, targetTopics: Object.freeze(['route_status']) }),
    Object.freeze({ index: 2, key: 'intercept_contact', label: 'Intercept Contact', interrupt: false, safeFallback: false, requiresTarget: true, targetTopics: Object.freeze(['unit_contact']) }),
    Object.freeze({ index: 3, key: 'fortify_known_route', label: 'Fortify Known Route', interrupt: false, safeFallback: false, requiresTarget: true, targetTopics: Object.freeze(['route_status']) }),
    Object.freeze({ index: 4, key: 'repair_known_structure', label: 'Repair Known Structure', interrupt: false, safeFallback: false, requiresTarget: true, targetTopics: Object.freeze(['structure_status']) }),
    Object.freeze({ index: 5, key: 'share_intelligence', label: 'Share Intelligence', interrupt: false, safeFallback: false, requiresTarget: true, targetTopics: Object.freeze(Observation.TOPIC_ORDER.slice()) })
  ]);
  var ACTION_COUNT = ACTIONS.length;
  var SAFE_FALLBACK_INDEX = 0;

  var TARGET_KEYS = Object.freeze([
    'acquisitionMode', 'actionIndex', 'actionKey', 'observedAtQuantum', 'persistent',
    'recordId', 'sectionIndex', 'slotIndex', 'subjectId', 'targetId', 'topic'
  ]);
  var ACTION_VIEW_KEYS = Object.freeze([
    'actionIndex', 'actionKey', 'eligibleWithoutTarget', 'omittedSourceRecordCount', 'targetCount', 'targets'
  ]);
  var TARGET_VIEW_KEYS = Object.freeze([
    'actionSpaceId', 'actions', 'contractId', 'factionId', 'observationId', 'quantum',
    'registryId', 'schemaVersion', 'targetViewId', 'worldId'
  ]);
  var LEGALITY_KEYS = Object.freeze([
    'actionSpaceId', 'contractId', 'factionId', 'finalBitsetHex', 'finalMask', 'finalMaskHash',
    'legalActionCount', 'legalityId', 'maskVersion', 'observationBitsetHex', 'observationId',
    'observationMask', 'observationMaskHash', 'quantum', 'reasons', 'registryId',
    'replanBoundary', 'safeFallbackLegal', 'schemaVersion', 'targetCounts', 'targetViewId',
    'terminal', 'upstreamBitsetHex', 'upstreamMask', 'upstreamMaskHash', 'worldId'
  ]);
  var STATE_KEYS = Object.freeze(['contractId', 'observation', 'replanBoundary', 'schemaVersion', 'terminal', 'upstreamMask']);

  function invariant(condition, message) { if (!condition) throw new Error(message); }
  function clone(value) { return Identity.stableClone(value); }
  function exactKeys(object, keys, label) {
    invariant(object && Object.prototype.toString.call(object) === '[object Object]', label + ' must be a plain object.');
    var actual = Object.keys(object).sort();
    var expected = keys.slice().sort();
    invariant(JSON.stringify(actual) === JSON.stringify(expected), label + ' has unexpected or missing fields.');
  }
  function integer(value, label, minimum) {
    var n = Number(value);
    invariant(Number.isSafeInteger(n), label + ' must be a safe integer.');
    invariant(n >= (minimum == null ? 0 : minimum), label + ' is below minimum.');
    return n;
  }
  function boolean(value, label) { invariant(typeof value === 'boolean', label + ' must be boolean.'); return value; }
  function actionAt(index) { integer(index, 'actionIndex', 0); invariant(index < ACTION_COUNT, 'actionIndex is outside action space.'); return ACTIONS[index]; }

  function normalizeMask(raw, label) {
    invariant(Array.isArray(raw) || ArrayBuffer.isView(raw), label + ' must be an array or typed array.');
    invariant(raw.length === ACTION_COUNT, label + ' must have exactly ' + ACTION_COUNT + ' bits.');
    var out = [];
    for (var i = 0; i < ACTION_COUNT; i++) {
      var bit = Number(raw[i]);
      invariant(bit === 0 || bit === 1, label + '[' + i + '] must be 0 or 1.');
      out.push(bit);
    }
    return out;
  }

  function maskBitsetHex(mask) {
    var bits = normalizeMask(mask, 'mask');
    var value = 0;
    for (var i = 0; i < bits.length; i++) if (bits[i]) value |= (1 << i);
    return ('0' + value.toString(16)).slice(-2);
  }
  function maskHash(layer, mask) {
    return Identity.hash64x2({ actionSpaceId: ACTION_SPACE_ID, bitsetHex: maskBitsetHex(mask), layer: String(layer), maskVersion: MASK_VERSION });
  }

  function isTargetId(value) { return typeof value === 'string' && /^zktg:v1:[0-9a-f]{16}$/.test(value); }
  function isTargetViewId(value) { return typeof value === 'string' && /^zktv:v1:[0-9a-f]{16}$/.test(value); }
  function isLegalityId(value) { return typeof value === 'string' && /^zkol:v1:[0-9a-f]{16}$/.test(value); }

  function targetIdFor(observationId, actionIndex, recordId) {
    actionAt(actionIndex);
    invariant(Observation.isObservationId(observationId), 'Invalid observationId for target.');
    invariant(typeof recordId === 'string' && recordId.length > 0, 'recordId is required for target.');
    return TARGET_PREFIX + Identity.hash64x2({ actionIndex: actionIndex, actionSpaceId: ACTION_SPACE_ID, observationId: observationId, recordId: recordId });
  }

  function eligibleSlot(action, slot) {
    if (!slot) return false;
    if (action.targetTopics.indexOf(slot.topic) < 0) return false;
    switch (action.key) {
      case 'stabilize': return false;
      case 'scout_region': return slot.topic === 'route_status';
      case 'intercept_contact': return slot.topic === 'unit_contact' && slot.facts && slot.facts.hostility === 'hostile';
      case 'fortify_known_route': return slot.topic === 'route_status';
      case 'repair_known_structure': return slot.topic === 'structure_status' && slot.facts && ['damaged', 'disabled'].indexOf(slot.facts.statusBand) >= 0;
      case 'share_intelligence': return slot.acquisitionMode === 'direct';
      default: throw new Error('Unknown action key: ' + action.key);
    }
  }

  function targetFromSlot(packet, action, slot, sectionIndex, slotIndex) {
    return Identity.canonicalize({
      acquisitionMode: slot.acquisitionMode,
      actionIndex: action.index,
      actionKey: action.key,
      observedAtQuantum: slot.observedAtQuantum,
      persistent: slot.persistent,
      recordId: slot.recordId,
      sectionIndex: sectionIndex,
      slotIndex: slotIndex,
      subjectId: slot.subjectId,
      targetId: targetIdFor(packet.observationId, action.index, slot.recordId),
      topic: slot.topic
    });
  }

  function targetViewBody(fields) {
    return Identity.canonicalize({
      actionSpaceId: fields.actionSpaceId,
      actions: fields.actions,
      contractId: fields.contractId,
      factionId: fields.factionId,
      observationId: fields.observationId,
      quantum: fields.quantum,
      registryId: fields.registryId,
      schemaVersion: fields.schemaVersion,
      worldId: fields.worldId
    });
  }
  function targetViewIdFor(body) { return TARGET_VIEW_PREFIX + Identity.hash64x2(body); }

  function buildTargetView(rawObservation) {
    var packet = Observation.validateObservation(rawObservation);
    var actions = ACTIONS.map(function (action) {
      var targets = [];
      var omitted = 0;
      packet.sections.forEach(function (section, sectionIndex) {
        if (action.targetTopics.indexOf(section.topic) < 0) return;
        omitted += section.omittedFreshRecords;
        section.slots.forEach(function (slot, slotIndex) {
          if (eligibleSlot(action, slot)) targets.push(targetFromSlot(packet, action, slot, sectionIndex, slotIndex));
        });
      });
      targets.sort(function (a, b) {
        if (a.observedAtQuantum !== b.observedAtQuantum) return b.observedAtQuantum - a.observedAtQuantum;
        return a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0;
      });
      return Identity.canonicalize({
        actionIndex: action.index,
        actionKey: action.key,
        eligibleWithoutTarget: !action.requiresTarget,
        omittedSourceRecordCount: omitted,
        targetCount: targets.length,
        targets: targets
      });
    });
    var body = targetViewBody({
      actionSpaceId: ACTION_SPACE_ID,
      actions: actions,
      contractId: CONTRACT_ID,
      factionId: packet.factionId,
      observationId: packet.observationId,
      quantum: packet.quantum,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      worldId: packet.worldId
    });
    return Identity.canonicalize(Object.assign({}, body, { targetViewId: targetViewIdFor(body) }));
  }

  function validateTarget(raw, packet, action, seen) {
    exactKeys(raw, TARGET_KEYS, 'legal target');
    invariant(raw.actionIndex === action.index && raw.actionKey === action.key, 'Target action binding mismatch.');
    invariant(isTargetId(raw.targetId), 'Invalid targetId.');
    invariant(raw.targetId === targetIdFor(packet.observationId, action.index, raw.recordId), 'Target ID does not match canonical target body.');
    invariant(!seen[raw.targetId], 'Duplicate targetId.'); seen[raw.targetId] = true;
    integer(raw.sectionIndex, 'sectionIndex', 0); integer(raw.slotIndex, 'slotIndex', 0); integer(raw.observedAtQuantum, 'observedAtQuantum', 0);
    invariant(raw.sectionIndex < packet.sections.length, 'Target sectionIndex is outside observation.');
    var section = packet.sections[raw.sectionIndex];
    invariant(raw.slotIndex < section.slots.length, 'Target slotIndex is outside observation.');
    var slot = section.slots[raw.slotIndex];
    invariant(slot != null, 'Target points to an empty observation slot.');
    invariant(eligibleSlot(action, slot), 'Target points to an ineligible observation slot.');
    invariant(raw.recordId === slot.recordId && raw.subjectId === slot.subjectId && raw.topic === slot.topic, 'Target does not match observation slot identity.');
    invariant(raw.acquisitionMode === slot.acquisitionMode && raw.persistent === slot.persistent && raw.observedAtQuantum === slot.observedAtQuantum, 'Target does not match observation slot metadata.');
    return Identity.canonicalize(raw);
  }

  function validateTargetView(raw, rawObservation) {
    var packet = Observation.validateObservation(rawObservation);
    exactKeys(raw, TARGET_VIEW_KEYS, 'legal target view');
    invariant(raw.schemaVersion === SCHEMA_VERSION && raw.contractId === CONTRACT_ID && raw.registryId === REGISTRY_ID, 'Unexpected target view contract.');
    invariant(raw.actionSpaceId === ACTION_SPACE_ID, 'Unexpected target view action space.');
    invariant(raw.worldId === packet.worldId && raw.factionId === packet.factionId && raw.quantum === packet.quantum && raw.observationId === packet.observationId, 'Target view does not address its observation.');
    invariant(Array.isArray(raw.actions) && raw.actions.length === ACTION_COUNT, 'Target view must declare every action.');
    var actions = raw.actions.map(function (entry, index) {
      exactKeys(entry, ACTION_VIEW_KEYS, 'target action view');
      var action = actionAt(index);
      invariant(entry.actionIndex === index && entry.actionKey === action.key, 'Target action order mismatch.');
      invariant(entry.eligibleWithoutTarget === !action.requiresTarget, 'eligibleWithoutTarget mismatch.');
      integer(entry.omittedSourceRecordCount, 'omittedSourceRecordCount', 0);
      integer(entry.targetCount, 'targetCount', 0);
      invariant(Array.isArray(entry.targets) && entry.targets.length === entry.targetCount, 'targetCount mismatch.');
      var seen = {};
      var targets = entry.targets.map(function (target) { return validateTarget(target, packet, action, seen); });
      return Identity.canonicalize({ actionIndex: index, actionKey: action.key, eligibleWithoutTarget: entry.eligibleWithoutTarget, omittedSourceRecordCount: entry.omittedSourceRecordCount, targetCount: targets.length, targets: targets });
    });
    var body = targetViewBody({ actionSpaceId: ACTION_SPACE_ID, actions: actions, contractId: CONTRACT_ID, factionId: packet.factionId, observationId: packet.observationId, quantum: packet.quantum, registryId: REGISTRY_ID, schemaVersion: SCHEMA_VERSION, worldId: packet.worldId });
    invariant(isTargetViewId(raw.targetViewId), 'Invalid targetViewId.');
    invariant(raw.targetViewId === targetViewIdFor(body), 'Target view ID does not match canonical body.');
    var canonical = Identity.canonicalize(Object.assign({}, body, { targetViewId: raw.targetViewId }));
    invariant(Identity.canonicalStringify(canonical) === Identity.canonicalStringify(buildTargetView(packet)), 'Target view does not match canonical observation projection.');
    return canonical;
  }

  function observationMaskForView(view) {
    return ACTIONS.map(function (action, index) { return action.requiresTarget ? (view.actions[index].targetCount > 0 ? 1 : 0) : 1; });
  }
  function observationReason(action, count) {
    if (!action.requiresTarget || count > 0) return null;
    switch (action.key) {
      case 'scout_region': return 'no_known_route';
      case 'intercept_contact': return 'no_fresh_hostile_contact';
      case 'fortify_known_route': return 'no_known_route';
      case 'repair_known_structure': return 'no_repairable_structure';
      case 'share_intelligence': return 'no_shareable_direct_record';
      default: return 'no_eligible_target';
    }
  }

  function legalityBody(fields) {
    return Identity.canonicalize({
      actionSpaceId: fields.actionSpaceId, contractId: fields.contractId, factionId: fields.factionId,
      finalBitsetHex: fields.finalBitsetHex, finalMask: fields.finalMask, finalMaskHash: fields.finalMaskHash,
      legalActionCount: fields.legalActionCount, maskVersion: fields.maskVersion,
      observationBitsetHex: fields.observationBitsetHex, observationId: fields.observationId,
      observationMask: fields.observationMask, observationMaskHash: fields.observationMaskHash,
      quantum: fields.quantum, reasons: fields.reasons, registryId: fields.registryId,
      replanBoundary: fields.replanBoundary, safeFallbackLegal: fields.safeFallbackLegal,
      schemaVersion: fields.schemaVersion, targetCounts: fields.targetCounts, targetViewId: fields.targetViewId,
      terminal: fields.terminal, upstreamBitsetHex: fields.upstreamBitsetHex,
      upstreamMask: fields.upstreamMask, upstreamMaskHash: fields.upstreamMaskHash, worldId: fields.worldId
    });
  }
  function legalityIdFor(body) { return LEGALITY_PREFIX + Identity.hash64x2(body); }

  function computeLegality(options) {
    var opts = options || {};
    var packet = Observation.validateObservation(opts.observation);
    var upstream = normalizeMask(opts.upstreamMask, 'upstreamMask');
    var terminal = opts.terminal === undefined ? false : boolean(opts.terminal, 'terminal');
    var replanBoundary = opts.replanBoundary === undefined ? false : boolean(opts.replanBoundary, 'replanBoundary');
    if (!terminal && !replanBoundary) invariant(upstream[SAFE_FALLBACK_INDEX] === 1, 'Nonterminal upstream mask must retain declared safe fallback stabilize.');
    var view = buildTargetView(packet);
    var observationMask = observationMaskForView(view);
    var finalMask = [];
    var reasons = [];
    for (var i = 0; i < ACTION_COUNT; i++) {
      var legal = terminal || replanBoundary ? 0 : (upstream[i] && observationMask[i] ? 1 : 0);
      finalMask.push(legal);
      if (terminal) reasons.push('terminal');
      else if (replanBoundary) reasons.push('replan_boundary');
      else if (!upstream[i]) reasons.push('upstream_mask');
      else reasons.push(observationReason(ACTIONS[i], view.actions[i].targetCount));
    }
    var body = legalityBody({
      actionSpaceId: ACTION_SPACE_ID,
      contractId: CONTRACT_ID,
      factionId: packet.factionId,
      finalBitsetHex: maskBitsetHex(finalMask),
      finalMask: finalMask,
      finalMaskHash: maskHash('final', finalMask),
      legalActionCount: finalMask.reduce(function (sum, bit) { return sum + bit; }, 0),
      maskVersion: MASK_VERSION,
      observationBitsetHex: maskBitsetHex(observationMask),
      observationId: packet.observationId,
      observationMask: observationMask,
      observationMaskHash: maskHash('observation', observationMask),
      quantum: packet.quantum,
      reasons: reasons,
      registryId: REGISTRY_ID,
      replanBoundary: replanBoundary,
      safeFallbackLegal: finalMask[SAFE_FALLBACK_INDEX] === 1,
      schemaVersion: SCHEMA_VERSION,
      targetCounts: view.actions.map(function (entry) { return entry.targetCount; }),
      targetViewId: view.targetViewId,
      terminal: terminal,
      upstreamBitsetHex: maskBitsetHex(upstream),
      upstreamMask: upstream,
      upstreamMaskHash: maskHash('upstream', upstream),
      worldId: packet.worldId
    });
    return Identity.canonicalize(Object.assign({}, body, { legalityId: legalityIdFor(body) }));
  }

  function validateLegality(raw, rawObservation) {
    exactKeys(raw, LEGALITY_KEYS, 'observation legality record');
    invariant(raw.schemaVersion === SCHEMA_VERSION && raw.contractId === CONTRACT_ID && raw.registryId === REGISTRY_ID, 'Unexpected legality contract.');
    invariant(raw.actionSpaceId === ACTION_SPACE_ID && raw.maskVersion === MASK_VERSION, 'Unexpected legality action space or mask version.');
    invariant(isLegalityId(raw.legalityId), 'Invalid legalityId.');
    var expected = computeLegality({ observation: rawObservation, upstreamMask: raw.upstreamMask, terminal: raw.terminal, replanBoundary: raw.replanBoundary });
    invariant(Identity.canonicalStringify(raw) === Identity.canonicalStringify(expected), 'Legality record does not match canonical computation.');
    return expected;
  }

  function selectTarget(rawView, rawObservation, actionIndex, targetId) {
    var view = validateTargetView(rawView, rawObservation);
    var action = actionAt(actionIndex);
    invariant(action.requiresTarget, 'Action does not accept a target.');
    invariant(isTargetId(targetId), 'Invalid targetId.');
    var targets = view.actions[actionIndex].targets;
    for (var i = 0; i < targets.length; i++) if (targets[i].targetId === targetId) return clone(targets[i]);
    throw new Error('Target is not present in the canonical legal target view.');
  }

  function ObservationLegalityState(options) {
    var opts = options || {};
    this.observation = Observation.validateObservation(opts.observation);
    this.upstreamMask = new Uint8Array(normalizeMask(opts.upstreamMask, 'upstreamMask'));
    this.terminal = opts.terminal === undefined ? false : boolean(opts.terminal, 'terminal');
    this.replanBoundary = opts.replanBoundary === undefined ? false : boolean(opts.replanBoundary, 'replanBoundary');
    computeLegality({ observation: this.observation, upstreamMask: this.upstreamMask, terminal: this.terminal, replanBoundary: this.replanBoundary });
  }
  ObservationLegalityState.prototype.snapshot = function () {
    return Identity.canonicalize({ contractId: CONTRACT_ID, observation: clone(this.observation), replanBoundary: this.replanBoundary, schemaVersion: SCHEMA_VERSION, terminal: this.terminal, upstreamMask: Array.from(this.upstreamMask) });
  };
  ObservationLegalityState.prototype.clone = function () { return ObservationLegalityState.fromSnapshot(this.snapshot()); };
  ObservationLegalityState.prototype.targetView = function () { return buildTargetView(this.observation); };
  ObservationLegalityState.prototype.record = function () { return computeLegality({ observation: this.observation, upstreamMask: this.upstreamMask, terminal: this.terminal, replanBoundary: this.replanBoundary }); };
  ObservationLegalityState.prototype.withObservation = function (observation) { return new ObservationLegalityState({ observation: observation, upstreamMask: this.upstreamMask, terminal: this.terminal, replanBoundary: this.replanBoundary }); };
  ObservationLegalityState.fromSnapshot = function (raw) {
    exactKeys(raw, STATE_KEYS, 'observation legality state');
    invariant(raw.contractId === CONTRACT_ID && raw.schemaVersion === SCHEMA_VERSION, 'Unexpected observation legality state contract.');
    return new ObservationLegalityState(raw);
  };

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION, CONTRACT_ID: CONTRACT_ID, REGISTRY_ID: REGISTRY_ID,
    ACTION_SPACE_ID: ACTION_SPACE_ID, MASK_VERSION: MASK_VERSION, TARGET_PREFIX: TARGET_PREFIX,
    TARGET_VIEW_PREFIX: TARGET_VIEW_PREFIX, LEGALITY_PREFIX: LEGALITY_PREFIX,
    ACTIONS: ACTIONS, ACTION_COUNT: ACTION_COUNT, SAFE_FALLBACK_INDEX: SAFE_FALLBACK_INDEX,
    isTargetId: isTargetId, isTargetViewId: isTargetViewId, isLegalityId: isLegalityId,
    targetIdFor: targetIdFor, targetViewIdFor: targetViewIdFor, legalityIdFor: legalityIdFor,
    maskBitsetHex: maskBitsetHex, maskHash: maskHash, buildTargetView: buildTargetView,
    validateTargetView: validateTargetView, computeLegality: computeLegality,
    validateLegality: validateLegality, selectTarget: selectTarget,
    ObservationLegalityState: ObservationLegalityState
  });
});
