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
  forestContract: 'azl/zeknova-forest-defensive-action-contract-v1.js',
  forestAdapter: 'azl/zeknova-forest-defensive-action-adapter-v1.js',
  forestWrapper: 'src/world/ForestDefensiveActions.js',
  integration: 'src/game/ForestDefensiveActionIntegration.js',
  registry: 'docs/governance/forest-defensive-action-registry.json',
  phaseDoc: 'docs/W0AF_FOREST_DEFENSIVE_ACTIONS.md',
  contractTest: 'tests/w0af-forest-defensive-action-contract.test.cjs',
  integrationTest: 'tests/w0af-forest-defensive-action-integration.test.cjs',
  main: 'src/main.js',
  checkSource: 'scripts/check-source.mjs',
  package: 'package.json'
};
const bytes = relative => fs.readFileSync(path.join(ROOT, relative));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
for (const key of ['identityContract','eventContract','knowledgeContract','observationContract','forestContract']) (0, eval)(bytes(FILES[key]).toString('utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
const F = globalThis.ZekNovaForestDefensiveActionContract;

function fixture(extraPrivate = false, quantum = 20) {
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
  const route = I.routeEntityId({ worldId, routeKey: 'forest-logistics-lane' });
  r.registerEntity({ entityId: route, kind: 'route', ownerFactionId: null, sourceKey: 'route' });
  const structure = I.structureEntityId({ worldId, recordId: 'forest-watch-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure' });
  const resource = I.resourceEntityId({ worldId, resourceKind: 'biomass', sourceId: 'forest-biomass-1' });
  r.registerEntity({ entityId: resource, kind: 'resource', ownerFactionId: null, sourceKey: 'resource' });
  const infra = I.structureEntityId({ worldId, recordId: 'forest-transit-1' });
  r.registerEntity({ entityId: infra, kind: 'structure', ownerFactionId: s0, sourceKey: 'infra' });
  const stream = new P.PerceptionEventStream({ identitySnapshot: r.snapshot() });
  stream.append({ eventType:'enemy_sighted', observerFactionId:s0, sourceFactionId:s0, sourceEntityId:scout0, subjectId:hostile, observedAtQuantum:20, sourceType:'line_of_sight', payload:{classification:'stalker',hostility:'hostile',movementBand:'fast',positionCell:{x:8,y:0,z:2}} });
  stream.append({ eventType:'combat_alert', observerFactionId:s0, sourceFactionId:s0, sourceEntityId:scout0, subjectId:hostile, observedAtQuantum:20, sourceType:'combat_contact', payload:{contactRole:'attacker',positionCell:{x:7,y:0,z:2},severity:'high'} });
  stream.append({ eventType:'structure_observed', observerFactionId:s0, sourceFactionId:s0, sourceEntityId:scout0, subjectId:structure, observedAtQuantum:20, sourceType:'structure_sensor', payload:{observedOwnerFactionId:s0,positionCell:{x:4,y:0,z:5},statusBand:'damaged',structureKind:'zek_watch'} });
  stream.append({ eventType:'resource_discovered', observerFactionId:s0, sourceFactionId:s0, sourceEntityId:scout0, subjectId:resource, observedAtQuantum:20, sourceType:'resource_sensor', payload:{abundanceBand:'high',positionCell:{x:-4,y:0,z:6},resourceKind:'biomass'} });
  stream.append({ eventType:'route_observed', observerFactionId:s0, sourceFactionId:s0, sourceEntityId:scout0, subjectId:route, observedAtQuantum:20, sourceType:'route_sensor', payload:{observedCell:{x:0,y:0,z:1},status:'damaged'} });
  stream.append({ eventType:'infrastructure_status_observed', observerFactionId:s0, sourceFactionId:s0, sourceEntityId:scout0, subjectId:infra, observedAtQuantum:20, sourceType:'infrastructure_sensor', payload:{infrastructureKind:'transit_gate',positionCell:{x:2,y:0,z:3},status:'degraded'} });
  if (extraPrivate) stream.append({ eventType:'enemy_sighted', observerFactionId:s1, sourceFactionId:s1, sourceEntityId:scout1, subjectId:hidden, observedAtQuantum:20, sourceType:'line_of_sight', payload:{classification:'spitter',hostility:'hostile',movementBand:'slow',positionCell:{x:-9,y:0,z:9}} });
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot:r.snapshot() });
  ledger.synchronize(stream.snapshot());
  const observation = O.createObservation({ identitySnapshot:r.snapshot(), ledgerSnapshot:ledger.snapshot(), factionId:s0, quantum });
  const state = F.createPlanningState({ observation, capacities:{materials:50,patrolSlots:3,readiness:80,repairCrewSlots:2}, capacitySource:'portability-fixed', rootStance:'defensive' });
  const candidateSet = F.computeCandidateSet(state, observation);
  const intercept = candidateSet.entries[3];
  const repair = candidateSet.entries[6];
  const interceptOutcome = intercept.legal ? F.projectOutcome(state, observation, candidateSet, 3, intercept.targets[0].targetId) : null;
  const repairOutcome = repair.legal ? F.projectOutcome(state, observation, candidateSet, 6, repair.targets[0].targetId) : null;
  const channelOutcome = candidateSet.entries[11].legal ? F.projectOutcome(state, observation, candidateSet, 11, null) : null;
  return { worldId, s0, observation, state, candidateSet, interceptOutcome, repairOutcome, channelOutcome };
}
const base = fixture(false, 20);
const hidden = fixture(true, 20);
const expired = fixture(false, 24);
const registry = JSON.parse(bytes(FILES.registry));
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'zeknova-w0af-forest-defensive-actions-v1',
  phase: 'W0-AF',
  artifacts: Object.fromEntries(Object.entries(FILES).map(([name, relative]) => [name, { path: relative, sha256: sha(bytes(relative)) }])),
  contract: {
    id: F.CONTRACT_ID,
    registry_id: F.REGISTRY_ID,
    schema_version: F.SCHEMA_VERSION,
    action_space_id: F.ACTION_SPACE_ID,
    action_count: F.ACTION_COUNT,
    root_stance: F.ROOT_STANCE,
    authority: F.AUTHORITY,
    safe_fallback_index: F.SAFE_FALLBACK_INDEX
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(bytes(FILES.registry)) },
  inherited: {
    identity_contract_sha256: sha(bytes(FILES.identityContract)),
    perception_event_contract_sha256: sha(bytes(FILES.eventContract)),
    knowledge_ledger_contract_sha256: sha(bytes(FILES.knowledgeContract)),
    faction_observation_contract_sha256: sha(bytes(FILES.observationContract)),
    w0o6_zeknova_portability_digest: '7e18b18fcab3e45ee0d605f3e6264d5d6403b2c6134af7c93fae044d2135f231',
    w0o6_sentinel_portability_digest: '819682ce38c43b385ff9166337398e3380cf6b16fdd78e1a40a251af04fc9f56'
  },
  fixed_fixture: {
    world_id: base.worldId,
    faction_id: base.s0,
    quantum: base.observation.quantum,
    observation_id: base.observation.observationId,
    planning_state_id: base.state.stateId,
    candidate_set_id: base.candidateSet.candidateSetId,
    legal_action_count: base.candidateSet.legalActionCount,
    legal_mask: base.candidateSet.entries.map(entry => entry.legal ? 1 : 0),
    intercept_target_id: base.candidateSet.entries[3].targets[0].targetId,
    intercept_outcome_id: base.interceptOutcome.outcomeId,
    repair_outcome_id: base.repairOutcome.outcomeId,
    channel_outcome_id: base.channelOutcome.outcomeId,
    canonical_candidate_set: I.canonicalStringify(base.candidateSet),
    canonical_intercept_outcome: I.canonicalStringify(base.interceptOutcome)
  },
  invariants: {
    exactly_thirteen_actions: base.candidateSet.entries.length === 13,
    defensive_root_only: base.state.rootStance === 'defensive',
    safe_fallback_legal: base.candidateSet.entries[0].legal === true,
    hidden_other_faction_observation_equivalence: I.canonicalStringify(base.observation) === I.canonicalStringify(hidden.observation),
    hidden_other_faction_candidate_equivalence: I.canonicalStringify(base.candidateSet) === I.canonicalStringify(hidden.candidateSet),
    expired_contact_masks_intercept: expired.candidateSet.entries[3].legal === false,
    direct_intelligence_targets_only_direct_records: base.candidateSet.entries[10].targets.every(target => target.acquisitionMode === 'direct'),
    outcomes_are_deterministic_projections: F.validateOutcomeProjection(base.interceptOutcome, base.state, base.observation, base.candidateSet).outcomeId === base.interceptOutcome.outcomeId,
    no_live_execution_authority: F.AUTHORITY === 'read-only-planning-no-action-execution',
    no_execute_surface: typeof F.executeAction === 'undefined' && typeof F.dispatchAction === 'undefined' && typeof F.applyAction === 'undefined',
    no_wall_clock_fields: !/timestamp|elapsedMs|Date\(/.test(I.canonicalStringify(base.candidateSet)),
    live_transition_parity_not_claimed: true
  }
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
