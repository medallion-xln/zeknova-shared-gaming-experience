#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function localStorageFixture() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}
function shadowStorage() {
  const data = new Map();
  return { load: k => data.get(k) ?? null, save: (k, v) => data.set(k, structuredClone(v)) };
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
  const { PrimeShadowIntegration } = await import(pathToFileURL(path.join(root, 'src/game/PrimeShadowIntegration.js')).href);
  let checks = 0;
  function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }
  function rejects(name, fn, pattern) { test(name, () => assert.throws(fn, pattern)); }

  const store = localStorageFixture();
  const primeStore = shadowStorage();
  const game = gameFixture();
  const identity = new IdentityIntegration({ game, storage: store }).install();
  const perception = new PerceptionEventIntegration({ game, identityIntegration: identity, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const knowledge = new FactionKnowledgeIntegration({ game, identityIntegration: identity, perceptionIntegration: perception, storage: store, quantumProvider: () => game.perceptionQuantum }).install();
  const observation = new FactionObservationIntegration({ game, identityIntegration: identity, knowledgeIntegration: knowledge, quantumProvider: () => game.perceptionQuantum }).install();
  const legality = new ObservationLegalityIntegration({ game, identityIntegration: identity, observationIntegration: observation }).install();
  const prime = new PrimeShadowIntegration({ game, identityIntegration: identity, observationLegalityIntegration: legality, storage: primeStore }).install();
  const all = [1,1,1,1,1,1];

  test('Prime shadow integration installed globally', () => assert.equal(globalThis.ZekNovaPrimeShadowIntegration, prime));
  test('Prime shadow adapter installed globally', () => assert.equal(globalThis.ZEK_PRIME_SHADOW_ADAPTER.id, 'zeknova-prime-shadow-adapter-v1'));
  test('adapter consumes 592 features', () => assert.equal(globalThis.ZEK_PRIME_SHADOW_ADAPTER.featureCount, 592));
  test('adapter consumes six actions', () => assert.equal(globalThis.ZEK_PRIME_SHADOW_ADAPTER.actionCount, 6));
  test('adapter mode is shadow-only', () => assert.equal(globalThis.ZEK_PRIME_SHADOW_ADAPTER.mode, 'shadow-only'));
  test('adapter has no authority', () => assert.equal(globalThis.ZEK_PRIME_SHADOW_ADAPTER.authority, 'none-no-action-execution'));
  test('adapter exposes no execute method', () => assert.equal('executeAction' in globalThis.ZEK_PRIME_SHADOW_ADAPTER, false));
  test('adapter exposes no commit method', () => assert.equal('commitAction' in globalThis.ZEK_PRIME_SHADOW_ADAPTER, false));
  test('adapter exposes no dispatch method', () => assert.equal('dispatchAction' in globalThis.ZEK_PRIME_SHADOW_ADAPTER, false));

  const empty = prime.runLocalShadow({ upstreamMask: all, seed: 42, simulations: 64, upstreamMaskSource: 'test' });
  test('empty shadow run addresses local faction', () => assert.equal(empty.recommendation.factionId, identity.humanFactionId));
  test('empty shadow run consumes observation', () => assert.equal(empty.recommendation.observationId, empty.observation.observationId));
  test('empty shadow run consumes legality', () => assert.equal(empty.recommendation.legalityId, empty.legality.legalityId));
  test('empty shadow run selects safe fallback', () => assert.equal(empty.recommendation.selectedActionKey, 'stabilize'));
  test('empty shadow run has no target', () => assert.equal(empty.recommendation.selectedTargetId, null));
  test('empty shadow run records incumbent unavailable', () => assert.equal(empty.comparison.agreement, 'unavailable'));
  test('empty shadow run appends telemetry sequence one', () => assert.equal(empty.telemetryEntry.sequence, 1));

  const hidden = game.spawnEnemy(true, 'stalker', 20, 0);
  const beforeWorld = structuredClone({ position: hidden.position, health: hidden.userData.health, buildingCount: game.buildings.records.length });
  const hiddenRun = prime.runLocalShadow({ upstreamMask: all, seed: 42, simulations: 64, upstreamMaskSource: 'test' });
  test('hidden spawn receives identity', () => assert.match(hidden.userData.entityId, /^zkid:v1:entity:unit:zeknovan:/));
  test('FX-SHADOW-HIDDEN hidden spawn leaves observation unchanged', () => assert.equal(hiddenRun.observation.observationId, empty.observation.observationId));
  test('FX-SHADOW-HIDDEN hidden spawn leaves recommendation unchanged', () => assert.equal(hiddenRun.recommendation.recommendationId, empty.recommendation.recommendationId));
  test('shadow run does not move hidden enemy', () => assert.deepEqual(hidden.position, beforeWorld.position));
  test('shadow run does not damage hidden enemy', () => assert.equal(hidden.userData.health, beforeWorld.health));
  test('shadow run does not construct buildings', () => assert.equal(game.buildings.records.length, beforeWorld.buildingCount));

  const none = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile' });
  test('out-of-range perception creates no event', () => assert.equal(none, null));
  const outOfRange = prime.runLocalShadow({ upstreamMask: all, seed: 42, simulations: 64, upstreamMaskSource: 'test' });
  test('out-of-range enemy leaves intercept illegal', () => assert.equal(outOfRange.legality.finalMask[2], 0));

  hidden.position.x = 4;
  const seen = perception.observeEnemyByProximity({ observer: game.player.group, enemy: hidden, radius: 5, observedAtQuantum: 4, hostility: 'hostile', movementBand: 'fast' });
  const visible = prime.runLocalShadow({ upstreamMask: all, seed: 42, simulations: 96, upstreamMaskSource: 'test' });
  test('grounded sighting enables intercept', () => assert.equal(visible.legality.finalMask[2], 1));
  test('grounded sighting enables share', () => assert.equal(visible.legality.finalMask[5], 1));
  test('Prime ranks intercept with positive visits', () => assert.ok(visible.recommendation.rankedActions.find(x => x.actionIndex === 2).visits > 0));
  test('Prime intercept target references grounded subject', () => assert.equal(visible.recommendation.rankedActions.find(x => x.actionIndex === 2).selectedSubjectId, seen.subjectId));
  test('recommendation contains no perception event ID', () => assert.equal(/zkev:v1:/.test(JSON.stringify(visible.recommendation)), false));
  test('recommendation does not carry full feature vector', () => assert.equal('featureVector' in visible.recommendation, false));

  const blocked = prime.runLocalShadow({ upstreamMask: [1,1,0,1,1,1], seed: 42, simulations: 64, upstreamMaskSource: 'blocked-test' });
  test('FX-SHADOW-MASK blocked intercept remains illegal', () => assert.equal(blocked.legality.finalMask[2], 0));
  test('FX-SHADOW-MASK blocked intercept gets zero visits', () => assert.equal(blocked.recommendation.rankedActions.find(x => x.actionIndex === 2).visits, 0));
  test('FX-SHADOW-MASK blocked intercept cannot be selected', () => assert.notEqual(blocked.recommendation.selectedActionIndex, 2));
  rejects('nonterminal projection without fallback rejected', () => prime.runLocalShadow({ upstreamMask: [0,1,1,1,1,1] }), /safe fallback/);

  const incumbentTarget = visible.recommendation.selectedTargetId;
  const compared = prime.runLocalShadow({ upstreamMask: all, seed: 42, simulations: 96, upstreamMaskSource: 'test', incumbent: { available: true, policyId: 'scripted-projection-v1', actionKey: visible.recommendation.selectedActionKey, targetId: incumbentTarget, subjectId: visible.recommendation.selectedSubjectId } });
  test('mapped incumbent comparison can agree', () => assert.equal(compared.comparison.agreement, 'agree'));
  test('incumbent comparison remains observational', () => assert.equal(compared.recommendation.authority, 'none-no-action-execution'));

  const settlementFaction = identity.settlements[0].factionId;
  const privateRun = prime.runForFaction(settlementFaction, { upstreamMask: all, seed: 42, simulations: 64, upstreamMaskSource: 'test' });
  test('FX-SHADOW-LEAK settlement cannot use unshared target', () => assert.equal(privateRun.legality.finalMask[2], 0));
  perception.shareEvent({ originalEventId: seen.eventId, sender: game.player.group, recipientFactionId: settlementFaction, observedAtQuantum: 5 });
  game.perceptionQuantum = 5;
  const sharedRun = prime.runForFaction(settlementFaction, { upstreamMask: all, seed: 42, simulations: 64, upstreamMaskSource: 'test' });
  test('explicitly shared contact enables settlement intercept', () => assert.equal(sharedRun.legality.finalMask[2], 1));
  test('shared contact appears in Prime ranked target', () => assert.equal(sharedRun.recommendation.rankedActions.find(x => x.actionIndex === 2).selectedSubjectId, seen.subjectId));

  const repeatA = prime.runLocalShadow({ upstreamMask: all, seed: 7, simulations: 64, upstreamMaskSource: 'repeat' });
  const repeatB = prime.runLocalShadow({ upstreamMask: all, seed: 7, simulations: 64, upstreamMaskSource: 'repeat' });
  test('FX-SHADOW-NONDET repeated recommendations are byte-identical', () => assert.deepEqual(repeatA.recommendation, repeatB.recommendation));
  test('FX-SHADOW-NONDET repeated comparisons are byte-identical', () => assert.deepEqual(repeatA.comparison, repeatB.comparison));

  game.perceptionQuantum = 8;
  const expired = prime.runLocalShadow({ upstreamMask: all, seed: 42, simulations: 64, upstreamMaskSource: 'test' });
  test('FX-SHADOW-STALE contact expires at exact boundary', () => assert.equal(expired.legality.finalMask[2], 0));
  test('FX-SHADOW-STALE expired contact gets zero visits', () => assert.equal(expired.recommendation.rankedActions.find(x => x.actionIndex === 2).visits, 0));

  const terminal = prime.runLocalShadow({ upstreamMask: [0,1,1,1,1,1], terminal: true, seed: 42, simulations: 64, upstreamMaskSource: 'terminal' });
  test('terminal shadow run selects no action', () => assert.equal(terminal.recommendation.selectedActionIndex, null));
  test('terminal shadow run selects no target', () => assert.equal(terminal.recommendation.selectedTargetId, null));
  const replan = prime.runLocalShadow({ upstreamMask: [0,1,1,1,1,1], replanBoundary: true, seed: 42, simulations: 64, upstreamMaskSource: 'replan' });
  test('replan shadow run selects no action', () => assert.equal(replan.recommendation.selectedActionIndex, null));

  const adapterRun = globalThis.ZEK_PRIME_SHADOW_ADAPTER.runLocalShadow({ upstreamMask: all, seed: 11, simulations: 64, upstreamMaskSource: 'adapter' });
  test('adapter executes canonical shadow run', () => assert.equal(adapterRun.recommendation.mode, 'shadow-only'));
  const adapterSnapshot = globalThis.ZEK_PRIME_SHADOW_ADAPTER.captureTelemetrySnapshot();
  test('adapter telemetry equals integration telemetry', () => assert.deepEqual(adapterSnapshot, prime.captureTelemetrySnapshot()));
  test('adapter telemetry hash equals integration hash', () => assert.equal(globalThis.ZEK_PRIME_SHADOW_ADAPTER.captureTelemetryHash(), prime.captureTelemetryHash()));
  const detached = globalThis.ZEK_PRIME_SHADOW_ADAPTER.entries(); detached[0].recommendation.rankedActions[0].visits = 999;
  test('adapter entries are detached', () => assert.notEqual(prime.entries()[0].recommendation.rankedActions[0].visits, 999));

  const snapshot = prime.captureTelemetrySnapshot();
  const hash = prime.captureTelemetryHash();
  prime.dispose();
  test('dispose clears global Prime shadow integration', () => assert.equal(globalThis.ZekNovaPrimeShadowIntegration, null));
  const restored = new PrimeShadowIntegration({ game, identityIntegration: identity, observationLegalityIntegration: legality, storage: primeStore }).install();
  test('persisted telemetry restores', () => assert.deepEqual(restored.captureTelemetrySnapshot(), snapshot));
  test('restored telemetry hash is byte-identical', () => assert.equal(restored.captureTelemetryHash(), hash));
  const next = restored.runLocalShadow({ upstreamMask: all, seed: 12, simulations: 64, upstreamMaskSource: 'restore' });
  test('restored telemetry sequence continues monotonically', () => assert.equal(next.telemetryEntry.sequence, snapshot.nextSequence));

  const saved = structuredClone(next.recommendation);
  restored.dispose();
  test('prior recommendation remains detached after disposal', () => assert.deepEqual(saved, next.recommendation));
  legality.dispose(); observation.dispose(); knowledge.dispose(); perception.dispose(); identity.dispose();
  console.log(`W0-O.6 PRIME SHADOW INTEGRATION TESTS PASS (${checks}/${checks})`);
})().catch(error => { console.error(error.stack || error); process.exit(1); });
