#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
for (const relative of [
  'azl/zeknova-identity-contract-v1.js',
  'azl/zeknova-perception-event-contract-v1.js',
  'azl/zeknova-knowledge-ledger-contract-v1.js',
  'azl/zeknova-faction-observation-contract-v1.js',
]) (0, eval)(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
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
  const enemyA = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const enemyB = r.allocateSpawn({ role: 'spitter', ownerFactionId: s1 }).entityId;
  const hiddenEnemy = r.allocateSpawn({ role: 'juggernaut', ownerFactionId: s1 }).entityId;
  const structure = I.structureEntityId({ worldId, recordId: 'watchtower-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure:watchtower-1' });
  const resource = I.resourceEntityId({ worldId, resourceKind: 'tree', sourceId: 'tree-1' });
  r.registerEntity({ entityId: resource, kind: 'resource', ownerFactionId: null, sourceKey: 'resource:tree-1' });
  const route = I.routeEntityId({ worldId, routeKey: 'central-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route:central-crossing' });
  return { worldId, human, s0, s1, r, player, scout0, scout1, enemyA, enemyB, hiddenEnemy, structure, resource, route };
}

function buildStream(f, includeHiddenPrivate = false, freshX = 7) {
  const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemyA, observedAtQuantum: 7, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  stream.append({ eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemyA, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 0, z: -4 }, reason: 'occluded' } });
  stream.append({ eventType: 'resource_discovered', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.resource, observedAtQuantum: 8, sourceType: 'resource_sensor', payload: { abundanceBand: 'high', positionCell: { x: 2, y: 0, z: 3 }, resourceKind: 'tree' } });
  stream.append({ eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.route, observedAtQuantum: 9, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' } });
  stream.append({ eventType: 'structure_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 10, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: f.s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'operational', structureKind: 'watchtower' } });
  stream.append({ eventType: 'structure_damaged', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 11, sourceType: 'damage_sensor', payload: { damageBand: 'heavy', positionCell: { x: 4, y: 0, z: 5 } } });
  stream.append({ eventType: 'structure_destroyed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 12, sourceType: 'damage_sensor', payload: { confirmation: 'direct_sensor', positionCell: { x: 4, y: 0, z: 5 } } });
  stream.append({ eventType: 'combat_alert', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemyA, observedAtQuantum: 13, sourceType: 'combat_contact', payload: { contactRole: 'attacker', positionCell: { x: 10, y: 0, z: -2 }, severity: 'high' } });
  const fresh = stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemyB, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'hostile', movementBand: 'slow', positionCell: { x: freshX, y: 0, z: 6 } } });
  stream.share({ originalEventId: fresh.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 14, shareMode: 'direct' });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s1, sourceFactionId: f.s1, sourceEntityId: f.scout1, subjectId: f.player, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'human_officer', hostility: 'unknown', movementBand: 'stationary', positionCell: { x: 0, y: 0, z: 0 } } });
  stream.append({ eventType: 'infrastructure_status_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.route, observedAtQuantum: 14, sourceType: 'infrastructure_sensor', payload: { infrastructureKind: 'river_crossing', positionCell: { x: 0, y: 0, z: 1 }, status: 'degraded' } });
  if (includeHiddenPrivate) stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s1, sourceFactionId: f.s1, sourceEntityId: f.scout1, subjectId: f.hiddenEnemy, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'juggernaut', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -8, y: 0, z: 9 } } });
  return stream;
}

function ledgerFor(f, includeHiddenPrivate = false) {
  const stream = buildStream(f, includeHiddenPrivate);
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() });
  ledger.synchronize(stream.snapshot());
  return { stream, ledger };
}

const f = fixture();
const base = ledgerFor(f, false);
const packet = O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: f.s0, quantum: 14 });

test('contract identity', () => assert.equal(O.CONTRACT_ID, 'zeknova-faction-observation-contract-v1'));
test('registry identity', () => assert.equal(O.REGISTRY_ID, 'zeknova-faction-observation-v1-development'));
test('schema version', () => assert.equal(O.SCHEMA_VERSION, 1));
test('feature layout identity', () => assert.equal(O.FEATURE_LAYOUT_ID, 'zeknova-prime-observation-layout-v1'));
test('topic order matches knowledge contract', () => assert.deepEqual(O.TOPIC_ORDER, K.TOPICS));
test('six fixed topic sections', () => assert.equal(packet.sections.length, 6));
test('thirty-six total slots', () => assert.equal(O.TOTAL_SLOTS, 36));
test('fixed feature count is 592', () => assert.equal(O.FEATURE_COUNT, 592));
test('feature spec matches feature count', () => assert.equal(O.FEATURE_SPEC.length, O.FEATURE_COUNT));
test('feature vector matches feature count', () => assert.equal(packet.featureVector.length, O.FEATURE_COUNT));
test('all features are finite and bounded', () => assert.equal(packet.featureVector.every(v => Number.isFinite(v) && v >= -1 && v <= 1), true));
test('packet identity is canonical', () => assert.equal(O.isObservationId(packet.observationId), true));
test('packet validates byte-identically', () => assert.deepEqual(O.validateObservation(packet), packet));
test('packet carries explicit faction', () => assert.equal(packet.factionId, f.s0));
test('packet carries explicit quantum', () => assert.equal(packet.quantum, 14));
test('packet has six fresh records', () => assert.equal(packet.totalFreshRecordCount, 6));
test('packet selected all fresh records', () => assert.equal(packet.selectedFreshRecordCount, 6));
test('packet omitted no records', () => assert.equal(packet.omittedFreshRecordCount, 0));

const slots = packet.sections.flatMap(s => s.slots.filter(Boolean));
test('FX-STALE-OBSERVATION lost unit is excluded', () => assert.equal(slots.some(s => s.subjectId === f.enemyA && s.topic === 'unit_contact'), false));
test('fresh unit contact is included', () => assert.equal(slots.some(s => s.subjectId === f.enemyB && s.topic === 'unit_contact'), true));
test('fresh combat alert is included separately', () => assert.equal(slots.some(s => s.subjectId === f.enemyA && s.topic === 'combat_alert'), true));
test('persistent destroyed structure is included', () => assert.equal(slots.some(s => s.subjectId === f.structure && s.facts.statusBand === 'destroyed'), true));
test('fresh route is included', () => assert.equal(slots.some(s => s.subjectId === f.route && s.topic === 'route_status'), true));
test('fresh infrastructure status is included', () => assert.equal(slots.some(s => s.subjectId === f.route && s.topic === 'infrastructure_status'), true));
test('FX-LEAK other faction private player sighting excluded', () => assert.equal(slots.some(s => s.subjectId === f.player), false));
test('no event sequence fields enter packet', () => assert.equal(/eventSequence|nextExpectedEventSequence|sourceEventSequence|deliveryEventSequence/.test(JSON.stringify(packet)), false));
test('no event IDs enter packet', () => assert.equal(/zkev:v1:/.test(JSON.stringify(packet)), false));
test('no wall clock fields enter packet', () => assert.equal(/timestamp|createdAt|updatedAt|Date/.test(JSON.stringify(packet)), false));
test('no authoritative aggregate fields enter packet', () => assert.equal(/enemyCount|totalEnemies|globalThreat|authoritative/.test(JSON.stringify(packet)), false));

const repeated = O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: f.s0, quantum: 14 });
test('FX-OBS-NONDET repeated packet bytes are identical', () => assert.equal(I.canonicalStringify(repeated), I.canonicalStringify(packet)));
test('FX-OBS-NONDET repeated observation IDs are identical', () => assert.equal(repeated.observationId, packet.observationId));
test('FX-OBS-NONDET repeated features are identical', () => assert.deepEqual(repeated.featureVector, packet.featureVector));

const hidden = ledgerFor(f, true);
const hiddenPacket = O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: hidden.ledger.snapshot(), factionId: f.s0, quantum: 14 });
test('FX-HIDDEN-STATE other-faction event does not change packet bytes', () => assert.equal(I.canonicalStringify(hiddenPacket), I.canonicalStringify(packet)));
test('FX-HIDDEN-STATE other-faction event does not change observation ID', () => assert.equal(hiddenPacket.observationId, packet.observationId));
test('FX-HIDDEN-STATE other-faction event does not change feature vector', () => assert.deepEqual(hiddenPacket.featureVector, packet.featureVector));

const extraIdentity = I.IdentityRegistry.fromSnapshot(f.r.snapshot());
const hiddenStructure = I.structureEntityId({ worldId: f.worldId, recordId: 'hidden-bunker' });
extraIdentity.registerEntity({ entityId: hiddenStructure, kind: 'structure', ownerFactionId: f.s1, sourceKey: 'hidden-bunker' });
const extraIdentityPacket = O.createObservation({ identitySnapshot: extraIdentity.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: f.s0, quantum: 14 });
test('FX-OMNISCIENT hidden identity registry additions do not change packet', () => assert.equal(I.canonicalStringify(extraIdentityPacket), I.canonicalStringify(packet)));

test('recipient packet includes explicitly shared fresh sighting', () => {
  const recipient = O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: f.s1, quantum: 14 });
  const recipientSlots = recipient.sections.flatMap(s => s.slots.filter(Boolean));
  assert.equal(recipientSlots.some(s => s.subjectId === f.enemyB && s.acquisitionMode === 'shared' && s.sharedFromFactionId === f.s0), true);
});
test('recipient packet also includes its direct private sighting', () => {
  const recipient = O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: f.s1, quantum: 14 });
  const recipientSlots = recipient.sections.flatMap(s => s.slots.filter(Boolean));
  assert.equal(recipientSlots.some(s => s.subjectId === f.player && s.acquisitionMode === 'direct'), true);
});

const state = new O.FactionObservation(packet);
const cloned = state.clone();
test('FX-CLONE-DROP clone retains observation ID', () => assert.equal(cloned.snapshot().observationId, packet.observationId));
test('FX-CLONE-DROP clone retains all 592 features', () => assert.equal(cloned.features().length, 592));
test('FX-CLONE-DROP clone hash equals parent hash', () => assert.equal(cloned.hash(), state.hash()));
const detached = cloned.snapshot(); detached.sections[0].slots[0].facts.positionCell.x = 999;
test('FX-CLONE-ALIAS clone snapshot mutation cannot alter parent', () => assert.deepEqual(state.snapshot(), packet));
const a = state.clone(); const b = state.clone(); const as = a.snapshot(); as.featureVector[0] = 0;
test('FX-CLONE-ALIAS sibling snapshots are detached', () => assert.equal(b.snapshot().featureVector[0], 1));

rejects('tampered observation ID rejected', () => { const x = structuredClone(packet); x.observationId = 'zkob:v1:0000000000000000'; O.validateObservation(x); }, /Observation ID/);
rejects('tampered feature vector rejected', () => { const x = structuredClone(packet); x.featureVector[20] = x.featureVector[20] === 0 ? 1 : 0; O.validateObservation(x); }, /feature vector/);
rejects('stale slot rejected at expiry', () => { const x = structuredClone(packet); const s = x.sections.find(v => v.topic === 'unit_contact').slots.find(Boolean); s.persistent = false; s.freshUntilQuantumExclusive = 14; const body = { ...x }; delete body.observationId; x.observationId = O.observationIdFor(body); O.validateObservation(x); }, /Stale knowledge/);
rejects('section reordering rejected', () => { const x = structuredClone(packet); [x.sections[0], x.sections[1]] = [x.sections[1], x.sections[0]]; O.validateObservation(x); }, /section order/);
rejects('slot record ID tamper rejected', () => { const x = structuredClone(packet); const s = x.sections.find(v => v.topic === 'unit_contact').slots.find(Boolean); s.recordId = K.recordIdFor(f.worldId, f.s1, s.subjectId, s.topic); const body = { ...x }; delete body.observationId; x.observationId = O.observationIdFor(body); O.validateObservation(x); }, /record ID/);
rejects('unknown faction rejected by builder', () => O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: I.humanFactionId({ teamCode: 'DESERT' }), quantum: 14 }), /not registered/);
rejects('fractional quantum rejected', () => O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: base.ledger.snapshot(), factionId: f.s0, quantum: 14.5 }), /safe integer/);

function overflowFixture() {
  const x = fixture();
  const enemies = [x.enemyA, x.enemyB, x.hiddenEnemy];
  for (let i = 0; i < 7; i++) enemies.push(x.r.allocateSpawn({ role: 'stalker', ownerFactionId: x.s1 }).entityId);
  const stream = new P.PerceptionEventStream({ identitySnapshot: x.r.snapshot() });
  const quanta = [16, 16, 17, 17, 18, 18, 18, 19, 19, 19];
  enemies.forEach((enemy, index) => stream.append({ eventType: 'enemy_sighted', observerFactionId: x.s0, sourceFactionId: x.s0, sourceEntityId: x.scout0, subjectId: enemy, observedAtQuantum: quanta[index], sourceType: 'line_of_sight', payload: { classification: 'stalker-' + index, hostility: 'hostile', movementBand: 'fast', positionCell: { x: index, y: 0, z: index } } }));
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: x.r.snapshot() }); ledger.synchronize(stream.snapshot());
  return { x, ledger };
}
const over = overflowFixture();
const overPacket = O.createObservation({ identitySnapshot: over.x.r.snapshot(), ledgerSnapshot: over.ledger.snapshot(), factionId: over.x.s0, quantum: 19 });
const unitSection = overPacket.sections.find(s => s.topic === 'unit_contact');
test('overflow total fresh count records all known fresh contacts', () => assert.equal(unitSection.totalFreshRecords, 10));
test('overflow selects fixed eight unit slots', () => assert.equal(unitSection.slots.filter(Boolean).length, 8));
test('overflow reports two omitted fresh contacts', () => assert.equal(unitSection.omittedFreshRecords, 2));
test('overflow packet reports global omitted count', () => assert.equal(overPacket.omittedFreshRecordCount, 2));
test('overflow selection keeps most recent observation', () => assert.equal(unitSection.slots[0].observedAtQuantum, 19));
test('overflow selection drops the two oldest observations first', () => assert.equal(Math.min(...unitSection.slots.filter(Boolean).map(s => s.observedAtQuantum)), 17));
const reorderedLedger = structuredClone(over.ledger.snapshot()); reorderedLedger.records.reverse();
const reorderPacket = O.createObservation({ identitySnapshot: over.x.r.snapshot(), ledgerSnapshot: reorderedLedger, factionId: over.x.s0, quantum: 19 });
test('ledger record array order does not affect observation', () => assert.equal(I.canonicalStringify(reorderPacket), I.canonicalStringify(overPacket)));

const changedStream = buildStream(f, false, 8);
const changedLedger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); changedLedger.synchronize(changedStream.snapshot());
const changedPacket = O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: changedLedger.snapshot(), factionId: f.s0, quantum: 14 });
test('changed visible fact changes observation ID', () => assert.notEqual(changedPacket.observationId, packet.observationId));
test('changed visible fact changes feature vector', () => assert.notDeepEqual(changedPacket.featureVector, packet.featureVector));

console.log(`W0-O.3 FACTION OBSERVATION CONTRACT TESTS PASS (${checks}/${checks})`);
