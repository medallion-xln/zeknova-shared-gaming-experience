import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-observation-legality-contract-v1.js";

const Contract = globalThis.ZekNovaObservationLegalityContract;
if (!Contract) throw new Error("ZekNova observation legality contract failed to load.");

export const OBSERVATION_LEGALITY_SCHEMA_VERSION = Contract.SCHEMA_VERSION;
export const OBSERVATION_LEGALITY_CONTRACT_ID = Contract.CONTRACT_ID;
export const OBSERVATION_LEGALITY_REGISTRY_ID = Contract.REGISTRY_ID;
export const OBSERVATION_ACTION_SPACE_ID = Contract.ACTION_SPACE_ID;
export const OBSERVATION_ACTIONS = Contract.ACTIONS;
export const OBSERVATION_ACTION_COUNT = Contract.ACTION_COUNT;
export const OBSERVATION_SAFE_FALLBACK_INDEX = Contract.SAFE_FALLBACK_INDEX;
export const ObservationLegalityState = Contract.ObservationLegalityState;
export const buildObservationTargetView = Contract.buildTargetView;
export const validateObservationTargetView = Contract.validateTargetView;
export const computeObservationLegality = Contract.computeLegality;
export const validateObservationLegality = Contract.validateLegality;
export const selectObservationTarget = Contract.selectTarget;
