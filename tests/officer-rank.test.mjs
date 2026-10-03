import assert from "node:assert/strict";
import { BIOMES, PROJECT_LADDER } from "../src/game/CampaignPlan.js";
import { biomeAt } from "../src/world/Biomes.js";
import {
  isStanding, standingInfrastructure, rankFromRecords, infrastructureSignature, rankDelta,
  reconcileServerRank,
} from "../src/game/OfficerRank.js";

/* An x coordinate that genuinely lands in the named biome, taken from the same
   biomeAt() the world uses — so the fixture cannot drift from the band layout. */
const xFor = (id) => {
  for (let x = -90; x <= 90; x += 0.5) if (biomeAt(x)?.id === id) return x;
  throw new Error(`no x maps to ${id}`);
};
const build = (type, biome, extra = {}) => ({ type, x: xFor(biome), z: 0, health: 1000, maxHealth: 1000, ...extra });
/** Every biome gets `type` — one completed planetary project. */
const project = (type, extra = {}) => BIOMES.map((b) => build(type, b, extra));
const ladder = (n) => PROJECT_LADDER.slice(0, n).flatMap((p) => project(p.type));

let checks = 0;
const check = (label, cond) => { assert.ok(cond, label); checks++; };

// ── standing vs rubble ──────────────────────────────────────────────────
check("a healthy record stands", isStanding({ type: "power", health: 900 }));
check("health 0 is rubble", !isStanding({ type: "power", health: 0 }));
check("negative health is rubble", !isStanding({ type: "power", health: -5 }));
check("absent health is standing (pre-health-tracking record)", isStanding({ type: "power" }));
check("null health is standing", isStanding({ type: "power", health: null }));
check("garbage is not standing", !isStanding(null) && !isStanding(undefined) && !isStanding("power"));

// ── biome is derived from position, not read from a field that does not exist ──
const real = { type: "power", x: xFor("arctic"), z: 12, health: 10 };
check("biome derived from x", standingInfrastructure([real])[0].biome === "arctic");
check("an explicit biome field wins when present",
  standingInfrastructure([{ type: "power", biome: "wetlands", x: xFor("arctic"), health: 10 }])[0].biome === "wetlands");
check("a record with no usable position is dropped, not mis-credited",
  standingInfrastructure([{ type: "power", health: 10 }]).length === 0);
check("a typeless record is dropped", standingInfrastructure([{ x: 0, health: 10 }]).length === 0);

// ── rank follows completed planetary projects ───────────────────────────
check("an empty planet is Ensign", rankFromRecords([]).rank === "ensign");
check("3 projects is still Ensign", rankFromRecords(ladder(3)).rank === "ensign");
check("4 projects earns Lieutenant", rankFromRecords(ladder(4)).rank === "lieutenant");
check("8 projects earns Captain", rankFromRecords(ladder(8)).rank === "captain");

// ── THE POINT: destruction takes the rank away ──────────────────────────
const captainWorld = ladder(8);
check("a full 8-project world is Captain", rankFromRecords(captainWorld).rank === "captain");

/* Raze ONE structure in ONE AO. That un-completes its whole project, because a
   project only counts when it stands in all five biomes. */
const oneRazed = captainWorld.map((r, i) => (i === 0 ? { ...r, health: 0 } : r));
check("one destroyed structure drops a completed project",
  rankFromRecords(oneRazed).completedProjects === rankFromRecords(captainWorld).completedProjects - 1);
check("losing a project demotes Captain to Lieutenant", rankFromRecords(oneRazed).rank === "lieutenant");

const allRazed = captainWorld.map((r) => ({ ...r, health: 0 }));
check("a flattened planet is Ensign again", rankFromRecords(allRazed).rank === "ensign");
check("a flattened planet has zero standing structures", standingInfrastructure(allRazed).length === 0);
check("a wiped save (no records) is Ensign", rankFromRecords([]).rank === "ensign");

/* NEGATIVE CONTROL — mutate the source rule and assert the guarantee breaks.
   Counting records without the health filter is exactly the bug this replaces:
   under it, the flattened planet still reads as a Captain's planet. */
const countingRubbleToo = (records) => {
  const seen = new Map();
  for (const r of records) {
    const biome = biomeAt(Number(r.x))?.id;
    if (!biome) continue;
    if (!seen.has(r.type)) seen.set(r.type, new Set());
    seen.get(r.type).add(biome);
  }
  return PROJECT_LADDER.filter((p) => (seen.get(p.type)?.size ?? 0) === BIOMES.length).length;
};
check("negative control: ignoring health, the razed planet still reads as 8 projects",
  countingRubbleToo(allRazed) === 8);
check("negative control: the real rule reports 0 for that same world",
  rankFromRecords(allRazed).completedProjects === 0);

// ── change signature ────────────────────────────────────────────────────
check("signature is stable for the same world",
  infrastructureSignature(captainWorld) === infrastructureSignature([...captainWorld]));
check("signature changes when a structure is destroyed",
  infrastructureSignature(captainWorld) !== infrastructureSignature(oneRazed));
check("signature ignores record order",
  infrastructureSignature(captainWorld) === infrastructureSignature([...captainWorld].reverse()));
check("empty world has an empty signature", infrastructureSignature([]) === "");

// ── direction ───────────────────────────────────────────────────────────
check("up is a promotion", rankDelta("ensign", "captain") === "promotion");
check("down is a demotion", rankDelta("captain", "ensign") === "demotion");
check("same is unchanged", rankDelta("captain", "captain") === "unchanged");

// ── stale server rank must not fight a fresher local world ─────────────
/* THE REGRESSION THIS GUARDS. The progression sync runs every 8s and returns a
   rank computed from the LAST SAVED world. Placing a structure does not save
   immediately, so for a moment the server still describes the old world. When
   its answer was applied unconditionally, a player was promoted by the
   placement and demoted a second later by the sync. */
const captainNow = ladder(8);
check("a stale server demotion loses to standing infrastructure",
  reconcileServerRank(captainNow, "ensign").rank === "captain");
check("...and is reported as locally sourced",
  reconcileServerRank(captainNow, "ensign").source === "local");
check("a stale server promotion also loses to a razed world",
  reconcileServerRank(captainNow.map((r) => ({ ...r, health: 0 })), "captain").rank === "ensign");
check("agreement is reported as agreed",
  reconcileServerRank(captainNow, "captain").source === "agreed");

/* Before the world loads there are no records at all, and the server's value is
   the only answer available — that is how a returning player gets their rank
   back. A RAZED world is different: destroyed structures are never removed, so
   it still has records and must resolve to ensign, not to the server's value. */
check("with no records loaded, the server value is used",
  reconcileServerRank([], "captain").rank === "captain");
check("...and is reported as server sourced",
  reconcileServerRank([], "captain").source === "server");
check("a razed world is NOT mistaken for an unloaded one",
  reconcileServerRank(allRazed, "captain").rank === "ensign");
check("a garbage server rank falls back to ensign",
  reconcileServerRank([], "emperor").rank === "ensign");
check("a null server rank falls back to ensign",
  reconcileServerRank([], null).rank === "ensign");
check("non-array records are treated as unloaded",
  reconcileServerRank(null, "lieutenant").rank === "lieutenant");

console.log(`Officer rank / infrastructure tests passed (${checks} checks).`);
