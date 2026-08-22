/** Sentinel Prime R1 contract. Deny-by-default and limited to reversible W0-P.2 actions. */
export const PRIME_R1_CONTRACT_ID = "zeknova-sentinel-prime-r1-authority-v1";
export const PRIME_R1_MANIFEST_ID = "zeknova-sentinel-prime-r1-manifest-v1";
export const PRIME_R1_MANIFEST_SHA256 = "167e538ff6e142ed3bf6ee26cfad718f40c24c181616654e22503b652f009617";
export const PRIME_R1_AUTHORITY = Object.freeze({
  tier: "R1_LIMITED",
  canDispatch: true,
  canMutateLiveWorld: true,
  canEscalateAuthority: false,
});
export const PRIME_R1_FRESHNESS_QUANTA = 1;
export const PRIME_R1_ACTION_BINDINGS = Object.freeze([
  Object.freeze({ primeIndex: 0, primeKey: "stabilize", commandIndex: 0, commandKey: "hold_settlement_perimeter" }),
  Object.freeze({ primeIndex: 1, primeKey: "scout_region", commandIndex: 2, commandKey: "reconnoiter_forest_lane" }),
  Object.freeze({ primeIndex: 2, primeKey: "intercept_contact", commandIndex: 3, commandKey: "intercept_hostile_contact" }),
  Object.freeze({ primeIndex: 3, primeKey: "fortify_known_route", commandIndex: 7, commandKey: "fortify_known_route" }),
  Object.freeze({ primeIndex: 4, primeKey: "repair_known_structure", commandIndex: 6, commandKey: "repair_known_structure" }),
  Object.freeze({ primeIndex: 5, primeKey: "share_intelligence", commandIndex: 10, commandKey: "share_verified_intelligence" }),
]);
export const PRIME_R1_PROHIBITED = Object.freeze([
  "arbitrary_movement", "arbitrary_resource_spending", "save_override", "mission_override",
  "physics_mutation", "multiplayer_administration", "arbitrary_spawn", "arbitrary_despawn",
  "unrestricted_economy", "developer_commands", "authority_escalation", "code_modification",
  "legal_mask_bypass", "hard_safety_bypass",
]);
export const PRIME_R1_BASELINE = Object.freeze({
  gitHead: "9015537fb0e2b6cc3e2d24901e78b40b5de191e0",
  gitStatusSha256: "6bbb7c1998328a0e63b3c8d2f33f41350d0a7964f91f462f21b0c4ec12e468de",
  gitDiffSha256: "901f827130b00197ac3ad66cd45b5573469c7df88117a39974b281bb76c599da",
  primeRuntimeSha256: "d8938f0f02a450a79a5326708a378eae6c31dbc1d839b30bd424853d5f897866",
  commandContractSha256: "5cfec8bb0c7de88061910085fb8f53a81bfd8e6b818f9c57ccb9ed43d55789f4",
  commandRuntimeSha256: "a7831f4b9d7776b6c823bbf80855b696f82a8077ee81fba245c43d3e2f93f49f",
  baselineR0Certified: true,
});

export function primeR1Binding(actionIndex, actionKey) {
  return PRIME_R1_ACTION_BINDINGS.find((item) => item.primeIndex === actionIndex && item.primeKey === actionKey) || null;
}

export function assertPrimeR1Provenance(value) {
  if (!value || Object.keys(PRIME_R1_BASELINE).some((key) => value[key] !== PRIME_R1_BASELINE[key])) {
    throw new Error("Prime R1 provenance mismatch.");
  }
  return true;
}
