/** Bounded FIFO with an explicit overflow policy and statistics (mirrors upstream's fixed-capacity display deque). */
export class BoundedQueue {
  constructor({ capacity = 4, policy = "drop-oldest", name = "queue" } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("capacity must be a positive integer");
    if (!["drop-oldest", "reject-newest"].includes(policy)) throw new RangeError(`unknown queue policy "${policy}"`);
    this.capacity = capacity; this.policy = policy; this.name = name; this.items = []; this.pushed = 0; this.dropped = 0; this.rejected = 0; this.maxDepth = 0;
  }
  push(item) {
    if (this.items.length >= this.capacity) {
      if (this.policy === "reject-newest") { this.rejected += 1; return { accepted: false, dropped: null }; }
      const dropped = this.items.shift(); this.dropped += 1; this.items.push(item); this.pushed += 1; this.maxDepth = Math.max(this.maxDepth, this.items.length); return { accepted: true, dropped };
    }
    this.items.push(item); this.pushed += 1; this.maxDepth = Math.max(this.maxDepth, this.items.length); return { accepted: true, dropped: null };
  }
  shift() { return this.items.shift(); }
  peek() { return this.items[0]; }
  last() { return this.items[this.items.length - 1]; }
  /** Remove and return all but the newest item (stale display frames). */
  drainToNewest() { const stale = this.items.splice(0, Math.max(0, this.items.length - 1)); this.dropped += stale.length; return stale; }
  clear() { const n = this.items.length; this.items.length = 0; return n; }
  get size() { return this.items.length; }
  stats() { return Object.freeze({ name: this.name, capacity: this.capacity, policy: this.policy, depth: this.items.length, pushed: this.pushed, dropped: this.dropped, rejected: this.rejected, maxDepth: this.maxDepth }); }
}
