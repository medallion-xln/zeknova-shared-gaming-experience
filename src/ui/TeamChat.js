// Team comms panel. Messages piggyback on the multiplayer heartbeat instead of
// opening a second polling channel: install() wraps fetch so every heartbeat
// POST carries the queued outbox plus the last-seen sequence number, and the
// response's chat delta feeds the panel. DOM stays capped and is only built
// while the panel is open, so long sessions cannot accumulate nodes.
export class TeamChat extends EventTarget {
  constructor({ user, maxMessages = 100, maxLength = 300 } = {}) {
    super();
    this.user = user || {};
    this.maxMessages = maxMessages;
    this.maxLength = maxLength;
    this.seq = 0;
    this.outbox = [];
    this.messages = [];
    this.pendingRender = [];
    this.pendingOwn = [];
    this.unread = 0;
    this.open = false;
    this.installed = false;
    this.renderScheduled = false;
    this.root = null;
  }

  install() {
    if (this.installed) return;
    this.installed = true;
    const native = globalThis.fetch;
    globalThis.fetch = (input, init = {}) => {
      if (!this.isHeartbeat(input, init)) return native(input, init);
      let body = null;
      try { body = JSON.parse(typeof init.body === "string" ? init.body : ""); } catch { body = null; }
      if (!body || body.leaving) return native(input, init);
      const send = this.outbox.splice(0, 3);
      body.chat = { since: this.seq, send };
      const request = native(input, { ...init, body: JSON.stringify(body) });
      request.then((response) => {
        if (!response.ok) { this.outbox.unshift(...send); return; }
        response.clone().json().then((json) => this.receive(json?.chat)).catch(() => {});
      }, () => { this.outbox.unshift(...send); });
      return request;
    };
  }

  isHeartbeat(input, init) {
    if (String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase() !== "POST") return false;
    const source = input instanceof Request ? input.url : String(input);
    try { return new URL(source, location.href).pathname.endsWith("/api/multiplayer.php"); }
    catch { return false; }
  }

  receive(chat) {
    if (!chat || typeof chat.seq !== "number") return;
    this.seq = Math.max(this.seq, chat.seq);
    const incoming = Array.isArray(chat.messages) ? chat.messages : [];
    if (!incoming.length) return;
    for (const message of incoming) {
      if (!message || typeof message.text !== "string") continue;
      if (message.userId === this.user.id) this.resolvePending(message.text);
      this.messages.push(message);
      this.pendingRender.push(message);
      if (!this.open) this.unread++;
      this.dispatchEvent(new CustomEvent("chat", { detail: message }));
    }
    this.messages.splice(0, Math.max(0, this.messages.length - this.maxMessages));
    this.updateBadge();
    if (this.open) this.scheduleRender();
  }

  send(text) {
    const clean = String(text).trim().slice(0, this.maxLength);
    if (!clean || this.outbox.length >= 6) return false;
    this.outbox.push(clean);
    this.addPendingOwn(clean);
    return true;
  }

  mount(parent = document.body) {
    if (this.root) return this.root;
    const root = document.createElement("section");
    root.className = "team-chat";
    root.dataset.open = "false";
    root.hidden = true;
    root.innerHTML = `
      <button type="button" class="team-chat-toggle" aria-expanded="false">
        <span>TEAM COMMS</span><i class="team-chat-badge" hidden></i>
      </button>
      <div class="team-chat-panel" hidden>
        <header>
          <strong>TEAM COMMS</strong>
          <small></small>
        </header>
        <ol class="team-chat-log"></ol>
        <form class="team-chat-form">
          <input type="text" maxlength="${this.maxLength}" placeholder="Message your team…" autocomplete="off" aria-label="Team chat message" />
          <button type="submit">SEND</button>
        </form>
      </div>`;
    root.querySelector("header small").textContent = this.user.teamName || "";
    parent.append(root);
    this.root = root;
    this.log = root.querySelector(".team-chat-log");
    this.badge = root.querySelector(".team-chat-badge");
    this.panel = root.querySelector(".team-chat-panel");
    this.input = root.querySelector("input");

    root.querySelector(".team-chat-toggle").addEventListener("click", () => this.toggle());
    root.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.send(this.input.value)) this.input.value = "";
      this.input.focus();
    });
    // Keep chat keystrokes from reaching the game's movement/pause handlers.
    for (const type of ["keydown", "keyup", "keypress"]) {
      this.input.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === "keydown" && event.key === "Escape") { this.toggle(false); this.input.blur(); }
      });
    }
    window.addEventListener("zeknova:gameplay-ready", () => { root.hidden = false; }, { once: true });
    return root;
  }

  toggle(open = !this.open) {
    if (!this.root || open === this.open) return;
    this.open = open;
    this.root.dataset.open = String(open);
    this.panel.hidden = !open;
    this.root.querySelector(".team-chat-toggle").setAttribute("aria-expanded", String(open));
    if (open) {
      this.unread = 0;
      this.updateBadge();
      this.rebuildLog();
      this.input.focus();
    } else {
      this.log.replaceChildren();
    }
  }

  updateBadge() {
    if (!this.badge) return;
    this.badge.hidden = this.unread < 1;
    this.badge.textContent = this.unread > 9 ? "9+" : String(this.unread);
  }

  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      if (!this.open || !this.pendingRender.length) { this.pendingRender.length = 0; return; }
      const fragment = document.createDocumentFragment();
      for (const message of this.pendingRender.splice(0)) fragment.append(this.buildEntry(message));
      this.appendCapped(fragment);
    });
  }

  rebuildLog() {
    this.pendingRender.length = 0;
    const fragment = document.createDocumentFragment();
    for (const message of this.messages) fragment.append(this.buildEntry(message));
    for (const pending of this.pendingOwn) fragment.append(pending.node);
    this.log.replaceChildren(fragment);
    this.trimLog();
    this.log.scrollTop = this.log.scrollHeight;
  }

  appendCapped(fragment) {
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    this.log.append(fragment);
    this.trimLog();
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  }

  trimLog() {
    while (this.log.children.length > this.maxMessages) this.log.firstElementChild.remove();
  }

  buildEntry(message) {
    const item = document.createElement("li");
    item.dataset.officer = message.officerClass || "ensign";
    if (message.userId === this.user.id) item.classList.add("own");
    const meta = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = message.displayName || "Crew Member";
    const time = document.createElement("time");
    const at = new Date((Number(message.at) || 0) * 1000);
    time.textContent = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    meta.append(name, time);
    const body = document.createElement("p");
    body.textContent = message.text;
    item.append(meta, body);
    return item;
  }

  addPendingOwn(text) {
    const node = this.buildEntry({
      userId: this.user.id,
      displayName: this.user.displayName,
      officerClass: this.user.officerClass,
      text,
      at: Date.now() / 1000,
    });
    node.classList.add("pending");
    this.pendingOwn.push({ text, node });
    if (this.open) this.appendCapped(node);
  }

  resolvePending(text) {
    const index = this.pendingOwn.findIndex((pending) => pending.text === text);
    if (index < 0) return;
    this.pendingOwn.splice(index, 1)[0].node.remove();
  }
}
