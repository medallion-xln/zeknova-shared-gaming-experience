import assert from "node:assert/strict";
import { BOSS_CONFIGS, bossAttackTiming } from "../src/game/BossSystem.js";

const READABLE_RECOVERY_FLOOR_SECONDS = 2;
const timing = bossAttackTiming(BOSS_CONFIGS.highlands_stormback, "thunder_punch", "phase_1");

assert.ok(
  timing.recovery >= READABLE_RECOVERY_FLOOR_SECONDS,
  `highlands_stormback:thunder_punch recovery ${timing.recovery}s must remain at or above ${READABLE_RECOVERY_FLOOR_SECONDS}s`,
);
assert.equal(timing.cooldown, timing.windup + timing.recovery);

console.log(`Stormback thunder_punch recovery readability passed at ${timing.recovery}s.`);
