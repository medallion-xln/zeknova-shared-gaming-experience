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
  knowledgeAdapter: 'azl/zeknova-knowledge-ledger-adapter-v1.js',
  knowledgeWrapper: 'src/world/FactionKnowledgeLedger.js',
  integration: 'src/game/FactionKnowledgeIntegration.js',
  registry: 'docs/governance/knowledge-ledger-registry.json',
  contractTest: 'tests/w0o2-knowledge-ledger-contract.test.cjs',
  integrationTest: 'tests/w0o2-knowledge-ledger-integration.test.cjs',
  main: 'src/main.js',
  checkSource: 'scripts/check-source.mjs',
  package: 'package.json',
};
const bytes = relative => fs.readFileSync(path.join(ROOT, relative));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(0, eval)(bytes(FILES.identityContract).toString('utf8'));
(0, eval)(bytes(FILES.eventContract).toString('utf8'));
(0, eval)(bytes(FILES.knowledgeContract).toString('utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;

function fixture() {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const human = I.humanFactionId({ teamCode: 'FOREST ALPHA' });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'human' });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const scout = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  const route = I.routeEntityId({ worldId, routeKey: 'central-river-crossing' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  return { worldId, human, s0, s1, r, scout, enemy, route };
}
const f = fixture();
const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
const sighting = stream.append({
  eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 7,
  sourceType: 'line_of_sight', payload: {
    classification: 'stalker', hostility: 'hostile', movementBand: 'fast',
    positionCell: { x: 12, y: 0, z: -4 },
  },
});
stream.append({
  eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 8,
  sourceType: 'line_of_sight', payload: {
    lastKnownPositionCell: { x: 12, y: 0, z: -4 }, reason: 'occluded',
  },
});
stream.append({
  eventType: 'route_observed', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.route, observedAtQuantum: 9,
  sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'blocked' },
});
stream.share({
  originalEventId: sighting.eventId, senderFactionId: f.s0, recipientFactionId: f.s1,
  sourceEntityId: f.scout, observedAtQuantum: 12, shareMode: 'direct',
});
const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: f.r.snapshot() });
ledger.synchronize(stream.snapshot());
ledger.advanceToQuantum(17);
const senderUnit = ledger.getRecord(f.s0, f.enemy, 'unit_contact');
const recipientUnit = ledger.getRecord(f.s1, f.enemy, 'unit_contact');
const route = ledger.getRecord(f.s0, f.route, 'route_status');
const registry = JSON.parse(bytes(FILES.registry));
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'zeknova-w0o2-faction-knowledge-v1',
  phase: 'W0-O.2',
  artifacts: Object.fromEntries(Object.entries(FILES).map(([name, relative]) => [name, { path: relative, sha256: sha(bytes(relative)) }])),
  contract: {
    id: K.CONTRACT_ID,
    registry_id: K.REGISTRY_ID,
    schema_version: K.SCHEMA_VERSION,
    topics: K.TOPICS,
    event_policies: K.EVENT_POLICIES,
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(bytes(FILES.registry)) },
  inherited: {
    identity_contract_sha256: sha(bytes(FILES.identityContract)),
    perception_event_contract_sha256: sha(bytes(FILES.eventContract)),
    w0o1_zeknova_portability_digest: 'beb988777fcfdeb7c6519832628382916de5f15433ada7b373283dcd4a8945e6',
    w0o1_sentinel_portability_digest: '994bf675d0a8bf8ff1215d9f93192d086b3d73016f3f045990298c7a35d1687e',
  },
  fixed_fixture: {
    world_id: f.worldId,
    sender_faction_id: f.s0,
    recipient_faction_id: f.s1,
    subject_id: f.enemy,
    sender_unit_record_id: senderUnit.recordId,
    recipient_unit_record_id: recipientUnit.recordId,
    route_record_id: route.recordId,
  },
  ledger: {
    canonical: I.canonicalStringify(ledger.snapshot()),
    runtime_hash_fnv1a64x2: ledger.snapshotHash(),
    current_quantum: ledger.currentQuantum,
    record_count: ledger.snapshot().records.length,
    applied_event_count: ledger.snapshot().appliedEventIds.length,
    sender_record_count: ledger.recordsForFaction(f.s0).length,
    recipient_record_count: ledger.recordsForFaction(f.s1).length,
    sender_unit_state: senderUnit.knowledgeState,
    sender_unit_current_event: senderUnit.currentEvidence.eventType,
    recipient_unit_state: recipientUnit.knowledgeState,
    recipient_original_observation_quantum: recipientUnit.currentEvidence.effectiveObservedAtQuantum,
    route_state_at_exclusive_expiry: route.knowledgeState,
  },
  invariants: {
    event_derived_only: true,
    faction_private: true,
    direct_outweighs_shared_at_equal_observation_time: true,
    sharing_does_not_refresh: true,
    exclusive_expiry: true,
    contradiction_history_preserved: true,
    monotonic_quantum: true,
    canonical_clone_isolated_snapshots: true,
    no_observation_packet_in_this_phase: true,
  },
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
