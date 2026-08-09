import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-forest-defensive-command-contract-v2.js";

export const FOREST_DEFENSIVE_COMMAND_V2_CONTRACT_ID = "zeknova-forest-defensive-command-contract-v2";
export const FOREST_DEFENSIVE_COMMAND_V2_SPACE_ID = "zeknova-forest-defensive-command-space-v2";
export const FOREST_DEFENSIVE_COMMAND_V2_MODE = "live-incumbent-command-runtime";
export const FOREST_DEFENSIVE_COMMAND_V2_AUTHORITY = "incumbent-scripted-ai";
export const FOREST_DEFENSIVE_COMMAND_V2_ACTIONS = Object.freeze([...Array(13).keys()]);

export function forestDefensiveCommandContractV2() {
  const api = globalThis.ZekNovaForestDefensiveCommandContractV2;
  if (!api || api.CONTRACT_ID !== FOREST_DEFENSIVE_COMMAND_V2_CONTRACT_ID) throw new Error("Forest defensive command v2 contract is unavailable.");
  return api;
}
