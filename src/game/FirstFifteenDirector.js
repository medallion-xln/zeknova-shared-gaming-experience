/**
 * FirstFifteenDirector — MUSE-ZEK-01 Phase 3
 *
 * Lightweight onboarding sequence integrated into gameplay. Teaches through action,
 * not through a modal tutorial. Polls game state and advances a step sequence:
 *
 *   LAND → MOVE → HARVEST → MINE → BUILD (Solar Grid) → DEFEND (Beacon)
 *     → COMMAND MODE → AI ADVISOR → FIRST CONTACT → THREAT → HOOK
 *
 * Design principles:
 * - Non-blocking: prompts are dismissible, game remains fully playable
 * - State-driven: advances when the player DOES things, not on timers
 * - Resilient: if the player skips ahead, steps complete out of order gracefully
 * - Persistent: completion tracked in localStorage, never repeats for a player
 * - Zero dependencies: reads game state via defensive optional chaining
 *
 * Install pattern follows other directors: new FirstFifteenDirector({game}).install()
 */

const STORAGE_KEY = "zeknova.firstfifteen.v1";
const POLL_MS = 700;

const STEPS = [
  {
    id: "land",
    title: "Welcome to ZekNova, Ensign",
    body: "You've landed in the Desert AO. Your mission: establish a foothold on this planet. Follow the guidance — or explore freely, it adapts.",
    hint: null,
    done: (s) => s.playTimeSec > 3,
  },
  {
    id: "move",
    title: "Move",
    body: "Use <b>WASD</b> or <b>arrow keys</b> to move. <b>Shift</b> sprints.",
    hint: "Move 10 meters in any direction.",
    done: (s) => s.distanceMoved > 10,
  },
  {
    id: "harvest",
    title: "Harvest resources",
    body: "Walk up to a glowing resource deposit and press <b>E</b> to collect it. Resources fuel everything you build.",
    hint: "Collect 2 resources (0/2).",
    done: (s) => s.resourcesCollected >= 2,
  },
  {
    id: "mine",
    title: "Mine ore",
    body: "Your companion robot can crack ore formations. Target a rock and press <b>E</b> to send it mining.",
    hint: "Mine 1 ore formation (0/1).",
    done: (s) => s.rocksMined >= 1,
  },
  {
    id: "build",
    title: "Build your first structure",
    body: "Open the build menu and place a <b>Solar Grid</b>. Power is the foundation — every structure needs it.",
    hint: "Build 1 Solar Grid (0/1).",
    done: (s) => s.buildingsByType.power >= 1,
  },
  {
    id: "defend",
    title: "Raise defenses",
    body: "This planet is not empty. Build a <b>Defense Beacon</b> to protect your grid.",
    hint: "Build 1 Defense Beacon (0/1).",
    done: (s) => s.buildingsByType.defense >= 1,
  },
  {
    id: "command",
    title: "Command mode",
    body: "Press <b>Tab</b> to switch to overhead command view. Plan your colony from above.",
    hint: "Enter command mode with Tab.",
    done: (s) => s.enteredCommandMode,
  },
  {
    id: "advisor",
    title: "Meet SCOUT-01",
    body: "Click your robot companion to open the <b>SCOUT-01</b> advisor. It analyzes your colony and suggests next moves.",
    hint: "Open the SCOUT-01 console.",
    done: (s) => s.openedAdvisor,
  },
  {
    id: "contact",
    title: "Signs of civilization",
    body: "ZekNovan patrols watch this world. Your actions shift <b>tension</b> and <b>trust</b> — check the diplomacy panel.",
    hint: "A patrol encounter is imminent. Be ready.",
    done: (s) => s.patrolEncountered,
  },
  {
    id: "threat",
    title: "Hostile contact!",
    body: "Defenders inbound! Press <b>Space</b> to fire your defensive pulse. Protect your structures.",
    hint: "Survive the encounter.",
    done: (s) => s.threatResolved,
  },
  {
    id: "hook",
    title: "The planet is yours to shape",
    body: "You've survived first contact and raised your first grid. Continue Mission 1: expand, rank up to Lieutenant, and uncover what the ZekNovans are protecting.",
    hint: null,
    done: (s) => s.playTimeSec > 30, // auto-advances; this is the capstone
  },
];

function readState(game) {
  const g = game || {};
  const player = g.player || {};
  const stats = g.missionStats || g.stats || {};
  const buildings = g.buildings?.records || [];
  const byType = {};
  for (const b of buildings) {
    const t = (b?.type || "").toLowerCase();
    // Normalize: solar grid -> power, defense beacon -> defense
    const key = /solar|grid|power/.test(t) ? "power" : /defense|beacon/.test(t) ? "defense" : t;
    byType[key] = (byType[key] || 0) + 1;
  }
  return {
    playTimeSec: (g.playTimeMs || g.elapsedMs || 0) / 1000 || (Date.now() - (g._ffStart || Date.now())) / 1000,
    distanceMoved: g._ffDistance || stats.distanceMoved || 0,
    resourcesCollected: stats.resourcesCollected || stats.resources || 0,
    rocksMined: stats.rocksMined || stats.oreMined || 0,
    buildingsByType: byType,
    enteredCommandMode: !!g._ffCommandMode || g.gameMode === "command",
    openedAdvisor: !!g._ffAdvisor,
    patrolEncountered: !!g._ffPatrol || (stats.patrolEncounters || 0) > 0,
    threatResolved: !!g._ffThreatResolved || (stats.enemiesDefeated || 0) > 0,
  };
}

export class FirstFifteenDirector {
  constructor({ game }) {
    this.game = game;
    this.stepIndex = 0;
    this.completedSteps = new Set();
    this.overlay = null;
    this.timer = null;
    this.done = false;
    this.startPos = null;
  }

  isComplete() {
    try {
      return !!JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")?.complete;
    } catch { return false; }
  }

  markComplete() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ complete: true, at: Date.now() })); } catch {}
    this.done = true;
  }

  install() {
    if (this.isComplete()) return null; // never repeat
    if (!this.game) return null;
    this.game._ffStart = Date.now();
    this.buildOverlay();
    this.hookEvents();
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.render();
    document.documentElement.dataset.zeknovaFirstFifteen = "active-v1";
    return this;
  }

  hookEvents() {
    // Track movement distance
    const trackMove = () => {
      const p = this.game?.player?.group?.position || this.game?.player?.position;
      if (!p) return;
      if (!this.startPos) this.startPos = { x: p.x, z: p.z };
      const dx = p.x - this.startPos.x, dz = p.z - this.startPos.z;
      this.game._ffDistance = Math.max(this.game._ffDistance || 0, Math.hypot(dx, dz));
    };
    this._moveTracker = setInterval(trackMove, 500);

    // Command mode entry
    const onKeydown = (e) => { if (e.code === "Tab") this.game._ffCommandMode = true; };
    // Advisor open (SCOUT-01 console)
    const onScoutOpen = () => { this.game._ffAdvisor = true; };
    // Patrol / threat signals
    const onPatrol = () => { this.game._ffPatrol = true; };
    const onThreatResolved = () => { this.game._ffThreatResolved = true; };
    // ZGE-02: every listener is owned and removed by teardown() (previously leaked 5 listeners per cycle).
    this._windowListeners = [["keydown", onKeydown], ["zeknova:scout-open", onScoutOpen], ["zeknova:patrol-encounter", onPatrol], ["zeknova:threat-resolved", onThreatResolved]];
    for (const [type, handler] of this._windowListeners) window.addEventListener(type, handler);
  }

  buildOverlay() {
    const el = document.createElement("aside");
    el.id = "zeknova-first-fifteen";
    el.className = "zeknova-first-fifteen";
    el.setAttribute("role", "complementary");
    el.setAttribute("aria-label", "New officer guidance");
    el.innerHTML = `
      <div class="ff-card">
        <div class="ff-progress"><i data-ff-bar></i></div>
        <h2 data-ff-title></h2>
        <p data-ff-body></p>
        <p class="ff-hint" data-ff-hint></p>
        <div class="ff-actions">
          <button data-ff-dismiss type="button">Dismiss guidance</button>
        </div>
      </div>`;
    this._onDismiss = () => this.dismiss();
    el.querySelector("[data-ff-dismiss]").addEventListener("click", this._onDismiss);
    // Bottom-left, never blocks center view
    Object.assign(el.style, {
      position: "fixed", left: "16px", bottom: "16px", zIndex: 40,
      maxWidth: "340px", pointerEvents: "auto",
    });
    document.body.appendChild(el);
    this.overlay = el;
    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById("zeknova-ff-styles")) return;
    const st = document.createElement("style");
    st.id = "zeknova-ff-styles";
    st.textContent = `
      .zeknova-first-fifteen .ff-card {
        background: rgba(4,19,29,.92); border: 1px solid rgba(120,200,255,.25);
        border-radius: 10px; padding: 14px 16px; color: #dceefb;
        font: 14px/1.45 system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.45);
        backdrop-filter: blur(6px);
      }
      .zeknova-first-fifteen h2 { margin: 0 0 6px; font-size: 15px; color: #9fdcff; }
      .zeknova-first-fifteen p { margin: 0 0 8px; }
      .zeknova-first-fifteen .ff-hint { color: #8fb8d8; font-size: 12.5px; }
      .zeknova-first-fifteen .ff-progress { height: 4px; background: rgba(255,255,255,.12); border-radius: 2px; margin-bottom: 10px; }
      .zeknova-first-fifteen .ff-progress i { display: block; height: 100%; width: 0; background: #58c6ff; border-radius: 2px; transition: width .4s; }
      .zeknova-first-fifteen .ff-actions { text-align: right; }
      .zeknova-first-fifteen button { background: none; border: 1px solid rgba(255,255,255,.25); color: #9fb9d0; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
      .zeknova-first-fifteen button:hover { border-color: rgba(255,255,255,.5); color: #fff; }
      .zeknova-first-fifteen.ff-done { display: none; }
    `;
    document.head.appendChild(st);
  }

  dismiss() {
    this.markComplete();
    this.teardown();
    document.documentElement.dataset.zeknovaFirstFifteen = "dismissed-v1";
  }

  teardown() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this._moveTracker) { clearInterval(this._moveTracker); this._moveTracker = null; }
    for (const [type, handler] of this._windowListeners ?? []) window.removeEventListener(type, handler);
    this._windowListeners = [];
    if (this.overlay && this._onDismiss) { this.overlay.querySelector("[data-ff-dismiss]")?.removeEventListener("click", this._onDismiss); this._onDismiss = null; }
    this.overlay?.classList.add("ff-done");
    if (this._fadeTimer) clearTimeout(this._fadeTimer);
    this._fadeTimer = setTimeout(() => { this.overlay?.remove(); this._fadeTimer = null; }, 600);
  }

  tick() {
    if (this.done) return;
    const state = readState(this.game);
    // Advance through all completable steps (handles out-of-order progress)
    let advanced = false;
    for (let i = this.stepIndex; i < STEPS.length; i++) {
      const step = STEPS[i];
      if (this.completedSteps.has(step.id)) continue;
      try {
        if (step.done(state)) {
          this.completedSteps.add(step.id);
          advanced = true;
        } else break; // stop at first incomplete step
      } catch { break; }
    }
    // Move index past completed steps
    while (this.stepIndex < STEPS.length && this.completedSteps.has(STEPS[this.stepIndex].id)) {
      this.stepIndex++;
    }
    if (this.stepIndex >= STEPS.length) {
      this.markComplete();
      this.teardown();
      document.documentElement.dataset.zeknovaFirstFifteen = "complete-v1";
      return;
    }
    if (advanced) this.render();
    else this.updateHint(state);
  }

  render() {
    if (!this.overlay || this.stepIndex >= STEPS.length) return;
    const step = STEPS[this.stepIndex];
    const state = readState(this.game);
    this.overlay.querySelector("[data-ff-title]").textContent = step.title;
    this.overlay.querySelector("[data-ff-body]").innerHTML = step.body;
    this.updateHint(state);
    const pct = Math.round((this.completedSteps.size / STEPS.length) * 100);
    this.overlay.querySelector("[data-ff-bar]").style.width = pct + "%";
  }

  updateHint(state) {
    if (!this.overlay || this.stepIndex >= STEPS.length) return;
    const step = STEPS[this.stepIndex];
    let hint = step.hint || "";
    // Live counters for harvest/mine/build steps
    if (step.id === "harvest") hint = `Collect resources (${Math.min(state.resourcesCollected, 2)}/2).`;
    if (step.id === "mine") hint = `Mine ore (${Math.min(state.rocksMined, 1)}/1).`;
    if (step.id === "build") hint = `Build a Solar Grid (${Math.min(state.buildingsByType.power || 0, 1)}/1).`;
    if (step.id === "defend") hint = `Build a Defense Beacon (${Math.min(state.buildingsByType.defense || 0, 1)}/1).`;
    this.overlay.querySelector("[data-ff-hint]").textContent = hint;
  }
}
