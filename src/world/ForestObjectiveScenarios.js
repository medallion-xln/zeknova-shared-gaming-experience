import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-forest-defensive-command-contract-v2.js";
import "../../azl/zeknova-live-parity-closure-contract-v1.js";
import "../../azl/zeknova-forest-objective-scenario-contract-v1.js";

export const FOREST_OBJECTIVE_SCENARIO_CONTRACT_ID = "zeknova-forest-objective-scenario-contract-v1";
export const FOREST_OBJECTIVE_PROFILE_ID = "zeknova-forest-defensive-objective-v1";
export const FOREST_SCENARIO_CERTIFICATION_ID = "zeknova-forest-defensive-scenario-certification-v1";
export const FOREST_OBJECTIVE_SCENARIO_MODE = "evaluation-only-no-live-command-execution";
export const FOREST_OBJECTIVE_SCENARIO_AUTHORITY = "none-no-live-command-execution";
export const FOREST_OBJECTIVE_SCENARIO_COUNT = 7;

export function forestObjectiveScenarioContract() {
  const api = globalThis.ZekNovaForestObjectiveScenarioContract;
  if (!api || api.CONTRACT_ID !== FOREST_OBJECTIVE_SCENARIO_CONTRACT_ID) {
    throw new Error("Forest objective and scenario contract is unavailable.");
  }
  return api;
}
