import assert from "node:assert/strict";
import { MISSION_OBJECTIVES, ZEKNOVAN_AID_TYPES, objectiveComplete } from "../src/game/Missions.js";
import { PROJECT_LADDER } from "../src/game/CampaignPlan.js";

/* ZekNovan aid is a RECONCILIATION objective, and it is deliberately rationed.
 *
 * Every aid build starts a cooldown of 3-10 minutes, scaled by how much tension
 * it removes — the guard against buying the natives off in one sitting. Two
 * missions used to ask for aid in ALL FIVE biomes, so completing either meant
 * up to fifty minutes of waiting with nothing else to do. The cooldown is
 * right; asking for five back-to-back was not.
 *
 * Aid is now one project on each of several missions, rotating biome. What this
 * file pins is the rule that keeps it playable: NO MISSION MAY ASK FOR MORE
 * THAN ONE. If a future edit clusters them again, this is what catches it.
 */
const VALID_BIOMES = new Set(["forest", "desert", "highlands", "arctic", "wetlands"]);

const isAid = (objective) => objective?.kind === "biomeEither"
  && Array.isArray(objective.keys)
  && objective.keys.includes("zek_grove")
  && objective.keys.every((key) => ZEKNOVAN_AID_TYPES.includes(key))
  && objective.target === 1;

let checks = 0;
const check = (label, cond) => { assert.ok(cond, label); checks++; };

check("zek_grove is a canonical ZekNovan aid type", ZEKNOVAN_AID_TYPES.includes("zek_grove"));

// ── the cooldown guarantee ──────────────────────────────────────────────
const perMission = new Map();
for (const plan of PROJECT_LADDER) {
  const rows = MISSION_OBJECTIVES[plan.mission] ?? [];
  check(`${plan.mission} exists and ends on its boss`, rows.at(-1)?.kind === "boss");
  perMission.set(plan.mission, rows.filter(isAid));
}

for (const [missionId, aid] of perMission) {
  check(`${missionId} asks for at most one aid project (cooldown)`, aid.length <= 1);
}

const total = [...perMission.values()].reduce((n, a) => n + a.length, 0);
check(`the campaign still asks for reconciliation (${total} projects)`, total >= 4);
check("aid is spread, not clustered", [...perMission.values()].filter((a) => a.length).length >= 4);

// ── each aid objective is well formed and completable ───────────────────
for (const [missionId, aid] of perMission) {
  for (const objective of aid) {
    check(`${missionId}: aid biome is real`, VALID_BIOMES.has(objective.biome));
    check(`${missionId}: a live ZekNovan project completes it`,
      objectiveComplete(objective, { biomes: { [objective.biome]: { buildings: { zek_grove: 1 } } } }) === true);
    check(`${missionId}: an empty biome does not`,
      objectiveComplete(objective, { biomes: { [objective.biome]: { buildings: {} } } }) === false);
  }
}

// ── negative controls ───────────────────────────────────────────────────
const sample = [...perMission.values()].flat()[0];
check("there is at least one aid objective to test", Boolean(sample));
check("wrong kind fails", isAid({ ...sample, kind: "biomeBuilding" }) === false);
check("dropping zek_grove fails", isAid({ ...sample, keys: sample.keys.filter((k) => k !== "zek_grove") }) === false);
check("an unknown ZekNovan id fails", isAid({ ...sample, keys: [...sample.keys, "zek_unknown"] }) === false);
check("a malformed objective fails", isAid({ kind: "biomeEither", biome: "forest", target: 1 }) === false);
check("a non-ZekNovan key does not complete it",
  objectiveComplete({ ...sample, keys: ["unknown"] }, { biomes: { [sample.biome]: { buildings: { zek_grove: 1 } } } }) === false);

// ── every mission still has exactly ten items plus its boss ─────────────
for (const plan of PROJECT_LADDER) {
  const rows = MISSION_OBJECTIVES[plan.mission] ?? [];
  check(`${plan.mission} has 10 items + boss`, rows.length === 11);
}

console.log(`ZekNovan aid objective tests passed (${checks} checks, ${total} aid projects across the campaign).`);
