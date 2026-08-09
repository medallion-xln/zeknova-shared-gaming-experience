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
  'azl/zeknova-observation-legality-contract-v1.js',
]) (0, eval)(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
const L = globalThis.ZekNovaObservationLegalityContract;
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
  const scout0 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const scout1 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s1 }).entityId;
  const hostile = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const friendly = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const hidden = r.allocateSpawn({ role: 'spitter', ownerFactionId: s1 }).entityId;
  const structure = I.structureEntityId({ worldId, recordId: 'watchtower-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure' });
  const resource = I.resourceEntityId({ worldId, resourceKind: 'tree', sourceId: 'tree-1' });
  r.registerEntity({ entityId: resource, kind: 'resource', ownerFactionId: null, sourceKey: 'resource' });
  const route = I.routeEntityId({ worldId, routeKey: 'central-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  return { worldId, human, s0, s1, r, scout0, scout1, hostile, friendly, hidden, structure, resource, route };
}

function packetFor(f, options = {}) {
  const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
  if (options.hostile !== false) stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.hostile, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  if (options.friendly) stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.friendly, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'guardian', hostility: 'friendly', movementBand: 'slow', positionCell: { x: 3, y: 0, z: 2 } } });
  if (options.route !== false) stream.append({ eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.route, observedAtQuantum: 14, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'damaged' } });
  if (options.structure !== false) stream.append({ eventType: 'structure_observed', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.structure, observedAtQuantum: 14, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: f.s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: options.structureStatus || 'damaged', structureKind: 'watchtower' } });
  if (options.resource !== false) stream.append({ eventType: 'resource_discovered', observerFactionId: f.s0, sourceFactionId: f.s0, sourceEntityId: f.scout0, subjectId: f.resource, observedAtQuantum: 14, sourceType: 'resource_sensor', payload: { abundanceBand: 'high', positionCell: { x: 2, y: 0, z: 3 }, resourceKind: 'tree' } });
  if (options.hiddenOtherFaction) stream.append({ eventType: 'enemy_sighted', observerFactionId: f.s1, sourceFactionId: f.s1, sourceEntityId: f.scout1, subjectId: f.hidden, observedAtQuantum: 14, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -8, y: 0, z: 9 } } });
  if (options.shareHostile) {
    const original = stream.eventsForFaction(f.s0).find(e => e.eventType === 'enemy_sighted');
    stream.share({ originalEventId: original.eventId, senderFactionId: f.s0, recipientFactionId: f.s1, sourceEntityId: f.scout0, observedAtQuantum: 14, shareMode: 'direct' });
  }
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() });
  ledger.synchronize(stream.snapshot());
  const factionId = options.factionId || f.s0;
  const quantum = options.quantum == null ? 14 : options.quantum;
  return O.createObservation({ identitySnapshot: f.r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId, quantum });
}

const f = fixture();
const packet = packetFor(f);
const view = L.buildTargetView(packet);
const allUpstream = [1, 1, 1, 1, 1, 1];
const record = L.computeLegality({ observation: packet, upstreamMask: allUpstream });

test('contract identity', () => assert.equal(L.CONTRACT_ID, 'zeknova-observation-legality-contract-v1'));
test('registry identity', () => assert.equal(L.REGISTRY_ID, 'zeknova-observation-legality-v1-development'));
test('schema version', () => assert.equal(L.SCHEMA_VERSION, 1));
test('action space identity', () => assert.equal(L.ACTION_SPACE_ID, 'zeknova-observation-action-space-v1-development'));
test('six actions declared', () => assert.equal(L.ACTION_COUNT, 6));
test('action indexes are canonical', () => assert.deepEqual(L.ACTIONS.map(a => a.index), [0, 1, 2, 3, 4, 5]));
test('action keys are canonical', () => assert.deepEqual(L.ACTIONS.map(a => a.key), ['stabilize', 'scout_region', 'intercept_contact', 'fortify_known_route', 'repair_known_structure', 'share_intelligence']));
test('safe fallback is stabilize', () => assert.equal(L.ACTIONS[L.SAFE_FALLBACK_INDEX].key, 'stabilize'));
test('safe fallback is declared interrupt', () => assert.equal(L.ACTIONS[0].interrupt, true));

test('target view is canonical', () => assert.equal(L.isTargetViewId(view.targetViewId), true));
test('target view validates byte-identically', () => assert.deepEqual(L.validateTargetView(view, packet), view));
test('target view addresses observation', () => assert.equal(view.observationId, packet.observationId));
test('target view addresses faction', () => assert.equal(view.factionId, f.s0));
test('target view has every action', () => assert.equal(view.actions.length, 6));
test('stabilize is targetless', () => assert.equal(view.actions[0].eligibleWithoutTarget, true));
test('scout has route target', () => assert.equal(view.actions[1].targetCount, 1));
test('intercept has hostile contact target', () => assert.equal(view.actions[2].targetCount, 1));
test('fortify has route target', () => assert.equal(view.actions[3].targetCount, 1));
test('repair has damaged structure target', () => assert.equal(view.actions[4].targetCount, 1));
test('share has every direct record as target', () => assert.equal(view.actions[5].targetCount, 4));
test('target IDs are canonical', () => assert.equal(view.actions.flatMap(a => a.targets).every(t => L.isTargetId(t.targetId)), true));
test('target IDs are action-bound', () => assert.notEqual(view.actions[1].targets[0].targetId, view.actions[3].targets[0].targetId));

test('all observation requirements pass', () => assert.deepEqual(record.observationMask, [1, 1, 1, 1, 1, 1]));
test('all-upstream produces all-final mask', () => assert.deepEqual(record.finalMask, [1, 1, 1, 1, 1, 1]));
test('all mask bitsets are 3f', () => assert.deepEqual([record.upstreamBitsetHex, record.observationBitsetHex, record.finalBitsetHex], ['3f', '3f', '3f']));
test('safe fallback remains legal', () => assert.equal(record.safeFallbackLegal, true));
test('legality ID is canonical', () => assert.equal(L.isLegalityId(record.legalityId), true));
test('legality validates byte-identically', () => assert.deepEqual(L.validateLegality(record, packet), record));
test('mask hashes are deterministic', () => assert.equal(record.finalMaskHash, L.maskHash('final', record.finalMask)));

const empty = packetFor(f, { hostile: false, route: false, structure: false, resource: false });
const emptyRecord = L.computeLegality({ observation: empty, upstreamMask: allUpstream });
test('empty observation retains only stabilize', () => assert.deepEqual(emptyRecord.observationMask, [1, 0, 0, 0, 0, 0]));
test('empty final mask retains only stabilize', () => assert.deepEqual(emptyRecord.finalMask, [1, 0, 0, 0, 0, 0]));
test('empty reasons identify missing route', () => assert.equal(emptyRecord.reasons[1], 'no_known_route'));
test('empty reasons identify missing contact', () => assert.equal(emptyRecord.reasons[2], 'no_fresh_hostile_contact'));
test('empty reasons identify missing repair target', () => assert.equal(emptyRecord.reasons[4], 'no_repairable_structure'));
test('empty reasons identify missing share target', () => assert.equal(emptyRecord.reasons[5], 'no_shareable_direct_record'));

const friendlyPacket = packetFor(f, { hostile: false, friendly: true, route: false, structure: false, resource: false });
const friendlyRecord = L.computeLegality({ observation: friendlyPacket, upstreamMask: allUpstream });
test('wrong-hostility contact cannot enable intercept', () => assert.equal(friendlyRecord.finalMask[2], 0));
test('friendly direct contact can still be shared', () => assert.equal(friendlyRecord.finalMask[5], 1));
const operationalPacket = packetFor(f, { hostile: false, route: false, resource: false, structureStatus: 'operational' });
test('operational structure cannot enable repair', () => assert.equal(L.computeLegality({ observation: operationalPacket, upstreamMask: allUpstream }).finalMask[4], 0));

const upstream = [1, 1, 0, 1, 0, 1];
const intersected = L.computeLegality({ observation: packet, upstreamMask: upstream });
test('FX-OBS-MASK-RESURRECT intercept stays upstream-masked', () => assert.equal(intersected.finalMask[2], 0));
test('FX-OBS-MASK-RESURRECT repair stays upstream-masked', () => assert.equal(intersected.finalMask[4], 0));
test('upstream reason has precedence', () => assert.equal(intersected.reasons[2], 'upstream_mask'));
test('upstream bits are preserved', () => assert.deepEqual(intersected.finalMask, upstream));
rejects('nonterminal upstream without safe fallback rejected', () => L.computeLegality({ observation: packet, upstreamMask: [0, 1, 1, 1, 1, 1] }), /safe fallback/);

const terminal = L.computeLegality({ observation: packet, upstreamMask: [0, 1, 1, 1, 1, 1], terminal: true });
test('terminal masks every action', () => assert.deepEqual(terminal.finalMask, [0, 0, 0, 0, 0, 0]));
test('terminal reason has highest precedence', () => assert.equal(terminal.reasons.every(r => r === 'terminal'), true));
const replan = L.computeLegality({ observation: packet, upstreamMask: [0, 1, 1, 1, 1, 1], replanBoundary: true });
test('replan boundary masks every action', () => assert.deepEqual(replan.finalMask, [0, 0, 0, 0, 0, 0]));
test('replan reason has highest precedence', () => assert.equal(replan.reasons.every(r => r === 'replan_boundary'), true));

const hiddenPacket = packetFor(f, { hiddenOtherFaction: true });
const hiddenRecord = L.computeLegality({ observation: hiddenPacket, upstreamMask: allUpstream });
test('FX-OBS-MASK-HIDDEN hidden other-faction event leaves observation unchanged', () => assert.equal(hiddenPacket.observationId, packet.observationId));
test('FX-OBS-MASK-HIDDEN hidden other-faction event leaves mask unchanged', () => assert.equal(hiddenRecord.finalMaskHash, record.finalMaskHash));
test('FX-OBS-MASK-LEAK other-faction subject is absent from targets', () => assert.equal(L.buildTargetView(hiddenPacket).actions.flatMap(a => a.targets).some(t => t.subjectId === f.hidden), false));

const stalePacket = packetFor(f, { quantum: 18 });
const staleRecord = L.computeLegality({ observation: stalePacket, upstreamMask: allUpstream });
test('FX-OBS-MASK-STALE expired contact masks intercept', () => assert.equal(staleRecord.finalMask[2], 0));
test('FX-OBS-MASK-ROOT recomputation changes mask at deeper quantum', () => assert.notEqual(staleRecord.finalMaskHash, record.finalMaskHash));

const recipientPacket = packetFor(f, { shareHostile: true, factionId: f.s1 });
const recipientView = L.buildTargetView(recipientPacket);
const recipientRecord = L.computeLegality({ observation: recipientPacket, upstreamMask: allUpstream });
test('shared hostile contact enables intercept', () => assert.equal(recipientRecord.finalMask[2], 1));
test('shared-only contact cannot be reshared', () => assert.equal(recipientRecord.finalMask[5], 0));
test('shared target preserves acquisition mode', () => assert.equal(recipientView.actions[2].targets[0].acquisitionMode, 'shared'));

const selected = L.selectTarget(view, packet, 2, view.actions[2].targets[0].targetId);
test('canonical target selection succeeds', () => assert.equal(selected.subjectId, f.hostile));
rejects('target cannot be selected for targetless action', () => L.selectTarget(view, packet, 0, view.actions[2].targets[0].targetId), /does not accept/);
rejects('target from another action cannot be selected', () => L.selectTarget(view, packet, 3, view.actions[1].targets[0].targetId), /not present/);
rejects('invented target cannot be selected', () => L.selectTarget(view, packet, 2, 'zktg:v1:0000000000000000'), /not present/);

function overflowPacket() {
  const x = fixture();
  const stream = new P.PerceptionEventStream({ identitySnapshot: x.r.snapshot() });
  const enemies = [x.hostile, x.friendly, x.hidden];
  for (let i = 0; i < 7; i++) enemies.push(x.r.allocateSpawn({ role: 'stalker', ownerFactionId: x.s1 }).entityId);
  // rebuild stream against refreshed identity snapshot
  const stream2 = new P.PerceptionEventStream({ identitySnapshot: x.r.snapshot() });
  enemies.forEach((enemy, index) => stream2.append({ eventType: 'enemy_sighted', observerFactionId: x.s0, sourceFactionId: x.s0, sourceEntityId: x.scout0, subjectId: enemy, observedAtQuantum: 19, sourceType: 'line_of_sight', payload: { classification: 'stalker-' + index, hostility: 'hostile', movementBand: 'fast', positionCell: { x: index, y: 0, z: index } } }));
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: x.r.snapshot() }); ledger.synchronize(stream2.snapshot());
  return O.createObservation({ identitySnapshot: x.r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId: x.s0, quantum: 19 });
}
const overflow = overflowPacket();
const overflowView = L.buildTargetView(overflow);
test('FX-OVERFLOW observation reports two omitted contacts', () => assert.equal(overflow.sections.find(s => s.topic === 'unit_contact').omittedFreshRecords, 2));
test('FX-OVERFLOW target view exposes only eight intercept targets', () => assert.equal(overflowView.actions[2].targetCount, 8));
test('FX-OVERFLOW target view reports omitted source records', () => assert.equal(overflowView.actions[2].omittedSourceRecordCount, 2));
rejects('FX-OVERFLOW omitted target cannot be invented or selected', () => L.selectTarget(overflowView, overflow, 2, 'zktg:v1:1111111111111111'), /not present/);

const state = new L.ObservationLegalityState({ observation: packet, upstreamMask: allUpstream });
const cloned = state.clone();
test('FX-CLONE-DROP clone retains observation', () => assert.equal(cloned.snapshot().observation.observationId, packet.observationId));
test('FX-CLONE-DROP clone retains upstream mask', () => assert.deepEqual(cloned.snapshot().upstreamMask, allUpstream));
test('FX-CLONE-DROP clone produces same legality', () => assert.equal(cloned.record().legalityId, state.record().legalityId));
const snap = cloned.snapshot(); snap.observation.featureVector[0] = 0; snap.upstreamMask[2] = 0;
test('FX-CLONE-ALIAS snapshot mutation cannot alter parent observation', () => assert.equal(state.snapshot().observation.featureVector[0], 1));
test('FX-CLONE-ALIAS snapshot mutation cannot alter parent mask', () => assert.equal(state.snapshot().upstreamMask[2], 1));
const deeper = state.withObservation(stalePacket);
test('withObservation creates a distinct state', () => assert.notEqual(deeper.record().legalityId, state.record().legalityId));
test('withObservation preserves upstream mask', () => assert.deepEqual(deeper.snapshot().upstreamMask, allUpstream));

test('FX-OBS-MASK-NONDET repeated target views are byte-identical', () => assert.equal(I.canonicalStringify(L.buildTargetView(packet)), I.canonicalStringify(view)));
test('FX-OBS-MASK-NONDET repeated legality records are byte-identical', () => assert.equal(I.canonicalStringify(L.computeLegality({ observation: packet, upstreamMask: allUpstream })), I.canonicalStringify(record)));
test('FX-OBS-MASK-NONDET repeated final hashes are identical', () => assert.equal(L.computeLegality({ observation: packet, upstreamMask: allUpstream }).finalMaskHash, record.finalMaskHash));

rejects('tampered target view ID rejected', () => { const x = structuredClone(view); x.targetViewId = 'zktv:v1:0000000000000000'; L.validateTargetView(x, packet); }, /Target view ID/);
rejects('tampered target record ID rejected', () => { const x = structuredClone(view); x.actions[2].targets[0].recordId = 'bad'; L.validateTargetView(x, packet); }, /Target ID/);
rejects('tampered target slot index rejected', () => { const x = structuredClone(view); x.actions[2].targets[0].slotIndex = 7; L.validateTargetView(x, packet); }, /empty observation slot|outside observation/);
rejects('tampered legality ID rejected', () => { const x = structuredClone(record); x.legalityId = 'zkol:v1:0000000000000000'; L.validateLegality(x, packet); }, /canonical computation/);
rejects('tampered final mask rejected', () => { const x = structuredClone(record); x.finalMask[2] = 0; L.validateLegality(x, packet); }, /canonical computation/);
rejects('mask width mismatch rejected', () => L.computeLegality({ observation: packet, upstreamMask: [1, 1] }), /exactly 6/);
rejects('non-binary mask rejected', () => L.computeLegality({ observation: packet, upstreamMask: [1, 1, 2, 1, 1, 1] }), /0 or 1/);
rejects('state snapshot unexpected field rejected', () => { const x = state.snapshot(); x.extra = true; L.ObservationLegalityState.fromSnapshot(x); }, /unexpected or missing/);

test('legality record contains no event IDs', () => assert.equal(/zkev:v1:/.test(JSON.stringify(record)), false));
test('legality record contains no authoritative aggregates', () => assert.equal(/enemyCount|globalThreat|hiddenHealth|authoritative/.test(JSON.stringify(record)), false));
test('target view contains no float feature reconstruction', () => assert.equal('featureVector' in view, false));
test('action execution is absent from contract surface', () => assert.equal('executeAction' in L, false));

console.log(`W0-O.5 OBSERVATION LEGALITY CONTRACT TESTS PASS (${checks}/${checks})`);
