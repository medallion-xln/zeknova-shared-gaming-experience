// Re-tiers the legacy bundle's HUD around three attention levels: active
// gameplay, context-sensitive panels, and a tabbed pause interface. All
// styling lives in assets/hud-focus.css behind html.zk-hud; this module only
// toggles state classes and observes the bundle's own mode/pause elements, so
// the generated runtime keeps updating its panels by id untouched.
const TABS = [
  ["overview", "OVERVIEW"],
  ["missions", "MISSIONS"],
  ["colony", "COLONY"],
  ["relations", "RELATIONS"],
  ["comms", "TEAM COMMS"],
  ["log", "MESSAGE LOG"],
  ["controls", "CONTROLS"],
];

export class HudDirector {
  constructor({ chat = null } = {}) {
    this.chat = chat;
    this.unread = 0;
    this.armed = false;
  }

  arm() {
    if (this.armed) return;
    this.armed = true;
    const attempt = () => this.init();
    if (!attempt()) {
      window.addEventListener("zeknova:gameplay-ready", () => {
        if (this.init()) return;
        let tries = 0;
        const timer = setInterval(() => {
          if (this.init() || ++tries > 30) clearInterval(timer);
        }, 500);
      }, { once: true });
    }
  }

  init() {
    if (this.ready) return true;
    const shell = document.getElementById("game-shell");
    const objective = document.querySelector(".objective-card");
    if (!shell || !objective) return false;
    this.ready = true;
    this.shell = shell;
    const html = document.documentElement;
    html.classList.add("zk-hud", "zk-obj-collapsed", "zk-controls-off");

    objective.addEventListener("click", () => {
      if (html.classList.contains("zk-paused")) return;
      html.classList.toggle("zk-obj-collapsed");
    });

    this.setupControlsCollapse(html);
    this.setupLogChip(html);
    this.observeClass("build-dock", (hidden) => html.classList.toggle("zk-command", !hidden));
    this.observeClass("pause-overlay", (hidden) => {
      html.classList.toggle("zk-paused", !hidden);
      if (!hidden) this.openPauseTabs();
      else { this.chat?.toggle(false); delete html.dataset.zkTab; }
    });
    return true;
  }

  observeClass(id, onToggle) {
    const node = document.getElementById(id);
    if (!node) return;
    const report = () => onToggle(node.classList.contains("hidden"));
    new MutationObserver(report).observe(node, { attributes: true, attributeFilter: ["class"] });
    report();
  }

  setupControlsCollapse(html) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "zk-controls-toggle";
    button.textContent = "?";
    button.title = "Show controls";
    button.addEventListener("click", () => html.classList.toggle("zk-controls-off"));
    this.shell.append(button);

    const collapse = () => html.classList.add("zk-controls-off");
    window.addEventListener("keydown", (event) => {
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key.toLowerCase())) collapse();
    }, { once: true });
    document.querySelector(".movement-pad")?.addEventListener("pointerdown", collapse, { once: true });
  }

  setupLogChip(html) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "zk-log-chip";
    chip.innerHTML = '<span>LOG</span><b data-zero="true">0</b>';
    const badge = chip.querySelector("b");
    const paint = () => {
      badge.textContent = this.unread > 9 ? "9+" : String(this.unread);
      badge.dataset.zero = String(this.unread < 1);
    };
    chip.addEventListener("click", () => {
      const open = html.classList.toggle("zk-log-open");
      if (open) { this.unread = 0; paint(); }
    });
    this.shell.append(chip);

    const stack = document.getElementById("toast-stack");
    if (stack) {
      new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.addedNodes.length && !html.classList.contains("zk-log-open")) this.unread += m.addedNodes.length;
        }
        paint();
      }).observe(stack, { childList: true });
    }
  }

  openPauseTabs() {
    const overlay = document.getElementById("pause-overlay");
    if (!overlay) return;
    if (!this.tabBar) {
      this.tabBar = document.createElement("nav");
      this.tabBar.className = "zk-pause-tabs";
      for (const [id, label] of TABS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.tab = id;
        button.textContent = label;
        button.addEventListener("click", () => this.selectTab(id));
        this.tabBar.append(button);
      }
      overlay.append(this.tabBar);
    }
    this.selectTab("overview");
  }

  selectTab(id) {
    const html = document.documentElement;
    const previous = html.dataset.zkTab;
    html.dataset.zkTab = id;
    for (const button of this.tabBar.querySelectorAll("button")) {
      button.dataset.active = String(button.dataset.tab === id);
    }
    // The bundle's own archive panel backs the Message Log tab.
    if (id === "log") document.getElementById("pause-messages-button")?.click();
    else if (previous === "log") document.getElementById("pause-messages-close")?.click();
    this.chat?.toggle(id === "comms");
  }
}
