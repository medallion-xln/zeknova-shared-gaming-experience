/*
 * ZekNova Identity Contract v1
 * W0-O.0: stable faction and entity identities.
 *
 * Universal module: attaches to globalThis.ZekNovaIdentityContract and exports
 * through CommonJS when available. It has no DOM, Three.js, storage, or game
 * dependencies, so the exact same bytes can be used by ZekNova and Sentinel.
 */
(function (root, factory) {
  var api = factory();
  root.ZekNovaIdentityContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA_VERSION = 1;
  var CONTRACT_ID = 'zeknova-identity-contract-v1';
  var REGISTRY_ID = 'zeknova-identity-v1-development';
  var PREFIX = 'zkid:v1:';

  function invariant(condition, message) {
    if (!condition) throw new Error(message);
  }

  function finiteInteger(value, label, minimum) {
    var number = Number(value);
    invariant(Number.isSafeInteger(number), label + ' must be a safe integer.');
    invariant(number >= (minimum == null ? 0 : minimum), label + ' is below its allowed minimum.');
    return number;
  }

  function normalizedText(value, label, options) {
    var opts = options || {};
    var text = String(value == null ? '' : value).normalize('NFKC').trim();
    invariant(text.length > 0, label + ' is required.');
    if (opts.uppercase) text = text.toUpperCase();
    if (opts.lowercase) text = text.toLowerCase();
    invariant(text.length <= (opts.maximumLength || 240), label + ' is too long.');
    return text;
  }

  function token(value, label, options) {
    return encodeURIComponent(normalizedText(value, label, options));
  }

  function teamKey(teamCode) {
    return token(teamCode, 'teamCode', { uppercase: true, maximumLength: 80 });
  }

  function opaqueKey(value, label) {
    return token(value, label || 'key', { maximumLength: 200 });
  }

  function roleKey(value) {
    return token(value, 'role', { lowercase: true, maximumLength: 80 });
  }

  function parseWorldId(worldId) {
    var value = String(worldId || '');
    var match = /^zkid:v1:world:([^:]+):(\d+)$/.exec(value);
    invariant(match, 'Invalid ZekNova world identity.');
    var decodedTeam;
    try { decodedTeam = decodeURIComponent(match[1]); }
    catch (_) { throw new Error('Invalid encoded team key in world identity.'); }
    invariant(teamKey(decodedTeam) === match[1], 'World identity team key is not canonical.');
    return {
      worldId: value,
      teamKey: match[1],
      biomeSeed: finiteInteger(match[2], 'biomeSeed', 0)
    };
  }

  function worldId(input) {
    var data = input || {};
    return PREFIX + 'world:' + teamKey(data.teamCode) + ':' + finiteInteger(data.biomeSeed, 'biomeSeed', 0);
  }

  function humanFactionId(input) {
    return PREFIX + 'faction:human:' + teamKey((input || {}).teamCode);
  }

  function settlementFactionId(input) {
    var world = parseWorldId((input || {}).worldId);
    var ordinal = finiteInteger(input.settlementOrdinal, 'settlementOrdinal', 0);
    return PREFIX + 'faction:zeknovan:' + world.teamKey + ':' + world.biomeSeed + ':settlement:' + ordinal;
  }

  function settlementEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    var ordinal = finiteInteger(input.settlementOrdinal, 'settlementOrdinal', 0);
    return PREFIX + 'entity:settlement:zeknovan:' + world.teamKey + ':' + world.biomeSeed + ':' + ordinal;
  }

  function humanUnitEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    var keyType = input.userId != null && String(input.userId).trim() ? 'user' : 'client';
    var rawKey = keyType === 'user' ? input.userId : input.clientId;
    return PREFIX + 'entity:unit:human:' + world.teamKey + ':' + world.biomeSeed + ':' + keyType + ':' + opaqueKey(rawKey, keyType + 'Id');
  }

  function zeknovanUnitEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    var sequence = finiteInteger(input.spawnSequence, 'spawnSequence', 1);
    return PREFIX + 'entity:unit:zeknovan:' + world.teamKey + ':' + world.biomeSeed + ':spawn:' + sequence + ':' + roleKey(input.role);
  }

  function structureEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    return PREFIX + 'entity:structure:' + world.teamKey + ':' + world.biomeSeed + ':' + opaqueKey(input.recordId, 'recordId');
  }

  function resourceEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    return PREFIX + 'entity:resource:' + world.teamKey + ':' + world.biomeSeed + ':' + roleKey(input.resourceKind) + ':' + opaqueKey(input.sourceId, 'sourceId');
  }

  function areaEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    return PREFIX + 'entity:area:' + world.teamKey + ':' + world.biomeSeed + ':' + roleKey(input.areaKey);
  }

  function routeEntityId(input) {
    var world = parseWorldId((input || {}).worldId);
    return PREFIX + 'entity:route:' + world.teamKey + ':' + world.biomeSeed + ':' + roleKey(input.routeKey);
  }

  function isCanonicalIdentity(value) {
    if (typeof value !== 'string' || !/^zkid:v1:(world|faction|entity):[A-Za-z0-9_.!~*'()%:-]+$/.test(value)) return false;
    try { decodeURIComponent(value); }
    catch (_) { return false; }
    return true;
  }

  function assertCanonicalIdentity(value, label) {
    invariant(isCanonicalIdentity(value), (label || 'identity') + ' is not a canonical zkid:v1 identity.');
    return value;
  }

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function stableClone(value, seen) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      invariant(Number.isFinite(value), 'Identity metadata may not contain non-finite numbers.');
      return value;
    }
    invariant(typeof value !== 'function' && typeof value !== 'symbol' && typeof value !== 'bigint', 'Identity metadata contains an unsupported value.');
    var active = seen || new Set();
    invariant(!active.has(value), 'Identity metadata may not contain cycles.');
    active.add(value);
    var result;
    if (Array.isArray(value)) {
      result = value.map(function (item) { return stableClone(item, active); });
    } else {
      invariant(isPlainObject(value), 'Identity metadata must use plain objects and arrays only.');
      result = {};
      Object.keys(value).sort().forEach(function (key) {
        result[key] = stableClone(value[key], active);
      });
    }
    active.delete(value);
    return result;
  }

  function canonicalize(value) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return stableClone(value);
    if (Array.isArray(value)) return value.map(canonicalize);
    invariant(isPlainObject(value), 'Canonical JSON accepts plain objects and arrays only.');
    var out = {};
    Object.keys(value).sort().forEach(function (key) { out[key] = canonicalize(value[key]); });
    return out;
  }

  function canonicalStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function fnv1a32(text, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function hash64x2(value) {
    var text = typeof value === 'string' ? value : canonicalStringify(value);
    var a = fnv1a32(text, 2166136261);
    var b = fnv1a32(text, 2246822507);
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }

  function recordKey(kind, sourceKey) {
    return normalizedText(kind, 'kind', { lowercase: true, maximumLength: 80 }) + '|' + normalizedText(sourceKey, 'sourceKey', { maximumLength: 240 });
  }

  function cloneRecord(record) {
    return {
      entityId: record.entityId,
      kind: record.kind,
      ownerFactionId: record.ownerFactionId,
      sourceKey: record.sourceKey,
      status: record.status,
      metadata: stableClone(record.metadata || {})
    };
  }

  function IdentityRegistry(options) {
    var opts = options || {};
    this.schemaVersion = SCHEMA_VERSION;
    this.registryId = REGISTRY_ID;
    this.worldId = assertCanonicalIdentity(opts.worldId, 'worldId');
    parseWorldId(this.worldId);
    this.nextSpawnSequence = finiteInteger(opts.nextSpawnSequence == null ? 1 : opts.nextSpawnSequence, 'nextSpawnSequence', 1);
    this.factions = new Map();
    this.entities = new Map();
    this.retiredEntityIds = new Set();
    this.sourceIndex = new Map();
  }

  IdentityRegistry.prototype.registerFaction = function (record) {
    var input = record || {};
    var factionId = assertCanonicalIdentity(input.factionId, 'factionId');
    invariant(factionId.indexOf(PREFIX + 'faction:') === 0, 'Faction record requires a faction identity.');
    var next = {
      factionId: factionId,
      kind: normalizedText(input.kind, 'faction kind', { lowercase: true, maximumLength: 80 }),
      sourceKey: normalizedText(input.sourceKey, 'faction sourceKey', { maximumLength: 240 }),
      metadata: stableClone(input.metadata || {})
    };
    var existing = this.factions.get(factionId);
    if (existing) {
      invariant(canonicalStringify(existing) === canonicalStringify(next), 'Faction identity collision: ' + factionId);
      return stableClone(existing);
    }
    this.factions.set(factionId, next);
    return stableClone(next);
  };

  IdentityRegistry.prototype.registerEntity = function (record) {
    var input = record || {};
    var entityId = assertCanonicalIdentity(input.entityId, 'entityId');
    invariant(entityId.indexOf(PREFIX + 'entity:') === 0, 'Entity record requires an entity identity.');
    invariant(!this.retiredEntityIds.has(entityId), 'Retired entity identity may not be reused: ' + entityId);
    var ownerFactionId = input.ownerFactionId == null ? null : assertCanonicalIdentity(input.ownerFactionId, 'ownerFactionId');
    if (ownerFactionId != null) invariant(this.factions.has(ownerFactionId), 'Owner faction must be registered before its entity.');
    var kind = normalizedText(input.kind, 'entity kind', { lowercase: true, maximumLength: 80 });
    var sourceKey = normalizedText(input.sourceKey, 'entity sourceKey', { maximumLength: 240 });
    var indexKey = recordKey(kind, sourceKey);
    var indexed = this.sourceIndex.get(indexKey);
    invariant(!indexed || indexed === entityId, 'Source key collision between ' + indexed + ' and ' + entityId);
    var next = {
      entityId: entityId,
      kind: kind,
      ownerFactionId: ownerFactionId,
      sourceKey: sourceKey,
      status: 'active',
      metadata: stableClone(input.metadata || {})
    };
    var existing = this.entities.get(entityId);
    if (existing) {
      invariant(canonicalStringify(existing) === canonicalStringify(next), 'Entity identity collision: ' + entityId);
      return cloneRecord(existing);
    }
    this.entities.set(entityId, next);
    this.sourceIndex.set(indexKey, entityId);
    return cloneRecord(next);
  };

  IdentityRegistry.prototype.allocateSpawn = function (input) {
    var data = input || {};
    var sequence = this.nextSpawnSequence++;
    var entityId = zeknovanUnitEntityId({ worldId: this.worldId, spawnSequence: sequence, role: data.role });
    return this.registerEntity({
      entityId: entityId,
      kind: 'unit',
      ownerFactionId: data.ownerFactionId,
      sourceKey: 'spawn:' + sequence,
      metadata: Object.assign({}, stableClone(data.metadata || {}), { role: normalizedText(data.role, 'role', { lowercase: true, maximumLength: 80 }), spawnSequence: sequence })
    });
  };

  IdentityRegistry.prototype.retire = function (entityId) {
    var id = assertCanonicalIdentity(entityId, 'entityId');
    var existing = this.entities.get(id);
    if (!existing) return false;
    this.entities.delete(id);
    this.sourceIndex.delete(recordKey(existing.kind, existing.sourceKey));
    this.retiredEntityIds.add(id);
    return true;
  };

  IdentityRegistry.prototype.getEntity = function (entityId) {
    var record = this.entities.get(String(entityId));
    return record ? cloneRecord(record) : null;
  };

  IdentityRegistry.prototype.getFaction = function (factionId) {
    var record = this.factions.get(String(factionId));
    return record ? stableClone(record) : null;
  };

  IdentityRegistry.prototype.findBySource = function (kind, sourceKey) {
    var id = this.sourceIndex.get(recordKey(kind, sourceKey));
    return id ? this.getEntity(id) : null;
  };

  IdentityRegistry.prototype.snapshot = function () {
    var factions = Array.from(this.factions.values()).map(function (record) { return stableClone(record); }).sort(function (a, b) { return a.factionId.localeCompare(b.factionId); });
    var entities = Array.from(this.entities.values()).map(cloneRecord).sort(function (a, b) { return a.entityId.localeCompare(b.entityId); });
    var retired = Array.from(this.retiredEntityIds).sort();
    return {
      schemaVersion: SCHEMA_VERSION,
      registryId: REGISTRY_ID,
      worldId: this.worldId,
      nextSpawnSequence: this.nextSpawnSequence,
      factions: factions,
      entities: entities,
      retiredEntityIds: retired
    };
  };

  IdentityRegistry.prototype.snapshotHash = function () {
    return hash64x2(this.snapshot());
  };

  IdentityRegistry.fromSnapshot = function (snapshot) {
    var data = stableClone(snapshot || {});
    invariant(data.schemaVersion === SCHEMA_VERSION, 'Unsupported identity snapshot schema.');
    invariant(data.registryId === REGISTRY_ID, 'Unsupported identity registry.');
    var registry = new IdentityRegistry({ worldId: data.worldId, nextSpawnSequence: data.nextSpawnSequence });
    (data.factions || []).forEach(function (record) { registry.registerFaction(record); });
    (data.entities || []).forEach(function (record) { registry.registerEntity(record); });
    (data.retiredEntityIds || []).forEach(function (id) {
      assertCanonicalIdentity(id, 'retiredEntityId');
      invariant(!registry.entities.has(id), 'An entity may not be active and retired simultaneously.');
      registry.retiredEntityIds.add(id);
    });
    return registry;
  };

  return Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    CONTRACT_ID: CONTRACT_ID,
    REGISTRY_ID: REGISTRY_ID,
    PREFIX: PREFIX,
    teamKey: teamKey,
    opaqueKey: opaqueKey,
    roleKey: roleKey,
    worldId: worldId,
    parseWorldId: parseWorldId,
    humanFactionId: humanFactionId,
    settlementFactionId: settlementFactionId,
    settlementEntityId: settlementEntityId,
    humanUnitEntityId: humanUnitEntityId,
    zeknovanUnitEntityId: zeknovanUnitEntityId,
    structureEntityId: structureEntityId,
    resourceEntityId: resourceEntityId,
    areaEntityId: areaEntityId,
    routeEntityId: routeEntityId,
    isCanonicalIdentity: isCanonicalIdentity,
    assertCanonicalIdentity: assertCanonicalIdentity,
    stableClone: stableClone,
    canonicalize: canonicalize,
    canonicalStringify: canonicalStringify,
    hash64x2: hash64x2,
    IdentityRegistry: IdentityRegistry
  });
});
