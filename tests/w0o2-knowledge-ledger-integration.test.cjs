#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
function object(x = 0, y = 0, z = 0) { return { position: { x, y, z }, userData: {} }; }
function gameFixture() {
  return {
    user: { id: 'user-1', teamCode: 'FOREST ALPHA', officerClass: 'ensign' }, biomeSeed: 5207,
    player: { group: object(0, 0, 0) }, perceptionQuantum: 4,
    terrain: {
      localTerritories: [{ x: 50, y: 0, z: 20 }, { x: -45, y: 0, z: -28 }],
      harvestableTrees: [{ position: { x: 3.4, y: 0, z: 2.6 }, userData: { treeId: 'tree-1' } }],
      powerUpNodes: [], mineableRocks: [], resourceNodes: [],
    },
    buildings: { records: [{ id: 'power-1', type: 'power', x: 4, y: 0, z: 5 }], addRecord(r) { this.records.push(r); return r; } },
    enemies: [], multiplayerRoom: { clientId: 'local', remotePlayers: new Map() }, disposed: false,
    spawnEnemy(hostile = true, role = 'stalker', x = 6, z = 0) {
      const e = object(x, 0, z); Object.assign(e.userData, { health: 50, hostile, enemyType: role }); this.enemies.push(e); return e;
    },
  };
}

(async () => {
  const root = path.join(__dirname, '..');
  const { IdentityIntegration } = await import(pathToFileURL(path.join(root, 'src/game/IdentityIntegration.js')).href);
  const { PerceptionEventIntegration } = await import(pathToFileURL(path.join(root, 'src/game/PerceptionEventIntegration.js')).href);
  const { FactionKnowledgeIntegration } = await import(pathToFileURL(path.join(root, 'src/game/FactionKnowledgeIntegration.js')).href);
  let checks = 0;
  function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }

  const store = storage();
  const game = gameFixture();
  const identity = new IdentityIntegration({ game, storage: store }).install();
  const perception = new PerceptionEventIntegration({ game, identityIntegration: identity, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const knowledge = new FactionKnowledgeIntegration({ game, identityIntegration: identity, perceptionIntegration: perception, storage: store, quantumProvider: () => game.perceptionQuantum }).install();

  test('integration installed globally', () => assert.equal(globalThis.ZekNovaFactionKnowledgeIntegration, knowledge));
  test('adapter installed globally', () => assert.equal(globalThis.ZEK_FACTION_KNOWLEDGE_ADAPTER.id, 'zeknova-faction-knowledge-adapter-v1'));
  test('ledger starts empty', () => assert.equal(knowledge.captureSnapshot().records.length, 0));
  test('ledger starts at live quantum', () => assert.equal(knowledge.captureSnapshot().currentQuantum, 4));

  const hidden = game.spawnEnemy(true, 'stalker', 20, 0);
  test('enemy receives stable identity before knowledge', () => assert.match(hidden.userData.entityId, /^zkid:v1:entity:unit:zeknovan:/));
  test('FX-OMNISCIENT unobserved enemy creates no ledger record', () => assert.equal(knowledge.captureSnapshot().records.length, 0));
  const none = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile' });
  test('out-of-range perception produces no event', () => assert.equal(none, null));
  test('out-of-range enemy remains absent from ledger', () => assert.equal(knowledge.captureSnapshot().records.length, 0));

  hidden.position.x = 4;
  const seen = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile', movementBand: 'fast' });
  const humanRecords = knowledge.recordsForFaction(identity.humanFactionId);
  test('grounded sighting creates one private record', () => assert.equal(humanRecords.length, 1));
  test('record subject matches sighted enemy', () => assert.equal(humanRecords[0].subjectId, seen.subjectId));
  test('record is fresh at observation quantum', () => assert.equal(humanRecords[0].knowledgeState, 'fresh'));
  test('record facts contain only perception payload derivation', () => assert.deepEqual(humanRecords[0].currentFacts.positionCell, { x: 4, y: 0, z: 0 }));
  test('settlement has no leaked record before sharing', () => assert.equal(knowledge.recordsForFaction(identity.settlements[0].factionId).length, 0));

  const lost = perception.reportEnemyLost({ observer: game.player.group, enemy: hidden, observedAtQuantum: 5, reason: 'out_of_range' });
  game.perceptionQuantum = 5;
  const lostRecord = knowledge.getRecord(identity.humanFactionId, hidden.userData.entityId, 'unit_contact');
  test('enemy lost event is ingested', () => assert.equal(lost.eventSequence, 2));
  test('enemy lost supersedes sighting', () => assert.equal(lostRecord.currentEvidence.eventType, 'enemy_lost'));
  test('enemy lost becomes explicitly stale', () => assert.equal(lostRecord.knowledgeState, 'stale'));
  test('evidence history preserves sighting and lost event', () => assert.equal(lostRecord.evidenceCount, 2));

  const resource = game.terrain.harvestableTrees[0];
  perception.reportResourceDiscovered({ observer: game.player.group, resource, resourceKind: 'tree', abundanceBand: 'high', observedAtQuantum: 6 });
  game.perceptionQuantum = 6;
  const resourceRecord = knowledge.getRecord(identity.humanFactionId, resource.userData.entityId, 'resource_location');
  test('resource discovery creates resource knowledge', () => assert.equal(resourceRecord.currentFacts.resourceKind, 'tree'));
  test('resource knowledge is fresh', () => assert.equal(resourceRecord.knowledgeState, 'fresh'));

  const recipient = identity.settlements[0].factionId;
  perception.shareEvent({ originalEventId: seen.eventId, sender: game.player.group, recipientFactionId: recipient, observedAtQuantum: 8 });
  game.perceptionQuantum = 8;
  const recipientRecord = knowledge.getRecord(recipient, hidden.userData.entityId, 'unit_contact');
  test('explicit sharing creates recipient knowledge', () => assert.equal(recipientRecord.currentEvidence.acquisitionMode, 'shared'));
  test('shared record preserves sender provenance', () => assert.equal(recipientRecord.currentEvidence.sharedFromFactionId, identity.humanFactionId));
  test('shared record preserves original observation quantum', () => assert.equal(recipientRecord.currentEvidence.effectiveObservedAtQuantum, 4));
  test('sharing at expiry does not refresh knowledge', () => assert.equal(recipientRecord.knowledgeState, 'stale'));
  test('sender ledger excludes recipient share envelope', () => assert.equal(knowledge.recordsForFaction(identity.humanFactionId).length, 2));

  const snapshot = knowledge.captureSnapshot();
  const hash = knowledge.ledger.snapshotHash();
  const adapterSnapshot = globalThis.ZEK_FACTION_KNOWLEDGE_ADAPTER.captureKnowledgeSnapshot();
  test('adapter snapshot equals integration snapshot', () => assert.deepEqual(adapterSnapshot, snapshot));
  test('adapter hash equals ledger hash', () => assert.equal(globalThis.ZEK_FACTION_KNOWLEDGE_ADAPTER.knowledgeSnapshotHash(adapterSnapshot), hash));
  test('adapter faction query is private', () => assert.equal(globalThis.ZEK_FACTION_KNOWLEDGE_ADAPTER.recordsForFaction(recipient).length, 1));
  test('repeated capture is deterministic', () => assert.deepEqual(knowledge.captureSnapshot(), snapshot));
  test('repeated sync does not duplicate evidence', () => { knowledge.sync(); assert.equal(knowledge.getRecord(identity.humanFactionId, hidden.userData.entityId, 'unit_contact').evidenceCount, 2); });

  game.perceptionQuantum = 26;
  knowledge.advanceToQuantum(26);
  test('live time advance marks resource stale at exact expiry', () => assert.equal(knowledge.getRecord(identity.humanFactionId, resource.userData.entityId, 'resource_location').knowledgeState, 'stale'));
  test('fresh-only query excludes expired resource', () => assert.equal(knowledge.recordsForFaction(identity.humanFactionId, { includeStale: false }).some(r => r.subjectId === resource.userData.entityId), false));

  const savedHash = knowledge.ledger.snapshotHash();
  knowledge.dispose(); perception.dispose(); identity.dispose();
  const game2 = gameFixture(); game2.perceptionQuantum = 26;
  const identity2 = new IdentityIntegration({ game: game2, storage: store }).install();
  const perception2 = new PerceptionEventIntegration({ game: game2, identityIntegration: identity2, storage: store, quantumProvider: () => game2.perceptionQuantum }).install();
  const knowledge2 = new FactionKnowledgeIntegration({ game: game2, identityIntegration: identity2, perceptionIntegration: perception2, storage: store, quantumProvider: () => game2.perceptionQuantum }).install();
  test('ledger snapshot survives restore', () => assert.equal(knowledge2.captureSnapshot().records.length, snapshot.records.length));
  test('restored ledger hash is byte-identical', () => assert.equal(knowledge2.ledger.snapshotHash(), savedHash));
  test('restored applied sequence reaches event stream', () => assert.equal(knowledge2.captureSnapshot().nextExpectedEventSequence, perception2.captureSnapshot().nextEventSequence));

  const newEnemy = game2.spawnEnemy(true, 'spitter', 3, 0);
  perception2.observeEnemyByProximity({ observer: game2.player.group, enemy: newEnemy, radius: 5, observedAtQuantum: 27, hostility: 'hostile' });
  game2.perceptionQuantum = 27;
  const newRecord = knowledge2.getRecord(identity2.humanFactionId, newEnemy.userData.entityId, 'unit_contact');
  test('new identity can enter restored ledger after identity refresh', () => assert.equal(newRecord.currentEvidence.eventType, 'enemy_sighted'));
  test('new event advances ledger sequence without reuse', () => assert.equal(knowledge2.captureSnapshot().nextExpectedEventSequence, perception2.captureSnapshot().nextEventSequence));

  knowledge2.dispose(); perception2.dispose(); identity2.dispose();
  test('dispose clears global knowledge integration', () => assert.equal(globalThis.ZekNovaFactionKnowledgeIntegration, null));

  console.log(`W0-O.2 KNOWLEDGE LEDGER INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
