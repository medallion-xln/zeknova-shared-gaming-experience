/**
 * LifecycleManager — explicit, idempotent engine lifecycle.
 *
 *   created ──initialize──▶ initialized ──start──▶ running ◀──resume── paused
 *                                            ▲        │ pause ──▶ paused
 *                                            │        └ stop ──▶ stopped ──start──▶ running
 *   any state (except disposed) ──dispose──▶ disposed
 *
 * Calling a transition that is already satisfied returns `false` (no work is
 * repeated). Calling an illegal transition throws a LifecycleError naming the
 * states from which it would be legal.
 */
export const LIFECYCLE_STATES = Object.freeze(["created", "initialized", "running", "paused", "stopped", "disposed"]);

const TRANSITIONS = Object.freeze({
  initialize: Object.freeze({ from: ["created", "stopped"], to: "initialized", idempotentIn: ["initialized", "running", "paused"] }),
  start: Object.freeze({ from: ["initialized", "stopped"], to: "running", idempotentIn: ["running"] }),
  pause: Object.freeze({ from: ["running"], to: "paused", idempotentIn: ["paused"] }),
  resume: Object.freeze({ from: ["paused"], to: "running", idempotentIn: ["running"] }),
  stop: Object.freeze({ from: ["running", "paused", "initialized"], to: "stopped", idempotentIn: ["stopped", "created"] }),
  dispose: Object.freeze({ from: ["created", "initialized", "running", "paused", "stopped"], to: "disposed", idempotentIn: ["disposed"] }),
});

export class LifecycleError extends Error {
  constructor(transition, state, allowed) {
    super(`Cannot ${transition}() while "${state}"; allowed from: ${allowed.join(", ")}`);
    this.name = "LifecycleError"; this.transition = transition; this.state = state; this.allowed = allowed;
  }
}

export class LifecycleManager {
  /** @param {{ onTransition?: (from: string, to: string, transition: string) => void, now?: () => number }} [options] */
  constructor({ onTransition = null, now = () => Date.now() } = {}) {
    this.state = "created"; this.onTransition = onTransition; this.now = now;
    /** @type {Array<{ from: string, to: string, transition: string, at: number }>} */
    this.history = [];
    this.inTransition = null;
  }

  /**
   * Decide a transition. Returns `null` when it is already satisfied (no-op),
   * the target state when it must run, and throws when illegal.
   */
  plan(transition) {
    const rule = TRANSITIONS[transition];
    if (!rule) throw new RangeError(`unknown lifecycle transition "${transition}"`);
    if (this.inTransition) throw new LifecycleError(transition, `${this.state} (during ${this.inTransition})`, rule.from);
    if (rule.idempotentIn.includes(this.state)) return null;
    if (!rule.from.includes(this.state)) throw new LifecycleError(transition, this.state, rule.from);
    return rule.to;
  }

  /**
   * Run `work` for a transition. Guarantees: state changes only after `work`
   * resolves; a throwing `work` leaves the state unchanged and re-throws.
   * @returns {Promise<boolean>} true if work ran, false if already satisfied
   */
  async transition(transition, work = async () => {}) {
    const to = this.plan(transition);
    if (to === null) return false;
    const from = this.state;
    this.inTransition = transition;
    try { await work(from, to); }
    finally { this.inTransition = null; }
    this.state = to;
    const record = Object.freeze({ from, to, transition, at: this.now() });
    this.history.push(record);
    if (this.history.length > 200) this.history.shift();
    this.onTransition?.(from, to, transition);
    return true;
  }

  is(...states) { return states.includes(this.state); }
  get disposed() { return this.state === "disposed"; }
  snapshot() { return Object.freeze({ state: this.state, inTransition: this.inTransition, transitions: this.history.length, history: [...this.history] }); }
}
