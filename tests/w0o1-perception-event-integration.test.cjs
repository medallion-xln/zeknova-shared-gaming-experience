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
    player: { group: object(0, 0, 0) },
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
  let checks = 0;
  function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }

  const store = storage();
  const game = gameFixture();
  const identity = new IdentityIntegration({ game, storage: store }).install();
  const perception = new PerceptionEventIntegration({ game, identityIntegration: identity, storage: store, quantumProvider: () => 4 }).install();

  test('integration installed globally', () => assert.equal(globalThis.ZekNovaPerceptionEventIntegration, perception));
  test('stream starts empty', () => assert.equal(perception.captureSnapshot().events.length, 0));
  test('adapter installed', () => assert.equal(globalThis.ZEK_PERCEPTION_EVENT_ADAPTER.id, 'zeknova-perception-event-adapter-v1'));

  const enemy = game.spawnEnemy(true, 'stalker', 6, 0);
  test('enemy has identity before perception', () => assert.match(enemy.userData.entityId, /^zkid:v1:entity:unit:zeknovan:/));

  const none = perception.observeEnemyByProximity({ observer: game.player.group, enemy, radius: 5, observedAtQuantum: 4, hostility: 'hostile' });
  test('out-of-range enemy produces no event', () => assert.equal(none, null));
  test('out-of-range check does not enumerate hidden enemy into stream', () => assert.equal(perception.captureSnapshot().events.length, 0));

  enemy.position.x = 4.49;
  const seen = perception.observeEnemyByProximity({ observer: game.player.group, enemy, radius: 5, observedAtQuantum: 4, hostility: 'hostile', movementBand: 'fast' });
  test('in-range enemy produces grounded sighting', () => assert.equal(seen.eventType, 'enemy_sighted'));
  test('position is quantized to integer cells', () => assert.deepEqual(seen.payload.positionCell, { x: 4, y: 0, z: 0 }));
  test('observer is local human faction', () => assert.equal(seen.observerFactionId, identity.humanFactionId));
  test('source is local player entity', () => assert.equal(seen.sourceEntityId, game.player.group.userData.entityId));

  const lost = perception.reportEnemyLost({ observer: game.player.group, enemy, observedAtQuantum: 5, reason: 'out_of_range' });
  test('enemy lost event appended', () => assert.equal(lost.eventSequence, 2));

  const resource = game.terrain.harvestableTrees[0];
  const discovered = perception.reportResourceDiscovered({ observer: game.player.group, resource, resourceKind: 'tree', abundanceBand: 'high', observedAtQuantum: 6 });
  test('resource discovery uses registered resource identity', () => assert.equal(discovered.subjectId, resource.userData.entityId));

  const recipient = identity.settlements[0].factionId;
  const shared = perception.shareEvent({ originalEventId: seen.eventId, sender: game.player.group, recipientFactionId: recipient, observedAtQuantum: 7 });
  test('explicit intelligence sharing creates recipient event', () => assert.equal(shared.observerFactionId, recipient));
  test('shared event preserves original sighting', () => assert.equal(shared.payload.sharedEvent.eventId, seen.eventId));

  const snapA = perception.captureSnapshot();
  const hashA = perception.stream.snapshotHash();
  const adapterSnapshot = globalThis.ZEK_PERCEPTION_EVENT_ADAPTER.capturePerceptionEventSnapshot();
  test('adapter snapshot equals integration snapshot', () => assert.deepEqual(adapterSnapshot, snapA));
  test('adapter hash equals stream hash', () => assert.equal(globalThis.ZEK_PERCEPTION_EVENT_ADAPTER.perceptionEventSnapshotHash(adapterSnapshot), hashA));
  test('repeated capture is deterministic', () => assert.deepEqual(perception.captureSnapshot(), snapA));
  test('faction query contains only addressed events', () => {
    const humanEvents = globalThis.ZEK_PERCEPTION_EVENT_ADAPTER.eventsForFaction(identity.humanFactionId);
    assert.equal(humanEvents.some(e => e.eventId === shared.eventId), false);
    assert.equal(humanEvents.length, 3);
  });

  perception.dispose();
  const game2 = gameFixture();
  const identity2 = new IdentityIntegration({ game: game2, storage: store }).install();
  const perception2 = new PerceptionEventIntegration({ game: game2, identityIntegration: identity2, storage: store, quantumProvider: () => 8 }).install();
  test('event stream survives restore', () => assert.equal(perception2.captureSnapshot().events.length, 4));
  test('next event sequence survives restore', () => assert.equal(perception2.captureSnapshot().nextEventSequence, 5));
  test('restored hash is byte-identical', () => assert.equal(perception2.stream.snapshotHash(), hashA));

  const newEnemy = game2.spawnEnemy(true, 'spitter', 3, 0);
  const next = perception2.observeEnemyByProximity({ observer: game2.player.group, enemy: newEnemy, radius: 5, observedAtQuantum: 8, hostility: 'hostile' });
  test('new identity can be observed after integration refresh', () => assert.equal(next.eventSequence, 5));
  test('new event ID is not reused', () => assert.notEqual(next.eventId, seen.eventId));

  perception2.dispose(); identity2.dispose(); identity.dispose();
  test('dispose clears global integration', () => assert.equal(globalThis.ZekNovaPerceptionEventIntegration, null));

  console.log(`W0-O.1 PERCEPTION EVENT INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
