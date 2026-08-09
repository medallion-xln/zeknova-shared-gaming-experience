import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-live-parity-contract-v1.js";

export const LIVE_PARITY_CONTRACT_ID = "zeknova-live-parity-contract-v1";
export const LIVE_PARITY_SPACE_ID = "zeknova-forest-defensive-live-parity-v1";
export const LIVE_PARITY_MODE = "measurement-only";
export const LIVE_PARITY_AUTHORITY = "none-no-action-execution";
export const LIVE_PARITY_ACTION_COUNT = 13;

export function liveParityContract() {
  const api = globalThis.ZekNovaLiveParityContract;
  if (!api || api.CONTRACT_ID !== LIVE_PARITY_CONTRACT_ID) throw new Error("Live parity contract is unavailable.");
  return api;
}
