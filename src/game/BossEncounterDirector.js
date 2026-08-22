import { BIOMES, biomeAt } from "../world/Biomes.js";
import { missionBossConfig } from "./BossSystem.js";
import { bossReadiness, createCampaignTiers, objectiveComplete } from "./Missions.js";

export const BOSS_ENCOUNTER_STATES = Object.freeze({
  PREREQUISITES_COMPLETE: "PREREQUISITES_COMPLETE",
  BOSS_PENDING: "BOSS_PENDING",
  ROUTE_CANONICAL_ARENA: "ROUTE_CANONICAL_ARENA",
  STAGING: "STAGING",
  BOSS_ACTIVE: "BOSS_ACTIVE",
  DEFEATED: "DEFEATED",
  WAITING_FOR_PREREQUISITES: "WAITING_FOR_PREREQUISITES",
});

const MISSION_SEQUENCE = Object.freeze(createCampaignTiers().flatMap((tier) => tier.missions));

function positionOf(game) {
  return game?.player?.group?.position || game?.player?.position || null;
}

function missionComplete(mission, context) {
  return mission.subObjectives.length > 0 && mission.subObjectives.every((objective) => objectiveComplete(objective, context));
}

export function activeCampaignMission(context = {}) {
  return MISSION_SEQUENCE.find((mission) => !missionComplete(mission, context)) ?? null;
}

export function bossEncounterDecision(context = {}) {
  const mission = activeCampaignMission(context);
  if (!mission) return Object.freeze({ state: BOSS_ENCOUNTER_STATES.DEFEATED, mission: null, config: null, readiness: null, reason: "Campaign complete" });
  const readiness = bossReadiness(mission.id, context);
  const config = missionBossConfig(mission.id);
  if (!config) return Object.freeze({ state: BOSS_ENCOUNTER_STATES.WAITING_FOR_PREREQUISITES, mission, config: null, readiness, reason: "Active mission has no Guardian encounter" });
  if (readiness.defeated) return Object.freeze({ state: BOSS_ENCOUNTER_STATES.DEFEATED, mission, config, readiness, reason: "Guardian defeated" });
  if (!readiness.ready) {
    const labels = readiness.missing.map((item) => `${item.label} (${item.value}/${item.target})`);
    return Object.freeze({ state: BOSS_ENCOUNTER_STATES.WAITING_FOR_PREREQUISITES, mission, config, readiness, reason: labels.join("; ") || "Mission prerequisites incomplete" });
  }
  return Object.freeze({ state: BOSS_ENCOUNTER_STATES.PREREQUISITES_COMPLETE, mission, config, readiness, reason: "All non-boss objectives complete" });
}

/**
 * Converts the old frame-by-frame, replay-ledger boss scan into an explicit
 * campaign state machine. Only the active permanent mission is considered.
 */
export class BossEncounterDirector {
  constructor({ game, routeDelayMs = 900, retryDelayMs = 1500 } = {}) {
    this.game = game;
    this.routeDelayMs = routeDelayMs;
    this.retryDelayMs = retryDelayMs;
    this.state = BOSS_ENCOUNTER_STATES.WAITING_FOR_PREREQUISITES;
    this.reason = "Initializing";
    this.transitions = [];
    this.routeDueAt = 0;
    this.nextAttemptAt = 0;
    this.lastMissionId = null;
  }

  install() {
    const manager = this.game?.bossManager;
    if (!manager || typeof manager.startEncounter !== "function" || this.installed) return false;
    this.installed = true;
    this.originalConsiderStart = typeof manager.considerStart === "function" ? manager.considerStart.bind(manager) : null;
    // The legacy scanner picked the earliest replay-ready mission. The director
    // below owns automatic starts so there is exactly one readiness authority.
    manager.considerStart = () => false;
    this.timer = globalThis.setInterval?.(() => this.tick(), 200);
    this.mountDiagnostics();
    globalThis.ZekNovaBossEncounter = this;
    this.tick();
    return this;
  }

  transition(state, reason, detail = {}) {
    const changed = state !== this.state || reason !== this.reason;
    this.state = state;
    this.reason = reason;
    this.detail = detail;
    if (!changed) return;
    const row = Object.freeze({ state, reason, missionId: detail.missionId ?? null, at: Date.now() });
    this.transitions.push(row);
    if (this.transitions.length > 24) this.transitions.shift();
    if (this.game?.missionStats) this.game.missionStats.bossEncounterFlow = { state, reason, missionId: row.missionId, updatedAt: row.at };
    globalThis.dispatchEvent?.(new CustomEvent("zeknova:boss-encounter-state", { detail: row }));
  }

  tick() {
    if (!this.installed || this.game?.disposed) return;
    const params = new URLSearchParams(globalThis.location?.search || "");
    if (params.has("qaBoss") || params.has("qaNoBoss") || this.game?.qaGameplayState?.kind === "boss") return;
    const manager = this.game.bossManager;
    if (manager?.active) {
      this.transition(BOSS_ENCOUNTER_STATES.BOSS_ACTIVE, `${manager.config?.name || "Guardian"} encounter active`, { missionId: manager.config?.missionId, bossId: manager.config?.id, biome: manager.config?.biome });
      return;
    }

    const context = this.game.getMissionContext?.();
    if (!context) {
      this.transition(BOSS_ENCOUNTER_STATES.WAITING_FOR_PREREQUISITES, "Mission context unavailable");
      return;
    }
    const decision = bossEncounterDecision(context);
    const missionId = decision.mission?.id ?? null;
    if (decision.state !== BOSS_ENCOUNTER_STATES.PREREQUISITES_COMPLETE) {
      this.routeDueAt = 0;
      this.lastMissionId = missionId;
      this.transition(decision.state, decision.reason, { missionId, missing: decision.readiness?.missing ?? [] });
      return;
    }

    const config = decision.config;
    const player = positionOf(this.game);
    if (!player || !config) return;
    if (this.lastMissionId !== missionId) {
      this.lastMissionId = missionId;
      this.routeDueAt = 0;
      this.transition(BOSS_ENCOUNTER_STATES.PREREQUISITES_COMPLETE, "All mission conditions verified", { missionId, bossId: config.id, biome: config.biome });
      this.game.ui?.showToast?.("BOSS CONDITIONS COMPLETE", `${config.name} is being staged in the ${config.biome.toUpperCase()} AO.`, "warning");
      return;
    }
    if (this.state === BOSS_ENCOUNTER_STATES.PREREQUISITES_COMPLETE) {
      this.transition(BOSS_ENCOUNTER_STATES.BOSS_PENDING, `${config.name} queued for canonical arena staging`, { missionId, bossId: config.id, biome: config.biome });
      return;
    }

    if (this.game.paused) {
      this.transition(BOSS_ENCOUNTER_STATES.BOSS_PENDING, `Ready; waiting for gameplay to resume`, { missionId, bossId: config.id, biome: config.biome });
      return;
    }

    const currentBiome = biomeAt(Number(player.x)).id;
    if (currentBiome !== config.biome) {
      if (!this.routeDueAt) this.routeDueAt = Date.now() + this.routeDelayMs;
      this.transition(BOSS_ENCOUNTER_STATES.ROUTE_CANONICAL_ARENA, `Routing from ${currentBiome.toUpperCase()} AO to ${config.biome.toUpperCase()} AO`, { missionId, bossId: config.id, biome: config.biome, currentBiome, routeDueAt: this.routeDueAt });
      if (Date.now() >= this.routeDueAt) this.routeToCanonicalArena(config);
      return;
    }

    this.routeDueAt = 0;
    if (this.state !== BOSS_ENCOUNTER_STATES.STAGING) {
      this.transition(BOSS_ENCOUNTER_STATES.STAGING, `Canonical ${config.biome.toUpperCase()} arena verified`, { missionId, bossId: config.id, biome: config.biome });
      return;
    }
    if (Date.now() < this.nextAttemptAt) return;
    this.nextAttemptAt = Date.now() + this.retryDelayMs;
    const started = manager.startEncounter({ missionId, automatic: true, canonicalArena: true });
    if (started && manager.active) {
      this.transition(BOSS_ENCOUNTER_STATES.BOSS_ACTIVE, `${config.name} encounter active`, { missionId, bossId: config.id, biome: config.biome });
    } else {
      this.transition(BOSS_ENCOUNTER_STATES.BOSS_PENDING, `Start rejected; retrying in ${this.retryDelayMs}ms`, { missionId, bossId: config.id, biome: config.biome });
    }
  }

  routeToCanonicalArena(config) {
    const biome = BIOMES.find((item) => item.id === config.biome);
    const player = positionOf(this.game);
    if (!biome || !player || !this.game.terrain?.findSafeSpawn) return false;
    const safe = this.game.terrain.findSafeSpawn(biome.center.x, biome.center.z + Math.min(8, biome.radius * .45));
    player.copy?.(safe) ?? Object.assign(player, safe);
    this.game.currentAO = biome;
    this.game.alignExploreCameraToPlayer?.();
    this.game.updateHud?.(true);
    this.game.ui?.showToast?.(`${biome.name} · GUARDIAN STAGING`, `${config.name} encounter routing complete.`, "warning");
    this.routeDueAt = 0;
    return true;
  }

  routeNow() {
    const decision = bossEncounterDecision(this.game?.getMissionContext?.() || {});
    return decision.config ? this.routeToCanonicalArena(decision.config) : false;
  }

  mountDiagnostics() {
    if (typeof document === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    const node = document.getElementById("zeknova-boss-encounter-qa") || document.body.appendChild(document.createElement("span"));
    node.id = "zeknova-boss-encounter-qa";
    node.setAttribute("aria-hidden", "true");
    node.style.cssText = "position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1";
    this.qaTimer = setInterval(() => { node.textContent = JSON.stringify(this.report()); }, 250);
  }

  report() {
    const manager = this.game?.bossManager;
    return Object.freeze({
      state: this.state,
      reason: this.reason,
      ...this.detail,
      active: Boolean(manager?.active),
      activeMissionId: manager?.config?.missionId ?? null,
      activeBossId: manager?.config?.id ?? null,
      transitions: Object.freeze([...this.transitions]),
      automatic: true,
      canonicalArenaOnly: true,
      hiddenConditions: false,
    });
  }

  dispose() {
    this.installed = false;
    clearInterval(this.timer);
    clearInterval(this.qaTimer);
    if (this.originalConsiderStart && this.game?.bossManager) this.game.bossManager.considerStart = this.originalConsiderStart;
    if (globalThis.ZekNovaBossEncounter === this) delete globalThis.ZekNovaBossEncounter;
  }
}

export default BossEncounterDirector;
