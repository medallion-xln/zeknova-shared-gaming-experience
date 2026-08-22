/**
 * ZekNova — full restart / world reset acceptance test
 * Run:  node tests/game-reset.test.mjs
 *
 * Builds a deliberately DIRTY world — completed missions, defeated bosses,
 * bridges, boats, habitats, chopped trees, mined rocks, an active boss
 * encounter — then invokes the real reset implementation and measures what
 * actually survived.
 *
 * The measurements are taken with collectWorldCounts(), which reads the game
 * object directly, so the reset cannot pass by reporting success about itself.
 *
 * Runs against the REAL module. BossCombat.js is imported by GameReset.js and
 * touches sessionStorage, so minimal storage stubs are installed on
 * globalThis before import.
 */

// ── storage stubs (must exist before the module graph loads) ──────────────
function mkStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
    _keys: () => Array.from(m.keys()),
  };
}
globalThis.sessionStorage = mkStorage();
globalThis.localStorage = mkStorage();
globalThis.location = { hostname: "test", search: "", reload() { this.reloaded = true; } };

const {
  resetGameToInitialState, resetRuntimeWorld, resetBossProgression,
  collectWorldCounts, clearProgressStorage, isProgressKey,
  CANONICAL_FRESH_WORLD, PRESERVED_KEYS,
} = await import("../src/game/GameReset.js");

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("  PASS  " + name); }
  else    { fail++; console.log("  FAIL  " + name + (detail ? "  (" + detail + ")" : "")); }
}

const TEAM = "team-alpha";

/** A dirty, mid-campaign world. */
function dirtyGame() {
  const records = [
    { id: 1, type: "bridge",   biome: "wetlands" },
    { id: 2, type: "bridge",   biome: "wetlands" },
    { id: 3, type: "boat",     biome: "wetlands" },
    { id: 4, type: "habitat",  biome: "forest" },
    { id: 5, type: "power",    biome: "desert" },
    { id: 6, type: "water",    biome: "wetlands" },
    { id: 7, type: "defense",  biome: "highlands" },
    { id: 8, type: "capitol",  biome: "forest" },
  ];
  return {
    user: { teamCode: TEAM },
    buildings: { records, group: { cleared: false, clear() { this.cleared = true; } } },
    harvestedTreeIds: new Set([11, 12, 13, 14]),
    minedRockIds: new Set([21, 22]),
    collectedPowerUpIds: new Set([31]),
    treeHarvestedAt: new Map([[11, 1000], [12, 2000]]),
    personalObjectiveIds: new Set(["obj-a", "obj-b"]),
    enemies: [{ id: "e1" }, { id: "e2" }],
    enemyProjectiles: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    civilizationScore: 4200,
    phase: 5,
    missionStats: {
      resourcesCollected: 57, enemiesDefeated: 23, treesChopped: 9,
      personalObjectiveIds: ["obj-a"],
      biomeVisited: ["forest", "wetlands", "desert"],
      biomeStats: { forest: { visits: 3 } },
      bossDefeats: { grid: { at: 1 }, water: { at: 2 }, "tower-one": { at: 3 } },
      claimedBossRewards: ["grid", "water"],
      activeBoss: { id: "mire-siren", hp: 400, phase: 2 },
      aoResourceCollected: { wetlands: 2 },
      rockMinedAt: { 21: 999 },
    },
    missionProgress: { grid: "completed", water: "completed", habitat: "in-progress" },
    hudUpdates: 0,
    updateHud() { this.hudUpdates++; },
  };
}

const mkDoc = () => {
  const nodes = {
    "sub-objective-list": { children: 3, replaceChildren() { this.children = 0; } },
    "mission-ladder":     { children: 12, replaceChildren() { this.children = 0; } },
  };
  return { getElementById: (id) => nodes[id] || null, _nodes: nodes };
};

console.log("\n=== BEFORE RESET: the world is genuinely dirty ===");
let game = dirtyGame();
const before = collectWorldCounts(game);
console.log(`  STRUCTURES_BEFORE_RESET=${before.structures}`);
console.log(`  BRIDGES_BEFORE_RESET=${before.bridges}`);
console.log(`  BOATS_BEFORE_RESET=${before.boats}`);
console.log(`  MISSION_INFRA_BEFORE_RESET=${before.missionInfrastructure}`);
console.log(`  BOSSES_DEFEATED_BEFORE=${before.bossDefeats}`);
check("MISSIONS_COMPLETED > 0", Object.values(game.missionProgress).filter(v => v === "completed").length > 0);
check("BOSSES_DEFEATED > 0", before.bossDefeats === 3, String(before.bossDefeats));
check("PLAYER_STRUCTURES > 0", before.structures === 8, String(before.structures));
check("MISSION_INFRASTRUCTURE > 0", before.missionInfrastructure === 5, String(before.missionInfrastructure));
check("WORLD_MUTATIONS > 0", before.treesChopped === 9 && before.harvestedTrees === 4);
check("ACTIVE_BOSS_ENCOUNTER is true before reset", before.activeBossEncounter === true);
check("CURRENT_PHASE > 1 before reset", before.phase === 5);

console.log("\n=== PRE-SEED: progress AND preferences in storage ===");
globalThis.sessionStorage.setItem(`zeknova.bossRun.v1.${TEAM}`, JSON.stringify({ bossDefeats: { grid: 1, water: 2 } }));
globalThis.sessionStorage.setItem(`zeknova.qa.bossDefeats.v1.${TEAM}`, JSON.stringify({ grid: 1 }));
globalThis.sessionStorage.setItem("zeknova.gameMode", "coop");
globalThis.localStorage.setItem("zeknova:save", JSON.stringify({ buildings: [1, 2, 3] }));
globalThis.localStorage.setItem(`zeknova.reconciliation.v1.${TEAM}.crew`, JSON.stringify({ rel: 5 }));
globalThis.localStorage.setItem("zeknova.visualTheme.v1", "picasso");
globalThis.localStorage.setItem("zeknova.user.v1", JSON.stringify({ id: "u1" }));
check("progress keys are classified as progress",
  isProgressKey(`zeknova.bossRun.v1.${TEAM}`) && isProgressKey("zeknova:save")
  && isProgressKey(`zeknova.reconciliation.v1.${TEAM}.crew`));
check("preference keys are NOT classified as progress",
  PRESERVED_KEYS.every(k => isProgressKey(k) === false));

console.log("\n=== INVOKE THE REAL RESET ===");
const doc = mkDoc();
let fetchCalled = null;
const result = await resetGameToInitialState({
  game,
  confirmFn: () => true,
  fetchFn: async (url, opts) => { fetchCalled = { url, method: opts?.method }; return { ok: true, status: 200 }; },
  locationRef: globalThis.location,
  local: globalThis.localStorage,
  session: globalThis.sessionStorage,
  doc,
});
check("reset reports success", result && result.ok === true);
check("the server reset endpoint was called", fetchCalled?.url === "./api/reset.php");
check("it was a POST", fetchCalled?.method === "POST");
check("the world reloads without the player refreshing", globalThis.location.reloaded === true);

console.log("\n=== AFTER RESET: world object counts ===");
const after = collectWorldCounts(game);
console.log(`  STRUCTURES_AFTER_RESET=${after.structures}`);
console.log(`  BRIDGES_AFTER_RESET=${after.bridges}`);
console.log(`  BOATS_AFTER_RESET=${after.boats}`);
console.log(`  MISSION_INFRA_AFTER_RESET=${after.missionInfrastructure}`);
check("PLAYER_STRUCTURES=0", after.structures === 0, String(after.structures));
check("BRIDGES=0", after.bridges === 0);
check("BOATS=0", after.boats === 0);
check("MISSION_INFRASTRUCTURE=0", after.missionInfrastructure === 0);
check("the building scene group was cleared too (no orphan meshes)",
  game.buildings.group.cleared === true);

console.log("\n=== AFTER RESET: mission + boss progression ===");
check("MISSIONS_COMPLETED=0", Object.keys(game.missionProgress).length === 0);
check("OBJECTIVES_COMPLETED=0",
  after.treesChopped === 0 && after.resourcesCollected === 0 && after.enemiesDefeated === 0);
check("BOSSES_DEFEATED=0", after.bossDefeats === 0);
check("ACTIVE_BOSS_ENCOUNTER=false", after.activeBossEncounter === false);
check("claimed boss rewards cleared", game.missionStats.claimedBossRewards.length === 0);
check("biome visit ledger cleared", game.missionStats.biomeVisited.length === 0);
check("AO resource ledger cleared", Object.keys(game.missionStats.aoResourceCollected).length === 0);
check("CURRENT_PHASE = canonical initial", after.phase === CANONICAL_FRESH_WORLD.phase);
check("civilization score reset", after.civilizationScore === 0);

console.log("\n=== AFTER RESET: OFFICER RANK RETURNS TO ENSIGN ===");
/* Rank is derived from standing infrastructure, so a wiped planet demotes the
   player automatically. Before this it was a stored value that survived the
   reset — a Captain commanding an empty world. */
check("officer rank is Ensign after reset", game.officerRank === "ensign", String(game.officerRank));
check("rank label reads Ensign", game.rankLabel === "Ensign", String(game.rankLabel));
check("the user record is demoted too", game.user.rank === "ensign");

console.log("\n=== AFTER RESET: world mutation ledgers ===");
check("trees chopped counter reset", after.treesChopped === 0);
check("harvested tree ids cleared", after.harvestedTrees === 0);
check("mined rock ids cleared", after.minedRocks === 0);
check("collected power-up ids cleared", after.collectedPowerUps === 0);
check("tree harvest timestamps cleared", game.treeHarvestedAt.size === 0);
check("personal objective ids cleared", game.personalObjectiveIds.size === 0);

console.log("\n=== AFTER RESET: no stale runtime objects ===");
check("no stale enemy projectiles", game.enemyProjectiles.length === 0);
check("no stale enemies", game.enemies.length === 0);
check("HUD objective list cleared", doc._nodes["sub-objective-list"].children === 0);
check("mission ladder cleared", doc._nodes["mission-ladder"].children === 0);
check("HUD was refreshed", game.hudUpdates > 0);

console.log("\n=== PERSISTED RESET (survives reload) ===");
check("boss run state cleared from sessionStorage",
  JSON.parse(globalThis.sessionStorage.getItem(`zeknova.bossRun.v1.${TEAM}`) || '{"bossDefeats":{}}').bossDefeats
    && Object.keys(JSON.parse(globalThis.sessionStorage.getItem(`zeknova.bossRun.v1.${TEAM}`) || '{"bossDefeats":{}}').bossDefeats).length === 0);
check("QA boss ledger cleared",
  globalThis.sessionStorage.getItem(`zeknova.qa.bossDefeats.v1.${TEAM}`) === null);
check("local save blob cleared", globalThis.localStorage.getItem("zeknova:save") === null);
check("reconciliation/relations progress cleared",
  globalThis.localStorage.getItem(`zeknova.reconciliation.v1.${TEAM}.crew`) === null);

console.log("\n=== USER PREFERENCES PRESERVED ===");
check("visual theme preserved", globalThis.localStorage.getItem("zeknova.visualTheme.v1") === "picasso");
check("signed-in user preserved", globalThis.localStorage.getItem("zeknova.user.v1") !== null);
check("game mode preserved", globalThis.sessionStorage.getItem("zeknova.gameMode") === "coop");

console.log("\n=== MISSION-SPECIFIC REGRESSIONS ===");
/* Mission 2 (Water) recovery, Highlands confrontation and Mission 9 wetland
   infrastructure all read from missionStats/aoResourceCollected/buildings —
   the exact ledgers asserted above. Verified through those ledgers rather
   than by re-deriving each mission's objective maths here. */
check("Mission 2 — filtration compounds recovered = 0",
  (game.missionStats.aoResourceCollected.wetlands || 0) === 0);
check("Mission 2 — Mire Siren gate not completed", !game.missionStats.bossDefeats.water);
check("Highlands — mission confrontation not defeated", !game.missionStats.bossDefeats["tower-one"]);
check("Boss run order starts from the first boss", after.bossDefeats === 0);
check("Mission 9 — wetland bridges/boats removed", after.bridges === 0 && after.boats === 0);
check("Mission 9 — aid/survey construction removed",
  game.buildings.records.filter(b => b.biome === "wetlands").length === 0);

console.log("\n=== CANCEL IS SAFE ===");
const g2 = dirtyGame();
const b2 = collectWorldCounts(g2);
const cancelled = await resetGameToInitialState({
  game: g2, confirmFn: () => false,
  fetchFn: async () => ({ ok: true }), locationRef: { reload() { throw new Error("must not reload"); } },
  local: mkStorage(), session: mkStorage(), doc: mkDoc(),
});
check("cancelling returns false", cancelled === false);
check("cancelling leaves the world untouched",
  JSON.stringify(collectWorldCounts(g2)) === JSON.stringify(b2));

console.log("\n=== NO BACKEND (local/demo) STILL RESETS ===");
const g3 = dirtyGame();
const s3 = mkStorage(); const l3 = mkStorage();
l3.setItem("zeknova.visualTheme.v1", "picasso");
l3.setItem("zeknova:save", "{}");
const offline = await resetGameToInitialState({
  game: g3, confirmFn: () => true,
  fetchFn: async () => { throw new Error("network down"); },
  locationRef: { reload() {} }, local: l3, session: s3, doc: mkDoc(),
});
check("reset still succeeds without a backend", offline && offline.ok === true);
check("it reports the server reset did NOT happen", offline.serverReset === false);
check("the runtime world is still fully reset", collectWorldCounts(g3).structures === 0);
check("progress storage still cleared", l3.getItem("zeknova:save") === null);
check("preferences still preserved offline", l3.getItem("zeknova.visualTheme.v1") === "picasso");

console.log("\n=== IDEMPOTENCE ===");
const twice = await resetGameToInitialState({
  game, confirmFn: () => true, fetchFn: async () => ({ ok: true }),
  locationRef: { reload() {} }, local: globalThis.localStorage,
  session: globalThis.sessionStorage, doc: mkDoc(),
});
check("resetting an already-fresh world is safe", twice && twice.ok === true);
check("counts stay at zero", collectWorldCounts(game).structures === 0);

console.log("\n" + "-".repeat(58));
console.log(`  RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
