#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const name of [
  'zeknova-identity-contract-v1.js',
  'zeknova-perception-event-contract-v1.js',
  'zeknova-knowledge-ledger-contract-v1.js',
  'zeknova-faction-observation-contract-v1.js',
  'zeknova-observation-legality-contract-v1.js',
  'zeknova-prime-shadow-contract-v1.js',
]) (0, eval)(fs.readFileSync(path.join(root, 'azl', name), 'utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
const L = globalThis.ZekNovaObservationLegalityContract;
const S = globalThis.ZekNovaPrimeShadowContract;
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('  PASS ' + name); }
function rejects(name, fn, pattern) { test(name, () => assert.throws(fn, pattern)); }

function fixture(extraPrivate = false, quantum = 14) {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const scout0 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const scout1 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s1 }).entityId;
  const hostile = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const hidden = r.allocateSpawn({ role: 'spitter', ownerFactionId: s1 }).entityId;
  const route = I.routeEntityId({ worldId, routeKey: 'central-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  const structure = I.structureEntityId({ worldId, recordId: 'watchtower-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure' });
  const stream = new P.PerceptionEventStream({ identitySnapshot: r.snapshot() });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: hostile, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  stream.append({ eventType: 'route_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: route, observedAtQuantum: 14, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'damaged' } });
  stream.append({ eventType: 'structure_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: structure, observedAtQuantum: 14, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'damaged', structureKind: 'watchtower' } });
  if (extraPrivate) stream.append({ eventType: 'enemy_sighted', observerFactionId: s1, sourceFactionId: s1, sourceEntityId: scout1, subjectId: hidden, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -8, y: 0, z: 9 } } });
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: r.snapshot() });
  ledger.synchronize(stream.snapshot());
  const observation = O.createObservation({ identitySnapshot: r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId: s0, quantum });
  const targetView = L.buildTargetView(observation);
  const legality = L.computeLegality({ observation, upstreamMask: [1, 1, 1, 1, 1, 1] });
  return { worldId, s0, s1, observation, targetView, legality };
}
const base = fixture(false);
const inputs = { observation: base.observation, targetView: base.targetView, legality: base.legality, context: { seed: 42, simulations: 96, cPuctMilli: 1450, upstreamMaskSource: 'test' } };
const rec = S.createRecommendation(inputs);

test('contract identity', () => assert.equal(S.CONTRACT_ID, 'zeknova-prime-shadow-contract-v1'));
test('registry identity', () => assert.equal(S.REGISTRY_ID, 'zeknova-prime-shadow-v1-development'));
test('engine identity', () => assert.equal(S.ENGINE_ID, 'sentinel-prime-root-puct-v1-development'));
test('mode is shadow-only', () => assert.equal(S.MODE, 'shadow-only'));
test('authority is none', () => assert.equal(S.AUTHORITY, 'none-no-action-execution'));
test('feature count is 592', () => assert.equal(S.FEATURE_COUNT, 592));
test('action count is six', () => assert.equal(S.ACTION_COUNT, 6));
const ctx = S.createContext(inputs.context);
test('context is deterministic', () => assert.equal(S.contextHash(ctx), S.contextHash(inputs.context)));
test('context carries explicit simulations', () => assert.equal(ctx.simulations, 96));
test('context carries explicit upstream source', () => assert.equal(ctx.upstreamMaskSource, 'test'));
rejects('simulation budget below minimum rejected', () => S.createContext({ simulations: 8 }), /below minimum/);
rejects('fractional seed rejected', () => S.createContext({ seed: 1.5 }), /safe integer/);

test('recommendation ID is canonical', () => assert.equal(S.isRecommendationId(rec.recommendationId), true));
test('recommendation validates byte-identically', () => assert.deepEqual(S.validateRecommendation(rec, inputs), rec));
test('recommendation addresses observation', () => assert.equal(rec.observationId, base.observation.observationId));
test('recommendation addresses legality', () => assert.equal(rec.legalityId, base.legality.legalityId));
test('recommendation addresses target view', () => assert.equal(rec.targetViewId, base.targetView.targetViewId));
test('recommendation carries 592-feature hash', () => assert.equal(rec.featureHash, S.featureHash(base.observation)));
test('rank contains exactly six actions', () => assert.equal(rec.rankedActions.length, 6));
test('rank contains every canonical action index', () => assert.deepEqual(rec.rankedActions.map(x => x.actionIndex).sort(), [0,1,2,3,4,5]));
test('visits sum to simulation budget', () => assert.equal(rec.rankedActions.reduce((n, x) => n + x.visits, 0), 96));
test('legal priors sum to one million', () => assert.equal(rec.rankedActions.reduce((n, x) => n + x.priorPpm, 0), 1000000));
test('masked actions receive zero visits', () => assert.equal(rec.rankedActions.filter(x => !x.legal).every(x => x.visits === 0), true));
test('selected action is legal', () => assert.equal(base.legality.finalMask[rec.selectedActionIndex], 1));
test('selected target is canonical when required', () => {
  const action = L.ACTIONS[rec.selectedActionIndex];
  assert.equal(action.requiresTarget ? L.isTargetId(rec.selectedTargetId) : rec.selectedTargetId === null, true);
});
test('confidence equals selected visit share', () => assert.equal(rec.confidencePpm, rec.rankedActions[0].visitSharePpm));
test('recommendation has no wall clock', () => assert.equal(/timestamp|elapsedMs|Date|performance/.test(JSON.stringify(rec)), false));
test('recommendation has no perception event IDs', () => assert.equal(/zkev:v1:/.test(JSON.stringify(rec)), false));
test('recommendation has no execution field', () => assert.equal(/execute|commit|dispatch|applyAction/.test(Object.keys(rec).join('|')), false));

test('repeated recommendation bytes are identical', () => assert.equal(I.canonicalStringify(S.createRecommendation(inputs)), I.canonicalStringify(rec)));
test('repeated recommendation IDs are identical', () => assert.equal(S.createRecommendation(inputs).recommendationId, rec.recommendationId));
test('same seed and inputs preserve ranking', () => assert.deepEqual(S.createRecommendation(inputs).rankedActions, rec.rankedActions));
const hidden = fixture(true);
const hiddenRec = S.createRecommendation({ observation: hidden.observation, targetView: hidden.targetView, legality: hidden.legality, context: inputs.context });
test('FX-SHADOW-HIDDEN hidden other-faction state leaves observation identical', () => assert.equal(hidden.observation.observationId, base.observation.observationId));
test('FX-SHADOW-HIDDEN hidden other-faction state leaves recommendation identical', () => assert.equal(hiddenRec.recommendationId, rec.recommendationId));
test('FX-SHADOW-HIDDEN hidden other-faction state leaves ranking identical', () => assert.deepEqual(hiddenRec.rankedActions, rec.rankedActions));

const blockedLegality = L.computeLegality({ observation: base.observation, upstreamMask: [1,1,0,1,1,1] });
const blocked = S.createRecommendation({ observation: base.observation, targetView: base.targetView, legality: blockedLegality, context: inputs.context });
test('FX-SHADOW-MASK blocked intercept receives zero visits', () => assert.equal(blocked.rankedActions.find(x => x.actionIndex === 2).visits, 0));
test('FX-SHADOW-MASK blocked intercept cannot be selected', () => assert.notEqual(blocked.selectedActionIndex, 2));
test('FX-SHADOW-MASK recommendation binds changed final mask', () => assert.equal(blocked.finalMaskHash, blockedLegality.finalMaskHash));

const stale = fixture(false, 18);
const staleRec = S.createRecommendation({ observation: stale.observation, targetView: stale.targetView, legality: stale.legality, context: inputs.context });
test('FX-SHADOW-STALE expired contact is illegal', () => assert.equal(stale.legality.finalMask[2], 0));
test('FX-SHADOW-STALE expired contact receives zero visits', () => assert.equal(staleRec.rankedActions.find(x => x.actionIndex === 2).visits, 0));
test('FX-SHADOW-STALE expired contact cannot be selected', () => assert.notEqual(staleRec.selectedActionIndex, 2));

const terminalLegality = L.computeLegality({ observation: base.observation, upstreamMask: [0,1,1,1,1,1], terminal: true });
const terminalRec = S.createRecommendation({ observation: base.observation, targetView: base.targetView, legality: terminalLegality, context: inputs.context });
test('terminal shadow recommendation selects no action', () => assert.equal(terminalRec.selectedActionIndex, null));
test('terminal shadow recommendation selects no target', () => assert.equal(terminalRec.selectedTargetId, null));
test('terminal shadow recommendation has zero confidence', () => assert.equal(terminalRec.confidencePpm, 0));
test('terminal shadow recommendation records zero visits', () => assert.equal(terminalRec.rankedActions.every(x => x.visits === 0), true));

const unavailable = S.compareWithIncumbent(rec, { available: false, policyId: 'scripted-unmapped' });
test('incumbent unavailable comparison is canonical', () => assert.equal(S.isComparisonId(unavailable.comparisonId), true));
test('incumbent unavailable comparison says unavailable', () => assert.equal(unavailable.agreement, 'unavailable'));
test('incumbent unavailable comparison validates', () => assert.deepEqual(S.validateComparison(unavailable, rec, { available: false, policyId: 'scripted-unmapped' }), unavailable));
const agree = S.compareWithIncumbent(rec, { available: true, policyId: 'projected-scripted-v1', actionKey: rec.selectedActionKey, targetId: rec.selectedTargetId, subjectId: rec.selectedSubjectId });
test('matching incumbent agrees', () => assert.equal(agree.agreement, 'agree'));
const other = rec.rankedActions.find(x => x.legal && x.actionIndex !== rec.selectedActionIndex);
const disagree = S.compareWithIncumbent(rec, { available: true, policyId: 'projected-scripted-v1', actionKey: other.actionKey, targetId: other.selectedTargetId, subjectId: other.selectedSubjectId });
test('different incumbent disagrees', () => assert.equal(disagree.agreement, 'disagree'));
rejects('unknown incumbent action rejected', () => S.compareWithIncumbent(rec, { available: true, policyId: 'x', actionKey: 'unknown' }), /outside/);

const ledger = new S.PrimeShadowLedger({ worldId: base.worldId });
const e1 = ledger.append(rec, unavailable);
test('shadow ledger starts sequence at one', () => assert.equal(e1.sequence, 1));
test('shadow ledger entry ID is canonical', () => assert.equal(S.isEntryId(e1.entryId), true));
const e2 = ledger.append(blocked, S.compareWithIncumbent(blocked, { available: false, policyId: 'scripted-unmapped' }));
test('shadow ledger sequence is monotonic', () => assert.equal(e2.sequence, 2));
const snap = ledger.snapshot();
test('shadow ledger snapshot round-trips byte-identically', () => assert.deepEqual(S.PrimeShadowLedger.fromSnapshot(snap).snapshot(), snap));
test('shadow ledger hash round-trips', () => assert.equal(S.PrimeShadowLedger.fromSnapshot(snap).hash(), ledger.hash()));
const clone = ledger.clone(); const detached = clone.snapshot(); detached.entries[0].recommendation.rankedActions[0].visits = 999;
test('FX-SHADOW-ALIAS snapshot mutation cannot alter ledger', () => assert.notEqual(ledger.snapshot().entries[0].recommendation.rankedActions[0].visits, 999));
rejects('shadow ledger sequence tamper rejected', () => { const x = structuredClone(snap); x.entries[1].sequence = 3; S.PrimeShadowLedger.fromSnapshot(x); }, /sequence/);
rejects('shadow ledger entry ID tamper rejected', () => { const x = structuredClone(snap); x.entries[0].entryId = 'zkps:v1:1:0000000000000000'; S.PrimeShadowLedger.fromSnapshot(x); }, /tamper/);
rejects('recommendation ID tamper rejected', () => { const x = structuredClone(rec); x.recommendationId = 'zkpr:v1:0000000000000000'; S.validateRecommendation(x, inputs); }, /canonical shadow computation/);
rejects('ranked visits tamper rejected', () => { const x = structuredClone(rec); x.rankedActions[0].visits++; S.validateRecommendation(x, inputs); }, /canonical shadow computation/);
rejects('wrong target view rejected', () => S.createRecommendation({ observation: base.observation, targetView: stale.targetView, legality: base.legality, context: inputs.context }), /Target view/);

console.log(`W0-O.6 PRIME SHADOW CONTRACT TESTS PASS (${checks}/${checks})`);
