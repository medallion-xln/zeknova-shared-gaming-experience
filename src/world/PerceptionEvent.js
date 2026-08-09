import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-perception-event-contract-v1.js";

const Contract = globalThis.ZekNovaPerceptionEventContract;
if (!Contract) throw new Error("ZekNova perception event contract failed to load.");

export const PERCEPTION_EVENT_SCHEMA_VERSION = Contract.SCHEMA_VERSION;
export const PERCEPTION_EVENT_CONTRACT_ID = Contract.CONTRACT_ID;
export const PERCEPTION_EVENT_REGISTRY_ID = Contract.REGISTRY_ID;
export const PERCEPTION_EVENT_TYPES = Contract.EVENT_TYPES;
export const PerceptionEventStream = Contract.PerceptionEventStream;
export const IdentitySnapshotView = Contract.IdentitySnapshotView;
export const createPerceptionEvent = Contract.createEvent;
export const validatePerceptionEvent = Contract.validateEvent;
export const isPerceptionEventId = Contract.isEventId;
