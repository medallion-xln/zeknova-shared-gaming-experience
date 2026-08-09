/*
 * ZekNova Faction Observation Contract v1
 * W0-O.3: canonical, deterministic, faction-private observation packets for Prime.
 *
 * Universal module. The exact same bytes are installed in ZekNova and Sentinel Grid.
 * Requires W0-O.0 identity and W0-O.2 knowledge-ledger contracts.
 * No DOM, Three.js, wall clock, storage, authoritative-world, or action-legality access.
 */
(function (root, factory) {
  var api = factory(root.ZekNovaIdentityContract, root.ZekNovaKnowledgeLedgerContract);
  root.ZekNovaFactionObservationContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Knowledge) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') {
    throw new Error('ZekNova Faction Observation requires zeknova-identity-contract-v1.');
  }
  if (!Knowledge || Knowledge.CONTRACT_ID !== 'zeknova-knowledge-ledger-contract-v1') {
    throw new Error('ZekNova Faction Observation requires zeknova-knowledge-ledger-contract-v1.');
  }

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-faction-observation-contract-v1';
  var REGISTRY_ID = 'zeknova-faction-observation-v1-development';
  var OBSERVATION_PREFIX = 'zkob:v1:';
  var FEATURE_LAYOUT_ID = 'zeknova-prime-observation-layout-v1';
  var HEADER_WIDTH = 16;
  var SLOT_WIDTH = 16;
  var POSITION_SCALE_CELLS = 256;
  var MAX_AGE_QUANTA = 64;
  var MAX_CONTRADICTIONS = 8;

  var TOPIC_ORDER = Object.freeze(Knowledge.TOPICS.slice());
  var SLOT_CAPACITIES = Object.freeze({
    unit_contact: 8,
    combat_alert: 4,
    structure_status: 8,
    resource_location: 8,
    route_status: 4,
    infrastructure_status: 4
  });
  var TOTAL_SLOTS = TOPIC_ORDER.reduce(function (sum, topic) { return sum + SLOT_CAPACITIES[topic]; }, 0);
  var FEATURE_COUNT = HEADER_WIDTH + TOTAL_SLOTS * SLOT_WIDTH;

  var SLOT_KEYS = Object.freeze([
    'acquisitionMode', 'contradictionCount', 'deliveredAtQuantum', 'eventType', 'facts',
    'freshUntilQuantumExclusive', 'observedAtQuantum', 'persistent', 'recordId',
    'sharedFromFactionId', 'sourceEntityId', 'sourceFactionId', 'sourceType',
    'subjectId', 'topic'
  ]);
  var SECTION_KEYS = Object.freeze(['capacity', 'omittedFreshRecords', 'slots', 'topic', 'totalFreshRecords']);
  var OBSERVATION_KEYS = Object.freeze([
    'contractId', 'factionId', 'featureCount', 'featureLayoutId', 'featureVector',
    'observationId', 'omittedFreshRecordCount', 'quantum', 'registryId', 'schemaVersion',
    'sections', 'selectedFreshRecordCount', 'totalFreshRecordCount', 'worldId'
  ]);

  function invariant(condition, message) {
    if (!condition) throw new Error(message);
  }

  function integer(value, label, minimum) {
    var number = Number(value);
    invariant(Number.isSafeInteger(number), label + ' must be a safe integer.');
    invariant(number >= (minimum == null ? 0 : minimum), label + ' is below its allowed minimum.');
    return number;
  }

  function exactKeys(object, keys, label) {
    invariant(object && Object.prototype.toString.call(object) === '[object Object]', label + ' must be a plain object.');
    var actual = Object.keys(object).sort();
    var expected = keys.slice().sort();
    invariant(JSON.stringify(actual) === JSON.stringify(expected), label + ' has unexpected or missing fields. Expected [' + expected.join(', ') + '], got [' + actual.join(', ') + '].');
  }

  function enumValue(value, label, choices) {
    var out = String(value);
    invariant(choices.indexOf(out) >= 0, label + ' must be one of [' + choices.join(', ') + '].');
    return out;
  }

  function positionCell(value, label) {
    exactKeys(value, ['x', 'y', 'z'], label);
    return Identity.canonicalize({
      x: integer(value.x, label + '.x', -1000000),
      y: integer(value.y, label + '.y', -1000000),
      z: integer(value.z, label + '.z', -1000000)
    });
  }

  function finiteFeature(value) {
    var number = Number(value);
    invariant(Number.isFinite(number), 'Observation feature must be finite.');
    number = Math.max(-1, Math.min(1, number));
    number = Math.round(number * 1000000) / 1000000;
    return Object.is(number, -0) ? 0 : number;
  }

  function ratio(value, scale) {
    return finiteFeature(Number(value) / Number(scale));
  }

  function enumNorm(value, choices) {
    if (value == null) return 0;
    var index = choices.indexOf(String(value));
    if (index < 0) return 0;
    if (choices.length === 1) return 1;
    return finiteFeature((index / (choices.length - 1)) * 2 - 1);
  }

  function hashPair(value) {
    var hex = Identity.hash64x2(String(value == null ? '' : value));
    var high = parseInt(hex.slice(0, 8), 16) >>> 0;
    var low = parseInt(hex.slice(8, 16), 16) >>> 0;
    var divisor = 4294967295;
    return [finiteFeature((high / divisor) * 2 - 1), finiteFeature((low / divisor) * 2 - 1)];
  }

  function featureSpec() {
    var out = ['header.bias', 'header.quantum_norm', 'header.selected_fresh_norm', 'header.omitted_fresh_norm'];
    TOPIC_ORDER.forEach(function (topic) {
      out.push('header.' + topic + '.fresh_norm');
      out.push('header.' + topic + '.omitted_norm');
    });
    TOPIC_ORDER.forEach(function (topic) {
      for (var slot = 0; slot < SLOT_CAPACITIES[topic]; slot++) {
        var prefix = 'slot.' + topic + '.' + slot + '.';
        [
          'present', 'age_norm', 'freshness_remaining_norm', 'persistent',
          'direct', 'shared', 'contradiction_norm', 'position_x_norm',
          'position_y_norm', 'position_z_norm', 'primary_code_norm',
          'secondary_code_norm', 'category_hash_high', 'category_hash_low',
          'subject_hash_high', 'subject_hash_low'
        ].forEach(function (name) { out.push(prefix + name); });
      }
    });
    invariant(out.length === FEATURE_COUNT, 'Feature specification length mismatch.');
    return Object.freeze(out);
  }
  var FEATURE_SPEC = featureSpec();

  function isObservationId(value) {
    return typeof value === 'string' && /^zkob:v1:[0-9a-f]{16}$/.test(value);
  }

  function clone(value) {
    return Identity.stableClone(value);
  }

  function factsPosition(facts) {
    return facts.positionCell || facts.observedCell || facts.lastKnownPositionCell || { x: 0, y: 0, z: 0 };
  }

  function factsCodes(slot, factionId) {
    var facts = slot.facts;
    var primary = 0;
    var secondary = 0;
    var category = slot.eventType;
    switch (slot.topic) {
      case 'unit_contact':
        primary = enumNorm(facts.hostility, ['unknown', 'friendly', 'neutral', 'hostile']);
        secondary = enumNorm(facts.movementBand, ['unknown', 'stationary', 'slow', 'fast']);
        category = facts.classification;
        break;
      case 'combat_alert':
        primary = enumNorm(facts.severity, ['low', 'medium', 'high', 'critical']);
        secondary = enumNorm(facts.contactRole, ['unknown', 'attacker', 'defender']);
        category = facts.contactRole;
        break;
      case 'structure_status':
        primary = enumNorm(facts.statusBand, ['unknown', 'operational', 'damaged', 'disabled', 'destroyed']);
        secondary = facts.observedOwnerFactionId == null ? 0 : (facts.observedOwnerFactionId === factionId ? 1 : -1);
        category = facts.structureKind || facts.damageBand || facts.confirmation || slot.eventType;
        break;
      case 'resource_location':
        primary = enumNorm(facts.abundanceBand, ['unknown', 'trace', 'low', 'medium', 'high']);
        category = facts.resourceKind;
        break;
      case 'route_status':
        primary = enumNorm(facts.status, ['unknown', 'open', 'blocked', 'damaged']);
        category = facts.status;
        break;
      case 'infrastructure_status':
        primary = enumNorm(facts.status, ['unknown', 'operational', 'degraded', 'offline', 'destroyed']);
        category = facts.infrastructureKind;
        break;
      default:
        throw new Error('Unknown observation topic: ' + slot.topic);
    }
    return { primary: finiteFeature(primary), secondary: finiteFeature(secondary), category: String(category || '') };
  }

  function slotFeatures(slot, quantum, factionId) {
    if (slot == null) return new Array(SLOT_WIDTH).fill(0);
    var position = factsPosition(slot.facts);
    var codes = factsCodes(slot, factionId);
    var categoryHash = hashPair(codes.category);
    var subjectHash = hashPair(slot.subjectId);
    var remaining = slot.persistent ? MAX_AGE_QUANTA : Math.max(0, slot.freshUntilQuantumExclusive - quantum);
    return [
      1,
      ratio(Math.min(MAX_AGE_QUANTA, Math.max(0, quantum - slot.observedAtQuantum)), MAX_AGE_QUANTA),
      ratio(Math.min(MAX_AGE_QUANTA, remaining), MAX_AGE_QUANTA),
      slot.persistent ? 1 : 0,
      slot.acquisitionMode === 'direct' ? 1 : 0,
      slot.acquisitionMode === 'shared' ? 1 : 0,
      ratio(Math.min(MAX_CONTRADICTIONS, slot.contradictionCount), MAX_CONTRADICTIONS),
      ratio(Math.max(-POSITION_SCALE_CELLS, Math.min(POSITION_SCALE_CELLS, position.x)), POSITION_SCALE_CELLS),
      ratio(Math.max(-POSITION_SCALE_CELLS, Math.min(POSITION_SCALE_CELLS, position.y)), POSITION_SCALE_CELLS),
      ratio(Math.max(-POSITION_SCALE_CELLS, Math.min(POSITION_SCALE_CELLS, position.z)), POSITION_SCALE_CELLS),
      codes.primary,
      codes.secondary,
      categoryHash[0],
      categoryHash[1],
      subjectHash[0],
      subjectHash[1]
    ].map(finiteFeature);
  }

  function buildFeatureVector(sections, quantum, factionId) {
    var selected = 0;
    var omitted = 0;
    sections.forEach(function (section) {
      selected += section.slots.filter(function (slot) { return slot != null; }).length;
      omitted += section.omittedFreshRecords;
    });
    var features = [
      1,
      ratio(Math.min(4096, quantum), 4096),
      ratio(selected, TOTAL_SLOTS),
      ratio(Math.min(TOTAL_SLOTS, omitted), TOTAL_SLOTS)
    ];
    sections.forEach(function (section) {
      features.push(ratio(Math.min(section.capacity, section.totalFreshRecords), section.capacity));
      features.push(ratio(Math.min(section.capacity, section.omittedFreshRecords), section.capacity));
    });
    sections.forEach(function (section) {
      section.slots.forEach(function (slot) {
        features = features.concat(slotFeatures(slot, quantum, factionId));
      });
    });
    invariant(features.length === FEATURE_COUNT, 'Feature vector length mismatch.');
    return features.map(finiteFeature);
  }

  function eventTopic(eventType) {
    var policy = Knowledge.EVENT_POLICIES[eventType];
    invariant(policy, 'Observation event type is outside the knowledge policy: ' + eventType);
    return policy.topic;
  }

  function slotFromRecord(record) {
    var evidence = record.currentEvidence;
    return Identity.canonicalize({
      acquisitionMode: evidence.acquisitionMode,
      contradictionCount: record.contradictionCount,
      deliveredAtQuantum: evidence.deliveredAtQuantum,
      eventType: evidence.eventType,
      facts: clone(record.currentFacts),
      freshUntilQuantumExclusive: evidence.freshUntilQuantumExclusive,
      observedAtQuantum: evidence.effectiveObservedAtQuantum,
      persistent: evidence.persistent,
      recordId: record.recordId,
      sharedFromFactionId: evidence.sharedFromFactionId,
      sourceEntityId: evidence.sourceEntityId,
      sourceFactionId: evidence.sourceFactionId,
      sourceType: evidence.sourceType,
      subjectId: record.subjectId,
      topic: record.topic
    });
  }

  function compareRecords(a, b) {
    var ae = a.currentEvidence;
    var be = b.currentEvidence;
    if (ae.effectiveObservedAtQuantum !== be.effectiveObservedAtQuantum) return be.effectiveObservedAtQuantum - ae.effectiveObservedAtQuantum;
    if (ae.acquisitionMode !== be.acquisitionMode) return ae.acquisitionMode === 'direct' ? -1 : 1;
    if (ae.eventPriority !== be.eventPriority) return be.eventPriority - ae.eventPriority;
    if (ae.deliveredAtQuantum !== be.deliveredAtQuantum) return be.deliveredAtQuantum - ae.deliveredAtQuantum;
    return a.recordId.localeCompare(b.recordId);
  }

  function observationBody(input) {
    exactKeys(input, OBSERVATION_KEYS.filter(function (key) { return key !== 'observationId'; }), 'observation body');
    return Identity.canonicalize(input);
  }

  function observationIdFor(body) {
    return OBSERVATION_PREFIX + Identity.hash64x2(observationBody(body));
  }

  function validateFacts(eventType, topic, raw) {
    invariant(eventTopic(eventType) === topic, 'Observation event type does not match its topic.');
    switch (eventType) {
      case 'enemy_sighted':
        exactKeys(raw, ['classification', 'hostility', 'movementBand', 'positionCell', 'visibility'], 'unit_contact facts');
        invariant(raw.visibility === 'sighted', 'Fresh unit_contact visibility must be sighted.');
        enumValue(raw.hostility, 'hostility', ['unknown', 'friendly', 'neutral', 'hostile']);
        enumValue(raw.movementBand, 'movementBand', ['unknown', 'stationary', 'slow', 'fast']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      case 'combat_alert':
        exactKeys(raw, ['contactRole', 'positionCell', 'severity'], 'combat_alert facts');
        enumValue(raw.contactRole, 'contactRole', ['unknown', 'attacker', 'defender']);
        enumValue(raw.severity, 'severity', ['low', 'medium', 'high', 'critical']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      case 'structure_observed':
        exactKeys(raw, ['observedOwnerFactionId', 'positionCell', 'statusBand', 'structureKind'], 'structure_observed facts');
        if (raw.observedOwnerFactionId != null) Identity.assertCanonicalIdentity(raw.observedOwnerFactionId, 'observedOwnerFactionId');
        enumValue(raw.statusBand, 'statusBand', ['unknown', 'operational', 'damaged', 'disabled', 'destroyed']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      case 'structure_damaged':
        exactKeys(raw, ['damageBand', 'positionCell', 'statusBand'], 'structure_damaged facts');
        invariant(raw.statusBand === 'damaged', 'structure_damaged statusBand must be damaged.');
        enumValue(raw.damageBand, 'damageBand', ['light', 'moderate', 'heavy', 'critical']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      case 'structure_destroyed':
        exactKeys(raw, ['confirmation', 'positionCell', 'statusBand'], 'structure_destroyed facts');
        invariant(raw.statusBand === 'destroyed', 'structure_destroyed statusBand must be destroyed.');
        enumValue(raw.confirmation, 'confirmation', ['visual', 'direct_sensor']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      case 'resource_discovered':
        exactKeys(raw, ['abundanceBand', 'positionCell', 'resourceKind'], 'resource_location facts');
        enumValue(raw.abundanceBand, 'abundanceBand', ['unknown', 'trace', 'low', 'medium', 'high']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      case 'route_observed':
        exactKeys(raw, ['observedCell', 'status'], 'route_status facts');
        enumValue(raw.status, 'route status', ['unknown', 'open', 'blocked', 'damaged']);
        positionCell(raw.observedCell, 'observedCell');
        break;
      case 'infrastructure_status_observed':
        exactKeys(raw, ['infrastructureKind', 'positionCell', 'status'], 'infrastructure_status facts');
        enumValue(raw.status, 'infrastructure status', ['unknown', 'operational', 'degraded', 'offline', 'destroyed']);
        positionCell(raw.positionCell, 'positionCell');
        break;
      default:
        throw new Error('Event type may not enter a fresh observation packet: ' + eventType);
    }
    return Identity.canonicalize(raw);
  }

  function validateSlot(raw, worldId, factionId, topic, quantum) {
    exactKeys(raw, SLOT_KEYS, 'observation slot');
    invariant(raw.topic === topic, 'Observation slot topic mismatch.');
    invariant(Knowledge.isRecordId(raw.recordId), 'Invalid recordId.');
    Identity.assertCanonicalIdentity(raw.subjectId, 'subjectId');
    Identity.assertCanonicalIdentity(raw.sourceEntityId, 'sourceEntityId');
    Identity.assertCanonicalIdentity(raw.sourceFactionId, 'sourceFactionId');
    invariant(raw.recordId === Knowledge.recordIdFor(worldId, factionId, raw.subjectId, topic), 'Observation record ID does not match its canonical faction/subject/topic key.');
    enumValue(raw.acquisitionMode, 'acquisitionMode', ['direct', 'shared']);
    integer(raw.contradictionCount, 'contradictionCount', 0);
    integer(raw.observedAtQuantum, 'observedAtQuantum', 0);
    integer(raw.deliveredAtQuantum, 'deliveredAtQuantum', 0);
    invariant(raw.deliveredAtQuantum >= raw.observedAtQuantum, 'Knowledge delivery cannot precede observation.');
    invariant(typeof raw.persistent === 'boolean', 'persistent must be boolean.');
    if (raw.persistent) invariant(raw.freshUntilQuantumExclusive == null, 'Persistent observation slot cannot carry finite expiry.');
    else {
      integer(raw.freshUntilQuantumExclusive, 'freshUntilQuantumExclusive', 0);
      invariant(quantum < raw.freshUntilQuantumExclusive, 'Stale knowledge may not enter a fresh observation slot.');
    }
    if (raw.acquisitionMode === 'direct') invariant(raw.sharedFromFactionId == null, 'Direct observation cannot carry sharedFromFactionId.');
    else Identity.assertCanonicalIdentity(raw.sharedFromFactionId, 'sharedFromFactionId');
    validateFacts(raw.eventType, topic, raw.facts);
    return Identity.canonicalize(raw);
  }

  function createObservation(options) {
    var opts = options || {};
    var identitySnapshot = clone(opts.identitySnapshot || {});
    var factionId = Identity.assertCanonicalIdentity(opts.factionId, 'factionId');
    var quantum = integer(opts.quantum, 'quantum', 0);
    var identityRegistry = Identity.IdentityRegistry.fromSnapshot(identitySnapshot);
    invariant(identityRegistry.getFaction(factionId) != null, 'Observation faction is not registered.');
    var ledger = Knowledge.FactionKnowledgeLedger.fromSnapshot(identitySnapshot, clone(opts.ledgerSnapshot || {}));
    var records = ledger.recordsForFaction(factionId, { quantum: quantum, includeStale: false });
    var sections = TOPIC_ORDER.map(function (topic) {
      var capacity = SLOT_CAPACITIES[topic];
      var topicRecords = records.filter(function (record) { return record.topic === topic; }).sort(compareRecords);
      var selected = topicRecords.slice(0, capacity).map(slotFromRecord);
      while (selected.length < capacity) selected.push(null);
      return Identity.canonicalize({
        capacity: capacity,
        omittedFreshRecords: Math.max(0, topicRecords.length - capacity),
        slots: selected,
        topic: topic,
        totalFreshRecords: topicRecords.length
      });
    });
    var totalFresh = records.length;
    var selectedFresh = sections.reduce(function (sum, section) { return sum + section.slots.filter(function (slot) { return slot != null; }).length; }, 0);
    var omittedFresh = totalFresh - selectedFresh;
    var body = observationBody({
      contractId: CONTRACT_ID,
      factionId: factionId,
      featureCount: FEATURE_COUNT,
      featureLayoutId: FEATURE_LAYOUT_ID,
      featureVector: buildFeatureVector(sections, quantum, factionId),
      omittedFreshRecordCount: omittedFresh,
      quantum: quantum,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      sections: sections,
      selectedFreshRecordCount: selectedFresh,
      totalFreshRecordCount: totalFresh,
      worldId: ledger.worldId
    });
    return Identity.canonicalize(Object.assign({}, body, { observationId: observationIdFor(body) }));
  }

  function validateObservation(raw) {
    exactKeys(raw, OBSERVATION_KEYS, 'faction observation');
    invariant(raw.schemaVersion === SCHEMA_VERSION, 'Unsupported faction observation schema.');
    invariant(raw.contractId === CONTRACT_ID, 'Unexpected faction observation contract.');
    invariant(raw.registryId === REGISTRY_ID, 'Unexpected faction observation registry.');
    invariant(raw.featureLayoutId === FEATURE_LAYOUT_ID, 'Unexpected feature layout.');
    invariant(raw.featureCount === FEATURE_COUNT, 'Unexpected feature count.');
    var worldId = Identity.assertCanonicalIdentity(raw.worldId, 'worldId');
    var factionId = Identity.assertCanonicalIdentity(raw.factionId, 'factionId');
    var quantum = integer(raw.quantum, 'quantum', 0);
    invariant(Array.isArray(raw.sections) && raw.sections.length === TOPIC_ORDER.length, 'Observation must contain one section per topic.');
    var sections = raw.sections.map(function (section, index) {
      exactKeys(section, SECTION_KEYS, 'observation section');
      var topic = TOPIC_ORDER[index];
      invariant(section.topic === topic, 'Observation section order is not canonical.');
      invariant(section.capacity === SLOT_CAPACITIES[topic], 'Observation section capacity mismatch.');
      integer(section.totalFreshRecords, 'totalFreshRecords', 0);
      integer(section.omittedFreshRecords, 'omittedFreshRecords', 0);
      invariant(section.omittedFreshRecords === Math.max(0, section.totalFreshRecords - section.capacity), 'Observation omitted count is inconsistent.');
      invariant(Array.isArray(section.slots) && section.slots.length === section.capacity, 'Observation slots must have fixed capacity.');
      var slots = section.slots.map(function (slot) { return slot == null ? null : validateSlot(slot, worldId, factionId, topic, quantum); });
      var present = slots.filter(function (slot) { return slot != null; }).length;
      invariant(present === Math.min(section.totalFreshRecords, section.capacity), 'Observation slot occupancy is inconsistent.');
      return Identity.canonicalize({ capacity: section.capacity, omittedFreshRecords: section.omittedFreshRecords, slots: slots, topic: topic, totalFreshRecords: section.totalFreshRecords });
    });
    var selected = sections.reduce(function (sum, section) { return sum + section.slots.filter(function (slot) { return slot != null; }).length; }, 0);
    var total = sections.reduce(function (sum, section) { return sum + section.totalFreshRecords; }, 0);
    var omitted = sections.reduce(function (sum, section) { return sum + section.omittedFreshRecords; }, 0);
    invariant(raw.selectedFreshRecordCount === selected, 'selectedFreshRecordCount mismatch.');
    invariant(raw.totalFreshRecordCount === total, 'totalFreshRecordCount mismatch.');
    invariant(raw.omittedFreshRecordCount === omitted, 'omittedFreshRecordCount mismatch.');
    invariant(Array.isArray(raw.featureVector) && raw.featureVector.length === FEATURE_COUNT, 'Observation feature vector length mismatch.');
    raw.featureVector.forEach(function (value) { invariant(Number.isFinite(value) && value >= -1 && value <= 1, 'Observation feature must be finite and bounded.'); });
    var expectedFeatures = buildFeatureVector(sections, quantum, factionId);
    invariant(Identity.canonicalStringify(raw.featureVector) === Identity.canonicalStringify(expectedFeatures), 'Observation feature vector does not match canonical sections.');
    var body = observationBody({
      contractId: CONTRACT_ID,
      factionId: factionId,
      featureCount: FEATURE_COUNT,
      featureLayoutId: FEATURE_LAYOUT_ID,
      featureVector: expectedFeatures,
      omittedFreshRecordCount: omitted,
      quantum: quantum,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      sections: sections,
      selectedFreshRecordCount: selected,
      totalFreshRecordCount: total,
      worldId: worldId
    });
    invariant(isObservationId(raw.observationId), 'Invalid observationId.');
    invariant(raw.observationId === observationIdFor(body), 'Observation ID does not match canonical packet body.');
    return Identity.canonicalize(Object.assign({}, body, { observationId: raw.observationId }));
  }

  function FactionObservation(raw) {
    this.packet = validateObservation(raw);
  }
  FactionObservation.prototype.snapshot = function () { return clone(this.packet); };
  FactionObservation.prototype.clone = function () { return new FactionObservation(this.snapshot()); };
  FactionObservation.prototype.hash = function () { return Identity.hash64x2(this.packet); };
  FactionObservation.prototype.features = function () { return this.packet.featureVector.slice(); };
  FactionObservation.fromLedger = function (options) { return new FactionObservation(createObservation(options)); };

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_ID: CONTRACT_ID,
    REGISTRY_ID: REGISTRY_ID,
    OBSERVATION_PREFIX: OBSERVATION_PREFIX,
    FEATURE_LAYOUT_ID: FEATURE_LAYOUT_ID,
    HEADER_WIDTH: HEADER_WIDTH,
    SLOT_WIDTH: SLOT_WIDTH,
    POSITION_SCALE_CELLS: POSITION_SCALE_CELLS,
    MAX_AGE_QUANTA: MAX_AGE_QUANTA,
    MAX_CONTRADICTIONS: MAX_CONTRADICTIONS,
    TOPIC_ORDER: TOPIC_ORDER,
    SLOT_CAPACITIES: SLOT_CAPACITIES,
    TOTAL_SLOTS: TOTAL_SLOTS,
    FEATURE_COUNT: FEATURE_COUNT,
    FEATURE_SPEC: FEATURE_SPEC,
    isObservationId: isObservationId,
    observationIdFor: observationIdFor,
    createObservation: createObservation,
    validateObservation: validateObservation,
    buildFeatureVector: buildFeatureVector,
    FactionObservation: FactionObservation
  });
});
