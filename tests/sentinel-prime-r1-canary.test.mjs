import assert from "node:assert/strict";
import { PRIME_R1_CANARY_GRANT } from "../src/game/SentinelPrimeR1CanarySession.js";

assert.equal(PRIME_R1_CANARY_GRANT.artifacts.length, 5);
assert.deepEqual(PRIME_R1_CANARY_GRANT.allowedActions, [
  "stabilize", "scout_region", "intercept_contact", "fortify_known_route", "repair_known_structure", "share_intelligence",
]);
assert.equal(PRIME_R1_CANARY_GRANT.queryValue, "45acf446b4c13b0beaf0e339b713a5ad41c8ac6673f013b0877418b47d75d9ea");
assert.equal(PRIME_R1_CANARY_GRANT.artifacts[2].sha256, "167e538ff6e142ed3bf6ee26cfad718f40c24c181616654e22503b652f009617");
console.log("Sentinel Prime one-session canary gate tests passed.");
