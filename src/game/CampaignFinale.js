/**
 * ZekNova — campaign finale
 * Location: src/game/CampaignFinale.js
 *
 * The twelfth Guardian falls and the last project goes up in the last biome,
 * and until now the whole campaign ended in a toast that faded after a few
 * seconds: "Outpost campaign complete". This is the ending that moment earns —
 * the planet is prepared, and the game should say so and stop.
 *
 * DETECTION IS SOURCE-SIDE. Completion is derived here from the same
 * MISSION_OBJECTIVES and objectiveComplete() the HUD uses, polled off the live
 * game, so no hook in the compatibility bundle is needed — and therefore no
 * re-attestation of a governed artifact for a celebration screen.
 *
 * SHOWN ONCE PER RUN. Keyed by the run's gameId, so finishing again after a
 * reset is a new ending rather than a screen the player has already dismissed.
 * A missing gameId falls back to showing it once per session, which is the
 * safer error: an ending shown twice is a nuisance, an ending never shown is
 * the whole point missed.
 */

import { MISSION_OBJECTIVES, createCampaignTiers, objectiveComplete } from "./Missions.js";
import { PROJECT_LADDER, BIOMES } from "./CampaignPlan.js";

export const FINALE_STORAGE_KEY = "zeknova.finale.v1";
/** Poll interval. The ending is not time-critical; a second is imperceptible. */
export const FINALE_POLL_MS = 1000;

/** Is every objective of every mission satisfied? */
export function campaignComplete(context) {
  if (!context) return false;
  for (const plan of PROJECT_LADDER) {
    const rows = MISSION_OBJECTIVES[plan.mission] ?? [];
    if (rows.length === 0) return false;
    for (const objective of rows) {
      if (!objectiveComplete(objective, context)) return false;
    }
  }
  return true;
}

/** A count of what the player actually built, for the summary. */
export function finaleSummary(game) {
  const records = game?.buildings?.records ?? [];
  const standing = records.filter((r) => r && Number(r.health ?? 1) > 0);
  const byType = new Map();
  for (const record of standing) {
    byType.set(record.type, (byType.get(record.type) ?? 0) + 1);
  }
  const projects = PROJECT_LADDER.filter((p) => (byType.get(p.type) ?? 0) >= BIOMES.length).length;

  return {
    projects,
    totalProjects: PROJECT_LADDER.length,
    structures: standing.length,
    guardians: Object.keys(game?.missionStats?.bossDefeats ?? {}).length,
    biomes: BIOMES.length,
    rank: String(game?.user?.officerClass ?? "ensign"),
  };
}

function readSeen(storage) {
  try { return JSON.parse(storage?.getItem?.(FINALE_STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function markSeen(storage, runId) {
  try {
    const seen = readSeen(storage);
    if (!seen.includes(runId)) {
      seen.push(runId);
      // Keep the list short; only the current run matters.
      storage?.setItem?.(FINALE_STORAGE_KEY, JSON.stringify(seen.slice(-8)));
    }
  } catch { /* storage blocked; the session guard still applies */ }
}

export class CampaignFinale {
  constructor({ game = null, doc = globalThis.document, storage = globalThis.localStorage, windowRef = globalThis } = {}) {
    this.game = game;
    this.doc = doc;
    this.window = windowRef;
    this.storage = storage;
    this.timer = null;
    this.shown = false;
    this.node = null;
  }

  runId() {
    const game = this.game ?? globalThis.ZekNovaGame;
    return String(game?.gameId ?? game?.runId ?? game?.user?.teamCode ?? "session");
  }

  alreadySeen() {
    return this.shown || readSeen(this.storage).includes(this.runId());
  }

  install() {
    if (!this.doc || this.timer !== null) return false;
    this.timer = this.window?.setInterval?.(() => this.check(), FINALE_POLL_MS) ?? null;
    return this.timer !== null;
  }

  check() {
    if (this.alreadySeen()) return false;
    const game = this.game ?? globalThis.ZekNovaGame;
    if (!game) return false;

    let context;
    try { context = game.getMissionContext?.(); } catch { return false; }
    if (!context || !campaignComplete(context)) return false;

    this.show(finaleSummary(game));
    return true;
  }

  /** Renders the ending. Text is built with textContent — no innerHTML. */
  show(summary) {
    if (this.shown || !this.doc?.createElement) return false;
    this.shown = true;
    markSeen(this.storage, this.runId());

    const reduced = Boolean(this.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

    const overlay = this.doc.createElement("div");
    overlay.className = "zk-finale";
    if (reduced) overlay.dataset.reducedMotion = "1";
    /* A dialog, not decoration: it takes focus and traps the reader's
       attention deliberately, so it must announce itself as one. */
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "zk-finale-title");

    const panel = this.doc.createElement("div");
    panel.className = "zk-finale-panel";

    const kicker = this.doc.createElement("p");
    kicker.className = "zk-finale-kicker";
    kicker.textContent = "PLANETARY PREPARATION COMPLETE";

    const title = this.doc.createElement("h1");
    title.className = "zk-finale-title";
    title.id = "zk-finale-title";
    title.textContent = "ZekNova is ready for humans.";

    const lede = this.doc.createElement("p");
    lede.className = "zk-finale-lede";
    lede.textContent =
      "Light, water, shelter, medicine, learning and trade now reach every "
      + "region of the planet. The Guardians are answered. The colony ships "
      + "can be called.";

    const stats = this.doc.createElement("dl");
    stats.className = "zk-finale-stats";
    const rows = [
      ["Planetary projects", `${summary.projects} of ${summary.totalProjects}`],
      ["Biomes prepared", String(summary.biomes)],
      ["Structures standing", String(summary.structures)],
      ["Guardians answered", String(summary.guardians)],
      ["Final rank", summary.rank.toUpperCase()],
    ];
    for (const [term, value] of rows) {
      const dt = this.doc.createElement("dt");
      dt.textContent = term;
      const dd = this.doc.createElement("dd");
      dd.textContent = value;
      stats.append(dt, dd);
    }

    const coda = this.doc.createElement("p");
    coda.className = "zk-finale-coda";
    coda.textContent =
      "The ZekNovans kept their watch, and you built beside them rather than "
      + "over them. That is why there is a planet worth arriving on.";

    const close = this.doc.createElement("button");
    close.type = "button";
    close.className = "zk-finale-close";
    close.textContent = "Return to ZekNova";
    close.addEventListener("click", () => this.dismiss());

    panel.append(kicker, title, lede, stats, coda, close);
    overlay.append(panel);
    this.doc.body?.append(overlay);
    this.node = overlay;

    /* Escape closes it, and focus moves to the button so a keyboard reader is
       not stranded behind the overlay. */
    this.onKey = (event) => { if (event.key === "Escape") this.dismiss(); };
    this.doc.addEventListener("keydown", this.onKey);
    try { close.focus(); } catch { /* not focusable in a stub DOM */ }

    return true;
  }

  dismiss() {
    if (this.onKey) { this.doc?.removeEventListener?.("keydown", this.onKey); this.onKey = null; }
    try { this.node?.remove?.(); } catch { /* ignore */ }
    this.node = null;
    if (this.timer !== null) { this.window?.clearInterval?.(this.timer); this.timer = null; }
    return true;
  }

  snapshot() {
    return Object.freeze({ shown: this.shown, visible: Boolean(this.node), runId: this.runId() });
  }

  dispose() { this.dismiss(); }
}

export default CampaignFinale;
