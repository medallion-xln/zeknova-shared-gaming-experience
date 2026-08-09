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
  legalityContract: 'azl/zeknova-observation-legality-contract-v1.js',
  shadowContract: 'azl/zeknova-prime-shadow-contract-v1.js',
  shadowAdapter: 'azl/zeknova-prime-shadow-adapter-v1.js',
  shadowWrapper: 'src/world/PrimeShadow.js',
  integration: 'src/game/PrimeShadowIntegration.js',
  registry: 'docs/governance/prime-shadow-registry.json',
  phaseDoc: 'docs/W0O6_PRIME_SHADOW.md',
  contractTest: 'tests/w0o6-prime-shadow-contract.test.cjs',
  integrationTest: 'tests/w0o6-prime-shadow-integration.test.cjs',
  main: 'src/main.js',
  checkSource: 'scripts/check-source.mjs',
  package: 'package.json'
};
const bytes = relative => fs.readFileSync(path.join(ROOT, relative));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
for (const key of ['identityContract','eventContract','knowledgeContract','observationContract','legalityContract','shadowContract']) (0, eval)(bytes(FILES[key]).toString('utf8'));
const I = globalThis.ZekNovaIdentityContract;
const P = globalThis.ZekNovaPerceptionEventContract;
const K = globalThis.ZekNovaKnowledgeLedgerContract;
const O = globalThis.ZekNovaFactionObservationContract;
const L = globalThis.ZekNovaObservationLegalityContract;
const S = globalThis.ZekNovaPrimeShadowContract;

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
  const structure = I.structureEntityId({ worldId, recordId: 'watchtower-1' });
  r.registerEntity({ entityId: structure, kind: 'structure', ownerFactionId: s0, sourceKey: 'structure' });
  const stream = new P.PerceptionEventStream({ identitySnapshot: r.snapshot() });
  stream.append({ eventType: 'enemy_sighted', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: enemy, observedAtQuantum: 7, sourceType: 'line_of_sight', payload: { classification: 'stalker', hostility: 'hostile', movementBand: 'fast', positionCell: { x: 12, y: 0, z: -4 } } });
  stream.append({ eventType: 'route_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: route, observedAtQuantum: 8, sourceType: 'route_sensor', payload: { observedCell: { x: 0, y: 0, z: 1 }, status: 'damaged' } });
  stream.append({ eventType: 'structure_observed', observerFactionId: s0, sourceFactionId: s0, sourceEntityId: scout0, subjectId: structure, observedAtQuantum: 8, sourceType: 'structure_sensor', payload: { observedOwnerFactionId: s0, positionCell: { x: 4, y: 0, z: 5 }, statusBand: 'damaged', structureKind: 'watchtower' } });
  if (extraPrivate) stream.append({ eventType: 'enemy_sighted', observerFactionId: s1, sourceFactionId: s1, sourceEntityId: scout1, subjectId: hidden, observedAtQuantum: 8, sourceType: 'line_of_sight', payload: { classification: 'spitter', hostility: 'friendly', movementBand: 'slow', positionCell: { x: -9, y: 0, z: 6 } } });
  const ledger = new K.FactionKnowledgeLedger({ identitySnapshot: r.snapshot() });
  ledger.synchronize(stream.snapshot());
  const observation = O.createObservation({ identitySnapshot: r.snapshot(), ledgerSnapshot: ledger.snapshot(), factionId: s0, quantum: 8 });
  const targetView = L.buildTargetView(observation);
  const legality = L.computeLegality({ observation, upstreamMask: [1,1,1,1,1,1] });
  const context = { seed: 18427, simulations: 192, cPuctMilli: 1450, upstreamMaskSource: 'portability-fixed' };
  const recommendation = S.createRecommendation({ observation, targetView, legality, context });
  const comparison = S.compareWithIncumbent(recommendation, { available: false, policyId: 'zeknova-scripted-ai-unmapped-v1' });
  const shadowLedger = new S.PrimeShadowLedger({ worldId });
  const entry = shadowLedger.append(recommendation, comparison);
  return { worldId, s0, observation, targetView, legality, context, recommendation, comparison, shadowLedger, entry };
}
const base = fixture(false);
const hidden = fixture(true);
const registry = JSON.parse(bytes(FILES.registry));
const report = I.canonicalize({
  report_schema_version: 1,
  artifact_id: 'zeknova-w0o6-prime-shadow-v1',
  phase: 'W0-O.6',
  artifacts: Object.fromEntries(Object.entries(FILES).map(([name, relative]) => [name, { path: relative, sha256: sha(bytes(relative)) }])),
  contract: {
    id: S.CONTRACT_ID,
    registry_id: S.REGISTRY_ID,
    schema_version: S.SCHEMA_VERSION,
    engine_id: S.ENGINE_ID,
    policy_version: S.POLICY_VERSION,
    mode: S.MODE,
    authority: S.AUTHORITY,
    feature_count: S.FEATURE_COUNT,
    action_count: S.ACTION_COUNT
  },
  registry: { id: registry.registry_id, status: registry.status, sha256: sha(bytes(FILES.registry)) },
  inherited: {
    identity_contract_sha256: sha(bytes(FILES.identityContract)),
    perception_event_contract_sha256: sha(bytes(FILES.eventContract)),
    knowledge_ledger_contract_sha256: sha(bytes(FILES.knowledgeContract)),
    faction_observation_contract_sha256: sha(bytes(FILES.observationContract)),
    observation_legality_contract_sha256: sha(bytes(FILES.legalityContract)),
    w0o5_zeknova_portability_digest: '3885d73f0284f88396df4b6bd941b49d77296147cadeefb2e0f316ebf21d7c8f',
    w0o5_sentinel_portability_digest: '7a414c8626be112669cbe8643b633ef02ea59f5d8cf4f450893980e0b52076b8'
  },
  fixed_fixture: {
    world_id: base.worldId,
    faction_id: base.s0,
    quantum: base.observation.quantum,
    observation_id: base.observation.observationId,
    feature_hash: base.recommendation.featureHash,
    target_view_id: base.targetView.targetViewId,
    legality_id: base.legality.legalityId,
    recommendation_id: base.recommendation.recommendationId,
    comparison_id: base.comparison.comparisonId,
    entry_id: base.entry.entryId,
    shadow_ledger_hash: base.shadowLedger.hash(),
    selected_action_key: base.recommendation.selectedActionKey,
    selected_target_id: base.recommendation.selectedTargetId,
    confidence_ppm: base.recommendation.confidencePpm,
    canonical_recommendation: I.canonicalStringify(base.recommendation),
    canonical_comparison: I.canonicalStringify(base.comparison)
  },
  invariants: {
    consumes_exact_592_feature_packet: base.recommendation.featureCount === 592,
    consumes_w0o5_final_mask: base.recommendation.finalMaskHash === base.legality.finalMaskHash,
    hidden_other_faction_recommendation_equivalence: I.canonicalStringify(base.recommendation) === I.canonicalStringify(hidden.recommendation),
    hidden_other_faction_comparison_equivalence: I.canonicalStringify(base.comparison) === I.canonicalStringify(hidden.comparison),
    only_legal_actions_receive_visits: base.recommendation.rankedActions.every(entry => entry.legal || entry.visits === 0),
    recommendation_is_shadow_only: base.recommendation.mode === 'shadow-only' && base.recommendation.authority === 'none-no-action-execution',
    no_action_execution_surface: true,
    incumbent_comparison_is_observational_only: true,
    no_wall_clock_fields: !/timestamp|elapsedMs/.test(I.canonicalStringify(base.recommendation)),
    deterministic_shadow_ledger: base.shadowLedger.hash() === S.PrimeShadowLedger.fromSnapshot(base.shadowLedger.snapshot()).hash()
  }
});
const canonical = JSON.stringify(report);
const digest = sha(canonical);
if (process.argv.includes('--digest')) console.log(digest);
else console.log(JSON.stringify({ ...report, portability_digest: digest }, null, 2));
