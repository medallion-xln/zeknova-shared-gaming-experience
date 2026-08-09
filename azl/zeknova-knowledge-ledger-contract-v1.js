/*
 * ZekNova Faction Knowledge Ledger Contract v1
 * W0-O.2: private, deterministic, event-derived faction knowledge.
 *
 * Universal module. The exact same bytes are installed in ZekNova and
 * Sentinel Grid. Requires W0-O.0 identity and W0-O.1 perception contracts.
 * No DOM, Three.js, wall clock, storage, or authoritative-world dependencies.
 */
(function (root, factory) {
  var api = factory(root.ZekNovaIdentityContract, root.ZekNovaPerceptionEventContract);
  root.ZekNovaKnowledgeLedgerContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity, Perception) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') {
    throw new Error('ZekNova Knowledge Ledger requires zeknova-identity-contract-v1.');
  }
  if (!Perception || Perception.CONTRACT_ID !== 'zeknova-perception-event-contract-v1') {
    throw new Error('ZekNova Knowledge Ledger requires zeknova-perception-event-contract-v1.');
  }

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-knowledge-ledger-contract-v1';
  var REGISTRY_ID = 'zeknova-faction-knowledge-v1-development';
  var RECORD_PREFIX = 'zklr:v1:';

  var TOPICS = Object.freeze([
    'unit_contact',
    'combat_alert',
    'structure_status',
    'resource_location',
    'route_status',
    'infrastructure_status'
  ]);

  var EVENT_POLICIES = Object.freeze({
    enemy_sighted: Object.freeze({ topic: 'unit_contact', ttlQuanta: 4, eventPriority: 10 }),
    enemy_lost: Object.freeze({ topic: 'unit_contact', ttlQuanta: 0, eventPriority: 20 }),
    combat_alert: Object.freeze({ topic: 'combat_alert', ttlQuanta: 2, eventPriority: 10 }),
    structure_observed: Object.freeze({ topic: 'structure_status', ttlQuanta: null, eventPriority: 10 }),
    structure_damaged: Object.freeze({ topic: 'structure_status', ttlQuanta: 6, eventPriority: 20 }),
    structure_destroyed: Object.freeze({ topic: 'structure_status', ttlQuanta: null, eventPriority: 30 }),
    resource_discovered: Object.freeze({ topic: 'resource_location', ttlQuanta: 20, eventPriority: 10 }),
    route_observed: Object.freeze({ topic: 'route_status', ttlQuanta: 8, eventPriority: 10 }),
    infrastructure_status_observed: Object.freeze({ topic: 'infrastructure_status', ttlQuanta: 6, eventPriority: 10 })
  });

  function invariant(condition, message) {
    if (!condition) throw new Error(message);
  }

  function integer(value, label, minimum) {
    var number = Number(value);
    invariant(Number.isSafeInteger(number), label + ' must be a safe integer.');
    invariant(number >= (minimum == null ? 0 : minimum), label + ' is below its allowed minimum.');
    return number;
  }

  function nullableInteger(value, label, minimum) {
    if (value == null) return null;
    return integer(value, label, minimum);
  }

  function exactKeys(object, keys, label) {
    invariant(object && Object.prototype.toString.call(object) === '[object Object]', label + ' must be a plain object.');
    var actual = Object.keys(object).sort();
    var expected = keys.slice().sort();
    invariant(JSON.stringify(actual) === JSON.stringify(expected), label + ' has unexpected or missing fields. Expected [' + expected.join(', ') + '], got [' + actual.join(', ') + '].');
  }

  function recordIdFor(worldId, factionId, subjectId, topic) {
    Identity.assertCanonicalIdentity(worldId, 'worldId');
    Identity.assertCanonicalIdentity(factionId, 'factionId');
    Identity.assertCanonicalIdentity(subjectId, 'subjectId');
    invariant(TOPICS.indexOf(topic) >= 0, 'Unknown knowledge topic: ' + topic);
    return RECORD_PREFIX + Identity.hash64x2({ worldId: worldId, factionId: factionId, subjectId: subjectId, topic: topic });
  }

  function isRecordId(value) {
    return typeof value === 'string' && /^zklr:v1:[0-9a-f]{16}$/.test(value);
  }

  function clone(value) {
    return Identity.stableClone(value);
  }

  function factsForEvent(event) {
    var payload = event.payload;
    switch (event.eventType) {
      case 'enemy_sighted':
        return Identity.canonicalize({
          classification: payload.classification,
          hostility: payload.hostility,
          movementBand: payload.movementBand,
          positionCell: payload.positionCell,
          visibility: 'sighted'
        });
      case 'enemy_lost':
        return Identity.canonicalize({
          lastKnownPositionCell: payload.lastKnownPositionCell,
          reason: payload.reason,
          visibility: 'lost'
        });
      case 'combat_alert':
        return Identity.canonicalize({
          contactRole: payload.contactRole,
          positionCell: payload.positionCell,
          severity: payload.severity
        });
      case 'structure_observed':
        return Identity.canonicalize({
          observedOwnerFactionId: payload.observedOwnerFactionId,
          positionCell: payload.positionCell,
          statusBand: payload.statusBand,
          structureKind: payload.structureKind
        });
      case 'structure_damaged':
        return Identity.canonicalize({
          damageBand: payload.damageBand,
          positionCell: payload.positionCell,
          statusBand: 'damaged'
        });
      case 'structure_destroyed':
        return Identity.canonicalize({
          confirmation: payload.confirmation,
          positionCell: payload.positionCell,
          statusBand: 'destroyed'
        });
      case 'resource_discovered':
        return Identity.canonicalize({
          abundanceBand: payload.abundanceBand,
          positionCell: payload.positionCell,
          resourceKind: payload.resourceKind
        });
      case 'route_observed':
        return Identity.canonicalize({
          observedCell: payload.observedCell,
          status: payload.status
        });
      case 'infrastructure_status_observed':
        return Identity.canonicalize({
          infrastructureKind: payload.infrastructureKind,
          positionCell: payload.positionCell,
          status: payload.status
        });
      default:
        throw new Error('Event type does not produce ledger knowledge: ' + event.eventType);
    }
  }

  function effectiveEvent(deliveryEvent) {
    if (deliveryEvent.eventType === 'intelligence_shared') {
      return {
        acquisitionMode: 'shared',
        deliveryEvent: deliveryEvent,
        sourceEvent: deliveryEvent.payload.sharedEvent,
        recipientFactionId: deliveryEvent.observerFactionId,
        sharedFromFactionId: deliveryEvent.sourceFactionId,
        shareMode: deliveryEvent.payload.shareMode
      };
    }
    return {
      acquisitionMode: 'direct',
      deliveryEvent: deliveryEvent,
      sourceEvent: deliveryEvent,
      recipientFactionId: deliveryEvent.observerFactionId,
      sharedFromFactionId: null,
      shareMode: null
    };
  }

  function evidenceFromEvent(deliveryEvent) {
    var effective = effectiveEvent(deliveryEvent);
    var source = effective.sourceEvent;
    var policy = EVENT_POLICIES[source.eventType];
    invariant(policy, 'No knowledge policy exists for event type ' + source.eventType + '.');
    var freshUntil = policy.ttlQuanta == null ? null : source.observedAtQuantum + policy.ttlQuanta;
    return Identity.canonicalize({
      acquisitionMode: effective.acquisitionMode,
      deliveredAtQuantum: deliveryEvent.observedAtQuantum,
      deliveryEventId: deliveryEvent.eventId,
      deliveryEventSequence: deliveryEvent.eventSequence,
      effectiveObservedAtQuantum: source.observedAtQuantum,
      eventPriority: policy.eventPriority,
      eventType: source.eventType,
      facts: factsForEvent(source),
      freshUntilQuantumExclusive: freshUntil,
      persistent: policy.ttlQuanta == null,
      shareMode: effective.shareMode,
      sharedFromFactionId: effective.sharedFromFactionId,
      sourceEntityId: source.sourceEntityId,
      sourceEventId: source.eventId,
      sourceEventSequence: source.eventSequence,
      sourceFactionId: source.sourceFactionId,
      sourceType: source.sourceType
    });
  }

  function evidenceRank(entry) {
    return [
      entry.effectiveObservedAtQuantum,
      entry.acquisitionMode === 'direct' ? 2 : 1,
      entry.eventPriority,
      entry.deliveryEventSequence
    ];
  }

  function compareEvidence(a, b) {
    var ar = evidenceRank(a);
    var br = evidenceRank(b);
    for (var i = 0; i < ar.length; i++) {
      if (ar[i] < br[i]) return -1;
      if (ar[i] > br[i]) return 1;
    }
    return a.deliveryEventId.localeCompare(b.deliveryEventId);
  }

  function selectCurrentEvidence(evidence) {
    invariant(Array.isArray(evidence) && evidence.length > 0, 'A knowledge record requires evidence.');
    var selected = evidence[0];
    for (var i = 1; i < evidence.length; i++) if (compareEvidence(evidence[i], selected) > 0) selected = evidence[i];
    return selected;
  }

  function contradictionCount(evidence) {
    var count = 0;
    for (var i = 1; i < evidence.length; i++) {
      if (Identity.canonicalStringify(evidence[i - 1].facts) !== Identity.canonicalStringify(evidence[i].facts)) count++;
    }
    return count;
  }

  function knowledgeState(evidence, quantum) {
    if (evidence.persistent) return 'fresh';
    return quantum < evidence.freshUntilQuantumExclusive ? 'fresh' : 'stale';
  }

  function validateEvidence(raw) {
    exactKeys(raw, [
      'acquisitionMode', 'deliveredAtQuantum', 'deliveryEventId', 'deliveryEventSequence',
      'effectiveObservedAtQuantum', 'eventPriority', 'eventType', 'facts',
      'freshUntilQuantumExclusive', 'persistent', 'shareMode', 'sharedFromFactionId',
      'sourceEntityId', 'sourceEventId', 'sourceEventSequence', 'sourceFactionId', 'sourceType'
    ], 'knowledge evidence');
    invariant(raw.acquisitionMode === 'direct' || raw.acquisitionMode === 'shared', 'Invalid acquisitionMode.');
    invariant(Perception.isEventId(raw.deliveryEventId), 'Invalid deliveryEventId.');
    invariant(Perception.isEventId(raw.sourceEventId), 'Invalid sourceEventId.');
    integer(raw.deliveryEventSequence, 'deliveryEventSequence', 1);
    integer(raw.sourceEventSequence, 'sourceEventSequence', 1);
    integer(raw.deliveredAtQuantum, 'deliveredAtQuantum', 0);
    integer(raw.effectiveObservedAtQuantum, 'effectiveObservedAtQuantum', 0);
    integer(raw.eventPriority, 'eventPriority', 0);
    invariant(EVENT_POLICIES[raw.eventType], 'Unknown evidence event type.');
    Identity.assertCanonicalIdentity(raw.sourceEntityId, 'sourceEntityId');
    Identity.assertCanonicalIdentity(raw.sourceFactionId, 'sourceFactionId');
    if (raw.sharedFromFactionId != null) Identity.assertCanonicalIdentity(raw.sharedFromFactionId, 'sharedFromFactionId');
    invariant(typeof raw.persistent === 'boolean', 'persistent must be boolean.');
    nullableInteger(raw.freshUntilQuantumExclusive, 'freshUntilQuantumExclusive', 0);
    invariant(raw.facts && Object.prototype.toString.call(raw.facts) === '[object Object]', 'facts must be a plain object.');
    if (raw.acquisitionMode === 'direct') {
      invariant(raw.sharedFromFactionId == null && raw.shareMode == null, 'Direct evidence cannot carry sharing provenance.');
      invariant(raw.deliveryEventId === raw.sourceEventId, 'Direct evidence delivery and source event IDs must match.');
    } else {
      invariant(raw.sharedFromFactionId != null, 'Shared evidence requires sharedFromFactionId.');
      invariant(raw.shareMode === 'direct' || raw.shareMode === 'allied_channel', 'Shared evidence requires a valid shareMode.');
      invariant(raw.deliveredAtQuantum >= raw.effectiveObservedAtQuantum, 'Shared evidence cannot arrive before observation.');
    }
    return Identity.canonicalize(raw);
  }

  function recordView(record, quantum) {
    var current = selectCurrentEvidence(record.evidence);
    return Identity.canonicalize({
      contradictionCount: record.contradictionCount,
      currentEvidence: clone(current),
      currentFacts: clone(current.facts),
      evidenceCount: record.evidence.length,
      factionId: record.factionId,
      firstLearnedAtQuantum: record.firstLearnedAtQuantum,
      freshUntilQuantumExclusive: current.freshUntilQuantumExclusive,
      knowledgeState: knowledgeState(current, quantum),
      lastDeliveredAtQuantum: record.lastDeliveredAtQuantum,
      recordId: record.recordId,
      subjectId: record.subjectId,
      topic: record.topic,
      worldId: record.worldId
    });
  }

  function FactionKnowledgeLedger(options) {
    var opts = options || {};
    this.schemaVersion = SCHEMA_VERSION;
    this.contractId = CONTRACT_ID;
    this.registryId = REGISTRY_ID;
    this.identitySnapshot = clone(opts.identitySnapshot || {});
    this.identityView = new Perception.IdentitySnapshotView(this.identitySnapshot);
    this.worldId = this.identityView.worldId;
    this.currentQuantum = integer(opts.currentQuantum == null ? 0 : opts.currentQuantum, 'currentQuantum', 0);
    this.nextExpectedEventSequence = 1;
    this.appliedEventIds = [];
    this.records = new Map();
  }

  FactionKnowledgeLedger.prototype.advanceToQuantum = function (quantum) {
    var next = integer(quantum, 'quantum', 0);
    invariant(next >= this.currentQuantum, 'Knowledge ledger time may not move backwards.');
    this.currentQuantum = next;
    return this.currentQuantum;
  };

  FactionKnowledgeLedger.prototype.ingestEvent = function (rawEvent) {
    var event = Perception.validateEvent(rawEvent, this.identityView);
    invariant(event.eventSequence === this.nextExpectedEventSequence, 'Perception events must be ingested contiguously. Expected sequence ' + this.nextExpectedEventSequence + '.');
    invariant(this.appliedEventIds.indexOf(event.eventId) < 0, 'Perception event may not be applied twice.');
    var effective = effectiveEvent(event);
    var source = effective.sourceEvent;
    var policy = EVENT_POLICIES[source.eventType];
    invariant(policy, 'Event type is outside W0-O.2 knowledge policy: ' + source.eventType);
    var factionId = effective.recipientFactionId;
    var recordId = recordIdFor(this.worldId, factionId, source.subjectId, policy.topic);
    var evidence = evidenceFromEvent(event);
    var record = this.records.get(recordId);
    if (!record) {
      record = {
        contradictionCount: 0,
        evidence: [],
        factionId: factionId,
        firstLearnedAtQuantum: event.observedAtQuantum,
        lastDeliveredAtQuantum: event.observedAtQuantum,
        recordId: recordId,
        subjectId: source.subjectId,
        topic: policy.topic,
        worldId: this.worldId
      };
      this.records.set(recordId, record);
    }
    invariant(record.factionId === factionId && record.subjectId === source.subjectId && record.topic === policy.topic, 'Knowledge record key collision.');
    record.evidence.push(evidence);
    record.evidence.sort(function (a, b) { return a.deliveryEventSequence - b.deliveryEventSequence; });
    record.lastDeliveredAtQuantum = Math.max(record.lastDeliveredAtQuantum, event.observedAtQuantum);
    record.contradictionCount = contradictionCount(record.evidence);
    this.appliedEventIds.push(event.eventId);
    this.nextExpectedEventSequence++;
    if (event.observedAtQuantum > this.currentQuantum) this.currentQuantum = event.observedAtQuantum;
    return recordView(record, this.currentQuantum);
  };

  FactionKnowledgeLedger.prototype.synchronize = function (eventStreamSnapshot) {
    var validated = Perception.PerceptionEventStream.fromSnapshot(this.identitySnapshot, eventStreamSnapshot).snapshot();
    for (var i = 0; i < validated.events.length; i++) {
      var event = validated.events[i];
      if (event.eventSequence < this.nextExpectedEventSequence) {
        invariant(this.appliedEventIds[event.eventSequence - 1] === event.eventId, 'Previously applied perception event does not match the stream.');
        continue;
      }
      this.ingestEvent(event);
    }
    invariant(this.nextExpectedEventSequence === validated.nextEventSequence, 'Knowledge ledger did not reach the end of the perception stream.');
    return this.snapshot();
  };

  FactionKnowledgeLedger.prototype.recordsForFaction = function (factionId, options) {
    var id = Identity.assertCanonicalIdentity(factionId, 'factionId');
    this.identityView.requireFaction(id, 'factionId');
    var opts = options || {};
    var quantum = opts.quantum == null ? this.currentQuantum : integer(opts.quantum, 'query quantum', 0);
    var includeStale = opts.includeStale !== false;
    var out = [];
    this.records.forEach(function (record) {
      if (record.factionId !== id) return;
      var view = recordView(record, quantum);
      if (includeStale || view.knowledgeState === 'fresh') out.push(view);
    });
    return out.sort(function (a, b) { return a.recordId.localeCompare(b.recordId); });
  };

  FactionKnowledgeLedger.prototype.getRecord = function (factionId, subjectId, topic, options) {
    var id = recordIdFor(this.worldId, factionId, subjectId, topic);
    var record = this.records.get(id);
    if (!record) return null;
    var opts = options || {};
    var quantum = opts.quantum == null ? this.currentQuantum : integer(opts.quantum, 'query quantum', 0);
    return recordView(record, quantum);
  };

  FactionKnowledgeLedger.prototype.snapshot = function () {
    var records = Array.from(this.records.values()).map(function (record) {
      return Identity.canonicalize({
        contradictionCount: record.contradictionCount,
        evidence: record.evidence.map(clone),
        factionId: record.factionId,
        firstLearnedAtQuantum: record.firstLearnedAtQuantum,
        lastDeliveredAtQuantum: record.lastDeliveredAtQuantum,
        recordId: record.recordId,
        subjectId: record.subjectId,
        topic: record.topic,
        worldId: record.worldId
      });
    }).sort(function (a, b) { return a.recordId.localeCompare(b.recordId); });
    return Identity.canonicalize({
      appliedEventIds: this.appliedEventIds.slice(),
      contractId: CONTRACT_ID,
      currentQuantum: this.currentQuantum,
      nextExpectedEventSequence: this.nextExpectedEventSequence,
      records: records,
      registryId: REGISTRY_ID,
      schemaVersion: SCHEMA_VERSION,
      worldId: this.worldId
    });
  };

  FactionKnowledgeLedger.prototype.snapshotHash = function () {
    return Identity.hash64x2(this.snapshot());
  };

  FactionKnowledgeLedger.fromSnapshot = function (identitySnapshot, ledgerSnapshot) {
    var data = clone(ledgerSnapshot || {});
    exactKeys(data, ['appliedEventIds', 'contractId', 'currentQuantum', 'nextExpectedEventSequence', 'records', 'registryId', 'schemaVersion', 'worldId'], 'knowledge ledger snapshot');
    invariant(data.schemaVersion === SCHEMA_VERSION, 'Unsupported knowledge ledger snapshot schema.');
    invariant(data.contractId === CONTRACT_ID, 'Unexpected knowledge ledger contract.');
    invariant(data.registryId === REGISTRY_ID, 'Unexpected knowledge ledger registry.');
    var ledger = new FactionKnowledgeLedger({ identitySnapshot: identitySnapshot, currentQuantum: data.currentQuantum });
    invariant(data.worldId === ledger.worldId, 'Knowledge ledger belongs to another world.');
    invariant(Array.isArray(data.appliedEventIds), 'appliedEventIds must be an array.');
    data.appliedEventIds.forEach(function (eventId, index) {
      invariant(Perception.isEventId(eventId), 'Invalid applied event ID.');
      invariant(data.appliedEventIds.indexOf(eventId) === index, 'Duplicate applied event ID.');
    });
    ledger.appliedEventIds = data.appliedEventIds.slice();
    ledger.nextExpectedEventSequence = integer(data.nextExpectedEventSequence, 'nextExpectedEventSequence', 1);
    invariant(ledger.nextExpectedEventSequence === ledger.appliedEventIds.length + 1, 'nextExpectedEventSequence does not follow applied events.');
    invariant(Array.isArray(data.records), 'records must be an array.');
    data.records.forEach(function (raw) {
      exactKeys(raw, ['contradictionCount', 'evidence', 'factionId', 'firstLearnedAtQuantum', 'lastDeliveredAtQuantum', 'recordId', 'subjectId', 'topic', 'worldId'], 'knowledge record');
      invariant(raw.worldId === ledger.worldId, 'Knowledge record belongs to another world.');
      ledger.identityView.requireFaction(raw.factionId, 'knowledge record factionId');
      ledger.identityView.requireKnownEntity(raw.subjectId, 'knowledge record subjectId');
      invariant(TOPICS.indexOf(raw.topic) >= 0, 'Unknown knowledge topic.');
      invariant(raw.recordId === recordIdFor(raw.worldId, raw.factionId, raw.subjectId, raw.topic), 'Knowledge record ID does not match its canonical key.');
      invariant(isRecordId(raw.recordId), 'Invalid knowledge record ID.');
      invariant(Array.isArray(raw.evidence) && raw.evidence.length > 0, 'Knowledge record evidence must be nonempty.');
      var evidence = raw.evidence.map(validateEvidence).sort(function (a, b) { return a.deliveryEventSequence - b.deliveryEventSequence; });
      for (var i = 1; i < evidence.length; i++) invariant(evidence[i].deliveryEventSequence > evidence[i - 1].deliveryEventSequence, 'Evidence delivery sequences must be strictly increasing.');
      integer(raw.firstLearnedAtQuantum, 'firstLearnedAtQuantum', 0);
      integer(raw.lastDeliveredAtQuantum, 'lastDeliveredAtQuantum', 0);
      invariant(raw.firstLearnedAtQuantum <= raw.lastDeliveredAtQuantum, 'firstLearnedAtQuantum exceeds lastDeliveredAtQuantum.');
      invariant(raw.contradictionCount === contradictionCount(evidence), 'contradictionCount does not match evidence history.');
      invariant(raw.lastDeliveredAtQuantum === evidence[evidence.length - 1].deliveredAtQuantum, 'lastDeliveredAtQuantum does not match evidence history.');
      invariant(raw.firstLearnedAtQuantum === evidence[0].deliveredAtQuantum, 'firstLearnedAtQuantum does not match evidence history.');
      ledger.records.set(raw.recordId, {
        contradictionCount: raw.contradictionCount,
        evidence: evidence,
        factionId: raw.factionId,
        firstLearnedAtQuantum: raw.firstLearnedAtQuantum,
        lastDeliveredAtQuantum: raw.lastDeliveredAtQuantum,
        recordId: raw.recordId,
        subjectId: raw.subjectId,
        topic: raw.topic,
        worldId: raw.worldId
      });
    });
    return ledger;
  };

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_ID: CONTRACT_ID,
    REGISTRY_ID: REGISTRY_ID,
    RECORD_PREFIX: RECORD_PREFIX,
    TOPICS: TOPICS,
    EVENT_POLICIES: EVENT_POLICIES,
    recordIdFor: recordIdFor,
    isRecordId: isRecordId,
    factsForEvent: factsForEvent,
    evidenceFromEvent: evidenceFromEvent,
    compareEvidence: compareEvidence,
    knowledgeState: knowledgeState,
    FactionKnowledgeLedger: FactionKnowledgeLedger
  });
});
