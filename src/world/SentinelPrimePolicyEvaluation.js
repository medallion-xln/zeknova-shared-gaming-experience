import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-forest-defensive-command-contract-v2.js";
import "../../azl/zeknova-live-parity-closure-contract-v1.js";
import "../../azl/zeknova-forest-objective-scenario-contract-v1.js";
import "../../azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js";

export const SENTINEL_PRIME_POLICY_EVALUATION_CONTRACT_ID = "zeknova-sentinel-prime-policy-evaluation-contract-v1";
export const SENTINEL_PRIME_POLICY_EVALUATION_ID = "zeknova-sentinel-prime-policy-evaluation-v1";
export const SENTINEL_PRIME_POLICY_EVALUATION_MODE = "evaluation-only-policy-comparison-no-live-command-execution";
export const SENTINEL_PRIME_POLICY_EVALUATION_AUTHORITY = "none-no-live-command-execution";
export const SENTINEL_PRIME_POLICY_COUNT = 18;
export const SENTINEL_PRIME_EVALUATION_SCENARIO_COUNT = 7;

export function sentinelPrimePolicyEvaluationContract(){
  const api=globalThis.ZekNovaSentinelPrimePolicyEvaluationContract;
  if(!api||api.CONTRACT_ID!==SENTINEL_PRIME_POLICY_EVALUATION_CONTRACT_ID) throw new Error("Sentinel Prime policy evaluation contract is unavailable.");
  return api;
}
