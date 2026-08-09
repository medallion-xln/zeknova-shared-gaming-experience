import "../../azl/zeknova-identity-contract-v1.js";
import "../../azl/zeknova-faction-observation-contract-v1.js";
import "../../azl/zeknova-forest-defensive-action-contract-v1.js";
import "../../azl/zeknova-forest-defensive-command-contract-v1.js";

export const FOREST_DEFENSIVE_COMMAND_CONTRACT_ID = "zeknova-forest-defensive-command-contract-v1";
export const FOREST_DEFENSIVE_COMMAND_SPACE_ID = "zeknova-forest-defensive-command-space-v1";
export const FOREST_DEFENSIVE_COMMAND_MODE = "live-incumbent-command-runtime";
export const FOREST_DEFENSIVE_COMMAND_AUTHORITY = "incumbent-scripted-ai";
export const FOREST_DEFENSIVE_COMMAND_ACTIONS = Object.freeze([1, 3, 12]);

export function forestDefensiveCommandContract() {
  const api = globalThis.ZekNovaForestDefensiveCommandContract;
  if (!api || api.CONTRACT_ID !== FOREST_DEFENSIVE_COMMAND_CONTRACT_ID) throw new Error("Forest defensive command contract is unavailable.");
  return api;
}
