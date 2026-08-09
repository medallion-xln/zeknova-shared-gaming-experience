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
import "../../azl/zeknova-prime-adversarial-generalization-contract-v1.js";
export const PRIME_ADVERSARIAL_GENERALIZATION_CONTRACT_ID="zeknova-prime-adversarial-generalization-contract-v1";
export const PRIME_ADVERSARIAL_GENERALIZATION_EVALUATION_ID="zeknova-prime-adversarial-generalization-v1";
export const PRIME_ADVERSARIAL_GENERALIZATION_MODE="evaluation-only-adversarial-generalization-no-live-command-execution";
export const PRIME_ADVERSARIAL_GENERALIZATION_AUTHORITY="none-no-live-command-execution";
export const PRIME_ADVERSARIAL_GENERALIZATION_VARIANT_COUNT=14;
export function primeAdversarialGeneralizationContract(){const api=globalThis.ZekNovaPrimeAdversarialGeneralizationContract;if(!api||api.CONTRACT_ID!==PRIME_ADVERSARIAL_GENERALIZATION_CONTRACT_ID)throw new Error("Prime adversarial generalization contract is unavailable.");return api;}
