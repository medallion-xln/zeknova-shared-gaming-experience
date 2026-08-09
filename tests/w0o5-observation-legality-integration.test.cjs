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
  const { ObservationLegalityIntegration } = await import(pathToFileURL(path.join(root, 'src/game/ObservationLegalityIntegration.js')).href);
  let checks = 0;
  function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }
  function rejects(name, fn, pattern) { test(name, () => assert.throws(fn, pattern)); }

  const store = storage();
  const game = gameFixture();
  const identity = new IdentityIntegration({ game, storage: store }).install();
  const perception = new PerceptionEventIntegration({ game, identityIntegration: identity, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const knowledge = new FactionKnowledgeIntegration({ game, identityIntegration: identity, perceptionIntegration: perception, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const observation = new FactionObservationIntegration({ game, identityIntegration: identity, knowledgeIntegration: knowledge, quantumProvider: () => game.perceptionQuantum }).install();
  const legality = new ObservationLegalityIntegration({ game, identityIntegration: identity, observationIntegration: observation }).install();
  const all = [1, 1, 1, 1, 1, 1];

  test('integration installed globally', () => assert.equal(globalThis.ZekNovaObservationLegalityIntegration, legality));
  test('adapter installed globally', () => assert.equal(globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.id, 'zeknova-observation-legality-adapter-v1'));
  test('adapter exposes development action space', () => assert.equal(globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.actionSpaceId, 'zeknova-observation-action-space-v1-development'));
  test('adapter exposes six actions', () => assert.equal(globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.actionCount, 6));
  test('adapter is read-only', () => assert.equal(globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.authority, 'read-only-no-action-execution'));

  const empty = legality.intersectForLocalFaction(all);
  test('empty legality addresses local faction', () => assert.equal(empty.legality.factionId, identity.humanFactionId));
  test('empty legality uses live quantum', () => assert.equal(empty.legality.quantum, 4));
  test('empty observation retains only stabilize', () => assert.deepEqual(empty.legality.finalMask, [1, 0, 0, 0, 0, 0]));
  test('empty target view has no targets', () => assert.equal(empty.targetView.actions.reduce((n, a) => n + a.targetCount, 0), 0));
  test('empty observation and target view are linked', () => assert.equal(empty.targetView.observationId, empty.observation.observationId));

  const hidden = game.spawnEnemy(true, 'stalker', 20, 0);
  const hiddenResult = legality.intersectForLocalFaction(all);
  test('hidden enemy receives stable identity', () => assert.match(hidden.userData.entityId, /^zkid:v1:entity:unit:zeknovan:/));
  test('FX-OBS-MASK-HIDDEN hidden spawn leaves legality ID unchanged', () => assert.equal(hiddenResult.legality.legalityId, empty.legality.legalityId));
  test('FX-OBS-MASK-HIDDEN hidden spawn leaves final mask unchanged', () => assert.deepEqual(hiddenResult.legality.finalMask, empty.legality.finalMask));

  const none = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile' });
  test('out-of-range perception creates no event', () => assert.equal(none, null));
  test('out-of-range perception leaves intercept masked', () => assert.equal(legality.intersectForLocalFaction(all).legality.finalMask[2], 0));

  hidden.position.x = 4;
  const seen = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile', movementBand: 'fast' });
  const visible = legality.intersectForLocalFaction(all);
  test('grounded sighting enables intercept', () => assert.equal(visible.legality.finalMask[2], 1));
  test('grounded direct sighting enables sharing', () => assert.equal(visible.legality.finalMask[5], 1));
  test('sighting target references observed enemy', () => assert.equal(visible.targetView.actions[2].targets[0].subjectId, seen.subjectId));
  test('legality record contains no event ID', () => assert.equal(/zkev:v1:/.test(JSON.stringify(visible.legality)), false));
  test('target view contains no feature vector', () => assert.equal('featureVector' in visible.targetView, false));

  const selected = globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.selectTarget(visible.targetView, visible.observation, 2, visible.targetView.actions[2].targets[0].targetId);
  test('adapter selects canonical intercept target', () => assert.equal(selected.subjectId, seen.subjectId));
  rejects('adapter rejects invented target', () => globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.selectTarget(visible.targetView, visible.observation, 2, 'zktg:v1:0000000000000000'), /not present/);

  const upstreamBlocked = legality.intersectForLocalFaction([1, 1, 0, 1, 1, 1]);
  test('FX-OBS-MASK-RESURRECT upstream-masked intercept remains masked', () => assert.equal(upstreamBlocked.legality.finalMask[2], 0));
  test('upstream reason is preserved', () => assert.equal(upstreamBlocked.legality.reasons[2], 'upstream_mask'));
  rejects('live nonterminal mask without fallback rejected', () => legality.intersectForLocalFaction([0, 1, 1, 1, 1, 1]), /safe fallback/);

  const routeId = globalThis.ZekNovaIdentityContract.routeEntityId({ worldId: identity.worldId, routeKey: 'central-river-crossing' });
  perception.append({
    eventType: 'route_observed', observerFactionId: identity.humanFactionId, sourceFactionId: identity.humanFactionId,
    sourceEntityId: game.player.group.userData.entityId, subjectId: routeId, observedAtQuantum: 5,
    sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'damaged' }
  });
  game.perceptionQuantum = 5;
  const routeResult = legality.intersectForLocalFaction(all);
  test('grounded route enables scouting', () => assert.equal(routeResult.legality.finalMask[1], 1));
  test('grounded route enables fortification', () => assert.equal(routeResult.legality.finalMask[3], 1));
  test('route actions receive distinct target IDs', () => assert.notEqual(routeResult.targetView.actions[1].targets[0].targetId, routeResult.targetView.actions[3].targets[0].targetId));

  const structureId = globalThis.ZekNovaIdentityContract.structureEntityId({ worldId: identity.worldId, recordId: 'power-1' });
  perception.reportStructureObserved({
    observer: game.player.group, structureEntityId: structureId, position: { x: 4, y: 0, z: 5 },
    structureKind: 'power', observedOwnerFactionId: identity.humanFactionId, statusBand: 'damaged', observedAtQuantum: 5,
  });
  const repaired = legality.intersectForLocalFaction(all);
  test('damaged known structure enables repair', () => assert.equal(repaired.legality.finalMask[4], 1));
  test('repair target references structure identity', () => assert.equal(repaired.targetView.actions[4].targets[0].subjectId, structureId));

  const settlementFaction = identity.settlements[0].factionId;
  const beforeShare = legality.intersectForFaction(settlementFaction, all);
  test('FX-OBS-MASK-LEAK settlement cannot use unshared human target', () => assert.equal(beforeShare.legality.finalMask[2], 0));
  perception.shareEvent({ originalEventId: seen.eventId, sender: game.player.group, recipientFactionId: settlementFaction, observedAtQuantum: 5 });
  const afterShare = legality.intersectForFaction(settlementFaction, all);
  test('explicitly shared hostile contact enables recipient intercept', () => assert.equal(afterShare.legality.finalMask[2], 1));
  test('shared-only recipient contact cannot enable resharing', () => assert.equal(afterShare.legality.finalMask[5], 0));
  test('recipient target preserves shared acquisition mode', () => assert.equal(afterShare.targetView.actions[2].targets[0].acquisitionMode, 'shared'));

  const repeatA = legality.intersectForLocalFaction(all);
  const repeatB = legality.intersectForLocalFaction(all);
  test('FX-OBS-MASK-NONDET repeated live legality is byte-identical', () => assert.deepEqual(repeatA.legality, repeatB.legality));
  test('FX-OBS-MASK-NONDET repeated live target view is byte-identical', () => assert.deepEqual(repeatA.targetView, repeatB.targetView));

  game.perceptionQuantum = 8;
  const expired = legality.intersectForLocalFaction(all);
  test('FX-OBS-MASK-STALE contact expires at exact boundary', () => assert.equal(expired.legality.finalMask[2], 0));
  test('route remains fresh before its expiry', () => assert.equal(expired.legality.finalMask[1], 1));
  const expiredRecipient = legality.intersectForFaction(settlementFaction, all);
  test('shared contact expires at original boundary', () => assert.equal(expiredRecipient.legality.finalMask[2], 0));

  const terminal = legality.intersectForLocalFaction([0, 1, 1, 1, 1, 1], { terminal: true });
  test('terminal live projection masks everything', () => assert.deepEqual(terminal.legality.finalMask, [0, 0, 0, 0, 0, 0]));
  const replan = legality.intersectForLocalFaction([0, 1, 1, 1, 1, 1], { replanBoundary: true });
  test('replan live projection masks everything', () => assert.deepEqual(replan.legality.finalMask, [0, 0, 0, 0, 0, 0]));

  const adapterView = globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.captureLocalTargetView();
  test('adapter target view equals integration target view', () => assert.deepEqual(adapterView, legality.captureLocalTargetView()));
  const adapterIntersection = globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER.intersectForLocalFaction(all);
  test('adapter intersection equals integration intersection', () => assert.deepEqual(adapterIntersection, legality.intersectForLocalFaction(all)));
  test('adapter exposes no action execution method', () => assert.equal('executeAction' in globalThis.ZEK_OBSERVATION_LEGALITY_ADAPTER, false));

  const saved = structuredClone(adapterIntersection);
  legality.dispose();
  test('dispose clears global legality integration', () => assert.equal(globalThis.ZekNovaObservationLegalityIntegration, null));
  test('previous legality result remains detached after disposal', () => assert.deepEqual(saved, adapterIntersection));

  observation.dispose(); knowledge.dispose(); perception.dispose(); identity.dispose();
  console.log(`W0-O.5 OBSERVATION LEGALITY INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
