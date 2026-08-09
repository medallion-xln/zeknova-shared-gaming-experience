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
  const { FactionObservationIntegration } = await import(pathToFileURL(path.join(root, 'src/game/FactionObservationIntegration.js')).href);
  let checks = 0;
  function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }
  function rejects(name, fn, pattern) { test(name, () => assert.throws(fn, pattern)); }

  const store = storage();
  const game = gameFixture();
  const identity = new IdentityIntegration({ game, storage: store }).install();
  const perception = new PerceptionEventIntegration({ game, identityIntegration: identity, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const knowledge = new FactionKnowledgeIntegration({ game, identityIntegration: identity, perceptionIntegration: perception, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const observation = new FactionObservationIntegration({ game, identityIntegration: identity, knowledgeIntegration: knowledge, quantumProvider: () => game.perceptionQuantum }).install();

  test('integration installed globally', () => assert.equal(globalThis.ZekNovaFactionObservationIntegration, observation));
  test('adapter installed globally', () => assert.equal(globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.id, 'zeknova-faction-observation-adapter-v1'));
  test('adapter exposes fixed layout', () => assert.equal(globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.featureLayoutId, 'zeknova-prime-observation-layout-v1'));
  test('adapter exposes 592 features', () => assert.equal(globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.featureCount, 592));

  const empty = observation.captureLocalFaction();
  test('empty observation addresses local faction', () => assert.equal(empty.factionId, identity.humanFactionId));
  test('empty observation uses live quantum', () => assert.equal(empty.quantum, 4));
  test('empty observation contains no fresh records', () => assert.equal(empty.totalFreshRecordCount, 0));
  test('empty observation still has fixed features', () => assert.equal(empty.featureVector.length, 592));
  test('empty observation validates', () => assert.deepEqual(globalThis.ZekNovaFactionObservationContract.validateObservation(empty), empty));

  const hidden = game.spawnEnemy(true, 'stalker', 20, 0);
  const hiddenPacket = observation.captureLocalFaction();
  test('hidden enemy receives stable identity', () => assert.match(hidden.userData.entityId, /^zkid:v1:entity:unit:zeknovan:/));
  test('FX-OMNISCIENT hidden spawn does not change observation bytes', () => assert.equal(globalThis.ZekNovaIdentityContract.canonicalStringify(hiddenPacket), globalThis.ZekNovaIdentityContract.canonicalStringify(empty)));
  test('FX-OMNISCIENT hidden spawn does not change observation ID', () => assert.equal(hiddenPacket.observationId, empty.observationId));
  const none = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile' });
  test('out-of-range perception creates no event', () => assert.equal(none, null));
  test('out-of-range check leaves observation unchanged', () => assert.equal(observation.captureLocalFaction().observationId, empty.observationId));

  hidden.position.x = 4;
  const seen = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile', movementBand: 'fast' });
  const visible = observation.captureLocalFaction();
  const visibleSlots = visible.sections.flatMap(section => section.slots.filter(Boolean));
  test('grounded sighting changes observation ID', () => assert.notEqual(visible.observationId, empty.observationId));
  test('grounded sighting creates one fresh record', () => assert.equal(visible.totalFreshRecordCount, 1));
  test('grounded sighting appears in unit section', () => assert.equal(visibleSlots.some(slot => slot.subjectId === seen.subjectId && slot.topic === 'unit_contact'), true));
  test('visible packet contains no hidden health', () => assert.equal(/health/.test(JSON.stringify(visible)), false));
  test('visible packet contains no perception event IDs', () => assert.equal(/zkev:v1:/.test(JSON.stringify(visible)), false));
  test('feature vector changes with visible knowledge', () => assert.notDeepEqual(visible.featureVector, empty.featureVector));

  const adapterPacket = globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.captureLocalFactionObservation();
  test('adapter packet equals integration packet', () => assert.deepEqual(adapterPacket, visible));
  test('adapter hash equals observation object hash', () => assert.equal(globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.observationHash(adapterPacket), new globalThis.ZekNovaFactionObservationContract.FactionObservation(visible).hash()));
  test('adapter feature vector is detached', () => { const x = globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.featureVector(visible); x[0] = 0; assert.equal(visible.featureVector[0], 1); });
  const primeInput = globalThis.ZEK_FACTION_OBSERVATION_ADAPTER.capturePrimeInput(identity.humanFactionId);
  test('Prime input carries only fixed read-only fields', () => assert.deepEqual(Object.keys(primeInput).sort(), ['factionId', 'featureCount', 'featureLayoutId', 'featureVector', 'observationId', 'quantum', 'worldId'].sort()));
  test('Prime input feature vector matches packet', () => assert.deepEqual(primeInput.featureVector, visible.featureVector));
  test('Prime input omits structured evidence sections', () => assert.equal('sections' in primeInput, false));

  const settlementFaction = identity.settlements[0].factionId;
  const beforeShare = observation.captureForFaction(settlementFaction);
  test('FX-LEAK settlement packet excludes unshared human sighting', () => assert.equal(beforeShare.totalFreshRecordCount, 0));
  perception.shareEvent({ originalEventId: seen.eventId, sender: game.player.group, recipientFactionId: settlementFaction, observedAtQuantum: 5 });
  game.perceptionQuantum = 5;
  const afterShare = observation.captureForFaction(settlementFaction);
  const sharedSlots = afterShare.sections.flatMap(section => section.slots.filter(Boolean));
  test('explicit share creates recipient observation record', () => assert.equal(afterShare.totalFreshRecordCount, 1));
  test('shared slot preserves sender provenance', () => assert.equal(sharedSlots[0].sharedFromFactionId, identity.humanFactionId));
  test('shared slot preserves original observation quantum', () => assert.equal(sharedSlots[0].observedAtQuantum, 4));
  test('sharing does not expose sender private ledger wholesale', () => assert.equal(sharedSlots.length, 1));

  const repeatedA = observation.captureForFaction(settlementFaction);
  const repeatedB = observation.captureForFaction(settlementFaction);
  test('FX-OBS-NONDET repeated live captures are byte-identical', () => assert.deepEqual(repeatedA, repeatedB));
  test('FX-OBS-NONDET repeated live IDs are identical', () => assert.equal(repeatedA.observationId, repeatedB.observationId));

  game.perceptionQuantum = 8;
  const expiredHuman = observation.captureLocalFaction();
  test('FX-STALE-OBSERVATION sighting expires at exact exclusive boundary', () => assert.equal(expiredHuman.totalFreshRecordCount, 0));
  test('expiry changes observation ID', () => assert.notEqual(expiredHuman.observationId, visible.observationId));
  const expiredRecipient = observation.captureForFaction(settlementFaction);
  test('shared sighting expires from recipient at original boundary', () => assert.equal(expiredRecipient.totalFreshRecordCount, 0));

  rejects('live observation cannot move behind ledger quantum', () => observation.captureLocalFaction({ quantum: 7 }), /may not precede/);
  rejects('fractional live quantum rejected', () => observation.captureLocalFaction({ quantum: 8.5 }), /safe integer/);

  const resource = game.terrain.harvestableTrees[0];
  perception.reportResourceDiscovered({ observer: game.player.group, resource, resourceKind: 'tree', abundanceBand: 'high', observedAtQuantum: 9 });
  game.perceptionQuantum = 9;
  const resourcePacket = observation.captureLocalFaction();
  test('new grounded resource knowledge enters observation', () => assert.equal(resourcePacket.sections.find(s => s.topic === 'resource_location').slots.filter(Boolean).length, 1));
  test('new grounded resource changes observation ID', () => assert.notEqual(resourcePacket.observationId, expiredHuman.observationId));
  test('repeated resource capture stays deterministic', () => assert.deepEqual(observation.captureLocalFaction(), resourcePacket));

  const savedPacket = structuredClone(resourcePacket);
  observation.dispose();
  test('dispose clears global observation integration', () => assert.equal(globalThis.ZekNovaFactionObservationIntegration, null));
  test('previous packet remains detached after disposal', () => assert.deepEqual(savedPacket, resourcePacket));

  knowledge.dispose(); perception.dispose(); identity.dispose();
  console.log(`W0-O.3 FACTION OBSERVATION INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
