'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = (rel) => sha(fs.readFileSync(path.join(ROOT, rel)));
for (const file of [
  'zeknova-identity-contract-v1.js',
  'zeknova-perception-event-contract-v1.js',
  'zeknova-knowledge-ledger-contract-v1.js',
  'zeknova-faction-observation-contract-v1.js',
  'zeknova-forest-defensive-action-contract-v1.js',
  'zeknova-forest-defensive-command-contract-v2.js',
  'zeknova-live-parity-closure-contract-v1.js',
  'zeknova-forest-objective-scenario-contract-v1.js',
]) vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'azl', file), 'utf8'), { filename: file });
const I = globalThis.ZekNovaIdentityContract;
const C = globalThis.ZekNovaForestObjectiveScenarioContract;
const cert = C.certifyAll(16);
const report = I.canonicalize({
  artifactId:'zeknova-stage1az-forest-objective-scenarios-v1',
  phase:'Stage 1A-Z',
  contract:{
    id:C.CONTRACT_ID, registryId:C.REGISTRY_ID, objectiveProfileId:C.OBJECTIVE_PROFILE_ID,
    certificationId:C.CERTIFICATION_ID, mode:C.MODE, authority:C.AUTHORITY,
    scenarioCount:C.SCENARIO_COUNT, objectivePriorityCount:C.OBJECTIVE_PROFILE.priorities.length
  },
  inherited:{
    w0p3Status:'frozen',
    w0p3ZeknovaDigest:'430e1693d437e481db44576a8a9944656c5d796d8355abafbef7c8411e965dd1',
    w0p3SentinelDigest:'4451983b1fd49b10a3849c1fec14ea4a4686684158aee9d4985dc79f08645da5'
  },
  certification:{
    reportId:cert.reportId, seedCount:cert.seedCount, allScenariosCertified:cert.allScenariosCertified,
    results:cert.results.map((r) => ({
      scenarioId:r.scenarioId, certified:r.certified, deterministic:r.deterministic,
      successWitnessRate:r.successWitnessRate, failureWitnessRate:r.failureWitnessRate,
      ablatedFailureRate:r.ablatedFailureRate, objectiveVectorWinRate:r.objectiveVectorWinRate
    }))
  },
  invariants:{
    sevenFailurePossibleScenarios:true, authoredSuccessWitnesses:true, authoredFailureWitnesses:true,
    objectiveRelevantAblations:true, lexicographicObjective:true,
    noLiveCommandExecution:true, sentinelAuthorityFalse:true,
    productionAuthorityFalse:true, strategicCompetenceFalse:true,
    fullGameDynamicsClaimFalse:true
  },
  artifacts:{
    contract:{path:'azl/zeknova-forest-objective-scenario-contract-v1.js',sha256:fileHash('azl/zeknova-forest-objective-scenario-contract-v1.js')},
    adapter:{path:'azl/zeknova-forest-objective-scenario-adapter-v1.js',sha256:fileHash('azl/zeknova-forest-objective-scenario-adapter-v1.js')},
    wrapper:{path:'src/world/ForestObjectiveScenarios.js',sha256:fileHash('src/world/ForestObjectiveScenarios.js')},
    integration:{path:'src/game/ForestObjectiveScenarioIntegration.js',sha256:fileHash('src/game/ForestObjectiveScenarioIntegration.js')},
    registry:{path:'docs/governance/forest-objective-scenario-registry.json',sha256:fileHash('docs/governance/forest-objective-scenario-registry.json')},
    contractTest:{path:'tests/stage1az-forest-objective-scenario-contract.test.cjs',sha256:fileHash('tests/stage1az-forest-objective-scenario-contract.test.cjs')},
    integrationTest:{path:'tests/stage1az-forest-objective-scenario-integration.test.cjs',sha256:fileHash('tests/stage1az-forest-objective-scenario-integration.test.cjs')},
    main:{path:'src/main.js',sha256:fileHash('src/main.js')},
    checkSource:{path:'scripts/check-source.mjs',sha256:fileHash('scripts/check-source.mjs')},
    package:{path:'package.json',sha256:fileHash('package.json')}
  }
});
const canonical = I.canonicalStringify(report);
const digest = sha(canonical);
console.log(JSON.stringify(report, null, 2));
console.log('ZekNova Stage 1A-Z digest: ' + digest);
