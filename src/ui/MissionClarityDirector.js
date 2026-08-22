import { BIOMES, biomeAt } from "../world/Biomes.js";
import { HUMAN_BUILDINGS } from "../game/Buildings.js";
import { BOSS_CONFIGS } from "../game/BossSystem.js";
import { markerAllowed, normalizeGameMode, orderObjectivesForMode } from "../game/GameMode.js";

const WORLD_HALF = 90;
const SECTIONS = ["Exploration", "Resources", "Construction", "Diplomacy", "Commissioning", "Guardian Encounter"];
const BIOME_PATTERN = new RegExp(BIOMES.map((biome) => biome.id).join("|"), "i");
const BUILD_ICONS = Object.freeze({ capitol: "⚖", hospital: "✚", university: "◈", transit: "∩", commerce: "◇", planetary_capitol: "♜", war_economy: "⚔", defense_contractor: "◆", corporate_hq: "▰", stock_exchange: "▲" });
const RANK_VALUE = Object.freeze({ ensign: 1, lieutenant: 2, captain: 3 });

export function classifyObjective(label = "") {
  const text = label.toLowerCase();
  if (/boss|guardian|defeat|arena|encounter/.test(text)) return "Guardian Encounter";
  if (/collect|harvest|recover|mine|gather/.test(text)) return "Resources";
  if (/build|construct|place|grid|works|hub|habitat|tower|capitol|hospital|clinic|grove/.test(text)) return "Construction";
  if (/commission|intercept|attacker|activate|test the/.test(text)) return "Commissioning";
  if (/diplom|negot|trust|tension|aid|treaty|ceasefire|zeknovan/.test(text)) return "Diplomacy";
  if (/resource|timber|biomass|mineral|iron|water|data/.test(text)) return "Resources";
  return "Exploration";
}

export function projectWorldPoint(x, z) {
  return {
    x: Math.max(0, Math.min(100, ((Number(x) + WORLD_HALF) / (WORLD_HALF * 2)) * 100)),
    y: Math.max(0, Math.min(100, ((Number(z) + WORLD_HALF) / (WORLD_HALF * 2)) * 100)),
  };
}

export function rankAllowsBuilding(rank, building) {
  return Boolean(building && building.tier <= (RANK_VALUE[String(rank).toLowerCase()] || 1));
}

export function buildingRecognitionSummary(game, type, biomeId) {
  const records = (game?.buildings?.records || []).filter((record) => record?.type === type && Number(record.health ?? 1000) > 0);
  const valid = records.filter((record) => biomeAt(Number(record.x)).id === biomeId);
  const misplaced = records.filter((record) => biomeAt(Number(record.x)).id !== biomeId);
  return Object.freeze({
    total: records.length,
    valid: valid.length,
    misplaced: misplaced.length,
    misplacedBiomes: Object.freeze([...new Set(misplaced.map((record) => biomeAt(Number(record.x)).name))]),
  });
}

function positionOf(value) {
  const source = value?.position || value;
  if (!source || !Number.isFinite(Number(source.x)) || !Number.isFinite(Number(source.z))) return null;
  return { x: Number(source.x), z: Number(source.z) };
}

function playerPosition(game) {
  return positionOf(game?.player?.group) || positionOf(game?.player) || { x: 0, z: 0 };
}

function cleanLabel(node) {
  const explicit = String(node.querySelector("b, [data-objective-label]")?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (explicit) return explicit;
  const clone = node.cloneNode(true);
  clone.querySelectorAll("small, i").forEach((child) => child.remove());
  return String(clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function readCounter(node) {
  const match = node.textContent.match(/(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/);
  return match ? `${match[1]} / ${match[2]}` : node.classList.contains("complete") ? "COMPLETE" : "ACTIVE";
}

export class MissionClarityDirector {
  constructor({ game }) {
    this.game = game;
    this.gameMode = normalizeGameMode(game?.gameMode);
    this.objectives = [];
    this.guide = null;
    this.lastSignature = "";
    this.mapSignatures = new WeakMap();
    this.lastConstructionSignature = "";
  }

  install() {
    const shell = document.getElementById("game-shell");
    const source = document.getElementById("sub-objective-list");
    if (!shell || !source) return false;
    this.shell = shell;
    this.source = source;
    document.documentElement.classList.add("zk-clarity");
    this.mountMissionCard();
    this.mountMaps();
    this.mountWaypoint();
    this.mountConstructionStatus();
    this.setupRankBuildouts();
    this.observer = new MutationObserver(() => this.refreshObjectives());
    this.observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true });
    window.addEventListener("zeknova:hud-tab", (event) => {
      if (event.detail?.id === "map") this.paintMap(this.worldMap);
      if (event.detail?.id === "missions") this.paintMissionArchive();
    });
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "m" && !event.repeat && !/input|textarea|select/i.test(event.target?.tagName || "")) this.openWorldMap();
    });
    this.refreshObjectives();
    this.timer = window.setInterval(() => this.tick(), 350);
    globalThis.ZekNovaMissionClarity = this;
    return true;
  }

  mountMissionCard() {
    const card = document.createElement("section");
    card.className = "zk-next-actions";
    card.innerHTML = `<header><span>NEXT ACTIONS</span><button type="button" data-expand>ALL OBJECTIVES</button></header><div data-actions></div>`;
    card.querySelector("[data-expand]").addEventListener("click", (event) => {
      event.stopPropagation();
      document.documentElement.classList.toggle("zk-objectives-expanded");
      this.paintMissionArchive();
    });
    document.querySelector(".objective-card")?.append(card);
    this.card = card;
  }

  mountWaypoint() {
    const node = document.createElement("aside");
    node.className = "zk-guide-waypoint hidden";
    node.innerHTML = `<i>◆</i><div><small>NAVIGATION</small><strong data-label></strong><span data-distance></span></div><button type="button" title="Clear waypoint">×</button>`;
    node.querySelector("button").addEventListener("click", () => this.clearGuide());
    this.shell.append(node);
    this.waypoint = node;
  }

  mountConstructionStatus() {
    const dock = document.getElementById("build-dock");
    if (!dock) return;
    const panel = document.createElement("aside");
    panel.className = "zk-construction-status hidden";
    panel.innerHTML = `<header><span>DEPENDENCY CHECK</span><strong data-name></strong></header><div data-chain></div><ul data-requirements></ul><small data-placement>Choose a structure to inspect placement requirements.</small>`;
    dock.append(panel);
    this.constructionPanel = panel;
  }

  setupRankBuildouts() {
    const dock = document.getElementById("build-dock");
    if (!dock) return;
    this.buildOptions = dock.querySelector(".build-options");
    dock.querySelectorAll("[data-build-filter]").forEach((tab) => tab.addEventListener("click", () => {
      const filter = tab.dataset.buildFilter || "colony";
      dock.querySelectorAll("[data-rank-build]").forEach((button) => button.classList.toggle("hidden", filter !== "colony"));
    }));
    this.syncRankBuildouts();
  }

  syncRankBuildouts() {
    const rank = String(this.game?.user?.officerClass || "ensign").toLowerCase();
    if (!this.buildOptions || this.lastBuildRank === rank) return;
    this.lastBuildRank = rank;
    for (const config of Object.values(HUMAN_BUILDINGS)) {
      if (!rankAllowsBuilding(rank, config) || this.buildOptions.querySelector(`[data-build="${config.type}"]`)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "build-button zk-rank-build";
      button.dataset.build = config.type;
      button.dataset.buildAudience = "colony";
      button.dataset.rankBuild = config.rank;
      button.title = `${config.description} · ${config.rank.toUpperCase()} BUILDOUT`;
      button.innerHTML = `<b>${BUILD_ICONS[config.type] || "⬡"}</b><span>${config.label}</span><em>${config.rank.toUpperCase()}</em><small>${this.costLabel(config.cost, rank)}</small>`;
      button.addEventListener("click", () => {
        const selected = this.game?.ui?.selectedBuild === config.type;
        this.game?.ui?.setBuildSelection?.(selected ? null : config.type);
      });
      this.buildOptions.append(button);
    }
    const dock = document.getElementById("build-dock");
    if (dock) dock.dataset.officerRank = rank;
  }

  costLabel(cost, rank) {
    return Object.entries(cost).map(([key, value]) => {
      const amount = rank === "lieutenant" && key === "minerals" ? Math.ceil(Number(value) * 0.85) : value;
      return `${key.slice(0, 1).toUpperCase()}${amount}`;
    }).join(" · ");
  }

  mountMaps() {
    const minimap = document.createElement("section");
    minimap.className = "zk-minimap";
    minimap.innerHTML = `<header><span>LOCAL MAP</span><button type="button">M</button></header><div class="zk-map-surface" data-map></div><small data-biome>HIGHLANDS AO</small>`;
    minimap.querySelector("button").addEventListener("click", () => this.openWorldMap());
    this.shell.append(minimap);
    this.minimap = minimap.querySelector("[data-map]");

    const overlay = document.getElementById("pause-overlay");
    if (overlay) {
      const panel = document.createElement("section");
      panel.className = "zk-world-map-panel";
      panel.innerHTML = `<header><div><small>PLANETARY NAVIGATION</small><h2>ZekNova World Map</h2></div><span>M · OPEN / CLOSE</span></header><div class="zk-map-legend"><b>◆ Mission</b><b>⬡ Boss arena</b><b>▣ Building</b><b>◉ Resource</b><b>⇄ Transit Gate</b><b>⚠ Juggernaut patrol</b></div><div class="zk-map-surface" data-world-map></div>`;
      overlay.append(panel);
      this.worldPanel = panel;
      this.worldMap = panel.querySelector("[data-world-map]");
    }
  }

  refreshObjectives() {
    const rows = [...this.source.querySelectorAll("li")].map((node, index) => ({
      id: node.dataset.objectiveId || `objective-${index}`,
      label: cleanLabel(node),
      counter: readCounter(node),
      complete: node.classList.contains("complete") || /complete/i.test(readCounter(node)),
    })).filter((row) => row.label);
    const signature = JSON.stringify(rows);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.objectives = rows.map((row) => ({ ...row, section: classifyObjective(row.label) }));
    this.paintNextActions();
    this.paintMissionArchive();
  }

  paintNextActions() {
    const host = this.card?.querySelector("[data-actions]");
    if (!host) return;
    host.replaceChildren();
    const active = orderObjectivesForMode(this.objectives.filter((objective) => !objective.complete), this.gameMode).slice(0, 2);
    for (const [index, objective] of active.entries()) {
      const row = document.createElement("article");
      row.innerHTML = `<b>${index + 1}</b><div><small>${objective.section}</small><strong>${objective.label}</strong><span>${objective.counter}</span><details><summary>Instructions</summary><p>${this.instructionsFor(objective)}</p></details></div><button type="button">GUIDE ME</button>`;
      row.querySelector("button").addEventListener("click", (event) => {
        event.stopPropagation();
        this.guideObjective(objective);
      });
      host.append(row);
    }
    if (!active.length) host.innerHTML = `<p class="zk-actions-complete">All visible requirements complete. Complete the mission trigger to advance.</p>`;
  }

  paintMissionArchive() {
    const overlay = document.getElementById("pause-overlay");
    if (!overlay) return;
    let panel = overlay.querySelector(".zk-mission-archive-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "zk-mission-archive-panel";
      overlay.append(panel);
    }
    panel.innerHTML = `<header><small>MISSION PLAN</small><h2>${document.getElementById("objective-title")?.textContent || "Active Mission"}</h2><p>${document.getElementById("objective-copy")?.textContent || "Complete the active requirements."}</p></header>`;
    for (const section of SECTIONS) {
      const entries = this.objectives.filter((objective) => objective.section === section);
      if (!entries.length) continue;
      const details = document.createElement("details");
      details.open = entries.some((entry) => !entry.complete);
      details.innerHTML = `<summary>${section}<b>${entries.filter((entry) => entry.complete).length}/${entries.length}</b></summary><div></div>`;
      const body = details.querySelector("div");
      for (const objective of entries) {
        const row = document.createElement("article");
        row.dataset.complete = String(objective.complete);
        row.innerHTML = `<span>${objective.complete ? "✓" : "○"}</span><div><strong>${objective.label}</strong><small>${objective.counter} · ${this.instructionsFor(objective)}</small></div><button type="button" ${objective.complete ? "disabled" : ""}>GUIDE ME</button>`;
        row.querySelector("button").addEventListener("click", () => this.guideObjective(objective));
        body.append(row);
      }
      panel.append(details);
    }
  }

  instructionsFor(objective) {
    const label = objective.label;
    const biome = label.match(BIOME_PATTERN)?.[0]?.toUpperCase();
    if (/regional capitol/i.test(label)) {
      const biomeId = label.match(BIOME_PATTERN)?.[0]?.toLowerCase();
      const recognition = biomeId ? buildingRecognitionSummary(this.game, "capitol", biomeId) : null;
      if (recognition?.misplaced && !recognition.valid) return `${recognition.total} Regional Capitol${recognition.total === 1 ? " exists" : "s exist"}, but none are inside ${biome}. Current placement: ${recognition.misplacedBiomes.join(", ")}. Travel to ${biome} AO, press TAB, select Regional Capitol (⚖) — not Planetary Capitol (♜) — and place the green preview inside that AO.`;
      return `${biome ? `Travel to ${biome} AO. ` : ""}Press TAB, select Regional Capitol (⚖) — not Planetary Capitol (♜) — and place its green preview inside the named AO with powered Water Works and Communications coverage. A successful placement is recognized immediately.`;
    }
    if (objective.section === "Construction") return `${biome ? `Travel to ${biome} AO. ` : ""}Press TAB, select the required structure, verify prerequisites and costs, then place the green preview on connected terrain.`;
    if (objective.section === "Resources") return `${biome ? `Travel to ${biome} AO. ` : ""}Approach a matching resource marker and interact with the highlighted node until the live counter is complete.`;
    if (objective.section === "Diplomacy") return `${biome ? `Travel to ${biome} AO. ` : ""}Open Pause → Relations, review tension and requirements, then choose the available diplomatic action.`;
    if (objective.section === "Guardian Encounter") {
      const flow = globalThis.ZekNovaBossEncounter?.report?.();
      if (flow?.state === "BOSS_ACTIVE") return `${flow.activeBossId || "Guardian"} is active in the ${String(flow.biome || biome || "mission").toUpperCase()} arena.`;
      if (flow?.state === "ROUTE_CANONICAL_ARENA") return `${flow.reason}. Routing and encounter staging are automatic; no hidden beacon interaction is required.`;
      if (flow?.state === "BOSS_PENDING" || flow?.state === "STAGING" || flow?.state === "PREREQUISITES_COMPLETE") return `All canonical prerequisites are complete. The Guardian is being staged automatically in ${String(flow.biome || biome || "the mission").toUpperCase()} AO.`;
      return `${biome ? `The canonical arena is in ${biome} AO. ` : ""}Complete the listed prerequisites; once the live counters are satisfied, routing and the boss encounter start automatically.`;
    }
    if (objective.section === "Commissioning") return `${biome ? `Return to ${biome} AO. ` : ""}Repair and power the required infrastructure; the commissioning trigger starts when all live counters are satisfied.`;
    return `${biome ? `Follow the waypoint to ${biome} AO. ` : "Follow the waypoint. "}Enter the marked region or interact with the highlighted target to advance.`;
  }

  guideObjective(objective) {
    const resolved = this.resolveTarget(objective);
    this.guide = { ...resolved, objective };
    this.waypoint?.classList.remove("hidden");
    this.waypoint.querySelector("[data-label]").textContent = resolved.label;
    this.highlightWorldObject(resolved.object);
    this.paintMap(this.minimap);
    this.paintMap(this.worldMap);
    document.documentElement.classList.remove("zk-objectives-expanded");
  }

  resolveTarget(objective) {
    const text = String(objective?.label ?? "").toLowerCase();
    const game = this.game;
    const biomeId = text.match(BIOME_PATTERN)?.[0]?.toLowerCase();
    const biome = BIOMES.find((entry) => entry.id === biomeId);
    const records = game?.buildings?.records || [];
    const buildingType = Object.keys(HUMAN_BUILDINGS).find((type) => text.includes(String(type).replaceAll("_", " ")) || text.includes(String(HUMAN_BUILDINGS[type]?.label ?? "").toLowerCase()));
    const building = buildingType ? records.find((record) => record.type === buildingType && positionOf(record)) : null;
    if (building) return { label: HUMAN_BUILDINGS[buildingType].label, position: positionOf(building), object: this.findBuildingObject(building.id) };
    const boss = game?.bossManager?.active || game?.bossManager?.boss;
    if (objective.section === "Guardian Encounter" && boss) return { label: game.bossManager?.config?.name || "Guardian arena", position: positionOf(boss), object: boss };
    const resource = this.findNearestResource(text);
    if (objective.section === "Resources" && resource) return { label: `${resource.userData.resource || "Resource"} node`, position: positionOf(resource), object: resource };
    if (biome) return { label: biome.name, position: biome.center, object: null };
    return { label: objective.label, position: { x: 0, z: 0 }, object: null };
  }

  findBuildingObject(id) {
    return this.game?.buildings?.group?.children?.find((child) => child.userData?.buildingId === id) || null;
  }

  findNearestResource(text) {
    const origin = playerPosition(this.game);
    const candidates = [];
    this.game?.scene?.traverse?.((node) => {
      const type = String(node.userData?.resource || "").toLowerCase();
      if (type && (!/timber|biomass|mineral|iron|water|data/.test(text) || text.includes(type))) candidates.push(node);
    });
    return candidates.sort((a, b) => this.distance(origin, positionOf(a)) - this.distance(origin, positionOf(b)))[0] || null;
  }

  highlightWorldObject(object) {
    if (!object) return;
    const previous = object.userData?.zkGuideHighlight;
    if (previous) return;
    object.userData.zkGuideHighlight = true;
    object.traverse?.((child) => {
      if (!child.material?.emissive) return;
      child.userData.zkGuideEmissive = child.material.emissive.getHex();
      child.material.emissive.setHex(0x5df1c4);
      child.material.emissiveIntensity = Math.max(1.3, Number(child.material.emissiveIntensity || 0));
    });
  }

  clearGuide() {
    this.guide = null;
    this.waypoint?.classList.add("hidden");
    this.paintMap(this.minimap);
    this.paintMap(this.worldMap);
  }

  tick() {
    const player = playerPosition(this.game);
    const biome = BIOMES.reduce((best, entry) => this.distance(player, entry.center) < this.distance(player, best.center) ? entry : best, BIOMES[0]);
    const label = document.querySelector(".zk-minimap [data-biome]");
    if (label) label.textContent = biome.name;
    if (this.guide) {
      const distance = this.distance(player, this.guide.position);
      this.waypoint.querySelector("[data-distance]").textContent = `${Math.round(distance)}m · ${this.bearing(player, this.guide.position)}`;
    }
    this.syncRankBuildouts();
    this.paintConstructionStatus();
    this.paintMap(this.minimap);
  }

  paintConstructionStatus() {
    const panel = this.constructionPanel;
    const type = this.game?.buildings?.selectedType;
    const config = HUMAN_BUILDINGS[type];
    if (!panel || !config || this.game?.mode !== "command") {
      panel?.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");
    panel.querySelector("[data-name]").textContent = config.label;
    const utilityLabel = { power: "Solar Grid", water: "Water Works", data: "Communications" };
    const counts = this.game?.buildings?.countByType?.() || {};
    panel.querySelector("[data-chain]").innerHTML = [...config.utilities, type].map((part) => {
      const ready = part === type || Number(counts[part === "data" ? "communications" : part] || 0) > 0;
      return `<b data-ready="${ready}">${utilityLabel[part] || config.label}</b>`;
    }).join("<i>→</i>");
    const resources = this.game?.simulation?.resources || {};
    const signature = JSON.stringify({ type, mode: this.game?.mode, counts, resources: Object.fromEntries(Object.entries(config.cost).map(([key]) => [key, Math.floor(Number(resources[key] || 0))])) });
    if (signature === this.lastConstructionSignature) return;
    this.lastConstructionSignature = signature;
    panel.querySelector("[data-requirements]").innerHTML = Object.entries(config.cost).map(([key, amount]) => {
      const current = Math.floor(Number(resources[key] || 0));
      return `<li data-ready="${current >= amount}"><span>${key}</span><b>${current} / ${amount}</b></li>`;
    }).join("");
    const missing = config.utilities.filter((utility) => Number(counts[utility === "data" ? "communications" : utility] || 0) < 1);
    panel.querySelector("[data-placement]").textContent = missing.length
      ? `BLOCKED · Build ${missing.map((item) => utilityLabel[item]).join(" + ")} first. Utility links must be within the connected service radius.`
      : "READY CHECK · Place on open terrain inside utility range. A green preview confirms terrain, distance, and connections.";
  }

  mapMarkers() {
    const markers = [{ kind: "player", label: "YOU", position: playerPosition(this.game) }];
    if (this.guide) markers.push({ kind: "mission", label: this.guide.label, position: this.guide.position });
    for (const record of this.game?.buildings?.records || []) if (positionOf(record)) markers.push({ kind: record.type === "transit" ? "transit" : "building", label: HUMAN_BUILDINGS[record.type]?.label || record.type, position: positionOf(record) });
    for (const enemy of this.game?.enemies || []) if (enemy.userData?.enemyType === "juggernaut" && positionOf(enemy)) markers.push({ kind: "patrol", label: "Juggernaut patrol", position: positionOf(enemy) });
    const arenas = new Map();
    for (const config of Object.values(BOSS_CONFIGS)) {
      const biome = BIOMES.find((entry) => entry.id === config.biome);
      if (!biome) continue;
      const names = arenas.get(config.biome)?.names || [];
      names.push(config.name);
      arenas.set(config.biome, { position: { x: biome.center.x, z: biome.center.z - 11 }, names });
    }
    for (const arena of arenas.values()) markers.push({ kind: "arena", label: `Guardian arenas: ${arena.names.join(", ")}`, position: arena.position });
    markers.push(...this.resourceMarkers());
    const boss = this.game?.bossManager?.active || this.game?.bossManager?.boss;
    if (boss && positionOf(boss)) markers.push({ kind: "boss", label: this.game.bossManager?.config?.name || "Boss arena", position: positionOf(boss) });
    const explicitGuardian = orderObjectivesForMode(this.objectives.filter((objective) => !objective.complete), this.gameMode).slice(0, 2).some((objective) => objective.section === "Guardian Encounter");
    return markers.filter((marker) => markerAllowed(this.gameMode, marker.kind, { explicitMission: explicitGuardian && ["mission", "boss", "arena"].includes(marker.kind) }));
  }

  setGameMode(mode) {
    this.gameMode = normalizeGameMode(mode);
    this.paintNextActions();
    this.paintMap(this.minimap);
    this.paintMap(this.worldMap);
  }

  resourceMarkers() {
    if (this.cachedResources && performance.now() - this.cachedResourcesAt < 30000) return this.cachedResources;
    const rows = [];
    const resourceKeys = new Set();
    this.game?.scene?.traverse?.((node) => {
      const resource = String(node.userData?.resource || "");
      const position = positionOf(node);
      if (!resource || !position) return;
      const biome = BIOMES.reduce((best, entry) => this.distance(position, entry.center) < this.distance(position, best.center) ? entry : best, BIOMES[0]);
      const key = `${biome.id}:${resource}`;
      if (resourceKeys.has(key)) return;
      resourceKeys.add(key);
      rows.push({ kind: "resource", label: `${resource} deposit · ${biome.name}`, position });
    });
    this.cachedResources = rows;
    this.cachedResourcesAt = performance.now();
    return rows;
  }

  paintMap(host) {
    if (!host) return;
    const markers = this.mapMarkers();
    const signature = markers.map((marker) => `${marker.kind}:${Math.round(marker.position.x)}:${Math.round(marker.position.z)}:${marker.label}`).join("|");
    if (this.mapSignatures.get(host) === signature) return;
    this.mapSignatures.set(host, signature);
    host.replaceChildren();
    for (const biome of BIOMES) {
      const point = projectWorldPoint(biome.center.x, biome.center.z);
      const band = document.createElement("div");
      band.className = "zk-map-biome";
      band.dataset.biome = biome.id;
      band.style.left = `${point.x - 10}%`;
      band.innerHTML = `<b>${String(biome.name ?? "").replace(" AO", "")}</b><small>${(biome.resources || []).join(" · ")}</small>`;
      host.append(band);
    }
    for (const marker of markers) {
      const point = projectWorldPoint(marker.position.x, marker.position.z);
      const node = document.createElement("button");
      node.type = "button";
      node.className = "zk-map-marker";
      node.dataset.kind = marker.kind;
      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;
      node.title = marker.label;
      node.setAttribute("aria-label", marker.label);
      node.textContent = { player: "▲", mission: "◆", boss: "⬡", arena: "⬡", building: "▣", transit: "⇄", patrol: "⚠", resource: "◉" }[marker.kind] || "•";
      host.append(node);
    }
  }

  openWorldMap() {
    if (!document.documentElement.classList.contains("zk-paused")) this.game?.togglePause?.();
    window.setTimeout(() => document.querySelector('.zk-pause-tabs [data-tab="map"]')?.click(), 30);
  }

  distance(a, b) { return b ? Math.hypot(b.x - a.x, b.z - a.z) : Number.POSITIVE_INFINITY; }
  bearing(a, b) {
    const angle = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI + 360) % 360;
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(angle / 45) % 8];
  }
}
