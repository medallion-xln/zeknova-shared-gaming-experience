import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { BIOMES, PROJECT_LADDER } from "../src/game/CampaignPlan.js";
import { biomeAt } from "../src/world/Biomes.js";
import { rankFromRecords } from "../src/game/OfficerRank.js";

/* The rank rule exists twice: src/game/OfficerRank.js for the runtime, and PHP
 * helpers in api/bootstrap.php so the SERVER can decide rank without trusting
 * the client. Two copies of a rule drift. This runs BOTH against the same
 * worlds and asserts they agree, so the duplication is checked rather than
 * merely commented.
 *
 * The PHP under test is sliced out of the shipped bootstrap.php, not retyped
 * here — a copy in this file would pass while production was wrong. */
const root = new URL("../", import.meta.url);
const bootstrap = readFileSync(new URL("api/bootstrap.php", root), "utf8");

const start = bootstrap.indexOf("const ZEKNOVA_BIOME_BANDS");
assert.ok(start > 0, "bootstrap.php must still define the rank helpers");
const helpers = bootstrap.slice(start);
for (const fn of ["zeknova_biome_at", "zeknova_project_types", "zeknova_standing_projects", "zeknova_rank_for_infrastructure"]) {
  assert.ok(helpers.includes(`function ${fn}`), `bootstrap.php must define ${fn}`);
}

// ── the two constant tables must match ──────────────────────────────────
const phpBands = [...helpers.matchAll(/const ZEKNOVA_BIOME_BANDS = \[([^\]]+)\]/g)][0][1]
  .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
assert.deepEqual(phpBands, [...BIOMES], "PHP biome bands must match CampaignPlan BIOMES, in order");

const phpTypes = helpers.slice(helpers.indexOf("function zeknova_project_types"))
  .match(/return \[([\s\S]*?)\];/)[1]
  .split(",").map((s) => s.trim().replace(/^'|'$/g, "")).filter(Boolean);
assert.deepEqual(phpTypes, PROJECT_LADDER.map((p) => p.type), "PHP project types must match PROJECT_LADDER, in order");

const phpWorld = Number(helpers.match(/const ZEKNOVA_WORLD_SIZE = ([\d.]+)/)[1]);
assert.equal(phpWorld, 180, "PHP world size must match world/Biomes.js");

// ── differential run over shared fixtures ───────────────────────────────
const dir = mkdtempSync(path.join(tmpdir(), "zeknova-rank-"));
try {
  const xFor = (id) => { for (let x = -90; x <= 90; x += 0.5) if (biomeAt(x)?.id === id) return x; throw new Error(id); };
  const b = (type, biome, health = 1000) => ({ type, x: xFor(biome), z: 0, health });
  const project = (type, health = 1000) => BIOMES.map((biome) => b(type, biome, health));
  const ladder = (n, health = 1000) => PROJECT_LADDER.slice(0, n).flatMap((p) => project(p.type, health));

  const worlds = {
    "empty": [],
    "one project": ladder(1),
    "three projects (ensign)": ladder(3),
    "four projects (lieutenant)": ladder(4),
    "eight projects (captain)": ladder(8),
    "full planet": ladder(12),
    "captain with one structure razed": ladder(8).map((r, i) => (i === 0 ? { ...r, health: 0 } : r)),
    "captain, everything razed": ladder(8, 0),
    "health absent entirely": ladder(8).map(({ type, x, z }) => ({ type, x, z })),
    "negative health": ladder(8, -12),
    "no coordinates": ladder(8).map(({ type, health }) => ({ type, health })),
    "explicit biome field": PROJECT_LADDER.slice(0, 4).flatMap((p) => BIOMES.map((biome) => ({ type: p.type, biome, health: 5 }))),
  };

  const harness = path.join(dir, "harness.php");
  writeFileSync(harness, `<?php
${helpers}
function zeknova_save_path(string $t): string { return $t; }
$file = $argv[1];
$done = zeknova_standing_projects($file);
echo json_encode(['completedProjects' => $done, 'rank' => zeknova_rank_for_infrastructure($done)]);
`);

  let compared = 0;
  for (const [label, buildings] of Object.entries(worlds)) {
    const save = path.join(dir, "save.json");
    writeFileSync(save, JSON.stringify({ buildings }));
    const phpOut = JSON.parse(execFileSync("php", [harness, save], { encoding: "utf8" }));
    const js = rankFromRecords(buildings);
    assert.equal(phpOut.completedProjects, js.completedProjects, `${label}: project count must agree (php ${phpOut.completedProjects}, js ${js.completedProjects})`);
    assert.equal(phpOut.rank, js.rank, `${label}: rank must agree (php ${phpOut.rank}, js ${js.rank})`);
    compared++;
  }

  // Negative control: a world the two MUST disagree on if the health rule is
  // dropped on either side — proves the fixtures actually exercise it.
  const razed = ladder(8, 0);
  assert.equal(rankFromRecords(razed).rank, "ensign", "razed world must be ensign, or the fixtures prove nothing");
  assert.equal(rankFromRecords(ladder(8)).rank, "captain", "intact world must be captain");

  // Every biome band boundary agrees between the two implementations.
  let boundaries = 0;
  const boundaryHarness = path.join(dir, "biome.php");
  writeFileSync(boundaryHarness, `<?php\n${helpers}\n$out=[];foreach(explode(',', $argv[1]) as $x){$out[]=zeknova_biome_at((float)$x);}echo json_encode($out);\n`);
  const xs = [];
  for (let x = -95; x <= 95; x += 1.25) xs.push(x);
  const phpBiomes = JSON.parse(execFileSync("php", [boundaryHarness, xs.join(",")], { encoding: "utf8" }));
  xs.forEach((x, i) => { assert.equal(phpBiomes[i], biomeAt(x).id, `biome band must agree at x=${x}`); boundaries++; });

  console.log(`Officer rank PHP/JS parity tests passed (${compared} worlds, ${boundaries} biome samples).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
