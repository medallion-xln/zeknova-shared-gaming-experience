'use strict';
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const ROOT = path.resolve(__dirname, '..');
  globalThis.document = { documentElement: { dataset: {} } };
  const mod = await import(pathToFileURL(path.join(ROOT, 'src/game/ForestObjectiveScenarioIntegration.js')).href);
  const C = globalThis.ZekNovaForestObjectiveScenarioContract;
  const integration = new mod.ForestObjectiveScenarioIntegration();
  let passed = 0;
  function test(name, fn) { fn(); passed++; console.log('  PASS ' + name); }

  test('integration starts uninstalled', () => assert.equal(integration.installed, false));
  test('install returns integration', () => assert.equal(integration.install(), integration));
  test('integration installed', () => assert.equal(integration.installed, true));
  test('integration global installed', () => assert.equal(globalThis.ZekNovaForestObjectiveScenarioIntegration, integration));
  test('document marker installed', () => assert.equal(document.documentElement.dataset.zeknovaForestScenarioCertification, 'stage1az-v1'));
  const adapter = globalThis.ZEK_FOREST_OBJECTIVE_SCENARIO_ADAPTER;
  test('adapter installed', () => assert.ok(adapter));
  test('adapter read only identity', () => assert.equal(adapter.id, 'zeknova-forest-objective-scenario-adapter-v1'));
  test('adapter contract identity', () => assert.equal(adapter.contractId, C.CONTRACT_ID));
  test('adapter scenario count', () => assert.equal(adapter.scenarioCount, 7));
  test('adapter authority none', () => assert.equal(adapter.authority, 'none-no-live-command-execution'));
  test('adapter exposes no execute', () => assert.equal(typeof adapter.execute, 'undefined'));
  test('adapter exposes no dispatch', () => assert.equal(typeof adapter.dispatch, 'undefined'));
  test('adapter exposes no apply', () => assert.equal(typeof adapter.apply, 'undefined'));
  test('adapter exposes no issue', () => assert.equal(typeof adapter.issue, 'undefined'));

  const declaration = integration.captureDeclaration();
  test('declaration contract exact', () => assert.equal(declaration.contractId, C.CONTRACT_ID));
  test('declaration registry exact', () => assert.equal(declaration.registryId, C.REGISTRY_ID));
  test('declaration scenario count seven', () => assert.equal(declaration.scenarioCount, 7));
  test('declaration lists seven scenarios', () => assert.equal(declaration.scenarios.length, 7));
  test('declaration objective has nine priorities', () => assert.equal(declaration.objectiveProfile.priorities.length, 9));
  test('declaration strategic competence false', () => assert.equal(declaration.strategicCompetenceClaim, false));
  test('declaration production authority false', () => assert.equal(declaration.productionAuthorityClaim, false));
  test('declaration mode evaluation only', () => assert.equal(declaration.mode, C.MODE));
  test('declaration detached', () => {
    declaration.scenarios[0].title = 'tampered';
    assert.notEqual(C.SCENARIOS[0].title, 'tampered');
  });

  const cert = integration.runCertification({ seedCount: 16 });
  test('certification completes', () => assert.equal(cert.allScenariosCertified, true));
  test('certification has seven results', () => assert.equal(cert.results.length, 7));
  test('certification success rates one', () => assert.ok(cert.results.every(r => r.successWitnessRate === 1)));
  test('certification failure rates one', () => assert.ok(cert.results.every(r => r.failureWitnessRate === 1)));
  test('certification ablation rates one', () => assert.ok(cert.results.every(r => r.ablatedFailureRate === 1)));
  test('certification deterministic', () => assert.equal(cert.reportId, integration.runCertification({ seedCount: 16 }).reportId));
  test('adapter certification equals integration', () => assert.equal(adapter.runCertification({ seedCount: 16 }).reportId, cert.reportId));

  const scenario = C.SCENARIOS.find(s => s.id === 'multi-crisis-priority');
  const run = integration.runScenario({ scenarioId: scenario.id, plan: scenario.successPlan, seed: 18427 });
  test('scenario run completes', () => assert.equal(run.objectiveComplete, true));
  test('scenario run preserves settlement', () => assert.equal(run.finalState.flags.settlementAlive, true));
  test('scenario run preserves core', () => assert.ok(run.finalState.criticalStructureHealth >= 70));
  test('scenario run does not need resource win', () => assert.equal(run.finalState.flags.resourceSecured, false));
  test('adapter scenario equals integration', () => assert.equal(adapter.runScenario({ scenarioId: scenario.id, plan: scenario.successPlan, seed: 18427 }).runId, run.runId));

  const beforeGlobalKeys = Object.keys(globalThis).filter(k => /Command/.test(k)).sort();
  integration.runCertification({ seedCount: 4 });
  const afterGlobalKeys = Object.keys(globalThis).filter(k => /Command/.test(k)).sort();
  test('certification creates no command globals', () => assert.deepEqual(afterGlobalKeys, beforeGlobalKeys));
  test('certification exposes no live game mutation surface', () => assert.equal(typeof integration.game, 'undefined'));

  const prior = integration.captureDeclaration();
  integration.dispose();
  test('dispose uninstalls integration', () => assert.equal(integration.installed, false));
  test('dispose clears global', () => assert.equal(globalThis.ZekNovaForestObjectiveScenarioIntegration, null));
  test('prior declaration remains detached', () => assert.equal(prior.scenarioCount, 7));
  assert.throws(() => integration.captureDeclaration(), /not installed/);
  passed++; console.log('  PASS uninstalled capture rejected');
  assert.throws(() => adapter.runCertification({ seedCount: 1 }), /unavailable/);
  passed++; console.log('  PASS adapter rejects missing integration');

  console.log(`STAGE 1A-Z FOREST OBJECTIVE SCENARIO INTEGRATION TESTS PASS (${passed}/${passed})`);
})().catch((error) => { console.error(error); process.exit(1); });
