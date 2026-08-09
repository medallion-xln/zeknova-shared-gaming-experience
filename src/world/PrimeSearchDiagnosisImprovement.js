import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-forest-defensive-command-contract-v2.js";
import "../../azl/zeknova-live-parity-closure-contract-v1.js";
import "../../azl/zeknova-forest-objective-scenario-contract-v1.js";
import "../../azl/zeknova-sentinel-prime-policy-evaluation-contract-v1.js";
import "../../azl/zeknova-prime-search-diagnosis-improvement-contract-v1.js";

export const PRIME_SEARCH_DIAGNOSIS_CONTRACT_ID = "zeknova-prime-search-diagnosis-improvement-contract-v1";
export const PRIME_SEARCH_DIAGNOSIS_EVALUATION_ID = "zeknova-prime-search-diagnosis-improvement-v1";
export const PRIME_SEARCH_DIAGNOSIS_MODE = "evaluation-only-search-diagnosis-no-live-command-execution";
export const PRIME_SEARCH_DIAGNOSIS_AUTHORITY = "none-no-live-command-execution";
export const PRIME_SEARCH_DIAGNOSIS_VARIANT_COUNT = 6;
export const PRIME_SEARCH_IMPROVED_POLICY_ID = "sentinel-prime-puct-v2-normalized-root-coverage-development";

export function primeSearchDiagnosisImprovementContract(){
  const api=globalThis.ZekNovaPrimeSearchDiagnosisImprovementContract;
  if(!api||api.CONTRACT_ID!==PRIME_SEARCH_DIAGNOSIS_CONTRACT_ID) throw new Error("Prime search diagnosis and improvement contract is unavailable.");
  return api;
}
