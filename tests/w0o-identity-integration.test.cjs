#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function storage() {
  const data = new Map();
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key),
    dump: () => new Map(data),
  };
}

function object(x = 0, y = 0, z = 0) {
  return { position: { x, y, z }, userData: {} };
}

function fakeGame() {
  const player = { group: object(2, 1, 3) };
  const buildings = {
    records: [
      { id: 'power-1', type: 'power', x: 4, y: 0, z: 5 },
      { id: 'water-1', type: 'water', x: 6, y: 0, z: 7 },
    ],
    addRecord(record) { this.records.push(record); return record; },
  };
  const terrain = {
    localTerritories: [{ x: 50, y: 2, z: 20 }, { x: -45, y: 3, z: -28 }],
    harvestableTrees: [{ position: { x: 1, y: 0, z: 1 }, userData: { treeId: 'tree-1' } }],
    powerUpNodes: [{ position: { x: 2, y: 0, z: 2 }, userData: { powerUpId: 'powerup-1' } }],
    mineableRocks: [{ position: { x: 3, y: 0, z: 3 }, userData: { rockId: 'rock-1' } }],
    resourceNodes: [],
  };
  const game = {
    user: { id: 'user-1', email: 'one@example.com', teamCode: 'FOREST-1', teamName: 'Forest Team', officerClass: 'ensign' },
    biomeSeed: 5207,
    player,
    buildings,
    terrain,
    enemies: [],
    multiplayerRoom: { clientId: 'client-local', remotePlayers: new Map() },
    disposed: false,
    spawnEnemy(hostile = true, role = 'stalker') {
      const enemy = object(role === 'stalker' ? 48 : -44, 2, role === 'stalker' ? 19 : -27);
      Object.assign(enemy.userData, { health: 62, enemyType: role, hostile, guardian: !hostile });
      this.enemies.push(enemy);
      return enemy;
    },
  };
  return game;
}

(async () => {
  const moduleUrl = pathToFileURL(path.join(__dirname, '..', 'src', 'game', 'IdentityIntegration.js')).href;
  const { IdentityIntegration } = await import(moduleUrl);
  let checks = 0;
  function test(name, fn) {
    fn(); checks++; console.log('  PASS ' + name);
  }

  const store = storage();
  const game = fakeGame();
  const integration = new IdentityIntegration({ game, storage: store });
  integration.install();

  test('world identity installed', () => assert.match(integration.worldId, /^zkid:v1:world:/));
  test('human faction registered', () => assert.ok(integration.registry.getFaction(integration.humanFactionId)));
  test('two settlement factions registered', () => assert.equal(integration.settlements.length, 2));
  test('settlement identities are stable and distinct', () => assert.notEqual(integration.settlements[0].entityId, integration.settlements[1].entityId));
  test('local player receives an identity', () => assert.match(game.player.group.userData.entityId, /^zkid:v1:entity:unit:human:/));
  test('local player ownership is human faction', () => assert.equal(game.player.group.userData.ownerFactionId, integration.humanFactionId));
  test('persistent structures registered', () => assert.equal(integration.registry.snapshot().entities.filter(x => x.kind === 'structure').length, 2));
  test('resource identities attached to runtime objects', () => assert.match(game.terrain.harvestableTrees[0].userData.entityId, /^zkid:v1:entity:resource:/));
  test('area and route identities exist', () => {
    const kinds = new Set(integration.registry.snapshot().entities.map(x => x.kind));
    assert.ok(kinds.has('area')); assert.ok(kinds.has('route'));
  });

  const firstEnemy = game.spawnEnemy(true, 'stalker');
  const firstId = firstEnemy.userData.entityId;
  test('spawn wrapper assigns enemy identity', () => assert.match(firstId, /:spawn:1:stalker$/));
  test('enemy is owned by nearest settlement', () => assert.equal(firstEnemy.userData.ownerFactionId, integration.settlements[0].factionId));

  firstEnemy.userData.health = 0;
  game.enemies.splice(game.enemies.indexOf(firstEnemy), 1);
  integration.synchronizeEnemies();
  test('defeated enemy identity is retired', () => assert.equal(integration.registry.getEntity(firstId), null));
  test('retired identity recorded', () => assert.ok(integration.registry.snapshot().retiredEntityIds.includes(firstId)));

  const secondEnemy = game.spawnEnemy(true, 'stalker');
  const secondId = secondEnemy.userData.entityId;
  test('FX-ID-REUSE next spawn receives a new identity', () => assert.notEqual(secondId, firstId));
  test('spawn sequence is monotonic', () => assert.match(secondId, /:spawn:2:stalker$/));

  const remote = object(10, 0, 11);
  remote.userData.displayName = 'Remote Officer';
  game.multiplayerRoom.remotePlayers.set('remote-client-7', remote);
  integration.synchronizeRemotePlayers();
  const remoteId = remote.userData.entityId;
  test('remote player receives stable client identity', () => assert.match(remoteId, /:client:remote-client-7$/));
  integration.synchronizeRemotePlayers();
  test('remote player identity survives repeated sync', () => assert.equal(remote.userData.entityId, remoteId));

  const snapshotA = integration.captureSnapshot();
  const hashA = integration.registry.snapshotHash();
  const snapshotB = integration.captureSnapshot();
  test('capture is deterministic without world changes', () => assert.deepEqual(snapshotB, snapshotA));
  test('snapshot hash is deterministic', () => assert.equal(integration.registry.snapshotHash(), hashA));
  test('identity adapter captures the same registry', () => assert.equal(globalThis.ZEK_IDENTITY_ADAPTER.identitySnapshotHash(globalThis.ZEK_IDENTITY_ADAPTER.captureIdentitySnapshot()), hashA));

  const structure = { id: 'research-2', type: 'research', x: 8, y: 0, z: 9 };
  game.buildings.addRecord(structure);
  test('wrapped building registration creates identity', () => assert.ok(integration.registry.findBySource('structure', 'structure:research-2')));

  integration.dispose();
  test('dispose restores spawn function', () => {
    const before = game.enemies.length;
    game.spawnEnemy(true, 'spitter');
    assert.equal(game.enemies.length, before + 1);
  });

  const game2 = fakeGame();
  const integration2 = new IdentityIntegration({ game: game2, storage: store });
  integration2.install();
  const replayPlayerId = game2.player.group.userData.entityId;
  test('persistent player identity survives restore', () => assert.equal(replayPlayerId, game.player.group.userData.entityId));
  const replayEnemy = game2.spawnEnemy(true, 'stalker');
  test('restored spawn sequence does not reuse old IDs', () => assert.match(replayEnemy.userData.entityId, /:spawn:3:stalker$/));
  test('unbound transient enemy from prior session was retired', () => assert.ok(integration2.registry.snapshot().retiredEntityIds.includes(secondId)));

  const reordered = [...integration2.registry.snapshot().entities].reverse();
  test('array reordering does not change attached entity IDs', () => {
    assert.equal(game2.player.group.userData.entityId, replayPlayerId);
    assert.ok(reordered.some(x => x.entityId === replayPlayerId));
  });

  integration2.dispose();
  console.log(`W0-O.0 IDENTITY INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
