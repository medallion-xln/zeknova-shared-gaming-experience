import { STAGE2F_RUNTIME_COLLECTOR_CONFIG } from './Stage2FRuntimeCollectorConfig.js';
import { createStage2FCollectorClient } from './Stage2FRuntimeCollectorClient.js';

const client = createStage2FCollectorClient(STAGE2F_RUNTIME_COLLECTOR_CONFIG);
globalThis.ZekNovaStage2FCollector = client;
let qualificationAttempted = false;

function publishStatus(status, detail = null) {
  const root = document.documentElement;
  root.dataset.sentinelGridR0Status = status;
  if (detail) root.dataset.sentinelGridR0Detail = String(detail).slice(0, 240);
}

globalThis.addEventListener('sentinel-grid:stage2f-capture-result', (event) => {
  publishStatus(event.detail?.accepted === false ? 'duplicate' : 'accepted', event.detail?.captureId ?? null);
});
globalThis.addEventListener('sentinel-grid:stage2f-capture-error', (event) => {
  publishStatus('rejected', event.detail?.error ?? 'unknown collector error');
});

function bind() {
  const diagnosis = client.bindKnownReadOnlySurfaces();
  if (diagnosis.providerBound) {
    client.startAutoCollection(STAGE2F_RUNTIME_COLLECTOR_CONFIG.sampleIntervalMs);
    publishStatus('provider-bound');
    if (!qualificationAttempted) {
      qualificationAttempted = true;
      window.setTimeout(() => client.pollOnce().then((result) => {
        if (!result.collected) publishStatus(
          result.reason ?? 'not-collected',
          result.diagnosis?.error || result.diagnosis?.missing?.join(',') || result.stateIdentity || null,
        );
      }).catch((error) => publishStatus('poll-error', error?.message ?? error)), 1000);
    }
  }
  return diagnosis;
}

bind();
const bindingTimer = setInterval(() => {
  const diagnosis = bind();
  if (diagnosis.providerBound) clearInterval(bindingTimer);
}, 2000);

console.info('[Sentinel Grid] Stage 2F-Z runtime collector binding loaded (R0 shadow-only).');
