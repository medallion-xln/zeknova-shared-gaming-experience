import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";
import "../../azl/zeknova-knowledge-ledger-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";

const Contract = globalThis.ZekNovaFactionObservationContract;
if (!Contract) throw new Error("ZekNova faction observation contract failed to load.");

export const FACTION_OBSERVATION_SCHEMA_VERSION = Contract.SCHEMA_VERSION;
export const FACTION_OBSERVATION_CONTRACT_ID = Contract.CONTRACT_ID;
export const FACTION_OBSERVATION_REGISTRY_ID = Contract.REGISTRY_ID;
export const PRIME_OBSERVATION_FEATURE_LAYOUT_ID = Contract.FEATURE_LAYOUT_ID;
export const PRIME_OBSERVATION_FEATURE_COUNT = Contract.FEATURE_COUNT;
export const PRIME_OBSERVATION_FEATURE_SPEC = Contract.FEATURE_SPEC;
export const PRIME_OBSERVATION_TOPIC_ORDER = Contract.TOPIC_ORDER;
export const PRIME_OBSERVATION_SLOT_CAPACITIES = Contract.SLOT_CAPACITIES;
export const FactionObservation = Contract.FactionObservation;
export const createFactionObservation = Contract.createObservation;
export const validateFactionObservation = Contract.validateObservation;
export const isFactionObservationId = Contract.isObservationId;
