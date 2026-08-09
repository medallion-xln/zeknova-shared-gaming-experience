#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const FILES = {
  identityContract: 'azl/zeknova-identity-contract-v1.js',
  eventContract: 'azl/zeknova-perception-event-contract-v1.js',
  eventAdapter: 'azl/zeknova-perception-event-adapter-v1.js',
  eventWrapper: 'src/world/PerceptionEvent.js',
  integration: 'src/game/PerceptionEventIntegration.js',
  registry: 'docs/governance/perception-event-registry.json',
  contractTest: 'tests/w0o1-perception-event-contract.test.cjs',
  integrationTest: 'tests/w0o1-perception-event-integration.test.cjs',
  main: 'src/main.js',
  package: 'package.json',
};
const bytes = relative => fs.readFileSync(path.join(ROOT, relative));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
(0, eval)(bytes(FILES.identityContract).toString('utf8'));
(0, eval)(bytes(FILES.eventContract).toString('utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;

function fixture() {
  const worldId = I.worldId({ teamCode: 'FOREST ALPHA', biomeSeed: 5207 });
  const human = I.humanFactionId({ teamCode: 'FOREST ALPHA' });
  const s0 = I.settlementFactionId({ worldId, settlementOrdinal: 0 });
  const s1 = I.settlementFactionId({ worldId, settlementOrdinal: 1 });
  const r = new I.IdentityRegistry({ worldId });
  r.registerFaction({ factionId: human, kind: 'human_team', sourceKey: 'human' });
  r.registerFaction({ factionId: s0, kind: 'zeknovan_settlement', sourceKey: 's0' });
  r.registerFaction({ factionId: s1, kind: 'zeknovan_settlement', sourceKey: 's1' });
  const player = I.humanUnitEntityId({ worldId, userId: 'user-1' });
  r.registerEntity({ entityId: player, kind: 'unit', ownerFactionId: human, sourceKey: 'player' });
  const scout = r.allocateSpawn({ role: 'guardian', ownerFactionId: s0 }).entityId;
  const enemy = r.allocateSpawn({ role: 'stalker', ownerFactionId: s1 }).entityId;
  return { worldId, human, s0, s1, r, player, scout, enemy };
}

const f = fixture();
const stream = new P.PerceptionEventStream({ identitySnapshot: f.r.snapshot() });
const sighting = stream.append({
  eventType: 'enemy_sighted', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 7,
  sourceType: 'line_of_sight', payload: {
    classification: 'stalker', hostility: 'hostile', movementBand: 'fast',
    positionCell: { x: 12, y: 2, z: -4 },
  },
});
const lost = stream.append({
  eventType: 'enemy_lost', observerFactionId: f.s0, sourceFactionId: f.s0,
  sourceEntityId: f.scout, subjectId: f.enemy, observedAtQuantum: 8,
  sourceType: 'line_of_sight', payload: {
    lastKnownPositionCell: { x: 12, y: 2, z: -4 }, reason: 'occluded',
  },
});
const shared = stream.share({
  originalEventId: sighting.eventId, senderFactionId: f.s0, recipientFactionId: f.s1,
  sourceEntityId: f.scout, observedAtQuantum: 9, shareMode: 'direct',
});

const registry = JSON.parse(bytes(FILES.registry));
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'zeknova-w0o1-perception-events-v1',
  phase: 'W0-O.1',
  artifacts: Object.fromEntries(Object.entries(FILES).map(([name, relative]) => [name, { path: relative, sha256: sha(bytes(relative)) }])),
  contract: {
    id: P.CONTRACT_ID,
    registry_id: P.REGISTRY_ID,
    schema_version: P.SCHEMA_VERSION,
    event_types: P.EVENT_TYPES,
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(bytes(FILES.registry)) },
  inherited: {
    identity_contract_sha256: sha(bytes(FILES.identityContract)),
    w0o0_zeknova_portability_digest: '0b424ff21f1def34f3a156e1c02396e47872e753e9fe3ca27714ae1814b617a9',
    w0o0_sentinel_portability_digest: '5d6e4872e1dab3f7e3062f1b9cf118a329252823ece3c6357ce794058ce0eb34',
  },
  fixed_fixture: {
    world_id: f.worldId,
    observer_faction_id: f.s0,
    recipient_faction_id: f.s1,
    source_entity_id: f.scout,
    subject_id: f.enemy,
    sighting_event_id: sighting.eventId,
    lost_event_id: lost.eventId,
    shared_event_id: shared.eventId,
    shared_original_event_id: shared.payload.sharedEvent.eventId,
  },
  stream: {
    canonical: I.canonicalStringify(stream.snapshot()),
    runtime_hash_fnv1a64x2: stream.snapshotHash(),
    event_count: stream.snapshot().events.length,
    next_event_sequence: stream.snapshot().nextEventSequence,
    settlement0_event_count: stream.eventsForFaction(f.s0).length,
    settlement1_event_count: stream.eventsForFaction(f.s1).length,
  },
  invariants: {
    exact_payload_fields: true,
    wall_clock_forbidden: true,
    source_entity_owned_by_source_faction: true,
    non_share_observer_equals_source_faction: true,
    explicit_sharing_only: true,
    sharing_preserves_original_event: true,
    automatic_omniscient_enumeration_forbidden: true,
  },
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
