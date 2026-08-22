/**
 * ZekNova — canonical full-game reset
 * Location: /src/game/GameReset.js
 *
 * WHY THIS EXISTS
 * ----------------------------------------------------------------------
 * "Restart Game" did not restart anything. The old implementation was:
 *
 *     await game.save();          // persist the CURRENT, dirty world
 *     await game.flushAdaptiveSave();
 *     location.reload();          // load that same dirty world back
 *
 * — which saved the player's progress and then handed it straight back to
 * them. Missions stayed completed, bosses stayed defeated, and every bridge,
 * boat and habitat the player had built was still standing.
 *
 * `restartMission()` cleared the mission counters but still called save()
 * afterwards, and never touched boss run state, buildings, or the room world,
 * so mission progress could return through the multiplayer world sync.
 *
 * WHAT A TRUE NEW GAME MEANS HERE
 * ----------------------------------------------------------------------
 * Three separate layers must be reset together, or progress leaks back in
 * from whichever layer was missed:
 *
 *   1. PERSISTED   the team save file on the server, and the shared
 *                  multiplayer room world (which re-syncs buildings to every
 *                  client — clearing only the local save is not enough).
 *   2. PER-RUN     boss run state in sessionStorage.
 *   3. RUNTIME     the world currently on screen: buildings, harvest ledgers,
 *                  mission counters, and any live boss encounter.
 *
 * WHAT IS DELIBERATELY PRESERVED
 * ----------------------------------------------------------------------
 * Progress is not the same thing as preferences. These survive a reset,
 * because losing them is not something a player asked for when they chose to
 * restart the campaign:
 *
 *   zeknova.visualTheme.v1   Picasso visual theme
 *   zeknova.user.v1          who is signed in
 *   zeknova.gameMode         which game mode was chosen
 *
 * Static world content — terrain, biomes, canonical landmarks — is generated,
 * not persisted, so it is untouched by definition. This module only removes
 * things a player or a mission installed.
 */

import { resetRunBossState, cleanupBossCombat, BOSS_RUN_KEY, QA_BOSS_KEY } from "./BossCombat.js";
import { rankForInfrastructure } from "./CampaignPlan.js";

/**
 * The pristine world, in the same shape the save file uses.
 *
 * Values are taken from what the game itself treats as a new game: phase 1,
 * no buildings, no civilization score, empty world-mutation ledgers. Nothing
 * is invented — a fabricated starting resource count would be a worse lie
 * than an honest zero.
 */
export const CANONICAL_FRESH_WORLD = Object.freeze({
  buildings: Object.freeze([]),
  civilizationScore: 0,
  phase: 1,
  missionStats: Object.freeze({}),
  worldProgress: Object.freeze({
    harvestedTreeIds: Object.freeze([]),
    collectedPowerUpIds: Object.freeze([]),
    minedRockIds: Object.freeze([]),
  }),
});

/** Storage keys that hold PROGRESS and must go. */
export const PROGRESS_KEY_PREFIXES = Object.freeze([
  "zeknova.bossRun.v1.",
  "zeknova.qa.bossDefeats.v1.",
  "zeknova.reconciliation.v1.",
]);

/** Storage keys that hold PREFERENCES/IDENTITY and must survive. */
export const PRESERVED_KEYS = Object.freeze([
  "zeknova.visualTheme.v1",
  "zeknova.user.v1",
  "zeknova.gameMode",
]);

/** True when a key holds progress rather than a preference. */
export function isProgressKey(key) {
  const k = String(key || "");
  if (PRESERVED_KEYS.includes(k)) return false;
  return PROGRESS_KEY_PREFIXES.some((p) => k.startsWith(p)) || k === "zeknova:save";
}

/**
 * Remove progress keys from one storage, leaving preferences alone.
 *
 * Iterates and filters rather than calling storage.clear(), which would take
 * the visual theme and the signed-in user with it.
 */
export function clearProgressStorage(storage) {
  if (!storage) return 0;
  let removed = 0;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k != null) keys.push(k);
    }
    for (const k of keys) {
      if (isProgressKey(k)) { storage.removeItem(k); removed++; }
    }
  } catch { /* storage blocked — nothing to clear */ }
  return removed;
}

/**
 * Count the things a reset is supposed to remove.
 * Used by the acceptance test to measure before/after rather than trusting
 * the reset to report on itself.
 */
export function collectWorldCounts(game) {
  const records = game?.buildings?.records;
  const list = Array.isArray(records) ? records : [];
  const byType = (t) => list.filter((b) => b && b.type === t).length;
  const stats = game?.missionStats || {};
  return {
    structures: list.length,
    bridges: byType("bridge"),
    boats: byType("boat"),
    // Everything that is not a bridge or a boat but was still installed by a
    // player or a mission.
    missionInfrastructure: list.length - byType("bridge") - byType("boat"),
    bossDefeats: Object.keys(stats.bossDefeats || {}).length,
    activeBossEncounter: !!stats.activeBoss,
    treesChopped: Number(stats.treesChopped) || 0,
    resourcesCollected: Number(stats.resourcesCollected) || 0,
    enemiesDefeated: Number(stats.enemiesDefeated) || 0,
    harvestedTrees: game?.harvestedTreeIds?.size ?? 0,
    minedRocks: game?.minedRockIds?.size ?? 0,
    collectedPowerUps: game?.collectedPowerUpIds?.size ?? 0,
    civilizationScore: Number(game?.civilizationScore) || 0,
    phase: Number(game?.phase) || 1,
  };
}

/**
 * Reset the world that is currently loaded and on screen.
 *
 * A reset that only rewrites the save file leaves the running game showing
 * the old world until the player reloads — and if anything saves in between,
 * the old world is written straight back over the fresh one. That is exactly
 * how the previous implementation failed.
 */
export function resetRuntimeWorld(game) {
  if (!game) return false;

  // Player/mission installed structures. Both the data records and the scene
  // group must go, or the meshes stay visible with no backing record.
  try {
    if (Array.isArray(game.buildings?.records)) game.buildings.records.length = 0;
    game.buildings?.group?.clear?.();
  } catch { /* ignore */ }

  // World mutation ledgers — trees chopped, rocks mined, pickups taken.
  try {
    game.harvestedTreeIds?.clear?.();
    game.collectedPowerUpIds?.clear?.();
    game.minedRockIds?.clear?.();
    game.personalObjectiveIds?.clear?.();
    if (game.treeHarvestedAt?.clear) game.treeHarvestedAt.clear();
  } catch { /* ignore */ }

  // Mission counters and objective/boss ledgers. Rebuilt rather than deleted
  // key-by-key so no stale field survives, and so the shape stays the one the
  // objective evaluator expects.
  game.missionStats = {
    resourcesCollected: 0,
    enemiesDefeated: 0,
    treesChopped: 0,
    personalObjectiveIds: [],
    rockMinedAt: {},
    biomeVisited: [],
    biomeStats: {},
    bossDefeats: {},
    claimedBossRewards: [],
    activeBoss: null,
    aoResourceCollected: {},
  };
  game.missionProgress = {};
  game.civilizationScore = 0;
  game.phase = CANONICAL_FRESH_WORLD.phase;

  /* Officer rank is EARNED from standing infrastructure, so a wiped planet is
     an Ensign's planet. Rank used to be a stored value that survived the
     reset, leaving a Captain in command of an empty world. Derived from the
     (now empty) building list, so this cannot drift from what is actually
     built. */
  const derived = rankForInfrastructure(game.buildings?.records ?? []);
  game.officerRank = derived.rank;
  game.rankLabel = derived.label;
  if (game.user) game.user.rank = derived.rank;
  if (game.player) game.player.rank = derived.rank;

  // Live combat objects: projectiles and encounter meshes would otherwise
  // outlive the world they belong to.
  try {
    if (Array.isArray(game.enemyProjectiles)) game.enemyProjectiles.length = 0;
    if (Array.isArray(game.enemies)) game.enemies.length = 0;
  } catch { /* ignore */ }

  return true;
}

/**
 * Clear boss progression.
 *
 * Uses BossCombat's own APIs rather than reaching into its storage: it owns
 * the run-state shape, and duplicating that here would drift the moment the
 * shape changed.
 */
export function resetBossProgression({ teamCode, storage } = {}) {
  try { resetRunBossState(teamCode); } catch { /* ignore */ }
  // resetRunBossState writes a fresh empty run; also drop the QA ledger, which
  // it does not own.
  try { storage?.removeItem?.(QA_BOSS_KEY(teamCode)); } catch { /* ignore */ }
  try { storage?.removeItem?.(BOSS_RUN_KEY(teamCode)); } catch { /* ignore */ }
  try { cleanupBossCombat(); } catch { /* ignore */ }
  return true;
}

/**
 * Clear the HUD/mission DOM so the player does not keep reading objectives
 * from the world that was just deleted.
 */
export function resetMissionUi(doc) {
  if (!doc) return false;
  try {
    doc.getElementById("sub-objective-list")?.replaceChildren();
    doc.getElementById("mission-ladder")?.replaceChildren();
  } catch { /* ignore */ }
  return true;
}

/**
 * The one entry point. Coordinates persisted, per-run and runtime resets in
 * an order that cannot re-save the dirty world.
 *
 * ORDERING MATTERS, and got this wrong before:
 *   1. clear the RUNTIME world first, so any save triggered by the reload
 *      writes the fresh state and not the old one;
 *   2. then ask the server for a fresh save + room world;
 *   3. then reload.
 *
 * @returns {Promise<boolean>} false when the player cancelled.
 */
export async function resetGameToInitialState({
  game,
  confirmFn = globalThis.confirm?.bind(globalThis),
  fetchFn = globalThis.fetch?.bind(globalThis),
  locationRef = globalThis.location,
  local = globalThis.localStorage,
  session = globalThis.sessionStorage,
  doc = globalThis.document,
  reload = true,
} = {}) {
  const accepted = typeof confirmFn === "function"
    ? confirmFn(
        "Restart Game\n\n" +
        "This will reset all mission progress, boss progress, resources, and " +
        "constructed infrastructure and return ZekNova to a new-game state.\n\n" +
        "This cannot be undone."
      )
    : false;
  if (!accepted) return false;

  const teamCode = game?.user?.teamCode;

  // 1. RUNTIME first — see the ordering note above.
  resetRuntimeWorld(game);
  resetBossProgression({ teamCode, storage: session });
  clearProgressStorage(session);
  clearProgressStorage(local);
  resetMissionUi(doc);
  try { game?.updateHud?.(true); } catch { /* ignore */ }

  // 2. PERSISTED. The server owns the fresh save and clears the shared room
  //    world so other clients cannot re-sync the old buildings back.
  let serverReset = false;
  try {
    const res = await fetchFn?.("./api/reset.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (res && res.ok === false) throw new Error(`Reset failed: ${res.status}`);
    serverReset = true;
  } catch {
    /* No backend (local/demo). The runtime is already clean and the progress
       keys are gone, so a reload still comes up as a new game. */
    serverReset = false;
  }

  // 3. Reload into the fresh world. Deliberately NOT calling game.save() —
  //    that is what used to overwrite the fresh save with the old world.
  if (reload) locationRef?.reload?.();
  return { ok: true, serverReset };
}

export default resetGameToInitialState;
