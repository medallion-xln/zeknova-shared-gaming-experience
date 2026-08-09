import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-observation-legality-contract-v1.js";
import "../../azl/zeknova-prime-shadow-contract-v1.js";

const Contract = globalThis.ZekNovaPrimeShadowContract;
if (!Contract) throw new Error("ZekNova Prime shadow contract failed to load.");

export const PRIME_SHADOW_SCHEMA_VERSION = Contract.SCHEMA_VERSION;
export const PRIME_SHADOW_CONTRACT_ID = Contract.CONTRACT_ID;
export const PRIME_SHADOW_REGISTRY_ID = Contract.REGISTRY_ID;
export const PRIME_SHADOW_ENGINE_ID = Contract.ENGINE_ID;
export const PRIME_SHADOW_POLICY_VERSION = Contract.POLICY_VERSION;
export const PRIME_SHADOW_MODE = Contract.MODE;
export const PRIME_SHADOW_AUTHORITY = Contract.AUTHORITY;
export const PRIME_SHADOW_FEATURE_COUNT = Contract.FEATURE_COUNT;
export const createPrimeShadowContext = Contract.createContext;
export const createPrimeShadowRecommendation = Contract.createRecommendation;
export const validatePrimeShadowRecommendation = Contract.validateRecommendation;
export const comparePrimeShadowWithIncumbent = Contract.compareWithIncumbent;
export const validatePrimeShadowComparison = Contract.validateComparison;
export const PrimeShadowLedger = Contract.PrimeShadowLedger;
