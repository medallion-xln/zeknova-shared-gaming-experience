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
]) (0, eval)(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
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
  const structure = I.structureEntityId({ worldId, recordId: 'watchtower-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure:watchtower-1' });
  const resource = I.resourceEntityId({ worldId, resourceKind: 'tree', sourceId: 'tree-1' });
  r.registerEntity({ entityId: resource, kind: 'resource', ownerFactionId: null, sourceKey: 'resource:tree-1' });
  const route = I.routeEntityId({ worldId, routeKey: 'central-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route:central-crossing' });
  return { worldId, human, s0, s1, r, player, scout0, scout1, enemy, structure, resource, route };
}
function sighting(stream, f, options = {}) {
  return stream.append({
    eventType: 'enemy_sighted', observerFactionId: options.observerFactionId || f.s0,
    sourceFactionId: options.sourceFactionId || f.s0, sourceEntityId: options.sourceEntityId || f.scout0,
    subjectId: options.subjectId || f.enemy, observedAtQuantum: options.quantum ?? 7,
    sourceType: 'line_of_sight', payload: {
      classification: options.classification || 'stalker', hostility: options.hostility || 'hostile',
      movementBand: options.movementBand || 'fast', positionCell: options.positionCell || { x: 12, y: 0, z: -4 },
    },
  });
}

const f = fixture();
test('contract identity', () => assert.equal(K.CONTRACT_ID, 'zeknova-knowledge-ledger-contract-v1'));
test('registry identity', () => assert.equal(K.REGISTRY_ID, 'zeknova-faction-knowledge-v1-development'));
test('schema version', () => assert.equal(K.SCHEMA_VERSION, 1));
test('six knowledge topics declared', () => assert.equal(K.TOPICS.length, 6));
test('nine source event policies declared', () => assert.equal(Object.keys(K.EVENT_POLICIES).length, 9));
test('mobile sighting TTL is four quanta', () => assert.equal(K.EVENT_POLICIES.enemy_sighted.ttlQuanta, 4));
test('structure identity is persistent', () => assert.equal(K.EVENT_POLICIES.structure_observed.ttlQuanta, null));

const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
const seen = sighting(stream, f);
const lost = stream.append({ eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { lastKnownPositionCell: { x: 12, y: 0, z: -4 }, reason: 'occluded' } });
const resource = stream.append({ eventType: 'resource_discovered', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.resource, observedAtQuantum: 8, sourceType: 'resource_sensor', payload: { abundanceBand: 'high', positionCell: { x: 2, y: 0, z: 3 }, resourceKind: 'tree' } });
const route = stream.append({ eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.route, observedAtQuantum: 9, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' } });
const structureObserved = stream.append({ eventType: 'structure_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 10, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: f.s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'operational', structureKind: 'watchtower' } });
const damaged = stream.append({ eventType: 'structure_damaged', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 11, sourceType: 'damage_sensor', payload: { damageBand: 'heavy', positionCell: { x: 4, y: 0, z: 5 } } });
const destroyed = stream.append({ eventType: 'structure_destroyed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 12, sourceType: 'damage_sensor', payload: { confirmation: 'direct_sensor', positionCell: { x: 4, y: 0, z: 5 } } });
const combat = stream.append({ eventType: 'combat_alert', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.enemy, observedAtQuantum: 13, sourceType: 'combat_contact', payload: { contactRole: 'attacker', positionCell: { x: 10, y: 0, z: -2 }, severity: 'high' } });
const shared = stream.share({ originalEventId: seen.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 14, shareMode: 'direct' });

const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() });
test('ledger starts empty', () => assert.equal(ledger.snapshot().records.length, 0));
test('ledger starts at event sequence one', () => assert.equal(ledger.snapshot().nextExpectedEventSequence, 1));
ledger.synchronize(stream.snapshot());
test('stream synchronization consumes every event', () => assert.equal(ledger.snapshot().nextExpectedEventSequence, stream.snapshot().nextEventSequence));
test('ledger time advances to latest delivery quantum', () => assert.equal(ledger.currentQuantum, 14));
test('applied event IDs preserve stream order', () => assert.deepEqual(ledger.snapshot().appliedEventIds, stream.snapshot().events.map(e => e.eventId)));
test('sender has five subject-topic records', () => assert.equal(ledger.recordsForFaction(f.s0).length, 5));
test('recipient receives only explicitly shared record', () => assert.equal(ledger.recordsForFaction(f.s1).length, 1));
test('human faction receives no leaked knowledge', () => assert.equal(ledger.recordsForFaction(f.human).length, 0));

const unit = ledger.getRecord(f.s0, f.enemy, 'unit_contact');
test('enemy lost supersedes earlier sighting', () => assert.equal(unit.currentEvidence.eventType, 'enemy_lost'));
test('enemy lost is stale at its exact observation quantum', () => assert.equal(ledger.getRecord(f.s0, f.enemy, 'unit_contact', { quantum: 8 }).knowledgeState, 'stale'));
test('unit contact preserves both evidence entries', () => assert.equal(unit.evidenceCount, 2));
test('unit contact records one contradiction', () => assert.equal(unit.contradictionCount, 1));
test('record identity is canonical', () => assert.equal(unit.recordId, K.recordIdFor(f.worldId, f.s0, f.enemy, 'unit_contact')));
test('record identity validates', () => assert.equal(K.isRecordId(unit.recordId), true));

const sharedUnit = ledger.getRecord(f.s1, f.enemy, 'unit_contact');
test('shared knowledge carries shared acquisition mode', () => assert.equal(sharedUnit.currentEvidence.acquisitionMode, 'shared'));
test('shared knowledge preserves original observation quantum', () => assert.equal(sharedUnit.currentEvidence.effectiveObservedAtQuantum, 7));
test('shared knowledge preserves delivery quantum separately', () => assert.equal(sharedUnit.currentEvidence.deliveredAtQuantum, 14));
test('sharing does not refresh stale information', () => assert.equal(sharedUnit.knowledgeState, 'stale'));
test('sharing provenance identifies sender', () => assert.equal(sharedUnit.currentEvidence.sharedFromFactionId, f.s0));

const structureRecord = ledger.getRecord(f.s0, f.structure, 'structure_status');
test('destroyed structure supersedes earlier status', () => assert.equal(structureRecord.currentFacts.statusBand, 'destroyed'));
test('destroyed structure knowledge is persistent', () => assert.equal(structureRecord.currentEvidence.persistent, true));
test('persistent structure remains fresh far in future', () => assert.equal(ledger.getRecord(f.s0, f.structure, 'structure_status', { quantum: 1000 }).knowledgeState, 'fresh'));
test('structure evidence preserves two contradictions', () => assert.equal(structureRecord.contradictionCount, 2));
test('structure evidence history has three entries', () => assert.equal(structureRecord.evidenceCount, 3));

const routeRecord = ledger.getRecord(f.s0, f.route, 'route_status');
test('route is fresh before exclusive expiry', () => assert.equal(ledger.getRecord(f.s0, f.route, 'route_status', { quantum: 16 }).knowledgeState, 'fresh'));
test('route is stale at exclusive expiry', () => assert.equal(ledger.getRecord(f.s0, f.route, 'route_status', { quantum: 17 }).knowledgeState, 'stale'));
const resourceRecord = ledger.getRecord(f.s0, f.resource, 'resource_location');
test('resource is fresh before twenty-quantum expiry', () => assert.equal(ledger.getRecord(f.s0, f.resource, 'resource_location', { quantum: 27 }).knowledgeState, 'fresh'));
test('resource is stale at twenty-quantum expiry', () => assert.equal(ledger.getRecord(f.s0, f.resource, 'resource_location', { quantum: 28 }).knowledgeState, 'stale'));
const combatRecord = ledger.getRecord(f.s0, f.enemy, 'combat_alert');
test('same subject can hold separate knowledge topics', () => assert.notEqual(combatRecord.recordId, unit.recordId));
test('combat alert is stale after two quanta', () => assert.equal(ledger.getRecord(f.s0, f.enemy, 'combat_alert', { quantum: 15 }).knowledgeState, 'stale'));
test('fresh-only query excludes stale records', () => assert.equal(ledger.recordsForFaction(f.s0, { quantum: 15, includeStale: false }).some(r => r.recordId === combatRecord.recordId), false));

const beforeAdvance = ledger.snapshotHash();
ledger.advanceToQuantum(20);
test('ledger advances monotonically', () => assert.equal(ledger.currentQuantum, 20));
test('time advance changes snapshot hash', () => assert.notEqual(ledger.snapshotHash(), beforeAdvance));
rejects('FX-TIME ledger cannot move backward', () => ledger.advanceToQuantum(19), /may not move backwards/);

const snap = ledger.snapshot();
const restored = K.FactionKnowledgeLedger.fromSnapshot(f.r.snapshot(), snap);
test('snapshot round-trip is byte-identical', () => assert.deepEqual(restored.snapshot(), snap));
test('snapshot hash round-trip is identical', () => assert.equal(restored.snapshotHash(), ledger.snapshotHash()));
const detached = ledger.snapshot(); detached.records[0].evidence[0].facts.tamper = true;
test('FX-CLONE-ALIAS snapshot mutation cannot alter ledger', () => assert.deepEqual(ledger.snapshot(), snap));
rejects('FX-RECORD-ID tamper rejected', () => { const x = structuredClone(snap); x.records[0].recordId = 'zklr:v1:0000000000000000'; K.FactionKnowledgeLedger.fromSnapshot(f.r.snapshot(), x); }, /record ID/);
rejects('FX-CONTRADICTION-COUNT tamper rejected', () => { const x = structuredClone(snap); x.records[0].contradictionCount++; K.FactionKnowledgeLedger.fromSnapshot(f.r.snapshot(), x); }, /contradictionCount/);
rejects('FX-EVIDENCE-ALIAS duplicate event sequence rejected', () => { const x = structuredClone(snap); x.records[0].evidence.push(structuredClone(x.records[0].evidence[0])); K.FactionKnowledgeLedger.fromSnapshot(f.r.snapshot(), x); }, /strictly increasing/);
rejects('FX-EVENT-GAP noncontiguous ingestion rejected', () => { const l = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); l.ingestEvent(stream.snapshot().events[1]); }, /contiguously/);
rejects('FX-EVENT-REUSE duplicate event ingestion rejected', () => { const l = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); l.ingestEvent(stream.snapshot().events[0]); l.ingestEvent(stream.snapshot().events[0]); }, /contiguously|twice/);

const precedenceStream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
const sharedSource = sighting(precedenceStream, f, { subjectId: f.player, quantum: 5, classification: 'human_officer' });
precedenceStream.share({ originalEventId: sharedSource.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 8, shareMode: 'direct' });
sighting(precedenceStream, f, { observerFactionId: f.s1, sourceFactionId: f.s1, sourceEntityId: f.scout1, subjectId: f.player, quantum: 5, classification: 'human_officer', movementBand: 'slow' });
const precedenceLedger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() });
precedenceLedger.synchronize(precedenceStream.snapshot());
const precedenceRecord = precedenceLedger.getRecord(f.s1, f.player, 'unit_contact');
test('direct evidence outranks shared evidence at equal observation time', () => assert.equal(precedenceRecord.currentEvidence.acquisitionMode, 'direct'));
test('equal-time direct evidence keeps direct facts', () => assert.equal(precedenceRecord.currentFacts.movementBand, 'slow'));

const oldStream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
oldStream.append({ eventType: 'structure_destroyed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 12, sourceType: 'damage_sensor', payload: { confirmation: 'visual', positionCell: { x: 4, y: 0, z: 5 } } });
oldStream.append({ eventType: 'structure_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 5, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: f.s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'operational', structureKind: 'watchtower' } });
const oldLedger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); oldLedger.synchronize(oldStream.snapshot());
test('older late-delivered evidence cannot override newer observation', () => assert.equal(oldLedger.getRecord(f.s0, f.structure, 'structure_status').currentFacts.statusBand, 'destroyed'));
test('late older evidence remains in evidence history', () => assert.equal(oldLedger.getRecord(f.s0, f.structure, 'structure_status').evidenceCount, 2));

test('ledger snapshot contains no wall-clock fields', () => assert.equal(/timestamp|createdAt|updatedAt|Date/.test(JSON.stringify(ledger.snapshot())), false));
test('fixed replay produces deterministic bytes', () => { const a = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); const b = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); a.synchronize(stream.snapshot()); b.synchronize(stream.snapshot()); assert.equal(I.canonicalStringify(a.snapshot()), I.canonicalStringify(b.snapshot())); });
test('fixed replay produces deterministic hash', () => { const a = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); const b = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() }); a.synchronize(stream.snapshot()); b.synchronize(stream.snapshot()); assert.equal(a.snapshotHash(), b.snapshotHash()); });

console.log(`W0-O.2 KNOWLEDGE LEDGER CONTRACT TESTS PASS (${checks}/${checks})`);
