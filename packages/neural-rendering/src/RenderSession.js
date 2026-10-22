/**
 * RenderSession — explicit state machine with a finite frame budget (upstream
 * sessions have a finite RoPE budget and must be restarted, never wrapped).
 */
export const SESSION_STATES = Object.freeze(["idle", "starting", "ready", "streaming", "degraded", "resetting", "failed", "stopped"]);
const ALLOWED = Object.freeze({
  idle: ["starting", "failed"], starting: ["ready", "failed", "stopped"], ready: ["streaming", "degraded", "resetting", "stopped", "failed"], streaming: ["degraded", "resetting", "stopped", "failed"],
  degraded: ["streaming", "ready", "resetting", "stopped", "failed"], resetting: ["ready", "failed", "stopped"], failed: ["idle", "stopped"], stopped: ["idle"],
});
export class RenderSession {
  constructor({ id = `session-${Date.now().toString(36)}`, frameBudget = 8192 * 4, now = () => Date.now(), onChange = null } = {}) {
    this.id = id; this.frameBudget = frameBudget; this.now = now; this.onChange = onChange; this.state = "idle"; this.reason = null; this.framesUsed = 0; this.history = []; this.startedAt = null; this.generation = 0;
  }
  can(to) { return (ALLOWED[this.state] ?? []).includes(to); }
  transition(to, reason = null) {
    if (!SESSION_STATES.includes(to)) throw new RangeError(`unknown session state "${to}"`);
    if (to === this.state) return false;
    if (!this.can(to)) throw new Error(`RenderSession ${this.id}: cannot go ${this.state} -> ${to} (${reason ?? "no reason"}); allowed: ${ALLOWED[this.state].join(", ")}`);
    const from = this.state; this.state = to; this.reason = reason; this.history.push(Object.freeze({ from, to, reason, at: this.now() })); if (this.history.length > 100) this.history.shift();
    if (to === "starting") this.startedAt = this.now(); if (to === "resetting") { this.generation += 1; this.framesUsed = 0; }
    this.onChange?.(from, to, reason); return true;
  }
  consumeFrame() { this.framesUsed += 1; return this.framesUsed; }
  exhausted() { return this.framesUsed >= this.frameBudget; }
  get active() { return ["ready", "streaming", "degraded"].includes(this.state); }
  snapshot() { return Object.freeze({ id: this.id, state: this.state, reason: this.reason, generation: this.generation, framesUsed: this.framesUsed, frameBudget: this.frameBudget, exhausted: this.exhausted(), startedAt: this.startedAt, history: [...this.history] }); }
}
