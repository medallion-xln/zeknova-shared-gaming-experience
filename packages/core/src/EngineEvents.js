/**
 * EngineEvents — typed event bus with subscription ownership.
 *
 * Every `on()` returns an unsubscribe function and records the owner so the
 * kernel can prove that no subscription outlives its plugin. Handler errors
 * are isolated: one failing handler never prevents delivery to the others and
 * is reported through `onError` (which the kernel wires to EngineMetrics).
 *
 * @typedef {(payload: any, meta: { type: string, time: number }) => void} EventHandler
 */
export class EngineEvents {
  /** @param {{ onError?: (scope: string, error: unknown, detail?: any) => void, now?: () => number }} [options] */
  constructor({ onError = null, now = () => Date.now() } = {}) {
    /** @type {Map<string, Set<{ handler: EventHandler, owner: string, once: boolean }>>} */
    this.handlers = new Map();
    this.onError = onError;
    this.now = now;
    this.disposed = false;
    this.emitted = 0;
    this.delivered = 0;
  }

  /**
   * @param {string} type
   * @param {EventHandler} handler
   * @param {{ owner?: string, once?: boolean }} [options]
   * @returns {() => void} unsubscribe
   */
  on(type, handler, { owner = "anonymous", once = false } = {}) {
    if (this.disposed) throw new Error("EngineEvents is disposed");
    if (typeof type !== "string" || !type) throw new TypeError("event type must be a non-empty string");
    if (typeof handler !== "function") throw new TypeError(`handler for "${type}" must be a function`);
    const entry = { handler, owner, once };
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(entry);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const set = this.handlers.get(type);
      if (set) { set.delete(entry); if (set.size === 0) this.handlers.delete(type); }
    };
  }

  once(type, handler, options = {}) { return this.on(type, handler, { ...options, once: true }); }

  /** Remove every subscription registered by `owner`. Returns the number removed. */
  offOwner(owner) {
    let removed = 0;
    for (const [type, set] of this.handlers) {
      for (const entry of [...set]) if (entry.owner === owner) { set.delete(entry); removed += 1; }
      if (set.size === 0) this.handlers.delete(type);
    }
    return removed;
  }

  /** @returns {number} handlers invoked */
  emit(type, payload) {
    if (this.disposed) return 0;
    this.emitted += 1;
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return 0;
    const meta = Object.freeze({ type, time: this.now() });
    let count = 0;
    for (const entry of [...set]) {
      if (entry.once) { set.delete(entry); if (set.size === 0) this.handlers.delete(type); }
      try { entry.handler(payload, meta); count += 1; this.delivered += 1; }
      catch (error) { this.onError?.(`event:${type}`, error, { owner: entry.owner }); }
    }
    return count;
  }

  listenerCount(type) { return this.handlers.get(type)?.size ?? 0; }

  diagnostics() {
    const byType = {}, byOwner = {};
    let total = 0;
    for (const [type, set] of this.handlers) {
      byType[type] = set.size; total += set.size;
      for (const entry of set) byOwner[entry.owner] = (byOwner[entry.owner] || 0) + 1;
    }
    return Object.freeze({ total, byType, byOwner, emitted: this.emitted, delivered: this.delivered, disposed: this.disposed });
  }

  dispose() { this.handlers.clear(); this.disposed = true; }
}

/** Groups unsubscribe/dispose callbacks so an owner can release everything at once. */
export class DisposableGroup {
  constructor(owner = "anonymous") { this.owner = owner; /** @type {Array<() => void>} */ this.items = []; this.disposed = false; }
  /** @template T extends (() => void) @param {T} dispose @returns {T} */
  add(dispose) {
    if (typeof dispose !== "function") throw new TypeError("DisposableGroup.add expects a function");
    if (this.disposed) { dispose(); return dispose; }
    this.items.push(dispose); return dispose;
  }
  get size() { return this.items.length; }
  dispose() {
    this.disposed = true;
    const items = this.items.splice(0).reverse();
    const errors = [];
    for (const item of items) { try { item(); } catch (error) { errors.push(error); } }
    if (errors.length) { const error = new Error(`${errors.length} disposer(s) of "${this.owner}" failed: ${errors.map((e) => e?.message ?? e).join("; ")}`); error.errors = errors; throw error; }
  }
}
