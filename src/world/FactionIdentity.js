import "../../azl/zeknova-identity-contract-v1.js";

const Contract = globalThis.ZekNovaIdentityContract;
if (!Contract) throw new Error("ZekNova identity contract failed to load.");

export const IDENTITY_SCHEMA_VERSION = Contract.SCHEMA_VERSION;
export const IDENTITY_CONTRACT_ID = Contract.CONTRACT_ID;
export const IDENTITY_REGISTRY_ID = Contract.REGISTRY_ID;

export const createWorldId = Contract.worldId;
export const parseWorldId = Contract.parseWorldId;
export const createHumanFactionId = Contract.humanFactionId;
export const createSettlementFactionId = Contract.settlementFactionId;
export const assertCanonicalIdentity = Contract.assertCanonicalIdentity;
export const canonicalIdentityJson = Contract.canonicalStringify;
export const hashIdentity = Contract.hash64x2;
