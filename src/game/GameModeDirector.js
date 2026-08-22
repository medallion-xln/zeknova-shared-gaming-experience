import { GAME_MODES, getModeCapabilities, isCivilianMode, isScriptedConfrontationActor, normalizeGameMode, simulationTier } from "./GameMode.js";

function initialMode() {
  const query = new URLSearchParams(location.search);
  return normalizeGameMode(query.get("gameMode") || query.get("mode") || sessionStorage.getItem("zeknova.gameMode"));
}

function objectPosition(value) { return value?.position || value?.group?.position || null; }

export class GameModeDirector {
  constructor({ game }) {
    this.game = game;
    this.mode = initialMode();
    this.lastState = null;
    this.activityNodes = new Map();
  }

  install() {
    if (!this.game || this.installed) return false;
    this.installed = true;
    this.installAmbientSpawnGate();
    this.installBossInitiationGate();
    this.mountModeBadge();
    this.mountCivilianHud();
    this.mountModePanel();
    this.setMode(this.mode, { announce: false });
    this.timer = window.setInterval(() => this.refresh(), 750);
    globalThis.ZekNovaGameMode = this;
    window.dispatchEvent(new CustomEvent("zeknova:game-mode-ready", { detail: { mode: this.mode } }));
    return true;
  }

  installAmbientSpawnGate() {
    if (typeof this.game.processEnemySpawning !== "function") return;
    this.originalProcessEnemySpawning = this.game.processEnemySpawning.bind(this.game);
    this.game.processEnemySpawning = (delta) => {
      if (!getModeCapabilities(this.mode).ambientEnemySpawning) return;
      return this.originalProcessEnemySpawning(delta);
    };
  }

  installBossInitiationGate() {
    const manager = this.game.bossManager;
    if (!manager || typeof manager.startEncounter !== "function") return;
    this.originalStartEncounter = manager.startEncounter.bind(manager);
    manager.startEncounter = (context = {}) => {
      if (isCivilianMode(this.mode)) {
        // Mission readiness is the encounter authority. Civilian Mode changes the
        // presentation and ambient simulation, but must never become a hidden
        // progression gate once all canonical objectives are complete.
        this.setMode(GAME_MODES.BATTLE, { announce: false });
        this.game.ui?.showToast?.("Guardian encounter detected", "All mission conditions are complete. Battle Mode engaged automatically.", "warning");
      }
      return this.originalStartEncounter(context);
    };
  }

  mountModeBadge() {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "zk-game-mode-badge";
    badge.addEventListener("click", () => this.openModePanel());
    document.getElementById("game-shell")?.append(badge);
    this.badge = badge;
  }

  mountCivilianHud() {
    const panel = document.createElement("section");
    panel.className = "zk-civilian-hud glass-panel";
    panel.innerHTML = `<header><span>SETTLEMENT OPERATIONS</span><b data-settlement>STABLE</b></header><div class="zk-civilian-grid"><article><small>POPULATION</small><strong data-population>0</strong><span data-activity>CALM</span></article><article><small>UTILITY COVERAGE</small><strong data-utility>0%</strong><span data-utility-note>NO NETWORK</span></article><article><small>CURRENT BUILD</small><strong data-build>NONE</strong><span>PRESS TAB</span></article><article><small>RESEARCH</small><strong data-research>0</strong><span>FACILITIES</span></article><article><small>TRADE</small><strong data-trade>0</strong><span>ROUTES</span></article><article><small>DIPLOMACY</small><strong data-diplomacy>PENDING</strong><span data-tension>50 TENSION</span></article></div><button type="button" class="zk-guardian-staging hidden" data-guardian>GUARDIAN STAGING · CONDITIONS INCOMPLETE</button><footer><span data-local-activity>LOCAL ACTIVITY · OBSERVING</span><button type="button" data-map>OPEN MAP</button></footer>`;
    panel.querySelector("[data-map]").addEventListener("click", () => globalThis.ZekNovaMissionClarity?.openWorldMap?.());
    panel.querySelector("[data-guardian]").addEventListener("click", () => this.initiateGuardian());
    document.getElementById("game-shell")?.append(panel);
    this.civilianHud = panel;
  }

  mountModePanel() {
    const overlay = document.getElementById("pause-overlay");
    if (!overlay) return;
    const panel = document.createElement("section");
    panel.className = "zk-game-mode-panel";
    panel.innerHTML = `<header><small>EXPERIENCE PROFILE</small><h2>Choose how ZekNova reads</h2><p>The world, campaign, resources, buildings, and save remain shared.</p></header><div><button type="button" data-mode="civilian"><b>CIVILIAN MODE</b><span>Explore · build · connect · trade · research · support settlements</span></button><button type="button" data-mode="battle"><b>BATTLE MODE</b><span>Detect threats · maneuver · fight · survive · defeat guardians</span></button></div><footer><span>Mode changes never create or reset a save.</span><button type="button" data-close>CLOSE</button></footer>`;
    panel.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => this.setMode(button.dataset.mode)));
    panel.querySelector("[data-close]").addEventListener("click", () => panel.classList.remove("open"));
    overlay.append(panel);
    this.modePanel = panel;
  }

  openModePanel() {
    if (!document.documentElement.classList.contains("zk-paused")) this.game.togglePause?.();
    this.modePanel?.classList.add("open");
  }

  setMode(value, { announce = true } = {}) {
    const next = normalizeGameMode(value);
    if (next === GAME_MODES.CIVILIAN && this.game?.bossManager?.active) {
      this.game.ui?.showToast?.("Mode change blocked", "Finish or leave the active Guardian encounter before entering Civilian Mode.", "warning");
      return false;
    }
    const previous = this.mode;
    this.mode = next;
    this.game.gameMode = next;
    sessionStorage.setItem("zeknova.gameMode", next);
    const html = document.documentElement;
    html.dataset.gameMode = next;
    html.classList.toggle("zk-civilian-mode", isCivilianMode(next));
    html.classList.toggle("zk-battle-mode", !isCivilianMode(next));
    this.badge.textContent = isCivilianMode(next) ? "CIVILIAN MODE · SETTLEMENT" : "BATTLE MODE · TACTICAL";
    this.modePanel?.querySelectorAll("[data-mode]").forEach((button) => button.dataset.active = String(button.dataset.mode === next));
    this.applyThreatPolicy();
    this.clearModeArtifacts(previous, next);
    globalThis.ZekNovaMissionClarity?.setGameMode?.(next);
    window.dispatchEvent(new CustomEvent("zeknova:game-mode-changed", { detail: { previous, mode: next, capabilities: getModeCapabilities(next) } }));
    if (announce && previous !== next) this.game.ui?.showToast?.(isCivilianMode(next) ? "Civilian Mode active" : "Battle Mode active", isCivilianMode(next) ? "Ambient aggression suppressed. Settlement operations and community activity prioritized." : "Tactical systems restored. Ambient patrol pressure and combat navigation active.", "success");
    return true;
  }

  applyThreatPolicy() {
    for (const actor of this.game.enemies || []) {
      if (isScriptedConfrontationActor(actor)) continue;
      if (isCivilianMode(this.mode)) {
        if (actor.userData.zkBattleHostile === undefined) actor.userData.zkBattleHostile = Boolean(actor.userData.hostile);
        actor.userData.hostile = false;
        actor.userData.zkCivilianActivity = actor.userData.activityLabel || this.activityFor(actor.userData.enemyType);
      } else if (actor.userData.zkBattleHostile !== undefined) {
        actor.userData.hostile = actor.userData.zkBattleHostile;
        delete actor.userData.zkCivilianActivity;
      }
    }
  }

  clearModeArtifacts(previous, next) {
    if (!isCivilianMode(next) || previous === next) return;
    for (const projectile of this.game.enemyProjectiles || []) {
      const mesh = projectile?.mesh || projectile;
      if (mesh?.parent) mesh.parent.remove(mesh);
    }
    this.game.enemyProjectiles = [];
    this.game.ui?.setInteraction?.(null);
  }

  activityFor(role) {
    return ({ stalker: "INSPECTING", saboteur: "REPAIRING", spitter: "TRADING", skyray: "DELIVERING", burrower: "GATHERING", juggernaut: "ROUTE WATCH" })[role] || "SOCIALIZING";
  }

  refresh() {
    this.lastState = this.game.ui?.lastState || this.lastState;
    this.applyThreatPolicy();
    this.updateSimulationTiers();
    if (isCivilianMode(this.mode)) {
      this.paintCivilianHud();
      this.paintActivityLabels();
    } else this.clearActivityLabels();
  }

  updateSimulationTiers() {
    const player = objectPosition(this.game.player);
    if (!player) return;
    for (const actor of this.game.enemies || []) {
      const position = objectPosition(actor);
      if (!position) continue;
      actor.userData.zkSimulationTier = simulationTier(Math.hypot(position.x - player.x, position.z - player.z), this.mode);
    }
  }

  paintCivilianHud() {
    const panel = this.civilianHud, state = this.lastState || {}, counts = this.game.buildings?.countByType?.() || {};
    if (!panel) return;
    const records = this.game.buildings?.records || [];
    const operational = records.filter((record) => Number(record.health ?? 1000) > 0).length;
    const utilitySources = Number(counts.power || 0) + Number(counts.water || 0) + Number(counts.communications || 0);
    const utilityCoverage = records.length ? Math.min(100, Math.round((utilitySources / Math.max(3, records.length)) * 100)) : 0;
    const population = Math.round(Number(state.indicators?.habitability || state.score || 0));
    const set = (selector, value) => { const node = panel.querySelector(selector); if (node) node.textContent = value; };
    set("[data-settlement]", operational === records.length ? "STABLE" : `${records.length - operational} OFFLINE`);
    set("[data-population]", String(population));
    set("[data-activity]", `${Math.min(99, (this.game.enemies || []).filter((actor) => !actor.userData.hostile).length)} ACTIVE`);
    set("[data-utility]", `${utilityCoverage}%`);
    set("[data-utility-note]", `${utilitySources} UTILITY NODES`);
    set("[data-build]", this.game.buildings?.selectedType ? String(this.game.buildings.selectedType).replaceAll("_", " ").toUpperCase() : "NONE");
    set("[data-research]", String(Number(counts.university || 0)));
    set("[data-trade]", String(Number(counts.commerce || 0) + Number(counts.transit || 0) + Number(counts.zek_market || 0)));
    set("[data-diplomacy]", String(this.game.diplomacyOutcome || "PENDING").toUpperCase());
    set("[data-tension]", `${Math.round(Number(this.game.diplomacyTension ?? 50))} TENSION`);
    const activities = [...new Set((this.game.enemies || []).filter((actor) => !actor.userData.hostile).map((actor) => actor.userData.zkCivilianActivity).filter(Boolean))].slice(0, 3);
    set("[data-local-activity]", `LOCAL ACTIVITY · ${activities.join(" · ") || "OBSERVING"}`);
    this.paintGuardianStaging();
  }

  guardianReadiness() {
    const objectives = [...document.querySelectorAll("#sub-objective-list li")];
    const guardian = objectives.find((node) => /boss|guardian|encounter|demon knight|siren|colossus|stormback|screecher|tremor|cantor|gunner/i.test(node.textContent));
    const nonGuardian = objectives.filter((node) => node !== guardian);
    return { guardian: Boolean(guardian), ready: Boolean(guardian) && nonGuardian.length > 0 && nonGuardian.every((node) => node.classList.contains("complete")) };
  }

  paintGuardianStaging() {
    const button = this.civilianHud?.querySelector("[data-guardian]");
    if (!button) return;
    const state = this.guardianReadiness();
    button.classList.toggle("hidden", !state.guardian);
    button.disabled = !state.ready;
    button.textContent = state.ready ? "BOSS CONDITIONS COMPLETE · ROUTING AUTOMATICALLY" : "GUARDIAN STAGING · COMPLETE CIVILIAN CONDITIONS";
  }

  initiateGuardian() {
    const readiness = this.guardianReadiness();
    if (!readiness.ready) return;
    globalThis.ZekNovaBossEncounter?.routeNow?.();
    this.game.ui?.showToast?.("Guardian routing active", "The automatic encounter controller is staging the active mission Guardian.", "info");
  }

  paintActivityLabels() {
    const player = objectPosition(this.game.player), camera = this.game.camera;
    if (!player || !camera) return;
    const visible = new Set();
    const candidates = (this.game.enemies || []).filter((actor) => !actor.userData.hostile && objectPosition(actor)).sort((a, b) => objectPosition(a).distanceTo?.(player) - objectPosition(b).distanceTo?.(player)).slice(0, 5);
    for (const actor of candidates) {
      const position = objectPosition(actor);
      const distance = Math.hypot(position.x - player.x, position.z - player.z);
      if (distance > 35 || typeof position.clone !== "function") continue;
      const point = position.clone(); point.y += 3.8; point.project(camera);
      if (point.z < -1 || point.z > 1) continue;
      const id = actor.uuid || actor.id;
      visible.add(id);
      let node = this.activityNodes.get(id);
      if (!node) { node = document.createElement("span"); node.className = "zk-civilian-activity-label"; document.getElementById("game-shell")?.append(node); this.activityNodes.set(id, node); }
      node.textContent = actor.userData.zkCivilianActivity || "WORKING";
      node.style.left = `${(point.x * .5 + .5) * 100}%`; node.style.top = `${(-point.y * .5 + .5) * 100}%`; node.hidden = false;
    }
    for (const [id, node] of this.activityNodes) if (!visible.has(id)) node.hidden = true;
  }

  clearActivityLabels() { for (const node of this.activityNodes.values()) node.hidden = true; }

  snapshot() {
    return Object.freeze({ mode: this.mode, capabilities: getModeCapabilities(this.mode), saveNamespaceChanged: false, ambientSpawnSuppressed: isCivilianMode(this.mode), scriptedConfrontationsPreserved: true });
  }
}
