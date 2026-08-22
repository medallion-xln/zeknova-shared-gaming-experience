/**
 * ZekNova — campaign plan: biome coverage, rank, Guardian scaling
 * Run:  node tests/campaign-plan.test.mjs
 *
 * Checks the three things the plan is supposed to guarantee:
 *   1. every mission delivers one project to ALL five biomes, 10 items each;
 *   2. rank is derived from standing infrastructure, so it is lost on reset;
 *   3. Guardian attacks get faster and projectiles quicker across the campaign,
 *      without crossing the reaction floor.
 *
 * Project types are checked against the REAL building catalogue, so a typo in
 * the ladder fails here instead of shipping a mission that cannot be built.
 */

import * as P from "../src/game/CampaignPlan.js";
import { HUMAN_BUILDINGS } from "../src/game/Buildings.js";

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  PASS  " + name); }
  else    { fail++; console.log("  FAIL  " + name + (detail ? "  (" + detail + ")" : "")); }
}

console.log("\n=== CAMPAIGN SHAPE ===");
check("exactly 12 missions", P.PROJECT_LADDER.length === 12, String(P.PROJECT_LADDER.length));
check("exactly 5 biomes", P.BIOMES.length === 5);
check("10 items per mission by definition", P.ITEMS_PER_MISSION === 10);
check("mission ids are unique",
  new Set(P.PROJECT_LADDER.map(p => p.mission)).size === 12);
check("each mission delivers a DIFFERENT project",
  new Set(P.PROJECT_LADDER.map(p => p.type)).size === 12);

console.log("\n=== EVERY PROJECT TYPE IS REAL (checked against Buildings.js) ===");
const unknown = P.PROJECT_LADDER.filter(p => !HUMAN_BUILDINGS[p.type]);
check("no invented building types", unknown.length === 0,
  unknown.map(p => p.type).join(","));
check("project labels match the catalogue",
  P.PROJECT_LADDER.every(p => HUMAN_BUILDINGS[p.type].label === p.project),
  P.PROJECT_LADDER.filter(p => HUMAN_BUILDINGS[p.type].label !== p.project).map(p => `${p.type}:${p.project}`).join(" | "));

console.log("\n=== REQUESTED UTILITY ORDER: solar → water → comms → defense ===");
const order = P.PROJECT_LADDER.map(p => p.type);
check("mission 1 delivers Solar Grid", order[0] === "power");
check("mission 2 delivers Water Works", order[1] === "water");
check("mission 3 delivers Quantum Communications Hub", order[2] === "communications");
check("mission 4 delivers Defense Tower", order[3] === "defense");
check("utilities precede civic/economic projects",
  order.indexOf("power") < order.indexOf("capitol")
  && order.indexOf("water") < order.indexOf("hospital")
  && order.indexOf("communications") < order.indexOf("stock_exchange"));

console.log("\n=== EVERY MISSION SPANS EVERY BIOME ===");
let allTen = true, allFive = true, evenSplit = true;
for (const p of P.PROJECT_LADDER) {
  const items = P.missionItems(p.mission);
  if (items.length !== 10) allTen = false;
  const built = items.filter(i => i.category === "construction");
  const prep = items.filter(i => i.category === "preparation");
  if (new Set(built.map(i => i.biome)).size !== 5) allFive = false;
  if (new Set(prep.map(i => i.biome)).size !== 5) allFive = false;
  if (built.length !== 5 || prep.length !== 5) evenSplit = false;
}
check("every mission has exactly 10 items", allTen);
check("every mission builds in all 5 biomes", allFive);
check("every mission splits 5 preparation + 5 construction", evenSplit);
check("each biome contributes exactly 2 items per mission",
  P.PROJECT_LADDER.every(p => {
    const items = P.missionItems(p.mission);
    return P.BIOMES.every(b => items.filter(i => i.biome === b).length === 2);
  }));

console.log("\n=== WHICH BIOME RECEIVES WHICH PROJECT IS EXPLICIT ===");
const a = P.biomeAssignments("grid");
check("assignments name all five biomes", a.length === 5);
check("each assignment names its project", a.every(x => x.project === "Solar Grid"));
check("each assignment names its biome", new Set(a.map(x => x.biome)).size === 5);
check("labels state the biome in words", a.every(x => /AO/.test(x.label)));
check("construction labels name the project and the AO",
  P.missionItems("water").filter(i => i.category === "construction")
    .every(i => /Water Works/.test(i.label) && /AO/.test(i.label)));

console.log("\n=== BY MISSION 12 EVERY BIOME HAS EVERY PROJECT ===");
const planet = [];
for (const p of P.PROJECT_LADDER) {
  for (const i of P.missionItems(p.mission)) {
    if (i.category === "construction") planet.push({ type: i.type, biome: i.biome });
  }
}
check("the finished planet holds 12 projects × 5 biomes", planet.length === 60, String(planet.length));
check("every biome ends with all 12 projects",
  P.BIOMES.every(b => new Set(planet.filter(x => x.biome === b).map(x => x.type)).size === 12));

console.log("\n=== RANK IS EARNED FROM INFRASTRUCTURE ===");
check("an empty planet is Ensign", P.rankForInfrastructure([]).rank === "ensign");
check("a reset world reports 0 completed projects", P.completedProjects([]) === 0);

/* Four projects finished planet-wide → Lieutenant. */
const four = [];
for (const p of P.PROJECT_LADDER.slice(0, 4)) for (const b of P.BIOMES) four.push({ type: p.type, biome: b });
check("4 planetary projects earns Lieutenant", P.rankForInfrastructure(four).rank === "lieutenant");
const eight = [];
for (const p of P.PROJECT_LADDER.slice(0, 8)) for (const b of P.BIOMES) eight.push({ type: p.type, biome: b });
check("8 planetary projects earns Captain", P.rankForInfrastructure(eight).rank === "captain");
check("the full planet is Captain", P.rankForInfrastructure(planet).rank === "captain");

console.log("\n=== A PARTIAL PROJECT DOES NOT COUNT ===");
const fourMinusArctic = four.filter(b => !(b.type === "power" && b.biome === "arctic"));
check("4 projects with one biome missing is NOT 4 complete",
  P.completedProjects(fourMinusArctic) === 3, String(P.completedProjects(fourMinusArctic)));
check("and the player is demoted back to Ensign",
  P.rankForInfrastructure(fourMinusArctic).rank === "ensign");
check("rank is TAKEN AWAY when infrastructure is lost",
  P.rankForInfrastructure(eight).rank === "captain"
  && P.rankForInfrastructure(eight.slice(0, 20)).rank === "lieutenant"
  && P.rankForInfrastructure([]).rank === "ensign");

console.log("\n=== GUARDIAN DIFFICULTY SCALES ===");
const base = { windup: 1.05, recovery: 2.1, projectilePlan: "x" };
const m1 = P.scaleAttackProfile(base, 1);
const m6 = P.scaleAttackProfile(base, 6);
const m12 = P.scaleAttackProfile(base, 12);
check("mission 1 is the unscaled baseline", m1.windup === base.windup && m1.recovery === base.recovery);
check("attack windup shortens across the campaign", m12.windup < m6.windup && m6.windup < m1.windup,
  `${m1.windup} → ${m6.windup} → ${m12.windup}`);
check("recovery shortens too (higher attack frequency)", m12.recovery < m1.recovery);
check("cooldown stays windup+recovery", Math.abs(m12.cooldown - (m12.windup + m12.recovery)) < 1e-9);
check("scaling never mutates the base profile", base.windup === 1.05 && base.recovery === 2.1);
check("mission 12 is meaningfully faster (~45%)",
  m12.recovery / m1.recovery < 0.6 && m12.recovery / m1.recovery > 0.5,
  String(m12.recovery / m1.recovery));

console.log("\n=== ATTACKS STAY REACTABLE ===");
const twitchy = P.scaleAttackProfile({ windup: 0.5, recovery: 1 }, 12);
check("windup never drops below the reaction floor",
  twitchy.windup >= P.DIFFICULTY.MIN_WINDUP_SECONDS, String(twitchy.windup));
check("even an already-fast boss stays telegraphed at mission 12",
  twitchy.windup === P.DIFFICULTY.MIN_WINDUP_SECONDS);

console.log("\n=== PROJECTILES GET FASTER AND DENSER ===");
const pat = { type: "radial", count: 18, speed: 6.2, telegraph: 0.85 };
const p1 = P.scaleProjectilePattern(pat, 1);
const p12 = P.scaleProjectilePattern(pat, 12);
check("mission 1 projectile speed is the baseline", p1.speed === 6.2);
check("projectile speed rises across the campaign", p12.speed > p1.speed, `${p1.speed} → ${p12.speed}`);
check("projectile speed rise is bounded (~1.65×)",
  Math.abs(p12.speed - 6.2 * P.DIFFICULTY.PROJECTILE_SPEED_MAX) < 0.02, String(p12.speed));
check("projectile count rises", p12.count > p1.count, `${p1.count} → ${p12.count}`);
check("telegraph is NOT shortened here (cadence owns timing)", p12.telegraph === pat.telegraph);
check("scaling never mutates the base pattern", pat.speed === 6.2 && pat.count === 18);
check("multi-phase counts scale together",
  P.scaleProjectilePattern({ countPhase1: 6, countPhase3: 9, speed: 7.5 }, 12).countPhase3 > 9);

console.log("\n=== DIFFICULTY IS MONOTONIC ACROSS ALL 12 ===");
let monotonic = true;
for (let n = 2; n <= 12; n++) {
  const prev = P.missionDifficulty(n - 1);
  const cur = P.missionDifficulty(n);
  if (cur.cadenceScale >= prev.cadenceScale) monotonic = false;
  if (cur.projectileSpeedScale <= prev.projectileSpeedScale) monotonic = false;
}
check("every mission is harder than the one before it", monotonic);
check("an unknown mission fails SAFE (easiest, not hardest)",
  P.missionDifficulty("not-a-mission").progress === 0);

console.log("\n=== MISSION COMPARISON TABLE ===");
const table = P.compareMissions();
check("the comparison covers all 12 missions", table.length === 12);
check("every row reports 10 items", table.every(r => r.items === 10));
check("every row reports 5 biomes", table.every(r => r.biomes === 5));
console.log("   #  mission            project                          items  prep/build  cadence  projSpeed");
for (const r of table) {
  console.log(`  ${String(r.n).padStart(2)}  ${r.mission.padEnd(18)} ${r.project.padEnd(32)} ${String(r.items).padStart(2)}     ${r.preparation}/${r.construction}       ${r.cadenceScale.toFixed(2)}     ${r.projectileSpeedScale.toFixed(2)}`);
}

console.log("\n" + "-".repeat(58));
console.log(`  RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
