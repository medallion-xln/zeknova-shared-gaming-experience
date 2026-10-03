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
 * Previously this called game.save() AFTER api/reset.php but BEFORE clearing
 * the in-memory world, so the still-dirty runtime was written straight back
 * over the fresh save the server had just created; the old colony reappeared
 * on reload. It also never cleared boss run state, so a "new game" began with
 * bosses already defeated.
 *
 * GameReset.js now owns the ordering: runtime first, then the server, then
 * reload — and no save() call in between. The archive-to-leaderboard behaviour
 * is unchanged, because api/reset.php still does it.
 */
export async function restartGame(options = {}) {
  const result = await resetGameToInitialState(options);
  return result === false ? false : true;
}

/**
 * Guardian encounter mode toggle.
 *
 * The two runtime bundles disagreed about who picks the next Guardian — a
 * per-run replay ledger, or campaign progression — and each silently overrode
 * the other on deploy. Rather than pick one for the player, the choice lives
 * here. CAMPAIGN stays the default so nothing changes unless it is opted into.
 *
 * Built with real controls (a <button> with aria-pressed) rather than a styled
 * div, so it is keyboard reachable and announced correctly. State is carried by
 * text as well as colour.
 */
export function buildBossModeToggle({ bossMode = globalThis.ZekNovaBossMode, doc = globalThis.document } = {}) {
  if (!bossMode || !doc) return null;

  const MODE = bossMode.MODE || { CAMPAIGN: "campaign", REPLAY_RUN: "replay-run" };
  const wrap = doc.createElement("div");
  wrap.id = "zk-boss-mode";
  wrap.className = "pause-option zk-boss-mode";

  const title = doc.createElement("strong");
  title.textContent = "GUARDIAN ENCOUNTERS";
  const hint = doc.createElement("small");

  const button = doc.createElement("button");
  button.type = "button";
  button.id = "zk-boss-mode-toggle";
  button.className = "zk-boss-mode-btn";

  const render = () => {
    const replay = bossMode.isReplayRun?.() === true;
    button.setAttribute("aria-pressed", String(replay));
    // The mode is stated in words — never signalled by colour alone.
    button.textContent = replay ? "Replay run · refight 1–12 in order" : "Campaign · follow story progression";
    hint.textContent = replay
      ? "Every Guardian can be refought in order this run. Beaten bosses are skipped until you restart the run."
      : "The next Guardian follows your campaign progress. Replay bosses stay a debug action.";
  };

  button.addEventListener("click", () => {
    const now = bossMode.getBossMode?.();
    const next = now === MODE.REPLAY_RUN ? MODE.CAMPAIGN : MODE.REPLAY_RUN;
    bossMode.setBossMode?.(next);
    // Switching INTO replay starts a clean run, otherwise the first session's
    // defeats would silently suppress bosses the player just asked to refight.
    if (next === MODE.REPLAY_RUN) {
      bossMode.resetRun?.(globalThis.ZekNovaGame?.user?.teamCode);
    }
    render();
  });

  const reset = doc.createElement("button");
  reset.type = "button";
  reset.id = "zk-boss-run-reset";
  reset.className = "zk-boss-mode-reset";
  reset.textContent = "Reset this run";
  reset.addEventListener("click", () => {
    bossMode.resetRun?.(globalThis.ZekNovaGame?.user?.teamCode);
    reset.textContent = "Run reset ✓";
    globalThis.setTimeout(() => { reset.textContent = "Reset this run"; }, 1800);
  });

  wrap.append(title, button, hint, reset);
  render();
  return wrap;
}

/**
 * Score control — mute and volume for the background music.
 *
 * A real <input type="range"> and a <button aria-pressed>, not styled divs, so
 * both are keyboard reachable and announced. Sits with the Guardian toggle
 * above Restart: settings first, destructive actions last.
 *
 * Returns null when no score is running, so a build without the audio assets
 * simply shows no control rather than a dead slider.
 */
export function buildMusicControl({ music = globalThis.ZekNovaMusic, doc = globalThis.document } = {}) {
  if (!music || !doc) return null;

  const wrap = doc.createElement("div");
  wrap.id = "zk-music";
  wrap.className = "pause-option zk-music";

  const title = doc.createElement("strong");
  title.textContent = "SCORE";
  const now = doc.createElement("small");

  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.id = "zk-music-toggle";
  toggle.className = "zk-music-btn";

  const slider = doc.createElement("input");
  slider.type = "range";
  slider.id = "zk-music-volume";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.className = "zk-music-volume";
  slider.setAttribute("aria-label", "Music volume");

  const render = () => {
    const snap = music.snapshot?.() ?? {};
    const muted = snap.muted === true;
    toggle.setAttribute("aria-pressed", String(muted));
    // State is carried by words, never by colour alone.
    toggle.textContent = muted ? "Muted" : "Playing";
    slider.value = String(Math.round((Number(snap.volume ?? 1)) * 100));
    slider.disabled = muted;
    now.textContent = muted
      ? "The score is muted. Combat and interface sounds are unaffected."
      : snap.title
        ? `Now playing: ${snap.title}`
        : "The score starts when you enter the world.";
  };

  toggle.addEventListener("click", () => {
    music.setMuted?.(!(music.snapshot?.().muted === true));
    render();
  });
  slider.addEventListener("input", () => {
    music.setVolume?.(Number(slider.value) / 100);
    render();
  });

  wrap.append(title, toggle, slider, now);
  render();
  // The track changes with the game, so refresh the label while the menu is open.
  const timer = globalThis.setInterval?.(render, 1000);
  wrap.addEventListener("zk-dispose", () => globalThis.clearInterval?.(timer));
  return wrap;
}

export class PauseMenuDirector {
  constructor({ game } = {}) { this.game = game || null; }

  install() {
    const actions = document.querySelector("#pause-overlay .pause-actions");
    if (!actions) return false;

    // Guardian mode sits above Restart — a setting, not a destructive action.
    if (!document.getElementById("zk-boss-mode")) {
      const toggle = buildBossModeToggle();
      if (toggle) actions.prepend(toggle);
    }

    if (!document.getElementById("zk-music")) {
      const music = buildMusicControl();
      if (music) actions.prepend(music);
    }
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
