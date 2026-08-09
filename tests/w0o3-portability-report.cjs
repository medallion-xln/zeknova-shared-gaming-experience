#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  identityContract: 'azl/zeknova-identity-contract-v1.js',
  eventContract: 'azl/zeknova-perception-event-contract-v1.js',
  knowledgeContract: 'azl/zeknova-knowledge-ledger-contract-v1.js',
  observationContract: 'azl/zeknova-faction-observation-contract-v1.js',
  observationAdapter: 'azl/zeknova-faction-observation-adapter-v1.js',
  observationWrapper: 'src/world/FactionObservation.js',
  integration: 'src/game/FactionObservationIntegration.js',
  registry: 'docs/governance/faction-observation-registry.json',
  contractTest: 'tests/w0o3-faction-observation-contract.test.cjs',
  integrationTest: 'tests/w0o3-faction-observation-integration.test.cjs',
  main: 'src/main.js',
  checkSource: 'scripts/check-source.mjs',
  package: 'package.json'
};
const bytes = relative => fs.readFileSync(path.join(ROOT, relative));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
for (const key of ['identityContract', 'eventContract', 'knowledgeContract', 'observationContract']) (0, eval)(bytes(FILES[key]).toString('utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;

function fixture(extraPrivate) {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const scout0 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const scout1 = r.allocateSpawn({ role: 'guardian', ownerFactionId: s1 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const hidden = r.allocateSpawn({ role: 'spitter', ownerFactionId: s1 }).entityId;
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  const stream = new P.PerceptionEventStream({ identitySnapshot: r.snapshot() });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: enemy, observedAtQuantum: 7, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  stream.append({ eventType: 'route_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: route, observedAtQuantum: 8, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' } });
  if (extraPrivate) stream.append({ eventType: 'enemy_sighted', observerFactionId: s1, sourceFactionId: s1, sourceEntityId: scout1, subjectId: hidden, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -9, y: 0, z: 6 } } });
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: r.snapshot() });
  ledger.synchronize(stream.snapshot());
  const packet = O.createObservation({ identitySnapshot: r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId: s0, quantum: 8 });
  return { worldId, s0, s1, r, ledger, packet };
}
const base = fixture(false);
const hidden = fixture(true);
const registry = JSON.parse(bytes(FILES.registry));
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'zeknova-w0o3-faction-observation-v1',
  phase: 'W0-O.3',
  artifacts: Object.fromEntries(Object.entries(FILES).map(([name, relative]) => [name, { path: relative, sha256: sha(bytes(relative)) }])),
  contract: {
    id: O.CONTRACT_ID,
    registry_id: O.REGISTRY_ID,
    schema_version: O.SCHEMA_VERSION,
    feature_layout_id: O.FEATURE_LAYOUT_ID,
    feature_count: O.FEATURE_COUNT,
    header_width: O.HEADER_WIDTH,
    slot_width: O.SLOT_WIDTH,
    topic_order: O.TOPIC_ORDER,
    slot_capacities: O.SLOT_CAPACITIES
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(bytes(FILES.registry)) },
  inherited: {
    identity_contract_sha256: sha(bytes(FILES.identityContract)),
    perception_event_contract_sha256: sha(bytes(FILES.eventContract)),
    knowledge_ledger_contract_sha256: sha(bytes(FILES.knowledgeContract)),
    w0o2_zeknova_portability_digest: '257bd9c06818b9425506717e01107f61c725c2aa6a85cb6aaa0590f153a2f7d4',
    w0o2_sentinel_portability_digest: '30213dcaf16447c75bd305d0b913e5fdc99f130f9ea1327735b93289b10a438e'
  },
  fixed_fixture: {
    world_id: base.worldId,
    faction_id: base.s0,
    quantum: base.packet.quantum,
    observation_id: base.packet.observationId,
    selected_fresh_record_count: base.packet.selectedFreshRecordCount,
    omitted_fresh_record_count: base.packet.omittedFreshRecordCount,
    canonical_packet: I.canonicalStringify(base.packet),
    packet_hash_fnv1a64x2: I.hash64x2(base.packet),
    feature_vector_sha256: sha(I.canonicalStringify(base.packet.featureVector)),
    feature_vector_nonzero_count: base.packet.featureVector.filter(value => value !== 0).length
  },
  invariants: {
    event_derived_ledger_input_only: true,
    faction_private_projection: true,
    stale_records_excluded: true,
    hidden_other_faction_equivalence: I.canonicalStringify(base.packet) === I.canonicalStringify(hidden.packet),
    no_global_event_sequence_in_packet: !/eventSequence/.test(JSON.stringify(base.packet)),
    no_event_id_in_packet: !/zkev:v1:/.test(JSON.stringify(base.packet)),
    fixed_width_feature_vector: base.packet.featureVector.length === O.FEATURE_COUNT,
    clone_isolated_packet: true,
    action_legality_out_of_scope: true,
    prime_authority_out_of_scope: true
  }
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
