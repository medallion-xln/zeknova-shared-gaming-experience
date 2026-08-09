#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
(0, eval)(fs.readFileSync(path.join(ROOT, 'azl/zeknova-identity-contract-v1.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(ROOT, 'azl/zeknova-perception-event-contract-v1.js'), 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;

let checks = 0;
function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }
function rejects(name, fn, pattern) { test(name, () => assert.throws(fn, pattern)); }

function fixture() {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const human = I.humanFactionId({ teamCode: 'FOREST ALPHA' });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'human' });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const player = I.humanUnitEntityId({ worldId, userId: 'user-1' });
  r.registerEntity({ entityId: player, kind: 'unit', ownerFactionId: human, sourceKey: 'player' });
  const scout0 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const scout1 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s1 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const structure = I.structureEntityId({ worldId, recordId: 'power-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: human, sourceKey: 'power-1' });
  const resource = I.resourceEntityId({ worldId, resourceKind: 'tree', sourceId: 'tree-1' });
  r.registerEntity({ entityId: resource, kind: 'resource', ownerFactionId: null, sourceKey: 'tree-1' });
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route-1' });
  const area = I.areaEntityId({ worldId, areaKey: 'forest' });
  r.registerEntity({ entityId: area, kind: 'area', ownerFactionId: null, sourceKey: 'area-1' });
  return { worldId, human, s0, s1, r, player, scout0, scout1, enemy, structure, resource, route, area };
}

function sighting(f, overrides = {}) {
  return {
    eventType: 'enemy_sighted',
    observerFactionId: f.s0,
    sourceFactionId: f.s0,
    sourceEntityId: f.scout0,
    subjectId: f.enemy,
    observedAtQuantum: 7,
    sourceType: 'line_of_sight',
    payload: {
      classification: 'stalker', hostility: 'hostile', movementBand: 'fast',
      positionCell: { x: 12, y: 2, z: -4 },
    },
    ...overrides,
  };
}

const f = fixture();
const snapshot = f.r.snapshot();

test('contract identity', () => assert.equal(P.CONTRACT_ID, 'zeknova-perception-event-contract-v1'));
test('registry identity', () => assert.equal(P.REGISTRY_ID, 'zeknova-perception-events-v1-development'));
test('schema version', () => assert.equal(P.SCHEMA_VERSION, 1));
test('ten event types declared', () => assert.equal(P.EVENT_TYPES.length, 10));
test('identity view accepts W0-O.0 snapshot', () => assert.equal(new P.IdentitySnapshotView(snapshot).worldId, f.worldId));

const stream = new P.PerceptionEventStream({ identitySnapshot: snapshot });
const first = stream.append(sighting(f));
test('first sequence starts at one', () => assert.equal(first.eventSequence, 1));
test('event ID is canonical', () => assert.equal(P.isEventId(first.eventId), true));
test('event ID is bound to canonical body', () => assert.equal(P.validateEvent(first, snapshot).eventId, first.eventId));
test('event payload position is preserved', () => assert.deepEqual(first.payload.positionCell, { x: 12, y: 2, z: -4 }));
test('source entity belongs to source faction', () => assert.equal(f.r.getEntity(first.sourceEntityId).ownerFactionId, first.sourceFactionId));

const sameA = P.createEvent({ ...sighting(f), eventSequence: 12 }, snapshot);
const sameB = P.createEvent({ ...sighting(f), eventSequence: 12, payload: { movementBand: 'fast', positionCell: { z: -4, x: 12, y: 2 }, hostility: 'hostile', classification: 'stalker' } }, snapshot);
test('canonical key order produces identical event ID', () => assert.equal(sameA.eventId, sameB.eventId));
test('changed payload changes event ID', () => assert.notEqual(P.createEvent({ ...sighting(f), eventSequence: 12, payload: { ...sighting(f).payload, hostility: 'unknown' } }, snapshot).eventId, sameA.eventId));

rejects('FX-OMNISCIENT aggregate field rejected', () => stream.append({ ...sighting(f), payload: { ...sighting(f).payload, enemyCount: 99 } }), /unexpected or missing fields/);
rejects('FX-HIDDEN-STATE hidden health rejected', () => stream.append({ ...sighting(f), payload: { ...sighting(f).payload, hiddenHealth: 62 } }), /unexpected or missing fields/);
rejects('unregistered observer rejected', () => stream.append({ ...sighting(f), observerFactionId: 'zkid:v1:faction:human:UNKNOWN', sourceFactionId: 'zkid:v1:faction:human:UNKNOWN' }), /not registered/);
rejects('unregistered source entity rejected', () => stream.append({ ...sighting(f), sourceEntityId: I.humanUnitEntityId({ worldId: f.worldId, userId: 'missing' }) }), /not an active registered entity/);
rejects('source ownership mismatch rejected', () => stream.append({ ...sighting(f), sourceFactionId: f.s1 }), /not owned/);
rejects('non-share observer/source faction mismatch rejected', () => stream.append({ ...sighting(f), observerFactionId: f.s1 }), /observerFactionId to equal sourceFactionId/);
rejects('wrong subject kind rejected', () => stream.append({ ...sighting(f), subjectId: f.structure }), /does not accept subject kind/);
rejects('wrong source type rejected', () => stream.append({ ...sighting(f), sourceType: 'resource_sensor' }), /not allowed/);
rejects('fractional quantum rejected', () => stream.append({ ...sighting(f), observedAtQuantum: 1.5 }), /safe integer/);
rejects('wall-clock field rejected', () => stream.append({ ...sighting(f), observedAtMs: 1000 }), /unexpected or missing fields/);
rejects('non-integer position rejected', () => stream.append({ ...sighting(f), payload: { ...sighting(f).payload, positionCell: { x: 1.2, y: 0, z: 0 } } }), /safe integer/);

const lost = stream.append({
  eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 8,
  sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 2, z: -4 }, reason: 'occluded' },
});
test('enemy_lost accepted', () => assert.equal(lost.eventType, 'enemy_lost'));

const combat = stream.append({
  eventType: 'combat_alert', observerFactionId: f.human, sourceFactionId: f.human,
  sourceEntityId: f.player, subjectId: f.structure, observedAtQuantum: 9,
  sourceType: 'damage_sensor', payload: { contactRole: 'defender', positionCell: { x: 4, y: 0, z: 5 }, severity: 'high' },
});
test('combat alert accepts structure subject', () => assert.equal(combat.payload.severity, 'high'));

const observed = stream.append({
  eventType: 'structure_observed', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 10,
  sourceType: 'line_of_sight', payload: { observedOwnerFactionId: f.human, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'operational', structureKind: 'power' },
});
test('structure observation validates visible owner', () => assert.equal(observed.payload.observedOwnerFactionId, f.human));

const resource = stream.append({
  eventType: 'resource_discovered', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout0, subjectId: f.resource, observedAtQuantum: 11,
  sourceType: 'proximity_sensor', payload: { abundanceBand: 'high', positionCell: { x: 1, y: 0, z: 1 }, resourceKind: 'tree' },
});
test('resource discovery accepted', () => assert.equal(resource.payload.resourceKind, 'tree'));

const route = stream.append({
  eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout0, subjectId: f.route, observedAtQuantum: 12,
  sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 0 }, status: 'blocked' },
});
test('route observation accepted', () => assert.equal(route.payload.status, 'blocked'));

const shared = stream.share({ originalEventId: first.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 13, shareMode: 'direct' });
test('explicit share targets recipient faction', () => assert.equal(shared.observerFactionId, f.s1));
test('share preserves original event bytes', () => assert.deepEqual(shared.payload.sharedEvent, first));
test('share preserves original observation quantum', () => assert.equal(shared.payload.sharedEvent.observedAtQuantum, 7));
rejects('FX-LEAK non-observer cannot share event', () => stream.share({ originalEventId: first.eventId, senderFactionId: f.s1, recipientFactionId: f.human, sourceEntityId: f.scout1, observedAtQuantum: 14 }), /Only the faction that observed/);
rejects('share cannot predate observation', () => stream.share({ originalEventId: first.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 6 }), /before it was observed/);
rejects('nested share rejected', () => stream.share({ originalEventId: shared.eventId, senderFactionId: f.s1, recipientFactionId: f.human, sourceEntityId: f.scout1, observedAtQuantum: 14 }), /Nested intelligence/);

const s0Events = stream.eventsForFaction(f.s0);
const s1Events = stream.eventsForFaction(f.s1);
test('private stream query excludes recipient-only share from sender', () => assert.equal(s0Events.some(e => e.eventId === shared.eventId), false));
test('recipient stream includes explicit share', () => assert.equal(s1Events.some(e => e.eventId === shared.eventId), true));

test('snapshot is deterministic', () => assert.equal(stream.snapshotHash(), stream.snapshotHash()));
const snapshotBytes = I.canonicalStringify(stream.snapshot());
const restored = P.PerceptionEventStream.fromSnapshot(snapshot, stream.snapshot());
test('snapshot round-trip is byte-identical', () => assert.equal(I.canonicalStringify(restored.snapshot()), snapshotBytes));
test('snapshot hash round-trip', () => assert.equal(restored.snapshotHash(), stream.snapshotHash()));
const mutated = stream.snapshot(); mutated.events[0].payload.positionCell.x = 999;
test('FX-CLONE-ALIAS snapshot mutation cannot alter stream', () => assert.equal(stream.getEvent(first.eventId).payload.positionCell.x, 12));
rejects('FX-SEQUENCE-REUSE duplicate sequence snapshot rejected', () => {
  const bad = stream.snapshot(); bad.events[1].eventSequence = 1;
  P.PerceptionEventStream.fromSnapshot(snapshot, bad);
}, /canonical event body|contiguous/);
rejects('FX-EVENT-ID-TAMPER rejected', () => P.validateEvent({ ...first, eventId: first.eventId.replace(/[0-9a-f]$/, '0') }, snapshot), /does not match/);

test('retired subject remains valid historical subject', () => {
  const r2 = I.IdentityRegistry.fromSnapshot(snapshot); r2.retire(f.enemy);
  assert.equal(P.validateEvent(first, r2.snapshot()).subjectId, f.enemy);
});

test('fixed replay is deterministic', () => {
  function replay() {
    const s = new P.PerceptionEventStream({ identitySnapshot: snapshot });
    const a = s.append(sighting(f));
    s.append({ eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 2, z: -4 }, reason: 'out_of_range' } });
    return { first: a.eventId, bytes: I.canonicalStringify(s.snapshot()), hash: s.snapshotHash() };
  }
  assert.deepEqual(replay(), replay());
});

console.log(`W0-O.1 PERCEPTION EVENT CONTRACT TESTS PASS (${checks}/${checks})`);
