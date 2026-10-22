/** Commands are plain, serializable data. IDs are idempotency keys across restores. */
export class CommandQueue {
  constructor(authority, events) { this.authority = authority; this.events = events; this.handlers = new Map(); this.pending = []; this.results = new Map(); this.sequence = 0; }
  register(type, domain, handler) {
    if (this.handlers.has(type)) throw new Error(`duplicate command ${type}`);
    this.handlers.set(type, { domain, handler }); return () => this.handlers.delete(type);
  }
  enqueue(command) {
    if (!command?.id || !this.handlers.has(command.type)) throw new TypeError('command needs id and registered type');
    if (this.results.has(command.id) || this.pending.some(c => c.id === command.id)) return false;
    this.pending.push(structuredClone({ ...command, sequence: this.sequence++ })); return true;
  }
  drain(world, step) {
    const batch = this.pending.splice(0);
    for (const command of batch) {
      const entry = this.handlers.get(command.type); let result;
      try { if (!entry) throw new Error('command handler removed'); this.authority.assertEngine(entry.domain); result = entry.handler(world, structuredClone(command), step); if (result?.then) throw new Error('command handlers must be synchronous'); }
      catch (error) { result = { ok: false, reason: error.message }; }
      this.results.set(command.id, structuredClone(result ?? null));
      this.events.emit('gameplay:command', { id: command.id, type: command.type, step, result: structuredClone(result ?? null) });
    }
  }
  snapshot() { return structuredClone({ pending: this.pending, results: [...this.results], sequence: this.sequence }); }
  restore(data = {}) { this.pending = structuredClone(data.pending ?? []); this.results = new Map(structuredClone(data.results ?? [])); this.sequence = data.sequence ?? 0; }
  dispose() { this.handlers.clear(); this.pending.length = 0; this.results.clear(); }
}
