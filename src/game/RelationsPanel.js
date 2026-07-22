const ACTIONS = [
  {
    id: "reforest",
    label: "RESTORE A SACRED GROVE",
    detail: "Convert harvested biomass into protected ZekNovan seedlings.",
    cost: { biomass: 8 },
    tension: -2,
    trust: 2,
    ecology: 2,
    cooldown: 90,
    available: (game, state) => Number(game.missionStats?.treesChopped || 0) > Number(state.completed?.reforest || 0),
    unavailable: "Harvested land must be available for restoration.",
  },
  {
    id: "watershed",
    label: "CLEAN THE WATERSHED",
    detail: "Run a filtration cycle through an operational Water Works.",
    cost: { minerals: 6, biomass: 4 },
    tension: -4,
    trust: 3,
    ecology: 3,
    cooldown: 120,
    available: (game) => Number(game.buildings?.countByType?.().water || 0) > 0,
    unavailable: "Install Water Works before beginning watershed restoration.",
  },
  {
    id: "village-aid",
    label: "DELIVER VILLAGE AID",
    detail: "Transfer water and minerals directly to a nearby ZekNovan settlement.",
    cost: { water: 10, minerals: 8 },
    tension: -6,
    trust: 5,
    ecology: 1,
    cooldown: 180,
    available: (game) => (game.terrain?.localTerritories || []).some((center) => {
      const position = game.player?.group?.position;
      return position && Math.hypot(position.x - center.x, position.z - center.z) <= 18;
    }),
    unavailable: "Move within 18m of a ZekNovan settlement to deliver aid.",
  },
  {
    id: "joint-survey",
    label: "SHARE ECOLOGICAL DATA",
    detail: "Publish colony research instead of keeping the survey proprietary.",
    cost: { data: 5, energy: 6 },
    tension: -3,
    trust: 4,
    ecology: 2,
    cooldown: 120,
    available: (game) => Number(game.buildings?.countByType?.().research || 0) > 0,
    unavailable: "An AI Research Lab is required to validate the survey.",
  },
];

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || 0));

export class RelationsPanel {
  constructor({ game }) {
    this.game = game;
    this.storageKey = `zeknova.reconciliation.v1.${game.user?.teamCode || "local"}.${game.user?.id || "crew"}`;
    this.state = this.restore();
    this.ceasefire = null;
  }

  restore() {
    try {
      const state = JSON.parse(localStorage.getItem(this.storageKey) || "null");
      if (state && typeof state === "object") return { cooldowns: {}, completed: {}, nonlethal: false, ...state };
    } catch {}
    return { cooldowns: {}, completed: {}, nonlethal: false };
  }

  persist() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.state)); } catch {}
  }

  install() {
    const shell = document.getElementById("game-shell");
    if (!shell || this.panel) return;
    this.panel = document.createElement("section");
    this.panel.id = "zeknovan-relations-panel";
    this.panel.className = "zeknovan-relations-panel glass-panel";
    this.panel.innerHTML = `
      <header><div><small>ACTIVE RECONCILIATION</small><h2>ZekNovan Relations</h2></div><div class="relations-score"><span>TENSION <b data-relations-tension>0</b></span><span>TRUST <b data-relations-trust>0</b></span></div></header>
      <p>Repair the relationship through field work. Costs are paid from colony stores and every completed action is synchronized with the team world.</p>
      <div class="relations-actions"></div>
      <footer>
        <button type="button" data-relations-nonlethal>NONLETHAL MODE: OFF</button>
        <button type="button" data-relations-ceasefire>BEGIN 30s CEASEFIRE</button>
        <span data-relations-protocol>Combat remains available. Nonlethal mode prevents weapon damage from reducing a ZekNovan below 1 health.</span>
      </footer>`;
    shell.append(this.panel);
    this.actionHost = this.panel.querySelector(".relations-actions");
    for (const action of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.relationsAction = action.id;
      button.addEventListener("click", () => this.perform(action));
      this.actionHost.append(button);
    }
    this.panel.querySelector("[data-relations-nonlethal]")?.addEventListener("click", () => this.toggleNonlethal());
    this.panel.querySelector("[data-relations-ceasefire]")?.addEventListener("click", () => this.beginCeasefire());
    this.game.reconciliationNonlethal = Boolean(this.state.nonlethal);
    this.addHudShortcut();
    this.timer = window.setInterval(() => this.refresh(), 500);
    this.refresh();
  }

  addHudShortcut() {
    const status = document.getElementById("diplomacy-tension-status");
    if (!status || document.getElementById("open-relations-panel")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "open-relations-panel";
    button.textContent = "RECONCILIATION ACTIONS";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!this.game.paused) this.game.togglePause();
      window.setTimeout(() => document.querySelector('.zk-pause-tabs [data-tab="relations"]')?.click(), 0);
    });
    status.insertAdjacentElement("afterend", button);
  }

  afford(cost) {
    const resources = this.game.simulation?.resources || {};
    return Object.entries(cost).every(([key, value]) => Number(resources[key] || 0) >= Number(value));
  }

  costLabel(cost) {
    return Object.entries(cost).map(([key, value]) => `${value} ${key}`).join(" · ");
  }

  cooldownRemaining(action) {
    return Math.max(0, Number(this.state.cooldowns[action.id] || 0) - Date.now());
  }

  recordDelta({ tension, trust, reason }) {
    const game = this.game;
    const resources = game.simulation?.resources;
    if (!resources) return;
    game.diplomacyTension = clamp(Number(game.diplomacyTension ?? 50) + tension, 0, 100);
    resources.trust = clamp(Number(resources.trust ?? 50) + trust, 0, 100);
    game.multiplayerRoom?.queueRelationEvent?.({ tensionDelta: tension, trustDelta: trust, reason });
    game.updateHud?.(true);
    game.save?.();
  }

  perform(action) {
    const game = this.game;
    if (!game.diplomacyOutcome) {
      game.ui?.showToast("First Contact required", "Complete First Contact Protocol before opening reconciliation projects.", "warning");
      return;
    }
    const remaining = this.cooldownRemaining(action);
    if (remaining > 0) return;
    if (!action.available(game, this.state)) {
      game.ui?.showToast("Action unavailable", action.unavailable, "info");
      return;
    }
    if (!this.afford(action.cost)) {
      game.ui?.showToast("Insufficient resources", `Required: ${this.costLabel(action.cost)}.`, "warning");
      return;
    }
    const resources = game.simulation.resources;
    for (const [key, value] of Object.entries(action.cost)) resources[key] = Math.max(0, Number(resources[key] || 0) - Number(value));
    game.simulation.indicators.ecology = clamp(Number(game.simulation.indicators.ecology || 0) + action.ecology, 0, 100);
    this.state.cooldowns[action.id] = Date.now() + action.cooldown * 1000;
    this.state.completed[action.id] = Number(this.state.completed[action.id] || 0) + 1;
    this.persist();
    this.recordDelta({ tension: action.tension, trust: action.trust, reason: action.label });
    game.ui?.showToast(action.label, `${action.tension} tension · +${action.trust} trust · +${action.ecology} ecology.`, "success");
    this.refresh();
  }

  toggleNonlethal() {
    this.state.nonlethal = !this.state.nonlethal;
    this.game.reconciliationNonlethal = this.state.nonlethal;
    this.persist();
    this.game.ui?.showToast("Nonlethal protocol", this.state.nonlethal ? "Weapons will incapacitate ZekNovans at 1 health instead of killing them." : "Lethal weapon damage restored.", this.state.nonlethal ? "success" : "warning");
    this.refresh();
  }

  beginCeasefire() {
    if (this.ceasefire || !this.game.diplomacyOutcome) return;
    const startedAt = performance.now();
    this.ceasefire = { startedAt, endsAt: startedAt + 30000, shotAt: Number(this.game.lastShotAt || 0) };
    this.game.ui?.showToast("Ceasefire protocol", "Do not fire for 30 seconds. Incoming attacks will not invalidate the withdrawal.", "info");
    this.refresh();
  }

  updateCeasefire() {
    if (!this.ceasefire) return;
    if (Number(this.game.lastShotAt || 0) > this.ceasefire.startedAt + 50) {
      this.ceasefire = null;
      this.game.ui?.showToast("Ceasefire broken", "A colony weapon was fired before withdrawal completed.", "warning");
      return;
    }
    if (performance.now() >= this.ceasefire.endsAt) {
      this.ceasefire = null;
      this.recordDelta({ tension: -2, trust: 1, reason: "Observed ceasefire" });
      this.game.ui?.showToast("Ceasefire observed", "ZekNovan monitors confirmed the withdrawal. −2 tension and +1 trust.", "success");
    }
  }

  refresh() {
    if (this.game.disposed) { this.dispose(); return; }
    if (!this.panel || !this.game.simulation) return;
    this.updateCeasefire();
    this.panel.querySelector("[data-relations-tension]").textContent = String(Math.round(Number(this.game.diplomacyTension || 0)));
    this.panel.querySelector("[data-relations-trust]").textContent = String(Math.round(Number(this.game.simulation.resources.trust || 0)));
    for (const action of ACTIONS) {
      const button = this.panel.querySelector(`[data-relations-action="${action.id}"]`);
      const remaining = this.cooldownRemaining(action);
      const available = action.available(this.game, this.state);
      const affordable = this.afford(action.cost);
      button.disabled = remaining > 0 || !available || !affordable;
      button.innerHTML = `<strong>${action.label}</strong><span>${action.detail}</span><small>${this.costLabel(action.cost)} · ${action.tension} tension · +${action.trust} trust${remaining ? ` · READY IN ${Math.ceil(remaining / 1000)}s` : ""}</small>`;
    }
    const nonlethal = this.panel.querySelector("[data-relations-nonlethal]");
    nonlethal.textContent = `NONLETHAL MODE: ${this.state.nonlethal ? "ON" : "OFF"}`;
    nonlethal.dataset.active = String(this.state.nonlethal);
    const ceasefire = this.panel.querySelector("[data-relations-ceasefire]");
    const remaining = this.ceasefire ? Math.max(0, Math.ceil((this.ceasefire.endsAt - performance.now()) / 1000)) : 0;
    ceasefire.textContent = this.ceasefire ? `CEASEFIRE: ${remaining}s` : "BEGIN 30s CEASEFIRE";
    ceasefire.disabled = Boolean(this.ceasefire) || !this.game.diplomacyOutcome;
  }

  dispose() {
    window.clearInterval(this.timer);
    this.panel?.remove();
    document.getElementById("open-relations-panel")?.remove();
  }
}
