import "../../azl/zeknova-identity-contract-v1.js";

const Contract = globalThis.ZekNovaIdentityContract;
if (!Contract) throw new Error("ZekNova identity contract failed to load.");

export const IdentityRegistry = Contract.IdentityRegistry;
export const createSettlementEntityId = Contract.settlementEntityId;
export const createHumanUnitEntityId = Contract.humanUnitEntityId;
export const createZeknovanUnitEntityId = Contract.zeknovanUnitEntityId;
export const createStructureEntityId = Contract.structureEntityId;
export const createResourceEntityId = Contract.resourceEntityId;
export const createAreaEntityId = Contract.areaEntityId;
export const createRouteEntityId = Contract.routeEntityId;
export const stableIdentityClone = Contract.stableClone;
