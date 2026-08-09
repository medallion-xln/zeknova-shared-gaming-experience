import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-forest-defensive-command-contract-v2.js";
import "../../azl/zeknova-live-parity-closure-contract-v1.js";

export const LIVE_PARITY_CLOSURE_CONTRACT_ID = "zeknova-live-parity-closure-contract-v1";
export const LIVE_PARITY_CLOSURE_SPACE_ID = "zeknova-forest-defensive-live-parity-closure-v1";
export const LIVE_PARITY_CLOSURE_MODE = "measurement-only-parity-closure";
export const LIVE_PARITY_CLOSURE_AUTHORITY = "none-no-action-execution";
export const LIVE_PARITY_CLOSURE_ACTION_COUNT = 13;

export function liveParityClosureContract() {
  const api = globalThis.ZekNovaLiveParityClosureContract;
  if (!api || api.CONTRACT_ID !== LIVE_PARITY_CLOSURE_CONTRACT_ID) throw new Error("Live parity closure contract is unavailable.");
  return api;
}
