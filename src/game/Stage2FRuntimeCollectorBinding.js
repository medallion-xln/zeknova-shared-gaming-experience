import { STAGE2F_RUNTIME_COLLECTOR_CONFIG } from './Stage2FRuntimeCollectorConfig.js';
import { createStage2FCollectorClient } from './Stage2FRuntimeCollectorClient.js';

const client = createStage2FCollectorClient(STAGE2F_RUNTIME_COLLECTOR_CONFIG);
globalThis.ZekNovaStage2FCollector = client;

function bind() {
  const diagnosis = client.bindKnownReadOnlySurfaces();
  if (diagnosis.providerBound) client.startAutoCollection(STAGE2F_RUNTIME_COLLECTOR_CONFIG.sampleIntervalMs);
  return diagnosis;
}

bind();
const bindingTimer = setInterval(() => {
  const diagnosis = bind();
  if (diagnosis.providerBound) clearInterval(bindingTimer);
}, 2000);

console.info('[Sentinel Grid] Stage 2F-Z runtime collector binding loaded (R0 shadow-only).');
