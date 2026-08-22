import { resetGameToInitialState } from "../game/GameReset.js";

export function clearAllMissionObjectives(game) {
  if (!game) return false;
  // Reset all counters that drive MISSION_OBJECTIVES (objectiveValue)
  try {
    game.missionStats = { resourcesCollected: 0, enemiesDefeated: 0, treesChopped: 0, personalObjectiveIds: [] };
    game.harvestedTreeIds?.clear?.();
    game.collectedPowerUpIds?.clear?.();
    game.minedRockIds?.clear?.();
    if (game.treeHarvestedAt instanceof Map) game.treeHarvestedAt.clear();
    game.missionStats.rockMinedAt = {};
    game.missionStats.biomeVisited = [];
    game.missionStats.biomeStats = {};
    game.missionStats.bossDefeats = {};
    game.missionStats.claimedBossRewards = [];
    game.missionStats.activeBoss = null;
    game.missionStats.aoResourceCollected = {};
    game.personalObjectiveIds?.clear?.();
    // Clear DOM objective list so HUD reflects reset immediately
    const objectiveList = document.getElementById("sub-objective-list");
    if (objectiveList) objectiveList.replaceChildren();
    const missionList = document.getElementById("mission-ladder");
    if (missionList) missionList.replaceChildren();
    game.updateHud?.(true);
  } catch {}
  return true;
}

export async function restartMission({ game, confirmFn = globalThis.confirm?.bind(globalThis), locationRef = globalThis.location } = {}) {
  const accepted = typeof confirmFn === "function"
    ? confirmFn("Restart mission? All mission objectives will be cleared and progress reset.")
    : false;
  if (!accepted) return false;
  clearAllMissionObjectives(game);
  await game?.save?.();
  await game?.flushAdaptiveSave?.();
  locationRef?.reload?.();
  return true;
}

/**
 * Full game restart — a true new-game state.
 *
 * This used to save the current world and reload it, which handed the player
 * back the exact progress they asked to discard. It now delegates to the
 * canonical reset in GameReset.js, which clears the runtime world BEFORE any
 * save can fire, resets boss progression, and asks the server for a fresh
 * save and room world.
 */
export async function restartGame(options = {}) {
  const result = await resetGameToInitialState(options);
  return result === false ? false : true;
}

export class PauseMenuDirector {
  constructor({ game } = {}) { this.game = game || null; }

  install() {
    const actions = document.querySelector("#pause-overlay .pause-actions");
    if (!actions) return false;
    let button = document.getElementById("restart-game-button");
    if (!button) {
      button = document.createElement("button");
      button.id = "restart-game-button";
      button.type = "button";
      button.className = "pause-option zk-restart-option";
      button.innerHTML = "<span>↻</span><strong>RESTART MISSION</strong><small>Clear all mission objectives and reload</small>";
      actions.append(button);
    }
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      const label = button.querySelector("strong");
      const original = label?.textContent;
      if (label) label.textContent = "CLEARING…";
      try {
        const restarted = await restartMission({ game: this.game });
        if (!restarted) {
          button.disabled = false;
          if (label) label.textContent = original || "RESTART MISSION";
        }
      } catch (error) {
        button.disabled = false;
        if (label) label.textContent = original || "RESTART MISSION";
        this.game?.ui?.showToast?.("Restart unavailable", "The current save could not be confirmed. Your game remains paused and unchanged.", "warning");
        console.warn("ZekNova restart failed safely.", error);
      }
    });
    /* Restart Mission and Restart Game are different promises to the player.
       The mission restart clears objectives and keeps the colony standing;
       this one returns the whole world to a new game. It is listed second and
       described plainly, because it is the destructive one. */
    let full = document.getElementById("reset-world-button");
    if (!full) {
      full = document.createElement("button");
      full.id = "reset-world-button";
      full.type = "button";
      full.className = "pause-option zk-restart-option zk-reset-world-option";
      full.innerHTML = "<span>⟲</span><strong>RESTART GAME</strong>"
        + "<small>Reset all missions, bosses, resources and structures</small>";
      actions.append(full);
    }
    full.addEventListener("click", async () => {
      if (full.disabled) return;
      full.disabled = true;
      const label = full.querySelector("strong");
      const original = label?.textContent;
      if (label) label.textContent = "RESETTING…";
      try {
        const done = await restartGame({ game: this.game });
        if (!done) {                       // player cancelled at the confirm
          full.disabled = false;
          if (label) label.textContent = original || "RESTART GAME";
        }
      } catch (error) {
        full.disabled = false;
        if (label) label.textContent = original || "RESTART GAME";
        this.game?.ui?.showToast?.("Reset unavailable", "The world could not be reset. Your game remains paused and unchanged.", "warning");
        console.warn("ZekNova world reset failed safely.", error);
      }
    });

    globalThis.ZekNovaPauseMenu = Object.freeze({
      restart: () => restartGame({ game: this.game }),
      restartMission: () => restartMission({ game: this.game }),
      resetWorld: () => restartGame({ game: this.game }),
      clearObjectives: () => clearAllMissionObjectives(this.game),
    });
    return true;
  }
}

export default PauseMenuDirector;
