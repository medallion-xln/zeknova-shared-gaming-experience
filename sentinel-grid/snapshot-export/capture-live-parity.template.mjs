/** Read-only Stage 2F-Z capture template. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [modulePath, observerCsv, outputFile, contextFile] = process.argv.slice(2);
if (!modulePath || !observerCsv || !outputFile || !contextFile) {
  console.error('Usage: node capture-live-parity.template.mjs READ_ONLY_MODULE.mjs forest,desert OUTPUT.json CONTEXT.json');
  process.exit(2);
}
const context = JSON.parse(await readFile(path.resolve(contextFile), 'utf8'));
for (const field of ['captureId','sessionId','factionId','biomeId','missionId','missionPhase','tensionBand','infrastructureBand','repositoryHead','runtimeBuildHash','collectorId','environmentId']) {
  if (typeof context[field] !== 'string' || context[field].length === 0) throw new Error(`Context field ${field} is required`);
}
const imported = await import(pathToFileURL(path.resolve(modulePath)).href);
if (typeof imported.captureZekNovaStage1AZParity !== 'function') throw new Error('Module must export captureZekNovaStage1AZParity');
const result = await imported.captureZekNovaStage1AZParity({ observerIds: observerCsv.split(',').filter(Boolean), context });
if (!result?.envelope || !result?.legacyEvidence) throw new Error('Capture module must return { envelope, legacyEvidence }');
const capture = {
  captureVersion: 1,
  captureId: context.captureId,
  capturedAt: new Date().toISOString(),
  source: {
    kind: 'live-runtime',
    productionEligible: true,
    repositoryHead: context.repositoryHead,
    runtimeBuildHash: context.runtimeBuildHash,
    collectorId: context.collectorId,
    environmentId: context.environmentId,
    readOnly: true,
  },
  context: {
    sessionId: context.sessionId, sequence: context.sequence, factionId: context.factionId, biomeId: context.biomeId,
    missionId: context.missionId, missionPhase: context.missionPhase, tensionBand: context.tensionBand,
    infrastructureBand: context.infrastructureBand, tick: context.tick,
  },
  envelope: result.envelope,
  legacyEvidence: result.legacyEvidence,
};
const output = path.resolve(outputFile);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(capture, null, 2)}\n`);
console.log(output);
