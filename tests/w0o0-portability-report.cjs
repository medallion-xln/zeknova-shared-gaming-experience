#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  contract: 'azl/zeknova-identity-contract-v1.js',
  adapter: 'azl/zeknova-identity-adapter-v1.js',
  faction: 'src/world/FactionIdentity.js',
  entity: 'src/world/EntityIdentity.js',
  integration: 'src/game/IdentityIntegration.js',
  registry: 'docs/governance/identity-registry.json',
  contractTest: 'tests/w0o-identity-contract.test.cjs',
  integrationTest: 'tests/w0o-identity-integration.test.cjs',
  main: 'src/main.js',
  package: 'package.json',
};
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const bytes = relative => fs.readFileSync(path.join(ROOT, relative));
const source = bytes(FILES.contract).toString('utf8');
(0, eval)(source);
const C = globalThis.ZekNovaIdentityContract;

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
function object(x, y, z) { return { position: { x, y, z }, userData: {} }; }
function gameFixture() {
  const game = {
    user: { id: 'user-1', teamCode: 'FOREST ALPHA', teamName: 'Forest Alpha', officerClass: 'ensign' },
    biomeSeed: 5207,
    player: { group: object(2, 1, 3) },
    terrain: {
      localTerritories: [{ x: 52.25, y: 3.5, z: 18.75 }, { x: -46.5, y: 2.25, z: -28.75 }],
      harvestableTrees: [{ position: { x: 1, y: 0, z: 1 }, userData: { treeId: 'tree-1' } }],
      powerUpNodes: [], mineableRocks: [], resourceNodes: [],
    },
    buildings: { records: [{ id: 'power-1', type: 'power', x: 4, y: 0, z: 5 }], addRecord(record) { this.records.push(record); return record; } },
    enemies: [],
    multiplayerRoom: { clientId: 'client-local', remotePlayers: new Map() },
    disposed: false,
    spawnEnemy(hostile, role = 'stalker') {
      const enemy = object(48, 2, 19);
      Object.assign(enemy.userData, { health: 62, hostile: !!hostile, enemyType: role });
      this.enemies.push(enemy);
      return enemy;
    },
  };
  return game;
}

(async () => {
  const { IdentityIntegration } = await import(pathToFileURL(path.join(ROOT, FILES.integration)).href);
  const game = gameFixture();
  const integration = new IdentityIntegration({ game, storage: storage() }).install();
  const first = game.spawnEnemy(true, 'stalker');
  first.userData.health = 0;
  game.enemies.length = 0;
  integration.synchronizeEnemies();
  const second = game.spawnEnemy(true, 'spitter');
  const snapshot = integration.captureSnapshot();
  const report = C.canonicalize({
    report_schema_version: 1,
    artifact_id: 'zeknova-w0o0-identity-v1',
    phase: 'W0-O.0',
    artifacts: Object.fromEntries(Object.entries(FILES).map(([name, relative]) => [name, { path: relative, sha256: sha(bytes(relative)) }])),
    contract: { id: C.CONTRACT_ID, registry_id: C.REGISTRY_ID, schema_version: C.SCHEMA_VERSION },
    fixed_fixture: {
      world_id: integration.worldId,
      human_faction_id: integration.humanFactionId,
      settlement_ids: integration.settlements.map(item => item.entityId),
      local_player_id: game.player.group.userData.entityId,
      first_spawn_id: first.userData.entityId,
      second_spawn_id: second.userData.entityId,
      first_spawn_retired: snapshot.retiredEntityIds.includes(first.userData.entityId),
      resource_id: game.terrain.harvestableTrees[0].userData.entityId,
    },
    snapshot: {
      canonical: C.canonicalStringify(snapshot),
      runtime_hash_fnv1a64x2: integration.registry.snapshotHash(),
      faction_count: snapshot.factions.length,
      active_entity_count: snapshot.entities.length,
      retired_entity_count: snapshot.retiredEntityIds.length,
      next_spawn_sequence: snapshot.nextSpawnSequence,
    },
    semantics: {
      nearest_settlement_ownership: true,
      transient_enemy_ids_retired_on_restore: true,
      persistent_records_use_source_ids: true,
      runtime_array_index_is_not_identity: true,
    },
  });
  integration.dispose();
  const canonical = JSON.stringify(report);
  const digest = sha(canonical);
  if (process.argv.includes('--digest')) console.log(digest);
  else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
})().catch(error => { console.error(error.stack || error); process.exit(1); });
