export class MessageCenter extends EventTarget {
  constructor(limit = 100) { super(); this.limit = limit; this.messages = []; }
  add(title, body, level = "info") {
    const message = { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, title, body, level, createdAt: Date.now() };
    this.messages.push(message);
    this.messages.splice(0, Math.max(0, this.messages.length - this.limit));
    this.dispatchEvent(new CustomEvent("message", { detail: message }));
    return message;
  }
  all() { return [...this.messages]; }
  clear() { this.messages.length = 0; this.dispatchEvent(new Event("clear")); }
}

