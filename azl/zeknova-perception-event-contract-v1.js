/*
 * ZekNova Perception Event Contract v1
 * W0-O.1: grounded, faction-scoped perception events.
 *
 * Universal module. The exact same bytes are installed in ZekNova and
 * Sentinel Grid. Requires ZekNovaIdentityContract v1 to be loaded first.
 * No DOM, Three.js, wall-clock, storage, or game dependencies.
 */
(function (root, factory) {
  var api = factory(root.ZekNovaIdentityContract);
  root.ZekNovaPerceptionEventContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Identity) {
  'use strict';

  if (!Identity || Identity.CONTRACT_ID !== 'zeknova-identity-contract-v1') {
    throw new Error('ZekNova Perception Event Contract requires zeknova-identity-contract-v1.');
  }

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-perception-event-contract-v1';
  var REGISTRY_ID = 'zeknova-perception-events-v1-development';
  var EVENT_PREFIX = 'zkev:v1:';

  var EVENT_DEFINITIONS = Object.freeze({
    enemy_sighted: Object.freeze({
      subjectKinds: Object.freeze(['unit']),
      sourceTypes: Object.freeze(['line_of_sight', 'proximity_sensor', 'combat_contact']),
      payloadKeys: Object.freeze(['classification', 'hostility', 'movementBand', 'positionCell'])
    }),
    enemy_lost: Object.freeze({
      subjectKinds: Object.freeze(['unit']),
      sourceTypes: Object.freeze(['line_of_sight', 'proximity_sensor']),
      payloadKeys: Object.freeze(['lastKnownPositionCell', 'reason'])
    }),
    combat_alert: Object.freeze({
      subjectKinds: Object.freeze(['unit', 'structure', 'settlement', 'area']),
      sourceTypes: Object.freeze(['combat_contact', 'damage_sensor']),
      payloadKeys: Object.freeze(['contactRole', 'positionCell', 'severity'])
    }),
    structure_observed: Object.freeze({
      subjectKinds: Object.freeze(['structure', 'settlement']),
      sourceTypes: Object.freeze(['line_of_sight', 'proximity_sensor', 'structure_sensor']),
      payloadKeys: Object.freeze(['observedOwnerFactionId', 'positionCell', 'statusBand', 'structureKind'])
    }),
    structure_damaged: Object.freeze({
      subjectKinds: Object.freeze(['structure', 'settlement']),
      sourceTypes: Object.freeze(['combat_contact', 'damage_sensor', 'structure_sensor']),
      payloadKeys: Object.freeze(['damageBand', 'positionCell'])
    }),
    structure_destroyed: Object.freeze({
      subjectKinds: Object.freeze(['structure', 'settlement']),
      sourceTypes: Object.freeze(['line_of_sight', 'combat_contact', 'damage_sensor', 'structure_sensor']),
      payloadKeys: Object.freeze(['confirmation', 'positionCell'])
    }),
    resource_discovered: Object.freeze({
      subjectKinds: Object.freeze(['resource']),
      sourceTypes: Object.freeze(['line_of_sight', 'proximity_sensor', 'resource_sensor']),
      payloadKeys: Object.freeze(['abundanceBand', 'positionCell', 'resourceKind'])
    }),
    route_observed: Object.freeze({
      subjectKinds: Object.freeze(['route']),
      sourceTypes: Object.freeze(['line_of_sight', 'proximity_sensor', 'route_sensor']),
      payloadKeys: Object.freeze(['observedCell', 'status'])
    }),
    infrastructure_status_observed: Object.freeze({
      subjectKinds: Object.freeze(['structure', 'route']),
      sourceTypes: Object.freeze(['line_of_sight', 'infrastructure_sensor']),
      payloadKeys: Object.freeze(['infrastructureKind', 'positionCell', 'status'])
    }),
    intelligence_shared: Object.freeze({
      subjectKinds: Object.freeze(['unit', 'structure', 'settlement', 'resource', 'route', 'area']),
      sourceTypes: Object.freeze(['intelligence_share']),
      payloadKeys: Object.freeze(['shareMode', 'sharedEvent'])
    })
  });

  var COMMON_KEYS = Object.freeze([
    'contractId', 'eventId', 'eventSequence', 'eventType', 'observedAtQuantum',
    'observerFactionId', 'payload', 'registryId', 'schemaVersion', 'sourceEntityId',
    'sourceFactionId', 'sourceType', 'subjectId', 'worldId'
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

  function text(value, label, options) {
    var opts = options || {};
    var out = String(value == null ? '' : value).normalize('NFKC').trim();
    invariant(out.length > 0, label + ' is required.');
    if (opts.lowercase) out = out.toLowerCase();
    invariant(out.length <= (opts.maximumLength || 160), label + ' is too long.');
    return out;
  }

  function enumValue(value, label, allowed) {
    var normalized = text(value, label, { lowercase: true, maximumLength: 80 });
    invariant(allowed.indexOf(normalized) >= 0, label + ' is not allowed: ' + normalized);
    return normalized;
  }

  function exactKeys(object, keys, label) {
    invariant(object && Object.prototype.toString.call(object) === '[object Object]', label + ' must be a plain object.');
    var actual = Object.keys(object).sort();
    var expected = keys.slice().sort();
    invariant(JSON.stringify(actual) === JSON.stringify(expected), label + ' has unexpected or missing fields. Expected [' + expected.join(', ') + '], got [' + actual.join(', ') + '].');
  }

  function positionCell(value, label) {
    exactKeys(value, ['x', 'y', 'z'], label);
    return {
      x: integer(value.x, label + '.x', -2147483648),
      y: integer(value.y, label + '.y', -2147483648),
      z: integer(value.z, label + '.z', -2147483648)
    };
  }

  function eventIdFor(sequence, body) {
    return EVENT_PREFIX + integer(sequence, 'eventSequence', 1) + ':' + Identity.hash64x2(body);
  }

  function isEventId(value) {
    return typeof value === 'string' && /^zkev:v1:[1-9]\d*:[0-9a-f]{16}$/.test(value);
  }

  function IdentitySnapshotView(snapshot) {
    var data = Identity.stableClone(snapshot || {});
    invariant(data.schemaVersion === Identity.SCHEMA_VERSION, 'Unsupported identity snapshot schema.');
    invariant(data.registryId === Identity.REGISTRY_ID, 'Unsupported identity registry.');
    this.worldId = Identity.assertCanonicalIdentity(data.worldId, 'identity snapshot worldId');
    this.factions = new Map();
    this.entities = new Map();
    this.retired = new Set();
    (data.factions || []).forEach(function (record) {
      Identity.assertCanonicalIdentity(record.factionId, 'factionId');
      this.factions.set(record.factionId, Identity.stableClone(record));
    }, this);
    (data.entities || []).forEach(function (record) {
      Identity.assertCanonicalIdentity(record.entityId, 'entityId');
      this.entities.set(record.entityId, Identity.stableClone(record));
    }, this);
    (data.retiredEntityIds || []).forEach(function (id) {
      Identity.assertCanonicalIdentity(id, 'retiredEntityId');
      this.retired.add(id);
    }, this);
  }

  IdentitySnapshotView.prototype.requireFaction = function (factionId, label) {
    var id = Identity.assertCanonicalIdentity(factionId, label || 'factionId');
    invariant(this.factions.has(id), (label || 'factionId') + ' is not registered in the identity snapshot.');
    return this.factions.get(id);
  };

  IdentitySnapshotView.prototype.requireActiveEntity = function (entityId, label) {
    var id = Identity.assertCanonicalIdentity(entityId, label || 'entityId');
    invariant(this.entities.has(id), (label || 'entityId') + ' is not an active registered entity.');
    return this.entities.get(id);
  };

  IdentitySnapshotView.prototype.requireKnownEntity = function (entityId, label) {
    var id = Identity.assertCanonicalIdentity(entityId, label || 'entityId');
    invariant(this.entities.has(id) || this.retired.has(id), (label || 'entityId') + ' is not known to the identity snapshot.');
    return this.entities.get(id) || null;
  };

  function validatePayload(eventType, payload, view, options) {
    var opts = options || {};
    var definition = EVENT_DEFINITIONS[eventType];
    exactKeys(payload, definition.payloadKeys, eventType + ' payload');
    switch (eventType) {
      case 'enemy_sighted':
        return {
          classification: text(payload.classification, 'classification', { lowercase: true, maximumLength: 80 }),
          hostility: enumValue(payload.hostility, 'hostility', ['unknown', 'friendly', 'neutral', 'hostile']),
          movementBand: enumValue(payload.movementBand, 'movementBand', ['unknown', 'stationary', 'slow', 'fast']),
          positionCell: positionCell(payload.positionCell, 'positionCell')
        };
      case 'enemy_lost':
        return {
          lastKnownPositionCell: positionCell(payload.lastKnownPositionCell, 'lastKnownPositionCell'),
          reason: enumValue(payload.reason, 'reason', ['out_of_range', 'occluded', 'observer_disabled'])
        };
      case 'combat_alert':
        return {
          contactRole: enumValue(payload.contactRole, 'contactRole', ['unknown', 'attacker', 'defender']),
          positionCell: positionCell(payload.positionCell, 'positionCell'),
          severity: enumValue(payload.severity, 'severity', ['low', 'medium', 'high', 'critical'])
        };
      case 'structure_observed': {
        var owner = payload.observedOwnerFactionId == null ? null : Identity.assertCanonicalIdentity(payload.observedOwnerFactionId, 'observedOwnerFactionId');
        if (owner != null) view.requireFaction(owner, 'observedOwnerFactionId');
        return {
          observedOwnerFactionId: owner,
          positionCell: positionCell(payload.positionCell, 'positionCell'),
          statusBand: enumValue(payload.statusBand, 'statusBand', ['unknown', 'operational', 'damaged', 'disabled', 'destroyed']),
          structureKind: text(payload.structureKind, 'structureKind', { lowercase: true, maximumLength: 80 })
        };
      }
      case 'structure_damaged':
        return {
          damageBand: enumValue(payload.damageBand, 'damageBand', ['light', 'moderate', 'heavy', 'critical']),
          positionCell: positionCell(payload.positionCell, 'positionCell')
        };
      case 'structure_destroyed':
        return {
          confirmation: enumValue(payload.confirmation, 'confirmation', ['visual', 'direct_sensor']),
          positionCell: positionCell(payload.positionCell, 'positionCell')
        };
      case 'resource_discovered':
        return {
          abundanceBand: enumValue(payload.abundanceBand, 'abundanceBand', ['unknown', 'trace', 'low', 'medium', 'high']),
          positionCell: positionCell(payload.positionCell, 'positionCell'),
          resourceKind: text(payload.resourceKind, 'resourceKind', { lowercase: true, maximumLength: 80 })
        };
      case 'route_observed':
        return {
          observedCell: positionCell(payload.observedCell, 'observedCell'),
          status: enumValue(payload.status, 'route status', ['unknown', 'open', 'blocked', 'damaged'])
        };
      case 'infrastructure_status_observed':
        return {
          infrastructureKind: text(payload.infrastructureKind, 'infrastructureKind', { lowercase: true, maximumLength: 80 }),
          positionCell: positionCell(payload.positionCell, 'positionCell'),
          status: enumValue(payload.status, 'infrastructure status', ['unknown', 'operational', 'degraded', 'offline', 'destroyed'])
        };
      case 'intelligence_shared': {
        invariant(!opts.insideSharedEvent, 'Nested intelligence_shared events are forbidden.');
        var shared = validateEvent(payload.sharedEvent, view, { insideSharedEvent: true });
        invariant(shared.eventType !== 'intelligence_shared', 'An intelligence_shared event may not share another intelligence_shared event.');
        return {
          shareMode: enumValue(payload.shareMode, 'shareMode', ['direct', 'allied_channel']),
          sharedEvent: shared
        };
      }
      default:
        throw new Error('Unknown perception event type: ' + eventType);
    }
  }

  function eventBody(input, view, options) {
    var opts = options || {};
    exactKeys(input, COMMON_KEYS, 'perception event');
    invariant(input.schemaVersion === SCHEMA_VERSION, 'Unsupported perception event schema.');
    invariant(input.contractId === CONTRACT_ID, 'Unexpected perception event contract.');
    invariant(input.registryId === REGISTRY_ID, 'Unexpected perception event registry.');
    var worldId = Identity.assertCanonicalIdentity(input.worldId, 'worldId');
    invariant(worldId === view.worldId, 'Perception event world does not match identity snapshot.');
    var eventSequence = integer(input.eventSequence, 'eventSequence', 1);
    var eventType = enumValue(input.eventType, 'eventType', Object.keys(EVENT_DEFINITIONS));
    var observerFactionId = Identity.assertCanonicalIdentity(input.observerFactionId, 'observerFactionId');
    var sourceFactionId = Identity.assertCanonicalIdentity(input.sourceFactionId, 'sourceFactionId');
    view.requireFaction(observerFactionId, 'observerFactionId');
    view.requireFaction(sourceFactionId, 'sourceFactionId');
    var sourceEntityId = Identity.assertCanonicalIdentity(input.sourceEntityId, 'sourceEntityId');
    var sourceRecord = view.requireActiveEntity(sourceEntityId, 'sourceEntityId');
    invariant(sourceRecord.ownerFactionId === sourceFactionId, 'sourceEntityId is not owned by sourceFactionId.');
    var subjectId = Identity.assertCanonicalIdentity(input.subjectId, 'subjectId');
    var subjectRecord = view.requireKnownEntity(subjectId, 'subjectId');
    var definition = EVENT_DEFINITIONS[eventType];
    if (subjectRecord) invariant(definition.subjectKinds.indexOf(subjectRecord.kind) >= 0, eventType + ' does not accept subject kind ' + subjectRecord.kind + '.');
    var sourceType = enumValue(input.sourceType, 'sourceType', definition.sourceTypes);
    var observedAtQuantum = integer(input.observedAtQuantum, 'observedAtQuantum', 0);
    var payload = validatePayload(eventType, input.payload, view, opts);

    if (eventType === 'intelligence_shared') {
      invariant(observerFactionId !== sourceFactionId, 'intelligence_shared requires distinct sender and recipient factions.');
      invariant(payload.sharedEvent.observerFactionId === sourceFactionId, 'Only the faction that observed the shared event may send it.');
      invariant(payload.sharedEvent.worldId === worldId, 'Shared event belongs to another world.');
      invariant(payload.sharedEvent.subjectId === subjectId, 'Shared event subject does not match intelligence_shared subject.');
      invariant(payload.sharedEvent.observedAtQuantum <= observedAtQuantum, 'Intelligence may not be shared before it was observed.');
    } else {
      invariant(observerFactionId === sourceFactionId, 'Grounded perception requires observerFactionId to equal sourceFactionId.');
    }

    return Identity.canonicalize({
      schemaVersion: SCHEMA_VERSION,
      contractId: CONTRACT_ID,
      registryId: REGISTRY_ID,
      worldId: worldId,
      eventSequence: eventSequence,
      eventType: eventType,
      observerFactionId: observerFactionId,
      sourceFactionId: sourceFactionId,
      sourceEntityId: sourceEntityId,
      subjectId: subjectId,
      observedAtQuantum: observedAtQuantum,
      sourceType: sourceType,
      payload: payload
    });
  }

  function validateEvent(input, identitySnapshotOrView, options) {
    var view = identitySnapshotOrView instanceof IdentitySnapshotView ? identitySnapshotOrView : new IdentitySnapshotView(identitySnapshotOrView);
    var body = eventBody(input, view, options);
    var expectedId = eventIdFor(body.eventSequence, body);
    invariant(isEventId(input.eventId), 'Invalid perception event identity.');
    invariant(input.eventId === expectedId, 'Perception event ID does not match canonical event body.');
    return Identity.canonicalize(Object.assign({ eventId: input.eventId }, body));
  }

  function createEvent(input, identitySnapshotOrView) {
    var view = identitySnapshotOrView instanceof IdentitySnapshotView ? identitySnapshotOrView : new IdentitySnapshotView(identitySnapshotOrView);
    var prepared = Object.assign({}, Identity.stableClone(input || {}), {
      schemaVersion: SCHEMA_VERSION,
      contractId: CONTRACT_ID,
      registryId: REGISTRY_ID,
      worldId: view.worldId,
      eventId: EVENT_PREFIX + 'pending'
    });
    var body = eventBody(prepared, view);
    var eventId = eventIdFor(body.eventSequence, body);
    return validateEvent(Object.assign({ eventId: eventId }, body), view);
  }

  function cloneEvent(event) {
    return Identity.stableClone(event);
  }

  function PerceptionEventStream(options) {
    var opts = options || {};
    this.schemaVersion = SCHEMA_VERSION;
    this.registryId = REGISTRY_ID;
    this.identityView = opts.identitySnapshot instanceof IdentitySnapshotView ? opts.identitySnapshot : new IdentitySnapshotView(opts.identitySnapshot);
    this.worldId = this.identityView.worldId;
    this.nextEventSequence = integer(opts.nextEventSequence == null ? 1 : opts.nextEventSequence, 'nextEventSequence', 1);
    this.events = [];
    this.eventIds = new Set();
  }

  PerceptionEventStream.prototype.append = function (input) {
    var data = Identity.stableClone(input || {});
    data.eventSequence = this.nextEventSequence;
    var event = createEvent(data, this.identityView);
    invariant(!this.eventIds.has(event.eventId), 'Perception event identity may not be reused.');
    this.events.push(event);
    this.eventIds.add(event.eventId);
    this.nextEventSequence++;
    return cloneEvent(event);
  };

  PerceptionEventStream.prototype.share = function (input) {
    var data = input || {};
    var original = this.getEvent(data.originalEventId);
    invariant(original, 'Shared perception event does not exist in this stream.');
    invariant(original.eventType !== 'intelligence_shared', 'Nested intelligence sharing is forbidden.');
    return this.append({
      eventType: 'intelligence_shared',
      observerFactionId: data.recipientFactionId,
      sourceFactionId: data.senderFactionId,
      sourceEntityId: data.sourceEntityId,
      subjectId: original.subjectId,
      observedAtQuantum: data.observedAtQuantum,
      sourceType: 'intelligence_share',
      payload: {
        shareMode: data.shareMode || 'direct',
        sharedEvent: original
      }
    });
  };

  PerceptionEventStream.prototype.getEvent = function (eventId) {
    var id = String(eventId || '');
    for (var i = 0; i < this.events.length; i++) if (this.events[i].eventId === id) return cloneEvent(this.events[i]);
    return null;
  };

  PerceptionEventStream.prototype.eventsForFaction = function (factionId) {
    var id = Identity.assertCanonicalIdentity(factionId, 'factionId');
    this.identityView.requireFaction(id, 'factionId');
    return this.events.filter(function (event) { return event.observerFactionId === id; }).map(cloneEvent);
  };

  PerceptionEventStream.prototype.snapshot = function () {
    return Identity.canonicalize({
      schemaVersion: SCHEMA_VERSION,
      registryId: REGISTRY_ID,
      worldId: this.worldId,
      nextEventSequence: this.nextEventSequence,
      events: this.events.slice().sort(function (a, b) { return a.eventSequence - b.eventSequence; }).map(cloneEvent)
    });
  };

  PerceptionEventStream.prototype.snapshotHash = function () {
    return Identity.hash64x2(this.snapshot());
  };

  PerceptionEventStream.fromSnapshot = function (identitySnapshot, streamSnapshot) {
    var data = Identity.stableClone(streamSnapshot || {});
    invariant(data.schemaVersion === SCHEMA_VERSION, 'Unsupported perception stream snapshot schema.');
    invariant(data.registryId === REGISTRY_ID, 'Unsupported perception stream registry.');
    var stream = new PerceptionEventStream({ identitySnapshot: identitySnapshot, nextEventSequence: data.nextEventSequence });
    invariant(data.worldId === stream.worldId, 'Perception stream belongs to another world.');
    var expectedSequence = 1;
    (data.events || []).forEach(function (raw) {
      var event = validateEvent(raw, stream.identityView);
      invariant(event.eventSequence === expectedSequence, 'Perception event sequences must be contiguous and ordered.');
      invariant(!stream.eventIds.has(event.eventId), 'Duplicate perception event identity in snapshot.');
      stream.events.push(event);
      stream.eventIds.add(event.eventId);
      expectedSequence++;
    });
    invariant(stream.nextEventSequence === expectedSequence, 'nextEventSequence does not follow the event stream.');
    return stream;
  };

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_ID: CONTRACT_ID,
    REGISTRY_ID: REGISTRY_ID,
    EVENT_PREFIX: EVENT_PREFIX,
    EVENT_TYPES: Object.freeze(Object.keys(EVENT_DEFINITIONS)),
    EVENT_DEFINITIONS: EVENT_DEFINITIONS,
    IdentitySnapshotView: IdentitySnapshotView,
    positionCell: positionCell,
    isEventId: isEventId,
    eventIdFor: eventIdFor,
    createEvent: createEvent,
    validateEvent: validateEvent,
    PerceptionEventStream: PerceptionEventStream
  });
});
