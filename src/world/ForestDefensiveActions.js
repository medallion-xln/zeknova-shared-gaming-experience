import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";

export const FOREST_DEFENSIVE_ACTION_CONTRACT_ID = "zeknova-forest-defensive-action-contract-v1";
export const FOREST_DEFENSIVE_ACTION_SPACE_ID = "zeknova-forest-defensive-action-space-v1";
export const FOREST_DEFENSIVE_ACTION_COUNT = 13;
export const FOREST_DEFENSIVE_ROOT_STANCE = "defensive";
export const FOREST_DEFENSIVE_AUTHORITY = "read-only-planning-no-action-execution";

export function forestDefensiveActionContract() {
  const api = globalThis.ZekNovaForestDefensiveActionContract;
  if (!api || api.CONTRACT_ID !== FOREST_DEFENSIVE_ACTION_CONTRACT_ID) throw new Error("Forest defensive action contract is unavailable.");
  return api;
}
